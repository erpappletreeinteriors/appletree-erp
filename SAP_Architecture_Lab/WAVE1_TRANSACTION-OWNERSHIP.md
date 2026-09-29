# WAVE1_TRANSACTION-OWNERSHIP.md

**Date:** 2026-09-22. Post-implementation re-verification of `ARCH-2026-002-TRANSACTION-OWNERSHIP.md`
(the Phase 0 audit of all 35 transaction types). Confirms the ONE real duplicate found in Phase 0 is
now closed, and that no other transaction type's ownership changed as a side effect of this Wave 1 pass.

## Bank Reconciliation — CLOSED

| | Phase 0 (before) | Wave 1 (after) |
|---|---|---|
| Authoritative engine | 2 parallel, independent subsystems (`bankStatementLines` legacy, `bankImportLines` newer) | **1** — `bankImportLines` + its function family |
| Creating function(s) | `importBankStatement()` (own writer) + `createBankImportBatch()` (own writer) | `createBankImportBatch()` only — `importBankStatement()` is now a thin wrapper delegating to it with `format:'GENERIC'` |
| Match/reconcile function(s) | `matchBankStatementLine()`/`unmatchBankStatementLine()` (own logic) + `matchBankImportLine()`/`unmatchBankImportLine()`/`reconcileBankImportLine()` (own logic) | The unified functions only — the legacy names are now thin wrappers |
| GL-allocation capability | Newer engine only (`postBankImportLine()`) — legacy engine could never post a new GL entry from an unmatched line | **Both** formats now reach the same single `postBankImportLine()` — a real capability gain for generic-format lines, not a regression |
| Data | 2 disjoint collections | 1 collection (`bankImportLines`); `bankStatementLines` retained as a frozen, read-only historical archive, migrated in additively |
| Duplicate/Conflict? | **YES** (Phase 0 finding) | **NO** — one authoritative engine, confirmed by `tests/erp_arch_2026_002_wave1_tests.js` Part 4's cross-engine consistency assertion (the same line viewed through both API surfaces shows the same status) |
| Status | EXISTING (both, in parallel — itself the defect) | **EXISTING, CONSOLIDATED** |

## All other 34 transaction types — re-confirmed unchanged

Re-checked against `ARCH-2026-002-TRANSACTION-OWNERSHIP.md`'s full table: no other transaction type's
creating function, approving function, or authoritative module changed. The full regression battery
(`WAVE1_REGRESSION.md`) — covering Lead, Quotation, PO, GRN, Supplier Bill, Payment Request, Customer
Invoice/Receipt, Material Issue, Production Order, Job Card, Job Work Dispatch/Return, QC, Fixed Asset,
and more — passed at its exact pre-Wave-1 baseline, confirming no incidental ownership drift.

## Reporting & Analytics note

`projectBudgetVarianceReport()` is a read-only report function, not a transaction-creating function —
it was not and is not part of the Transaction Ownership Matrix's 35-row scope. Its Wave 1 change (scope
filtering) is tracked in `WAVE1_CHANGELOG.md` §1, not here.
