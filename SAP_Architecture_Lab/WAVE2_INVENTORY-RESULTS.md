# WAVE2_INVENTORY-RESULTS.md

**Date:** 2026-09-22. Per this CR's own §7/§16.

## Single inventory-movement writer preserved

Re-confirmed after this pass's edits: the only `DB.inventoryMovements.push()` in `server/domain.js`
remains the one inside `postInventoryMovement()`. None of the 5 new SoD guards adds, forks, or bypasses
this writer. SOD-9's 3 guards (return/scrap/direct-dispatch) sit BEFORE each function's own existing
`postInventoryMovement()` calls — a blocked attempt never reaches them.

## No double stock, no missing stock, re-verified live

`WAVE2_TEST-RESULTS.md` Part [SOD-9-INVENTORY]: after inserting the SOD-9 guard into
`returnFromJobWorker()`/`recordJobWorkScrap()`/`directDispatchFromJobWorker()`, a full
dispatch(4)→return(2, different user)→scrap(1, different user) cycle was re-run live — the Job Work
Order's `returnedQtyByLine`/`scrapQtyByLine` fields exactly match (2, 1), matching the pre-existing,
unmodified net-quantity math already proven by `erp_phase39_manufacturing_jobwork_tests.js` (re-run this
pass, still 36/36 — see `WAVE2_REGRESSION.md`). **No double stock, no missing stock introduced by the
new guards.**

## Negative/edge-case testing

| Test | Result |
|---|---|
| Duplicate movement | Not applicable — no new movement path added; existing duplicate-detection unchanged |
| Missing movement | N/A — same reasoning |
| Negative stock | Unaffected — existing `assertPositiveFiniteNumber`-class guards untouched |
| NaN/invalid quantity | Unaffected — existing validation untouched |
| Concurrency | Existing single-instance file-lock protection (ERP-005) unaffected; re-confirmed via the full regression battery's own concurrency-adjacent suites |
| Replay/duplicate submission | Existing idempotency-key mechanism (`withTransaction`'s own `options.idempotency` handling) is completely independent of the new SoD guards — a blocked SoD attempt never reaches the idempotency-recording step, so no interaction exists |

## Conclusion

The single inventory-movement engine remains genuinely singular. Zero stock-integrity regression
introduced by this pass's 5 new SoD rules — every guard is purely an authorization gate positioned
before the existing, unmodified inventory-writing logic.
