# ARCH-2026-001E — Regression Report

**Date:** 2026-09-21. Existing regression results, run against fresh isolated instances built from
the ARCH-2026-001E-modified `server/domain.js`/`server/server.js`. Production `server/db.json` was
never used as a target.

## 1. New suite (this CR)

`tests/erp_arch_2026_001e_approval_authority_tests.js` — **37/37 PASS** (0 FAIL), including engine-
level `resolveApprovalAuthority()` correctness for all 4 transaction types, the Design Review
self-approval fix (engine + live), a real concurrency race, and a full regression re-run internally.

## 2. Prior-CR suites re-run (proves this CR did not regress 001A/001B/001C/001C-F/001D)

| Suite | Result |
|---|---|
| `tests/erp_arch_2026_001a_rbac_foundation_tests.js` | **39/39 PASS** |
| `tests/erp_arch_2026_001b_route_auth_migration_tests.js` | **18/18 PASS** |
| `tests/erp_arch_2026_001c_data_scope_tests.js` | **32/32 PASS** |
| `tests/erp_arch_2026_001c_f_residual_scope_tests.js` | **33/33 PASS** |
| `tests/erp_arch_2026_001d_sod_tests.js` | **30/30 PASS** |

No test file from any prior CR needed modification this time (unlike ARCH-2026-001D, which required
one disclosed assertion update) — `reviewDesign()`'s new check is additive (blocks a combination that
was never legitimately exercised by any prior test), and the new `resolveApprovalAuthority()`/route
are entirely new surface with no prior assertions to conflict with.

## 3. Full existing suite

| Suite | Result |
|---|---|
| `tests/erp_059_security_tests.js` | **PASS**, 0 FAIL lines |
| `tests/erp_059_transaction_contract_tests.js` | **PASS**, 0 FAIL lines |
| `tests/erp_059c_production_isolation_tests.js` | **10/10 PASS** (standalone, real repo code; also re-run internally by the new suite's own Part 4) |
| `tests/erp_audit_p0_tests.js` | **PASS**, 0 FAIL lines |
| `tests/erp_059b_durable_audit_tests.js` | **PASS** on every visible assertion (consistent with the pre-existing 22/24 baseline — 2 documented, unrelated filesystem-path gaps) |
| `tests/erp_phase38_e2e_trace_tests.js` | **PASS** |
| `tests/erp_phase39_manufacturing_jobwork_tests.js` | **PASS** |
| `tests/erp_phase39_fixed_assets_tests.js` | **PASS** |
| `tests/erp_phase39_banking_tests.js` | **PASS** |
| `tests/erp_phase39_payment_approval_matrix_tests.js` | **PASS** — the maker-checker-executor 3-person separation (SOD-2, unchanged) confirmed still live-enforced |
| `tests/erp_def_2026_001_qc_dashboard_tests.js` | **PASS** |
| `tests/erp_phase39_stress_test.js` | **PASS** — 525-document volume, zero duplicate document numbers |
| `tests/erp_cr_2026_002_env_safety_tests.js` | **19/19 PASS** |

**Combined regression-battery: 44 visible PASS lines, 0 FAIL lines, exit code 0.**

## 4. Defects found and fixed

None beyond the Design Review self-approval gap itself, which is the DELIBERATE fix this CR was
commissioned to make (found by audit, not by a failing test) — see `ARCH-2026-001E-APPROVAL-AUDIT.md`
§3 and `ARCH-2026-001E-IMPLEMENTATION.md` §1. No incidental defect was introduced or found during
implementation this time (unlike ARCH-2026-001A's duty-list gap, ARCH-2026-001C-F's 9-site equivalence
defect, or ARCH-2026-001D's route-safety-scanner compliance gap).

## 5. Production data safety throughout

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`, 52,518
bytes, mtime `2026-09-19T09:24:59.947Z` — identical before this CR began and after the entire
regression battery, the full P2P/concurrency test, and the live browser UAT completed.

## 6. Conclusion

Zero regressions. No test file required a defended change this time. The one real defect this CR set
out to find and fix (Design Review self-approval) is closed and covered by a permanent regression test
at both the engine and live-HTTP/browser level.
