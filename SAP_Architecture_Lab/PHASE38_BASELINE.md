# PHASE 38 — Baseline

**Timestamp:** 2026-09-11, immediately following Phase 37 (nomenclature audit, no code changed) and
Phase ERP-059C (production/test isolation hardening, commit `d96234b`). No code has changed between
the end of Phase 37 and the start of Phase 38 — checksums below are byte-identical to
`PHASE37_CHECKPOINT/`.

## Source files audited

| File | Lines | SHA-256 |
|---|---|---|
| `server/domain.js` | 12,088 | `e9d95d74afa32a6c0e8a5564796ff979ae67b16bdeeea77cdf2af83785ca0bc1` |
| `server/server.js` | 3,379 | `2ab744217b330ca3bda9f79a212312ad2821d42fabdfe35a98eb41f605f82033` |
| `client_secure/index.html` | 6,446 | `75886e7a6a568b5a09ff007fa9d13a82cfeec8f9d1d8f181f30abca5031c87ad` |

Verbatim copies (plus `auth.js`, `route_safety_scanner.js`) are in `PHASE38_CHECKPOINT/`.

## Current test inventory

**Permanent regression suites** (`tests/`): `erp_059_security_tests.js`,
`erp_059_restart_persistence_tests.js`, `erp_059_transaction_contract_tests.js`,
`erp_059b_durable_audit_tests.js`, `erp_059c_production_isolation_tests.js`,
`erp_audit_concurrency_tests.js`, `erp_audit_p0_tests.js` — 7 files.

**Historical suite** (`server/*.js`, excluding `domain.js`/`server.js`/`auth.js`/
`route_safety_scanner.js`): 58 files, all migrated to `TEST_BASE_URL` + preflight guard as of
Phase ERP-059C.

## Fresh regression run for this baseline (isolated server, never production)

Isolated instance: `APP_ENV=test`, explicit `DB_PATH` under a fresh temp directory, port 4090 —
matching the established ERP-059C-safe pattern. Never touched `server/db.json` or port 4001.

| Suite | Result |
|---|---|
| `erp_059_security_tests.js` | **13/13 PASS** |
| `erp_059_transaction_contract_tests.js` | **6/6 PASS** |
| `erp_audit_p0_tests.js` | **65/65 PASS** |
| `erp_059b_durable_audit_tests.js` | **24/24 PASS** (B4/B5 documented-not-tested per their own established policy, excluded from denominator, unchanged from ERP-059B's own finding) |
| Fresh-seed Trial Balance | **2,050 Debit = 2,050 Credit — Balanced** (opening-balance seed data only) |

This matches the ERP-059C regression report's own findings exactly (no drift since) — confirming
the codebase is in the same, known-good state that phase left it in. The full historical 26+32-file
suite's last confirmed state (per `ERP-059C-REGRESSION-REPORT.md`): 19/26 of the officially-named
suite clean, 7/26 with PRE-EXISTING failures confirmed unrelated to any ERP-059 series change (via
before/after testing against unmodified originals) — not re-run in full for this baseline given
time cost, but re-confirmed unchanged in principle since the source files are byte-identical to that
phase's own post-change state.

## Current security result

ERP-059 (login lockout) remains FIXED. ERP-059B (12-site durable audit) remains FIXED. ERP-059C
(production/test isolation) remains FIXED — all re-verified above on isolated infrastructure.

## Known open issues (from `ERP_FINDING_REGISTER.csv`, 60 rows as of this baseline)

Relevant OPEN/PARTIAL items carried into this phase's scope:
- **ERP-002 / ERP-047** (test governance/reproducibility) — PARTIALLY ADDRESSED per ERP-059C.
- **ERP-004** (environment/reproducibility) — PARTIALLY ADDRESSED per ERP-059C.
- **ERP-010** (E2E suites crash on failed prerequisites) — OPEN, 5 concrete examples documented
  (crm_tests.js, procurement_tests.js, site_tests.js, phase19_icici_import_tests.js,
  phase20_handover_tests.js) — confirmed pre-existing, unrelated to any fix this engagement has made.
- **ERP-012** (auth lockout test isolation) — PARTIALLY ADDRESSED per ERP-059C.
- Phase 37's own Change Plan: 2 MUST CHANGE + 6 SHOULD CHANGE nomenclature items — **not yet
  implemented**, awaiting the user's review (unrelated to Phase 38's own scope, noted for
  completeness).
- The still-unresolved **production database incident** from Phase ERP-059B — `server/db.json`
  remains in its post-incident state (unchanged, confirmed again at the start of this phase:
  52,411 bytes, unchanged timestamp). **Not touched, and will not be touched, during Phase 38.**

## Current document-numbering state

51 `nextDocNumber()` prefixes and the `glDocumentTypes` label registry are unchanged since Phase 37
— see `PHASE37_NOMENCLATURE_AUDIT_COMBINED_REPORT.md` §4 for the complete verbatim dictionary. No
document numbering has been touched by any phase since ERP-059B.

## Current database state

**Production** (`server/db.json`): unchanged since the ERP-059B incident — 52,411 bytes, last
modified 2026-09-10 18:14:36, still awaiting the user's separate recovery decision. Confirmed
read-only at the start of this phase; will remain untouched throughout.

**No isolated test database used for this baseline is retained** — the scratch instance used to
generate the regression numbers above is disposable, will not be reused for Phase 38's own live
transaction testing (a fresh instance will be created for that, per Part 21's temporary-test-data
rule), and requires no cleanup since it lives under the OS temp directory.

## Scope note for what follows

Phase 38's remaining 34 parts require extensive live transaction testing across the full
procurement-to-pay, sales-to-cash, inventory, project-costing, tax, and manufacturing chains, plus a
forensic code audit, browser testing, stress testing, and 14 further deliverable documents. This
baseline establishes the starting state; the remaining work proceeds from here, documented in the
subsequent Phase 38 deliverables as each is completed.
