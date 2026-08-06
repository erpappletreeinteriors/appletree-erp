-- ============================================================================
-- Appletree Interiors ERP — company_profile table migration
-- Quotation full print/PDF engine (cover page, running header/footer,
-- lettered A-H terms pages, signature page — ported from the standalone
-- quotation_system.html). DB.companyProfile is the letterhead + default
-- Terms & Conditions content every new quotation clones from.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
--
-- Like kpi_targets/costing_settings, this is a SINGLETON settings object,
-- not an array of records — the app always upserts/reads a single row
-- with id='singleton' per org, so no per-record id scheme is needed here.
-- ============================================================================

create table if not exists public.company_profile (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_company_profile_org on public.company_profile(org_id);

-- Row Level Security — same pattern as every other entity table
alter table public.company_profile enable row level security;

drop policy if exists erp_select on public.company_profile;
drop policy if exists erp_insert on public.company_profile;
drop policy if exists erp_update on public.company_profile;
drop policy if exists erp_delete on public.company_profile;

create policy erp_select on public.company_profile for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.company_profile for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.company_profile for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.company_profile for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'company_profile';
-- ============================================================================
