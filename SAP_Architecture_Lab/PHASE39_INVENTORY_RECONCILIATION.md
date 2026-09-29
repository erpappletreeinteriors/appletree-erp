# PHASE 39 — Inventory Reconciliation

**Date:** 2026-09-12. Isolated test server, `APP_ENV=test`, port 4091.

## Independent reconciliation: inventory movements vs. GL account 1200 — fresh, direct check

Using the 525-document stress-test state (105 GRN receipts, 5 projects, 2 materials, ₹2,800/sheet):

- **Sum of all inventory Receipt movements' `valuationAmount`**: ₹14,70,000 (105 × ₹14,000, each GRN
  5 units × ₹2,800).
- **GL account `1200` (Inventory/WIP Asset) balance** (`GET /api/trial-balance`):
  `{debit: 1470000, credit: 0}`.
- **Exact match**, computed independently from the movement ledger and compared against the GL
  control account — not read from a single "official" report that could itself be wrong.

## Manufacturing consumption — valuation traced through 3 independent sources

From `PHASE39_MANUFACTURING_LIVE_TEST.md`: BOM-driven material issue of 52.5 sheets MAT-1 (₹147,000)
+ 200 nos MAT-2 (₹240,000) reconciled EXACTLY across:
1. The inventory movement ledger's own `valuationAmount` fields.
2. The corresponding journal entries (`Dr 5000 Material Cost / Cr 1200`, balanced).
3. The Job Cost Sheet's independently-computed `materialCost` field.

All three matched to the rupee — inventory valuation is derived from the transaction ledger, never a
separately-maintained running total (Invariant #15 in `PHASE39_ACCOUNTING_RECONCILIATION.md`).

## Job Work custody transfer — no double-counting, 3 real checkpoints

From `PHASE39_JOB_WORK_LIVE_TEST.md`: dispatch (−10), partial return (+5), scrap (unchanged) each
independently checkpointed against live `GET /api/inventory/stock` queries — net change over the
full cycle exactly −5, matching the real physical event (10 dispatched, 5 returned, 5 scrapped/
written off and never re-entering custody).

## Moving-average valuation confirmed consistent

Every valuation rate observed this phase for MAT-1/MAT-2 matched their most recent GRN receipt rate
exactly (₹2,800/sheet, ₹1,200/nos) — expected and correct, since no prior stock existed on any of
this phase's freshly-reset isolated instances to blend into a different moving average. This is
disclosed as a scope note, not claimed as a full moving-average-blending proof: a scenario with
multiple GRNs at DIFFERENT rates for the same material, verifying the blended average lands exactly
where hand-calculation predicts, was not separately constructed this phase (Phase 38's own inventory
trace report covers that scenario for the chains it tested).

## Negative stock — structurally blocked, live-reproduced

Confirmed live (surfaced naturally during Manufacturing/Job Work test debugging, not a contrived
probe): attempting to issue/dispatch more material than a warehouse holds is rejected with an
explicit message ("...negative stock is blocked, not silently allowed"), never silently permitted or
silently clamped to zero.

## Verdict

Inventory valuation reconciles exactly to its GL control account under both a 525-document stress
load and targeted Manufacturing/Job Work transaction chains, with zero unexplained variance found in
any check performed this phase.
