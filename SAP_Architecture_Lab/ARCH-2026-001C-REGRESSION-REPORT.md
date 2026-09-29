# ARCH-2026-001C — Regression Report

**Date:** 2026-09-21. Existing regression results, run against a fresh isolated instance built from
the ARCH-2026-001C-modified `server/domain.js`/`server/server.js`. Production `server/db.json` was
never used as a target.

## 1. New suite (this CR)

`tests/erp_arch_2026_001c_data_scope_tests.js` — **32/32 PASS** (0 FAIL).

## 2. Prior-CR suites re-run (proves this CR did not regress 001A/001B)

- `tests/erp_arch_2026_001a_rbac_foundation_tests.js` — **39/39 PASS**.
- `tests/erp_arch_2026_001b_route_auth_migration_tests.js` — **18/18 PASS**.

## 3. Full existing suite

| Suite | Result | Notes |
|---|---|---|
| `tests/erp_059_security_tests.js` | **PASS**, 0 FAIL lines | Session/auth fundamentals |
| `tests/erp_059_transaction_contract_tests.js` | **PASS**, 0 FAIL lines | Includes the SoD-violating self-approval rejection test |
| `tests/erp_059c_production_isolation_tests.js` | **10/10 PASS** (standalone, real repo code) | Also re-run internally by both the 001B and 001C suites' own Part 3 — passed every time |
| `tests/erp_audit_p0_tests.js` | **PASS**, 0 FAIL lines | Atomicity/dry-run batch tests |
| `tests/erp_059b_durable_audit_tests.js` | **22/24** (2 FAIL lines) | The SAME 2 pre-existing, already-documented gaps (B6/B7 — restore-rejection tests requiring local filesystem access to a `backups/` directory relative to the test script's own invocation context) recorded at CR-2026-002's AND ARCH-2026-001B's own close — not a new regression |
| `tests/erp_phase38_e2e_trace_tests.js` | **PASS** | TB/AR/AP/GST reconciliation |
| `tests/erp_phase39_manufacturing_jobwork_tests.js` | **PASS** | Job Work net-stock, APOB-gated dispatch |
| `tests/erp_phase39_fixed_assets_tests.js` | **PASS** | Fixed Asset register reconciliation |
| `tests/erp_phase39_banking_tests.js` | **PASS** | Bank import/reconciliation |
| `tests/erp_phase39_payment_approval_matrix_tests.js` | **PASS** | **Payment Request maker-checker-executor 3-person separation confirmed still live-enforced, unchanged** — this CR's PaymentRequest inheritance-resolution capability was proven WITHOUT touching `createPaymentRequest()`/`approvePaymentRequest()`/`executePaymentRequest()` |
| `tests/erp_def_2026_001_qc_dashboard_tests.js` | **PASS** | DEF-2026-001 fix regression guard |
| `tests/erp_phase39_stress_test.js` | **PASS** | 525-document volume, "Document numbering remained unique under load — 525 vouchers, zero duplicates" |
| `tests/erp_cr_2026_002_env_safety_tests.js` | **19/19 PASS** | Self-contained; confirms `env.js` integration undisturbed |

**Combined regression-battery process exit code: 0.**

## 4. Critical Phase 39/40/43 areas — explicitly re-verified per this CR's own §23

| Control | Verified via | Result |
|---|---|---|
| Payment Request (maker-checker-executor) | `erp_phase39_payment_approval_matrix_tests.js` | PASS — untouched by this CR |
| Production/Service material issue, Stock Count (Phase 43 fixes) | `erp_phase39_manufacturing_jobwork_tests.js` | PASS |
| PO/commitment atomicity (Phase 42 P42-01 fix) | `erp_059c_production_isolation_tests.js`; `submitPurchaseOrder()`/`approvePurchaseOrder()` confirmed unchanged by this CR's own diff scope | PASS |
| Accounting (TB/AR/AP/GST) | `erp_phase38_e2e_trace_tests.js`, `erp_phase39_stress_test.js` | PASS |
| Inventory | `erp_phase39_manufacturing_jobwork_tests.js`, `erp_def_2026_001_qc_dashboard_tests.js` | PASS |
| Project costing | Exercised incidentally by the E2E trace suite's own project-linked postings; also directly exercised by this CR's own new suite (real Project A/B write-path tests) | PASS |
| Procurement | `erp_phase39_manufacturing_jobwork_tests.js` (Job Work), `erp_arch_2026_001c_data_scope_tests.js` (`material-requirements` scope migration) | PASS |
| Sales | `erp_arch_2026_001c_data_scope_tests.js` (AR invoice Customer-scope migration, real cross-customer test) | PASS |
| Manufacturing / Job Work | `erp_phase39_manufacturing_jobwork_tests.js` | PASS |
| Fixed Assets | `erp_phase39_fixed_assets_tests.js` | PASS |
| Banking | `erp_phase39_banking_tests.js` | PASS |
| Numbering | `erp_phase39_stress_test.js` — zero duplicate document numbers at 525-document volume | PASS |
| Audit | `erp_059b_durable_audit_tests.js` (22/24, baseline-consistent) | PASS |
| Security | `erp_059_security_tests.js` | PASS |

No existing test was rewritten to accommodate a regression. No previous control was weakened to make a
new scope test pass.

## 5. Production data safety throughout

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`, 52,518
bytes, mtime `2026-09-19T09:24:59.947Z` — identical before this CR began and after the entire
regression battery completed. `server/db.json.bak` mtime also unchanged.

## 6. Conclusion

Zero regressions. Every suite that passed before this CR still passes after it. The one suite with a
non-100% result (`erp_059b_durable_audit_tests`, 22/24) is at the EXACT SAME baseline recorded at
CR-2026-002's and ARCH-2026-001B's own close — not a new gap introduced by this CR.
