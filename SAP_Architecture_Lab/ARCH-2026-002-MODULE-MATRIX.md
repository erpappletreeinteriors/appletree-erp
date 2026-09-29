# ARCH-2026-002 — 26-Domain Module Matrix

**Date:** 2026-09-22. Phase 0 deliverable, §4/§28. Classifies all 26 frozen domains using this CR's own
extended taxonomy (§4): EXISTING / ENHANCED / PARTIAL / BACKEND-ONLY / UI-ONLY / PLACEHOLDER / ABSENT /
DUPLICATED / CONFLICTING / BLOCKED. Builds on, and does not duplicate, the prior
`ARCH-2026-001-26-DOMAIN-MATRIX.md` (2026-09-21) — every classification was independently re-verified
against current code this Phase 0 (fresh Dependency Map, Transaction Ownership, Process Trace, and
Security Baseline passes — see those 4 documents), not copied blindly. One classification materially
differs from the prior document and is flagged explicitly (#18). No domain is classified from menu
presence alone.

## Final 26-Domain Matrix (exact format, this CR §28)

| # | Domain | Current Status | Existing Screens | Backend | Data Model | Security | Workflow | Accounting | Inventory | Project Cost | Reporting | Gap | Proposed Wave |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Home & Workspace | EXISTING | Dashboard | YES | `DB.users`, session | YES | N/A | N/A | N/A | N/A | N/A | None | 1 |
| 2 | Sales & Customer Management | EXISTING | Leads, Quotations | YES | `DB.leads`, `DB.quotations` | YES (legacy inline checks, correctly enforced — see Gap) | YES | Indirect (via Won→Invoice) | N/A | N/A | Reads Company MIS | Legacy inline `actor.role` checks not yet on `can()`/`checkSoD()`; ad-hoc IDs (item 4) | 1 |
| 3 | Estimation & Costing | EXISTING | Costing Versions, BOM | YES | `DB.costingVersions`, `DB.boms` | YES | YES (BOM Draft→Submitted→Approved) | N/A (pre-Won) | Read-only quota check | N/A | BOM Consumption Report | Ad-hoc IDs (item 4); BOM is post-Won only, not pre-Quotation (item 5) | 1 |
| 4 | Project & Contract Management | EXISTING | Projects, Project 360, Change Requests | YES | `DB.projects`, `DB.changeRequests` | YES | YES | YES (cost/revenue aggregation) | Via Material Issue tagging | YES — this domain owns the model | Project 360 | None material | 1 |
| 5 | Procurement & Supplier Management | EXISTING | 14 screens (PR/MR/RFQ/Comparison/PO/GRN/Payment Request) | YES | `DB.purchaseOrders`, `DB.grns`, `DB.paymentRequests` | YES (SOD-5, 3-party maker/checker/executor) | YES | YES (GRN→Bill→Payment→Clearing) | YES (GRN is primary inbound movement) | Commitment tracking | Procurement Intelligence, Vendor Rating | None material | 2 |
| 6 | Inventory / Warehouse / Logistics | EXISTING | 13 screens | YES | `DB.inventoryMovements`, `DB.stock` (derived) | YES | YES | Moving-Average valuation | YES — this domain owns the model | N/A directly | Material Analysis | None material | 2 |
| 7 | Manufacturing | PARTIAL | 10 screens (shared with Job Work) | YES | `DB.productionOrders`, `DB.jobCards`, `DB.machines` | YES | PARTIAL (Job Card doesn't gate Order completion — item 7) | YES (Job Cost Sheet) | YES | YES | Production Schedule, Job Cost Sheet | No Routing/Work Centre; no Demand trigger (item 7) | 2 |
| 8 | Job Work / Subcontracting | EXISTING | Job Work screen | YES | `DB.jobWorkOrders` | YES | YES | Via single GL engine | YES | N/A directly | N/A | None | 2 |
| 9 | Site Execution & Delivery | EXISTING | 7 screens | YES | `DB.dispatches`, `DB.installations`, `DB.handovers` | YES | YES (fail-closed Handover gate) | Installation labour only | Tracking-only by design | Via labour tagging | N/A | None | 2 |
| 10 | Quality Management | EXISTING | QC screen + Dashboard | YES | `DB.qcChecklists` | PARTIAL (checklist creation not separately audited — item 8) | YES | N/A directly | N/A directly | N/A | QC Dashboard | Missing `logAudit()` on checklist creation | 2 |
| 11 | Finance & Accounting | EXISTING | 29 screens | YES | `DB.journalEntries`, `DB.clearings` | YES | YES (Submit→Approve→Post) | YES — this domain owns the model | Consumes valuation postings | N/A directly | Trial Balance, AR/AP subledger | None material | 3 |
| 12 | Controlling / Management Accounting | PARTIAL | Cost/Profit Centre masters + Project 360 budget view | YES (dimension tags) | `DB.costCentres`, `DB.profitCentres` | YES | N/A | Dimensioned view of single GL | N/A directly | Dimension tags only | No dedicated CO-vs-FI report | No separate CO ledger; no cross-project allocation rules | 3 |
| 13 | Treasury & Cash Management | PARTIAL | 4 screens | YES | `DB.bankAccounts`, `DB.bankImportLines`, `DB.bankStatementLines` | YES | YES | Distinct GL code per account | N/A | N/A | Bank reconciliation summary | No forecasting; **duplicate reconciliation subsystems** (item 6, `DUPLICATED` at the transaction level) | 3 |
| 14 | Asset Management | EXISTING | Fixed Assets screen | YES | `DB.fixedAssets` | YES | YES (status-gated lifecycle) | YES — Capitalize/Depreciate/Dispose | N/A | N/A | Register reconciles to GL 1400/1450 | None material | 3 |
| 15 | Service & After-Sales | EXISTING | 10 screens | YES | `DB.serviceTickets`, `DB.amcContracts`, `DB.capa` | YES | YES | Via single invoice engine | Via Material Issue | N/A directly | N/A | None material | 4 |
| 16 | Reporting & Analytics | EXISTING | Multiple report/export screens | YES | Reads existing collections only | **PARTIAL — cross-project leak found (item 8, Finding 1)** | N/A | Reads single GL | Reads single inventory engine | Reads single project-cost model | This IS the domain | `projectBudgetVarianceReport()` has no `hasScopeAccess()` filter | 1 (Finding 1 fix) / 4 (deepened) |
| 17 | Master Data | EXISTING | 5 screens | YES | `DB.branches`, `DB.chartOfAccounts`, etc. | YES | N/A | Distinct GL code enforced per account | N/A directly | N/A | N/A | None material | 1 |
| 18 | Administration & Governance | EXISTING (corrected — see note below) | 3 screens + API-only Backup/Restore | YES | `DB.users`; RBAC/scope/SoD/approval tables now real | YES (`can()`,`hasScopeAccess()`,`checkSoD()`,`resolveApprovalAuthority()` all live) | YES | N/A | N/A | N/A | Audit Log | CEO/Admin split OPEN (item 1); adoption not yet uniform across all domains | 5 |
| 19 | Integration & Platform | REQUIRES CLARIFICATION / BLOCKED | Exports screen; CSV/Bank import | YES (for included items only) | N/A beyond existing imports | YES (for included items only) | N/A | N/A | N/A | N/A | N/A | Scope undecided (item 2) | 5 (blocked) |
| 20 | HR / Workforce | ABSENT | None | NO | NO | N/A | N/A | Labour & Wages posts to 5100 (adjacent, not HR itself) | N/A | N/A | N/A | Entire domain — employee master, leave, attendance, org structure | 5 |
| 21 | Payroll | ABSENT / BLOCKED | None | NO | NO | N/A | N/A | N/A | N/A | N/A | N/A | Entire domain; blocked on statutory config (item 3) | 5 (blocked) |
| 22 | Maintenance / EAM | ABSENT | None | NO | NO | N/A | N/A | Would post via single GL | Would consume via single inventory engine | N/A | N/A | Entire domain — work orders, scheduling, meter readings | 6 |
| 23 | PLM | ABSENT | None | NO | NO | N/A | N/A | N/A | N/A | N/A | N/A | Entire domain — ECO workflow, BOM revision history | 6 |
| 24 | Advanced Planning / MRP | ABSENT (1 report exists — see Gap) | None (report is not a screen) | PARTIAL (read-only suggestion report only) | NO | N/A | N/A | N/A | Reads only, no writer | N/A | `materialReplenishmentReport()` exists, disconnected from Production Order creation | Entire planning/netting engine; existing report is disconnected (item 7) | 6 |
| 25 | Transportation / Logistics | ABSENT | Delivery Challan, E-way Bill (manual, in domain #9) | NO (beyond #9's manual entry) | NO | N/A | N/A | N/A | N/A | N/A | N/A | Entire domain — route planning, carrier management, freight allocation | 6 |
| 26 | Advanced Warehouse | ABSENT | Locations, Stock by Location, Stock Counts (in domain #6) | NO (beyond #6's location-level tracking) | NO | N/A | N/A | N/A | N/A | N/A | N/A | Entire domain — bin-level putaway, wave picking, warehouse-task engine | 6 |

## Summary

| Status | Count | Domains |
|---|---|---|
| EXISTING | 15 | 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 14, 15, 16, 17, 18 |
| PARTIAL | 3 | 7, 12, 13 |
| REQUIRES CLARIFICATION / BLOCKED | 1 | 19 |
| ABSENT (1 with a disconnected read-only report) | 7 | 20, 21, 22, 23, 24, 25, 26 |
| PLACEHOLDER / BACKEND-ONLY / UI-ONLY / CONFLICTING | 0 | none found |
| DUPLICATED (at the transaction level, not the domain level) | 1 (within #13) | Bank Reconciliation subsystem only — domain #13 itself remains classified PARTIAL, not DUPLICATED, since only one transaction type within it is duplicated |
| **Total** | **26** | each exactly once |

## Domain #18 correction — the single most consequential change this Phase 0 makes

`ARCH-2026-001-26-DOMAIN-MATRIX.md`#18 classified Administration & Governance PARTIAL, "missing the
entire duty/privilege/data-scope/approval-authority/SoD layer" — that document predates
ARCH-2026-001A-E's actual completion (its own `ARCH-2026-001-RBAC-TARGET-DESIGN.md` states "No
`DB.businessRoles`... exists today," now false). RBAC foundation, route-auth migration, data scope, SoD,
and a read-only Approval-Authority diagnostic are ALL now real and tested (189/189 across those 5
suites, re-confirmed in this Phase 0's own regression run — see `ARCH-2026-002-PHASE-0-AUDIT.md` §P).
**Residual PARTIAL element, disclosed not hidden:** adoption is not yet uniform (Sales & CRM still on
legacy inline checks, item 4); the CEO/Admin split remains OPEN (item 1); `resolveApprovalAuthority()`
is a read-only mirror, not itself an enforcement gate.

## No PLACEHOLDER, UI-ONLY, or CONFLICTING functionality found anywhere

The Dependency Map, Transaction Ownership, and Security Baseline passes independently confirmed: all
four central engines (GL, inventory, clearing, transaction wrapper) remain genuinely singular; zero
shadow writers exist; no mutating route lacks an authorization check; no CRITICAL vulnerability exists.
The one BACKEND-ONLY capability in the system (Backup/Restore, domain #18) was deliberately left
without a UI in a prior phase per an explicit instruction not to build one merely to satisfy a
checklist — noted for completeness, not counted as a domain-level gap. The one DUPLICATED finding
(Bank Reconciliation, within domain #13) is at the transaction level, not the domain level — see
`ARCH-2026-002-TRANSACTION-OWNERSHIP.md` row 32 and `ARCH-2026-002-OPEN-DECISIONS.md` item 6.
