-- ============================================================================
-- Appletree Interiors ERP — Sales Orders migration
-- ERP Phase 2-6. sales_orders backs DB.salesOrders — an optional stage
-- inserted between a Won Quotation and a Project (Lead → Quotation →
-- Sales Order → Project → Invoice → Payment), with customer-approval
-- tracking, partial delivery, amendments/revision history, cancellation,
-- and lightweight inventory reservation against DB.warehouse (which
-- gained a reservedQty field — rides inside the existing warehouse
-- table, no migration needed for that). See financial_erp_engine memory
-- for context.
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds this key to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.sales_orders (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_sales_orders_org on public.sales_orders(org_id);

-- Row Level Security — same erp_is_member(org_id) pattern as every other
-- entity table (see supabase_rls_migration.sql for the helper function).
alter table public.sales_orders enable row level security;

drop policy if exists erp_select on public.sales_orders;
drop policy if exists erp_insert on public.sales_orders;
drop policy if exists erp_update on public.sales_orders;
drop policy if exists erp_delete on public.sales_orders;

create policy erp_select on public.sales_orders for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.sales_orders for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.sales_orders for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.sales_orders for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Verify: should return one row, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'sales_orders';
-- ============================================================================
