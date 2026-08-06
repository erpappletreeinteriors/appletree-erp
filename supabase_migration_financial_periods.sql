-- ============================================================================
-- Appletree Interiors ERP — Financial Periods migration
-- ERP Phase 2-1 (Period Locking) — see financial_erp_engine memory for
-- context. fiscal_years/financial_periods back DB.fiscalYears/DB.periods:
-- a fiscal year (Apr-Mar) auto-splits into 12 monthly periods the first
-- time the engine touches a date inside it. Locking a period blocks every
-- financial-impacting save dated inside it (invoices, bills, receipts,
-- payments, labour/expense vouchers, stock adjustments, material
-- issues/returns, payroll), not just its journal entry.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds these keys to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.fiscal_years (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create table if not exists public.financial_periods (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_fiscal_years_org on public.fiscal_years(org_id);
create index if not exists idx_financial_periods_org on public.financial_periods(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.fiscal_years enable row level security;
alter table public.financial_periods enable row level security;

drop policy if exists erp_select on public.fiscal_years;
drop policy if exists erp_insert on public.fiscal_years;
drop policy if exists erp_update on public.fiscal_years;
drop policy if exists erp_delete on public.fiscal_years;

create policy erp_select on public.fiscal_years for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.fiscal_years for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.fiscal_years for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.fiscal_years for delete
using (public.erp_is_member(org_id));

drop policy if exists erp_select on public.financial_periods;
drop policy if exists erp_insert on public.financial_periods;
drop policy if exists erp_update on public.financial_periods;
drop policy if exists erp_delete on public.financial_periods;

create policy erp_select on public.financial_periods for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.financial_periods for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.financial_periods for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.financial_periods for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return two rows, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('fiscal_years','financial_periods');
-- ============================================================================
