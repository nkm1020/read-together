-- A session may run for only one group: either date may be empty, but not both.
alter table public.sessions alter column tue_date drop not null, alter column wed_date drop not null;
alter table public.sessions drop constraint if exists sessions_check;
alter table public.sessions add constraint sessions_dates_check check (
  (tue_date is not null or wed_date is not null)
  and (tue_date is null or wed_date is null or wed_date >= tue_date)
);
select column_name, is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'sessions' and column_name in ('tue_date', 'wed_date')
union all
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.sessions'::regclass and contype = 'c' and conname like 'sessions_%date%';
