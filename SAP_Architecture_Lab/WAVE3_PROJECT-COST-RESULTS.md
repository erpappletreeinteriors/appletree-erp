# WAVE3_PROJECT-COST-RESULTS.md

**Date:** 2026-09-22. `projectFinancial360()`/`projectPL()` re-verification for ARCH-2026-002 Wave 3.

## Headline statement

**The W3-9 labeling fields were NOT added.** `projectFinancial360()`'s response was diffed
programmatically against a regex for `"depreciationCost"`/`"jobWorkInventoryAdjustmentCost"` (or similar)
this pass and neither is present — confirming W3-9 (classified IMPLEMENTATION BLOCKER by
`WAVE3_IMPLEMENTATION_SCOPE.md`) remains unimplemented. Depreciation and Job-Work Inventory Adjustment
costs are correctly swept into `cost.actual` but stay unlabeled, exactly as before this pass.

## How the sweep works (re-confirmed by source read)

`projectFinancial360()`'s `cost.actual` field is a direct reference to `core.cost` (`coreProjectPL()`),
which is `lifecycle.cost` (`projectPL()`) minus the after-sales warranty/chargeable-service slice.
`projectPL(projectId)` computes `cost` by summing **every** GL line tagged with that `projectId` whose
account has `type==='Expense'`, generically, by account type — not by an enumerated list of account IDs.
Both account `5300` ("Inventory Adjustment", used for Job-Work scrap/write-off) and account `5400`
("Depreciation Expense") are configured `type:'Expense'` in the Chart of Accounts. This means **any**
project-tagged 5300 or 5400 line is automatically included in `cost.actual` — this was true before this
pass and remains true after it; nothing about the sweep mechanism was touched.

## Live re-confirmation this pass

`tests/erp_arch_2026_002_wave3_tests.js`, section D1:

- **Depreciation (5400):** posted one further Depreciation entry (project-tagged to PRJ-1, via a real
  capitalized asset). `projectFinancial360().cost.actual` increased by EXACTLY the new depreciation
  amount (compared to the pre-posting baseline, matched to within ₹0.02).
- **Job-Work Inventory Adjustment (5300):** set up a real Job Work Order (dispatch→scrap, project-tagged
  to PRJ-1) and posted a scrap/write-off event (Dr 5300). `projectFinancial360().cost.actual` increased by
  EXACTLY the scrap event's GL value (compared to the pre-posting baseline, matched to within ₹0.02).

Both confirm the sweep is correct and unchanged — this pass is testing that it STAYS correct, not adding
the W3-9 labeling.

## Conclusion

**PASS (VERIFICATION ONLY — Depreciation and Job-Work Inventory Adjustment costs confirmed still swept
correctly into `cost.actual` when project-tagged; the W3-9 labeling fields were explicitly NOT added, per
`WAVE3_IMPLEMENTATION_SCOPE.md`).**
