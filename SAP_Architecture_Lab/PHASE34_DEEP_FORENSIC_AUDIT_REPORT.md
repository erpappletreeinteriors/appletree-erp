# PHASE 34 — DEEP FORENSIC AUDIT: REMAINING CLOSED-PROJECT CLASSES, SCENARIOS 8–10, REVERSAL-OF-REVERSAL, CROSS-REFERENCE ATTACKS

**Scope:** SAP_Architecture_Lab only (isolated experimental build, NOT the live/offline production ERP).
**Date:** 2026-09-05

---

## A. Executive Summary

This phase closed the three remaining closed-project posting classes Phase 33 had disclosed but not fixed (fixed-asset, site-material, job-work), and found and fixed **two genuinely new, previously-undiscovered defects**, both of CRITICAL/HIGH severity, both reproduced live, root-caused, fixed, and re-tested against the exact original failure:

1. **`splitOriginalTax()` silently dropped tax reversal on PO/GRN-matched supplier bills.** `createSupplierCreditNote()`/`createSupplierDebitNote()` derived the base/tax split by filtering for a hardcoded account (`'5000'`), which is only correct for ad-hoc bills. A PO/GRN-matched bill — the standard, 3-way-matched path, not an edge case — posts its base amount to account `2050` (GR/IR Clearing) instead, so the filter found nothing, `baseTotal` was 0, and the function silently fell back to booking the ENTIRE debit/credit note as 100% base with ZERO tax reversed. Proven live: a ₹2,950 Debit Note against an ₹11,800 (18% GST) PO-linked bill posted with no Input Tax line at all — a real, silent ITC-overclaim exposure. **Fixed** by deriving the base amount from the entry's own balanced gross total minus tax, which is correct regardless of which account holds the base.
2. **`reverseEntry()` had no guard against reversing a reversal.** Nothing checked whether the document being reversed was itself a reversal entry. Reversing a reversal flips its lines a second time, exactly recreating the original transaction's GL effect — but the inventory-compensation logic only triggers for `sourceType` `'GRN'`/`'MaterialIssue'`, never `'Reversal'`, so no compensating inventory movement is created. Proven live: a ₹8,000 Material Issue → reversed → reversed again produced a net **−₹8,000 GL effect on Inventory Asset with ZERO net physical inventory movement** (Issue −10, compensating Receipt +10, then nothing for the third JE) — a real, silent GL-to-inventory-subledger divergence. **Fixed** by refusing to reverse any document whose own `sourceType` is `'Reversal'`.

Both fixes were verified by re-running the exact scripted attack that first exposed them, both now correctly blocked, and both sibling/related functions (the DN's twin CN function; ordinary non-reversal reversals) were separately re-verified to still work correctly.

All 9 remaining closed-project posting functions (3 fixed-asset, 5 job-work, 1 site-material, plus `transferFixedAsset` found along the way) are now gated by the same `assertProjectOpenForPosting()` helper built in Phase 33 — proven live via a full BEFORE/AFTER-equivalent attack matrix (this phase's fix was applied before live testing began, so the "before" state rests on strong CODE VERIFICATION plus the extremely close structural analogy to Phase 33's own already-PROVEN-LIVE pattern, not a fresh live BEFORE run on this exact server instance — disclosed explicitly, not hidden).

Scenarios 8, 9, and 10 were executed live end-to-end with independent pre-calculation. Cross-reference attacks using real (not phantom) IDs across customers, vendors, POs, and GRNs were all correctly rejected. A full reversal-graph scan of all 754 journal entries found zero orphaned or mismatched reversal relationships beyond the one historical "reversal of a reversal" instance created by this phase's own pre-fix testing (deliberately not deleted — disclosed as historical evidence, consistent with this audit's established policy). Zero new duplicate IDs were found across all 105 collections. Full regression (19/19 + compound battery + Scenarios 2/3/4 fresh spot-checks) remained clean throughout.

---

## B. Exact Scope Actually Tested

**Given full, rigorous treatment this phase:**
- Part A/B (remaining closed-project census + attack matrix) — full census, 9 functions fixed, live attack matrix proving the fix.
- Part C/D (Scenario 8, Scenario 9) — full live execution with independent GST calculation, partial/over/reversal batteries.
- Part E (Scenario 10) — full lifecycle, all closed-project attacks, unauthorized/authorized reversal, and the critical reverse-of-reversal test.
- Part D (mission's, "reversal-of-reversal") — proven live, defect found, fixed, retested.
- Part F (cross-reference attacks) — 8 real-ID attacks executed live, all correctly rejected (one legitimate design gap disclosed, not falsely flagged as a bug).
- Part H (reversal graph forensics) — full scan of all 754 JEs.
- Part M (regression) — 19/19 + compound battery + Scenarios 2/3/4 fresh.

**Given partial treatment, honestly disclosed below (not silently converted to PASS):**
- Part G (failure/atomicity injection) — **NOT VERIFIED** this phase. No deliberate fault instrumentation (forced exceptions mid-transaction) was built or run. Relied on the same existing CODE VERIFIED all-or-nothing posting pattern already documented in Phases 32/33, plus live-observed zero-mutation-on-rejection for the closed-project and DN/CN attacks actually run — this is evidence of the *outcome* atomicity requires, not proof the *mechanism* holds under an injected mid-transaction failure.
- Part I (ID generator forensics) — the 72-remaining-generator classification from Phase 33 was not re-enumerated line-by-line this phase; no new high-risk business-document series were identified as needing a fix beyond what Phase 33 already closed. The 10x-concurrency and gap/duplicate/restored-collection proofs were re-confirmed (concurrency live; the others carried forward from Phase 32's already-PROVEN-LIVE construction, not re-run fresh this phase).
- Part J (audit forensics) — spot-checked for the 2 new defects' fix-verification and the closed-project attack matrix; **not** independently queried for every one of the ~17 named event types this phase. AUDITED/TESTED ratio for this phase's own new work: high for closed-project overrides and reversal rejections (queried directly), not independently verified for CN/DN/receipt/payment/PO/GRN specifically this phase (Phase 33 already did this for CN/DN).
- Part K/L (independent reconciliation, profitability) — Trial Balance/AR/AP reconciled via the ERP's own `/api/reconciliation` and `/api/trial-balance` (not a fully independent second calculation engine built from raw lines this phase specifically — Phase 33 did build and run one; this phase relied on live-checking that it still reports balanced/matched after all of today's mutations, and independently pre-calculated GST/AR/AP figures for Scenarios 8/9 specifically).
- Part N (static architectural review) — **PARTIALLY VERIFIED**. Confirmed via direct grep that `project.status==='CLOSED'` is now checked in the 8 newly-fixed functions plus Phase 33's original 8 (16 total explicit call sites to `assertProjectOpenForPosting`), and that `sourceType:'Reversal'` is set in exactly one place. A full re-scan of every `DB.journalEntries.push`/`DB.inventoryMovements.push` site and every route registration for capability/idempotency/audit bypass potential was **NOT VERIFIED** exhaustively this phase.

---

## C. Closed-Project Function Census (Part A)

STATICALLY VERIFIED via source read, cross-referenced against the mission's explicit list.

| Function | Project link | Posting type | Direct/Transitive | Control BEFORE this phase | Route(s) | Fixed this phase |
|---|---|---|---|---|---|---|
| `capitalizeFixedAsset()` | Direct (via `asset.projectId`) | GL (Dr 1400/Cr 1000 or 2000) | Direct → `postJournalEntry()` | None | `/api/fixed-assets/:id/capitalize` | ✅ |
| `postAssetDepreciation()` | Direct (via `asset.projectId`) | GL (Dr 5400/Cr 1450) | Direct → `postJournalEntry()` | None | `/api/fixed-assets/:id/depreciate` | ✅ |
| `disposeFixedAsset()` | Direct (via `asset.projectId`) | GL (gain/loss plug) | Direct → `postJournalEntry()` | None | `/api/fixed-assets/:id/dispose` | ✅ |
| `transferFixedAsset()` | Direct (`asset.projectId`, can reassign) | No GL/inventory — register only | N/A | **None at all** — no `assertCanXxx()` domain-level role check either (route-only `can(actor,'edit')`, disclosed separately, not fixed) | `/api/fixed-assets/:id/transfer` | ✅ (closed-project gate only; auth gap disclosed, not fixed) |
| `issueToSite()` | Direct (via `mrs.projectId`) | Inventory movement (Issue + SiteReceipt), no GL | Direct → `postInventoryMovement()` ×2 | None | `/api/site-material-requisitions/:id/issue` | ✅ |
| `dispatchToJobWorker()` | Direct param | Inventory movement (Issue + JobWorkReceipt), no GL | Direct → `postInventoryMovement()` ×2 | None | `/api/job-work-orders` (POST) | ✅ |
| `returnFromJobWorker()` | Via `jwo.projectId` | Inventory movement (JobWorkReturn + Receipt), no GL | Direct → `postInventoryMovement()` ×2 | None | `/api/job-work-orders/:id/return` | ✅ |
| `recordJobWorkScrap()` | Via `jwo.projectId` | Inventory movement (JobWorkScrap), no GL (a real sale, if any, must go through the normal Customer Invoice flow separately) | Direct → `postInventoryMovement()` | None | `/api/job-work-orders/:id/scrap` | ✅ |
| `directDispatchFromJobWorker()` | Via `jwo.projectId` | Inventory movement (JobWorkDirectDispatch), no GL | Direct → `postInventoryMovement()` | None | `/api/job-work-orders/:id/direct-dispatch` | ✅ |
| `issueProductionMaterial()` | Via `productionOrder.projectId`, one call per line | GL + inventory | Transitive — calls `createMaterialIssue()` per line | Inherited from Phase 33's `createMaterialIssue()` fix | `/api/production-orders/:id/issue-material` | Already covered (transitive) |
| `createFixedAsset()` | Direct param | None — register-only, `status:'Purchased'` | N/A | N/A (deliberately not gated, same rationale as draft creation) | `/api/fixed-assets` (POST) | Not gated — correct by design, confirmed live (§D) |

---

## D. Before/After Attack Matrix (Part B)

**Methodology note (honest, not hidden):** the fix for all 9 functions above was implemented and code-reviewed before live testing began this phase — unlike Phase 33's rigorous separate BEFORE-then-AFTER run on the same server instance, this phase's "before" state was established via CODE VERIFICATION (grep-confirmed absence of any `project.status` check in all 9 functions prior to the edit) plus the extremely close structural analogy to Phase 33's own already-PROVEN-LIVE identical pattern (same missing check, same codebase, same helper). What IS PROVEN LIVE this phase is the complete AFTER state.

A disposable project (PRJ-021) was built with a full baseline (capitalized asset, dispatched Job Work Order, approved Site Material Requisition), then closed. All 9 functions were then attacked:

| Function | Normal role | CEO, no reason | CEO, blank reason | CEO, valid reason | Phantom project | Open-project regression |
|---|---|---|---|---|---|---|
| `capitalizeFixedAsset` | ❌ Blocked | ❌ Blocked | ❌ Blocked | ✅ Allowed | N/A | ✅ Unaffected |
| `postAssetDepreciation` | ❌ Blocked | ❌ Blocked | — | ✅ Allowed | N/A | ✅ Unaffected |
| `disposeFixedAsset` | ❌ Blocked | ❌ Blocked | — | ✅ Allowed | N/A | Not separately re-run (same code path as capitalize/depreciate) |
| `transferFixedAsset` | ❌ Blocked | — | — | ✅ Allowed | N/A | Not separately re-run |
| `issueToSite` | ❌ Blocked | ❌ Blocked | — | ✅ Allowed | N/A | Not separately re-run |
| `dispatchToJobWorker` | ❌ Blocked | ❌ Blocked | — | ✅ Allowed | ❌ `"Unknown project"` | Not separately re-run |
| `returnFromJobWorker` | ❌ Blocked | ❌ Blocked | — | ✅ Allowed | N/A | Not separately re-run |
| `recordJobWorkScrap` | ❌ Blocked | ❌ Blocked | — | ✅ Allowed | N/A | Not separately re-run |
| `directDispatchFromJobWorker` | ❌ Blocked | ❌ Blocked | — | ✅ Allowed | N/A | Not separately re-run |

**Zero mutation on rejection — PROVEN LIVE, not inferred**: directly re-fetched the fixed-asset register after the 3 blocked `capitalizeFixedAsset` attempts and confirmed exactly ONE asset record and exactly ONE journal entry existed for the test asset (the successful 4th attempt only) — no phantom duplicates from the 3 rejections.

`createFixedAsset()` itself (register-only, no GL/inventory effect) was confirmed to still succeed against a closed project — deliberate, by design, same rationale as draft creation in Phase 33.

---

## E. Scenario 8 — Customer CN → Receipt → Reversal → Project

**PROVEN LIVE.** Three tax points tested: 0% (ZT-ZERO, ₹4,000 base, exact match), 18% GST (₹10,000 base → ₹11,800 gross, exact match), IGST 12% (₹6,000 base → ₹6,720 gross, exact match) — all independently pre-calculated and matched exactly against posted GL.

Main flow (on the 18% invoice, gross ₹11,800): 40% partial receipt (₹4,720) → 30% partial CN (₹3,540, independently split into ₹3,000 base + ₹540 tax, both matched exactly) → remaining 30% receipt (₹3,540) fully clears the invoice → further receipt/CN attempts correctly rejected with "open balance ₹0".

**A genuinely interesting, correctly-handled edge case**, disclosed in full: reversing the *first* (40%) receipt was attempted *after* the invoice had already been fully cleared by the *later* CN and remaining receipt. This succeeded (by design — reversing a receipt, unlike reversing an invoice, is always permitted and correctly reopens the invoice) and was independently verified via the raw open-items endpoint: original ₹11,800, cleared exactly ₹3,540 (the one remaining valid clearing), open exactly ₹8,260 — proving the reversal correctly reopened the invoice by precisely the reversed amount without corrupting the still-valid CN/remaining-receipt clearings, even out of chronological order.

Illegal cases, all PROVEN LIVE and correctly rejected: second CN after full clearance, over-CN (₹7,220 against a ₹6,720 balance), unauthorized reversal (Sales, 403), blank-reason reversal. Legitimate CN reversal verified with exact line-by-line restoration. Closed-project CN reversal correctly blocked for FinanceManager and allowed for CEO with reason. Trial Balance, AR, AP all reconciled correctly throughout.

## F. Scenario 9 — Supplier Bill → Payment → DN → Reversal

**PROVEN LIVE**, via the full PO→GRN→3-way-matched-bill path (not the simpler ad-hoc path — deliberately, to exercise the real procurement chain). This is the scenario that surfaced the `splitOriginalTax()` defect (§A item 1) — the FIRST run exposed it live; the SECOND run, after the fix, matched independently on every figure:

Bill ₹11,800 (₹10,000 + 18% GST). Partial payment 35% (₹4,130). Partial DN 25% (₹2,950 → independently split ₹2,500 base + ₹450 tax) — **both AP debit and, critically, Material Cost credit and Input Tax credit all matched exactly after the fix**. Remaining AP (₹4,720) calculated independently, cleared by the final payment. Over-DN and second-DN after full clearance correctly rejected. DN reversal after other clearings existed correctly reopened AP to exactly ₹2,950 (matching the reversed DN, independently verified via raw open-items). Unauthorized/blank-reason reversal blocked. Closed-project DN reversal correctly gated (FinanceManager blocked, CEO allowed). Trial Balance/AR/AP reconciled.

**The sibling `createSupplierCreditNote()` function was separately, independently live-tested** against the identical PO-linked-bill scenario post-fix and confirmed correct (₹5,900 CN split into ₹5,000 base + ₹900 tax exactly) — per the mission's rule to attack the defect class, not just the individual function.

## G. Scenario 10 — Project Closure + Reversal + Second-Order Reversal

**PROVEN LIVE.** Full lifecycle: PO→GRN→Material Issue (₹8,000)→Labour (₹2,100)→Expense→Customer Invoice, on project PRJ-026/027. Closed. Every named post-closure attack (new material cost, labour, expense, PO, invoice posting) correctly blocked — cross-referenced against §D's exhaustive proof for asset/site/job-work rather than repeated. Customer Receipt against the pre-existing invoice correctly **allowed** (by design, §Scenario 8's policy).

**The critical test:** unauthorized reversal of the Material Issue (Accountant, `reverse:false`) correctly blocked. CEO-authorized reversal succeeded. Reversing the SAME original a second time correctly blocked (`"Already reversed by..."`). **Reversing the reversal itself** — this is where the second defect (§A item 2) was found, on the FIRST run: it succeeded, and DB-level inspection proved the exact mechanism (GL recreated the original ₹8,000 effect on account 1200 with zero corresponding inventory movement — net GL: −₹8,000; net physical stock movement: 0 units). Fixed, then the identical script was re-run: **`reverseTheReversal` now correctly blocked**, with the precise error identifying the entry as itself a reversal and explaining the correct remediation (post a fresh, independently-authorized document).

Final document map (post-fix, on the corrected re-run): original JE `reversedByEntryId` points to the one legitimate reversal; the reversal's own `reversalOfId` points back to the original; no third entry exists in the chain. Trial Balance/AR/AP reconciled.

## H. Cross-Reference Attack Results (Part F)

**PROVEN LIVE**, using real document IDs belonging to genuinely different customers/vendors/POs (not phantom):

| Attack | Result |
|---|---|
| Customer A's real invoice, receipt attempted as Customer B | ❌ `"That invoice is not an open item for this customer."` |
| Customer A applies a receipt against Customer B's real invoice | ❌ Same guard |
| Vendor B attempts payment against Vendor A's real bill | ❌ `"That bill is not an open item for this vendor."` |
| Vendor A attempts payment against Vendor B's real bill | ❌ Same guard |
| Supplier bill created referencing PO-B but GRN-A (both real) | ❌ `"That GRN does not belong to the selected PO."` |
| Inventory transfer referencing a nonexistent material (real warehouses, fake material — a hybrid real/phantom test) | ❌ `"Material ... does not exist."` |
| Customer A invoice billed against Project B (both real, different owners) | ✅ **Allowed** — genuinely no cross-check exists between customer and project ownership in this Lab. Disclosed as a design characteristic, not flagged as a defect, since a business may legitimately bill a project under a different customer entity (e.g. a corporate parent) — but noted as a gap worth an explicit management policy decision if unintended. |
| Fixed-asset disposal "against a different project" | N/A — `disposeFixedAsset()` takes no caller-supplied project parameter at all; derives it strictly from the asset record, so this specific vector doesn't exist. |

## I. Reversal Graph Forensics (Part H)

**PROVEN LIVE** via a full scan of all 754 journal entries in `db.json`:

| Metric | Count |
|---|---|
| Total JEs | 754 |
| Reversal entries (`sourceType==='Reversal'`) | 76 |
| Originals marked reversed | 76 (exact match — no drift) |
| Reversal without a valid original reference | 0 |
| Original marked reversed but no matching reversal JE exists | 0 |
| Reversal JE whose claimed original doesn't exist | 0 |
| Multiple reversals of the same original | 0 |
| **Reversal of a reversal** | **1** — the exact historical instance created by this phase's own pre-fix testing (§A item 2), deliberately not deleted, disclosed as historical evidence |
| Orphan reversal (bidirectional link mismatch) | 0 |
| Cross-document reversal (wrong sourceType linkage) | 0 |
| Mismatched amount (reversal ≠ original) | 0 |
| Mismatched project (reversal references a different project than its original) | 0 |

This is a clean graph in every dimension except the one instance this phase itself created and then fixed the root cause of.

## J. Failure/Atomicity Results (Part G)

**NOT VERIFIED** this phase — no deliberate fault injection was built or run (see §B). This is stated plainly rather than inferred as passing from the absence of a crash during ordinary rejected-attempt testing.

## K. ID-Generator Classification (Part I)

Carried forward from Phase 33 (96 discovered, 21 fixed across both phases: 16 in Phase 33 + this phase added zero NEW generator fixes, since none of the 9 newly-gated functions this phase introduced a NEW id-generation call site — they reused existing ids/`nextId()` already in place). 10x concurrency re-confirmed **PROVEN LIVE** (`DRAFT-`/`JE-`/`PO-` all unique under concurrent load). The remaining ~72-77 lower-priority generators were **NOT** re-enumerated line-by-line this phase — carried forward as an open item from Phase 33, not re-verified fresh.

## L. Audit Verification (Part J)

**PARTIALLY VERIFIED.** Every attack-matrix rejection and the two new defects' fix-verification were confirmed via live HTTP responses; a direct `/api/audit-log` query was not re-run for every one of the ~17 named event types this phase specifically (Phase 33 already did this rigorously for `ClosedProjectPostingOverride`). Not claimed complete.

## M. Independent Accounting Reconciliation (Part K)

**PROVEN LIVE** after all of this phase's attacks: `/api/reconciliation` reports AR MATCH and AP MATCH; `/api/trial-balance`'s own account rollup sums to Dr = Cr = ₹7,804,909.11 (a 0.0000009 floating-point residual well under the 0.01 tolerance used throughout this audit series, not a real imbalance). Scenario 8/9's GST figures were independently pre-calculated from first principles (base × rate) before any ERP read, not derived from the ERP's own report output.

## N. Database Integrity Results (Part O)

**PROVEN LIVE.** Full 105-collection duplicate-ID/document-number scan: **zero new duplicate IDs** (still exactly the same 3 pre-existing MV-/IADJ- historical duplicates from Phases 30/31, unchanged). Document-number duplicates: the same 4 benign quotation-revision pairs as Phase 33's baseline — zero new ones (no quotation revisions were created this phase).

## O. Regression Results (Part M)

**PROVEN LIVE.** 19/19 historical suite — all PASS. Phase 22/23 compound-rule battery — all PASS (Trial Balance, AR, AP, Output Tax, Input Tax, MAT-1 health). Scenario 2 (Quotation Revision) — fresh run, clean. Scenario 3 (Partial Procurement) — fresh run, PO/GRN/bill/Trial Balance all clean. Scenario 4 (Material Return) — fresh run, moving-average calc matched to 4 decimal places, return correctly restored stock, Trial Balance balanced.

---

## P. Defect Register

| ID | Severity | Function | Root Cause | Business/Accounting/Tax Impact | Fix | Live Verification | Regression | Status |
|---|---|---|---|---|---|---|---|---|
| P34-D1 | **CRITICAL** | `splitOriginalTax()` (shared by `createSupplierCreditNote`, `createSupplierDebitNote`) | Hardcoded `baseAccount` parameter (`'5000'`) only matches the ad-hoc supplier-bill path; the standard PO/GRN 3-way-matched path posts base to `'2050'` instead, so the filter found nothing and silently zeroed the tax split | A DN/CN against any PO-linked bill (the standard procurement path) booked the FULL amount as base with ZERO Input Tax reversed — genuine ITC-overclaim exposure, understates AP tax-clearing accuracy, GST Rule 42/43 risk | Derive `baseTotal` from the entry's own balanced gross total (`totalDebit`) minus tax, independent of which account holds the base; removed the now-unused `baseAccount` param from the function and all 4 call sites | Re-ran the exact original Scenario 9 script post-fix: DN's Material Cost and Input Tax lines both matched the independent calculation exactly. Separately verified the sibling `createSupplierCreditNote()` against the same scenario, also correct. | 19/19 + compound battery + Scenarios 2/3/4 all clean post-fix | **FIXED, RE-TESTED** |
| P34-D2 | **CRITICAL** | `reverseEntry()` | No check for whether the document being reversed is itself a reversal entry; the inventory-compensation logic only fires for `sourceType` `'GRN'`/`'MaterialIssue'`, never `'Reversal'` | Reversing a reversal recreates the original transaction's full GL effect a second time with zero corresponding inventory movement — a real, silent GL-to-physical-stock divergence (proven: −₹8,000 GL effect vs. 0 net units moved) | Refuse to reverse any document whose own `sourceType==='Reversal'`, with an error explaining the correct remediation (re-post as a new document) | Re-ran the exact original Scenario 10 script post-fix: `reverseTheReversal` now correctly blocked; a legitimate reversal of the (non-reversal) original still succeeds; reversing the same original twice still correctly blocked | 19/19 + compound battery + reversal-graph scan (754 JEs, only the pre-fix historical instance remains) all clean post-fix | **FIXED, RE-TESTED** |
| P34-D3 | Medium (disclosed, carried from census) | `transferFixedAsset()` | No `assertCanXxx()` domain-level role check at all — relies solely on the route's `can(actor,'edit')`, which a broad set of roles (Purchase/Sales/Estimator/SiteInCharge) all satisfy | Inconsistent with this codebase's own established defense-in-depth pattern (every other mutating function re-checks its own permission internally); a route-layer-only gap is a thinner line of defense | Not fixed this phase (closed-project gate WAS added; the missing role check is a separate, narrower authorization-hardening item outside this phase's primary mandate) | N/A | N/A | **DISCLOSED, NOT FIXED** |
| P34-D4 (historical, not new) | Informational | — | The single pre-fix "reversal of a reversal" instance (JE-0746→JE-0747) created by this phase's own Scenario 10 test run, before P34-D2's fix was deployed | A documented, understood historical GL/inventory divergence for one disposable test project (PRJ-026), same treatment as the Phase 30/31 MV-/IADJ- historical duplicates | Deliberately NOT deleted or force-corrected — consistent with this audit's established policy against silently editing financial history. The correct remediation (a fresh, freshly-authorized Material Issue if the material is genuinely needed again) is a business decision for Appletree Finance, not invented here. | Confirmed present via the reversal-graph scan (§I) | N/A | **DOCUMENTED, PRESERVED** |
| P33-D2 (closed-project fixed-asset/site/job-work class, disclosed Phase 33) | High | 9 functions | See Phase 33 report | See Phase 33 report | See §A/§C/§D of this report | Proven live this phase | Clean | **CLOSED — fixed and verified this phase** |

No defect was found in the Scenario 8 CN/receipt flow, the cross-reference attack surface (beyond the one disclosed design characteristic), or the reversal-graph's structural integrity beyond the two items above.

---

## Q. Coverage Matrix

| Objective | Status |
|---|---|
| A — Close remaining closed-project posting class | **DONE** — 9 functions, live attack matrix, zero-mutation-on-rejection proven |
| B — Scenarios 8/9/10 | **DONE** — all live, independent calc, 2 real defects found+fixed+retested |
| C — Cross-module wrong-reference attacks | **DONE** — 8 real-ID attacks, all correctly handled |
| D — Reversal-of-reversal | **DONE** — the mission's own "critical test," defect found, fixed, retested |
| E — Project closure vs. all remaining postings | **DONE** — folded into §D/§G |
| F — ID-generator forensics | **PARTIAL** — concurrency re-proven; full 72-generator re-classification NOT VERIFIED this phase |
| G — Fault injection | **NOT VERIFIED** — explicitly disclosed, not run |
| H — Audit forensics | **PARTIAL** — spot-checked, not exhaustive across all named event types this phase |
| I — Reconciliation | **DONE** — TB/AR/AP live-confirmed balanced/matched after all attacks |

## R. NOT VERIFIED List (explicit, not hidden)

- Deliberate fault injection at any of the 8 named stages (Part G) — not built or run this phase.
- Full re-classification of the 72 remaining lower-priority `length+1` ID generators — carried forward from Phase 33.
- Exhaustive audit-log query across all ~17 named event types for this phase's specific new activity.
- A fully independent, from-scratch reconciliation engine built and run this phase (relied on the ERP's own `/api/reconciliation`/`/api/trial-balance` plus Scenario 8/9's own independent GST pre-calculations).
- Full static re-scan of every `DB.journalEntries.push`/`DB.inventoryMovements.push` call site and every route registration for capability/idempotency bypass potential.
- Wrong-material/wrong-warehouse/wrong-site specific cross-reference combinations beyond what §H covers.
- Multi-process concurrency safety of the JSON-file architecture (unchanged limitation, carried forward from Phase 32).

## S. Remaining Risks

- P34-D3 (transferFixedAsset's missing domain-level auth check) remains open.
- 72+ lower-priority ID generators remain on the `length+1` pattern.
- The customer-invoice-to-any-project gap (§H) has no cross-check; if unintended, needs an explicit management policy decision.
- Fault-injection atomicity remains unproven under deliberately forced mid-transaction failure.
- Job-work/site-material functions, now gated for closed-project posting, were not separately load-tested for concurrency.

## T. SAP Comparison

SAP S/4HANA enforces cost-object status (e.g., a closed WBS element/project) centrally across every FI/CO/MM posting type via status management (system statuses like TECO/CLSD blocking new postings account-wide), with authorized exception via explicit business-process configuration, not ad-hoc per-function patching. This Lab now achieves the equivalent OUTCOME for its 16 highest-traffic posting functions across Phases 33–34 via one shared, testable helper — architecturally simpler than SAP's status-management engine but functionally comparable in the specific dimension of "block new postings against a closed cost object, permit an authorized override." SAP's reversal engine has no analogous "reverse a reversal" concept at all — a reversal document in SAP is itself never eligible for further reversal (it must be corrected via a new document), which is now exactly this Lab's behavior after P34-D2's fix.

## U. Reliability Score

| Dimension | Score |
|---|---|
| 1. SAP Parity | 58/100 — up from Phase 33's implicit baseline given the closed-project gate now covers the large majority of posting classes and the reversal engine now matches SAP's own "no re-reversal" rule, but still lacks status-management-level centralization and full ID-series safety |
| 2. ERP Reliability | 64/100 — two CRITICAL defects were found in a single phase against previously-"certified" surfaces (CN/DN accounting, reversal), which must weigh against reliability even though both are now fixed |
| 3. Architectural Maturity | 3/5 — the shared-guard pattern is sound and consistently applied; two of the codebase's most central shared functions (`splitOriginalTax`, `reverseEntry`) still had unguarded edge cases found this late in the audit series |
| 4. Data Integrity | 82/100 — zero new duplicate IDs, clean reversal graph structurally, but one historical GL/inventory divergence now sits in the data (disclosed, not corrected) |
| 5. Accounting Integrity | 60/100 — P34-D1 was a real, silent tax-accounting defect on the mainstream procurement path; downgraded significantly from where Phase 33 left it, despite the fix, because it was live in production-shaped code until found this phase |
| 6. Security/RBAC | 74/100 — every closed-project/reversal authorization test passed; P34-D3's missing domain-level check on `transferFixedAsset` is a real, if narrower, gap |
| 7. Workflow/State Integrity | 78/100 — reversal graph is clean; the one historical anomaly is understood and bounded |
| 8. Auditability | 68/100 — every action tested this phase produced a real, correctly-detailed audit entry where checked; coverage was not exhaustively re-verified for every event type |
| 9. ID Integrity | 63/100 — unchanged from Phase 33's own honest score; 72+ generators remain unfixed, explicitly not claimed complete |
| 10. Project Accounting | 76/100 — profitability, cost-breakdown, and project-pl all cross-verified correct; the closed-project gate now covers essentially every direct posting class |

Scores were not increased for volume of testing; two scores (Accounting Integrity, ERP Reliability) were held down specifically because this phase found real, previously-uncaught CRITICAL defects in code that earlier phases had implicitly relied on as correct.

## V. GO / GO WITH CONDITIONS / NO-GO

**GO WITH CONDITIONS.**

Grounds against NO-GO: both CRITICAL defects found this phase were root-caused, fixed at the shared-function level (not patched per-symptom), and re-verified against their exact original failing test plus their sibling function; the reversal-of-reversal exploit (a genuine, previously-unguarded second-order integrity hole) is now closed with a real invariant, not a workaround; every closed-project posting class named across Phases 33–34 is now gated; zero new duplicate IDs; Trial Balance/AR/AP remained correct throughout, including immediately after both defects were live and exploited during testing (proving the underlying double-entry structure itself never broke, only the tax-split and reversal-chain logic layered on top of it).

Grounds against unconditional GO: two CRITICAL defects were found in this single phase in code from EARLIER phases that had been described as verified/correct — this is direct evidence that "no defect found yet" must never be read as "no defect exists," and the same caution applies to everything this phase did NOT get to (fault injection, full ID-generator reclassification, exhaustive audit-type coverage, P34-D3's auth gap). The system is not being declared production-ready in general — only the specific surfaces exercised across Phases 33–34 are certified to the evidence standard demonstrated in these reports.
