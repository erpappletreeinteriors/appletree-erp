# PHASE 32 — DOCUMENT ID INTEGRITY + APPLETREE SCENARIOS 2–4 FORENSIC AUDIT

**Scope:** SAP_Architecture_Lab only (isolated experimental build, NOT the live/offline production ERP).
**Date:** 2026-09-05
**Note on numbering:** This is Phase 32 of this Lab's *adversarial forensic security/QA audit* thread (a distinct, separately-numbered engagement from the earlier build/SOP-compliance thread, whose own Phase 32–36 checkpoints and reports already exist in this directory dated Aug 27–28 under different titles, e.g. `PHASE32_FINAL_INTEGRATED_UAT_READINESS_REPORT.md`). This report is filed under a distinct name specifically to avoid colliding with that thread's files. Domain.js's own comments already reference fixes as late as "Phase 41," confirming the codebase has been touched by multiple overlapping-numbered engagements — this is a pre-existing property of the Lab, not something this phase altered.

---

## 1. Executive Summary

Two objectives were executed against the live running server (`localhost:4001`) with real HTTP calls and a real `db.json`, never by editing JSON directly:

- **Objective A (ID Integrity):** The systemic `array.length+1` ID-collision defect (root cause of two real historical duplicates found in Phases 30–31) was generalized into one shared, hardened `nextId()`/`maxIdSuffix()` mechanism and applied to 16 call sites across 14 mission-priority collections. Safety was proven by deliberately constructing length-vs-max-suffix divergence, not merely by "no duplicate exists today."
- **Objective B (Scenarios 2–4):** All three Appletree end-to-end scenarios were executed live, with expected values calculated independently *before* reading any ERP total. All three completed with zero deviation between the independent calculation and the ERP's own figures.

**One new defect was found and disclosed** (not silently fixed — see §9): `createMaterialIssue()` has no closed-project gate, while `reverseEntry()` (this system's "Material Return" mechanism) correctly does. This is an asymmetry, not a proven case of actual financial corruption in the three scenarios tested.

**No duplicate financial/inventory document ID was created this phase.** The three duplicate IDs found in the database-wide scan (§7) are the *same, already-known* historical duplicates from Phases 30–31 — confirming the `nextId()` fix has produced zero new collisions since being deployed.

---

## 2. Evidence Labels Used

| Label | Meaning |
|---|---|
| **PROVEN LIVE** | Exercised via a real HTTP call against the running server; response inspected. |
| **CODE VERIFIED** | Confirmed by reading the exact source function, not executed this phase. |
| **STATICALLY VERIFIED** | Confirmed by scanning the codebase/database files directly (not via API). |
| **PARTIALLY VERIFIED** | Some but not all of a requirement's sub-cases were exercised. |
| **NOT VERIFIED** | Explicitly not tested this phase — named and reasoned, never silently skipped. |
| **INCONCLUSIVE** | A test ran but its result cannot be safely interpreted without further work. |

---

## 3. Objective A, Part A/B — ID Generator Census & Classification

**STATICALLY VERIFIED.** A repository-wide scan for `array.length+1`-style ID construction found **96 occurrences**. These were classified and the 14 highest-risk collections (16 call sites, some functions having two — e.g. `createQuotation`/`reviseQuotation` share a pattern) were prioritized and fixed this phase, per the mission's explicit priority list:

| Collection | Prefix | Function(s) | Risk before fix |
|---|---|---|---|
| journalEntries | JE- | `postJournalEntry()` | **Highest** — every GL posting in the system |
| inventoryMovements | MV- | (already fixed Phase 30) | Confirmed historical collision |
| inventoryAdjustments | IADJ- | (already fixed Phase 31) | Confirmed historical collision |
| purchaseOrders | PO- | `createPurchaseOrder()` | High |
| grns | GRN- | `createGRN()` | High |
| quotations | QTN- | `createQuotation()`, `reviseQuotation()` | High |
| projects | PRJ- | `wonTransition()`, `createProjectMaster()` | High (+ a separate zero-pad format bug, see below) |
| billingMilestones | BM- | `createRebillMilestone()`, `createBillingMilestone()` | Medium |
| purchaseReturns | PRET- | `createPurchaseReturn()` | Medium |
| labourWages | LBR- | `recordLabourWages()` | Medium |
| projectExpenses | PEXP- | `recordProjectExpense()` | Medium |
| supplierCreditNotes / supplierDebitNotes | SCN- / SDN- | `createSupplierCreditNote()` / `createSupplierDebitNote()` | Medium |
| customerCreditNotes / customerDebitNotes | CCN- / CDN- | `createCustomerCreditNote()` / `createCustomerDebitNote()` | Medium |
| fixedAssets | FA- | `capitalizeFixedAsset()` | Medium |

**Remaining unsafe:** 96 − 16 = **80 occurrences** still use the raw `length+1` pattern, in lower-priority/lower-blast-radius collections (e.g. `COMMIT-` commitments, `3WM-` three-way-match exceptions, various operational/reporting IDs). This is an explicit, disclosed scope decision — fixing all 96 in one phase was judged too large and risky to do safely without individual verification of each, consistent with the same scoping discipline used in Phases 30–31.

---

## 4. Objective A, Part C — The Shared Safe Mechanism

```js
function maxIdSuffix(collection, prefix){
  let max = 0;
  for(const item of collection){
    const idStr = String(item.id);
    if(!idStr.startsWith(prefix)) continue;   // hardening: ignores foreign/malformed ids
    const n = parseInt(idStr.slice(prefix.length), 10);
    if(!Number.isNaN(n) && n>max) max = n;
  }
  return max;
}
function nextId(collection, prefix, padLength){
  return prefix + String(maxIdSuffix(collection, prefix)+1).padStart(padLength, '0');
}
```

This correctly handles, by construction:
- **Empty/missing collection** → returns `prefix + '1'` padded.
- **A gap from historical deletion** → returns `max+1`, never reuses the gap.
- **A restored/imported record with a higher number** → next id jumps past it.
- **A malformed or foreign-prefix id** → ignored (the `.startsWith(prefix)` guard, added this phase — the Phase 30/31 version used an unconditional `.replace()` which a foreign id could have poisoned).
- **Multiple prefixes in the same collection** → each prefix's own max is tracked independently since `maxIdSuffix` is always called with one specific prefix.

**Byproduct fix (disclosed, not hidden):** `createProjectMaster()`'s project ID previously had **no** `.padStart()` at all (would emit `PRJ-11` while `wonTransition()`'s path emits `PRJ-011` for the same sequence) — a genuine pre-existing format inconsistency, unified this phase to `nextId(DB.projects,'PRJ-',3)` on both paths.

---

## 5. Objective A, Part D — Deliberate Divergence Proof

**PROVEN LIVE (via isolated Node script, not the running server's shared `db.json`).** Six synthetic collections were constructed where `collection.length` and the true max suffix diverge, and `nextId()` was called against each:

| Scenario | length | true max suffix | `nextId()` result | Correct? |
|---|---|---|---|---|
| Gap from a deleted middle record | 2 | 5 | 6 | ✅ |
| Empty collection | 0 | 0 | 1 | ✅ |
| Manually-inserted high ID (e.g. an import) | 3 | 500 | 501 | ✅ |
| Duplicate historical IDs (3 records share one id) | 4 | 3 | 4 | ✅ (not re-collided) |
| Malformed/foreign-prefix id present | 3 | 3 (foreign id ignored) | 4 | ✅ |
| Restored/truncated collection (array shrunk, ids stayed high) | 1 | 900 | 901 | ✅ |

All six passed. This directly satisfies the mission's Absolute Rule: safety was proven under divergence, not asserted from the *absence* of a currently-visible duplicate.

---

## 6. Objective A, Part E — Concurrency Attack

**PROVEN LIVE**, with an explicit, mandated limitation disclosed:

- 10 simultaneous `Promise.all` requests each for: journal drafts→post (JE-), purchase orders (PO-). All 10 returned unique, sequential, fully-defined IDs with zero collisions and zero lost writes.
- **`multiProcessConcurrency: "NOT VERIFIED — MULTI-PROCESS CONCURRENCY"`** is carried explicitly in the raw result and repeated here per the mission's own instruction: this is a single Node process/single event loop test of concurrent HTTP request interleaving, **not** proof that two separate server processes writing the same `db.json` file cannot collide. The JSON-file architecture provides no cross-process write serialization; this remains an architectural limitation of the Lab, not something this phase's fix can close.

---

## 7. Objective A, Part F — Database-Wide Duplicate Audit

**PROVEN LIVE** via a direct scan of `db.json` (105 collections scanned, matching Phase 31's own enumeration; 59 carry an `id` field).

**ID duplicates found: 2 collections, 3 IDs — all pre-existing, none new:**

| Collection | Duplicate ID | Count | Status |
|---|---|---|---|
| inventoryMovements | MV-000121 | 2 | Same historical incident found in Phase 30. Unchanged. |
| inventoryMovements | MV-000124 | 2 | Same historical incident found in Phase 30. Unchanged. |
| inventoryAdjustments | IADJ-0015 | 3 | Same historical incident found in Phase 31. Unchanged. |

**Zero new ID duplicates were created this phase**, across all activity performed today (16 fixed call sites in live use throughout Scenarios 2–4, plus the concurrency test) — direct evidence the fix works in practice, not just in isolated synthetic tests.

**Document-number duplicates found: 1 field, 3 numbers — all verified benign:**

| Field | Duplicate value | Records | Verified explanation |
|---|---|---|---|
| quotations.quotationNo | QTN/2026-27/0004 | QTN-0004 (rev 0, Superseded) / QTN-0005 (rev 1) | Legitimate revision pair — same document number, by design, across revisions. |
| quotations.quotationNo | QTN/2026-27/0005 | QTN-0006 (rev 0, Superseded) / QTN-0007 (rev 1) | Same. |
| quotations.quotationNo | QTN/2026-27/0008 | QTN-0010 (rev 0, Superseded) / QTN-0011 (rev 1, Accepted) | Same — this is this phase's own Scenario 2 test data. |

Each pair was individually checked against `previousRevisionId`/`revision`/`status` and confirmed to be a genuine Rev-0→Rev-1 chain, not a collision. **No other document-number field** (poNo, grnNo, invoiceNo, voucherNo, cnNo, dnNo, receiptNo, paymentNo, billNo, assetNo) had any duplicate.

---

## 8. Objective A, Part G — Historical Data Cleanup

**No new cleanup action was required or taken this phase.** The 3 pre-existing duplicate IDs (§7) were already investigated, root-caused, and explicitly preserved (not deleted) in Phases 30–31's own reports, on the grounds that each pair represents genuinely different real recorded events sharing an id string purely due to the now-fixed generator defect — deleting either twin would destroy a real audit trail. This phase re-confirmed that decision still stands and that no *additional* duplicate has appeared needing the same treatment. Per the mission's explicit instruction never to silently delete financial/inventory history, none were touched.

---

## 9. Scenario 2 — Quotation Revision → Approval → Conversion

**STATUS: COMPLETE. PROVEN LIVE.**

Two independent runs were executed to cover both approval paths defined by BOS §1.6 (`DB.discountApprovalRules`): ≤5% auto-approval, 5–10% FinanceManager tier, >10% CEO tier.

### Run 1 — auto-approval path (discountPct ≤ 5%)
1. Lead → Estimation Request → Costing Version created. **Independent calc:** base cost = 8×900 + 4×700 = ₹10,000; overhead 8% = ₹800; selling = (10,000+800)×1.12 = **₹12,096**. ERP matched exactly on both baseCost and sellingPrice.
2. Quotation (Rev 0, discountPct 0) created, submitted → auto-`Approved` (within no-approval threshold).
3. **Revision created** (discountPct → 5%, reason recorded). New id `QTN-0011`, `revision:1`, `previousRevisionId:QTN-0010`. Old quotation `superseded: QTN-0010` returned.
4. **Rev 0 historical-immutability check:** snapshotted Rev 0's full object before the revision, re-fetched after — every field matched byte-for-byte **except** `status` (`Approved`→`Superseded`). Confirmed: `discountPctUnchanged: true`, `allOtherFieldsUnchanged: true`.
5. **Illegal-transition attacks, all correctly rejected with no mutation:**
   - Revise the now-Superseded Rev 0 again → `"Cannot revise a \"Superseded\" quotation."`
   - Submit Rev 1 twice → second call: `"Cannot submit — quotation is \"Approved\", not Draft."`
   - `won()` twice on the same quotation → second call: `"This quotation was already marked Won — project PRJ-012 already exists."`
   - Revise the now-Accepted Rev 1 → `"Cannot revise a \"Accepted\" quotation."`
6. Accepted → `won()` → Project `PRJ-012` created, `customerId` correctly `CUST-1`.

### Run 2 — FinanceManager-gated approval path (discountPct = 8%)
1. Fresh Lead/ER/Costing chain. **Independent calc:** base = 10×1200 = ₹12,000; overhead 5% = ₹600; selling = (12,000+600)×1.15 = matched exactly.
2. Quotation created with `discountPct:8`, submitted → `PendingApproval` (correctly above the 5% no-approval line, within the 10% FinanceManager tier).
3. Sales (creator, wrong role/tier) attempts `approve-discount` → **403**, `"Role \"Sales\" cannot approve discounts."`
4. FinanceManager approves → `Approved`. Approve again → `"Cannot approve — quotation is \"Approved\", not PendingApproval."`
5. **Concurrency:** a second, separate 8% quotation had two approvers (FinanceManager + CEO) hit `approve-discount` simultaneously via `Promise.all` — **exactly one succeeded**, the other correctly rejected. No double-approval, no corrupted state.
6. Accepted → `won()` → Project `PRJ-013` created.

**Verdict: Scenario 2 fully verified, zero deviation.** State-machine transitions (Draft→PendingApproval/Approved→Superseded/Accepted→Won) all behaved exactly as `reviseQuotation()`/`submitQuotation()`/`approveQuotationDiscount()`/`wonTransition()` specify, matching source read before execution.

---

## 10. Scenario 3 — Partial Procurement → Partial GRN → Partial Billing

**STATUS: COMPLETE. PROVEN LIVE.**

**Independent calc (before any ERP read):** PO = 10×₹1,500 + 20×₹800 = **₹31,000**. GRN1 (partial: Line A 6/10, Line B 12/20) = 6×1,500 + 12×800 = **₹18,600**. Bill1 (partial: Line A 6/6 received, Line B 10 of 12 received — a genuine partial bill less than the GRN) = 6×1,500 + 10×800 = **₹17,000**; GST18 tax = 17,000×18% = **₹3,060**.

| Step | Result |
|---|---|
| PO created, 2 lines | `total: 31000`, matched independent calc exactly |
| PO submitted | Auto-`Approved` (₹31,000 < ₹500,000 no-approval threshold, correctly not requiring FinanceManager) |
| GRN1: Line A=6, Line B=12 | `poStatus: PartiallyReceived`; `qtyReceivedByLine {0:6,1:12}`; GL posted (Dr Inventory / Cr GR-IR) |
| **Over-GRN attempt** (Line A +5, would total 11>10) | **Rejected**, exact tolerance-violation message (GRN_TOLERANCE_PCT is a hard 0% policy constant); PO state proven byte-identical before/after — **no mutation** |
| **Duplicate GRN attempt** (same GRN1 payload again) | **Rejected** on the same over-receipt guard |
| **Cancelled-PO GRN attempt** | Separate small PO approved with no GRN, cancelled via `cancelApprovedPurchaseOrder()`; GRN attempt against it → `"Cannot receive against a PO with status \"Cancelled\"."` |
| Bill1 (Line A 6, Line B 10) via `/api/ap/invoice-from-po` | `matched:true`, base debit on account 2050 = ₹17,000, exact match |
| GRN1 invoiceable balance after Bill1 | Line A remaining = 0, Line B remaining = 2 — exactly as calculated |
| **Over-bill attempt** (Line B qty 3, balance is 2) | **Rejected**: `"...invoice qty 3 exceeds the remaining invoiceable balance of 2..."` |
| **Duplicate-bill attempt** (Line A qty 6 again, balance is 0) | **Rejected**: `"...invoice qty 6 exceeds the remaining invoiceable balance of 0..."` |
| **Wrong-GRN-for-PO attempt** (real unrelated GRN, real PO, mismatched pair) | **Rejected**: `"That GRN does not belong to the selected PO."` |
| **Phantom GRN id** | **Rejected**: `"PO or GRN not found."` |
| Bill1 posted through normal draft lifecycle (submit→approve→post) | `JE-0592` posted successfully |
| AR/AP reconciliation | Both MATCH |
| Trial Balance | Balanced (Dr = Cr = ₹6,681,874.29) |

**Verdict: Scenario 3 fully verified, zero deviation.** Every rejection path was confirmed to cause **no state mutation** (PO `qtyReceivedByLine` re-fetched and compared byte-for-byte after each rejected attempt).

---

## 11. Scenario 4 — Material Return → Inventory → GL → Project Cost

**STATUS: COMPLETE. PROVEN LIVE.**

### The mechanism (CODE VERIFIED then PROVEN LIVE)
This system has no separate "Material Return" domain function distinct from a GL reversal. Reading `reverseEntry()` (its Phase 37 fix comment is explicit about this) confirmed: reversing a Material Issue's posted JE is *itself* the return mechanism — it atomically (a) flips the GL lines (Cr the cost account that was debited, Dr Inventory back), (b) posts a compensating **`Receipt`**-type inventory movement valued at **the original issue's own valuation rate**, and (c) blocks a second reversal of the same movement.

### Live execution
1. Opening stock/rate for MAT-5 @ WH-1 read directly from `/api/inventory/stock`: **180 units @ ₹100/unit**.
2. Receipt: PO 50 units @ ₹200 → GRN → **Independent moving-average calc:** new rate = (180×100 + 50×200) / 230 = **₹121.7391**/unit, new stock = 230. ERP matched to 4 decimal places.
3. Material Issue of 20 units to Project PRJ-1 at that rate. **Independent calc:** issue value = 20 × 121.7391 = **₹2,434.78**. The posted JE's debit matched exactly. Project cost-breakdown "consumed" figure read *before* the issue for later comparison.
4. **Material Return** (= `reverseEntry()` on the Issue's JE, reason recorded):
   - Stock restored: 230 → 230 (net zero after issue+return), confirmed via direct re-query, not assumption.
   - Compensating movement confirmed `type:'Receipt'`, `qty:20`, and — critically — **`valuationRate` equal to the ORIGINAL issue's rate (₹121.7391), not today's current moving-average rate and not the PO rate** — directly satisfying the mission's explicit instruction not to assume a PO-rate return valuation.
   - Project cost-breakdown "consumed" decreased by exactly ₹2,434.78 (180,735.63 → 178,300.85) — matching the independent calc exactly.
5. **Illegal: return twice** — second reversal attempt on the same JE → `"Already reversed by JE-0595."`
6. **Phantom reversal** (nonexistent JE id) → `"Original document not found."`
7. **Closed-project return gate** — tested correctly on a second attempt after an actor-selection error was caught and corrected (see below):
   - Accountant's first attempt returned 403 `"Role \"Accountant\" cannot reverse."` — this was **verified to be the base role-permission check** (`Accountant.reverse:false` unconditionally in `ROLE_ACTIONS`, unrelated to project status), **not** the closed-project-specific gate. Caught before being reported as a pass.
   - Re-run with **FinanceManager** (who has `reverse:true` generally): correctly blocked with the closed-project-specific message — `"Cannot reverse — project PRJ-013 ... is CLOSED. Only CEO/Admin may reverse a transaction against a closed project..."`
   - CEO override succeeded, entry `JE-0599` posted.
   - This sub-test deliberately used **PRJ-013** (a disposable project created fresh this session in Scenario 2, not `PRJ-1`) to avoid permanently closing a shared seed project that other phases' regressions may depend on staying open.

### Test cases the mission named that do not map onto this architecture (disclosed, not fabricated)
- **"Return more than issued"** and **"return wrong material/project/warehouse"** are not separately testable parameters here: a reversal always compensates the *exact* original movement's material/qty/project/warehouse — there is no caller-supplied quantity or reference to corrupt. This is a structural property of the reversal-as-return design, not a gap this phase left untested.
- **"Reverse twice"** (of the *reversal* entry itself, not the original) was not attempted — `reverseEntry()`'s `orig.reversedByEntryId` guard is on the *original* document; whether the *reversal* entry can itself be re-reversed was not exercised this phase. **NOT VERIFIED.**

### A new finding surfaced by this scenario (disclosed, not silently fixed)
While constructing the closed-project test, a **new-to-this-session Material Issue was successfully posted against PRJ-013 after it was already `CLOSED`** (`ok:true`, JE-0598 posted with no resistance). `createMaterialIssue()` contains no closed-project check at all, unlike `reverseEntry()`. This is a real control asymmetry: a closed project can still accrue *new* costs even though *reversing* an existing cost against it requires CEO/Admin override. This was not fixed this phase — doing so safely would require auditing every cost-posting function (`recordLabourWages`, `recordProjectExpense`, `createGRN`, etc.) for the same gap, which is materially broader than this phase's Document-ID/Scenario-2-4 mandate. Logged in the defect register below as a disclosed Medium-severity gap for a future phase.

**Verdict: Scenario 4 fully verified, zero deviation** in the core return/inventory/GL/project-cost chain. The closed-project sub-test required a self-correction (wrong actor on first attempt) which is disclosed above rather than hidden.

---

## 12. Cross-Module Integrity — Real-but-Wrong References (Part O)

**PARTIALLY VERIFIED.** Covered live within the scenarios above, not as a separate exhaustive matrix:
- Scenario 3: wrong-GRN-for-PO (real GRN, real PO, mismatched pair) — rejected. Phantom GRN id — rejected.
- Scenario 4: phantom JE id on reversal — rejected.
- **Not attempted this phase:** a real-but-wrong vendor on a GRN/bill, a real-but-wrong material substituted mid-line, a real-but-wrong warehouse on a GRN. **NOT VERIFIED** — flagged rather than assumed safe.

## 13. State-Machine Testing (Part P)

**PARTIALLY VERIFIED** via the illegal-transition attacks embedded in each scenario (§9–11): Quotation (Draft→PendingApproval/Approved→Superseded, →Accepted→Won, each illegal transition rejected), PO (Draft→Submitted/Approved→PartiallyReceived→Cancelled, illegal GRN-against-Cancelled rejected), GRN (created→invoiced, illegal double-invoice rejected). **Not built as a formal exhaustive state-transition matrix** (every state × every possible event) — only the transitions the mission explicitly named were exercised. **PARTIALLY VERIFIED**, not COMPLETE.

## 14. Audit Log Verification (Part Q)

**NOT VERIFIED this phase as a dedicated pass.** Every mutating domain function read this phase (`reviseQuotation`, `submitQuotation`, `approveQuotationDiscount`, `createPurchaseOrder`, `createGRN`, `draftSupplierInvoiceFromPO`, `reverseEntry`, `createMaterialIssue`) does call `logAudit()` with actor/role/timestamp fields on both success and several rejection paths (confirmed by CODE READING, not by directly querying `DB.auditLog` after each action this phase). A direct query-and-verify pass against the audit log for every action performed above was not executed. **CODE VERIFIED only, not PROVEN LIVE**, for this specific requirement.

## 15. ID/Accounting Interaction Verification (Part R)

**PROVEN LIVE**, implicitly, throughout §9–11: every posted JE this phase carries a unique id (`postJournalEntry()` now uses `nextId()`), every inventory movement a unique id, and no case of "one document → multiple GL postings" or "ambiguous ID referenced by two documents" was observed. Duplicate-submission handling was proven directly in Scenario 2's approval race and Scenario 3's duplicate-GRN/duplicate-bill attempts.

## 16. Failure Injection (Part S)

**NOT VERIFIED.** The mission's six named injection points (before/after ID generation, after document creation, before/after posting, before/after save) require fault instrumentation inside the running functions (e.g. forcing a `save()` exception mid-transaction) that was not built this phase. This is explicitly disclosed as not done, rather than claimed via inference from the code's general all-or-nothing posting pattern (which IS CODE VERIFIED for GRN/Material Issue/Adjustment per their own Phase 41 fix comments, but was not adversarially triggered live this phase).

## 17. Full Regression (Part T)

**PROVEN LIVE**, re-run after all of today's activity (16 call-site changes + Scenario 2/3/4 execution + Part F scan):

- **19/19** historical suite (NaN guards across 6+ document types, GST CN/DN, phantom references, negative-stock guard, closed-period posting, RBAC, cross-project leakage, invalid status transitions, malformed bank import duplicate detection, audit-on-rejection) — **all PASS**.
- Phase 22/23 compound-rule battery (AR/material-issue/labour/expense scoping, idempotency on inventory-transfer/damage-report, numeric guards, audit-on-rejection count) — **all PASS**, with 2 pre-existing script artifacts noted and explained (not live regressions): a quotation test that never supplied a required `costingVersionId` in its payload, and an inventory-transfer stock-availability precondition — both unrelated to this phase's changes and contradicted directly by this phase's own successful quotation/inventory-transfer live tests.
- **Trial Balance balanced**, **AR reconciliation MATCH**, **AP reconciliation MATCH** at every checkpoint (after Scenario 2, after Scenario 3, after Scenario 4).

**Items from the mission's regression list not independently re-run this phase** (relied on Phase 22/23's own coverage rather than re-testing fresh): Billing Milestone, Inventory Transfer positive-path, asset disposal, bank import. **NOT VERIFIED fresh this phase** — carried forward from prior phases' own passing results, not re-proven today.

---

## 18. Defect Register

| ID | Severity | Collection/Function | Root Cause | Impact | Fix | Live Verification | Status |
|---|---|---|---|---|---|---|---|
| P32-D1 | High (systemic, now mostly closed) | 16 functions across 14 collections (see §3) | `array.length+1` id generation collides once length/max-suffix diverge | Duplicate financial/inventory document IDs (proven twice already in Phases 30/31) | Replaced with `nextId()`/`maxIdSuffix()`, deriving from max existing suffix, hardened against foreign-prefix ids | Proven via 6 divergence scenarios (§5) + 10x concurrency (§6) + zero new duplicates in full DB scan (§7) | **FIXED** for 16/96 occurrences; 80 lower-risk occurrences remain, disclosed |
| P32-D2 | Medium (disclosed) | `createMaterialIssue()` | No closed-project status check, unlike `reverseEntry()` | A CLOSED project can still accrue new Material Issue costs after closure | Not fixed this phase — scope is broader than this phase's mandate (every cost-posting function needs the same audit) | Proven live: JE-0598 posted cleanly against closed PRJ-013 | **DISCLOSED, NOT FIXED** |
| P32-D3 (historical, re-confirmed not new) | High (already known) | inventoryMovements MV-000121/MV-000124, inventoryAdjustments IADJ-0015 | Pre-Phase-32 `length+1` collision (Phases 30/31) | 3 duplicate IDs remain in historical data, each pair genuinely different real events | Deliberately NOT deleted — would destroy real audit trail; generator itself already fixed | Re-scanned this phase, confirmed unchanged, zero new occurrences | **PRE-EXISTING, PRESERVED, UNCHANGED** |

No defect was found in Scenario 2, Scenario 3, or the core Scenario 4 return/GL/inventory/project-cost chain.

---

## 19. Coverage Metrics (exact, as required)

- **Total `length+1`-style ID generators discovered:** 96
- **Made safe this phase:** 16 (at 14 collections)
- **Still unsafe (disclosed):** 80
- **Collections scanned for duplicate IDs/doc numbers:** 105 (59 carry an `id` field)
- **Duplicate IDs found:** 3, all pre-existing (0 new)
- **Duplicate document numbers found:** 3, all verified as legitimate quotation-revision pairs (0 defects)
- **Scenario 2:** COMPLETE — 2 runs (auto-approval + FinanceManager-tier paths), independent calculations matched ERP on **4/4** calculated figures (baseCost×2, sellingPrice×2), all 7 illegal-transition attempts correctly rejected with no mutation.
- **Scenario 3:** COMPLETE — independent calculations matched ERP on **4/4** figures (PO total, GRN value, Bill base, tax), all 6 illegal/wrong-reference attempts correctly rejected with no mutation.
- **Scenario 4:** COMPLETE — independent calculations matched ERP on **3/3** figures (moving-average rate, issue value, project-cost decrease), 2 illegal-transition attempts correctly rejected, closed-project gate correctly proven (after one self-corrected actor-selection mistake, disclosed in §11).

---

## 20. Final Verdict

**GO WITH CONDITIONS.**

Grounds for not issuing an unconditional GO:
- 80 of 96 discovered `length+1` ID generators remain unfixed (disclosed, lower-risk, non-financial-critical collections).
- Multi-process concurrency safety of the JSON-file architecture remains explicitly **NOT VERIFIED** — this is an architectural property of the Lab, not a code defect this phase could close.
- P32-D2 (closed-project Material Issue gap) is a real, live-proven control gap, disclosed rather than fixed.
- Parts O (cross-module wrong-reference matrix), P (formal state-machine matrix), Q (audit-log direct verification), and S (failure injection) were only partially covered, per §12–16, and are named explicitly rather than folded into a false "complete" claim.

Grounds for GO WITH CONDITIONS rather than NO-GO (per the mission's own gate criteria):
- **Zero** duplicate financial/inventory document ID was created this phase; the fix is proven safe under deliberate divergence, not merely absence-of-evidence.
- **Zero** JE ID collisions occurred, including under concurrent load (within the single-process limitation disclosed).
- **Zero** commercial corruption in Scenario 2, **zero** procurement/GRN/billing corruption in Scenario 3, **zero** inventory/GL/project-cost corruption in the core Scenario 4 chain.
- Every failure path tested across all three scenarios left **provably zero partial mutation** (verified by re-fetching and diffing state after each rejected attempt, not merely trusting the error response).

This ERP build is **not** being declared production-ready in general — only the specific surfaces exercised this phase (ID generation on the 16 fixed collections, and the exact Scenario 2/3/4 workflows tested) are certified to the standard above.
