-- ============================================================================
-- Appletree Interiors ERP — Financial Engine tables migration
-- Gap Analysis Phase 1.4 (accounting_export_log) + Financial ERP Engine
-- Phase A (journal_entries) — see financial_erp_engine memory for context.
-- journal_entries is the real double-entry posting ledger: every row is one
-- balanced entry (Σdebit === Σcredit, enforced client-side by
-- postJournalEntry() before it's ever written here). accounting_export_log
-- tracks one-way exports into Tally/Zoho/generic CSV (an optional
-- interoperability feature, not the ERP's own ledger).
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds these keys to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.journal_entries (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create table if not exists public.accounting_export_log (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_journal_entries_org on public.journal_entries(org_id);
create index if not exists idx_accounting_export_log_org on public.accounting_export_log(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.journal_entries enable row level security;
alter table public.accounting_export_log enable row level security;

drop policy if exists erp_select on public.journal_entries;
drop policy if exists erp_insert on public.journal_entries;
drop policy if exists erp_update on public.journal_entries;
drop policy if exists erp_delete on public.journal_entries;

create policy erp_select on public.journal_entries for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.journal_entries for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.journal_entries for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.journal_entries for delete
using (public.erp_is_member(org_id));

drop policy if exists erp_select on public.accounting_export_log;
drop policy if exists erp_insert on public.accounting_export_log;
drop policy if exists erp_update on public.accounting_export_log;
drop policy if exists erp_delete on public.accounting_export_log;

create policy erp_select on public.accounting_export_log for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.accounting_export_log for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.accounting_export_log for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.accounting_export_log for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return two rows, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('journal_entries','accounting_export_log');
-- ============================================================================
