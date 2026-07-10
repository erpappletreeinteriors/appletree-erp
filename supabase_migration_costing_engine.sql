-- ============================================================================
-- Appletree Interiors ERP — Costing Engine tables migration
-- Required for the new "Costing Masters" module (Estimation nav group) —
-- Module 1 of the Sales & Estimation Studio → Master ERP integration.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying this release. Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.costing_templates (
  id text primary key, data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors', updated_at timestamptz default now()
);
create table if not exists public.costing_materials (
  id text primary key, data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors', updated_at timestamptz default now()
);
create table if not exists public.costing_hardware (
  id text primary key, data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors', updated_at timestamptz default now()
);
create table if not exists public.costing_labour_rates (
  id text primary key, data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors', updated_at timestamptz default now()
);

create index if not exists idx_costing_templates_org on public.costing_templates(org_id);
create index if not exists idx_costing_materials_org on public.costing_materials(org_id);
create index if not exists idx_costing_hardware_org on public.costing_hardware(org_id);
create index if not exists idx_costing_labour_rates_org on public.costing_labour_rates(org_id);

-- Row Level Security — same pattern as every other entity table
do $$
declare t text;
begin
  foreach t in array array['costing_templates','costing_materials','costing_hardware','costing_labour_rates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists erp_select on public.%I', t);
    execute format('drop policy if exists erp_insert on public.%I', t);
    execute format('drop policy if exists erp_update on public.%I', t);
    execute format('drop policy if exists erp_delete on public.%I', t);
    execute format('create policy erp_select on public.%I for select using (public.erp_is_member(org_id))', t);
    execute format('create policy erp_insert on public.%I for insert with check (public.erp_is_member(org_id))', t);
    execute format('create policy erp_update on public.%I for update using (public.erp_is_member(org_id)) with check (public.erp_is_member(org_id))', t);
    execute format('create policy erp_delete on public.%I for delete using (public.erp_is_member(org_id))', t);
  end loop;
end $$;

-- ============================================================================
-- Verify: should return 4 rows, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename like 'costing_%';
-- ============================================================================
