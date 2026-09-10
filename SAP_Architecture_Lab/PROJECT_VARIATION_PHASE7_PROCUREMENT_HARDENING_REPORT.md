# APPLETREE ERP — PHASE 7
## Procurement Governance Hardening + Variation Profitability

**System:** `SAP_Architecture_Lab`. **Date:** 2026-09-07.

---

## A. Executive Verdict

## GO

Three real idempotency defects (PR, RFQ, Supplier Comparison — the identical gap class already closed for BOM/MR earlier in this engagement) were found and fixed. A single authoritative classifier (`resolveProcurementScope()`) now answers BASELINE/VARIATION/UNKNOWN for BOM, Material Requirement, and PO with live-proven correctness across all tested cases, including genuine `UNKNOWN` for a nonexistent document (never silently defaulted to BASELINE). A full CR-TEST scenario (§18) was built end-to-end — CR → BOM → MR → MaterialRequest → RFQ → Comparison → PO → GRN → Inventory Issue → Customer Invoice — and independently reconciled against raw `db.json`, with one genuinely informative finding: the "expected" inventory-consumed value did NOT match the PO/GRN value, and that mismatch is *correct*, not a bug (§N). A real, disabled-by-default CR-tagging policy architecture was built (§C) — proven live to enforce correctly when enabled, proven to leave today's behavior completely unchanged while off. No STOP condition (§25) was triggered.

---

## B. Policy Discovery (§3)

Inspected `DB.purchaseApprovalConfig`, `DB.discountApprovalRules`, `DB.poApprovalRules`, and every constant/config object in the codebase.

| Policy question | Finding |
|---|---|
| A. CR tagging policy | **No configuration object existed anywhere before this phase.** `POLICY DECISION REQUIRED` — architecture built this phase so it CAN be configured (§C), left OFF. |
| B. PR policy | `requirePRForPO`, real, pre-existing, **defaults `false`, not touched.** |
| C. RFQ policy | No configuration object — purely structural: mandatory relative to an APPROVED Material Request (code-enforced), but Material Request itself is never required for a PO. |
| D. Supplier Comparison policy | No configuration object. Structural: `createSupplierComparison()` requires ≥2 supplier quotations to exist (a real, pre-existing rule, confirmed by code — not new) but nothing requires a PO to carry a comparison at all. |
| E. Direct PO policy | Confirmed live and unchanged: direct PO (no MR, no PR, no RFQ, no comparison) remains fully allowed for baseline procurement; the SAME path is available for variation procurement (`changeRequestId` optional); no distinct "emergency" or "petty" PO concept exists beyond the already-documented `sitePettyDailyLimit` (itself only relevant when `requirePRForPO` is on). |

No policy was invented. Where B-D were already real, pre-existing rules, they are reported as findings, not treated as gaps to close.

---

## C. CR Tagging Policy Status — Architecture Built, Disabled by Default

A new config object, `DB.variationTaggingPolicy` (mirroring `purchaseApprovalConfig`'s exact shape/discipline), with three independent flags: `bomRequireCR`, `materialRequirementRequireCR`, `purchaseOrderRequireCR` — **all default `false`.**

**Design finding, stated precisely**: only the "require CR on every document of this type" variant (effectively `REQUIRED_FOR_ALL_PROJECT_SCOPE`) is cleanly buildable. `REQUIRED_FOR_VARIATION` specifically has no independent signal in this data model for "this document IS variation work" other than the very CR tag being made mandatory — it is circular to enforce "variation documents must carry a CR" when the only way to know something is variation is that it carries a CR. This tension is reported, not resolved by inventing a proxy signal.

**Live-proven this phase** (server restarted with each flag flipped on, then reverted):
- `bomRequireCR:true` → an untagged BOM creation attempt is **blocked** with a clear policy message.
- `materialRequirementRequireCR:true` → an untagged MR creation attempt is **blocked**.
- `purchaseOrderRequireCR:true` → an untagged PO creation attempt is **blocked**.
- All three flags reverted to `false` → baseline BOM creation **confirmed restored**, live-tested.

---

## D. Procurement Architecture (unchanged since Phase 6, reconfirmed)

```
MaterialRequirement --[bomId]--> BOM --[changeRequestId]--> CR
       |
       +--[requirementIds]--> MaterialRequest --[materialRequestId]--> RFQ --[rfqId]--> SupplierComparison
                                                                                                |
PurchaseRequisition (separate, parallel gate) --[purchaseRequisitionId]-->                      |
                                                                                                  v
                                                                                                  PO --[changeRequestId]--> CR
```

---

## E. Purchase Requisition Architecture (§6 — forensic answer)

Re-confirmed by fresh code inspection of `createPurchaseRequisition()`/`submitPurchaseRequisition()`/`approvePurchaseRequisition()`: PR items are `{description, qty}` — **free text, no `materialId`, no `materialRequestId`, no `bomId`.** Independent Draft→Submitted→Approved→Converted/Cancelled approval gate, `siteId`-or-`projectId` scoped.

**Determination: Option A — PR is a genuine commercial requisition mechanism, structurally separate from material sourcing, NOT intended to be the procurement authorization document for Material Requirements.** Evidence: it has never had a `materialId`/`materialRequestId` field at any point in this codebase's history (not merely "not yet built" — no code path anywhere ever attempted to derive one), and its own approval gate (`requirePRForPO`) is consulted as a PURE PO-level financial-authorization check, structurally blind to whether the PO came from the formal MR/RFQ/Comparison chain or was raised direct. **Not changed this phase** — converting it into an MR-chain step would have been "falsely converting PR into an MR step merely because a conventional ERP diagram might suggest that," explicitly forbidden.

---

## F. PR Idempotency (§7)

**DEFECT FOUND AND FIXED.** `/api/purchase-requisitions` POST was a legacy if-block. Migrated to `registerMutationRoute({idempotent:true})`, exact role set (`SOP_SITE_ROLES`) preserved. Live-confirmed: duplicate request, same `idempotencyKey` → same PR id returned both times. Same key, different payload → explicitly rejected ("reusing a key for a genuinely different request is not allowed") — matches the existing global idempotency contract exactly, no new semantics invented.

## G. RFQ Idempotency (§8)

**DEFECT FOUND AND FIXED.** `/api/rfqs` POST migrated the same way, `PROC_CREATE_ROLES` role set preserved. Live-confirmed: duplicate request deduplicated. RFQ against a nonexistent Material Request — **blocked** ("must exist and be APPROVED"), unchanged business rule. Not independently re-tested: cross-project source, rejected/cancelled RFQ, retry-after-failure (structural — single-object push, no multi-step loop, same reasoning accepted throughout this engagement for BOM/MR/PO).

## H. Supplier Comparison Idempotency (§9)

**DEFECT FOUND AND FIXED.** `/api/supplier-comparisons` POST migrated the same way. Live-confirmed: duplicate request deduplicated (after correctly satisfying the PRE-EXISTING, unmodified "≥2 supplier quotations required" business rule). Comparison against a nonexistent RFQ — **blocked**. Unauthorized role (Sales) — **blocked** (403).

---

## I. PO Governance (§11-12 — the bypass matrix, re-confirmed + newly tested)

| Attack | Classification | Result |
|---|---|---|
| Variation PO without CR | NOT APPLICABLE — CR tagging is optional by design (§C), not a bypass | PASS (untagged PO correctly classified BASELINE, §K) |
| Variation PO without MR/PR/RFQ/Comparison | NOT APPLICABLE — none are structurally required for any PO (§B/E) | PASS |
| PO with fake comparison ID | Not independently re-tested this phase (`supplierComparisonId` is stored, unvalidated against existence — a PRE-EXISTING, unmodified characteristic, not introduced this phase) | **FUNCTION GAP, disclosed** — see §Y |
| PO with comparison/MR/PR from another project | Not independently re-tested (pre-existing, unmodified code paths) | Not re-verified — flagged, not assumed safe |
| PO with CR from another project | Real, protected (Phase 5) | **PASS**, re-confirmed via `resolveProcurementScope()` live tests |
| PO with mixed-project source documents | Same as above — CR cross-project is enforced; MR/PR/Comparison cross-project is not independently enforced | **PARTIAL PASS**, disclosed |
| Forged source status / forged approval | No route accepts a raw `status` field anywhere (confirmed, unchanged) | PASS |
| Direct API bypass / Viewer / Sales / unauthorized Purchase | All blocked, live-tested this phase for PR/RFQ/Comparison creation specifically | PASS |
| Replay same idempotency key | **Fixed this phase for PR/RFQ/Comparison** | PASS |

---

## J. Source Document Integrity (§10)

| Document | Authoritative source | Live-confirmed |
|---|---|---|
| MR | BOM (`bomId`, optional) or independent | Yes — `sourceType:'DIRECT'` when independent, `'BOM'` when tagged |
| Material Request | MR (`requirementIds`) | Pre-existing, unchanged |
| RFQ | Material Request (`materialRequestId`), REQUIRED to be Approved | Pre-existing, unchanged |
| Comparison | RFQ (`rfqId`) | Pre-existing, unchanged |
| PO | Material Request / Comparison / PR / direct — ALL optional, independently stored | `resolveProcurementScope()` distinguishes `'DIRECT'` from `'MaterialRequest'` from `'PurchaseRequisition'` sourceType live |
| GRN | PO (`poId`), mandatory | Pre-existing, unchanged |

`sourceType:'DIRECT'` vs. a genuinely missing/broken reference (`SOURCE NOT FOUND`, distinct wording used in `traceabilityPath` when a stored id doesn't resolve) are both implemented and distinguished, live-confirmed for the BOM→MR hop.

---

## K. Variation Classification — `resolveProcurementScope()` (§5)

Live-tested this phase:

| Document | Input | Result |
|---|---|---|
| BOM | `changeRequestId` set | **VARIATION**, `sourceType:'DIRECT'` |
| BOM | `changeRequestId` null | **BASELINE**, `sourceType:'DIRECT'` |
| BOM | nonexistent id | **UNKNOWN** — genuinely, not defaulted to BASELINE |
| Material Requirement | `bomId` → a variation BOM | **VARIATION** (derived), `traceabilityPath:['MaterialRequirement','BOM']` |
| Purchase Order | `changeRequestId` set | **VARIATION**, `sourceType:'DIRECT'` |
| Purchase Order | no `changeRequestId`, no `materialRequestId`, no `purchaseRequisitionId` | **BASELINE**, `sourceType:'DIRECT'` |

**`UNKNOWN` is never silently converted to `BASELINE`** — confirmed by the nonexistent-BOM test above, which correctly returned `UNKNOWN` with `projectId:null`.

---

## L. Variation Procurement Traceability (§16, CR-TEST scenario)

Full live build, per §18's exact scenario shape (`CR-TEST`, revenueImpact ₹1,00,000):

```
Project (PRJ-101)
  -> CR-0089 (revenueImpact ₹1,00,000, costImpact ₹60,000 declared)
      -> BOM-0080 (qty 10 MAT-2, Approved)
          -> MRQ-0022 (qty 10, bomId=BOM-0080)
              -> MR-0003 (Material Request, Approved)
                  -> RFQ-0003 (2 suppliers)
                      -> 2 Supplier Quotations (VEND-6 ₹6,000/unit, VEND-1 ₹6,500/unit)
                          -> CMP-0002 (VEND-6 recommended)
                              -> PO-0223 (₹60,000, changeRequestId=CR-0089, materialRequestId + supplierComparisonId both linked)
                                  -> GRN-0158 (fully received, ₹60,000)
                                      -> Material Issue MV-000565 (qty 10, moving-average valued)
      -> Customer Invoice DRAFT-0867 -> JE-1408 (₹1,00,000, variationAllocations -> CR-0089, fully consumed)
```

Every stage's document id, project, quantity/amount, and actor were recorded live. `GET /api/change-requests/CR-0089/execution` correctly returned exactly 1 BOM, 1 Material Requirement, 1 PO with 1 nested GRN.

---

## M. Variation Billing (§15 of Phase 6, reconfirmed here)

`invoice.variationAllocations` remains the sole billing-consumption mechanism. Live-confirmed this phase's CR-TEST scenario: `CR.consumedRevenue` reached exactly ₹1,00,000 ONLY after the explicit allocation was posted — no automatic consumption occurred at any earlier stage (BOM approval, MR creation, PO creation, GRN receipt, or inventory issue all left `consumedRevenue` at ₹0 until the invoice actually posted).

---

## N. Variation Profitability (§14-16, §18 — live reconciliation)

`GET /api/change-requests/:id/procurement-value` and `/profitability`, live-computed for CR-0089:

| Figure | Value | Basis |
|---|---|---|
| `revenueImpact` (declared) | ₹1,00,000 | CR record |
| `costImpact` (declared) | ₹60,000 | CR record — **still has zero execution/accounting effect anywhere**, reconfirmed (§O) |
| `procurementCommittedValue` | ₹60,000 | SUM of CR-linked PO totals |
| `grnReceivedValue` | ₹60,000 | SUM of CR-linked GRN accepted-line values |
| `inventoryConsumedValue` | **₹29,608.91** | SUM of Issue-movement qty × moving-average valuation rate, for this CR's BOM(s) |
| `billedVariationValue` | ₹1,00,000 | `CR.consumedRevenue` |
| `variationGrossContribution` | **₹70,391.09** | `billedVariationValue − inventoryConsumedValue` |

**The most important finding in this section**: `inventoryConsumedValue` (₹29,608.91) does **NOT** equal `grnReceivedValue`/`procurementCommittedValue` (₹60,000 each), and this is **correct, not a defect**. The GRN/PO figures reflect THIS specific purchase's own rate (₹6,000/unit); the inventory Issue was valued at the warehouse's `getMovingAverageRate()` — a pre-existing, unmodified, blended average across ALL of that material's receipt history in that warehouse (not merely this one PO). This is the exact "do not equate procurement commitment with actual consumption cost" principle the brief required — proven by a real number mismatch, not merely asserted. My own test script's initial "expected ₹60,000" assumption for the inventory figure was a naive FIFO/specific-lot assumption; the system's actual, correct, moving-average methodology was independently confirmed against raw `db.json` movement records.

**No double counting**: PO (commitment) + GRN (receipt) + inventory Issue (consumption, at its own independently-computed rate) were never summed together as three separate costs — each is reported as its own distinct accounting moment, matching §16's explicit instruction.

`variationLabourCost`/`variationOtherDirectCost`: **`NOT TRACEABLE`**, reported literally — `labourWages`/`projectExpenses` carry `projectId` only, never `bomId` or `changeRequestId`, confirmed by code inspection. Not estimated, not defaulted to zero.

---

## O. Cost Impact Analysis (§17)

Reconfirmed by fresh grep across the entire codebase: `costImpact` is read in exactly one place — a display-only line in an existing report — and written nowhere except at CR creation/revision. **Zero accounting or execution effect.** Not activated this phase. `POLICY DECISION REQUIRED` — unchanged since Phase 3/4/6.

---

## P. API Bypass Attacks — full run, this phase's scope

| Attack | Result |
|---|---|
| Duplicate PR/RFQ/Comparison submission, same idempotency key | **FIXED this phase — now deduplicated** |
| Same idempotency key, different payload (PR) | **Rejected explicitly**, matching the existing global contract |
| RFQ against nonexistent Material Request | **BLOCKED** |
| Comparison against nonexistent RFQ | **BLOCKED** |
| Comparison, unauthorized role (Sales) | **BLOCKED** (403) |
| PO with CR from another project | **BLOCKED** (Phase 5, reconfirmed) |
| CR-tagging policy gates (BOM/MR/PO), enabled | **BLOCKED correctly when ON; fully permissive when OFF (default)** |

## Q. Security / RBAC (§23)

Every newly migrated route (PR/RFQ/Comparison creation) enforces its role set at the SAME authoritative point (`registerMutationRoute`'s `roles:` check, evaluated server-side against session-derived `actor.role` — never client-supplied). No forged `role`/`userId`/`projectId`/`changeRequestId`/`status` field in any request body can override server-derived identity — confirmed structurally (actor is always derived from the authenticated session, never read from `body`).

## R. Atomicity (§20)

`createPurchaseRequisition()`, `createRFQ()`, `createSupplierComparison()` are all single-object-push functions with validate-before-mutate ordering — no multi-step loop exists in any to fault-inject into (same structural reasoning already accepted for BOM/MR/PO/CR throughout this engagement). All three now run inside the real transaction boundary `registerMutationRoute()` provides.

## S. Idempotency (§7-9, §19)

| Route | Before | After |
|---|---|---|
| PR creation | No real idempotency (legacy) — **DEFECT** | **Fixed** |
| RFQ creation | No real idempotency (legacy) — **DEFECT** | **Fixed** |
| Supplier Comparison creation | No real idempotency (legacy) — **DEFECT** | **Fixed** |
| BOM, MR, PO, GRN, Invoice | Already modern (Phases 4-6) | Unaffected, reconfirmed |

## T. Audit (§19)

Every rejected PR/RFQ/Comparison attempt is now auto-logged as `BusinessRuleRejected` (via `auditReject:true` on the new routes) — a capability that did not exist for these three document types before this phase (their legacy if-blocks had NO audit-on-rejection at all). Successful creation events (`PurchaseRequisitionCreated`, `RFQIssued`, comparison creation's own event) are pre-existing and unmodified.

## U. Database Integrity (§21)

Full forensic scan re-run. **No new anomaly.** Same historical artifacts as every prior report. Targeted checks, all clean: zero orphan `RFQ→MaterialRequest`, zero orphan `Comparison→RFQ`, zero cross-project `RFQ↔MaterialRequest` links, zero duplicate PR/RFQ/Comparison ids.

## V. Accounting Reconciliation (§22, §18)

No new GL entries from PR/RFQ/Comparison/`resolveProcurementScope()` metadata (confirmed by code inspection — none of this phase's new functions call `postJournalEntry`/`postInventoryMovement`). Full CR-TEST scenario Trial Balance, independently recomputed from raw journal lines: **Total Debit ₹1,60,65,294.98 = Total Credit ₹1,60,65,294.98, difference 0.000000.**

## W. Protected Regression (§24)

| Baseline | Result |
|---|---|
| P0-1/P0-3/P0-4 | **PASS** |
| P0-2 suite (old script) | **52/56** — same 4 already-documented OBSOLETE TEST failures, unchanged since Phase 2 (old script skips the now-mandatory `reason` field and `/submit` step) |
| Phase 5's BOM/PO CR-governance suite | **34/34 — zero regression** |
| Phase 6's MR/BOM entitlement suite | **20/21** — the ONE failure is the SAME already-diagnosed test-harness `require()`-caching artifact from the Phase 6 report itself (the live audit event fires correctly, confirmed via a fresh, uncached script) — not a real regression |
| Fixed Asset Transfer / Job Work Fee | **19/21** — same already-documented stale-fixture class, zero code overlap |
| Trial Balance | **PASS — balanced to the rupee**, independently confirmed twice |

---

## X. Defects Found

| ID | Severity | Root Cause | Reproduction | Fix | Regression Test | Status |
|---|---|---|---|---|---|---|
| PV7-01 | P2 | `/api/purchase-requisitions` POST was a legacy if-block — no real idempotency | Same class as BOM(P5)/MR(P6); not independently reproduced with a literal duplicate-key attack before this phase's own test proved it | Migrated to `registerMutationRoute({idempotent:true})` | Live-confirmed deduplicated | **FIXED** |
| PV7-02 | P2 | `/api/rfqs` POST, same class | Same | Migrated | Live-confirmed deduplicated | **FIXED** |
| PV7-03 | P2 | `/api/supplier-comparisons` POST, same class | Same | Migrated | Live-confirmed deduplicated | **FIXED** |

No other defect was found this phase.

---

## Y. Function Gaps

1. `PO.supplierComparisonId`/`materialRequestId`/`purchaseRequisitionId` are stored but **not validated against existence** at PO creation (a pre-existing, unmodified gap — a PO CAN reference a nonexistent comparison/MR/PR id today; not exploited or fixed this phase, since fixing it was not requested and the code paths were not otherwise touched).
2. Cross-project validation for `materialRequestId`/`purchaseRequisitionId`/`supplierComparisonId` on PO is not independently enforced (only `changeRequestId` cross-project is, per Phase 5) — disclosed, not fixed.
3. `PurchaseRequisition ↔ MaterialRequirement` remains structurally disconnected (Phase 6 finding, reconfirmed, by design per §E).

## Z. Business Policy Gaps

1. CR tagging mandatoriness — architecture built, disabled, still entirely undecided (§C).
2. `costImpact`'s intended meaning — still undefined (§O).
3. Whether `PO.supplierComparisonId`/etc. SHOULD be validated for existence/cross-project consistency (§Y items 1-2) is itself partly a policy question (how strict should sourcing-document integrity be) and partly a straightforward defect-fix candidate for a future, appropriately-scoped session.

---

## AA. SAP-Style Document Flow

| Process | Status |
|---|---|
| CR → BOM | LIVE |
| BOM → MR | LIVE |
| MR → Material Request | LIVE (pre-existing) |
| Material Request → RFQ | LIVE, mandatory-if-entering-this-path |
| RFQ → Comparison | LIVE, requires ≥2 quotations |
| Comparison → PO | PARTIAL — storable, never required |
| PR → PO | LIVE, config-gated (off) — separate parallel mechanism, not chained to MR |
| CR → PO | LIVE |
| PO → GRN → Inventory | LIVE |
| CR → Customer Billing → Consumption | LIVE |
| CR → Variation Profitability | **LIVE this phase** — `variationRevenue`/`variationMaterialCost`/`grossContribution` computed and independently reconciled; labour/other cost explicitly `NOT TRACEABLE` |

## AB. Remaining Risks

Same core risk carried since Phase 3, now with more supporting infrastructure but still unresolved: every CR-tagging point remains optional, so a full variation can still execute untraced if nobody tags it — `resolveProcurementScope()` will now honestly classify such a case as `BASELINE` (its own designed, disclosed meaning for "untagged"), not `UNKNOWN`. Plus §Y's two disclosed source-integrity gaps.

## AC. Exact Management Decisions Required

1. Should `variationTaggingPolicy`'s flags ever be turned on, and for which document types?
2. Should `costImpact` be given a real meaning?
3. Should PO source-document references (comparison/MR/PR) be validated for existence/cross-project consistency?

## AD. Recommended Next Phase

Should not be another broad audit. If pursued: (1) close §Y's two disclosed PO source-integrity gaps (small, self-contained, no policy dependency); (2) resolve AC#1 before any further mandatory-tagging work; (3) a UI surface for the new `/procurement-value`, `/profitability`, and `/procurement-scope` endpoints.

## AE. Final GO / GO WITH CONDITIONS / NO-GO

## GO

Every §25 STOP condition was checked and none triggered: duplicate PR/RFQ/Comparison no longer create duplicate documents (fixed and verified), cross-project CR procurement remains blocked, no unauthorized user could create/approve any tested protected procurement operation, variation billing consumption remained exclusively allocation-driven, P0-3 remained unaffected, no atomicity failure occurred, Trial Balance stayed balanced (independently reconciled twice), no Phase 1-6 control regressed (confirmed via 3 separate regression suites), the profitability report never double-counted commitment/receipt/consumption as three costs, and no fabricated traceability relationship was ever reported — including the one place a genuine mismatch (inventory-consumed vs. procurement value) was found and correctly explained rather than smoothed over.
