# WAVE3_ACCOUNTING-RESULTS.md

**Date:** 2026-09-22. GL/reversal/clearing/tax/period-control invariant re-verification for ARCH-2026-002
Wave 3.

## "Exactly one" central-engine invariant — re-confirmed (grep-based, matching every prior wave's pattern)

`tests/erp_arch_2026_002_wave3_tests.js` section E1 counts function definitions directly against the
live `server/domain.js` source text:

| Engine | Definitions found | Result |
|---|---|---|
| `postJournalEntry()` — the single GL writer | 1 | PASS |
| `reverseEntry()` — the single reversal engine | 1 | PASS |
| `applyClearing()` — the single clearing engine | 1 | PASS |
| `calcTax()` — the single tax calculation path | 1 | PASS |
| `withTransaction()` — the single transactional-boundary/rollback engine | 1 | PASS |
| `closeFinancialPeriod()` — the single period-control gate | 1 | PASS |

Every one of these engines was READ in full this pass (not just counted) — `reverseEntry()` is the one
that received this wave's 1 defensive fix (see `WAVE3_CHANGELOG.md`/`WAVE3_ASSET-RESULTS.md`); the guard
clause added is a new *branch inside* the same single function, not a second function, and it is placed
using the exact same idiom (`rejectReversal()`) every other guard in the function already uses.

## Financial Period Control — live re-confirmation

A real financial period (`2020-01-01`–`2020-01-31`) was created and closed
(`POST /api/financial-periods`, `POST /api/financial-periods/:id/close`) — succeeded for an authorized
role. Posting a document dated inside that now-closed period (`POST /api/journal/draft` +
`POST /api/journal/:id/post`, dated `2020-01-15`) by a non-override role was correctly BLOCKED. This is
the same, unmodified `assertProjectOpenForPosting`-adjacent period-control gate every prior wave's own
regression already exercises — re-run here as a fresh, independent live check, not a new mechanism.

## Tax (`calcTax`) — single-path re-confirmation

Source-confirmed: exactly one `calcTax(taxCode, baseAmount)` definition, called from every AR/AP invoice
drafting path (`draftCustomerInvoice()`, `draftSupplierInvoice()`, `draftSupplierInvoiceFromPO()`) and
nowhere re-derived independently. The 525-document stress-test suite
(`tests/erp_phase39_stress_test.js`, re-run fresh this pass — see `WAVE3_REGRESSION.md`) re-confirms
Output/Input GST reconcile exactly to their respective GL accounts across 105 Sales Invoices and 105
Supplier Bills, all computed through this same single `calcTax()` path.

## GL writer / reversal / clearing — invariant re-confirmation via full regression

Rather than re-deriving new assertions for these three engines in isolation, this pass relies on (and
re-ran) the exact suites that already exercise them exhaustively: `erp_059_transaction_contract_tests.js`
(6/6 — atomicity of invalid postings), `erp_phase38_e2e_trace_tests.js` (49/49, including "Trial Balance:
Total Debit = Total Credit after the full E2E run"), and the 525-document stress test's own Trial
Balance/AR/AP/GST reconciliation (all PASS). All re-run clean this pass — see `WAVE3_REGRESSION.md` for
the full tally.

## Conclusion

**PASS — every central accounting engine invariant re-confirmed singular and correct; Financial Period
Control, Tax, and GL/reversal/clearing all re-verified live and via full regression; the 1 defensive fix
to `reverseEntry()` is a new branch inside the existing single function, not a second engine.**
