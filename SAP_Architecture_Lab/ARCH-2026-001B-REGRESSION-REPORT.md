# ARCH-2026-001B — Regression Report

**Date:** 2026-09-21. Existing regression results, run against a fresh isolated instance built from
the ARCH-2026-001B-modified `server/domain.js`/`server/server.js`. Production `server/db.json` was
never used as a target.

## 1. New suite (this CR)

`tests/erp_arch_2026_001b_route_auth_migration_tests.js` — **18/18 PASS** (0 FAIL).

## 2. Prior suite re-run (proves this CR did not regress ARCH-2026-001A)

`tests/erp_arch_2026_001a_rbac_foundation_tests.js` — **39/39 PASS** (0 FAIL), re-run fresh after
this CR's code changes.

## 3. Full existing suite

| Suite | Result | Notes |
|---|---|---|
| `tests/erp_059_security_tests.js` | **PASS** (full run, `http://localhost:48222`) | Session/auth fundamentals |
| `tests/erp_059_transaction_contract_tests.js` | **PASS** (full run) | Includes the SoD-violating self-approval rejection test |
| `tests/erp_059c_production_isolation_tests.js` | **10/10 PASS** (standalone, against the real modified repo code) | Strongest available proof the refactor works against the actual repo, not a scratch copy |
| `tests/erp_audit_p0_tests.js` | **PASS** (full run) | Atomicity/dry-run batch tests |
| `tests/erp_059b_durable_audit_tests.js` | **22/24 PASS** | 2 pre-existing, already-documented gaps (B6/B7 — restore-rejection tests requiring local filesystem access to a `backups/` directory relative to the test script's own invocation context, not reachable when driving a remote isolated instance) — **identical to the 22/24 result CR-2026-002 itself recorded**, not a new regression |
| `tests/erp_phase38_e2e_trace_tests.js` | **PASS** (full run) | TB/AR/AP/GST reconciliation |
| `tests/erp_phase39_manufacturing_jobwork_tests.js` | **PASS** (full run) | Job Work net-stock, APOB-gated dispatch |
| `tests/erp_phase39_fixed_assets_tests.js` | **PASS** (full run) | Fixed Asset register reconciliation |
| `tests/erp_phase39_banking_tests.js` | **PASS** (full run) | Bank import/reconciliation |
| `tests/erp_phase39_payment_approval_matrix_tests.js` | **PASS** (full run) | **Payment Request maker-checker-executor 3-person separation confirmed still live-enforced, unchanged** |
| `tests/erp_def_2026_001_qc_dashboard_tests.js` | **PASS** (full run) | DEF-2026-001 fix regression guard |
| `tests/erp_phase39_stress_test.js` | **PASS** (full run) | 525-document volume, zero duplicate document numbers |
| `tests/erp_cr_2026_002_env_safety_tests.js` | **19/19 PASS** | Self-contained; confirms `env.js` integration undisturbed |

## 4. Note on test-invocation methodology (disclosed, not a product issue)

During this regression run, 4 suites (`erp_059_security_tests`, `erp_059_transaction_contract_tests`,
`erp_audit_p0_tests`, `erp_059b_durable_audit_tests`) initially appeared to fail with `ECONNREFUSED`
when invoked via the `TEST_BASE_URL` environment variable. Investigation found these 4 specific files
take the base URL as a **positional command-line argument** (`process.argv[2]`), not the env var —
unlike the phase38/39-era suites, which do read `TEST_BASE_URL`. This is a pre-existing convention
inconsistency across this test suite's own history (different phases, different authors' choices),
not something this CR introduced or needs to fix. Re-invoked with the correct positional argument, all
4 passed cleanly (one, `erp_059b_durable_audit_tests`, at its own pre-existing 22/24 baseline). No
product code was affected by this investigation.

## 5. Critical Phase 39/40/43 areas — explicitly re-verified

| Control | Verified via | Result |
|---|---|---|
| Payment Request (maker-checker-executor) | `erp_phase39_payment_approval_matrix_tests.js` | PASS |
| Production/Service material issue, Stock Count (Phase 43 fixes) | `erp_phase39_manufacturing_jobwork_tests.js` | PASS |
| PO/commitment atomicity (Phase 42 P42-01 fix) | `erp_059c_production_isolation_tests.js`; `submitPurchaseOrder()`/`approvePurchaseOrder()` source confirmed unchanged by this CR's own diff scope | PASS |
| Accounting (TB/AR/AP/GST) | `erp_phase38_e2e_trace_tests.js`, `erp_phase39_stress_test.js` | PASS |
| Inventory | `erp_phase39_manufacturing_jobwork_tests.js`, `erp_def_2026_001_qc_dashboard_tests.js` | PASS |
| Banking | `erp_phase39_banking_tests.js` | PASS |
| Fixed Assets | `erp_phase39_fixed_assets_tests.js` | PASS |
| Numbering | `erp_phase39_stress_test.js` — zero duplicate document numbers at 525-document volume | PASS |
| Document traceability | `erp_phase38_e2e_trace_tests.js` | PASS |
| Security | `erp_059_security_tests.js` | PASS |
| Authentication | `erp_059_security_tests.js`, `erp_059b_durable_audit_tests.js` | PASS |

No existing test was rewritten to accommodate a regression.

## 6. Production data safety throughout

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`, 52,518
bytes, mtime `2026-09-19T09:24:59.947Z` — identical before this CR began and after the entire
regression battery completed. `server/db.json.bak` mtime also unchanged. `server/db.json.lock`
present, pre-existing, untouched.

## 7. Conclusion

Zero regressions. Every suite that passed before this CR still passes after it. The one suite with a
non-100% result (`erp_059b_durable_audit_tests`, 22/24) is at the EXACT SAME baseline CR-2026-002
itself recorded — not a new gap introduced by this CR.
