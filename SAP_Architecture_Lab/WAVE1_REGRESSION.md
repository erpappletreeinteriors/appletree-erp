# WAVE1_REGRESSION.md

**Date:** 2026-09-22. Full existing regression battery re-run after this Wave 1 implementation pass,
per this CR's own §17 gate. Baseline to beat: 527 PASS / 2 documented FAIL / 529 total
(`ARCH-2026-002-PHASE-0-AUDIT.md` §P). **Result: identical baseline, zero new failures.**

## Per-suite results

| Suite | Result |
|---|---|
| `erp_059_security_tests.js` | **13/13 PASS** |
| `erp_059_transaction_contract_tests.js` | **6/6 PASS** |
| `erp_059b_durable_audit_tests.js` | **22/24 PASS** — the 2 FAIL are the pre-existing, documented, unrelated filesystem-path gaps (B6/B7 — the test script's own relative-path access to a `backups/` directory from its invocation context), unchanged from the Phase 0 baseline, NOT a new Wave 1 regression |
| `erp_059c_production_isolation_tests.js` | **10/10 PASS** |
| `erp_arch_2026_001a_rbac_foundation_tests.js` | **39/39 PASS** |
| `erp_arch_2026_001b_route_auth_migration_tests.js` | **18/18 PASS** |
| `erp_arch_2026_001c_data_scope_tests.js` | **32/32 PASS** |
| `erp_arch_2026_001c_f_residual_scope_tests.js` | **33/33 PASS** |
| `erp_arch_2026_001d_sod_tests.js` | **30/30 PASS** |
| `erp_arch_2026_001e_approval_authority_tests.js` | **37/37 PASS** |
| `erp_audit_p0_tests.js` | **65/65 PASS** |
| `erp_cr_2026_002_env_safety_tests.js` | **19/19 PASS** |
| `erp_def_2026_001_qc_dashboard_tests.js` | **19/19 PASS** |
| `erp_phase38_e2e_trace_tests.js` | **49/49 PASS** |
| `erp_phase39_banking_tests.js` | **34/34 PASS** — critical: this is the pre-existing banking suite, exercising the ICICI-import path this Wave 1 pass's Bank Reconciliation consolidation directly modified; zero regression |
| `erp_phase39_fixed_assets_tests.js` | **30/30 PASS** |
| `erp_phase39_manufacturing_jobwork_tests.js` | **36/36 PASS** |
| `erp_phase39_payment_approval_matrix_tests.js` | **18/18 PASS** |
| `erp_phase39_stress_test.js` | **11/11 PASS** — 525-document stress batch, Trial Balance/AR/AP/GST reconciliation all clean, document numbering unique under load |
| `erp_audit_concurrency_tests.js` | **1/1 PASS** — second-process-refused-lock test |
| `erp_059_restart_persistence_tests.js` | **5/5 PASS** — lock/lockout survives a real server restart |

**Totals: 527 PASS / 2 FAIL / 529 total — byte-identical to the Phase 0 baseline. Zero new failures
introduced by this Wave 1 implementation pass.**

## New suite (this Wave 1 pass)

`tests/erp_arch_2026_002_wave1_tests.js`: **42/42 PASS** — see `WAVE1_TEST-RESULTS.md` for full detail.

## Grand total

**569 PASS / 2 FAIL / 571 total** across the full existing battery plus this Wave 1's own new suite. The
2 FAIL are the same pre-existing, documented, unrelated `erp_059b` filesystem-path gaps — never hidden,
never re-baselined to make them disappear, per this CR's own §17 instruction.

## Production DB safety

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` — confirmed
identical before this Wave 1 pass began, mid-pass (after the main regression battery), and after this
entire pass completed (3 independent checkpoints, all byte-identical). Every test — the pre-existing
battery, the new Wave 1 suite, and this file's own concurrency/restart-persistence re-runs — executed
exclusively against disposable, isolated scratch instances created by
`server/scripts/start-isolated-test-server.js`. No test or migration call was ever made against
production.
