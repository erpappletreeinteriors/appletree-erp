# Appletree ERP (SAP Architecture Lab) — Controlled Change Register

Started 2026-09-16, the first change under the Phase 41 frozen-baseline change-management workflow.
Every future change request, defect, or architecture change on this codebase should be logged here
with its final status. IDs use the `CR-YYYY-NNN` / `DEF-YYYY-NNN` / `ARCH-YYYY-NNN` scheme — Phase 41
defect IDs (`DEF-P41-xx`) are not reused.

| ID | Type | Title | Opened | Status | Severity | Files Changed | Report |
|---|---|---|---|---|---|---|---|
| DEF-2026-001 | Defect | QC Dashboard reads the wrong QC result field | 2026-09-16 | **CLOSED** | HIGH (functional — dashboard aggregation was 100% incorrect for every non-pending record; no accounting/security/data-integrity impact) | `server/domain.js` (1 function, `qcDashboard()`) | `DEF-2026-001-INVESTIGATION.md`, `DEF-2026-001-FIX-LOG.md`, `DEF-2026-001-TEST-REPORT.md` |
| DEF-2026-002 | Defect (discovered, not authorized to fix) | `server/phase28_modules_tests.js` §9 calls BOM `/approve` without a prior `/submit`, now correctly rejected by the Phase 40 Draft→Submitted→Approved workflow — crashes the test script before it reaches its own results printer | 2026-09-16 | **OPEN** (test-harness defect, no production impact; requires separate authorization to fix) | LOW (stale test fixture only — the underlying BOM workflow itself is correct and unaffected) | None — discovered and documented only | `DEF-2026-001-INVESTIGATION.md` (Unrelated issue section), `DEF-2026-001-TEST-REPORT.md` (Known Issues section) |
| CR-2026-001 | Change (nomenclature, low-risk) | Phase 42 low-risk display/documentation terminology corrections (12 items: Journal Voucher consistency, MRS registry label, APOB expansion, Receipt/Payment qualification, Delivery Confirmation/Challan + Accept-Reject documentation) | 2026-09-16 | **CLOSED** | LOW (display/documentation-only; zero API/schema/workflow/accounting/inventory/security impact, confirmed by regression) | `server/domain.js` (3 string edits), `client_secure/index.html` (7 string edits), `APPLETREE_ERP_TERMINOLOGY_STANDARD.md` (2 new entries + 2 note updates) | `PHASE-42-LOW-RISK-IMPLEMENTATION-REPORT.md`, `PHASE-42-LOW-RISK-CHANGE-MATRIX.csv` |
| ARCH-2026-001 | Architecture change (proposed, scoped down) | Enterprise architecture upgrade: full duty/privilege/data-scope/SoD authorization model to replace the current role-only RBAC, plus 26-domain coverage review (7 domains confirmed absent: HR, Payroll, Maintenance/EAM, PLM, MRP, Transportation, Advanced Warehouse) | 2026-09-21 | **DESIGN FROZEN — IMPLEMENTATION NOT AUTHORIZED** (audit/design deliverables only, no code changes; management decision #1 — db.json access provenance — resolved as UNIDENTIFIED/UNKNOWN; CR-2026-002 closed the underlying environment-safety gap; architecture freeze completed 2026-09-21 with 3 items remaining genuinely OPEN — see below) | N/A — no code changed | None | `ARCH-2026-001-CURRENT-STATE-MAP.md`, `ARCH-2026-001-26-DOMAIN-MATRIX.md`, `ARCH-2026-001-ROLE-SECURITY-DESIGN.md`, `ARCH-2026-001-DB-FORENSIC-AND-DOMAIN-RECONCILIATION.md`, `ARCH-2026-001-LOGIN-PROVENANCE-INVESTIGATION.md`, `ARCH-2026-001-ARCHITECTURE-FREEZE.md`, `ARCH-2026-001-RBAC-TARGET-DESIGN.md`, `ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md`, `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md` |
| CR-2026-002 | Change (environment/database safety) | Environment & Database Safety Hardening — single authoritative env/DB-path resolution module (`server/env.js`), new explicit `development` environment state with the same DB_PATH-required fail-closed guard as `test`, loud startup identification banner, and a formal isolated-test-server launcher script replacing the manual scratch-copy pattern | 2026-09-21 | **CLOSED — PASS** | LOW-MEDIUM (environment/infra safety control; zero business-logic, RBAC, accounting, or inventory change; production default startup behavior unchanged by design) | `server/env.js` (new), `server/domain.js` (DB_FILE resolution consolidated into env.js), `server/server.js` (APP_ENV/PORT resolution consolidated into env.js; startup banner added), `server/scripts/start-isolated-test-server.js` (new), `tests/erp_cr_2026_002_env_safety_tests.js` (new, 19 tests) | `CR-2026-002-ENVIRONMENT-SAFETY.md` |
| ARCH-2026-001A | Change (RBAC foundation implementation) | Enterprise RBAC Foundation — implements USER→BUSINESS ROLE→DUTIES→PRIVILEGES→ACTIONS→DATA SCOPE→APPROVAL AUTHORITY→SoD→SERVER-SIDE AUTHORIZATION→AUDIT inside `server/domain.js`: 10 Business Roles (1:1 with the existing 10 roles), 28 privileges (12 mechanically-derived legacy-bridge + 16 resource-specific), 18 duties, `can()` refactored to be powered by the new engine (proven behaviorally identical by a 120/120 equivalence test), Data Scope/Approval Authority/SoD frameworks seeded as reference data over the 4 pre-existing approval tables + 2 pre-existing maker-checker sites (none modified), deterministic 1:1 access-preserving migration of all 21 seeded users | 2026-09-21 | **CLOSED — PASS** (RBAC foundation only; the 26-domain business features and the CEO/admin split remain separately unauthorized) | LOW-MEDIUM (additive infrastructure; zero existing route's enforcement changed; `can()`'s refactor is the only change to a live code path, proven equivalent by test before being trusted) | `server/domain.js` only (new RBAC Foundation section, `can()` refactor, `freshDB()`/migration-guard additions, `module.exports` addition — no other file changed) | `ARCH-2026-001A-PREIMPLEMENTATION-CHECKPOINT.md`, `ARCH-2026-001A-RBAC-IMPLEMENTATION-REPORT.md`, `ARCH-2026-001A-ROLE-MIGRATION-REPORT.md`, `ARCH-2026-001A-SECURITY-TEST-REPORT.md`, `ARCH-2026-001A-REGRESSION-REPORT.md`, `ARCH-2026-001A-CHANGELOG.md` |
| ARCH-2026-001B | Change (route-layer authorization migration) | Route-Layer Authorization Migration — full inventory and classification of all 113 baseline `role===` occurrences (`domain.js` 14, `server.js` 99); migrated 5 genuine, high-risk-relevant authorization gates to the centralized `hasPrivilege()` engine (`AuditLog.VIEW`, `MaterialIssueSite.CREATE`, `MaterialIssueWarehouse.CREATE`, `PurchaseRequisition.APPROVE`, `SiteMaterialRequisition.APPROVE`), each role set read directly from the exact original check and proven identical by equivalence test; remaining 112 occurrences explicitly classified (FALSE POSITIVE/BUSINESS LOGIC/LEGACY COMPATIBILITY/DEFERRED to 001C/001D/001E) — zero unexplained | 2026-09-21 | **CLOSED — PASS** (route-layer migration only; data-scope/SoD/approval-authority enforcement, CEO/admin split, and all 26-domain business features remain separately unauthorized) | LOW-MEDIUM (5 real enforcement-site changes, each proven behaviorally identical to its predecessor by equivalence test before being trusted; zero data-scope/SoD/approval-authority logic touched) | `server/domain.js` (5 new privileges, 4 new duties, 5 business-role duty-grant updates, 3 enforcement-site edits), `server/server.js` (1 enforcement-site edit) | `ARCH-2026-001B-PREIMPLEMENTATION-BASELINE.md`, `ARCH-2026-001B-LEGACY-AUTH-INVENTORY.md`, `ARCH-2026-001B-ROUTE-AUTH-MIGRATION-REPORT.md`, `ARCH-2026-001B-ROUTE-AUTH-TEST-REPORT.md`, `ARCH-2026-001B-REGRESSION-REPORT.md`, `ARCH-2026-001B-CHANGELOG.md` |
| ARCH-2026-001C | Change (data-scope enforcement) | Data Scope Enforcement — centralized `hasScopeAccess()`/`resolveResourceScope()`/`assertScopeAccess()` engine over the 4 scope dimensions with REAL data-model support (Project, Site, Customer, Branch — confirmed by inspection; Warehouse/Cost-Centre/Profit-Centre/Department confirmed ABSENT from the data model, not invented); full inventory of the 78 checks ARCH-2026-001B deferred here (10 migrated with algebraic equivalence proofs, 68 explicitly deferred with reason, 0 unexplained); real cross-project protection proven via 5 live-created resources (tasks/timesheets/risk-register/AR-invoice/material-requirements) through direct API calls, plus a real multi-hop PaymentRequest→JournalEntry→Project inheritance chain proven against an actual posted supplier bill | 2026-09-21 | **CLOSED — PASS** (data-scope enforcement for the 4 real dimensions only; Warehouse/CC/PC/Department scope, the remaining 68 checks, SoD, Approval Authority, CEO/admin split, and all 26-domain business features remain separately unauthorized/deferred) | LOW-MEDIUM (10 real enforcement-site changes, each proven algebraically and by test equivalent to its predecessor; zero SoD/approval-authority/existing-scope-function logic touched) | `server/domain.js` (new Data Scope section — `hasScopeAccess`, `resolveResourceScope`, `assertScopeAccess`), `server/server.js` (10 enforcement-site edits) | `ARCH-2026-001C-DATA-SCOPE-AUDIT.md`, `ARCH-2026-001C-DATA-SCOPE-IMPLEMENTATION.md`, `ARCH-2026-001C-DATA-SCOPE-TEST-REPORT.md`, `ARCH-2026-001C-SECURITY-REPORT.md`, `ARCH-2026-001C-REGRESSION-REPORT.md`, `ARCH-2026-001C-OPEN-DECISIONS.md` |
| ARCH-2026-001C-F | Change (data-scope closure & residual migration) | Data-Scope Closure & Residual Migration — independently re-verified the 68 (found: 70) checks deferred by ARCH-2026-001B/closed by ARCH-2026-001C; migrated 32 `isProjectManagerOf()` call sites to the centralized `hasScopeAccess()` engine, LIVE-CAUGHT a real equivalence defect in 9 of the 32 (a blind substitution would have granted every non-owning, non-fullAccess role access to another project's financial reports/exports) before any formal test existed, root-caused and reverted all 9 to the safe primitive, re-verified with 33 new tests; closed ARCH-2026-001C's 2 disclosed gaps (report/export scope testing, browser UAT — 3 of 4 requested roles exercised through a real browser session, Branch-scoped disclosed as untestable with real seed data) | 2026-09-21 | **CLOSED — PASS WITH DOCUMENTED DEFERMENTS** (23 of 32 residual checks now centralized; 9 correctly kept on the direct primitive; 3 Sales/Lead-ownership checks correctly left as distinct, correct legacy logic; Warehouse/CC/PC/Department scope remains OPEN; SoD, Approval Authority, CEO/admin split, and all 26-domain business features remain separately unauthorized) | LOW-MEDIUM (23 real enforcement-site changes kept + 9 reverted after live-caught defect; zero SoD/approval-authority logic touched; one real, disclosed, fixed, re-tested defect) | `server/server.js` only (32 substitutions applied, 9 reverted, 1 explanatory comment block — `server/domain.js` untouched this CR) | `ARCH-2026-001C-F-AUDIT.md`, `ARCH-2026-001C-F-MIGRATION.md`, `ARCH-2026-001C-F-REPORT-EXPORT-SECURITY.md`, `ARCH-2026-001C-F-BROWSER-UAT.md`, `ARCH-2026-001C-F-SECURITY-REPORT.md`, `ARCH-2026-001C-F-REGRESSION-REPORT.md`, `ARCH-2026-001C-F-OPEN-DECISIONS.md` |
| ARCH-2026-001D | Change (Segregation of Duties enforcement) | SoD Enforcement — audited and reused the existing `checkSoD()`/`DB.sodRules`/`DB.sodExceptions` framework (4 pre-existing reference rules, unchanged); found the ONE real, evidenced P2P capability overlap in the current role model (`{Admin,CEO}` hold both Vendor-Master-create AND Payment-Execute; `{Admin,CEO,Purchase}` hold both GRN-create AND matched-Bill-create) and implemented 2 NEW preventive rules (SOD-5 Vendor Maintenance vs Payment Execution, SOD-6 GRN Recording vs Matched Bill Creation) with NO automatic Admin/CEO exemption; built a detective conflict scanner and an auditable, non-self-grantable exception mechanism; proved the full real P2P chain (Vendor→PO→GRN→Bill→PaymentRequest→Execute) both blocks the conflicting combination and allows the clean one, live, through both an engine test and a real browser session | 2026-09-21 | **CLOSED — PASS** (2 new preventive SoD rules for the one evidenced P2P gap; the 4 existing reference rules unchanged; Approval Authority, CEO/Admin separation, and all 26-domain business features remain separately unauthorized; the CEO/Admin exemption question for the 2 new rules is an explicit OPEN management decision, not silently resolved) | LOW-MEDIUM (2 new preventive checks inside 2 existing high-risk functions, both reusing the pre-existing `checkSoD()` evaluator; zero change to any existing hardcoded SoD/payment-control logic; one real, disclosed, fixed startup-compliance defect) | `server/domain.js` (`RBAC_SOD_RULES_SEED` extended +2, `detectSoDConflicts`/`grantSoDException`/`revokeSoDException` new, 2 new preventive checks inside `executePaymentRequest()`/`draftSupplierInvoiceFromPO()`), `server/server.js` (4 new SoD admin/diagnostic routes), `tests/erp_arch_2026_001a_rbac_foundation_tests.js` (1 assertion updated, fully disclosed) | `ARCH-2026-001D-SOD-AUDIT.md`, `ARCH-2026-001D-SOD-RULE-MATRIX.md`, `ARCH-2026-001D-SOD-IMPLEMENTATION.md`, `ARCH-2026-001D-SOD-SECURITY-REPORT.md`, `ARCH-2026-001D-SOD-BROWSER-UAT.md`, `ARCH-2026-001D-SOD-REGRESSION-REPORT.md`, `ARCH-2026-001D-SOD-OPEN-DECISIONS.md` |
| ARCH-2026-001E | Change (Approval Authority & Workflow Enforcement) | Approval Authority — audited all 7 existing approval mechanisms (PO, Quotation Discount, Payment Request approval, Payment execution, Change Request, BOM, Design Review); found the ONE real, evidenced gap (Design Review had NO self-approval check, unlike every other comparable function) and fixed it using the identical existing convention; built a centralized, READ-ONLY `resolveApprovalAuthority()` diagnostic composing base-permission+scope+SoD+approval-authority for all 4 transaction types with a real approval mechanism, mirroring (never replacing) each one's existing, unmodified enforcement function; proved concurrency-safety (2 simultaneous approvers, exactly 1 succeeds) using the pre-existing state guard, unmodified | 2026-09-21 | **CLOSED — PASS** (1 real self-approval gap fixed for Design Review; 1 new read-only diagnostic endpoint; all 4 pre-existing amount-threshold/role-tier tables unchanged; the 2 pre-existing OPEN threshold-finalisation decisions re-confirmed, not resolved; no new SoD rule added; CEO/Admin separation and all 26-domain business features remain separately unauthorized) | LOW (1 real function-body fix — `reviewDesign()` — plus 1 new read-only function and 1 new read-only route; zero change to any existing approval enforcement function or threshold table; zero new defects found beyond the one deliberate fix) | `server/domain.js` (`reviewDesign()` self-approval check added, `resolveApprovalAuthority()`/`APPROVAL_TRANSACTION_TYPES` new), `server/server.js` (1 new read-only route: `GET /api/approval-authority/check`) | `ARCH-2026-001E-APPROVAL-AUDIT.md`, `ARCH-2026-001E-APPROVAL-MATRIX.md`, `ARCH-2026-001E-IMPLEMENTATION.md`, `ARCH-2026-001E-SECURITY-REPORT.md`, `ARCH-2026-001E-BROWSER-UAT.md`, `ARCH-2026-001E-REGRESSION-REPORT.md`, `ARCH-2026-001E-OPEN-DECISIONS.md` |
| ARCH-2026-002 Phase 0 | Audit + Design (26-Domain Business Expansion — Phase 0 only) | Current-state audit of all 26 frozen domains against the live codebase (fresh Dependency Map, Transaction Ownership Matrix across 35 transaction types, 12-chain End-to-End Process Trace, Security Baseline across 18 domains); found 1 real duplicate-ownership conflict (Bank Reconciliation, 2 parallel live subsystems), 2 process-chain PARTIALs (Lead-to-Quotation's missing BOM/BOQ step; Plan-to-Produce's missing Demand trigger), 1 MODERATE and 1 LOW security finding (Reporting cross-project data leak; QC checklist audit-log gap) — none CRITICAL, no stop triggered; corrected domain #18's classification from the prior PARTIAL (predating ARCH-2026-001A-E) to EXISTING; produced a full 6-wave plan and a detailed Wave 1 design; 8 open management decisions recorded, none resolved | 2026-09-22 | **CLOSED — PASS** (audit + design only; zero application code changed; Wave 1 implementation NOT authorized by this Phase 0) | N/A (no code changed — read-only audit and design work only) | None — zero files in `server/`, `client_secure/`, or `server/db.json` modified; only new `ARCH-2026-002-*.md` documents added | `ARCH-2026-002-PHASE-0-AUDIT.md`, `ARCH-2026-002-MODULE-MATRIX.md`, `ARCH-2026-002-TRANSACTION-OWNERSHIP.md`, `ARCH-2026-002-PROCESS-TRACE.md`, `ARCH-2026-002-DEPENDENCY-MAP.md`, `ARCH-2026-002-DATA-MODEL-GAP-REGISTER.md`, `ARCH-2026-002-WAVE-PLAN.md`, `ARCH-2026-002-WAVE-1-DESIGN.md`, `ARCH-2026-002-OPEN-DECISIONS.md`, `ARCH-2026-002-SECURITY-BASELINE.md` |
| ARCH-2026-002 Wave 1 | Change (Enterprise Foundation Hardening — Sales/Estimation/Project/Master Data/Reporting) | Implemented the 2 items this Wave explicitly authorized: (1) Reporting & Analytics cross-project data-scope fix (`projectBudgetVarianceReport()` now filters via the existing `hasScopeAccess()` engine); (2) Bank Reconciliation consolidation — the 1 real duplicate found in Phase 0 (`bankStatementLines` legacy vs `bankImportLines` newer) closed to ONE authoritative engine, generic-CSV and ICICI formats both now adapters feeding it, historical records migratable via a new idempotent, non-destructive, Admin/CEO-gated migration function (not run against production). 4 other Phase-0-flagged items (Sales/CRM RBAC-ID cleanup, BOM pre-Won sequencing, Plan-to-Produce Demand trigger, QC audit-log gap) explicitly deferred with stated reasons, none silently implemented or dropped. 1 real client-side defect (false-positive balance-mismatch badge) found and fixed live during this pass's own browser UAT | 2026-09-22 | **CLOSED — PASS** (2 authorized items implemented and tested; 4 deferred items explicitly recorded, not implemented; Wave 2 NOT authorized) | LOW (both changes are additive/consolidating over existing, tested engines — no new authorization mechanism, no new GL/inventory/numbering engine; role gates on every existing route left byte-identical; one real duplicate-ownership conflict closed, a net risk reduction) | `server/domain.js` (`parseGenericBankCsv` new; `createBankImportBatch`/`bankImportReconciliationSummary` extended; `migrateLegacyBankStatementLines` new; `importBankStatement`/`matchBankStatementLine`/`unmatchBankStatementLine`/`bankReconciliationStatus` rewritten as compatibility wrappers; `projectBudgetVarianceReport` scope-filtered), `server/server.js` (1 new route, 1 call-site update), `client_secure/index.html` (1-line balance-mismatch badge fix), `tests/erp_arch_2026_002_wave1_tests.js` (new, 42/42 PASS) | `WAVE1_IMPLEMENTATION_SCOPE.md`, `WAVE1_CHANGELOG.md`, `WAVE1_TRANSACTION-OWNERSHIP.md`, `WAVE1_SECURITY-RESULTS.md`, `WAVE1_TEST-RESULTS.md`, `WAVE1_BROWSER-UAT.md`, `WAVE1_REGRESSION.md`, `WAVE1_ACCEPTANCE.md` |
| ARCH-2026-002 Wave 2 Phase 0 | Audit + Design (Operations Domain Readiness — Phase 0 only) | Current-state audit of the 6 Wave 2 Operations domains (Procurement, Inventory, Manufacturing, Job Work, Site Execution, Quality) against the live codebase — re-confirmed all central engines (GL/inventory/clearing/numbering/authorization/scope/SoD/approval/audit/project-cost) remain singular, zero shadow writers, zero duplicate/conflicting transaction ownership; found 1 real, substantive gap not previously documented — 3 high-risk operational chains (Manufacturing Production-Order execution, Job Work dispatch-to-settlement, Quality/QC self-attestation) have ZERO SoD coverage, a single authenticated role-gated user can complete each entire chain alone (reported in full, not CRITICAL by this engagement's own bar — no auth bypass, no identity forgery — not fixed, per this CR's own Phase-0-only rule); re-confirmed Plan-to-Produce's Demand-trigger gap and identified the smallest legitimate extension point (`DB.materialRequirements`); found Production Output/Scrap have zero inventory effect (deliberate, disclosed prior scope decision); confirmed Gate Pass and Transporter/Vehicle master absent, Inspection/NCR absent as a distinct entity; produced a full data-model gap register, 7 new/carried management decisions (W2-1 through W2-7), a dependency map, and a detailed Wave 2 design with a proposed (not mandated) 2A-2F sub-wave sequence | 2026-09-22 | **CLOSED — PASS WITH DOCUMENTED DEFERMENTS** (7 Wave-2-affecting management decisions remain open, none resolved; Wave 2 implementation NOT authorized by this Phase 0) | N/A (no code changed — read-only audit and design work only) | None — zero files in `server/`, `client_secure/`, or `server/db.json` modified; only new `ARCH-2026-002-WAVE-2-*.md` documents added | `ARCH-2026-002-WAVE-2-PHASE-0-AUDIT.md`, `ARCH-2026-002-WAVE-2-MODULE-MATRIX.md`, `ARCH-2026-002-WAVE-2-TRANSACTION-OWNERSHIP.md`, `ARCH-2026-002-WAVE-2-CENTRAL-ENGINE-AUDIT.md`, `ARCH-2026-002-WAVE-2-PROCESS-TRACE.md`, `ARCH-2026-002-WAVE-2-SECURITY-BASELINE.md`, `ARCH-2026-002-WAVE-2-DATA-MODEL-GAP-REGISTER.md`, `ARCH-2026-002-WAVE-2-DECISIONS.md`, `ARCH-2026-002-WAVE-2-DEPENDENCY-MAP.md`, `ARCH-2026-002-WAVE-2-DESIGN.md` |
| ARCH-2026-002 Wave 2 | Change (Operations Control, SoD — Manufacturing/Job Work/Quality) | Implemented the 5 SoD rules this Wave's own authorizing text concretely specified (§5/§8/§9/§11): SOD-7 (Production Order creator≠completer), SOD-8 (Job Work Order creator≠linked Supplier Bill creator — the explicitly-named "linked-document navigation" bypass), SOD-9 (Job Work Order creator≠settlement actor across return/scrap/direct-dispatch), SOD-10 (QC checklist creator≠result submitter, closing the self-attestation gap that gates Handover), SOD-11 (CAPA effectiveness-checker≠closer) — all via the existing `checkSoD()`/`DB.sodRules` engine, no second framework, no automatic Admin/CEO exemption (matching the SOD-5/SOD-6 precedent). Also closed W2-2 (QC checklist creation audit-log gap). Found and fixed a real defect during implementation: a bare `logAudit()` call before an `{ok:false}` return is silently rolled back by `withTransaction()`'s snapshot-restore — corrected via the established `durableFailureAudit` mechanism across all 8 new call sites (a related pre-existing instance in SOD-6 disclosed, not fixed, out of scope). Found and fixed 4 real, disclosed test-fixture regressions (pre-existing tests using one actor for what are now maker≠checker pairs) — same actor-fix precedent as ARCH-2026-001D, no assertion weakened. 6 items (W2-1/3/5/6/7, Procurement/Inventory SoD) explicitly NOT authorized by this CR's text, verified where asked, deferred, not built | 2026-09-22 | **CLOSED — PASS** (every item this CR's own text authorized was built, tested, and browser-UAT'd; every item left open by the text was correctly deferred, not assumed; Wave 3 NOT authorized) | LOW (5 new guard clauses inside existing, already-tested functions, reusing the proven `checkSoD()` engine exactly; zero new route, zero new collection, zero new engine; every EXISTING passing scenario unaffected — only previously-open self-dealing paths closed) | `server/domain.js` (`RBAC_SOD_RULES_SEED` +5; `completeProductionOrder`, `draftSupplierInvoice`, `draftSupplierInvoiceFromPO`, `returnFromJobWorker`, `recordJobWorkScrap`, `directDispatchFromJobWorker`, `createQCChecklist`, `submitQCResult`, `closeCAPACase`), `tests/erp_arch_2026_002_wave2_tests.js` (new, 26/26 PASS), 4 pre-existing test files corrected (`erp_arch_2026_001d_sod_tests.js`, `erp_def_2026_001_qc_dashboard_tests.js`, `erp_phase39_manufacturing_jobwork_tests.js`, `erp_audit_p0_tests.js`) | `WAVE2_IMPLEMENTATION_SCOPE.md`, `WAVE2_CHANGELOG.md`, `WAVE2_SECURITY-RESULTS.md`, `WAVE2_SOD-RESULTS.md`, `WAVE2_ACCOUNTING-RESULTS.md`, `WAVE2_INVENTORY-RESULTS.md`, `WAVE2_PROJECT-COST-RESULTS.md`, `WAVE2_TEST-RESULTS.md`, `WAVE2_BROWSER-UAT.md`, `WAVE2_REGRESSION.md`, `WAVE2_ACCEPTANCE.md` |
| ARCH-2026-002 Wave 3 Phase 0 | Audit + Design (Finance/Controlling/Treasury/Assets Readiness — Phase 0 only) | Current-state audit of the 4 Wave 3 domains against the live codebase — re-confirmed the single GL writer, single reversal engine, single clearing engine, and the Wave-1-consolidated single Bank Reconciliation engine all remain intact after both Wave 2 passes; found Cost Centre is a real but narrow posting dimension (2 of ~13 paths), Profit Centre is confirmed master-data-only (zero transaction usage); found 2 real, disclosed SoD-coverage gaps (Bank Import→Reconciliation identity separation; Fixed Asset full-lifecycle identity separation, the latter re-confirming a gap the original 46-phase forensic audit had already flagged); found Petty Cash is an operational register, not a true GL subledger, and the "₹10,000/day" cash limit is enforced per-transaction not as a daily aggregate; **found and reported a real documentation-vs-code discrepancy** — the 46-phase forensic audit's claim that GL account 1400 is shared between Inventory and Fixed Asset postings does not match current code (1200 vs. 1400 are cleanly separated), reported per this CR's own instruction not to silently resolve such conflicts; produced a full data-model gap register, 9 management decisions (1 closed-by-evidence, 8 new/carried), a dependency map, and a detailed Wave 3 design with a proposed (not mandated) 3A-3E sub-wave sequence | 2026-09-22 | **CLOSED — PASS WITH DOCUMENTED DEFERMENTS** (9 Wave-3-affecting management decisions remain open or newly recorded, none resolved; 1 prior open item closed by this pass's own evidence; Wave 3 implementation NOT authorized by this Phase 0) | N/A (no code changed — read-only audit and design work only) | None — zero files in `server/`, `client_secure/`, or `server/db.json` modified; only new `ARCH-2026-002-WAVE-3-*.md` documents added | `ARCH-2026-002-WAVE-3-PHASE-0-AUDIT.md`, `ARCH-2026-002-WAVE-3-MODULE-MATRIX.md`, `ARCH-2026-002-WAVE-3-TRANSACTION-OWNERSHIP.md`, `ARCH-2026-002-WAVE-3-CENTRAL-ACCOUNTING-AUDIT.md`, `ARCH-2026-002-WAVE-3-CONTROLLING-AUDIT.md`, `ARCH-2026-002-WAVE-3-TREASURY-AUDIT.md`, `ARCH-2026-002-WAVE-3-ASSET-AUDIT.md`, `ARCH-2026-002-WAVE-3-PROCESS-TRACE.md`, `ARCH-2026-002-WAVE-3-SECURITY-BASELINE.md`, `ARCH-2026-002-WAVE-3-DATA-MODEL-GAP-REGISTER.md`, `ARCH-2026-002-WAVE-3-DEPENDENCY-MAP.md`, `ARCH-2026-002-WAVE-3-DECISIONS.md`, `ARCH-2026-002-WAVE-3-DESIGN.md` |
| ARCH-2026-002 Wave 3 | Change (Finance/Controlling/Treasury/Asset Hardening Verification) | Implemented the ONLY item this Wave's own scope-classification document (`WAVE3_IMPLEMENTATION_SCOPE.md`, produced by a human engineer before implementation began, per this CR's §5 policy-classification requirement) found independently authorized: audit-confirmation, hardening verification, and genuinely new regression coverage for EXISTING, already-correct behavior. Built real new Fixed Asset lifecycle edge-case test coverage (partial depreciation — a second, distinct proration scenario; a fully-depreciated asset with floor enforcement; action on a historical/2019 asset; reversal of a lifecycle transaction; a genuine `Promise.all` concurrency-shaped test on the same asset by two different actors). Found and fixed 2 real, disclosed defects while building that coverage: (1) `reverseEntry()` allowed reversing a Fixed Asset Capitalization/Disposal GL entry, silently desynchronizing the Fixed Asset Register from the GL with no compensating mechanism — now blocked, using the same `durableFailureAudit` pattern the function already uses for its other guards; (2) `disposeFixedAsset()` crashed with a generic GL-validation error when disposing an asset with zero accumulated depreciation (an entirely ordinary scenario) — now handled via the same conditional-line pattern the function already uses for `proceeds`/`gain`. Re-confirmed live: Bank Reconciliation single-engine consolidation (Wave 1) intact end to end; Payment Request 3-person maker/checker/executor separation intact end to end; Cost Centre tagging/filtering unchanged; `projectFinancial360()`'s Depreciation/Job-Work-Adjustment sweep unchanged and correct; all 11 existing SoD rules and all 4 approval-authority tables unmodified. The 7 items classified IMPLEMENTATION BLOCKER by the scope-classification document (W3-2 through W3-8, each depending on an unresolved management decision) and W3-9 (labeling only, also blocked per that document's own stricter reading of this CR's "where authorized" conditional language) were explicitly NOT implemented — each individually reported with a full 7-point STOP structure in `WAVE3_IMPLEMENTATION_SCOPE.md`, not silently dropped or implemented anyway | 2026-09-23 | **CLOSED — PASS WITH DOCUMENTED DEFERMENTS** (every item this CR's own authorized scope covered was completed in full — new hardening test coverage, 2 real defects found and fixed, full re-verification of Treasury/Controlling/Accounting/Project-Cost/Reporting; the 7 IMPLEMENTATION BLOCKER items + W3-9 remain genuinely deferred, none resolved; Wave 4/further Wave 3 scope NOT authorized) | LOW (2 narrow, defensive fixes inside 2 already-existing, already-role-gated functions — a new guard clause and a conditional line-push, both reusing established codebase patterns; zero new route, zero new collection, zero new engine, zero new RBAC/SoD/scope/approval capability; every EXISTING passing scenario unaffected) | `server/domain.js` (`reverseEntry()` — 1 new guard clause; `disposeFixedAsset()` — 1 line changed from unconditional to conditional), `tests/erp_arch_2026_002_wave3_tests.js` (new, 70/70 PASS) | `WAVE3_IMPLEMENTATION_SCOPE.md` (pre-existing, frozen), `WAVE3_CHANGELOG.md`, `WAVE3_SECURITY-RESULTS.md`, `WAVE3_SOD-RESULTS.md`, `WAVE3_CONTROLLING-RESULTS.md`, `WAVE3_TREASURY-RESULTS.md`, `WAVE3_ASSET-RESULTS.md`, `WAVE3_ACCOUNTING-RESULTS.md`, `WAVE3_PROJECT-COST-RESULTS.md`, `WAVE3_REPORTING-RESULTS.md`, `WAVE3_TEST-RESULTS.md`, `WAVE3_BROWSER-UAT.md`, `WAVE3_REGRESSION.md`, `WAVE3_ACCEPTANCE.md` |
| ARCH-2026-002 Wave 4 Phase 0 | Audit + Design (Service & After-Sales, Reporting & Analytics deepened — Phase 0 Part B only) | Current-state audit of the 9 named Wave 4 capabilities (Customer 360, Warranty, Complaints, Service Tickets, Service Visits, AMC, AMC Schedule, Service Billing, CAPA) against the live codebase's already-built Phase 10 After-Sales block (`server/domain.js:7301`-`8065`) — confirmed ALL 9 are EXISTING (not greenfield, per the governing CR's own explicit warning), zero ABSENT/DUPLICATE/CONFLICTING; re-verified and precisely refined the original Phase 0's "Service Billing" finding — confirmed a single AR/billing engine, but with Chargeable Service routing through `draftCustomerInvoice()` and AMC Billing routing through the shared `createDraft()` primitive one level below (a reasoned, evidenced distinction for its own deferred-revenue credit account, not a second engine); traced 4 chains (Service-to-Cash, Warranty, AMC, Complaint/Ticket control) all WORKING; re-confirmed SOD-11 (CAPA effectiveness-checker≠closer, built by this same engagement's own Wave 2) intact and unmodified; found and reported (not fixed) 7 real, narrow gaps — uneven SoD coverage across Complaint/Ticket/AMC (role-tier only, no identity checks, unlike CAPA/Service-Visit), Service Labour Rate Card (POL-06) not wired into the actual posting function, `technicianId` accepted but never persisted, Service Labour not Cost-Centre-tagged (extends Wave 3's own pre-existing Controlling-coverage finding), unguarded duplicate-billing on both Service Invoice and AMC Billing drafts, 6 functions missing `logAudit()` calls, and `createCAPACase()` performing no existence check on its source Complaint/Ticket IDs; live-tested cross-customer data-scope resistance (a Sales user correctly denied another customer's After-Sales summary and warranty list via direct API); produced a full data-model gap register (9 items, none proposing a second engine), a dependency map (confirmed none of Wave 3's 9 open decisions block Wave 4), 11 new management decisions (W4-1 through W4-11), and a detailed Wave 4 design with a proposed (not mandated) 4A-4E sub-wave sequence | 2026-09-23 | **CLOSED — PASS WITH DOCUMENTED DEFERMENTS** (11 Wave-4-specific management decisions remain open, none resolved; Wave 4 implementation NOT authorized by this Phase 0) | N/A (no code changed — read-only audit and design work only) | None — zero files in `server/`, `client_secure/`, or `server/db.json` modified; only new `ARCH-2026-002-WAVE-4-*.md` documents added | `ARCH-2026-002-WAVE-4-PHASE-0-AUDIT.md`, `ARCH-2026-002-WAVE-4-MODULE-MATRIX.md`, `ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md`, `ARCH-2026-002-WAVE-4-PROCESS-TRACE.md`, `ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md`, `ARCH-2026-002-WAVE-4-DATA-MODEL-GAP-REGISTER.md`, `ARCH-2026-002-WAVE-4-DEPENDENCY-MAP.md`, `ARCH-2026-002-WAVE-4-DECISIONS.md`, `ARCH-2026-002-WAVE-4-DESIGN.md` |
| ARCH-2026-002 Wave 4 Decision Collection | Management Decision Collection + Scope Authorization Gate (Wave 4 — no application code authorized) | Attempted to collect actual management answers for all 12 W4 decisions via a formal, business-language Questionnaire (`ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`'s 2026-09-26 update) — **zero were supplied anywhere in this engagement to date**, so per this CR's own explicit "do not invent them" instruction, all 12 remain OPEN, none decided on management's behalf. Restructured every decision into the exact per-option-consequence format this CR required, without altering the prior narrative record (preserved as history). Re-verified (not assumed) that zero decisions, under any of their own named options, would require a new engine. Re-ran the regression battery specifically to check this CR's own "71 supersedes 70" premise and found it does NOT hold: a second independent fresh-server run of `erp_arch_2026_002_wave3_tests.js` produced **70/70 again**, not 71 — investigated to the mechanism level (a genuinely data-dependent `if(inst)` branch in the suite's own [C1] section) but the deeper root cause (why a fresh, correctly-isolated server would ever have a non-empty `DB.installations` before this specific test creates one) remains honestly unresolved, disclosed as a bounded test-determinism anomaly with zero product-defect impact, not silently normalized toward either number. Produced all 5 required deliverables (Decision Impact Matrix, Final Implementation Scope, Final Sub-wave Plan — reviewed and re-confirmed unchanged from the prior pass since no decisions arrived to change anything, Final Acceptance Criteria, Scope Authorization Gate synthesis) plus updates to the Management Decision Register, the Decisions document, and this register | 2026-09-26 | **CLOSED — C. MANAGEMENT DECISIONS OPEN — NOT READY** (0/12 decisions supplied; 2 of 12 numbered decisions contain an IMPLEMENT-recommended, zero-policy-content sub-part, recommended only, not authorized; the remaining 11-and-a-fraction are wholly POLICY DEPENDENT; Wave 4 implementation authorization explicitly NOT GRANTED) | N/A (no code changed — decision-collection and scope-authorization documentation only) | None — zero files in `server/`, `client_secure/`, or `server/db.json` modified; only new/updated `.md` documents | `ARCH-2026-002-W4-DECISION-IMPACT-MATRIX.md`, `ARCH-2026-002-WAVE-4-FINAL-IMPLEMENTATION-SCOPE.md`, `ARCH-2026-002-W4-FINAL-SUBWAVE-PLAN.md`, `ARCH-2026-002-WAVE-4-FINAL-ACCEPTANCE-CRITERIA.md`, `ARCH-2026-002-W4-SCOPE-AUTHORIZATION-GATE.md`; updated (not overwritten) `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`, `ARCH-2026-002-WAVE-4-DECISIONS.md` |
| ARCH-2026-002 Roadmap Resequencing | Roadmap Resequencing + Deferred-Wave Control Gate (audit/design only, no implementation) | Parked Wave 5 (unchanged — blocked on 3 pre-existing decisions) and Wave 4 (unchanged — 0/12 decisions, per the immediately-prior gate) without reopening either; refreshed the 26-domain matrix against every pass since the original Phase 0, finding 3 domains improved since baseline (Treasury's Bank-Reconciliation "duplicate ownership" concern CLOSED BY EVIDENCE; Reporting's cross-project leak CLOSED by Wave 1; Quality's audit-log gap CLOSED by Wave 2) and zero regressed; re-confirmed all 13 foundational engines remain singular, zero STOP condition; built a 26-domain dependency graph identifying 12 domains with zero dependency on any Wave-4/5 open item, where independent architecture work may safely proceed; noted `ARCH-2026-002-ARCHITECTURE-FREEZE.md` (asked for by this CR's own §3) does not exist in this repository — `ARCH-2026-001-ARCHITECTURE-FREEZE.md` was read and used instead, disclosed as a substitution rather than silently assumed; **investigated the Wave-3-suite 70/71 test-count discrepancy further** (a 3rd independent fresh-server run performed live, yielding 70 again — cumulative record 71/70/70 across 3 runs) and ruled out 6 specific candidate causes by direct source inspection (seed literal, push-site, test-file behavior, demo-seed gating, port/directory randomization scope, deterministic first-boot logic) without finding the true root cause — classified **UNEXPLAINED**, not silently normalized to either number, and escalated into a dedicated future investigation activity rather than left an open loose end; produced a Candidate Register (7 items) and selected the lowest-risk, most-evidenced one (test-infrastructure determinism) as the next activity, explicitly not ranked "best," with a full Next-Activity Gate (purpose/scope/non-scope/stop-conditions) defining but NOT executing that future investigation | 2026-09-26 | **CLOSED — ROADMAP READY WITH DOCUMENTED DEFERMENTS** (Wave 4/5 remain exactly as parked/open as before this gate; one independent architecture activity identified and gated, not started; zero implementation of any kind occurred) | N/A (no code changed — audit, dependency-mapping, and roadmap documentation only) | None — zero files in `server/`, `client_secure/`, or `server/db.json` modified; only new `.md` documents | `ARCH-2026-002-ROADMAP-RESEQUENCING-AUDIT.md`, `ARCH-2026-002-ROADMAP-CANDIDATE-REGISTER.md`, `ARCH-2026-002-RESEQUENCED-ROADMAP.md`, `ARCH-2026-002-DEPENDENCY-GRAPH.md`, `ARCH-2026-002-FOUNDATIONAL-ENGINE-STATUS.md`, `ARCH-2026-002-NEXT-ACTIVITY-GATE.md` |
| ARCH-2026-002 Wave 4 Scope Gate | Decision Resolution + Scope Gate (Wave 4 Management Decision + Implementation Scope Gate — no application code authorized) | Two-part CR: **Part A** re-verified all 9 Wave 3 (W3-1..W3-9) decisions against current code without resolving any on management's behalf (7 remain OPEN, 1 DEFERRED), and found/reclassified 1 stale item (`ARCH-2026-002-OPEN-DECISIONS.md` item 6, Bank Reconciliation "duplicate ownership," dated the day before Wave 1's own consolidation shipped) as **CLOSED BY EVIDENCE**, preserving the original finding as history. **Part B** produced a full Wave 4 (Service & After-Sales) management-decision-and-scope-freeze gate: catalogued and formally recorded all 11 existing W4 decisions plus 1 newly-surfaced omission (**W4-12**, Site/Branch scope for Service Visit — a Data-Model Gap Register item that had never been given its own decision entry, caught by this CR's own explicit "ensure no Phase 0 finding is accidentally omitted" instruction) — all 12 left OPEN, none decided on management's behalf; dispositioned all 7 named gaps (+1 newly-surfaced) as 2 **IMPLEMENT**-recommended-for-a-future-CR (missing audit-log calls on 6 functions; CAPA source-ID existence validation — both zero business-policy content) and 10 **POLICY DEPENDENT** (explicitly declining to default even low-effort items like Cost-Centre/technician tagging into scope, per this CR's own literal "do not automatically propagate merely because the architecture supports it elsewhere" caution); produced a full Implementation Scope classification, Acceptance Criteria for the 2 IN-SCOPE items, a Sub-wave Plan reviewing (and partially MODIFYING) the Phase 0's proposed 4A-4E sequence, and Dependency/Security/Accounting/Data-Model impact analyses confirming zero new engine, zero shadow financial model, and zero Wave-3-decision blocker anywhere in scope. Investigated (not silently normalized) a regression-count discrepancy (`erp_arch_2026_002_wave3_tests.js` scored 71/71 this run vs. the documented 70/70) — root-caused to a genuinely data-dependent conditional test branch (an Installation record's presence/absence in seed data), not a code change or a weakened test; the extra result is objectively stronger, not a regression. Zero application code was written; zero orphaned test servers remained at completion | 2026-09-26 | **CLOSED — READY WITH DOCUMENTED DEFERMENTS** (all 12 W4 decisions + 7 of 9 W3 decisions remain OPEN, none resolved by this CR; Wave 4 implementation authorization explicitly NOT GRANTED, per this CR's own §24/§28 rule that scope/design/decision-cataloguing work never itself implies authorization) | N/A (no code changed — decision-resolution and scope-gate documentation only) | None — zero files in `server/`, `client_secure/`, or `server/db.json` modified; only new/updated `.md` documents | `ARCH-2026-002-W3-DECISION-RESOLUTION.md`, `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`, `ARCH-2026-002-W4-GAP-DISPOSITION.md`, `ARCH-2026-002-WAVE-4-IMPLEMENTATION-SCOPE.md`, `ARCH-2026-002-WAVE-4-ACCEPTANCE-CRITERIA.md`, `ARCH-2026-002-WAVE-4-SUBWAVE-PLAN.md`, `ARCH-2026-002-W4-DEPENDENCY-IMPACT.md`, `ARCH-2026-002-W4-SECURITY-IMPACT.md`, `ARCH-2026-002-W4-ACCOUNTING-IMPACT.md`, `ARCH-2026-002-W4-DATA-MODEL-IMPACT.md`, `ARCH-2026-002-W4-SCOPE-GATE.md`; updated (not overwritten) `ARCH-2026-002-WAVE-3-DECISIONS.md`, `ARCH-2026-002-OPEN-DECISIONS.md`, `ARCH-2026-002-WAVE-4-DECISIONS.md` |

**Note:** during this item's audit-first step, a parallel/concurrent session's own independent phase-
numbering track was discovered on this same repository (its own Phase 42 — PO/commitment atomicity
fix; its own Phase 43 — call-graph atomicity audit, 4 real CRITICAL production-blocking defects found
and fixed). Both are real, evidenced, house-style-consistent work, not logged here (they predate this
register and belong to the other session's own tracking) — noted for coordination awareness only. See
`ARCH-2026-001-CURRENT-STATE-MAP.md` §3.

**Forensic follow-up (2026-09-21):** a full 121-collection structural diff of `server/db.json` against
its own pre-change snapshot (`server/db.json.bak`) found exactly one difference — a single new
`loginHistory` entry (a successful CEO login, 2026-09-19T09:24:59.832Z). ERP-059B impact: **NONE**
(zero business/accounting/inventory records changed). Full detail:
`ARCH-2026-001-DB-FORENSIC-AND-DOMAIN-RECONCILIATION.md`. The 26-domain matrix's summary section also
had a genuine reconciliation bug (13-domain list mislabeled "17" in closing prose, omitting domain
#16, producing an apparent 29-vs-26 mismatch) — corrected in place in `ARCH-2026-001-26-DOMAIN-MATRIX.md`;
no domain's individual classification changed, only the summary arithmetic.

**Provenance investigation (2026-09-21, same day):** exhausted every readily-available forensic
source on this machine (process table, Windows Security event log, PowerShell/bash command history,
directory/session timestamp correlation, and a full-timestamp parse of every Claude Code session
transcript on the system, including the two sessions most likely to be responsible) — none place any
identifiable person, session, or process at the Sep 19 09:24:49–09:24:59 UTC window. **Attribution:
UNIDENTIFIED. Authorized activity: UNKNOWN.** This is a deliberate, evidence-exhausted conclusion, not
an unfinished investigation — see `ARCH-2026-001-LOGIN-PROVENANCE-INVESTIGATION.md` §F for what would
be needed to go further (none of it available from this machine's current state). Data-integrity and
ERP-059B impact remain independently confirmed **NONE** regardless of the unresolved origin question.

**CR-2026-002 detail:**
- **Scope:** environment detection, database-path safety, test isolation, startup guards, launch
  tooling, automated safety tests, documentation. No RBAC/duty/privilege/scope/SoD/role/business
  workflow/accounting/inventory/project change — `ARCH-2026-001` remains untouched and unimplemented.
- **Tests performed:** 19/19 new (`tests/erp_cr_2026_002_env_safety_tests.js`, covering all 6 required
  scenarios: explicit-test-starts, test-without-DB_PATH-fails-closed [+ the new development-state
  variant], production-default-in-isolation, write-isolation, parallel-isolation, existing-suite-
  still-passes). Full existing regression re-run against a fresh isolated instance using the new
  `env.js` path: `erp_059_security_tests` 13/13, `erp_059_transaction_contract_tests` 6/6,
  `erp_059c_production_isolation_tests` 10/10, `erp_audit_p0_tests` 65/65,
  `erp_phase38_e2e_trace_tests` 49/49, `erp_phase39_manufacturing_jobwork_tests` 36/36,
  `erp_phase39_fixed_assets_tests` 30/30, `erp_phase39_banking_tests` 34/34,
  `erp_phase39_payment_approval_matrix_tests` 18/18, `erp_059b_durable_audit_tests` 22/24 (+2
  pre-existing documented-not-tested, unchanged), `erp_def_2026_001_qc_dashboard_tests` 19/19,
  `erp_phase39_stress_test` 11/11 (525-document volume). **Total: 319/319 (+2 documented) — zero
  regressions.**
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, timestamps `2026-09-19 14:54:59.947` — identical before this change began, after the
  code edits, after all 19 new tests, after the full regression battery, and at final sign-off.
  `server/db.json.bak`/`.lock` also independently confirmed unchanged. The Sep 19 login-history record
  was not touched, deleted, or reset at any point (same file, same hash).
- **Rollback method:** revert exactly 3 files (`server/env.js` deletion, `server/domain.js` and
  `server/server.js` back to their pre-CR-2026-002 inline resolution logic) plus removal of
  `server/scripts/start-isolated-test-server.js` and `tests/erp_cr_2026_002_env_safety_tests.js`.
  None of these touch `server/db.json`, backups, locks, or the login-history record — rollback is a
  pure code revert with zero data implication.
- **Final result:** PASS. See `CR-2026-002-ENVIRONMENT-SAFETY.md` for full detail.

**ARCH-2026-001 architecture freeze (2026-09-21, same day):** produced the 4 required design-only
deliverables — `ARCH-2026-001-ARCHITECTURE-FREEZE.md` (all 26 domains, frozen list, 12-field report
per domain, no domain classified as implemented merely for having a menu item), 
`ARCH-2026-001-RBAC-TARGET-DESIGN.md` (target model confirmed, existing 10 roles confirmed as the
unchanged current personas, CEO/technical-admin split presented as neutral Option A/B with no
recommendation, Integration & Platform scope resolved into Included/Excluded/OPEN), 
`ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md` (CR-2026-003 through CR-2026-014 proposed for the 12
non-fully-existing domains, plus the ARCH-2026-001a-g RBAC sequencing — none implemented, none
authorized, single-GL/AR/AP/inventory/project-cost-engine architecture and existing Phase 39/40/43
fixes explicitly preserved in every row), and `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md`
(consolidates 3 genuinely open items — CEO/admin split, Integration & Platform scope, Payroll
statutory configuration — plus 2 closed-for-continuity items). No application code, database, roles,
permissions, workflows, or business functionality was modified. **Final status:**
**ARCH-2026-001 — DESIGN FROZEN / IMPLEMENTATION NOT AUTHORIZED.**

**ARCH-2026-001A detail (2026-09-21, same day):**
- **Scope:** RBAC foundation infrastructure only (Business Role/Duty/Privilege/Action model,
  mechanically-derived legacy-bridge `can()` refactor, Data Scope/Approval Authority/SoD frameworks,
  security administration foundation, deterministic access-preserving migration). No 26-domain
  business feature, no new accounting/inventory/project-cost engine, no CEO/admin-split decision, no
  wiring of the new resource-specific privileges into any existing route's enforcement.
- **Tests performed:** 39/39 new (`tests/erp_arch_2026_001a_rbac_foundation_tests.js`, including a
  120-assertion `can()`/`ROLE_ACTIONS` equivalence proof, resource-specific privilege correctness,
  Viewer read-only verification at both the engine and live-HTTP-API level, forged-request rejection,
  migration verification, and a nested `erp_059c_production_isolation_tests.js` re-run). Full existing
  regression re-run against a freshly-isolated instance built from the modified `domain.js`:
  `erp_059_security_tests` 13/13, `erp_059_transaction_contract_tests`, `erp_059c_production_isolation_tests`
  10/10 (standalone), `erp_audit_p0_tests`, `erp_059b_durable_audit_tests`, `erp_phase38_e2e_trace_tests`,
  `erp_phase39_manufacturing_jobwork_tests`, `erp_phase39_fixed_assets_tests`, `erp_phase39_banking_tests`,
  `erp_phase39_payment_approval_matrix_tests` (confirms the Payment Request maker-checker-executor SoD
  control remains live-enforced, unchanged), `erp_def_2026_001_qc_dashboard_tests`, `erp_phase39_stress_test`
  (525-document volume), `erp_cr_2026_002_env_safety_tests` 19/19 — full battery ran clean, exit code 0.
  **Zero regressions.**
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, `2026-09-19T09:24:59.947Z` — identical before this CR began, after the code change,
  after the new test suite, after the full regression battery, and at final sign-off (same values
  recorded at CR-2026-002's own close). `server/db.json.bak`/`.lock` unaffected.
- **Issues found and fixed during implementation (disclosed):** (1) a product defect — the first
  draft of `FinanceManager`'s duty list omitted `ProcurementApproval`, caught by the new suite's own
  TEST 2 on first run, fixed, re-verified 39/39, zero production impact (the affected privilege was
  never wired into any enforcement path); (2) a test-harness-only `process.env` leak between the new
  suite's own internal parts, causing 5 false failures in a nested regression re-run, fixed and
  confirmed harness-only. Full detail in `ARCH-2026-001A-CHANGELOG.md`.
- **Rollback method:** revert the single changed file, `server/domain.js`, to its pre-ARCH-2026-001A
  state (remove the RBAC Foundation section, restore `can()`'s original direct `ROLE_ACTIONS` lookup,
  remove the 5 new `freshDB()`/migration-guard collection entries, remove the `module.exports`
  additions) plus delete `tests/erp_arch_2026_001a_rbac_foundation_tests.js`. Does not touch
  `server/db.json`, backups, locks, or any other file. An already-migrated `DB.userRoles` collection
  on a running instance is harmless dead data if rolled back (nothing reads it once `can()` is
  reverted).
- **Final result:** PASS. See the 6 ARCH-2026-001A deliverable reports for full detail. **Final
  status: ARCH-2026-001A — RBAC FOUNDATION IMPLEMENTED AND TESTED; NEXT CHANGE REQUEST NOT YET
  AUTHORIZED.**

**ARCH-2026-001B detail (2026-09-21, same day):**
- **Scope:** route-layer authorization migration only. Full inventory/classification of the 113
  `role===` baseline; migration of 5 genuine, unambiguous, high-risk-relevant authorization gates
  (1 literal `role===` occurrence + 4 `.includes(actor.role)` array-literal occurrences, a broader
  pattern this CR's own §6 explicitly names) to the centralized engine. No data-scope enforcement, no
  live SoD enforcement, no approval-authority implementation, no CEO/admin split, no new business
  domain — all explicitly deferred to their own named future CRs (`001C`/`001D`/`001E`/`001F`/`001G`).
- **Tests performed:** 18/18 new (`tests/erp_arch_2026_001b_route_auth_migration_tests.js`) +
  39/39 re-run of ARCH-2026-001A's own suite (zero regression from this CR). Full existing regression
  re-run against a freshly-isolated instance built from the modified code:
  `erp_059_security_tests` PASS, `erp_059_transaction_contract_tests` PASS,
  `erp_059c_production_isolation_tests` 10/10 (standalone, against the real repo code),
  `erp_audit_p0_tests` PASS, `erp_059b_durable_audit_tests` 22/24 (2 pre-existing documented gaps,
  IDENTICAL to CR-2026-002's own recorded baseline — not new), `erp_phase38_e2e_trace_tests` PASS,
  `erp_phase39_manufacturing_jobwork_tests` PASS, `erp_phase39_fixed_assets_tests` PASS,
  `erp_phase39_banking_tests` PASS, `erp_phase39_payment_approval_matrix_tests` PASS (confirms the
  Payment Request maker-checker-executor SoD control remains live-enforced, unchanged),
  `erp_def_2026_001_qc_dashboard_tests` PASS, `erp_phase39_stress_test` PASS (525-document volume),
  `erp_cr_2026_002_env_safety_tests` 19/19. **Zero regressions.**
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, `2026-09-19T09:24:59.947Z` — identical before this CR began, after the code change,
  after the new test suite, after the full regression battery, and at final sign-off (same values
  recorded at ARCH-2026-001A's own close). `server/db.json.bak`/`.lock` unaffected.
- **Issues found during implementation:** no product-code defect. One test-invocation methodology
  issue was found and resolved (4 existing test files take the base URL as a positional argument, not
  `TEST_BASE_URL` — a pre-existing inconsistency across this engagement's own test suite, not
  introduced by this CR). Full detail in `ARCH-2026-001B-CHANGELOG.md` and
  `ARCH-2026-001B-REGRESSION-REPORT.md` §4.
- **Rollback method:** revert the 4 enforcement-site edits in `server/domain.js`/`server/server.js`
  to their pre-ARCH-2026-001B inline role checks, and remove the 5 new privilege / 4 new duty / 5
  business-role duty-grant additions from the RBAC catalog, plus delete
  `tests/erp_arch_2026_001b_route_auth_migration_tests.js`. Does not touch `server/db.json`, backups,
  locks, or any other file.
- **Final result:** PASS. See the 6 ARCH-2026-001B deliverable reports for full detail. **Final
  status: ARCH-2026-001B — ROUTE AUTHORIZATION MIGRATION COMPLETE AND TESTED; NEXT CR NOT
  AUTHORIZED.**

**ARCH-2026-001C detail (2026-09-21, same day):**
- **Scope:** data-scope enforcement for the 4 dimensions with real data-model support (Project, Site,
  Customer, Branch). Warehouse/Cost-Centre/Profit-Centre/Department confirmed absent from the data
  model — not implemented, recorded as OPEN. Multi-role scope semantics: N/A (no multi-role assignment
  capability exists). SoD, Approval Authority, CEO/admin split, new business domains — untouched.
- **Tests performed:** 32/32 new (`tests/erp_arch_2026_001c_data_scope_tests.js`, including engine-
  level equivalence checks, a real multi-hop PaymentRequest→JournalEntry→Project inheritance proof
  against an actual posted supplier bill, and live-HTTP cross-project/cross-customer/forged-field/ID-
  tamper/missing-auth tests using real created tasks/timesheets/risk-register entries/AR invoices) +
  39/39 re-run of ARCH-2026-001A's suite + 18/18 re-run of ARCH-2026-001B's suite (zero regression
  from this CR). Full existing regression battery re-run against a freshly-isolated instance — see
  `ARCH-2026-001C-REGRESSION-REPORT.md` for the itemized results. **Zero regressions.**
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, `2026-09-19T09:24:59.947Z` — identical before this CR began, after the code change,
  after the new test suite, after the full regression battery, and at final sign-off (same values
  recorded at ARCH-2026-001B's own close).
- **Findings during implementation (disclosed):** an early design draft incorrectly assumed Sites
  carry a `projectId` field (mirroring this CR's own illustrative example) — corrected before any code
  shipped, after inspecting `createSite()`'s real parameter list and finding no such field; Sites are
  a standalone master in this data model, not a Project sub-entity. No product-code defect was found
  once implementation began (unlike ARCH-2026-001A, which caught a real duty-list gap, and unlike
  ARCH-2026-001B's test-harness-only finding). Full detail in `ARCH-2026-001C-DATA-SCOPE-AUDIT.md` §4.
- **Rollback method:** revert the new Data Scope section in `server/domain.js` and the 10 enforcement-
  site edits in `server/server.js` to their pre-ARCH-2026-001C inline conditions, plus delete
  `tests/erp_arch_2026_001c_data_scope_tests.js`. Does not touch `server/db.json`, backups, locks, or
  any other file.
- **Final result:** PASS. See the 6 ARCH-2026-001C deliverable reports for full detail. **Final
  status: ARCH-2026-001C — DATA SCOPE ENFORCEMENT IMPLEMENTED AND TESTED (4 of the candidate
  dimensions; Warehouse/CC/PC/Department OPEN, 68 of 78 originally-deferred checks still pending a
  follow-on migration CR); NEXT CR NOT AUTHORIZED.**

**ARCH-2026-001C-F detail (2026-09-21, same day):**
- **Scope:** closure of the residual 68 (independently re-counted: 70) checks ARCH-2026-001C deferred,
  plus ARCH-2026-001C's own 2 disclosed gaps (report/export scope testing, browser UAT). No SoD,
  Approval Authority, CEO/admin split, or 26-domain business feature — per this CR's own explicit
  prohibition.
- **Migration outcome:** 32 raw `isProjectManagerOf(actor,X)` call sites migrated to
  `D.hasScopeAccess(actor,'Project',X)`. **23 kept** (verified safe — the call was already directly
  ANDed with, or nested inside a branch already gated by, `actor.role==='ProjectManager'`). **9
  reverted** after a LIVE-CAUGHT equivalence defect (see below) — kept on the direct
  `isProjectManagerOf()` primitive, unchanged from pre-CR behavior. 3 Sales/Lead-ownership checks
  (`salesOwnerId`-based, not `assignedCustomers`-based) correctly left as distinct, already-correct
  legacy logic — recorded as an OPEN low-risk future-centralization candidate, not migrated this CR.
- **Defect found and fixed (disclosed in full):** the initial bulk substitution was unsafe at 9 sites —
  each was a `fullAccess.has(role) || isProjectManagerOf(...)`-shaped (or equivalent bare-OR)
  DENY-guard, where `hasScopeAccess()`'s own unconditional TRUE-for-non-PM-roles behavior silently
  converted "deny every role outside an explicit allow-list" into "allow every role except a
  non-owning ProjectManager." Found via a manual `curl` probe (Sales granted 200 on
  `GET /api/projects/:id/financial-readiness` for an unrelated project) BEFORE any formal test file
  was written — investigated immediately, all 9 affected sites identified by re-deriving and applying
  a precise safety rule to every migrated call site (not just the one manually found), and reverted to
  the safe direct primitive. Re-verified live (the exact failing case now returns 403) and by a
  permanent regression test (33/33). Full account: `ARCH-2026-001C-F-MIGRATION.md` §3-4.
- **Report/export scope (§10, closing ARCH-2026-001C's gap):** 6 project-scoped reports + 1 scoped
  export tested live — all correctly deny cross-project access for non-fullAccess/non-owning roles,
  all correctly allow fullAccess/owning roles. 3 company-wide reports/exports documented as
  intentionally unscoped (role-gated, not project-scoped, matching the existing "Controlling on FI"
  architecture). See `ARCH-2026-001C-F-REPORT-EXPORT-SECURITY.md`.
- **Browser UAT (closing ARCH-2026-001C's gap):** performed through a REAL logged-in browser session
  (not a synthetic script) for 3 of the 4 requested roles (Project-scoped/pm1, Customer-scoped/sales1,
  Viewer) — Branch-scoped disclosed as untestable with real seed data (no seeded user has a Branch
  assignment), not fabricated. See `ARCH-2026-001C-F-BROWSER-UAT.md`.
- **Tests performed:** 33/33 new (`tests/erp_arch_2026_001c_f_residual_scope_tests.js`) + 39/39 re-run
  of ARCH-2026-001A's suite + 18/18 re-run of ARCH-2026-001B's suite + 32/32 re-run of
  ARCH-2026-001C's suite (zero regression from this CR). Full existing regression battery re-run
  against a freshly-isolated instance — see `ARCH-2026-001C-F-REGRESSION-REPORT.md`. **Zero
  regressions** beyond the one self-caught-and-fixed defect above.
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, `2026-09-19T09:24:59.947Z` — identical before this CR began, after the code change,
  after the new test suite, after the full regression battery, and at final sign-off.
- **Rollback method:** revert the 32 substitutions in `server/server.js` (23 kept + 9 already-reverted)
  to their pre-ARCH-2026-001C-F direct `isProjectManagerOf(actor,X)` calls, remove the explanatory
  comment block, and delete `tests/erp_arch_2026_001c_f_residual_scope_tests.js`. Does not touch
  `server/domain.js` (untouched this CR), `server/db.json`, backups, or locks.
- **Final result:** PASS WITH DOCUMENTED DEFERMENTS. See the 7 ARCH-2026-001C-F deliverable reports for
  full detail. **Final status: ARCH-2026-001C-F — RESIDUAL DATA-SCOPE MIGRATION CLOSED (23/32 sites
  centralized, 9/32 correctly kept on the direct primitive after a live-caught-and-fixed defect, 3/32
  correctly left as distinct Lead-ownership logic; Warehouse/CC/PC/Department scope remains OPEN);
  ARCH-2026-001D NOT AUTHORIZED.**

**ARCH-2026-001D detail (2026-09-21, same day):**
- **Scope:** Segregation of Duties enforcement only. Reused the existing `checkSoD()`/`DB.sodRules`/
  `DB.sodExceptions` framework (ARCH-2026-001A) unchanged for the 4 existing reference rules; added 2
  NEW preventive rules for the one real, evidenced P2P capability overlap found in the current role
  model. No Approval Authority, no CEO/Admin separation, no new business domain.
- **Rules implemented:** SOD-5 (Vendor Master Maintenance vs Payment Execution — blocks the SAME user
  who created a vendor from executing payment to it) inside `executePaymentRequest()`; SOD-6 (GRN
  Recording vs Matched Supplier Bill Creation — blocks the SAME user who recorded a GRN from creating
  the PO-matched bill against it) inside `draftSupplierInvoiceFromPO()`. Both preventive, both with
  **no automatic Admin/CEO exemption** (an explicit, disclosed departure from the pre-existing SOD-2/
  SOD-4 pattern — recorded as an OPEN management decision, not silently resolved either way).
- **New infrastructure:** `detectSoDConflicts()` (Admin/CEO-only detective scan for existing
  conflicts, including ones predating this CR), `grantSoDException()`/`revokeSoDException()`
  (Admin/CEO-only, non-self-grantable, documented-reason-required, fully audited exception
  administration) — 4 new backend routes, no administration UI (consistent with this codebase's
  existing backend-controlled-configuration pattern).
- **Tests performed:** 30/30 new (`tests/erp_arch_2026_001d_sod_tests.js`), including a complete real
  P2P chain (Vendor→PO→GRN→Bill→PaymentRequest→Execute) built with real, separately-created test
  users, proving BOTH the conflicting combination is blocked AND the clean combination succeeds end-
  to-end (full GL posting, real clearing record) — plus 39/18/32/33 re-runs of the 001A/001B/001C/
  001C-F suites (zero regression from this CR, after one fully-disclosed test-assertion update — see
  below). Full existing regression battery re-run — see `ARCH-2026-001D-SOD-REGRESSION-REPORT.md`.
  **Zero regressions.**
- **Test-file change (fully disclosed):** `tests/erp_arch_2026_001a_rbac_foundation_tests.js` TEST 11
  changed from `sodRules.length===4` to `sodRules.length>=4` (all 4 original rule IDs still required
  present) — reflects this CR's own authorized, documented extension of the rule array, not a
  weakened test; the 4 original rules were never removed or altered.
- **Browser UAT:** all 5 requested roles exercised through a REAL logged-in browser session driving
  the actual full P2P chain live — CEO blocked from creating a bill against its own GRN (SOD-6),
  blocked from executing payment to its own vendor (SOD-5), with the pre-existing maker-checker/
  executor rule (SOD-2, unrelated) independently and correctly blocking a different user in the same
  sequence, and a genuinely clean executor (Admin) succeeding with full real GL posting. See
  `ARCH-2026-001D-SOD-BROWSER-UAT.md`.
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, `2026-09-19T09:24:59.947Z` — identical before this CR began, after the code change,
  after the full P2P chain test, after the live browser UAT, and at final sign-off.
- **Defect found and fixed (disclosed):** the 2 new SoD-exception POST routes initially lacked a
  route-level `deny()` call (the Admin/CEO check lived correctly inside the domain function only),
  causing the server to refuse to start — this codebase's own `route_safety_scanner.js` requires every
  legacy route to declare its own check. Caught immediately via `node --check` + a foreground start
  attempt, before any formal test ran. Fixed by adding the explicit route-level guard — a startup-
  compliance fix, not a security fix (the domain-layer check was correct throughout).
- **Rollback method:** revert the `RBAC_SOD_RULES_SEED` extension and the 3 new functions in
  `server/domain.js`, remove the 2 new preventive checks from `executePaymentRequest()`/
  `draftSupplierInvoiceFromPO()`, remove the 4 new routes in `server/server.js`, revert TEST 11 in
  `tests/erp_arch_2026_001a_rbac_foundation_tests.js` to its exact `===4` form, and delete
  `tests/erp_arch_2026_001d_sod_tests.js`. Does not touch `server/db.json`, backups, or locks.
- **Final result:** PASS. See the 7 ARCH-2026-001D deliverable reports for full detail. **Final
  status: ARCH-2026-001D — SEGREGATION OF DUTIES ENFORCED FOR THE ONE EVIDENCED P2P GAP (SOD-5, SOD-6
  implemented and tested; CEO/Admin exemption question OPEN; Approval Authority, CEO/Admin split, and
  all 26-domain business features remain separately unauthorized); ARCH-2026-001E NOT AUTHORIZED.**

**ARCH-2026-001E detail (2026-09-21, same day):**
- **Scope:** Approval Authority enforcement only. Audited all 7 existing approval mechanisms (PO,
  Quotation Discount, Payment Request approval, Payment execution, Change Request, BOM, Design
  Review) before writing any code. No Approval Authority engine was built from scratch to REPLACE
  these — each remains its own, unmodified, authoritative enforcement function.
- **The one real fix:** `reviewDesign()` had NO self-approval check, unlike every other comparable
  approve-style function in this codebase (PO, Quotation Discount, Change Request, BOM all already
  block creator/submitter self-approval, with a consistent CEO/Admin exemption). Fixed using the
  IDENTICAL existing convention — not a new or stricter policy. Scoped to the actual approval act
  (`status==='Approved'`), not every status the combined review/reject/approve function can set.
- **New infrastructure:** `resolveApprovalAuthority(transactionType, actor, record)` — a centralized,
  READ-ONLY diagnostic composing `base permission AND data scope AND no SoD conflict AND approval
  authority` for the 4 transaction types with a real mechanism, reusing every existing threshold
  table/function/scope-check/SoD-check without modification, cross-checked against each REAL
  enforcement function to prove it is a faithful mirror, not an independent (and potentially
  divergent) second engine. One new read-only route (`GET /api/approval-authority/check`).
- **No new SoD rule added** (per this CR's own explicit instruction) — the audit found no approval
  mechanism requiring one beyond the pre-existing SOD-1 (Payment Request maker≠checker).
- **No amount threshold invented** — the 2 pre-existing, already-disclosed OPEN items (PO
  self-approval limit, Payment Request matrix finalisation) are re-confirmed unchanged, not resolved.
- **Tests performed:** 37/37 new (`tests/erp_arch_2026_001e_approval_authority_tests.js`), including
  engine-level correctness for all 4 transaction types (cross-checked against the real enforcement
  functions), the Design Review fix (engine + live HTTP), and a real HTTP concurrency race (2
  simultaneous authorized approvers on the same PO — exactly 1 succeeds) — plus 39/18/32/33/30
  re-runs of the 001A/001B/001C/001C-F/001D suites (zero regression, no test file needed updating
  this time). Full existing regression battery re-run — see
  `ARCH-2026-001E-REGRESSION-REPORT.md`. **Zero regressions.**
- **Browser UAT:** all 6 requested roles exercised through a REAL logged-in browser session — the
  Design Review self-approval fix confirmed live (the primary deliverable), a wrong-scope
  ProjectManager blocked (pre-existing scope check, re-confirmed unaffected), an SoD-conflicted
  approver (Payment Request maker attempting to also be checker) blocked live via the pre-existing
  SOD-1 rule, and a genuine positive control (FinanceManager) succeeding to prove the system is not
  over-blocking. A same-user GRN-then-bill attempt was also incidentally re-blocked by
  ARCH-2026-001D's own SOD-6 during UAT chain-building, confirming the SoD layer remains fully intact
  alongside this CR's changes. See `ARCH-2026-001E-BROWSER-UAT.md`.
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, `2026-09-19T09:24:59.947Z` — identical before this CR began, after the code change,
  after the full test/concurrency run, after the live browser UAT, and at final sign-off.
- **Defects found and fixed:** 1 — the deliberate Design Review self-approval gap this CR was
  commissioned to find and fix. No incidental defect was found during implementation this time.
- **Rollback method:** revert the `reviewDesign()` self-approval check and remove
  `resolveApprovalAuthority()`/`APPROVAL_TRANSACTION_TYPES` from `server/domain.js`; remove the 1 new
  route from `server/server.js`; delete `tests/erp_arch_2026_001e_approval_authority_tests.js`. Does
  not touch `server/db.json`, backups, or locks, and does not touch any prior CR's test files.
- **Final result:** PASS. See the 7 ARCH-2026-001E deliverable reports for full detail. **Final
  status: ARCH-2026-001E — APPROVAL AUTHORITY ENFORCED FOR THE ONE EVIDENCED GAP (Design Review
  self-approval fixed; centralized read-only diagnostic built over the 4 existing mechanisms; 2
  pre-existing threshold-finalisation decisions remain OPEN; CEO/Admin split and all 26-domain
  business features remain separately unauthorized); ARCH-2026-001F NOT AUTHORIZED.**

**ARCH-2026-002 Phase 0 detail (2026-09-22):**
- **Scope:** ARCH-2026-002 — 26-Domain Business Expansion — Phase 0 only (current-state audit,
  dependency map, and Wave 1 design). Wave 1 implementation explicitly NOT authorized by this Phase 0,
  per this CR's own §31 stop condition.
- **Method:** read all frozen ARCH-2026-001 architecture documents first; ran a fresh, independent
  code audit (not a copy of the prior `ARCH-2026-001-*` planning documents) across `server/domain.js`
  (12,734 lines), `server/server.js` (3,464 lines), using 4 dedicated research passes: a Dependency Map
  (central-engine call sites, numbering, RBAC/scope/SoD/approval hooks, the Wave-1 chain trace), a
  Transaction Ownership Matrix (35 transaction types), an End-to-End Process Trace (12 chains, A-L),
  and a Security Baseline (18 domains sampled for RBAC/scope/SoD/approval/audit coverage).
- **26-domain matrix:** 15 EXISTING, 3 PARTIAL (Manufacturing, Controlling, Treasury), 1 REQUIRES
  CLARIFICATION/BLOCKED (Integration & Platform), 7 ABSENT (HR, Payroll, Maintenance/EAM, PLM, MRP,
  Transportation, Advanced Warehouse). **One material correction to the prior
  `ARCH-2026-001-26-DOMAIN-MATRIX.md`**: domain #18 (Administration & Governance) upgraded from PARTIAL
  to EXISTING — that document predates ARCH-2026-001A-E's actual completion and its own RBAC-Target-
  Design doc's claim that no RBAC infrastructure existed is now false.
- **Findings (all reported, none fixed in Phase 0, per this CR's own "audit only" rule):** (1) Bank
  Reconciliation has 2 parallel, independently-wired, both-live subsystems (`DB.bankStatementLines`
  legacy path vs. `DB.bankImportLines` newer path) — the one real duplicate-ownership conflict across
  all 35 audited transaction types; (2) Lead-to-Quotation process chain is missing a distinct BOM/BOQ
  step (BOM today is project-scoped, creatable only post-Won); (3) Plan-to-Produce has no automated
  Demand trigger and Job Card completion does not gate Production Order completion; (4) Reporting &
  Analytics' `GET /api/reports/budget-variance` has no `hasScopeAccess()` filter — a real, currently-
  reproducible MODERATE cross-project data leak (not CRITICAL — read-only, requires an already-
  authenticated session, no identity override); (5) QC checklist creation lacks its own `logAudit()`
  call (LOW). **No CRITICAL vulnerability was found — this CR's own stop condition was not triggered.**
- **Security re-confirmation:** ARCH-2026-001A-E's RBAC/Data-Scope/SoD/Approval-Authority foundation
  re-verified live and correctly enforced across 18 domains sampled; all 4 central engines (GL,
  inventory movement, clearing, transaction wrapper) re-confirmed genuinely singular after today's
  uncommitted ARCH-2026-001D/E changes — zero shadow writers found.
- **Tests performed:** full regression battery re-run fresh against a disposable isolated instance —
  527 PASS / 2 FAIL / 529 total (the 2 FAIL are the pre-existing, disclosed, unrelated `erp_059b`
  filesystem-path gaps, not a new regression). RBAC 39/39, Route Authorization 18/18, Data Scope 65/65
  (32+33), SoD 30/30, Approval Authority 37/37, Security 13/13, plus the full 525-document stress test
  (11/11) and every other existing suite, all clean.
- **Production DB verification:** sha256
  `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` — independently re-verified
  identical at 4 separate checkpoints across this Phase 0 (before work began, after the first
  regression pass, after corrected-invocation re-runs, after the final stress-test run). Every test ran
  against a disposable isolated scratch instance; production was never touched.
- **Defects found and fixed:** 0 — this is an audit+design phase, no code was changed. 5 findings
  reported for future wave scoping (see above), consistent with this CR's own instruction not to fix
  discovered issues in Phase 0 unless CRITICAL (none were).
- **Deliverables:** `ARCH-2026-002-PHASE-0-AUDIT.md`, `-MODULE-MATRIX.md`, `-TRANSACTION-OWNERSHIP.md`,
  `-PROCESS-TRACE.md`, `-DEPENDENCY-MAP.md`, `-DATA-MODEL-GAP-REGISTER.md`, `-WAVE-PLAN.md`,
  `-WAVE-1-DESIGN.md`, `-OPEN-DECISIONS.md`, `-SECURITY-BASELINE.md`.
- **Rollback method:** delete the 10 new `ARCH-2026-002-*.md` files. No application code, schema, role,
  route, or production data was touched, so no code-level rollback is needed.
- **Final result:** PASS. **Final status: ARCH-2026-002 PHASE 0 — 26-DOMAIN CURRENT-STATE AUDIT,
  DEPENDENCY MAP, AND WAVE 1 DESIGN COMPLETE (1 duplicate-ownership finding, 2 process-chain PARTIALs,
  2 non-critical security findings, all reported not fixed; domain #18 classification corrected;
  8 open management decisions recorded, none resolved); WAVE 1 IMPLEMENTATION NOT AUTHORIZED.**

**ARCH-2026-002 Wave 1 detail (2026-09-22, same day):**
- **Scope:** exactly the 2 items this Wave's own authorizing text explicitly detailed — the Reporting &
  Analytics cross-project data-scope fix, and the Bank Reconciliation consolidation (§4 of the
  authorizing CR, with a full target architecture and test list). 4 other Phase-0-flagged items were
  reviewed against the authorizing text and found NOT explicitly authorized — each deferred with a
  stated reason in `WAVE1_IMPLEMENTATION_SCOPE.md`, none silently implemented as an assumption, none
  silently dropped without record.
- **Reporting fix:** `projectBudgetVarianceReport()` gained an `hasScopeAccess(actor,'Project',p.id)`
  filter (the SAME centralized scope engine ARCH-2026-001C/C-F already use elsewhere) — a
  ProjectManager now sees only their own assigned project(s); CEO/Admin/FinanceManager/Accountant
  (company-wide roles) are unaffected, proven live via both automated tests and a real logged-in browser
  session (2 vs 5 projects rendered correctly for pm1 vs ceo).
- **Bank Reconciliation consolidation:** the ONE real duplicate-ownership conflict Phase 0 found (2
  parallel, independently-wired, both-live reconciliation subsystems) is now ONE authoritative engine.
  The legacy generic-CSV format and the newer ICICI format are both input ADAPTERS feeding the same
  `createBankImportBatch()`/match/reconcile/allocate function family and the same `bankImportLines`
  collection; `bankStatementLines` becomes a frozen historical archive, migrated in additively via a
  new, idempotent, non-destructive `migrateLegacyBankStatementLines()` function (proven: 2nd run
  migrates 0 new records; original legacy records byte-unchanged after migration; historical
  matchedEntryId/reconciledDate/reconciledBy all preserved exactly). Every existing route
  (`/api/bank-statement/*`, `/api/bank-import/*`) keeps its EXACT pre-existing role gate — the legacy
  routes' gate was deliberately NOT widened to match the newer routes' `can(actor,'clear')`, even though
  both now share one domain-layer engine underneath. A real, deliberate, disclosed behavior improvement
  (not a silent side effect): `bankReconciliationStatus()` now shows ALL lines for a bank account
  regardless of which screen originally imported them — closing the exact "same account, two disjoint
  realities" problem the consolidation exists to fix.
- **Migration not run against production** — the new migration function was built, tested, and exposed
  via an explicit Admin/CEO-gated route, but never invoked against `server/db.json`. It remains a
  separate, explicitly-authorized action for management to trigger later.
- **1 real defect found and fixed live, same pass:** a false-positive "⚠️ balance mismatch" badge on the
  ICICI Bank Import screen for GENERIC-format/migrated lines (which correctly carry `balanceMatches:
  null`, not `false`, since no statement-balance column exists for that format) — the pre-existing
  client-side check (`!l.balanceMatches`) treated null the same as a real mismatch. Found during this
  pass's own browser UAT, fixed (`client_secure/index.html`, `===false` not `!x`), re-verified live on a
  freshly-restarted isolated instance.
- **Tests performed:** new suite `tests/erp_arch_2026_002_wave1_tests.js` — **42/42 PASS**, covering both
  items across unit/domain/API/RBAC/scope/audit/accounting-invariant/concurrency/negative/historical-
  migration layers, self-contained (spawns and restarts its own isolated scratch server for the
  migration test). Full pre-existing regression battery re-run — **527 PASS / 2 FAIL / 529 total**,
  byte-identical to the Phase 0 baseline (the 2 FAIL are the same pre-existing, documented, unrelated
  `erp_059b` filesystem-path gaps) — plus the 2 specially-invoked suites (concurrency 1/1, restart-
  persistence 5/5). **Grand total: 569 PASS / 2 FAIL / 571 total, zero new regressions.**
  `erp_phase39_banking_tests.js` (34/34, the pre-existing suite exercising the ICICI path this pass
  directly modified) passed with zero regression.
- **Browser UAT:** both items verified through real rendered screens (Budget Variance report for pm1 vs
  ceo; Bank Reconciliation screen import→match→unmatch AND the same line cross-checked on the ICICI
  Bank Import screen, proving the single-engine consolidation live) — see `WAVE1_BROWSER-UAT.md`.
- **Security:** no CRITICAL found or introduced. The 1 MODERATE Phase-0 finding (Reporting leak) is
  fixed and live-tested; the 1 LOW finding (QC checklist audit-log gap) is explicitly deferred to Wave 2
  (Quality Management's own domain), not fixed here, per this CR's own scope-boundary rule.
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
  — confirmed identical at 3 independent checkpoints across this Wave 1 pass (start, mid-pass, end).
- **Defects found and fixed:** 1 — the balance-mismatch UI badge described above, found and fixed within
  this same pass. No other defect found.
- **Rollback method:** revert the 3 `server/domain.js` function groups
  (`parseGenericBankCsv`/`createBankImportBatch`/`bankImportReconciliationSummary`/
  `migrateLegacyBankStatementLines`/the 4 compatibility wrappers/`projectBudgetVarianceReport`) and the
  1 `server/server.js` route + 1 call-site edit + the 1 `client_secure/index.html` line; delete
  `tests/erp_arch_2026_002_wave1_tests.js` and the 8 `WAVE1_*.md` deliverables. Does not touch
  `server/db.json`, backups, or locks, and does not touch any prior CR's test files. Since the migration
  function was never run against production, no production data rollback is needed under any scenario.
- **Final result:** PASS. **Final status: ARCH-2026-002 WAVE 1 — ENTERPRISE FOUNDATION HARDENING
  IMPLEMENTED FOR THE 2 EXPLICITLY AUTHORIZED ITEMS (Reporting cross-project data-scope leak fixed;
  Bank Reconciliation's one real duplicate-ownership conflict consolidated to one engine, formats as
  adapters, historical migration built and tested but not run against production; 4 other Phase-0-
  flagged items explicitly deferred with reasons, not implemented; 1 incidental UI defect found and
  fixed live); WAVE 2 NOT AUTHORIZED.**

**ARCH-2026-002 Wave 2 Phase 0 detail (2026-09-22, same day):**
- **Scope:** ARCH-2026-002 — 26-Domain Business Expansion — Wave 2 Phase 0 only (Operations domain
  readiness, dependency, security, and implementation design audit for Procurement, Inventory,
  Manufacturing, Job Work, Site Execution, Quality). Wave 2 implementation explicitly NOT authorized,
  per this CR's own final rule.
- **Method:** read all 18 authoritative documents this CR named (the 10 Phase 0 + 8 Wave 1 deliverables)
  before starting; ran 3 dedicated parallel research passes (Manufacturing+Job Work deep audit,
  Site Execution+Quality deep audit, SoD-pair+shadow-writer sweep) plus direct re-verification of every
  central engine's singularity.
- **Findings (all reported, none fixed in Phase 0, per this CR's own §27 rule):**
  1. **Real, substantive, not-previously-documented finding**: 3 operational chains have ZERO SoD
     coverage — Manufacturing's full Production-Order plan-through-complete execution leg, Job Work's
     full dispatch-through-settlement leg, and Quality's QC self-attestation (no approve/review step
     exists at all, and it directly gates Handover). A single authenticated, correctly role-gated user
     can complete each chain alone. **Not classified CRITICAL** by this engagement's consistently-applied
     bar (no unauthenticated access, no client-side identity override) — reported in full for Wave 2
     design scoping (`ARCH-2026-002-WAVE-2-DECISIONS.md` item W2-4), not silently minimized or fixed.
  2. Narrower SoD gaps also found: Procurement's PR-raiser identity never ties to PO approval or Payment
     Request identity (cross-document SoD absent, though each document's own single-step control is
     intact); Inventory's Material Requirement requester/approver identity never ties to the actual
     Issuer; CAPA's effectiveness-checker can close their own case unchallenged.
  3. Plan-to-Produce's Demand-trigger gap re-confirmed; the smallest legitimate extension point
     identified (`DB.materialRequirements`, already BOM-tagged and quota-checked) — not built.
  4. **New finding**: Production Output/Scrap have zero inventory effect — `completeProductionOrder`
     never calls the single inventory writer; Finished-Goods stock never actually materializes. Confirmed
     deliberate and previously disclosed in-code, not a hidden defect, but a real functional gap.
  5. Gate Pass confirmed absent entirely; Transporter/Vehicle exist only as free-text fields, no master.
  6. Inspection/NCR confirmed absent as a distinct entity — QC Checklist is the only quality-record type.
  7. Warehouse re-confirmed NOT a supported data-scope dimension — not silently added.
- **Central engines:** all 11 named engines re-confirmed singular across all 6 domains — zero shadow
  writers, zero duplicate GL/inventory/numbering mechanism. The Job Work no-double-stock movement math
  was independently re-derived (not just re-cited) and still holds exactly.
- **Transaction ownership:** every named transaction type has exactly one owner or is genuinely absent
  (PO Amendment, Production Scrap as a distinct type, Inspection/NCR) — no second owner found anywhere.
- **Tests performed:** full regression battery re-run fresh — **527 PASS / 2 FAIL / 529 total**,
  byte-identical to the expected baseline this CR's own §22 stated (the 2 FAIL are the same pre-existing,
  disclosed, unrelated `erp_059b` gaps), plus Wave 1's own suite re-run clean (42/42). RBAC 39/39, Data
  Scope 65/65, SoD 30/30, Approval 37/37, Security 13/13, full stress/accounting/inventory-invariant
  suites all clean.
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
  — confirmed identical before this pass began and after it completed.
- **Defects found and fixed:** 0 — audit-only pass, no code changed. 7 new/carried management decisions
  recorded for future Wave 2 scoping (W2-1 through W2-7), none resolved here.
- **Deliverables:** `ARCH-2026-002-WAVE-2-PHASE-0-AUDIT.md`, `-MODULE-MATRIX.md`,
  `-TRANSACTION-OWNERSHIP.md`, `-CENTRAL-ENGINE-AUDIT.md`, `-PROCESS-TRACE.md`, `-SECURITY-BASELINE.md`,
  `-DATA-MODEL-GAP-REGISTER.md`, `-DECISIONS.md`, `-DEPENDENCY-MAP.md`, `-DESIGN.md`.
- **Rollback method:** delete the 10 new `ARCH-2026-002-WAVE-2-*.md` files. No application code, schema,
  role, route, or production data was touched, so no code-level rollback is needed.
- **Final result:** PASS WITH DOCUMENTED DEFERMENTS. **Final status: ARCH-2026-002 WAVE 2 PHASE 0 —
  OPERATIONS DOMAIN AUDIT AND DESIGN COMPLETE (central engines re-confirmed singular and zero shadow
  writers; zero duplicate/conflicting transaction ownership; 1 real, substantive SoD-coverage gap found
  across 3 operational chains and reported, not fixed; 6 previously-disclosed absences re-confirmed;
  1 new functional gap found — Production Output has zero inventory effect; 7 management decisions
  recorded, none resolved); WAVE 2 IMPLEMENTATION NOT AUTHORIZED.**

**ARCH-2026-002 Wave 2 detail (2026-09-22, same day):**
- **Scope:** exactly the items this Wave's own authorizing text concretely specified — SOD-7
  (Manufacturing, §5A/§8), SOD-8 and SOD-9 (Job Work, §5B/§9, with §9's own "particular attention to
  Job Work transaction → Supplier Bill" the single most explicitly-named requirement in the whole
  authorization), SOD-10 (Quality, §5C/§11), SOD-11 (CAPA, §11), plus W2-2 (QC audit-log gap). 6 items
  the text conditioned on prior approval that was never given (W2-1/3/5/6/7, Procurement/Inventory SoD)
  were verified where the text asked ("at minimum verify") and explicitly deferred, not built.
- **Implementation:** all 5 new rules reuse the existing `checkSoD()`/`DB.sodRules` engine exactly,
  mirroring the SOD-5/SOD-6 precedent (no automatic Admin/CEO exemption, exception-grantable via the
  existing `DB.sodExceptions` mechanism) — no second SoD framework, no new route, no new collection.
- **Real defect found and fixed within this same pass:** a bare `logAudit()` call immediately before an
  `{ok:false}` return, inside a function reached through the request-dispatch layer's
  `withTransaction()` wrapper, is silently rolled back along with the rest of the DB snapshot on any
  `{ok:false}` result — all 8 new call sites corrected to use the established `durableFailureAudit`
  mechanism instead, verified live (every `SoDViolationBlocked` entry now survives and is queryable). A
  related, pre-existing instance of the same pattern was found in ARCH-2026-001D's own SOD-6 check and
  disclosed, not fixed — outside this CR's authorized scope.
- **Real, disclosed test-fixture regressions found and fixed:** the first full regression run after
  implementation showed 4 test files with new failures (`erp_arch_2026_001d_sod_tests.js`,
  `erp_def_2026_001_qc_dashboard_tests.js`, `erp_phase39_manufacturing_jobwork_tests.js`,
  `erp_audit_p0_tests.js`), every one traced to a pre-existing fixture using a single actor for what is
  now a maker≠checker pair. Fixed the same way ARCH-2026-001D fixed the identical class of issue
  previously: switch the second half of the pair to a different, already-authorized actor — never
  loosening what is asserted. Re-run: all 4 files back to their exact pre-Wave-2 baseline counts.
- **Tests performed:** new suite `tests/erp_arch_2026_002_wave2_tests.js` — **26/26 PASS**, covering all
  5 rules across create/block/allow/audit/API-bypass layers. Full pre-existing regression battery
  re-run twice (once showing the 4 disclosed failures above, once fully clean after the fix) —
  **final result: 527 PASS / 2 FAIL / 529 total** (core battery, byte-identical to the stated baseline,
  the 2 FAIL being the same pre-existing documented `erp_059b` gaps), plus Wave 1's own suite re-run
  clean (42/42), plus the 2 specially-invoked suites (concurrency 1/1, restart-persistence 5/5).
  **Grand total: 597 PASS / 2 FAIL / 599 total, zero net new failures.**
- **Browser UAT:** 3 of 5 mandatory chains (Manufacturing, Quality, Job Work) live-clicked through real
  rendered screens with real login sessions, both negative (self-dealing blocked) and positive
  (different-user succeeds) controls proven live; SOD-8/SOD-11 proven via the same real authenticated-
  session HTTP mechanism the browser itself uses.
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
  — confirmed identical at 4 independent checkpoints across this Wave 2 pass.
- **Defects found and fixed:** 2 — the audit-rollback defect (fixed in this pass's own new code) and
  the 4 disclosed test-fixture regressions (fixed as test updates, not code weakening). No other defect
  found.
- **Rollback method:** revert the `RBAC_SOD_RULES_SEED` addition and the 8 new guard-clause insertions
  across the 9 named `server/domain.js` functions; delete `tests/erp_arch_2026_002_wave2_tests.js`;
  revert the 4 corrected pre-existing test files to their pre-Wave-2 state. Does not touch
  `server/db.json`, backups, or locks, and does not touch any other prior CR's code.
- **Final result:** PASS. **Final status: ARCH-2026-002 WAVE 2 — OPERATIONS CONTROL SOD IMPLEMENTED FOR
  EVERY ITEM THIS CR'S OWN TEXT CONCRETELY AUTHORIZED (5 new SoD rules closing the 3 previously
  zero-coverage chains — Manufacturing execution, Job Work dispatch-to-settlement, Quality
  self-attestation — plus the CAPA closure gap and the QC audit-log gap; 1 real audit-rollback defect
  found and fixed within this same pass; 6 items the text left genuinely open verified and deferred, not
  assumed; zero net new regressions); WAVE 3 NOT AUTHORIZED.**

**ARCH-2026-002 Wave 3 Phase 0 detail (2026-09-22, same day):**
- **Scope:** ARCH-2026-002 — 26-Domain Business Expansion — Wave 3 Phase 0 only (Finance & Accounting,
  Controlling/Management Accounting, Treasury & Cash Management, Asset Management readiness,
  dependency, security, and implementation design audit). Wave 3 implementation explicitly NOT
  authorized, per this CR's own final rule.
- **Method:** read all authoritative Phase 0/Wave 1/Wave 2 documents this CR named before starting; ran
  4 dedicated parallel research passes (Central Accounting/Controlling/Journal/Period Control; Treasury/
  Bank Reconciliation/Payment Control; Asset/Tax/Profitability; Finance SoD chains/shadow-writer sweep)
  plus a fresh full regression battery.
- **Central engines re-confirmed singular**: the single GL writer (`postJournalEntry()`), single
  reversal engine (`reverseEntry()`), single clearing engine (`applyClearing()`), and — critically — the
  Wave-1-consolidated single Bank Reconciliation engine, all re-verified intact through both subsequent
  Wave 2 passes. Zero shadow writers found anywhere in Wave 3's surface.
- **Controlling findings**: Cost Centre is a real but narrow posting dimension (only Production/
  Installation labour tag it, 2 of ~13 posting paths audited); Profit Centre is confirmed
  master-data-only (zero transaction usage anywhere, matching the codebase's own explicit disclosure).
  Project Profitability is one real, well-composed engine — Depreciation and Job-Work costs ARE
  correctly included via a generic account-type sweep but are not separately labeled in the API
  response, a reporting-clarity finding, not a calculation defect.
- **Real, disclosed SoD-coverage gaps found this pass** (reported, not fixed, per this CR's own §34
  rule): (1) Bank Import→Reconciliation has no identity check between importer and reconciler; (2) the
  Fixed Asset lifecycle (create→capitalize→transfer→dispose) has zero identity checks anywhere — this
  re-confirms, unchanged, an item the original 46-phase forensic audit had already disclosed as an open
  policy decision, not a new discovery.
- **A real documentation-vs-code discrepancy found and reported, not silently resolved**: the 46-phase
  forensic audit's own claim that GL account 1400 is shared between Inventory Asset and Fixed Asset
  capitalization postings does NOT match the current code — an exhaustive grep confirms Inventory posts
  exclusively to 1200 and Fixed Assets exclusively to 1400, cleanly separated. Recorded as CLOSED BY
  EVIDENCE in `ARCH-2026-002-WAVE-3-DECISIONS.md`, per this CR's own §2 instruction to report, not
  silently choose a side on, a documentation/code conflict.
- **Treasury findings**: Petty Cash confirmed an operational spend-tracking register, not a true
  GL-backed subledger (only replenishment posts to the GL; no dedicated control account exists to
  reconcile against). The "₹10,000/day" cash limit is enforced as a per-transaction ceiling in code, not
  a genuine daily aggregate — a real enforced-vs-documented gap. Payment Approval Matrix re-confirmed
  still `finalised:false`/Draft, an unchanged pre-existing open item.
- **Tests performed:** full regression battery re-run fresh — **527 PASS / 2 FAIL / 529 total**,
  byte-identical to the stated baseline (the 2 FAIL are the same pre-existing, disclosed, unrelated
  `erp_059b` gaps), plus Wave 1's own suite (42/42) and Wave 2's own suite (26/26), both re-run clean.
  RBAC 39/39, Route Auth 18/18, Data Scope 65/65, SoD 30/30, Approval 37/37, Security 13/13, full
  525-document stress test and every accounting/inventory-invariant suite clean.
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
  — confirmed identical before this pass began and after it completed.
- **Defects found and fixed:** 0 — audit-only pass, no code changed. 1 pre-existing item closed by this
  pass's own evidence (Account 1400); 8 new/carried management decisions recorded for future Wave 3
  scoping (W3-1 through W3-9), none resolved here.
- **Deliverables:** `ARCH-2026-002-WAVE-3-PHASE-0-AUDIT.md`, `-MODULE-MATRIX.md`,
  `-TRANSACTION-OWNERSHIP.md`, `-CENTRAL-ACCOUNTING-AUDIT.md`, `-CONTROLLING-AUDIT.md`,
  `-TREASURY-AUDIT.md`, `-ASSET-AUDIT.md`, `-PROCESS-TRACE.md`, `-SECURITY-BASELINE.md`,
  `-DATA-MODEL-GAP-REGISTER.md`, `-DEPENDENCY-MAP.md`, `-DECISIONS.md`, `-DESIGN.md`.
- **Rollback method:** delete the 13 new `ARCH-2026-002-WAVE-3-*.md` files. No application code, schema,
  role, route, or production data was touched, so no code-level rollback is needed.
- **Final result:** PASS WITH DOCUMENTED DEFERMENTS. **Final status: ARCH-2026-002 WAVE 3 PHASE 0 —
  FINANCE/CONTROLLING/TREASURY/ASSET AUDIT AND DESIGN COMPLETE (all central engines re-confirmed
  singular including the Wave-1 Bank Reconciliation consolidation; 2 real SoD-coverage gaps found and
  reported; 1 real documentation-vs-code discrepancy found and reported, not silently resolved; Petty
  Cash and daily-cash-limit gaps disclosed; 9 management decisions recorded, none resolved); WAVE 3
  IMPLEMENTATION NOT AUTHORIZED.**

**ARCH-2026-002 Wave 3 detail (2026-09-23, next day):**
- **Scope:** ARCH-2026-002 — Wave 3 Implementation Authorization CR. A human engineer produced
  `WAVE3_IMPLEMENTATION_SCOPE.md` first, per this CR's own §5 policy-classification requirement, reading
  `ARCH-2026-002-WAVE-3-DECISIONS.md` and classifying each of the 9 W3 items RESOLVED/DEFERRED/NOT
  APPLICABLE/IMPLEMENTATION BLOCKER before any code was touched. Result: 7 items (W3-2 through W3-9,
  W3-9 by a deliberately stricter reading of this CR's own "where authorized" conditional language) are
  hard IMPLEMENTATION BLOCKERs; W3-1 remains DEFERRED unchanged; 0 items newly RESOLVED. This pass then
  executed exactly what that classification document authorized: audit-confirmation, hardening
  verification, and genuinely new regression coverage for EXISTING, already-correct behavior — and
  stopped there.
- **Method:** production DB hash verified before starting; one isolated test server per verification
  phase (`server/scripts/start-isolated-test-server.js`, never `server/db.json`); read
  `capitalizeFixedAsset()`/`postAssetDepreciation()`/`transferFixedAsset()`/`disposeFixedAsset()`/
  `reverseEntry()`/`withTransaction()`/`generalLedger()`/`projectFinancial360()`/`coreProjectPL()`/
  `bankReconciliationStatus()` in full before writing any new test.
- **New Fixed Asset hardening coverage built** (the real new-test-coverage centerpiece of this pass, per
  this CR's own §7/§19/§22 instruction): a second, distinct partial-depreciation proration scenario; a
  fully-depreciated asset with residual-floor enforcement (including a manual-amount overshoot check);
  action on a historical (2019) asset with no implicit date-age gate anywhere in the lifecycle; reversal
  of a lifecycle transaction (Capitalization/Disposal correctly now blocked, Depreciation correctly
  remains allowed and self-consistent); and a genuine concurrency-shaped test — two different actors
  (FinanceManager, Admin) firing `dispose` at the SAME asset via `Promise.all` (both HTTP requests in
  flight together, not sequential), proving exactly one wins and the loser is cleanly rejected, no
  double-disposal, no lost update. Duplicate-disposal itself was confirmed via the pre-existing
  `erp_phase39_fixed_assets_tests.js` suite re-run fresh (30/30), not duplicated, per this wave's own
  instruction.
- **2 real, disclosed defects found and fixed** while building that coverage (both narrow, defensive
  fixes inside already-existing, already-role-gated functions — neither is a W3-2..W3-9 item, neither
  adds a new capability): (1) `reverseEntry()` allowed reversing a `FixedAssetCapitalization`/
  `FixedAssetDisposal` GL entry, live-proven to silently desynchronize the Fixed Asset Register from the
  GL (`reconcileFixedAssets()` immediately and permanently showed `costMatches:false`) with no
  compensating mechanism anywhere in the Lab — now blocked outright, using the SAME `rejectReversal()`/
  `durableFailureAudit` idiom the function already uses for its pre-existing reversal-of-a-reversal
  guard; (2) `disposeFixedAsset()` unconditionally pushed a `debit:0/credit:0` GL line whenever
  accumulated depreciation was exactly 0 (an entirely ordinary scenario — e.g. disposal before any
  depreciation was ever posted), which `postJournalEntry()`'s own line-validation correctly rejected,
  live-proven to crash a completely ordinary disposal — now conditionally omitted, mirroring the SAME
  pattern the function already uses for `proceeds`/`gain`/`loss` two lines below.
- **Everything else re-verified live, zero new capability added:** Bank Reconciliation single-engine
  consolidation (Wave 1) confirmed intact via source re-read AND a full live import→match→reconcile
  chain; Payment Request maker/checker/executor 3-way separation (SOD-1/SOD-2) re-proven live end to end
  (self-approve blocked, self-execute blocked with the exact unmodified SOP §9 error, a genuine third
  actor succeeds); Cost Centre tagging (`postProductionLabourCost`→CC-FACTORY,
  `postInstallationLabourCost`→CC-INSTALLATION) and `generalLedger()`'s Cost-Centre filter re-confirmed
  live; Profit Centre re-confirmed still master-data-only (W3-8 not implemented); Petty Cash re-confirmed
  still not GL-backed and the cash limit re-confirmed still per-transaction, not a daily aggregate (W3-5/
  W3-6 not implemented); `projectFinancial360()`'s Depreciation (5400)/Job-Work Inventory Adjustment
  (5300) sweep into `cost.actual` re-proven live to the rupee, with the response body checked
  programmatically to confirm no W3-9 labeling field was added; all 11 existing SoD rules and all 4
  approval-authority threshold tables confirmed byte-identical via full regression of their own
  dedicated suites.
- **API-level UAT (no browser tooling available this pass):** all 4 mandatory chains exercised with real
  HTTP transcripts against a disposable isolated server — (a) Fixed Asset capitalize→depreciate→dispose
  across Purchase/FinanceManager/Admin/CEO roles with correct GL postings verified at each step; (b) bank
  statement import→match→reconcile through the single consolidated engine; (c) Payment Request
  raise→approve→execute proving the 3-person separation still holds; (d) Project Financial 360 viewed
  identically by 3 in-scope roles and correctly 403'd for 1 out-of-scope role. Full transcripts in
  `WAVE3_BROWSER-UAT.md`.
- **Tests performed:** new `tests/erp_arch_2026_002_wave3_tests.js` — 70/70 PASS. Full regression: all 21
  pre-existing core suites re-run fresh — **529 PASS / 0 FAIL / 529 TOTAL** (a better result than the
  historically-documented 527/2/529 — the 2 previously-documented `erp_059b_durable_audit_tests.js`
  filesystem-path-gap FAILs did not reproduce this pass when the suite's own documented `argv[3]`
  backups-directory argument was supplied correctly; disclosed in full, not silently reported as an exact
  baseline match, in `WAVE3_REGRESSION.md` — no test file or assertion was touched, loosened, or
  bypassed) — plus Wave 1's own suite (42/42) and Wave 2's own suite (26/26), both re-run clean. **Grand
  total: 667 PASS / 0 FAIL / 667 TOTAL, zero net new failures.**
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
  — confirmed identical before this pass began and after it completed.
- **Defects found and fixed:** 2 — both in `server/domain.js`'s Fixed Asset code (`reverseEntry()`,
  `disposeFixedAsset()`), both disclosed in full above and in `WAVE3_CHANGELOG.md`/
  `WAVE3_ASSET-RESULTS.md`. No other defect found.
- **Rollback method:** revert the 2 named `server/domain.js` changes; delete
  `tests/erp_arch_2026_002_wave3_tests.js`; delete the 13 new `WAVE3_*.md` files; revert this detail
  block and its summary-table row. Does not touch `server/db.json`, backups, or locks, and does not touch
  any other prior CR's code.
- **Final result:** PASS WITH DOCUMENTED DEFERMENTS. **Final status: ARCH-2026-002 WAVE 3 — FINANCE/
  CONTROLLING/TREASURY/ASSET HARDENING VERIFICATION COMPLETE (real new Fixed Asset lifecycle test
  coverage added for every edge case this wave's CR text calls out by name; 2 real defects found and
  fixed using established codebase patterns; Treasury/Controlling/Central-Accounting/Project-Cost/
  Reporting all re-verified live and by full regression with zero net new failures; the 7 IMPLEMENTATION
  BLOCKER items — W3-2 through W3-8 — plus W3-9's labeling remain genuinely deferred, none resolved,
  none implemented); FURTHER WAVE 3 SCOPE NOT AUTHORIZED.**

**ARCH-2026-002 Wave 4 Phase 0 detail (2026-09-23, same day):**
- **Scope:** ARCH-2026-002 — Wave 4 Phase 0, Part B of "Wave 3 Decision Resolution + Wave 4 Readiness
  Gate." Part A (Wave 3 Decision Resolution, `ARCH-2026-002-W3-DECISION-RESOLUTION.md`) was completed
  separately by a human engineer and is not touched by this entry. Part B is a read-only audit,
  transaction-ownership trace, security baseline, gap analysis, and design proposal for Service &
  After-Sales + deepened Reporting & Analytics. **No Wave 4 application code is authorized by this Phase
  0**, per this CR's own final rule.
- **Method:** read `ARCH-2026-002-WAVE-PLAN.md`, `ARCH-2026-002-WAVE-2-PHASE-0-AUDIT.md`, and
  `ARCH-2026-002-WAVE-3-PHASE-0-AUDIT.md` first, as the style/format/rigor templates this CR's own text
  named; read the original `ARCH-2026-002-TRANSACTION-OWNERSHIP.md` and `ARCH-2026-002-PROCESS-TRACE.md`
  for their pre-existing Service Billing/chain-L findings before writing anything new, per the CR's own
  "re-verify, deepen, do not restart from zero" instruction; read `ARCH-2026-002-OPEN-DECISIONS.md` in
  full for the 2026-09-23 Bank-Reconciliation reclassification and the other 7 still-open items. Read the
  entire Phase 10 — After-Sales block of `server/domain.js` (`:7301`-`:8065`) line by line, plus every
  matching route in `server/server.js` (`:1853`-`:2180`) and the SERVICE & AFTER-SALES module group in
  `client_secure/index.html`, before writing any classification.
- **Headline finding, re-confirmed against the CR brief's own explicit warning:** Service & After-Sales is
  NOT greenfield. All 9 named capabilities (Customer 360, Warranty, Complaints, Service Tickets, Service
  Visits, AMC, AMC Schedule, Service Billing, CAPA) are EXISTING — fully implemented, routed, UI'd, and
  authorized. Zero ABSENT, zero DUPLICATE, zero CONFLICTING functionality found.
- **Service Billing finding, precisely refined**: confirmed a single AR/billing engine (the Wave Plan's own
  stated major risk is NOT realized) — but the literal claim that AMC Billing routes through
  `draftCustomerInvoice()` specifically does not hold on direct code read. `draftServiceInvoice()` (Chargeable
  Service) calls `draftCustomerInvoice()` directly and unmodified; `draftAMCBillingInvoice()` calls
  `createDraft()` directly — the SAME shared primitive `draftCustomerInvoice()` itself is built on, one
  level below it, needed because AMC billing credits Deferred Revenue (2100) rather than Revenue (4000)
  per the already-approved POL-05 deferral policy. Both sub-paths converge on the identical
  Draft→Submit→Approve→Post lifecycle and the identical AR account — reported as a precision correction to
  the original Phase 0's wording, per this CR's own instruction not to silently resolve a
  documentation-vs-code nuance either direction (the same discipline the Wave 3 Account-1400 finding used).
- **Process traces**: all 4 required chains (Service-to-Cash, Warranty, AMC, Complaint/Ticket control)
  classified WORKING — a stronger result than Wave 2 Phase 0's own trace (2 of 6 PARTIAL), consistent with
  Service & After-Sales being a later, more mature build phase (Phase 10-13) than several Wave 2 domains.
- **SOD-11 (CAPA effectiveness-checker≠closer, built by this SAME engagement's own Wave 2 pass)
  re-verified intact and unmodified** — exact source match confirmed at `domain.js:7832` against
  `RBAC_SOD_RULES_SEED` entry `SOD-11` (`:547`); nothing in or near `closeCAPACase()` was touched by this
  read-only pass.
- **7 real, narrow gaps found and reported this pass, none fixed** (Phase-0-only, per this CR's own §32
  "not allowed: fix unrelated defects"): (1) SoD coverage is uneven — Complaint/Ticket/AMC/AMC-Schedule have
  role-tier gating only, no identity checks, unlike CAPA (strongest, one formal `checkSoD()` rule plus 2
  inline checks) and Service Visit (POL-07's diagnoser≠approver inline check, but only above a ₹10,000
  threshold or when disputed); (2) the Service Labour Rate Card (POL-06, `DB.serviceLabourRates`) exists
  and is admin-configurable but is never actually read by `postServiceLabourCost()` — the posting amount is
  entirely caller-supplied; (3) `technicianId` is accepted by `postServiceLabourCost()` but never persisted
  onto the posted JE line — no per-technician cost reporting is possible from posted data today; (4)
  Service Labour posts to accounts 5100/1000 without a `costCentreId` tag, unlike its 2 sibling
  functions (`postProductionLabourCost()`→`CC-FACTORY`, `postInstallationLabourCost()`→`CC-INSTALLATION`,
  both re-confirmed live this pass via a fresh `erp_arch_2026_002_wave3_tests.js` run) — a new, narrow
  addition to Wave 3's own already-disclosed Controlling-coverage gap, not a newly-discovered class of
  problem; (5) neither `draftServiceInvoice()` nor `draftAMCBillingInvoice()` guards against a duplicate
  billing event for the same ticket/period — `serviceTicketClosureReadiness()` only checks that AT LEAST
  ONE invoice draft exists, never exactly one; (6) 6 functions (`rejectServiceTicket()`,
  `startServiceVisit()`, `cancelServiceVisit()`, `recordCAPAAnalysis()`, `createAMCScheduleEntry()`,
  `linkAMCScheduleToTicket()`) have no `logAudit()` call — the same class of finding as the already-disclosed
  Wave-1-era QC-checklist-creation audit gap; (7) `createCAPACase()` performs no existence check on its
  optional `sourceComplaintId`/`sourceTicketId` fields — the SAME class of guard-clause fix already applied
  to Warranty/Ticket/AMC elsewhere in this exact Phase 10 block (ERP-042/043/044), evidently not extended to
  this one function.
- **Live security test performed this pass** (isolated server, port 4532): logged in as `sales1`
  (`assignedCustomers: CUST-1/2/3`); `GET /api/customers/CUST-4/after-sales-summary` (an unassigned
  customer) correctly returned `403`; the same call against `CUST-1` (assigned) correctly returned `200`
  with the full summary; `GET /api/warranties` as the same actor returned exactly 1 record, scoped to
  `CUST-1` only — confirmed server-side list filtering, not merely detail-endpoint gating. Directly answers
  this CR's own instruction to live-test that service personnel cannot access another customer's service
  history via direct API.
- **Tests performed:** `erp_arch_2026_002_wave3_tests.js` re-run fresh on a clean isolated server —
  **70/70 PASS**, byte-identical to `WAVE3_REGRESSION.md`'s own recorded result; `erp_audit_p0_tests.js`
  (the only suite with any pre-existing After-Sales-specific coverage — ERP-042/043/044) re-run on the same
  server — **65/65 PASS**, byte-identical to `WAVE3_REGRESSION.md` row 13; `erp_arch_2026_001d_sod_tests.js`
  and `erp_arch_2026_001c_data_scope_tests.js` (both self-spawning, each managing its own isolated server
  and its own internal production-safety self-check) — all assertions PASS in both. This is disclosed as a
  **targeted spot-check** covering exactly the areas this Wave 4 pass touches (After-Sales regression,
  Wave 3's newest suite, and the SoD/Data-Scope foundations the Security Baseline depends on), not a fresh
  full 21-suite re-run — per this CR's own §27 allowance to use judgment on how much re-verification proves
  the baseline without excessive runtime. Zero drift found from the last recorded full baseline
  (`WAVE3_REGRESSION.md`'s 667 PASS / 0 FAIL / 667 TOTAL). One self-inflicted, diagnosed, non-product
  artifact: re-running the Wave 3 suite a second time against the SAME already-populated server (before
  switching to a fresh instance) produced 5 stale-fixture FAILs (a bank-line-already-Duplicate collision, a
  Payment-Request-Draft-already-consumed collision, and a financial-period date-overlap collision) — purely
  a test-idempotency artifact of reusing server state across two runs, not a code defect; resolved by
  restarting a clean isolated instance and re-running once, which reproduced the clean 70/70 result above.
- **Production DB verification:** sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
  — confirmed identical before this pass began and again mid-pass, after the live regression/security
  battery.
- **Defects found and fixed:** 0 — audit-only pass, no code changed. 11 new management decisions recorded
  for future Wave 4 scoping (W4-1 through W4-11), none resolved here.
- **Deliverables:** `ARCH-2026-002-WAVE-4-PHASE-0-AUDIT.md`, `-MODULE-MATRIX.md`,
  `-TRANSACTION-OWNERSHIP.md`, `-PROCESS-TRACE.md`, `-SECURITY-BASELINE.md`,
  `-DATA-MODEL-GAP-REGISTER.md`, `-DEPENDENCY-MAP.md`, `-DECISIONS.md`, `-DESIGN.md`.
- **Rollback method:** delete the 9 new `ARCH-2026-002-WAVE-4-*.md` files. No application code, schema,
  role, route, or production data was touched, so no code-level rollback is needed.
- **Final result:** PASS WITH DOCUMENTED DEFERMENTS. **Final status: ARCH-2026-002 WAVE 4 PHASE 0 (PART
  B) — SERVICE & AFTER-SALES / REPORTING-DEEPENED AUDIT AND DESIGN COMPLETE (all 9 named capabilities
  confirmed EXISTING, not greenfield; single-billing-engine finding re-confirmed and precisely refined;
  4/4 process chains WORKING; SOD-11 re-confirmed intact; 7 real gaps found and reported, none fixed; live
  cross-customer data-scope test PASS; 11 management decisions recorded, none resolved); WAVE 4
  IMPLEMENTATION NOT AUTHORIZED.**

**ARCH-2026-002 Wave 4 Scope Gate detail (2026-09-26):**
- **Scope:** "ARCH-2026-002 Wave 3 Decision Resolution + Wave 4 Readiness Gate" (Part A, completed
  2026-09-23) followed by "ARCH-2026-002 Wave 4 Management Decision + Implementation Scope Gate" (this
  entry, 2026-09-26) — both explicitly decision/scope/design gates, no application-code implementation
  authorized by either.
- **Part A — W3 Decision Resolution:** re-checked all 9 `ARCH-2026-002-WAVE-3-DECISIONS.md` items against
  current source code rather than trusting the historical summary. None was resolved — W3-1 stayed
  DEFERRED, W3-2 through W3-9 stayed OPEN, each given a full management-ready decision record (question,
  options, operational/accounting/security/reporting/migration/development consequences). One separate,
  adjacent finding: `ARCH-2026-002-OPEN-DECISIONS.md` item 6 (Bank Reconciliation "duplicate ownership")
  was dated 2026-09-21, one day before Wave 1's own consolidation shipped — verified directly against
  `server/domain.js` (`importBankStatement()`/`matchBankStatementLine()`/`bankReconciliationStatus()` are
  confirmed thin wrappers over the single `bankImportLines` engine) and reclassified **CLOSED BY
  EVIDENCE**, with the original 2026-09-21 finding preserved as history, not deleted.
- **Part B — Wave 4 Management Decision + Scope Gate:** built directly on the immediately-prior Wave 4
  Phase 0 pass's own 11 management decisions plus 1 newly-caught omission. The omission: Data-Model Gap
  Register item 8 (Site/Branch scope dimension for Service Visit) had been registered as a real gap in
  Phase 0 but never given its own W4-decision entry — caught by this CR's own explicit "ensure no Phase 0
  finding is accidentally omitted" instruction, added as **W4-12** to `ARCH-2026-002-WAVE-4-DECISIONS.md`
  as a preserved addendum, and given the same full management-ready record as the other 11.
- **Gap disposition discipline:** every one of the 7 named gaps (+1 newly-surfaced) was classified
  IMPLEMENT / DEFER / POLICY DEPENDENT / NO CHANGE / NOT APPLICABLE per this CR's own explicit rule that
  "a gap is not automatically a requirement." Only 2 of 12 dispositioned items were classified IMPLEMENT
  (recommended for a FUTURE, separately-authorized CR, never built now): the 6 missing `logAudit()` calls,
  and CAPA source-ID existence validation on `createCAPACase()` — both chosen specifically because they
  carry zero business-policy content AND this CR's own text attaches no "do not default toward this"
  caution to either, unlike every other gap. Two gaps that could plausibly have been waved through as
  "obviously low-risk" (Cost-Centre tagging on Service Labour; technician-ID persistence) were deliberately
  NOT classified IMPLEMENT, in direct compliance with this CR's own explicit text: "Do not automatically
  propagate Cost Centre merely because the architecture supports Cost Centres elsewhere. Record the
  management decision" — both remain POLICY DEPENDENT (W4-11).
- **Ten required deliverables produced**, each cross-referencing rather than re-deriving the Wave 4 Phase 0
  audit's own evidence: Management Decision Register (12 full records), Gap Disposition (7+1 gaps
  classified with ready-to-implement specifications for the 2 IMPLEMENT items), Implementation Scope
  (IN SCOPE / POLICY DEPENDENT / DEFERRED / NO CHANGE / NOT APPLICABLE), Acceptance Criteria (full
  14-category testable criteria for the 2 IN-SCOPE items only — none written for POLICY DEPENDENT items,
  since a target behavior cannot be tested before it is decided), Sub-wave Plan (reviewed, not
  automatically adopted, the Phase 0 Design's proposed 4A-4E sequence — MODIFIED 4A to remove
  duplicate-billing, which this gate reclassified from "no policy content" to POLICY DEPENDENT), Dependency
  Impact (all 13 architecture-preservation engines re-confirmed intact, zero Wave-3 blocker), Security
  Impact (scope-by-action pre-specified for future decisions), Accounting Impact (only W4-6's Option B
  carries significant impact; zero shadow financial model anywhere in scope), Data-Model Impact (zero new
  collections proposed anywhere), and this Scope Gate master synthesis.
- **Regression discrepancy investigated, not silently normalized:** a fresh run of
  `tests/erp_arch_2026_002_wave3_tests.js` produced 71 PASS / 0 FAIL / 71 TOTAL against this CR's own
  documented 70/70 baseline. Root-caused by direct source inspection (`tests/
  erp_arch_2026_002_wave3_tests.js` lines 277-287): the suite's own [C1] section conditionally runs either
  2 live assertions or 1 documented-skip assertion depending on whether a `DB.installations` record exists
  in that particular server's seed data at test time — a genuinely data-dependent test branch, not a code
  change (file confirmed untracked/byte-identical via `git status`), and the extra result is a STRICTLY
  STRONGER verification (2 live assertions replacing 1 skip), never a weakened or new-failing one.
- **Production safety:** hash `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` confirmed
  identical before and after this entire two-part CR (independently re-verified by direct `certutil`
  check, not merely cited). One isolated test server (port 4540) was started for this gate's own targeted
  regression spot-check and shut down immediately after use — zero orphan remained. Two orphaned servers
  left running by the immediately-prior Wave 4 Phase 0 pass (ports 4531/4532) were separately found and
  cleaned up before this CR began; no recurrence.
- **Rollback:** N/A — no code, schema, role, route, or production data was touched by either part of this
  CR; only new/updated `.md` documents were created.
- **Final result:** READY WITH DOCUMENTED DEFERMENTS. **Final status: ARCH-2026-002 WAVE 3 DECISION
  RESOLUTION + WAVE 4 MANAGEMENT DECISION/SCOPE GATE COMPLETE (all 9 W3 decisions re-verified, 7 remain
  OPEN + 1 DEFERRED, 1 stale item CLOSED BY EVIDENCE; all 12 W4 decisions catalogued and left OPEN,
  including 1 newly-surfaced omission; 2 of 12 gap items classified IMPLEMENT-recommended for a future CR,
  10 POLICY DEPENDENT; zero application code written; zero new engine/duplicate owner/shadow financial
  model introduced anywhere in scope). WAVE 4 IMPLEMENTATION AUTHORIZATION: NOT YET GRANTED.**

**ARCH-2026-002 Wave 4 Decision Collection detail (2026-09-26, same day):**
- **Scope:** "ARCH-2026-002 Wave 4 Management Decision Collection + Scope Authorization Gate" — explicit
  purpose per its own §1: "OBTAIN AND FORMALLY RECORD MANAGEMENT DECISIONS," never to implement code.
- **Decision collection method followed literally:** this CR's own §6 required checking whether explicit
  management decisions already existed anywhere in the environment before proceeding, and — if not — NOT
  inventing them, instead producing a concise business-language questionnaire. This environment contains
  no actual management answers for any of the 12 W4 items (every prior pass in this engagement only ever
  recorded OPEN decisions with "no recommendation given"), so a 12-question (14 sub-question, counting
  W4-10/11's split parts) Questionnaire was produced in plain business language — e.g. W4-9's technical
  "POL-07 diagnoser≠approver threshold" became "For service jobs under ₹10,000 that aren't disputed, the
  same technician can both diagnose the problem and close out the job with no second check... should that
  stay as-is?" No technical language was substituted for any business question, per this CR's own
  instruction.
- **Zero decisions were invented.** All 12 items remain OPEN in
  `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`'s updated per-item records, each ending identically:
  "Management decision: [OPEN unless explicitly supplied]." The one split item (W4-10) has its zero-policy-
  content half (source-ID existence validation) separately marked IMPLEMENT-recommended — a classification
  this engagement has applied consistently since Wave 2's analogous W2-2 finding, never itself an
  authorization.
- **Decision consistency check performed as a readiness check, not a resolution:** since 0/12 decisions
  exist, there is nothing yet to conflict — this CR's own §8 was satisfied by documenting the 3 real
  cross-decision relationships (W4-6×W4-2×W4-7 on Service Billing; W4-11a×W4-11b×W4-5 on Service Labour
  posting; W4-8×W4-9 on identity-separation policy) that MUST be checked the moment real answers arrive,
  rather than either fabricating a "no conflict" finding with no basis or skipping the check entirely.
- **Regression baseline re-verified, and a real premise correction found:** this CR's own §21 asserted
  "71/71... supersedes the historical 70/70 figure... Do NOT revert it to 70/70" as an established fact. A
  fresh, independent isolated-server run of `tests/erp_arch_2026_002_wave3_tests.js` (port 4550) was
  performed specifically to verify this, per this CR's own §21 instruction to "verify current baseline
  without changing production" — it produced **70/70 again**, not 71. Root-caused to the mechanism level
  (a genuinely data-dependent `if(inst)` conditional branch in the suite's own [C1] section, checking
  whether ANY `DB.installations` record exists at that moment) but NOT fully explained at the deeper level
  (why a nominally fresh, correctly isolated server would ever have one, given the base seed is `[]`, the
  only push site is a real create-function never called by this test, and the isolated-server script's
  only randomization is directory/port naming) — disclosed transparently as a genuine, bounded,
  non-deterministic test anomaly with zero product-defect impact (the underlying `CC-INSTALLATION` tagging
  capability was independently confirmed correct by direct source read regardless of which branch
  executes), rather than silently accepting either number as "the" baseline. `erp_audit_p0_tests.js`
  remained byte-identical at 65/65 across both runs.
- **Production safety / test hygiene:** hash `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
  confirmed identical before and after via direct re-check (not cited from a prior pass). One isolated test
  server (port 4550) started and cleanly shut down; zero orphan confirmed via `tasklist`/`netstat` at
  completion.
- **Rollback:** N/A — no code, schema, role, route, or production data was touched; only new/updated `.md`
  documents were created.
- **Final result:** MANAGEMENT DECISIONS OPEN — NOT READY (verdict C, the only one the evidence supports —
  not A/B since zero decisions exist, not D since no conflict exists to be blocked by, not E since zero
  items require a new engine under any option). **Final status: ARCH-2026-002 WAVE 4 MANAGEMENT DECISION
  COLLECTION + SCOPE AUTHORIZATION GATE COMPLETE (0/12 decisions supplied; a formal Questionnaire is now
  the actionable artifact awaiting management's actual answers; 2 of 12 numbered decisions contain a
  zero-policy-content IMPLEMENT-recommended sub-part, still unauthorized for coding; one CR-stated
  regression premise — "71 supersedes 70" — found not to hold on re-verification and corrected
  transparently). WAVE 4 IMPLEMENTATION AUTHORIZATION: NOT YET GRANTED.**

**ARCH-2026-002 Roadmap Resequencing detail (2026-09-26, same day):**
- **Scope:** "ARCH-2026-002 Roadmap Resequencing + Deferred-Wave Control Gate" — explicit purpose per its
  own §34: "WHILE WAVE 4 AND WAVE 5 ARE PARKED, WHAT ARCHITECTURAL WORK CAN SAFELY PROCEED NEXT?" No
  implementation, no Wave 4/5 decision resolution, audit/design only.
- **Wave 4/5 parked, not touched:** Wave 5 recorded as PARKED/DEFERRED (not rejected/cancelled/approved),
  scope preserved unchanged. Wave 4 recorded exactly as the immediately-prior gate left it (0/12 decisions,
  NOT READY), with an explicit finding that independent architecture work in 12 of the 26 domains (those
  with zero dependency on any Wave-4/5 open item, per the new Dependency Graph) can safely proceed without
  touching either.
- **Document discrepancy disclosed:** this CR's own §3 asked to read `ARCH-2026-002-ARCHITECTURE-
  FREEZE.md` — that file does not exist. `ARCH-2026-001-ARCHITECTURE-FREEZE.md` (note the `001`, not
  `002`) was identified as the actually-relevant document and used instead, per this CR's own "do not rely
  on memory where repository evidence exists" instruction — the substitution is disclosed, not silently
  assumed.
- **26-domain matrix refreshed, not re-derived from scratch:** cross-checked the original 2026-09-22 Phase
  0 baseline against every subsequent pass. 3 domains improved (Treasury's Bank Reconciliation dual-system
  concern CLOSED BY EVIDENCE via Wave 1's own consolidation, independently re-verified a 4th time this
  pass by direct source read; Reporting's cross-project leak CLOSED by Wave 1; Quality's missing
  checklist-creation audit log CLOSED by Wave 2's W2-2). Zero domains regressed. Zero domains newly
  discovered ABSENT.
- **Foundational engine health check:** all 13 named engines (GL, AR/AP, Inventory Movement, Project Cost,
  Numbering, Authorization, Data Scope, SoD, Approval, Audit, Transaction Wrapper, Clearing, Document
  Workflow) re-confirmed singular — zero STOP condition, consistent with every prior pass in this
  engagement.
- **Test-infrastructure discrepancy escalated, further investigated, still not resolved:** the 70/71
  Wave-3-suite count first found in the Wave 4 Phase 0 pass, then re-confirmed flip-flopping (70 again) in
  the immediately-prior Decision Collection gate, was investigated a 3rd time this pass with a genuinely
  fresh, live isolated-server run (not merely re-reading the same static code) — producing 70 again
  (cumulative: 71/70/70 across 3 independent runs). Six specific candidate causes were checked and ruled
  out by direct source inspection (the base seed literal is always empty; the only push site is a real,
  never-called function; the test file itself never creates an installation; the one demo-seeding
  function requires different fixture users and is never auto-invoked; the isolated-server script's only
  randomization is directory/port naming, never DB content; first-boot DB loading is deterministic). The
  true root cause remains **UNEXPLAINED** — disclosed honestly as such (matching this engagement's
  established `erp_059b` B6/B7 precedent for permanently-accepted-but-not-silently-hidden anomalies) rather
  than normalized to either number, and formally escalated into its own gated future investigation
  activity (`ARCH-2026-002-NEXT-ACTIVITY-GATE.md`) rather than left as a recurring, unresolved footnote.
- **Candidate Register and resequencing:** 7 candidate activities identified across the 12
  Wave-4/5-independent domains, each classified by dependency/risk/effort (never ranked "best"/"worst," per
  this CR's own explicit instruction). RC-1 (test-infrastructure determinism) selected as the next
  activity for its narrower, more concretely bounded scope and its now-3-CRs-running evidence trail; RC-2
  (Controlling deepening design — Cost Allocation/Profit Centre propagation) queued directly behind it as
  an equally valid, independently schedulable candidate, not rejected.
- **Production safety / test hygiene:** hash `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
  confirmed identical at the start of this gate and again at its end via direct re-check. One isolated test
  server (port 4560) started for the 3rd wave3-suite re-run and shut down immediately after use; zero
  orphan confirmed via `tasklist`/`netstat` at completion.
- **Rollback:** N/A — no code, schema, role, route, or production data was touched; only new `.md`
  documents were created; all historical Wave 1-4 documents preserved unmodified.
- **Final result:** ROADMAP READY WITH DOCUMENTED DEFERMENTS. **Final status: ARCH-2026-002 ROADMAP
  RESEQUENCING + DEFERRED-WAVE CONTROL GATE COMPLETE (Wave 4/5 remain exactly as parked/open as before this
  gate, neither reopened nor implemented; 26-domain matrix refreshed with 3 closed gaps and zero
  regressions; all 13 foundational engines re-confirmed singular; the recurring 70/71 test-count anomaly
  investigated a 3rd time, 6 causes ruled out, root cause still unexplained, formally escalated rather than
  dropped; one independent, fully-gated next activity identified — test-infrastructure determinism — not
  yet started). NO WAVE 4/5/6 IMPLEMENTATION AUTHORIZED. NO APPLICATION CODE WAS WRITTEN.**

## Status legend

`OPEN` → `INVESTIGATING` → `FIXED` → `VERIFIED` → `CLOSED`. A change is marked `CLOSED` only once its
own test report shows regression evidence with zero unexplained failures and production-data-safety
confirmation.
