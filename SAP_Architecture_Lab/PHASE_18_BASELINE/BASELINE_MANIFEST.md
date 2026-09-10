# PHASE 18 BASELINE CHECKPOINT — 2026-08-25

Frozen before any Phase 19 change. Fifth checkpoint in this engagement (see also `PHASE_14/15/16/17_BASELINE/` one directory up).

## Contents
- `domain.js.phase18`, `server.js.phase18`, `index.html.phase18` — exact byte-for-byte copies of the 3 Phase 18 source files
- `db.json.phase18.clean-seed` — reset/clean-seed database state at Phase 18 close, re-confirmed at Phase 19 freeze time
- `checksums.txt` — SHA-256 hashes of the 3 source files at freeze time

## Recorded Phase 18 Results — RE-VERIFIED at freeze time
Full regression re-run from a clean seed immediately before any Phase 19 change: **1,368/1,368 PASS, 0 FAIL** (44+44+43+41+14+747+47+19+15+27+13+15+21+15+24+37+33+48+25+9+11+19+5+39+13), matching the Phase 19 brief's own stated baseline exactly.

- Final classification at Phase 18 close: **C — UAT APPROVED, PRODUCTION PREPARATION MAY BEGIN**
- Full report: `PHASE_18_FINAL_CONTROL_GATE_REPORT_2026-08-25.md` (repo root)

## Isolation confirmed at freeze time
- `appletree_erp_v2_1.html` — 2026-08-14 (untouched)
- `appletree_erp_offline.html` — 2026-08-23 (untouched)
- `SAP_Architecture_Lab/appletree_sap_lab.html` (frozen Phase 4/5 reference) — 2026-08-23 (untouched)

## To restore this checkpoint
```
cp PHASE_18_BASELINE/domain.js.phase18 server/domain.js
cp PHASE_18_BASELINE/server.js.phase18 server/server.js
cp PHASE_18_BASELINE/index.html.phase18 client_secure/index.html
cp PHASE_18_BASELINE/db.json.phase18.clean-seed server/db.json
```
