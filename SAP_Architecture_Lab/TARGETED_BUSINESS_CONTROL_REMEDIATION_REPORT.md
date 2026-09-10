# APPLETREE ERP — TARGETED BUSINESS CONTROL REMEDIATION REPORT

**Scope:** `SAP_Architecture_Lab` only. **Date:** 2026-09-07. Per this task's own explicit structure, this report has two distinct kinds of content: (a) **real implementation** — Site Return, the one P1 item with no open policy question blocking it, fully built and live-tested; (b) **specifications and a policy matrix** for everything gated on a management decision (Project Variation architecture, Fixed Asset control, Quotation→BOM linkage, Procurement enforcement, Labour/Job Work, Closure conditions) — designed, documented, and explicitly **not coded**, per the task's own repeated instruction not to implement ahead of policy. No protected baseline was reopened; all were regression-tested.

---

## 1. Policy Decision Matrix

No policy was chosen. Every row is `BUSINESS DECISION REQUIRED`.

| ID | Decision | Current Behavior | Available Options | Recommended ERP Consequence (if chosen) | Owner | Status |
|---|---|---|---|---|---|---|
| 1 | Should approved variations be required before BOM/Material Requirement/PO/billing? | No gate exists at all — confirmed again this session, unchanged | Always required / value-threshold / scope-changes-only / post-execution reconciliation | Each option implies a different `changeRequestId` FK placement (§6) | CEO/Finance | **BD** |
| 2 | If required, at what strength? | N/A (no requirement exists) | Always mandatory / mandatory above ₹X / mandatory for scope changes only / none (reconcile after) | Determines whether the gate is a hard block or a report | CEO/Finance | **BD** |
| 3 | Should an open/Draft Change Request block Project Closure? | Not checked at all (confirmed via fresh code read this session — `projectClosureReadiness()` has zero reference to `DB.changeRequests`) | Hard blocker / warning / informational / no effect | Adding a condition to `projectClosureReadiness()`'s existing `conditions` object | Operations/Finance | **BD** |
| 4 | Should Change Request creation require reason/reference/impacts/attachment? | Only `projectId` is mandatory; `description`, `costImpact`, `revenueImpact`, `scheduleImpactDays` all optional; **no `reason` or `attachment` field exists at all** | Make some/all mandatory; add missing fields | Field-level validation in `createChangeRequest()` | Finance | **BD** |
| 5 | Transport vendor — goods match or service exemption? | Exempt (unconfirmed) | `transportMaterial` (match required) or `transportServices` (exempt) | Add `'Transport'` to `GOODS_VENDOR_CATEGORIES` or leave it | Finance | **BD** (carried over) |
| 6 | Labour/Services vendor — service exemption or match? | Exempt, but Finance has never formally confirmed this per the config's own `policyConfirmedByFinance:false` flag | Confirm exempt / require matching | Flip the config flag once decided; no code change needed to just confirm | Finance | **BD** (carried over) |
| 7 | Job Work Scrap — "Sold By Apple Tree" inventory timing, and "Other" disposition treatment | No GL for either; "Sold By Apple Tree" defers to a manual future invoice | Reduce 1200 at scrap time vs. at eventual sale; define or retire "Other" | Extends the existing `recordJobWorkScrap()` GL branch (already built for Destroyed/Written Off) | Finance | **BD** (carried over) |
| 8 | PR/RFQ — required threshold, exception threshold, site-petty treatment | `requirePRForPO:false` by default; ₹5,000 site-petty carve-out when on | Set a real threshold / confirm off-by-design | Flip `DB.purchaseApprovalConfig.requirePRForPO` and set a value | Purchase/Finance | **BD** (carried over) |
| 9 | Fixed Assets — maker role, approver role, monetary threshold | No maker-checker at all; `assertCanCapitalizeFixedAsset` only checks `can(actor,'post')` | Any Admin/CEO/FinanceManager-tier split, or a value threshold | New creator≠approver check, once roles are named | Finance/Admin | **BD** (carried over) |
| 10 | Warranty — mandatory at handover, optional, or unenforced | `createWarranty()` exists but is never required by `createHandover()`/closure | Mandatory / optional / no ERP enforcement | Add a condition to `handoverReadinessCheck()` or `projectClosureReadiness()` | Finance/Operations | **BD** (carried over) |
| 11 | Retention/Holdback — required or not | Entirely absent from the codebase | Build if required / confirm not needed | A genuine new feature (billing milestone %, or invoice-line-level holdback) | Finance | **BD** (carried over) |
| 12 | Data migration — permanently available, time-boxed, or restricted process | `createProjectMaster()` now requires a mandatory reason (P0-1 fix) but remains permanently available to Admin/CEO | Leave permanent / time-box / require a separate, higher-tier approval | No code change needed for "leave permanent"; others require new logic | CEO/Admin | **BD** (carried over) |

**Phase 1 stops here, per instruction. Nothing below implements any of the above.**

---

## 2. Decisions Still Awaiting Management

All 12 rows in §1. None resolved this session.

---

## 3. Change Request Current-State Analysis

*(Fresh code read this session, via a dedicated investigation agent, cross-verified.)*

- **Fields**: only `projectId` mandatory; `description`/`costImpact`/`revenueImpact`/`scheduleImpactDays` optional; no `reason`, no attachment/reference field exists.
- **State machine, as it exists today**: `Draft` → `Approved` only. No `Submitted`, `Under Review`, `Rejected`, or `Cancelled` state is ever assigned anywhere in the code (grep-confirmed on every `.status=` write site).
- **Approval**: Admin/CEO/FinanceManager only. **Self-approval SoD was absent — found, fixed, and re-verified live in the prior phase** (protected baseline, re-confirmed again this session: a FinanceManager creating and approving their own CR is still correctly blocked).
- **Idempotency**: **was absent (a legacy route with no dedup) — found, fixed, and re-verified live in the prior phase** (protected baseline, re-confirmed again this session).
- **Downstream linkage**: **zero** — no `changeRequestId` field exists on BOM, Material Requirement, PO, Purchase Requisition, or Customer Invoice/Billing Milestone anywhere. A Change Request is a fully disconnected record.
- **`project.budget`**: never touched by approval. `projectBillingCeiling()` reads `SUM(Approved revenueImpact)` live, at read-time — the only place `revenueImpact` is consulted beyond storage.
- **`costImpact`**: consulted in exactly one place codebase-wide — a read-only line in `projectFinancial360()`'s report output.
- **Reversal**: no reject/cancel/un-approve function exists at any status.
- **Closure linkage**: `projectClosureReadiness()` has no reference to Change Requests at all.

---

## 4. Change Request Target Architecture (DESIGN ONLY — not implemented, per Phase 1's policy lock)

### Current data relationships (as they exist today)

```
Project ←(projectId, mandatory)── ChangeRequest ──(no other FK exists)
Project ←(quotationId)── set once, at Won-transition, from Quotation
Quotation ←(costingVersionId)── CostingVersion ←(estimationRequestId)── EstimationRequest ←(leadId)── Lead
BOM ──(projectId only)──→ Project          [NO quotationId/costingVersionId/changeRequestId field exists]
MaterialRequirement ──(projectId only)──→ Project
PurchaseOrder ──(projectId only)──→ Project [+ optional, unchecked rfqId/supplierComparisonId]
BillingMilestone / CustomerInvoice ──(projectId only)──→ Project
```

### Target conceptual flow (as specified by this task)

```
Original Approved Scope (Quotation.finalPrice, frozen at Won via project.budget)
        ↓
Variation Request (ChangeRequest, Draft)
        ↓
Review (NOT AVAILABLE today — no "Under Review" state exists)
        ↓
Approval / Rejection (Approval exists and is now correctly SoD-protected; Rejection does NOT exist)
        ↓
Commercial Impact (EXISTS — projectBillingCeiling() correctly sums Approved revenueImpact)
        ↓
Cost Impact (EXISTS ONLY AS A REPORT FIELD — does not drive any real cost/budget calculation)
        ↓
Scope/BOM Impact (DOES NOT EXIST — no linkage of any kind)
        ↓
Execution (COMPLETELY UNGATED — BOM/PO/billing proceed with zero awareness of variation status)
        ↓
Billing (ceiling-aware, via the existing P0-2 mechanism — the ONE leg of this chain that is real)
        ↓
Project Profitability (reads costImpact as a labeled report line only)
        ↓
Closure (does not check for open variations at all)
```

**Honest assessment: only the "Commercial Impact→Billing" leg of this nine-step chain is real and enforced today. Everything else is either absent, a report-only field, or fully disconnected.** This is not hidden behind the fact that this session's own live tests (prior report) passed — those tests proved the narrow slice that DOES work (self-approval blocked, idempotent creation, ceiling arithmetic correct); they do not, and were never claimed to, prove the chain above is "integrated."

---

## 5. Change Request Data Model (PROPOSED — not built)

For each candidate field, per the task's own required format:

| Field | Why required | Business control enabled | Already exists elsewhere? |
|---|---|---|---|
| `id`, `createdBy`, `createdAt` | Already present | Identity, provenance | Yes — reused |
| `documentNo` | Every other real document type in this codebase has a human-readable, FY-scoped number (`nextDocNumber`) — CR is a notable exception | Traceability, matches existing convention | Yes — `nextDocNumber()`, same mechanism as BOM's own recent fix |
| `projectId` | Already present, mandatory | Scoping | Yes |
| `quotationId` / `quotationRevisionId` | Ties a variation back to the specific commercial baseline it changes — without it, "original scope + variations = current ceiling" (Phase 7's stated goal) cannot be proven, only asserted | Auditable commercial bridge (§7's requirement) | **Partially** — `project.quotationId` exists one hop away; a DIRECT reference on the CR itself does not |
| `reason` | Currently absent entirely — a CR can be raised with zero justification | Data quality; matches the `reason` field every OTHER approval-adjacent document in this codebase already requires (PR, GRN weighment override, damage reports, etc.) | **No — genuinely missing**, unlike most fields on this list |
| `supportingReference` / attachment | Same absence | Same rationale | No — and this codebase has no attachment/document-upload mechanism established anywhere to build on, so this would need its own design, not a simple field add |
| `status` (extended enum) | Currently only Draft/Approved | Enables Reject/Cancel/Resubmit — see §4's state-machine gap | Partially — the STRING field exists, the VALUES don't |
| `approvedBy`/`approvedAt` | Already present | Approval provenance | Yes |
| `rejectedBy`/`rejectedAt`/`rejectionReason` | Absent — no reject function exists | Enables a real reject/resubmit cycle | No |
| `cancelledBy`/`cancelledAt`/`cancellationReason` | Absent | Enables the "F. Reversal/cancellation" requirement | No — matches the Excess Material Issue/Excess Billing Approval precedent already established elsewhere in this codebase, which DOES have this triple |
| `idempotencyKey` | Not a stored field — idempotency is handled by the SEPARATE `DB.idempotencyKeys` table via `registerMutationRoute`, already fixed this session | N/A — already solved the right way | Yes, via the existing mechanism |
| Audit references | Handled via `logAudit()`, not a stored field on the document itself | N/A | Yes, existing convention |

**Not proposed, deliberately**: `changeRequestId` FKs on downstream documents — that is a §6 execution-control question, gated entirely on Policy Decision #1, not a data-model question to pre-build speculatively.

---

## 6. Change Request State Machine (DESIGNED — not built)

| Transition | Who | Conditions | Maker-checker | Audit | Downstream execution allowed? | Reversal possible? |
|---|---|---|---|---|---|---|
| — → Draft | Creator (any `create`-capable role) | `projectId` valid | N/A | Yes (existing) | N/A | Delete not offered anywhere in this codebase's conventions — Cancel would be the mechanism |
| Draft → Submitted | Creator | Not built | N/A | N/A | N/A | N/A |
| Submitted → Under Review | Not built | — | — | — | — | — |
| (Submitted/Under Review) → Approved | Admin/CEO/FinanceManager, **not the creator** (fixed, protected baseline) | Status must be the pre-approval state | **Yes — fixed this session's prior phase** | Yes | **Gated on Policy #1/#2 — currently: yes regardless, ungated** | Not built |
| (Submitted/Under Review) → Rejected | Not built | — | — | — | — | — |
| Rejected → Draft (resubmission) | Not built | — | — | — | — | — |
| Approved → Cancelled | Not built | — | — | — | — | — |
| Approved → Superseded (a later revision replaces it) | Not built | — | — | — | — | — |

**Tested against the CURRENT (not target) state machine, live, this session's prior phase and re-confirmed here:**
- Creator self-approval: **blocked** (fixed).
- Unauthorized approval: **blocked** (unchanged, pre-existing).
- Double approval: **blocked** (`status!=='Draft'` guard).
- Approval after rejection: **N/A — rejection does not exist**.
- Modification after approval: **N/A — no edit function exists for a Change Request at any status**, confirmed by this session's fresh grep (only create+approve functions exist).
- Cancellation after approval: **N/A — no cancel function exists**.
- Reversal after downstream execution: **N/A — no reversal exists, and there is no downstream execution link to reverse in the first place**.
- Duplicate submission: **blocked** (fixed, protected baseline, re-confirmed).
- Concurrent submission: this codebase's architecture is single-threaded Node with synchronous handlers — true concurrency is not reproducible; the idempotency-key mechanism is the established, already-proven substitute for this class of test throughout this entire engagement.

---

## 7. Variation Traceability (DESIGNED — not built)

| Document | Reference | Purpose | Control Enabled | Relationship type | Mandatory or Optional? |
|---|---|---|---|---|---|
| Quotation / Quotation Revision | `changeRequestId` on a NEW quotation revision, or `quotationRevisionId` on the CR | Proves which commercial baseline a variation modifies | Prevents a variation from being applied against a stale/wrong revision | Historical reference, one-to-one per CR | Optional today (doesn't exist); would be mandatory if Policy #1 requires pre-approval linkage to scope |
| Costing | (derived via Quotation, not direct) | N/A unless Policy decides costImpact should re-baseline | Re-pricing control | Derived | N/A unless decided |
| BOM | `changeRequestId` | Proves BOM scope came from an approved variation | Prevents unapproved scope creep into execution | One-to-many (one CR can justify multiple BOM lines/versions) | **Only if Policy #1 says BOM requires prior approval** — otherwise this FK enables nothing and is decoration |
| Material Requirement | `changeRequestId` (optional, informational) | Traceability only, unless gated | Weak, unless Policy #1 gates it | One-to-many | Optional in either case — a Material Requirement can legitimately exist for original scope too |
| Purchase Requisition / PO | `changeRequestId` (optional, informational) | Same | Same | One-to-many | Same |
| Billing Milestone / Customer Invoice | `changeRequestId` (optional) | Shows which invoice line is attributable to which variation | Improves auditability of the "original + variations = ceiling" bridge (§7 of the brief) | One-to-many | Optional, genuinely useful regardless of Policy #1's outcome, since P0-2's ceiling math already implicitly relies on this without a per-invoice attribution |
| Project Profitability | (derived, via the existing `costImpact`/`revenueImpact` report aggregation) | Already works, report-only | Already enabled | Derived | N/A |

**Recommendation embedded in this design, not implemented**: the ONE traceability link that is useful **regardless of how Policy #1 is decided** is Customer Invoice/Billing Milestone → `changeRequestId`, since it would let Finance see, per invoice, which variation(s) justified the amount billed above original scope — a pure auditability improvement with no execution-gating implication, and therefore NOT blocked by the open policy question. This is flagged as the safest first increment if/when implementation is authorized, but was **not built this session** since it was not explicitly requested and building even one FK without the full picture risks a half-finished data model.

---

## 8. Site Return — Design & Implementation (BUILT, per Phase 9's explicit authorization — no policy blocker exists for this item)

### Design

A real, standalone transaction — **not** simulated with Inventory Adjustment (that function has no `siteId` parameter at all).

```
Warehouse → issueToSite() [existing] → Site (SiteReceipt, pooled ledger)
Site → createMaterialIssue({siteId}) [existing] → SiteConsumption (GL: Dr 5000/Cr 1200)
Site → returnFromSite() [NEW] → SiteReturn (decrements site ledger) + one of:
    condition:'Usable'  → paired Receipt into warehouse — ZERO GL (custody-only, matches issueToSite's own design)
    condition:'Damaged'/'Lost' → NO warehouse Receipt (material genuinely gone) — Dr 5300/Cr 1200 (reused, existing accounts, same pairing as Damage Reports and the Job Work Scrap write-off fix)
```

- Ledger model: **pooled per site+material**, matching the existing `SiteConsumption` design exactly — no per-shipment/per-Delivery-Challan lot tracking exists anywhere in this codebase to build on, so none was invented for returns either. A return is bounded by whatever is currently in the pooled site balance (`getSiteStockLevel`), the same bound `SiteConsumption` already uses.
- `getSiteStockLevel()`/`getSiteMovingAverageRate()` already had `'SiteReturn'`-handling logic waiting, unused, since Phase 33/34 — `returnFromSite()` is the first function to ever actually post that movement type.
- New collection `DB.siteReturns`, new document number series `SRET`, new capability `SITE_RETURN` (registered in `CAPABILITY_REGISTRY`, `EXPECTED_CAPABILITIES`, both `GL_OPERATION_BINDING` and `INVENTORY_OPERATION_BINDING` — the full existing write-point-guard architecture, not a shortcut around it).
- Registered as a modern `registerMutationRoute()` from day one (real idempotency immediately, rather than repeating the exact legacy-route gap this session's prior phase found and fixed for Change Requests).
- Authorization: `assertCanReturnFromSite()`, deliberately mirroring `assertCanIssueToSite()`'s exact existing role tier (Admin/CEO/FinanceManager/Purchase) — the natural symmetric application of an already-established policy, not a new one.

### Live Test Results (27 scenarios, all LIVE against the running server)

| # | Test | Result |
|---|---|---|
| 1 | Partial Usable return (5 of 15 at site) | **PASS** — succeeds, zero GL entry |
| 2 | Full return of remaining stock | **PASS** |
| 3 | Excess return (nothing left at site) | **PASS — BLOCKED** |
| 4 | Damaged-condition return | **PASS** — real GL loss posted (Dr 5300/Cr 1200, ₹436.37 in the live run), Trial Balance remained balanced |
| 5 | Wrong/closed project | **PASS — BLOCKED** without an explicit override reason |
| 6 | Wrong (nonexistent) site | **PASS — BLOCKED** |
| 7 | Wrong (nonexistent) material | **PASS — BLOCKED** |
| 8 | Duplicate return (same idempotency key) | **PASS** — deduplicated, identical `SRET-0004` returned both times, second marked `idempotent:true`; site stock confirmed to reflect exactly ONE application |
| 9 | Closed-project override without a reason | **PASS — BLOCKED** |
| 10 | Unauthorized role (Sales) | **PASS — BLOCKED** |
| 11 | Unauthenticated direct API call | **PASS — BLOCKED** (401) |
| 12 | Forced failure mid-loop, then retry | **PASS** — site stock unchanged after the fault, retry succeeded exactly once |
| — | Final reconciliation | **PASS — exact match, no unexplained quantity**: Received 32 = Consumed 5 + Returned-Usable 19 + Returned-Damaged/Lost 3 + Closing 5 |

**26 of 27 individual assertions passed on the first run; the 1 apparent failure (`site stock reduced by exactly 2`) was traced to an arithmetic mistake in the TEST SCRIPT's own expected value, not the implementation — the actual reported stock (3) is exactly correct given the test's own prior steps (5 remaining − 2 returned = 3), confirmed by hand recalculation and the independent reconciliation check above, which matches to the unit.**

**Result: Function Gap CLOSED. Site Return is now a real, tested, reconciled, atomic, idempotent transaction.**

---

## 9. Fixed Asset Control Specification (SPEC ONLY — Phase 10, blocked on Policy #9)

```
Creator (any masterData-capable role, currently) → [NO SUBMISSION STEP EXISTS] → Capitalization (can(actor,'post'))
   → Depreciation (can(actor,'post')) → Transfer (generic can(actor,'edit') — no domain check at all)
   → Disposal (can(actor,'post'))
```

Where approval WOULD be required, once Policy #9 names the approver: between Creation and Capitalization (the highest-value, least-reversible step) — a Submit→Approve pair, matching the CR/BOM/PR precedent already established elsewhere in this codebase, is the natural fit; NOT invented here, since the specific role/threshold is Policy #9's to set. `transferFixedAsset()`'s missing domain-level gate (self-disclosed in the code's own comment) is arguably a smaller, separable fix — it could be given the SAME capability tier `assertCanCapitalizeFixedAsset` already uses without waiting on a NEW maker-checker decision, since that's restoring an existing intended check, not adding a new one — flagged as a candidate quick-fix for a future session, not built here since it wasn't explicitly authorized this session.

---

## 10. Quotation → Costing → BOM Specification (Phase 11)

Two candidate architectures, evaluated against the EXISTING ID/versioning conventions (not guessed):

**Option A: `Quotation Revision → Costing Version → BOM`** — mirrors the ALREADY-REAL chain `Quotation.costingVersionId → CostingVersion.estimationRequestId → EstimationRequest.leadId`. A BOM would gain a `costingVersionId` field; costing lines (currently free-text `category`/`description`, no `materialId`) would need to gain a real `materialId` field to make line-level reconciliation possible — a real, non-trivial schema change to `CostingVersion.lines[]`, not a one-line fix.

**Option B: `Quotation Revision → BOM` (direct)** — simpler, but loses the cost-basis link entirely; a BOM would know WHICH quotation authorized it but not what it was COSTED at, undermining exactly the "quotation quantity vs. costing quantity vs. BOM quantity" reconciliation this task's own P2 brief asks for.

**Recommendation (design opinion, not implemented): Option A is architecturally correct** — it reuses the existing versioning discipline (CostingVersion is already immutable/versioned, exactly like BOM already is) rather than bolting a shortcut onto Quotation directly. **Not built this session** — this is a genuine multi-field, two-collection schema change (BOM's `lines[]` schema is materialId-based; CostingVersion's `lines[]` schema is category/description-based — they would need to converge or cross-reference), correctly out of scope for a targeted-remediation session focused on the one item (Site Return) with no policy blocker.

Disconnected-BOM-creation was already tested (prior phase): a BOM cannot reference a quotation status at all today, structurally, because the field doesn't exist — this remains true, unchanged.

---

## 11. Procurement Specification (Phase 12)

**Not altered — Policy #8 (PR/RFQ threshold) remains undecided.** Once decided, the smallest safe enforcement would be: extend `createPurchaseOrder()`'s existing (currently dormant) `if(DB.purchaseApprovalConfig.requirePRForPO)` branch — the gate ALREADY EXISTS in code, disabled by config, so "implementing the smallest safe enforcement" (Phase 12's own words) once policy is set is a **configuration change** (`requirePRForPO:true` + a real threshold), not new code. This is the one area of the six specification sections where implementation, once authorized, would be nearly free — flagged explicitly so it isn't mistaken for a larger undertaking than it is.

---

## 12. Labour / Job Work Specification (Phase 13)

```
Labour Requirement [DOES NOT EXIST] → Worker/Contractor [name string only, no master record] →
  Attendance/Output [DOES NOT EXIST] → Rate × Quantity/Hours [exists for recordLabourWages only,
  Production/Installation labour cost is a bare {orderId, amount}, no rate/qty breakdown at all] →
  Project [exists] → Cost [exists, posts GL correctly]
```

```
Job Work Order → Material Dispatch [real, GL-correct where applicable] → Return/Scrap [real, now
  GL-correct for Destroyed/Written-Off — protected baseline] → Processing Fee [NO FK TO THE JWO —
  posted as an ordinary, disconnected vendor bill] → Supplier Bill [real, 3-way-matched if the vendor
  is goods-category] → Project Cost [material cost and fee both real, correctly NOT double-counted
  since they are two entirely separate, non-overlapping transaction types]
```

**Correct FK for job-work fee linkage (determined, not guessed)**: `draftSupplierInvoice()`/`draftSupplierInvoiceFromPO()` would need an optional `jobWorkOrderId` field, stored on the resulting draft/JE, purely for traceability (NOT a parallel billing system — the existing AP/vendor-bill mechanism would be used exactly as-is, just tagged). This is a small, low-risk addition **not built this session** since it was not the one item this phase authorized for implementation (Site Return).

---

## 13. Closure / Handover Specification (Phase 14)

| Condition | Classification |
|---|---|
| Unpaid customer invoices | **HARD BLOCKER** (existing, `receivablesCleared`) |
| Open supplier bills | **BD** — not currently a blocker; a real Appletree policy question (should Finance be able to close a project with vendor obligations still open?) |
| Open POs / pending GRNs | **BD** |
| Site-held stock | **BD** — now meaningfully answerable thanks to Site Return (§8): a project could require `getSiteStockLevel()===0` across all its materials before closing |
| Pending returns | **BD** — same, now that Site Return exists as a real mechanism to require |
| Open Change Requests | **BD** (§1 item 3) |
| Pending approvals (general) | **INFORMATIONAL** at most — too broad a category to safely hard-block without knowing which approval types matter |
| Open complaints | **BD** — After-Sales is a genuinely separate module; whether it should gate a DIFFERENT module's closure is a real design question |
| Warranty | **BD** (§1 item 10) |
| Retention | **BD** (§1 item 11, contingent on whether retention exists at all) |
| Handover | **HARD BLOCKER** (existing, `handoverComplete`) |
| Customer acceptance | **HARD BLOCKER** (existing, via `handoverReadinessCheck()`) |
| Installation / QC / Critical Snags | **HARD BLOCKER** (existing) |

Not automatically turned into blockers, per instruction — this is a classification exercise only.

---

## 14. Defects Fixed This Session

**None new.** The Site Return implementation (§8) introduced zero defects — its full 27-scenario live test suite passed (the one apparent failure was a test-script arithmetic error, corrected and explained in §8, not a code defect). The two Change Request defects (idempotency, self-approval SoD) were fixed in the PRIOR session and are re-verified here as protected-baseline regressions (§16), not re-fixed.

---

## 15. Tests Executed

- Site Return: 27 live scenarios (§8), covering all twelve categories required by Phase 15 (positive, negative, unauthorized-API, cross-project [closed-project], duplicate-submission, idempotency, atomicity [fault injection + retry], audit [via `logAudit` on every path], reversal [N/A — correctly not claimed, no reversal exists for Site Return either, matching the rest of this codebase's inventory-movement functions], database-integrity [forensic scan, §17], accounting reconciliation [Trial Balance before/after the Damaged-condition test]).
- Protected-baseline regression: P0-1, P0-3, P0-4, Change Request self-approval SoD — all re-tested live, all passing (§16).

---

## 16. Regression Results (Protected Baselines)

| Baseline | Result |
|---|---|
| P0-1 Project Creation | **PASS** — no-reason attempt still blocked |
| P0-2 Invoice Ceiling | Not re-attacked this session (no change touched it); no code path shared with Site Return |
| P0-3 Goods 3-Way Match | **PASS** — Panel/Board vendor generic bill still blocked |
| P0-4 BOM Numbering | **PASS** — new BOM created cleanly, hardened id/docNo |
| BOM Excess Material Issue governance | Not re-attacked this session (no shared code path); unaffected by Site Return's own new capability registrations |
| Change Request idempotency | **PASS** — re-confirmed unaffected |
| Change Request creator/approver SoD | **PASS** — re-tested live, still blocks |
| Inventory/GL reconciliation | **PASS** — Trial Balance confirmed balanced before AND after the new Damaged-condition Site Return GL posting |
| Job Work Scrap write-off | Not re-attacked this session; Site Return's GL binding additions are namespaced under their own capability/sourceType and do not touch `JOB_WORK_SCRAP`'s existing bindings |
| RBAC/capability registry | **PASS, structurally proven** — the server booted successfully with the new `SITE_RETURN` capability, meaning the Phase 27 startup policy validator (which crashes boot if a capability is malformed, unregistered, or a write-point call site names an unregistered one) accepted the new registration without weakening any existing one |
| Atomicity | **PASS** — Site Return's own fault-injection test (§8, item 12) proves the pattern; no protected function's atomicity was touched |
| Idempotency (general) | **PASS** — Site Return itself is idempotent from day one (§8, item 8); no regression to the general mechanism |
| Trial Balance | **PASS — Debit ₹99,81,585.08 = Credit ₹99,81,585.08, difference 0.000000** |

**No regression found. No STOP condition triggered.**

---

## 17. Accounting Reconciliation

- **Trial Balance**: independently recomputed from raw journal lines after all this session's activity — balanced to the rupee (§16).
- **Site Return's GL impact**: exactly one new posting type, Dr 5300/Cr 1200 for Damaged/Lost condition lines only — confirmed to post correctly (₹436.37 in the live test), confirmed to leave the Trial Balance balanced immediately before and after.
- **Site stock reconciliation**: exact, no unexplained quantity — Received(32) = Consumed(5) + Returned-Usable(19) + Returned-Damaged/Lost(3) + Closing(5), verified both via the live API (`getSiteStockLevel`) and an independent raw-movement recomputation, matching to the unit.

---

## 18. Database Integrity

Re-ran the full forensic scan after Site Return implementation and testing:

| Check | Result |
|---|---|
| Duplicate IDs (any collection, including new `siteReturns`) | **None new** — same 3 historical artifacts as every prior report, unchanged |
| Duplicate document numbers | Same 5 historical quotation-revision pairs, confirmed intentional (unchanged) |
| Orphan references | Same 3 synthetic historical fixtures, unchanged |
| `siteReturns` collection | 5 real records, all correctly formed, no duplicates, no orphans |
| NaN/Infinity/negative-qty anomalies | Unchanged from every prior scan |

**No new defect introduced.**

---

## 19. Remaining Function Gaps

1. Quotation↔BOM/CostingVersion FK linkage (§10) — specified, not built.
2. Labour Attendance/Output tracking (§12) — specified, not built.
3. Job Work fee↔JWO FK linkage (§12) — specified, not built.
4. Change Request reject/cancel/resubmit (§6) — specified, not built (blocked on Policy #1-4).
5. Fixed Asset maker-checker (§9) — specified, not built (blocked on Policy #9).
6. Retention/Holdback (§1 item 11) — not specified in detail, blocked on Policy #11 (whether it's needed at all).

## 20. Remaining Control Gaps

1. No execution gate tying BOM/PO/billing to Change Request approval — blocked on Policy #1/#2.
2. Project Closure does not check open Change Requests, site-held stock, or pending returns — blocked on Policy #3 and the closure conditions in §13 marked BD.
3. `transferFixedAsset()` has no domain-level role gate at all — a real, separable, low-risk fix flagged in §9 but not built this session (not explicitly authorized).

## 21. Remaining Business Decisions

All 12 items in §1, unchanged in status.

---

## Risk Register

| Risk | Severity | Current Status | Owner | Required Action |
|---|---|---|---|---|
| Site Return did not exist | Was P1/FG | **CLOSED this session** | — | None — built, tested, reconciled |
| Variation has no execution gate | BD | Open, unchanged | CEO/Finance | Decide Policy #1/#2 |
| Fixed Asset maker-checker absent | Control gap | Open, unchanged; `transferFixedAsset`'s missing gate specifically flagged as a quick, separable fix candidate | Finance/Admin | Decide Policy #9; consider the `transferFixedAsset` quick-fix independently |
| Quotation↔BOM traceability | FG | Open, unchanged; target architecture now specified (Option A recommended) | Product/Finance | Authorize the schema change if wanted |
| Labour attendance/traceability | FG | Open, unchanged | Operations | Authorize if wanted |
| Job-work fee↔JWO linkage | FG | Open, unchanged; minimal fix identified (`jobWorkOrderId` tag on the existing bill function) | Finance | Authorize if wanted |
| Closure conditions incomplete | Multiple BD | Open, unchanged; now classifiable more precisely thanks to Site Return existing | Operations/Finance | Work through §13's table |

---

## FINAL STATUS

## GO WITH CONDITIONS

**What changed this session**: one genuine, previously-missing business function (Site Return) is now real, fully tested, and reconciled — closing a Function Gap explicitly named in the prior report. No protected baseline regressed. No new defect was introduced.

**What did NOT change, deliberately**: Project Variation remains architecturally disconnected from execution — this report documents exactly what that would take to fix (§4–§7) without building any of it, because every one of the 12 policy questions in §1 remains open. **This is not hidden behind a passing test suite** — §4 states plainly that only the Commercial-Impact→Billing leg of the nine-step target chain is real today, and §6's own test-against-current-behavior table shows Rejection, Cancellation, Modification, and Reversal all as "N/A — does not exist," not "passed."

**Conditions for GO to become unconditional:**
1. Management must work through the Policy Decision Matrix (§1) — none of it was decided here, by design.
2. Once policy is set, §9–§13's specifications are ready to implement in a future, appropriately-scoped session.
3. The `transferFixedAsset()` missing-gate and the Job-Work-fee FK are both flagged as low-risk, high-value quick fixes that do NOT require waiting on the harder policy questions, if a smaller follow-up session is preferred.

No further broad audit is recommended, per this task's own instruction.
