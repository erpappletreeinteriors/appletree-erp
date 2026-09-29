# WAVE2_ACCOUNTING-RESULTS.md

**Date:** 2026-09-22. Per this CR's own §15.

## Accounting ownership preserved

None of the 5 new SoD guards touches a single GL-posting call site. `postProductionLabourCost()` (the
one Manufacturing function that DOES post GL) is completely unmodified — SOD-7 gates only
`completeProductionOrder()`, which was already, and remains, GL-silent (Finished-Goods accounting was
out of scope per this CR's own §8, unchanged). SOD-8's guard sits BEFORE any of
`draftSupplierInvoice()`/`draftSupplierInvoiceFromPO()`'s own existing GL-posting logic — a blocked
attempt never reaches the posting code at all (proven: `WAVE2_TEST-RESULTS.md`'s SOD-8-NEG assertion
shows zero side effects). SOD-9's guards sit before the Return/Scrap/Direct-Dispatch functions' own
inventory/GL logic. SOD-10/SOD-11 touch no GL path.

## Live verification (this pass's own test suite + full regression)

| Invariant | Result | Evidence |
|---|---|---|
| Debits = Credits | **PASS** | `erp_phase39_stress_test.js` (11/11, 525-document batch, re-run this pass) |
| AR reconciles | **PASS** | Same suite, AR subledger vs control account |
| AP reconciles | **PASS** | Same suite, AP subledger vs control account — directly relevant, since SOD-8 gates a Supplier Bill creation path |
| GST reconciles | **PASS** | Output/Input GST vs GL, same suite |
| TDS reconciles | **N/A this pass** | No Wave 2 change touches TDS-bearing transaction types |
| Clearing reconciles | **PASS** | Unaffected — no Wave 2 change touches `applyClearing()` |
| Project actuals reconcile | **PASS** | See `WAVE2_PROJECT-COST-RESULTS.md` |
| Job Work charges reconcile | **PASS** | `WAVE2_TEST-RESULTS.md` SOD-8 positive control: a legitimate (different-user) Supplier Bill for job-work charges posts and reconciles exactly as before this pass |
| Production costs reconcile | **PASS** | `WAVE2_TEST-RESULTS.md` SOD-7 positive control: a legitimate (different-user) Production Order completion is unaffected; `jobCostSheet`/`productCosting` untouched by this pass |

## Conclusion

No accounting behavior was altered for any transaction that does not trigger one of the 5 new SoD
rules. For transactions that DO trigger a rule, the block occurs before any accounting entry is
attempted — a blocked attempt produces zero GL side effects (proven live, not just reasoned about).
