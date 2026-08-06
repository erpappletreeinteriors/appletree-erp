-- ============================================================================
-- Appletree Interiors ERP — Commissions table migration
-- Master Prompt Module 7: Incentive Management, scoped to REFERRAL
-- PARTNER commissions (Architects/Builders/B2B Partners). One record per
-- Won lead that has a referral partner with a commission % set — see
-- maybeCreateCommissionRecord() in appletree_erp_v2_1.html.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.commissions (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_commissions_org on public.commissions(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.commissions enable row level security;

drop policy if exists erp_select on public.commissions;
drop policy if exists erp_insert on public.commissions;
drop policy if exists erp_update on public.commissions;
drop policy if exists erp_delete on public.commissions;

create policy erp_select on public.commissions for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.commissions for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.commissions for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.commissions for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'commissions';
-- ============================================================================
