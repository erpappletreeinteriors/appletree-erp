-- ============================================================================
-- Appletree Interiors ERP — Standard Cost Snapshots table migration
-- Phase 1 (Standard Costing): Estimator → Estimate Approval → Freeze as
-- Standard Cost → Project Execution → Automatic Actual Cost Collection →
-- Variance Analysis → Profitability Analysis.
-- Each row is one frozen, version-controlled Standard Cost snapshot for a
-- project (Material/Labour/Transportation/Installation/Other), captured
-- automatically at Won-quotation → Project conversion from the linked
-- Estimation Request's costing, or manually re-frozen later. Actual costs
-- are NOT stored here — they're computed live from the existing
-- issues/purchases/labour/expenses tables, same "derive from source
-- transactions" principle as the Financial Engine's GL/Trial Balance.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS (live file
-- only — this migration is not applied until the offline-first Standard
-- Costing build is validated and ported to appletree_erp_v2_1.html).
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.standard_cost_snapshots (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_standard_cost_snapshots_org on public.standard_cost_snapshots(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.standard_cost_snapshots enable row level security;

drop policy if exists erp_select on public.standard_cost_snapshots;
drop policy if exists erp_insert on public.standard_cost_snapshots;
drop policy if exists erp_update on public.standard_cost_snapshots;
drop policy if exists erp_delete on public.standard_cost_snapshots;

create policy erp_select on public.standard_cost_snapshots for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.standard_cost_snapshots for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.standard_cost_snapshots for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.standard_cost_snapshots for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'standard_cost_snapshots';
-- ============================================================================
