# PHASE 36 — SYSTEM-WIDE TRANSACTION ATOMICITY FORENSIC AUDIT

**Scope:** SAP_Architecture_Lab only (isolated experimental build, NOT the live/offline production ERP).
**Date:** 2026-09-05

---

## 1. Executive Summary

Phase 35 fixed the atomicity defect class in exactly 2 functions (`createGRN()`, `createMaterialIssue()`) and explicitly disclosed ~21 other multi-step transaction families as untested. This phase attacked that class systematically: **13 functions were deliberately fault-injected, and all 13 were found to carry the identical defect** — a real, unprotected exception window between a committed GL entry and the function's remaining required mutations (a document push, a clearing, an asset-status field, a second inventory movement).

Every one of the 13 was fixed with the same compensating-rollback pattern Phase 35 established, and every fix was re-attacked against its own exact original exploit. **Three of the fixes, on their first draft, repeated the identical snapshot-timing mistake Phase 35 caught in its own first draft** (capturing the "rollback-to" journal-entry-array length *after* the GL had already committed, instead of before) — caught this time by the same discipline: re-running the fault-injection test immediately after writing the fix, rather than assuming it worked. All three were corrected and re-verified.

The most consequential live proof this phase produced: with rollback deliberately disabled, forcing a failure between `postCustomerReceipt()`'s GL commit and its clearing-record creation did not just leave an orphaned GL entry — it **broke AR reconciliation by an exact, quantified amount** (`/api/reconciliation`'s own `ar.matches` flipped from `true` to `false`, off by precisely the orphaned receipt amount). This is the clearest evidence in this entire audit series that the defect class is not merely a bookkeeping nicety — it corrupts a control the ERP itself uses to detect real accounting errors.

After all 13 fixes, the identical fault-injection battery was re-run and every single case showed exactly zero net business-data mutation. Full regression (19/19, compound battery, fresh Scenario 3 and Scenario 9 runs) remained clean, Trial Balance and AR/AP reconciliation remained correct, and 20x concurrency was proven clean for the newly-touched inventory functions.

**Atomicity is now PROVEN for 15 of an estimated 23+ high-risk multi-step transaction families** (2 from Phase 35 + 13 from this phase). It is explicitly **NOT** proven for the remainder — this report does not claim system-wide transactional safety.

---

## 2. Exact Scope

**Fault-injection tested and fixed this phase (13 functions, PROVEN LIVE before-and-after):**
`postCustomerReceipt`, `postSupplierPayment`, `createSupplierCreditNote`, `createSupplierDebitNote`, `createCustomerCreditNote`, `createCustomerDebitNote`, `createPurchaseReturn`, `createInventoryTransfer`, `createInventoryAdjustment`, `capitalizeFixedAsset`, `disposeFixedAsset`, `recordLabourWages`, `recordProjectExpense`.

**Already fixed and re-verified from Phase 35:** `createGRN`, `createMaterialIssue`.

**Explicitly NOT fault-injection tested this phase** (disclosed, not silently assumed safe): `postAssetDepreciation` (CODE VERIFIED as structurally low-risk — see §11), `transferFixedAsset` (no GL/inventory of its own), `postProductionLabourCost`, `postInstallationLabourCost`, `issueToSite`, `dispatchToJobWorker`, `returnFromJobWorker`, `recordJobWorkScrap`, `directDispatchFromJobWorker`, `postBankImportLine`, `createPaymentRequest`, `recordPettyCashVoucher`, `postDraft` itself as a standalone choke point (its callers' surrounding mutations were tested via the CN/DN/receipt/payment functions above, but `postDraft()`'s own internal sequence for Manual JE/Advance/Milestone/Service/AMC specifically was not separately fault-injected).

---

## 3. Mutation Ordering Map (representative)

Every one of the 13 functions fixed this phase shares one of two shapes:

**Shape A — GL, then document, then clearing** (`postCustomerReceipt`, `postSupplierPayment`, all 4 CN/DN functions, `createPurchaseReturn`):
1. Validate (no writes)
2. `postJournalEntry()` — commits GL immediately (push + save internally)
3. Push the source document record, `save()`
4. `applyClearing()` (where applicable) — push + save internally
5. `logAudit()`

**Shape B — GL, then in-place field mutation** (`capitalizeFixedAsset`, `disposeFixedAsset`):
1. Validate
2. `postJournalEntry()` — commits GL
3. Mutate the existing asset object's fields directly (`status`, dates, entry-id references), `save()`
4. `logAudit()`

**Shape C — no GL, two sequential inventory movements** (`createInventoryTransfer`):
1. Push the transfer document, `save()`
2. `postInventoryMovement('TransferOut')`
3. `postInventoryMovement('TransferIn')`

In every shape, the exception boundary that matters is the same: **after the first irreversible write, before the last one.**

---

## 4. Atomicity Test Matrix / Failure Injection Results

PROVEN LIVE — before/after DB state inspected directly (not inferred from HTTP status), consistent with the mission's rule 5/6.

| Function | Injection point | Result BEFORE fix | Result AFTER fix |
|---|---|---|---|
| `postCustomerReceipt` | after GL, before clearing | **Clearing orphan**: `jes:+1, clearings:0` — AND `/api/reconciliation`'s `ar.matches` flipped to `false`, off by exactly the orphaned amount | `jes:0, clearings:0`; AR reconciliation unaffected |
| `postSupplierPayment` | after GL, before clearing | Same class (AP-side) | `jes:0, clearings:0, tdsDeductions:0` |
| `createSupplierCreditNote` | after GL, before document / after document, before clearing | Document or clearing orphan under GL | `ALL ZERO` at both points |
| `createSupplierDebitNote` | after GL, before document | Document orphan under GL | `ALL ZERO` |
| `createCustomerCreditNote` | after GL, before document | Document orphan under GL | `ALL ZERO` |
| `createCustomerDebitNote` | after GL, before document | Document orphan under GL (no clearing step exists for this document type by design) | `ALL ZERO` |
| `createPurchaseReturn` | after GL, before document | Document orphan under GL, with the earlier stock-restoring inventory movement never posted | `ALL ZERO` |
| `createInventoryTransfer` | after TransferOut, before TransferIn | **Real stock loss**: material vanishes from the source warehouse with nothing appearing at the destination | `ALL ZERO` |
| `createInventoryAdjustment` | after GL, before document | Document/inventory orphan under GL — this function's own comment explicitly (and incorrectly) claimed "nothing to compensate" (see §16) | `ALL ZERO` |
| `capitalizeFixedAsset` | after GL, before status mutation | **Double-capitalization risk**: GL shows the asset capitalized, `asset.status` stays `'Purchased'`, so a retry is silently permitted and would post the SAME asset's cost into Fixed Assets a second time | `ALL ZERO` |
| `disposeFixedAsset` | after GL, before status mutation | **Double-disposal risk**: identical shape, would double-remove cost/depreciation and double-book gain/loss on retry | `ALL ZERO` |
| `recordLabourWages` | after GL, before document | Document orphan under GL | `ALL ZERO` (after correcting the first-draft snapshot-timing bug — see §5) |
| `recordProjectExpense` | after GL, before document | Document orphan under GL | `ALL ZERO` (same correction) |

---

## 5. A Mistake Caught During This Phase's Own Verification

Three of the 13 fixes — `recordLabourWages`, `recordProjectExpense`, `createInventoryAdjustment` — on their first draft, captured the "roll back the journal-entries array to this length" snapshot **after** `postJournalEntry()` had already run, not before. This is the exact same class of self-caught error Phase 35 disclosed in its own first draft of the `createGRN`/`createMaterialIssue` fix. It was caught the same way: by immediately re-running the fault-injection battery after writing the fix rather than assuming success, which showed `jes:+1` persisting in exactly these 3 cases while the other 11 showed `ALL ZERO`. All three were corrected (moving the snapshot to before the GL attempt) and re-verified — the full battery re-run afterward showed `ALL ZERO` across all 14 tested points. This is disclosed explicitly per the mission's own instruction not to hide a self-corrected error, and as evidence that "a fix was written" is not sufficient proof — only a re-run of the exact exploit is.

---

## 6. Retry / Double-Post Results (Part E/F)

**PROVEN LIVE** for `postCustomerReceipt` (the function given the deepest before/after treatment): with rollback deliberately disabled, the forced failure left the invoice's own open-item record fully unaware of the GL-side reduction (`open: 5900` even though a ₹2,000 receipt had already hit the GL), and a legitimate retry succeeded — meaning a real double-collection risk existed (the SAME ₹2,000 receipt could be re-entered by an operator who saw the first attempt fail, while the orphaned GL entry from the first attempt silently remained). With rollback enabled, the identical retry sequence produces exactly one clean receipt with no residue from the interrupted attempt.

**PARTIALLY VERIFIED** for the other 12 functions — each was confirmed to roll back to `ALL ZERO`, and a subsequent successful call was confirmed to succeed cleanly, but the specific "two consecutive forced failures, then one success" sequence (mission Part B/E's fuller battery) was not separately run for all 13; it was run in full only for `postCustomerReceipt`.

---

## 7. `postDraft()` Results (Part G)

**PARTIALLY VERIFIED.** `postDraft()` itself was not independently fault-injected as a standalone choke point this phase. However, every draft-based document type this phase's fixes touch (Customer Invoice via receipts/CN/DN, Supplier Bill via payments/CN/DN) was exercised through the full submit→approve→post lifecycle during testing, and no anomaly was observed in `postDraft()`'s own behavior. Customer Advance, Billing Milestone Invoice, Service Invoice, and AMC Billing were **NOT** separately fault-injected this phase — carried forward as **NOT VERIFIED**.

## 8. Receipt/Payment Results (Part H)

Covered in full in §4/§6 above. **PROVEN LIVE**, including the quantified AR-reconciliation-break evidence, the single most concrete proof of real financial-integrity impact produced by this audit series to date.

## 9. CN/DN Results (Part I)

Covered in §4. All four CN/DN functions (Customer CN, Customer DN, Supplier CN, Supplier DN) proven fault-injected and fixed. Tax-split correctness (Phase 34's `splitOriginalTax()` fix) was reconfirmed unaffected by these atomicity changes — Scenario 9's fresh regression run showed the Supplier DN's Material Cost and Input Tax lines still matching the independent calculation exactly (§16).

## 10. Inventory Results (Part J)

`createMaterialIssue`, `createGRN` (Phase 35), `createPurchaseReturn`, `createInventoryTransfer`, `createInventoryAdjustment` — all 5 proven fault-injected and fixed this phase or Phase 35. `issueToSite`, `dispatchToJobWorker`, `returnFromJobWorker`, `recordJobWorkScrap`, `directDispatchFromJobWorker` — **NOT VERIFIED** this phase (each carries an analogous multi-movement or GL+movement sequence per the Phase 34 census and should be presumed to carry the same defect class until tested).

## 11. Fixed Asset Results (Part K)

`capitalizeFixedAsset`, `disposeFixedAsset` — proven fault-injected and fixed (§4). `postAssetDepreciation` — **CODE VERIFIED, not fault-injection tested**: read in full and confirmed it performs GL posting only, with no separate asset-field mutation afterward (accumulated depreciation is always derived fresh from `DB.journalEntries` via `assetAccumulatedDepreciation()`, never stored on the asset object) — so the severe "double-post on retry" class does not apply to it structurally, though the milder "audit orphan if `logAudit()` throws after a successful GL" residual risk was not separately tested. `transferFixedAsset` — has no GL/inventory mutation of its own (pure field reassignment plus history-array push), so the severe class does not apply; not separately tested for the milder audit-orphan risk.

## 12. Audit Failure Results (Part L)

**NOT VERIFIED** this phase as a dedicated test (business-success-with-audit-failure was not deliberately isolated from the broader rollback tests). Every rollback fix implemented this phase adds its own `...RolledBackOnFailure` audit entry — CODE VERIFIED to fire correctly (confirmed indirectly via the `audit:+1` deltas observed in Phase 35's equivalent tests; not independently re-measured for all 13 functions this phase). Whether `logAudit()` itself can throw and cause a successfully-committed financial transaction to return a 500 (the mission's specific "HIGH-RISK scenario") was not tested this phase.

## 13. Save/Durability Results (Part M)

**NOT VERIFIED** this phase. Phase 35's disclosed finding (a process crash — not a caught exception — between an in-memory mutation and the next `save()` call anywhere in the app could lose that mutation with no error) was not re-tested via an actual induced server restart this phase. Carried forward as an open, undemonstrated risk.

## 14. ID/Atomicity Interaction (Part N)

**PROVEN LIVE**, observed as a byproduct of every fault-injection test in §4: in every case, the computed-but-unused id/document-number from a rolled-back attempt was simply available again on the next successful attempt (no id was skipped, duplicated, or caused a collision) — because `nextId()`/`maxIdSuffix()` derive purely from what is ACTUALLY present in the array, and the rollback correctly removes the failed attempt's record before that array is ever inspected again. 20x concurrency (§19) confirmed no id collisions for inventory adjustments and transfers specifically.

## 15. Write-Point Census (Part O)

**PARTIALLY VERIFIED.** Not rebuilt as an exhaustive table this phase — every function fixed in §4 was individually read in full, and each read confirmed no bypass of `postJournalEntry()`/`postInventoryMovement()` where a GL/inventory effect was genuinely intended. A complete census of every remaining `.push()` across all business collections (per the mission's explicit list — customers, vendors, materials, projects, etc.) was covered by Phase 35's ID census (which read every one of the 72+ remaining generator call sites in context) but not re-verified fresh this phase specifically for atomicity purposes.

## 16. Architecture Analysis (Part P)

The architecture is **B — a shared rollback helper**, applied per-function (an opt-in pattern each function must explicitly adopt), not **C/D/E/F/G** (no transaction wrapper, no transaction manager, no real database transaction, no write-ahead log, no general compensating-transaction framework exists). Two functions had this pattern before this phase (Phase 35); 13 more were added this phase; the rest of the codebase's multi-step functions do not have it until individually fixed.

**Atomic functions / total high-risk multi-step functions:** 15 / ~23 (estimated from Phase 34's original census) = **~65%**.
**Financial atomicity coverage** (receipt, payment, 4× CN/DN, labour, expense, GL-bearing asset actions): 11 of ~13 identified financial multi-step functions = **~85%**.
**Inventory atomicity coverage** (GRN, Material Issue, Purchase Return, Transfer, Adjustment): 5 of ~10 identified inventory multi-step functions (the job-work/site-material family remains untested) = **~50%**.
**Project atomicity coverage** (Labour, Expense; Production/Installation labour cost not tested): 2 of ~4 = **~50%**.
**Asset atomicity coverage** (Capitalize, Dispose; Depreciate structurally safe by design, Transfer has no GL/inventory): effectively **4 of 4 in the sense that matters** (severe double-post class), though only 2 were live fault-injected.

A shared helper's existence in 2 functions was explicitly NOT treated as proof of system-wide safety at the start of this phase — that was the entire premise of this phase's mandate — and the same caution applies now: 15/23 is real, measured progress, not completion.

## 17. Database Forensic Sweep (Part R)

**PROVEN LIVE.** Full 105-collection scan after all fault injection and fixes: **zero new duplicate IDs** (the same 3 pre-existing MV-/IADJ- historical duplicates, unchanged from every prior phase's baseline). The same 5 benign quotation-revision-number pairs as Phase 35's baseline, zero new ones.

## 18. Independent Accounting Reconciliation (Part S)

**PARTIALLY VERIFIED.** `/api/trial-balance` and `/api/reconciliation` were checked after every fix and after full regression — Trial Balance balanced (Dr = Cr = ₹8,176,637.32), AR and AP both matched. These are the ERP's OWN reconciliation reports, not an independently-built from-scratch raw-journal-line calculation — the mission's explicit instruction to avoid using the ERP's own reconciliation as the sole control was only fully honored for the `postCustomerReceipt` before-state proof (§4/§6), where the raw open-item record was inspected directly alongside the reconciliation report, not merely the report alone.

## 19. Concurrency (Part U)

**PROVEN LIVE, SINGLE-PROCESS ONLY**, for Inventory Adjustment and Inventory Transfer creation: 20 simultaneous requests each produced 20 unique, fully-defined IDs, zero collisions, all successful. **NOT VERIFIED** this phase for GRN, Material Issue, Customer Invoice Draft, Supplier Bill Draft, Customer Receipt, Supplier Payment, or Clearing creation specifically (Phase 32/34/35 covered draft/PO/invoice-draft creation at 10-20x previously). **MULTI-PROCESS/MULTI-INSTANCE CONCURRENCY REMAINS EXPLICITLY NOT VERIFIED** — this is a single Node process, single event loop test in every phase of this audit series; the JSON-file architecture provides no cross-process write serialization, and nothing this phase changes that fact.

## 20. Regression (Part T)

**PROVEN LIVE.** 19/19 historical suite — all PASS, post-fix. Phase 22/23 compound-rule battery — all PASS. Scenario 3 (Partial Procurement, GRN-heavy) — fresh run, PO/GRN/Trial Balance all correct. Scenario 9 (Supplier Bill→Payment→DN→Reversal) — fresh run: bill/tax split/partial-DN/reversal-after-other-clearings all matched their independent calculations exactly, confirming the atomicity fixes did not disturb the Phase 34 tax-split fix or the Phase 34 reversal-of-reversal block. Scenarios 1, 2, 4-8, 10 — **NOT** individually re-run this phase, relying on their own prior passing results.

---

## 21. Defect Register

| ID | Severity | Functions | Root Cause | Impact | Fix | Live Verification | Status |
|---|---|---|---|---|---|---|---|
| P36-D1 | **CRITICAL** (defect class) | `postCustomerReceipt`, `postSupplierPayment`, `createSupplierCreditNote`, `createSupplierDebitNote`, `createCustomerCreditNote`, `createCustomerDebitNote`, `createPurchaseReturn`, `createInventoryTransfer`, `createInventoryAdjustment`, `capitalizeFixedAsset`, `disposeFixedAsset`, `recordLabourWages`, `recordProjectExpense` (13 functions) | No rollback for the multi-step mutation sequence following a committed GL entry (or, for Inventory Transfer, following the first of two required inventory movements) | GL/document/clearing/inventory orphans; **quantified, live-proven AR reconciliation break**; double-capitalization/double-disposal risk on retry for fixed assets; real physical stock loss risk for Inventory Transfer | Same compensating-rollback pattern as Phase 35: snapshot every mutable length/field before the first write, wrap the remaining sequence in try/catch, restore everything (including the already-committed GL entry) on exception, re-throw | Re-attacked the exact original exploit at 14 injection points across all 13 functions: every case now shows exactly zero net mutation | **FIXED, RE-TESTED** |
| P36-D1b (self-caught) | — | `recordLabourWages`, `recordProjectExpense`, `createInventoryAdjustment` | First-draft fix captured the rollback snapshot AFTER the GL commit (repeating Phase 35's own disclosed first-draft mistake) | Would have shipped as a materially incomplete fix — the GL entry itself would have survived a "rolled back" attempt | Moved the snapshot to before the GL attempt in all 3 | Re-ran the fault-injection battery a second time: all 14 points now show `ALL ZERO` | **FOUND DURING OWN VERIFICATION, FIXED, RE-TESTED** |
| P36-D2 (disclosed, not a live defect) | Informational | `createInventoryAdjustment`'s own prior comment | The function's existing Phase-41-era comment claimed reordering alone made rollback unnecessary ("nothing to compensate, because nothing is written until the fallible step has already succeeded") — true only against `postJournalEntry()`'s own controlled rejection, not against an unexpected synchronous exception afterward | The comment's reasoning was incomplete, and could mislead a future developer into believing this function (and by extension, any function following the same "reorder so the risky call goes first" pattern) was already safe | Corrected via the fix itself (P36-D1) plus an explanatory comment | Proven via the same fault-injection test as P36-D1 | **DOCUMENTED, FIX APPLIED** |

No new defect was found in the Phase 34 tax-split logic, the Phase 34 reversal-of-reversal block, or the ID-generation mechanism — all reconfirmed correct via regression (§20).

---

## 22. Coverage Matrix

| Objective | Status |
|---|---|
| A — Complete multi-step transaction census | **PARTIAL** — 15 of ~23 functions individually examined and fault-tested across Phases 35-36; the remainder identified by name but not examined line-by-line this phase |
| B — Transaction boundaries | **DONE** for the 15 tested functions |
| C — Atomicity test battery | **DONE** for 13 functions this phase (+2 from Phase 35) |
| D — Failure matrix | **DONE** — §4 |
| E — Retry after failure | **DONE** in depth for 1 function, **PARTIAL** for the other 12 |
| F — Double-post attack | **DONE** in depth for 1 function (quantified reconciliation break), **PARTIAL** for the rest |
| G — postDraft atomicity | **PARTIAL** |
| H — Receipt/Payment atomicity | **DONE** |
| I — CN/DN atomicity | **DONE** |
| J — Inventory atomicity | **PARTIAL** (5 of ~10 functions) |
| K — Fixed-asset atomicity | **DONE** for the severe class; depreciation/transfer CODE VERIFIED structurally exempt |
| L — Audit atomicity | **NOT VERIFIED** |
| M — Save/durability boundary | **NOT VERIFIED** |
| N — ID/atomicity interaction | **PROVEN LIVE** (as a byproduct of §4) |
| O — Write-point census | **PARTIAL** |
| P — Architecture review | **DONE** — §16 |
| Q — Defect-class search | **DONE** — this phase's entire methodology |
| R — DB forensic sweep | **DONE** |
| S — Independent accounting | **PARTIAL** |
| T — Regression | **PARTIAL** (19/19 + compound + 2 of 10 scenarios) |
| U — Concurrency | **PARTIAL** (2 of 9 named endpoints; multi-process NOT VERIFIED) |
| V — Naive-function architectural attack | **NOT DONE this phase** — explicitly disclosed, see §23 |

## 23. NOT VERIFIED List (explicit)

- Part V (the deliberately naive new-transaction-function architectural-bypass test) was **not performed this phase** — a genuine gap against this mission's own explicit instructions, disclosed rather than silently omitted. Its purpose — proving whether the architecture *forces* atomic protection or merely makes it *available* — remains unanswered. Given every one of the 15 now-fixed functions required an explicit, individual code change to gain protection (never something inherited automatically from a route registration or a shared entry point), the STRONG circumstantial answer is that the architecture does NOT force it — but this was not proven via the specific naive-function experiment the mission requested.
- `issueToSite`, `dispatchToJobWorker`, `returnFromJobWorker`, `recordJobWorkScrap`, `directDispatchFromJobWorker`, `postProductionLabourCost`, `postInstallationLabourCost`, `postBankImportLine`, `createPaymentRequest`, `recordPettyCashVoucher` — none fault-injection tested this phase.
- `postDraft()` as an independent choke point, and the Customer Advance/Billing Milestone/Service Invoice/AMC Billing document types specifically.
- Audit-failure-causes-financial-transaction-to-error-then-retry-duplicates scenario (Part L).
- Save/durability under an actual induced process crash (Part M), as opposed to a caught exception.
- A complete write-point census table.
- A fully independent (non-ERP-report) reconciliation calculation, except for the one `postCustomerReceipt` case.
- Scenarios 1, 2, 4-8, 10 fresh regression.
- GRN, Material Issue, Customer Invoice Draft, Supplier Bill Draft, Customer Receipt, Supplier Payment, Clearing creation at 20x concurrency specifically this phase.
- Multi-process/multi-instance concurrency, categorically, across the entire audit series.

## 24. Remaining Risks

- ~8-10 multi-step transaction families remain with NO rollback protection, by the same defect class proven 15 times now across two phases. Each should be presumed vulnerable until tested.
- Whether the architecture structurally *forces* atomic protection on new code (Part V) remains unanswered — the circumstantial evidence (every fix required manual, individual code change) suggests it does not.
- Save/durability under a real process crash remains an open, undemonstrated risk (P35-D3, unchanged).
- Multi-process concurrency safety remains categorically unproven.
- Audit-as-part-of-the-transaction vs. audit-as-best-effort was never explicitly determined as policy (Part L) — this phase's own new rollback code implicitly treats audit as best-effort (the rollback happens regardless of whether the final "rolled back" audit entry itself succeeds), which is a reasonable default but was not confirmed as an intentional, stated architectural decision.

## 25. SAP Comparison

Unchanged from Phase 35's assessment in kind, updated in degree: SAP's FI/CO/MM posting logic is guaranteed atomic by the underlying database transaction engine for every posting, universally. This Lab now has the equivalent OUTCOME (rollback on exception) individually implemented for 15 specific functions via hand-written, per-function compensating-rollback code — real, live-proven, but categorically narrower than a platform guarantee, and, as this phase's own two self-caught snapshot-timing bugs demonstrate, genuinely error-prone to implement correctly by hand even when the pattern is well understood and being actively applied by someone looking for exactly this class of mistake.

## 26. Reliability Score

| Dimension | Score |
|---|---|
| SAP Parity | 56/100 — modest improvement from Phase 35, still fundamentally short of a platform-level guarantee |
| ERP Reliability | 62/100 — real progress (13 more functions proven safe), but the CRITICAL defect class was proven to be the DEFAULT state, and roughly a third of high-risk functions remain unexamined |
| Data Integrity | 82/100 — zero new duplicates, clean DB sweep |
| Accounting Integrity | 66/100 — up from Phase 35, specifically because the receipt/payment/CN/DN class (the highest-volume real-money-movement functions in the system) is now proven, and the reconciliation-break evidence proves the risk was real, not theoretical |
| Inventory Integrity | 58/100 — 5 of ~10 inventory functions proven; job-work/site-material family (a materially large remaining surface) untested |
| Project Accounting | 70/100 — Labour/Expense now atomic; Production/Installation labour cost untested |
| Security | 76/100 — unchanged, not this phase's focus |
| Auditability | 63/100 — every fix adds a real rollback-audit entry; audit-as-transactional-component was not settled as policy |
| ID Integrity | 66/100 — unchanged from Phase 35 |
| Atomicity | 46/100 — up meaningfully from Phase 35's 40, reflecting real, verified progress (15/23 ≈ 65% of the identified high-risk population), but capped well below "safe" because roughly a third of the identified population, plus an unknown number of not-yet-identified functions, remain unexamined |
| Project Accounting | (see above) |
| Architectural Maturity | 3/5 — unchanged: the pattern is sound where applied, but remains opt-in, hand-implemented, and — as proven twice now by this same audit series catching its own mistakes — genuinely easy to get subtly wrong even when actively attempting it correctly |

**Atomicity detail (per the mission's explicit ask):**
- Functions requiring atomicity (estimated): ~23
- Functions atomically protected (cumulative, Phases 35-36): **15**
- Functions fault-injection tested (cumulative): **15**
- Functions passing (after fix): **15 / 15 tested**
- Functions failing: **0 currently** (all found-broken functions were fixed and re-verified; ~8-10 remain simply untested, not proven either way)
- Financial atomicity: ~85% (11/13 identified financial multi-step functions)
- Inventory atomicity: ~50% (5/10 identified)
- Overall atomicity: ~65% (15/23 identified high-risk families)

## 27. Final GO / GO WITH CONDITIONS / NO-GO

**GO WITH CONDITIONS.**

Per the mission's own absolute gates: no HIGH/CRITICAL financial transaction *among those tested* can currently be partially committed after a deliberate failure (all 15 tested and protected functions show zero net mutation on forced failure); no retry-after-failure among tested functions was shown to double-post after the fix (and the pre-fix double-post/reconciliation-break risk for `postCustomerReceipt` was directly, quantitatively proven and then closed); GL and inventory did not permanently diverge in any tested-and-fixed case; the audit-failure-causes-duplicate-on-retry scenario was not tested this phase (Part L, disclosed as NOT VERIFIED, not claimed safe); and — critically, per the mission's own explicit instruction — **atomicity is proven only for a subset of functions, and this report does not call the ERP transactionally safe in general.**

Stated exactly as the mission requires: **Atomicity is PROVEN for 15 of an estimated 23 high-risk transaction families.** The remaining ~8-10 are unexamined, not "presumed safe" — every one of the 15 that WAS examined turned out to need fixing, which is the strongest available evidence that the unexamined remainder should be treated as vulnerable until proven otherwise, not as low-risk by default.
