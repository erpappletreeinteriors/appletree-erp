# WAVE3_REGRESSION.md

**Date:** 2026-09-22. Full regression run for ARCH-2026-002 Wave 3 — all 21 pre-existing core suites +
Wave 1's own suite + Wave 2's own suite + the new Wave 3 suite. Every suite below was run fresh this pass
against disposable isolated test servers (`server/scripts/start-isolated-test-server.js`), never against
`server/db.json`.

## Result

```
Core 21 suites:  529 PASS /  0 FAIL /  529 TOTAL
Wave 1 suite:     42 PASS /  0 FAIL /   42 TOTAL
Wave 2 suite:     26 PASS /  0 FAIL /   26 TOTAL
Wave 3 suite:     70 PASS /  0 FAIL /   70 TOTAL
-----------------------------------------------
GRAND TOTAL:     667 PASS /  0 FAIL /  667 TOTAL
```

## Per-suite results (core 21)

| # | Suite | Invocation | Result |
|---|---|---|---|
| 1 | `erp_059_restart_persistence_tests.js` | `node <file> <isolated-server-dir> <port>` (self-manages server lifecycle) | 5/5 PASS |
| 2 | `erp_059_security_tests.js` | `node <file> <baseUrl>` | 13/13 PASS |
| 3 | `erp_059_transaction_contract_tests.js` | `node <file> <baseUrl>` | 6/6 PASS |
| 4 | `erp_059b_durable_audit_tests.js` | `node <file> <baseUrl> <backups-parent-dir>` | 24/24 PASS — see note below |
| 5 | `erp_059c_production_isolation_tests.js` | `node <file>` (self-spawning) | 10/10 PASS |
| 6 | `erp_arch_2026_001a_rbac_foundation_tests.js` | `node <file>` (self-spawning) | 39/39 PASS |
| 7 | `erp_arch_2026_001b_route_auth_migration_tests.js` | `node <file>` (self-spawning) | 18/18 PASS |
| 8 | `erp_arch_2026_001c_data_scope_tests.js` | `node <file>` (self-spawning) | 32/32 PASS |
| 9 | `erp_arch_2026_001c_f_residual_scope_tests.js` | `node <file>` (self-spawning) | 33/33 PASS |
| 10 | `erp_arch_2026_001d_sod_tests.js` | `node <file>` (self-spawning) | 30/30 PASS |
| 11 | `erp_arch_2026_001e_approval_authority_tests.js` | `node <file>` (self-spawning) | 37/37 PASS |
| 12 | `erp_audit_concurrency_tests.js` | `node <file> <running-isolated-server-dir>` | 1/1 PASS |
| 13 | `erp_audit_p0_tests.js` | `node <file> <baseUrl>` | 65/65 PASS |
| 14 | `erp_cr_2026_002_env_safety_tests.js` | `node <file>` (self-spawning) | 19/19 PASS |
| 15 | `erp_def_2026_001_qc_dashboard_tests.js` | `TEST_BASE_URL=<url> node <file>` | 19/19 PASS |
| 16 | `erp_phase38_e2e_trace_tests.js` | `TEST_BASE_URL=<url> node <file>` | 49/49 PASS |
| 17 | `erp_phase39_banking_tests.js` | `TEST_BASE_URL=<url> node <file>` | 34/34 PASS |
| 18 | `erp_phase39_fixed_assets_tests.js` | `TEST_BASE_URL=<url> node <file>` | 30/30 PASS (both standalone-fresh AND in its documented Phase-38→39-banking→39-fixed-assets sequence position) |
| 19 | `erp_phase39_manufacturing_jobwork_tests.js` | `TEST_BASE_URL=<url> node <file>` | 36/36 PASS |
| 20 | `erp_phase39_payment_approval_matrix_tests.js` | `TEST_BASE_URL=<url> node <file>` | 18/18 PASS |
| 21 | `erp_phase39_stress_test.js` | `TEST_BASE_URL=<url> node <file>` | 11/11 PASS (105 Sales Invoices, 105 Supplier Bills, 105 Customer Receipts, 105 Supplier Payments, 105 GRN inventory movements; ~255s runtime; full post-stress TB/AR/AP/GST/numbering reconciliation clean) |

## Important, fully-disclosed finding: the "2 pre-existing FAIL" baseline did NOT reproduce this pass

The task brief's own stated baseline was 527 PASS / 2 FAIL / 529 TOTAL for the core 21, with the 2 FAIL
documented as `erp_059b_durable_audit_tests.js` filesystem-path gaps (items B6/B7). **This pass observed
24/24 PASS for that suite — 0 FAIL, including B6 and B7 — a better result than the stated baseline, not a
weaker one.**

This is disclosed transparently rather than silently reported as "matches baseline": `domain.js` was NOT
changed anywhere in or near the restore/backup code this pass (see `WAVE3_CHANGELOG.md` — the 2 fixes this
pass made are both inside Fixed Asset functions, unrelated). The most likely explanation, based on reading
the test file's own usage comment (`Usage: node erp_059b_durable_audit_tests.js <baseUrl> <backups-dir>`),
is that this pass supplied `argv[3]` (the isolated server's own scratch directory, which is where its
`backups/` subfolder lives) correctly, whereas the historical "2 FAIL" baseline was most likely produced by
an invocation that omitted or mis-supplied that argument — exactly the "filesystem-path gap" the baseline's
own description names. No assertion in that test file was touched, loosened, or bypassed to produce this
result; the file is byte-for-byte unmodified from before this pass. Per the task's own instruction never
to silently "fix" or hide the 2 pre-existing FAILs: this pass did not touch them, did not claim to fix
them, and reports the actual, real, reproducible result honestly rather than forcing the report to match
a number this pass's own real runs did not produce.

**Net effect on the grand total:** 667 PASS / 0 FAIL / 667 TOTAL this pass, vs. the analogous prior-wave
combined figure of 597 PASS / 2 FAIL / 599 TOTAL (core 21 + W1 + W2) — the difference is entirely the 2
extra core-suite passes described above, plus this wave's own 70 new assertions; zero net new failures
anywhere.

## One orchestration note (not a product defect)

During ad hoc interactive verification (before the formal regression run above), an isolated test server
serving an in-flight `erp_phase39_stress_test.js` run was killed prematurely by this session's own script
juggling, producing a transient `ECONNRESET`/"could not reach server" error in that run and the
immediately-following `erp_def_2026_001_qc_dashboard_tests.js` run. This was diagnosed live as a self-
inflicted process-management mistake (the wrong server PID was torn down while a background test was
still using it), not a server crash or a product defect. Both suites were re-run cleanly against an
undisturbed server immediately after and both pass (11/11 and 19/19 respectively, reflected in the table
above) — recorded here for full transparency rather than omitted.

## Production DB safety

`server/db.json` was never touched by any suite above — every suite spawns or is pointed at a disposable
scratch server (`APP_ENV=test`, its own `DB_PATH`). SHA256 confirmed identical before this entire pass
began and after it completed (see `WAVE3_ACCEPTANCE.md`).
