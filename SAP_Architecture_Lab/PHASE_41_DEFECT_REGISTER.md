# PHASE 41 — Defect Register

**Date:** 2026-09-13 to 2026-09-14 (this phase spanned a session interruption and resumption; the
isolated test server was restarted, and the working dataset was recreated from scratch after each
restart — see `PHASE_41_BASELINE.md` for the environment note). Two new defects found this phase
(DEF-P41-01, DEF-P41-02); all defects carried in from prior phases are also listed for a complete
picture per Section 22's own requirement.

## Carried-forward defects (unchanged this phase)

| ID | Severity | Status | Description |
|---|---|---|---|
| DEF-P38-03 | P4 (cosmetic) | Open | Unchanged since Phase 38 — cosmetic only, no functional or control impact |
| DEF-P39-01 | P4 (cosmetic) | Open | Unchanged since Phase 39 — cosmetic only, no functional or control impact |
| DEF-P39-03 | P3 (moderate) | Open | A genuine Board-level policy question (not a code defect), unchanged — requires a management decision outside engineering scope |

DEF-P40-01 through DEF-P40-04: all 4 CLOSED — FIXED in Phase 40, re-confirmed still fixed by this
phase's full regression pass (0 regressions).

## New this phase

### DEF-P41-01 — Quotation cross-reference integrity gap

| Field | Value |
|---|---|
| **Severity** | **P2** (material control defect) |
| **Module** | Sales & CRM / Estimation & Costing — `createQuotation()` |
| **Found during** | Section 6 negative testing of the Lead→Estimation→Quotation UAT (`PHASE_41_ESTIMATION_QUOTATION_UAT.md`) — specifically the "wrong source reference" test case |
| **Reproduction (before fix)** | `POST /api/quotations` with `leadId:"LEAD-0002"` (a real, unrelated lead) but `estimationRequestId:"ER-0001"` / `costingVersionId:"COST-0001"` (which actually belong to a DIFFERENT lead, `LEAD-0001`) |
| **Expected** | Request rejected — a quotation must not mix source references from unrelated chains |
| **Actual (before fix)** | Request **succeeded**, silently creating `QTN-0002` with a `leadId` that did not match the estimation/costing chain it was actually priced from |
| **Root cause** | `createQuotation()` accepted `leadId`, `estimationRequestId`, and `costingVersionId` as three independently-supplied references and validated each individually (existence checks only) but never cross-checked that the three form one real, consistent chain. This is the same class of gap the codebase had already closed elsewhere for a different field pair (`draftCustomerInvoice()`'s project-vs-customer cross-check), but had not yet been applied to the Lead/Estimation/Costing/Quotation chain specifically |
| **Why P2, not P1** | No GL posting, no monetary loss, and no unauthorized access occurs at the point of the defect — the accounting boundary (verified separately in Section 8 of the UAT) means a quotation alone never touches the ledger. It is nonetheless a genuine material control defect (not merely cosmetic or moderate) because a silently mismatched source reference corrupts downstream traceability: `wonTransition()` would create a real Project carrying an incorrect `leadId`, permanently mis-attributing a won deal to the wrong originating lead in every future report and audit trail |
| **Fix** | `server/domain.js`, inside `createQuotation()` (~line 3252): added two cross-reference checks immediately after the existing `costing` lookup — (1) `costing.estimationRequestId` must equal the supplied `estimationRequestId` when both are present; (2) the estimation request's own `leadId` must equal the supplied `leadId` when both are present. Mirrors the existing `draftCustomerInvoice()` pattern rather than inventing a new validation concept |
| **Targeted test** | Live-reproduced against the isolated test server: the exact mismatched request from the reproduction step above now returns `"Estimation Request \"ER-0001\" belongs to Lead \"LEAD-0001\", not \"LEAD-0002\" — cannot create a quotation mixing an estimation from a different lead."` |
| **Regression** | Legitimate, correctly-linked chain (`LEAD-0001` / `ER-0001` / `COST-0001` together) still succeeds exactly as before (`QTN-0003` created normally). Full suite re-run: 300/300 (+2 documented) — see `PHASE_41_REGRESSION_REPORT.md` |
| **Browser evidence** | The full live browser chain in `PHASE_41_ESTIMATION_QUOTATION_UAT.md` (steps 1-11) continued to work end-to-end after the fix was applied, including the legitimate quotation creation, submit, discount approval, acceptance, and Won transition |
| **Final status** | **CLOSED — FIXED, RE-VERIFIED, ZERO REGRESSIONS**, all within this same phase |

### DEF-P41-02 — Quotation-side traceability gap in `projectDocumentTrace()`

| Field | Value |
|---|---|
| **Severity** | **P2** (material control defect) |
| **Module** | Project Traceability — `projectDocumentTrace()` (`server/domain.js:11651`) |
| **Found during** | Section 19 traceability smoke check, specifically instructed to include "quotation-side tracing this time" per the Phase 41 brief — a live, real Lead→Estimation Request→Costing Version→Quotation→Won→Project→Invoice chain was built via API (`LEAD-0002`→`ER-0001`→`COST-0001`→`QTN-0001`→`PRJ-007`→`INV/2026-27/0001`/`JE-0003`), then `GET /api/projects/document-trace?projectId=PRJ-007` was called against it |
| **Expected** | The trace should show the full document lineage, including the sales-origin documents the project itself was created from |
| **Actual (before fix)** | The trace returned **only** the downstream Customer Invoice — `{"chain":[{"type":"Customer Invoice","doc":"INV/2026-27/0001",...}]}` — completely omitting the Lead, Estimation Request, Costing Version, and Quotation, even though `wonTransition()` had already stamped `leadId:"LEAD-0002"`, `estimationRequestId:"ER-0001"`, and `quotationId:"QTN-0001"` directly onto the Project record (confirmed present in the live `wonTransition()` API response) |
| **Root cause** | `projectDocumentTrace()` only ever forward-walks FROM a project through procurement/inventory/AR/AP documents that carry a `projectId` field of their own (Purchase Requisitions, POs, GRNs, Bills, Payment Requests, Customer/Supplier Invoices, Site Material, Job Work Orders). It never read the Project record's OWN `leadId`/`estimationRequestId`/`quotationId` fields to walk backward to the sales-origin documents that don't carry a `projectId` (a Lead, Estimation Request, Costing Version, or Quotation predates the project's existence, so none of them can carry the project's ID). This is the exact same class of one-directional gap Phase 40 §18 found and fixed for the AR/AP settlement side of the SAME function — that fix closed the forward (downstream) settlement gap; this one closes the backward (upstream) sales-origin gap |
| **Why P2, not P1** | No GL/financial impact and no unauthorized access — the defect is a visibility/audit-trail gap, not a posting or control-bypass defect. It is material (not merely cosmetic) because document traceability is itself a named, explicit Phase 40/41 control requirement (SAP-grade "document flow" principle) and a genuinely won, real project's own sales origin was silently invisible to the one function whose entire purpose is showing that lineage |
| **Fix** | `server/domain.js`, inside `projectDocumentTrace()` (~line 11651): captured the already-looked-up `proj` record into a reusable variable, then added three new backward-walk blocks (Lead, Estimation Request + its Costing Versions, Quotation) that read directly off `proj.leadId` / `proj.estimationRequestId` / `proj.quotationId` — purely additive, read-only, no new data structure, same technique as the existing Phase 40 §18 block immediately below it in the same function |
| **Targeted test** | Live-reproduced against the isolated test server after the fix: the identical `GET /api/projects/document-trace?projectId=PRJ-007` call now returns the full 5-entry chain in correct order — `Lead (LEAD-0002, status WON) → Estimation Request (ER-0001, previous:LEAD-0002) → Costing Version (COST-0001, previous:ER-0001, amount 12100) → Quotation (QTN/2026-27/0001, previous:COST-0001, status Accepted, amount 11737) → Customer Invoice (INV/2026-27/0001, Posted)` |
| **Regression** | Full suite re-run after this fix: 300/300 (+2 documented) — identical to the count before the fix, and identical to Phase 40's closing count. No existing test asserts on `projectDocumentTrace()`'s output shape (confirmed by search — zero test files reference `document-trace` or `projectDocumentTrace`), so this addition had no pre-existing assertion to break, and none broke |
| **Final status** | **CLOSED — FIXED, RE-VERIFIED, ZERO REGRESSIONS**, all within this same phase |

## Summary

0 open P0. 0 open P1. 0 open P2 (DEF-P41-01 and DEF-P41-02 both closed same-phase). 1 open P3
(policy question, not a code defect). 2 open P4 (cosmetic, carried forward, no functional impact).
This meets the A-grade precondition of "0 open P0/P1/P2" per every prior phase's own rubric.
