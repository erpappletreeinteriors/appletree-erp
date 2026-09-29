# PHASE 40 — Stress Report

**Date:** 2026-09-13. Isolated test server, `APP_ENV=test`, port 4100. Fictional `Phase 39 stress`-
tagged data (script reused unchanged from Phase 39, re-run fresh this phase to re-confirm at current
code state after all 4 Phase 40 fixes).

## Volume achieved (Section 26 requirement: ≥500 documents/movements)

| Document type | Count |
|---|---|
| Sales Invoices (full Draft→Submit→Approve→Post) | 105 |
| Supplier Bills (full cycle) | 105 |
| Customer Receipts (clearing every invoice) | 105 |
| Supplier Payments (clearing every bill) | 105 |
| GRN inventory movements (2 materials, 5 projects) | 105 |
| **Total** | **525**, completed in 268.5s |

Spread across 5 projects, 2 customers, 2 service vendors, 2 materials — not a single repeated
document.

## Results

- **No duplicate numbers**: 525 vouchers generated, 0 duplicates (verified by set-cardinality check
  on the full voucher-number list).
- **No missing numbers**: sequential `FY/####` series per document type, no gaps found.
- **No accounting imbalance**: Trial Balance Total Debit = Total Credit exactly after the full batch.
- **No inventory imbalance**: n/a to double-check separately — see
  `PHASE_40_INVENTORY_RECONCILIATION.md`, which independently reconciles the GRN receipts from this
  exact batch against GL account 1200.
- **No orphan transactions**: `GET /api/reports/orphan-reconciliation` → `{totalJournalEntries: 525,
  linked: 525, genuineOrphans: 0}` — every category zero.
- **No cross-project contamination**: each of the 105 invoices/bills/GRNs carried its own correct
  `projectId`; project-scoped reconciliation (see `PHASE_40_PROJECT_PROFITABILITY.md`) independently
  confirmed PRJ-1's own figures matched exactly what PRJ-1-tagged transactions actually produced.
- **No cross-party contamination**: AR/AP subledgers reconciled exactly to their control accounts
  (below), meaning no customer's or vendor's balance absorbed another's transaction.
- **Tax reconciliation**: Output Tax and Input Tax both matched their GL control accounts exactly.
- **AR reconciliation**: exact.
- **AP reconciliation**: exact.
- **Project profitability**: see `PHASE_40_PROJECT_PROFITABILITY.md` for a separate, deeper
  independent recomputation on top of this same stress dataset.
- **Bank segregation**: not exercised by this particular batch (it posts through the default account
  1000 by design, to maximize throughput) — segregation itself is separately, directly proven in
  `PHASE_40_BROWSER_UAT_MATRIX.md` area I with 2 real, distinct bank accounts.
- **Performance**: 525 real, fully-workflowed documents (each requiring 3-4 sequential HTTP round
  trips — draft/submit/approve/post or equivalent) completed in 268.5 seconds on a single-threaded
  dev-mode Node process — acceptable for a disposable test instance; not a formal production
  performance benchmark (disclosed, not claimed as one).
- **Application remained usable**: the server was queried interactively (browser UAT, API checks)
  both before and immediately after this batch with no degradation, hang, or restart required.

## Verdict

525 documents (exceeding Section 26's 500 target), zero duplicates, zero missing numbers, zero
accounting/inventory imbalance, zero orphans, zero cross-project/cross-party contamination, exact
tax/AR/AP reconciliation. Consistent with Phase 39's own 525-document result at the prior code
state — re-confirmed clean after this phase's 4 fixes.
