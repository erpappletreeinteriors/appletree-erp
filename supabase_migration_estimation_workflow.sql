-- ============================================================================
-- Appletree Interiors ERP — Estimation Workflow migration (Stage 1)
-- Adds: estimation_requests, notifications, activity_log
-- Required for: Lead → "Quotation Requested" → Estimator Dashboard handoff,
-- the in-app notification bell, and the permanent activity timeline.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run.
-- Safe to re-run (idempotent) — same pattern as every other entity table
-- in this app (see supabase_migration_qc_checklist.sql).
-- ============================================================================

create table if not exists public.estimation_requests (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);
create index if not exists idx_estimation_requests_org on public.estimation_requests(org_id);

create table if not exists public.notifications (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);
create index if not exists idx_notifications_org on public.notifications(org_id);

create table if not exists public.activity_log (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);
create index if not exists idx_activity_log_org on public.activity_log(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see schema.sql / supabase_rls_migration.sql). Note: this
-- grants any approved org member read/write on all rows in these tables,
-- same as everywhere else in this app — role-based restrictions (e.g. an
-- Estimator only seeing their own notifications) are enforced client-side,
-- consistent with how every other permission in this app already works.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['estimation_requests','notifications','activity_log']
  loop
    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists erp_select on public.%I', tbl);
    execute format('drop policy if exists erp_insert on public.%I', tbl);
    execute format('drop policy if exists erp_update on public.%I', tbl);
    execute format('drop policy if exists erp_delete on public.%I', tbl);

    execute format('create policy erp_select on public.%I for select using (public.erp_is_member(org_id))', tbl);
    execute format('create policy erp_insert on public.%I for insert with check (public.erp_is_member(org_id))', tbl);
    execute format('create policy erp_update on public.%I for update using (public.erp_is_member(org_id)) with check (public.erp_is_member(org_id))', tbl);
    execute format('create policy erp_delete on public.%I for delete using (public.erp_is_member(org_id))', tbl);
  end loop;
end $$;

-- ============================================================================
-- Verify: should return three rows, all rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in
--   ('estimation_requests','notifications','activity_log');
-- ============================================================================
