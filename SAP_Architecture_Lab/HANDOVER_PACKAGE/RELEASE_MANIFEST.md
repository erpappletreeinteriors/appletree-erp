# RELEASE MANIFEST

**Version:** Phase 20 — Final Build Completion, Hardening, Documentation & Handover
**Date:** 2026-08-25
**Build Identifier:** OFFLINE HANDOVER RELEASE CANDIDATE — Phase 20
**Classification:** C — Handover Ready, Production Configuration May Begin (see the Phase 20 Final Report for full reasoning)

## Files (SHA-256, at freeze time)
| File | SHA-256 |
|---|---|
| `server/domain.js` | `25946c4bd80dbf5bfcb6d7ba19a31e6b318f5166a719cea4c3531ed1ebb6d65d` |
| `server/server.js` | `eb9bcf490b44b972ce97eb4cc621e4d7f0be335d32d62512ddeeb5d55524b1a0` |
| `client_secure/index.html` | `021f2c6d8d4c3683fd9dff8c7d141c39334841453ba1c16b6845092cb2136de1` |
| `server/icici_statement_121.csv` | `d5f0c74cf3f7d8d5a6217ebc1ee3100ae36eb3cd53de5a3ea92ddf9239e9d4ff` (unchanged since Phase 19, preserved not redesigned) |

## Database version
`02_DATABASE/HANDOVER_CLEAN_SEED.json` — the reset/clean-seed state at Phase 20 close. Contains only development-placeholder/demo data, clearly none of it real Appletree business data.

## Test Result
**1,905 / 1,905 automated tests PASS, 0 FAIL** across 30 test files plus a 1,080-cell role/action security matrix. Zero historical test deleted or weakened across all 20 phases of this engagement.

## Security Result
1,080/1,080 security matrix cells PASS. 47/47 ID-tampering tests PASS. Final code-review security audit (Phase 20 §34) completed — one real defect found (missing global error handler) and fixed, verified, and permanently regression-tested (6/6).

## Known Limitations
See `12_KNOWN_LIMITATIONS/33_KNOWN_LIMITATIONS.md`.

## Configuration Requirements Before Real Use
See `10_CONFIGURATION/PRODUCTION_CONFIGURATION_SEQUENCE.md` and `13_MANAGEMENT_DECISIONS/34_OPEN_MANAGEMENT_DECISIONS.md`.

## Package Contents
```
01_BUILD/                    — pointer to the actual source (SAP_Architecture_Lab/server, client_secure)
02_DATABASE/                 — HANDOVER_CLEAN_SEED.json
03_TESTS/                    — all 30 automated test files + the security matrix script
04_TEST_FIXTURES/            — the real 121-transaction ICICI statement CSV
05_HANDOVER_DOCUMENTATION/   — all 34 documentation files
06_IMPORT_TEMPLATES/         — 11 master-data CSV templates
07_ACCOUNTING_TEMPLATES/     — 4 opening-balance CSV templates
08_SECURITY/                 — security summary + full matrix results JSON
09_BACKUP_RESTORE/           — backup/restore procedure
10_CONFIGURATION/            — production configuration sequence + migration rehearsal framework
11_RELEASE_NOTES/            — phase-by-phase engineering history
12_KNOWN_LIMITATIONS/        — honest disclosure of what is not yet configured
13_MANAGEMENT_DECISIONS/     — every pending decision, with options, never a guessed answer
RELEASE_MANIFEST.md          — this file
```
