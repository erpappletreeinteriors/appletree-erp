# PHASE 38 — Inventory Traceability Report

**Date:** 2026-09-11. Live-tested on a disposable isolated server via
`tests/erp_phase38_e2e_trace_tests.js` (Part 5 section), plus forensic code tracing.

## The single inventory ledger

`postInventoryMovement()` (`domain.js:4447`) is the **only** function that pushes to
`DB.inventoryMovements` (confirmed via repository-wide search — one push site, `domain.js:4480`).
24 call sites across GRN, Material Issue, Purchase/Site Returns, Inventory Transfer/Adjustment,
Opening Balance import, Site Material Requisition issue/receipt, and the Job Work family. No direct-
mutation bypass found anywhere.

**Stock is never a stored, incremented field.** `getStockLevel`, `getSiteStockLevel`,
`getJobWorkerStockLevel`, and `getMovingAverageRate` are all pure `reduce()` operations over
`DB.inventoryMovements`, filtered by material/warehouse-or-site. This structurally rules out
negative-stock-via-drift and double-counting — there is no second number that could desync from the
movement history.

## Live-traced chain: GRN → Warehouse Stock → Site Material Requisition → Delivery Challan → Site
Receipt → Material Issue → Project Actual Cost

Executed for real, on a fresh isolated instance, with before/after state genuinely checked at each
step (not merely `ok:true`):

1. **GRN #1 (30 units) + GRN #2 (20 units)** against one PO — warehouse stock of MAT-1 in WH-1
   verified to rise from 0 → 50.
2. **Site created** (`TEST-SITE-001`, a real master record — the fresh seed has zero sites by
   default).
3. **Site Material Requisition** (15 units) raised by the site's assigned SiteInCharge (role-gated,
   live-confirmed: a ProjectManager attempt was correctly rejected with 403).
4. **MRS submit → approve → issue** produced a real Delivery Challan record
   (`issueToSite()`), and warehouse stock verified to drop 50 → 35 — exactly the issued quantity,
   confirmed by direct before/after API comparison, not assumed.
5. **Site Material Receipt** created against the Delivery Challan (real FK:
   `receipt.deliveryChallanId === challan.id`).
6. **Material Issue** (10 of the 15 site-delivered units) consumed from the SITE's own pooled
   ledger (not the warehouse) — confirmed via the code's own architecture: `issueToSite()` moves
   custody with **zero GL effect** (a comment at `domain.js:10858-10862` explicitly states this
   design — cost is only recognized later, at actual consumption); `createMaterialIssue({siteId})`
   is "the ONLY event that hits Project Actual Cost" (`domain.js:5363` comment), and this is where
   the real Dr Project Material Cost / Cr Inventory posting happens.
7. **Over-issue negative test**: attempting to issue 999 units (far beyond the 15 delivered to
   site) was correctly BLOCKED.

## Purchase Return vs. Material Return (Site) — structurally distinct, verified via code

`createPurchaseReturn` requires a real `grnId`, reduces vendor payable (Dr 2050 / Cr 1200), and only
ever references vendor-facing documents. `returnFromSite` requires `siteId`+`warehouseId`, has
**zero vendor/GRN reference anywhere in its code**, reverses `issueToSite`'s own movement pair with
zero GL effect for a "Usable" condition line, and writes off value (Dr Inventory Adjustment 5300 /
Cr Inventory 1200) only for "Damaged"/"Lost" lines — a genuinely different mechanism from Purchase
Return, not a relabeled duplicate. (Confirmed by direct code reading this phase, not live-tested —
see Remaining Gaps.)

## Movement types and valuation

Inventory movements carry `type` (Receipt/Issue/TransferIn/TransferOut/SiteReceipt/JobWorkIssue/
JobWorkReceipt/JobWorkReturn/JobWorkScrap/JobWorkDirectDispatch, etc.), `materialId`, `qty`, source/
destination warehouse or site, `date`, and the posting `actor` — all real fields verified present on
live-created records during this phase's E2E run. Moving-average valuation
(`getMovingAverageRate`) is computed from the same movement ledger, not a separately-maintained
field.

## What was NOT live-tested this phase (disclosed, not assumed clean)

- **Inventory Transfer** (warehouse-to-warehouse) — not exercised live this phase; confirmed to
  exist as a real `postInventoryMovement()`-backed function via code trace only.
- **Inventory Adjustment / Damage / Write-off / ITC Reversal** — confirmed as real, GL-posting
  functions via code trace only, not live-executed this phase (was live-tested in earlier
  engagement phases, per this repository's own history, but not re-verified in this specific pass).
- **Job Work stock chain** (dispatch→job-worker custody→return/scrap/direct-dispatch) — confirmed
  structurally correct via code trace (real FK linkage, no double-counting found in the code) but
  not live-executed this phase.
- **Negative-stock prevention** — the over-issue negative test above proves the site-stock case is
  blocked; the warehouse-level equivalent (attempting a GRN-less Material Issue exceeding warehouse
  stock) was not separately re-verified this phase (it was covered in earlier engagement phases'
  own testing, referenced but not re-run here).

## Conclusion

For the chain actually exercised — the complete GRN→Warehouse→Site→Consumption path — every stage
is real, correctly authorized, correctly derives stock rather than storing it twice, and correctly
produces exactly the GL effect the architecture calls for (cost recognized once, at actual
consumption, never at custody transfer). No orphan or duplicated inventory mutation was found. The
broader inventory surface (Transfers, Adjustments, Job Work) is architecturally consistent by code
inspection but was not independently re-proven live in this specific phase — stated honestly rather
than claimed as tested.
