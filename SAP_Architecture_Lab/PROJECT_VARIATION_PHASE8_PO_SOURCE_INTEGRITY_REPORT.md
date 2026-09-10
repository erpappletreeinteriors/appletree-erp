# APPLETREE ERP — PHASE 8
## PO Source-Document Integrity + Procurement Chain Hardening

**System:** `SAP_Architecture_Lab`. **Date:** 2026-09-07.

---

## A. Executive Verdict

## GO

Both disclosed Phase 7 gaps are closed: `PO.materialRequestId`, `PO.purchaseRequisitionId`, `PO.supplierComparisonId` (and `PO.rfqId`, the identical risk class, closed with the same one-line pattern) are now validated for existence, cross-project consistency, valid status, and mutual consistency with each other and with `PO.changeRequestId` — live-proven across every attack in the brief. One genuine implementation gap was found mid-testing (a Comparison-vs-MaterialRequest mismatch was only checked when `rfqId` was ALSO separately supplied, missing the case where only `supplierComparisonId` + `materialRequestId` were given) and fixed within this same phase. A full forensic scan of all 244 existing POs found **zero historical anomalies** in any of the four source-reference dimensions — nothing to remediate or classify. No STOP condition (§24) was triggered.

---

## B. PO Source Architecture (unchanged since Phase 6/7, reconfirmed)

```
MaterialRequirement --[bomId]--> BOM --[changeRequestId]--> CR
       |
       +--[requirementIds]--> MaterialRequest --[materialRequestId]--> RFQ --[rfqId]--> SupplierComparison
                                                                                                |
PurchaseRequisition (separate, parallel gate, unchanged) --[purchaseRequisitionId]-->            |
                                                                                                    v
                                                                                                    PO --[changeRequestId]--> CR
```

No structural change this phase — only validation added to the existing stored fields.

---

## C. Source Validation Matrix (§3)

| PO field | Exists (schema) | Validated before this phase | Cross-project validated before | Status validated before | Used downstream |
|---|---|---|---|---|---|
| `changeRequestId` | Yes (Phase 5) | Yes (Phase 5) | Yes (Phase 5) | Yes (must be Approved) | GRN traceability, `resolveProcurementScope`, billing gate |
| `materialRequestId` | Yes (pre-existing) | **No** | **No** | **No** | Displayed only |
| `purchaseRequisitionId` | Yes (pre-existing) | Only when `requirePRForPO` is ON, and only existence+status | **No, even when validated** | Only when `requirePRForPO` is ON | `requirePRForPO` gate, commitment |
| `supplierComparisonId` | Yes (pre-existing) | **No** | **No** | **No** | Displayed only |
| `rfqId` | Yes (pre-existing) | **No** | **No** | **No** | Displayed only |

**After this phase**: all five fields are validated for existence, cross-project consistency (where the referenced document carries a project — see §G for the one structurally-unverifiable exception), and status, **regardless of whether `requirePRForPO` or any other policy is on** — this is referential integrity, deliberately independent of the procurement-policy question, exactly as the brief's own scoping rule allowed.

---

## D. Cross-Project Validation (§7)

Live-tested with two fully-populated parallel projects (A and B, each with its own Material Request, Supplier Comparison, and Approved Purchase Requisition):

| Combination | Result |
|---|---|
| PO(A) + MR(B) | **BLOCKED** |
| PO(A) + PR(B) | **BLOCKED** |
| PO(A) + Comparison(B) (derived via its RFQ's project) | **BLOCKED** |
| PO(A) + Comparison(A) + a mismatched, same-project MR | **BLOCKED** (§4 finding — see §W) |
| PO(A) + all sources from A | **ALLOWED** |

---

## E. CR Consistency — Chain Mismatch (§8 critical test)

Built the full chain CR-A → BOM-A → MRQ-A → MaterialRequest-A → RFQ-A → Comparison-A, then attacked:

- `PO.changeRequestId = CR-OTHER` (a real, valid, but UNRELATED Approved CR) + `PO.supplierComparisonId = Comparison-A` → **BLOCKED**: "the supplied changeRequestId ... does not match the Change Request derived from the Supplier Comparison's own upstream chain."
- Same PO with `changeRequestId = CR-A` (the correct, chain-matching CR) → **ALLOWED**.

This is NOT invented as a blanket rule — it only fires when the chain actually resolves to a specific CR (via `resolveProcurementScope()`, reused, not reimplemented) AND an explicit, conflicting `changeRequestId` was separately supplied. A PO with `supplierComparisonId` but no `changeRequestId` at all is unaffected (independence stays independence, per the brief's own closing principle).

## F. Material Request Consistency (§4)

All three required attacks — cross-project, nonexistent, valid-same-project — **PASS**. Status validation added: only `APPROVED` or `CONVERTED` Material Requests may be referenced (Draft/Submitted/Rejected all blocked) — this specific state set was derived from EXISTING behavior (`createRFQ()` already requires `APPROVED` to issue an RFQ; `CONVERTED` is the state a Material Request naturally reaches once that happens), not invented.

## G. Purchase Requisition Consistency (§5)

All three required attacks **PASS**. One structural limitation, disclosed rather than worked around: a Purchase Requisition may legitimately have `projectId:null` (site-scoped only) — since a PO carries no `siteId` field of its own, this specific case cannot be cross-validated either way and is **not rejected** (rejecting something that cannot be disproven would be a false positive, not real integrity). Only a genuine, provable project MISMATCH is blocked. `requirePRForPO` itself was **not touched** — it remains the sole authority on whether a PR is *required*; this phase only ensures a *voluntarily supplied* PR reference is real.

## H. Supplier Comparison Consistency (§6)

All three required attacks **PASS**, plus the chain is walked two hops (Comparison → RFQ → project) rather than trusting a same-level field, and a Comparison with no `recommendedSupplierId` is rejected as unusable (defensive, matching `createSupplierComparison()`'s own creation-time guarantee that this should never actually be empty).

---

## I. Source Status Validation (§9)

| Source | Draft | Submitted | Approved | Rejected | Cancelled | Converted |
|---|---|---|---|---|---|---|
| Material Request | **BLOCKED** | **BLOCKED** | **ALLOWED** | (not separately tested — same gate as Draft/Submitted) | N/A (no such status) | **ALLOWED** (already-RFQ-sourced) |
| Purchase Requisition | **BLOCKED** | (not separately tested — same status gate) | **ALLOWED** | (same gate) | (same gate) | **BLOCKED** (already tied to a different PO — duplicate-use prevention) |

No status requirement was invented — both derived directly from how each document's OWN lifecycle function already defines "ready to be consumed downstream."

---

## J. PO Immutability (§10)

Confirmed by code inspection: **no edit route or function exists for any PO field, at any status, before or after this phase.** `changeRequestId`/`materialRequestId`/`purchaseRequisitionId`/`supplierComparisonId` are set exactly once, at creation, never mutated again by any code path. **PASS, automatically, by absence of an attack surface** — not tested via a live edit attempt because there is nothing to attempt.

---

## K. API Bypass Attacks (§11)

| Attack | Result |
|---|---|
| Unauthorized role (Sales) with otherwise-valid source docs | **BLOCKED** (403 — role gate runs before any source validation) |
| Unauthenticated direct API call | **BLOCKED** (401) |
| Forged `projectId` combined with a real source doc from a different project | **BLOCKED** (§D) |
| Forged/nonexistent source document ids (all four fields) | **BLOCKED** |
| Forged `status`/`userId`/`role` in the request body | **N/A — no route reads status/userId/role from the body**; actor identity is always session-derived, confirmed unchanged |

## L. Security / Capability Results (§12)

The new validation (`assertPoSourceDocumentsConsistent()`) runs strictly AFTER the existing `registerMutationRoute()` role/capability check and BEFORE any PO mutation — confirmed by its placement in `createPurchaseOrder()`, immediately alongside the pre-existing `assertPoChangeRequestLink()` call. No `if(role===...)` logic was added anywhere — every authorization decision still flows through the existing role/capability architecture, unchanged.

---

## M. Atomicity (§13)

`assertPoSourceDocumentsConsistent()` is a pure, read-only, validate-before-any-mutation function — it runs entirely before `DB.purchaseOrders.push()`. Live-confirmed: a rejected cross-project-comparison PO attempt left the PO collection count byte-identical before and after (no orphan record, no partial write). No multi-step loop exists in the new validation to fault-inject into (same structural reasoning accepted throughout this engagement).

## N. Idempotency (§14)

| Test | Result |
|---|---|
| Same key, same payload (with source docs) | **Deduplicated** — identical PO id returned both times |
| Same key, different source document (`materialRequestId` swapped) | **Explicitly rejected** — matches the existing global idempotency contract exactly, no new semantics |

## O. Audit (§21)

Every rejected source-integrity attack produces the standard `BusinessRuleRejected` audit event (via the PO route's pre-existing `auditReject:true`) — no new audit mechanism was created. Successful PO creation continues to log the pre-existing `PurchaseOrderCreated` event, now additionally carrying whichever source fields were supplied (unchanged event shape, just now guaranteed to be genuine references).

---

## P. Database Integrity (§15)

Full forensic scan re-run. **No new anomaly** of any kind (same historical artifacts as every prior report). Targeted PO source-integrity scan across all **244 existing Purchase Orders**:

| Check | Result |
|---|---|
| PO → nonexistent MaterialRequest | **0** |
| PO → nonexistent PurchaseRequisition | **0** |
| PO → nonexistent SupplierComparison | **0** |
| PO → nonexistent RFQ | **0** |
| PO → nonexistent CR | **0** |
| PO↔MR cross-project | **0** |
| PO↔PR cross-project | **0** |
| PO↔Comparison cross-project (via RFQ) | **0** |
| Full-chain (Comparison→RFQ→MaterialRequest→PO) project mismatches | **0** |
| Duplicate PO ids / doc numbers | **0** |

---

## Q. Historical Data Findings (§16)

**No historical anomaly exists.** All 244 pre-Phase-8 Purchase Orders, created without this phase's validation in place, happen to reference only real, correctly-scoped source documents. **Nothing was found to classify or remediate** — this is reported plainly rather than treated as an opportunity to invent a cleanup task; per instruction, no historical record was touched.

---

## R. Procurement Scope (§17)

`resolveProcurementScope()` re-run, live, against all four required cases:

| Case | Result |
|---|---|
| Baseline direct PO | **BASELINE** |
| Variation direct PO | **VARIATION** |
| MR-derived variation PO (no direct `changeRequestId`, tagged only via `materialRequestId` → chain) | **VARIATION**, `traceabilityPath:["PurchaseOrder","MaterialRequest","MaterialRequirement","BOM"]` |
| Broken/nonexistent PO reference | **UNKNOWN** — never silently converted to BASELINE |

No change was needed to the classifier itself — Phase 8's new validation makes it IMPOSSIBLE to create a PO with a broken reference going forward, so the "UNKNOWN via a stored-but-dangling PO field" scenario is now structurally unreachable for any NEW record (it remains reachable, correctly, for a bare nonexistent-id lookup, as tested above).

## S. Variation Traceability (§18)

| Relationship | Classification |
|---|---|
| CR → BOM, CR → PO | DIRECT FK |
| BOM → CR, PO → CR | DIRECT FK |
| MR → BOM | DIRECT FK (Phase 6) |
| MR → CR | DERIVED (via BOM) |
| PO → MaterialRequest/PurchaseRequisition/SupplierComparison | DIRECT FK, **now validated** (this phase) |
| GRN → PO → CR | DERIVED |
| Inventory Issue → BOM → CR | DERIVED (one indirect hop, unchanged limitation from Phase 6) |
| Invoice → CR consumption | DIRECT (`variationAllocations`, Phase 4) |
| Comparison → RFQ → MaterialRequest → project | DERIVED, **now validated end-to-end** (this phase) |

---

## T. Profitability Regression (§19)

The ORIGINAL Phase 7 CR-TEST scenario's CR (`CR-0089`) was re-fetched live after this phase's changes — **byte-identical output**: `variationRevenue: ₹1,00,000`, `variationMaterialCost: ₹29,608.91` (moving-average, unchanged), `grossContribution: ₹70,391.09`, `costImpact: ₹60,000` still purely declarative with zero execution effect. PO + GRN + Inventory Issue remain three separately-reported figures, never summed as costs — confirmed unchanged.

## U. Accounting Reconciliation (§20)

No new GL entries from `assertPoSourceDocumentsConsistent()` (pure validation, zero calls to `postJournalEntry`/`postInventoryMovement`, confirmed by code inspection). Independently recomputed Trial Balance from raw journal lines after all this phase's activity: **Total Debit ₹1,71,59,094.98 = Total Credit ₹1,71,59,094.98, difference 0.000000.**

## V. Protected Regression (§22)

| Baseline | Result |
|---|---|
| P0-1/P0-3/P0-4 | **PASS** |
| P0-2 suite (old script) | **52/56** — same 4 already-documented OBSOLETE TEST failures, unchanged since Phase 2 |
| Phase 5's BOM/PO CR-governance suite | **34/34 — zero regression** |
| Phase 6's MR/BOM entitlement suite | **20/21** — same already-diagnosed test-harness `require()`-caching artifact (audit event fires correctly, confirmed via live re-fetch) |
| Phase 7's idempotency/scope/profitability suite | **14/14 — zero regression** |
| Fixed Asset Transfer / Job Work Fee | **19/21** — same already-documented stale-fixture class, zero code overlap |
| Trial Balance | **PASS — balanced to the rupee** |

---

## W. Defects Found

| ID | Severity | Classification | Root Cause | Reproduction | Fix | Regression Test | Status |
|---|---|---|---|---|---|---|---|
| PV8-01 | P0 | DEFECT (financial/data-integrity) | `PO.materialRequestId`/`purchaseRequisitionId`/`supplierComparisonId`/`rfqId` were stored with ZERO existence/cross-project/status validation before this phase | Live: any of these fields could be set to a nonexistent id, or a real id from a different project, and the PO would still be created successfully | Added `assertPoSourceDocumentsConsistent()`, called unconditionally in `createPurchaseOrder()` | 19/19 targeted attacks now blocked correctly, live-confirmed | **FIXED** |
| PV8-02 | P1 | DEFECT (found during THIS phase's own testing, fixed same phase) | The Comparison-vs-MaterialRequest consistency check was only reachable when `rfqId` was ALSO explicitly supplied in the same request — a caller supplying only `supplierComparisonId` + a mismatched `materialRequestId` (omitting `rfqId`) could slip past it | Live-reproduced during Section 4 testing before the fix | Added a second, direct check: `supplierComparisonId`'s own underlying RFQ's `materialRequestId` is now compared against the supplied `materialRequestId` regardless of whether `rfqId` was separately supplied | Re-tested live, now blocked correctly | **FIXED** |

No other defect was found. Both fixes landed within this same phase, both live-verified.

---

## X. Function Gaps

None newly identified this phase — the two Phase 7-disclosed gaps this phase targeted are both closed.

## Y. Architecture Gaps

1. A site-scoped-only (`projectId:null`) Purchase Requisition cannot be cross-validated against a PO's project, since PO carries no `siteId` field — disclosed in §G, not worked around by inventing a new field.

## Z. Business Policy Gaps

None newly introduced. `requirePRForPO`, RFQ-mandatoriness, and CR-tagging-mandatoriness remain exactly as disclosed in Phase 7 (§B/§C of that report) — untouched.

---

## AA. Remaining Risks

Materially reduced this phase (the two named PO source-integrity gaps are closed), but the core, long-standing risk is unchanged: every tagging point remains optional by policy, so a fully untraced variation remains possible if nobody tags it — this was never in this phase's scope to resolve (a policy decision, not an integrity defect).

## AB. Exact Management Decisions Required

Unchanged from Phase 7 (§AC there): (1) whether `variationTaggingPolicy`'s flags should ever be enabled, (2) whether `costImpact` should be given real meaning, (3) whether site-scoped Purchase Requisitions should ever be usable against a project-scoped PO in a way this phase could validate (would require a policy-authorized `PO.siteId` field — not built).

## AC. Recommended Next Phase

Should not be another broad audit. This phase's own two targeted gaps are now closed; the codebase has no further known, disclosed PO-source-integrity gap. Any future phase should be driven by a genuine new finding or an actual management policy decision (§AB), not a speculative re-scan.

## AD. Final GO / GO WITH CONDITIONS / NO-GO

## GO

Every §24 STOP condition was checked and none triggered: no PO can persist a nonexistent source document, no PO can reference a source document from another project (including through the two-hop Comparison→RFQ derivation), no complete procurement chain can contain a contradictory CR/project relationship, no unauthorized API access could create or manipulate a PO's source links, duplicate PO creation remained correctly deduplicated, atomicity held (zero orphan records under a rejected-attempt test), accounting stayed balanced, no Phase 1-7 control regressed (five separate regression suites, all clean or matching already-diagnosed artifacts), profitability continued not double-counting, and no historical PO was rewritten — 244 records scanned, zero anomalies found, zero mutations made.
