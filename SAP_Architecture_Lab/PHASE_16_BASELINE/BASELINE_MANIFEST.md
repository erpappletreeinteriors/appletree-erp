# PHASE 16 BASELINE CHECKPOINT — 2026-08-25

Frozen before any Phase 17 change, per Phase 17 §1. Third checkpoint in this engagement (see also `PHASE_14_BASELINE/` and `PHASE_15_BASELINE/` one directory up).

## Contents
- `domain.js.phase16`, `server.js.phase16`, `index.html.phase16` — exact byte-for-byte copies of the 3 Phase 16 source files
- `db.json.phase16.clean-seed` — the reset/clean-seed database state at Phase 16 close
- `checksums.txt` — SHA-256 hashes + file-modification timestamps of the 3 source files at freeze time

Note: `server.js` and `client_secure/index.html` hashes are IDENTICAL to the Phase 15 baseline — confirming Phase 16 only modified `domain.js` (the memoization performance fix and the 11 reversal-blindness defect fixes), exactly as reported in the Phase 16 report.

## Recorded Phase 16 Results (reproduced verbatim from the Phase 16 report)
- Full regression: **1211/1211 PASS, 0 FAIL**
- Security matrix: **666/666 PASS**
- ID tampering tests: **47/47 PASS**
- SAP Accountant Final UAT: **31/31 PASS, 0 FAIL, 0 CONFUSING, 0 MISSING**
- Complete Project Trace Test: **18/18 PASS**
- Final classification: **C — UAT APPROVED, PRODUCTION PREPARATION MAY BEGIN**
- Full report: `PHASE_16_FINAL_GOVERNANCE_REPORT_2026-08-25.md` (repo root)

## Isolation confirmed at freeze time
- `appletree_erp_v2_1.html` — last modified 2026-08-14 (pre-engagement, untouched)
- `appletree_erp_offline.html` — last modified 2026-08-23 (pre-engagement, untouched)
- `SAP_Architecture_Lab/appletree_sap_lab.html` (frozen Phase 4/5 reference) — last modified 2026-08-23 (untouched)
- No remote database connection strings anywhere in `server/domain.js` or `server/server.js` — local-file-only.

## To restore this checkpoint
```
cp PHASE_16_BASELINE/domain.js.phase16 server/domain.js
cp PHASE_16_BASELINE/server.js.phase16 server/server.js
cp PHASE_16_BASELINE/index.html.phase16 client_secure/index.html
cp PHASE_16_BASELINE/db.json.phase16.clean-seed server/db.json
```
