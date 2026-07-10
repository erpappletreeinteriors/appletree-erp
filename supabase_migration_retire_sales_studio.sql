-- ============================================================================
-- Appletree Interiors — Retire the standalone Sales & Estimation Studio's
-- Supabase tables, now that its workflow has been merged into the master
-- ERP (Costing Masters / Estimator Dashboard / Quotations).
--
-- ⚠️ DESTRUCTIVE — this drops tables and all data in them. Confirmed with
-- the CEO (2026-07-10) that appletree_sales_studio.html has NOT been used
-- in real production — these tables hold no real business data as of this
-- writing. DO NOT run this without first re-confirming that's still true
-- (e.g. `select count(*) from ss_quotations;` on each table below — if any
-- return >0 rows, STOP and migrate that data into the ERP's tables first
-- rather than running this).
--
-- Not run automatically by anyone — a human runs this deliberately in the
-- Supabase Dashboard SQL Editor when ready to fully decommission the
-- standalone tool.
-- ============================================================================

-- 1. Sanity check — run this block FIRST and read the output before proceeding.
select 'ss_quotations' t, count(*) rows from public.ss_quotations
union all select 'ss_staff', count(*) from public.ss_staff
union all select 'ss_architects', count(*) from public.ss_architects
union all select 'ss_builders', count(*) from public.ss_builders
union all select 'ss_b2b_partners', count(*) from public.ss_b2b_partners
union all select 'ss_materials', count(*) from public.ss_materials
union all select 'ss_hardware', count(*) from public.ss_hardware
union all select 'ss_labour', count(*) from public.ss_labour
union all select 'ss_templates', count(*) from public.ss_templates
union all select 'ss_projects', count(*) from public.ss_projects
union all select 'ss_costing_items', count(*) from public.ss_costing_items
union all select 'ss_custom_items', count(*) from public.ss_custom_items
union all select 'ss_simple_items', count(*) from public.ss_simple_items
union all select 'ss_settings', count(*) from public.ss_settings
union all select 'ss_pending_users', count(*) from public.ss_pending_users
union all select 'ss_profiles', count(*) from public.ss_profiles;

-- 2. Once every row above is confirmed 0 (or already migrated), drop the tables.
-- Uncomment to run:

-- drop table if exists public.ss_quotations;
-- drop table if exists public.ss_staff;
-- drop table if exists public.ss_architects;
-- drop table if exists public.ss_builders;
-- drop table if exists public.ss_b2b_partners;
-- drop table if exists public.ss_materials;
-- drop table if exists public.ss_hardware;
-- drop table if exists public.ss_labour;
-- drop table if exists public.ss_templates;
-- drop table if exists public.ss_projects;
-- drop table if exists public.ss_costing_items;
-- drop table if exists public.ss_custom_items;
-- drop table if exists public.ss_simple_items;
-- drop table if exists public.ss_settings;
-- drop table if exists public.ss_pending_users;
-- drop table if exists public.ss_profiles;
