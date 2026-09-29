# ARCH-2026-002 — Roadmap Resequencing Audit

**Date:** 2026-09-26. Master audit deliverable for "ARCH-2026-002 Roadmap Resequencing + Deferred-Wave
Control Gate," per its own §4/§7/§12-§22. **Audit only — no application code was written, no Wave 4/5
decision was resolved, no implementation occurred.**

## Document discrepancy, reported per this CR's own §3 ("do not rely on memory where repository evidence
exists")

This CR's own §3 asks to read `ARCH-2026-002-ARCHITECTURE-FREEZE.md`. **That file does not exist in this
repository.** The file that actually exists and carries the relevant frozen-architecture content is
`ARCH-2026-001-ARCHITECTURE-FREEZE.md` (note: `001`, not `002`). This substitution is disclosed here
rather than silently reading the `001` file as if it were the one named — the `001` document was read and
used as the authoritative source for frozen-architecture rules throughout this audit.

## §4 — Authoritative Wave Map

Source: `ARCH-2026-002-WAVE-PLAN.md` (unchanged since 2026-09-22), cross-checked against every subsequent
Phase 0/Implementation pass this engagement has actually run.

| Wave | Domains | Current status | Phase status | Implementation status | Management decisions | Dependencies | Known blockers | Can proceed independently? | Can be parked? | Can be resequenced? |
|---|---|---|---|---|---|---|---|---|---|---|
| **1** | Home & Workspace, Sales & CRM, Estimation & Costing, Project & Contract Mgmt, Master Data, Reporting & Analytics | CLOSED | Phase 0 PASS, Implementation PASS | 2 items shipped (Reporting cross-project fix; Bank Reconciliation consolidation); 2 items explicitly deferred (RBAC/ID-numbering cleanup — `ARCH-2026-002-OPEN-DECISIONS.md` item 4; BOM pre-Quotation sequencing — item 5) | Items 4, 5 still OPEN, unchanged since 2026-09-22 | None outstanding | None blocking | Yes — items 4/5 are self-contained, no dependency on Wave 4/5 | N/A — Wave 1 is closed; only its 2 deferred items remain open | Items 4/5 could be resequenced ahead of anything else — see Candidate Register |
| **2** | Procurement & Supplier Mgmt, Inventory/Warehouse/Logistics, Manufacturing, Job Work/Subcontracting, Site Execution & Delivery, Quality Management | CLOSED | Phase 0 PASS, Implementation PASS | 5 new SoD rules shipped (SOD-7..11) + W2-2 QC audit-log fix; 6 items deferred (W2-1/3/5/6/7 + Procurement/Inventory SoD items not concretely authorized) | W2-1 (Demand trigger scoping), W2-3 (Warehouse scope), W2-5 (Production Output→FG), W2-6 (Gate Pass/Transporter), W2-7 (Inspection/NCR) all still OPEN | None outstanding | Manufacturing's Routing/Work Centre gap remains PARTIAL | Yes — each deferred item is independently scoped | N/A — Wave 2 is closed | Manufacturing's Plan-to-Produce gap (item 7, `ARCH-2026-002-OPEN-DECISIONS.md`) could be resequenced as independent design work |
| **3** | Finance & Accounting, Controlling, Treasury & Cash Mgmt, Asset Management | CLOSED WITH DOCUMENTED DEFERMENTS | Phase 0 PASS WITH DEFERMENTS, Implementation PASS WITH DEFERMENTS | 2 real defects found+fixed (Fixed Asset reversal desync, zero-depreciation disposal crash); new Asset hardening test coverage added; 7 items (W3-2 through W3-8) + W3-9 all classified IMPLEMENTATION BLOCKER, none implemented | W3-1 (DEFERRED, unchanged); W3-2 through W3-9 all OPEN, each with a full management-ready record in `ARCH-2026-002-W3-DECISION-RESOLUTION.md` | None outstanding | Controlling remains PARTIAL (Cost Centre narrow, Profit Centre master-data-only); Treasury remains PARTIAL (Petty Cash not a subledger, cash limit not daily-aggregate) | Yes — Controlling/Treasury deepening audits are independently scoped | Yes — this is exactly this CR's own subject | Controlling (W3-7 Cost Allocation, W3-8 Profit Centre propagation) is the strongest independent-audit candidate in this entire roadmap — see Candidate Register |
| **4** | Service & After-Sales, Reporting & Analytics (deepened) | PHASE 0 PASS WITH DOCUMENTED DEFERMENTS; Decision Gate MANAGEMENT DECISIONS OPEN — NOT READY | Phase 0 complete; Management Decision Collection complete (0/12 answered) | **NOT AUTHORIZED** | 12 items (W4-1 through W4-12), **0/12 decided** — a formal Questionnaire exists and awaits real answers | None outstanding for the audit itself | 12 open decisions block any Wave 4 implementation, but do NOT block independent architecture work elsewhere | **No** for Wave 4 implementation itself; **Yes** for unrelated architecture tracks (Controlling, test-infrastructure, etc.) which do not touch Service & After-Sales code | **Yes — this CR's own §2 explicitly forbids reopening it** | N/A — parked by explicit instruction, not by this audit's own judgment |
| **5** | Master Data (extended), Administration & Governance, Integration & Platform, HR/Workforce, Payroll | **PARKED / DEFERRED — no implementation authorized** | Not started | NOT AUTHORIZED | 3 pre-existing OPEN items block it entirely: CEO/Admin technical split (item 1), Integration & Platform scope (item 2), Payroll statutory configuration (item 3) | Items 1-3, all OPEN, unchanged since 2026-09-21/22 | Payroll is legally/statutorily blocked — cannot even begin DESIGN without real PF/ESI/PT/TDS data; HR needs a PII-access-tier design first | **No** — every domain in Wave 5 is blocked on a decision or an explicit park instruction | **Yes — explicitly parked by this CR's own §2/§5** | N/A — parked by explicit instruction |
| **6** | Maintenance/EAM, PLM, Advanced Planning/MRP, Transportation/Logistics, Advanced Warehouse | Not started | Not started | NOT AUTHORIZED | None recorded yet — no Phase 0 has been run | Depends on Wave 1 (BOM singularity), Wave 2 (Inventory singularity) remaining intact — both re-confirmed intact through every subsequent pass | Advanced Warehouse carries the highest structural risk in the whole 26-domain program for accidentally forking the inventory-movement writer (flagged since the original Phase 0) | **No** — no Phase 0 exists yet to even begin scoping | Not formally parked (never started), but has no path forward until Wave 5 clears | N/A — too far downstream to resequence meaningfully ahead of its own Phase 0 |

## §5 — Wave 5 status (recorded, not touched)

**WAVE 5 STATUS: PARKED / DEFERRED.** Per this CR's own §5: this is not rejected, cancelled, completed,
implemented, or approved — it is deferred while other architecture work is evaluated. Its scope
(Master Data extended, Administration & Governance, Integration & Platform, HR/Workforce, Payroll) is
preserved exactly as `ARCH-2026-002-WAVE-PLAN.md` and `ARCH-2026-002-OPEN-DECISIONS.md` items 1-3 already
recorded it. No Wave 5 source code exists to modify (domains #19-21 remain ABSENT/BLOCKED per the 26-domain
matrix — see §7 below), so "do not modify Wave 5 source code" is satisfied trivially and by design.

## §6 — Wave 4 status (recorded, not touched)

**Wave 4 Phase 0: COMPLETE.** **Wave 4 Decision Gate: 0/12 management decisions resolved at last gate**
(re-confirmed directly from `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`'s 2026-09-26 update — no
new answer has arrived since). **Wave 4 implementation: NOT AUTHORIZED.** This state is unaltered by this
audit.

**Can independent architecture work proceed without resolving W4-1 through W4-12? YES**, for any work
that does not touch `server/domain.js`'s Phase 10 (After-Sales) block, `server/server.js`'s After-Sales
routes, or the After-Sales UI screens in `client_secure/index.html`. Concretely: Controlling (#12),
Treasury (#13, minus anything touching Service Labour's Cost-Centre question which is a Wave-4 item),
Asset Management (#14) further hardening, Master Data governance, Security-foundation re-verification, and
test-infrastructure hardening are all fully independent of Wave 4's 12 open items — verified by direct
cross-reference against `ARCH-2026-002-W4-DEPENDENCY-IMPACT.md`'s own architecture-preservation table,
which shows zero Wave-4 item touching any of these domains' own engines.

## §7 — Current ERP Domain Inventory (26 domains, refreshed against every pass since the original Phase 0)

| # | Domain | Status (2026-09-22 baseline) | Status (refreshed, this pass) | Architectural maturity | What changed since baseline |
|---|---|---|---|---|---|
| 1 | Home & Workspace | EXISTING | EXISTING (unchanged) | FOUNDATIONAL | None |
| 2 | Sales & Customer Management | EXISTING | EXISTING (unchanged) | TRANSACTIONAL | Legacy inline-role-check gap (item 4) and ad-hoc-ID gap remain OPEN, untouched |
| 3 | Estimation & Costing | EXISTING | EXISTING (unchanged) | TRANSACTIONAL | BOM pre-Quotation sequencing (item 5) remains OPEN, untouched |
| 4 | Project & Contract Management | EXISTING | EXISTING (unchanged) | FOUNDATIONAL | None |
| 5 | Procurement & Supplier Management | EXISTING | EXISTING (unchanged) | TRANSACTIONAL | None material since Wave 2 |
| 6 | Inventory / Warehouse / Logistics | EXISTING | EXISTING (unchanged) | TRANSACTIONAL | None material since Wave 2 |
| 7 | Manufacturing | PARTIAL | **PARTIAL (unchanged, narrower gap)** | TRANSACTIONAL | Wave 2 added SOD-7 (creator≠completer); Routing/Work Centre and Demand-trigger gaps (item 7) remain OPEN |
| 8 | Job Work / Subcontracting | EXISTING | EXISTING (unchanged) | TRANSACTIONAL | Wave 2 added SOD-8/9 (linked-document and settlement separation) |
| 9 | Site Execution & Delivery | EXISTING | EXISTING (unchanged) | TRANSACTIONAL | None material |
| 10 | Quality Management | EXISTING (security PARTIAL) | **EXISTING (security gap CLOSED)** | TRANSACTIONAL | Wave 2's W2-2 fix closed the missing `logAudit()` on QC checklist creation; SOD-10/11 added |
| 11 | Finance & Accounting | EXISTING | EXISTING (unchanged) | FOUNDATIONAL | Wave 3 re-confirmed clean; 2 real defects found+fixed in Asset lifecycle interaction (see #14) |
| 12 | Controlling / Management Accounting | PARTIAL | **PARTIAL (unchanged)** | ENTERPRISE | Wave 3 deepened the audit (W3-7 Cost Allocation, W3-8 Profit Centre propagation both explicitly flagged as needing their own dedicated design pass) — no code change |
| 13 | Treasury & Cash Management | PARTIAL (flagged DUPLICATED at transaction level) | **PARTIAL (duplicate-ownership concern CLOSED BY EVIDENCE; other gaps remain)** | TRANSACTIONAL | Wave 1 consolidated the Bank Reconciliation dual-subsystem into one engine (re-verified 3 separate times since: Wave 3 Phase 0, W3 Decision Resolution, Wave 4 Phase 0) — this specific item is resolved; Petty Cash (not a subledger) and cash-limit (not daily-aggregate) gaps remain OPEN (W3-5/W3-6) |
| 14 | Asset Management | EXISTING | **EXISTING (2 real defects found+fixed; 1 SoD gap remains OPEN)** | TRANSACTIONAL | Wave 3 found+fixed reversal-desync and zero-depreciation-disposal-crash defects; added real hardening test coverage; Fixed Asset lifecycle SoD (W3-3) remains OPEN |
| 15 | Service & After-Sales | EXISTING | **EXISTING (deeply re-audited, 12 management decisions surfaced)** | TRANSACTIONAL | Wave 4 Phase 0 confirmed all 9 named capabilities EXISTING with line-level precision; 2 real defensive fixes recommended (not built); 12 management decisions await answers |
| 16 | Reporting & Analytics | PARTIAL (cross-project leak) | **EXISTING (leak CLOSED)** | REPORTING | Wave 1 fixed `projectBudgetVarianceReport()`'s missing `hasScopeAccess()` check |
| 17 | Master Data | EXISTING | EXISTING (unchanged) | FOUNDATIONAL | None material |
| 18 | Administration & Governance | EXISTING | EXISTING (unchanged) | FOUNDATIONAL | CEO/Admin split (item 1) remains OPEN |
| 19 | Integration & Platform | REQUIRES CLARIFICATION / BLOCKED | **REQUIRES CLARIFICATION / BLOCKED (unchanged)** | ENTERPRISE | Scope decision (item 2) remains OPEN, untouched — Wave 5 scope, parked |
| 20 | HR / Workforce | ABSENT | ABSENT (unchanged) | ENTERPRISE | Wave 5 scope, parked |
| 21 | Payroll | ABSENT / BLOCKED | ABSENT / BLOCKED (unchanged) | ENTERPRISE | Statutory config (item 3) remains OPEN — Wave 5 scope, parked |
| 22 | Maintenance / EAM | ABSENT | ABSENT (unchanged) | ADVANCED | Wave 6 scope, not started |
| 23 | PLM | ABSENT | ABSENT (unchanged) | ADVANCED | Wave 6 scope, not started |
| 24 | Advanced Planning / MRP | ABSENT (1 disconnected report exists) | ABSENT (unchanged) | ADVANCED | Wave 6 scope, not started |
| 25 | Transportation / Logistics | ABSENT | ABSENT (unchanged) | ADVANCED | Wave 6 scope, not started |
| 26 | Advanced Warehouse | ABSENT | ABSENT (unchanged) | ADVANCED | Wave 6 scope, not started; highest structural risk in the program if ever built without discipline |

**Summary of change since baseline:** 2 domains improved (Treasury's duplicate-ownership concern closed;
Reporting's cross-project leak closed; Quality's audit-log gap closed — 3 gaps closed across 2 domains).
Zero domains regressed. Zero domains newly discovered ABSENT that weren't already known. Zero domains
classified DUPLICATE or CONFLICTING remain (the one that existed, Treasury's Bank Reconciliation, is now
CLOSED BY EVIDENCE).

## §12 — Foundational Engine Health Check

See dedicated deliverable: `ARCH-2026-002-FOUNDATIONAL-ENGINE-STATUS.md`. **Headline: all 13 named engines
remain singular. No STOP condition triggered.**

## §13 — Controlling

**Cost Centres:** EXISTING but narrow — only 2 of ~13 posting paths tag `costCentreId`
(`postProductionLabourCost()`→CC-FACTORY, `postInstallationLabourCost()`→CC-INSTALLATION), re-confirmed
live as recently as this session's own Wave 3 test suite (`[C1]` assertions). **Profit Centres:**
PARTIAL/master-data-only — full CRUD exists, seeded empty, zero business function tags a `profitCentreId`
anywhere (`domain.js:10995-10998`'s own explicit disclosure, independently re-verified multiple times).
**Project Cost:** EXISTING, singular (`projectFinancial360()`/`projectPL()`). **Budget/Commitment/Actual:**
EXISTING via Project 360's own budget-variance view; no dedicated CO-vs-FI report exists. **Variance:**
covered by the same Project 360 view. **Allocation:** ABSENT — W3-7 (Cost Allocation) remains the single
largest capability gap in Controlling, explicitly flagged across 2 prior passes as needing its own
dedicated design pass, not detailed further here either. **Profitability:** EXISTING at the project level
(`companyProjectProfitability()`); no formal Profit-Centre-sliced profitability exists (blocked on W3-8).

**Can further Controlling work proceed independently of Wave 4/5? YES.** Confirmed via
`ARCH-2026-002-W4-DEPENDENCY-IMPACT.md`'s own re-verification: W3-7/W3-8 have exactly one non-blocking
relationship to Wave 4 (would deepen, not enable, Service profitability reporting) and zero relationship
to Wave 5. No Cost Centre/Profit Centre policy is decided by this document — both remain exactly as
undecided as `ARCH-2026-002-WAVE-3-DECISIONS.md` left them.

## §14 — Treasury

**Bank Accounts:** EXISTING. **Bank Import:** EXISTING, singular (`createBankImportBatch()`/
`DB.bankImportLines`). **Bank Reconciliation:** EXISTING, singular — **the Wave 1 consolidation is
re-confirmed intact this pass** by direct source read (`importBankStatement()`/`matchBankStatementLine()`/
`bankReconciliationStatus()` remain thin wrappers, unchanged since the last check). **Not modified by this
audit**, per this CR's own explicit instruction. **Cash:** EXISTING (bank transfers, clearing). **Petty
Cash:** PARTIAL — operational register only, not a true GL subledger (W3-5, OPEN). **Transfers:**
EXISTING. **Payment Controls:** EXISTING, singular chain (SOD-1/2/5/6, re-confirmed unmodified across
every subsequent pass). **Cash Limits:** PARTIAL — enforced per-transaction, not as a true daily aggregate
(W3-6, OPEN). **Clearing:** EXISTING, singular (`applyClearing()`).

**Can Treasury Phase 0 work proceed independently? YES**, for anything not touching the still-open W3-5/
W3-6 decisions themselves (which remain Wave-3-scoped, unresolved, not re-opened here) or Wave 4's Service
Labour Cost-Centre question. A genuinely independent Treasury activity would be: further hardening/
verification work analogous to what Wave 3's own Implementation pass already did for Fixed Assets (i.e.,
edge-case test coverage for Bank Reconciliation/Payment Control, without deciding any open policy) — see
Candidate Register.

## §15 — Asset Management

**Asset Master:** EXISTING. **Capitalization/Depreciation/Transfer/Disposal:** EXISTING, all
status-gated. **Reversal:** EXISTING, hardened — Wave 3's fix (blocking reversal of Capitalization/
Disposal entries) **re-confirmed intact** by direct source read this pass (`domain.js` guard clause at the
cited line still present, unmodified). **Zero-accumulated-depreciation disposal crash fix**: **re-confirmed
intact** (the `if(accumDep>0)` conditional line-push still present, unmodified). **Accounting:** EXISTING,
reconciles to GL 1400/1450. **SoD:** PARTIAL — the full-lifecycle identity-separation gap (W3-3) remains
OPEN, unchanged, matching the ORIGINAL 46-phase forensic audit's own disclosed policy question. **Audit:**
EXISTING. **Reporting:** EXISTING (Register reconciles to GL).

**Independent remaining architecture work?** Limited — Asset Management's only remaining gap (W3-3) is a
policy decision, not a technical audit gap. Further Asset Management "audit-only" work would mostly be
re-verification (already done twice this pass) rather than new discovery. Low priority as a candidate.

## §16 — Integration & Platform

**Environment isolation:** EXISTING and mature — `server/scripts/start-isolated-test-server.js`,
`APP_ENV`-gated fail-closed `DB_PATH` resolution (`server/env.js`), re-verified this pass.
**Authentication/Authorization:** EXISTING (`can()`, session-based login). **API:** EXISTING (extensive
route surface, re-verified route-by-route across 4 prior Security Baselines). **Configuration:** EXISTING
(POL-05/06/07/08-style configuration objects, a real, repeatedly-reused pattern). **Backup/Restore:**
EXISTING (`createBackup()`/`restoreBackup()`, durable-audit-hardened per ERP-059B). **Logging/Audit:**
EXISTING, singular (`logAudit()`/`DB.auditLog`). **Import:** EXISTING (Bank CSV import, Master Data bulk
import with `dryRun`). **Export:** EXISTING (Report Builder). **Integration (external systems):** ABSENT —
this is exactly `ARCH-2026-002-OPEN-DECISIONS.md` item 2's scope question, unresolved, Wave-5-scoped,
parked. **Scheduled Jobs:** ABSENT — confirmed, repo-wide, zero `cron`/`setInterval`/scheduler pattern
exists anywhere (re-confirmed by grep this pass). **Notifications:** ABSENT — no notification/email/SMS
mechanism exists anywhere in this codebase. **File handling:** EXISTING (photo uploads via IndexedDB per
a 2026-08+ fix, CSV import/export). **Error handling:** EXISTING (`{ok:false, error}` convention,
consistently applied).

**Classification: REQUIRES CLARIFICATION / BLOCKED overall** (unchanged) — the domain's CORE platform
mechanics (auth, API, config, backup, audit, error-handling) are all EXISTING and mature; what's blocked
is specifically the "external Integration" sub-scope, pending item 2's decision. **Can be audited
independently: YES** — this audit itself just did so, without needing item 2 resolved, by scoping the
audit to "what exists today" rather than "what the undecided Integration scope should eventually cover."

## §17 — Security Foundation

RBAC/Route Auth/Data Scope/SoD/Approval/Audit all **re-confirmed intact**, not reopened, not silently
marked fixed. Known, still-disclosed gaps (not touched by this audit): Sales & CRM legacy inline-role-check
pattern (`ARCH-2026-002-OPEN-DECISIONS.md` item 4), Fixed Asset full-lifecycle SoD (W3-3), Bank-Account/
Bank-Import SoD (W3-2/W3-4), Complaint/Ticket/AMC SoD (W4-8), below-threshold Service Visit diagnosis
(W4-9). None of these is silently classified fixed here — every one remains exactly as open as its own
governing document last left it.

## §18 — Master Data Foundation

| Master | Authoritative owner | Status |
|---|---|---|
| Customer | `DB.customers` | EXISTING, single |
| Supplier/Vendor | `DB.vendors` | EXISTING, single |
| Employee | N/A | ABSENT — Wave 5 (HR) scope |
| Project | `DB.projects` | EXISTING, single |
| Site | `DB.sites` | EXISTING, single |
| Branch | `DB.branches` | EXISTING, single — inconsistently WIRED as a scope dimension across domains (a pre-existing, disclosed condition, not a fragmentation) |
| Warehouse | `DB.warehouses` | EXISTING, single |
| Location | Stock-by-location (within Inventory) | EXISTING, single |
| Bank Account | `DB.bankAccounts` | EXISTING, single |
| Cost Centre | `DB.costCentres` | EXISTING, single (narrow usage, not a fragmentation) |
| Profit Centre | `DB.profitCentres` | EXISTING, single (unused, not a fragmentation) |
| Chart of Accounts | `DB.chartOfAccounts` | EXISTING, single |
| Asset | `DB.fixedAssets` | EXISTING, single |
| Product/Item | `DB.materials` | EXISTING, single |
| BOM | `DB.boms` | EXISTING, single |
| Machine | `DB.machines` | EXISTING, single |
| Job Worker | Modeled via `DB.vendors` (category-tagged) | EXISTING, single |

**Zero duplicate or fragmented masters found.** Every master has exactly one authoritative collection —
this matches every prior Transaction Ownership pass's own repeated finding (no shadow master, no
duplicate-creation path) across Waves 1-4.

## §19 — Reporting Foundation

Every report reads from the single GL (`postJournalEntry()`), single inventory engine
(`postInventoryMovement()`), or single project-cost model (`projectPL()`/`projectFinancial360()`) — no
shadow calculation, no duplicate profitability/ageing/stock logic found anywhere across 4 independent
audit passes (original Phase 0, Wave 2/3/4 Phase 0s). The one real scope-bypass found (Reporting's
cross-project leak on `projectBudgetVarianceReport()`) was fixed in Wave 1 and re-confirmed closed this
pass. No export-bypass was found in any pass to date.

## §20 — Document / Transaction Architecture

Numbering (`nextDocNumber()`/`nextId()`), Draft→Submit→Approve→Post→Reverse/Cancel/Close lifecycle, and
audit logging remain consistent across every domain audited (re-confirmed, not re-derived, this pass).
**One nomenclature discrepancy recorded, not changed:** `ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md`'s
own finding that AMC Billing routes through `createDraft()` rather than literally `draftCustomerInvoice()`
(a precision correction to the Wave Plan's own wording, already fully reported in the Wave 4 Phase 0 pass,
not re-litigated here).

## §21 — Data Migration Readiness

| Area | Classification | Basis |
|---|---|---|
| Master data migration | PARTIAL | No formal migration tooling exists; Bulk Import (`dryRun`-capable) handles Master Data ingestion, not a full migration framework |
| Opening balances | READY | Opening Balances module exists (per the Financial ERP Engine work, memory-confirmed) |
| Historical transactions | NOT READY | No historical-transaction-import mechanism exists; would need its own design |
| Employee migration | NOT APPLICABLE | HR domain (#20) is ABSENT — nothing to migrate into yet |
| Asset migration | PARTIAL | Fixed Asset creation exists; no bulk/historical-asset-import path confirmed |
| Bank migration | READY | Bank Import (CSV, `dryRun`-capable) already handles ongoing statement ingestion |
| Project migration | PARTIAL | `createProjectMaster()` exists; no bulk historical-project import confirmed |
| Inventory opening | PARTIAL | Opening stock entry exists per the Standard Costing work (memory-confirmed); bulk historical-movement import not confirmed |
| BOM migration | PARTIAL | `createBOM()` exists; no bulk-import path confirmed |
| Document numbering | READY | `nextDocNumber()` is collision-safe and migration-agnostic by design |

**No migration is proposed or performed by this audit.**

## §22 — Test Architecture: the 70/71 Discrepancy, Investigated Further

Per this CR's own explicit instruction, this discrepancy was investigated further with a 3rd independent
isolated-server run of `tests/erp_arch_2026_002_wave3_tests.js` (port 4560), in addition to the 2 already
recorded in `ARCH-2026-002-W4-SCOPE-AUTHORIZATION-GATE.md` — this run also produced **70 PASS / 0 FAIL /
70 TOTAL** (the "documented, not live-tested" fallback branch, same as run 2). **Across all 3 independent
fresh-server runs to date: 71, 70, 70** — the "live" branch (2 extra assertions) has now been hit once,
the "skip" branch twice. This pass's own effort was spent targeting root cause (below) rather than
re-confirming the count alone again.

**What was ruled out this pass, by direct source inspection:**
1. The base `SEED` literal (`domain.js:970`) sets `installations: []` — always empty on a fresh server.
2. The only `DB.installations.push()` call site in the entire codebase (`domain.js:7044`) is inside
   `createInstallation()`, a real, explicitly-invoked function — not a migration guard, not a startup hook.
3. `tests/erp_arch_2026_002_wave3_tests.js` never calls the create-installation endpoint anywhere before
   its [C1] section reads `GET /api/installations`.
4. `seedDemoScenario()` (`domain.js:12515`) — the one function found capable of creating a rich demo
   dataset including a real workflow chain — is reachable ONLY via an explicit admin API route
   (`server.js:3411`), requires specific `U-UAT-*` fixture users that this test's own fixture users
   (`ceo`/`finance1`/`purchase1`/etc.) do not match, and is never called by this test file, the isolated-
   server startup script, or any code path between server boot and the [C1] section.
5. `server/scripts/start-isolated-test-server.js`'s only randomization is the scratch-directory name and
   port number (`Date.now()` + 4 random hex bytes for the directory; a random port in a 5000-wide range) —
   neither touches database CONTENT.
6. The server's own boot sequence (`domain.js:1177`, `loadDbFromDisk()`) is deterministic:
   `if(!fs.existsSync(DB_FILE)) return freshDB();` — since the scratch directory never contains a
   pre-existing `db.json` (the isolated-server script copies only `domain.js`/`server.js`/`client_secure/`,
   never `db.json`), every fresh invocation MUST take the `freshDB()` branch.

**Classification: UNEXPLAINED**, not DETERMINISTIC, not simply "DATA-DEPENDENT" in a fully-understood
sense (the branch logic that CONSUMES the data-dependence is fully understood; the SOURCE of the
data-dependence is not). It is likely ENVIRONMENT-DEPENDENT or ORDER-DEPENDENT in some way not yet
identified (e.g., a subtle interaction with Node's module cache across rapid successive isolated-server
spawns, or an artifact of this specific machine's process/port reuse timing) rather than truly
NON-DETERMINISTIC (i.e., not literally random — every individual mechanism checked is deterministic), but
this audit could not identify the specific mechanism within its own scope (audit only, no code
instrumentation added, per this CR's own §9 "audit only" constraint).

**Impact: bounded to exactly one optional, redundant assertion pair in one test file's one section.** The
capability under test (`postInstallationLabourCost()`'s `costCentreId:'CC-INSTALLATION'` tagging) has been
independently confirmed correct by direct source read in every pass regardless of which branch executes.
**No product defect. No security impact. No accounting impact.** Recorded here as an open
test-infrastructure finding, per this CR's own explicit instruction, and NOT normalized to either 70 or 71
as "the" count. **Recommended for the dedicated test-infrastructure-hardening candidate activity** — see
`ARCH-2026-002-ROADMAP-CANDIDATE-REGISTER.md`.

## §23 — Production Safety

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` confirmed
identical at the start of this audit and (see `ARCH-2026-002-NEXT-ACTIVITY-GATE.md`'s own final check) at
its end. No production write, migration, reset, or seed occurred at any point.

## §24 — Test Environment Hygiene

One isolated test server was used for this pass's own 3rd wave3-suite re-run (fresh port, disposable
scratch directory) and shut down immediately after use. Verified via `tasklist`/`netstat`: zero orphaned
`node.exe` processes, zero listening ports in the isolated-server range at the time this document was
finalized.
