# PHASE 40 — Regression Report

**Date:** 2026-09-13. Every permanent regression suite, every Phase 39 domain suite, and the Phase
39/40 stress suite, re-run in full after all 4 Phase 40 fixes (DEF-P40-01 through 04) were applied
together — not sampled, not run individually per fix only.

## Full suite results

| Suite | Phase 39 baseline | Phase 40 (post-fix) | Regression? |
|---|---|---|---|
| `erp_059_security_tests.js` | 13/13 | 13/13 | None |
| `erp_059_restart_persistence_tests.js` | 5/5 | 5/5 | None |
| `erp_059_transaction_contract_tests.js` | 6/6 | 6/6 | None |
| `erp_059b_durable_audit_tests.js` | 22/24 (+2 documented) | 22/24 (+2 documented) | None — same pre-existing environmental limitation |
| `erp_059c_production_isolation_tests.js` | 10/10 | 10/10 | None |
| `erp_audit_concurrency_tests.js` | 1/1 | 1/1 | None |
| `erp_audit_p0_tests.js` | 65/65 | 65/65 | None |
| `erp_phase38_e2e_trace_tests.js` | 49/49 | 49/49 | None |
| `erp_phase39_manufacturing_jobwork_tests.js` | 36/36 | 36/36 | None |
| `erp_phase39_fixed_assets_tests.js` | 30/30 | 30/30 | None |
| `erp_phase39_banking_tests.js` | 34/34 | 34/34 | None |
| `erp_phase39_payment_approval_matrix_tests.js` | 18/18 | 18/18 | None |
| `erp_phase39_stress_test.js` | 11/11 (525 docs) | 11/11 (525 docs) | None |
| **Total** | **300/300** (+2 documented) | **300/300** (+2 documented) | **Zero** |

Plus this phase's own new evidence, not part of any automated suite but independently verified:
118 real browser-driven UAT steps across 15 business areas (`PHASE_40_BROWSER_UAT_MATRIX.md`), and
the AR/AP traceability closure test (`PHASE_40_DOCUMENT_TRACEABILITY_FINAL.md`).

## What changed this phase (full list, cross-referenced to `PHASE_40_FIX_LOG.md`)

1. `server/domain.js` — `projectDocumentTrace()`: added AR/AP settlement walk (DEF-P40-01).
2. `client_secure/index.html` — `MODULE_TREE`: added `paymentreq` to Purchase's PROCUREMENT module (DEF-P40-02).
3. `client_secure/index.html` — `MODULE_TREE`: added `sitematerial` to Purchase's PROCUREMENT module (DEF-P40-03).
4. `client_secure/index.html` — BOM action rendering + new `submitBOM2()`: added the missing Submit step (DEF-P40-04).

Items 2-4 are pure client-side navigation/UI fixes with zero server-side surface — they cannot,
by construction, affect any server-side regression suite's outcome. Item 1 is the only server-side
change, and it is purely additive (new read-only query paths in one reporting function) with no
change to any existing return value, posting path, or validation rule.

## Verdict

Zero regressions from any of the 4 fixes, individually or combined, across 300 automated assertions
plus 118 real browser-driven steps. The one server-side change (DEF-P40-01) only adds new nodes to a
report's output array — no existing behavior was altered.
