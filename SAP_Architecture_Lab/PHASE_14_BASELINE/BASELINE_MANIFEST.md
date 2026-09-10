# PHASE 14 BASELINE CHECKPOINT — 2026-08-25

Frozen before any Phase 15 change, per Phase 15 §1. Restore point if Phase 15 needs to be rolled back.

## Contents
- `domain.js.phase14`, `server.js.phase14`, `index.html.phase14` — exact byte-for-byte copies of the 3 Phase 14 source files
- `db.json.phase14.clean-seed` — the reset/clean-seed database state at Phase 14 close
- `checksums.txt` — SHA-256 hashes + file-modification timestamps of the 3 source files at freeze time

## Recorded Phase 14 Results (reproduced verbatim from the Phase 14 report)
- Full regression: **1071/1071 PASS, 0 FAIL**
  - security_tests 44/44, crm_tests 44/44, procurement_tests 43/43, site_tests 41/41, delivery_partial_tests 14/14,
    security_matrix 576/576, id_tamper_tests 42/42, phase9b_misc_tests 19/19, warranty_tests 15/15, service_tests 27/27,
    amc_tests 13/13, capa_tests 15/15, after_sales_tests 21/21, financial_integration_tests 15/15,
    phase13_policy_tests 24/24, phase13_policy_tests2 37/37, phase13_policy_tests3 33/33, phase14_accounting_tests 48/48
- Security matrix: **576/576 PASS**
- Accountant UAT (`phase14_accountant_uat.js`): **28 PASS / 0 FAIL / 0 CONFUSING / 1 MISSING** (Installation Cost)
- Final classification: **C — UAT APPROVED, PRODUCTION PREPARATION MAY BEGIN**
- Full report: `PHASE_14_SAP_ACCOUNTING_ARCHITECTURE_REPORT_2026-08-25.md` (repo root)

## To restore this checkpoint
```
cp PHASE_14_BASELINE/domain.js.phase14 server/domain.js
cp PHASE_14_BASELINE/server.js.phase14 server/server.js
cp PHASE_14_BASELINE/index.html.phase14 client_secure/index.html
cp PHASE_14_BASELINE/db.json.phase14.clean-seed server/db.json
```
