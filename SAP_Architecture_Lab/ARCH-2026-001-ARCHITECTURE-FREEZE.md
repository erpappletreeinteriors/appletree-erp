# ARCH-2026-001 — Architecture Freeze

**Date:** 2026-09-21. DESIGN DOCUMENT ONLY. No application code, database, roles, permissions,
workflows, or business functionality was modified to produce this document.

## 1. The frozen 26-domain list

Confirmed against `ARCH-2026-001-26-DOMAIN-MATRIX.md` (corrected 2026-09-21). **No domain added,
removed, merged, or renamed from this task.** The list is exactly the 26 domains supplied in the
original ARCH-2026-001 request:

1. Home & Workspace
2. Sales & Customer Management
3. Estimation & Costing
4. Project & Contract Management
5. Procurement & Supplier Management
6. Inventory / Warehouse / Logistics
7. Manufacturing
8. Job Work / Subcontracting
9. Site Execution & Delivery
10. Quality Management
11. Finance & Accounting
12. Controlling / Management Accounting
13. Treasury & Cash Management
14. Asset Management
15. Service & After-Sales
16. Reporting & Analytics
17. Master Data
18. Administration & Governance
19. Integration & Platform
20. HR / Workforce
21. Payroll
22. Maintenance / EAM
23. PLM
24. Advanced Planning / MRP
25. Transportation / Logistics
26. Advanced Warehouse

**This list is now FROZEN for the purposes of ARCH-2026-001.** Any future addition, removal, merge,
or rename requires its own explicit, recorded decision — not a silent edit to this document.

## 2. Per-domain detailed status

Each domain below reports: Current status · Existing functionality · Partial functionality · Missing
functionality · Existing UI · Existing backend · Existing data model · Existing accounting integration
· Existing inventory integration · Existing security · Existing tests · Proposed future CR. A menu
item existing is never, by itself, treated as "implemented" — every claim below is grounded in a real
screen, function, or test cited elsewhere in this engagement's own evidence trail.

---

### 1. Home & Workspace — EXISTING (fully)
- **Existing:** role-aware Dashboard, login/session, logout.
- **Partial / Missing:** none identified — this domain's own scope is inherently minimal.
- **UI:** `HOME` module, Dashboard screen. **Backend:** session/auth routes. **Data model:** `DB.users`, session store.
- **Accounting integration:** n/a (no transactions originate here). **Inventory integration:** n/a.
- **Security:** full RBAC gate (login required for everything downstream); scrypt password hashing, lockout, HttpOnly session cookie — `erp_059_security_tests.js` (13/13).
- **Tests:** covered indirectly by every suite's own login step.
- **Proposed future CR:** NONE.

### 2. Sales & Customer Management — EXISTING (fully)
- **Existing:** Leads, Quotations, discount-approval workflow (auto ≤5%, FinanceManager 5-10%, CEO >10%), Mark Won (Project+Customer+Baseline creation).
- **Partial / Missing:** no e-signature capture for Acceptance (disclosed, known gap since Phase 6B).
- **UI:** `SALES & CRM` module (2 screens). **Backend:** `createLead()`, `createQuotation()`, `submitQuotation()`, `approveQuotationDiscount()`, `recordAcceptance()`, `wonTransition()`.
- **Data model:** `DB.leads`, `DB.quotations`.
- **Accounting integration:** none until Won→Invoice (verified: zero GL impact before posting, `PHASE_41_ESTIMATION_QUOTATION_UAT.md` §8). **Inventory integration:** none.
- **Security:** field-level (Sales sees sellingPrice only, never cost breakdown); cross-reference integrity check (DEF-P41-01, closed).
- **Tests:** `PHASE_41_ESTIMATION_QUOTATION_UAT.md` (live, 11-step chain).
- **Proposed future CR:** NONE (e-signature is a disclosed, optional future enhancement, not a gap blocking domain classification).

### 3. Estimation & Costing — EXISTING (fully)
- **Existing:** Costing Version buildup (material/labour/overhead/profit), BOM (Draft→Submitted→Approved), BOM Consumption Report.
- **Partial / Missing:** none for the domain as scoped.
- **UI:** `ESTIMATION & COSTING` module (3 screens). **Backend:** `createCostingVersion()`, BOM lifecycle functions.
- **Data model:** `DB.costingVersions`, `DB.boms`.
- **Accounting integration:** none (pre-Won). **Inventory integration:** BOM lines reference materials; no movement until Production.
- **Security:** field-level (cost breakdown hidden from Sales).
- **Tests:** `PHASE_41_ESTIMATION_QUOTATION_UAT.md` (cost independently verified exact).
- **Proposed future CR:** NONE.

### 4. Project & Contract Management — EXISTING (fully)
- **Existing:** Projects, Project 360 (bidirectional document trace), Budget vs Commitment vs Actual, Change Requests (Variations).
- **Partial / Missing:** no formal "Contract" document distinct from the Quotation/Project pair (Quotation functions as the contract-equivalent) — not classified as a gap since no SAP-equivalent contract-management concept was requested beyond what exists.
- **UI:** `PROJECTS` module (4 screens). **Backend:** `wonTransition()`, `projectDocumentTrace()`.
- **Data model:** `DB.projects`, `DB.changeRequests`.
- **Accounting integration:** Project 360 aggregates real GL-derived cost/revenue. **Inventory integration:** via Material Issue/Site Consumption tagging.
- **Security:** Project Manager scoped to assigned projects only.
- **Tests:** `PHASE_41_TRACEABILITY_REPORT.md` (DEF-P41-02, closed — bidirectional trace live-proven).
- **Proposed future CR:** NONE.

### 5. Procurement & Supplier Management — EXISTING (fully)
- **Existing:** Purchase Requisitions, Material Requirements/Requests, RFQ→Supplier Quotations→Comparisons, Purchase Orders (tiered approval), GRNs, Payment Requests (3-person maker-checker), Procurement Intelligence/Vendor Rating/Replenishment reports.
- **Partial / Missing:** MRQ/MR naming confusability (documentation issue, not functional).
- **UI:** `PROCUREMENT` module (14 screens). **Backend:** full PR→PO→GRN→Bill chain functions.
- **Data model:** `DB.purchaseOrders`, `DB.grns`, `DB.paymentRequests`, etc.
- **Accounting integration:** GRN→Supplier Bill (3-way match)→Payment→Clearing, all through the single GL engine. **Inventory integration:** GRN is the primary inbound movement.
- **Security:** tiered approval (≤5L auto, 5-20L FinanceManager, >20L CEO), 3-person Payment Request separation, live-tested.
- **Tests:** `erp_phase39_stress_test.js` (105/105 at volume), `PHASE39_PAYMENT_APPROVAL_MATRIX_REPORT.md` (18/18).
- **Proposed future CR:** NONE for core function. MRQ/MR naming remains a standing Business Decision (unrelated to this domain's functional completeness).

### 6. Inventory / Warehouse / Logistics (basic) — EXISTING (fully)
- **Existing:** Stock, Movement Ledger, Transfer, Adjustment, Material Issues, Material Return (Site), Purchase Returns, Damage Reports, Stock Counts, Locations, Material Analysis.
- **Partial / Missing:** none at the "basic" scope this domain title implies (advanced warehouse concepts are domain #26, separately classified).
- **UI:** `INVENTORY` module (13 screens). **Backend:** single `createInventoryMovement()`-family engine (confirmed 1 real writer, `ARCH-2026-001-CURRENT-STATE-MAP.md` §1).
- **Data model:** `DB.inventoryMovements`, `DB.stock`.
- **Accounting integration:** Moving-Average valuation posts through the single GL engine. **Inventory integration:** this IS the inventory engine.
- **Security:** role-gated per action (e.g., Adjustment requires a reason, not a silent override).
- **Tests:** `erp_phase39_stress_test.js` (105 GRN-driven movements at volume, zero orphans).
- **Proposed future CR:** NONE (advanced capability tracked separately as domain #26).

### 7. Manufacturing — EXISTING, PARTIAL
- **Existing:** BOM, Production Orders (Draft→Released→InProgress→PartiallyCompleted→Completed/Closed/OnHold/Cancelled), Factory Dashboard, Machines, Job Cards, Production Schedule/Job Analysis/Job Cost Sheet/Product Costing/Labour Performance reports.
- **Partial:** no Routing or Work Centre concept — a Job Card references a single machine/operation directly, with no multi-step routing sequence or capacity-planning layer.
- **Missing:** Routing, Work Centre, capacity scheduling.
- **UI:** `PRODUCTION & JOB WORK` module (10 screens, shared with Job Work). **Backend:** Production Order/Job Card lifecycle functions.
- **Data model:** `DB.productionOrders`, `DB.jobCards`, `DB.machines`.
- **Accounting integration:** labour/material cost posts through the single GL engine (Job Cost Sheet). **Inventory integration:** Production consumption/receipt through the single inventory engine.
- **Security:** role-gated (Purchase/Production roles).
- **Tests:** `erp_phase39_manufacturing_jobwork_tests.js` (36/36).
- **Proposed future CR:** **CR-2026-003** — Manufacturing Routing & Work Centre addition (see wave plan).

### 8. Job Work / Subcontracting — EXISTING (fully)
- **Existing:** Job Worker master (GST-registration flag), multi-material Dispatch, partial Return, Scrap disposition, Direct Dispatch with APOB gate for unregistered workers.
- **Partial / Missing:** none.
- **UI:** Job Work screen (same module as #7). **Backend:** `dispatchToJobWorker()`, `returnFromJobWorker()`, `recordJobWorkScrap()`, `directDispatchFromJobWorker()`.
- **Data model:** `DB.jobWorkOrders`.
- **Accounting integration:** via the single GL engine where applicable. **Inventory integration:** dispatch/return net-quantity proven exact under test.
- **Security:** APOB-gated direct dispatch (a real compliance control, live-tested).
- **Tests:** `erp_phase39_manufacturing_jobwork_tests.js` (net stock change exactly -5 across a dispatch/return/scrap cycle).
- **Proposed future CR:** NONE.

### 9. Site Execution & Delivery — EXISTING (fully)
- **Existing:** Dispatch, Delivery (cumulative partial tracking), Installation, QC, Snags (independent-verifier SoD), Handover (fail-closed on Installation/QC/Snag gates), Billing Milestones.
- **Partial / Missing:** none.
- **UI:** `EXECUTION & DELIVERY` module (7 screens). **Backend:** full lifecycle functions, `handoverReadinessCheck()`.
- **Data model:** `DB.dispatches`, `DB.deliveries`, `DB.installations`, `DB.qcChecklists`, `DB.snags`, `DB.handovers`.
- **Accounting integration:** Installation posts labour to CC-INSTALLATION; Handover/Dispatch themselves post zero GL value. **Inventory integration:** Dispatch/Delivery are tracking-only, zero inventory value posted (by design).
- **Security:** Snag verifier cannot be the same person who resolved it (except CEO/Admin).
- **Tests:** `erp_audit_p0_tests.js` ERP-034 (duplicate-handover rejection live-proven).
- **Proposed future CR:** NONE.

### 10. Quality Management — EXISTING (fully)
- **Existing:** QC Checklist lifecycle (Pending→InProgress→Passed/Failed), QC Dashboard (per-project aggregation).
- **Partial / Missing:** no reusable Inspection Plan/template entity — every checklist is created fresh (a disclosed, not-yet-requested feature).
- **UI:** QC screen (Execution & Delivery module) + QC Dashboard (Site Operations module). **Backend:** `createQCChecklist()`, `submitQCResult()`, `qcDashboard()`.
- **Data model:** `DB.qcChecklists`.
- **Accounting integration:** none directly. **Inventory integration:** none directly.
- **Security:** QC status gates Handover server-side (fail-closed).
- **Tests:** `DEF-2026-001-TEST-REPORT.md` (19/19 — the QC Dashboard field-mismatch defect, closed).
- **Proposed future CR:** NONE (Inspection Plan template is a disclosed future enhancement, not a current-domain gap).

### 11. Finance & Accounting — EXISTING (fully)
- **Existing:** full Finance module (29 screens) — Journal Voucher, Customer Invoice/Receipt, Supplier Bill/Payment, Credit/Debit Notes, Customer Advance, CSV Import (atomic), Journal Register, Document Viewer, Bank Reconciliation, Financial Periods, Fixed Assets, Bank/Cash Transfer, Opening Balances, Compliance Dashboard, Petty Cash, APOB & E-way Bill, ITC/BOQ Reports, TDS Reporting.
- **Partial / Missing:** none for core double-entry accounting.
- **UI:** `FINANCE` + `FINANCIAL STATEMENTS` modules. **Backend:** `postJournalEntry()` — the single confirmed GL writer.
- **Data model:** `DB.journalEntries`, `DB.clearings`.
- **Accounting integration:** this IS the accounting engine. **Inventory integration:** consumes inventory-valuation postings from the single inventory engine.
- **Security:** Submit→Approve→Post discipline, no self-approval, live-tested extensively.
- **Tests:** 525-document stress test (`erp_phase39_stress_test.js`, 11/11), Trial Balance independently verified exact repeatedly.
- **Proposed future CR:** NONE.

### 12. Controlling / Management Accounting — EXISTING, PARTIAL
- **Existing:** Cost Centres, Profit Centres (masters), Budget vs Commitment vs Actual (Project 360).
- **Partial:** no formally separate CO ledger — cost-centre/profit-centre dimensions are tags on GL journal lines, reported via views/filters over the single GL, not a parallel Controlling ledger with its own reconciliation.
- **Missing:** cross-project/cross-cost-centre allocation rules, a dedicated CO-vs-FI reconciliation report.
- **UI:** Master Data module (Cost/Profit Centres) + Project 360's own budget view. **Backend:** dimension tags on `postJournalEntry()` lines.
- **Data model:** `DB.costCentres`, `DB.profitCentres`.
- **Accounting integration:** IS a dimensioned view of the single GL engine (deliberately, per SAP CO-on-FI precedent — not a defect). **Inventory integration:** n/a directly.
- **Security:** unchanged from Finance's own gates.
- **Tests:** covered incidentally by Finance's own reconciliation tests.
- **Proposed future CR:** **CR-2026-004** — formal Controlling reporting layer (see wave plan).

### 13. Treasury & Cash Management — EXISTING, PARTIAL
- **Existing:** Bank Reconciliation, ICICI Bank Import (duplicate-detection, account-mismatch flagging), Bank/Cash Transfer, Petty Cash (per-site float, bill-required, reconcilable).
- **Partial:** no cash-flow forecasting, no treasury-position/liquidity dashboard.
- **Missing:** forward-looking cash position, multi-bank sweep/pooling concepts.
- **UI:** Finance module (4 screens). **Backend:** bank-import/reconciliation functions.
- **Data model:** `DB.bankAccounts`, `DB.bankImports`, `DB.pettyCashFloats`.
- **Accounting integration:** each bank/cash account has its own distinct GL code (verified this engagement's own Phase 39 fix). **Inventory integration:** n/a.
- **Security:** role-gated.
- **Tests:** `erp_phase39_banking_tests.js` (34/34).
- **Proposed future CR:** **CR-2026-005** — Treasury cash-flow forecasting (see wave plan).

### 14. Asset Management — EXISTING (fully)
- **Existing:** Fixed Assets — Capitalize, Depreciate, Dispose (automatic gain/loss vs. Net Book Value), role-gated disposal.
- **Partial / Missing:** none for the domain as scoped.
- **UI:** Fixed Assets screen (Finance module). **Backend:** `capitalizeFixedAsset()`, `depreciateFixedAsset()`, `disposeFixedAsset()`.
- **Data model:** `DB.fixedAssets`.
- **Accounting integration:** posts through the single GL engine (Dr Fixed Asset/Cr Bank or Payable). **Inventory integration:** n/a.
- **Security:** disposal restricted to Admin/CEO/FinanceManager tier (Purchase correctly blocked).
- **Tests:** `erp_phase39_fixed_assets_tests.js` (30/30, register reconciles exactly to GL 1400/1450).
- **Proposed future CR:** NONE.

### 15. Service & After-Sales — EXISTING (fully)
- **Existing:** Customer 360/Profitability, Warranty, Complaints→Service Tickets→Service Visits, AMC→AMC Schedule→Service Billing, CAPA (with effectiveness-check gate).
- **Partial / Missing:** none.
- **UI:** `SERVICE & AFTER-SALES` module (10 screens). **Backend:** built Phase 10, tagged post-creation to the single invoice engine (no second billing engine).
- **Data model:** `DB.complaints`, `DB.tickets`, `DB.amcContracts`, `DB.capa`.
- **Accounting integration:** AMC/Warranty billing via the SAME `draftCustomerInvoice()` used everywhere else. **Inventory integration:** warranty material issue via the same Material Issue mechanism.
- **Security:** role-gated.
- **Tests:** built and live-tested in Phase 10's own original build.
- **Proposed future CR:** NONE.

### 16. Reporting & Analytics — EXISTING (fully)
- **Existing:** Accounting & MIS Quick Reports, Accountant MIS, Management MIS, Cross-Dimensional Reports, Company Profitability, HSN Data Quality, Exports, Audit Log.
- **Partial:** the full 27+-report catalog is not individually re-verified term-by-term every phase (a disclosed, honest limitation, not a functional gap — Trial Balance and core reconciliation reports ARE independently verified exact, repeatedly).
- **Missing:** none identified beyond the disclosed re-verification cadence limitation.
- **UI:** `REPORTS & ANALYTICS` + `FINANCIAL STATEMENTS` modules. **Backend:** report-generation functions, read-only.
- **Data model:** reads existing collections; no separate reporting data store.
- **Accounting integration:** reads the single GL engine directly. **Inventory integration:** reads the single inventory engine directly.
- **Security:** Audit Log confirmed to never leak a password/hash/token.
- **Tests:** Trial Balance repeatedly independently verified exact.
- **Proposed future CR:** NONE (report-catalog re-verification is a standing regression-discipline item, not a new-build CR).

### 17. Master Data — EXISTING (fully)
- **Existing:** Branches, Profit Centres, Bank Accounts, Chart of Accounts, Cost Centres.
- **Partial / Missing:** none.
- **UI:** `MASTER DATA` module (5 screens). **Backend:** master CRUD functions.
- **Data model:** `DB.branches`, `DB.chartOfAccounts`, `DB.bankAccounts`, `DB.costCentres`, `DB.profitCentres`.
- **Accounting integration:** every bank/cash account requires its own distinct GL code (enforced). **Inventory integration:** n/a directly.
- **Security:** role-gated.
- **Tests:** Bank Accounts screen live-tested (Phase 39/41 smoke tests).
- **Proposed future CR:** NONE.

### 18. Administration & Governance — EXISTING, PARTIAL
- **Existing:** Policy Configuration, Users & Roles (incl. Create Demo Scenario/Reset UAT Data), Try Unauthorized Action, API-only Backup/Restore (SHA-256, Admin/CEO-gated, live-proven round trip).
- **Partial:** authorization is role-only (10 flat roles, no duty/privilege/scope/SoD layer) — this is precisely what CR-2026-002's environment work and this ARCH-2026-001 initiative's own RBAC design target.
- **Missing:** the entire duty/privilege/data-scope/approval-authority/SoD layer described in `ARCH-2026-001-ROLE-SECURITY-DESIGN.md`.
- **UI:** `ADMINISTRATION` module (3 screens) + API-only Backup/Restore. **Backend:** role-check-based route guards.
- **Data model:** `DB.users`; no `DB.duties`/`DB.privileges`/`DB.roleScopes`/`DB.sodRules` (confirmed absent by grep).
- **Accounting integration:** n/a. **Inventory integration:** n/a.
- **Security:** real and tested for what it covers (28 live-blocked unauthorized attempts across Phases 40-41, 0 succeeded) — the gap is granularity, not enforcement correctness.
- **Tests:** `PHASE_41_VIEWER_UAT.md`, `PHASE_41_SECURITY_REPORT.md`.
- **Proposed future CR:** the RBAC foundation sequence itself (`ARCH-2026-001a` through `g`, see Wave Plan §7) — this domain's own completion IS the RBAC initiative.

### 19. Integration & Platform — REQUIRES CLARIFICATION
- See `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md` and the dedicated scope breakdown produced this
  task (§5 below in this document is NOT this domain's detail — see the separate Integration &
  Platform scope section later in this file).
- **Proposed future CR:** **CR-2026-007**, blocked until scope is clarified.

### 20. HR / Workforce — NOT APPLICABLE / FUTURE ROADMAP
- **Existing:** Labour & Wages (project-cost tracking only), Project Timesheet (time-tracking only, no accounting effect).
- **Missing:** employee master, leave management, attendance beyond timesheet hours, org structure.
- **UI/Backend/Data model:** none beyond the cost-tracking screens above. **Accounting integration:** Labour & Wages posts to account 5100. **Inventory integration:** n/a. **Security:** n/a (no HR-specific access model). **Tests:** n/a.
- **Proposed future CR:** **CR-2026-008**.

### 21. Payroll — NOT APPLICABLE / FUTURE ROADMAP
- **Existing:** none. **Missing:** everything — PF/ESI/PT/salary-TDS, payslips, statutory filing.
- Carries genuine statutory/legal risk this engagement has never been authorized to take on (cannot
  be built from assumed defaults, per this engagement's own standing "no invented business policy"
  constraint).
- **Proposed future CR:** **CR-2026-009** (requires Appletree-confirmed statutory configuration before any design work, not just before implementation).

### 22. Maintenance / EAM — NOT APPLICABLE / FUTURE ROADMAP
- **Existing:** Machines (Available/In-Use status only, Production & Job Work module). **Missing:** maintenance scheduling, work orders, asset-condition tracking, meter readings.
- **Proposed future CR:** **CR-2026-010**.

### 23. PLM — NOT APPLICABLE / FUTURE ROADMAP
- **Existing:** BOM (single-version-at-a-time, project-scoped). **Missing:** engineering-change-order workflow, revision history, design-document management.
- **Proposed future CR:** **CR-2026-011**.

### 24. Advanced Planning / MRP — NOT APPLICABLE / FUTURE ROADMAP
- **Existing:** Material Requirements (a manual, BOM-driven demand calculation). **Missing:** automated MRP run/netting, lead-time-aware planning, automatic PR generation.
- **Proposed future CR:** **CR-2026-012**.

### 25. Transportation / Logistics (advanced) — NOT APPLICABLE / FUTURE ROADMAP
- **Existing:** Delivery Challan, E-way Bill Tracking (manual entry only). **Missing:** route planning, carrier management, freight-cost allocation.
- **Proposed future CR:** **CR-2026-013**.

### 26. Advanced Warehouse — NOT APPLICABLE / FUTURE ROADMAP
- **Existing:** Locations, Stock by Location, Stock Counts. **Missing:** bin-level putaway strategy, wave picking, a warehouse-task engine.
- **Proposed future CR:** **CR-2026-014**.

---

## 3. Integration & Platform — scoped breakdown (Domain #19)

Per this task's §5 instruction, not expanded into an uncontrolled "everything else" category:

| Item | Classification |
|---|---|
| CSV Journal Voucher Import (atomic, dry-run capable) | **Included, Existing** |
| Master Data Import (atomic) | **Included, Existing** |
| ICICI Bank Import | **Included, Existing** |
| E-way Bill Tracking (manual entry) | **Included, Existing** (manual — no live portal connection) |
| Exports screen | **Included, Existing** |
| A general-purpose external-system connector (e.g. GST portal API, e-invoicing API, accounting-software sync) | **OPEN** — no such capability exists; whether this belongs under "Integration & Platform" scope depends on what the requester actually means by the domain name, not decided here |
| An internal message bus / event system between modules | **Excluded** — no such architecture exists or has been requested; the single-GL/single-inventory-engine design (§8) already serves the cross-module consistency purpose an internal bus would otherwise provide |
| API/webhook framework for third-party integration | **OPEN** — not built, not scoped, genuinely ambiguous whether this is in-domain |
| Authentication/SSO integration (e.g. Google/Microsoft login) | **OPEN** — current auth is local-only (username/password); whether SSO belongs here or is out of scope entirely is undecided |

**Future, once scoped:** any of the OPEN items above, once the requester confirms which are actually
wanted. **Not proposed as a blanket CR** — see `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md`.

## 4. Confirmation

This document freezes the 26-domain list and its per-domain classification as of 2026-09-21. No
code, schema, role, permission, or business-functionality change was made to produce it.
