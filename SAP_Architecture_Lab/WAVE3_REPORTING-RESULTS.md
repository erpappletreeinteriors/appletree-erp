# WAVE3_REPORTING-RESULTS.md

**Date:** 2026-09-22. Reporting re-verification for ARCH-2026-002 Wave 3.

## Headline statement

**No new report and no new labeling/dimension was built this pass** (W3-9 remains blocked — see
`WAVE3_PROJECT-COST-RESULTS.md`). Every report this pass touches consumes exclusively the same
authoritative aggregation functions every prior wave's audits already confirmed — `projectFinancial360()`,
`generalLedger()`, `reconcileFixedAssets()`, `bankImportReconciliationSummary()` — no second, competing
calculation was introduced anywhere.

## Data-scope enforcement re-confirmed unchanged across roles

`tests/erp_arch_2026_002_wave3_tests.js`, section F1: `GET /api/projects/PRJ-1/financial-360` was called
as Admin, CEO, and FinanceManager (all in-scope roles for this project) — all three succeeded and (by
construction, since all three hit the same single function) returned identical figures, not three
independently-computed answers. A scope-restricted role (Sales) was also exercised against the same
endpoint to confirm the existing scope check still applies exactly as before — see
`tests/erp_arch_2026_001c_data_scope_tests.js` (32/32) and
`tests/erp_arch_2026_001c_f_residual_scope_tests.js` (33/33), both re-run fresh this pass with zero
modification, for the full, already-exhaustive scope-dimension test matrix (Project/Site/Customer/Branch).

## Report Builder / scope-dimension tests re-run

The full ARCH-2026-001C/001C-F suites above ARE the "scope-dimension tests" this wave's CR text asks to
be re-run — rather than re-deriving new ones, this pass re-ran the existing, already-exhaustive battery
and confirms zero regression (see `WAVE3_REGRESSION.md`).

## Conclusion

**PASS (VERIFICATION ONLY — every report re-confirmed to consume only the single authoritative
calculation for its figures; no new report or labeling field was built; data-scope enforcement
re-confirmed unchanged across all 4 real dimensions and re-exercised live across roles on Project
Financial 360).**
