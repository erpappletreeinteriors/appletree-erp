# PHASE 38 — Report Reconciliation

**Date:** 2026-09-11. Compares source transactions against reports, live, on the disposable
isolated server used throughout this phase.

| Report | Source of Truth | Calculation | Date Basis | Status Basis | GL Basis | Subledger Basis | Reconciled this phase? |
|---|---|---|---|---|---|---|---|
| Trial Balance | `server.js:810-815` inline route handler | Real `reduce()` sum of debit/credit by account across `D.allLines()` | All dates | Posted only | Direct GL | N/A | **YES** — 779,620=779,620 post-E2E; 799,674.1=799,674.1 post-stress; 110-document delta arithmetic confirmed exactly |
| Project Cost Breakdown | `projectCostBreakdown()` | 5 separately-derived figures (committed/received/invoiced/paid/consumed), each from a different source collection (`purchaseOrders`, `grns`, GL lines, `clearings`, Material Issue GL lines) | Not period-scoped (project-lifetime) | Mixed per field | Partial (consumed/paid derive from GL; committed/received/invoiced derive from document status) | N/A | **YES** — all 5 fields reconciled to the rupee against known transactions (see `PHASE38_PROJECT_PROFITABILITY_RECONCILIATION.md`) |
| Project P&L | `projectPL()` | Sums Income-type and Expense-type GL lines filtered by `projectId` | All dates | Posted only (correctly includes both a reversed original and its reversal, netting to zero) | Direct GL | N/A | **YES** — reconciled exactly, including correct handling of one deliberately-reversed test document |
| AR/AP/Output-Tax/Input-Tax/Customer-Advance Reconciliation | `reconcileAR()`/`reconcileAP()`/`reconcileOutputTax()`/`reconcileInputTax()`/`reconcileCustomerAdvances()` | Subledger detail sum vs. control-account GL balance, independently computed two ways | All dates | Open items only (subledger side) | Direct GL (control side) | `customerOpenItems()`/`supplierOpenItems()` | **YES** — all 5 checks `matches:true`, `nonSubledgerLines/nonSourceLines:0` |
| Purchase Order list / GRN linkage | `/api/purchase-orders` | Live document status field, not a separate calculation | Real-time | Reflects actual GRN receipt status | N/A (document status, not GL) | N/A | **YES** — browser-verified: PO-0001 shows `FullyReceived`, 2 linked GRNs, matching the API-driven test exactly |
| Dashboard AR/AP Outstanding + Trial Balance tile | Client-side fetch of the same `/api/reconciliation`/`/api/trial-balance` endpoints | No independent calculation — reads the same reconciled API | Real-time | N/A | Direct | Direct | **YES** — browser-verified exact match to the API figures |

## Reports NOT independently reconciled this phase (disclosed)

General Ledger (account-filtered view — used as a data source for this phase's own reconciliation
work, but its own row-count/filter completeness was not separately audited), Balance Sheet, Company
Profit & Loss, Customer/Supplier Ledger, AR/AP Ageing, Bank Reconciliation, Stock Report, Movement
Ledger, Fixed Assets Register, TDS Reporting, GST-related compliance reports, Management MIS, the
full `ACCT_QUICK_REPORTS` catalog (27+ named reports, catalogued by Phase 37 but not individually
re-verified against their underlying computation by either phase). This is the same disclosed gap
noted in the Scorecard's "Reports" domain — representative depth, not exhaustive, this phase.

## No report found recreating accounting logic independently

Every report/screen checked this phase (Trial Balance, Project Cost Breakdown, Project P&L,
Reconciliation, Dashboard tiles, Purchase Orders list) was confirmed to derive from the SAME
underlying GL/document data the transaction-posting functions themselves write — no case was found
this phase of a report maintaining its own, potentially-divergent recalculation of a figure another
part of the system already computed authoritatively.
