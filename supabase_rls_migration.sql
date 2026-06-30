-- ============================================================================
-- Appletree Interiors ERP — Row Level Security Migration
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run (idempotent): drops and recreates policies/functions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper function: is the current auth.uid() an approved member of org_id?
-- ----------------------------------------------------------------------------
create or replace function public.erp_is_member(p_org_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid()
      and up.org_id = p_org_id
      and up.is_approved = true
  );
$$;

-- Helper: is current user CEO or Admin in that org? (needed for user management)
create or replace function public.erp_is_admin(p_org_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_profiles up
    where up.user_id = auth.uid()
      and up.org_id = p_org_id
      and up.is_approved = true
      and up.role in ('CEO','Admin')
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Entity tables — generic { id, data jsonb, org_id, updated_at } shape.
--    Policy: any approved member of the org can read/write rows in that org.
--    (Role-based field restrictions, e.g. margin visibility, stay enforced
--    in the application layer — these tables store opaque JSON blobs, so
--    column-level RLS isn't applicable here.)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'projects','products','warehouse','purchases','issues','returns',
    'labour','expenses','qc','invoices','receipts','bills',
    'project_budgets','material_requests','bank_entries','leads','quotations',
    'customers','workers','items','vendor_master','deliveries','installation',
    'employees','attendance','payroll','advances','purchase_orders','milestones',
    'site_deliveries','installations','machines','mfg_jobs','mfg_ops','accounts',
    'dispatch'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists erp_select on public.%I', t);
    execute format('drop policy if exists erp_insert on public.%I', t);
    execute format('drop policy if exists erp_update on public.%I', t);
    execute format('drop policy if exists erp_delete on public.%I', t);

    execute format($f$
      create policy erp_select on public.%I for select
      using (public.erp_is_member(org_id))
    $f$, t);

    execute format($f$
      create policy erp_insert on public.%I for insert
      with check (public.erp_is_member(org_id))
    $f$, t);

    execute format($f$
      create policy erp_update on public.%I for update
      using (public.erp_is_member(org_id))
      with check (public.erp_is_member(org_id))
    $f$, t);

    execute format($f$
      create policy erp_delete on public.%I for delete
      using (public.erp_is_member(org_id))
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. pending_users — special case: a brand-new signed-up (but not yet
--    approved) user has NO user_profiles row, so erp_is_member() is false
--    for them. They still need to be able to INSERT their own pending
--    request, and read/update only that one row (e.g. to see status).
--    Approved CEO/Admin can see and act on all pending requests in the org.
-- ----------------------------------------------------------------------------
alter table public.pending_users enable row level security;

drop policy if exists erp_pending_self_insert on public.pending_users;
drop policy if exists erp_pending_self_select on public.pending_users;
drop policy if exists erp_pending_admin_select on public.pending_users;
drop policy if exists erp_pending_admin_update on public.pending_users;
drop policy if exists erp_pending_admin_delete on public.pending_users;

-- A just-signed-up user may insert exactly one row referencing their own auth uid
create policy erp_pending_self_insert on public.pending_users for insert
with check (
  auth.uid() is not null
  and (data->>'supabaseUserId') = auth.uid()::text
);

-- That same user may read their own pending row (to show "awaiting approval")
create policy erp_pending_self_select on public.pending_users for select
using ((data->>'supabaseUserId') = auth.uid()::text);

-- CEO/Admin can see, update (approve), and delete any pending request in their org
create policy erp_pending_admin_select on public.pending_users for select
using (public.erp_is_admin(org_id));

create policy erp_pending_admin_update on public.pending_users for update
using (public.erp_is_admin(org_id))
with check (public.erp_is_admin(org_id));

create policy erp_pending_admin_delete on public.pending_users for delete
using (public.erp_is_admin(org_id));

-- ----------------------------------------------------------------------------
-- 4. user_profiles — every authenticated user can read profiles in their own
--    org (needed for displaying names/roles across the app), but can only
--    ever modify their OWN row, except CEO/Admin who can manage everyone's
--    role/approval status.
-- ----------------------------------------------------------------------------
alter table public.user_profiles enable row level security;

drop policy if exists erp_profiles_select on public.user_profiles;
drop policy if exists erp_profiles_self_update on public.user_profiles;
drop policy if exists erp_profiles_admin_insert on public.user_profiles;
drop policy if exists erp_profiles_admin_update on public.user_profiles;
drop policy if exists erp_profiles_admin_delete on public.user_profiles;

create policy erp_profiles_select on public.user_profiles for select
using (
  user_id = auth.uid()
  or public.erp_is_member(org_id)
);

-- Users may update only their own non-privileged fields (name/phone/initials).
-- Role and is_approved changes are restricted to admins via a trigger (step 5).
create policy erp_profiles_self_update on public.user_profiles for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy erp_profiles_admin_insert on public.user_profiles for insert
with check (public.erp_is_admin(org_id));

create policy erp_profiles_admin_update on public.user_profiles for update
using (public.erp_is_admin(org_id))
with check (public.erp_is_admin(org_id));

create policy erp_profiles_admin_delete on public.user_profiles for delete
using (public.erp_is_admin(org_id));

-- ----------------------------------------------------------------------------
-- 5. Guard: a non-admin self-update may NOT change role or is_approved,
--    even though the self-update policy above allows updating their own row.
--    (Without this, a user could approve themselves or grant themselves CEO.)
-- ----------------------------------------------------------------------------
create or replace function public.erp_block_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins/CEO are allowed through (checked again here defensively)
  if public.erp_is_admin(new.org_id) then
    return new;
  end if;

  if new.role is distinct from old.role or new.is_approved is distinct from old.is_approved then
    raise exception 'Only an org admin can change role or approval status';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_block_privilege_escalation_trg on public.user_profiles;
create trigger erp_block_privilege_escalation_trg
  before update on public.user_profiles
  for each row
  execute function public.erp_block_privilege_escalation();

-- ============================================================================
-- Done. Verify with:
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and rowsecurity=false;
-- (should return zero rows once this script has run)
-- ============================================================================
