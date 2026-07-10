-- ============================================================================
-- Appletree Interiors ERP — Partners & Referrals tables migration
-- Required for the new Architects/Builders/B2B Partners referral tracking
-- (Module 5 of the Sales & Estimation Studio -> Master ERP integration).
-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run,
-- BEFORE deploying this release. Safe to re-run (idempotent).
-- ============================================================================

create table if not exists public.architects (
  id text primary key, data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors', updated_at timestamptz default now()
);
create table if not exists public.builders (
  id text primary key, data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors', updated_at timestamptz default now()
);
create table if not exists public.b2b_partners (
  id text primary key, data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors', updated_at timestamptz default now()
);

create index if not exists idx_architects_org on public.architects(org_id);
create index if not exists idx_builders_org on public.builders(org_id);
create index if not exists idx_b2b_partners_org on public.b2b_partners(org_id);

do $$
declare t text;
begin
  foreach t in array array['architects','builders','b2b_partners']
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
-- Verify: should return 3 rows, rowsecurity = true
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('architects','builders','b2b_partners');
-- ============================================================================
