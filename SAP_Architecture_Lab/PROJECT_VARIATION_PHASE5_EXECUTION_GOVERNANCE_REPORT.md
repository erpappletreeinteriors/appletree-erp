# APPLETREE ERP — PHASE 5
## Project Variation Execution Governance: CR → BOM → Material Requirement → Procurement → Inventory → Billing

**System:** `SAP_Architecture_Lab`. **Date:** 2026-09-07.

---

## A. Executive Verdict

## GO

Variation execution is now traceable, both directions, from an Approved Change Request through BOM and Purchase Order/GRN to the Phase 4 billing-consumption layer — live-proven end-to-end. Baseline (non-variation) work remains completely unrestricted at every stage, confirmed live. One real, pre-existing defect was found during this phase's own idempotency testing (BOM creation had no real duplicate-submission protection) and fixed, matching the identical gap class already closed for other document types earlier in this engagement. Every place the ERP genuinely cannot yet distinguish baseline from variation work is named explicitly, not silently assumed safe. No STOP condition (§26) was triggered.

---

## B. Current Downstream Architecture (discovery, before any code changed)

| Function | Route | Project FK | CR FK (before this phase) | Approval | Idempotency (before) | Transaction | GL/Inventory effect |
|---|---|---|---|---|---|---|---|
| `createBOM` | `POST /api/boms` | Yes | **Optional (Phase 2)** | Submit→Approve/Reject | **None — legacy if-block** | Legacy wrapper (atomicity only) | None (docs only) |
| `createMaterialRequirement` | (no dedicated route found in this scan) | Yes | None | Submit→Approve | Unknown | Plain | None |
| `createMaterialRequest` | via internal calls | Yes | None | Submit→Approve/Reject | Unknown | Plain | None |
| `createRFQ` | via internal calls | Yes (via source MaterialRequest) | None | Status only | Unknown | Plain | None |
| `createSupplierComparison` | via internal calls | via RFQ | None | N/A | Unknown | Plain | None |
| `createPurchaseOrder` | `POST /api/purchase-orders` | Yes | None (before) | Submit→Approve (value-tiered) | **Yes (modern)** | `withTransaction()` (submit/approve) | Commitment on approval |
| `createGRN` | `POST /api/grns` | Via PO | None (before) | N/A | **Yes (modern)** | Full custom rollback (Phase 35/41) | Real GL + inventory |
| `draftSupplierInvoiceFromPO` | `POST /api/ap/invoice-from-po` | Via PO | None | Draft workflow | Partial (legacy) | `postDraft()` | Real GL |
| `draftCustomerInvoice` | `POST /api/ar/invoice` | Yes | **`variationAllocations` (Phase 4)** | Draft workflow | Yes | `postDraft()` | Real GL |

**Critical finding, confirmed by code inspection before writing any new code**: `createBOM()` and the entire Material Requirement→RFQ→Comparison→PO chain are **structurally disconnected from each other**. A BOM's material lines feed `createMaterialIssue()` (site/warehouse stock consumption, governed by the BOM-quota entitlement mechanism) and `createProductionOrder()` (MES manufacturing) — **never** a Material Requirement. `createMaterialRequirement({projectId, materialId, qty, ...})` has no `bomId` field and no caller anywhere in the codebase that derives it from a BOM. **These are two parallel procurement-initiation paths with zero code connecting them.**

---

## C. Baseline vs. Variation Classification (§3 — the central design problem)

Every way a user can create variation-shaped work, classified as instructed:

| Path | Classification | Why |
|---|---|---|
| Create BOM without CR | **BYPASS, by design (intentional, per Policy #1 — undecided)** | No policy requires tagging; a user CAN create genuinely variation-driven scope and simply not tag it. Phase 3's Policy Decision Matrix already named this — unchanged, reconfirmed live this phase. |
| Create BOM WITH CR | **CONTROLLED** | Fully validated (Approved, same-project, not forged) — live-proven this phase (§D). |
| Create Material Requirement directly | **BYPASS, structural** | No CR field exists, and — the more important finding — no BOM field exists either. A Material Requirement can represent ANY incremental need, baseline or variation, completely untethered from anything upstream. |
| Create PR directly | **BYPASS, structural + policy** | `requirePRForPO` defaults OFF — a PO needs no PR reference at all today, baseline or variation. |
| Create PO directly (no MR/PR/RFQ) | **PARTIALLY CONTROLLED, this phase** | Now CAN carry an optional `changeRequestId` (this phase), fully validated when supplied — but nothing REQUIRES it, so an untagged variation PO is still possible. |
| Create invoice directly | **CONTROLLED (Phase 4)** | `variationAllocations` is explicit and validated; nothing infers a CR from amount/date. |
| Edit an existing BOM | **SAFE** | No edit function exists for BOM at all (confirmed, unchanged) — only new-version-plus-supersession, which goes through the same `createBOM()` gate every time. |
| Create procurement from another source | **N/A — not applicable in this codebase** | No third procurement-entry path exists beyond MR/PR/RFQ/PO. |
| Issue material directly to site | **UNKNOWN SOURCE — see §I** | `createMaterialIssue()` is governed by BOM entitlement quota, but the ISSUE ITSELF carries no CR awareness independent of whichever BOM it draws against. |

**The central finding, stated plainly**: "no CR = baseline" is **NOT a safe assumption**, confirmed structurally — a real variation could be executed entirely through an untagged BOM, an independent Material Requirement, a PR-less PO, and a plain, unallocated invoice, and nothing in the system would ever flag it as variation-related. This is not new to this phase — it was already the finding of Phase 3's Policy Decision Matrix (§1/#1-2) — but this phase confirms it holds true even after the traceability this phase adds, because tagging remains **optional everywhere**, per the explicit instruction not to make it mandatory without policy.

---

## D. CR → BOM Control (§4 — re-verified, protected baseline from Phase 2)

All 9 required checks, live-tested this phase:

1. CR exists — **enforced** (`CR-DOES-NOT-EXIST` blocked).
2. Same project — **enforced** (`PRJ-1` + a different project's CR blocked, correct error naming the mismatch).
3. CR is Approved — **enforced**.
4. Not Cancelled — **enforced** (blocked, same "not Approved" gate).
5. Not Rejected — **enforced**.
6. Not Draft/Submitted — **enforced**, both tested separately.
7. Caller authorized — **enforced** (Sales blocked with 403).
8. Transaction atomic — **live-proven this phase**: a BOM with a valid CR + one invalid material line created ZERO records (before/after count identical).
9. Duplicate creation idempotent — **DEFECT FOUND AND FIXED this phase** (see §S).

Forged-id attack (`PO-0001` supplied as `changeRequestId`) — **blocked**, correctly reported "does not exist" (never found in `DB.changeRequests`).

---

## E. Material Requirement Control (§7)

**Not modified — per explicit instruction not to automatically add `changeRequestId`.** Determined, by code inspection: Material Requirement is **not** generated from BOM (§B's central finding) — so "is BOM traceability sufficient" is answered definitively: **no**, because there is no relationship to be sufficient FOR. 

## FUNCTION GAP / BUSINESS POLICY REQUIRED

A Material Requirement can exist entirely independently and legitimately represent incremental variation-driven procurement need, with zero traceability to any CR or BOM. Closing this gap would require BOTH an architecture decision (should BOM generate Material Requirement lines automatically? should MR gain an optional `changeRequestId` mirroring BOM/PO?) AND a policy decision (should it be mandatory), neither of which this phase was authorized to invent.

---

## F. Procurement Traceability (§8)

Auditor's question: **"Which approved CR authorized this PO?"** — now directly answerable: `PO.changeRequestId` (this phase), or reverse via `GET /api/change-requests/:id/execution`.

Auditor's question: **"Which approved CR authorized this Material Requirement / PR / RFQ / Comparison?"** — **not answerable**. No redundant FK was added to any of these three documents (per instruction not to add FKs merely for diagram completeness) — the honest answer is that the relationship does not exist in the data model at all, not that it exists but is hard to query.

GRN traceability is **derived, not duplicated**: `GRN.poId → PO.changeRequestId`, live-confirmed via the `execution` endpoint nesting each PO's GRNs directly.

---

## G. PR / RFQ / Comparison Policy (§9-10)

| Document | Status | Classification |
|---|---|---|
| PR (`purchaseRequisitions`) | 0 records in this environment's data; `requirePRForPO` config defaults OFF, **unchanged, not touched this phase** | **OPTIONAL** (by existing, pre-Phase-5 configuration) |
| RFQ | Requires an APPROVED Material Request to issue | **OPTIONAL** — a PO does not require an RFQ reference at all |
| Vendor Comparison | Requires an RFQ | **OPTIONAL**, same reasoning |
| **Can a variation PO bypass PR today?** | Yes — `requirePRForPO` is a single global config flag with no variation-specific carve-out or exemption | **BUSINESS DECISION REQUIRED** if this needs to differ for variation-sourced procurement |
| **Can baseline PO legitimately bypass PR?** | Yes, same global flag, same answer for both | Confirms PR policy is currently baseline/variation-agnostic — not a new gap introduced by variation work |
| **Control implication if `requirePRForPO` stays false** | Any future variation-execution gate built on top of PR (e.g. "variation PRs must reference an Approved CR") would be silently bypassable for as long as PR itself remains optional — this is a real, disclosed control-completeness risk, not invented policy |

No threshold, no mandatory gate, no emergency-procurement rule was invented, per instruction.

---

## H. PO Governance (§11)

`createPurchaseOrder()` now accepts optional `changeRequestId`, validated with the SAME function backing BOM (`assertDocumentChangeRequestLink`, generalized — one rule, not two copies that could drift):

| Attack | Result |
|---|---|
| Valid Approved, same-project CR | **ALLOWED**, stored |
| Nonexistent CR | **BLOCKED** |
| Cross-project (`Project A` + `CR from Project B`) | **BLOCKED**, correct error |
| Rejected CR | **BLOCKED** |
| Cancelled CR | **BLOCKED** |
| Forged id (a real PO id supplied AS a CR id) | **BLOCKED** — correctly "does not exist" in `DB.changeRequests` |
| Unauthorized role (Sales) | **BLOCKED** (403) |

Upstream authoritative-relationship validation (PO→PR→MR→BOM→CR) was **not built as a chained requirement**, per instruction not to add redundant FKs — `PO.materialRequestId`/`purchaseRequisitionId` already exist and are independently validated by the pre-existing code; `PO.changeRequestId` is a SEPARATE, independent optional tag, not chained through those (since, per §E, none of MR/PR/RFQ carry a CR to chain through in the first place).

---

## I. GRN / Inventory Governance (§12-13)

**P0-3 (Goods 3-Way Match) confirmed completely unaffected by CR linkage**, live-tested: a CR-linked PO for a goods-category vendor (`Panel/Board`) still creates and receives a GRN normally (3-way match applies at the BILLING step, not at PO/GRN); a direct, non-PO bill attempt against the SAME goods vendor is still correctly blocked, proving CR traceability creates no bypass path around the existing goods-vendor control.

Regression attacks (pre-existing GRN protections, re-confirmed not weakened): GRN against a nonexistent PO — **blocked** ("PO not found").

`VariationGRNReceived` is logged (derived through `po.changeRequestId`, no new stored field on GRN itself) only when the underlying PO is actually variation-tagged.

**§14 Material Issue / Site Consumption — investigated, not modified:**

## BUSINESS / ARCHITECTURE GAP

`createMaterialIssue()` is governed by BOM entitlement (quota derived from the project's Approved BOM lines) but the issue movement itself carries `bomId`, not `changeRequestId` — so whether a given site material consumption is "variation material" is only answerable ONE HOP removed (via `movement.bomId → bom.changeRequestId`), and only for the material that happens to be quota-governed at all. The current data model **cannot** cleanly classify BASELINE MATERIAL vs. VARIATION MATERIAL vs. UNKNOWN SOURCE at the movement level directly — this is reported, not invented around.

---

## J. Billing Governance (§15 — Phase 4, reconfirmed unmodified and unbypassed)

`invoice.variationAllocations` remains the sole authorization mechanism for variation billing — live-reconfirmed this phase's end-to-end scenario: a CR consumed via explicit allocation only, `consumedRevenue` updated only at post time, nothing inferred. BOM/PO/GRN traceability (this phase's additions) does **not** create any alternate path to consume a CR's billing capacity — `cr.consumedRevenue` is mutated in exactly one place in the entire codebase, `postDraft()`, unchanged since Phase 4.

---

## K. End-to-End Scenario (§16 — live, full chain)

```
Project (PRJ-075, budget ₹0)
  -> Approved CR (CR-0077, revenueImpact ₹60,000)
      -> Variation BOM (BOM-0051, changeRequestId=CR-0077)
      -> Variation PO (PO-0204, changeRequestId=CR-0077, ₹45,000, vendor VEND-6)
          -> submitted -> approved -> GRN (GRN-0147, fully received)
      -> Customer Invoice (DRAFT-0841, variationAllocations:[{CR-0077, ₹60,000}])
          -> submitted -> approved -> POSTED (JE-1378)
      -> CR-0077.consumedRevenue = ₹60,000 (fully consumed)
```

Every stage recorded document id, project, CR, quantity/amount, status, actor, timestamp — live-confirmed via `auditLog`.

**Forward traversal** (`GET /api/change-requests/:id/execution`): returned exactly 1 BOM and 1 PO, the PO correctly nesting its 1 GRN.
**Backward traversal** (`GET /api/change-requests/:id/consumption`, Phase 4): returned `consumedRevenue: 60000`, `availableRevenue: 0`, the exact posted invoice listed.

**Material Requirement / PR / RFQ / Comparison were correctly SKIPPED in this scenario** — not because they failed, but because, per §E/§G, they carry no CR relationship to exercise; including them would have been decorative, not real traceability.

---

## L. API Bypass Attacks (§17)

| # | Attack | Result |
|---|---|---|
| A | Variation BOM using Draft CR | **BLOCKED** |
| B | Variation BOM using Rejected CR | **BLOCKED** |
| C | Variation BOM using Cancelled CR | **BLOCKED** |
| D | Cross-project BOM/CR | **BLOCKED** |
| E | PO with forged CR (real id, wrong collection) | **BLOCKED** |
| F | PO for Project A using Project B's CR | **BLOCKED** |
| G | Supplier bill bypassing governed goods PO/GRN (even with a CR-linked PO in play) | **BLOCKED** — P0-3 unaffected (§I) |
| H | N/A this phase — "invoice using unapproved CR" is Phase 4's own attack surface, re-confirmed still blocked, not re-derived here |
| I | N/A this phase — "allocate against wrong-project CR" is Phase 4's own attack surface, re-confirmed still blocked |
| J | Issue variation material without upstream traceability | **Reported as §I's Architecture Gap** — not a pass/fail attack, a genuine model limitation |
| K | Modify status directly | **Not possible via any route** — no route accepts an arbitrary `status` field; every transition goes through its own dedicated, guarded function |
| L | Replay mutation with same idempotency key (BOM, PO) | **BOM: found broken, fixed this phase (§S). PO: already correctly deduplicated.** |

---

## M. Atomicity

| Fault | Result |
|---|---|
| BOM creation, valid CR + one invalid material line | **All-or-nothing** — record count unchanged before/after |
| PO creation, valid CR + one invalid material line | **All-or-nothing** — record count unchanged before/after |
| GRN creation | Unchanged, pre-existing, already fault-tested (Phase 35/41) rollback mechanism — this phase's additive `VariationGRNReceived` audit call sits inside the ALREADY-SUCCESSFUL path, introducing no new failure window |
| Invoice allocation → consumedRevenue | Unchanged, pre-existing Phase 4 mechanism, not touched this phase |

No orphan record, no orphan linkage, no duplicate document, and no orphan audit were produced in any tested fault scenario.

---

## N. Idempotency (§19)

| Route | Before this phase | After this phase |
|---|---|---|
| BOM creation | **No real idempotency (legacy if-block) — DEFECT** | **Fixed — migrated to `registerMutationRoute`, live-confirmed deduplicated** |
| PO creation (with `changeRequestId`) | Already modern | **Confirmed still deduplicated** |
| GRN, Invoice, CR linkage | Already modern (Phase 4/prior phases) | Unchanged, not re-broken |

---

## O. Audit (§20)

| Event | Fired when | Live-confirmed |
|---|---|---|
| `VariationBOMCreated` | `createBOM()` with `changeRequestId` set | Yes |
| `VariationMaterialRequirementCreated` | **Not created — no relationship exists to log (§E)** | N/A, not fabricated |
| `VariationPRCreated` | **Not created — PR carries no CR field (§G)** | N/A, not fabricated |
| `VariationRFQCreated` | **Not created** | N/A, not fabricated |
| `VariationComparisonCompleted` | **Not created** | N/A, not fabricated |
| `VariationPOCreated` | `createPurchaseOrder()` with `changeRequestId` set | Yes |
| `VariationGRNReceived` | `createGRN()` against a CR-linked PO (derived) | Yes |
| `VariationBilled` | **Maps to Phase 4's existing `ChangeRequestConsumed` event — no new event type needed, confirmed still firing** | Yes (as `ChangeRequestConsumed`) |

Every fired event carries `changeRequestId`, `projectId`, source/resulting document id, `userId`, `role`, `at`, and amount/quantity where relevant — confirmed live for all four.

---

## P. Accounting Reconciliation (§21)

No new GL entries were created by CR/BOM/PO tagging itself (confirmed by code inspection — `createBOM()`/`createPurchaseOrder()`'s CR-linkage code path touches zero GL/inventory functions). Downstream GRN/Invoice accounting is byte-identical to the pre-Phase-5 code path for the same inputs (GRN's own GL logic and `postDraft()` are entirely untouched by this phase). Independently recomputed Trial Balance from raw journal lines after all this phase's activity: **Total Debit ₹1,48,89,386.07 = Total Credit ₹1,48,89,386.07, difference 0.000000.**

---

## Q. Database Integrity (§22)

Full forensic scan re-run. **No new anomaly.** Same historical artifacts as every prior report this engagement. Targeted checks specific to this phase's new fields, all clean:

| Check | Result |
|---|---|
| Orphan `PO.changeRequestId` references | None |
| Cross-project `PO`↔`CR` links | None |
| PO linked to a non-Approved CR | None |
| Orphan `GRN → nonexistent PO` references | None |

**Classification of every finding this phase**: 1 NEW DEFECT (found and fixed — BOM idempotency, §S), 0 pre-existing defects newly discovered, 0 new historical artifacts, 2 named FUNCTION GAPS (§E, §I), 3 named BUSINESS POLICY GAPS (§C item 1, §G's PR-exemption question, closure — carried from Phase 3).

---

## R. Protected Regression (§23)

| Baseline | Result |
|---|---|
| P0-1/P0-3/P0-4 | **PASS** (part of the 52/56 suite) |
| P0-2 suite (old script) | **52/56** — same 4 already-documented OBSOLETE TEST failures from Phase 2/3 (unmodified, unrelated to this phase) |
| Fixed Asset Transfer / Job Work Fee | **19/21** — same already-documented stale-fixture class, zero code overlap with this phase |
| Site Return, Job Work Scrap | Not re-attacked — zero code overlap (this phase touched `createBOM`, `createPurchaseOrder`, `createGRN`'s audit-only addition, plus 2 new reverse-lookup functions and 1 new route; none of these are in Site Return's or Job Work Scrap's call graph) |
| CR lifecycle, CR consumption, cancellation block | **Reconfirmed live this phase** (§K's end-to-end scenario exercises the full lifecycle) |
| RBAC / Capability Registry | **PASS, structurally** — no capability table touched; server booted cleanly under the existing startup validator |
| Atomicity, Idempotency, Audit | **PASS** (§M/§N/§O) |
| Trial Balance | **PASS — balanced to the rupee** (§P) |

---

## S. Defects Found

| ID | Severity | Root Cause | Reproduction | Fix | Regression Test | Status |
|---|---|---|---|---|---|---|
| PV5-01 | P2 | `/api/boms` POST was a legacy if-block, reached only through the blanket legacy-dispatch wrapper — atomicity yes, idempotency no (the identical gap class already found and fixed for Change Request create/approve and Fixed Asset Transfer earlier in this engagement, never previously caught for BOM creation specifically) | Live: two identical BOM-creation requests, same `idempotencyKey`, produced two distinct records (`BOM-0044`, `BOM-0045`) | Migrated to `registerMutationRoute({idempotent:true})`, exact same role list preserved | Re-run: duplicate submission now correctly returns the same BOM id both times | **FIXED, live-confirmed** |

No other defect was found. This phase's core work (CR→BOM re-verification, CR→PO addition) is a genuine function build against an already-hardened codebase, not a defect-fix pass.

---

## T. Function Gaps

1. Material Requirement is fully disconnected from BOM and from Change Request (§E).
2. Material Issue / Site Consumption cannot classify baseline vs. variation material at the movement level directly (§I).
3. PR/RFQ/Vendor Comparison carry no CR relationship at all (§F/§G).

## U. Business Policy Gaps

1. Whether BOM/MR/PR/PO/billing should REQUIRE an approved CR (carried from Phase 3, unresolved).
2. Whether `requirePRForPO` should differ for variation-sourced procurement (§G).
3. Whether Project Closure should check unconsumed/open variations (carried from Phase 3, unresolved — now MORE answerable given this phase's traceability, still not implemented).

---

## V. SAP-Style Document Flow

```
Quotation -> Change Request -> Approval                          LIVE (Phase 2/3)
Approval -> BOM                                                   LIVE (this phase, re-verified)
BOM -> Material Requirement                                       MISSING (structural gap, §E)
Material Requirement -> PR -> RFQ -> Comparison -> PO              OPTIONAL (pre-existing, unmodified)
CR -> PO (direct)                                                  LIVE (this phase, new)
PO -> GRN -> Inventory                                             LIVE (pre-existing, re-verified unaffected)
GRN -> Supplier Bill                                               LIVE, P0-3 3-way match unaffected (§I)
CR -> Customer Billing -> CR Consumption                           LIVE (Phase 4, re-verified unaffected)
CR Consumption -> Project Profitability                            PARTIAL — cost/revenue appear in existing reports, but no dedicated variation-attributed profitability view was built (out of this phase's scope)
```

---

## W. Remaining Risks

| Risk | Severity | Status |
|---|---|---|
| A variation can be fully executed (BOM, PO, invoice) with every tag optional and skipped, leaving zero trace | Real, structurally confirmed (§C) | Open — Policy #1 (Phase 3, unresolved) |
| Material Requirement remains a fully untraceable, independent procurement-initiation path | Real (§E) | Open — Function Gap |
| `requirePRForPO` staying off means any future PR-based variation gate is bypassable by default | Real (§G) | Open — Business Policy Gap |
| Site material issue cannot be classified baseline/variation at the movement level | Real (§I) | Open — Architecture Gap |

## X. Exact Next Engineering Phase

Should NOT be another broad audit. If pursued:
1. A management decision on Phase 3's Policy #1 (mandatory vs. optional CR tagging) — everything else in this list depends on it.
2. If mandatory tagging is chosen: design (not yet build) whether Material Requirement should gain `bomId` (closing §E) before or instead of a direct `changeRequestId`.
3. §G's PR-exemption question for variation procurement specifically.

## Y. GO / GO WITH CONDITIONS / NO-GO

## GO

Every §26 STOP condition was checked and none triggered: no unapproved CR could authorize variation billing or execution, no cross-project CR execution succeeded anywhere (BOM or PO), variation billing never bypassed explicit allocation, goods 3-way match was never bypassable through CR linkage, no duplicate financial posting occurred, atomicity held under fault injection, idempotency held everywhere it was tested (after fixing the one real gap found), Trial Balance stayed balanced, the Phase 4 consumption control did not regress, and no unauthorized caller could execute any protected variation-tagged operation. The one real defect found (BOM idempotency) was fixed and verified in the same phase, not merely disclosed.
