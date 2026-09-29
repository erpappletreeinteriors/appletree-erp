# ARCH-2026-002 — Wave 2 Security Baseline

**Date:** 2026-09-22. Wave 2 Phase 0 deliverable, §14. Per this CR's own instruction, SoD rules are
**identified and classified, never invented or fixed here**. Classification: EXISTING / MISSING /
MANAGEMENT DECISION REQUIRED.

## 0. Critical-finding check — result: NO STOP TRIGGERED, but 3 real findings require prominent disclosure

No unauthenticated access and no client-side identity/role override was found anywhere in Wave 2 (the
same bar applied consistently across every Phase 0 pass in this engagement: a mutating route with zero
auth, or a route letting a client override its own identity, is the CRITICAL threshold — neither was
found). **However, this pass found 3 real, high-value operational chains where a single authenticated,
correctly-role-gated user can execute an entire chain alone, with zero second-person control at any
step** — this is a genuine SoD-coverage gap, not an authentication/authorization bypass, and is reported
here in full per this CR's own §14 instruction, not silently minimized:

1. **Manufacturing — Production Order execution chain** (`createProductionOrder` → `issueProductionMaterial`
   → `postProductionLabourCost` → `completeProductionOrder`/`closeProductionOrder`): none of these 5
   functions compares `actor.id` to the order's own `createdBy` or to each other. Only the upstream BOM
   approval has a creator≠approver control, and it does not propagate to the Production Order itself.
2. **Job Work — dispatch→return→settlement chain** (`dispatchToJobWorker`/`returnFromJobWorker`/
   `recordJobWorkScrap`/`directDispatchFromJobWorker`): all gate on the identical 4-role set with no
   identity comparison to the Job Work Order's `createdBy`; the linked Supplier Bill for job-work charges
   also never checks `jwo.createdBy` against the bill's own creator.
3. **Quality — QC self-attestation**: no `approveQC`/`reviewQC` function exists anywhere in the
   codebase; `submitQCResult` never checks the checklist's creator/inspector against the submitting
   actor. This directly gates Handover readiness (a real downstream financial consequence — Handover
   unlocks Billing Milestones).

**Why this does not meet this engagement's CRITICAL/STOP bar**: every action above still requires a
valid, authenticated, correctly role-gated session — there is no anonymous access and no identity
forgery. It is a **coverage gap on the correctly-singular, already-proven `checkSoD()` engine**, exactly
analogous in kind (though broader in scope) to the SOD-5/SOD-6 gaps ARCH-2026-001D found and closed in a
separate, later, explicitly-authorized CR — not a structural or authentication failure. Per this CR's
own §27 rule ("Do not fix defects discovered during Phase 0"), these are reported for Wave 2 design
scoping, not fixed here.

## 1. SoD pair analysis (this CR's own §14 list)

### Procurement — 3-way (PR raiser / PO approver / Payment executor)

| Pair | Classification | Evidence |
|---|---|---|
| PR raiser vs PR approver | **EXISTING** | `approvePurchaseRequisition`(11328): creator≠approver, CEO/Admin exempt |
| PR raiser vs PO creator | **MISSING** | `createPurchaseOrder`(4650-4744) never compares `pr.raisedBy`/`createdBy` to `actor.id` — the PR raiser can personally convert their own approved PR into a PO |
| PO creator vs PO approver | **EXISTING** | `approvePurchaseOrder`(4796-4821): self-approval blocked unless a finalised `selfApprovalLimit` covers the amount (currently always blocked, per the pre-existing OPEN threshold decision) |
| PR raiser vs PO approver | **MISSING** | `approvePurchaseOrder` only checks the PO's own creator, never traces back to the originating PR's raiser |
| PO creator/approver vs Payment maker/checker/executor | **MISSING** | `createPaymentRequest` is keyed on the AP open item only, never on `poId`/`po.createdBy`/`po.approvedBy` — no field links a Payment Request back to the PO that caused it |
| PR raiser vs Payment maker/checker/executor | **MISSING** | Same root cause — no linking field exists |

**Net assessment**: Payment-side maker≠checker≠executor (SOD-1/2/5) IS genuinely 3-way separated
within itself, and each document (PR, PO) has its own single-step creator≠approver control — but there
is **no cross-document SoD** tying procurement-initiation identity to payment-authorization identity.

### Inventory — requester / issuer / excess-approver

| Pair | Classification | Evidence |
|---|---|---|
| Material Requirement requester vs approver | **EXISTING** | `approveMaterialRequirement`(4477): creator≠approver |
| Requirement requester/approver vs actual Issuer | **MISSING** | `createMaterialIssue`(5910) never compares `requirement.createdBy`/`approvedBy` to `actor.id` — the `requestedBy` parameter is a dead parameter, never read after destructure |
| Excess-issue requester vs excess-issue approver | **EXISTING** | `approveExcessMaterialIssueRequest`(6536): creator≠approver, deliberately NO CEO/Admin exemption |
| Excess-issue approver vs actual Issuer | **MISSING** | The approver who authorized the excess can personally post the excess issue |

### Manufacturing — plan vs execute

| Pair | Classification | Evidence |
|---|---|---|
| BOM creator vs BOM approver | **EXISTING** | `approveBOM`(6409): creator≠approver |
| BOM approver/Production Order creator vs material issuer | **MISSING** | `issueProductionMaterial` checks only status, no actor comparison |
| Production Order creator vs labour-cost poster | **MISSING** | `postProductionLabourCost` gates on role only |
| Anyone in the chain vs who completes/closes the order | **MISSING** | `completeProductionOrder`/`closeProductionOrder` perform no authorization check beyond status transitions — not even a role gate |
| Job Card start vs complete | **MISSING** | Status-only, no actor identity check at all |

### Job Work — dispatch vs receive/settle vs bill

| Pair | Classification | Evidence |
|---|---|---|
| Dispatcher vs Receiver/Settler of return | **MISSING** | Identical 4-role gate, no identity comparison to `jwo.createdBy` |
| Dispatcher vs who books the job-work-charges Supplier Bill | **MISSING** | `jobWorkOrderId` tag on the bill is for project-consistency only |
| Dispatcher vs who records scrap/direct dispatch | **MISSING** | Same pattern |

### Site Execution — Site In-charge request / approve / post

| Pair | Classification | Evidence |
|---|---|---|
| MRS creator (Site In-charge) vs MRS approver | **EXISTING** | `approveSiteMaterialRequisition`(11459): creator≠approver, plus a value-tier gate (SiteInCharge capped at the site-petty daily limit) |
| MRS creator/approver vs who issues from central store | **N/A — structural separation** | `assertCanIssueToSite` categorically excludes SiteInCharge; they cannot physically be the issuer |
| MRS requester/approver vs who records cost-recognizing site consumption | **MISSING, but a normal workflow reality** | The same Site In-charge who raised the MRS is expected to record on-site consumption; unchecked, but not obviously wrong for this domain |
| Site In-charge vs who posts Labour & Wages / Project Expense | **N/A — structural role exclusion** | `SiteInCharge` is not in the permitted role list for either function at all; single-valued role per account makes this pair impossible to violate |

### Quality — inspector / approver / CAPA closer

| Pair | Classification | Evidence |
|---|---|---|
| QC creator/inspector vs who determines the QC result | **MISSING — no control exists** | `submitQCResult` never checks `actor.id` against the checklist's creator/inspector |
| QC "approve/review" step | **N/A — feature does not exist** | No such function exists anywhere; `submitQCResult` is the workflow's terminal action |
| QC inspector vs CAPA closer | **N/A — not a linked workflow** | No `qcId`/`sourceQCId` field exists on CAPA; the two are never programmatically traced to each other |
| CAPA owner vs CAPA verifier | **EXISTING** | `recordCAPAVerification`(7723): owner≠verifier |
| CAPA verifier vs effectiveness-checker | **EXISTING** | `recordCAPAEffectivenessCheck`(7733): verifier≠effectiveness-checker |
| Effectiveness-checker vs who closes the CAPA | **MISSING** | `closeCAPACase` checks status/result only, no identity comparison to any prior actor |

## 2. Data-scope re-confirmation

`hasScopeAccess()` continues to support Project/Site/Customer/Branch only — **Warehouse is confirmed
NOT a supported scope dimension**, re-verified this pass, not silently added. See
`ARCH-2026-002-WAVE-2-DECISIONS.md` item W2-3 for the governance question this raises for any future
warehouse-level security requirement.

## 3. Forged-role / direct-API / missing-authentication re-confirmation

Re-confirmed via the same method as the original Phase 0 Security Baseline (route-dispatch layer
requires `getActor()` before any mutation route is reachable; no client-supplied field overrides
`actor`). No new gap of this class found in Wave 2's 6 domains.

## 4. Conclusion

**No CRITICAL vulnerability found or requiring a stop.** The substantive finding this pass is a real,
disclosed SoD-coverage gap across 3 operational chains (Manufacturing execution, Job Work
dispatch-to-settlement, QC self-attestation), plus several narrower single-pair gaps in Procurement and
Inventory. Every EXISTING control found is confirmed still correctly enforced. Nothing is fixed in this
Phase 0 pass — all findings are carried into `ARCH-2026-002-WAVE-2-DECISIONS.md` for explicit scoping
before any Wave 2 implementation.
