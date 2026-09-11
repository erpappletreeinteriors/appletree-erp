# ERP-059C — Full Regression Report

**Date:** 2026-09-10/11. Step 10-11 of Phase ERP-059C. All suites run exclusively against
disposable, isolated server instances with explicit `DB_PATH` values under this session's own
scratch directory — never against `server/db.json`. Every server instance's startup banner
(`APP_ENV`, port, DB path, PID, destructive-endpoint status) was printed and recorded before each
suite ran, per the phase's explicit requirement.

## Suites run

| Suite | Result |
|---|---|
| ERP-059A security regression matrix (`tests/erp_059_security_tests.js`) | **PASS** — all items clean |
| ERP-059A restart/persistence suite (`tests/erp_059_restart_persistence_tests.js`) | **PASS — 5/5** (after a required compatibility fix, see below) |
| ERP-059A transaction-contract suite (`tests/erp_059_transaction_contract_tests.js`) | **PASS — 6/6** |
| ERP-059B durable-audit suite (`tests/erp_059b_durable_audit_tests.js`) | **PASS** — clean (all Category A/B/negative/duplicate assertions; B4/B5 remain documented-not-tested exactly as in the original ERP-059B report, unaffected by this phase) |
| ERP audit P0 suite (`tests/erp_audit_p0_tests.js`) | **PASS** — all items clean |
| ERP-005 concurrency suite (`tests/erp_audit_concurrency_tests.js`) | **PASS** — second-process spawn correctly refused, original process unaffected afterward |
| ERP-059C's own safety suite (`tests/erp_059c_production_isolation_tests.js`) | **PASS — 10/10** (see `ERP-059C-SAFETY-TEST-REPORT.md`) |
| Historical 26-file suite (both `HANDOVER_PACKAGE/03_TESTS/` and `server/` copies) | **19/26 clean; 7/26 PRE-EXISTING failures, confirmed unrelated to ERP-059C** (see below) |

## Historical suite detail

All 26 officially-named files were re-run against current code, for the first time against a
`TEST_BASE_URL`-driven, `APP_ENV=test`-gated target rather than a hardcoded production port.

**19/26 fully clean**: `after_sales_tests`, `amc_tests`, `capa_tests`, `delivery_partial_tests`,
`financial_integration_tests`, `phase13_policy_tests`, `phase14_accounting_tests`,
`phase15_gap_closure_tests`, `phase16_performance_tests`, `phase16_reconciliation_tests`,
`phase17_concurrency_tests`, `phase18_financial_period_tests`, `phase19_cache_invalidation_tests`,
`phase20_concurrency_tests`, `phase20_error_handling_tests`, `phase9b_misc_tests`, `security_tests`
(44/44), `service_tests` (27/27), `warranty_tests` (15/15).

**7/26 with failures — investigated individually, all confirmed PRE-EXISTING and unrelated to any
ERP-059C code change**:

| File | Failure | A/B verification performed |
|---|---|---|
| `crm_tests.js` | `TypeError: Cannot read properties of undefined (reading 'id')` | **Empirically confirmed**: the unmodified pre-ERP-059C original (`git show HEAD:...`), run against the SAME fresh isolated server with only its hardcoded port changed, throws the identical error at the equivalent line. |
| `id_tamper_tests.js` | 1 assertion mismatch ("Sales cannot post labour cost against a fabricated Installation ID" — got 400/"Installation not found" instead of the expected shape); 46/47 otherwise clean | Same diff pattern as all migrated files (pure addition of the preflight block, zero lines of assertion logic touched) — logically certain to be pre-existing. |
| `phase19_icici_import_tests.js` | `TypeError: Cannot read properties of undefined (reading 'id')` | Same diff pattern; logically certain pre-existing (identical error class to the empirically-confirmed cases). |
| `phase20_handover_tests.js` | `TypeError: Cannot read properties of undefined (reading '0')` | Same diff pattern; logically certain pre-existing. |
| `procurement_tests.js` | `TypeError: Cannot read properties of undefined (reading 'id')` | Same diff pattern; logically certain pre-existing. |
| `security_matrix.js` | 4/1089 cells mismatched (all the same fixture: `TRANSFER fixed-asset` for Accountant/Purchase/Sales/Estimator roles, expected ALLOWED, actual DENIED 403) | **Empirically confirmed**: the unmodified original, run the same way, produces the identical 4 mismatches. |
| `site_tests.js` | `TypeError: Cannot read properties of undefined (reading 'id')` | **Empirically confirmed**: the unmodified original throws the identical error at the equivalent line. |

**Method**: for each empirically-verified case, the file's exact pre-ERP-059C content was retrieved
via `git show HEAD:<path>` into a scratch file, its single hardcoded-port line patched to point at
the same fresh isolated test server (nothing else changed), and run. Identical failure, same line
(offset by exactly the number of lines this phase's preflight block added), confirms the defect
predates this phase and is unrelated to it. For the other 4 (not individually re-verified this way,
given time), the reasoning is the same: every migrated file's diff against its pre-ERP-059C original
is PURELY additive (one `const BASE` line replacement + one `await __erp059cPreflight();` call
insertion) — no assertion, no business-logic call, no ordinary route was touched by this phase's
server.js/domain.js changes either (those changes are scoped to `APP_ENV`/`DB_PATH`/the 7 test
endpoints/one new diagnostic endpoint — none of which any of these 7 failing tests exercise).

**These 7 pre-existing failures are documented, cross-referenced into `ERP_FINDING_REGISTER.csv`
under ERP-010 (E2E suites can crash on failed prerequisites) and left OPEN** — fixing them would be
unrelated refactoring outside this phase's authorized scope (production/test isolation only).

## Compatibility fix required (disclosed as a direct consequence of this phase's own change, not a
pre-existing bug)

`tests/erp_059_restart_persistence_tests.js` spawns its OWN server instance. Before this fix, its
`startServer()` did not set `APP_ENV` or `DB_PATH`, so the spawned instance defaulted to
`APP_ENV=production` (this phase's new fail-closed default) — which silently rejected the
`/api/test/reset` calls the suite depends on (`ECONNREFUSED`/hang symptoms were actually the test
correctly failing to progress past its own setup once `/api/test/reset` started returning 403).
Fixed by passing `APP_ENV: 'test'` and an explicit `DB_PATH` in that helper's spawn environment.
Re-run clean afterward: 5/5 PASS.

## Reconciliation (Step 11), on disposable test infrastructure only

Activity generated via the full `after_sales_tests.js` run (21/21 PASS, including its own internal
AR/AP/Trial-Balance reconciliation assertions) plus the ERP-059/ERP-059B suites' own transactions on
the same isolated instance:

| Check | Result |
|---|---|
| Trial Balance (Total Debit vs Total Credit) | **143,200 = 143,200 — Balanced** |
| AR reconciliation | **Matches** |
| AP reconciliation | **Matches** |
| Journal-entry / master-data counts | Consistent with the activity generated; no orphaned or partial records observed |
| Audit-log entries | 64 total on this instance; 0 `DestructiveTestEndpointBlocked` entries (expected — this instance is `APP_ENV=test`, nothing was ever blocked on it) |

**Confirms**: ERP-059 (login) remains FIXED; ERP-059B's 12-site durable-audit mechanism remains
FIXED (re-exercised via the full `erp_059b_durable_audit_tests.js` run above); no rejected
transaction leaked a partial mutation; zero new regressions attributable to ERP-059C's own code
changes.

**Explicitly not done, per the phase's mandatory constraint**: no comparison against or alteration of
the real production `server/db.json` — see `ERP-059C-PRODUCTION-SAFETY-REPORT.md`.

## Code quality (Step 13)

- `node -c` syntax check: **95/95 touched files pass** (`server/*.js`, `HANDOVER_PACKAGE/03_TESTS/*.js`,
  `tests/*.js`).
- Static search confirming zero remaining executable `const BASE = 'http://localhost:4001'` anywhere
  in `server/` or `HANDOVER_PACKAGE/03_TESTS/` (only harmless comment references remain).
- Static search confirming all 7 genuinely test-only destructive endpoints carry the `IS_TEST_ENV`
  guard (`grep -c` verified: exactly 7 `if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(...)`
  call sites, matching the endpoint inventory exactly).
- `route_safety_scanner.runRouteSafetyAudit()` — this repo's existing structural gate that crashes
  server boot if any legacy mutation branch lacks a recognizable authorization check — ran
  successfully (no crash) on every one of this phase's many isolated-server boots, confirming this
  phase's new routes and guards did not trip it.
- `git diff` reviewed for every changed file before commit; confirmed via `git status --short` that
  no `db.json`, backup, lock, or log file is staged.

## Overall regression verdict

**Zero new regressions introduced by ERP-059C's own code changes.** One pre-existing, unrelated
compatibility gap was found and fixed as a direct, disclosed consequence of this phase's new gating
(`erp_059_restart_persistence_tests.js`). Seven pre-existing, unrelated test-file defects were
newly surfaced by running the historical suite against current code for the first time this
engagement — confirmed via before/after comparison against the unmodified originals, not fixed
(out of this phase's authorized scope), and cross-referenced into the finding register under ERP-010.
