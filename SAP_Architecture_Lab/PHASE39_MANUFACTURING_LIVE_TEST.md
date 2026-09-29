# PHASE 39 — Manufacturing Live Test

**Date:** 2026-09-12. Isolated test server, `APP_ENV=test`, port 4091, fictional `PRJ-1`/`TEST39`-
scope data only. Test script: `tests/erp_phase39_manufacturing_jobwork_tests.js`. Raw results:
`phase39_mfg_jobwork_results.json`.

## What was live-executed

Full chain: BOM create → submit → approve → Production Order (against the approved BOM) → Material
Consumption (issue-material, per-BOM-line with scrap%) → Production Labour Cost (real GL posting) →
Job Card create → start → complete → Production Order complete (`actualQty`/`rejectedQty`) → Job
Cost Sheet → Product Costing report.

**18 assertions, 18/18 PASS** (of the suite's 36 total — the remainder are Job Work, reported
separately). Every step executed against the live server via real HTTP calls with session cookies
per actor — not code-read, not inferred.

## Negative tests (all correctly BLOCKED)

| # | Scenario | Result |
|---|---|---|
| 1 | Production Order created against an **unapproved** (still-Draft) BOM | BLOCKED |
| 2 | Production Order on a project the actor (`pm1`, PM of `PRJ-1` only) does **not** manage (`PRJ-2`) | BLOCKED |
| 3 | Duplicate material issue against an already-`InProgress` Production Order | BLOCKED |
| 4 | Unauthorized role (`Sales`) attempting to create a BOM | BLOCKED |
| 5 | Material issue against a **Completed** Production Order (invalid status transition) | BLOCKED |
| 6 | Cancellation of a **Completed** Production Order | BLOCKED |

## Quantity/cost reconciliation — independently verified, not assumed

BOM `BOM-0001` lines: MAT-1 (Plywood 18mm Marine Grade) qty 5/unit, 5% scrap, uom sheet; MAT-2
(Laminate — Standard Finish) qty 20/unit, 0% scrap, uom nos. Production Order `PROD-0001`,
`plannedQty:10`.

Expected material issue per the documented formula `line.qty * plannedQty * (1 + scrapPct/100)`:
- MAT-1: `5 × 10 × 1.05 = 52.5` sheets
- MAT-2: `20 × 10 × 1.00 = 200` nos

**Live-confirmed via `GET /api/inventory/movements` (MV-000003, MV-000004):** exactly 52.5 MAT-1 and
200 MAT-2 issued, at moving-average valuation rate ₹2,800/sheet and ₹1,200/nos respectively (matching
this test's own GRN receipt rate — no prior stock existed to blend into the average). Valuation
amounts: ₹147,000 (MAT-1) + ₹240,000 (MAT-2) = **₹387,000**.

**Live-confirmed via `GET /api/journal-entries`:** JE-0003 (Material Issue MAT-1, debit 5000 /
credit 1200, ₹147,000, balanced) and JE-0004 (Material Issue MAT-2, debit 5000 / credit 1200,
₹240,000, balanced) — sum **₹387,000**, exact match to the inventory-movement valuation above.

JE-0005 (Production Labour, debit 5100 `CC-FACTORY` / credit 1000, ₹12,000, balanced) — matches the
posted labour-cost amount exactly.

**Job Cost Sheet** (`GET /api/job-cost-sheet?productionOrderId=PROD-0001`):
`materialCost: 387000, labourCost: 12000, totalActualCost: 399000` — reconciles exactly to
₹387,000 (GL material JEs) + ₹12,000 (GL labour JE) = **₹399,000**, all three independently
cross-checked and matching to the rupee.

**Product Costing** (`GET /api/product-costing?bomId=BOM-0001`): `materialCost: 38700` is the
correct **per-unit** standard cost (`5×1.05×2800 + 20×1200 = 14700 + 24000 = 38700`); scaled by
`plannedQty:10` this equals the Job Cost Sheet's ₹387,000 exactly. `labourOverhead: 5805` = 15% of
38,700 (disclosed default overhead rate, not an approved Appletree costing policy — flagged, not
silently assumed correct business policy). `standardUnitCost: 44505 = 38700 + 5805`, arithmetically
correct.

## Finished-goods inventory scope (confirmed, unchanged from Phase 38's forensic note)

Production Output is tracked operationally only this phase (no finished-goods inventory/GL
capitalization) — confirmed via code comment in `domain.js`, consistent with Phase 38's prior
forensic finding. Not a defect; a disclosed, deliberate scope limit of the current build.

## New finding this phase

**DEF-P39-01 (P4, cosmetic):** the MAT-2 material-issue inventory movement (`MV-000004`) and its
GL journal entry (`JE-0004`) narration record `uom: "sheet"` instead of the material's correct
`"nos"`. Quantity (200), valuation rate (₹1,200), and valuation amount (₹240,000) are all correct —
this is a display/narration label bug only, with zero financial or quantity impact. Logged to
`PHASE39_FINAL_DEFECT_REGISTER.md`.

## Verdict

**Manufacturing is now LIVE-PROVEN**, not merely code-traced. All quantities, valuations, and GL
postings reconcile exactly across three independent sources (inventory movements, journal entries,
Job Cost Sheet/Product Costing reports). One new P4 cosmetic defect found and disclosed.
