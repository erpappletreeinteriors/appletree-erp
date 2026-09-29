# ARCH-2026-002 — Phase 0: Current-State Audit, Dependency Map & Wave 1 Design

**Date:** 2026-09-22. Master Phase 0 report, per this CR's own §32 (A-S). This document synthesizes the
9 companion deliverables; it does not restate their full evidence — each section below cites the
document that carries the detail. **Phase 0 is audit + design only. No implementation occurred. No
production data was modified.**

## A. 26-domain current-state matrix
See `ARCH-2026-002-MODULE-MATRIX.md` — full 26-row table in this CR's exact §28 format (Current Status,
Existing Screens, Backend, Data Model, Security, Workflow, Accounting, Inventory, Project Cost,
Reporting, Gap, Proposed Wave).

## B. Existing / partial / absent domains
15 EXISTING, 3 PARTIAL (Manufacturing, Controlling, Treasury), 1 REQUIRES CLARIFICATION / BLOCKED
(Integration & Platform), 7 ABSENT (HR, Payroll, Maintenance/EAM, PLM, MRP, Transportation, Advanced
Warehouse). Zero PLACEHOLDER, BACKEND-ONLY-as-domain-blocker, UI-ONLY, or CONFLICTING domains found.
One material correction to the prior `ARCH-2026-001-26-DOMAIN-MATRIX.md`: domain #18 (Administration &
Governance) is upgraded from PARTIAL to EXISTING — the RBAC/Data-Scope/SoD/Approval-Authority
foundation the prior document described as entirely missing is now real and tested (ARCH-2026-001A-E,
189/189). See `ARCH-2026-002-MODULE-MATRIX.md` for full detail.

## C. Duplicate/conflicting functionality
One real duplicate-ownership conflict found across all 26 domains and 35 audited transaction types:
**Bank Reconciliation** (domain #13, Treasury) has two independent, live-wired subsystems
(`DB.bankStatementLines` legacy path vs. `DB.bankImportLines` newer ICICI-aware path) both matching
bank lines to GL entries. No other duplicate or conflicting transaction ownership was found — every
other apparent "second creator" (Project via `createProjectMaster`, Supplier Bill via
`draftSupplierInvoice`/`draftSupplierInvoiceFromPO`) is a deliberately gated, self-documenting dual
path, not an accidental conflict. See `ARCH-2026-002-TRANSACTION-OWNERSHIP.md`.

## D. Transaction ownership matrix
35 transaction types audited; 34 have a single, unambiguous authoritative owner and creating function;
1 (Bank Reconciliation) does not. Full table: `ARCH-2026-002-TRANSACTION-OWNERSHIP.md`.

## E. End-to-end process results
12 chains traced (A-L). **10 WORKING end-to-end, 2 PARTIAL**: Chain A (Lead-to-Quotation) is missing a
distinct BOM/BOQ step between Costing Version and Quotation — BOM today can only be created after a
Project exists (post-Won); Chain E (Plan-to-Produce) has no automated Demand trigger and Job Card
completion does not gate Production Order completion. Zero chains BROKEN, ABSENT, or DUPLICATED. Full
detail: `ARCH-2026-002-PROCESS-TRACE.md`.

## F. Dependency graph
All 4 central engines (GL posting, inventory movement, clearing, transaction wrapper) confirmed
genuinely singular, re-verified fresh after today's uncommitted ARCH-2026-001D/E changes — zero shadow
writers found anywhere. RBAC/Data-Scope/SoD/Approval-Authority hooks are real but unevenly adopted
(concentrated in Procurement/Finance/Asset Management; Sales & CRM still on legacy inline checks). The
clearest cross-wave seam: BOM's `activeBomsFor`/`materialBomQuota` functions are already the sole gate
`createMaterialIssue()` (Wave 2, Inventory) relies on — a future Inventory-wave change must keep calling
into this existing mechanism, not build a second one. Full detail: `ARCH-2026-002-DEPENDENCY-MAP.md`.

## G. Data-model gaps
Full register across every PARTIAL/ABSENT domain (and the REQUIRES-CLARIFICATION domain): proposed
collections, dependencies, risk, and whether a management decision is required, per domain. No
structure proposed duplicates a central engine. Per this CR's §14 instruction, Warehouse/Cost
Centre/Profit Centre/Department dimension-support asymmetries are preserved, not silently resolved.
Full detail: `ARCH-2026-002-DATA-MODEL-GAP-REGISTER.md`.

## H. Wave plan
6 waves, exactly this CR's own §9-§14 groupings — no domain renamed, merged, or moved. Wave
dependencies, risks, and exit criteria are in `ARCH-2026-002-WAVE-PLAN.md`. No wave beyond Wave 1's
design is detailed at implementation level, per this CR's own sequencing discipline.

## I. Wave 1 detailed design
Wave 1's 6 domains are ALL already EXISTING — Wave 1's real scope is 3 disclosed fixes (Reporting
cross-project leak, RBAC/ID-numbering cleanup, BOM-sequencing decision), not new features, per this
CR's own "do not add new business features" rule. Full module tree, screen list, API list, and
per-item workflow/authorization/scope/SoD/approval/audit/numbering/test/UAT design:
`ARCH-2026-002-WAVE-1-DESIGN.md`.

## J. Security baseline
**No CRITICAL vulnerability found — the calling process does not need to stop.** Every mutating route
sampled across 18 domains requires authentication and an explicit authorization gate; no route lets a
client override its own identity/role. Two lower-severity findings reported (not fixed, per this CR's
own §16 instruction): a MODERATE cross-project data-scope leak in `GET /api/reports/budget-variance`
(Reporting & Analytics), and a LOW audit-logging gap on QC checklist creation (Quality Management). Full
detail: `ARCH-2026-002-SECURITY-BASELINE.md`.

## K. Accounting impact
Every domain that creates Revenue/Expense/Asset/Liability/AR/AP/Tax posts through the single confirmed
`postJournalEntry()` writer (domain.js:2297) — re-confirmed by the Transaction Ownership pass across all
35 transaction types and by the fresh Dependency Map's shadow-writer sweep (zero found). No new posting
logic is proposed anywhere in this Phase 0's deliverables.

## L. Inventory impact
Every domain that creates/moves/consumes/returns/adjusts stock posts through the single confirmed
`postInventoryMovement()` writer (domain.js:4976) — re-confirmed the same way. Stock is fully derived
(never stored as a mutable balance), which structurally prevents a shadow writer. The one existing
planning-only artifact (`materialReplenishmentReport()`, domain #24) is read-only and does not mutate
stock, consistent with this CR's own §18 "planning transactions must NOT mutate stock" rule.

## M. Project-cost impact
Material, Labour, Expense, Production, and Service costs all tag GL lines with `projectId` and flow
into the single project-cost model (`projectFinancial360`/`companyProjectProfitability`) — confirmed
WORKING end-to-end in Process Trace chain C. No duplicate project-cost calculation was found.

## N. Open management decisions
8 items recorded, none decided by this Phase 0. 3 carried forward unchanged from
`ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md` (CEO/Admin split, Integration & Platform scope, Payroll
statutory config). 5 newly surfaced by this Phase 0's fresh audit (Wave-1 RBAC/ID cleanup scope, BOM
pre-Quotation sequencing, Bank Reconciliation duplicate resolution, Plan-to-Produce Demand-trigger
scoping, Reporting/QC findings scheduling). Full detail: `ARCH-2026-002-OPEN-DECISIONS.md`.

## O. Production DB hash before/after
`server/db.json` sha256 **`25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`** — this
exact hash was independently re-verified at 4 separate checkpoints across this Phase 0 (before any work
began, after the first regression pass, after the corrected-invocation re-runs, and after the final
stress-test run) and was identical, byte-for-byte, at every checkpoint. **Matches the expected hash
stated in this CR's own §3.** Production data was never touched — every test ran against a disposable,
isolated scratch instance created by `server/scripts/start-isolated-test-server.js --app-env test`.

## P. Regression baseline

| Category | Result |
|---|---|
| Full regression (all 21 suites combined) | **527 PASS / 2 FAIL / 529 TOTAL** — the 2 FAIL are a pre-existing, documented, unrelated pair of filesystem-path gaps in `erp_059b_durable_audit_tests.js` (items B6/B7 — the test script's own relative-path access to a `backups/` directory from its invocation context; not a code regression, consistent with this suite's long-standing disclosed 22/24 baseline) |
| Security | `erp_059_security_tests.js`: **13/13** |
| RBAC | `erp_arch_2026_001a_rbac_foundation_tests.js`: **39/39** |
| Route authorization | `erp_arch_2026_001b_route_auth_migration_tests.js`: **18/18** |
| Data scope | `erp_arch_2026_001c_data_scope_tests.js` + `erp_arch_2026_001c_f_residual_scope_tests.js`: **65/65** |
| SoD | `erp_arch_2026_001d_sod_tests.js`: **30/30** |
| Approval | `erp_arch_2026_001e_approval_authority_tests.js`: **37/37** |

All other suites (transaction-contract, production-isolation, env-safety, QC dashboard, E2E trace,
banking, fixed assets, manufacturing/job-work, payment-approval-matrix, 525-document stress test,
concurrency, restart-persistence, audit P0) also ran clean — 0 FAIL beyond the 2 documented 059b items.
**Zero new regressions introduced by this Phase 0's own (read-only) activity, which is expected since
Phase 0 modified no application code.**

## Q. Risks
1. Bank Reconciliation's dual-subsystem risk grows the longer it is left unresolved (item 6) — every
   new bank-related feature must now consider which of two systems it extends.
2. Sales & CRM's legacy inline-role-check pattern (item 4) means any Wave-2+ module copying Wave-1 code
   as a template would propagate the older pattern instead of the newer `can()`/`checkSoD()` one — Wave
   1 should resolve this before other waves reference it as precedent.
3. Advanced Warehouse (Wave 6) carries the highest structural risk in the entire 26-domain program for
   accidentally forking the inventory-movement writer, per `ARCH-2026-002-DATA-MODEL-GAP-REGISTER.md`.
4. Payroll and HR both carry real risk if sequencing pressure leads to skipping their respective
   blocking decisions (statutory config; PII access-tier design) — neither should be started on assumed
   defaults under any circumstance.

## R. Exact Wave 1 acceptance criteria
See `ARCH-2026-002-WAVE-1-DESIGN.md` §12 (6 numbered criteria) — summarized: item 3 (Reporting fix)
fixed and regression-proven; items 4-5 each explicitly resolved as a decision (not silently skipped);
if items 4-5 proceed, full parity/regression discipline applied; all 6 Wave-1 domains remain classified
EXISTING; production DB hash unchanged; a Wave 1 completion report in this engagement's standard
PASS/PASS WITH DOCUMENTED DEFERMENTS/FAIL format.

## S. Final Phase 0 verdict

**PASS.**

All 13 items of this CR's own §30 Final Acceptance Gates are met: all 26 domains independently audited;
no unexplained domain remains; existing vs. missing functionality is documented; the one duplicate
transaction ownership is identified (Bank Reconciliation); authoritative owners are documented for all
35 transaction types; all 12 end-to-end processes are traced; dependencies are mapped; data-model gaps
are documented for every non-EXISTING domain; Wave 1 is fully designed; 8 open management decisions are
explicit, none silently resolved; the existing security architecture is preserved (re-confirmed, not
weakened — no CRITICAL finding, no fix applied without authorization); no production DB change occurred
(hash identical at 4 independent checkpoints); no Wave 1 implementation occurred (zero application code
touched throughout this Phase 0).

**Per this CR's own §31 stop condition: STOPPING HERE.** Wave 1 implementation, new ERP modules,
business-logic changes, and production-data changes are all explicitly NOT authorized by this
document. Waiting for explicit authorization before proceeding to Wave 1 (or any later wave).
