# PHASE 41 — Nomenclature Final Check

**Date:** 2026-09-13. Checked against `APPLETREE_ERP_TERMINOLOGY_STANDARD.md` (the Phase 37-derived
canonical dictionary) and `PHASE37_SAP_APPLETREE_TERMINOLOGY_CROSSWALK.md`, per Section 20.

## Scope of Phase 41's changes against the standard

Phase 41 made exactly one code change (DEF-P41-01, `server/domain.js`) and zero UI/client changes.
The standard's 26 defined terms are concentrated in Procurement/Inventory/Manufacturing/Accounting
(Supplier, GRN, Material Issue, Material Return, Purchase Return, Stock, Inventory, Stock Count,
Warehouse, Location, Site, MRS, PR, MRQ, MR, Delivery Challan, Job Worker, APOB, Change Request,
Clearing, Journal Voucher, Cost Centre, Profit Centre, BOM, Production Order, Snag, Reconciliation,
Trial Balance) — none of which Phase 41 touched or renamed.

## New user-visible text introduced this phase

The only new user-facing text is the two error messages added by DEF-P41-01's fix:

- `"Costing version "X" belongs to Estimation Request "Y", not "Z" — cannot create a quotation mixing costing from a different estimation."`
- `"Estimation Request "X" belongs to Lead "Y", not "Z" — cannot create a quotation mixing an estimation from a different lead."`

Both use the existing terms **Costing Version**, **Estimation Request**, **Lead**, and **Quotation**
exactly as they already appear throughout the live UI's Sales & CRM / Estimation & Costing modules
(the Leads, Estimation & Costing, and Quotations tabs) — no new or alternate term was coined for any
of the four concepts. Phrasing follows the same "belongs to X, not Y — cannot Z" pattern already used
elsewhere in `domain.js` for the pre-existing project-vs-customer cross-check.

## Phase 40 tab labels re-checked for consistency (carried forward, not re-labeled this phase)

- **"Payment Requests"** (added to the Procurement module in Phase 40) — a distinct payment-approval
  workflow concept, not a re-labeling of any standard term; no conflict.
- **"Site Material"** (added to the Procurement module in Phase 40) — the screen's own heading reads
  "Site Material (MRS / Delivery Challan / Site Stock)", explicitly using the standard's own defined
  terms **MRS** and **Delivery Challan** rather than inventing alternatives. No conflict.

## Terms outside the Phase 37 standard's scope (Sales/CRM/Estimation domain)

**Lead**, **Estimation Request**, **Costing Version**, **Quotation**, **Viewer** (role), **Backup**,
**Restore** are all real, live-used terms in this ERP but were not part of the Phase 37 audit's
scope (that audit focused on the Procurement/Inventory/Manufacturing/Accounting domain — see the
term list above). This is a genuine, pre-existing gap in documentation coverage, not something
Phase 41 introduced or is required to close (Phase 41's mandate is nomenclature consistency for
what IT touches, not a new terminology-standard authoring exercise). Disclosed here rather than
silently expanded past scope.

## Verdict

No nomenclature conflicts found. Zero new or inconsistent terms were introduced by Phase 41's one
code change. The pre-existing Phase 40 UI labels remain consistent with the Phase 37 standard where
that standard applies. The standard's own incomplete domain coverage (Sales/CRM/Estimation/Viewer/
Backup) is disclosed as a standing documentation gap, not fabricated as closed.
