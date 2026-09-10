# ERP Remediation Report — Session 1

**Date:** 2026-09-10
**Source audit:** Independent SAP-Level 360° Audit, QA, UAT & Gap Analysis (2026-09-10) — 58
findings (17 Critical / 23 High / 17 Medium / 1 Low), verdict **NO-GO**.
**This session's scope:** Phase 0 (forensic verification) through Phase 2 (P0 transaction
integrity) of the remediation brief, plus the ERP-005 concurrency mitigation and ERP-017 import
atomicity fix from later phases, prioritized because both are explicitly Critical/P0 items.

## How this session worked

Every finding fixed below was handled the way the brief requires, not by pattern-matching the
audit's prose:

1. **Reproduce first.** Before writing a single fix, each claimed defect was independently
   re-verified by reading the actual current code and, for the highest-risk items, reproducing the
   exploit live against a disposable, isolated test server (never against the real `db.json`).
2. **Root-cause, not symptom.** Each fix targets the actual validation gap (e.g., a conditional
   check that should be unconditional, a value that was coerced but never validated, a reference
   that was stored but never checked for existence).
3. **Regression test, not a one-off check.** Every fix has a permanent, automated test in
   `tests/erp_audit_p0_tests.js` or `tests/erp_audit_concurrency_tests.js` — re-run after every
   subsequent change in this session to confirm no regression, finishing at **51/51 functional
   tests passing** plus a separate, independently-verified concurrency test.
4. **Negative-path proof.** Each fix was proven to correctly REJECT the bad case AND still ACCEPT
   the legitimate case (e.g., a zero-quantity GRN line is legitimate when a multi-line GRN receives
   only some lines; only an all-zero GRN is rejected).

## Findings fixed this session (18 of 58)

Full detail, per-finding, is in `ERP_FINDING_REGISTER.csv`. Summary:

| ID | Severity | Title |
|---|---|---|
| ERP-005 | Critical | Multi-process lost update — closed via a single-instance startup lock |
| ERP-017 | Critical | Master-data import atomicity — true two-phase validate-then-commit |
| ERP-023 | Critical | Invalid/contradictory journal lines — central per-line validation |
| ERP-025 | Medium | Balanced TB concealing invalid lines — closed as a consequence of ERP-023 |
| ERP-026 | Critical | Negative GRN quantity corrupting PO state |
| ERP-027 | Critical | Production Order invalid planned quantity |
| ERP-028 | Critical | Production completion invalid quantities (+ found a route bug dropping rejectedQty entirely) |
| ERP-029 | High | PO line quantity/rate validation |
| ERP-030 | Critical | Dispatch invalid material/quantity |
| ERP-031 | Critical | Delivery material substitution |
| ERP-032 | Critical | Empty QC checklist marked Passed |
| ERP-033 | High | QC referencing nonexistent installation |
| ERP-034 | High | Duplicate handover records |
| ERP-040 | Critical | Restore accepting incomplete/tampered snapshot |
| ERP-042 | Critical | Warranty referencing nonexistent handover |
| ERP-043 | Critical | Service ticket referencing nonexistent warranty/AMC |
| ERP-044 | High | AMC customer/project relationship |
| ERP-045 | Critical | Production Order/BOM project mismatch |
| ERP-046 | High | PO line missing material identity |

**Critical findings closed: 13 of 17. High findings closed: 5 of 23.**

## A genuine second defect found while fixing ERP-028

While adding rejectedQty validation to `completeProductionOrder()`, live testing showed the fix had
no effect — because the API route (`server.js`, `/api/production-orders/:id/complete`) never
forwarded `body.rejectedQty` to the domain function at all. This means **no rejected quantity could
ever have been recorded through the API**, a defect independent of and not named by the audit.
Fixed alongside ERP-028 (see `ERP_FINDING_REGISTER.csv` for detail) and covered by the same
regression test.

## Files changed

- `server/domain.js` — all 18 fixes above (validation logic, `validateDatabaseSnapshot()`,
  `validateRestoreCandidate()`, `acquireSingleInstanceLock()`, rewritten `importMasterData()`).
- `server/server.js` — new `/api/admin/restore-validate` route; fixed the `/complete` route to
  forward `rejectedQty`.
- `tests/erp_audit_p0_tests.js` — new, 51 assertions across 18 findings, permanent regression
  suite.
- `tests/erp_audit_concurrency_tests.js` — new, real multi-process ERP-005 regression test.
- `server/backups/domain.js.pre_erpaudit_20260910_105618`, `server.js.pre_erpaudit_20260910_105618`,
  `db.json.pre_erpaudit_20260910_105618` — pre-session backups, taken before any edit.

**The live `db.json` was never touched.** All testing ran against a disposable isolated server
copy in the session scratch directory, seeded fresh via the existing `resetToFreshSeed()`
mechanism, never against production data.

## Test evidence

```
=== ERP AUDIT P0 REGRESSION: 51/51 passed ===
PASS [ERP-005] A second process against the same db.json is refused at startup, citing the lock
```
(Full per-assertion output was reviewed during the session; summarized here rather than pasting
all 51 lines.)

## How to apply these fixes to the running production server

The live `server/domain.js` and `server/server.js` already contain every fix above (verified
byte-identical to the tested isolated copy — see the diff check performed this session). **These
are code changes only; they take effect on the next server restart.** If a production
`node server.js` process is currently running, it is still executing the pre-fix code in memory
until restarted. No data migration or `db.json` change is required — restart is the only action
needed. On restart, the new `acquireSingleInstanceLock()` will create `server/db.json.lock`
automatically; no manual step is needed unless a stale lock is ever left behind by an unclean
shutdown (delete `db.json.lock` in that case, per the startup error message).

## Findings NOT addressed this session (40 of 58)

Every one of these is listed with its own root cause and recommended fix in
`ERP_FINDING_REGISTER.csv` — none were silently dropped. Grouped by why they weren't attempted:

**Genuinely architectural, not a code patch (documented in `ERP_ARCHITECTURE_ASSESSMENT.md`):**
ERP-001 (single-file DB), ERP-006 (full-snapshot save cost), ERP-013/ERP-014 (session
architecture).

**Requires a business/policy decision before it can be built without guessing (POLICY DECISION
REQUIRED — see below):** ERP-050 (Finished Goods valuation methodology).

**Substantial new capability, not a validation fix — out of a single remediation session's
realistic scope:** ERP-051 (Routing/Work Centres), ERP-052 (MRP), ERP-053 (Sales Order layer),
ERP-054 (Batch/Serial), ERP-055 (Workforce — audit itself says don't build unless in scope),
ERP-056 (Maintenance), ERP-058 (deeper inspection-plan depth beyond the two defects already
closed).

**Real, scoped fixes deferred to the next session purely for time, same pattern as fixes already
proven this session (should be the FIRST items in session 2):** ERP-021 (opening-balance
atomicity — identical fix pattern to ERP-017, not yet applied), ERP-018 (CSV quoting), ERP-024
(TDS cumulative threshold), ERP-035 (billing milestone amount validation), ERP-036/ERP-037
(reporting date semantics), ERP-038 (MIS label), ERP-039 (export filter consistency).

**Deployment/operational actions, not code defects:** ERP-016 (rotate demo credentials before
real go-live), ERP-041 (external backup storage).

**Test-harness/governance findings, not production-code defects:** ERP-002, ERP-009, ERP-010,
ERP-012, ERP-047 (partially addressed — this session's own new suite IS a reproducible current
release gate for what it covers), ERP-048, ERP-049.

**Not yet assessed this session:** ERP-003 (partially — narrowed by specific fixes),
ERP-004, ERP-008, ERP-011 (partially), ERP-015, ERP-019, ERP-020, ERP-022, ERP-057.

## Policy decision required

### ERP-050 — Finished Goods valuation methodology

Building the Production Completion → QC → FG Receipt → FG Inventory → Accounting chain the audit
requires a decision on **how a finished unit's cost is valued** when it enters inventory. This
cannot be guessed without either inventing a number or silently picking a method Appletree hasn't
approved.

- **Option A — Standard cost.** Use the BOM's own material cost + a configured labour/overhead
  rate as a fixed "standard" cost per unit, with variance posted separately. Simple, consistent,
  but requires Appletree to set and maintain standard rates.
- **Option B — Actual cost (BOM-derived).** Sum the actual material issues + actual labour cost
  entries already recorded against that specific Production Order, divide by units completed.
  Reflects real cost but is more complex and can produce a different cost per unit for every batch.
- **Option C — Weighted average (existing pattern).** Reuse the same moving-average valuation
  mechanism already used for purchased inventory, applied to FG receipts.

**Recommended:** Option B (actual cost from the Production Order's own recorded material issues +
labour), because it requires zero new configuration and is directly traceable to real transactions
already in the system — consistent with this engagement's standing principle of never inventing a
number. **Business impact:** FG valuation will vary batch-to-batch, which is realistic for a
project-based furniture business but should be confirmed acceptable to Finance. **Technical
impact:** requires a new `postJournalEntry()` call (Dr Finished Goods Inventory / Cr WIP) and a
new inventory movement type. **Accounting impact:** introduces a genuinely new GL account (Finished
Goods Inventory) if one doesn't already exist — needs Finance sign-off on the Chart of Accounts
entry. **Implementation consequence if deferred:** Production Orders continue to complete with no
inventory/accounting consequence, exactly as today (disclosed, not silently broken).

## What was NOT done, stated plainly

This session did not run a 10-50 concurrent-operation stress test at scale, did not run a
100k-transaction performance benchmark, did not perform a real-data migration rehearsal, did not
re-run the historical 26-file test suite, and did not touch reporting/MIS/TDS/CSV-parsing code.
None of the 10 requested deliverable documents beyond this report, the finding register, and the
architecture assessment were produced this session — producing all 10 with genuine, evidence-backed
content (not placeholders) for an audit this size is realistically several more sessions of work,
and this session chose depth on the P0 items actually fixed over shallow coverage of everything
requested.
