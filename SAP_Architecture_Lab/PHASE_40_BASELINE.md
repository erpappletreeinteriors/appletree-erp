# PHASE 40 — Baseline

**Date:** 2026-09-13. Recorded BEFORE any Phase 40 code change, per the phase brief's Section 1
mandatory first action. All 16 Phase 39 companion documents were re-read (in full or targeted
re-verification against source) before this baseline was written.

## Version control state

- Last real commit: `d96234b` (ERP-059C: production/test isolation + destructive-test safety
  hardening) — unchanged since Phase 39 began; nothing has been committed since.
- Uncommitted working-tree changes carried in from Phase 39 (still uncommitted, per this
  engagement's "only commit when asked" rule):
  - `server/domain.js` — modified (Phase 39's DEF-P39-02 bank-import fix + DEF-P38-02 6-document-
    type registry fix)
  - `server/server.js` — modified (Phase 39's DEF-P38-01 test-route gating fix)
  - `client_secure/index.html` — modified (Phase 39's DEF-P39-04 Bank Accounts UI fix)
  - `PHASE39_DATA_INTEGRITY_FORENSIC_REPORT.md` — deleted from tracked path (quarantined as
    `PHASE39_DATA_INTEGRITY_FORENSIC_REPORT.FABRICATED_DO_NOT_TRUST.md.bak`, confirmed fabricated
    in a prior session — untouched, still quarantined, not trusted or restored)
  - `appletree_erp_v2_1.html` / `appletree_sales_studio.html` — pre-existing modifications from
    earlier, unrelated engagement work (not Phase 39/40 scope; left as found)
- No new commits will be made during Phase 40 unless the user explicitly asks.

## Fresh isolated test server for this phase

New scratch instance (Phase 39's own scratch server is gone — expected, it was disposable and the
session that ran it ended):
`C:\Users\Lenovo\AppData\Local\Temp\claude\D--APPLETREE-INTERIORS-Claude\phase40_e2e\`
(`domain.js`, `server.js`, `auth.js`, `route_safety_scanner.js`, `client_secure/index.html` copied
fresh from the current, Phase-39-fixed repo files). Booted `APP_ENV=test DB_PATH=<scratch>/db.json
PORT=4100`. Route safety scanner passed at boot (0 violations — the server would have refused to
start otherwise). `GET /api/system/environment` confirms `{appEnv:"test",
destructiveTestEndpointsEnabled:true}`. This is the only server Phase 40 will test against;
`server/db.json` (port 4001, the real/production-shaped instance) is not touched.

## Current test counts (carried from Phase 39, to be re-verified this phase)

| Suite | Phase 39 result |
|---|---|
| `erp_059_security_tests.js` | 13/13 |
| `erp_059_restart_persistence_tests.js` | 5/5 |
| `erp_059_transaction_contract_tests.js` | 6/6 |
| `erp_059b_durable_audit_tests.js` | 24/24 (+2 documented-not-tested, environmental) |
| `erp_059c_production_isolation_tests.js` | 10/10 |
| `erp_audit_concurrency_tests.js` | 1/1 |
| `erp_audit_p0_tests.js` | 65/65 |
| `erp_phase38_e2e_trace_tests.js` | 49/49 |
| `erp_phase39_manufacturing_jobwork_tests.js` | 36/36 |
| `erp_phase39_fixed_assets_tests.js` | 30/30 |
| `erp_phase39_banking_tests.js` | 34/34 |
| `erp_phase39_payment_approval_matrix_tests.js` | 18/18 |
| `erp_phase39_stress_test.js` | 11/11 (525 documents) |
| **Total (Phase 39 close)** | **302/302** |

## Current security count

0 architectural/route-safety violations (structural, reconfirmed at every server boot this
engagement has ever done, including this phase's fresh boot moments ago). Phase 39 added 6 targeted
live probes (crafted payload, privilege escalation via payload field injection, stale session, no
session, alternate-endpoint bypass, party-mismatch tampering) — all blocked.

## Current open defects (from `PHASE39_FINAL_DEFECT_REGISTER.md`)

| ID | Severity | Status entering Phase 40 |
|---|---|---|
| DEF-P38-03 | P4 | OPEN — deliberately not fixed (no live impact, refactor not worth the risk) |
| DEF-P39-01 | P4 | OPEN — cosmetic (MAT-2 uom mislabel in a narration field, zero financial impact) |
| DEF-P39-03 | P3 | OPEN — genuine Board-level policy decision (Payment Approval Matrix lower-tier authority), not a code defect |

All other Phase 38/39 findings (DEF-P38-01, DEF-P38-02, DEF-P38-04→superseded, DEF-P38-05,
DEF-P39-02, DEF-P39-04) are CLOSED — FIXED, per the register.

**0 open P0. 0 open P1. 0 open P2.** entering Phase 40 — the A-grade defect gate (Section 34/38-J)
was already met at the end of Phase 39; Phase 40's defect work is about finding anything NEW a
deeper pass surfaces, not clearing an existing backlog.

## Current Phase 39 A− reasons (the two named gaps Phase 40 exists to close)

Per `PHASE39_FINAL_VERDICT.md`'s own Part 25 gate assessment, exactly two preconditions were not
fully met:
1. **Browser/UI tests** — Phase 39's own browser pass was bounded (Dashboard, Fixed Assets, Bank
   Accounts, BOM screens only), not the full multi-area × role × action sweep.
2. **Document traceability** — `projectDocumentTrace()` does not walk the AR side (Customer
   Invoice→Receipt→Clearing) or the AP settlement side (Payment Request→Payment execution→
   Clearing) — confirmed by direct code reading just now (`domain.js:11632-11673`): the function
   walks Purchase Requisition→PO→GRN→Supplier Bill, lists Payment Requests as a flat unlinked list,
   and walks Site Material Requisition→Delivery Challan→Site Material Receipt→Site Consumption and
   Job Work Orders — but never follows a Bill to its Payment Request's actual execution/clearing,
   and has no AR-side walk at all (no Customer Invoice/Receipt/Clearing nodes exist in the chain
   function whatsoever).

These are exactly the two items Phase 40 Sections 4-6 (browser UAT) and 17-19 (traceability) target.

## Current nomenclature status (Phase 37/38/39)

Both Phase 37 MUST-CHANGE items are already implemented (confirmed via `git show HEAD:...` in a
prior session this engagement, re-confirmed by reading the current file): `domain.js`'s
`glDocumentTypes` `PAY` entry reads "Supplier Payment" (was "Vendor Payment"); `client_secure/
index.html`'s JE print template reads "Party" (was "Business Partner"). Phase 37's remaining
SHOULD-CHANGE/OPTIONAL/MANAGEMENT-DECISION items (Journal Voucher vs Journal Entry, MRS expansion,
APOB first-use expansion, ambiguous Receipt/Payment labels, MRQ naming) were never separately
implemented — `PHASE37_NOMENCLATURE_CHANGE_PLAN.md` remains the source of truth for what those are
and their approval status. Phase 40 Section 29 explicitly re-lists several of these as "required
corrections... where still present" — this baseline records them as NOT YET IMPLEMENTED, to be
audited fresh in Phase 40's own nomenclature pass (Section 29) rather than assumed from memory.

## Current browser coverage

Bounded (Dashboard, Fixed Assets create-flow, Bank Accounts create-flow + the DEF-P39-04 fix,
BOM screen render) — not the 15-area sweep Phase 40 Section 5 requires. This baseline records
browser coverage as **INSUFFICIENT for A-grade**, to be closed this phase.

## Current traceability coverage

Orphan detection: 0/525 orphans found at Phase 39's peak stress volume (real, live, company-wide,
across all document types created that phase) — this remains valid, current evidence and is not
re-litigated from scratch. Chain-walking depth: confirmed above as NOT including AR or AP-settlement
lineage — this baseline records that as the specific, scoped gap Phase 40 must close (Sections
17-19), via the smallest safe code change (extending `projectDocumentTrace()`), not a rewrite.

## Scope discipline for this phase

Per the brief's own Section 2 ("NO FEATURE CREEP"): no new modules, dashboards, reports, workflows,
approval systems, master-data concepts, tax features, or integrations will be introduced. The only
code changes anticipated at the start of this phase are:
1. Extending `projectDocumentTrace()` to also walk the AR (Invoice→Receipt→Clearing) and AP
   settlement (Bill→Payment Request→Payment execution→Clearing) lineages — directly required by
   Section 18, the smallest change that satisfies it.
2. Any genuine defect a deeper live/browser pass surfaces (each will get its own DEF-P40-xx entry
   with defect ID, reason, affected module, risk, before/after test, and regression evidence, per
   Section 2's own required change-record shape).

No other code change is planned as of this baseline. If the browser/traceability/reconciliation
passes below surface something else, it will be recorded and justified individually — not folded in
silently.
