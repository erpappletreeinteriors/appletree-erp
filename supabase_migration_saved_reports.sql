-- ============================================================================
-- Appletree Interiors ERP — Saved Reports migration
-- ERP Phase 2-15 (Advanced Report Builder). saved_reports backs
-- DB.savedReports — named, reusable custom report configurations
-- (source entity, columns, date range, group-by/aggregate) built on the
-- Report Builder page. See financial_erp_engine memory for context.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.saved_reports (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_saved_reports_org on public.saved_reports(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.saved_reports enable row level security;

drop policy if exists erp_select on public.saved_reports;
drop policy if exists erp_insert on public.saved_reports;
drop policy if exists erp_update on public.saved_reports;
drop policy if exists erp_delete on public.saved_reports;

create policy erp_select on public.saved_reports for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.saved_reports for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.saved_reports for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.saved_reports for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'saved_reports';
-- ============================================================================
