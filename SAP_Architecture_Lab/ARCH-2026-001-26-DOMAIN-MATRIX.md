# ARCH-2026-001 — 26-Domain Module Matrix

**Date:** 2026-09-21. Classifies each of the 26 domains named in the request against the actual
implemented system, per the request's own Section 2 instruction ("determine whether each domain
already exists partially and then upgrade/integrate rather than duplicate"). No code changed.
Cross-referenced against `UAT-SCOPE-MATRIX.csv` (this session's own 42-domain, evidence-cited
evaluation) and Track B's Phase 42/43 reports (see `ARCH-2026-001-CURRENT-STATE-MAP.md` §3).

| # | Domain | Status | Owner Engine | Evidence |
|---|---|---|---|---|
| 1 | Home & Workspace | **EXISTING** | n/a (dashboard only) | `HOME` module, role-aware Dashboard |
| 2 | Sales & Customer Management | **EXISTING** | Sales & CRM screens; Customer master via `findOrCreateCustomer()` | Full Lead→Quotation→Won chain live-tested this session, `PHASE_41_ESTIMATION_QUOTATION_UAT.md` |
| 3 | Estimation & Costing | **EXISTING** | Estimation & Costing module | Costing Version buildup independently verified exact, same report |
| 4 | Project & Contract Management | **EXISTING** | Projects module, Project 360, Change Requests (Variations) | `PROJECTS` module group, 4 screens |
| 5 | Procurement & Supplier Management | **EXISTING** | Procurement module (14 screens) | Full RFQ→Comparison→PO→GRN chain, `erp_phase39_stress_test.js` (105/105 at volume) |
| 6 | Inventory / Warehouse / Logistics (basic) | **EXISTING** | Inventory module (13 screens) | Moving-Average valuation, Stock Counts, Transfers, all live-tested |
| 7 | Manufacturing | **EXISTING, WITH DISCLOSED SCOPE LIMIT** | Production & Job Work module | BOM/Production Order/Job Card real and tested (`erp_phase39_manufacturing_jobwork_tests.js`, 36/36); **no Routing/Work Centre concept** — confirmed absent by code search, a deliberate scope choice per Track B's own prior findings, not a defect |
| 8 | Job Work / Subcontracting | **EXISTING** | Job Work screen, same Production & Job Work module | Dispatch/Return/Scrap/Direct-Dispatch-with-APOB all live-tested this session |
| 9 | Site Execution & Delivery | **EXISTING** | Execution & Delivery module (7 screens) | Dispatch→Delivery→Installation→QC→Snag→Handover chain, `erp_audit_p0_tests.js` ERP-034 |
| 10 | Quality Management | **EXISTING** | QC screen + QC Dashboard | DEF-2026-001 closed this session (QC Dashboard field-mismatch); QC Checklist lifecycle fully tested |
| 11 | Finance & Accounting | **EXISTING** | Finance + Financial Statements modules (37 screens combined) | Single GL engine confirmed (§1 of Current-State Map); 525-document stress test clean |
| 12 | Controlling / Management Accounting | **EXISTING, PARTIAL** | Cost Centres, Profit Centres, Project 360's Budget vs Commitment vs Actual | Cost/Profit Centre masters real; a formal "Controlling" module distinct from Finance does not exist as its own named area — currently a set of dimensions/reports layered on the single GL, not a separate CO ledger (this matches the SAP CO-vs-FI conceptual split only partially — disclosed, not hidden) |
| 13 | Treasury & Cash Management | **EXISTING, PARTIAL** | Bank Reconciliation, Bank/Cash Transfer, Petty Cash | Real and tested (Phase 39 Banking suite, 34/34); no cash-flow forecasting / treasury-position screen exists |
| 14 | Asset Management | **EXISTING** | Fixed Assets screen | Capitalize/Depreciate/Dispose with automatic gain/loss, `erp_phase39_fixed_assets_tests.js` (30/30) |
| 15 | Service & After-Sales | **EXISTING** | Service & After-Sales module (10 screens) | Warranty/Complaint/Ticket/Visit/AMC/CAPA, built Phase 10, all route through the same single invoice engine |
| 16 | Reporting & Analytics | **EXISTING** | Reports & Analytics + Financial Statements modules | Trial Balance independently verified exact repeatedly; full report catalog not term-by-term re-verified every phase (disclosed, `UAT-KNOWN-LIMITATIONS.md`) |
| 17 | Master Data | **EXISTING** | Master Data module (Branches/Profit Centres/Bank Accounts/COA/Cost Centres) | 5 screens, real |
| 18 | Administration & Governance | **EXISTING, PARTIAL** | Administration module (Policy Config, Users & Roles, Try Unauthorized Action) + API-only Backup/Restore | Real but role-only (see Current-State Map §2) — this domain is exactly what the request's RBAC sections would substantially rebuild |
| 19 | Integration & Platform | **NOT A DISTINCT DOMAIN TODAY** | n/a | No integration/middleware layer exists as a named concept; CSV import/export and the ICICI bank import are the closest real analogues. Not classified NEW since the request doesn't specify what "Integration & Platform" would concretely mean beyond these — flagged as **REQUIRES CLARIFICATION** before scoping |
| 20 | HR / Workforce | **NOT APPLICABLE / FUTURE ROADMAP** | — | Confirmed absent by code search (this session and Track B). Labour & Wages / Timesheet exist as project-COST tracking, deliberately not an HR/workforce system (no employee master, no leave, no attendance beyond timesheet hours) |
| 21 | Payroll | **NOT APPLICABLE / FUTURE ROADMAP** | — | Confirmed absent. **A genuine statutory/legal domain** (PF/ESI/PT/income-tax-TDS-on-salary, labour law) — this engagement's own standing constraint ("no claims of SAP/tax/legal certification... no invented business policy") applies with full force here; cannot be built without real, Appletree-confirmed statutory configuration, not assumed defaults |
| 22 | Maintenance / EAM | **NOT APPLICABLE / FUTURE ROADMAP** | — | Confirmed absent. Machines (Production & Job Work) track Available/In-Use status only — no maintenance scheduling, work orders, or asset-condition tracking exists |
| 23 | PLM (Product Lifecycle Management) | **NOT APPLICABLE / FUTURE ROADMAP** | — | Confirmed absent. BOM exists (single-version-at-a-time, project-scoped); no engineering-change-order, revision-history, or design-document-management concept exists |
| 24 | Advanced Planning / MRP | **NOT APPLICABLE / FUTURE ROADMAP** | — | Confirmed absent. Material Requirements (MRQ) is a manual, BOM-driven demand calculation, not an automated MRP run/netting engine (no lead-time-aware planning, no automatic PR generation) |
| 25 | Transportation / Logistics (advanced) | **NOT APPLICABLE / FUTURE ROADMAP** | — | Confirmed absent beyond the existing Delivery Challan / E-way Bill (manual entry only) mechanisms — no route planning, carrier management, or freight-cost allocation exists |
| 26 | Advanced Warehouse | **NOT APPLICABLE / FUTURE ROADMAP** | — | Confirmed absent beyond existing Locations / Stock by Location / Stock Counts — no bin-level putaway strategy, wave picking, or warehouse-task engine exists |

## Summary — corrected 2026-09-21 (see `ARCH-2026-001-DB-FORENSIC-AND-DOMAIN-RECONCILIATION.md` for
the correction record; the error was a summary-list transcription bug, not a change of scope)

**One-to-one mapping — every domain 1-26 appears in exactly one row below, no domain omitted or
double-counted.**

| Status | Count | Domains |
|---|---|---|
| EXISTING (fully) | 14 | 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 14, 15, 16, 17 |
| EXISTING, PARTIAL (real but narrower than the request implies) | 4 | 7, 12, 13, 18 |
| NOT A DISTINCT DOMAIN / REQUIRES CLARIFICATION | 1 | 19 |
| NOT APPLICABLE / FUTURE ROADMAP (confirmed absent, real build required) | 7 | 20, 21, 22, 23, 24, 25, 26 |
| **Total** | **26** | **1-26, each exactly once** |

**Reading this matrix:** 14 of 26 domains are real, working, already-tested systems today, fully
matching the request's own domain description. A further 4 are real but narrower in scope than the
request's own domain description (Manufacturing has no Routing/Work Centre; Controlling and Treasury
are dimensions/reports on the single GL rather than separate ledgers; Administration is role-only,
which is exactly what this initiative's RBAC sections would upgrade). Combined, **18 of 26 domains
have real, working functionality to build on** — upgrading these means integrating a new
authorization layer underneath them, not rebuilding them. 1 domain (Integration & Platform) needs the
requester to clarify what it concretely means before it can be classified. 7 domains do not exist at
all and would each be a genuine, multi-week-scale net-new build — HR and Payroll in particular carry
real statutory/legal risk this engagement has never been authorized to take on.

**Correction note:** the previous version of this summary undercounted "EXISTING (fully)" as 13
(omitting domain 16, Reporting & Analytics, which the main table above always correctly classified
EXISTING), then separately stated "17 of 26 domains are real" in closing prose — a merge of 13+4 that
was never labeled as its own row. Read literally against the table's own separate "4 narrower" and
"1 clarification" rows, that produced 17+4+1+7=29, three more than the fixed 26-domain scope. The
fix above removes the ambiguity: every domain appears in exactly one row, the four category counts
sum to exactly 26, and the "14 fully + 4 partial = 18 with real functionality" figure is now stated
as its own explicit, correctly-labeled combination rather than reusing a bare, ambiguous "17."
