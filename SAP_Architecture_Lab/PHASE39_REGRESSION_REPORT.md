# PHASE 39 — Regression Report

**Date:** 2026-09-12. Compares Phase 38's baseline against this phase's result, across every
permanent regression suite plus this phase's own new suites, on the isolated port-4091 server.

## Permanent regression suites — before vs. after this phase's 3 code fixes

Every suite was re-run AFTER all 3 application fixes this phase (DEF-P38-01, DEF-P38-02 expanded,
DEF-P39-02) were applied, to prove none of them broke anything already working.

| Suite | Phase 38 baseline | This phase | Regression? |
|---|---|---|---|
| `erp_059_security_tests.js` | 13/13 | 13/13 | None |
| `erp_059_restart_persistence_tests.js` | 5/5 | 5/5 | None |
| `erp_059_transaction_contract_tests.js` | 6/6 | 6/6 | None |
| `erp_059b_durable_audit_tests.js` | 24/24 (+2 documented-not-tested) | 24/24 (+2 documented-not-tested, identical pre-existing environmental limitation) | None |
| `erp_059c_production_isolation_tests.js` | 10/10 | 10/10 | None |
| `erp_audit_concurrency_tests.js` | 1/1 | 1/1 | None |
| `erp_audit_p0_tests.js` | 65/65 | 65/65 | None |
| `erp_phase38_e2e_trace_tests.js` | 49/49 | 49/49 | None |
| **Total** | **173/173** | **173/173** | **Zero regressions** |

The `erp_059b_durable_audit_tests.js` "2 documented-not-tested" items (B6/B7) are a pre-existing,
already-documented environmental limitation (the script cannot place a fixture file under
`backups/` relative to the isolated server's own directory when invoked from the repo root) — not a
new or changed condition this phase.

## This phase's own new suites (not part of Phase 38's baseline)

| Suite | Result |
|---|---|
| `erp_phase39_manufacturing_jobwork_tests.js` | 36/36 |
| `erp_phase39_fixed_assets_tests.js` | 30/30 |
| `erp_phase39_banking_tests.js` | 34/34 (after the DEF-P39-02 fix; 30/34 before, all 4 failures root-caused to that one real defect) |
| `erp_phase39_payment_approval_matrix_tests.js` | 18/18 |
| `erp_phase39_stress_test.js` | 11/11 (525 documents) |
| **Total new assertions this phase** | **129/129** |

## Combined

**173 (carried) + 129 (new) = 302 live assertions, 302/302 passing**, after 3 real application
fixes, with the regression suite re-run in full (not sampled) after each fix.

## What changed in application code this phase (full list — see `PHASE39_FIX_LOG.md` for detail)

1. `server/domain.js` — `SEED.glDocumentTypes` literal: added 6 missing document-type entries
   (`SRET`, `XMI`, `BOM`, `XBA`, `CR`, `MRQ`) that were previously registered only via a once-only
   migration guard, silently lost on every `/api/test/reset` (DEF-P38-02, expanded).
2. `server/domain.js` — `postBankImportLine()`: resolved the bank side of its journal entry to the
   specific bank account's own configured GL account, instead of a hardcoded `'1000'` (DEF-P39-02).
3. `server/server.js` — `/api/test/architectural-violations`: added the same `IS_TEST_ENV` gate
   every sibling `/api/test/*` route already has (DEF-P38-01).

All three are additive/corrective, none removed or altered any existing passing behavior — confirmed
by the full 173/173 regression re-run after each.

## Verdict

Zero regressions from any code change made this phase. Every suite that passed under Phase 38's
baseline still passes byte-for-byte identically; every new suite this phase built passes cleanly.
