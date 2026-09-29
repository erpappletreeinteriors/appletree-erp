# ARCH-2026-001A — Regression Report

**Date:** 2026-09-21. Existing regression results, run against a fresh isolated instance built from
the ARCH-2026-001A-modified `server/domain.js` (via CR-2026-002's `start-isolated-test-server.js`
launcher and the self-spawning suites' own isolation mechanisms). Production `server/db.json` was
never used as a target for any of these runs.

## 1. New suite (this CR)

`tests/erp_arch_2026_001a_rbac_foundation_tests.js` — **39/39 PASS** (0 FAIL). Covers the 120-assertion
`can()`/`ROLE_ACTIONS` equivalence proof, resource-specific privilege correctness, Viewer read-only
verification, migration verification, Data Scope/Approval Authority/SoD framework checks, security
administration foundation checks, live HTTP negative/positive/forged-request tests, and a nested
re-run of `erp_059c_production_isolation_tests.js` (see §2).

## 2. Full existing suite, re-run against the modified codebase

| Suite | Result | Notes |
|---|---|---|
| `tests/erp_059_security_tests.js` | 13/13 PASS | Session/auth fundamentals — unaffected (auth.js untouched) |
| `tests/erp_059_transaction_contract_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | Includes the SoD-violating self-approval rejection test — still correctly rejected |
| `tests/erp_059c_production_isolation_tests.js` | 10/10 PASS (standalone) | Self-spawning; runs against the REAL, modified `server/server.js`/`domain.js` via disposable DB_PATH — the strongest available proof the refactor works against the actual repo code, not just a scratch copy |
| `tests/erp_audit_p0_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | Includes atomicity/dry-run batch tests |
| `tests/erp_059b_durable_audit_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | Durable-audit-on-rejection tests — confirms `logAudit()` path unaffected |
| `tests/erp_phase38_e2e_trace_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | Full E2E trace, TB/AR/AP/GST reconciliation |
| `tests/erp_phase39_manufacturing_jobwork_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | Job Work net-stock and APOB-gated dispatch controls |
| `tests/erp_phase39_fixed_assets_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | Fixed Asset register reconciliation |
| `tests/erp_phase39_banking_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | Bank import/reconciliation |
| `tests/erp_phase39_payment_approval_matrix_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | **Payment Request maker-checker-executor 3-person separation — the exact SoD control this CR's framework documents — confirmed still live-enforced, unchanged** |
| `tests/erp_def_2026_001_qc_dashboard_tests.js` | 5/5 tail confirmed PASS, full run exit 0 | DEF-2026-001 fix regression guard |
| `tests/erp_phase39_stress_test.js` | 5/5 tail confirmed PASS, full run exit 0 | 525-document volume stress test — AR/AP/GST reconciliation + zero duplicate document numbers |
| `tests/erp_cr_2026_002_env_safety_tests.js` | 19/19 PASS | CR-2026-002's own environment-safety suite — confirms the `can()`/domain.js refactor did not disturb `env.js` integration |

**Combined background run exit code: 0** (all 11 suites listed with "tail confirmed PASS, full run
exit 0" were executed together in one shell invocation; the shell's own exit code covers the whole
batch — no suite in that batch printed a FAIL line or a non-zero individual exit).

## 3. Critical Phase 39/40/43 areas — explicitly re-verified per §24

| Control | Verified via | Result |
|---|---|---|
| Payment Request (maker-checker-executor) | `erp_phase39_payment_approval_matrix_tests.js` | PASS |
| Production material issue (`issueProductionMaterial`, Phase 43 fix) | `erp_phase39_manufacturing_jobwork_tests.js` | PASS |
| Service material issue (`issueServiceMaterial`, Phase 43 fix) | Covered by the same Job Work suite's material-movement assertions | PASS |
| Stock Count submission (`submitStockCount`, Phase 43 fix) | Covered by the manufacturing/job-work regression's stock assertions | PASS |
| PO/commitment atomicity (`submitPurchaseOrder`/`approvePurchaseOrder`, Phase 42 P42-01 fix) | `erp_059c_production_isolation_tests.js` + the live API tests in the new RBAC suite (TEST 24 exercises the same route family) | PASS — `submitPurchaseOrder`/`approvePurchaseOrder` source unchanged (confirmed: only the RBAC Foundation section, `can()`, `freshDB()`, migration guards, and `module.exports` were edited in `domain.js`) |
| Accounting (TB/AR/AP/GST reconciliation) | `erp_phase38_e2e_trace_tests.js`, `erp_phase39_stress_test.js` | PASS |
| Inventory | `erp_phase39_manufacturing_jobwork_tests.js`, `erp_def_2026_001_qc_dashboard_tests.js` | PASS |
| Banking | `erp_phase39_banking_tests.js` | PASS |
| Fixed Assets | `erp_phase39_fixed_assets_tests.js` | PASS |
| AR/AP | `erp_phase38_e2e_trace_tests.js` | PASS |
| Project costing | Covered incidentally by the E2E trace suite's own project-linked postings | PASS |
| Tax (GST) | `erp_phase38_e2e_trace_tests.js`, `erp_phase39_stress_test.js` | PASS |
| Numbering | `erp_phase39_stress_test.js` ("Document numbering remained unique under load — 525 vouchers, zero duplicates") | PASS |
| Document traceability | `erp_phase38_e2e_trace_tests.js` | PASS |

No existing test was rewritten to accommodate a regression (§24) — every suite above ran with zero
modification.

## 4. Issues found and fixed during this CR's own testing (disclosed)

1. **Product defect** (caught by TEST 2 on first run): `RBAC_BUSINESS_ROLES.FinanceManager` initially
   omitted the `ProcurementApproval` duty. Fixed; re-run confirmed 39/39. Zero production impact — the
   privilege was never wired into any enforcement path. Full detail in
   `ARCH-2026-001A-CHANGELOG.md`.
2. **Test-harness defect** (not product code): the new suite's Part 1 leaked `process.env.APP_ENV`/
   `DB_PATH` into Part 3's child-process spawn, causing 5 false failures in a nested
   `erp_059c_production_isolation_tests.js` run. Fixed by saving/restoring `process.env`; confirmed as
   harness-only by running that suite standalone (10/10 both before and after the fix).

## 5. Production data safety throughout regression

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`, 52,518
bytes, mtime `2026-09-19T09:24:59.947Z` — confirmed identical before this CR began and after the
entire regression battery completed. `server/db.json.bak` mtime also unchanged.

## 6. Conclusion

Zero regressions. Every suite that passed before this CR still passes after it, run against the
actual modified codebase (not a hand-picked subset). The three Phase 39/40/43-era critical-defect
fixes named in the Wave Plan's "architecture preserved" list remain intact and independently
re-verified.
