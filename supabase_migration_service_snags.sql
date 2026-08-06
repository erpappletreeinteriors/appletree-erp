-- ============================================================================
-- Appletree Interiors ERP — Service Tickets / Snag Management tables migration
-- Audit long-term #1/#7: post-handover Customer Service was entirely
-- untracked (no Warranty/AMC/Service ticketing module, no real Snag list —
-- the KPI framework had literal placeholder notes admitting both). New
-- modules: Service Tickets (Warranty Claim/AMC Visit/Service Call/
-- Complaint) and Snag Management (per-project punch list).
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds these two keys to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.service_tickets (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create table if not exists public.snags (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_service_tickets_org on public.service_tickets(org_id);
create index if not exists idx_snags_org on public.snags(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.service_tickets enable row level security;
alter table public.snags enable row level security;

drop policy if exists erp_select on public.service_tickets;
drop policy if exists erp_insert on public.service_tickets;
drop policy if exists erp_update on public.service_tickets;
drop policy if exists erp_delete on public.service_tickets;

create policy erp_select on public.service_tickets for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.service_tickets for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.service_tickets for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.service_tickets for delete
using (public.erp_is_member(org_id));

drop policy if exists erp_select on public.snags;
drop policy if exists erp_insert on public.snags;
drop policy if exists erp_update on public.snags;
drop policy if exists erp_delete on public.snags;

create policy erp_select on public.snags for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.snags for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.snags for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.snags for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return two rows, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('service_tickets','snags');
-- ============================================================================
