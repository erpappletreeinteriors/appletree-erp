-- ============================================================================
-- Appletree Interiors ERP — Deliverables table migration
-- Master Prompt Module 4: Project Deliverable/Deadline Tracking — named
-- work deliverables with an owner and a target date (e.g. "Design
-- Approval", "Site Handover"). Distinct from stage_gates (internal 6-gate
-- process checklist) and milestones (payment schedule).
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.deliverables (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_deliverables_org on public.deliverables(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.deliverables enable row level security;

drop policy if exists erp_select on public.deliverables;
drop policy if exists erp_insert on public.deliverables;
drop policy if exists erp_update on public.deliverables;
drop policy if exists erp_delete on public.deliverables;

create policy erp_select on public.deliverables for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.deliverables for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.deliverables for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.deliverables for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'deliverables';
-- ============================================================================
