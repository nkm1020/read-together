-- Read Together — 007: members keep their Tuesday or Wednesday group, but may come to the other group's meeting
-- now and then, or to both meetings of the same session.
-- Attendance is kept per meeting (session and group), a member may enter either group's battle, and a member may
-- leave a sentence on either group's article. Run after 006_group_clips.sql.

-- ---------- attendance per meeting ----------
-- attendance is published for live updates, which needs a replica identity while the primary key is swapped.
alter table public.attendance replica identity full;
alter table public.attendance drop constraint attendance_pkey;
alter table public.attendance add column grp text;

-- A battle entry tells which meeting it was; otherwise the member's own group, or the group that met if theirs did not.
update public.attendance a set grp = j.grp
  from public.battle_joins j
 where j.session_n = a.session_n and j.member_id = a.member_id;
update public.attendance a
   set grp = case
     when (m.grp = 'tue' and s.tue_date is not null) or (m.grp = 'wed' and s.wed_date is not null) then m.grp
     when s.tue_date is not null then 'tue' else 'wed' end
  from public.members m, public.sessions s
 where a.grp is null and m.id = a.member_id and s.n = a.session_n;

alter table public.attendance
  alter column grp set not null,
  add constraint attendance_grp_check check (grp in ('tue', 'wed')),
  add primary key (session_n, grp, member_id);
alter table public.attendance replica identity default;

-- ---------- either group's battle ----------
create or replace function public.join_battle(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare b public.battles; mid uuid := public.rt_member();
begin
  if mid is null then raise exception 'not_signed_in'; end if;
  select bt.* into b from public.battles bt join public.battle_codes bc using (session_n, grp)
   where bc.code = p_code and bt.status <> 'finished' limit 1;
  if not found then raise exception 'code'; end if;
  if not exists (select 1 from public.members where id = mid and active) then raise exception 'member'; end if;
  insert into public.battle_joins(session_n, grp, member_id) values (b.session_n, b.grp, mid) on conflict do nothing;
  insert into public.attendance(session_n, grp, member_id) values (b.session_n, b.grp, mid) on conflict do nothing;
  return json_build_object('session_n', b.session_n, 'grp', b.grp, 'round', b.current_round, 'status', b.status);
end $$;

-- ---------- a sentence per article ----------
-- Someone at both meetings may leave one sentence on each group's article.
alter table public.sentences drop constraint sentences_session_n_member_id_key;
alter table public.sentences add constraint sentences_session_grp_member_key unique (session_n, grp, member_id);

create or replace function public.leave_sentence(p_session int, p_grp text, p_body text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare mid uuid := public.rt_member(); s public.sessions;
begin
  if mid is null then raise exception 'not_signed_in'; end if;
  if p_grp is null or p_grp not in ('tue', 'wed') then raise exception 'session_group'; end if;
  select * into s from public.sessions where n = p_session and kind = 'reading';
  if not found then raise exception 'session'; end if;
  if not exists (select 1 from public.members where id = mid and active) then raise exception 'member'; end if;
  if (p_grp = 'tue' and s.tue_date is null) or (p_grp = 'wed' and s.wed_date is null) then raise exception 'session_group'; end if;
  insert into public.sentences(session_n, member_id, grp, body, reason)
  values (p_session, mid, p_grp, btrim(p_body), nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (session_n, grp, member_id) do update
    set body = excluded.body, reason = excluded.reason, created_at = now();
end $$;

-- The earlier three-argument form leaves the sentence on the member's own group, for pages loaded before this update.
create or replace function public.leave_sentence(p_session int, p_body text, p_reason text) returns void
language sql security definer set search_path = public as $$
  select public.leave_sentence(p_session, (select grp from public.members where id = public.rt_member()), p_body, p_reason);
$$;

grant execute on function public.join_battle(text), public.leave_sentence(int, text, text, text), public.leave_sentence(int, text, text)
  to anon, authenticated;

-- Check: attendance per meeting.
select session_n, grp, count(*) as members from public.attendance group by session_n, grp order by session_n, grp;
