-- Read Together — 004: a logged-in member changes their own display name from 내 정보 (/me).
-- Only the name of the member the login belongs to changes; group, active and organiser marks stay with the organisers.

create or replace function public.member_rename(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid := public.rt_member(); v text := btrim(coalesce(p_name, ''));
begin
  if mid is null then raise exception 'not_signed_in'; end if;
  if char_length(v) < 1 or char_length(v) > 20 then raise exception 'length'; end if;
  if exists (select 1 from public.members where lower(display_name) = lower(v) and id <> mid) then raise exception 'taken'; end if;
  update public.members set display_name = v where id = mid;
  return jsonb_build_object('name', v);
exception when unique_violation then raise exception 'taken';
end $$;

revoke all on function public.member_rename(text) from public;
grant execute on function public.member_rename(text) to anon, authenticated;
