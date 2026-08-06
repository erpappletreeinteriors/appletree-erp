-- ============================================================================
-- Appletree Interiors ERP — Timesheets table migration
-- Master Prompt Module 2: Project Timesheet — daily hours logged by an
-- Employee or Worker against a project/product, with a Submit → Approve/
-- Reject workflow (Project Manager/CEO/Admin approve). Separate from HR
-- Attendance (present/absent + OT for payroll) and from labour (actual
-- contractor payment vouchers) — this is hours-worked tracking for cost
-- allocation/analytics, not a payroll or payment record.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.timesheets (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_timesheets_org on public.timesheets(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.timesheets enable row level security;

drop policy if exists erp_select on public.timesheets;
drop policy if exists erp_insert on public.timesheets;
drop policy if exists erp_update on public.timesheets;
drop policy if exists erp_delete on public.timesheets;

create policy erp_select on public.timesheets for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.timesheets for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.timesheets for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.timesheets for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'timesheets';
-- ============================================================================
