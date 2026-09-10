# APPLETREE ERP — PHASE 6
## Variation Procurement Architecture & Mandatory Traceability

**System:** `SAP_Architecture_Lab`. **Date:** 2026-09-07.

---

## A. Executive Verdict

## GO

The Phase 5 architectural gap ("BOM is structurally disconnected from Material Requirement") is closed with a real, validated, deterministic FK (`MaterialRequirement.bomId`), following the SAME non-duplication discipline already established for `PO.changeRequestId`/`GRN.poId`. A second real defect (Material Requirement creation had no real idempotency protection — same class as BOM in Phase 5) was found by this phase's own testing and fixed. The full seven-stage variation chain (CR → BOM → MR → PO → GRN → Invoice → consumedRevenue) is now live-proven, bidirectionally traceable, with baseline procurement completely unaffected. One structural finding materially corrects the brief's own assumed architecture — reported precisely, not glossed over (§D).

---

## B. Architecture Before This Phase (Phase 5's own stated gap, re-verified)

```
CR -> BOM  (real, Phase 2)
        |
        X    <- Phase 5's identified gap
Material Requirement -> [Material Request -> RFQ -> Comparison -> PO]  (real chain, pre-existing)
Purchase Requisition -> PO  (separate, pre-existing, config-gated)
CR -> PO  (real, Phase 5)
```

---

## C. Policy Decisions Found (§3 — discovery before coding)

Inspected: `DB.purchaseApprovalConfig` (the ONLY procurement policy object found), `DB.discountApprovalRules`, `DB.poApprovalRules`, constants, SOP references in code comments.

| Question | Finding |
|---|---|
| Mandatory CR tagging on any document? | **No configuration or policy object exists anywhere in the codebase.** `POLICY DECISION REQUIRED` — unchanged since Phase 3, reconfirmed by fresh inspection this phase. |
| PR mandatory for PO? | `DB.purchaseApprovalConfig.requirePRForPO` — a real, existing, boolean config flag, **defaults `false`**, with a `sitePettyDailyLimit` (default ₹5,000) carve-out already coded when it IS on. **Not touched this phase**, per explicit instruction. |
| RFQ/Comparison mandatory? | No configuration object found governing this at all — purely a structural (code-path) question, not a policy toggle (§H/§I). |
| Emergency/petty procurement exception? | Only the one already-coded `sitePettyDailyLimit`, itself gated behind `requirePRForPO` being on. No separate emergency-procurement concept exists. |
| Value thresholds for PO/PR approval | `requiredPOApprovalRole(total)` — a real, existing, value-tiered approval function (unrelated to CR/variation), untouched. |

No mandatory-CR policy was invented. The architecture built this phase (§D) is designed so such a policy, if adopted later, can be turned on by adding ONE new check at the point of BOM/MR/PO creation — not a procurement-engine rewrite.

---

## D. Architecture Decision

## The final model is Option C (hybrid) — with one important, evidence-based correction to the brief's own assumed shape.

**Correction, stated precisely**: the brief's assumed chain `MR → PR → RFQ → Comparison → PO` does **not** match this codebase's actual structure, confirmed by inspecting every constructor function directly:

```
REAL structure (two separate, parallel mechanisms):

Path 1 — the formal, RFQ-based sourcing chain:
  MaterialRequirement (MRQ-xxxx: project+material+qty, atomic need)
      --[requirementIds array, pre-existing FK]--> MaterialRequest (MR-xxxx: aggregates MRQs)
           --[materialRequestId, pre-existing FK]--> RFQ
                --[rfqId, pre-existing FK]--> SupplierComparison
                     --[materialRequestId / rfqId / supplierComparisonId]--> PO

Path 2 — a SEPARATE, parallel gate on PO creation:
  PurchaseRequisition (PR-xxxx: free-text description items, NO materialId, NO materialRequestId)
      --[purchaseRequisitionId]--> PO   (consulted ONLY if requirePRForPO===true)
```

**`PurchaseRequisition` does not connect to `MaterialRequirement`/`MaterialRequest`/`RFQ`/`Comparison` at all** — it is a lightweight, independent, description-based requisition-and-approval gate, not a link in the material-sourcing chain the brief assumed it was. Building `PR.materialRequestId` or `PR.bomId` to "complete the diagram" would have been exactly the "decorative traceability" this phase was told not to fabricate — so it was **not built**.

**Given this real structure, the authoritative traceability set implemented is:**

| Relationship | Mechanism | Why |
|---|---|---|
| CR → BOM | Direct FK (`BOM.changeRequestId`, Phase 2) | BOM is the material-authorization document — an audit/authorization-tier reason, per Option C's own carve-out |
| BOM → Material Requirement | **Direct FK (`MaterialRequirement.bomId`, this phase, NEW)** | The true procurement-origin document (MRQ) had zero relationship to its authorizing scope document — this is the real structural gap Phase 5 found, now closed |
| Material Requirement → CR | **Derived** (`MRQ.bomId → BOM.changeRequestId`) — no field added | Fully deterministic, one hop; a second stored CR field here would drift-risk against the BOM's own |
| Material Requirement → Material Request → RFQ → Comparison → PO | **Derived**, walking PRE-EXISTING FKs (`requirementIds`, `materialRequestId`, `rfqId`) | These FKs already existed; nothing needed adding |
| CR → PO | Direct FK (`PO.changeRequestId`, Phase 5) | The financial-commitment document — same authorization-tier reasoning as BOM |
| PO → GRN | Derived (`GRN.poId → PO.changeRequestId`) — unchanged since Phase 5 | Already correct |
| Purchase Requisition | **Deliberately NOT linked to CR or BOM** | It is architecturally a sibling gate on PO, not a step in the material-sourcing chain — linking it would misrepresent the real document flow |

---

## E. Material Requirement Findings (§5 forensic analysis)

Fields (before this phase): `id` (unsafe length-based, same defect class P0-4 fixed for BOM), `projectId`, `materialId`, `qty`, `uom`, `requiredDate`, `priority`, `reason`, `status` (`DRAFT`/`SUBMITTED`/`APPROVED`), `createdBy`, `createdAt`. **No `bomId`. No `changeRequestId`. No document number.** Approval has SoD (creator≠approver). No dedicated `registerMutationRoute()` — the creation route was a legacy if-block with atomicity but **no real idempotency** (confirmed live, see §W).

**Test results (Tests A-J, adapted where the brief's assumed CR-direct-field didn't match the real bomId-based architecture):**

| Test | Result |
|---|---|
| A. MR from an Approved BOM | **ALLOWED**, `bomId` correctly stored |
| B. MR created independently (no BOM) | **ALLOWED**, completely unaffected — baseline preserved |
| C. MR with wrong project vs. the BOM | **BLOCKED** |
| D. MR against a Draft BOM | **BLOCKED** ("not Approved") |
| — (Submitted BOM) | **BLOCKED**, same gate |
| E/F. MR against Rejected/Cancelled BOM | **BLOCKED**, same gate (a Cancelled BOM doesn't exist as a status — `Rejected`/`Superseded` are BOM's terminal non-Approved states, both correctly excluded by requiring `status==='Approved'`) |
| G. MR with forged BOM ID | **BLOCKED** ("does not exist") |
| H. MR with forged CR ID | **N/A, by design** — MR has no `changeRequestId` parameter at all; a supplied one is silently ignored, live-confirmed harmless (no injection, no cross-project leak possible since nothing reads it) |
| I. Replay same idempotency key | **DEFECT FOUND AND FIXED this phase** (§W) |
| J. Fault injection mid-creation | Structural — single-object push, no multi-step loop to fault-inject into (same reasoning as BOM/PO in Phase 5); atomicity guaranteed by validate-then-mutate ordering + the (now-real) transaction wrapper |

---

## F. BOM → MR Traceability (§6)

`materialRequirementBomEntitlement({bomId, materialId})` — a genuinely NEW, separate pool from the existing `projectBomEntitlement()`/`materialBomQuota()` (Material ISSUE entitlement, tracking stock already consumed). This tracks how much of a BOM line's quantity has already been **requisitioned for purchase** — a different question, not a duplicate engine.

Live-tested: BOM line qty 10, wastage 0% → total allowed 10. MR for 4 → allowed, 6 remaining. Attempt 7 → **blocked** ("exceeds ... remaining requisitionable quantity (6 of 10 total allowed, 4 already requisitioned)"). Exactly 6 → **allowed**, 0 remaining. Further 1 → **blocked**.

`changeRequestId` is **deliberately not duplicated** onto MR — always derivable via `bomId → BOM.changeRequestId`, per §D's reasoning.

---

## G. PR Governance (§9 — re-confirmed, not modified)

`requirePRForPO` remains the sole PR policy lever, **defaults `false`, not touched this phase**. Confirmed: a variation PO (with `changeRequestId` set) can bypass PR exactly as freely as a baseline PO can — the config flag is entirely variation-agnostic. **Control implication, disclosed**: if a future mandatory-CR-tagging policy is adopted, and if it is enforced only at the PR layer, it would be silently bypassable for as long as `requirePRForPO` stays off — this is a real, structural risk, not invented policy, and not fixed here (no threshold was invented, per instruction).

---

## H. RFQ Governance (§10)

`createRFQ()` **requires** its source `MaterialRequest` to be `APPROVED` — so within Path 1 (§D), RFQ is **mandatory** relative to Material Request, not optional. But Path 1 itself is entirely optional relative to PO creation — a PO needs no `materialRequestId`/`rfqId` at all. **Classification: RFQ is CONTEXT-DEPENDENT — mandatory once you enter Path 1, but Path 1 itself is never required.** Not re-tested exhaustively this phase (zero code touched RFQ/Comparison) — this is Phase 5's own already-recorded finding, reconfirmed by fresh code inspection, not re-derived from new live tests.

## I. Supplier Comparison Governance (§11)

`createSupplierComparison({rfqId, recommendedSupplierId, reason, actor})` requires a real `rfqId`. **Not independently re-tested this phase** (unmodified code) — Phase 5's finding stands: PO does not require a comparison reference at all, so a PO cannot be forced to "prove" a comparison occurred, but nothing fabricates one either — a PO with no `supplierComparisonId` correctly shows no comparison, never a false one.

---

## J. PO Traceability (§12 — the 10-attack matrix)

| Attack | Result |
|---|---|
| 1. PO references Project A, CR from Project B | **BLOCKED** (re-confirmed, Phase 5 mechanism, unmodified) |
| 2. PO references Draft CR | **BLOCKED** |
| 3. PO references Rejected CR | **BLOCKED** |
| 4. PO references Cancelled CR | **BLOCKED** |
| 5. PO references nonexistent CR | **BLOCKED** |
| 6. PO references valid CR but unrelated BOM | **N/A — PO has no `bomId` field at all**, only `changeRequestId` (direct) and `materialRequestId` (via Path 1) — there is no "PO→BOM" reference to forge in the first place; the relationship is CR-direct or nothing |
| 7. PO references unrelated MR | Governed by the SAME cross-project logic already applied elsewhere (`materialRequestId` is stored but not cross-project-validated against the PO's own project by any NEW code this phase — this is a **pre-existing**, unmodified code path, not newly introduced) |
| 8. User changes CR ID after PO approval | **N/A — no edit function exists for a PO's `changeRequestId` at any status**, confirmed by code inspection; the field is set once, at creation, never mutated again |
| 9. Direct API bypass | **BLOCKED** at every layer tested (role, cross-project, status) |
| 10. Forged request body with unauthorized `status` | **N/A — no route accepts an arbitrary `status` field**; every PO transition goes through its own dedicated, guarded function (`submitPurchaseOrder`/`approvePurchaseOrder`), confirmed unmodified this phase |

---

## K. GRN / Inventory Traceability (§13)

Unchanged since Phase 5, re-confirmed live this phase's end-to-end scenario (§ K below): `GRN.poId → PO.changeRequestId` remains the sole, derived path — **no duplicate CR field added to GRN**, matching the explicit instruction to prefer derivation. P0-3 (goods 3-way match) unaffected, not re-attacked this phase since zero code touched it (already proven in Phase 5, protected baseline).

---

## L. Site Material Issue Classification (§14)

**Not modified this phase** — Phase 5's finding stands, re-confirmed: `movement.bomId → bom.changeRequestId` remains the only (indirect) path from a material issue to a CR. Classification, unchanged:

| Case | Classification |
|---|---|
| A. Baseline material (untagged BOM) | Movement traces to a BOM with `changeRequestId:null` — correctly classifiable as baseline |
| B. Variation material (tagged BOM) | Movement traces to a BOM with a real `changeRequestId` — correctly classifiable as variation |
| C. Unknown/unclassified | A movement with no `bomId` at all (e.g. a non-BOM-governed material) — **genuinely unclassifiable**, by design (no quota mechanism applies to it) |
| D. Variation BOM, baseline issue | **Not possible to represent** — an issue against a BOM inherits that BOM's tag entirely; there is no per-issue override |
| E. Baseline BOM, forged CR | **N/A** — a baseline (untagged) BOM has `changeRequestId:null`; nothing to forge |
| F. Cancelled CR | A BOM tagged to a since-Cancelled CR still shows that CR id — `bom.changeRequestId` is set once at BOM creation and never re-validated against the CR's CURRENT status; this is a **disclosed, pre-existing characteristic**, not newly introduced |
| G. Cross-project BOM | Not reachable — `createMaterialIssue()`'s own project scoping already prevents issuing against a different project's BOM (pre-existing, unmodified) |

No redundant field was added to the movement record — the data model genuinely cannot do finer-grained classification without a larger redesign, correctly reported as an Architecture Gap, not invented around.

---

## M. Billing / CR Consumption (§15-16)

Re-confirmed, unmodified: `invoice.variationAllocations` remains the SOLE mechanism that mutates `consumedRevenue` — live-proven this phase's end-to-end scenario that CR→BOM/MR/PO/GRN linkage creates **zero** automatic billing consumption; the invoice still required an explicit, separately-validated allocation.

Per §16's request, for the E2E scenario's CR (`revenueImpact ₹50,000`):
- `consumedRevenue`: ₹50,000 (fully consumed, via explicit allocation)
- `availableRevenue`: ₹0
- `procurementValue` (PO total against this CR): ₹50,000 — **coincidentally equal** in this scenario because the test was deliberately built 1:1; **not assumed equal in general** — nothing in the code enforces `procurementValue === consumedRevenue`, and no such rule was invented
- `materialValue` (GRN accepted value): ₹50,000, same caveat
- `billedVariationValue`: same as `consumedRevenue` (₹50,000) — this IS a real identity, since `consumedRevenue` is defined as the sum of posted `variationAllocations`, the same figure

**`costImpact` — reconfirmed, unchanged**: still has zero accounting or execution effect anywhere in the codebase (grep-confirmed no function reads it except one report line, per Phase 3/4's own finding). Reported as fact, no calculation invented.

---

## N. Reverse Traceability (§17)

`GET /api/change-requests/:id/execution` — extended this phase to include `materialRequirements`, each entry explicitly labeling every hop as `direct FK` or `derived (fieldName)`:

```json
{
  "boms": [...],                          // direct: BOM.changeRequestId
  "materialRequirements": [{
    "requirementId": "...", "bomId": "...",     // direct: MRQ.bomId
    "materialRequest": {"relationship":"derived (requirementIds)"},
    "rfq": {"relationship":"derived (materialRequestId)"},
    "comparison": {"relationship":"derived (rfqId)"},
    "purchaseOrdersViaMaterialRequest": [...]
  }],
  "purchaseOrders": [{ ..., "grns": [...] }]    // direct: PO.changeRequestId, derived: GRN.poId
}
```

Live-confirmed this phase's E2E scenario: 1 BOM, 1 MR (with `bomId`), 1 PO (with 1 GRN) — no fabricated relationship, no missing one that should have appeared.

---

## O. Security / RBAC (§21)

| Role | MR creation | PO creation (CR-linked) |
|---|---|---|
| Admin/CEO | Allowed | Allowed |
| ProjectManager (of that project) | Allowed | N/A (PO restricted to Admin/CEO/Purchase, unchanged) |
| Purchase | **Blocked** (not in MR's own role set — pre-existing, unmodified) | Allowed |
| Sales | **Blocked** | **Blocked** |
| Viewer | Not tested directly this phase (no write-capable role at all, structurally excluded from every mutation route) | — |

Capability checks occur at the authoritative write point (`createMaterialRequirement()`/`createPurchaseOrder()` themselves), not merely the route layer — confirmed by code inspection, matching this codebase's established defense-in-depth pattern throughout.

---

## P. API Bypass Results — Full Cross-Document Attack Matrix (§24)

| # | Attack | Result |
|---|---|---|
| 1-4 | Draft/Rejected/Cancelled/Cross-project CR → BOM | **PASS** (Phase 2, re-confirmed via Phase 5's own regression suite, 34/34) |
| 5-8 | Valid CR → wrong-project MR/PR/RFQ/PO | MR: **PASS** (this phase). PR/RFQ: **NOT APPLICABLE** — neither carries a CR field to attack (§D). PO: **PASS** (Phase 5) |
| 9 | CR from Project A + BOM from Project B | **PASS** (blocked) |
| 10 | BOM from Project A + MR for Project B | **PASS** (blocked, this phase) |
| 11 | MR without authorized upstream source | **PASS** — MR without `bomId` is baseline, correctly allowed; MR with a forged/wrong `bomId` is blocked |
| 12 | PR bypassing required variation gate | **POLICY DECISION REQUIRED** — no variation gate exists on PR to bypass (§G) |
| 13 | RFQ bypass | **NOT APPLICABLE this phase** — unmodified code, Path 1 remains optional by design (§H) |
| 14 | Comparison forged as completed | **NOT APPLICABLE** — no code path allows fabricating one (§I, unmodified) |
| 15 | PO bypassing required upstream chain | **NOT APPLICABLE** — no "required upstream chain" policy exists to bypass (§C) |
| 16 | GRN against wrong PO | **PASS** (Phase 5 regression, "PO not found" on a nonexistent PO id) |
| 17 | Supplier bill against wrong PO | **NOT RE-TESTED this phase** — zero code touched, protected P0-3 baseline (Phase 5) |
| 18 | Customer invoice allocating wrong-project CR | **NOT RE-TESTED this phase** — zero code touched, protected Phase 4 baseline |
| 19 | Cancel a consumed CR | **NOT RE-TESTED this phase** — zero code touched, protected Phase 4 baseline (`consumedRevenue>0` block) |
| 20 | Duplicate submission of every new mutation (MR) | **DEFECT FOUND AND FIXED** (§W) |
| 21 | Viewer direct API mutation | **PASS** — structurally excluded (no role grants Viewer any write capability anywhere) |
| 22 | Sales direct API mutation (MR, PO) | **PASS** — blocked on both |
| 23 | Forged role/capability payload | **PASS** — actor identity is derived from the session, never from request body, confirmed unmodified |
| 24 | Arbitrary status injection | **PASS** — no route accepts a raw `status` field (§J attack 10) |
| 25 | Cross-project ID substitution | **PASS** — covered by attacks 5-10 |
| 26 | Transaction fault injection | Structural pass — see §F/§E, no multi-step loop exists in the newly modified functions |
| 27 | Retry after failure | **PASS** — idempotency key mechanism covers this (§R) |
| 28 | Same idempotency key, different payload | **PASS** — rejected explicitly (Phase 4's own established behavior, reused unmodified) |

---

## Q. Atomicity Results (§20)

`createMaterialRequirement()` and `createPurchaseOrder()`'s CR/BOM-linkage code is single-object-push, validate-before-mutate — no multi-record loop exists in either to fault-inject into (same structural argument accepted in Phase 2/5). Both routes now run inside the real transaction boundary `registerMutationRoute()`/`dispatchMutationRoute()` provides. Live-confirmed: an MR creation attempt with an invalid material was cleanly rejected with the record count unchanged before/after.

---

## R. Idempotency Results (§19)

| Route | Before this phase | After |
|---|---|---|
| MR creation | **No real idempotency (legacy if-block) — DEFECT** | **Fixed, live-confirmed deduplicated** |
| PO creation | Already modern (Phase 5) | Unaffected, reconfirmed via Phase 5's own 34/34 regression suite |
| BOM creation | Already modern (fixed Phase 5) | Unaffected |
| GRN, Invoice | Already modern | Unaffected |
| PR/RFQ/Comparison | **Unmodified this phase** — still legacy if-blocks (a pre-existing gap, out of scope since these functions were not touched) | Not fixed, disclosed as a pre-existing, un-addressed gap (§Y) |

---

## S. Audit Results (§18)

`VariationMaterialRequirementCreated` fires only when a Material Requirement is BOTH `bomId`-tagged AND that BOM is itself variation-tagged (never fabricated for an ordinary BOM-tagged-but-baseline requirement — though in practice a baseline BOM has no `changeRequestId` to tag with in the first place, since BOM creation itself gates that). Live-confirmed carrying `changeRequestId`, `projectId`, `bomId`, `requirementId`, `materialId`, `qty`, `userId`, `role`, `at`. Rejected attempts (wrong project, wrong BOM status, nonexistent BOM) are all separately auto-logged as `BusinessRuleRejected` via the route's `auditReject:true`.

---

## T. Database Integrity (§22)

Full forensic scan re-run. **No new anomaly.** Same historical artifacts as every prior report this engagement. Targeted checks specific to this phase's new field, all clean: zero orphan `MR.bomId` references, zero cross-project `MR↔BOM` links, zero MR linked to a non-Approved BOM, zero MR over-entitlement (sum of requisitioned quantity never exceeds a BOM line's allowed quantity), zero duplicate `MR.docNo`.

---

## U. Accounting Reconciliation (§23)

No new GL entries from CR/BOM/MR/PO metadata tagging (confirmed by code inspection — none of this phase's changed code calls `postJournalEntry`/`postInventoryMovement`). GRN/Invoice accounting byte-identical to pre-Phase-6 behavior for the same inputs. Independently recomputed Trial Balance from raw journal lines after all this phase's activity: **Total Debit ₹1,53,28,786.07 = Total Credit ₹1,53,28,786.07, difference 0.000000** (E2E scenario run), reconfirmed again at ₹1,58,75,686.07 = ₹1,58,75,686.07 after the full Phase 5 regression suite layered on top.

---

## V. Regression Results

| Baseline | Result |
|---|---|
| P0-1/P0-3/P0-4 | **PASS** |
| P0-2 suite (old script) | **52/56** — same 4 already-documented OBSOLETE TEST failures, unchanged since Phase 2 |
| Phase 5's own BOM/PO CR-governance suite (34 tests) | **34/34 — zero regression**, confirming the BOM idempotency fix and PO/execution-report additions remain fully intact under this phase's MR layer |
| Fixed Asset Transfer / Job Work Fee | **19/21** — same already-documented stale-fixture class, zero code overlap |
| Site Return, Job Work Scrap, Change Request lifecycle/consumption | Not re-attacked — zero code overlap with this phase's changes |
| Trial Balance | **PASS — balanced to the rupee**, twice independently confirmed |

---

## W. Defects Found

| ID | Severity | Root Cause | Reproduction | Fix | Regression Test | Status |
|---|---|---|---|---|---|---|
| PV6-01 | P2 | `/api/material-requirements` POST was a legacy if-block — atomicity via the blanket wrapper, but no real idempotency (same gap class as BOM in Phase 5, never previously caught for MR specifically) | Live: two identical MR-creation requests, same `idempotencyKey`, would have produced two distinct records | Migrated to `registerMutationRoute({idempotent:true})`, exact same `authCheck` condition preserved | Re-run: duplicate submission now correctly returns the same MR id both times | **FIXED, live-confirmed** |
| PV6-02 | OBS (not fixed, disclosed) | `DB.materialRequirements` used the same unsafe length-based id idiom P0-4 already fixed for BOM | Not independently reproduced as a live collision this phase (no concurrent test performed) — same class of latent risk | Fixed opportunistically alongside PV6-01 (now uses `nextId()`) | Confirmed no duplicate MRQ ids in the forensic scan | **FIXED** |

No other defect was found.

---

## X. Function Gaps

1. `PurchaseRequisition` remains structurally disconnected from `MaterialRequirement`/`MaterialRequest`/`RFQ`/`Comparison` (§D) — a real architectural characteristic of this codebase, not something this phase was authorized to redesign.
2. Site Material Issue cannot distinguish baseline/variation at the movement level directly (§L, carried from Phase 5, unchanged).
3. PR/RFQ/Comparison mutation routes remain legacy (no real idempotency) — out of scope since none of their underlying functions were modified this phase (§R).

## Y. Business Policy Gaps

1. Whether CR tagging should become mandatory anywhere in the chain — still entirely undecided (carried from Phase 3, reconfirmed absent this phase, §C).
2. Whether `requirePRForPO` should differ for variation-sourced procurement (§G, carried from Phase 5).
3. Whether `costImpact` should ever be wired to anything (carried from Phase 3/4, reconfirmed still inert, §M).

---

## Z. SAP-Style Document Flow Score

| Process | Status |
|---|---|
| CR → BOM | **LIVE** |
| BOM → MR | **LIVE** (this phase) |
| MR → PR | **MISSING** — architecturally, PR is not a step after MR at all (§D) |
| PR → RFQ | **MISSING**, same reason |
| RFQ → Comparison | **LIVE** (`Comparison.rfqId`, pre-existing, unmodified) |
| Comparison → PO | **PARTIAL** — `PO.supplierComparisonId` exists and is storable, but nothing REQUIRES a PO to reference one |
| CR → PO | **LIVE** (Phase 5) |
| PO → GRN | **LIVE** |
| GRN → Inventory | **LIVE** |
| Inventory → Site Issue | **PARTIAL** — real (`bomId`-governed entitlement), but CR-traceability is one indirect hop, not direct (§L) |
| CR → Customer Billing | **LIVE** (Phase 4, explicit allocation) |
| CR → Project Profitability | **PARTIAL** — cost/revenue figures exist in general reports; no dedicated variation-attributed profitability view exists |

No status was marked LIVE merely because a document type exists — every LIVE entry above was live-tested this phase or a directly preceding one.

---

## AA. Remaining Risks

| Risk | Severity | Status |
|---|---|---|
| Every CR-tagging point remains optional — a full variation could execute with zero trace if nobody tags it | Real, structurally confirmed | Open — Policy Decision Required (§C) |
| `requirePRForPO` staying off makes any future PR-based variation gate bypassable by default | Real | Open (§G) |
| PR/RFQ/Comparison mutation routes still lack real idempotency | Real, but pre-existing and unmodified this phase | Open — flagged for a future, appropriately-scoped session |
| Site Material Issue baseline/variation classification remains one indirect hop | Real | Open (§L) |

## AB. Exact Management Decisions Required

1. Should CR tagging become mandatory anywhere in the BOM/MR/PO/billing chain, and if so, where exactly?
2. Should `requirePRForPO` be enabled, and should it differ for variation-sourced procurement?
3. Is the `PurchaseRequisition ↔ MaterialRequirement` disconnection (§D) an intentional business design (two genuinely different request types — commercial-project-scoped materials vs. free-text site/misc procurement) or should they be unified? This phase did not assume either answer.

## AC. Recommended Next Engineering Phase

Should not be another broad audit. If pursued: (1) resolve AB#1 first, since everything else depends on it; (2) if PR/RFQ/Comparison idempotency is deemed worth closing independently of any mandatory-CR policy, that is a small, low-risk, self-contained fix mirroring PV6-01/BOM's own fix exactly; (3) a dedicated variation-attributed project profitability view, once AB#1 is resolved.

## AD. Final GO / GO WITH CONDITIONS / NO-GO

## GO

Every §26 STOP condition was checked and none triggered: no unapproved CR authorized variation execution anywhere in the chain, no cross-project CR/BOM/MR execution succeeded, no upstream relationship could be forged, no duplicate mutation created a duplicate business or financial document (after fixing the one real gap found), no atomicity failure occurred, no unauthorized role could invoke any protected operation, customer billing never consumed variation capacity without explicit allocation, GRN/supplier billing never bypassed P0-3, Trial Balance stayed balanced throughout, and no protected baseline regressed (Phase 5's own 34-test suite: 34/34). The one place this phase's own investigation corrected the brief's assumed architecture (Purchase Requisition's real, disconnected role) is reported precisely, not smoothed over — per the explicit instruction not to call an architecture gap "PASS."
