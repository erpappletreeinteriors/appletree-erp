# PHASE 41 — Lead → Estimation → Quotation UAT

**Date:** 2026-09-13. Isolated test server, `APP_ENV=test`, port 4100 (fictional `PHASE41-TEST`-
scope data). Real browser session, real role-switching, per Section 5's mandatory full chain.

## The complete chain, live, through the browser

| Step | Role | Screen | Action | Result |
|---|---|---|---|---|
| 1 | sales1 | Leads | Create Lead (name, requirement, expected value ₹5,00,000) | `LEAD-0001 created`, status `NEW` |
| 2 | sales1 | Leads | Create Estimation Request (one click, from the Lead row) | `Estimation Request ER-0001 created`; Lead status auto-transitioned to `ESTIMATION` |
| 3 | estimator1 | Estimation & Costing | Create Costing Version — 2 lines (Material 20×₹2,800, Labour 10×₹1,500), Overhead 10%, Profit 15% | `COST-0001 created — selling price ₹89,815.00` |
| 4 | sales1 | Quotations | Load Costing Versions → Create Quotation, discount 8% | `QTN-0001 created — ₹82,629.80`; Lead status auto-transitioned to `QUOTATION` |
| 5 | sales1 | Quotations | Submit | Status → `PendingApproval` (8% exceeds the 5% no-approval ceiling) |
| 6 | sales1 | Quotations | Approve own discount (self-approval attempt) | **BLOCKED** — `"DENIED: Role \"Sales\" cannot approve discounts."` |
| 7 | finance1 | Quotations | Approve Discount | Status → `Approved` |
| 8 | sales1 | Quotations | Record Acceptance | `"Acceptance recorded (manual — e-signature integration pending)"`; status → `Accepted` |
| 9 | finance1 | Quotations | Mark Won, assign PM `U-PM1` | `"Won! Project PRJ-006, Customer CUST-011, Baseline BASE-0001, PM U-PM1"` |
| 10 | accountant1 | Customer Invoice | Raise ₹40,000 + GST18 invoice against the new PRJ-006/CUST-011 | `DRAFT-0001 saved` |
| 11 | finance1 | Document Workflow | Approve, Post | `Posted as INV/2026-27/0001`, `JE-0001` |

## Costing calculation — independently verified, not assumed

Material (20×₹2,800=₹56,000) + Labour (10×₹1,500=₹15,000) = base cost ₹71,000. +10% overhead =
₹78,100. ×1.15 profit = **₹89,815.00 — exact match** to the screen's own result.

## Quotation pricing — independently verified

₹89,815.00 × (1 − 0.08) = **₹82,629.80 — exact match.**

## Source-reference traceability — confirmed via the actual created Project record

`GET /api/projects` → PRJ-006: `{"leadId":"LEAD-0001", "quotationId":"QTN-0001",
"estimationRequestId":"ER-0001", "budget":82629.8, "customerId":"CUST-011",
"createdBy":"U-FIN1"}` — every source reference preserved as a real foreign key, `budget` exactly
matching the quotation's `finalPrice`.

## Quotation → Sales-to-Cash link (Section 7)

The system DOES support (and this phase exercised) quotation-to-sales conversion — it does **not**
stop at the quotation. `wonTransition()` creates a real Project and Customer; a Customer Invoice was
then raised against that exact project (step 10-11 above) and posted to a real GL entry. Source
reference remained traceable throughout (the invoice's own `projectId:"PRJ-006"` links back through
the Project's own `quotationId`/`leadId`/`estimationRequestId` fields to the originating Lead).

## Accounting boundary test (Section 8) — the critical control

`GET /api/trial-balance` immediately after Lead+ER+Costing+Quotation creation (steps 1-4, before any
Invoice): **`{tbDr: 0, tbCr: 0}` — zero GL postings.** Confirmed live, not assumed: quotation
creation does NOT silently create posted financial accounting, AR, revenue, or inventory mutation.
Only after the real Invoice was posted (step 11) did the Trial Balance move — to exactly ₹47,200
(₹40,000 × 1.18), matching the invoice precisely.

## Negative tests (Section 6)

| Scenario | Result |
|---|---|
| Invalid costing version (nonexistent ID) | BLOCKED — `"Costing version not found."` |
| Unauthorized quotation creation (Estimator) | BLOCKED — `"Role \"Estimator\" is not authorized..."` |
| Unauthorized discount approval (Sales, self) | BLOCKED — see step 6 above |
| Duplicate submission (already Accepted) | BLOCKED — `"Cannot submit — quotation is \"Accepted\", not Draft."` |
| Edit after restricted status (revise an Accepted quotation) | BLOCKED — `"Cannot revise a \"Accepted\" quotation."` |
| Duplicate Won transition | BLOCKED — `"This quotation was already marked Won — project PRJ-006 already exists."` (the exact race-condition guard the code's own comment describes, live-confirmed) |
| **Wrong source reference** (a quotation citing a genuine but UNRELATED lead alongside another lead's real estimation/costing) | **Found to NOT be blocked — a real defect. See DEF-P41-01 below.** |

## DEF-P41-01 — cross-reference integrity gap (found, fixed, re-verified this phase)

**Before the fix**, `createQuotation()` accepted `leadId`, `estimationRequestId`, and
`costingVersionId` as three independently-supplied references with no check that they form one real
chain. Live-reproduced: `POST /api/quotations` with `leadId:"LEAD-0002"` (a genuine, separate,
unrelated lead) but `estimationRequestId:"ER-0001"`/`costingVersionId:"COST-0001"` (which actually
belong to `LEAD-0001`) **succeeded**, creating `QTN-0002` with a silently wrong `leadId`.

**Fix**: added two cross-reference checks — `costing.estimationRequestId` must match the supplied
`estimationRequestId`, and the estimation request's own `leadId` must match the supplied `leadId` —
mirroring the exact pattern already used elsewhere in this file for a different pair of fields
(`draftCustomerInvoice()`'s project-vs-customer check). See `PHASE_41_DEFECT_REGISTER.md` and
`PHASE_41_FIX_LOG.md` for full detail.

**After the fix**, live-reproduced: the same mismatched request now returns `"Estimation Request
\"ER-0001\" belongs to Lead \"LEAD-0001\", not \"LEAD-0002\" — cannot create a quotation mixing an
estimation from a different lead."` The correct, legitimately-linked chain (`LEAD-0001`/`ER-0001`/
`COST-0001` together) still succeeds exactly as before (`QTN-0003` created normally) — confirming the
fix rejects only genuine mismatches, not legitimate use.

## Verdict

The complete Lead→Estimation→Costing→Quotation→Won→Project→Invoice chain is fully browser-proven,
with real cost/price calculations independently verified exact, the accounting boundary confirmed to
hold (no premature GL posting), and one genuine cross-reference defect found, fixed, and
re-verified within this same phase.
