-- ============================================================================
-- Appletree Interiors ERP — Fixed Assets & Financing migration
-- Fix for ERP Phase 2-3's Cash Flow Statement: Investing/Financing were
-- correctly-empty (no transaction type posted to them). fixed_assets backs
-- DB.fixedAssets (asset purchases, Investing); capital_loans backs
-- DB.capitalLoans (capital injections/withdrawals, loan received/repaid,
-- Financing). See financial_erp_engine memory for context. Both post real
-- journal entries via the existing postJournalEntry() engine — these
-- tables are just the descriptive record alongside the GL entry, same
-- pattern as every other Financial Engine source table.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds these keys to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.fixed_assets (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create table if not exists public.capital_loans (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_fixed_assets_org on public.fixed_assets(org_id);
create index if not exists idx_capital_loans_org on public.capital_loans(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.fixed_assets enable row level security;
alter table public.capital_loans enable row level security;

drop policy if exists erp_select on public.fixed_assets;
drop policy if exists erp_insert on public.fixed_assets;
drop policy if exists erp_update on public.fixed_assets;
drop policy if exists erp_delete on public.fixed_assets;

create policy erp_select on public.fixed_assets for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.fixed_assets for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.fixed_assets for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.fixed_assets for delete
using (public.erp_is_member(org_id));

drop policy if exists erp_select on public.capital_loans;
drop policy if exists erp_insert on public.capital_loans;
drop policy if exists erp_update on public.capital_loans;
drop policy if exists erp_delete on public.capital_loans;

create policy erp_select on public.capital_loans for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.capital_loans for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.capital_loans for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.capital_loans for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return two rows, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('fixed_assets','capital_loans');
-- ============================================================================
