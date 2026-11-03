-- Read Together (1안) database. Run once on a new Supabase project (SQL editor or a migration).
-- Public pages read with the publishable key; members join and submit through checked functions;
-- only signed-in organisers listed in public.admins can change anything else.

create extension if not exists pgcrypto;

-- ---------- organisers ----------
create table public.admins (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- The first organiser to sign in claims the club; after that only organisers can add others.
create or replace function public.claim_admin() returns boolean
language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if e = '' then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.admins) then return public.is_admin(); end if;
  insert into public.admins(email) values (e);
  return true;
end $$;

-- ---------- the club ----------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique check (char_length(btrim(display_name)) between 1 and 20),
  grp text not null check (grp in ('tue', 'wed')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sessions (
  n int primary key check (n > 0),
  kind text not null check (kind in ('reading', 'dictation')),
  tue_date date,
  wed_date date,
  article_title text,
  article_url text,
  article_type text check (article_type in ('기사', '칼럼', '에세이')),
  article_minutes int check (article_minutes between 1 and 60),
  rounds int not null default 8 check (rounds between 1 and 20),
  answers_public_at timestamptz,
  created_at timestamptz not null default now(),
  -- A session may run for only one group (see 002_optional_dates.sql).
  constraint sessions_dates_check check (
    (tue_date is not null or wed_date is not null)
    and (tue_date is null or wed_date is null or wed_date >= tue_date)
  )
);

-- Clip sources and answer scripts stay with the organisers until answers_public_at.
create table public.clips (
  session_n int not null references public.sessions(n) on delete cascade,
  round int not null check (round >= 1),
  source text not null default '',
  segment text not null default '',
  url text,
  script text not null default '',
  primary key (session_n, round)
);

create table public.sentences (
  id uuid primary key default gen_random_uuid(),
  session_n int not null references public.sessions(n) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 3 and 400),
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  unique (session_n, member_id)
);

-- ---------- battles ----------
create table public.battles (
  session_n int not null references public.sessions(n) on delete cascade,
  grp text not null check (grp in ('tue', 'wed')),
  status text not null default 'ready' check (status in ('ready', 'open', 'closed', 'finished')),
  current_round int not null default 0,
  round_started_at timestamptz,
  plays int not null default 0 check (plays between 0 and 2),
  confirmed_at timestamptz,
  primary key (session_n, grp)
);

create table public.battle_codes (
  session_n int not null,
  grp text not null,
  code text not null check (code ~ '^[0-9]{4}$'),
  primary key (session_n, grp),
  foreign key (session_n, grp) references public.battles(session_n, grp) on delete cascade
);

create table public.battle_joins (
  session_n int not null,
  grp text not null,
  member_id uuid not null references public.members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_n, grp, member_id),
  foreign key (session_n, grp) references public.battles(session_n, grp) on delete cascade
);

create table public.submissions (
  session_n int not null,
  grp text not null,
  round int not null,
  member_id uuid not null references public.members(id) on delete cascade,
  accuracy int not null,
  speed int not null,
  bonus int not null,
  streak int not null,
  total int not null,
  submitted_at timestamptz not null default now(),
  primary key (session_n, grp, round, member_id),
  foreign key (session_n, grp) references public.battles(session_n, grp) on delete cascade
);

-- What a member typed is kept for the organisers only: it is close to the answer.
create table public.submission_texts (
  session_n int not null,
  grp text not null,
  round int not null,
  member_id uuid not null,
  typed text not null,
  primary key (session_n, grp, round, member_id),
  foreign key (session_n, grp, round, member_id) references public.submissions(session_n, grp, round, member_id) on delete cascade
);

-- ---------- scoring (same formula as the home page) ----------
create or replace function public.rt_words(t text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_remove(regexp_split_to_array(
    btrim(lower(regexp_replace(replace(coalesce(t, ''), '’', ''''), '[^A-Za-z0-9'' ]+', ' ', 'g'))), '\s+'), ''), '{}');
$$;

create or replace function public.rt_word_lev(a text[], b text[]) returns int
language plpgsql immutable set search_path = public as $$
declare
  m int := coalesce(array_length(a, 1), 0);
  n int := coalesce(array_length(b, 1), 0);
  prev int[]; cur int[]; i int; j int;
begin
  if m = 0 then return n; end if;
  if n = 0 then return m; end if;
  prev := array(select generate_series(0, n));
  for i in 1..m loop
    cur := array[i] || array_fill(0, array[n]);
    for j in 1..n loop
      cur[j + 1] := least(prev[j + 1] + 1, cur[j] + 1, prev[j] + case when a[i] = b[j] then 0 else 1 end);
    end loop;
    prev := cur;
  end loop;
  return prev[n + 1];
end $$;

-- A member enters the room's four-digit code and picks their own name from their group's list.
create or replace function public.join_battle(p_code text, p_member uuid) returns json
language plpgsql security definer set search_path = public as $$
declare b public.battles; m public.members;
begin
  select bt.* into b from public.battles bt join public.battle_codes bc using (session_n, grp)
   where bc.code = p_code and bt.status <> 'finished' limit 1;
  if not found then raise exception 'code'; end if;
  select * into m from public.members where id = p_member and active;
  if not found or m.grp <> b.grp then raise exception 'member'; end if;
  insert into public.battle_joins(session_n, grp, member_id) values (b.session_n, b.grp, p_member) on conflict do nothing;
  return json_build_object('session_n', b.session_n, 'grp', b.grp, 'round', b.current_round, 'status', b.status);
end $$;

create or replace function public.submit_answer(p_code text, p_member uuid, p_typed text) returns json
language plpgsql security definer set search_path = public as $$
declare
  b public.battles; s text; tw text[]; sw text[];
  acc int; sp int; prior int; st int; bon int; tot int; el numeric;
begin
  select bt.* into b from public.battles bt join public.battle_codes bc using (session_n, grp)
   where bc.code = p_code and bt.status <> 'finished' limit 1;
  if not found then raise exception 'code'; end if;
  if b.status <> 'open' or b.current_round < 1 then raise exception 'closed'; end if;
  if not exists (select 1 from public.battle_joins j where j.session_n = b.session_n and j.grp = b.grp and j.member_id = p_member) then
    raise exception 'not_joined';
  end if;
  if exists (select 1 from public.submissions x where x.session_n = b.session_n and x.grp = b.grp and x.round = b.current_round and x.member_id = p_member) then
    raise exception 'already';
  end if;
  select script into s from public.clips where session_n = b.session_n and round = b.current_round;
  if coalesce(btrim(s), '') = '' then raise exception 'no_script'; end if;

  tw := public.rt_words(p_typed);
  sw := public.rt_words(s);
  acc := case when coalesce(array_length(tw, 1), 0) = 0 then 0
              else greatest(0, round(100 * (1 - public.rt_word_lev(tw, sw)::numeric / greatest(1, array_length(sw, 1)))))::int end;
  el := extract(epoch from now() - b.round_started_at);
  sp := case when acc >= 80 then greatest(0, round(20 * (20 - el) / 20))::int else 0 end;
  select x.streak into prior from public.submissions x
   where x.session_n = b.session_n and x.grp = b.grp and x.member_id = p_member and x.round = b.current_round - 1;
  st := case when acc >= 95 then coalesce(prior, 0) + 1 else 0 end;
  bon := case when st >= 2 then least(20, (st - 1) * 5) else 0 end;
  tot := acc + sp + bon;

  insert into public.submissions(session_n, grp, round, member_id, accuracy, speed, bonus, streak, total)
  values (b.session_n, b.grp, b.current_round, p_member, acc, sp, bon, st, tot);
  insert into public.submission_texts(session_n, grp, round, member_id, typed)
  values (b.session_n, b.grp, b.current_round, p_member, left(p_typed, 1000));
  return json_build_object('session_n', b.session_n, 'grp', b.grp, 'round', b.current_round,
    'accuracy', acc, 'speed', sp, 'bonus', bon, 'streak', st, 'total', tot);
end $$;

-- Which group's list to show after a member types the room code.
create or replace function public.battle_by_code(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare b public.battles;
begin
  select bt.* into b from public.battles bt join public.battle_codes bc using (session_n, grp)
   where bc.code = p_code and bt.status <> 'finished' limit 1;
  if not found then raise exception 'code'; end if;
  return json_build_object('session_n', b.session_n, 'grp', b.grp, 'round', b.current_round, 'status', b.status);
end $$;

-- After a round is closed, the people in that room may see its script.
create or replace function public.round_script(p_code text, p_round int) returns text
language plpgsql security definer set search_path = public as $$
declare b public.battles; s text;
begin
  select bt.* into b from public.battles bt join public.battle_codes bc using (session_n, grp) where bc.code = p_code limit 1;
  if not found then raise exception 'code'; end if;
  if b.current_round > p_round or (b.current_round = p_round and b.status in ('closed', 'finished')) then
    select script into s from public.clips where session_n = b.session_n and round = p_round;
    return s;
  end if;
  return null;
end $$;

-- Members leave their sentence for a reading session without signing in.
create or replace function public.leave_sentence(p_session int, p_member uuid, p_body text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sessions where n = p_session and kind = 'reading') then raise exception 'session'; end if;
  if not exists (select 1 from public.members where id = p_member and active) then raise exception 'member'; end if;
  insert into public.sentences(session_n, member_id, body, reason)
  values (p_session, p_member, btrim(p_body), nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (session_n, member_id) do update set body = excluded.body, reason = excluded.reason, created_at = now();
end $$;

-- Organisers create a battle and its code in one step.
create or replace function public.open_battle(p_session int, p_grp text) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'admin'; end if;
  insert into public.battles(session_n, grp) values (p_session, p_grp) on conflict do nothing;
  select code into c from public.battle_codes where session_n = p_session and grp = p_grp;
  if c is null then
    loop
      c := lpad((floor(random() * 10000))::int::text, 4, '0');
      exit when not exists (select 1 from public.battle_codes bc join public.battles b using (session_n, grp) where bc.code = c and b.status <> 'finished');
    end loop;
    insert into public.battle_codes(session_n, grp, code) values (p_session, p_grp, c);
  end if;
  return c;
end $$;

-- ---------- access ----------
alter table public.admins enable row level security;
alter table public.members enable row level security;
alter table public.sessions enable row level security;
alter table public.clips enable row level security;
alter table public.sentences enable row level security;
alter table public.battles enable row level security;
alter table public.battle_codes enable row level security;
alter table public.battle_joins enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_texts enable row level security;

create policy "organisers read organisers" on public.admins for select using (public.is_admin());
create policy "organisers add organisers" on public.admins for insert with check (public.is_admin());
create policy "organisers remove organisers" on public.admins for delete using (public.is_admin());

create policy "anyone reads members" on public.members for select using (true);
create policy "organisers write members" on public.members for all using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads sessions" on public.sessions for select using (true);
create policy "organisers write sessions" on public.sessions for all using (public.is_admin()) with check (public.is_admin());

create policy "clips after release or organisers" on public.clips for select
  using (public.is_admin() or exists (select 1 from public.sessions s where s.n = session_n and s.answers_public_at <= now()));
create policy "organisers write clips" on public.clips for all using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads sentences" on public.sentences for select using (true);
create policy "organisers remove sentences" on public.sentences for delete using (public.is_admin());

create policy "anyone reads battles" on public.battles for select using (true);
create policy "organisers write battles" on public.battles for all using (public.is_admin()) with check (public.is_admin());

create policy "organisers read codes" on public.battle_codes for select using (public.is_admin());
create policy "organisers write codes" on public.battle_codes for all using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads joins" on public.battle_joins for select using (true);
create policy "organisers write joins" on public.battle_joins for delete using (public.is_admin());

create policy "anyone reads scores" on public.submissions for select using (true);
create policy "organisers fix scores" on public.submissions for update using (public.is_admin()) with check (public.is_admin());
create policy "organisers remove scores" on public.submissions for delete using (public.is_admin());

create policy "organisers read typed answers" on public.submission_texts for select using (public.is_admin());

revoke all on function public.rt_word_lev(text[], text[]) from public;
grant execute on function public.battle_by_code(text), public.join_battle(text, uuid), public.submit_answer(text, uuid, text),
  public.round_script(text, int), public.leave_sentence(int, uuid, text, text) to anon, authenticated;
grant execute on function public.claim_admin(), public.open_battle(int, text) to authenticated;

-- ---------- live updates ----------
alter publication supabase_realtime add table public.battles, public.submissions, public.battle_joins;
