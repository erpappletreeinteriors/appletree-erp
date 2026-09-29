# WAVE2_PROJECT-COST-RESULTS.md

**Date:** 2026-09-22. Per this CR's own §17.

## Single project-cost model preserved

None of the 5 new SoD rules computes, posts, or reads a project-cost figure. `projectFinancial360`/
`companyProjectProfitability` remain the sole aggregation path, completely unmodified by this pass.
`jobCostSheet()`/`productCosting()` (Manufacturing's own narrower, per-order/per-BOM cost rollups,
distinct from and non-competing with the project-level model, per `ARCH-2026-002-WAVE-2-CENTRAL-ENGINE-AUDIT.md`
§7) are also unmodified.

## Wave 2 transactions inspected against Budget → Commitment → Actual

| Source | Status |
|---|---|
| Purchase Orders | Unaffected — SOD-7/8/9/10/11 do not touch PO creation, approval, or commitment creation |
| Supplier Bills | SOD-8 gates ONE narrow path (a Job-Work-linked bill's creation) — the bill's own actual-cost posting into the project model, once created by an authorized (different) user, is completely unmodified |
| Material Issues | Unaffected |
| Labour | Unaffected — `postProductionLabourCost` untouched; SOD-7 gates only `completeProductionOrder`, which was already, and remains, cost-silent |
| Project Expenses | Unaffected |
| Production Costs | Unaffected — see above |
| Job Work | SOD-9 gates the Return/Scrap/Direct-Dispatch actions; once performed by an authorized (different) user, all downstream cost/inventory effects are identical to before this pass |
| Site Material | Unaffected — no Wave 2 change touches Site Execution's own functions |

## No second project-cost calculation introduced

Confirmed by code review of every changed function — none adds a `projectId`-keyed sum, cache, or
report; all 5 rules are pure authorization gates.

## Conclusion

The Budget→Commitment→Actual model remains singular and is fed identically to before this pass for
every transaction path this pass touched, once an authorized (non-self-dealing) user performs the
action.
