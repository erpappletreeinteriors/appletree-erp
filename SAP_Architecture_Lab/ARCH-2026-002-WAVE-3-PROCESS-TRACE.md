# ARCH-2026-002 — Wave 3 Process Trace

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §6. Traces Record-to-Report per source transaction
type, per this CR's own §6 list.

## Record-to-Report: Transaction → Subledger → Journal → GL → Trial Balance → Financial Statements → Management Reporting

| Source transaction | Chain | Verdict |
|---|---|---|
| Sales Invoice (Customer Invoice) | `draftCustomerInvoice`→draft lifecycle→`postJournalEntry`→`allLines()`→`periodTrialBalance`/`companyProfitAndLoss`→`accountantMisSummary` | **WORKING** |
| Customer Receipt | `postCustomerReceipt`→`postJournalEntry`+`applyClearing`→same chain | **WORKING** |
| Supplier Bill | `draftSupplierInvoice[FromPO]`→draft lifecycle→`postJournalEntry`→same chain | **WORKING** |
| Supplier Payment | `postSupplierPayment`→`postJournalEntry`+`applyClearing`→same chain | **WORKING** |
| Journal Voucher | `createDraft`→...→`postJournalEntry`→same chain | **WORKING** |
| Credit/Debit Note | draft lifecycle→`postJournalEntry`+`applyClearing`→same chain | **WORKING** |
| Fixed Asset | `capitalizeFixedAsset`/`postAssetDepreciation`/`disposeFixedAsset`→`postJournalEntry`→`companyBalanceSheet` (1400/1450 classified `BALANCE_SHEET_NON_CURRENT_ASSET_IDS`)→`reconcileFixedAssets` | **WORKING** |
| Bank Reconciliation | `postBankImportLine`→`postJournalEntry`→same chain; reconciliation itself compares against `allLines()`-derived `erpBankBalance` | **WORKING** |
| Tax (GST/TDS) | `calcTax()`/`computeTDS()`→embedded in the parent document's `postJournalEntry` lines→1300/2200 accounts→Trial Balance/Compliance reports | **WORKING** |
| Project Cost | Every cost-posting function tags `projectId`→`projectPL`/`projectFinancial360` (generic Income/Expense sweep)→Management MIS | **WORKING**, with the disclosed depreciation/job-work labeling gap noted in the Controlling Audit |
| Inventory | `postInventoryMovement`→Moving-Average valuation→GRN's `postJournalEntry` (1200)→same chain | **WORKING** (re-confirmed, Wave 3 does not touch inventory) |
| Production | `postProductionLabourCost`→`postJournalEntry` (CC-FACTORY tagged)→`jobCostSheet`/`generalLedger` (Cost-Centre-filterable) | **WORKING** |
| Job Work | Scrap write-off→`postJournalEntry`; dispatch/return/direct-dispatch are inventory-only, no GL effect by design | **WORKING** |

## Invariant re-verification (this CR's own §6 list)

| Invariant | Result |
|---|---|
| Debits = Credits | **PASS** — `erp_phase39_stress_test.js` re-run this pass, 11/11, 525-document batch |
| AR control = AR subledger | **PASS** — same suite |
| AP control = AP subledger | **PASS** — same suite |
| Inventory accounting = inventory subledger | **PASS** — unchanged, Wave 3 does not touch inventory |
| Tax accounting = tax subledger | **PASS** — same suite (Output/Input GST reconciliation) |
| Project actuals = accounting source transactions | **PASS** — `projectFinancial360`'s own structural claim ("no reconciliation drift is structurally possible") re-confirmed by the Central Accounting Audit |

## Conclusion

Every Wave 3 transaction type traces cleanly from source document to financial statement through the
single GL engine. No chain is BROKEN, PARTIAL, or ABSENT. The one disclosed nuance (depreciation/job-work
costs folded into project cost without a separate label) is a reporting-clarity finding, not a
Record-to-Report chain defect — the underlying numbers are correct and traceable, just not individually
named in the API response shape.
