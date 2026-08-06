-- ============================================================================
-- Appletree Interiors ERP — Production Entries table migration
-- Accountant's 18-section request, Section 4/6: "Production Entry" as a new
-- step after Material Issue Acceptance. Accept only confirms material
-- physically arrived (stock leaves the warehouse) — it never touched Project
-- Cost. Production Entry is what actually records material as consumed into
-- a finished product, and posts a real cost to the project (via a normal
-- expenses/labour entry, so every existing project-cost rollup picks it up
-- automatically with no other code changes).
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.production_entries (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_production_entries_org on public.production_entries(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.production_entries enable row level security;

drop policy if exists erp_select on public.production_entries;
drop policy if exists erp_insert on public.production_entries;
drop policy if exists erp_update on public.production_entries;
drop policy if exists erp_delete on public.production_entries;

create policy erp_select on public.production_entries for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.production_entries for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.production_entries for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.production_entries for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'production_entries';
-- ============================================================================
