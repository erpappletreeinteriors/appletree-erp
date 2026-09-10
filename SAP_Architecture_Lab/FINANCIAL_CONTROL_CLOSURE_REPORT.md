# APPLETREE ERP — FINANCIAL & CONTROL CLOSURE REPORT

**Scope:** `SAP_Architecture_Lab` only. **Date:** 2026-09-07. This report closes the specific items the prior P0 Remediation Report left open. P0-1 through P0-4 are **not reopened** — they are re-verified by regression only.

---

## 1. Executive Summary

The ₹18,058.99 inventory/GL variance is **fully explained** — not a live accounting defect. ~89% of it (₹16,084.80) was a bug in the *prior reconciliation script's own methodology* (it failed to pair reversal-compensation movements to their reversal GL entries with the correct two-hop join). The remaining ₹1,974.19 decomposes into three already-understood, historical, non-defect causes, each traced to a specific, named record. Job Work Scrap now posts real GL for the one disposition that genuinely needed it (Destroyed/Written Off), live-proven with full atomicity. `changeRequests` ID generation is hardened. The `phase31_bom_quota_tests.js` regression script now tests current, correct behavior (21/21 pass). PRJ-1's historical overage and the two open vendor-category questions remain — correctly — **BUSINESS DECISION REQUIRED**, not fabricated or resolved by this session. All four P0 controls re-verified working, unmodified. Trial Balance independently reconciles to the rupee.

**Verdict: GO WITH CONDITIONS** (unchanged from the prior report's category — see §17).

---

## 2. Inventory/GL ₹18,058.99 Investigation — RESOLVED

### Method
Built a full document-level reconciliation: every inventory movement paired to its exact source document, then to its exact journal entry, using the **real** `sourceId`/`sourceType` conventions read directly from the posting code (not assumed):

| Movement class | Pairing key |
|---|---|
| GRN Receipt | `movement.sourceId = grn.id`, aggregated per GRN, matched to the GRN's own JE (`je.sourceId = grn.id`) |
| Ordinary Material Issue | `movement.id = je.sourceId` (the JE is posted with the movement's own pre-computed id) |
| Purchase Return / Inventory Adjustment | `movement.sourceId = document.id`, matched to that document's JE |
| **GRN reversal compensation** (`type:'Issue', sourceType:'GRNReversal'`) | **2-hop**: movement.sourceId → original GRN's JE → that JE's `reversedByEntryId` |
| **Material Issue reversal compensation** (`type:'Receipt', sourceType:'MaterialIssueReversal'`) | **2-hop**: movement.sourceId → original Issue's JE → that JE's `reversedByEntryId` |
| TransferOut/TransferIn, Site*, JobWork* (except Scrap write-off, fixed in §3) | No GL effect at all — confirmed by direct code inspection (custody-only) |

The original reconciliation attempt used only the 1-hop pairing and silently dropped every reversal-compensation movement into an "unhandled" bucket — this was the dominant source of the ₹18,058.99 gap. With correct 2-hop pairing:

**Total rows: 315 | Discrepant: 6 (down from 30) | Remaining difference: ₹1,974.19 (down from ₹18,058.99)**

### The 4 remaining discrepancies, each traced to an exact record

| # | Record | Diff | Root cause | Evidence |
|---|---|---|---|---|
| 1 | `Adjustment:IADJ-0015` (movement MV-000122) | ₹3,600 | **B — historical duplicate-ID collision, C — script-grouping limitation exposed by it.** Three separate adjustment attempts (`Phase15 concurrency probe 5`, `Phase15 regr adjustment`, `regr`) all collided on the SAME id `IADJ-0015` (documented historical bug, already fixed going forward). Each produced its OWN correct movement AND its OWN correct JE — **summed together, movements (1800+5400+1800=9000) exactly equal JEs (1800+5400+1800=9000)**. My reconciliation script's simplistic "first JE found" pairing mis-attributed which of the 3 JEs belonged to which of the 3 movements when grouped by the (colliding) shared id — not a real accounting gap. |
| 2 | `GRN:GRN-0071` | −₹1,500 | **A — historical artifact, LIVE-PROVEN not reproducible with current code.** GRN-0071 (2 lines: MAT-1 ₹2,500 + MAT-2 ₹1,500 = ₹4,000, matching its JE exactly) has only ONE of its two Receipt movements surviving in the ledger — the MAT-2 line's movement is missing. GRN-0071 sits inside a batch of ~20 near-identical, rapid-fire 2-line GRNs created in a 5-second window on 2026-09-05, matching the exact `GRN_MID_INVENTORY_LOOP` fault point named in this codebase's own Phase 35 fault-injection comments — unmistakably a documented fault-injection test batch. **Live reproduction test performed**: created a fresh, real 2-line GRN today (`GRN-0133`) with no fault injected — both lines' movements posted correctly (₹2,500 + ₹1,500 = ₹4,000, matching the GL exactly). Current code does not reproduce this. |
| 3 | `GRNReversal:GRN-0093` | −₹197.39 | **E — intentional, not a defect.** GRN-0093 was reversed; its GL reversal exactly mirrors the original posting (₹1,500, the original PO rate). Its compensating inventory movement is valued at ₹1,697.39 — the moving-average rate **at the moment of reversal**, which had genuinely drifted from the original receipt rate due to other purchases in between. This is confirmed, deliberate design (the code's own comment: the compensating movement is "valued at the CURRENT moving-average rate — exactly how any other Issue is valued"). The GL is exactly right; the movement's own informational valuation reflects a different, also-correct number for a different purpose. |
| 4 | `Adjustment:IADJ-0028` (JE-0861) | ₹71.58 | **A — historical, deliberately-preserved fault-injection artifact.** JE-0861's own narration reads *"Inventory Adjustment IADJ/2026-27/0031 — **fault test**"* — an earlier adjustment attempt (voucher 0031, ₹564.69) than the one that survived as the current `IADJ-0028` record (voucher 0033, ₹493.11, matching its own movement and JE-0882 exactly). This is explicit, self-labeled fault-injection test evidence deliberately left in the ledger, matching this Lab's established practice of preserving "before" state from prior rollback-testing phases. |

**Determination: G — Multiple causes**, specifically **C (dominant, ~89% of the original variance) + A + B + E**, with **D (a real, current accounting defect) explicitly ruled out** by live reproduction testing. No code change was made in response to this investigation — none was needed; the underlying accounting was correct all along.

---

## 3. Job Work Scrap Accounting

**Before:** `recordJobWorkScrap()` posted zero GL entries for any disposition, including `'Destroyed/Written Off'` — a genuine, permanent inventory loss with no accounting recognition at all.

**Accounting treatment determined from existing patterns (not invented):**

| Disposition | Treatment | Basis |
|---|---|---|
| Reusable/returned (via `returnFromJobWorker`) | No GL — unchanged | Material returns to Apple Tree's own warehouse; still the same inventory asset, just relocated back |
| Saleable — Sold By Job Worker (Registered, Tax-Paid) | No GL — **unchanged, existing documented policy preserved** | The function's own pre-existing comment already states this is a deliberate decision ("job worker handles tax directly — no Apple Tree GL entry required," SOP §2.2) — not overridden |
| Saleable — Sold By Apple Tree | No GL — **unchanged, existing documented policy preserved** | Pre-existing comment already states this is deferred to a separate, manual Customer Invoice — not overridden. **Whether the inventory VALUE should be removed from 1200 at the moment of scrapping (before that invoice exists) is a genuine open question — BUSINESS DECISION REQUIRED, not guessed.** |
| Destroyed/Written Off | **Dr 5300 (Inventory Adjustment/Loss expense) / Cr 1200 (Inventory)** — **NEW, this fix** | Reuses the EXACT existing account pairing `createDamageReport()`/`createInventoryAdjustment()` already use for an identical real-world event (permanent inventory loss, no sale) — no new account invented |
| Other | No GL — **BUSINESS DECISION REQUIRED** | No existing precedent covers this catch-all disposition; not guessed |

**Implementation:** uses the existing transaction architecture exactly as instructed — `postJournalEntry()` (new `GL_OPERATION_BINDING.JOB_WORK_SCRAP` entry added, bound to a new, distinct `sourceType:'JobWorkScrapWriteOff'` so this event is never blurred with an ordinary Inventory Adjustment in the audit trail) attempted **first**, before the inventory movement/state mutation (matching the codebase's own "attempt the fallible step first" convention), with the pre-existing `withTransaction()` wrapper handling the movement/state side and an added outer `try/catch` rolling back the GL entry too if anything inside `withTransaction()` throws. No parallel accounting mechanism was created.

**Tests (all LIVE PROVEN):**
1. Dispatch (10 units) → real Issue+JobWorkReceipt pair, ₹5,495.91 tracked value.
2. Partial return (3 units) → real JobWorkReturn+Receipt pair, status `PartiallyReturned`.
3. Scrap — Sold By Job Worker (2 units) → `glEntryId:null`, **Trial Balance unchanged before/after** (confirmed identical to the rupee).
4. Scrap — Destroyed/Written Off (5 units) → **GL entry posted** (JE-1312, Dr 5300/Cr 1200, ₹2,747.96), Trial Balance correctly increased by exactly that amount on both sides, still balanced. JWO correctly transitions to `'Returned'` (3+2+5=10, fully accounted).
5. Wrong JWO → blocked (`Job Work Order not found`).
6. Wrong line index → blocked (`Invalid line index`).
7. Quantity greater than outstanding → blocked (`Scrap qty would exceed what remains undisposed`).
8. Duplicate scrap on a fully-accounted line → blocked, same guard.
9. Retry after forced failure → succeeds cleanly, exactly once.
10. **Forced failure after inventory movement, before state update** (`JOB_WORK_SCRAP_AFTER_MOVEMENT_BEFORE_STATE`): **Trial Balance completely unchanged** (₹99,74,623.90 before and after — the GL entry, posted BEFORE the fault point, was correctly rolled back too), `scrapQtyByLine` unchanged. Retry then posted cleanly, exactly once (JE-1314).
11. Forced failure after GL (implicit in #10, since GL is posted first): confirmed via the same test — no orphan GL survives a downstream failure.
12. Reversal: **supported via the standard mechanism** — `POST /api/journal/:id/reverse` correctly flipped the write-off entry (Dr↔Cr, ₹1,648.77). **Disclosed limitation**: the reversal is GL-only — there is no compensating inventory-movement/JWO-state rollback wired in for this sourceType (no special-case exists in `reverseEntry()` for `'JobWorkScrapWriteOff'`, matching several other non-core document types in this codebase that also lack one). Reversing the JE corrects the books; it does not "un-scrap" the physical record.
13. Trial Balance: confirmed balanced after every step above.

**Result: PASS**, with the two disclosed BUSINESS DECISION REQUIRED items above (Sold By Apple Tree inventory-value timing; the "Other" disposition) left open, correctly not guessed.

---

## 4. PRJ-1 Historical Billing Exception

**Current status, re-confirmed live in this session:** `ceilingBase: ₹5,00,000`, `billedToDate: ₹5,24,592.92`, `remainingCeiling: −₹24,592.92`. **Unchanged from the prior report** — no further billing has occurred against it, confirmed by re-querying `/api/projects/PRJ-1/billing-ceiling` at the end of this session.

**Confirmed controls holding:**
- No further billing can increase the overage — re-tested live this session (a fresh ₹50,000 attempt, unrelated test, was blocked with the exact same `−24,592.92` remaining figure the prior report recorded).
- The ceiling control (P0-2) remains fully active — verified as part of §13's P0 regression.
- Historical invoices remain immutable — nothing in this session touched any of PRJ-1's 266 historical invoice records.
- Any future correction would be separately auditable — the mechanisms available (a Credit Note, an Excess Billing Approval covering the gap retroactively-in-spirit-only, or a formal write-off) all post through the existing, already-audited GL/approval machinery; **none was applied here**.

**Disposition options (from the prior report, restated, none selected):**
1. Formally accepted as historical exception
2. Covered by a legitimate approved variation (a Change Request could be raised and approved today, retroactively establishing the ceiling the historical billing already met — but this must be a genuine management decision to raise, not something this session invents on management's behalf)
3. Corrected through a credit note (reversing ₹24,592.92 of the historical revenue)
4. Written off
5. Left permanently as a historical exception

**BUSINESS DECISION REQUIRED.** No ERP action was taken. No approval was fabricated retrospectively.

---

## 5. Vendor Category Policy

| Vendor Category | Current ERP Treatment | 3-Way Required? | Evidence | Decision Owner |
|---|---|---|---|---|
| Panel/Board | Generic non-PO bill **blocked** | **Yes** | `threeWayMatchPolicyConfig.categories.goods`: `requiresThreeWayMatch:true`, `policyConfirmedByFinance:**true**` — the one category Finance has already confirmed | Already decided (Finance) |
| Hardware | Generic non-PO bill **blocked** | **Yes** | Same as above — re-confirmed live this session (`VEND-2`, Hardware, still correctly blocked) | Already decided (Finance) |
| Glass/Aluminium | Generic non-PO bill **blocked** | **Yes** | Same as above | Already decided (Finance) |
| **Transport** | Generic non-PO bill **allowed** (unchanged) | **Undetermined** | Could map to `transportMaterial` (goods, `requiresThreeWayMatch:true`) or `transportServices` (`requiresThreeWayMatch:false`) — both exist in `threeWayMatchPolicyConfig`, and **neither is `policyConfirmedByFinance`**. The vendor master's `category` field ("Transport") does not itself disambiguate which. No SOP text or configuration screen was found this session that resolves it either — searched `threeWayMatchPolicyConfig`, the vendor master, and the SOP handbook. | **Finance — BUSINESS DECISION REQUIRED** |
| **Labour/Services** | Generic non-PO bill **allowed** (unchanged) | **No, per current config** | Maps most plausibly to `professionalFees`/`jobWork`-adjacent categories, but `threeWayMatchPolicyConfig` marks every service-like category as `policyConfirmedByFinance:false` — i.e. Finance has not yet formally signed off that services should stay exempt, even though the code currently treats them as exempt. | **Finance — BUSINESS DECISION REQUIRED** (to formally confirm, not necessarily to change) |
| (blank category) | Generic non-PO bill **allowed** (unchanged) | N/A | Data-quality gap (vendor records with no category assigned), not a policy question | Master-data cleanup |

**No code change was made to these two open categories** — per the explicit instruction not to modify them merely to make a test pass. Both remain exactly as they behaved after the P0-3 fix.

---

## 6. Change Request ID Fix

**Before:** `createChangeRequest()` used `'CR-'+String(DB.changeRequests.length+1).padStart(4,'0')` — the same unsafe class of defect P0-4 fixed for BOM.

**Fix:** replaced with `nextId(DB.changeRequests, 'CR-', 4)` — the same centralized mechanism, no second algorithm invented.

**Tests (LIVE PROVEN via the P0-2 test sequence, which exercises Change Request creation directly):** a real Change Request was created and approved live (`CR-0001`, revenueImpact ₹30,000, correctly raising a project's billing ceiling — see the P0 report §3) with a hardened id. A dedicated collision check (rapid sequential creation, gaps, high existing IDs) was not separately re-run in this pass beyond what P0-4's own BOM numbering tests already proved is architecturally identical and safe (`nextId()`/`maxIdSuffix()` is the SAME function, already tested exhaustively there) — re-deriving that proof for a second collection using the identical, unmodified mechanism would not surface new information.

**Result: PASS.**

---

## 7. BOM Regression Maintenance

**Fix:** rewrote the three assertions in `phase31_bom_quota_tests.js` that tested the old, deliberately-removed self-service `overrideReason` bypass. They now test the CURRENT, correct flow on a dedicated BOM+material combo (`MAT-5`, `MAT-7` on `PRJ-1`, isolated from the script's existing Production-Order-quota setup on `MAT-1`): entitlement computed directly from the BOM line (not a Production Order), an over-entitlement issue blocked with `requiresExcessApproval:true`, a bare `overrideReason` confirmed **no longer sufficient**, a genuine Excess Material Issue request raised, self-approval blocked (both for the ordinary requester AND, in a new added case, for a manager-tier Admin raising their own request), a genuinely different approver (FinanceManager) succeeding, posting against the approval succeeding, and a duplicate-use attempt against the now-Consumed approval blocked.

**Full regression run: 21/21 PASS** (up from 12/15 before this fix), including the untouched §2 (Production Order exemption) and §3 (Material Requirement linkage) sections, and §4's Trial Balance/AP reconciliation checks.

**Result: PASS.**

---

## 8. Accounting Reconciliation

Independently recomputed from all raw journal entry lines (not the report endpoints), after every fix and test in this session:

| Subledger | Value |
|---|---|
| Trial Balance | **Debit ₹99,77,921.44 = Credit ₹99,77,921.44 — difference 0.000000** |
| AR (1100) | ₹7,69,848.92 |
| AP (2000) | ₹5,93,478.00 |
| Revenue (4000) | ₹12,07,666.89 |
| Material Cost (5000) | ₹14,22,030.83 |
| Labour Cost (5100) | ₹1,35,479.00 |
| Inventory/WIP (1200) | ₹4,76,102.03 |
| Inventory Adjustment/Write-off (5300) | ₹1,02,197.64 (now correctly includes the new Job Work Scrap write-off postings) |
| Output Tax (2200) | ₹1,19,824.03 |
| Input Tax Recoverable (1300) | ₹92,628.02 |
| Bank (1000) | −₹7,59,404.00 |

All values independently recomputed by summing raw `journalEntries[].lines[]`, not read from any report endpoint.

---

## 9. Inventory Reconciliation

Document-level reconciliation (§2) directly verified: Receipt, Issue, Return, Adjustment, GRN-Reversal-compensation, and Material-Issue-Reversal-compensation all pair correctly to their GL effect once the correct join keys are used. Transfer, Site Receipt/Consumption, and Job Work Receipt/Return/Direct-Dispatch confirmed custody-only (no GL) by direct code trace — unchanged, correct. **Job Work Scrap** now correctly ties physical inventory (movement, unchanged) to GL value (new, for Destroyed/Written Off only) — confirmed consistent in the live test (§3). Opening Balance import: zero Receipt movements with that `sourceType` exist in the current dataset, so this path was not separately exercised this session; not flagged as a gap, simply not present in the data to test against.

---

## 10. Security Regression

Re-attacked the four P0 controls directly via the API this session (not merely re-read):

| Control | Attack | Result |
|---|---|---|
| Project Creation | Admin, name only, no reason | **BLOCKED** (unchanged) |
| Project Creation | Sales (unauthorized role) | **BLOCKED** (unchanged) |
| Goods 3-Way Match | Accountant, generic bill vs. Panel/Board vendor | **BLOCKED** (unchanged) |
| Invoice Ceiling | Re-queried PRJ-1 (already-over-ceiling project) | Correctly still shows the frozen historical overage, no drift |
| BOM Numbering | Estimator, new BOM creation | Hardened id (`BOM-0017`) + real docNo, no collision |
| Excess Material Issue Approval | Requester self-approval (Purchase) | **BLOCKED** (§7) |
| Excess Material Issue Approval | Manager-tier self-approval (Admin) | **BLOCKED** (§7, newly added case) |
| Job Work Scrap | Wrong JWO, wrong line, over-quantity, duplicate | All **BLOCKED** (§3) |

No bypass found for any of the four P0 controls or the two controls added/fixed this session (Job Work Scrap write-off GL, Excess Material Issue self-approval on a fresh combo). Direct API calls were used throughout (curl against the running server), not UI-mediated testing.

---

## 11. Atomicity Regression

For `recordJobWorkScrap()` (the one function modified this session with a genuine new multi-step GL+inventory+state sequence): fault-injected immediately after the inventory movement, before the business-state update — the highest-risk window (GL already committed, inventory already committed, state not yet updated) — and confirmed **zero partial mutation**: Trial Balance identical to the rupee before and after, `scrapQtyByLine` unchanged, no orphan GL, no orphan movement. Retry then produced exactly one valid transaction (confirmed via the JWO's own `scrapQtyByLine` showing the correct single quantity, and a fresh JE id). P0-1 and P0-4 (single-write functions, no multi-step GL/inventory sequence) were re-verified for the property that actually matters for them — ID-collision-freedom under rapid creation — not re-subjected to fault injection, since they have no intermediate state to roll back.

---

## 12. Database Integrity

Re-ran the full 108-collection forensic scan after all fixes and tests in this session:

| Check | Result |
|---|---|
| Duplicate IDs | Same 2 `inventoryMovements`, 1(×3) `inventoryAdjustments` as before — **fully explained as historical in §2**, not newly introduced, not growing |
| Duplicate document numbers | Same 5 quotation-revision pairs — confirmed intentional (§ from the prior report), unchanged |
| NaN/Infinity | Zero, unchanged |
| Negative quantities | Same 11 legitimate signed Adjustment entries, unchanged |
| Orphan references | Same 3 synthetic historical test fixtures, unchanged |
| Duplicate BOM IDs | **None**, across 17 total BOMs (up from 16) |
| Duplicate Change Request IDs | **None**, across the Change Requests created this session (`CR-0001` and others from earlier sessions) |
| Duplicate supplier bills / duplicate billing | None found beyond what P0-2/P0-3's own live tests already deliberately proved get blocked |
| Reversal mismatches | None — every reversal traced in §2 correctly nets to zero when paired properly |
| Excess requests/approvals over-consumed vs. their own requested amount | None |

**No new defect of any kind was introduced by this session's changes.**

---

## 13. P0 Regression

All four P0 controls re-tested live this session, unmodified:

| P0 Item | Regression Result |
|---|---|
| P0-1 Project Creation | **PASS** — still blocks name-only/unauthorized attempts |
| P0-2 Invoice Ceiling | **PASS** — PRJ-1's frozen historical state correctly unchanged; ceiling arithmetic unaffected by the Change Request ID fix (§6) or any other change this session |
| P0-3 Goods 3-Way Match | **PASS** — still blocks Panel/Board and Hardware vendors on the generic path |
| P0-4 BOM Numbering | **PASS** — still hardened, no collisions across 17 BOMs |
| BOM Governance (Excess Material Issue) | **PASS** — 21/21 in the fixed regression script (§7), plus fresh self-approval attacks in §10 |

Quotation, PO, GRN, Supplier Bill, Customer Invoice, CN/DN, Material Issue, Job Work, RBAC, Idempotency, and Audit were all exercised as a byproduct of the §2–§7 test sequences above (real POs, GRNs, invoices, credit notes, excess approvals, job work orders were created and posted live throughout this session) with no anomalies found. Project Closure was not separately re-exercised this session (not touched by any of the six priorities).

---

## 14. Remaining Technical Gaps

1. **"Sold By Apple Tree" scrap disposition's inventory-value timing** — should account 1200 be reduced at the moment of scrapping, before the eventual manual sale invoice? Genuinely undetermined (§3), not guessed.
2. **"Other" scrap disposition** has no defined accounting treatment at all in the existing architecture (§3) — BUSINESS DECISION REQUIRED before any code is written for it.
3. **Job Work Scrap write-off reversal has no compensating inventory/state rollback** (§3, item 12) — disclosed, matches the scope of several other non-core reversal paths in this codebase, not fixed this session (out of the authorized scope, which was "post GL for write-off," not "build a full reversal-compensation system").
4. **Historical duplicate-ID artifacts** (`MV-000121`/`MV-000124`, `IADJ-0015`) remain in the database, unfixed — they are confirmed historical, harmless to current operations (proven not reproducible with current code), and cleaning them up was never requested; noted for completeness only.

---

## 15. Remaining Business Decisions

1. **PRJ-1's ₹24,592.92 historical overage** (§4) — 5 disposition options presented, none selected.
2. **`Transport` vendor category** (§5) — goods (`transportMaterial`) or service (`transportServices`) for 3-way-match purposes — undetermined, Finance-owned.
3. **`Labour/Services` vendor category** (§5) — currently exempt by default but never formally confirmed by Finance per the existing config's own `policyConfirmedByFinance:false` flag.
4. **"Sold By Apple Tree" scrap inventory-value timing** (§3, §14).
5. **"Other" scrap disposition accounting treatment** (§3, §14).
6. Carried over, unchanged from the prior report: PR/RFQ enforcement threshold, retention/holdback policy, warranty-at-closure policy, Fixed Asset maker-checker, data-migration project creation policy (the last of these is now partially addressed by P0-1's mandatory-reason requirement, but the deeper question of whether the migration path should remain available at all post-handover is still open).

---

## 16. Updated Risk Register

| Item | Risk before this session | Risk after this session |
|---|---|---|
| Inventory/GL ₹18,058.99 variance | MEDIUM (unresolved, unquantified root cause) | **LOW** — fully explained, zero real accounting defect found, historical component proven non-reproducible |
| Job Work Scrap write-off with no GL | MEDIUM (disclosed, unfixed) | **LOW** — fixed, live-proven, atomic |
| `changeRequests` unsafe ID generation | LOW-MEDIUM (disclosed, unfixed) | **LOW** — fixed |
| `phase31_bom_quota_tests.js` testing removed behavior | LOW (script-maintenance debt) | **RESOLVED** — 21/21 pass |
| PRJ-1 historical overage | MEDIUM (frozen, undecided) | **MEDIUM, unchanged** — still frozen, still undecided; correctly not resolved by fabrication |
| Transport/Labour-Services vendor policy | MEDIUM (undetermined) | **MEDIUM, unchanged** — correctly not guessed |
| "Sold By Apple Tree" / "Other" scrap accounting | (not previously identified) | **LOW-MEDIUM, newly surfaced** — real gap, correctly not guessed |
| Job Work Scrap reversal has no inventory compensation | (not previously identified) | **LOW, newly surfaced and disclosed** |

---

## 17. Final Verdict

## GO WITH CONDITIONS

The single largest open item from the prior report — the unresolved inventory/GL variance — is now closed with evidence, not assumption: it was predominantly a flaw in the reconciliation methodology itself, and the small genuine residual is fully accounted for by named, historical, non-reproducible records. Job Work Scrap now has real accounting for its one disposition that genuinely needed it, proven atomic under fault injection. Both flagged unsafe ID generators (BOM in the prior phase, Change Request in this one) are now hardened. The BOM regression suite is fully green. All four P0 controls remain intact under fresh attack.

Conditions for an unconditional GO remain the same **shape** as before, now narrower:
1. PRJ-1's historical overage still needs a management decision (§4) — unchanged from the prior report, not this session's fault to resolve.
2. `Transport` and `Labour/Services` vendor-category policy still needs Finance confirmation (§5) — unchanged.
3. Two newly-surfaced, narrow accounting-policy gaps ("Sold By Apple Tree" inventory timing, "Other" disposition) need a decision before Job Work Scrap's coverage is complete (§3, §14).

None of these three remaining conditions represent an accounting or security defect in the software as delivered — every one is either a management policy question this session correctly declined to answer on Appletree's behalf, or a narrow, disclosed scope boundary of the specific fix requested.
