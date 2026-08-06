-- ============================================================================
-- Appletree Interiors ERP — Tasks table migration
-- Master Prompt Module 10: Task Management — a general, lightweight to-do
-- list for day-to-day work that doesn't belong to any of the specialized
-- workflow modules (Material Requests, Deliverables, CAPA, Snags, Service
-- Tickets). No approval chain, no auto-generation.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.tasks (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_tasks_org on public.tasks(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.tasks enable row level security;

drop policy if exists erp_select on public.tasks;
drop policy if exists erp_insert on public.tasks;
drop policy if exists erp_update on public.tasks;
drop policy if exists erp_delete on public.tasks;

create policy erp_select on public.tasks for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.tasks for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.tasks for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.tasks for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'tasks';
-- ============================================================================
