# PHASE 39 — Baseline

**Timestamp:** 2026-09-11, immediately following Phase 38 (verdict B — Mostly Ready, Minor
Control/Process Gaps). No code has changed since Phase 38 ended — checksums below are byte-
identical to `PHASE38_CHECKPOINT/`.

## Source files

| File | Lines | SHA-256 |
|---|---|---|
| `server/domain.js` | 12,088 | `e9d95d74afa32a6c0e8a5564796ff979ae67b16bdeeea77cdf2af83785ca0bc1` |
| `server/server.js` | 3,379 | `2ab744217b330ca3bda9f79a212312ad2821d42fabdfe35a98eb41f605f82033` |
| `client_secure/index.html` | 6,446 | `75886e7a6a568b5a09ff007fa9d13a82cfeec8f9d1d8f181f30abca5031c87ad` |

Verbatim copies (+ `auth.js`, `route_safety_scanner.js`, all 8 files in `tests/`) are in
`PHASE39_CHECKPOINT/`.

## Current test counts

8 permanent test files in `tests/`: `erp_059_security_tests.js` (13 assertions),
`erp_059_restart_persistence_tests.js` (5), `erp_059_transaction_contract_tests.js` (6),
`erp_059b_durable_audit_tests.js` (24, +2 documented-not-tested), `erp_059c_production_isolation_
tests.js` (10), `erp_audit_concurrency_tests.js` (1), `erp_audit_p0_tests.js` (65),
`erp_phase38_e2e_trace_tests.js` (49). Historical suite: 58 files in `server/`, all `TEST_BASE_URL`-
migrated as of Phase ERP-059C.

## Phase 38 results (the baseline this phase measures against)

- Procurement-to-Pay: live-proven, 49/49 E2E assertions passed.
- Sales-to-Cash: live-proven (part of the same 49-assertion run).
- Project Cost Breakdown / Project P&L: independently reconciled to the rupee.
- AR/AP/Output-Tax/Input-Tax: reconciled exactly to GL, before and after a 110-document stress
  batch.
- Central accounting/inventory engines: exactly one legitimate write path each, confirmed via
  repository-wide search.
- Security: 0/218 routes lacking a recognizable authorization check (route safety scanner).
- Document numbering: concurrency-safe up to 110 simultaneous documents.
- 8 negative tests correctly blocked live.
- **0 P0, 0 P1, 0 P2 defects. 3 P3, 2 P4 findings** (see below).
- Verdict: **B — Mostly Ready, Minor Control/Process Gaps.**

## Current P3/P4 findings carried into this phase (from `PHASE38_DEFECT_REGISTER.md`)

| ID | Severity | Summary | Status entering Phase 39 |
|---|---|---|---|
| DEF-P38-01 | P3 | `/api/test/architectural-violations` gated by Admin only, not `IS_TEST_ENV` (unlike sibling `/api/test/*` mutation routes) | OPEN |
| DEF-P38-02 | P3 | `SRET` document-type registry gap (guard-list comment references it; base seed array lacks it) | OPEN |
| DEF-P38-03 | P4 | Chart-of-accounts literals not fully centralized (`CUSTOMER_ADVANCE_ACCOUNT` used at 2/5 sites) | OPEN |
| DEF-P38-04 | P3 | Payment Approval Matrix's lower tiers enforced via route-level role exclusion, not the matrix's own explicit per-tier check | OPEN |
| DEF-P38-05 | P4 | Phase 37's 2 MUST-CHANGE nomenclature items (`Vendor Payment` label, `Business Partner` mislabel) not yet implemented | OPEN |

## Phase 37 nomenclature Change Plan status entering this phase

2 MUST CHANGE (trivial, isolated label fixes), 6 SHOULD CHANGE, 4 OPTIONAL, 4 MANAGEMENT DECISIONS —
none implemented yet. Full detail: `PHASE37_NOMENCLATURE_CHANGE_PLAN.md`.

## Current database state

**Production** (`server/db.json`): unchanged since the ERP-059B incident — 52,411 bytes, last
modified 2026-09-10 18:14:36, still awaiting the user's separate recovery decision. Confirmed
read-only and untouched at the start of this phase. **This phase's functionality does not depend on
it in any way** — every test in this phase, like every phase since the incident, runs exclusively
against disposable isolated server instances.

## Current document-numbering state

Unchanged since Phase 37/38 — 51 `nextDocNumber()` prefixes, the `glDocumentTypes` registry (with
the DEF-P38-02/`SRET` gap noted above), and Phase 38's own live concurrency proof up to 110
simultaneous documents.

## Scope for this phase

Live-test Manufacturing, Job Work, Fixed Assets, and Banking (the 4 domains Phase 38 could not
reach); materially expand browser-workflow coverage; investigate and close the 5 open P3/P4
findings; implement Phase 37's approved (MUST CHANGE) nomenclature fixes with full regression;
re-run the accounting/inventory engine and security forensic checks; extend the stress test; and
determine, with genuine evidence rather than inference, whether the ERP has earned an A grade per
Part 25's explicit gate.
