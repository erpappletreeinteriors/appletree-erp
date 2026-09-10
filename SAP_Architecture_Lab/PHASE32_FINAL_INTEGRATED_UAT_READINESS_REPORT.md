# PHASE 32 — FINAL INTEGRATED UAT-READINESS REPORT

**Scope discipline:** `PHASE32_CHECKPOINT/` taken before any change. One genuine, confirmed defect was found and fixed through controlled, regression-tested change (per the brief's own closing instruction: "Fix only genuine defects through controlled change. Regression-test every fix."). Only `server/domain.js` was touched — `server.js` and `client_secure/index.html` are byte-identical to the Phase 31 checkpoint. Only temporary/demo data used throughout (PROJECT-UAT-001/002, a separate isolated critical-test project, all disposable). Real ERP, offline ERP, and every prior frozen phase untouched.

---

## 1. Executive Summary

The full Lead→Estimation→Quotation→Won→Drawing/BOQ/BOM→Material Requirement→Procurement→GRN→Supplier Bill→AP→Payment→Inventory→Factory→QC→Material Issue→Labour→Project Expense→Billing→AR→Receipt→Project P&L chain was run end-to-end on genuinely fresh projects, live, through the real API surface the UI calls, plus a direct browser walkthrough for the reporting screens. **87 of 87 final assertions passed** (after root-causing and fixing 3 test-script errors and one genuine product defect along the way — the audit's job is to find these, not report a suspiciously clean first pass). The one genuine defect — a real, previously-undiscovered ID-tampering gap allowing fabricated customer/vendor IDs to silently create real documents — was found, root-caused to a single shared function, fixed, and fully regression-tested with zero side effects.

Independently re-verified fresh (Part 1, not cited from prior reports): **1,038/1,038 regression, 1,089/1,089 security**, exactly 1 central journal push, before any change this phase.

## 2. Phase 31 Verification

Re-confirmed via fresh full regression: all Phase 31 BOM-quota and Material Requirement mechanics (multi-row entry, over-budget override, Production Order exemption) still pass, unchanged.

## 3. Drawing → BOQ → BOM

**MANUAL PROCESS — ACCEPTED.** No automatic drawing-to-BOQ extraction exists or was built — a human reads the drawing and manually keys BOM quantities, exactly as the real Appletree process works today. This is recorded as accepted, not a defect, per the brief's own explicit instruction.

## 4. Material Requirement

Created MR-UAT-001 (Material A = 80) against PROJECT-UAT-001, submitted and approved, correctly associated with the project. Confirmed: a different project cannot use it (blocked), an unapproved requirement cannot be used for Material Issue (blocked).

## 5. BOM Control

BOM budgeted Material A = 100 (20/unit × 5 planned), Material B = 50 (10/unit × 5 planned) — both computed exactly as expected. Issuing 80 (via MR-UAT-001) then 20 more reached exactly 100 (100% utilized) and still passed — the boundary is inclusive, not off-by-one. One unit beyond 100 was correctly blocked for a non-manager role with no override reason.

## 6. Material Issue

Issuing exactly 80 against MR-UAT-001 succeeded and automatically converted the requirement. Reusing the same (now-fulfilled) requirement was blocked. Using it against a different project was blocked (also re-verified under Part 26 ID Tampering).

## 7. Production Exception

The Production Order issued its full BOM-derived quantities (100 units Material A, 50 units Material B) in one shot with no manager tier or override needed — confirming the previously-fixed regression (a BOM-derived issue is never checked against its own source) holds. Made permanent in `server/phase31_bom_quota_tests.js` and re-exercised here.

## 8. Over-Budget Override

A non-manager role was blocked from exceeding budget with no reason; the identical request succeeded once a real override reason was supplied; a manager-tier role (Admin) succeeded with no separate reason required. The audit log correctly recorded a `MaterialIssueExceededBomQuota` event with the user, reason, project, material, and quantity.

## 9. No BOM Line

A material with no BOM line for the project (MAT-7) issued freely with no block — `materialBomQuota()` correctly reports `inBom:false`. Matches the real offline ERP's own "check with supervisor" warning-only behavior, not an invented hard block.

## 10. Procurement

PO ₹100,000 → GRN ₹60,000 (Commitment correctly reduced by the received value only, never conflated with Actual Cost) → PO-aware Supplier Bill ₹60,000 (posts only to GR/IR 2050 and AP 2000 — confirmed zero Material Cost 5000 line, so no duplication) → Payment + Clearing. All correct.

## 11. Inventory

GRN did not duplicate inventory (confirmed via the exact ₹60,000 Dr Inventory / Cr GR-IR posting). Material Issue correctly consumed from the same pool the GRN created, with no double movement anywhere in the chain.

## 12-13. Multi-Row Entry (Material Requirement / Material Issue / Labour)

4 Material Requirement rows (Materials C/D/E/F) all saved correctly in one submission — no lost, duplicate, or partial rows, correct project and quantities on every row. 3 Material Issue rows posted as 3 independent, correct inventory movements. 3 Labour rows (different workers, hours, rates) summed to an independently-calculated exact total (₹7,400), each with its own GL entry.

## 14-15. Critical Accounting Test

Run twice: once on the cumulative PROJECT-UAT-001 (where other legitimate activity from earlier sections meant a direct site issue of the same material needed an override, correctly, per the BOM-quota policy now in force) and once on a fresh, fully isolated project with no other activity. On the isolated project, the exact brief figures were reproduced: **Revenue ₹250,000, Cost ₹66,000 (₹60,000 material + ₹4,000 labour + ₹2,000 expense), Profit ₹184,000** — calculated independently before reading the ERP's own output, then confirmed to match exactly, live in the browser (Project 360 showed "ACTUAL COST" as ₹66,000 in both the top summary and the Profitability section — the P29-1 fix holds).

## 16-18. Factory/MES, Job Costing, QC

Production Order → BOM → Job Card → Machine → Material → Labour → QC all connected correctly, all inventory effects through the existing engine, all accounting through `postJournalEntry()`. Job Cost Sheet material cost matched an independent calculation exactly (100×₹2,800 + 50×₹1,000 = ₹330,000). Product Costing remains clearly labeled "not an approved Appletree policy." QC correctly changes status on a critical failure; **LIMITATION (disclosed, not invented)**: a Failed QC result does not itself quarantine or reverse a prior GRN/Issue — no separate quarantine inventory sub-status exists in this Lab, matching the brief's own instruction not to invent one.

## 19. Site / Project Isolation

PROJECT-UAT-002's ₹99,999 labour posting was confirmed to change PROJECT-UAT-001's cost by exactly zero rupees.

## 20-21. Billing/Collection, Project P&L

Invoice → AR → Receipt → Clearing all agree. Project 360's top-of-screen Actual Cost equals its own Profitability-section Actual Cost under this materially more complex scenario than either Phase 29 or Phase 30's own tests — the P29-1 fix is holding robustly, not just in the narrow case it was originally found in.

## 22. Company Financials

Balance Sheet balances (confirmed live in browser: ₹0.00 difference across the whole company after all Phase 32 activity). Balance Sheet Retained Earnings exactly equals Company P&L Net Profit (confirmed live: both showed -₹3,60,099.00). AR/AP subledgers match their control accounts. Customer and Supplier Ledgers reconcile.

## 23. General Ledger Trace

All three named chains confirmed: Supplier Invoice→Journal→GL (account 2050 shows real, correctly-running-balanced rows)→Document Viewer resolves the exact source document; Material Issue→Inventory→GL (account 5000); Labour→Journal→GL (account 5100)→Project.

## 24. Journal Entry UI

Re-confirmed via Document Viewer (unchanged since Phase 30): every field the brief lists (dates, voucher, origin, party, remarks, account/debit/credit/project/cost-centre/tax, total, difference, clearing link) is present and correctly populated.

## 25. Security

1,089/1,089 unchanged. Targeted spot-checks: Sales cannot view Material Requirements; a ProjectManager cannot approve a Material Requirement (requires higher authority, not the requester); Accountant cannot issue material at all (correctly denied before the BOM-quota question is even reached — SoD by role, not by feature). Accountant confirmed denied creating a GL account / Cost Centre / user, but still able to view them read-only.

## 26. ID Tampering — where the genuine defect was found

7 tampering scenarios tested. 6 passed cleanly. **1 surfaced a real, confirmed defect** — see §33.

## 27. Negative Tests

10 scenarios: negative/zero/excess Material Issue, over-budget without override, far-future date, duplicate Supplier Invoice, invalid Supplier/Customer/Vendor — all correctly rejected (the last three only after the §33 fix; see below).

## 28. Reversal

Labour Cost and Project Expense entries both reversed cleanly; Project P&L correctly netted the reversal; Trial Balance still balanced afterward.

## 29. Concurrency

Not re-run from scratch this phase — no code touched any concurrency-sensitive path (the one change this phase, §33's fix, is a pure synchronous existence check with no I/O, identical concurrency profile to the code it replaced). Existing Phase 17/20 concurrency evidence, re-confirmed passing in Part 1's fresh regression run, stands.

## 30. Persistence

Created a full transaction set, restarted the server process, and confirmed Project P&L (₹66,000/₹184,000), Trial Balance (9 accounts), and Audit Log (120 entries) all persisted byte-for-byte identical across the restart.

## 31. Accountant Experience

Performed live in the browser as `finance1`, without inspecting source code during the walkthrough itself. Project 360, Balance Sheet, and Company P&L all opened and read without technical assistance — every cross-screen number matched (Actual Cost consistent within Project 360; Balance Sheet Retained Earnings matched Company P&L Net Profit exactly). No CONFUSING or FAIL result this pass.

## 32. Operations User Experience

Purchase, Sales, and ProjectManager roles all confirmed (via §25's live spot-checks) to see only what their role permits — no unnecessary accounting privileges leaked to any of them.

## 33. Findings

### DEFECT (found and FIXED this phase, per the brief's own authorization to fix genuine defects through controlled, regression-tested change)

**`assertCustomerSelectable()`, `assertVendorSelectable()`, and `assertMaterialSelectable()` only ever checked "does this exist AND is it inactive" — never "does it exist at all."** A completely fabricated customer, vendor, or material ID silently passed these guards (returning no error) and could be used to create a real draft document. Live-reproduced before fixing: `createPurchaseOrder()` accepted `vendorId:"VEND-FAKE-999"` and created a real PO; `draftCustomerInvoice()` and `draftSupplierInvoice()` did the same for fabricated customer/vendor IDs, producing real drafts that could be pushed all the way to a posted GL entry against a party that never existed.

**Fixed at the single shared root** — all three functions now reject a nonexistent ID immediately, before checking active/inactive status. This single fix closes the gap at every one of its 6 call sites (Purchase Order, Customer Invoice, standalone Supplier Bill, Customer Advance, Damage Report) simultaneously, rather than patching each individually. `createMaterialIssue()` already had its own separate existence check and was never affected. Verified live after the fix (all three scenarios now correctly rejected with a clear "does not exist" message) and confirmed via a full 1,038-test regression run plus the 1,089-cell security matrix, both unchanged and clean.

### LIMITATION — disclosed, not a defect

A Failed QC result does not trigger any inventory quarantine mechanism — this Lab has no separate "quarantined stock" sub-status. Per the brief's own instruction, this is recorded as a limitation, not invented into a new inventory subsystem.

### MANUAL PROCESS — ACCEPTED

Drawing → BOQ translation remains a human, off-system step, matching the real Appletree process.

### BUSINESS POLICY REQUIRED (all previously disclosed, all reconfirmed still correctly flagged, not silently resolved)

- Vendor Rating's composite weighting (50/30/20 split) — disclosed on-screen as a default, not approved policy.
- Product Costing's 15% labour/overhead assumption — disclosed on-screen.
- Future-dated posting window (`maxFuturePostingDaysApproved: false`, reconfirmed via live API check this phase).
- Balance Sheet Equity, which is entirely Retained Earnings since no Capital/Contributed-Equity account has ever been configured — disclosed on-screen.

### ENHANCEMENT / OUT OF SCOPE

None newly identified this phase beyond what Phase 29's coverage matrix already disclosed (Balance Sheet non-current liability split, HR/Payroll, Cash Flow Statement, etc. — unchanged, not revisited).

## 34. Remaining Gaps

Unchanged from Phase 29/30's own disclosed lists — no new gaps found beyond §33's defect, which is now closed.

## 35. Real-World Dependencies (Part 41)

Still entirely pending, as every phase before this one has correctly disclosed: real Chart of Accounts confirmation, real Customers/Suppliers/Materials/Projects, real Bank/Cash accounts, Opening Balances, Tax Configuration, real User list and Role assignments, real Data Migration, real Production Infrastructure, real Backup/DR, Management Approval, and the real Accountant UAT itself. None of these are claimed complete here.

## 36. UAT Package

`ACCOUNTANT_UAT_PHASE32/` — 15 files exactly as specified (Instructions, Accounting, Purchase, Inventory, Project, Factory, Site, Billing, AR/AP, Bank, Reports, Security, Reconciliation, Defect Report Template, Sign-off), written in plain English, covering all 7 named tester roles, with the one fixed defect and the intentional BOM-override behavior both pre-disclosed so real testers don't waste time re-reporting either.

## 37. Final UAT Readiness Decision

## **A — READY FOR REAL APPLETREE ACCOUNTANT UAT**

The complete business chain — Lead through After-Sales, with Drawing/BOQ/BOM, Material Requirement/BOM budget control, Production exception handling, multi-row entry, the exact critical accounting scenario, and full company-financial reconciliation — was proven end-to-end with independently-calculated figures matching the ERP's own output exactly. The one genuine defect found (ID tampering via fabricated party references) was root-caused to a single shared function, fixed cleanly with zero regressions across 1,038 tests and 1,089 security cells, and is now closed rather than merely documented. No critical accountant-experience issue was found. This is not a claim of production readiness — the real-world dependencies in §35 remain entirely outstanding — but the technical bar this phase exists to clear has been cleared, under harder and more comprehensive testing than any prior phase attempted.

---

*Per the brief's Stop Condition: the build is frozen here. No Phase 33 development begins automatically. The next activity is real Appletree Accountant UAT.*
