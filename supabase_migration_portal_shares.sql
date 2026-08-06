-- ============================================================================
-- Appletree Interiors ERP — Customer Portal (portal_shares) migration
-- Master Prompt Module 5: Customer Portal. CEO's explicit choice was a
-- shareable read-only status link, NOT a login-based portal — no customer
-- account, no password. Staff generate a curated, point-in-time snapshot
-- of one project behind a long random token; the public status page looks
-- the token up via a SECURITY DEFINER RPC and renders only that snapshot.
--
-- Run this once in Supabase Dashboard → SQL Editor → New Query → Run,
-- BEFORE deploying the release that adds 'portalShares' to ERP_KEYS.
-- Safe to re-run (idempotent).
-- ============================================================================

-- Staff-side table — same generic id/data/org_id shape as every other
-- entity table in this app. Normal org-member RLS applies here: only
-- logged-in Appletree staff can list/create/refresh/revoke their own
-- org's links. This table is NOT the public read path (see the RPC below).
create table if not exists public.portal_shares (
  id text primary key,
  data jsonb not null default '{}',
  org_id text not null default 'appletree-interiors',
  updated_at timestamptz default now()
);

create index if not exists idx_portal_shares_org on public.portal_shares(org_id);
create index if not exists idx_portal_shares_token on public.portal_shares((data->>'token'));

alter table public.portal_shares enable row level security;

drop policy if exists erp_select on public.portal_shares;
drop policy if exists erp_insert on public.portal_shares;
drop policy if exists erp_update on public.portal_shares;
drop policy if exists erp_delete on public.portal_shares;

create policy erp_select on public.portal_shares for select
using (public.erp_is_member(org_id));
create policy erp_insert on public.portal_shares for insert
with check (public.erp_is_member(org_id));
create policy erp_update on public.portal_shares for update
using (public.erp_is_member(org_id))
with check (public.erp_is_member(org_id));
create policy erp_delete on public.portal_shares for delete
using (public.erp_is_member(org_id));

-- ============================================================================
-- Public, token-gated read for the customer-facing status page.
--
-- IMPORTANT — why this is safe despite being callable by anyone with the
-- anon key (which is baked into the public HTML file, so effectively
-- anyone): the anon/authenticated roles are granted EXECUTE on this
-- function ONLY — they get no direct SELECT grant on portal_shares at
-- all. The function is SECURITY DEFINER, so internally it can read the
-- table despite RLS blocking anonymous SELECT, but it only ever returns
-- the ONE row whose token exactly matches the argument. There is no way
-- to enumerate — knowing one project's token can never reveal any other
-- project's link, because there is no "list" or "browse" capability here,
-- only "look up this exact token". This is the same security model as
-- any "anyone with the link" sharing feature (e.g. Google Docs): the
-- token itself (18 random bytes, ~144 bits of entropy) is the credential.
-- ============================================================================
create or replace function public.get_portal_share(p_token text)
returns table(project_id text, snapshot jsonb, revoked boolean, created_date text)
language sql
security definer
set search_path = public
as $$
  select (data->>'projectId')::text,
         (data->'snapshot')::jsonb,
         coalesce((data->>'revoked')::boolean, false),
         (data->>'createdDate')::text
  from public.portal_shares
  where data->>'token' = p_token
  limit 1;
$$;

revoke all on function public.get_portal_share(text) from public;
grant execute on function public.get_portal_share(text) to anon, authenticated;

-- ============================================================================
-- Verify:
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename = 'portal_shares';
--   -- should return one row, rowsecurity = true
--
--   select proname, prosecdef from pg_proc where proname = 'get_portal_share';
--   -- prosecdef should be true (SECURITY DEFINER)
-- ============================================================================
