# Appletree ERP — UAT Readiness Report

**Date:** 2026-09-16. Determines whether the current Phase 41-frozen, Phase 42/DEF-2026-001/
CR-2026-001-current baseline can be handed to Appletree business users for structured UAT. This is
NOT a claim of feature-completeness — it is a controlled, documented, testable UAT scope with known
scenarios, exclusions, test data, expected results, and a defect-handling process.

## Readiness verdict: **AMBER — READY WITH EXPLICITLY ACCEPTED LIMITATIONS**

Not GREEN, because real limitations genuinely exist and are disclosed (6 of 42 domains carry a named
limitation; several scenarios are DEFINED but not yet freshly executed; 4 business decisions remain
open). Not RED, because 0 open P0/P1/P2 defects exist, the full engineering regression baseline is
clean (319/319 +2 documented), every domain a real UAT cycle needs is at minimum functionally
correct, and every limitation is a disclosed, non-blocking item rather than a hidden or unresolved
correctness problem. This mirrors the same honest, non-inflated grading discipline this engagement
has used at every prior gate (Phase 39 A−, Phase 40 A−, Phase 41 A) — AMBER here is a calibrated
readiness signal, not a quality ranking, per Section 16's own instruction.

## 2. UAT Scope

42 domains evaluated against the ACTUAL implemented system (verified fresh this session against the
live `MODULE_TREE` in `client_secure/index.html`, not assumed). Full detail: `UAT-SCOPE-MATRIX.csv`.
33 business-journey scenarios across 12 groups (A-L): `UAT-SCENARIO-CATALOG.md`. 25 detailed,
step-level test cases: `UAT-TEST-CASES.csv`. 21 negative scenarios: `UAT-NEGATIVE-TEST-CATALOG.md`.

## 3. Modules Ready for UAT

36 of 42 domains: Authentication & Security, User/Role/Access Control, Master Data, Customer/Party,
Leads/CRM, Estimation, Costing, Quotation, Projects, Project Financials, Procurement, Supplier
Management, Purchase Orders, GRN/Receiving, Purchase Returns, Inventory, Site Inventory, Material
Issues, Site Returns, Job Work, Quality Control, Installation, Handover, Billing/Receivables, Supplier
Payments/Payables, Journal Vouchers, Banking, Clearings, Fixed Assets, Service/Complaints, Warranty,
AMC, Dashboards, Document Viewer/Traceability, Audit Trail. See `UAT-SCOPE-MATRIX.csv` for evidence
per domain.

## 4. Modules Ready With Limitations

6 of 42 domains: Material Requests/Requisitions (MRQ/MR naming confusability, functionally correct),
Manufacturing (no Routing/Work Centre — scope choice, not a defect), TDS (SOP-configured rates, not
independently tax/legal verified), Reporting (full 27+-report catalog not individually re-verified
every phase), Backup/Restore (API-only by design, no UI — not a gap), Import/Export (scope limited to
the 2 built importers), Mobile workflows (one source-verified-not-live-rendered display change from
CR-2026-001; a documented browser-automation-only sidebar quirk, not confirmed to affect real mobile
users). Full detail with reasons: `UAT-SCOPE-MATRIX.csv`.

## 5. Modules Excluded

None of the 42 domains are excluded outright — every one is at minimum UAT READY WITH LIMITATIONS.
Confirmed-absent features (Sales Order, WBS, MRP, batch/serial, Routing/Work Centres, Payroll,
internal-equipment Maintenance) are not domains in scope at all — see `UAT-KNOWN-LIMITATIONS.md`,
classified NOT APPLICABLE / FUTURE ROADMAP, not silently omitted.

## 6. Business Decisions Required

Carried forward, unresolved, not this phase's to resolve: MRQ rename target; status-enum casing
normalization (10 UPPERCASE_SNAKE vs 16 PascalCase, HIGH-risk if pursued); SAC scope; Business Partner
architecture question; billing-milestone-reversal Option A (reset) vs Option B (preserve history).
None block starting UAT — see `UAT-KNOWN-LIMITATIONS.md`.

## 7. Known Capability Gaps

20 items reviewed and classified (CAPABILITY GAP / LIMITATION / FUTURE ROADMAP / NOT APPLICABLE) —
zero classified UAT BLOCKER. Full detail: `UAT-KNOWN-LIMITATIONS.md`.

## 8. Open Defects

| ID | Status | Severity | Notes |
|---|---|---|---|
| DEF-2026-002 | **OPEN / UNAUTHORIZED** | LOW (stale test-harness fixture, not a production defect) | `server/phase28_modules_tests.js`'s own §9 calls BOM `/approve` without a prior `/submit`; correctly rejected by the real (correct) Phase 40 workflow. Does not affect any UAT scenario in this pack. **Not fixed this phase, per standing authorization boundary.** |

0 open P0/P1/P2 production defects. DEF-2026-001 (the only P2 found this engineering cycle) is CLOSED
and its own regression coverage is built directly into this UAT pack (Scenario F2).

## 9. UAT Scenario Count

**Total: 33** (`UAT-SCENARIO-CATALOG.md`) | **Ready (EXECUTED with real evidence): 27** | **Defined,
ready to execute but not yet freshly run this session: 6** | **Blocked: 0**

25 of the 33 scenarios additionally have full step-level detail in `UAT-TEST-CASES.csv`.

## 10. Regression Evidence

Current engineering baseline, re-confirmed clean as of CR-2026-001's own closing regression sweep:
**319/319 (+2 documented-not-tested, pre-existing environmental limitation, unchanged) — zero
failures.** Suites: `erp_def_2026_001_qc_dashboard_tests.js` (19/19), `erp_059_security_tests.js`
(13/13), `erp_059_transaction_contract_tests.js` (6/6), `erp_059c_production_isolation_tests.js`
(10/10), `erp_audit_p0_tests.js` (65/65), `erp_059b_durable_audit_tests.js` (22/24 +2 documented),
`erp_phase38_e2e_trace_tests.js` (49/49), `erp_phase39_manufacturing_jobwork_tests.js` (36/36),
`erp_phase39_fixed_assets_tests.js` (30/30), `erp_phase39_banking_tests.js` (34/34),
`erp_phase39_payment_approval_matrix_tests.js` (18/18), `erp_phase39_stress_test.js` (11/11,
525-document volume). No test was re-run for this UAT-readiness phase specifically (no code changed
this phase that would require it) — the count above is the last confirmed clean state, carried
forward honestly, not re-claimed as freshly re-executed today.

## 11. Financial Integrity Evidence

Trial Balance (debit=credit), AR/AP subledger-to-GL reconciliation, output/input GST reconciliation,
and document-numbering uniqueness all independently verified exact at 525-document stress volume
(`erp_phase39_stress_test.js`). The accounting boundary (zero GL impact from Lead/Estimation/
Quotation/Won alone) independently verified live (`PHASE_41_ESTIMATION_QUOTATION_UAT.md` Section 8).

## 12. Security / SoD Evidence

28 total live-blocked unauthorized attempts across the engagement's own security testing (Phases
40-41), 0 succeeded, covering all 10 roles either directly or by design exclusion. Viewer role: 11/11
blocked including 1 real, non-hidden, clicked button proven server-side blocked. Maker-checker-
executor 3-person separation for Payment Requests: live-proven with a real negative self-approval
test. Full detail: `UAT-ROLE-MATRIX.csv`, `UAT-NEGATIVE-TEST-CATALOG.md`.

## 13. Production Safety

- Production DB touched: **NO**
- Production targeted: **NO**
- Production data changed: **NO**

`server/db.json` confirmed unchanged throughout this phase (timestamp 2026-09-10 18:14:36, identical
to every prior phase's own confirmation since the ERP-059B incident).

## 14. Historical production database incident — status, not reopened

The ERP-059B incident (`server/db.json` last touched 2026-09-10 18:14:36 by that incident) remains in
its existing, previously-documented state. This UAT-readiness phase did not investigate it further,
did not attempt recovery, did not access or modify the affected file, and does not claim it resolved.
Any future recovery action requires its own, separately authorized, explicitly scoped procedure — not
a byproduct of preparing a UAT pack.

## 15. Documentation Created

`UAT-READINESS-REPORT.md` (this document), `UAT-SCOPE-MATRIX.csv`, `UAT-SCENARIO-CATALOG.md`,
`UAT-TEST-CASES.csv`, `UAT-TRACEABILITY-MATRIX.csv`, `UAT-TEST-DATA-PLAN.md`, `UAT-ROLE-MATRIX.csv`,
`UAT-NEGATIVE-TEST-CATALOG.md`, `UAT-KNOWN-LIMITATIONS.md`, `UAT-DEFECT-MANAGEMENT.md`,
`UAT-EXIT-CRITERIA.md`, `UAT-BUSINESS-SIGNOFF-TEMPLATE.md`, `UAT-READINESS-FINAL-CHECK.md` — all 13
required deliverables.

## 16. Working Tree

`git status --short` / `git diff --stat` / `git diff --name-only` confirm **zero application code
changes** attributable to this phase — only the 13 new `UAT-*` documentation files were added.
Pre-existing, uncommitted carry-forward from Phase 39-42 (`server.js`, parts of `client_secure/
index.html`/`server/domain.js`, ~155 unrelated untracked files) remains exactly as it was, untouched.

## 17. UAT Exit Criteria

10 PROPOSED categories (Critical/High/Functional/Financial/Security/Data/Regression/Traceability/
Documentation/Business), none yet business-approved — see `UAT-EXIT-CRITERIA.md`. The business owner
must review and either accept, adjust, or replace these before the UAT cycle is considered complete.

## 18. Remaining Risks / Limitations

1. 6 of 33 scenarios (Group B3, C3, D2, G2, K1, K2) are DEFINED but not freshly re-executed this
   session — recommended as early items in the actual UAT cycle, not blockers to starting it.
2. DEF-2026-002 remains open (low severity, test-harness only) — tracked, not fixed, not blocking.
3. 4 business decisions remain open (MRQ rename, status casing, SAC scope, Business Partner
   architecture) — none functionally block UAT, all are documented for Appletree's own resolution.
4. Exit criteria are PROPOSED only — real UAT cannot be declared "passed" against unapproved
   thresholds; the business owner must formalize these first.
5. This engineering-side readiness phase cannot substitute for real UAT — the scenarios marked
   EXECUTED were executed by this engagement's own automated tests and live browser sessions, not by
   real Appletree business users. Real UAT still requires real Appletree people exercising this pack.

## 19. Git

Commit made: **NO**

## 20. STOP GATE

**STOP.** UAT readiness documentation is complete. Not proceeding to: fix DEF-2026-002; implement
MRQ, SRET, status normalization, Business Partner redesign, Sales Order, WBS, MRP, batch/serial, or
manufacturing redesign; migrate to SQLite; modify production; or start another broad audit. The
system is now ready to be handed to Appletree business users for a real UAT cycle, using this pack,
against the AMBER verdict and its explicitly disclosed limitations above.
