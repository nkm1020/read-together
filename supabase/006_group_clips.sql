-- Read Together — 006: the Tuesday and Wednesday groups battle on different clips.
-- Clips are kept per group, and scoring and the round answer read the clip of the battle's own group.
-- Run after 005_group_articles.sql.

-- ---------- one set of clips per group ----------
alter table public.clips drop constraint clips_pkey;
alter table public.clips add column grp text;

-- Until now both groups used the same clips: copy them to every group that met that session.
insert into public.clips(session_n, grp, round, source, segment, url, script)
select c.session_n, 'wed', c.round, c.source, c.segment, c.url, c.script
  from public.clips c join public.sessions s on s.n = c.session_n
 where c.grp is null and s.wed_date is not null;
update public.clips c set grp = 'tue'
  from public.sessions s
 where s.n = c.session_n and c.grp is null and s.tue_date is not null;
delete from public.clips where grp is null;

alter table public.clips
  alter column grp set not null,
  add constraint clips_grp_check check (grp in ('tue', 'wed')),
  add primary key (session_n, grp, round);

-- ---------- scoring reads the battle's own group's clip ----------
create or replace function public.submit_answer(p_code text, p_typed text) returns json
language plpgsql security definer set search_path = public as $$
declare
  b public.battles; s text; tw text[]; sw text[]; mid uuid := public.rt_member();
  acc int; sp int; prior int; st int; bon int; tot int; el numeric;
begin
  if mid is null then raise exception 'not_signed_in'; end if;
  select bt.* into b from public.battles bt join public.battle_codes bc using (session_n, grp)
   where bc.code = p_code and bt.status <> 'finished' limit 1;
  if not found then raise exception 'code'; end if;
  if b.status <> 'open' or b.current_round < 1 then raise exception 'closed'; end if;
  if not exists (select 1 from public.battle_joins j where j.session_n = b.session_n and j.grp = b.grp and j.member_id = mid) then
    raise exception 'not_joined';
  end if;
  if exists (select 1 from public.submissions x where x.session_n = b.session_n and x.grp = b.grp and x.round = b.current_round and x.member_id = mid) then
    raise exception 'already';
  end if;
  select script into s from public.clips where session_n = b.session_n and grp = b.grp and round = b.current_round;
  if coalesce(btrim(s), '') = '' then raise exception 'no_script'; end if;

  tw := public.rt_words(p_typed);
  sw := public.rt_words(s);
  acc := case when coalesce(array_length(tw, 1), 0) = 0 then 0
              else greatest(0, round(100 * (1 - public.rt_word_lev(tw, sw)::numeric / greatest(1, array_length(sw, 1)))))::int end;
  el := extract(epoch from now() - b.round_started_at);
  sp := case when acc >= 80 then greatest(0, round(20 * (20 - el) / 20))::int else 0 end;
  select x.streak into prior from public.submissions x
   where x.session_n = b.session_n and x.grp = b.grp and x.member_id = mid and x.round = b.current_round - 1;
  st := case when acc >= 95 then coalesce(prior, 0) + 1 else 0 end;
  bon := case when st >= 2 then least(20, (st - 1) * 5) else 0 end;
  tot := acc + sp + bon;

  insert into public.submissions(session_n, grp, round, member_id, accuracy, speed, bonus, streak, total)
  values (b.session_n, b.grp, b.current_round, mid, acc, sp, bon, st, tot);
  insert into public.submission_texts(session_n, grp, round, member_id, typed)
  values (b.session_n, b.grp, b.current_round, mid, left(p_typed, 1000));
  return json_build_object('session_n', b.session_n, 'grp', b.grp, 'round', b.current_round,
    'accuracy', acc, 'speed', sp, 'bonus', bon, 'streak', st, 'total', tot);
end $$;

-- After a round is closed, the people in that room may see its script.
create or replace function public.round_script(p_code text, p_round int) returns text
language plpgsql security definer set search_path = public as $$
declare b public.battles; s text;
begin
  select bt.* into b from public.battles bt join public.battle_codes bc using (session_n, grp) where bc.code = p_code limit 1;
  if not found then raise exception 'code'; end if;
  if b.current_round > p_round or (b.current_round = p_round and b.status in ('closed', 'finished')) then
    select script into s from public.clips where session_n = b.session_n and grp = b.grp and round = p_round;
    return s;
  end if;
  return null;
end $$;

grant execute on function public.submit_answer(text, text), public.round_script(text, int) to anon, authenticated;

-- Check: clips per session and group.
select session_n, grp, count(*) as rounds, count(*) filter (where btrim(script) <> '') as with_script
  from public.clips group by session_n, grp order by session_n, grp;
