# Appletree ERP — SAP Architecture Lab
## Phase 5 Deliverables: Document Lifecycle, Roles, AR/AP, Clearing, Reversal, Drill-Down, Ageing, Reconciliation

**Date:** 2026-08-23
**Status:** All 11 Phase 5 priorities built and live-tested in `appletree_sap_lab.html`. Checkpoint per CEO decision — the third mega-brief's CRM-to-After-Sales rebuild is **not started**; see §20.
**Security architecture decision (CEO-confirmed this session):** the Lab stays offline, single-file, `localStorage`-based — no backend. Every "security" control described below is **logical/UI-layer only**, real and tested (it genuinely blocks disallowed actions in normal use), but **it does not and cannot protect against a user opening browser dev tools and editing state directly** — that limitation is inherent to a client-only architecture with no server, and is disclosed plainly throughout rather than glossed over.

---

## 1. Phase 5 Architecture Update

The Phase 4 architecture (§4 of the Discovery Report: one `postJournalEntry()` entry point, dimensioned line items) is **unchanged and unrebuilt**, per the CEO's explicit instruction. Phase 5 adds one layer on top of it:

```
Business Event
   ↓
createDraft()          ← NEW: Draft status, invisible to every GL report
   ↓
submitDraft()           ← NEW: role-gated
   ↓
approveDraft()           ← NEW: role-gated + segregation-of-duties check
   ↓
postDraft()               ← NEW: calls the UNCHANGED postJournalEntry() — this is the
   ↓                          only place Phase 5 code touches DB.journalEntries
Accounting Document (journalEntries[])   ← same array, same shape, same reports as Phase 4
```

`postJournalEntry()` itself gained exactly two new optional parameters (`dueDate`, `docCategory`) — both nullable, both ignored by every Phase 4 report and gate test, so every Phase 4 call site (including the compliance-gate tests that call it directly) continues to work byte-for-byte unchanged. This was verified, not assumed — see §18 (Regression).

## 2. Workflow Architecture

One shared engine (`createDraft`/`simulateDraft`/`submitDraft`/`approveDraft`/`rejectDraft`/`postDraft`/`cancelDraft`) used by **every** document type — Journal Voucher, Customer Invoice, Supplier Bill. States: `Draft → Submitted → Approved → Posted`, with `Rejected` and `Cancelled` as terminal side-branches. "Created ≠ Posted" is enforced structurally, not by convention: a Draft/Submitted/Approved/Rejected document has no entry in `DB.journalEntries` at all — it lives only in `DB.jeDrafts` — so it is architecturally invisible to Trial Balance, Project P&L, or any other GL-derived report, not just hidden by a filter that could be forgotten somewhere. Document numbers are drawn only at the `postDraft()` step, and given back if posting fails, so a rejected/cancelled document never burns a gap in a number range.

**Not implemented this phase:** `Park` (mega-brief §3) and `Simulate` exists only for the generic Journal Voucher form, not yet wired into the AR/AP smart forms (Customer Invoice/Supplier Invoice save straight to Draft without a simulate step — a small, disclosed gap, not a hidden one).

## 3. AR Architecture

`draftCustomerInvoice()` builds AR Dr (+ tax if a code is chosen) / Revenue Cr / Output Tax Cr, tagged `docCategory:'CustomerInvoice'`, and goes through the same Draft→Submit→Approve→Post workflow as any other document. `draftAndPostCustomerReceipt()` posts Bank Dr / AR Cr directly (receipts don't need draft staging — they can only be raised against an already-posted, already-approved invoice, so there's nothing left to approve) and creates an explicit `DB.clearings` record. Open items (`customerOpenItems()`) are derived, not stored: for each posted `CustomerInvoice` document, original amount minus the sum of clearings referencing it. **Live-tested at ₹90,000 → ₹50,000 partial → ₹40,000 full (Gate Row 16) and at volume (55+ invoices, §17).**

## 4. AP Architecture

Exact mirror of §3 using `draftSupplierInvoice()` / `draftAndPostSupplierPayment()`, accounts 5000 (Material Cost, Dr)/1300 (Input Tax, Dr)/2000 (AP, Cr), `docCategory:'SupplierInvoice'`/`'SupplierPayment'`. One deliberate asymmetry, found and kept as a real design decision, not an oversight: `Accountant` can `clear` (post a customer receipt) but cannot `pay` (authorize a supplier payment) — receiving money is a lower-risk clerical action than releasing it, so the role table treats them differently. **Live-tested at ₹56,000 → ₹20,000 partial → ₹36,000 full (Gate Row 17) and at volume.**

## 5. Clearing Architecture

`DB.clearings` is a first-class record type: `{id, clearingDocNo, type:'AR'|'AP', invoiceEntryId, paymentEntryId, amount, date, role}` — its own document number range (`CLR/nnnn`), created only by `applyClearing()`, called only from the receipt/payment posting functions. An open item's status (`Open`/`Partially Cleared`/`Cleared`) is computed live from the sum of clearings referencing it, never cached. This satisfies the mega-brief's explicit instruction not to "simply subtract balances without traceable clearing relationships" — every partial or full clearing is its own traceable document, visible in the Document Viewer (§7) and the Customer/Vendor Ledger's "Clearing Doc" column.

## 6. Reversal Architecture

`reverseEntry()` never deletes or edits a posted document. It creates a **new** journal entry with every line's debit/credit swapped, `reversalOfId` pointing back to the original, and the original gets a `reversedByEntryId` pointer (metadata only — its financial content is untouched). **Real defect found and fixed here during volume testing** (§16, Defect 3): a reversed invoice/bill was still showing as fully open in AR/AP subledgers, because reversal and clearing were two different mechanisms and open-items only knew about clearing. Fixed by (a) excluding reversal entries and reversed originals from `customerOpenItems()`/`supplierOpenItems()`, and (b) blocking reversal of any document that already has clearings against it — matching real SAP behavior, where a cleared document must have its clearing undone before it can be reversed. Both the fix and the original failure mode now have a dedicated regression test (Gate Row 21).

## 7. Role / Segregation-of-Duties Architecture

8 roles (`Admin, CEO, Accountant, FinanceManager, ProjectManager, Purchase, Sales, Viewer`), one flat `{view,create,edit,submit,approve,post,reverse,clear,pay,masterData,export}` action set per role — deliberately not a full authorization-object matrix, consistent with the Section-34 filter from Phase 4. **Segregation of duties is enforced structurally, not just by the action table**: `approveDraft()`/`postDraft()` explicitly check whether the acting role matches the document's `createdByRole`, and block self-approval/self-posting unless the acting role is `CEO` or `Admin` — in which case it's allowed but written to `DB.auditLog` as a `SelfApprovalOverride` record. **Live-tested**: Accountant creates+submits, tries to approve their own document → blocked with a named error (Gate Row 15); a different role approving the same document → allowed; CEO creating and approving their own document → allowed, and the audit-log entry is verified to exist, not just assumed.

**Security scope, stated plainly per the CEO's decision this session:** `DB.currentRole` is a single global variable, changeable via a dropdown, with no authentication behind it. This is a **simulation** of role-based access for testing workflow logic — it proves the *logic* is correct (the right role can/can't do the right thing), but it is not multi-user security and was never claimed to be. Anyone with the file can open the JS console and type `DB.currentRole='Admin'`. This is disclosed here explicitly rather than left implicit.

## 8. UI/UX Update

Nav restructured from one flat row into 6 labeled groups (Finance–GL, Finance–AR, Finance–AP, Controlling, Reports/Config, QA) — mirroring the mega-brief's §38 Finance/Controlling grouping request at a scale that fits ~20 screens instead of SAP's much larger surface. A role selector ("Acting as: ___") sits above the nav, always visible, showing the current role's permitted actions. The Journal Voucher posting grid already matched the mega-brief §36 field list closely (Account/Debit/Credit/Customer/Vendor/Project/Cost Centre/Tax Code) from Phase 4; Phase 5 adds the missing header concepts (Document Type as a real dropdown instead of free text) and the missing action set (Simulate alongside Save Draft). **Not built:** Print, Export, Park — disclosed, not silently dropped.

## 9. Updated Module Catalogue

Net new screens this phase: Document Workflow, Document Viewer, Customer Invoice, Customer Receipt, Customer Ledger, AR Ageing, Supplier Invoice, Supplier Payment, Vendor Ledger, AP Ageing, Reconciliation — 11 new screens, bringing the Lab from 11 to 22 total. Each is wired into the same tab-switch/render pattern established in Phase 4 (one `render*()` function per tab, called on tab-click, reading live from `DB`).

## 10. Updated Transaction Catalogue

| Transaction | Doc Type | Lifecycle | Accounting Effect |
|---|---|---|---|
| Journal Voucher | JE | Draft→Submit→Approve→Post | Any balanced set of lines |
| Customer Invoice | INV | Draft→Submit→Approve→Post | AR Dr / Revenue Cr / Output Tax Cr |
| Customer Receipt | RCPT | Direct post + clearing | Bank Dr / AR Cr |
| Supplier Bill | BILL | Draft→Submit→Approve→Post | Expense Dr / Input Tax Dr / AP Cr |
| Supplier Payment | PAY | Direct post + clearing | AP Dr / Bank Cr |
| Reversal | (inherits original's type) | Direct post, blocked if cleared | Original's lines, debit/credit flipped |

## 11. Updated Accounting Entry Matrix

Extends the Phase 4 matrix (30-deliverable backfill §6) with the AR/AP rows now real (not illustrative): every row above has been posted, cleared (partially and fully), and reversed at least once in live testing this session, with dimensions (`customerId`/`vendorId`/`projectId`/`taxCode`) on every line, and every posting still funnels through the single `postJournalEntry()` engine.

## 12. Updated Integration Matrix

The one integration gap named in the 30-deliverable backfill (§7: "Mark PO Billed does not automatically post the vendor-bill JE") is **still present** — Purchase Orders (Phase 4) and Supplier Bills (Phase 5) remain two separate flows, not yet linked. This is a real, disclosed gap for a future phase, not fixed here (it wasn't in the CEO's 11-priority list for Phase 5).

## 13. Updated Document Lifecycle Matrix

| Document Type | States Implemented | Still Missing |
|---|---|---|
| Journal Voucher | Draft, Submitted, Approved, Posted, Rejected, Cancelled | Parked |
| Customer Invoice | Draft, Submitted, Approved, Posted, Rejected, Cancelled | Parked, Simulate on this form |
| Supplier Bill | Same as Customer Invoice | Same |
| Customer Receipt / Supplier Payment | Posted only (by design — clears an already-approved item) | N/A — direct posting is the intended design here |
| Any posted document | Posted → Reversed (if uncleared) | Posted → Partially/Fully Cleared **is** tracked, but via the separate `DB.clearings`/open-items mechanism, not as a status field on the document itself — a deliberate design choice (§6 of the Phase 5 brief said not to maintain a second financial truth) |

## 14. Updated SAP Accountant Familiarity Matrix

Re-running the 30-deliverable backfill's §21 table, only the rows Phase 5 targeted:

| # | Scenario | Phase 4 status | Phase 5 status |
|---|---|---|---|
| 2 | Simulate | ❌ No | ✅ Yes (Journal Voucher form only) |
| 3 | Save/Park | ❌ No | ⚠️ Save (Draft) yes, Park no |
| 4 | Approve | ❌ No | ✅ Yes, with SoD enforcement |
| 5 | Customer invoice | ⚠️ Generic JE only | ✅ Yes, dedicated screen |
| 6 | Customer advance | ⚠️ Generic JE only | ⚠️ Still generic JE only — not built this phase |
| 7 | Advance adjustment | ❌ No | ❌ Still no |
| 8 | Customer receipt | ⚠️ Generic JE only | ✅ Yes, dedicated screen with clearing |
| 9 | Partial clearing | ❌ No | ✅ Yes, live-tested |
| 10 | Full clearing | ❌ No | ✅ Yes, live-tested |
| 11 | Supplier invoice | ⚠️ Generic JE only | ✅ Yes |
| 12 | Supplier payment | ⚠️ Generic JE only | ✅ Yes |
| 13 | Supplier clearing | ❌ No | ✅ Yes |
| 22 | Project drill-down | ❌ No | ✅ Yes (Project P&L → account type → source lines) |
| 23 | Customer ageing | ❌ No | ✅ Yes |
| 24 | Customer ageing drill-down | ❌ No | ✅ Yes (customer → open items → document) |
| 25 | Supplier ageing | ❌ No | ✅ Yes |
| 26 | Supplier ageing drill-down | ❌ No | ✅ Yes |
| 28 | Trial Balance → GL | ❌ No | ✅ Yes (account → source lines) |
| 29 | GL → Accounting Document | ⚠️ Journal Register showed documents, no clickable drill | ✅ Yes, every document number is a link |
| 30 | Accounting Document → Source | ⚠️ Partial | ✅ Yes (Document Viewer shows source draft/clearing/reversal) |
| 31 | Period lock | ❌ No | ❌ Still no — not in Phase 5's 11 priorities |
| 33 | Reversal | ❌ No | ✅ Yes, with the cleared-document block |
| 34 | Month-end close | ❌ No | ❌ Still no |
| 35 | Budget vs Actual | ✅ Yes | ✅ Yes (unchanged) |
| 36 | Commitment vs Actual | ✅ Yes | ✅ Yes (unchanged) |

**Updated score: from the original 36, roughly 18 now fully possible (up from 8), 4 partial (down from 6), 14 not yet possible (down from 22).** Still an honest number — bank/asset/period-close/advance-specific scenarios remain untouched because they weren't in Phase 5's scope.

## 15. Test Results

Final live compliance-gate run (clean `localStorage`, fresh load): **14 of 14 rows PASS** — Rows 2, 3, 4, 8, 11, 13 (Phase 4 regression) plus Rows 14, 15, 16, 17, 18, 19, 20, 21 (new Phase 5 rows: lifecycle, SoD, AR clearing, AP clearing, reversal, AR reconciliation, AP reconciliation, reversal-vs-open-items). Every test ran via the actual `runGateTests()` function triggered by the actual button, in a live browser session over the local HTTP server — not simulated, not hand-computed.

Beyond the gate suite, two rounds of the synthetic data generator were run cumulatively: 110 invoices, 110 bills, ~125 receipts, ~135 payments, 6 reversals, reaching **496 total journal entries**. AR and AP reconciliation held (`MATCH`) and Trial Balance stayed balanced (₹3,61,22,804 = ₹3,61,22,804) at that volume, after both defect fixes — this is real evidence at a scale roughly 5x the mega-brief's own "50+" minimum, not just the small hand-crafted gate-test cases.

## 16. Defect / Rectification Report

| # | Defect | Found By | Root Cause | Fix | Retest |
|---|---|---|---|---|---|
| 1 | Row 17 (AP clearing) failed on first run | Live gate test | Test used role `Accountant`, but `Accountant.pay=false` by design — wrong role chosen in the test, not a product bug | Changed the test to use `FinanceManager` for the payment step | Passed |
| 2 | Rows 19/20 (AR/AP reconciliation) failed on first run | Live gate test | `reconcileAR()`/`reconcileAP()` summed every line touching the control account, including Phase-4 ad-hoc test postings with no `docCategory` — a real design gap, not a test artifact | Scoped the control-account side of the comparison to only AR/AP-tagged transaction categories, matching what the subledger actually represents; disclosed the excluded amount as a "reconciling item" in the UI rather than hiding it | Passed, then re-verified via a dedicated gate test |
| 3 | Reconciliation broke again at volume (110 invoices/bills, 6 reversals) after fixes 1-2 | Synthetic-data stress test (not caught by the small hand-crafted gate cases) | A reversed invoice/bill still counted as a fully open item in the subledger, because reversal and clearing were separate mechanisms and open-items logic only understood clearing | (a) Excluded reversal entries and reversed originals from open-items derivation; (b) blocked reversing any document that already has clearings, matching real SAP practice | Passed at volume (496 entries, two full generator runs), plus a new dedicated Gate Row 21 |
| 4 | Row 14 test detail printed `[object Object]` instead of `true` | Visual inspection of gate output | `.find()`'s return value (an object) was used directly in a boolean `&&` chain instead of being coerced | Added `!!` coercion | Passed |

Defects 2 and 3 are the substantive ones — both are real architectural gaps that would have produced wrong numbers on a real reconciliation report if shipped, found specifically because this session insisted on running tests at volume rather than trusting the small hand-crafted cases alone.

## 17. Financial Reconciliation Report

Final state after two full synthetic-data generator runs (496 journal entries):

| Check | Result |
|---|---|
| Total Debit = Total Credit | ✅ ₹3,61,22,804.00 = ₹3,61,22,804.00 |
| AR Subledger = AR-transaction portion of control account (1100) | ✅ ₹29,34,025.00 = ₹29,34,025.00 |
| AP Subledger = AP-transaction portion of control account (2000) | ✅ ₹14,43,671.00 = ₹14,43,671.00 |
| Non-AR-transaction lines also posted to 1100 (disclosed, not hidden) | ₹3,54,000.00 — entirely from Phase 4's own dimensioning-test postings, a legitimate "reconciling item" category |
| Non-AP-transaction lines also posted to 2000 | ₹1,10,000.00 — same origin |

## 18. Regression Test Report

All 6 Phase 4 compliance-gate rows (2, 3, 4, 8, 11, 13) re-ran and passed on the same test run as the new Phase 5 rows, on a clean `localStorage` state, with **zero changes to their assertions or expected values** — confirming `postJournalEntry()`'s core behavior (debit=credit enforcement, dimension fields, numbering, tax calculation, committed-cost tracking, GL-derived P&L) is unaffected by everything built this phase. This is the actual regression evidence, not a claim — the same 6 rows, run fresh, same pass criteria.

## 19. Security Isolation Report

| Requirement | Status | Evidence |
|---|---|---|
| Online ERP untouched | ✅ | Never connected to |
| `appletree_erp_offline.html` untouched by this session | ✅ | Zero Edit/Write calls against it this entire conversation; `git status` now shows it clean against HEAD — but HEAD itself advanced during this session via a commit made **outside** this conversation (`4ea338f`, "Fix Purchase Builder item picker..."), confirmed via `git log` timestamp, not something this session did |
| `appletree_erp_v2_1.html` untouched by this session | ✅ | Zero Edit/Write calls against it; its pre-existing uncommitted changes (present since before this session started) are unchanged |
| Lab isolated | ✅ | Separate file, separate `localStorage` key, no shared code path |
| No production write access | ✅ | No network calls anywhere in the Lab's code |
| Multi-user security | ⚠️ **Logical only, disclosed** | Per §7 above — real, tested action-blocking logic; zero protection against direct browser-state manipulation, because there is no server to enforce anything against |

## 20. Remaining Gap / Priority Report

**What Phase 5 did not touch (by design, per the CEO's 11-priority list):** Inventory, Fixed Assets, Banking (unchanged from Phase 4's disclosed gaps), Bank reconciliation, period locking, month-end close, customer/supplier advances beyond the generic-JE workaround, Print/Export/Park actions, real drill-down beyond the 4 report types built.

**What the third mega-brief (this session's most recent message) asks for, explicitly not started per the CEO's checkpoint decision:** the full CRM-to-After-Sales business process (Leads, Estimation, full Project WBS/phases, Procurement three-way match, Inventory valuation policy, Manufacturing integration, Site/QC/Handover, Warranty/AMC/CAPA), plus a real client-server security architecture (authentication, server-side authorization, row-level database security) — which, as discussed with the CEO this session, is not achievable in the current single-file offline architecture without a fundamental, separately-scoped architecture change.

**Recommended next decision (unchanged framing from the 30-deliverable backfill's §30, now more concrete):** given Phase 4+5 together prove the accounting core is solid (14/14 tests passing, reconciliation holding at 5x the minimum required test volume), the real fork is whether the next phase continues horizontally within the offline architecture (Inventory/Fixed Assets/Banking, or the CRM-to-After-Sales business process, still client-only) — or whether the security requirements in the new brief are serious enough to justify scoping a real backend as its own initiative. Not decided here; flagged for the CEO.
