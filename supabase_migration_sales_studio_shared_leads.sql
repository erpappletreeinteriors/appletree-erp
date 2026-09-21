-- ============================================================================
-- Appletree Interiors ERP — Grant Sales & Estimation Studio access to the
-- shared `leads` table (Leads & Enquiries module, appletree_sales_studio.html)
--
-- WHY: The ERP's `leads` table is RLS-gated by is_approved_member(), which
-- checks membership in `user_profiles` — the ERP's own user table. Sales
-- Studio users are approved into a SEPARATE table (`ss_profiles`) via its
-- own Team & Approvals flow, so without this migration, only the CEO's
-- bootstrap account (which does have a `user_profiles` row) could read/write
-- `leads` from Sales Studio — every other Sales Studio role would be
-- silently blocked by the database, regardless of what the UI shows.
--
-- WHAT THIS DOES: Adds three new, ADDITIVE policies on `leads` ONLY —
-- SELECT, INSERT, UPDATE (no DELETE — deleting a shared lead is left to the
-- ERP's own users, matching Sales Studio's "core" feature scope: list,
-- add/edit, convert-to-quotation, not delete). Nothing else changes:
--   - No other ERP table is touched.
--   - The ERP's own existing `approved_members_all` policy on `leads` is
--     untouched — multiple permissive Postgres RLS policies on the same
--     table/command combine with OR, so this is purely additive.
--   - Reuses `ss_current_role()`, the function Sales Studio's own schema
--     (supabase_sales_studio_schema.sql) already defines — it resolves to
--     the caller's Sales Studio role from `ss_profiles`, or falls back to
--     recognizing the ERP's own CEO account. No new helper duplicated here.
--
-- Also adds one nullable `created_by` column to `leads` (Sales Studio's
-- generic sync writes {id,data,created_by,updated_at} rows — reusing that
-- existing, already-tested sync code path rather than special-casing this
-- one table). The ERP's own leads code only ever does .select('id,data') and
-- .upsert({id,data,org_id,updated_at}), so it neither reads nor writes this
-- column — fully backward compatible, existing ERP leads are unaffected.
--
-- REQUIRES: supabase_sales_studio_schema.sql must already be applied (for
-- ss_current_role()) and schema.sql must already be applied (for `leads` and
-- is_approved_member()). Safe to re-run (idempotent — drops before create).
--
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run.
-- ============================================================================

alter table public.leads add column if not exists created_by uuid references auth.users(id);

drop policy if exists "ss_studio_leads_select" on public.leads;
create policy "ss_studio_leads_select" on public.leads
  for select to authenticated
  using (ss_current_role() is not null);

drop policy if exists "ss_studio_leads_insert" on public.leads;
create policy "ss_studio_leads_insert" on public.leads
  for insert to authenticated
  with check (ss_current_role() is not null);

drop policy if exists "ss_studio_leads_update" on public.leads;
create policy "ss_studio_leads_update" on public.leads
  for update to authenticated
  using (ss_current_role() is not null)
  with check (ss_current_role() is not null);

-- Verification (run after the above): confirms all 4 policies now exist on
-- `leads` — the ERP's original "approved_members_all" plus the 3 new ones.
-- select policyname, cmd from pg_policies where tablename = 'leads';
