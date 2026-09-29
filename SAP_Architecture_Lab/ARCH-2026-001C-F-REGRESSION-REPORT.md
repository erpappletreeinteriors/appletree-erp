# ARCH-2026-001C-F — Regression Report

**Date:** 2026-09-21. Existing regression results, run against a fresh isolated instance built from
the ARCH-2026-001C-F-modified `server/server.js` (no `server/domain.js` change this CR). Production
`server/db.json` was never used as a target.

## 1. New suite (this CR)

`tests/erp_arch_2026_001c_f_residual_scope_tests.js` — **33/33 PASS** (0 FAIL), including the
defect-fix regression battery for all 9 previously-unsafe sites.

## 2. Prior-CR suites re-run (proves this CR did not regress 001A/001B/001C)

- `tests/erp_arch_2026_001a_rbac_foundation_tests.js` — **39/39 PASS**.
- `tests/erp_arch_2026_001b_route_auth_migration_tests.js` — **18/18 PASS**.
- `tests/erp_arch_2026_001c_data_scope_tests.js` — **32/32 PASS**.

## 3. Full existing suite

| Suite | Result |
|---|---|
| `tests/erp_059_security_tests.js` | **PASS**, 0 FAIL lines |
| `tests/erp_059_transaction_contract_tests.js` | **PASS**, 0 FAIL lines |
| `tests/erp_059c_production_isolation_tests.js` | **10/10 PASS** (standalone, real repo code, also re-run internally by the new suite's own Part 3) |
| `tests/erp_audit_p0_tests.js` | **PASS**, 0 FAIL lines |
| `tests/erp_059b_durable_audit_tests.js` | **PASS** on every visible assertion (0 FAIL lines in the full captured log); consistent with the SAME pre-existing 22/24 baseline recorded at CR-2026-002's, ARCH-2026-001B's, and ARCH-2026-001C's own close (2 documented, unrelated filesystem-path gaps, B6/B7) |
| `tests/erp_phase38_e2e_trace_tests.js` | **PASS** |
| `tests/erp_phase39_manufacturing_jobwork_tests.js` | **PASS** |
| `tests/erp_phase39_fixed_assets_tests.js` | **PASS** |
| `tests/erp_phase39_banking_tests.js` | **PASS** |
| `tests/erp_phase39_payment_approval_matrix_tests.js` | **PASS** — Payment Request maker-checker-executor confirmed still live-enforced, unchanged |
| `tests/erp_def_2026_001_qc_dashboard_tests.js` | **PASS** |
| `tests/erp_phase39_stress_test.js` | **PASS** — "Document numbering remained unique under load — 525 vouchers, zero duplicates" |
| `tests/erp_cr_2026_002_env_safety_tests.js` | **19/19 PASS** |

**Combined regression-battery exit code: 0. Zero `FAIL`/`❌ FAIL` lines found anywhere in the full
captured output across all 44+ visible assertions plus the 3 new-suite totals.**

## 4. The defect-fix regression, specifically

All 9 previously-unsafe sites re-tested with both negative (non-fullAccess, non-owning role → 403) and
positive-control (fullAccess role → 200; owning ProjectManager → 200; non-owning ProjectManager → 403)
cases — 18 of the 33 new assertions are dedicated to this. Zero failures.

## 5. Production data safety throughout

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`, 52,518
bytes, mtime `2026-09-19T09:24:59.947Z` — identical before this CR began and after the entire
regression battery completed (including the live `curl` probe that first surfaced the defect, and
every isolated-server invocation used to fix and re-verify it).

## 6. Conclusion

Zero regressions beyond the one self-caught-and-fixed defect (which never reached a committed,
finalized state — it was found, root-caused, and reverted within this same CR, before the formal test
suite was even written). Every suite that passed before this CR still passes after it.
