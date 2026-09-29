# WAVE1_CHANGELOG.md

**Date:** 2026-09-22. Every subsystem changed in this Wave 1 implementation pass, with what changed,
why, old/new path, migration, compatibility, security, audit, and tests. Per `WAVE1_IMPLEMENTATION_SCOPE.md`,
exactly 2 items were implemented (Reporting scope fix, Bank Reconciliation consolidation); 4 items were
explicitly deferred with no code change.

## 1. Reporting & Analytics — cross-project data-scope fix

**What changed:** `projectBudgetVarianceReport(projectId)` → `projectBudgetVarianceReport(projectId, actor)`
in `server/domain.js`. The one call site (`GET /api/reports/budget-variance` in `server/server.js`) now
passes `actor`.

**Why:** Phase 0's Security Baseline (`ARCH-2026-002-SECURITY-BASELINE.md` §3.1) found this report had
no project-scope filter — a ProjectManager could see every project's budget/commitment/actual/margin
data company-wide, not just their own.

**Old path:** `projects = projectId ? DB.projects.filter(...) : DB.projects` (unfiltered by actor).
**New path:** the same, plus `.filter(p=>hasScopeAccess(actor,'Project',p.id))` when `actor` is
provided — the exact centralized scope engine (ARCH-2026-001C) already used by `/api/projects` and
every ARCH-2026-001C-F read-filter fix. `actor` is optional (function remains callable without it,
defensive against any future internal caller) so no other call site could break.

**Migration:** none — no data model change.

**Compatibility:** CEO/Admin/FinanceManager/Accountant (company-wide roles) see byte-identical output
to before. Only ProjectManager's output changes, from "every project" to "only their assigned
project(s)" — this IS the fix, not a side effect.

**Security:** closes the MODERATE finding. No new scope dimension invented.

**Audit:** unaffected — reads are not audited in this codebase's existing convention.

**Tests:** `tests/erp_arch_2026_002_wave1_tests.js` Part 1 (6 assertions) — pm1 unfiltered, pm1 foreign
project, pm1 own project (positive control), CEO unaffected, FinanceManager unaffected, missing-auth
rejected. Live browser UAT: pm1 sees exactly PRJ-1/PRJ-3 (2 of 5), CEO sees all 5 — see `WAVE1_BROWSER-UAT.md`.

## 2. Bank Reconciliation — consolidation onto one authoritative engine

**What changed (`server/domain.js`):**
- New `parseGenericBankCsv(csvText, bankAccountId)` — the legacy generic-CSV format (Date,Reference,
  Description,Amount,Type) as an input ADAPTER, producing rows in the same shape `parseICICICsv()`
  already produces.
- `createBankImportBatch(...)` gained an optional `format` parameter (`'ICICI'` default, `'GENERIC'`),
  selects the matching adapter, and made running-balance validation null-tolerant (`balanceMatches` is
  `null`/not-applicable, never a false `false`, when no statement-balance column exists).
- `bankImportReconciliationSummary()`'s mismatch filter fixed to `balanceMatches===false` (was `!x`,
  which would have wrongly flagged every null/N-A line as a mismatch).
- New `migrateLegacyBankStatementLines({actor})` — idempotent, additive, non-destructive migration of
  historical `DB.bankStatementLines` records into the unified `DB.bankImportLines` collection.
- `importBankStatement()`, `matchBankStatementLine()`, `unmatchBankStatementLine()`,
  `bankReconciliationStatus()` rewritten as thin compatibility wrappers delegating to the unified engine
  (`createBankImportBatch`/`matchBankImportLine`/`unmatchBankImportLine`/`reconcileBankImportLine`),
  preserving the exact old request/response shapes so neither existing API consumer needed to change.

**What changed (`server/server.js`):** one new Admin/CEO-gated route,
`POST /api/admin/migrate-legacy-bank-lines`, wired to `migrateLegacyBankStatementLines()`. No existing
route's path, method, or role gate was changed.

**What changed (`client_secure/index.html`):** one line — the ICICI Bank Import screen's per-line
"⚠️ balance mismatch" badge changed from `!l.balanceMatches` to `l.balanceMatches===false`, fixing a
false-positive this consolidation would otherwise have introduced (every GENERIC-format or migrated
line has `balanceMatches:null`, which the old falsy check would have wrongly flagged). Found and fixed
during this pass's own live browser UAT — see `WAVE1_BROWSER-UAT.md`.

**Why:** Phase 0's Transaction Ownership audit (`ARCH-2026-002-TRANSACTION-OWNERSHIP.md` row 32) found
2 parallel, independently-wired, both-live reconciliation subsystems for the same real-world event
(bank-line-to-GL-entry matching) — the only real duplicate-ownership conflict found across 35 audited
transaction types. This CR's own §4 explicitly authorized and detailed the consolidation.

**Old path:** `DB.bankStatementLines` (legacy, generic-CSV-only, no duplicate detection, no batch
tracking, no allocate-to-GL capability) and `DB.bankImportLines` (newer, ICICI-aware, full feature set)
were two disjoint collections with two disjoint sets of functions and routes.

**New path:** `DB.bankImportLines` + its function family is the ONE authoritative engine. Both CSV
formats are now adapters feeding it. `DB.bankStatementLines` becomes a frozen historical archive —
nothing writes to it going forward; `migrateLegacyBankStatementLines()` copies its pre-existing records
in, additively, tagged `migratedFromLegacyId` for traceability.

**Migration:** `migrateLegacyBankStatementLines({actor})` — idempotent (skips already-migrated records,
proven by running it twice in the test suite), non-destructive (never modifies/deletes
`DB.bankStatementLines`), preserves historical references (`matchedEntryId`, `reconciledDate`,
`reconciledBy`), preserves reconciliation status (Reconciled→Reconciled, Unmatched→Imported/outstanding),
wrapped in `withTransaction()`. **Not run against production** — exposed only via an explicit,
separately-authorized Admin/CEO route; this Wave 1 pass never invoked it against `server/db.json`.

**Compatibility:** every existing route (`/api/bank-statement/*`) keeps its EXACT existing role gate
(`['Admin','CEO','FinanceManager','Accountant']` for import/match, `['Admin','CEO','FinanceManager']`
for unmatch — narrower than the newer `/api/bank-import/*` routes' `can(actor,'clear')`, which also
includes Accountant for unmatch; this narrower legacy gate was deliberately preserved at the ROUTE
level, not widened, even though both routes now share one domain-layer engine underneath). The old
1-step "match = immediately Reconciled" UX is preserved exactly (the wrapper calls match+reconcile
together). The old 2-bucket (Unmatched/Reconciled) reconciliation view is preserved via a field-shape
mapper (`_toLegacyBankLineShape`) so the existing "Bank Recon" UI screen needed zero changes.

**One deliberate, disclosed behavior improvement (not a regression):** `bankReconciliationStatus()` now
reads from the ONE unified collection for the requested bank account, which means it correctly shows
ALL lines ever imported for that account (via either the legacy or the newer screen), where before the
same account's reconciliation state was silently split across two disjoint views. This is the actual
fix the consolidation exists to deliver, not a side effect — proven live in the migration test (the
legacy view now shows a migrated historical record it could never have shown before).

**Security:** every route's role gate is byte-identical to before. New migration route is Admin/CEO-only,
matching the tier already used for Backup/Restore (the only other explicitly-triggered administrative
action in this codebase).

**Audit:** every existing `logAudit()` call in the consolidated functions is preserved; the migration
adds its own `LegacyBankStatementLinesMigrated` event.

**Tests:** `tests/erp_arch_2026_002_wave1_tests.js` Parts 2-10 (36 assertions) — legacy import
consolidation, duplicate detection, malformed-CSV rejection, match/unmatch one-step UX, cross-engine
consistency, GL allocation of a generic-imported line (a real new capability), accounting impact
(balance + Trial Balance), ICICI-format regression, authorization (both surfaces), concurrency (2
simultaneous imports of the identical file), historical migration (idempotent, non-destructive), audit
trail. Full existing regression battery re-run clean — see `WAVE1_REGRESSION.md`.

## 3. Deferred items — no code changed

RBAC/ID-numbering cleanup (Sales & CRM), BOM pre-Won sequencing, Plan-to-Produce Demand trigger, QC
checklist audit-log gap — see `WAVE1_IMPLEMENTATION_SCOPE.md` rows 3-6 for the exact reason each was
deferred, none silently dropped.
