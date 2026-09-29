# PHASE 41 — Inventory Reconciliation (Final Smoke)

**Date:** 2026-09-14. Section 17 smoke reconciliation, per the reduced bar (smoke transactions to
prove nothing regressed, not a full dataset recreation).

## GRN / stock-in volume — live, 525-document stress batch

105 Purchase Orders → 105 GRNs, across 5 projects / 2 materials (`MAT-1`, `MAT-2`), all posted
cleanly on the confirmed re-run (**105/105**, zero failures) — see `PHASE_41_REGRESSION_REPORT.md`
for the earlier transient single-failure note and its full investigation/non-reproduction.

## Manufacturing + Job Work stock movements — live, `erp_phase39_manufacturing_jobwork_tests.js`

**36/36 PASS**, re-confirmed fresh this phase after both code fixes, including the exact net-quantity
integrity checks that matter for inventory correctness:

- Partial return (5/10) correctly credits warehouse stock back by exactly the returned quantity.
- Scrap disposition does NOT re-credit warehouse stock (scrapped material never re-enters custody) —
  confirmed by an explicit "stock unchanged by scrap disposition" assertion.
- **Net warehouse stock change across a full dispatch(10)+return(5)+scrap(5) cycle equals exactly
  -5** — the single check that would catch a double-count or a lost/duplicated movement — PASS.
- Direct Dispatch to an unregistered job worker with no active APOB correctly BLOCKED (a real
  inventory-custody control, not merely a UI restriction).

## Fixed Asset register reconciliation — live, `erp_phase39_fixed_assets_tests.js`

**30/30 PASS**, re-confirmed fresh this phase: Fixed Asset Register cost reconciles exactly to GL
account 1400; Accumulated Depreciation register reconciles exactly to GL account 1450; disposed
assets correctly excluded from the on-books register.

## No inventory-posting-path code touched this phase

Neither DEF-P41-01 (`createQuotation()`) nor DEF-P41-02 (`projectDocumentTrace()`) touches
`postInventoryMovement()` or any inventory valuation/quantity logic. The clean regression re-run
(300/300 +2 documented, twice) is the confirming evidence that inventory integrity is unaffected.

## Verdict

Inventory integrity holds at both unit-transaction and stress scale. No regression from either fix
made this phase.
