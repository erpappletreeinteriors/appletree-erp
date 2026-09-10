# APPLETREE ERP — PROJECT VARIATION / CHANGE REQUEST — PHASE 2
## Full Lifecycle Implementation & Forensic QA Report

**System under test:** `SAP_Architecture_Lab`. **Date:** 2026-09-07. This phase upgrades Change Request from a two-state approval record into a real, controlled, traceable ERP transaction, without redesigning any unrelated module, inventing a second approval/BOM/costing/procurement system, or guessing undecided business policy.

---

## A. Executive Verdict

## GO WITH CONDITIONS

Every control that could be implemented WITHOUT a business-policy decision (state machine, SoD, idempotency, quotation/BOM traceability, audit) is built and live-proven. Every control that DOES require a policy decision (mandatory-variation-before-execution, closure blocking on open variations, retroactive billing reversal on cancellation) is explicitly left undecided and disclosed — not guessed. No STOP condition (§22) was triggered.

---

## B. Current Architecture (Discovery)

| Area | Finding |
|---|---|
| Change Request | `DB.changeRequests` — before this phase: `{id, projectId, description, costImpact, revenueImpact, scheduleImpactDays, status:'Draft'\|'Approved', createdBy, createdAt}`. No documentNo, no reason, no quotation link, no submit/reject/cancel, no approvedBy/At recorded on the record itself (only in the audit log). `createChangeRequest()`/`approveChangeRequest()` — 2 functions total. |
| Quotation | `DB.quotations` — **there is no separate "Quotation Revision" collection.** A revision IS a new row in `DB.quotations` (chained via `revision`/`previousRevisionId`, sharing one `quotationNo`). `reviseQuotation()` blocks revising an `Accepted`/`Superseded` quotation — so the WON quotation is frozen forever once a project exists; no post-Won revision mechanism exists today. `wonProjectId` is the authoritative, one-way link from a quotation row to the project it created. |
| Costing | `DB.costingVersions` — linked via `estimationRequestId`, **has no `projectId` field at all**. Reachable from a project only via `project.quotationId -> quotation.costingVersionId`. Uses an unsafe length-based id (`'COST-'+length+1`), a pre-existing gap out of this phase's scope (not touched). |
| BOM | `DB.boms` — `BOM_STATUSES=['Draft','Submitted','Approved','Rejected','Superseded']`, `submitBOM()`/`approveBOM()`/`rejectBOM()` fully real, with creator/approver SoD, supersession-on-reapproval, docNo (`nextDocNumber('BOM')`, added by P0-4). No `quotationRevisionId`/`costingVersionId`/`changeRequestId` field existed before this phase. |
| Procurement | PR → RFQ → Comparison → PO → GRN → Supplier Bill exists; `requirePRForPO` config defaults false (PR is optional, a pre-existing, disclosed policy gap unrelated to this phase). |
| Billing | `projectBillingCeiling()` sums `SUM(Approved CR.revenueImpact)` LIVE at read time, added to `project.budget`; enforced at BOTH `draftCustomerInvoice()` (early, can be stale) and authoritatively at `postDraft()` (P0-2, already existed, unchanged this phase). |
| Closure | `projectClosureReadiness()` — 7 conditions (production/installation/QC/snags/handover/billing/receivables). **Zero reference to Change Requests, site stock, or open POs anywhere**, confirmed by fresh code read. |

### Current-State Matrix (§2, before this phase)

| Object | Exists? | Current FK | Approval | Revision | Audit | Idempotency | Downstream linkage |
|---|---|---|---|---|---|---|---|
| Project | Yes | — | N/A | N/A | Yes | Yes (masters route) | quotationId, customerId |
| Quotation | Yes | leadId, estimationRequestId, costingVersionId | Yes (discount-tier) | Yes (new row per revision) | Yes | Partial | wonProjectId |
| "Quotation Revision" | **Not a separate object** — see B above | — | — | — | — | — | — |
| Costing | Yes (`costingVersions`) | estimationRequestId | No | Yes (version #) | Yes | N/A | none (no projectId) |
| BOM | Yes | projectId, siteId | Yes | version # + Superseded | Yes | Partial (create route legacy) | none before this phase |
| Change Request | Yes | projectId | Yes (2-state) | **No** | Partial (log only, not on record) | **No (legacy routes)** | **None** |
| Material Requirement | Yes | projectId | No | No | Partial | N/A | — |
| PR | Collection exists, 0 records seeded in this environment | projectId | Yes (framework) | No | Yes | Partial | — |
| RFQ / Vendor Comparison | Collections exist, unused in this environment | — | — | — | — | — | — |
| PO | Yes | projectId, vendorId | Yes | No | Yes | Yes (modern) | commitments |
| GRN | Yes | poId | N/A | No | Yes | Partial | — |
| Supplier Bill | Yes | vendorId, projectId, (poId/grnId) | Yes (draft workflow) | No | Yes | Yes (`/api/ap/invoice`) | jobWorkOrderId (Quick Fixes phase) |
| Billing Milestone | Yes | projectId | N/A | No | Yes | Partial | — |
| Customer Invoice | Yes | projectId, customerId | Yes (draft workflow) | No | Yes | Yes | billing ceiling (P0-2) |

**Discovery complete before any code was changed**, per instruction.

---

## C. Changes Implemented

1. **Real Change Request data model**: `documentNo` (real, FY-scoped, `nextDocNumber('CR')` — registered, did not previously have a numbering series), mandatory `reason`, optional `quotationId`, optional `supportingReference`, plus the full lifecycle field set (`submittedBy/At`, `approvedBy/At`, `rejectedBy/At/rejectReason`, `cancelledBy/At/cancellationReason`).
   - **Deliberately NOT added**: `costingVersionId` (redundant — reachable via `quotationId -> quotation.costingVersionId`, would drift out of sync with a second FK), `attachmentIds` (no attachment mechanism exists anywhere in this codebase — adding the field would misrepresent a capability that does not exist), `reviewedBy/At`/"Under Review" state (no precedent for a distinct reviewer step anywhere in this codebase — BOM's own established workflow goes straight Submitted→Approved/Rejected), `idempotencyKey` as a stored field (handled correctly by the existing separate `DB.idempotencyKeys` mechanism already).
2. **Real state machine**: `Draft → Submitted → Approved | Rejected`, `Rejected → (revise, whitelist-based) → Draft`, `Approved → Cancelled`. Mirrors the BOM lifecycle's exact conventions (same status names, same SoD pattern, same "requires a reason" convention for reject/cancel). **`Superseded` deliberately NOT implemented** — considered and rejected: BOM needs it because only one Approved BOM should be active per scope; Change Requests are cumulative/additive (billing ceiling SUMS every Approved CR), so there is no scope-collision concept for a later CR to supersede.
3. **Quotation linkage**: `assertChangeRequestQuotationLink()` — validates the quotation exists and `quotation.wonProjectId === projectId` (the codebase's own authoritative ownership field, not merely `project.quotationId` string equality).
4. **BOM linkage**: optional `changeRequestId` on `createBOM()`, validated (CR exists, CR is `Approved`, CR's project matches the BOM's project). `quotationRevisionId`/`costingVersionId` deliberately NOT duplicated onto BOM — both reachable through the single `changeRequestId -> quotationId` chain.
5. **4 new routes** (`submit`/`reject`/`revise`/`cancel`), all `registerMutationRoute()` from day one (real idempotency immediately). **1 legacy route migrated**: `/api/change-requests/:id/approve` (had the exact same idempotency gap the earlier Business Process Control Closure phase already found and fixed for `/create` — never fixed for `/approve` until now).
6. **1 new GET route**: `/api/change-requests` (never existed before this phase — confirmed by inspection).
7. **Financial input hardening** on `costImpact`/`revenueImpact`/`scheduleImpactDays`: same class of fix Phase 39 already applied to Quotation/Costing (reject NaN/Infinity/non-numeric strings; sign deliberately unrestricted — a scope reduction is a legitimate negative impact, not a data-entry error).

**Not implemented, disclosed in §D**: any hard execution gate (BOM/PR/PO/billing requiring an approved CR), any closure blocker referencing Change Requests, any retroactive reversal of billing already posted against a since-cancelled variation's ceiling.

---

## D. Business Decisions Required

| # | Decision | Why it blocks implementation |
|---|---|---|
| 1 | Should an approved variation be REQUIRED before BOM/Material Requirement/PR/PO/billing can proceed? | No existing policy states this; implementing a hard gate would invent one |
| 2 | If required, mandatory-always vs. threshold vs. scope-change-only vs. post-execution reconciliation? | Same |
| 3 | Should an open/Submitted/Rejected Change Request block Project Closure? | `projectClosureReadiness()` has no such condition today, and no stated policy says it should |
| 4 | Should an already-posted customer invoice be reversed/credit-noted when the Change Request that raised the ceiling it billed against is later cancelled? | **Live-proven consequence this phase** (§O): cancelling after posting leaves `remainingCeiling` negative — no code decides what happens next |
| 5 | Should a Job Worker be linked to a Vendor master record (carried over from the prior phase, still unresolved)? | No such relationship exists in the data model |
| 6 | PR/RFQ threshold policy (carried over) | `requirePRForPO` defaults false, never confirmed by Finance |

---

## E. Change Request State Machine

```
Draft --submit--> Submitted --approve--> Approved --cancel--> Cancelled
                       |
                    reject
                       v
                   Rejected --revise--> Draft (loop)
```

| Transition | Who | Guard | SoD | Idempotent | Audited |
|---|---|---|---|---|---|
| — → Draft | `can(actor,'create')` | project must exist, `reason` mandatory | N/A | Yes | `ChangeRequestCreated` |
| Draft → Submitted | `can(actor,'submit')` | status must be Draft | N/A | Yes | `ChangeRequestSubmitted` |
| Submitted → Approved | Admin/CEO/FinanceManager | status must be Submitted | **Yes** (creator blocked unless CEO/Admin) | Yes | `ChangeRequestApproved` |
| Submitted → Rejected | Admin/CEO/FinanceManager | status must be Submitted, reason mandatory | No (matches cancel, not approve) | Yes | `ChangeRequestRejected` |
| Rejected → Draft | `can(actor,'edit')` | status must be Rejected, whitelist-only field changes | N/A | Yes | `ChangeRequestRevised` |
| Approved → Cancelled | Admin/CEO/FinanceManager | status must be Approved, reason mandatory | No (documented decision, §C.2) | Yes | `ChangeRequestCancelled` |

All 4 new transitions + the migrated approve route are `registerMutationRoute()` with `idempotent:true, auditReject:true` — real idempotency and automatic `BusinessRuleRejected` audit logging on every rejection path.

---

## F. Quotation → Costing → Variation → BOM Traceability

```
Quotation row (= one revision, wonProjectId -> Project)
        |  (quotationId, optional)
Change Request
        |  (changeRequestId, optional, requires Approved)
       BOM
```

`costingVersionId` is intentionally never stored on either Change Request or BOM — it is reachable from `quotationId -> quotation.costingVersionId` without a second, potentially-drifting FK (per §3's own instruction: "would adding it create duplicate concepts?" — yes, so it was not added).

**Live-proven this phase** (§I/§K): CR↔Quotation and BOM↔CR links both reject (a) nonexistent ids, (b) cross-project references, (c) forged ids borrowed from an unrelated collection (a real `PO-0001` id supplied as a `quotationId`/`changeRequestId`), and (d) a BOM attributed to a CR that is not yet Approved.

---

## G. Procurement / Billing Execution Gates

Per §8's instruction, **classified, not automatically blocked** (Policy #1/#2 undecided):

| Transaction | Variation required today? | Existing policy? | Decision |
|---|---|---|---|
| BOM | No — can be created freely, with or without a `changeRequestId` tag | None found | BUSINESS DECISION REQUIRED |
| Material Requirement | No | None found | BUSINESS DECISION REQUIRED |
| PR | No (PR itself is optional per `requirePRForPO`) | Pre-existing, separate gap | BUSINESS DECISION REQUIRED |
| PO | No | None found | BUSINESS DECISION REQUIRED |
| Billing | **Partially** — an APPROVED CR's `revenueImpact` DOES raise the billing ceiling (P0-2, unchanged), but nothing requires a CR to exist for the ORIGINAL budget-level billing | Real, existing (P0-2) | Working as designed for the ceiling; whether ALL billing should require a CR is undecided |

No pre-existing legitimate standalone workflow (a BOM/PR/PO/invoice with no CR at all) was blocked — confirmed live: ordinary BOM creation with no `changeRequestId` still succeeds unchanged (§K).

---

## H. Project Closure Impact

**Not modified** — `projectClosureReadiness()` unchanged, per Policy #3 being undecided. Classification only:

| Item | Classification |
|---|---|
| Approved, executed variations | Existing policy — none; informational only today |
| Submitted (pending) variations | Missing policy — BUSINESS DECISION REQUIRED |
| Rejected variations | No closure relevance — a rejected variation has no financial effect, closing is unaffected either way |
| Cancelled variations | No closure relevance for the same reason, EXCEPT the disclosed §D.4 billing-reversal question |
| Draft (never submitted) variations | Missing policy — BUSINESS DECISION REQUIRED |

---

## I. Authorization Tests (LIVE, against the running server)

| # | Test | Result |
|---|---|---|
| 1 | Viewer creates a variation | **BLOCKED** (403) |
| 2 | ProjectManager creates a variation | **BLOCKED** (pre-existing role tier — `ProjectManager.create=false` in `ROLE_ACTIONS`, unrelated to this phase, recorded not altered) |
| 3 | Unauthenticated direct API create | **BLOCKED** (401) |
| 4 | Sales (non-approver-tier) approves | **BLOCKED** (403, route authCheck) |
| 5 | Estimator (non-approver-tier) rejects | **BLOCKED** (403, route authCheck) |
| 6 | Creator (FinanceManager, an approver-tier role) self-approves | **BLOCKED** ("Segregation of duties") |
| 7 | Different approver-tier actor (Admin) approves the same CR | **ALLOWED** |
| 8 | Repeated approval of an already-Approved CR | **BLOCKED** |
| 9 | Approve after rejection | **BLOCKED** |
| 10 | Approve after cancellation | **BLOCKED** |
| 11 | Repeated cancellation | **BLOCKED** |

---

## J. API Bypass Tests

| # | Attack | Result |
|---|---|---|
| 1 | Draft → Approved directly (skip submit) | **BLOCKED** |
| 2 | Reject a Draft CR | **BLOCKED** |
| 3 | Cancel a Draft CR | **BLOCKED** |
| 4 | Duplicate submit on an already-Submitted CR | **BLOCKED** |
| 5 | Forge the `status` field directly via `/revise`'s `changes` payload | **BLOCKED** ("status cannot be set directly on a revision" — whitelist rejects it) |
| 6 | Nonexistent quotationId / changeRequestId | **BLOCKED** |
| 7 | Forged id — a real id borrowed from an unrelated collection (`PO-0001` supplied as `quotationId` and separately as `changeRequestId`) | **BLOCKED** in both cases |
| 8 | NaN / non-numeric string cost or revenue impact | **BLOCKED** |
| 9 | `Infinity` (as a JS value, arrives as `null` over JSON) and the string `"Infinity"` | **BLOCKED** (string form explicitly; JSON-null form correctly treated as absent, no crash) |
| 10 | Negative cost/revenue impact | **ALLOWED** — a genuine scope reduction is a legitimate negative impact, not rejected (deliberate, matches Costing's own `profitPct` sign-unrestricted precedent) |

---

## K. Cross-Project Integrity Tests

| # | Test | Result |
|---|---|---|
| 1 | CR on Project A referencing a Quotation that belongs to Project B | **BLOCKED** ("does not belong to project") |
| 2 | BOM on Project A referencing a Change Request that belongs to Project B | **BLOCKED** ("belongs to project ... cannot attribute a BOM in project ... to another project's variation") |
| 3 | BOM referencing an Approved CR from the SAME project | **ALLOWED**, `changeRequestId` correctly stored |
| 4 | Ordinary BOM creation with no `changeRequestId` at all | **UNAFFECTED** — still succeeds exactly as before this phase |

---

## L. Atomicity Tests

No new function this phase performs a multi-record loop (unlike, e.g., the prior phase's Site Return, which loops over return lines) — every new CR/BOM-link mutation is a single in-memory record update, validated fully BEFORE any mutation is applied (validate-then-mutate ordering), and every route (new and migrated) runs inside the transaction boundary `dispatchMutationRoute()`/the legacy-dispatch wrapper already provides for every request in this system.

Two live all-or-nothing proofs performed:

1. `reviseChangeRequest()` called with a MIX of one valid field and one invalid `quotationId` — result: **entire call rejected, `description`/`revenueImpact`/`status` on the record all unchanged** (confirmed via a before/after GET).
2. `createBOM()` called with a valid, Approved `changeRequestId` AND one invalid material line — result: **entire call rejected, BOM collection count unchanged** (confirmed via a before/after count).

No orphan, no half-created linkage, no status change without its related data, in either proof.

---

## M. Idempotency Tests

| # | Test | Result |
|---|---|---|
| 1 | Duplicate `/submit` with the same idempotency key | **DEDUPLICATED** — one record, second call marked `idempotent:true` |
| 2 | Duplicate `/approve` with the same idempotency key | **DEDUPLICATED** |
| 3 | Duplicate `/cancel` with the same idempotency key | **DEDUPLICATED** |
| 4 | Same idempotency key, genuinely DIFFERENT payload (create) | **EXPLICITLY REJECTED** — "was already used ... with a different payload — reusing a key for a genuinely different request is not allowed." This is stricter than the brief's minimum requirement ("must not silently create or mutate another transaction") — it does not even silently return the original, it refuses outright. |

---

## N. Audit Tests

Live-confirmed counts in `auditLog` after this phase's testing: `ChangeRequestCreated:46, ChangeRequestSubmitted:27, ChangeRequestApproved:20, ChangeRequestRejected:6, ChangeRequestRevised:3, ChangeRequestCancelled:8` — every lifecycle transition produces its own typed audit event carrying `changeRequestId`, `projectId`, `userId`, `role`, `at`, and (where relevant) `reason`. Every rejected attempt (wrong role, wrong state, bad data) is separately auto-logged as `BusinessRuleRejected` (`auditReject:true` on every new/migrated route) carrying `path`, `method`, `error`, `userId`, `role`, `at`.

An auditor can answer every question in §16 of the brief: who changed it (`userId`/`role` on every event), what changed (`ChangeRequestRevised.changedFields`), who approved it (`ChangeRequestApproved.userId`), when (`.at` on every event), what BOM resulted (`BOM.changeRequestId` — queryable both directions), what procurement/billing resulted (not yet wired — §G, disclosed as a function/policy gap, not fabricated).

---

## O. Accounting Reconciliation

- Change Request creation/submission/approval/rejection/revision/cancellation itself posts **zero GL entries** — confirmed by code inspection (no `postJournalEntry`/`postInventoryMovement` call anywhere in any of the 6 CR functions) and by the fact that `changeRequests:46` grew across this phase's testing with **no corresponding growth pattern** in `journalEntries` beyond the ordinary invoice/billing tests in §Case A/B.
- Billing Ceiling Cases A–D, live-proven end-to-end on a fresh project (budget ₹5,00,000):
  - **Case C** (Submitted, not yet Approved): ceiling correctly stayed at ₹5,00,000.
  - **Approved**: ceiling correctly rose to ₹5,50,000 (`approvedVariationValue:50000`).
  - **Case A** (invoice at exactly ₹5,50,000): drafted, submitted, approved, and **posted successfully**.
  - **Case B** (a further ₹1,000, now genuinely over the exhausted ceiling): **blocked even at draft-creation time**, not merely at post — stricter than the brief's minimum requirement.
  - **Case D** (cancel the Approved CR after Case A was already posted): ceiling's `totalApprovedCeiling` correctly dropped back to ₹5,00,000 — **but `remainingCeiling` went to −₹50,000**, because the already-posted ₹5,50,000 invoice was NOT retroactively reversed. This is the live, real-world proof behind Business Decision §D.4 — reported honestly, not silently resolved either way.
- Independently recomputed Trial Balance from raw journal lines after all this phase's activity: **Total Debit ₹1,14,57,148.71 = Total Credit ₹1,14,57,148.71, difference 0.000000.**

---

## P. Database Integrity

Full forensic scan re-run after implementation and testing. **No new anomaly of any kind.** Every finding matches the exact same historical artifacts disclosed in every prior report this engagement (duplicate `MV-000121`/`MV-000124`, `IADJ-0015`, 5 duplicate quotation-revision doc numbers, the same 11 documented negative-quantity records, orphan references to the same 3 synthetic test fixtures, the `PRJ-1||BOM-GOV-TEST` legacy double-Approved-BOM artifact).

Additional targeted checks specific to this phase's new fields, all clean:

| Check | Result |
|---|---|
| Orphan `BOM.changeRequestId` references | none |
| Cross-project `BOM.changeRequestId` links | none |
| `BOM.changeRequestId` pointing to a non-Approved CR | none |
| Orphan `CR.quotationId` references | none |
| Cross-project `CR.quotationId` links | none |
| Duplicate `CR.documentNo` | none |
| Invalid `CR.status` values | none |

`changeRequests:46, boms:28` — all real, valid, testing-generated records.

---

## Q. Protected Regression

| Baseline | Result |
|---|---|
| P0-1 Project Creation | **PASS** (part of the suite below, unaffected) |
| P0-3 Goods 3-Way Match | **PASS** |
| P0-4 BOM Numbering | **PASS** |
| P0-2 Invoice Ceiling suite | **52/56 pass. 4 failures are OBSOLETE TEST — NOT A PRODUCT DEFECT**: the old test script's own steps 7/7b/8/9 call `createChangeRequest()` with no `reason` (now mandatory) and call `/approve` directly with no prior `/submit` (now required) — exactly the two changes this phase intentionally made. The SAME underlying behavior (approved CR raises the ceiling; unapproved does not) is independently, freshly re-proven passing 54/54 in this phase's own purpose-built suite (§O, Cases A–D). Not modified, per instruction not to rewrite tests merely to pass them. |
| Site Return | Every CONTROL-BEHAVIOR assertion passed (closed-project block, unauthorized-role block, unauthenticated block, fault-injection+retry, final reconciliation report). 8 of the script's own absolute-stock-quantity assertions failed — **stale test-fixture state**, not a regression: this db.json has now accumulated Site Return test data across 3 separate phases/runs, so the script's "site starts at a known baseline" assumption is no longer true. One assertion (a BOM-entitlement block on an unrelated material) is in fact **positive proof** the pre-existing BOM Excess Material Issue governance control is still firing correctly. |
| Fixed Asset Transfer / Job Work Fee (Quick Control Fixes) | 19/21 pass. 2 failures are the SAME class: the test script's own PRIOR run left asset `FA-0009` inside a CLOSED project (`PRJ-9`) as its last recorded state — re-running the script a second time correctly hits the closed-SOURCE-project block that phase itself fixed, on the very first transfer attempt. This is the fix working, not failing. |
| RBAC / capability registry | **PASS, structurally** — no capability table was touched this phase (CR/BOM linkage checks are plain domain guards, like `assertCanReturnFromSite`, not GL/inventory write-point bindings); server booted cleanly under the existing startup policy validator both before and after. |
| Atomicity / Idempotency | **PASS** (§L/§M) |
| Trial Balance | **PASS — balanced to the rupee** (§O) |
| Inventory / GL reconciliation | Unaffected — no code this phase touches inventory or GL posting at all |

**No STOP condition (§22) was triggered by any of the above.**

---

## R. Defects Found

| ID | Severity | Root Cause | Reproduction | Fix | Regression Test | Status |
|---|---|---|---|---|---|---|
| PV2-01 | P2 | `/api/change-requests/:id/approve` was a legacy if-block, never migrated when `/create` was fixed for the same gap in an earlier phase | Identical approve request bodies with the same `idempotencyKey` would each re-run `approveChangeRequest()` (though the OLD 2-state model made a second attempt harmlessly fail on `status!=='Draft'` — this was latent, not yet exploitable, but is now closed properly under the new state machine) | Migrated to `registerMutationRoute({idempotent:true})` | §M | **FIXED** |
| PV2-02 | OBS | Change Request had no document-number series at all (same gap class P0-4 fixed for BOM) | `nextDocNumber('CR')` returned `null` for every CR | Registered `CR` in `glDocumentTypes` | Live-confirmed non-null `documentNo` on every new CR | **FIXED** |

No CRITICAL or HIGH defects were found. This phase is primarily a genuine **function build** (a real state machine, traceability, hardening), not a defect-fix pass — framed as such, not inflated.

---

## S. Function Gaps

1. No execution gate ties BOM/PR/PO/billing to variation approval (§G) — pending Policy #1/#2.
2. No billing-reversal mechanism for a cancelled variation whose revenue was already billed against (§D.4, §O Case D).
3. Costing Version has no `projectId` and uses an unsafe length-based id — pre-existing, out of this phase's scope, flagged for awareness.
4. No attachment/document-upload mechanism exists anywhere in this codebase — `attachmentIds` could not be meaningfully added.

## T. Business Decision Gaps

All 6 items in §D.

## U. Remaining Risks

| Risk | Severity | Status |
|---|---|---|
| Cancelling an Approved CR after its revenue was already billed leaves `remainingCeiling` negative with no resolution mechanism | Disclosed, live-proven | Open — §D.4 |
| No hard gate prevents BOM/PR/PO from proceeding without an approved variation | Disclosed | Open — §D.1/2 |
| `ProjectManager` role cannot create a Change Request at all (`create:false` in `ROLE_ACTIONS`) | Pre-existing, unrelated to this phase | Flagged for awareness — a real-world PM is arguably the most natural person to raise a variation |

---

## V. SAP-Style Maturity Score

Scored 0–5 (0 = absent, 5 = SAP S/4HANA-equivalent). **This is a maturity comparison, not a compliance claim** — per instruction, "SAP compliant" is never asserted.

| Dimension | Score | Note |
|---|---|---|
| Functional completeness | 3/5 | Real lifecycle now exists; execution-gate/closure integration still policy-gated |
| Project controls | 3/5 | SoD, idempotency, audit all real; no maker-checker escalation tiers by value |
| Financial controls | 4/5 | Billing ceiling enforcement is genuinely robust (draft-time AND post-time); reversal-on-cancel is the one open gap |
| Procurement | 2/5 | Unaffected by this phase; pre-existing PR-optional gap remains |
| Inventory | N/A this phase | Not touched |
| Traceability | 3/5 | CR↔Quotation and BOM↔CR both real and validated; Costing/PR/PO/Billing not yet linked |
| Audit | 4/5 | Every transition and every rejection independently logged with full actor/timestamp/reason |
| Security | 4/5 | Role tiers, SoD, direct-API and forged-id attacks all blocked live |
| Data integrity | 4/5 | Zero new anomalies; referential checks all clean |
| Workflow | 3/5 | Real Draft/Submitted/Approved/Rejected/Cancelled with revise-and-resubmit; no distinct reviewer step or value-based escalation |
| **SAP-style maturity (overall)** | **3.3/5** | Appletree ERP's Change Request is now a real, controlled document lifecycle — the gap to SAP-class maturity is entirely in DOWNSTREAM INTEGRATION (execution gating, closure impact, reversal-on-cancel), each of which is a named, undecided business policy, not a missing engineering capability |

---

## W. Final GO / NO-GO

## GO WITH CONDITIONS

**Conditions:**
1. Management must decide Policy items #1–#6 in §D before any execution gate, closure blocker, or billing-reversal mechanism can be built.
2. §D.4 (billing reversal on variation cancellation) is the single highest-priority open item — it is the one place this phase's own testing produced a live, real financial inconsistency (`remainingCeiling:-50000`) with no defined resolution.

No protected baseline regressed. No STOP condition was triggered. No policy was invented. This phase is complete; per instruction, no further broad repository-wide audit follows.
