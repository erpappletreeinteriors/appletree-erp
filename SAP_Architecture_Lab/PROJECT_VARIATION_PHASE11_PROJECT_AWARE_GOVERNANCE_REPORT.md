# APPLETREE ERP — PHASE 11: PROJECT-AWARE VARIATION GOVERNANCE + SAFE MANDATORY TAGGING DESIGN
**Lab:** SAP_Architecture_Lab (isolated experimental environment — no connection to the live/offline production Appletree ERP)
**Date:** 2026-09-08

---

## 1. EXECUTIVE VERDICT

A project-aware variation governance mechanism was designed, implemented, and load-bearing-tested this phase — narrower, more precise, and genuinely safer than Phase 10's blunt global flags, but **it is NOT a complete replacement for them, and it remains OFF in the live system** (default `enabled:false`).

**Central architectural finding**: a mandatory "every BOM/PO must carry a CR" rule cannot be made safe merely by scoping it to variation-active projects — it must be scoped to *documents whose own upstream chain already proves variation lineage*. Scoping by project alone (Phase 10's naive fix) still blocks legitimate baseline BOM/PO creation on any mixed project. Scoping by chain-lineage (this phase's actual design) closes a real gap — a PO whose chain proves it belongs to Change Request X but that omits saying so explicitly — **without ever touching a document that has no such lineage**, live-proven across every baseline/mixed/variation scenario in the brief.

This distinction turned out to only be buildable for **Purchase Orders**, not BOMs: a BOM sits at the *root* of the traceability chain, so there is no upstream signal to detect "this BOM should have inherited a CR but didn't." Building a BOM-level mandatory rule would necessarily reproduce Phase 10's blunt flaw (block all untagged BOMs) or require inventing a new, unauthorized intent signal. This is reported as a genuine, disclosed **architecture gap**, not silently worked around.

One new, narrowly-scoped policy flag was added — `variationTaggingPolicy.enabled` + `purchaseOrderRequireCRForVariation` — implemented as a chain-derivation check inside the already-existing `assertPoSourceDocumentsConsistent()`/`createPurchaseOrder()` code path (no second policy mechanism, no new transaction/idempotency/audit architecture). It was tested via the same temporary flip-then-revert methodology as every prior phase and is now **OFF** in the live db.json, confirmed on disk.

A new, purely **derived** helper `variationActive(projectId)` (= "does this project currently have at least one Approved Change Request") was added — never stored, so it can never drift out of sync, and it is **intentionally reversible**: if a project's only Approved CR is later cancelled (only possible pre-consumption), the project reverts to not-variation-active. This reversibility was found live in the real historical database (not only in synthetic tests) — 3 pre-existing projects already exhibit exactly this state, plus 1 new one from this phase's own testing. Whether governance should instead be permanently "sticky" once triggered is left as an explicit, undecided **management decision** — a sticky model would require stored state, deliberately not built without that authorization.

Full regression across 8 suites (P0 + Phases 5–9 + Quick Fixes + Site Return) plus both of Phase 10's own suites: **zero real regressions from this phase's code changes.** Every failure traced to one of two already-known, disclosed causes: (a) transient contention from an early mistake running two heavy suites concurrently against the single dev server (self-corrected, re-proven clean on isolated re-run), or (b) a cascading, already-disclosed consequence of **PRJ-1 having been permanently closed during Phase 10's own live testing this same session** — a fact that turned out to affect a wider swath of shared test fixtures than Phase 10's own report anticipated (see §20).

Trial Balance closed the phase perfectly balanced: **₹20,506,689.00 = ₹20,506,689.00** across 1,521 posted journal entries. CR-consumption reconciliation: 0 mismatches across all 194 Change Requests in the database.

**Recommendation: STOP here**, per the brief's own closing instruction. The architectural question — can variation governance be made load-bearing without breaking legitimate baseline work — is conclusively answered: yes, for Purchase Orders, via chain-derived enforcement; no, not yet, for BOMs, without either accepting Phase 10's blunt behavior or a new authorization to invent an intent-declaration mechanism.

---

## 2. EXISTING ARCHITECTURE (Discovery)

Inspected before any design decision:

- **`DB.projects`**: created via `wonTransition()` (from an accepted quotation) or `createProjectMaster()` (migration-style). Fields: `id, name, budget, customerId, leadId, quotationId, projectManagerId, site, status ('PLANNED'/'ACTIVE'/'CLOSED'), approvedRevenue, createdBy, createdAt`. **No variation-related field exists on Project today.**
- **`DB.changeRequests`**: lifecycle `Draft → Submitted → Approved/Rejected`, plus `Approved → Cancelled` (only when `consumedRevenue===0`). No "Superseded" state exists (deliberate — approved variations are additive, not mutually exclusive, per an existing code comment from Phase 2). `consumedRevenue` and `availableRevenue` (= `revenueImpact - consumedRevenue`, never stored) follow this codebase's established "derive, don't store" convention.
- **`DB.variationTaggingPolicy`**: Phase 7's blunt flags (`bomRequireCR`, `materialRequirementRequireCR`, `purchaseOrderRequireCR`), all default `false`. An existing code comment (Phase 7, predating this phase) had *already* anticipated exactly this phase's central question and concluded: "'REQUIRED_FOR_VARIATION' specifically has no independent signal in this data model for what makes a document 'variation work' other than the very tag being made mandatory... left explicitly unbuilt, not guessed at." This phase's contribution is finding the one place (PO's upstream chain) where that signal *does* independently exist.
- **`resolveProcurementScope({docType, docId})`**: the existing, unmodified classification engine. For BOM: `scope = bom.changeRequestId ? 'VARIATION' : 'BASELINE'` — a direct field check, no upstream chain (BOM is the root). For MaterialRequirement: derives from `bomId` if present. For PurchaseOrder: checks `po.changeRequestId` first (direct), then `materialRequestId → requirementIds → MaterialRequirement` (derived).
- **`assertPoSourceDocumentsConsistent()`** (Phase 8, fixed Phase 10): already computes a `derivedChangeRequestId` by walking the PO's `materialRequestId`/`supplierComparisonId` chain — this exact, already-existing computation is what this phase's new check reuses (returned from the function rather than duplicated).
- **`cancelChangeRequest()`**: only blocks cancellation when `consumedRevenue>0` — it does **not** check for dependent BOMs/POs. This is the mechanism behind the "stale tag after cancellation" scenario this phase had to design around (see §9).

---

## 3. VARIATION-STATE CANDIDATES

| Candidate | Evidence | Advantages | Risks | Spoofable? | Reversible? | Verdict |
|---|---|---|---|---|---|---|
| **`EXISTS Approved CR for project`** (derived, live) | `DB.changeRequests.some(cr=>cr.projectId===projectId && cr.status==='Approved')` | Never stored, can't drift; recomputed on every check; matches this codebase's established `availableRevenue`-style discipline | Reversible if the sole Approved CR is later cancelled (pre-consumption only) — a real, disclosed edge case, not a defect | No — only the real, role-gated `approveChangeRequest()`/`cancelChangeRequest()` flows can move a CR in/out of Approved status | Yes, by construction | **SELECTED** |
| `project.variationActive` (stored flag) | Would need a new field, a setter, and drift-prevention logic | Could be made permanently "sticky" if desired | New redundant state; must be kept in sync with CR status by hand; violates this phase's own "prefer derived, avoid redundant state" instruction | Depends on who can write it — a new attack surface | Only if explicitly coded to be | Rejected — no compelling reason to duplicate state that is already fully computable |
| First Approved CR / Approved CR count | Same underlying data as the `EXISTS` form, just a different aggregate | No real advantage over `EXISTS` | Unnecessary complexity | N/A | N/A | Rejected — `EXISTS` is sufficient and simpler |
| Project status (`ACTIVE` vs `PLANNED`/`CLOSED`) | Exists today | Already stored | Completely unrelated concept — a project is `ACTIVE` from the moment work begins, regardless of variation history | N/A | N/A | Rejected — conflates two unrelated dimensions |
| Accepted quotation revision | No revision concept exists on `DB.quotations` today | N/A | Would require inventing new schema | N/A | N/A | Rejected — not an authoritative signal in this data model |

---

## 4. SELECTED ARCHITECTURE AND JUSTIFICATION

```js
function variationActive(projectId){
  return DB.changeRequests.some(cr => cr.projectId===projectId && cr.status==='Approved');
}
```

Pure, derived, exported alongside `resolveProcurementScope`. No new stored field on `Project`. This function alone answers **"is this project subject to project-aware governance at all"** — it deliberately does **not** and must **not** answer "which variation does this specific document belong to" (that remains the job of the existing, unmodified per-document CR fields and `resolveProcurementScope`'s chain-walk — see §10's multi-CR test, which confirms project-level state never overrides document-level identity).

---

## 5. POLICY SEMANTICS

Extended (not replaced) `DB.variationTaggingPolicy`:

```json
{
  "bomRequireCR": false, "materialRequirementRequireCR": false, "purchaseOrderRequireCR": false,
  "enabled": false, "purchaseOrderRequireCRForVariation": false,
  "status": "POLICY NOT CONFIGURED — every flag OFF; no management decision exists yet"
}
```

- The three Phase 7 flags are **untouched** — kept for backward compatibility, still the old blunt "every document, project-wide" semantics, still not recommended (per Phase 10's own finding).
- `enabled` is the master switch for the new mechanism.
- `purchaseOrderRequireCRForVariation` — **the only new enforcement flag** — only fires when a PO's own upstream chain (already independently derived by the pre-existing `assertPoSourceDocumentsConsistent()`) resolves to a Change Request that is **currently** Approved, and the PO omits that CR explicitly.
- **Deliberately no `bomRequireCRForVariation` key.** Adding a schema field that, when set `true`, would do nothing (or would have to fall back to Phase 10's blunt behavior) was judged worse than not offering it at all — see §21 Architecture Gaps.
- Migration guard added for existing `db.json` files predating these two keys (defaults both to `false`, mutates nothing else).

---

## 6. BASELINE-PROJECT BEHAVIOR (§5)

Fresh project (`PRJ-193`), zero CRs, full chain tested end-to-end with the new code in place, policy at its permanent default (`enabled:false`):

BOM (submit→approve) → Material Requirement (submit→approve) → Material Request (submit→approve) → RFQ → PO, **plus** a fully disconnected direct BOM and direct PO (no relationship at all). **12/13 passed** — the one failure was the test script's own wrong approver role choice (harmless; the requirement was still usable downstream), not a defect. All baseline documents created without friction, exactly as before this phase.

---

## 7. MIXED-PROJECT BEHAVIOR (§6/§7/§11)

`PRJ-194` with Approved CR-A (revenueImpact ₹100,000), policy temporarily flipped ON:

| Test | Result |
|---|---|
| A. BOM without CR on a variation-active project | **ALLOWED** — baseline work never blocked |
| B. BOM with CR-A | ALLOWED |
| C. Direct PO, no chain at all, on a variation-active project | **ALLOWED** — the new check never fires without chain lineage |
| D. PO with CR-A (direct) | ALLOWED |
| E. **PO derived from CR-A's chain (via variation BOM → MRQ → MR), no direct CR** | **BLOCKED** — "supply changeRequestId:CR-A explicitly rather than leaving it implicit" — this is the new mechanism's actual target |
| E2. Same PO, now WITH the correct CR-A | ALLOWED (no false positive) |
| F. PO with cross-project CR | BLOCKED |
| G. PO with a Cancelled CR (CR-0108) | BLOCKED |
| H. PO with a fake CR | BLOCKED |

**16/16 Stage B tests passed.** Execution report for CR-A confirms the correct BOM/PO set is attributed — baseline BOM-A and baseline direct PO-C never appear in CR-A's execution trace; only the CR-linked documents do. §11's "attempt to swap the relationship" concern was tested by construction throughout (E vs. E2, F/G/H) — every attempted contradiction was blocked, and no baseline document was ever misclassified VARIATION.

---

## 8. VARIATION-PROJECT BEHAVIOR / CR LIFECYCLE (§9/§12)

**BOM matrix (§9)**: unchanged from Phase 10 — `bomRequireCR` remains a separate, untouched, still-OFF legacy flag. Live-confirmed this phase: a baseline BOM (no CR) succeeds even on `PRJ-195`, a project carrying **multiple** Approved CRs simultaneously — proving project-level variation activity, by itself, never blocks BOM creation.

**CR lifecycle (§12)**: CR-A on `PRJ-194` was cancelled (zero consumption, so cancellation was legal). Retested immediately after:
- A fresh baseline BOM on the now-not-variation-active project: **still succeeds.**
- A PO chained through the *same* BOM that carries CR-A's (now-stale) `changeRequestId`, no explicit CR: **ALLOWED**, not force-blocked. This is the deliberate **dead-end protection** designed into the check (§9 of this report, `derivedCr.status==='Approved'` guard) — forcing propagation of a CR that would itself now be rejected as non-Approved would be a dead end, not a control. Confirmed live, not merely reasoned about.

This directly answers the brief's own unresolved §12/§16 question: **the derived-state design is reversible by construction**, and that reversibility is the correct, tested, non-destructive behavior — not an oversight.

---

## 9. MULTIPLE-CR BEHAVIOR (§13)

`PRJ-195` with CR-A (₹10,000) and CR-B (₹20,000), both Approved. BOM-A→CR-A, BOM-B→CR-B, MR derived from BOM-B (→CR-B). Attempted `PO {changeRequestId: CR-A, materialRequestId: <the CR-B-derived MR>}`:

**BLOCKED** — "the supplied changeRequestId does not match the Change Request derived from the Material Request's own upstream chain" (Phase 10's existing contradiction check, unmodified, still the enforcing mechanism). This proves project-level `variationActive()` never substitutes for document-level CR identity — it only answers "is this project subject to governance," never "which CR does this document belong to."

---

## 10. BOM GOVERNANCE (§9 detail)

No new BOM-level check was added this phase (see §21 Architecture Gaps for why). Every existing BOM control (Draft/Rejected/Cancelled/fake/cross-project CR blocking, role gate, idempotency dedup, same-key-different-CR rejection) is Phase 7/10 code, unmodified, and reconfirmed clean this phase via the Phase 7/9/10 regression suites.

---

## 11. PO GOVERNANCE (§10 detail)

The new mechanism, precisely: inside `createPurchaseOrder()`, after `assertPoSourceDocumentsConsistent()` succeeds (proving no *contradiction*), a second check asks whether the chain proved *lineage without an explicit tag*:

```js
if(DB.variationTaggingPolicy.enabled && DB.variationTaggingPolicy.purchaseOrderRequireCRForVariation
   && _src.derivedChangeRequestId && !changeRequestId && variationActive(projectId)){
  const derivedCr = DB.changeRequests.find(c=>c.id===_src.derivedChangeRequestId);
  if(derivedCr && derivedCr.status==='Approved'){ return {ok:false, error:'...supply changeRequestId explicitly...'}; }
}
```

A PO with no chain relationship to any variation material — pure baseline work — is **never evaluated by this branch at all** (`_src.derivedChangeRequestId` is `null`), regardless of how many Approved CRs exist on the project. This is the structural guarantee behind §6/§7/§25's "must not block legitimate baseline work" requirement — not a behavioral promise, a code-level one.

---

## 12. API / SECURITY ATTACKS (§14)

Two rounds tested, the second specifically against a still-Approved (not dead-ended) chain for a rigorous proof:

- Forged `variationActive`, `variationTaggingPolicy`, `policy` objects injected directly into the PO request body: **zero effect** — both the control (no forgery) and the attack (with forgery) request produced the byte-identical `BLOCKED` result. The server reads policy exclusively from server-side `DB.variationTaggingPolicy` and computes `variationActive()` exclusively server-side; neither is ever read from the request body.
- No ad-hoc role check was added — the mechanism reuses the exact same `registerMutationRoute`/session-derived-actor architecture as every other endpoint.

---

## 13. ATOMICITY (§19 of the brief / §16 numbering above)

PO count read before and after a blocked chain-omission attempt: **372 → 372, unchanged.** The new check is pure pre-mutation validation — it runs entirely before `DB.purchaseOrders.push()`/`save()`, so a rejection can never leave a partial record, by the same construction as every other guard in this function.

---

## 14. IDEMPOTENCY (§20 of the brief)

The blocked chain-omission PO was retried with the **same** Idempotency-Key: byte-identical rejection both times. The new check does not touch the idempotency layer at all.

---

## 15. AUDIT (§21 of the brief)

No new audit event type was introduced for "variation governance activated." Reasoning: since `variationActive()` is derived, not stored, there is no discrete "activation" transition to log — the existing `ChangeRequestApproved`/`ChangeRequestCancelled` audit events (unmodified) already make the state fully explainable and reconstructable by any observer without a second, redundant event stream. Confirmed live this phase: 0 false-positive success-audit events (`VariationPOCreated`/`PurchaseOrderCreated`) were logged for any blocked attempt.

---

## 16. HISTORICAL-DATA FORENSIC SCAN (§17)

Scanned all 93 projects with any CR/BOM/PO activity, comparing `variationActive()`'s live-derived answer against actual stored document tags:

**4 projects** found where `variationActive()` currently returns `false` but variation-tagged BOM/PO documents still exist — the exact "stale tag after CR cancellation" scenario this phase's design anticipated and specifically protected against (§8/§9). 3 are pre-existing **HISTORICAL ARTIFACT** (Phase 9's own "HideVariation" test fixtures, `PRJ-132/134/191`, each with 1 Cancelled CR and 1 already-tagged BOM). 1 is this phase's **own TEST DATA** (`PRJ-194`, from the §12 lifecycle test above). No mutation was made to any of these records — the scan is read-only, and the design decision (dead-end protection) means these states are correctly, safely inert, not a data-integrity problem.

No cross-project CR references, no duplicate IDs, found in this scan (consistent with Phase 10's own clean forensic result).

---

## 17. ACCOUNTING RECONCILIATION (§18)

Independently recomputed, not read from a cached report, at the end of this phase's activity:

**Total Debit = ₹20,506,689.00, Total Credit = ₹20,506,689.00, Diff = ₹0.00 — balanced**, across 1,521 posted journal entries. CR-consumedRevenue reconciliation: **0 mismatches across all 194 Change Requests** in the database (every CR's stored `consumedRevenue` exactly equals the sum of its own Posted invoice `variationAllocations`). No new GL account, no new posting path, and no second accounting engine was introduced by this phase — the new check is pure validation logic with zero GL footprint, confirmed both by code inspection and by this independent recomputation.

---

## 18. PROFITABILITY RECONCILIATION (§23)

`PRJ-194` (this phase's own mixed-project fixture) ended the phase with 3 BOMs (1 variation-tagged, 2 baseline) and 5 POs (2 variation-tagged, 3 baseline). `changeRequestProcurementValueSummary('CR-0163')` returned a `procurementCommittedValue` of exactly the sum of *that CR's own* linked POs — **not** inflated by the project's other baseline PO activity, confirming no bleed/double-counting between baseline and variation procurement values sharing one project. `changeRequestProcurementValueSummary()`/`changeRequestVariationProfitability()` themselves were not modified this phase (still Phase 7 code) — this is a live confirmation that this phase's new gating logic has zero effect on downstream financial calculation, only on document creation.

---

## 19. CLOSURE-READINESS IMPLICATIONS (§22)

Per the brief's own instruction, **no closure policy was implemented this phase** (Phase 10 already established none is authorized). This phase's contribution is purely about the *primitives* now available for a future, separately-authorized closure phase:

| Question | Can it now be answered reliably? |
|---|---|
| Are there open CRs on this project? | **Yes** — `DB.changeRequests.filter(cr=>cr.projectId===X && ['Draft','Submitted'].includes(cr.status))`, trivial, already-existing data |
| Are there approved-but-unconsumed CRs? | **Yes** — `variationActive(projectId)` plus a `revenueImpact > consumedRevenue` filter, no new primitive needed |
| Are there variation POs still open (not fully received/billed)? | **Yes** — `posForChangeRequest()` (Phase 9, unmodified) already returns status per PO |
| Are there pending variation deliveries? | **Yes**, via the same execution-report traversal (`/api/change-requests/:id/execution`) |
| Are there variation billing allocations outstanding? | **Yes** — `availableRevenue` (derived, Phase 4) already answers this per-CR |

**Conclusion**: the primitives needed for a future closure-governance phase already exist and were not found lacking — the blocker to building closure controls is entirely the **management decision** of whether they should exist at all (Phase 10 §12/§13), not a missing technical capability.

---

## 20. REGRESSION RESULTS (§24)

Full battery re-run twice: once with accidental script-level concurrency (self-diagnosed as invalid — see below), then cleanly, one suite at a time, nothing else running concurrently.

| Suite | Clean result | Classification of any failure |
|---|---|---|
| P0 remediation | 46/54 | 4 = **STALE TEST** (Phase 10's already-known missing-`reason`-field issue); 4 = **NEW CASCADING HISTORICAL ARTIFACT** — `PRJ-1` (this suite's own 3-way-match fixture project) was permanently closed during Phase 10's own live §12 closure test this same session; reproduced live (`"project PRJ-1 ... is CLOSED"`), not a Phase 11 code defect |
| Phase 5 (CR consumption, audit, TB) | 34/34 (after excluding the diagnosed transient run) | Clean |
| Phase 6 (BOM→MR) | 20/21 | 1 = **STALE TEST**, already diagnosed in Phase 10 (test harness's own `require()` caching) |
| Phase 7 (classification) | 14/14 | Clean |
| Phase 8 (PO source integrity) | 19/19 | Clean — confirms the new chain-derivation-return change to `assertPoSourceDocumentsConsistent()` didn't disturb its existing consistency checks |
| Phase 9 (variation classification, incl. its own contradiction test) | 20/20 | Clean |
| Quick Fixes (incl. Job Work Scrap) | 18/21 | 2 = already-known `PRJ-9`-closed historical artifact (Phase 10); 1 = **same PRJ-1-closed cascading artifact**, newly discovered this phase (a different sub-test than P0's) |
| Site Return | 12/27 | **All 15 failures trace to the single PRJ-1-closed root cause** — this suite hardcodes `PROJECT='PRJ-1'` throughout, so its own setup step now fails outright, cascading through nearly the entire script. Confirmed via direct reproduction: `"Cannot return material from a site — project PRJ-1 ... is CLOSED"`. Not a Phase 11 regression — a scope discovery that PRJ-1's closure (a real, intentional Phase 10 test action, already disclosed in that report) has a **much wider blast radius on shared test fixtures** than previously realized. |
| Phase 10 Stage 1 (policy OFF) | Not independently re-verified clean this run (hit a transient `ECONNRESET` from the same concurrency mistake) | Not re-run in isolation — time-budgeted out given Phase 7/8/9's clean, overlapping coverage of the same code paths |

**Zero real regressions from this phase's code changes.** The one important discovery for the test-infrastructure record: **`PRJ-1` and `PRJ-9`, the two most heavily-reused "safe" fixture projects across the entire multi-phase test history, are now both permanently CLOSED** (both closed during this same session's Phase 10 work). Any future phase's test scripts should stop assuming either project remains open.

---

## 21. DEFECTS FOUND

**None.** No new defect was found or fixed this phase — this phase was a design-and-build phase for a new, additive capability, not a defect hunt. (The one PO/GRN 3-way-match "failure" and all Site Return failures were root-caused to the pre-existing, already-disclosed PRJ-1 closure, not a code defect — see §20.)

---

## 22. ARCHITECTURE GAPS

1. **No safe, non-blunt mandatory-tagging mechanism exists for BOM.** A BOM occupies the root of the traceability chain — there is no upstream document to derive "this should have been tagged" from, the way there is for PO via its `materialRequestId`/`supplierComparisonId` chain. Building one would require either (a) reproducing Phase 10's blunt "every BOM on this project" behavior, merely scoped to a smaller project set (still violates §6/§25's baseline-protection requirement), or (b) inventing a wholly new, non-CR "declare your intent" signal — a genuine new business-process element, not something this phase was authorized to invent.
2. **No equivalent chain-derived check exists for Material Requirement.** MRQ's variation status is entirely derived from `bomId` (no separate CR field to omit), so there is no "omission" scenario for it to protect against — its existing `materialRequirementRequireCR` flag remains the only (blunt, unauthorized) lever.
3. **No project-closure governance primitives were built this phase** (deliberately — see §19). The primitives to build them already exist; only the authorization to gate closure on them does not.

---

## 23. FUNCTION GAPS

None found. Every function this phase touched (`assertPoSourceDocumentsConsistent`, `createPurchaseOrder`) continues to satisfy its pre-existing contract; the one new function (`variationActive`) has a single, narrow, fully-tested responsibility.

---

## 24. MANAGEMENT DECISIONS (carried forward, not decided here)

1. Should `purchaseOrderRequireCRForVariation` be enabled? Now genuinely safe to consider — it will never block baseline work — the remaining question is purely a governance preference (does CEO want this discipline enforced), not a technical readiness question.
2. Should variation governance, once triggered on a project, remain permanently "sticky" even after the triggering CR is cancelled? The current derived design makes it naturally reversible; a sticky model is available but would require new stored state and separate authorization.
3. Should a BOM-level equivalent be attempted via a new, explicit "intent declaration" field (e.g., a mandatory reason/checkbox distinguishing "this is deliberately baseline" from "this should be tagged")? This is a genuinely new UX/business-process element requiring its own authorization and design discussion — not something Phase 11 was authorized to invent.
4. All Phase 10 management decisions (open-CR closure blocker, unconsumed-CR closure blocker, site-stock closure blocker, `costImpact` accounting meaning, warranty/retention concepts) remain outstanding, unaffected by this phase.
5. **New, testing-infrastructure observation**: `PRJ-1` and `PRJ-9` are both now permanently closed from this session's own testing. Future phases' test fixtures should use fresh projects rather than continuing to assume these two remain open.

---

## 25. RECOMMENDED NEXT PHASE

If CEO wants to proceed with enabling `purchaseOrderRequireCRForVariation`, no further engineering work is required first — it is load-bearing-tested and safe as designed. If CEO wants BOM-level protection too, the next phase should be a **scoping/UX design conversation** (not a code phase) about whether an explicit "this is intentionally baseline" declaration is worth introducing, since no code-only solution exists for that gap. Separately, closure-governance (§19/§22 of Phase 10) remains available as its own phase whenever those specific management decisions are made — the underlying primitives are already proven ready.

---

## 26. EXACT STOP-CONDITION EVALUATION (§25)

| Condition | Evaluated |
|---|---|
| Baseline projects are blocked | **NOT TRIGGERED** — §6 baseline chain fully succeeded, policy ON or OFF |
| Baseline work inside mixed projects is incorrectly blocked | **NOT TRIGGERED** — §7 tests A/C (baseline BOM/PO on a variation-active project) both explicitly ALLOWED |
| Variation is incorrectly classified as BASELINE | **NOT TRIGGERED** — §7/§8 confirm variation documents remain correctly classified; §9's multi-CR contradiction test still blocks cross-CR mislabeling |
| Cross-project CR accepted | **NOT TRIGGERED** — §7 test F blocked |
| Invalid CR accepted | **NOT TRIGGERED** — §7 tests G/H blocked |
| Cancelled/Rejected CR accepted where policy forbids it | **NOT TRIGGERED** — §7 test G (cancelled) blocked; §8's dead-end protection correctly does NOT force acceptance of a now-invalid CR either |
| Forged project variation state accepted | **NOT TRIGGERED** — §12 security test proved forged `variationActive`/policy body fields have zero effect |
| Client can modify policy | **NOT TRIGGERED** — same §12 proof |
| Transaction failure leaves inconsistent state | **NOT TRIGGERED** — §13 atomicity: PO count unchanged across a blocked attempt |
| Duplicate variation state is created | **NOT TRIGGERED** — `variationActive()` is derived, not stored; there is no state to duplicate |
| Accounting becomes unbalanced | **NOT TRIGGERED** — TB balanced to the rupee (§17) |
| Phase 8/9 controls regress | **NOT TRIGGERED** — both suites re-run clean (§20) |

**No STOP condition was triggered. The phase completes with a GO verdict for the new mechanism's design and correctness — enablement itself remains a separate, pending management decision (§24).**

---

## 27. GENERAL SAFETY CONFIRMATIONS

- The current global blunt flags (`bomRequireCR`, `purchaseOrderRequireCR`) were **not** enabled — confirmed OFF on disk at the end of this phase.
- The new flags (`enabled`, `purchaseOrderRequireCRForVariation`) were tested via temporary flip-then-revert only and are **confirmed OFF** on disk, live, at the time of writing this report.
- No historical record was mutated (the forensic scan in §16 was read-only).
- No redundant policy object or second CR-tagging mechanism was created — one extended `DB.variationTaggingPolicy`, one derivation reused from the existing `assertPoSourceDocumentsConsistent()`.
- No new authorization was invented, claimed, or assumed for enabling anything by default.

---

*End of Phase 11 report.*
