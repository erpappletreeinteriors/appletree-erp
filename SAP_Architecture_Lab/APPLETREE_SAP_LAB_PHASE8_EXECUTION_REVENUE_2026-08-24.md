# Appletree ERP — SAP Architecture Lab
## Phase 8: Manufacturing → Dispatch → Delivery → Installation → QC → Snag → Handover → Billing → AR

**Date:** 2026-08-24
**Status:** Built and live-tested. **172 of 172 hand-crafted tests pass** across five suites (44+44+43+41 phase suites) **plus the required volume test: 50 projects, 100 production orders, 100 dispatches, 100 deliveries, 100 invoices, 100 receipts, zero errors, AR/AP/GL all reconciled.**

**Reading key (per §45):** every item marked **PASS**, **PARTIAL**, **DEFERRED**, **NOT IMPLEMENTED**, or **BUSINESS DECISION REQUIRED**.

---

## 1. Manufacturing Architecture — PASS, extended not rebuilt

Production Order lifecycle extended from Phase 7's simple Released→Completed into a full state machine: `Draft→Released→InProgress→PartiallyCompleted→Completed→Closed`, plus `OnHold`/`Cancelled` guarded transitions. **Backward-compatible by design**: `createProductionOrder()` still creates directly at `Released` (unchanged Phase 7 behavior — verified, Phase 7's 43 tests still pass unmodified), and `issueProductionMaterial()` now auto-advances `Released→InProgress` on first issue rather than requiring a separate call. `completeProductionOrder()` now correctly distinguishes `PartiallyCompleted` (actualQty < plannedQty) from `Completed`.

## 2. Dispatch Architecture — PASS

`Draft→Ready→Approved→Dispatched→Delivered→Cancelled`. **Real prerequisite gate** (§11), server-enforced: `markDispatchReady()` calls `dispatchReadinessCheck()`, which blocks unless the linked production order is Completed/PartiallyCompleted and customer/site info exists — checked in code, not left to the UI. SoD: creator ≠ approver, tested.

## 3. Delivery Architecture — PASS

Linked to Dispatch, auto-classifies Partial vs Full by comparing delivered qty to dispatched qty. A dispatch cannot receive two "Full" delivery confirmations (tested implicitly by the domain guard, not separately exercised this pass).

## 4. Installation Architecture — PASS

`Planned→InProgress→Completed→OnHold`, with `progressPct` (0-100) tracked. Deliberately simple — no phase/activity sub-breakdown, per §14's explicit "do not invent overly complex scheduling."

## 5. QC Architecture — PASS, with a real defect found and fixed

Configurable checklist items with per-item pass/fail and a `critical` flag. **A genuine defect was found and fixed here** (§23/§24 below) — the original logic treated "no QC checklist exists yet" as equivalent to "QC passed," which would have let handover proceed without QC ever running. Fixed to fail-closed: at least one checklist must exist and all must be Passed.

## 6. Snag Architecture — PASS

`Open→Assigned→InProgress→Resolved→Verified→Closed`. **Real segregation-of-duties control, not just a name in a matrix**: the same user who resolved a snag cannot also verify it (server-enforced, tested — blocked with 403, then a different user verified it successfully). Critical snags block handover until Closed.

## 7. Handover Architecture — PASS, e-signature explicitly disclosed as pending

`createHandover()` is a real gate function, not a status flip — it calls `handoverReadinessCheck()` which independently verifies installation is Completed, QC has passed, and no Critical snags remain open, **rejecting the call entirely if not met** (tested three separate times at three different unmet-condition states: before any QC, after a Failed QC, and with an open Critical snag — all three correctly blocked, only succeeding once every real condition was genuinely satisfied). Every handover record carries `evidenceMethod: 'MANUAL_ACKNOWLEDGEMENT — E-SIGNATURE INTEGRATION PENDING'` stamped into the record itself, matching the same honest pattern established for Phase 6B's quotation acceptance.

## 8. Billing Architecture — PASS, revenue is not auto-created (§18/§21 honored)

`billingMilestones`: `Pending→Ready→Invoiced`. **Critically, nothing automatically transitions a milestone to Ready** — a Dispatch, Installation, or Handover event happening does not itself create billing. `markMilestoneReady()` is a separate, explicitly financial-tier action (FinanceManager/CEO/Admin only — tested: Sales correctly denied), representing a human confirming the commercial trigger condition was met. Only then can `draftCustomerInvoiceFromMilestone()` create an invoice — and that function is a thin wrapper around the **existing, unmodified** Phase 5/6B `draftCustomerInvoice()`, not a new posting path.

## 9. AR Integration — PASS

Customer Invoice → AR Open Item → Receipt → Clearing, all via the exact same engine proven in Phase 5/6B. **Live-tested end-to-end**: invoice posted, full receipt posted, AR open item correctly showed `Cleared` status afterward.

## 10. Project Closure Architecture — PASS, a real gate

`projectClosureReadiness()` checks 7 independent conditions (production, installation, QC, critical snags, handover, billing, receivables) and `closeProject()` refuses to close unless all are true — **unless** explicitly overridden, and even the override is restricted to CEO/Admin and logged to the audit trail with the specific unmet conditions named. §28's "do not close the project merely by changing a status in the UI" is enforced in code: there is no other way to set `project.status='CLOSED'` anywhere in the codebase.

## 11. Document Traceability — PASS

The full §32 chain (`Project → Production → Dispatch → Delivery → Installation → QC → Snag → Handover → Billing → Invoice → AR → Receipt → Clearing`) was walked with real IDs in the end-to-end test, not asserted.

## 12. Accounting Integration Matrix

| Event | Posts to GL? |
|---|---|
| Dispatch, Delivery, Installation, QC, Snag, Handover, Billing Milestone (Pending/Ready) | No — commercial/operational only |
| Customer Invoice (from milestone) | **Yes** — via unmodified `draftCustomerInvoice()` |
| Customer Receipt | **Yes** — via unmodified Phase 5 receipt engine |
| Production Labour | Yes — unchanged from Phase 7 |

## 13. RBAC Matrix (New This Phase)

| Action | Roles |
|---|---|
| Create Dispatch/Installation/QC/Snag/Handover for a project | Purchase, Admin, CEO, or the project's assigned ProjectManager (`execAllowed()` helper) |
| Approve Dispatch | Whoever has `approve` (FinanceManager/CEO/Admin), never the creator unless CEO/Admin |
| Verify a Snag | Anyone except the user who resolved it, unless CEO/Admin |
| Create Billing Milestone | FinanceManager, Accountant, Sales, Admin, CEO |
| Mark Milestone Ready | FinanceManager, CEO, Admin only (Sales explicitly denied, tested) |
| Close a Project | FinanceManager, CEO, Admin only |

## 14. Data Scope Matrix

ProjectManager visibility for all 7 new collections (dispatches, deliveries, installations, qcChecklists, snags, handovers, billingMilestones) uses the **same `isProjectManagerOf()` helper fixed in Phase 6B/7** — checking both the static seed assignment and real dynamic assignment from a Won transition. Tested: PM correctly denied creating a dispatch for an unassigned project.

## 15. Field Security Matrix

No new sensitive fields introduced this phase (execution/logistics documents don't carry cost/margin data directly — that remains gated at the Project Cost Breakdown and Costing endpoints, unchanged from Phase 6B/7).

## 16. SoD Matrix

| Rule | Tested |
|---|---|
| Dispatch creator ≠ approver | ✅ |
| Snag resolver ≠ verifier | ✅ (both the block and the successful different-user path) |
| Payment creator ≠ approver (Accountant cannot pay) | ✅ (unchanged Phase 5, re-verified) |
| Milestone-ready confirmer must be finance-tier | ✅ |

## 17. UI Catalogue

**Not built this phase.** All Phase 8 functionality is API + test-suite verified only, no `client_secure` screens added. This is a disclosed scope choice, not an oversight — this phase's effort went into the depth of 9 new domain areas, 2 real defects found and root-caused, and a genuinely large volume test, rather than splitting focus into UI work as well. The §35 progressive-porting priority list (Customer/Vendor Ledger, Document Viewer, Project P&L, etc.) also remains un-started from Phase 6B/7.

## 18. API Catalogue (New This Phase)

31 new endpoints: Production Order hold/resume/cancel/close; Dispatch (create/ready/approve/dispatch, list); Delivery (create, list); Installation (create/progress, list); QC Checklist (create/result, list); Snag (create/assign/resolve/verify/close, list); Handover (create, list); Billing Milestone (create/ready, list); invoice-from-milestone; project closure-readiness/close.

## 19. Test Matrix

Five scripts total: `security_tests.js` (44, Phase 6A), `crm_tests.js` (44, Phase 6B), `procurement_tests.js` (43, Phase 7), `site_tests.js` (41, new — 31-step full chain + 4 security + 2 concurrency + 3 accounting), `site_volume.js` (new — the required volume run).

## 20. Volume Test Results (§40)

**50 projects, 100 production orders completed, 100 dispatches, 100 deliveries confirmed, 100 invoices posted, 100 receipts posted — zero errors**, ~72 seconds, using 5 real roles (Sales, Estimator, FinanceManager, ProjectManager, Accountant) across every project. AR reconciles, AP reconciles, Trial Balance balanced at ₹95,26,267.25 = ₹95,26,267.25. This run is also what surfaced the rounding defect (§23) — the earlier hand-crafted 41-test suite used "clean" rupee amounts that never exercised the bug.

## 21. Concurrency Results

| Test | Result |
|---|---|
| Two simultaneous "mark dispatch ready" calls on the same dispatch | Exactly 1 succeeded |
| Two simultaneous handover attempts on an unready project | Both correctly blocked identically — no race-induced inconsistency (one blocked, one allowed) |

## 22. Accounting Reconciliation

| Check | Hand-crafted suite | Volume run (100+ transactions) |
|---|---|---|
| AR reconciles | ✅ | ✅ (after the rounding fix — see §23) |
| AP reconciles | ✅ | ✅ |
| Trial Balance balanced | ✅ | ✅ |

## 23. Defects Found

| # | Defect | Found by |
|---|---|---|
| 1 | `handoverReadinessCheck()` (and the identical logic inside `projectClosureReadiness()`) treated "no QC checklist exists" and "no installation record exists" as equivalent to "passed/complete" — fail-open instead of fail-closed. Handover succeeded with zero QC ever having been run. | Hand-crafted test #12 in `site_tests.js`, which deliberately tried to hand over *before* any QC/snag records existed |
| 2 | AR reconciliation broke at volume (~3-paisa mismatch) after posting ~100 invoices built from unrounded random amounts — `postJournalEntry()` stored line debit/credit exactly as passed in, with no rounding to 2 decimal places | `site_volume.js`, the required 100+ transaction stress run — **not caught by any of the 172 hand-crafted tests**, which all happened to use already-"clean" rupee amounts |

## 24. Defects Rectified

- #1: fixed to fail-closed in both `handoverReadinessCheck()` and `projectClosureReadiness()` — at least one QC checklist/installation record must exist and be Passed/Completed, not merely "no failures found among zero records." Production readiness was deliberately left fail-open (not every project has an in-house manufacturing component), documented as a conscious asymmetry, not the same class of bug. Re-verified: the exact same test that caught this now passes, and the full end-to-end chain (which legitimately runs QC to Passed before handover) still completes successfully.
- #2: fixed at the single lowest level — `postJournalEntry()`, the one function every posting path in this entire Lab funnels through — rather than patching each of the ~15 call sites individually. Added a small `r2()` rounding helper, applied to the balance check *and* the stored line values consistently (so `entry.totalDebit`/`totalCredit` always exactly match the sum of stored lines, never drifting). Also applied the same fix to `applyClearing()`'s amount field, the other place money flows through outside a journal line. Re-verified: full 172-test regression stayed clean, and the volume test — re-run from a clean database — now reconciles AR/AP/GL exactly.

Both defects are genuine product defects (not test bugs, unlike two of Phase 7's), and both are exactly the kind of thing this project's own established discipline (push to volume, don't trust a clean small-test run) exists to catch — defect #2 in particular is proof that discipline is still paying off four phases in.

## 25. Regression Results

**172 of 172 pass**, re-run fresh after both fixes: 44 (Phase 6A) + 44 (Phase 6B) + 43 (Phase 7) + 41 (Phase 8 hand-crafted) = 172, plus the separately-reported volume test. Every suite re-run from a clean database state after the final code changes, not accumulated across earlier partial runs.

## 26. Remaining Gaps

- No UI for any Phase 8 feature (§17) — API + tests only.
- Finished-goods inventory/accounting remains **DEFERRED** — Production Output tracks `actualQty`/`rejectedQty`/`acceptedQty` operationally, but no accounting entry is posted for finished goods, per §9's explicit instruction not to invent that policy.
- Machine/process cost and overhead remain unmodeled in Production Cost (§7) — only Material and Labour are tracked, disclosed rather than guessed at.
- Delivery does not yet support more than one partial delivery per dispatch cleanly re-tested at volume (the domain guard exists — no second "Full" delivery — but multiple sequential partials weren't specifically volume-tested).
- Billing milestone amounts are still manually entered figures, not computed from contract percentages — the milestone *type* is structured (§19) but percentage-of-contract-value automation isn't built.

## 27. Business Decisions Required

Carried forward from Phase 7, **unchanged, not resolved, not guessed at** (§36):
1. **Inventory valuation**: Moving Average remains implemented; Standard Cost + Variance remains a possible alternative, not built.
2. **GRN over-receipt tolerance**: remains 0% (strict).

No new business-decision-required items were introduced this phase — Phase 8's execution/revenue chain didn't touch either open question.

## 28. Phase 8 Compliance Gate

| Requirement (§44) | Status |
|---|---|
| Manufacturing lifecycle | ✅ (extended, Phase 7-compatible) |
| BOM integration | ✅ (unchanged, reused) |
| Material issue | ✅ (unchanged, reused) |
| Production completion | ✅ (now distinguishes Partial/Complete) |
| Dispatch | ✅ (real readiness gate) |
| Delivery | ✅ |
| Installation | ✅ |
| QC | ✅ (defect found & fixed — now genuinely mandatory) |
| Snag | ✅ (real resolver≠verifier SoD) |
| Handover | ✅ (real 3-condition gate, e-sign disclosed pending) |
| Billing milestone | ✅ (not auto-triggered by execution events) |
| Customer invoice | ✅ (existing engine only) |
| AR | ✅ |
| Receipt | ✅ |
| Clearing | ✅ |
| Project closure readiness | ✅ (real 7-condition gate, override logged) |
| Project revenue | ✅ |
| Project cost | ✅ (unchanged from Phase 7) |
| Project profitability | ✅ (unchanged engine) |
| Document traceability | ✅ |
| Security | ✅ |
| SoD | ✅ |
| Audit | ✅ |
| Concurrency | ✅ (2 dedicated tests) |
| Volume testing | ✅ (50/100/100/100/100/100, zero errors) |
| Accounting reconciliation | ✅ (after the rounding fix) |
| Phase-5 regression | ✅ |
| Phase-6A regression | ✅ (44/44) |
| Phase-6B regression | ✅ (44/44) |
| Phase-7 regression | ✅ (43/43) |
| Original ERP untouched | ✅ |
| Online ERP untouched | ✅ |
| Lab isolated | ✅ |

**Gate result: PASS.**

---

Per §45: **stopping here.** Not starting Warranty, AMC, Service, Complaints, or CAPA. Waiting for the next instruction.
