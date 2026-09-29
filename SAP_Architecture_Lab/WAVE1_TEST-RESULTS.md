# WAVE1_TEST-RESULTS.md

**Date:** 2026-09-22. Dedicated Wave 1 test suite results, per this CR's own §16 (minimum layers A-N).
Suite: `tests/erp_arch_2026_002_wave1_tests.js` — self-contained (spawns its own isolated scratch server,
own random port/DB path, restarts itself once for the migration test), never touches
`server/db.json`. **Result: 42 PASS / 0 FAIL / 42 TOTAL.**

## Layer coverage

| Layer (this CR's §16) | Covered by | Assertions |
|---|---|---|
| A. Unit / B. Domain-service | `parseGenericBankCsv` output shape (via its observable effect: correct line fields after import), `hasScopeAccess()` reuse (via observable filtering) | throughout |
| C. API | Every assertion is a real HTTP call through `fetch()` against a live server — no in-process function calls | all 42 |
| D. RBAC | Sales blocked from legacy import (403), Sales blocked from unified import (403) | Part 7 |
| E. Data scope | pm1 sees only assigned projects; pm1 blocked from a foreign project's data; CEO/FinanceManager unaffected | Part 1 |
| F. SoD | Not directly applicable to either Wave 1 item (neither introduces a new maker-checker scenario); the JE used as a matching target in Part 4 was itself created/approved/posted through the EXISTING SoD-gated `/api/journal/draft`→submit→approve→post chain (draft creator finance1 could not self-approve; ceo approved instead) — an incidental re-confirmation the existing SoD gate is unaffected | Part 4 setup |
| G. Approval | N/A — neither Wave 1 item adds a new approval-authority transaction type | — |
| H. Audit | `LegacyBankStatementLinesMigrated` and `BankImportBatchCreated` events confirmed present in the real audit log | Part 10 |
| I. Accounting invariants | Allocation of a generic-imported line posts a real, correctly-signed GL entry through `postJournalEntry()`; bank balance moves by exactly the allocated amount; Trial Balance remains balanced afterward | Part 5 |
| J. Inventory invariants | N/A — neither Wave 1 item touches inventory | — |
| K. Browser UAT | See `WAVE1_BROWSER-UAT.md` (separate, real rendered-screen verification) | — |
| L. Regression suite | Full existing battery re-run — see `WAVE1_REGRESSION.md` | — |
| M. Concurrency | 2 simultaneous imports of the identical generic CSV produce exactly 1 Imported + 1 Duplicate, never 2 Imported | Part 8 |
| N. Negative/security | Malformed CSV rejected; unauthorized roles blocked on both API surfaces; migration endpoint blocked for non-Admin/CEO; missing authentication rejected | Parts 1, 3, 7 |

## Per-workflow valid/invalid/unauthorized/concurrent/historical/audit coverage

| Workflow | Valid path | Invalid path | Unauthorized role | Wrong scope | Concurrent | Historical record | Audit trail |
|---|---|---|---|---|---|---|---|
| Budget Variance report | ✅ (pm1 own project, CEO all) | N/A (read-only, no invalid-input case) | N/A (role-gated at route, unchanged, not re-tested this pass) | ✅ (pm1 foreign project) | N/A | N/A | N/A (reads unaudited, existing convention) |
| Legacy (generic) bank import | ✅ | ✅ (malformed CSV rejected) | ✅ (Sales blocked) | N/A (bank-account-level, no project/customer scope dimension) | ✅ (race-safe duplicate detection) | N/A (this IS new data, not historical) | ✅ (`BankImportBatchCreated`) |
| Legacy match/unmatch | ✅ (one-step Reconciled, then unmatch) | ✅ (covered by the underlying `matchBankImportLine`'s own amount-mismatch/status guards, unchanged, re-confirmed by the full regression battery's `erp_phase39_banking_tests.js`) | (unchanged gate, re-confirmed by regression) | N/A | N/A | N/A | ✅ (existing `logAudit()` calls preserved) |
| ICICI import (regression) | ✅ | (unchanged, covered by `erp_phase39_banking_tests.js`) | (unchanged) | N/A | N/A | N/A | ✅ |
| GL allocation of a generic line | ✅ | (unchanged guard: already-Posted/Duplicate/Excluded lines rejected, inherited from the unified engine, unchanged) | (unchanged `can(actor,'clear')`/`assertCanPostBankImportLine`) | N/A | N/A | N/A | ✅ (`BankImportLinePosted`) |
| Historical migration | ✅ (2 records migrated correctly) | N/A (nothing to reject — the function is additive by construction) | ✅ (FinanceManager blocked, Admin/CEO-only) | N/A | (not separately race-tested — a single admin-triggered action, not a high-concurrency path) | ✅ (this IS the historical-record test — amount/status/matchedEntryId preserved exactly) | ✅ (`LegacyBankStatementLinesMigrated`) + idempotency (2nd run migrates 0) |

## Full console output summary

```
===== TOTAL: 42 PASS / 0 FAIL / 42 TOTAL =====
```

All 42 lines individually itemized in the suite's own console output (re-run available via
`node tests/erp_arch_2026_002_wave1_tests.js`). Production `server/db.json` hash confirmed unchanged
across the entire run (the suite's own final teardown assertion).
