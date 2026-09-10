# PHASE 17 BASELINE CHECKPOINT — 2026-08-25

Frozen before any Phase 18 change, per Phase 18 §1. Fourth checkpoint in this engagement (see also `PHASE_14_BASELINE/`, `PHASE_15_BASELINE/`, `PHASE_16_BASELINE/` one directory up).

## Contents
- `domain.js.phase17`, `server.js.phase17`, `index.html.phase17` — exact byte-for-byte copies of the 3 Phase 17 source files
- `db.json.phase17.clean-seed` — the reset/clean-seed database state at Phase 17 close, re-confirmed at Phase 18 freeze time
- `checksums.txt` — SHA-256 hashes of the 3 source files at freeze time

## Recorded Phase 17 Results — RE-VERIFIED at freeze time (not merely cited from the prior report)
Full regression suite re-run from a clean seed immediately before any Phase 18 change:

| Suite | Result |
|---|---|
| security_tests.js | 44/44 |
| crm_tests.js | 44/44 |
| procurement_tests.js | 43/43 |
| site_tests.js | 41/41 |
| delivery_partial_tests.js | 14/14 |
| security_matrix.js | 693/693 |
| id_tamper_tests.js | 47/47 |
| phase9b_misc_tests.js | 19/19 |
| warranty_tests.js | 15/15 |
| service_tests.js | 27/27 |
| amc_tests.js | 13/13 |
| capa_tests.js | 15/15 |
| after_sales_tests.js | 21/21 |
| financial_integration_tests.js | 15/15 |
| phase13_policy_tests.js | 24/24 |
| phase13_policy_tests2.js | 37/37 |
| phase13_policy_tests3.js | 33/33 |
| phase14_accounting_tests.js | 48/48 |
| phase15_gap_closure_tests.js | 25/25 |
| phase16_performance_tests.js | 9/9 |
| phase16_reconciliation_tests.js | 11/11 |
| phase17_backup_restore_test.js | 19/19 |
| phase17_concurrency_tests.js | 5/5 |
| **TOTAL** | **1262/1262 PASS, 0 FAIL** |

Independently re-summed: matches the 1,262/1,262 figure quoted in the Phase 18 brief exactly.

- Final classification at Phase 17 close: **C — UAT APPROVED, PRODUCTION PREPARATION MAY BEGIN**
- Full report: `PHASE_17_PRODUCTION_READINESS_REPORT_2026-08-25.md` (repo root)

## Isolation confirmed at freeze time
- `appletree_erp_v2_1.html` — last modified 2026-08-14 (pre-engagement, untouched)
- `appletree_erp_offline.html` — last modified 2026-08-23 (pre-engagement, untouched)
- `SAP_Architecture_Lab/appletree_sap_lab.html` (frozen Phase 4/5 reference) — last modified 2026-08-23 (untouched)
- No remote database connection strings anywhere in `server/domain.js` or `server/server.js` — local-file-only.

## To restore this checkpoint
```
cp PHASE_17_BASELINE/domain.js.phase17 server/domain.js
cp PHASE_17_BASELINE/server.js.phase17 server/server.js
cp PHASE_17_BASELINE/index.html.phase17 client_secure/index.html
cp PHASE_17_BASELINE/db.json.phase17.clean-seed server/db.json
```
