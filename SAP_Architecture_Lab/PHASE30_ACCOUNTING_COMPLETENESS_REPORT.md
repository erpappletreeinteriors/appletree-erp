# PHASE 30 — ACCOUNTING COMPLETENESS & CONTROL CLOSURE

**Scope discipline:** controlled fix phase. Work confined to `SAP_Architecture_Lab/server/domain.js`, `server/server.js`, `client_secure/index.html`, plus one new permanent test file. Real ERP, offline ERP, and every prior frozen phase's report untouched. `PHASE30_CHECKPOINT/` taken before any change. Only temporary/demo data used throughout.

---

## 1. P29-1 Fix — Project 360 Actual Cost Inconsistency

**Root cause (confirmed in Phase 29):** `projectFinancial360()`'s `cost.actual` field recomputed its own formula — `r2(materialCost + labourCostAll)`, summing only accounts 5000/5100 by name — instead of reusing `coreProjectPL().cost`, which already sums every Expense-type account generically (and so already included Project Expense/5200 without any code change needed).

**Fix:** `cost.actual` and `cost.forecast` now directly reference `core.cost` (the same `coreProjectPL()` result the top-of-screen summary and Profitability section already use) instead of recomputing a second formula. There is now exactly **one** Project Actual Cost calculation in the entire codebase; every display of it is a reference to the same number, not a parallel computation.

**Tested**: material only, labour only, expense only (3 isolated fresh projects), material+labour+expense combined, and a reversal case (reversed a Project Expense mid-test and confirmed cost.actual correctly dropped back down) — all match the independently-calculated expected value exactly. Live-verified in the browser: the audit's original repro scenario (Material ₹63,300 + Labour ₹10,000 + Expense ₹2,000) now shows **₹75,300 everywhere on Project 360**, not two different numbers.

## 2. P29-2 Fix — Negative Material Issue

**Fix:** `createMaterialIssue()` now rejects `qty <= 0` before touching inventory, GL, or project cost — identical guard style to `createDamageReport()`'s existing `if(!qty || +qty<=0)`. No partial transaction: the rejection happens before `postInventoryMovement()` is ever called.

**Tested**: -5 rejected, 0 rejected, 0.001 (a valid tiny positive) still accepted, stock confirmed not to increase from any rejected attempt, excess-issue-over-available-stock still correctly blocked (existing policy untouched), and a genuinely valid positive issue still works exactly as before.

## 3. P29-3 Fix — Invalid Project ID

**Fix:** `GET /api/project-pl` now checks `projectId` is present (400 if missing) and that the project actually exists (404 if not) before ever calling `projectPL()`. A nonexistent project can no longer masquerade as a real, zero-profit project.

**Tested**: valid project (200, real figures), invalid project (404), missing projectId (400).

## 4. Balance Sheet

New `companyBalanceSheet()` — derives exclusively from `allLines()`, the same flattened central-journal view every other report already uses. Classification is by each account's own configured `type` (Asset/Liability/Income/Expense — the only types this Lab's Chart of Accounts has ever had; no Equity type exists, and none was invented). Current vs. Non-current Asset split uses the two accounts unambiguously identifiable as non-current (1400 Fixed Assets, 1450 Accumulated Depreciation); every other Asset is Current. **Equity = Retained Earnings (cumulative Income − Expense since inception)**, disclosed explicitly as such — no Capital/Contributed-Equity account has ever been configured for Appletree, and none was invented; the screen states plainly that this is a policy gap, not a completed model.

**The identity Assets = Liabilities + Equity is mathematically guaranteed**, not merely tested into passing: since `postJournalEntry()` already enforces total-debit = total-credit on every single posting, and every account is exactly one of the four known types, `Assets_net = Liabilities_net + (Income_net − Expense_net)` follows directly — proven correct by construction, then confirmed live (`balanced:true`, `difference:0`) and via the permanent regression suite.

Unmapped-account handling: any account whose `type` isn't one of the four known values would appear in a separate `unmappedAccounts` array rather than being silently dropped — currently empty, since every account in this Lab's CoA is properly typed.

## 5. Company Profit & Loss

New `companyProfitAndLoss({fromDate, toDate})` — the exact same generic "sum every Income/Expense-type account" technique `projectPL()` already used per-project, applied without a project filter. Supports From/To date range. **Retained Earnings on the Balance Sheet exactly equals Net Profit on the Company P&L** — verified live (both showed ₹-15,802.80 in the walkthrough) and in the permanent regression suite, since both derive from the identical underlying account totals.

## 6. General Ledger Drill-Down

New `generalLedger({account, fromDate, toDate, projectId, costCentreId, party, docCategory})` — filters `allLines()`, sorts chronologically, computes a running balance. Not a second ledger: every row is a direct read of an already-posted line. The UI's voucher column links straight into the existing Document Viewer (`openDoc()`), so Source → Journal → Ledger tracing works end-to-end. Live-verified: filtering by account 2050 (GR/IR Clearing) showed exactly the two GRNs posted during setup, running balance ending at the exact figure the Balance Sheet independently shows for that same account.

## 7-8. Customer Ledger / Supplier Ledger

`customerLedger(customerId)` / `supplierLedger(vendorId)` — both are `generalLedger()` filtered to the AR (1100) or AP (2000) control account plus that party, with a `reconciles` flag comparing the ledger's own closing balance against the existing `customerOpenItems()`/`supplierOpenItems()` subledger total. Since both read the identical underlying GL lines (just organized differently — chronological vs. per-invoice), they are guaranteed to agree; live-tested with a partial payment (Invoice ₹20,000, Receipt ₹12,000) and confirmed `MATCHES` at the correct ₹8,000 remaining balance. Invalid customer/vendor IDs return 404, not a fabricated empty ledger (same discipline as the P29-3 fix).

## 9. Chart of Accounts UI

New screen over the already-existing `createAccountMaster()`/`/api/masters/account` (unmodified) plus the already-existing `/api/accounts` GET. Admin/CEO (masterData tier) only — Accountant confirmed live-denied from creating an account, but still able to view the list read-only. No edit/deactivate of an existing account is exposed — new accounts only, so no posted history can ever be silently reclassified.

## 10. Cost Centre UI

New screen over the already-existing `createCostCentreMaster()`/`/api/masters/cost-centre` (unmodified) plus the already-existing `/api/cost-centres` GET. Same masterData gate; Accountant confirmed live-denied. Does not force Cost Centres onto document types that don't already use them.

## 11. Users & Roles UI

New screen over the already-existing `createUser()`. **Found and fixed a genuine duplicate-route bug while building this**: an `/api/admin/users` GET route already existed from an earlier phase (missed by this phase's own initial search), and a second, near-identical route was almost added on top of it — since Node's request handler matches top-to-bottom, the new one would have been permanently unreachable dead code. Caught immediately via a live browser test (`Cannot read properties of undefined (reading 'map')`, because the pre-existing route's response lacked the `roles` field the new UI needed), root-caused, and fixed by extending the **one** pre-existing route rather than leaving two. Never exposes `passwordHash`/`passwordSalt` — verified by string-scanning the actual API response in the permanent test suite. Admin/CEO only; Accountant confirmed live-denied both viewing and creating.

## 12. Customer Advance UI

New screen over the already-existing, completely unmodified `draftCustomerAdvance()`/`/api/advances` (Dr Bank 1000 / Cr Customer Advance Liability 2100) plus the existing `/api/projects/:id/financial-readiness`. No new accounting treatment invented. Applying/clearing an advance against a specific later invoice has no dedicated automatic function in this codebase — the screen honestly says so and directs the accountant to a manual Journal Entry (Dr 2100/Cr AR) for that step, rather than inventing a new mechanism.

## 13-14. Reconciliation (Parts 13-14)

All performed live after the full test scenario: Trial Balance debit=credit; Company P&L income/expense figures trace to the identical Trial Balance account totals (same source); Balance Sheet Assets = Liabilities + Equity (₹0.00 difference); AR subledger = AR control account (Customer Ledger `reconciles:true`); AP subledger = AP control account (Supplier Ledger `reconciles:true`); Project P&L now consistent with Project 360 everywhere (P29-1 fix).

## 15. SAP-Style Accountant Journal

Unchanged and reconfirmed — every posted document still carries Document Date, Posting Date, Due Date, Voucher Number, Category, Origin, Party, Remarks, and per-line Account/Debit/Credit/Project/Cost Centre/Tax, with the new General Ledger providing an additional, faster path into the same Document Viewer.

## 16. Security

1,089/1,089 security matrix re-confirmed unchanged (no new role permissions were added or altered — every new screen reuses an existing permission tier: `isGLVisible` for the read-only reports, `masterData` for COA/Cost Centre/Users). Live-verified: Accountant blocked from creating a GL account, a Cost Centre, or a user, and blocked from viewing the Users list at all — while still able to view Balance Sheet/General Ledger (a GL-visible role). ID tampering on the new ledger endpoints (invalid customer/vendor ID) returns clean 404s, not crashes or empty-but-plausible fabrications.

## 17. Negative Testing

Covered as part of the P29-2 fix testing (negative/zero/excess quantity) and the P29-3 fix testing (invalid/missing project ID) above, plus the security spot-checks in §16 (unauthorized COA/Cost Centre/User changes). All controlled rejections, no partial postings, no GL corruption.

## 18-19. Full Integrated Test + Independent Calculation

Run as part of the permanent regression suite (`phase30_accounting_completeness_tests.js`): PO→GRN→Material Issue→Labour→Project Expense→Customer Invoice→Partial Receipt, then Balance Sheet/Company P&L/General Ledger/Customer Ledger all generated and cross-checked against each other and against hand-calculated expectations. Every figure matched: Balance Sheet Retained Earnings = Company P&L Net Profit = -₹15,802.80 (a project deliberately left with more cost posted than revenue collected, to prove the identity holds even for a loss-making scenario, not just a profitable one).

## 20-21. Regression & Permanent Tests

**1,023/1,023 PASS, 0 FAIL** across the complete suite (35 files: every pre-Phase-30 test unchanged and still passing — including all 58 of Phase 29's own integration assertions, now all green since the fixes close the 2 that were deliberately failing — plus the new 40) + **1,089/1,089 security matrix**. New permanent file: `server/phase30_accounting_completeness_tests.js` (40 tests) covering every item in Part 21's list exactly.

## 22. Accountant Walkthrough

Performed live in the browser as `finance1`. Balance Sheet, Company P&L, General Ledger (filtered to account 2050), and Customer Ledger (with a partial-payment trace) were all opened and read without any technical assistance — every number was traceable, and cross-screen consistency was directly observed (Balance Sheet liability for 2050 matched General Ledger's closing balance for the same account exactly; Company P&L Net Profit matched Balance Sheet Retained Earnings exactly). No CONFUSING or FAIL results this pass — the specific inconsistency that produced a CONFUSING result in Phase 29 (Finding P29-1) is now fixed and re-verified.

## 23. No Policy Invention

No new policy was invented this phase. The Balance Sheet's Equity section explicitly states its own limitation (no configured Capital account) as `BUSINESS POLICY REQUIRED` rather than assuming one. Vendor Rating's weighting and Product Costing's 15% default (from Phase 28) remain unchanged and correctly labeled.

## 24. Architecture Check

`grep -c "DB.journalEntries.push"` = **1** (unchanged). `postJournalEntry(` mention count is 30 (up from Phase 29's 27 — the increase is entirely this phase's own explanatory code comments referencing the function by name in the new Balance Sheet code, not a new call site; Balance Sheet/Company P&L/General Ledger/Customer Ledger/Supplier Ledger are all **read-only** and never post). No parallel accounting engine exists anywhere in the new code — every new report reads `allLines()`, the same flattened view of the single central journal every pre-existing report already used.

## 25. Final Decision

## **A — READY FOR REAL APPLETREE ACCOUNTANT UAT**

All three of Phase 29's confirmed defects are fixed, tested, and re-verified live. The four major reporting gaps Phase 29 found (no Balance Sheet, no Company P&L, no General Ledger drill-down, no Customer/Supplier Ledger) are closed, all derived from the single central journal with no parallel engine. The three "backend exists, no UI" gaps most relevant to an accountant's daily work (Chart of Accounts, Cost Centre, Customer Advance) are closed; Users & Roles (an Admin, not accountant, concern) is also closed, and a real duplicate-route bug was caught and fixed in the process. Every reconciliation identity (Balance Sheet, Company P&L, AR, AP, Project P&L) was verified to hold both by live testing and by mathematical construction, not by coincidence. 1,023/1,023 regression and 1,089/1,089 security both hold. This is not a claim of production readiness — real Appletree master data, real users, real infrastructure, real migration, and management sign-off all remain genuinely pending, as they have every phase — but the technical, accounting-completeness bar this phase exists to clear has been cleared.

## Remaining Gaps (disclosed, not built this phase — correctly out of scope)

- Cash Flow Statement/Forecast, Budget vs Actual, Cost vs Payment, Day Book/Voucher Register (functionally similar to Journal Register but not identical), Accounting Exceptions register, Item/Vendor Master browse-and-edit screens, Estimation Dashboard/Costing Masters/Costing Reports, KPI Dashboard, Report Builder — all genuinely absent, none invented, all previously disclosed in the Phase 29 coverage matrix and unchanged by this phase's narrower scope.
- HR/Payroll remains entirely out of scope, as it has every phase.

---

*Real ERP, offline ERP, and every prior frozen phase's code confirmed untouched throughout.*
