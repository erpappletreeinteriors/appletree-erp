-- ============================================================================
-- Appletree Interiors ERP — QC Checklist table migration
-- Required for the new QC Dashboard feature to sync to the cloud.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the phase2-dev release. Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.qc_checklist (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_qc_checklist_org on public.qc_checklist(org_id);

-- Row Level Security — same pattern as every other entity table
alter table public.qc_checklist enable row level security;

drop policy if exists erp_select on public.qc_checklist;
drop policy if exists erp_insert on public.qc_checklist;
drop policy if exists erp_update on public.qc_checklist;
drop policy if exists erp_delete on public.qc_checklist;

create policy erp_select on public.qc_checklist for select
using (public.erp_is_member(org_id));

create policy erp_insert on public.qc_checklist for insert
with check (public.erp_is_member(org_id));

create policy erp_update on public.qc_checklist for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));

create policy erp_delete on public.qc_checklist for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='qc_checklist';
-- ============================================================================
