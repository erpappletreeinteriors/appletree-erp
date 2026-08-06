-- ============================================================================
-- Appletree Interiors ERP — Server-side DOA enforcement
-- Audit Critical #2: PO-send and quotation-discount approval tiers (BOS
-- Manual §1.6) were enforced only in the client-side JS save handler
-- (poSave() / applyQuotationStatus() in appletree_erp_v2_1.html). Nothing
-- re-validated on write, so both gates were bypassable by calling
-- supabase.from('purchase_orders'/'quotations').update(...) directly from
-- the browser console, skipping the UI entirely.
--
-- This migration re-implements the same tier thresholds as Postgres
-- triggers that recompute the PO total / quotation discount % from the
-- row's own item data (never trusting a client-supplied "approved" flag)
-- and check the acting user's role in user_profiles before allowing the
-- gated transition through. If the role doesn't qualify, the write is
-- rejected at the database level — no application code can bypass this.
--
-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> Run.
-- Safe to re-run (idempotent): drops and recreates functions/triggers.
--
-- >>> IMPORTANT — per this project's Zero-Risk Production Policy, this has
-- >>> NOT been run against production and could not be tested against a
-- >>> live Postgres/Supabase instance in the environment this was written
-- >>> in. Test against a Supabase branch / local Supabase CLI instance
-- >>> first: create a Draft PO over 20,00,000 and a Draft quotation with a
-- >>> discount over 10%, log in as a non-CEO/Accounts role, and confirm
-- >>> the direct Supabase update is rejected with the "DOA:" exception
-- >>> before this runs anywhere near real data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers — recompute PO total / quotation discount % from raw item data,
--    mirroring poTotal()/quotSubtotal()/quotDiscountPct() in the app exactly.
-- ----------------------------------------------------------------------------
create or replace function public._erp_po_total(po jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(sum((item->>'amount')::numeric), 0)
  from jsonb_array_elements(coalesce(po->'items','[]'::jsonb)) as item
$$;

create or replace function public._erp_quot_subtotal(q jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(sum((item->>'amount')::numeric), 0)
  from jsonb_array_elements(coalesce(q->'rooms','[]'::jsonb)) as room
  cross join jsonb_array_elements(coalesce(room->'items','[]'::jsonb)) as item
$$;

create or replace function public._erp_quot_discount_pct(q jsonb)
returns numeric
language sql
immutable
as $$
  select case
    when (q->>'discountType') = 'pct' then coalesce((q->>'discountValue')::numeric, 0)
    else case
      when public._erp_quot_subtotal(q) > 0
        then coalesce((q->>'discountValue')::numeric, 0) / public._erp_quot_subtotal(q) * 100
      else 0
    end
  end
$$;

-- ----------------------------------------------------------------------------
-- 2. Purchase Orders — sending a PO (status -> 'Sent') above the value-tier
--    threshold requires the matching approver role, same tiers as
--    poDoaApproverRole() in the app: <=5L none, <=20L Accounts, else CEO.
--    Covers both UPDATE (normal Draft->Sent transition) and INSERT (a row
--    inserted directly with status already 'Sent', bypassing the UI's
--    Draft stage entirely) — TG_OP='INSERT' is treated as coming from an
--    implicit 'Draft' so the same gate applies either way.
-- ----------------------------------------------------------------------------
create or replace function public.erp_enforce_po_doa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_status text;
  v_total numeric;
  v_needed_role text;
  v_user_role text;
begin
  v_prev_status := case when TG_OP = 'INSERT' then 'Draft' else (old.data->>'status') end;

  if (new.data->>'status') = 'Sent' and v_prev_status is distinct from 'Sent' then
    v_total := public._erp_po_total(new.data);
    v_needed_role := case
      when v_total <= 500000 then null
      when v_total <= 2000000 then 'Accounts'
      else 'CEO'
    end;

    if v_needed_role is not null then
      select up.role into v_user_role
      from public.user_profiles up
      where up.user_id = auth.uid()
        and up.org_id = new.org_id
        and up.is_approved = true;

      if v_user_role is null or (v_user_role <> v_needed_role and v_user_role not in ('CEO','Admin')) then
        raise exception 'DOA: PO value % requires % approval to send (current role: %)',
          v_total, v_needed_role, coalesce(v_user_role, 'none');
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists erp_enforce_po_doa_trg on public.purchase_orders;
create trigger erp_enforce_po_doa_trg
  before insert or update on public.purchase_orders
  for each row execute function public.erp_enforce_po_doa();

-- ----------------------------------------------------------------------------
-- 3. Quotations — leaving Draft with a discount above the tier threshold
--    requires the matching approver role, same tiers as
--    quotDoaApproverRole() in the app: <=5% none, <=10% Accounts, else CEO.
--    Same INSERT-coverage reasoning as the PO trigger above.
-- ----------------------------------------------------------------------------
create or replace function public.erp_enforce_quotation_doa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_status text;
  v_pct numeric;
  v_needed_role text;
  v_user_role text;
begin
  v_prev_status := case when TG_OP = 'INSERT' then 'Draft' else (old.data->>'status') end;

  if (new.data->>'status') is distinct from 'Draft' and v_prev_status = 'Draft' then
    v_pct := public._erp_quot_discount_pct(new.data);
    v_needed_role := case
      when v_pct <= 5 then null
      when v_pct <= 10 then 'Accounts'
      else 'CEO'
    end;

    if v_needed_role is not null then
      select up.role into v_user_role
      from public.user_profiles up
      where up.user_id = auth.uid()
        and up.org_id = new.org_id
        and up.is_approved = true;

      if v_user_role is null or (v_user_role <> v_needed_role and v_user_role not in ('CEO','Admin')) then
        raise exception 'DOA: % percent discount requires % approval to leave Draft (current role: %)',
          round(v_pct, 1), v_needed_role, coalesce(v_user_role, 'none');
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists erp_enforce_quotation_doa_trg on public.quotations;
create trigger erp_enforce_quotation_doa_trg
  before insert or update on public.quotations
  for each row execute function public.erp_enforce_quotation_doa();

-- ============================================================================
-- Verify:
--   select tgname, tgrelid::regclass from pg_trigger
--   where tgname in ('erp_enforce_po_doa_trg','erp_enforce_quotation_doa_trg');
-- (should return both rows)
--
-- Test (as a non-CEO/Accounts user, e.g. Procurement):
--   update purchase_orders set data = jsonb_set(data,'{status}','"Sent"')
--     where data->>'poNo' = '<a PO over 20,00,000, currently Draft>';
--   -- should raise "DOA: PO value ... requires CEO approval to send"
-- ============================================================================
