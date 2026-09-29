# WAVE1_ACCEPTANCE.md

**Date:** 2026-09-22. Final acceptance package for ARCH-2026-002 Wave 1 implementation, per this CR's
own §24 (A-J) and §22 (final acceptance matrix).

## Final Acceptance Matrix (this CR's own §22 format)

| Area | Result | Evidence |
|---|---|---|
| Home & Workspace | **PASS (unchanged)** | No code touched this domain; full regression clean |
| Sales & Customer | **PASS (unchanged, cleanup deferred)** | RBAC/ID-numbering cleanup explicitly deferred (`WAVE1_IMPLEMENTATION_SCOPE.md` row 3); full regression clean |
| Estimation & Costing | **PASS (unchanged, BOM sequencing deferred)** | BOM pre-Won sequencing explicitly deferred (row 4); full regression clean |
| Project & Contract | **PASS** | Budget Variance report (owned by this domain group) fixed and live-tested |
| Master Data | **PASS (unchanged)** | No code touched this domain; full regression clean |
| Reporting & Analytics | **PASS** | Cross-project data-scope leak fixed, 6 assertions + live browser UAT, `WAVE1_SECURITY-RESULTS.md` §2 |
| Bank Reconciliation consolidation | **PASS** | 1 real duplicate closed to 1 authoritative engine, 36 assertions + live browser UAT, `WAVE1_TRANSACTION-OWNERSHIP.md` |
| Lead-to-Quotation | **PARTIAL (unchanged, deferred)** | BOM/BOQ pre-Won gap not authorized for this pass (`ARCH-2026-002-OPEN-DECISIONS.md` item 5) — chain remains exactly as Phase 0 found it, not worsened |
| Plan-to-Produce dependency | **DEFERRED** | Out of Wave 1's domain scope entirely (Manufacturing is Wave 2); registered for Wave 2/6, no code touched |
| Security | **PASS** | No CRITICAL found or introduced; 1 MODERATE fixed, 1 LOW deferred with reason; `WAVE1_SECURITY-RESULTS.md` |
| RBAC | **PASS** | 39/39, unchanged |
| Data Scope | **PASS** | 65/65 (32+33) pre-existing suites unchanged; Reporting fix reuses the same engine, 6 new assertions |
| SoD | **PASS** | 30/30, unchanged |
| Approval | **PASS** | 37/37, unchanged |
| Audit | **PASS** | Existing `logAudit()` calls preserved; new `LegacyBankStatementLinesMigrated` event added and verified present |
| Accounting invariants | **PASS** | Trial Balance/AR/AP/GST reconciliation clean at 525-document stress scale; GL allocation of a generic-imported line correctly posts through the single `postJournalEntry()`, balance moves by the exact amount |
| Inventory invariants | **N/A** | Neither Wave 1 item touches inventory |
| Browser UAT | **PASS** | Both items verified through real rendered screens; 1 real defect found and fixed live during UAT itself (`WAVE1_BROWSER-UAT.md` §3) |
| Regression | **PASS** | 527/529 (2 pre-existing documented) — byte-identical to the Phase 0 baseline; new suite 42/42; grand total 569/571 |
| Production safety | **PASS** | Hash `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` confirmed identical at every checkpoint throughout |

## A. Files changed

- `server/domain.js` — `parseGenericBankCsv()` (new), `createBankImportBatch()` (format-adapter +
  null-tolerant balance validation), `bankImportReconciliationSummary()` (mismatch-filter fix),
  `migrateLegacyBankStatementLines()` (new), `importBankStatement()`/`matchBankStatementLine()`/
  `unmatchBankStatementLine()`/`bankReconciliationStatus()` (rewritten as compatibility wrappers),
  `projectBudgetVarianceReport()` (scope filter added), `module.exports` (2 new exports).
- `server/server.js` — 1 new route (`POST /api/admin/migrate-legacy-bank-lines`), 1 call-site update
  (`projectBudgetVarianceReport(...,actor)`).
- `client_secure/index.html` — 1 line (ICICI Bank Import screen's balance-mismatch badge, `!x` →
  `x===false`, fixing a false positive this pass's own null-tolerant balance validation would otherwise
  have introduced).

## B. Files created

`WAVE1_IMPLEMENTATION_SCOPE.md`, `WAVE1_CHANGELOG.md`, `WAVE1_TRANSACTION-OWNERSHIP.md`,
`WAVE1_SECURITY-RESULTS.md`, `WAVE1_TEST-RESULTS.md`, `WAVE1_BROWSER-UAT.md`, `WAVE1_REGRESSION.md`,
`WAVE1_ACCEPTANCE.md` (this file), `tests/erp_arch_2026_002_wave1_tests.js`.

## C. Migrations performed

**None against production.** `migrateLegacyBankStatementLines()` was written, tested (idempotency,
non-destructiveness, historical-reference preservation all proven — `WAVE1_TEST-RESULTS.md` Part 9),
and exposed via an explicit Admin/CEO-gated route, but was never invoked against `server/db.json`. It
remains a separate, explicitly-authorized action for management to trigger later, consistent with this
CR's own Rule 11 and the broader engagement's standing "no automatic production migration" discipline.
Production's own `DB.bankStatementLines` (if any historical records exist there) remains completely
untouched by this Wave 1 pass.

## D. Tests executed

42 new (`erp_arch_2026_002_wave1_tests.js`) + 527 pre-existing (21 suites) + 2 specially-invoked
(concurrency, restart-persistence) = **571 total, 569 PASS, 2 pre-existing documented FAIL.** See
`WAVE1_TEST-RESULTS.md` and `WAVE1_REGRESSION.md`.

## E. Browser UAT evidence

Real rendered-screen verification for both items, including one real defect found and fixed live. See
`WAVE1_BROWSER-UAT.md`.

## F. Security results

No CRITICAL found or introduced. 1 MODERATE fixed and live-tested; 1 LOW explicitly deferred to its
owning domain's wave. See `WAVE1_SECURITY-RESULTS.md`.

## G. Regression results

527/529 pre-existing (byte-identical to Phase 0 baseline) + 42/42 new = 569/571. See
`WAVE1_REGRESSION.md`.

## H. Production hash before/after

Before this Wave 1 pass: `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`.
After this Wave 1 pass (3 independent checkpoints — start, mid-pass, end): identical. **Unchanged
throughout.**

## I. Unresolved decisions

Carried forward, unresolved, from `ARCH-2026-002-OPEN-DECISIONS.md`: items 1 (CEO/Admin split), 2
(Integration & Platform scope), 3 (Payroll statutory config) — all explicitly out of Wave 1 scope. Items
4 (Sales/CRM RBAC-ID cleanup) and 5 (BOM pre-Won sequencing) — genuinely Wave-1-adjacent but not
authorized by this pass's own text, deferred with reason, not decided. Item 7 (Plan-to-Produce Demand
trigger) — out of Wave 1's domain scope, registered for a later wave. Item 6 (Bank Reconciliation
duplicate) — **RESOLVED this pass** (consolidated to one engine). Item 8 Finding 1 (Reporting leak) —
**RESOLVED this pass** (fixed). Item 8 Finding 2 (QC audit-log gap) — remains open, deferred to Wave 2
per domain boundary.

## J. Final Wave 1 verdict

# PASS

Both items this CR's own text explicitly authorized (Bank Reconciliation consolidation §4; the
Reporting & Analytics security finding via §7-§8) are implemented, tested (unit/domain/API/RBAC/
scope/audit/accounting/concurrency/negative — 42 new assertions), browser-UAT'd (with one real defect
found and fixed live), and regression-proven against the full existing battery with zero new failures.
Every item this pass's own text left genuinely undecided (RBAC/ID cleanup, BOM sequencing,
Plan-to-Produce, QC audit gap) was explicitly deferred with a stated reason — none silently implemented
as an assumption, none silently dropped without record. No duplicate engine was created. No existing
transaction owner was reassigned. No new authorization mechanism was introduced — both changes reuse the
existing RBAC/data-scope/audit/GL/numbering engines exclusively. Production `server/db.json` was never
modified.

**Per this CR's own final rule: not proceeding to Wave 2.** Waiting for explicit authorization.
