-- ============================================================================
-- Appletree Interiors ERP — CAPA Register & Risk Register table migration
-- Required for the new CAPA Register (BOS Manual §9.7) and Risk Register
-- (§10) features to sync to the cloud. Run this once in Supabase
-- Dashboard → SQL Editor → New Query → Run. Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.capa_register (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);
create index if not exists idx_capa_register_org on public.capa_register(org_id);
alter table public.capa_register enable row level security;
drop policy if exists erp_select on public.capa_register;
drop policy if exists erp_insert on public.capa_register;
drop policy if exists erp_update on public.capa_register;
drop policy if exists erp_delete on public.capa_register;
create policy erp_select on public.capa_register for select using (public.erp_is_member(org_id));
create policy erp_insert on public.capa_register for insert with check (public.erp_is_member(org_id));
create policy erp_update on public.capa_register for update using (public.erp_is_member(org_id)) with check (public.erp_is_member(org_id));
create policy erp_delete on public.capa_register for delete using (public.erp_is_member(org_id));

create table if not exists public.risk_register (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);
create index if not exists idx_risk_register_org on public.risk_register(org_id);
alter table public.risk_register enable row level security;
drop policy if exists erp_select on public.risk_register;
drop policy if exists erp_insert on public.risk_register;
drop policy if exists erp_update on public.risk_register;
drop policy if exists erp_delete on public.risk_register;
create policy erp_select on public.risk_register for select using (public.erp_is_member(org_id));
create policy erp_insert on public.risk_register for insert with check (public.erp_is_member(org_id));
create policy erp_update on public.risk_register for update using (public.erp_is_member(org_id)) with check (public.erp_is_member(org_id));
create policy erp_delete on public.risk_register for delete using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return two rows, rowsecurity = true for both
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('capa_register','risk_register');
-- ============================================================================
