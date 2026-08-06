-- ============================================================================
-- Appletree Interiors ERP — RFQ migration
-- ERP Phase 2-6 follow-up. rfqs backs DB.rfqs — Request for Quotation
-- workflow: a requirement sent to one or more vendors, with sent/responded
-- dates and quoted rate recorded per vendor. Closes the one gap Vendor
-- Rating's Response Time metric was honestly marked "Not Tracked" for.
-- See financial_erp_engine memory for context.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.rfqs (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_rfqs_org on public.rfqs(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.rfqs enable row level security;

drop policy if exists erp_select on public.rfqs;
drop policy if exists erp_insert on public.rfqs;
drop policy if exists erp_update on public.rfqs;
drop policy if exists erp_delete on public.rfqs;

create policy erp_select on public.rfqs for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.rfqs for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.rfqs for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.rfqs for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'rfqs';
-- ============================================================================
