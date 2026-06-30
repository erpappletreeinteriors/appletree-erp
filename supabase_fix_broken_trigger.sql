-- ============================================================================
-- Fix: broken trigger on auth.users blocking all new account creation
-- Error was: relation "user profiles" does not exist (SQLSTATE 42P01)
-- (a mistyped table name with a space, instead of user_profiles)
--
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Step 1 just shows you what's there (safe, read-only) so you can see what
-- will be removed. Step 2 actually removes it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 (read-only): list every trigger on auth.users and the source of its
-- function, so we can see exactly which one references "user profiles".
-- ----------------------------------------------------------------------------
select
  t.tgname as trigger_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_source
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal;

-- ----------------------------------------------------------------------------
-- STEP 2 (destructive): after confirming from Step 1's output which trigger
-- is broken, drop it and its function. This automatically finds and removes
-- any trigger on auth.users whose function source mentions the broken
-- "user profiles" (with a space) table name -- safe because this app does
-- NOT rely on an auto-create-profile trigger; approveUser() in the app
-- inserts into user_profiles explicitly when the CEO approves a request.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select t.tgname as trigger_name, p.oid as func_oid, p.proname as function_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'auth'
      and c.relname = 'users'
      and not t.tgisinternal
      and pg_get_functiondef(p.oid) ilike '%user profiles%'
  loop
    raise notice 'Dropping broken trigger % (function %)', r.trigger_name, r.function_name;
    execute format('drop trigger if exists %I on auth.users', r.trigger_name);
    execute format('drop function if exists %s() cascade', r.function_name);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- STEP 3 (read-only verification): confirm no more triggers reference the
-- broken table name. Should return zero rows.
-- ----------------------------------------------------------------------------
select t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal
  and pg_get_functiondef(p.oid) ilike '%user profiles%';
