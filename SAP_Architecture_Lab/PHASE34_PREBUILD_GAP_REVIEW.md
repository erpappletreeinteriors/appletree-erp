# PHASE 34 — PRE-BUILD GAP REVIEW
Verified directly against the live `server/domain.js` (6,289 lines) and `server/server.js` (2,346 lines) as of the Phase 34 checkpoint — not against the Phase 33 reports' own claims. Where a Phase 33 claim didn't match the code, that's flagged explicitly below rather than repeated.

## Method
For each of Phase 33's 10 carried-forward items: grep/read the actual functions, decide BUILD / CONFIG-ONLY / DEFERRED, then build only what's decided BUILD before touching anything else.

## Findings

| # | Item | Phase 33 report said | Actually found in code | Phase 34 disposition |
|---|---|---|---|---|
| 1 | Job Work / APOB | "Deferred — full module, class G" | **Confirmed correct** — `jobWorkOrderRef` exists only as a free-text string on Site Material Requisition (line 5947), nothing else. No job-worker master, no movement type, no APOB field anywhere. | **BUILD** — bounded scope: Job Worker master, Job Work Order/Issue, job-worker-held stock via the existing ledger (additive `jobWorkerId` dimension + 2 new movement types, same pattern as Phase 33's `siteId`/SiteReceipt/SiteConsumption), return/scrap/direct-dispatch outcomes, aging, APOB flag. NOT building: automatic multi-hop "next job worker" chaining beyond a single re-dispatch reference field (genuinely open-ended; the SOP's own text describes it as an exception case, not the common path). |
| 2 | Ship-to GSTIN | "Deferred with Job Work (Gap 21)" | Confirmed — no such field exists anywhere. | **BUILD** as part of the Job Work module + a generic e-way-bill-adjacent field set, since Job Work is now being built. Effective date made **configurable** (defaults to the SOP's own stated 2026-08-01), not hardcoded as an unconditional `true` — see Part 8 build below. |
| 3 | BOQ vs BOM | "Deferred — distinct object, class G" | `materialBomQuota({projectId, materialId})` (line 2332) already computes **budgetQty vs usedQty per material per project**, BOM-derived, live-gated at every Material Issue. This is a genuine "estimated vs actual quantity" engine — it is just never surfaced as a **report** (only used ad-hoc inside the issue-time gate) and has no **cost** or **wastage%** dimension. | **NOT a new BOQ object.** Per the brief's own instruction to check whether the existing chain satisfies the requirement first — it does, for quantities. Built one new report function (`projectBOQVarianceReport`) that iterates every BOM line for a project and adds cost (rate × qty, both estimated and actual) and wastage% on top of the existing quota engine, plus an abnormal-consumption flag. Zero new master data object, zero new inventory concept. |
| 4 | Three-way-match applicability by payment type | Not addressed in Phase 33 (only PO-linked defense-in-depth was built) | Confirmed — `postSupplierPayment()` only checks match status for a bill with `poId`+`grnId`; there was no configuration surface for which payment CATEGORIES require what kind of match. | **BUILD** — `threeWayMatchPolicyConfig` (category → required match type), `PAYMENT CONTROL POLICY REQUIRED` status shown until Finance actively confirms each category, per §11 of the brief. |
| 5 | PO approval threshold conflict | "Documented, not resolved" (Gap 15) | `purchaseApprovalConfig` (Phase 33) already has `centralizedThreshold`/`sitePettyDailyLimit`/`sopThresholdApprovedByFinance:false` — missing explicit **approving role** / **site approving role** / **escalation role** fields and a `POLICY NOT FINALISED` status string. | **EXTEND** the existing config object (additive fields only, no behavior change to existing PR→PO gate logic) rather than build a second config. |
| 6 | Payment approval matrix finalization | Built with `finalised:false`, un-settable to `true` via the API (verified again just now — the `/api/payment-approval-matrix` POST route hardcodes `finalised = false` after any update) | **Confirmed correct**, nothing to change. | **NO BUILD** — retested only. |
| 7 | Real GSTIN/PAN/bank/master config | E — real-world dependency | Confirmed — `companyGSTConfig` starts fully null, no bank account has `accountType:'Cash'` seeded. | **NO BUILD** — checklist maintained (§35 deliverable), nothing invented. |
| 8 | Real Appletree UAT | E — real-world dependency | N/A | **NO BUILD** — this phase performs an internal browser-role walkthrough (Part 28), not a substitute for real UAT. |
| 9 | Tax/legal validation | F — every TDS/cash-limit response already carries a "SOP-sourced, not verified tax law" disclaimer | Confirmed present on `/api/tds-config` and `computeTDS()` responses. | **STRENGTHEN LABELING** only — explicit "SOP CONFIGURATION" vs "STATUTORILY VERIFIED" phrasing added to the dashboard and config responses (§14 of the brief), no rate/threshold logic changes. |
| 10 | E-way bill | Phase 33 gap register claimed **"Manual-entry tracking BUILT this phase (flag + fields)"** | **This claim was FALSE.** Grepped the entire codebase for `ewayBill`/`E-way`/`eway` — zero matches anywhere in `domain.js` or `server.js`. No fields, no collection, no threshold flag exist. This is a genuine discrepancy between the Phase 33 report and the actual Phase 33 code, caught by this phase's own "verify against the live code, not the report" instruction. | **BUILD FOR REAL THIS TIME** — a genuine `ewayBills` collection + `ewayBillRequired(value)` helper (>₹50,000 threshold) + manual-entry fields, attachable to Delivery Challans (site and job-work) and PO/GRN-linked dispatches. No claim of real government API integration anywhere. |

## Additional gap found during this review, not on Phase 33's original list

**ITC (Input Tax Credit) is posted unconditionally on every supplier invoice with a tax code, and is never reversed on damage/write-off/adjustment.** `draftSupplierInvoice()`/`draftSupplierInvoiceFromPO()` post the full `1300 Input Tax Recoverable` amount with no eligibility classification; `createInventoryAdjustment()`/`createDamageReport()` (the write-off path) never touch account 1300 at all — so a damaged or written-off item's originally-claimed ITC stays on the books forever, which is exactly what SOP §2 prohibits ("ITC NOT available on lost/destroyed/written-off/free-sample goods"). This maps to Part 16 of the Phase 34 brief and is genuinely buildable: classify the write-off reason, and where the reason indicates ITC-ineligibility, reverse the proportional Input Tax through the same `postJournalEntry()` engine, tagged and audited. **BUILD.**

## What is explicitly NOT being built this phase, and why

- **Automatic multi-hop job-work re-dispatch chains** ("Job Worker A → Job Worker B → Customer" as a single tracked object graph) — the SOP itself treats this as an exception path, not the common case; a single `previousJobWorkOrderId` reference field captures the traceability requirement without an open-ended chain-of-custody engine.
- **Real government e-way-bill API integration** — explicitly forbidden by the brief itself (Part 9): "Do not falsely state that an e-way bill has been generated by the government system."
- **Automatic ITC-reversal on every possible write-off type without a human classification step** — the reversal is real and posts through the one engine, but it is triggered by the SAME reason-code classification the user already supplies (Damage Report reason, Inventory Adjustment reason), not a guessed heuristic.
- **Finalizing the Payment Approval Matrix or the PO threshold conflict** — both remain Class C, Finance's decision, exactly as Phase 33 left them. Extending their configuration surface is not the same as finalizing them.

## Build order for this phase
1. Job Worker master + Job Work Order/Issue/Return/Scrap + APOB flag + aging (largest item)
2. Ship-to GSTIN + e-way bill records (both ride on the Job Work delivery-challan pattern)
3. ITC eligibility classification + reversal on write-off
4. BOQ variance report (wraps existing `materialBomQuota`, no new object)
5. Three-way-match policy config by payment category
6. PO approval policy config extension
7. Tax/legal + SOP-configuration labeling strengthening
8. Dashboard update reflecting all of the above with the required status categories (§36)
9. Tests, regression, stress test, browser walkthrough, final report
