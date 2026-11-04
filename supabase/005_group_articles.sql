-- Read Together — 005: the Tuesday and Wednesday groups read different articles.
-- Each Reading session keeps one article per group, and each sentence remembers the group it was left in,
-- so the two groups' sentences stay apart even if a member later moves to the other group.
-- Dictation clips stay shared by both groups.

-- ---------- one article per group ----------
alter table public.sessions
  add column tue_article_title text,
  add column tue_article_url text,
  add column tue_article_type text check (tue_article_type in ('기사', '칼럼', '에세이')),
  add column tue_article_minutes int check (tue_article_minutes between 1 and 60),
  add column wed_article_title text,
  add column wed_article_url text,
  add column wed_article_type text check (wed_article_type in ('기사', '칼럼', '에세이')),
  add column wed_article_minutes int check (wed_article_minutes between 1 and 60);

-- Until now both groups read the same article: copy it to every group that met that session.
update public.sessions
   set tue_article_title = case when tue_date is not null then article_title end,
       tue_article_url = case when tue_date is not null then article_url end,
       tue_article_type = case when tue_date is not null then article_type end,
       tue_article_minutes = case when tue_date is not null then article_minutes end,
       wed_article_title = case when wed_date is not null then article_title end,
       wed_article_url = case when wed_date is not null then article_url end,
       wed_article_type = case when wed_date is not null then article_type end,
       wed_article_minutes = case when wed_date is not null then article_minutes end;

alter table public.sessions
  drop column article_title,
  drop column article_url,
  drop column article_type,
  drop column article_minutes;

-- ---------- sentences belong to a group ----------
alter table public.sentences add column grp text check (grp in ('tue', 'wed'));
update public.sentences x set grp = m.grp from public.members m where m.id = x.member_id;
alter table public.sentences alter column grp set not null;

-- A member leaves a sentence on their own group's article, and only for a session their group meets.
create or replace function public.leave_sentence(p_session int, p_body text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare mid uuid := public.rt_member(); m public.members; s public.sessions;
begin
  if mid is null then raise exception 'not_signed_in'; end if;
  select * into s from public.sessions where n = p_session and kind = 'reading';
  if not found then raise exception 'session'; end if;
  select * into m from public.members where id = mid and active;
  if not found then raise exception 'member'; end if;
  if (m.grp = 'tue' and s.tue_date is null) or (m.grp = 'wed' and s.wed_date is null) then raise exception 'session_group'; end if;
  insert into public.sentences(session_n, member_id, grp, body, reason)
  values (p_session, mid, m.grp, btrim(p_body), nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (session_n, member_id) do update
    set grp = excluded.grp, body = excluded.body, reason = excluded.reason, created_at = now();
end $$;

grant execute on function public.leave_sentence(int, text, text) to anon, authenticated;

-- Check: each session's article per group.
select n, kind, tue_date, tue_article_title, wed_date, wed_article_title from public.sessions order by n;
