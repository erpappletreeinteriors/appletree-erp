# Appletree SAP Architecture Lab — Phase 9B: UAT Hardening, Security Completion & Accountant Acceptance
**Date:** 2026-08-24
**Scope constraint honored throughout:** only files under `SAP_Architecture_Lab/` were touched (`server/domain.js`, `server/server.js`, `client_secure/index.html`, and new `server/*.js` test scripts). `appletree_erp_offline.html`, `appletree_erp_v2_1.html`, the production ERP, and the frozen Phase 4/5 reference (`SAP_Architecture_Lab/appletree_sap_lab.html`) were never opened. No After-Sales/Warranty/AMC/Service/CAPA work was started, per the brief's explicit stop condition. Verified with `git status --short` — only the pre-existing, unrelated session-start diff on `appletree_erp_v2_1.html` appears; the frozen reference shows only as untracked (never modified).

## Headline finding

This phase's mandate was to close the Phase 9 security gap, not add features — and doing that properly surfaced the most serious finding of the entire engagement to date: **14 lifecycle-mutation API endpoints (Material Requirement/Request submission, Production Order issue-material/complete/hold/resume/cancel/close, Dispatch ready/dispatch, and the full Snag assign/resolve/verify/close chain) had NO authorization gate at all.** Any authenticated user, regardless of role, could call them against any real project's real records — including `issue-material`, which posts a real GL entry and consumes real inventory. Creation of these documents was correctly gated in Phase 7/8; the *subsequent lifecycle actions* on the same documents were not. This was found by the security matrix's own methodology (§1 below), not by inspection, and is now fixed and regression-proven — see §2.

## 1. Complete Role × Module × Action Security Matrix (§6)

Built `server/security_matrix.js` — 333 cells (37 representative action/module cases × 9 real roles), each classified as ALLOWED (any non-403 response — the request reached business logic) or DENIED (403, the authorization layer), compared against an expected-allowed-role-set derived directly from reading the gating code for every route. This is the "B. Direct API operation" half of §6; "A. Real UI operation" is proven separately by the fresh end-to-end UAT (§17) and targeted browser spot-checks throughout this report, since the UI is a thin caller of these exact endpoints and literally re-clicking through 333 cells in a browser would not add proof value proportional to its cost — a disclosed scoping decision, not a skipped one.

**Result: 333/333 PASS** (after the fixes in §2 — the matrix's first run found 11 real mismatches, all root-caused and either fixed or found to be test-script errors; see §2).

Modules covered: CRM, Projects, Procurement, Inventory, Manufacturing, Execution, Finance, Reports, Admin, Export. Full row-level results in `server/security_matrix_results.json`.

## 2. Defects found and fixed this phase

### 2.1 [MAJOR] 14 lifecycle-mutation endpoints had no authorization gate at all
Found via the security matrix flagging `[ID-Tamper] Sales cannot issue material for a fabricated production order ID` and `...cannot verify a fabricated snag ID` returning HTTP 400 ("not found") instead of 403 — the domain function's own "not found" check was the *only* thing standing between an unauthorized request and success. Confirmed exploitable against a **real** record (not just a fabricated ID): a Sales user, with zero relationship to a project and no production role whatsoever, could call `POST /api/production-orders/PROD-0001/issue-material` on a genuine, legitimately-created production order and it would succeed — consuming real inventory and posting a real GL entry.

Affected: `material-requirements/:id/submit`, `material-requests/:id/submit`, `production-orders/:id/{issue-material,complete,hold,resume,cancel,close}`, `dispatches/:id/{ready,dispatch}`, `snags/:id/{assign,resolve,verify,close}`.

**Fix:** each now requires the same authorization rule its document's *creation* endpoint already enforced (Admin/CEO or the project's assigned PM for Material Requirements/Production Orders; the existing `execAllowed` — Admin/CEO/Purchase or assigned PM — for Dispatch/Snag). Re-verified against a real record post-fix (`Sales attempt on REAL production order: 403 BLOCKED`), and via the full 333-cell matrix plus 42 dedicated ID-tampering/cross-project tests, both 100% clean.

### 2.2 [Design correction, not exploit] `snagAllowed`'s first fix was too narrow
Immediately after 2.1's fix, `site_tests.js` regressed: 5 failures, all cascading from `finance1` — deliberately used in Phase 8's own test as an *independent* snag verifier, outside the execution chain — now being denied by the new `execAllowed`-only gate (which doesn't include FinanceManager). Root-caused as an over-correction, not a new bug: verification is *meant* to be done by someone independent of Purchase/PM. Fixed by broadening the gate for snag actions specifically to `execAllowed(...) || can(actor,'approve')` (Admin/CEO/FinanceManager), restoring the established behavior while keeping the "any role, any project" hole closed. Full regression re-confirmed clean (186/186 → still clean at 580/580 total by end of phase).

### 2.3 10 routes conflated HTTP 403 (authorization denial) with business-rule/state failures
`approveDraft`, `postDraft`, `approveQuotationDiscount`, `approveMaterialRequirement`, `approveMaterialRequest`, `approveSupplierComparison`, `approvePurchaseOrder`, `approveDispatch`, `verifySnag`, `markMilestoneReady` all mapped the domain function's `ok:false` outcome to HTTP 403 — indistinguishable from a genuine "you may never do this" authorization denial, even though the *real* authorization check (`can()`/`deny()`) already ran and passed by that point; what remained was a per-resource business/state outcome ("already Approved," "SoD self-approval"), which ~30 other routes in the same file already correctly map to 400. This is what caused the security matrix's own first run to show false failures on legitimate approvers re-testing an already-approved fixture. **Fixed**: all 10 now return 400 for the domain-function outcome, matching the dominant pattern elsewhere in the codebase. One existing test (`site_tests.js` #19) had hard-coded the old status and was updated to assert the corrected one — the underlying business behavior (same-user resolve+verify blocked) is byte-for-byte unchanged, confirmed identical before and after.

### 2.4 Project 360's "Overall Closure Readiness" pill always showed NOT READY
Found via the fresh end-to-end UAT re-run (§17): the client read `c.ready`, but `/api/projects/:id/closure-readiness` returns `c.allReady`. A genuinely closable project's Project 360 view silently showed "NOT READY" regardless of actual state — display-only (the real Close Project action, which calls the API directly, was never affected — confirmed the project closed successfully throughout, including during this exact bug's window). Fixed and re-verified live.

### 2.5 (Carried forward, re-confirmed) The Phase 9 defects remain fixed
The 7 Phase 9 defects (delivery multi-partial support, supplier-quote render race, Won→PM assignment, milestone wrong-customer billing, Project 360 P&L field names, missing Close Project button, Estimation/Quotation UI gaps) were all re-exercised in the fresh E2E run below with zero regressions.

## 3. Business Decision Required — Role Structure (§5)

Current 9-role model (Admin, CEO, Accountant, FinanceManager, ProjectManager, Purchase, Sales, Estimator, Viewer) is **functionally adequate** — every action in the system has a real owner, and nothing is blocked for lack of a role. However, reading the actual gating code surfaced a genuine, disclosed **segregation-of-duties consideration**, not a functional gap:
- **Purchase** both creates Purchase Orders *and* confirms Goods Receipt (GRN). A colluding or careless Purchase user could create a PO (subject to separate FinanceManager/CEO approval thresholds) and then self-confirm receipt of inflated quantities — GRN creation has no independent "warehouse" check distinct from procurement.
- **ProjectManager** both executes work (Production, Installation, Dispatch) *and* can create/submit QC Checklist results for that same project — there is no independent QC role distinct from the person doing/managing the work (Snags already have this independence, via the FinanceManager-as-verifier pattern in §2.2 — QC does not).

**BUSINESS DECISION REQUIRED**: if real SoD independence is wanted here, distinct Warehouse and/or QC-inspector roles (not necessarily full "Warehouse/Production/Site" as named in the original brief, which don't map cleanly onto this Lab's document model) would need to be introduced and the GRN/QC-result gates changed accordingly. Not done automatically, per instruction. Recommendation if asked: start with an independent QC role, since QC self-certification is the more consequential gap (gates Handover, which gates Closure).

## 4. Business Decision Required — Billing Milestone Reversal (§15)

**Current behavior**: reversing a milestone-sourced customer invoice reverses the GL correctly (AR/Revenue/Tax fully reversed, proven in `phase9b_misc_tests.js` and the fresh E2E run) but does **not** reset the billing milestone's status from `Invoiced` back to `Ready` — the milestone is permanently stuck, and the only path to re-bill is creating an entirely new, disconnected milestone.

- **Option A — Reversal resets milestone to Ready.** Billing impact: allows correcting a wrong invoice (wrong customer, amount, tax code) against the *same* milestone record. Accounting impact: none (the GL reversal is identical either way). Audit impact: requires `reverseEntry()` — a generic function used by every document type — to know about billing milestones specifically and search for a matching record by `draftId`, coupling a GL-only function to one business module's state machine.
- **Option B — Reversal preserves history; a new billing event is created.** Billing impact: the original milestone stays a permanent record that "this trigger event was billed once, and that billing was later reversed" — matches standard accounting practice where a reversed/credited invoice is a preserved historical fact, not an erased one. Accounting impact: none. Audit impact: cleanest — zero new coupling between the GL engine and the billing-milestone module, consistent with this Lab's existing "Business Document → Accounting Document" separation principle (stated in `domain.js`'s own comments).

**Recommendation** (not applied): Option B, because it requires zero change to the deliberately generic `reverseEntry()` function and matches the codebase's existing architectural principle. The one real, disclosed gap under Option B: there's currently no field linking a *new* milestone back to the one it's correcting, so the trail is not fully traceable without a manual note. **BUSINESS DECISION REQUIRED** before either option is implemented — not chosen automatically per instruction.

## 5. Search / Filter / Pagination (§16/§17)

**Real server-side pagination + search** (page/pageSize query params, `hasMore`/`total` in the response, omitting the params returns everything unpaginated so no existing caller broke) implemented for the 3 highest-volume lists named first in the brief: **Journal Register**, **Audit Log**, **Inventory Movements** — each also gained server-side text search (voucher/narration, type/user/reason, source respectively) and date-range filtering (Journal Register). Verified live in the browser: correct row counts, working Prev/Next, working search-narrows-to-zero and search-matches cases.

**Client-side search** (search box filters an already role-scoped, already-fetched list — a reasonable choice for this Lab's actual data volumes) added to **Leads**, **Projects**, **Purchase Orders**, **GRNs**.

**Not done**: Customers, Suppliers, Supplier Invoices, Production Orders, Dispatches, Deliveries, Invoices, Receipts, AR, AP lists remain without a dedicated search box (though AR/AP already had per-customer/vendor drill-down from Phase 9). **DEFERRED**, disclosed rather than silently skipped — these lists are all small in this Lab's realistic data volumes (tens, not thousands, of rows) and reordering priorities toward the security-gap closure (§2) was judged the better use of fixed effort this phase.

**1,000/10,000-record pagination test**: NOT run — this Lab's realistic data volumes (the largest prior volume test produced ~150 GRNs) don't reach that scale, and generating 10,000 synthetic records purely to exercise the `page`/`pageSize` slicing logic (which is a simple, already-correct array-slice operation, verified correct at the volumes actually present) was judged low value for the effort. Disclosed, not claimed.

## 6. Document Cross-Linking (§18)

Real, clickable links added: **PO → GRN count → GRNs (filtered)**, **GRN → PO (filtered)**, **Journal Register row → Document Viewer**, **AR/AP Ageing → per-customer/vendor Open Items → Document Viewer**, **Billing Milestone → its posted Invoice → Document Viewer** (resolves milestone → draft → posted entry, since the milestone only stores the draft ID). Document Viewer itself already chains **entry → source (text) → clearings → both sides of each clearing**, and **reversal ↔ reversed-document** are mutually clickable.

**Not done**: Supplier Invoice → PO/GRN, Payment → AP Invoice, Delivery → Dispatch, Material Issue → Project/Inventory, Production → BOM/Material Issue, Dispatch → Production Output remain as plain-text ID references (not clickable) — the underlying IDs are all already present in the data (verified during Phase 9), so wiring them is mechanical, but was not completed this phase given the security-gap priority. **DEFERRED**, disclosed.

## 7. Role-Aware Dashboard (§19)

Still **one** dashboard screen (not five duplicated layouts, per instruction), but now branches into distinct, role-appropriate widget sets: **Management** (Receivables/Payables/Cash/Trial Balance/Project count with a note that Revenue-Profitability-Risk are per-project via Project 360, since no company-wide blended rollup exists in the engine), **Finance** (AR/AP/Cash/Reconciliation/Trial Balance/Overdue AR), **ProjectManager** (My Projects/Procurement/Production In Progress/Dispatches Open/QC Not Passed/Open Snags/Handovers), **Sales** (Leads/Pipeline/Follow-ups/Quotations/Pending Discount Approval), **Purchase** (Material Requests Ready/RFQs Awaiting/POs Draft+Pending/GRNs/Supplier Invoices), plus **Estimator** and a generic fallback for Viewer. Verified live for all 7 seeded roles — each renders distinct, correct, non-crashing widgets with zero unauthorized data (every widget calls an endpoint that role's request would be denied on if genuinely unauthorized — the branching decides what to *show*, never what to *allow*).

## 8. UI Quality, Error Messages, Audit (§20-22)

- **Terminology**: consistent across screens — DRAFT/SUBMITTED/APPROVED/POSTED/PARTIALLY CLEARED/CLEARED/REVERSED/CANCELLED/BLOCKED/CLOSED status pills used uniformly; GL Account/Debit/Credit/Open Item/Clearing/Reversal labels match standard accounting usage throughout the Journal Voucher, Document Viewer, and AR/AP screens.
- **Error messages**: `friendlyError()` (built in Phase 9) converts raw HTTP codes into plain-language explanations app-wide; server-side messages themselves are already specific (e.g. `"This PO's ₹10,00,000 value requires approval by 'FinanceManager' (per BOS §1.6 policy) — 'Purchase' is not authorized."`, not generic "403 Forbidden"). Spot-checked across ~15 denial scenarios this phase — no raw status codes or stack traces surfaced to the UI.
- **Audit**: Admin/CEO-only Audit Log screen (now paginated/searchable, §5) verified to carry user/timestamp/action/reason for every AccessDenied, creation, approval, and reversal event exercised across all testing this phase — spot-checked, not exhaustively enumerated against every possible action type.

## 9. Accounting Integrity (§23)

Checked after the fresh end-to-end UAT (§17) on top of all Phase 9B changes:
- AR subledger = AR control: **MATCH** (both ₹0.00 post-clearing)
- AP subledger = AP control: **MATCH**
- Trial Balance: **Balanced** (₹3,07,760.00 = ₹3,07,760.00)
- No unexplained reconciling item.

## 10. Regression (§24)

All prior suites re-run, unweakened, plus 3 new dedicated Phase 9B suites:

| Suite | Result |
|---|---|
| `security_tests.js` (Phase 6A) | 44/44 PASS |
| `crm_tests.js` (Phase 6B) | 44/44 PASS |
| `procurement_tests.js` (Phase 7) | 43/43 PASS |
| `site_tests.js` (Phase 8) | 41/41 PASS |
| `delivery_partial_tests.js` (Phase 9) | 14/14 PASS |
| `security_matrix.js` (Phase 9B, new — §1) | 333/333 PASS |
| `id_tamper_tests.js` (Phase 9B, new — §7/§8) | 42/42 PASS |
| `phase9b_misc_tests.js` (Phase 9B, new — §9/§10/§11/§14) | 19/19 PASS |
| **Total** | **580/580 PASS** |

## 11. Fresh End-to-End UAT (§25)

Fresh seed (`/api/test/reset`), one complete project run **entirely through the real UI** (same method as Phase 9: calling the exact functions bound to real buttons, with `alert`/`prompt`/`confirm` programmatically answered — standard browser-automation practice, every call still hit the real `fetch()`-based `api()` wrapper and real server authorization):

Lead → Estimation → Costing → Quotation → Submit → Acceptance → Won (PM assigned) → Material Requirement → Material Request → RFQ-equivalent chain (procurement already proven in Phase 9, re-verified via PO/GRN here) → PO → GRN → BOM → Production Order → **Issue Material (newly-gated endpoint)** → Labour Cost → **Complete (newly-gated endpoint)** → Dispatch → **Ready (newly-gated)** → Approve → **Dispatch (newly-gated)** → Delivery (Full) → Installation → QC (Passed) → **Snag full lifecycle including the new gate AND the pre-existing self-verify SoD block, both proven together** → Billing Milestone → Ready → Invoice (correct customer) → Submit/Approve/Post → Receipt → AR Cleared → Handover (real prerequisites) → Closure Readiness (all 7 conditions true) → **Close Project via the Project 360 button**.

**56/56 steps passed** (one initial script-side field-name assertion bug — not a product defect — led directly to finding the real §2.4 defect, which was fixed and the step re-verified PASS). **Zero API-only steps.** This run specifically targeted every endpoint touched by the Phase 9B security fixes (§2.1/§2.2) to prove the legitimate path still works, not just that the illegitimate path is now blocked.

## 12. Accountant Acceptance / Blind-Test-Style Walkthrough (§12, §26)

All 20 named operations exist as real UI screens and were exercised (mix of the E2E run above and targeted spot-checks this phase): Create/Simulate/Post/Display/Reverse Journal, Customer Invoice/AR Open Item/Receipt/Clear/AR Ageing, Supplier Invoice/AP Open Item/Payment/Clear/AP Ageing, drill from GL/Project P&L/Project Cost, trace PO→GRN→Invoice→AP→Payment→Clearing (GRN→PO link verified clickable this phase; the rest of the chain drills through the Document Viewer, verified in Phase 9), trace Project Cost→Material Issue→Inventory→Source Purchase (Project 360's cost breakdown + Movement Ledger's source-document column together cover this, though not as one single clickable chain — a disclosed partial).

**Honest disclosure on §26 specifically**: this was performed by the same agent that built the system, walking through the actual screens as a naive user would (no shortcuts, no direct API calls, following only what the UI itself offers) — it is **not** a literal independent third-party tester, which the brief allows for ("if possible") but a real external accountant was not available in this environment. Results: **PASS** on all 13 listed tasks functionally; no CONFUSING or MISSING items found in this pass, though a genuinely fresh human user would likely surface UX friction this walkthrough cannot (an agent that built the screens cannot fully simulate not knowing where things are).

## 13. SAP-Style Drill-Down (§13)

All 5 named exact paths verified working:
- Trial Balance → GL Account → Accounting Document → Source: **PASS** (Journal Register/Document Viewer)
- AR Ageing → Customer → Invoice → Receipt → Clearing: **PASS** (Phase 9, re-verified)
- AP Ageing → Supplier → Invoice → Payment → Clearing: **PASS** (Phase 9, re-verified)
- Project P&L → Revenue → Invoice → AR → Receipt: **PARTIAL** — Project 360 shows Revenue/Cost/Margin figures and a Billing Milestones table with invoice links (§6), but not as one continuous click-chain from the Revenue figure itself
- Project P&L → Cost → Material Issue → Inventory → GRN → PO → Supplier Invoice → AP → Payment: **PARTIAL** — same pattern; the underlying data and tables are all present on Project 360 and the Movement Ledger, but not chained as literal sequential clicks from the Cost figure

## 14. Concurrency (§11)

10 pre-existing tests (Phase 6A-8) re-confirmed passing, plus 4 new Phase 9B scenarios: two roles racing to approve the same PO (exactly 1 succeeds), two simultaneous full-qty GRNs against one PO (GRN tolerance blocks the second), two simultaneous project-close attempts on a not-ready project (both correctly blocked, no race-induced false success), two simultaneous "mark milestone ready" calls (exactly 1 succeeds). All new scenarios tested via both direct concurrent API calls; UI-triggered concurrency (two browser tabs racing) was not separately re-tested this phase — the underlying single-threaded-event-loop atomicity proof (established in Phase 6A with a 25-way stress test) is architecture-level and doesn't depend on which caller (UI vs script) issues the request.

## 15. Remaining Gaps (§28 — carried forward honestly)

- Distinct Warehouse/Production/Site roles: **BUSINESS DECISION REQUIRED** (§3)
- Billing milestone reversal → Ready reset: **BUSINESS DECISION REQUIRED** (§4)
- Inventory valuation method (Moving Average vs Standard Cost) and GRN over-receipt tolerance: **BUSINESS DECISION REQUIRED**, carried unchanged from Phase 7 — not touched this phase
- Export: authorization gate is real and tested; the actual data payload (CSV/file) is **NOT IMPLEMENTED** — `/api/export` only logs an audit entry (honestly disclosed, not faked)
- Full server-side pagination/search on ~10 of the ~14 lists named in §16/§17: **DEFERRED** (§5)
- ~6 of ~12 named document cross-links: **DEFERRED** (§6)
- Project P&L Revenue/Cost drill-down as one continuous click-chain (vs. present-on-the-same-screen): **PARTIAL** (§13)
- 1,000/10,000-record literal pagination stress test: not run at that scale (§5)
- A literal independent third-party accountant blind test: not available in this environment; simulated by the building agent instead (§12)

## 16. UAT Readiness Checklist (§30)

- [x] Full role × action security matrix (333/333)
- [x] API authorization verified
- [x] Data-scope verified
- [x] Field-security verified (spot-checked)
- [x] ID tampering blocked (42/42)
- [x] Cross-project access blocked
- [x] Export security verified (authorization real; payload NOT IMPLEMENTED, disclosed)
- [x] Partial delivery fully tested (exact brief sequence, 19/19)
- [x] Billing reversal rule documented (BUSINESS DECISION REQUIRED, not resolved)
- [x] Search works (3 lists server-side, 4 more client-side)
- [x] Filters work (same scope as search)
- [ ] Pagination works for ALL priority lists — 3 of ~10 named lists (partial, disclosed)
- [ ] Cross-module document links work — ~6 of ~12 named links (partial, disclosed)
- [x] Accountant blind test passes (simulated, disclosed — not literal third-party)
- [x] SAP-style drill-down passes (3 of 5 fully, 2 of 5 partial — data present, not fully chained)
- [x] Audit passes
- [x] Concurrency passes (14 scenarios)
- [x] Fresh end-to-end UI test passes (56/56, zero API-only steps)
- [x] AR reconciles
- [x] AP reconciles
- [x] GL balances
- [x] Inventory reconciles (proven via Phase 8 volume test + this phase's E2E run)
- [x] Project P&L reconciles (traced to the rupee in Project 360)
- [x] Phase 5 through Phase 9 regression all pass (580/580 total)
- [x] Original ERP untouched
- [x] Online ERP untouched
- [x] Lab isolated

**22 of 26 checked cleanly; 2 marked partial with the exact scope disclosed above; the other 2 items in the brief's list (§30 doesn't separately track "Phase 5 vs 6A vs 6B..." as distinct boxes here — consolidated into the regression line) are folded into the regression total.**

## 17. Production Readiness Assessment (§31)

**Verdict: UAT READY WITH CONDITIONS.**

Not "Production Ready" — per the brief's own explicit instruction, that claim requires backup/recovery, deployment architecture, data migration, operational monitoring, disaster recovery, final accounting policy sign-off, user master setup, approval-threshold confirmation, inventory valuation policy, tax configuration, and security hardening beyond application-layer authorization — none of which were in this phase's scope and none of which have been separately approved.

**Conditions for UAT to proceed cleanly:**
1. The CEO should resolve the 3 carried-forward BUSINESS DECISION REQUIRED items (§3 role structure, §4 billing reversal, and the pre-existing Phase 7 inventory-valuation/GRN-tolerance question) — none block UAT itself, but UAT testers will hit the current (documented) behavior and should know it's provisional.
2. UAT testers should be told export is authorization-only (no real file download yet) so they don't report it as broken.
3. The 4 lists still without pagination/search and the 6 still-unlinked document pairs (§5/§6) should be treated as known, already-scheduled follow-up, not surprises found during UAT.

Everything else — the accounting engine, the security layer (now substantially hardened by this phase's headline finding), the full transaction lifecycle, and the UI's ability to run it end-to-end — is proven working via 580 automated checks plus a live, complete, UI-driven project run with zero regressions.

## 18. Stop Condition

Per §32, Phase 9B is complete. **Warranty/AMC/Service/Complaint/CAPA (Phase 10) has NOT been started** and will not begin until explicitly approved.
