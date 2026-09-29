# ARCH-2026-002 — Wave 3 Controlling / Management Accounting Audit

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §7-§9. Per this CR's own instruction, no dimension
(Department/Warehouse/Segment/Business Area) is assumed or invented — only dimensions actually present
in the current data model (Cost Centre, Profit Centre) are audited.

## 1. Cost Centre — real usage trace, not assumption

**Classification: TRANSACTION-LINKED (partially) + ACCOUNTING-POSTING-DIMENSION-CAPABLE (for 2 of ~13
posting paths audited) + REPORTING-CAPABLE (generic filter only, no purpose-built report). NOT fully
operational.**

| Function | Tags `costCentreId`? |
|---|---|
| `postProductionLabourCost` | **YES** — hardcoded `'CC-FACTORY'` (domain.js:6720) |
| `postInstallationLabourCost` | **YES** — hardcoded `'CC-INSTALLATION'` (domain.js:7038) |
| `draftCustomerInvoice` | NO |
| `draftSupplierInvoice`/`draftSupplierInvoiceFromPO` | NO |
| `recordProjectExpense` | NO |
| `recordLabourWages` | NO |
| `createGRN` | NO |
| `postCustomerReceipt` | NO |
| `postSupplierPayment` | NO |
| Fixed Asset functions (all 5) | NO |
| `createBankTransfer` | NO |
| Petty Cash (voucher/replenish) | NO |
| CSV Journal Import | YES, but free-text/user-supplied per import row — not system-derived |

`postJournalEntry()` validates any supplied `costCentreId` against `DB.costCentres` (existence check)
and normalizes it onto the line — **pass-through validation only, never derives or assigns one.**

**Reporting**: `generalLedger()` accepts a `costCentreId` filter and returns it per row, reading from
`allLines()`. One project-cost calculation filters `allLines()` by `costCentreId==='CC-INSTALLATION'`
specifically. **No purpose-built Cost-Centre report exists** — the 3 real Cross-Dimensional reports are
Vendor×Project, Project×Material, and Project×Variation; none is Cost-Centre-dimensioned.

**Bottom line**: any Cost-Centre-filtered view reflects only Production and Installation labour — the
overwhelming majority of GL-writing functions never populate it.

## 2. Profit Centre — real usage trace

**Classification: MASTER-DATA-ONLY.** This is the codebase's own explicit, disclosed classification
(`domain.js:10995-10998`), independently re-confirmed this pass, not an inference:

- Full CRUD exists (`createProfitCentre`, `domain.js:10999`), seeded **deliberately empty**
  (`domain.js:993`) — the function's own header comment states values are "management's to define, not
  invented here."
- `postJournalEntry()` validates any supplied `profitCentreId` (pass-through only, same as Cost Centre).
- **Zero business function anywhere tags a `profitCentreId`** on a GL line — confirmed by an exhaustive
  grep across every posting function named in this audit's own §4 list.
- **Branch has no `profitCentreId` field** — Profit Centre is not derivable from Branch, and no other
  derivation path exists either.
- `generalLedger()` does not expose or filter by `profitCentreId` at all — unlike Cost Centre, it lacks
  even the generic-filter capability.

## 3. Project Profitability — the actual formula, not the assumed one

**This is NOT a simple "Revenue − Material − Labour − Expenses" formula.** `projectPL()`
(`domain.js:3589`) is fully generic by GL account TYPE: `revenue` = every Income-type line tagged with
the project; `cost` = every Expense-type line tagged with the project. Because this is type-generic,
it automatically includes:

- **Fixed Asset Depreciation (account 5400)** — whenever `postAssetDepreciation()` tags its line with
  `projectId:asset.projectId` (confirmed, `domain.js:9818-9821`).
- **Job Work Inventory Adjustment (account 5300)** — whenever job-work consumption/loss postings carry
  a project's ID.

Neither is a named field in `projectFinancial360()`'s own response shape — **a reader looking only at
the visible field names would not realize depreciation/job-work amounts are already baked into the
top-line cost/profit figures.** This is a real reporting-clarity finding, not a calculation defect —
the underlying math correctly nets `debit − credit` (so reversals zero out correctly), and
`projectFinancial360()`'s own comment documents `cost.actual` as "the single authoritative cost formula"
after a past fix eliminated a competing, under-counting formula.

`projectFinancial360()` (`domain.js:8042`) keeps every component explicitly separate (never merges):
`contract` (quotation price + approved Change-Request revenue revisions), `revenue.postedRevenue` (the
generic sweep above), `revenue.ar`/`collected`/`outstanding` (from the real AR subledger, which
inherently reflects Credit/Debit Notes and reversals via the same GL mechanism), `manufacturing`/
`execution` (re-labeled SLICES of the same cost total, not additional figures), and both
`originalProjectMargin` (baseline) and `currentProjectMargin` (Change-Request-inclusive) are reported
side by side. Tax (1300/2200, outside Income/Expense types) and Advances (2100, a Liability account) are
correctly excluded from the sweep.

**No second project-profitability engine exists** — `coreProjectPL()` and `projectFinancial360()` both
compose on top of the same base `projectPL()` sweep, never re-derive independently.

## 4. Customer Profitability — accounting-derived, project-derived, and AR-subledger-derived

Composes `customerOpenItems()` (real AR subledger) with the project-level profitability sweep above for
every project belonging to that customer — not a separately-maintained calculation. Scope security
re-verified separately, see `ARCH-2026-002-WAVE-3-SECURITY-BASELINE.md`.

## 5. Budget / Commitment / Actual

Unchanged since the original Phase 0 audit — `createCommitmentFromPO()` creates commitments, reduced by
`createGRN()`, and Actuals flow via the same `projectPL()`/`projectFinancial360()` sweep audited in §3
above. No new bypass found this pass.

## 6. Conclusion

Controlling remains genuinely PARTIAL: Cost Centre is a real but narrow posting/reporting dimension;
Profit Centre is master-data-only with zero transaction usage; Project Profitability is a real, single,
well-composed engine with one disclosed reporting-clarity gap (depreciation/job-work costs not
separately labeled). No second Controlling engine, no invented dimension.
