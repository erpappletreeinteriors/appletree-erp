-- ============================================================================
-- Appletree Interiors ERP — Damage Reports table migration
-- Accountant's 18-section request, Section 13: "Damage flagging module".
-- Tracks damaged/defective material wherever it's discovered (storage,
-- transit, production, site) — a loss with an owner and a value, separate
-- from Returns (good material back to stock) and Snags (post-handover site
-- punch list).
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.damages (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_damages_org on public.damages(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.damages enable row level security;

drop policy if exists erp_select on public.damages;
drop policy if exists erp_insert on public.damages;
drop policy if exists erp_update on public.damages;
drop policy if exists erp_delete on public.damages;

create policy erp_select on public.damages for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.damages for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.damages for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.damages for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'damages';
-- ============================================================================
