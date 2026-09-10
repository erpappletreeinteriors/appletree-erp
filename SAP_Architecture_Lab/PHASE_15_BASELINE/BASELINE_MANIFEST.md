# PHASE 15 BASELINE CHECKPOINT — 2026-08-25

Frozen before any Phase 16 change, per Phase 16 §1. Restore point if Phase 16 needs to be rolled back. Second checkpoint in this engagement (see also `PHASE_14_BASELINE/` one directory up).

## Contents
- `domain.js.phase15`, `server.js.phase15`, `index.html.phase15` — exact byte-for-byte copies of the 3 Phase 15 source files
- `db.json.phase15.clean-seed` — the reset/clean-seed database state at Phase 15 close
- `checksums.txt` — SHA-256 hashes + file-modification timestamps of the 3 source files at freeze time

## Recorded Phase 15 Results (reproduced verbatim from the Phase 15 report)
- Full regression: **1191/1191 PASS, 0 FAIL**
- Security matrix: **666/666 PASS**
- ID tampering tests: **47/47 PASS**
- Accountant UAT: **42/42 PASS, 0 FAIL, 0 CONFUSING, 0 MISSING**
- Final classification: **C — UAT APPROVED, PRODUCTION PREPARATION MAY BEGIN**
- Full report: `PHASE_15_GAP_CLOSURE_REPORT_2026-08-25.md` (repo root)

## Isolation confirmed at freeze time
- `appletree_erp_v2_1.html` — last modified 2026-08-14 (pre-engagement, untouched)
- `appletree_erp_offline.html` — last modified 2026-08-23 (pre-engagement, untouched)
- `SAP_Architecture_Lab/appletree_sap_lab.html` (frozen Phase 4/5 reference) — last modified 2026-08-23 (untouched)
- No remote database connection strings (mongodb://, postgres://, mysql://, supabase, AWS) found anywhere in `server/domain.js` or `server/server.js` — confirmed local-file-only (`db.json`, plain `fs` calls)

## To restore this checkpoint
```
cp PHASE_15_BASELINE/domain.js.phase15 server/domain.js
cp PHASE_15_BASELINE/server.js.phase15 server/server.js
cp PHASE_15_BASELINE/index.html.phase15 client_secure/index.html
cp PHASE_15_BASELINE/db.json.phase15.clean-seed server/db.json
```
