-- ============================================================================
-- Appletree Interiors ERP — Role Permissions table migration
-- Required for the new CEO-editable "Role Access Matrix" feature to sync
-- to the cloud (Users & Roles page).
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying this release. Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.role_permissions (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_role_permissions_org on public.role_permissions(org_id);

-- Row Level Security — same pattern as every other entity table
alter table public.role_permissions enable row level security;

drop policy if exists erp_select on public.role_permissions;
drop policy if exists erp_insert on public.role_permissions;
drop policy if exists erp_update on public.role_permissions;
drop policy if exists erp_delete on public.role_permissions;

create policy erp_select on public.role_permissions for select
using (public.erp_is_member(org_id));

create policy erp_insert on public.role_permissions for insert
with check (public.erp_is_member(org_id));

create policy erp_update on public.role_permissions for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));

create policy erp_delete on public.role_permissions for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='role_permissions';
-- ============================================================================
