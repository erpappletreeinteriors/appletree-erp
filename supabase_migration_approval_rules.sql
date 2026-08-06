-- ============================================================================
-- Appletree Interiors ERP — Approval Rules migration
-- ERP Phase 2-14 (Configurable Approval Workflow Engine). approval_rules
-- backs DB.approvalRules — the CEO-editable Delegation-of-Authority tier
-- table that replaced the previously hardcoded PO/Quotation-discount
-- ₹-tier ladders, and adds two new gate points (Fixed Asset purchases,
-- Capital/Loan transactions) that start with zero rules (no gate) until
-- explicitly configured. See financial_erp_engine memory for context.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.approval_rules (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_approval_rules_org on public.approval_rules(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.approval_rules enable row level security;

drop policy if exists erp_select on public.approval_rules;
drop policy if exists erp_insert on public.approval_rules;
drop policy if exists erp_update on public.approval_rules;
drop policy if exists erp_delete on public.approval_rules;

create policy erp_select on public.approval_rules for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.approval_rules for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.approval_rules for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.approval_rules for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'approval_rules';
-- ============================================================================
