# FINAL HANDOVER DOCUMENT — SAP_Architecture_Lab

## 0. Phase 36 Changes (latest)

Closed the 5 remaining genuine UI gaps Phase 35 disclosed (GRN weighment fields, Seller Cumulative/194Q report, Cash Control Exceptions report, Payment Approval Matrix Draft→Review→Approved workflow, multi-line Job Work UI) and built the shareable UAT environment: a persistent UAT/Demo banner, a dedicated `uat_*` credential set (10 users), an exposed "Reset UAT Data" function (reusing the existing, already-safe reset mechanism — nothing new or riskier was built), a "One-Click Demo Scenario" that seeds one real 15-step connected transaction chain, and a Document Flow / Traceability panel on Project 360. Zero central-engine changes; `DB.journalEntries.push` still occurs exactly once. Full detail in `PHASE36_FINAL_REPORT.md`.

## 1. System Architecture

A local Node.js server (`server/server.js` + `server/domain.js`, zero external npm dependencies — built-in `http`+`crypto` only) with a single-page secured client (`client_secure/index.html`). No database server — state persists to `server/db.json` via an atomic write (temp file + fsync + rename, so a crash mid-write can never corrupt the file). One central accounting engine (`postJournalEntry()`), one inventory ledger (`inventoryMovements`, with additive `siteId`/`jobWorkerId`/`locationId` dimensions rather than separate tables), one AR engine, one AP engine, one tax calculation path. Verified repeatedly across every phase: `grep -c "DB.journalEntries.push" server/domain.js` must always equal `1`.

## 2. Modules

CRM (Lead→Estimation→Quotation) · Projects · Procurement (PR→PO→GRN→Bill→Payment) · Inventory (stock, transfers, adjustments, damage, stock counts) · Manufacturing (BOM, Production Orders) · Site Material (MRS→Delivery Challan→Site Receipt→Consumption) · Job Work (Job Worker master, dispatch/return/scrap/direct-dispatch, APOB, aging) · Execution (Dispatch→Delivery→Installation→QC→Snag→Handover) · Billing → AR → Receipt → Clearing · After-Sales (Warranty/Complaints/Tickets/Visits/AMC/CAPA) · Finance (GL, Trial Balance, Balance Sheet, Company P&L, ledgers, bank reconciliation, fixed assets, financial periods) · Finance SOP Compliance (TDS, cash limits, petty cash, payment maker-checker, ITC reversal, BOQ variance, SOP dashboard).

## 3. Roles

Admin, CEO, FinanceManager, Accountant, ProjectManager, Purchase, Sales, Estimator, SiteInCharge, Viewer. Full permission matrix in `server/domain.js`'s `ROLE_ACTIONS` object. Route-level gating in `server/server.js` is the enforcement layer — the UI never decides what a role can do, it only reflects what the server already allows or denies.

## 4. Permissions & Approval Workflows

Segregation of duties is enforced server-side, not by hiding UI buttons: a document's creator generally cannot approve their own document; a payment request's maker cannot also be its checker or executor (a genuine third person is required); a Site In-charge can self-approve only within the configured site-petty daily limit, escalating above it.

## 5. Accounting Architecture

Every financial event — customer invoice, supplier bill, payment, receipt, TDS deduction, ITC reversal, petty cash replenishment — reaches the ledger exclusively through `postJournalEntry()`. Draft→Submit→Approve→Post lifecycle for manual journals; direct posting for system-generated entries (GRN, Material Issue, Payment) with the same debit=credit enforcement either way.

## 6. Inventory Architecture

A single `inventoryMovements` table. Movement `type` distinguishes Receipt/Issue/Transfer/Adjustment/Return at the warehouse level, plus SiteReceipt/SiteConsumption at the site level and JobWorkReceipt/JobWorkReturn/JobWorkScrap/JobWorkDirectDispatch at the job-worker level — all additive dimensions on the one ledger, never a second inventory system. Moving-average valuation throughout.

## 7. Tax Controls

GST tax codes (CGST+SGST for intra-state, IGST for inter-state) with a Place of Supply advisory helper. TDS engine covering all 6 SOP-named categories, applied at payment time, posted to a dedicated `2300 TDS Payable` account. ITC reversal on Damage Reports, posted to a dedicated `5310 Input Tax Reversed` account. Every rate/threshold is explicitly labeled SOP-sourced, not independently verified as current tax law.

## 8. SOP Controls

Purchase Requisition (configurable enforcement, ships off), cash payment limits (₹10k/₹35k/₹20k/₹2L), seller cumulative ₹50L/Section 194Q tracking, GRN weighment/variance gate, site material subledger, Job Work/APOB, three-way-match-at-payment (defense-in-depth), payment maker-checker, petty cash imprest. Full detail in `PHASE33_SOP_COMPLIANCE_REPORT.md` and `PHASE34_FINAL_REPORT.md`.

## 9. Reports

Trial Balance, Balance Sheet, Company P&L, General/Customer/Supplier Ledgers, AR/AP Ageing, bank reconciliation, ITC Reversal report, BOQ Variance report, SOP Compliance Dashboard, and the full existing Procurement/Inventory/Factory report set from earlier phases.

## 10. Backup / Restore

`server/backups/` — Admin-only create/list/restore, SHA-256 content checksums, tested with temporary data (see `phase17_backup_restore_test.js`). Not re-run against real data (none exists yet).

## 11. Configuration

`server/domain.js`'s `DB.companyGSTConfig`, `DB.tdsConfig`, `DB.cashLimits`, `DB.purchaseApprovalConfig`, `DB.paymentApprovalMatrix`, `DB.threeWayMatchPolicyConfig` — all editable via the SOP Configuration screen (Finance/Admin only) or directly via their API routes.

## 12. UAT Instructions

Start with `START_HERE.md` (root of the repo). Then `ACCOUNTANT_UAT_PACKAGE/01_UAT_GUIDE.md` through `21_UAT_SIGNOFF.md`, and `ACCOUNTANT_UAT_DASHBOARD.md`. Dedicated UAT credentials in `ACCOUNTANT_UAT_PACKAGE/19_TEST_CREDENTIALS.md`. An Admin can click **Create Demo Scenario** (Users & Roles screen) for one ready-made connected example, and **Reset UAT Data** to wipe back to a clean seed at any time.

## 13. Known Limitations

- No real government e-way-bill API integration anywhere — manual entry only, by design.
- No mobile-optimized layout — this is an internal desktop tool, per this phase's own brief.
- No distinct Store/Factory role — `uat_store`/`uat_factory` map to the Purchase role, disclosed in `19_TEST_CREDENTIALS.md`.
- Automatic multi-hop job-work re-dispatch chaining (Job Worker A → B → Customer as one tracked object) is not built — a single re-dispatch reference field covers the traceability requirement without an open-ended chain-of-custody engine.

## 14. Management Decisions Outstanding

See `MANAGEMENT_DECISION_REGISTER.md`.

## 15. Tax/Legal Dependencies

Every TDS rate and cash-limit figure needs independent Tax/Legal sign-off before being relied on for real filings — see the "Tax / Legal Review" section of the SOP Compliance Dashboard.

## 16. Production Checklist

See `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md` and the 10 preconditions listed for verdict "D" in `PHASE36_FINAL_REPORT.md` — none have yet occurred.
