# ERP-059B — Full Regression Report

**Date:** 2026-09-10. Part 13 of the ERP-059B brief. All suites run against an isolated,
disposable server — never production. See §"Production-safety note" below for why this required
extra precautions this time.

## Production-safety note (read first)

A production-database incident occurred earlier in this phase (full account in
`PHASE-ERP059B-REMEDIATION-REPORT.md` §16): a test file hardcoded to port 4001 was run against the
still-live production server, wiping it. Following that incident, the user directed that all
further work use isolated servers only. Several files in the historical 26-file suite below are
themselves hardcoded to `http://localhost:4001` — exactly the defect pattern that caused the
incident. To run them without any further production risk:

1. All 26 files (+ the ICICI CSV fixture they depend on) were copied into a disposable scratch
   directory.
2. Every copy was patched with `sed -i "s/localhost:4001/localhost:4095/g"`, verified via
   `grep -c "localhost:4095"` on a sample file to confirm the substitution took effect.
3. `netstat` was checked immediately before AND after running the full suite, both times
   confirming port 4001 had no active listener touched by this session (the production server
   remained stopped, as left at the end of the incident response).
4. The isolated server itself was booted on port 4095 from scratch-directory copies of
   `domain.js`/`server.js`/`auth.js`/`route_safety_scanner.js`, seeded fresh — never pointed at
   `server/db.json`.

## Suites run

| Suite | Files | Result |
|---|---|---|
| Historical regression suite | 26 files (`HANDOVER_PACKAGE/03_TESTS/*.js`, port-patched copies) | **PASS — 0 new regressions** |
| ERP-059A security regression matrix | `erp_059_security_tests.js` (17 items) | **PASS — all 17, no regressions** |
| ERP-059A restart/persistence suite | `erp_059_restart_persistence_tests.js` | **PASS** (after an unrelated `stopServer()` bugfix, see below) |
| ERP-059A transaction-contract suite | `erp_059_transaction_contract_tests.js` | **PASS** |
| ERP-059B durable-audit suite (this phase's own) | `erp_059b_durable_audit_tests.js` | **PASS — 24/24** (2 items correctly excluded from the denominator as documented-not-tested, see the durable-audit test report) |

## Historical suite detail

All 26 files executed cleanly against the isolated server on port 4095. No test that previously
passed now fails; no new error, stack trace, or unexpected `ok:false` was observed that wasn't
already an intentional negative-test assertion. The ICICI bank-statement CSV fixture (a dependency
of one of the 26 files) was copied alongside the port-patched test files and confirmed loadable.

One file in this suite (`erp_059_restart_persistence_tests.js`, actually part of the ERP-059A
suite re-run here for completeness) required a fix unrelated to ERP-059B's own scope, to get a
clean run at all: its `stopServer()` helper called `.toString()` on the return value of
`execSync(..., {stdio:'ignore'})`, which is `null` when `stdio:'ignore'` is set, causing a crash
(`Cannot read properties of null (reading 'toString')`) on every invocation. Fixed by removing the
`.toString()` call — a one-line, test-infrastructure-only fix, not a product code change.

## ERP-059A suites re-run

Confirms ERP-059B's changes did not regress ERP-059A's own fix or its verification suites:
- Login lockout bypass (ERP-059, the original finding) remains FIXED — 17/17 security matrix items
  still pass, including the specific lockout-bypass reproduction case.
- The transaction-contract test (proving non-login business rejections still fully roll back) still
  passes — i.e., this phase's `durableFailureAudit` addition did not weaken or bypass the rollback
  guarantee for any of the 12 migrated sites; it only adds one audit row after the rollback, exactly
  as designed.

## ERP-059B's own suite

24/24 pass (2 of the original 26 assertions — B4, B5 — are recorded as `pass:null`
"DOCUMENTED-NOT-TESTED" and excluded from the denominator per the honest-disclosure requirement;
see `ERP-059B-DURABLE-AUDIT-TEST-REPORT.md` for the full breakdown and reasoning).

## Concurrency

Re-confirmed (from ERP-005, an earlier phase): the single-instance lock (`acquireSingleInstanceLock()`)
continues to work correctly — stale-lock auto-reclaim messages observed on every isolated-server
restart during this phase's testing, consistent with every prior phase this session.

## Overall regression verdict

**Zero new regressions introduced by ERP-059B's code changes.** One pre-existing, unrelated test-
infrastructure bug (`stopServer()` null-toString crash) was found and fixed as a prerequisite to
getting a clean run — disclosed here, not silently folded into "PASS."
