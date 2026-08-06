-- ============================================================================
-- Appletree Interiors ERP — kpi_targets / costing_settings tables migration
-- Audit finding (High #20): DB.kpiTargets and DB.costingSettings were
-- localStorage-only and never synced to Supabase, so KPI targets and
-- default wastage/overhead/profit % didn't follow the team across devices.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds these two keys to ERP_KEYS.
-- Safe to re-run (idempotent).
--
-- Unlike every other ERP_KEYS table, these are SINGLETON settings objects,
-- not arrays of records — the app always upserts/reads a single row with
-- id='singleton' per org, so no per-record id scheme is needed here.
-- ============================================================================

create table if not exists public.kpi_targets (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create table if not exists public.costing_settings (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_kpi_targets_org on public.kpi_targets(org_id);
create index if not exists idx_costing_settings_org on public.costing_settings(org_id);

-- Row Level Security — same pattern as every other entity table
alter table public.kpi_targets enable row level security;
alter table public.costing_settings enable row level security;

drop policy if exists erp_select on public.kpi_targets;
drop policy if exists erp_insert on public.kpi_targets;
drop policy if exists erp_update on public.kpi_targets;
drop policy if exists erp_delete on public.kpi_targets;

create policy erp_select on public.kpi_targets for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.kpi_targets for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.kpi_targets for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.kpi_targets for delete
using (public.erp_is_member(org_id));

drop policy if exists erp_select on public.costing_settings;
drop policy if exists erp_insert on public.costing_settings;
drop policy if exists erp_update on public.costing_settings;
drop policy if exists erp_delete on public.costing_settings;

create policy erp_select on public.costing_settings for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.costing_settings for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.costing_settings for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.costing_settings for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return two rows, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('kpi_targets','costing_settings');
-- ============================================================================
