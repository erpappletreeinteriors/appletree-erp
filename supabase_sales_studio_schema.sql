-- ============================================================================
-- Appletree Interiors — Sales & Estimation Studio — Supabase schema + security
-- ============================================================================
-- Run this ONCE in your Supabase project's SQL Editor (Dashboard → SQL Editor
-- → New query → paste this whole file → Run).
--
-- This is purely ADDITIVE: it only creates new tables (all prefixed ss_) and
-- a new SQL function. It does NOT touch, alter, or drop anything that already
-- exists for the main Company ERP (its own tables, and the shared
-- user_profiles table, are left completely untouched).
--
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / DROP
-- POLICY IF EXISTS, so running this twice will not error or duplicate data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables — one per data type in the Sales & Estimation Studio.
--    Each row stores its record as a single JSON document in `data`
--    (matching the app's existing in-memory shape exactly), plus a few real
--    columns needed for security policies and housekeeping.
-- ----------------------------------------------------------------------------

create table if not exists ss_quotations (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_staff (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_architects (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_builders (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_b2b_partners (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_materials (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_hardware (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_labour (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_templates (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_projects (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_costing_items (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_custom_items (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ss_simple_items (
  id text primary key,
  data jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Single-row table holding company profile / quote defaults / costing defaults.
-- The app always upserts this with a fixed id string, so there's only ever one row.
create table if not exists ss_settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Sign-up requests waiting for an Admin Coordinator / Management approval.
-- Kept separate from the main ERP's own `pending_users` table so the two
-- tools' approval queues never mix.
create table if not exists ss_pending_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text,
  email text,
  phone text,
  requested_role text not null,
  status text not null default 'pending', -- pending | approved | rejected
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);
create index if not exists ss_pending_users_status_idx on ss_pending_users(status);

-- ----------------------------------------------------------------------------
-- 2. Role lookup helper.
--    Reads the CALLER's role from the existing, shared `user_profiles` table
--    (already created and populated by the main ERP — not modified here).
--    SECURITY DEFINER so it can read that table regardless of that table's
--    own RLS/grant setup, without this migration having to touch it at all.
-- ----------------------------------------------------------------------------

create or replace function ss_current_role() returns text
language sql
security definer
stable
as $$
  select role from user_profiles
  where user_id = auth.uid() and is_approved = true
  limit 1;
$$;

grant execute on function ss_current_role() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Row Level Security — one section per table/group, matching the role
--    capability matrix agreed with the CEO:
--      Sales Executive   → quotations only (no costing/master-data access)
--      Cost Estimator    → costing/master-data only (read-only on quotations)
--      Admin Coordinator → everything
--      Management (CEO)  → everything
--    Visibility is role-based, not per-person — every approved user of a
--    role sees the same shared rows (confirmed with the CEO).
-- ----------------------------------------------------------------------------

-- ---- ss_quotations: Sales full CRUD, Estimator read-only, Admin/Mgmt full ----
alter table ss_quotations enable row level security;

drop policy if exists ss_quotations_select on ss_quotations;
create policy ss_quotations_select on ss_quotations for select
  using (ss_current_role() in ('Sales Executive','Cost Estimator','Admin Coordinator','Management','CEO'));

drop policy if exists ss_quotations_insert on ss_quotations;
create policy ss_quotations_insert on ss_quotations for insert
  with check (ss_current_role() in ('Sales Executive','Admin Coordinator','Management','CEO'));

drop policy if exists ss_quotations_update on ss_quotations;
create policy ss_quotations_update on ss_quotations for update
  using (ss_current_role() in ('Sales Executive','Admin Coordinator','Management','CEO'))
  with check (ss_current_role() in ('Sales Executive','Admin Coordinator','Management','CEO'));

drop policy if exists ss_quotations_delete on ss_quotations;
create policy ss_quotations_delete on ss_quotations for delete
  using (ss_current_role() in ('Sales Executive','Admin Coordinator','Management','CEO'));

-- ---- Costing tables: Sales = no access at all; Estimator/Admin/Mgmt = full ----
do $$
declare t text;
begin
  foreach t in array array['ss_projects','ss_costing_items','ss_custom_items','ss_simple_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format($p$
      create policy %I_all on %I for all
        using (ss_current_role() in (''Cost Estimator'',''Admin Coordinator'',''Management'',''CEO''))
        with check (ss_current_role() in (''Cost Estimator'',''Admin Coordinator'',''Management'',''CEO''))
    $p$, t, t);
  end loop;
end $$;

-- ---- Master data (materials/hardware/labour/templates): same as costing ----
do $$
declare t text;
begin
  foreach t in array array['ss_materials','ss_hardware','ss_labour','ss_templates']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format($p$
      create policy %I_all on %I for all
        using (ss_current_role() in (''Cost Estimator'',''Admin Coordinator'',''Management'',''CEO''))
        with check (ss_current_role() in (''Cost Estimator'',''Admin Coordinator'',''Management'',''CEO''))
    $p$, t, t);
  end loop;
end $$;

-- ---- Partners & Staff reference lists: Sales reads+adds, Estimator reads, Admin/Mgmt full ----
do $$
declare t text;
begin
  foreach t in array array['ss_staff','ss_architects','ss_builders','ss_b2b_partners']
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I_select on %I', t, t);
    execute format($p$
      create policy %I_select on %I for select
        using (ss_current_role() in (''Sales Executive'',''Cost Estimator'',''Admin Coordinator'',''Management'',''CEO''))
    $p$, t, t);

    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format($p$
      create policy %I_insert on %I for insert
        with check (ss_current_role() in (''Sales Executive'',''Admin Coordinator'',''Management'',''CEO''))
    $p$, t, t);

    execute format('drop policy if exists %I_update on %I', t, t);
    execute format($p$
      create policy %I_update on %I for update
        using (ss_current_role() in (''Admin Coordinator'',''Management'',''CEO''))
        with check (ss_current_role() in (''Admin Coordinator'',''Management'',''CEO''))
    $p$, t, t);

    execute format('drop policy if exists %I_delete on %I', t, t);
    execute format($p$
      create policy %I_delete on %I for delete
        using (ss_current_role() in (''Admin Coordinator'',''Management'',''CEO''))
    $p$, t, t);
  end loop;
end $$;

-- ---- Settings: everyone reads, only Admin/Mgmt write ----
alter table ss_settings enable row level security;

drop policy if exists ss_settings_select on ss_settings;
create policy ss_settings_select on ss_settings for select
  using (ss_current_role() in ('Sales Executive','Cost Estimator','Admin Coordinator','Management','CEO'));

drop policy if exists ss_settings_write on ss_settings;
create policy ss_settings_write on ss_settings for all
  using (ss_current_role() in ('Admin Coordinator','Management','CEO'))
  with check (ss_current_role() in ('Admin Coordinator','Management','CEO'));

-- ---- Pending sign-ups: anyone can request for themselves; only Admin/Mgmt review ----
alter table ss_pending_users enable row level security;

drop policy if exists ss_pending_users_insert on ss_pending_users;
create policy ss_pending_users_insert on ss_pending_users for insert
  with check (user_id = auth.uid());

drop policy if exists ss_pending_users_select on ss_pending_users;
create policy ss_pending_users_select on ss_pending_users for select
  using (user_id = auth.uid() or ss_current_role() in ('Admin Coordinator','Management','CEO'));

drop policy if exists ss_pending_users_update on ss_pending_users;
create policy ss_pending_users_update on ss_pending_users for update
  using (ss_current_role() in ('Admin Coordinator','Management','CEO'))
  with check (ss_current_role() in ('Admin Coordinator','Management','CEO'));

-- ============================================================================
-- Done. Nothing else needs to change in Supabase — the app itself (deployed
-- separately) will start reading/writing these tables once you refresh it.
-- ============================================================================
