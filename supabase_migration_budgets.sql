-- ============================================================================
-- Appletree Interiors ERP — Budgets migration
-- ERP Phase 2-4 (Budget vs Actual). budgets backs DB.budgets — Department,
-- Expense Category, and Revenue budget rows (a recurring monthly target,
-- scaled to whatever period is being viewed). Project budgets are NOT
-- here — they already exist as DB.projectBudgets / project_budgets,
-- unrelated to this table. See financial_erp_engine memory for context.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.budgets (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_budgets_org on public.budgets(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.budgets enable row level security;

drop policy if exists erp_select on public.budgets;
drop policy if exists erp_insert on public.budgets;
drop policy if exists erp_update on public.budgets;
drop policy if exists erp_delete on public.budgets;

create policy erp_select on public.budgets for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.budgets for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.budgets for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.budgets for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'budgets';
-- ============================================================================
