-- ============================================================================
-- Sales Studio Leads — LIVE RLS verification, run against real accounts
-- ============================================================================
-- Simulates being your real CEO account and your real BDE's account (using
-- Postgres's standard RLS-testing technique: temporarily setting the session's
-- JWT claim to their user_id, which is what auth.uid() reads from — no
-- password needed, this is a Postgres-session trick, not a real login).
--
-- Tests, against your REAL current policies and REAL user accounts:
--   1. Can the BDE insert a lead?
--   2. Can the CEO insert a lead?
--   3. Can the CEO see the lead the BDE just inserted?
--   4. Can the BDE see the lead the CEO just inserted?
--
-- Writes two test rows (ids TEST_BDE_VERIFY / TEST_CEO_VERIFY) and deletes
-- them again at the end — nothing real is touched or left behind.
--
-- Run this in Supabase Dashboard -> SQL Editor -> New Query, then read the
-- "NOTICE" lines under the Results panel (not the "Success" banner itself).
-- ============================================================================

do $$
declare
  ceo_id uuid;
  bde_id uuid;
  ceo_can_see_bde_lead boolean := false;
  bde_can_see_ceo_lead boolean := false;
  bde_insert_ok boolean := false;
  ceo_insert_ok boolean := false;
begin
  select user_id into ceo_id from user_profiles where role='CEO' limit 1;
  -- Picks the most recently-approved non-CEO Sales Studio user as "the BDE".
  -- If you have more than one staff account, replace this with:
  --   select user_id into bde_id from ss_profiles where email='the.bde@email.com';
  select user_id into bde_id from ss_profiles where is_approved=true and role<>'CEO' order by created_at desc limit 1;

  if ceo_id is null then raise notice 'Could not find a CEO row in user_profiles — check that table.'; end if;
  if bde_id is null then raise notice 'Could not find an approved non-CEO row in ss_profiles — check that table.'; end if;
  if ceo_id is null or bde_id is null then return; end if;

  raise notice 'Testing as BDE (user_id=%) and CEO (user_id=%)', bde_id, ceo_id;

  -- BDE attempts to insert a test lead
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', bde_id::text, 'role','authenticated')::text, true);
    set local role authenticated;
    insert into leads(id, data, org_id) values ('TEST_BDE_VERIFY', jsonb_build_object('name','__TEST BDE LEAD (safe to ignore/delete)__'), 'appletree-interiors')
      on conflict (id) do update set data=excluded.data;
    bde_insert_ok := true;
  exception when others then
    raise notice 'BDE insert FAILED: %', sqlerrm;
  end;
  reset role;

  -- CEO attempts to insert a test lead
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', ceo_id::text, 'role','authenticated')::text, true);
    set local role authenticated;
    insert into leads(id, data, org_id) values ('TEST_CEO_VERIFY', jsonb_build_object('name','__TEST CEO LEAD (safe to ignore/delete)__'), 'appletree-interiors')
      on conflict (id) do update set data=excluded.data;
    ceo_insert_ok := true;
  exception when others then
    raise notice 'CEO insert FAILED: %', sqlerrm;
  end;
  reset role;

  -- Can the CEO see what the BDE inserted?
  perform set_config('request.jwt.claims', json_build_object('sub', ceo_id::text, 'role','authenticated')::text, true);
  set local role authenticated;
  select exists(select 1 from leads where id='TEST_BDE_VERIFY') into ceo_can_see_bde_lead;
  reset role;

  -- Can the BDE see what the CEO inserted?
  perform set_config('request.jwt.claims', json_build_object('sub', bde_id::text, 'role','authenticated')::text, true);
  set local role authenticated;
  select exists(select 1 from leads where id='TEST_CEO_VERIFY') into bde_can_see_ceo_lead;
  reset role;

  raise notice '=== RESULTS ===';
  raise notice 'BDE could insert a lead: %', bde_insert_ok;
  raise notice 'CEO could insert a lead: %', ceo_insert_ok;
  raise notice 'CEO can see the lead BDE inserted: %', ceo_can_see_bde_lead;
  raise notice 'BDE can see the lead CEO inserted: %', bde_can_see_ceo_lead;

  -- Cleanup — runs as the SQL Editor's own (superuser) session, unaffected by RLS
  delete from leads where id in ('TEST_BDE_VERIFY','TEST_CEO_VERIFY');
  raise notice 'Test rows cleaned up — no real data left behind.';
end $$;
