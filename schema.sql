-- ═══════════════════════════════════════════════════════════════════
-- APPLETREE INTERIORS ERP — SUPABASE SCHEMA
-- Run this entire file in Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. USER PROFILES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id    UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     TEXT    NOT NULL DEFAULT 'appletree-interiors',
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  role       TEXT    NOT NULL CHECK (role IN (
               'CEO','Factory Supervisor','Site Supervisor',
               'Accounts','Sales','Procurement','Admin')),
  initials   TEXT    NOT NULL DEFAULT '',
  phone      TEXT    DEFAULT '',
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-bootstrap CEO on first Google login
-- NOTE: SET search_path is required here. Without it, the role that fires
-- this trigger during auth.users INSERT does not have 'public' on its
-- search_path, and the unqualified "user_profiles" reference fails with
-- "relation user_profiles does not exist" (SQLSTATE 42P01), which blocks
-- ALL new account creation. This bit a live deployment once already.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email = 'sales.appletreeinteriors@gmail.com' THEN
    INSERT INTO public.user_profiles (user_id, org_id, name, email, role, initials, is_approved)
    VALUES (NEW.id, 'appletree-interiors', 'CEO', NEW.email, 'CEO', 'CE', TRUE)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ── 2. ERP DATA TABLES ──────────────────────────────────────────
-- All tables share the same structure:
--   id         TEXT  — ERP's existing record ID
--   data       JSONB — full record as stored in the app
--   org_id     TEXT  — tenant scope
--   updated_at TIMESTAMPTZ

CREATE TABLE IF NOT EXISTS projects         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS products         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS warehouse        (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS purchases        (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS issues           (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS returns          (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS labour           (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS expenses         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS qc               (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS invoices         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS receipts         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS bills            (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS project_budgets  (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS material_requests(id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS bank_entries     (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS leads            (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS quotations       (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS customers        (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS workers          (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS items            (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS vendor_master    (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS deliveries       (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS installation     (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS employees        (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS attendance       (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS payroll          (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS advances         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS purchase_orders  (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS milestones       (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS site_deliveries  (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS installations    (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS machines         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS mfg_jobs         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS mfg_ops          (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS accounts         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS pending_users    (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS dispatch         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', org_id TEXT NOT NULL DEFAULT 'appletree-interiors', updated_at TIMESTAMPTZ DEFAULT NOW());

-- ── 3. ROW LEVEL SECURITY ───────────────────────────────────────
-- NOTE: this section is the original baseline RLS. It has since been
-- superseded by supabase_rls_migration.sql, which adds: privilege-escalation
-- guards on role/is_approved changes, special-cased pending_users access for
-- not-yet-approved signups, and an erp_is_admin() check for user management.
-- On a fresh database, run THIS file first, then supabase_rls_migration.sql.
-- Policy: must be authenticated AND have an approved profile in this org

-- Helper function to check membership
CREATE OR REPLACE FUNCTION is_approved_member()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid()
    AND org_id = 'appletree-interiors'
    AND is_approved = TRUE
  );
$$;

-- user_profiles: each user can only see/edit their own profile
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile" ON user_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- CEO can read all profiles (for approvals)
CREATE POLICY "ceo_read_all_profiles" ON user_profiles
  FOR SELECT TO authenticated
  USING (is_approved_member());

-- Macro: apply same RLS to all data tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'projects','products','warehouse','purchases','issues','returns',
    'labour','expenses','qc','invoices','receipts','bills',
    'project_budgets','material_requests','bank_entries','leads',
    'quotations','customers','workers','items','vendor_master',
    'deliveries','installation','employees','attendance','payroll',
    'advances','purchase_orders','milestones','site_deliveries',
    'installations','machines','mfg_jobs','mfg_ops','accounts',
    'pending_users','dispatch'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY "approved_members_all" ON %I
       FOR ALL TO authenticated
       USING (is_approved_member())
       WITH CHECK (is_approved_member())',
      tbl
    );
  END LOOP;
END;
$$;

-- ── 4. INDEXES FOR PERFORMANCE ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_org        ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_products_org        ON products(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org        ON invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_receipts_org        ON receipts(org_id);
CREATE INDEX IF NOT EXISTS idx_milestones_org      ON milestones(org_id);
CREATE INDEX IF NOT EXISTS idx_mfg_jobs_org        ON mfg_jobs(org_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org ON purchase_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_org   ON user_profiles(org_id);

-- ── 5. UPDATED_AT TRIGGER ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'projects','products','warehouse','purchases','issues','returns',
    'labour','expenses','qc','invoices','receipts','bills',
    'project_budgets','material_requests','bank_entries','leads',
    'quotations','customers','workers','items','vendor_master',
    'deliveries','installation','employees','attendance','payroll',
    'advances','purchase_orders','milestones','site_deliveries',
    'installations','machines','mfg_jobs','mfg_ops','accounts',
    'pending_users','dispatch','user_profiles'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_%s_updated_at ON %I;
       CREATE TRIGGER set_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE PROCEDURE set_updated_at()',
      replace(tbl,'-','_'), tbl, replace(tbl,'-','_'), tbl
    );
  END LOOP;
END;
$$;

-- ── DONE ────────────────────────────────────────────────────────
-- Schema created. Run this once. Then configure Google OAuth
-- in Supabase Dashboard → Authentication → Providers → Google.
