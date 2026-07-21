-- ============================================================================
-- Appletree Interiors ERP — Stage Gates table migration
-- Required for the new Stage-Gate Tracker (BOS Manual §7) feature to sync
-- to the cloud. Run this once in Supabase Dashboard → SQL Editor → New
-- Query → Run. Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.stage_gates (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_stage_gates_org on public.stage_gates(org_id);

-- Row Level Security — same pattern as every other entity table
alter table public.stage_gates enable row level security;

drop policy if exists erp_select on public.stage_gates;
drop policy if exists erp_insert on public.stage_gates;
drop policy if exists erp_update on public.stage_gates;
drop policy if exists erp_delete on public.stage_gates;

create policy erp_select on public.stage_gates for select
using (public.erp_is_member(org_id));

create policy erp_insert on public.stage_gates for insert
with check (public.erp_is_member(org_id));

create policy erp_update on public.stage_gates for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));

create policy erp_delete on public.stage_gates for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='stage_gates';
-- ============================================================================
