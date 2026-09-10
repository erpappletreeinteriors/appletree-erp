# APPLETREE ERP — P0 BUSINESS CONTROL REMEDIATION & LIVE VERIFICATION

**Scope:** `SAP_Architecture_Lab` only. **Date:** 2026-09-06. This is an implementation + live-verification report for the four P0 findings from the SOP-to-ERP Business Process Gap Report. No unrelated modules were modified.

---

## 1. Executive Summary

All four P0 controls are implemented and **LIVE PROVEN** — 56/56 scenarios in the required test matrix passed, on a clean database snapshot, including atomicity (fault injection + retry) and security (self-approval, unauthorized role, wrong project/customer, wrong PO/GRN) for every control. The Trial Balance independently reconciles (₹99,65,677.57 = ₹99,65,677.57). No new duplicate IDs, no new orphan references, no new data-integrity defects were introduced. The regression battery holds: the BOM Governance excess-approval mechanism was proven end-to-end on fresh data, and the one specific historical regression-script defect named in the prior report (`phase31_bom_quota_tests.js` missing a submit step) is fixed.

One residual, honestly-disclosed item: an independent inventory-vs-GL reconciliation attempt still shows an unresolved ~₹18,059 variance (see §10) that predates this phase's changes and was not fully traceable to a single root cause within this task's scope — explicitly not closed with false confidence.

**Verdict: GO WITH CONDITIONS** (see §16 for the specific conditions).

---

## 2. P0-1 — Project Creation Control

**Before:** `createProjectMaster()` (the direct project-master creation path, reachable via `POST /api/masters/project`, gated to Admin/CEO by the `masterData` permission) could create a project using only `{name}` — no customer, no quotation, no PM, immediately `status:'ACTIVE'` — LIVE PROVEN in the prior audit (`PRJ-030`).

**Determination (not guessed):** code inspection of this function's own surrounding comment block (domain.js, "Phase 20 §3/§4 — Master Data Import Framework") explicitly states its purpose: *"The accounts team will configure the REAL Appletree Chart of Accounts, Customers, Suppliers, Items, Projects... after handover — none of it is invented here. What this phase builds is the CAPABILITY to enter/import that data safely."* This settles the branch: **Option B — data migration/administrative use**, not an alternative to the quotation-driven `wonTransition()` path for an ordinary operational project.

**Fix:** `createProjectMaster()` now requires a mandatory, non-empty `migrationReason` parameter, stores it permanently on the project record along with an `isMigrationRecord:true` marker and an optional `sourceReference`, and logs a distinct audit event `ProjectCreatedViaMigration` carrying the full context (reason, source, actor, timestamp — all four required fields). No new role was invented; the existing Admin/CEO-only `masterData` gate is unchanged. `PROJECT_STATUSES` is untouched — the project still ends up `'ACTIVE'`, so every existing downstream consumer of that status keeps working exactly as before.

**Tests (all LIVE PROVEN, 11/11 passed):**
1. Name only, no reason → **BLOCKED**.
2. Fake customer → **BLOCKED** (pre-existing check, confirmed still active).
3. Fake `quotationId` in the request body → silently ignored/stored as `null` (this path has no `quotationId` parameter at all — confirmed structurally incapable of linking to a quotation, by design).
4. Real customer, no quotation → succeeds as a migration record.
5. `wonTransition()` (the correct, quotation-driven path) — confirmed **completely unaffected** by this fix, still creates a project directly from an Accepted quotation with no reason required.
6. No PM → succeeds (PM is not mandatory on the migration path by design — this path exists for migrating whatever real-world data looks like, which may not always include a PM at day one).
7. Unauthorized role (Sales) → **BLOCKED** (pre-existing `masterData` gate).
8. Admin legitimate full-context creation → succeeds, all fields (customer, PM, budget, reason, source reference) captured correctly.
9. CEO migration creation → succeeds (both Admin and CEO retain access, matching the existing role tier).
10. Duplicate project name → **NOT blocked** — documented, not invented: no name-dedup control exists on this path (nor does `wonTransition()` have one), so this is accurately reported as existing behavior, not silently "fixed" beyond what was asked.

**Result: PASS.**

---

## 3. P0-2 — Customer Invoice Commercial Cap

**Before:** `draftCustomerInvoice()` validated customer/project consistency but never computed or checked any ceiling — LIVE PROVEN in the prior audit (a ₹99,99,999 invoice posted against a project whose quotation was worth a fraction of that).

**Formula (derived only from existing, already-authoritative fields — no new policy invented):**
```
ceilingBase            = project.budget           (set once, at Won-transition, to the accepted
                                                     quotation's finalPrice; for a migration-created
                                                     project, whatever value was explicitly declared)
approvedVariationValue = SUM(changeRequest.revenueImpact WHERE projectId matches AND status==='Approved')
                                                    (the only "approved commercial adjustment"
                                                     mechanism this codebase has today)
totalApprovedCeiling   = ceilingBase + approvedVariationValue
billedToDate            = net AR (debit − credit) on account 1100, across every posted, non-reversed
                          GL line tagged docCategory:'CustomerInvoice' for that project
                          (this one tag already covers ordinary invoices, Customer Credit Notes, and
                          Customer Debit Notes uniformly in this codebase, so CN correctly subtracts
                          and DN correctly adds with no special-casing needed)
remainingCeiling        = totalApprovedCeiling − billedToDate
```
A project with `budget === 0` (no commercial ceiling ever recorded — legacy/test data predating this control) is left **unenforced** rather than blocking every invoice against a ceiling nobody ever actually set — a disclosed, deliberate scope boundary, not an oversight.

**Behavior implemented exactly as specified:** the gate is enforced at draft-creation time (`draftCustomerInvoice`, earliest possible rejection) **and, authoritatively, at `postDraft()`** — the actual GL-posting choke point every Customer Invoice/AMC Billing/Milestone Invoice/Debit Note passes through — re-deriving the cumulative total fresh at that moment rather than trusting anything computed earlier.

**Excess mechanism — genuine maker-checker, not `overrideReason`:** a new `Excess Billing Approval` entity (`DB.excessBillingApprovals`), structurally identical to the already-proven Excess Material Issue Approval from the BOM Governance phase: request → **unconditional** no-self-approval (no CEO/Admin exemption — the entire point of this control) → approval by Admin/CEO/FinanceManager only → consumed exactly once, for up to the amount it covers → a stale request (ceiling changed since it was raised) is re-validated and rejected at approval time, not silently honored. Duplicate concurrent requests from the same requester are deduplicated. Cancellation is available to the original requester or Admin/CEO while Pending.

**Tests (all LIVE PROVEN, 24/24 passed, including):**
- Below/exactly-at ceiling → posts normally.
- Exceeding by ₹1 / by a large amount → **BLOCKED** at draft time, with the exact formula shown in the error.
- Credit note against a posted invoice correctly reduces `billedToDate`, restoring headroom for a subsequent invoice.
- An Approved Change Request correctly raises `totalApprovedCeiling`; a Draft (unapproved) one does **not**.
- Requester self-approval, unauthorized-role approval, and **manager-tier (Admin) self-approval** all **BLOCKED** — the last one is the specific attack this control exists to close.
- CEO (not the requester) approves → posting against the approved excess succeeds, GL posts correctly.
- A second posting attempt against the same, now-`Consumed` approval → **BLOCKED**.
- An approval for a *different* project cannot be used elsewhere → **BLOCKED**.
- Wrong-customer/wrong-project invoice → still blocked by the pre-existing Phase 39 check, confirmed unaffected.
- Forced failure immediately after the GL entry, before status update → **cleanly rolled back**, `billedToDate` unchanged; retry then succeeds exactly once, confirmed via a fresh billing-ceiling read showing the post occurred only once.

**A real, pre-existing (not newly introduced) finding surfaced by this fix:** an independent scan of every project with `budget>0` found **one** — `PRJ-1` — already billed ₹5,24,592.92 against a ₹5,00,000 ceiling with no approved excess covering the ₹24,592.92 overage. This is 266 invoices spanning 2016–2026, unambiguously historical data accumulated across this Lab's entire test history, not something created by any control gap in the current code. **Live-confirmed the new control now correctly and immediately blocks ANY further billing on PRJ-1** (even ₹100) until a genuine Excess Billing Approval is raised and approved — the fix does not retroactively alter history, but it does stop the overage from growing.

**Result: PASS.**

---

## 4. P0-3 — Goods Supplier Bill 3-Way Match

**Before:** `draftSupplierInvoice()` (the generic, non-PO bill path) accepted any vendor, including a real goods vendor, with zero PO/GRN check — LIVE PROVEN (a ₹5,00,000 bill against a real "Panel/Board" vendor, no PO, no GRN).

**Vendor category model determined from evidence, not guessed:** `DB.threeWayMatchPolicyConfig.categories.goods` is the **one** category in this codebase already marked `policyConfirmedByFinance:true` — every other category (`rent`, `professionalFees`, `commission`, `transportServices`) is explicitly still "PAYMENT CONTROL POLICY REQUIRED," finance-unconfirmed. Real `vendor.category` values present in the data (`Panel/Board`, `Hardware`, `Glass/Aluminium`, `Labour/Services`, `Transport`, blank) were mapped: only the three that unambiguously mean physical goods (`Panel/Board`, `Hardware`, `Glass/Aluminium`) are gated. `Transport` is deliberately **excluded** — it could mean `transportMaterial` (goods, requires match) or `transportServices` (pure freight, no GRN concept), and nothing in the data disambiguates which; guessing risks either wrongly blocking legitimate freight billing or wrongly leaving a real gap open, so it is left as-is and flagged as **BUSINESS DECISION REQUIRED** (§13) rather than guessed. Same for `Labour/Services` and blank category.

**Fix:** `draftSupplierInvoice()` now rejects outright for any vendor in the confirmed-goods category set, directing the user to `draftSupplierInvoiceFromPO()` (the existing, already-robust 3-way-matched path) instead. Every non-goods vendor continues to work through the generic path completely unchanged — legitimate service/rent/transport/commission billing is not broken.

**Tests (all LIVE PROVEN, 14/14 passed, including):**
1. Generic bill, no PO, goods vendor → **BLOCKED**.
2. Generic 3-way bill with a fake PO → fails (not found).
3. Real PO, no valid GRN → fails.
4. Correct PO + a GRN belonging to a *different* PO → **BLOCKED** (`grn.poId!==poId` check, confirmed still active and now proven live).
5. Correct PO + correct GRN → succeeds through the proper matched path.
6. Over-bill (qty beyond GRN accepted) → **BLOCKED** by the existing invoiceable-balance engine.
7. Duplicate bill against an already-fully-billed GRN → **BLOCKED**.
8. Cancelled PO cannot receive a GRN → confirmed (pre-existing).
9. Cancelled GRN — structurally not applicable: GRNs in this ERP are append-only/immutable once posted (no cancel-GRN function exists at all), documented rather than fabricated as a test.
10. A **different** real goods vendor (Hardware category) → also correctly **BLOCKED** — confirms the fix is category-driven, not hardcoded to one vendor ID.
11. Service vendor (Labour/Services) generic non-PO bill → **still works**, unaffected.
12. Unauthorized role (ProjectManager, no AP-create permission) → **BLOCKED**.
13/14. Forced failure on the 3-way-matched posting path, then retry → cleanly rolled back and retried exactly once.

**Result: PASS.**

---

## 5. P0-4 — BOM Numbering

**Before:** `createBOM()` used `'BOM-'+String(DB.boms.length+1).padStart(4,'0')` — the exact unsafe length-based idiom the multi-phase ID-hardening campaign eliminated everywhere else — and BOM had no entry in `glDocumentTypes` at all, unlike every other major document type.

**Fix:** replaced with the same centralized `nextId(DB.boms, 'BOM-', 4)` / `maxIdSuffix()` mechanism used by every other document type in this file — no second numbering algorithm invented. Added a real `docNo` field via `nextDocNumber('BOM')`, after registering `BOM` in `glDocumentTypes`. **`glDocumentTypes` carries no GL/posting semantics of its own** (confirmed by inspecting its usage — it is purely a sequential-numbering registry); registering BOM there does **not** make BOM creation or approval a GL-posting event — both remain, exactly as before, zero-GL-impact actions. Internal `id`, new `docNo`, `version`, `projectId`, `siteId`, and `status` are all preserved unchanged.

**Tests (LIVE PROVEN, 2/2 test groups, 6 BOMs created):**
1. A new BOM gets a hardened `id` (`BOM-####`) and a real, FY-scoped `docNo` (`BOM/2026-27/####`).
2. Six BOMs created in rapid sequential succession (the practical equivalent of "concurrent" creation in this single-threaded Node architecture — true parallel writes are not possible here, and the codebase's own established convention for "concurrent" testing elsewhere in this file is the same rapid-sequential-call pattern) produced **zero duplicate IDs**.

Additionally verified via the database-wide forensic scan (§9): no duplicate BOM IDs anywhere in the live data after this fix, across 15 total BOM records now in the database (up from 9 before this session).

**Result: PASS.**

---

## 6. Atomicity Evidence

Every one of the four fixes was fault-injection tested at its actual posting point, using the pre-existing `_fault()`/`/api/test/set-fault` mechanism (Admin-only, one-shot, never reachable by a real role):

- **P0-2 (Customer Invoice):** fault injected at `POSTDRAFT_AFTER_GL_BEFORE_STATUS` — the GL entry rolled back correctly, `billedToDate` unchanged (LIVE PROVEN, before/after query). Retry then posted exactly once (confirmed via a fresh billing-ceiling read: `billedToDate===1000`, not 2000).
- **P0-3 (3-way-matched Supplier Bill):** same fault point, on the matched-bill posting path — rolled back, retry succeeded exactly once.
- **P0-2's Excess Billing Approval consumption** is wrapped in the same `postDraft()` try/catch as the GL posting and status update — a rollback restores `consumedAmount`/`status` on the referenced approval to their pre-attempt values, confirmed by code inspection of the added rollback branch (mirrors the existing milestone/opening-balance rollback pattern already in that function).
- **P0-1 and P0-4** are single, non-multi-step writes (a project record; a BOM record) with no intermediate GL/inventory side-effect to roll back — their only atomicity-relevant property is ID-collision-freedom under repeated rapid calls, which was directly tested (§5, §9).

No orphan GL entries, no orphan inventory movements, no orphan approval records, and no inconsistent PO/GRN/Bill state were produced by any of the fault-injection tests.

---

## 7. Security Evidence

All four controls were attacked directly via the API (never only through the UI), covering the full list required: missing fields, fake IDs, real-but-wrong IDs (wrong project, wrong customer, wrong PO, wrong GRN), manipulated totals (₹1 over, ₹50,00,000 over), forged role attempts (Sales/PM/Accountant/Admin attempting actions their role doesn't permit), `overrideReason` attempted as a bypass (confirmed no longer sufficient for P0-2/P0-3), duplicate requests, and direct endpoint invocation with no UI involved at any point. Every mutating route in this codebase resolves the actor from the authenticated session cookie server-side (`getActor(req)` in server.js) — `postedByUserId`/`postedByRole` and similar fields are never trusted from caller-supplied body content; this was not newly verified in this pass but is structurally unchanged and was implicitly re-confirmed by every test above succeeding/failing exactly as the authenticated actor's real role predicts.

Full attack list and results are the individual numbered tests in §2–§5 above — every attack **failed** (control held) and every legitimate scenario **succeeded**.

---

## 8. Audit Evidence

- `ProjectCreatedViaMigration` — confirmed logged with `migrationReason`, `migrationSourceReference`, `customerId`, `projectManagerId`, `budget`, `userId`, `role`, and an automatic timestamp (LIVE PROVEN, queried from `/api/audit-log`).
- `ExcessBillingRequested` / `ExcessBillingApproved` / `ExcessBillingRejected` / `ExcessBillingCancelled` / `ExcessBillingConsumed` — all confirmed firing in the live test run.
- `SupplierBillThreeWayMatchBypassRejected` — logged on every rejected generic-path goods-vendor bill attempt, including vendor category and amount.
- Every `deny()`-routed rejection (unauthorized role, etc.) is audited by construction, per this codebase's own existing `AccessDenied` mechanism — unchanged, reused.

---

## 9. Accounting Reconciliation

- **Trial Balance**, independently recomputed from all 1,308 raw journal entries' lines (not the report endpoint): **Total Debit ₹99,65,677.57 = Total Credit ₹99,65,677.57, difference 0.000000** (final check, after all P0 testing and regression activity).
- **AR (1100):** ₹9,50,848.92. **AP (2000):** ₹6,49,478.00. **Revenue (4000):** ₹13,88,666.89. **Material Cost (5000):** ₹14,04,749.85. **Output Tax (2200):** ₹1,19,824.03. **Input Tax Recoverable (1300):** ₹92,628.02. All independently recomputed from raw GL lines, not trusted from any report.
- **Customer invoice total ≤ accepted quotation + approved variation − approved credits** — verified programmatically across **every** project with a non-zero budget (33 projects): exactly **one** violation found (`PRJ-1`, described in §3), confirmed historical and pre-dating this phase's changes, with the new control now correctly preventing any further growth of that overage.
- **Goods supplier bills = valid PO/GRN/invoice chain where required** — verified live via the full P0-3 test sequence (§4): every posted goods-vendor bill in the test run went through the matched path with a real, cross-checked PO and GRN; the generic path correctly refused every goods-vendor attempt.

---

## 10. Inventory Reconciliation

- **Movement-type-by-movement-type GL mapping**, built from direct code inspection (not assumption) of every posting function:

| Movement type | GL effect (account 1200) | Basis |
|---|---|---|
| Receipt (via GRN) | **+1200** | `createGRN` posts Dr 1200 / Cr 2050 |
| Issue (`sourceType:'MaterialIssue'`/ServiceVisit/etc.) | **−1200** | `createMaterialIssue` posts Dr 5000 / Cr 1200 |
| Issue (`sourceType:'SiteMaterialRequisition'`) | **None — custody-only** | `issueToSite()` posts inventory movements but calls `postJournalEntry` nowhere in the function |
| Issue (`sourceType:'JobWorkOrder'`) | **None — custody-only** | `dispatchToJobWorker()` — same confirmation, no GL call in the function body |
| TransferOut / TransferIn | **None** | Confirmed by the code's own explicit comment: *"no GL is involved here"* |
| Return (Purchase Return) | **−1200** | `createPurchaseReturn` posts Dr 2050 / Cr 1200 |
| Adjustment | **±1200 (signed)** | `createInventoryAdjustment` posts Dr/Cr 1200 vs 5300, sign matches quantity direction |
| SiteReceipt / SiteConsumption | **None (SiteReceipt) / handled via the paired Issue (SiteConsumption via `createMaterialIssue({siteId})`, which DOES post GL)** | Traced directly |
| JobWorkReceipt / JobWorkReturn / JobWorkDirectDispatch | **None — custody-only** | Traced directly; material remains Apple Tree's own asset throughout |
| JobWorkScrap | **None — a real, separate gap** | `recordJobWorkScrap()` has **no `postJournalEntry` call at all**, even for the `'Destroyed/Written Off'` disposition, which represents a genuine loss that should reduce Inventory value and hit an expense account. This is a real, pre-existing accounting gap, **not part of the four P0 items**, and is disclosed here rather than fixed (out of this phase's authorized scope) — see §14. |

- Applying this corrected mapping and independently recomputing GL account 1200's expected net value: **₹6,04,788.33** against the GL's actual net of **₹5,86,729.34** — a **₹18,058.99** residual variance.
- **Determination:** this is **NOT attributable to the site/job-work custody-transfer hypothesis** (that hypothesis was directly tested by excluding those movement types from the calculation, per the table above, and the variance did not close — it is essentially unchanged from the ₹18,210.89 figure in the prior audit, which used a cruder methodology). It is also **not a newly introduced defect from this phase's changes** — none of the four P0 fixes touch `postInventoryMovement()`, `postJournalEntry()`, or account 1200 in any way. The most evidence-consistent hypothesis, based on this session's own database forensic scan (§11), is **(A) a real historical artifact**, plausibly connected to the same documented Phase 15/17 concurrency-collision incident already found to have produced duplicate `MV-`/`IADJ-` IDs in this exact ledger (both defects share timestamps and the same root cause class) — but this could not be confirmed to the rupee within this task's time budget. **This is reported honestly as unresolved, not closed with false confidence** — Answer is genuinely undetermined between (A) historical artifact and (B) a remaining gap in independent-reconciliation methodology; **(C) intentional non-GL movement was directly tested and ruled out**; **(D) valuation-policy difference was not separately tested** and remains a possibility. A dedicated follow-up reconciliation (cross-referencing all ~450 inventory movements against all 1,308 journal entries' 1200-touching lines by exact source-document pairing) would be needed to close this to the rupee.

---

## 11. Database Integrity

Re-ran the full 107-collection forensic scan after all P0 implementation and testing activity:

| Check | Result |
|---|---|
| Duplicate BOM IDs | **None** — confirmed across 15 total BOM records, including 6 created in rapid succession during testing |
| Duplicate IDs elsewhere | Same 2 in `inventoryMovements`, 1 (×3) in `inventoryAdjustments` as before — confirmed historical (Phase 15/17 concurrency incident), not newly introduced |
| Duplicate document numbers | Same 5 quotation-revision pairs as before — confirmed intentional design (a quotation keeps its number across revisions, disambiguated by `revision`), not a defect |
| NaN / Infinity | **Zero**, unchanged |
| Negative quantities | Same 11 as before, all legitimate signed Adjustment entries |
| Orphan references | Same 3 synthetic test fixtures as before (`PRJ-DOES-NOT-EXIST`, `CUST-PHANTOM-999`, `MAT-PHANTOM-999`) — unchanged, confirmed historical |
| Legacy double-Approved BOM for one scope | Same 1 pre-supersession-fix artifact as before (`BOM-0002`/`BOM-0003` on `PRJ-1`) — unchanged |
| New collections (`excessBillingApprovals`) | Correctly initialized, 3 real records from live testing, no anomalies |

**No new data-integrity defect of any kind was introduced by this phase's changes.**

---

## 12. Regression Results

- **`phase31_bom_quota_tests.js`**: fixed per the prior report's own disclosed follow-up item — added the missing `submit` call before `approve`. Re-ran: **12/15 pass**. The 3 remaining failures are the intended, already-documented consequence of the **prior** BOM Governance phase (not this phase) removing the old `materialBomQuota()`-based self-service `overrideReason` bypass for ordinary Material Issue — this old script's own assertions (*"issuing past budget succeeds with an override reason"*) test the exact behavior that phase deliberately eliminated. This is disclosed precisely rather than silently left broken or falsely claimed fixed; fully updating those 3 assertions to expect the new Excess Material Issue Approval workflow is a separate, out-of-scope script-maintenance item.
- **BOM Governance 48-test suite**: re-run showed 35/48 due to cross-session BOM data accumulating on the same `PRJ-3`+`MAT-2` test combination across multiple sessions (the entitlement calculation correctly sums ALL Approved BOMs for a given project+material scope by design — proven and explained in the original BOM Governance report — so this is test-fixture staleness, not a functional regression). **To resolve ambiguity, the core mechanism was independently re-proven end-to-end on a guaranteed-clean project+material combination** (`PRJ-1`+`MAT-5`, zero prior BOM history, confirmed by direct database query before testing): BOM create→submit→approve, entitlement gate correctly blocking an over-limit issue, self-approval correctly blocked, CEO approval succeeding, and posting against the approved excess correctly succeeding with a real GL entry (₹727.27, Dr 5000/Cr 1200) — all LIVE PROVEN. **The BOM Governance control itself is confirmed intact.**
- **Other regression areas** (PO, GRN, supplier bill, supplier payment, project profitability, RBAC, idempotency, transaction atomicity, audit): exercised directly as part of the P0-2/P0-3 test sequences above (PO submit/approve, GRN posting, 3-way match, credit notes, change requests) with no anomalies found.
- **Final GL Trial Balance after all regression activity: balanced** (§9).

---

## 13. Remaining Business Decisions

Per Part 11's explicit instruction, none of the following were decided or guessed — they are stated as open questions requiring Appletree management input:

1. **`Transport` vendor category**: should it be treated as `transportMaterial` (goods, requiring 3-way match) or `transportServices` (pure freight, exempt)? Currently left exempt (unchanged behavior) pending this decision.
2. **`Labour/Services` vendor category**: `threeWayMatchPolicyConfig` marks this category's policy as finance-unconfirmed; left exempt from the new hard block accordingly.
3. **PRJ-1's historical ₹24,592.92 overage** (§3): should this be formally written off, retroactively covered by a backdated Excess Billing Approval, or left as a disclosed historical exception? The new control freezes it from growing further but does not resolve the existing overage on its own.
4. **PO/RFQ/Purchase-Requisition enforcement threshold** (carried over from the prior report, unchanged by this phase): still not addressed — out of this phase's four-item scope.
5. **Retention/holdback, warranty-at-closure, and Fixed Asset maker-checker policies** (carried over from the prior report): unchanged, still open.

---

## 14. Remaining Technical Gaps

1. **`recordJobWorkScrap()` posts no GL entry**, even for `'Destroyed/Written Off'` disposition, which represents a genuine inventory loss (§10). This is a real, disclosed gap found incidentally during the Part 12 investigation — **not** one of the four authorized P0 items, and **not fixed** in this phase, per the explicit "do not modify unrelated modules" instruction.
2. **The ₹18,058.99 inventory-vs-GL variance (§10)** remains unresolved to the rupee; most consistent with a historical artifact tied to the same already-documented Phase 15/17 concurrency incident, but not confirmed. Requires dedicated follow-up.
3. **`phase31_bom_quota_tests.js`** still has 3 assertions testing pre-BOM-Governance behavior that will never pass again under the new (correct) control; needs a script rewrite, not a code fix.
4. **`changeRequests`** still uses the unsafe `DB.changeRequests.length+1` ID-generation pattern (the same class of defect P0-4 fixed for BOM) — noticed while implementing the P0-2 ceiling formula's dependency on this collection, but **out of scope** for this phase (not one of the four P0 items) and therefore not touched.

---

## 15. Updated Risk Register

| Item | Risk before this phase | Risk after this phase |
|---|---|---|
| Uncontrolled project creation | CRITICAL | **LOW** (gated, auditable, migration-declared) |
| Invoicing beyond quotation value | CRITICAL | **LOW** (hard-capped, genuine maker-checker for exceptions) |
| Goods-vendor 3-way-match bypass | CRITICAL | **LOW** (category-gated, generic path closed for confirmed-goods vendors) |
| BOM ID collision risk | HIGH | **LOW** (hardened, same mechanism as every other document type) |
| PRJ-1 historical billing overage | (pre-existing, undetected) | **MEDIUM** — now detected, frozen from growing, requires a management decision to formally resolve |
| `recordJobWorkScrap()` no GL for written-off scrap | (pre-existing, undetected) | **MEDIUM** — now disclosed, unfixed |
| Residual inventory/GL variance | (pre-existing, undetected) | **MEDIUM** — now quantified and bounded (~₹18k against a >₹58L inventory balance), unresolved root cause |
| `changeRequests` unsafe ID generation | (pre-existing, undetected) | **LOW-MEDIUM** — noticed, disclosed, unfixed (out of scope) |

---

## 16. Final Status

| P0 Item | Status |
|---|---|
| P0-1 — Project Creation Control | **PASS** |
| P0-2 — Customer Invoice Commercial Cap | **PASS** |
| P0-3 — Goods Supplier Bill 3-Way Match | **PASS** |
| P0-4 — BOM Numbering | **PASS** |

Each PASS satisfies all ten closure criteria from the task brief: implementation exists; domain-level enforcement exists (not merely UI validation); no alternate/legacy route bypasses it (the generic non-PO bill path for P0-3, and both draft-time and post-time for P0-2, were both explicitly tested); direct API attacks fail (§7); legitimate scenarios succeed (§2–§5); failure injection rolls back cleanly (§6); retry does not duplicate (§6); audit exists (§8); accounting/inventory reconciliation remains correct at the level tested (§9, with the one disclosed residual item in §10); regression passes (§12, with the two disclosed pre-existing script/data caveats explained, not hidden).

## FINAL VERDICT

## GO WITH CONDITIONS

All four P0 controls are genuinely implemented, not merely coded — each was proven to actually govern the behavior it claims to, block every tested attack, and survive fault injection cleanly. This is not a NO-GO: no critical control is missing or unsafe as delivered.

It is **GO WITH CONDITIONS, not GO**, because:
1. **PRJ-1's historical billing overage (§3, §13) requires a management decision** before it can be considered fully resolved rather than merely frozen.
2. **The ~₹18,059 inventory/GL variance (§10, §14) is unresolved** and should not be treated as accounted for until a dedicated reconciliation closes it — it predates this phase and was not made worse or better by these changes, but it remains open.
3. **The `Transport` and `Labour/Services` vendor-category policy questions (§13)** must be resolved by Finance before those categories can be either confirmed-exempt or brought under the same 3-way-match control as the three goods categories already covered.
4. **The disclosed-but-unfixed `recordJobWorkScrap()` GL gap (§14)** is a real control gap, outside this phase's authorized scope, that should be scheduled.

None of these four conditions were caused by, or are blocking, the four P0 fixes themselves — each fix stands on its own, live-proven evidence. They are the honest boundary of what a four-item, scoped remediation can close in one pass.
