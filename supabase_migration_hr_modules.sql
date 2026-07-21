-- ============================================================================
-- Appletree Interiors ERP — HR & People Systems table migration
-- Required for the new Recruitment, Induction, Training, Appraisals,
-- Leave Requests, Recognition, and Disciplinary Actions modules (BOS
-- Manual §11) to sync to the cloud. Run this once in Supabase
-- Dashboard → SQL Editor → New Query → Run. Safe to re-run (idempotent).
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'recruitment_requisitions','inductions','training_records',
    'appraisals','leave_requests','recognitions','disciplinary_actions'
  ]
  loop
    execute format('create table if not exists public.%I (
      id text primary key,
      data jsonb not null default ''{}'',
      org_id text not null default ''appletree-interiors'',
      updated_at timestamptz default now()
    )', t);
    execute format('create index if not exists %I on public.%I(org_id)', 'idx_'||t||'_org', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists erp_select on public.%I', t);
    execute format('drop policy if exists erp_insert on public.%I', t);
    execute format('drop policy if exists erp_update on public.%I', t);
    execute format('drop policy if exists erp_delete on public.%I', t);
    execute format('create policy erp_select on public.%I for select using (public.erp_is_member(org_id))', t);
    execute format('create policy erp_insert on public.%I for insert with check (public.erp_is_member(org_id))', t);
    execute format('create policy erp_update on public.%I for update using (public.erp_is_member(org_id)) with check (public.erp_is_member(org_id))', t);
    execute format('create policy erp_delete on public.%I for delete using (public.erp_is_member(org_id))', t);
  end loop;
end $$;

-- ============================================================================
-- Verify: should return 7 rows, rowsecurity = true for all
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in (
--     'recruitment_requisitions','inductions','training_records',
--     'appraisals','leave_requests','recognitions','disciplinary_actions'
--   );
-- ============================================================================
