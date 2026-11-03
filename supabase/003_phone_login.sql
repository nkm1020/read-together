-- Members log in with their phone number and a password they set the first time.
-- Organisers are members whose phone is marked admin. Phone numbers, passwords and login keys
-- are never readable through the API: only the functions below touch them.

create or replace function public.rt_norm_phone(p text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;

create table public.phones (
  phone text primary key check (phone ~ '^01[0-9]{8,9}$'),
  member_id uuid unique references public.members(id) on delete set null,
  is_admin boolean not null default false,
  pass_hash text,
  failed int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.tokens (
  token_hash text primary key,
  phone text not null references public.phones(phone) on delete cascade on update cascade,
  expires_at timestamptz not null default now() + interval '90 days',
  created_at timestamptz not null default now()
);

alter table public.phones enable row level security;
alter table public.tokens enable row level security;

create table public.attendance (
  session_n int not null references public.sessions(n) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (session_n, member_id)
);
alter table public.attendance enable row level security;

-- ---------- who is calling: the login key in the x-rt-token header ----------
create or replace function public.rt_phone() returns text
language sql stable security definer set search_path = public as $$
  select t.phone from public.tokens t
   where t.token_hash = encode(extensions.digest(
           coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-rt-token', ''), 'sha256'), 'hex')
     and t.expires_at > now();
$$;

create or replace function public.rt_member() returns uuid
language sql stable security definer set search_path = public as $$
  select p.member_id from public.phones p where p.phone = public.rt_phone();
$$;

-- Every existing rule calls is_admin(): it now means "the caller's login key belongs to an organiser's phone".
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.phones p where p.phone = public.rt_phone() and p.is_admin);
$$;

create policy "anyone reads attendance" on public.attendance for select using (true);
create policy "organisers write attendance" on public.attendance for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.rt_profile(p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('member_id', p.member_id, 'name', m.display_name, 'grp', m.grp, 'is_admin', p.is_admin, 'last4', right(p.phone, 4))
    from public.phones p left join public.members m on m.id = p.member_id
   where p.phone = p_phone;
$$;

create or replace function public.rt_issue(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.tokens where expires_at < now();
  insert into public.tokens(token_hash, phone) values (encode(extensions.digest(tok, 'sha256'), 'hex'), p_phone);
  return jsonb_build_object('token', tok) || public.rt_profile(p_phone);
end $$;

-- Answers carry an error field instead of raising, so a failed attempt is still counted.
create or replace function public.member_login(p_phone text, p_password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph public.phones;
begin
  select * into ph from public.phones where phone = public.rt_norm_phone(p_phone);
  if not found then return jsonb_build_object('error', 'login'); end if;
  if ph.locked_until is not null and ph.locked_until > now() then return jsonb_build_object('error', 'locked'); end if;
  if ph.pass_hash is null then return jsonb_build_object('error', 'set_password'); end if;
  if extensions.crypt(coalesce(p_password, ''), ph.pass_hash) <> ph.pass_hash then
    update public.phones
       set failed = failed + 1,
           locked_until = case when failed + 1 >= 5 then now() + interval '10 minutes' else null end
     where phone = ph.phone;
    return jsonb_build_object('error', case when ph.failed + 1 >= 5 then 'locked' else 'login' end);
  end if;
  update public.phones set failed = 0, locked_until = null where phone = ph.phone;
  return public.rt_issue(ph.phone);
end $$;

-- The first login on a registered number sets its password.
create or replace function public.member_set_password(p_phone text, p_password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ph public.phones;
begin
  select * into ph from public.phones where phone = public.rt_norm_phone(p_phone);
  if not found then return jsonb_build_object('error', 'login'); end if;
  if ph.pass_hash is not null then return jsonb_build_object('error', 'has_password'); end if;
  if char_length(coalesce(p_password, '')) < 6 then return jsonb_build_object('error', 'short'); end if;
  update public.phones set pass_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 8)), failed = 0, locked_until = null
   where phone = ph.phone;
  return public.rt_issue(ph.phone);
end $$;

create or replace function public.member_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select public.rt_profile(public.rt_phone());
$$;

create or replace function public.member_logout() returns void
language sql security definer set search_path = public as $$
  delete from public.tokens
   where token_hash = encode(extensions.digest(
           coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-rt-token', ''), 'sha256'), 'hex');
$$;

-- ---------- organisers manage numbers ----------
create or replace function public.admin_phones() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('phone', phone, 'member_id', member_id, 'is_admin', is_admin,
            'has_password', pass_hash is not null, 'locked', locked_until is not null and locked_until > now())) from public.phones), '[]'::jsonb);
end $$;

create or replace function public.admin_set_phone(p_member uuid, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := public.rt_norm_phone(p_phone); old public.phones;
begin
  if not public.is_admin() then raise exception 'admin'; end if;
  select * into old from public.phones where member_id = p_member;
  if v = '' then
    if found and old.is_admin and (select count(*) from public.phones where is_admin) = 1 then raise exception 'last_admin'; end if;
    delete from public.phones where member_id = p_member;
    return;
  end if;
  if v !~ '^01[0-9]{8,9}$' then raise exception 'phone_format'; end if;
  if exists (select 1 from public.phones where phone = v and member_id is not null and member_id <> p_member) then raise exception 'phone_taken'; end if;
  if found and old.phone = v then return; end if;
  if found then
    -- A changed number keeps the organiser mark but needs a new password.
    delete from public.phones where phone = v and member_id is null;
    update public.phones set phone = v, pass_hash = null, failed = 0, locked_until = null where phone = old.phone;
  else
    insert into public.phones(phone, member_id) values (v, p_member)
    on conflict (phone) do update set member_id = excluded.member_id;
  end if;
end $$;

create or replace function public.admin_reset_password(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin'; end if;
  update public.phones set pass_hash = null, failed = 0, locked_until = null where member_id = p_member;
  delete from public.tokens where phone in (select phone from public.phones where member_id = p_member);
end $$;

create or replace function public.admin_set_admin(p_member uuid, p_admin boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin'; end if;
  if not exists (select 1 from public.phones where member_id = p_member) then raise exception 'no_phone'; end if;
  if not p_admin and (select count(*) from public.phones where is_admin and member_id <> p_member) = 0 then raise exception 'last_admin'; end if;
  update public.phones set is_admin = p_admin where member_id = p_member;
end $$;

-- ---------- member actions now come from the login, not from a picked name ----------
drop function if exists public.join_battle(text, uuid);
drop function if exists public.submit_answer(text, uuid, text);
drop function if exists public.leave_sentence(int, uuid, text, text);
drop function if exists public.claim_admin();

create or replace function public.join_battle(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare b public.battles; m public.members; mid uuid := public.rt_member();
begin
  if mid is null then raise exception 'not_signed_in'; end if;
  select bt.* into b from public.battles bt join public.battle_codes bc using (session_n, grp)
   where bc.code = p_code and bt.status <> 'finished' limit 1;
  if not found then raise exception 'code'; end if;
  select * into m from public.members where id = mid and active;
  if not found or m.grp <> b.grp then raise exception 'member'; end if;
  insert into public.battle_joins(session_n, grp, member_id) values (b.session_n, b.grp, mid) on conflict do nothing;
  insert into public.attendance(session_n, member_id) values (b.session_n, mid) on conflict do nothing;
  return json_build_object('session_n', b.session_n, 'grp', b.grp, 'round', b.current_round, 'status', b.status);
end $$;

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
  select script into s from public.clips where session_n = b.session_n and round = b.current_round;
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

create or replace function public.leave_sentence(p_session int, p_body text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare mid uuid := public.rt_member();
begin
  if mid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.sessions where n = p_session and kind = 'reading') then raise exception 'session'; end if;
  if not exists (select 1 from public.members where id = mid and active) then raise exception 'member'; end if;
  insert into public.sentences(session_n, member_id, body, reason)
  values (p_session, mid, btrim(p_body), nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (session_n, member_id) do update set body = excluded.body, reason = excluded.reason, created_at = now();
end $$;

-- The email-based organiser list is replaced by the organiser mark on phones.
drop table if exists public.admins;

-- Helpers that take a phone number are not callable from outside, so numbers cannot be probed for names.
revoke all on function public.rt_issue(text) from public, anon, authenticated;
revoke all on function public.rt_profile(text) from public, anon, authenticated;
grant execute on function public.member_login(text, text), public.member_set_password(text, text), public.member_me(), public.member_logout(),
  public.join_battle(text), public.submit_answer(text, text), public.leave_sentence(int, text, text),
  public.admin_phones(), public.admin_set_phone(uuid, text), public.admin_reset_password(uuid), public.admin_set_admin(uuid, boolean)
  to anon, authenticated;

-- The first organiser. Put the real number in place of the placeholder before running; it is kept out of this public repo.
insert into public.phones(phone, is_admin) values ('01000000000', true) on conflict (phone) do update set is_admin = true;

alter publication supabase_realtime add table public.attendance;
