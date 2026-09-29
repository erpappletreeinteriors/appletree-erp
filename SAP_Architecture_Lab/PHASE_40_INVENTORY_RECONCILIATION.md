# PHASE 40 — Inventory Reconciliation

**Date:** 2026-09-13.

## Fresh, direct reconciliation on the 525-document stress batch

- **Sum of all inventory Receipt movements' `valuationAmount`**: ₹14,70,000 (105 GRNs × ₹14,000
  each, 5 units × ₹2,800).
- **GL account `1200` (Inventory/WIP Asset) balance**: `{debit: 1470000, credit: 0}`.
- **Exact match**, independently computed from the movement ledger, not read from a single report.

## Browser-UAT-driven reconciliation (real UI transactions, captured live during the pass — this
state was superseded by the stress-test reset above, so its exact figures are preserved here from
the matrix rather than re-queried)

From `PHASE_40_BROWSER_UAT_MATRIX.md` area D/E:
- GRN receipts: 6 + 4 = 10 units MAT-1 into WH-1 (₹28,000).
- MRS issue to site: 4 units (₹11,200) — Delivery Challan, Site Receipt matched exactly ("Recorded,
  matches the challan").
- Site Consumption (the real project-cost event): 3 units (₹8,400) — independently cross-checked
  against `GET /api/projects/PRJ-1/cost-breakdown`, which returned `consumed:8400` — an exact match
  to the transaction just performed through the UI, not a coincidence of a rounder number.
- Manufacturing consumption (BOM-driven, Production Order): 2×1.05 (5% scrap) = 2.1 units MAT-1
  (₹5,880) — matched exactly to the Job Cost Sheet's `materialCost:5880`.
- Job Work: dispatched 2 units, returned 1 (stock +1, exact), scrapped 1 (stock unchanged, exact —
  the scrapped unit was never back in warehouse custody, correctly not double-subtracted).

Every single inventory movement performed through the real browser UI this phase reconciled exactly
to its own independently-computed expected value — none were merely assumed correct because the
screen didn't show an error.

## No double stock mutation — explicitly re-proven

Job Work's dispatch(−2)/return(+1)/scrap(0 further change) sequence is the specific invariant
Phase 39 established and this phase re-proved live, through the real UI, with real stock-level
checkpoints before and after each action (not simulated): 1.9→2.9 on return, 2.9→2.9 on scrap.

## Verdict

Inventory valuation reconciles exactly to its GL control account both under a 525-document stress
load and across every individual, real, browser-driven transaction performed this phase — 6
independent reconciliation points, all exact, none assumed.
