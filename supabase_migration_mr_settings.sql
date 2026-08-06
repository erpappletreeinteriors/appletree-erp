-- ============================================================================
-- Appletree Interiors ERP — mr_settings table migration
-- Material Request BOM-tolerance approval workflow (Master Prompt Module 1,
-- 2026-07-25). DB.mrSettings holds the CEO-configurable BOM tolerance % that
-- controls Material Request auto-approval — see appletree_erp_v2_1.html's
-- openMRSettingsModal()/saveMRSettings()/mrEvaluateApproval().
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
--
-- Like kpi_targets/costing_settings/company_profile, this is a SINGLETON
-- settings object, not an array of records — the app always upserts/reads a
-- single row with id='singleton' per org, so no per-record id scheme is
-- needed here.
-- ============================================================================

create table if not exists public.mr_settings (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_mr_settings_org on public.mr_settings(org_id);

-- Row Level Security — same pattern as every other entity table
alter table public.mr_settings enable row level security;

drop policy if exists erp_select on public.mr_settings;
drop policy if exists erp_insert on public.mr_settings;
drop policy if exists erp_update on public.mr_settings;
drop policy if exists erp_delete on public.mr_settings;

create policy erp_select on public.mr_settings for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.mr_settings for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.mr_settings for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.mr_settings for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'mr_settings';
-- ============================================================================
