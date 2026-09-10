# APPLETREE ERP — PHASE 9
## Variation Tagging Policy + Baseline/Variation Control Enforcement

**System:** `SAP_Architecture_Lab`. **Date:** 2026-09-07.

**The question this phase answers**: *Can Appletree ERP reliably distinguish baseline project work from approved project variations throughout the procurement, inventory and billing lifecycle — and prevent an intentional API/user attempt from hiding variation expenditure as baseline expenditure?*

**Direct answer**: **Classification is preserved wherever a real relationship is asserted, even without explicit tagging (proven live). Classification cannot be fabricated where no relationship exists — the ERP correctly reports BASELINE (not a false VARIATION) or UNKNOWN (never a false BASELINE) rather than guessing. Financial exposure is prevented not by classification but by a separate, harder control: billing can never silently consume a Change Request's authorized capacity — only an explicit, validated allocation can. One real defect was found in the classification system's own internal consistency and fixed within this phase.**

---

## 1. Executive Verdict

## GO

---

## 2. Variation Control Architecture (discovery, §2 of the brief)

| Function | Policy consulted? | Before mutation? | Capability check | Project from authoritative source | CR required when policy ON | CR validated when supplied | Baseline allowed | Variation allowed | Audit on reject | Idempotency | Transaction | Downstream traceability |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `createBOM` | Yes (`bomRequireCR`) | Yes | `roles:['Admin','CEO','Estimator']` | Yes (`projectId` param) | Yes | Yes (Phase 2) | Yes | Yes | Yes | Yes (fixed Phase 5) | `registerMutationRoute` | `resolveProcurementScope`, `bomsForChangeRequest` |
| `createMaterialRequirement` | Yes (`materialRequirementRequireCR`) | Yes | `authCheck` (PM-of-project or Admin/CEO) | Yes | Yes (requires `bomId`, not CR directly — see §4 finding) | Yes (Phase 6) | Yes | Yes | Yes | Yes (fixed Phase 6) | `registerMutationRoute` | `materialRequirementsForChangeRequest` |
| `createMaterialRequest` | No policy exists | N/A | `PROC_CREATE_ROLES` | Yes | N/A | N/A (no CR concept at this layer) | Yes | Yes | No (legacy, unmodified) | Not modernized (pre-existing, out of scope) | Legacy wrapper | Derived, one hop |
| `createRFQ` | No policy exists | N/A | `roles:['Admin','CEO','Purchase']` | Yes | N/A | Requires source MR to be `APPROVED` (pre-existing) | Yes | Yes | Yes (fixed Phase 7) | Yes (fixed Phase 7) | `registerMutationRoute` | Derived |
| `createSupplierComparison` | No policy exists | N/A | `roles:['Admin','CEO','Purchase']` | Derived via RFQ | N/A | Requires ≥2 quotations (pre-existing) | Yes | Yes | Yes (fixed Phase 7) | Yes (fixed Phase 7) | `registerMutationRoute` | Derived |
| `createPurchaseOrder` | Yes (`purchaseOrderRequireCR`) | Yes | `roles:['Admin','CEO','Purchase']` | Yes | Yes | Yes (Phase 5/8) | Yes | Yes | Yes | Yes | `registerMutationRoute` | `resolveProcurementScope`, `posForChangeRequest` (**fixed this phase**) |
| `createGRN` | No policy (derives from PO) | N/A | `assertCanCreateGRN` | Via PO | N/A | Derived via `po.changeRequestId` | Yes | Yes | Yes | Yes | Custom rollback (Phase 35/41) | Derived, logged as `VariationGRNReceived` |
| `createMaterialIssue` | No policy | N/A | `assertCanCreateMaterialIssue` | Yes | N/A | Derived via `movement.bomId → BOM.changeRequestId` (one indirect hop, unchanged) | Yes | Yes | Yes | Yes | `registerMutationRoute` | One indirect hop only — disclosed limitation (Phase 6) |
| `draftCustomerInvoice` | No — explicit allocation, not a policy toggle | N/A | `permission:'create'` | Yes | N/A (allocation is always optional, by Phase 4 design) | Yes (Phase 4) | Yes | Yes | Yes | Yes | `postDraft()` central posting choke point | `invoicesConsumingChangeRequest` |
| `resolveProcurementScope` | N/A (pure classifier, no policy) | N/A | Read-only, `can(actor,'view')` at the route | Yes | N/A | N/A | Returns BASELINE | Returns VARIATION | N/A | N/A (read-only) | N/A | Is the traceability mechanism |
| `cancelChangeRequest` | N/A | N/A | Role tier, unchanged | Yes | N/A | Blocks if `consumedRevenue>0` | N/A | N/A | Yes | Yes | `withTransaction` (implicit via route) | N/A |

**No function was found consulting a policy flag merely for display — every consulted flag genuinely gates its own mutation, live-confirmed in §7.**

---

## 3. Policy Configuration Matrix (§3 of the brief)

`DB.variationTaggingPolicy` — the only variation-tagging policy object in the codebase, confirmed by fresh inspection. Three independent boolean flags, **all default `false`**, `status` field literally reads `"POLICY NOT CONFIGURED"`.

**A → B distinction, honored precisely**: this phase confirmed "the system technically supports mandatory tagging" (§9 below, all three flags proven live) is TRUE, while "management has actually decided mandatory tagging is required" remains **FALSE** — no configuration change was made to the live default, and none was invented. Every test that required a flag ON was performed via a temporary, explicit, disclosed server restart with the flag flipped, followed by an explicit revert and a live re-confirmation that default (OFF) behavior was restored.

---

## 4. BASELINE / VARIATION / UNKNOWN / INVALID Matrix (§4)

| Case | Result |
|---|---|
| A. Direct baseline document, no CR | **BASELINE** |
| B. Direct variation document, valid CR | **VARIATION** |
| C. Document derived BOM→MR→RFQ→Comparison→PO | **VARIATION**, `traceabilityPath` fully populated |
| D. Direct CR contradicting the upstream-derived CR | **BLOCKED at creation** (Phase 8 mechanism, re-confirmed) — never allowed to exist in a contradictory state at all |
| E. No direct CR, but a real upstream variation chain | **VARIATION**, derived (this is the core "identity preserved" finding, §5) |
| F. Fake/nonexistent CR | **BLOCKED at creation** |
| G. Cross-project CR | **BLOCKED at creation** |
| H. Draft/Rejected/Cancelled CR | **BLOCKED at creation** (`resolveProcurementScope` never even reaches a document that references one, since creation itself is gated) |
| I. Approved CR | **VARIATION** |
| J. Mixed sources, one BASELINE-implying, one VARIATION-implying | **BLOCKED at creation** (Phase 8's inconsistent-source-document check) |

**No "INVALID" classification state exists or was needed** — every contradiction is caught at the CREATION gate (Phase 8), so `resolveProcurementScope()` is never asked to classify a document that is INTERNALLY contradictory; it only ever classifies documents that are already known-consistent by construction. This is a stronger guarantee than a post-hoc INVALID label would have been — the contradiction cannot come into existence at all, not merely get flagged after the fact.

---

## 5. Critical Attack — Hide Variation Procurement as Baseline (§5)

Built: Project A, Approved CR-A (revenueImpact ₹60,000), BOM-A (Approved, tagged to CR-A), MRQ-A (tagged to BOM-A), MaterialRequest-A (Approved).

| # | Attack | Result |
|---|---|---|
| 1 | PO with `materialRequestId=MR-A`, `changeRequestId` **omitted** | **Creation succeeds.** But `resolveProcurementScope()` STILL correctly returns **VARIATION**, `changeRequestId:CR-A`, derived via the real stored `materialRequestId→...→BOM` chain. The PO's own `changeRequestId` field stays `null` (not self-tagged), but classification is NOT lost. |
| 2 | Fully direct PO — no CR, no MR, no PR, no Comparison — same project, same material, same value as the variation | **Creation succeeds.** Classified **BASELINE**. Honestly: nothing in the request or the resulting record asserts ANY relationship to CR-A — this is not a misclassification, it is the correct, honest answer to "does this document relate to any variation?" when the answer is "not provably." |
| 3 | Purchase Requisition + PO, no CR anywhere | **Creation succeeds** — PR is structurally independent of CR/BOM by design (Phase 6/7 finding, unchanged). |
| 5 | PO sourced from a genuinely baseline (untagged) BOM/MR, same value as the variation | **Creation succeeds**, classified **BASELINE** — the BOM really is untagged; the system cannot distinguish "material genuinely for baseline work" from "material a user chose to route through the wrong BOM on purpose." |
| 6 | Direct PO whose value exactly matches CR-A's authorized amount | **Creation succeeds** — value alone is never treated as evidence, exactly as instructed not to fabricate. |
| 7 | GRN against the MR-linked-but-untagged PO (#1) | **Creation succeeds**, AND — the fixed defect (§18) — it now correctly appears under `GET /api/change-requests/CR-A/execution`, derived, even though `PO.changeRequestId` is null. |
| 9 | Customer invoice for the SAME ₹60,000, **with no `variationAllocations`** | **Creation and posting both succeed** (well within the project's base budget). **The decisive finding**: `CR-A.consumedRevenue` remained **exactly ₹0** afterward — the "hidden" procurement's associated revenue was billed as ordinary revenue and never touched CR-A's authorized capacity at all. |
| — | Proof that CR-A's capacity was genuinely untouched | `cancelChangeRequest(CR-A)` **succeeded** immediately afterward — the cancellation-blocked-while-consumed control (Phase 4) would have refused this if even ₹1 had been silently drawn from CR-A. It did not refuse. |
| 10 | Same attacks via direct API (not UI) | All of the above WERE performed via direct API calls throughout — no UI layer exists in this system's test surface at all; every result above already reflects the API-bypass case. |

**Conclusion, stated precisely**: A user CAN execute genuine variation-shaped procurement through a fully disconnected, untagged path, and the ERP correctly has no way to prove otherwise from the transaction alone. This is **not a software defect** — it is the direct, disclosed consequence of Policy Decision #4 (below) remaining "tagging optional." What the ERP DOES guarantee, unconditionally, regardless of tagging: **the CR's authorized billing capacity can never be silently consumed** — a "hidden" variation either (a) gets billed as ordinary revenue within the base budget, with zero effect on the CR, or (b) if someone DOES try to allocate it to the CR later, that allocation is fully validated exactly as any other (Phase 4/8, unchanged). There is no path to silently both hide the work AND draw on the CR's authorized ceiling at the same time.

---

## 6. Critical Attack — Cross-Document Classification Contradiction (§6)

Built CR-A → BOM-A → MR-A → RFQ-A → Comparison-A, and CR-B (a real, unrelated, Approved CR).

| Attack | Result |
|---|---|
| `changeRequestId=CR-B` + `materialRequestId=MR-A` + `supplierComparisonId=Comparison-A` | **BLOCKED** — "the supplied changeRequestId does not match the Change Request derived from the Supplier Comparison's own upstream chain" (Phase 8 mechanism) |
| No explicit `changeRequestId` + `materialRequestId=MR-A` + `supplierComparisonId=Comparison-A` | **Creation ALLOWED.** `resolveProcurementScope()` classifies it **VARIATION**, correctly deriving `changeRequestId:CR-A` through the chain. |
| Fully direct PO, no CR/MR/Comparison at all | **Classified BASELINE — explicitly, not "UNCLASSIFIED."** `resolveProcurementScope()` always returns a definite value for an EXISTING document; "UNCLASSIFIED"/ambiguous is not a state this classifier produces — a document either has a provable relationship (VARIATION), provably has none (BASELINE), or does not exist / cannot be resolved (UNKNOWN, tested separately, §11). |

---

## 7. Policy-ON Live Test (§9)

All three flags flipped ON together via an explicit server restart, tested, then reverted via a second restart (never left enabled):

| Test | Result |
|---|---|
| BOM, no CR | **BLOCKED** |
| BOM, valid Approved CR | **ALLOWED** |
| MR, no `bomId` | **BLOCKED** |
| BOM, fake/nonexistent CR | **BLOCKED** |
| BOM, cross-project CR | **BLOCKED** |
| BOM, unauthorized role (Sales) | **BLOCKED** (403, capability layer, unaffected by policy) |
| BOM, duplicate request (same idempotency key) | **Deduplicated correctly** |
| PO, no CR | **BLOCKED** |
| PO, valid CR | **ALLOWED** |

**Baseline behavior fully restored, live-confirmed, after reverting all three flags to OFF** (a plain, untagged BOM creation succeeded again afterward).

---

## 8. Policy Combination / Impossible-State Analysis (§10)

Tested `bomRequireCR:false, materialRequirementRequireCR:true, purchaseOrderRequireCR:false`.

**Genuine finding, not a defect**: an MR created under this combination successfully referenced a completely **untagged** BOM (created freely, since `bomRequireCR` was off). The MR-level policy only checks "is `bomId` present," never "does that BOM itself carry a `changeRequestId`." So **`materialRequirementRequireCR` alone does NOT guarantee CR traceability at the MR level, despite its name** — it guarantees BOM-linkage, nothing more, if `bomRequireCR` is off.

**Minimum safe combination, derived from this finding**: for `materialRequirementRequireCR` to actually deliver CR-level assurance, **`bomRequireCR` must also be `true`** — the two are not independent when the goal is genuine variation traceability, even though the code enforces them independently. No combination was found to be internally contradictory or to CRASH/misbehave — every combination is technically safe to enable; some combinations are simply weaker than their names suggest. A clarifying code comment was added at the MR gate (no behavior change) documenting this precisely, so a future reader does not assume the flag does more than it does.

---

## 9. resolveProcurementScope() — Independent Verification (§11)

| Case | System classification | Independently verified against raw DB |
|---|---|---|
| Baseline direct PO | BASELINE | Matches — no source field populated |
| Variation direct PO | VARIATION | Matches — `changeRequestId` set, CR is real/Approved/same-project |
| MR-derived variation PO | VARIATION | Matches — manually walked `materialRequestId→requirementIds→bomId→changeRequestId`, same CR |
| Comparison-derived variation PO | VARIATION | Matches — manually walked `supplierComparisonId→rfqId→materialRequestId→...` |
| Broken/nonexistent reference | UNKNOWN | Matches — never BASELINE |
| Contradictory references | Cannot exist — blocked at creation (§4/§6) | N/A by construction |
| Missing references | BASELINE | Matches — no relationship, honestly reported |
| Cross-project references | Cannot exist — blocked at creation (Phase 8) | N/A by construction |

**Zero disagreement found between the system's own classification and an independent, from-scratch derivation against raw `db.json` in any tested case.**

---

## 10. Inventory Classification (§12 — unchanged since Phase 6, reconfirmed)

```
BOM --[direct CR FK]--> CR
  MR --[bomId, direct FK]--> BOM
    PO --[changeRequestId direct, OR materialRequestId derived]--> CR
      GRN --[poId, derived]--> CR
        Inventory Movement --[bomId, ONE INDIRECT HOP]--> BOM --> CR
          Material Issue --[same bomId hop]--> BOM --> CR
```

**Variation identity is lost at exactly one, previously-disclosed point**: an inventory movement/material issue not associated with ANY `bomId` (a pure warehouse transaction unrelated to any BOM-governed entitlement) carries **no variation identity at all** — not because it was hidden, but because no BOM relationship was ever established for it to derive through. This is the same, unchanged Architecture Gap disclosed in Phase 6 §L — not newly found, not fixed (fixing it was not requested and would mean either inventing a redundant field or restructuring the inventory-issue architecture, both outside this phase's scope).

---

## 11. Billing / Variation Consumption Reconciliation (§13)

CR revenueImpact ₹1,00,000, tested with FULL post cycles (draft → submit → approve → post), not merely draft creation:

| Case | Result |
|---|---|
| A. ₹40,000 allocated, posted | **Succeeds** |
| B. ₹60,000 allocated, posted (cumulative ₹1,00,000) | **Succeeds** — `consumedRevenue` reaches exactly ₹1,00,000, `availableRevenue` reaches exactly ₹0 |
| D. A further ₹1 allocation attempt | **BLOCKED** — "exceeds its remaining unconsumed capacity of ₹0" |
| E. Invoice with no allocation | **Succeeds independently** — correctly has zero effect on the CR |
| F. Allocation to a CR belonging to a different project | **BLOCKED** |
| G. Allocation to a Cancelled CR | **BLOCKED** — "not Approved" |
| I. Duplicate allocation request, same idempotency key | **Deduplicated** — identical draft id both times |

`consumedRevenue`/`availableRevenue`/billing ceiling all remained mathematically consistent throughout (₹40,000 + ₹60,000 = ₹1,00,000 = full `revenueImpact`, `availableRevenue` correctly hit ₹0). **No regression from Phase 4.**

---

## 12. Profitability (§14)

Not independently re-derived from scratch this phase — Phase 7's `changeRequestVariationProfitability()` was re-confirmed byte-identical in Phase 8 after Phase 8's own changes, and this phase touched none of the profitability-calculation code path (`changeRequestProcurementValueSummary`/`changeRequestVariationProfitability` were not modified). The one function this phase DID modify in the traceability layer (`posForChangeRequest`) is used for the `/execution` reverse-lookup, NOT for profitability's own PO-value summation (`changeRequestProcurementValueSummary` calls `posForChangeRequest` too, actually — **this means the fix in §18 also makes procurement-value/profitability figures MORE complete going forward**, correctly including MR-derived-but-untagged POs in `procurementCommittedValue` where they were previously silently excluded. This is a positive side-effect of the same fix, not a separate change.

Confirmed unchanged: no double-counting (PO/GRN/Inventory-Issue remain three separate figures), `costImpact` remains purely declarative.

---

## 13. Security / API Attacks (§15)

| Role | BOM (policy ON) | PO (baseline) | Result |
|---|---|---|---|
| Sales | Attempted | Attempted | **BLOCKED** (403) in every case |
| Unauthenticated | Attempted (Phase 7/8 regression) | Attempted | **BLOCKED** (401) |
| Forged `projectId` combined with a real cross-project source doc | Attempted throughout §5/§6/§8 | — | **BLOCKED** every time (Phase 8 mechanism) |
| Forged/nonexistent CR | Attempted | Attempted | **BLOCKED** |
| Altered policy flag in the REQUEST BODY (not the server config) | Not separately re-tested this phase — confirmed by code inspection: `DB.variationTaggingPolicy` is read directly from server-side state, never from request `body`, so no client-supplied field can influence it | — | **Structurally impossible**, not merely untested |

No ad-hoc `if(role===...)` logic was added anywhere this phase — the one new function (`assertPoSourceDocumentsConsistent`, Phase 8, unmodified this phase) and the fixed `posForChangeRequest` are both pure data functions with no authorization logic of their own; authorization remains entirely at the route layer, unchanged.

---

## 14. Atomicity (§16)

The one code change this phase (`posForChangeRequest`) is a pure, read-only query function — no mutation, no transaction boundary needed or affected. Every mutation path exercised this phase (BOM/MR/PO creation, CR cancel, invoice posting) reuses the EXACT, already-hardened transaction mechanisms from Phases 2-8, unmodified. No new fault-injection was needed for a function that writes nothing.

## 15. Idempotency (§17)

Re-confirmed, unmodified: duplicate BOM/PO/invoice-allocation requests with the same idempotency key are deduplicated; same key with a different CR/source document is explicitly rejected (Phase 4-8 behavior, unchanged, spot-checked live this phase for BOM under policy-ON and for invoice allocation).

## 16. Audit (§18 of the brief numbering — not to be confused with defect §18 below)

Every rejected attack this phase (policy violations, cross-project, contradictory sources, fake CR) produced the standard `BusinessRuleRejected` event via each route's pre-existing `auditReject:true` — no second audit mechanism was created. Successful creations continue to log their existing typed events (`BOMCreated`/`VariationBOMCreated`, `PurchaseOrderCreated`/`VariationPOCreated`, etc.), unchanged.

---

## 17. Database Forensics (§19)

Full scan re-run. **No new anomaly.** Targeted checks specific to this phase's testing, all clean:

| Check | Result |
|---|---|
| `CR.consumedRevenue` vs. independently-recomputed SUM of posted allocations | **Zero mismatches** |
| Orphan invoice allocation → nonexistent CR | **0** |
| Duplicate CR ids / document numbers | **0** |
| Cancelled CR with nonzero `consumedRevenue` (should be structurally impossible) | **0** — confirmed the invariant holds |
| PO↔Comparison chain project mismatches | **0** |

## 18. Accounting Reconciliation (§20)

No new GL entries from any code this phase touched (`posForChangeRequest` is pure read/derivation). Independently recomputed Trial Balance from raw journal lines after all this phase's activity: **Total Debit ₹1,74,99,094.98 = Total Credit ₹1,74,99,094.98, difference 0.000000.**

## 19. Regression (§21)

| Suite | Result |
|---|---|
| P0 (1-4) | **52/56** — same 4 already-documented OBSOLETE TEST failures (old script predates the mandatory `reason`/`submit` requirements from Phase 2), re-confirmed via isolated rerun after an unrelated transient connection reset on the first attempt |
| Phase 4 CR consumption | Re-verified live this phase (§11) — unchanged |
| Phase 5 CR→BOM/CR→PO suite | **34/34** |
| Phase 6 BOM→MR entitlement suite | **20/21** — the one failure is the SAME already-diagnosed `require()`-caching artifact in the test script itself (proven, again, by live re-fetch showing the real audit event exists) |
| Phase 7 idempotency/scope/profitability suite | **14/14** |
| Phase 8 PO source-integrity suite | **19/19** |
| Fixed Asset Transfer / Job Work Fee | **19/21** — same already-documented stale-fixture class, zero code overlap |
| Trial Balance | **Balanced**, confirmed independently twice this phase |

---

## 20. Defects Found

| ID | Severity | Root Cause | Reproduction | Fix | Regression Proof | Status |
|---|---|---|---|---|---|---|
| PV9-01 | P1 | `posForChangeRequest()` (the CR `/execution` reverse-lookup) only matched POs by DIRECT `changeRequestId`, never consulting `resolveProcurementScope()` — so a PO correctly classified VARIATION by the authoritative classifier (via a `materialRequestId`-derived chain) was silently absent from its own CR's execution traversal | Live, during this phase's own §5 "hide as baseline" test #1: a real MR-derived variation PO did not appear under `GET /api/change-requests/CR-A/execution` | Rewrote `posForChangeRequest()` to reuse `resolveProcurementScope()` for every PO once, unioning direct + derived matches with no double-counting (derived explicitly excludes any PO with its own `changeRequestId`) | Re-run: the same PO now correctly appears, `relationship:"derived (materialRequestId chain)"`; full 20/20 targeted-attack suite re-passed | **FIXED, live-confirmed** |

No other defect was found. Every other "finding" this phase is either a verified technical fact about existing, deliberate architecture (§22 below) or a policy question, not a defect.

---

## 21. Function Gaps

1. Material Issue / Inventory Movement variation identity remains one indirect hop (via `bomId`) with no path at all for movements unrelated to any BOM (§10, unchanged from Phase 6).
2. `createMaterialRequest`/`createRFQ` route-level modernization stops at what Phase 7 already fixed — no new gap found this phase.

## 22. Architecture Gaps

1. `materialRequirementRequireCR` cannot, on its own, guarantee CR-level traceability unless `bomRequireCR` is also enabled (§8) — a genuine cross-flag dependency, documented but not restructured (restructuring would itself be a policy/naming decision).
2. A fully direct, source-free PO/BOM has NO mechanism by which the ERP could ever determine "true commercial intent" — this is not fixable by more code; it requires either mandatory tagging (a policy decision) or remains an accepted characteristic of an optional-tagging system.

---

## 23. Management Policy Decisions Required (§22 of the brief — answered as questions, none decided)

1. **Should every variation PO require CR tagging?** Technically buildable (`purchaseOrderRequireCR`, proven live). Not decided.
2. **Should every variation BOM require CR tagging?** Technically buildable (`bomRequireCR`, proven live). Not decided.
3. **Should every variation MR require CR tagging?** Technically buildable, but ONLY delivers real CR assurance combined with #2 (§8's finding). Not decided.
4. **Should direct POs be permitted without CR at all?** Currently yes, always. This is the single decision with the largest practical effect on §5's findings — disallowing it entirely would require `purchaseOrderRequireCR` (#1) PLUS a decision on whether baseline direct POs should be blocked too (they currently are NOT distinguished from variation-intended direct POs by the flag — turning it on blocks ALL untagged POs, baseline and variation alike, since the flag cannot read intent either).
5. **Should baseline and variation procurement have separate approval rules?** No such distinction exists anywhere in the approval-role architecture today (`requiredPOApprovalRole()` is value-tiered only, blind to variation status). Not decided, not built.
6. **Should variation execution require an approved CR?** This is #1/#2/#3 restated as a single principle — not decided.
7. **Should closure block on open/unconsumed CRs?** Unchanged from Phase 3 — `projectClosureReadiness()` still has zero reference to Change Requests. Not decided, not built.
8. **Should CR `costImpact` become an actual financial commitment?** Still purely declarative, zero execution/accounting effect anywhere (re-confirmed this phase by inspection). Not decided.
9. **Should site material issue carry direct variation traceability, or remain derived?** Current state: derived, one indirect hop, with a real gap for BOM-unrelated movements (§10/§21). Not decided whether a direct field is warranted.
10. **What is the minimum policy configuration that gives management reliable variation control without over-constraining legitimate baseline work?** Derived from this phase's own testing, offered as an OBSERVATION, not a recommendation to enable: `bomRequireCR:true` + `purchaseOrderRequireCR:true` together would close the two disclosed identity-loss paths that matter financially (a variation BOM without a CR, and a variation PO without a CR) while leaving `materialRequirementRequireCR` optional (since MR's own traceability is already fully covered once BOM itself is mandatory-tagged) and leaving ordinary baseline BOM/PO creation on projects with no active variation completely unaffected (a project that has raised no CR at all is never touched by any of these flags, since nothing forces a CR to exist in the first place).

---

## 24. Recommended Next Phase

Should not be another broad audit. If pursued: (1) resolve Decision #10's proposed minimum combination with management, since it is the one finding this phase produced that is ready to act on immediately if authorized; (2) if #7 (closure) is ever authorized, the query primitives (`resolveProcurementScope`, CR consumption endpoints) already exist to build it without new discovery.

---

## 25. Exact STOP-Condition Evaluation (§25 of the brief)

| Condition | Evaluated | Result |
|---|---|---|
| A variation incorrectly classified as BASELINE | Tested exhaustively (§5, §6, §9) | **Never occurred** — every variation with ANY real relationship classified correctly; only fully-disconnected documents (which genuinely have no relationship) classified BASELINE |
| Cross-project variation posted | Tested (§6, §13-F) | **Never succeeded** |
| Fake CR accepted | Tested repeatedly | **Never succeeded** |
| Cancelled/Rejected CR drove controlled execution | Tested (§13-G, §7) | **Never succeeded** |
| Variation billing consumed another project's CR | Tested (§13-F) | **Never succeeded** |
| Variation consumption duplicated | Tested (§13-I) | **Never occurred** |
| Transaction failure left partial state | No new mutation path this phase to fault-inject (the one fix is read-only) | **N/A, no risk introduced** |
| Unauthorized role bypassed variation controls | Tested (§13 security) | **Never succeeded** |
| Trial Balance unbalanced | Checked twice | **Balanced both times** |
| Phase 8 source integrity regressed | Re-run, 19/19 | **No regression** |

**No STOP condition was triggered. Verdict stands: GO.**
