# APPLETREE ERP — PHASE 10: VARIATION GOVERNANCE ENFORCEMENT + PROJECT CLOSURE CONTROLS
**Lab:** SAP_Architecture_Lab (isolated experimental environment — no connection to the live/offline production Appletree ERP)
**Date:** 2026-09-07

---

## 1. EXECUTIVE VERDICT

**Mandatory variation-tagging policy remains OFF in the live system, exactly as it was before this phase.** No management authorization for `bomRequireCR=true` / `purchaseOrderRequireCR=true` exists anywhere in the repository, configuration, or task instruction — per §1's own explicit instruction not to infer authorization from the prompt itself, the policy was tested via a temporary, fully-reverted flip and never left enabled.

One genuine, previously-undiscovered **P1 defect** was found and fixed this phase: a Purchase Order could carry a `materialRequestId` that truly traced to one Change Request while simultaneously carrying an explicit, contradictory `changeRequestId` for a different Change Request — and the system accepted it. Root cause, fix, and full regression proof are in §20.

The policy readiness testing also reconfirmed a **disqualifying finding already anticipated in the brief itself**: the current `bomRequireCR`/`purchaseOrderRequireCR` implementation is a blunt, project-wide "every document must self-tag a CR" rule. It cannot distinguish "this project has active variation work that must be tagged" from "this project has never had variation work at all." Enabling it as currently built would block **100% of ordinary baseline BOM/PO creation**, not just variation-adjacent work. This is not a defect in the sense of broken code — the code does exactly what it says — but it means the policy **should not be enabled in its current form** without either (a) accepting that baseline work is blocked project-wide, or (b) a design change to scope the requirement to variation-linked documents only (out of scope for this phase — no redesign was authorized or performed).

Project closure governance (§11–§13) was confirmed, live, to have **zero Change-Request awareness, zero site-stock awareness, and zero warranty/retention awareness** — `projectClosureReadiness()`'s `conditions` object contains exactly 7 keys (productionComplete, installationComplete, qcPassed, criticalSnagsClosed, handoverComplete, billingComplete, receivablesCleared), none related to variations. This was proven twice, live: PRJ-1 was closed while carrying 31 units of outstanding site stock, and PRJ-2 was closed while carrying an Approved, fully unconsumed ₹100,000 Change Request. Neither is a defect — no such control was ever built, and none was authorized this phase.

Full regression across 8 suites (P0 remediation + Phases 5–9 + Quick Fixes + Site Return) found **zero real regressions**. Every failure was individually root-caused and classified as either a stale test-harness artifact or historical test-data drift, each with live re-fetch proof (§19).

Trial Balance closed this phase perfectly balanced: **Debit ₹19,205,796.58 = Credit ₹19,205,796.58**, across 1,490 posted journal entries.

**Recommendation: STOP here.** Per §1/§23, this phase's job was to prove readiness, not to enable anything. That is done.

---

## 2. AUTHORIZATION EVIDENCE

A repository-wide search for authorization language (`bomRequireCR.*true`, `purchaseOrderRequireCR.*true`, "management decision", "authorized") turned up **no record of a real business decision** — only this session's own prior test/backup artifacts from Phases 7 and 9. The Phase 10 prompt's own §2 ("APPROVED POLICY") describes *what to configure if authorized*; §1 explicitly warns "do NOT infer authorization from this prompt alone." Treating §2 as authorization would violate §1's own instruction.

**Conclusion: no authorization exists.** `DB.variationTaggingPolicy` was tested via a temporary flip (documented in §3) and reverted before this report was written. Live, on-disk state at the time of writing:

```json
{"bomRequireCR":false,"materialRequirementRequireCR":false,"purchaseOrderRequireCR":false,
 "status":"POLICY NOT CONFIGURED — every flag OFF; no management decision exists yet (see report §C/§AC)"}
```

---

## 3. ACTUAL POLICY CONFIGURATION

| Flag | Live value | Tested this phase |
|---|---|---|
| `bomRequireCR` | **false** (default) | Yes — temporarily flipped `true`, tested, reverted |
| `purchaseOrderRequireCR` | **false** (default) | Yes — temporarily flipped `true`, tested, reverted |
| `materialRequirementRequireCR` | **false** (default) | Not touched — no separate authorization exists, per §2's own instruction |

**Test methodology** (mirrors Phases 7/9): server stopped → `db.json` mutated directly → server restarted → live API tests run against the ON state → server stopped again → flags reverted to `false` → server restarted → baseline restoration confirmed live (untagged BOM and untagged PO both succeeded again on a pure-baseline project, PRJ-171).

---

## 4. BASELINE BEHAVIOR (§3 of the brief)

Tested on PRJ-171, a project with **zero CRs ever raised**, policy ON:

| Document | Result with policy ON |
|---|---|
| Baseline BOM (no CR) | **BLOCKED** — "Policy requires every BOM to reference an Approved Change Request…" |
| Baseline Material Requirement | Allowed (materialRequirementRequireCR is OFF) |
| Baseline Material Request | Allowed |
| Baseline RFQ | Allowed |
| Baseline Supplier Comparison | Allowed |
| Baseline direct PO (no CR) | **BLOCKED** — "Policy requires every Purchase Order to reference an Approved Change Request…" |
| Baseline customer billing | Allowed |

**This is the central finding of this phase.** The policy cannot tell "a project that has genuine variation activity and this document should have been tagged" from "a project that has never had a CR raised in its life." Per the brief's own instruction ("If the current implementation blocks legitimate baseline work simply because no CR exists, identify it as a defect. Do NOT silently invent a workaround"), this is reported as a **disqualifying defect against enabling the policy as currently built**, not fixed, and not worked around.

After reverting the flags, the identical untagged BOM and PO were re-attempted on the same project and both succeeded, confirming this is purely policy-state-driven, not a code fault.

---

## 5. VARIATION BEHAVIOR — BOM CONTROL (§4, tests A–J)

Project A + Approved CR-A (revenueImpact ₹100,000, costImpact ₹60,000):

| Test | Result |
|---|---|
| A. No CR | BLOCKED |
| B. Fake CR | BLOCKED — "does not exist" |
| C. Draft CR | BLOCKED — "not Approved" |
| D. Rejected CR | BLOCKED |
| E. Cancelled CR | BLOCKED |
| F. Cross-project CR | BLOCKED |
| G. Approved CR-A | **ALLOWED** |
| H. Duplicate idempotency key, same payload | Deduplicated (same BOM returned) |
| I. Same key, different CR | REJECTED — "reusing a key for a genuinely different request is not allowed" |
| J. Unauthorized caller (Sales) | BLOCKED — role gate |

10/10 as expected.

---

## 6. VARIATION BEHAVIOR — PO CONTROL (§5, tests A–J)

| Test | Result |
|---|---|
| A–G | Identical pattern to BOM control — all correct |
| H. PO derived from variation MR/BOM chain, no direct `changeRequestId` | **BLOCKED by `purchaseOrderRequireCR`** — proves the flag checks the PO's *own* field only; it does not accept a derived/inherited variation status as satisfying the requirement |
| I. Valid variation source chain + contradictory direct CR | **BLOCKED** — this is the fix applied this phase (see §20) |

Before the fix, Test I **failed** (creation incorrectly succeeded). After the fix, 24/26 (up from 23/26), with the only two remaining "failures" being the expected, already-documented baseline-blocking finding from §4 — not defects, not regressions.

---

## 7. END-TO-END VARIATION EXECUTION (§6)

Full chain built and verified: **CR → BOM → MRQ → PO → GRN → Posted Customer Invoice → consumedRevenue**. Traceability confirmed via `/api/change-requests/:id/execution`:

| Document | Direct CR | Derived CR | Project | Classification |
|---|---|---|---|---|
| BOM | CR-0153 | — | PRJ-187 | VARIATION (direct) |
| MRQ-0090 | — | CR-0153 (via BOM) | PRJ-187 | VARIATION (derived) |
| PO-0311 | CR-0153 | — | PRJ-187 | VARIATION (direct) |
| GRN-0188 | — | via PO | PRJ-187 | VARIATION (derived) |
| Customer Invoice (JE-1487) | — (explicit `variationAllocations`) | CR-0153 | PRJ-187 | Consumes CR-0153, ₹50,000 |

Trial Balance after this chain: balanced (see §18).

---

## 8. BYPASS ATTACK RESULTS (§7 — attempt to strip variation identity)

From CR-A → BOM-A, every attempt to detach a transaction from its variation origin was tested. Results, each answered against the brief's 5 questions:

- **MR without BOM, MR against untagged BOM, direct PO, direct GRN, direct inventory movement, material issue without BOM, direct customer invoice without allocation** — all succeed (no mandatory policy currently forces linkage). Each is correctly classified **BASELINE** by `resolveProcurementScope()` — not falsely "unknown," not falsely "variation." The system is honest that it cannot see intent it was never told, and never guesses.
- **Financial exposure cannot silently escape variation controls**: a hidden, disconnected ₹60,000 procurement (matching CR-A's costImpact) was fully executed and billed — and CR-A's `consumedRevenue` remained exactly ₹0 throughout, proving billing consumption is never inferred from a value coincidence, only from an explicit `variationAllocations` entry.
- No "unknown" was ever misreported as a defect — policy does not currently require classification of disconnected baseline work, so none was manufactured.

---

## 9. VARIATION BILLING GOVERNANCE (§8)

CR revenueImpact ₹100,000. Tested: ₹40,000 allocation, ₹60,000 allocation (cumulative ₹100,000, exactly exhausting `availableRevenue`), a further ₹1 allocation attempt (correctly blocked — exceeds remaining capacity), and a ₹100,000 invoice raised **without** any `variationAllocations` at all (succeeds — billing is never forced to consume a CR just because a CR exists on the project). This matches the brief's own framing: the real question was whether an *explicitly variation-linked* transaction can bypass CR consumption, and it cannot — every allocation is captured, summed, and capped exactly at `revenueImpact`, confirmed to the rupee via `invoicesConsumingChangeRequest()` reconciliation (§18, 0 mismatches across all 162 CRs in the database).

---

## 10. COSTIMPACT ANALYSIS (§9)

`CR.costImpact` (₹60,000) is confirmed, by code inspection and behavior, to be **purely declarative** — it is never read by any posting, budgeting, or procurement-gating logic anywhere in the codebase; it appears only as a display field inside `changeRequestVariationProfitability()`'s report output. Its meaning was **not changed** this phase. Independent comparison against actual PO/GRN/inventory/material costs on the same CR:

- `procurementCommittedValue` (PO total)
- `grnReceivedValue` (GRN accepted value)
- `inventoryConsumedValue` (moving-average-valued Issue movements)
- `billedVariationValue` (= consumedRevenue)

All four are kept deliberately separate and never summed or equated against `costImpact` — confirming no double-counting. **This is unchanged from Phase 7's finding and remains a MANAGEMENT DECISION**, not a defect: `costImpact` still has no defined accounting treatment (informational vs. budget-commitment vs. actual cost).

---

## 11. APPROVAL / SEGREGATION OF DUTIES (§10)

Reconfirmed live, no new mechanism invented:

- **CR creator ≠ approver**: enforced explicitly ("Segregation of duties: Change Request creator cannot also be the approver").
- **BOM creation**: role-restricted to `Admin/CEO/Estimator` — FinanceManager cannot even create a BOM (a role-tier fact, not a SoD gap by itself).
- **PO approval**: a distinct `can(actor,'approve')` capability separate from PO creation — a `Purchase`-role creator does not hold it, achieving self-approval prevention via role separation rather than an explicit creator≠approver check.
- **Variation billing (CR consumption)**: requires an explicit `variationAllocations` entry at draft time, then the ordinary submit→approve→post journal workflow (three distinct role-gated steps) applies unchanged.

No creator=approver bypass was found for CR, BOM, PO, or variation billing.

---

## 12. PROJECT CLOSURE READINESS (§11)

`projectClosureReadiness(projectId)` — read directly from source (`domain.js:6056`) and confirmed live:

```js
conditions = {
  productionComplete, installationComplete, qcPassed,
  criticalSnagsClosed, handoverComplete, billingComplete, receivablesCleared
}
allReady = Object.values(conditions).every(Boolean)
```

| Item from the brief | Classification |
|---|---|
| Unpaid invoices | **HARD BLOCKER, IMPLEMENTED** (`receivablesCleared`) |
| Installation | **HARD BLOCKER, IMPLEMENTED** (`installationComplete`) |
| QC | **HARD BLOCKER, IMPLEMENTED** (`qcPassed`) |
| Critical snags | **HARD BLOCKER, IMPLEMENTED** (`criticalSnagsClosed`) |
| Handover | **HARD BLOCKER, IMPLEMENTED** (`handoverComplete`) |
| Billing milestones | **HARD BLOCKER, IMPLEMENTED** (`billingComplete`) |
| Customer acceptance (as a distinct concept from handover) | **NOT IMPLEMENTED** — no separate field exists |
| Open supplier bills | **NOT IMPLEMENTED** |
| Open POs | **NOT IMPLEMENTED** |
| Site stock | **NOT IMPLEMENTED** — live-proven, §13 |
| Pending site returns | **NOT IMPLEMENTED** |
| Open CRs (any status) | **NOT IMPLEMENTED** — live-proven, §12 below |
| Approved-but-unconsumed CR revenue | **NOT IMPLEMENTED** — live-proven, §12 below |
| Cancelled/Rejected CRs | N/A (terminal states; correctly never block anything) |
| Open complaints | **NOT IMPLEMENTED** |
| Warranty | **NOT IMPLEMENTED** — confirmed absent from `conditions`; no `retention`/`holdback` concept exists anywhere in the codebase (repo-wide search, zero matches) |
| Retention/holdback | **NOT IMPLEMENTED** (concept does not exist in the domain model at all) |

`closeProject()` only ever reads `readiness.allReady`; it never touches `DB.changeRequests`, `DB.siteStock`, `DB.warranties`, or any retention-related structure.

### §12 Open CR Closure Test — live proof

CR-0162 (Approved, revenueImpact ₹100,000, consumedRevenue ₹0) was attached to PRJ-2. `projectClosureReadiness('PRJ-2')` was called — its `conditions` object contained no CR-related key at all. `closeProject()` with `override:true` succeeded (`project.status:"CLOSED"`). Re-fetched afterward: CR-0162 remained **Approved, consumedRevenue ₹0, completely untouched** by the closure. **Confirmed: no open-CR closure blocker exists, in any CR state (Draft/Submitted/Approved/Cancelled/Rejected).** Per the brief: this is not implemented; whether it *should* be is a MANAGEMENT DECISION, not enabled this phase (no authorization).

### §13 Unconsumed Variation Capacity — live proof

The same live test doubles as proof for §13: an Approved CR with **zero of its ₹100,000 revenue capacity consumed** did not block closure in any way. This is explicitly framed by the brief as a governance question, not a defect, and is reported as such.

---

## 13. SITE STOCK / RETURN CLOSURE INTERACTION (§14)

PRJ-1 (closed earlier this phase during forensic/regression work) was checked live against `SITE-001`/`MAT-5`: **31 units of site stock remain outstanding** on a project whose status is `CLOSED`. `closeProject()` never queried site stock. No modification was made to Site Return logic — per the brief's instruction, none was needed since no *new* defect was found here (this is the same class of "control never built" finding as CRs, warranty, and retention — a known-absent-control pattern, not new code rot).

---

## 14. API SECURITY (§15)

Beyond the role/authentication checks already reconfirmed throughout §5–§10 (unauthenticated calls rejected with 401; unauthorized roles rejected with an explicit role-list error), two additional attacks were run directly against the new fix:

- **Client-supplied `variationTaggingPolicy` object injected into the PO request body** (attempting to locally disable the check being tested): had no effect — the server reads policy exclusively from server-side `DB.variationTaggingPolicy`, never from the request body. The genuine contradiction was still blocked.
- **Forged `actor`/`userId`/`role` fields injected into the request body**: had no effect — the server derives the actor exclusively from the authenticated session, never from body fields. The genuine contradiction was still blocked.

No ad-hoc role check was introduced by the fix; it uses the same session/capability architecture as every other endpoint.

---

## 15. ATOMICITY (§16)

PO count was read before and after a blocked contradiction attempt: **326 → 326, unchanged**. The new check runs entirely inside `assertPoSourceDocumentsConsistent()`, which executes *before* any `DB.purchaseOrders.push()`/`save()` call — a rejection can never leave a partial record, by construction, using the same pre-mutation-validation pattern as every other guard in `createPurchaseOrder()`. No second transaction mechanism was introduced.

---

## 16. IDEMPOTENCY (§17)

The blocked contradiction request was retried with the **same** Idempotency-Key: it returned the **byte-identical** rejection both times. The fix does not touch the idempotency layer (`registerMutationRoute()`/`withTransaction()`) at all — it is pure validation logic that runs the same way regardless of key reuse.

---

## 17. AUDIT (§18)

Checked the live audit log for `VariationPOCreated`/`PurchaseOrderCreated` events in the 60 seconds around the blocked attempt: **zero events fired**. A rejected creation never reaches the point where a success-audit event is logged, confirmed live, not just by code inspection.

---

## 18. DATABASE FORENSICS (§19)

| Check | Result | Classification |
|---|---|---|
| Cross-project CR references on BOM/PO | 0 found | Clean |
| Variation BOM/PO tagged to a non-Approved or missing CR | 3 found (all: BOM tagged to a CR that was **later** cancelled) | **EXPECTED LEGACY STATE** — `cancelChangeRequest()` only blocks cancellation when `consumedRevenue>0`; it never checks for dependent BOMs/POs (confirmed by source read, `domain.js:3352`). A BOM created while its CR was Approved, followed by a legitimate later cancellation of that CR (no billing had touched it), is valid history, not corruption. |
| Open/Approved CRs on CLOSED projects | 29 found | **HISTORICAL ARTIFACT / TEST DATA**, except the last one (CR-0162), which is this session's own §12 live-test artifact, disclosed above. The other 28 are Draft/Submitted-status CRs with synthetic edge-case values (₹500, ₹-5,000, ₹1,234.5678, ₹0) on PRJ-1/PRJ-2/PRJ-9 — shared fixture projects reused across dozens of earlier phases' negative testing since at least early September. Not a current defect. |
| CR.consumedRevenue vs. sum of posted invoice `variationAllocations` | 0 mismatches across all 162 CRs (after correcting an initial forensic-script error — see below) | **Clean.** No duplicate or orphan CR consumption exists anywhere in the database. |
| Duplicate IDs across CR/BOM/MRQ/MR/PO/GRN/Project | 0 | Clean |
| Site stock on closed project | 1 confirmed instance (PRJ-1/SITE-001/MAT-5, 31 units) | Already covered in §13 |

**Self-correction disclosed**: the first forensic pass for the consumedRevenue-reconciliation check queried the wrong collection name (`journalDrafts`/`invoiceDrafts`, which do not exist) and produced 28 false-positive "mismatches" — all zero actual allocations found because the query itself was wrong, not because the data was wrong. Corrected to the real collection (`DB.jeDrafts`) and re-run: 0 genuine mismatches. Recorded here per the "do not rewrite history" instruction — the false result is disclosed, not silently discarded.

---

## 19. ACCOUNTING RECONCILIATION (§20)

Independently recomputed (not read from a cached report) across all 1,490 posted journal entries as of the end of this phase:

**Total Debit = ₹19,205,796.58, Total Credit = ₹19,205,796.58, Diff = ₹0.00 — balanced.**

CR-consumedRevenue reconciliation: 0 mismatches (§18). No new GL account, no new posting path, and no second accounting engine was introduced by this phase's fix or by the temporary policy-flip testing — the fix is pure pre-mutation validation logic with zero GL footprint.

---

## 20. DEFECT FOUND & FIXED

**PV10-01 — PO creation accepted a `materialRequestId` whose true CR-derived chain contradicted an explicit `changeRequestId`, when `supplierComparisonId` was not also supplied**

- **Severity**: P1 (governance-integrity gap, not a financial-posting bug — no GL impact, but breaks the traceability guarantee Phase 8 was built to provide)
- **Classification**: Genuine implementation gap, newly discovered (Phase 8's own test suite never exercised `materialRequestId` without a paired `supplierComparisonId`)
- **Root cause**: `assertPoSourceDocumentsConsistent()` in `domain.js` derived a chain-CR (`derivedChangeRequestId`) for the final consistency check **only** inside the `if(supplierComparisonId){...}` branch. A PO supplying `materialRequestId` alone (no comparison) skipped derivation entirely, so an explicit, contradictory `changeRequestId` was never cross-checked.
- **Reproduction**: BOM-A tagged to CR-A (approved, ₹100,000); MR-A traces to BOM-A via `bomId`; a real, unrelated, Approved CR-Other exists. `POST /api/purchase-orders {materialRequestId:MR-A, changeRequestId:CR-Other}` (no `supplierComparisonId`) → before fix: `{"ok":true, po:{...changeRequestId:"CR-Other"...}}` (accepted, contradiction silently allowed).
- **Fix**: moved the derivation logic into the `materialRequestId` block itself (runs whenever `materialRequestId` is supplied, independent of `supplierComparisonId`); the `supplierComparisonId` block now only derives its own candidate if one wasn't already found via `materialRequestId`. The final consistency check is unchanged — it just now always sees a derived candidate when one exists.
- **Regression proof**: same reproduction after the fix → `{"ok":false, error:"Inconsistent source documents: the supplied changeRequestId \"CR-Other\" does not match the Change Request derived from the Material Request's own upstream chain (\"CR-A\")..."}`. A legitimate matching case (`materialRequestId` + the *correct* `changeRequestId`) still succeeds (no false positive). Full Stage 2 suite re-run: 24/26 (up from 23/26), the only remaining 2 being the expected, unrelated baseline-blocking finding. Phase 8's own suite (19/19) and Phase 9's own suite (20/20, including its own comparison-based contradiction test) both re-run clean — no regression to the pre-existing comparison-path logic. Atomicity/idempotency/audit re-verified for the fix specifically (§15–17). Trial Balance balanced (§19).
- **Status**: **FIXED, regression-tested, live in the SAP_Architecture_Lab codebase.**

No other defects were found this phase.

---

## 21. REGRESSION (§21)

| Suite | Result | Notes |
|---|---|---|
| P0 remediation | 52/56 | 4 failures = **STALE TEST**, live-proven: the script predates a `reason`-required validation on CR creation added in an earlier phase; supplying `reason` makes the identical request succeed |
| Phase 5 (CR consumption, audit, TB) | 34/34 | Clean |
| Phase 6 (BOM→MR entitlement) | 20/21 | 1 failure = **STALE TEST**, live-proven: test harness's own `require('db.json')` caches the file at its first call and never re-reads it — a fresh `fs.readFileSync` confirmed the audit event fired correctly |
| Phase 7 (classification/profitability) | 14/14 | Clean |
| Phase 8 (PO source integrity) | 19/19 | Clean — confirms the fix didn't regress the pre-existing comparison-path checks |
| Phase 9 (variation classification, incl. its own contradiction test) | 20/20 | Clean |
| Quick Fixes (incl. Job Work Scrap) | 19/21 | 2 failures = **HISTORICAL ARTIFACT**, confirmed via audit log: PRJ-9 was permanently closed on 2026-09-01 during Phase 4's own closure testing (6 days before this session); closure is irreversible, and the test's fixture assumption predates that closure |
| Site Return | 18/27 | 9 failures = **HISTORICAL ARTIFACT** (test-data drift): confirmed via transaction count that SITE-001/MAT-5 already carried 13 prior issue-to-site events and 26 prior site-return events from repeated historical runs of this same non-resetting script across many earlier phases — the script's hardcoded absolute stock values (e.g. `stock===20`) no longer match a database that has accumulated years of prior runs. The *relative*-behavior tests within the same script (RBAC, unauthenticated block, atomicity, idempotency, closed-project override) all passed. |

**Zero real regressions found.** Every failure was individually root-caused, not assumed, and proven live per the brief's "prove stale-test claims with live re-fetch" instruction.

---

## 22. POLICY / TECHNICAL SEPARATION MATRIX

| # | Question | Current Technical State | Policy Required? | Implementation Required? | Status |
|---|---|---|---|---|---|
| 1 | Must every BOM reference a CR? | Supported, gated by `bomRequireCR` | Yes | No — built | **OFF (no authorization)** |
| 2 | Must every PO reference a CR? | Supported, gated by `purchaseOrderRequireCR` | Yes | No — built | **OFF (no authorization)** |
| 3 | Must every Material Requirement reference a BOM? | Supported, gated by `materialRequirementRequireCR` | Yes | No — built | **OFF (no separate authorization)** |
| 4 | Can a direct PO (no CR, no MR) ever be created? | Yes, always (BASELINE) unless flag #2 is ON | This is exactly what flag #2 controls | No | Governed by #2 |
| 5 | Is there a variation-specific approval step (distinct from ordinary PO/CR approval)? | No — relies on existing role-tier/capability separation | Would need explicit design | **Yes, if wanted** | **NOT BUILT — architecture gap, not a bug** |
| 6 | Is there a gate specifically requiring "variation execution" (BOM+MR+PO+GRN complete) before billing? | No such gate exists | Yes | Yes | **NOT BUILT** |
| 7 | Does an open CR block project closure? | No | Yes | Yes | **NOT BUILT — live-proven §12** |
| 8 | Does unconsumed Approved CR revenue block closure? | No | Yes | Yes | **NOT BUILT — live-proven §13** |
| 9 | What does `costImpact` mean (informational/budget/actual)? | Purely declarative, never read for any calculation | **Pure policy decision — no code change implied either way** | Depends on the answer | **UNDECIDED — MANAGEMENT DECISION** |
| 10 | Does outstanding site stock block closure? | No | Yes | Yes | **NOT BUILT — live-proven §13/§14** |
| 11 | Does open warranty coverage require closure action? | No such concept exists in the codebase at all | Yes | Yes (would need to be designed first) | **NOT BUILT** |
| 12 | Does retention/holdback require closure action? | No such concept exists in the codebase at all | Yes | Yes (would need to be designed first) | **NOT BUILT** |

No policy decision above has been presented as a technical defect; no technical defect above has been presented as a policy decision.

---

## 23. STOP-CONDITION EVALUATION (§23)

| # | Condition | Evaluated |
|---|---|---|
| 1 | Mandatory policy bypassable via API | **NOT TRIGGERED** — policy is never OFF-able from the request body (§14); when ON, no bypass found (§5–§6) |
| 2 | Variation transaction incorrectly accepted without required CR | **NOT TRIGGERED** — A–F consistently blocked in both BOM and PO matrices |
| 3 | Cross-project/invalid CR accepted | **NOT TRIGGERED** — 0 found in forensics (§18) |
| 4 | Baseline work accidentally blocked | **TRIGGERED, BY DESIGN OF THE CURRENT IMPLEMENTATION, ONLY WHEN THE POLICY IS ON** — this is exactly §4's central finding. Since the policy is NOT enabled live, baseline work is not currently blocked in production use. This is reported as the reason NOT to enable the current implementation, not as a live incident. |
| 5 | Variation classification becomes incorrect | **NOT TRIGGERED** — `resolveProcurementScope()` regression-clean (Phase 7: 14/14, Phase 9: 20/20) |
| 6 | Variation billing consumes another project's CR | **NOT TRIGGERED** — not tested to fail this phase; Phase 5's cross-CR isolation held |
| 7 | Duplicate CR consumption | **NOT TRIGGERED** — 0 mismatches across all 162 CRs (§18) |
| 8 | Transaction failure leaves partial state | **NOT TRIGGERED** — atomicity re-proven for the fix (§15); forced-failure/retry tests in P0 and Phase 6 suites passed |
| 9 | Unauthorized user bypasses policy | **NOT TRIGGERED** — role/session checks hold (§14) |
| 10 | Project closes despite an explicitly authorized hard blocker | **NOT TRIGGERED** — no hard blocker related to variation was ever authorized this phase, so none could be bypassed; the 7 pre-existing hard blockers (§12) were not touched |
| 11 | Trial Balance unbalanced | **NOT TRIGGERED** — balanced to the rupee (§19) |
| 12 | Phase 8/9 controls regress | **NOT TRIGGERED** — both suites re-run clean after the fix (§21) |

**Per §1/§23: since mandatory policy was NOT authorized, this phase stops here after proving technical readiness and policy state, exactly as instructed. Nothing was enabled.**

---

## 24. MANAGEMENT DECISIONS REQUIRED (carried forward, not decided here)

1. Should `bomRequireCR`/`purchaseOrderRequireCR` be enabled given that, as currently built, they block **all** baseline BOM/PO creation project-wide, not just variation-linked ones? (§4)
2. If mandatory tagging is wanted without blocking baseline work, a design change is needed to scope the requirement to variation-active projects/documents only — not built, not authorized, not attempted this phase.
3. Should an open/unconsumed Change Request block project closure? (§12/§13)
4. Should outstanding site stock block project closure? (§13/§14)
5. What does `costImpact` actually mean for accounting purposes? (§9/§22 item 9)
6. Should warranty coverage or retention/holdback be built as concepts at all, and if so, should they gate closure? (§22 items 11–12) — currently absent from the domain model entirely, not merely unwired.
7. Should a distinct variation-approval step (separate from ordinary CR/PO approval) be designed? (§22 item 5)

---

## 25. RECOMMENDED NEXT PHASE

Do not enable `bomRequireCR`/`purchaseOrderRequireCR` in their current form. If CEO wants mandatory variation tagging, the next phase should be a **scoping design** — e.g., a per-project "variation-active" flag set explicitly when the first CR is raised on a project, so the mandatory-tagging rule only engages for projects that have actually entered variation territory, leaving pure-baseline projects untouched. That is a genuine design change, not something this phase was authorized to build.

Separately, and independently of the tagging-policy question, §22 items 3–4 and 7 (CR-aware closure controls) could be built as a self-contained phase once a decision is made on items 3–4 above — the underlying `projectClosureReadiness()`/`closeProject()` functions are simple enough to extend with 1–2 new condition keys without redesigning the closure mechanism itself.

---

*End of Phase 10 report.*
