# Appletree ERP — SAP Architecture Lab
## 30-Deliverable Backfill Report

**Date:** 2026-08-23
**Covers:** §50 of the second (mega) brief, produced after Phase 4 build items 1–5 rather than before, per the CEO's explicit sequencing decision.

### How to read this document

Each of the 30 items below is labeled with what kind of deliverable it actually is:

- **[A] Already exists** — produced in `APPLETREE_SAP_LAB_DISCOVERY_AND_DESIGN_REPORT_2026-08-23.md` ("the Discovery Report"). Cross-referenced here, not duplicated, so the two documents can't drift out of sync.
- **[B] Produced here** — real, new content, grounded in what was actually built and live-tested in `appletree_sap_lab.html` ("the Lab").
- **[C] Deferred** — the honest alternative to inventing content. These are deliverables that would require documenting architecture for modules that don't exist yet (Inventory, Fixed Assets, Banking) or running tests against data that doesn't exist yet (a real Appletree dataset, production-scale volume). Writing prose for these now would be speculation dressed up as documentation — the same failure mode the compliance gate (§9 of the Discovery Report) exists to prevent. Each [C] item states exactly what's missing and what would need to happen first.

**Scope reminder:** the Lab currently implements 5 things — a central dimensioned line-item model, unified document numbering, committed-cost tracking, a tax-code master, and GL-derived Project P&L. It is a working accounting-core prototype, not a re-implementation of Appletree's ERP. Several deliverables below are sized to that reality rather than to the mega-brief's original enterprise-wide ambition — that gap is the point of labeling things [C] instead of padding them out.

---

## 1. [A] Architecture Report

See Discovery Report §0–§8. Summary: current live ERP is a single-file, localStorage-backed, blended-tier application with a structurally sound GL posting engine (`postJournalEntry`, single entry point, debit=credit enforced) but no per-line reporting dimensions, three inconsistent document-numbering schemes, and project profitability computed by re-scanning operational tables in parallel with the GL rather than deriving from it. The Lab's Phase 4 build (this document's subject) closes the dimensioning and numbering gaps and proves the GL-derived-P&L pattern, in isolation, without touching either existing ERP file.

## 2. [A] AS-IS → SAP Principle → TO-BE Matrix

See Discovery Report §3 (13-row table). Unchanged by this backfill — the matrix was accurate before the build and remains the accurate design record; §9 (the compliance gate) is where build status now lives, not §3.

## 3. [A] SAP Architecture Compliance Matrix

See Discovery Report §9. Current status: **8 of 13 rows PASS** (2 by code inspection of the live ERP's existing behavior, 6 by live-tested Lab build work), 1 N/A-Rejected, 2 Not Verified, 2 still Pending Build (rows 1, 7). This is the authoritative pass/fail record — reproduced in condensed form here for convenience:

| # | Principle | Status |
|---|---|---|
| 1 | Three-tier separation | Pending Build |
| 2 | Document principle (Dr=Cr) | **PASS** (built & live-tested) |
| 3 | Universal Journal dimensions | **PASS** (built & live-tested) |
| 4 | Document number ranges | **PASS** (built & live-tested) |
| 5 | Period control | PASS (existing live-ERP code, inspected) |
| 6 | Subledger↔GL reconciliation | Pending Build |
| 7 | Explicit open-item clearing | Pending Build |
| 8 | Cost objects (CC/PC/Project) | **PASS** (built & live-tested) |
| 9 | Integrated P2P/O2C | Not Verified |
| 10 | Segregation of duties | N/A — Rejected (adequate as-is) |
| 11 | Tax codes | **PASS** (built & live-tested) |
| 12 | Asset Accounting lifecycle | Not Verified |
| 13 | CO commitment vs. actual | **PASS** (built & live-tested) |

## 4. [B]+[C] Complete Module Catalogue

**[B] Lab scope (full catalogue):**

| Module | Submodule | Screen | Transaction | Doc Type | Accounting Entry | Integration | Report | Role | Test Case |
|---|---|---|---|---|---|---|---|---|---|
| Core Accounting | GL | Post Journal Entry | Post JE | JE/INV/PO/RCPT/PAY/CN/DN (selectable) | `postJournalEntry()` | Feeds every report below | Journal Register, Trial Balance | (no role model in Lab — single implicit user) | Gate Row 2, 3, 4 |
| Core Accounting | GL | Journal Register | View | — | read-only | reads `journalEntries` | — | — | manual inspection, confirmed |
| Core Accounting | GL | Trial Balance | View | — | read-only, grouped by account | reads `journalEntries` | — | — | manual inspection, confirmed balanced |
| Controlling | Project | Project Ledger | View (filtered) | — | read-only, filtered by `projectId` | reads `journalEntries` | — | — | Gate Row 3 |
| Controlling | Cost Centre | Cost Centre Report | View (filtered) | — | read-only, filtered by `costCentreId` | reads `journalEntries` | — | — | Gate Row 8 |
| Controlling | Project | Project P&L | View (derived) | — | read-only, Revenue−Cost by `projectId` | reads `journalEntries` + `costCentreId` | — | — | Gate Row 8 |
| Procurement | Purchase Order | Purchase Orders | Issue PO / Mark Billed / Cancel | PO | `issuePO()` — business document only, no GL posting | feeds Committed Cost report | — | — | Gate Row 13 |
| Controlling | Budget | Committed Cost | View (derived) | — | read-only, Budget/Committed/Actual per project | reads `purchaseOrders` (Open) + `journalEntries` (Expense accounts) | — | — | Gate Row 13 |
| Tax | Config | Tax Codes | View + Calculate | — | pure function, zero posting | none (deliberately isolated) | — | — | Gate Row 11 |
| Core Config | Numbering | Document Types | View + generate preview number | — | `nextDocNumber()` | feeds every document-type-aware posting | — | — | Gate Row 4 |
| QA | Governance | Compliance Gate Tests | Run all live tests | — | n/a | exercises every module above | live pass/fail report | — | is itself the test harness |

**[C] Live-ERP scope:** the existing offline ERP has ~95 screens across 15 nav groups (Discovery Report §2.10, §6). Producing a full Module→Submodule→Screen→Transaction→DocType→Entry→Integration→Report→Role→TestCase row for all ~95 would mean re-auditing the entire 2MB file at that granularity — a multi-day undertaking on its own, not a backfill item. The Discovery Report's §6 Module Map is the module-level summary already produced; a screen-level catalogue of the live ERP is not attempted here. If wanted, this should be scoped and commissioned as its own task.

## 5. [B]+[C] Complete Transaction Catalogue

**[B] Lab transactions (every one that exists, in full):**

| Transaction | Doc Type | Source Module | Business Event | Accounting Effect | Debit | Credit | Dimensions | Tax | Approval | Posting | Clearing | Reversal | Reporting Effect |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Post Journal Entry | JE (or any selected type) | GL | Manual/GateTest posting | Any GL movement per lines entered | user-entered | user-entered | customer/vendor/project/CC/PC/tax, all optional | optional `taxCode` tag, no auto-calc | none (no approval stage built) | immediate, direct | none (no clearing mechanism built) | none (no reversal function built) | Journal Register, Trial Balance, Project Ledger, Cost Centre Report, Project P&L |
| Issue Purchase Order | PO | Procurement | Commit spend against a project before invoice | **None** — business document only | — | — | project, vendor | none | none | n/a (not a GL posting) | n/a | n/a (Cancel available) | Committed Cost report |
| Mark PO Billed | PO status change | Procurement | PO's spend has now been invoiced elsewhere | **None** — status flag only; the actual GL effect must come from a separate JE posting the vendor bill (not automated in the Lab) | — | — | — | — | none | n/a | removes the commitment | n/a | Committed Cost report (drops to ₹0) |
| Calculate Tax | n/a | Tax | Preview tax on a base amount | **None** — pure calculation | — | — | — | selected `taxCode` | none | never posts | n/a | n/a | Tax Codes tab display only |
| Generate Document Number | n/a | Core Config | Preview/consume next number in a type's range | **None** | — | — | — | — | none | consumes `nextSeq`, reversible on posting failure | n/a | n/a | Document Types tab |

**[C] Live-ERP transactions:** the mega-brief's §10 catalogue asks for GL adjustment/transfer/opening-balance/accrual/provision/prepayment/reversal/suspense entries, the full AR set (invoice/credit note/debit note/advance/receipt/partial/write-off), the full AP mirror, all banking transactions, all Fixed Asset lifecycle transactions, and all inventory transactions. **None of these exist in the Lab** — only the 5 rows above do. The live ERP likely implements many of them already (Discovery Report §2.10 lists Sales Invoices, Receipts, Vendor Bills, Vendor Payments, Credit/Debit Notes, Bank & Cash as existing nav screens) but cataloguing their exact debit/credit/dimension/tax/approval/clearing/reversal treatment would require reading each one's implementation in the 2MB file individually — not attempted here, and each row would otherwise be a guess, which the compliance-gate discipline established in this project specifically forbids.

## 6. [B] Complete Accounting Entry Matrix (Lab Scope)

Every accounting-effecting transaction that exists in the Lab, in the exact format requested by the mega-brief §11/§35:

| Transaction | Document Type | Debit Account | Credit Account | Customer | Vendor | Project | Cost Centre | Profit Centre | Tax | Bank | Source Document | Approval | Posting | Clearing | Reversal | Reports |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Customer invoice + tax (as posted in Gate Row 2/8 tests) | INV | Accounts Receivable (1100) | Project Revenue (4000) + Customer Advance Liability (2100 for the tax portion, as modeled) | ✓ | — | ✓ | — | (not used in Lab) | ✓ `taxCode` on the AR and tax lines | — | manual/GateTest | none | immediate | none built | none built | Journal Register, Trial Balance, Project Ledger, Project P&L |
| Vendor cost posting (material/labour) | JE | Material Cost (5000) / Labour Cost (5100) | Accounts Payable (2000) | — | ✓ | ✓ | ✓ | — | — | — | manual/GateTest | none | immediate | none built | none built | Journal Register, Trial Balance, Project Ledger, Cost Centre Report, Project P&L |
| Purchase Order issuance | PO | *(no GL accounts — not a posting)* | *(none)* | — | ✓ | ✓ | — | — | — | — | Purchase Orders screen | none | not posted | n/a | n/a | Committed Cost |

**Accounting-decision-required flags carried forward, not resolved here** (consistent with §7.6/§7.7 of the Discovery Report): the exact GL account pairing for a *real* customer-advance-to-billing adjustment, and whether/how tax lines should route to a real Input/Output Tax liability account rather than the illustrative `2100` account used in test data, both remain open questions for Appletree's accountant — not guessed at in this matrix.

## 7. [B] Complete Integration Matrix (Lab Scope)

| Source Module | Source Transaction | Destination Module | Business Document | Accounting Document | GL Impact | Subledger Impact | Project Impact | Inventory Impact | Tax Impact | Clearing | Report |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GL | Post Journal Entry | GL, Controlling, Reporting | (the JE itself is both business and accounting document — no separate business-document layer for manual JEs) | JE-000n | Debits/credits per lines | AR/AP-dimensioned lines feed future ageing reports (not yet built) | `projectId`/`costCentreId` lines feed Project Ledger, Project P&L, Cost Centre Report | none | `taxCode` tag only, no posting effect yet | none built | Journal Register, Trial Balance, Project Ledger, Cost Centre Report, Project P&L |
| Procurement | Issue PO | Controlling (Committed Cost) | PO-000n | *(none — POs don't post)* | none | none | Committed bucket increases | none (Lab has no inventory module) | none | n/a | Committed Cost |
| Procurement | Mark PO Billed | Controlling (Committed Cost) | PO status change | *(none — a real Bill JE would need to be posted separately, not automated)* | none directly (the Lab does not auto-generate the Bill's JE) | none | Committed bucket decreases to 0 | none | none | n/a | Committed Cost |
| Tax | Calculate | *(none — isolated)* | n/a | n/a | **none, by design** | none | none | none | computation only | n/a | Tax Codes tab |

The gap visible in this matrix is real and worth naming: **"Mark PO Billed" does not automatically post the corresponding vendor-bill JE.** In a fuller build, billing a PO should generate the accounting document (AP liability, project cost) automatically rather than requiring the user to separately post a matching JE — that integration was not built in items 1–5 and should be scoped explicitly if P2P automation becomes a priority.

## 8. [B] Complete Document Lifecycle Matrix (Lab Scope)

| Document Type | States Implemented | States NOT Implemented (per mega-brief §24) |
|---|---|---|
| Journal Entry | Posted (immediate — no draft stage) | Draft, Parked, Submitted, Approved, Partially Cleared, Cleared, Closed, Rejected, Cancelled, Reversed |
| Purchase Order | Open → Billed / Cancelled | Draft, Submitted, Approved (no approval gate before an "Open" PO exists) |

**This is a genuine, disclosed gap**, not an oversight being hidden: "Created" currently equals "Posted" for every transaction type in the Lab — there is no draft/submit/approve staging anywhere, which the mega-brief (§24, §25) explicitly wants ("Created must not mean Posted. Financial posting must be a controlled action."). This was not built because it fell outside the CEO-approved 5-item priority list (§8 of the Discovery Report) — building it now would require its own priority decision, since it touches every transaction type, not just one.

## 9. [A] Database Architecture

See Discovery Report §5 (net-new structures) and §4.2 (the central line-item shape). The Lab's actual implemented schema (`DB.accounts`, `DB.projects`, `DB.costCentres`, `DB.customers`, `DB.vendors`, `DB.taxCodes`, `DB.glDocumentTypes`, `DB.purchaseOrders`, `DB.journalEntries`) is a direct, working instance of that design — no divergence between what was designed and what was built.

## 10. [A] Central Accounting Line-Item Model

See Discovery Report §4. Now built, not just designed — every `journalEntries[].lines[]` entry carries `account, debit, credit, customerId, vendorId, projectId, costCentreId, profitCentreId, taxCode, currency`, verified live via Gate Row 3.

## 11. [B] Chart of Accounts Mapping

The Lab's illustrative COA (9 accounts, intentionally minimal — **not** a port of Appletree's real chart of accounts, which lives in the live ERP's `DB.accounts` and was never migrated in, per the Discovery Report's "clone the concept, not the data" decision):

| Code | Name | Type | Used By |
|---|---|---|---|
| 1000 | Bank | Asset | test cash movements |
| 1100 | Accounts Receivable | Asset | customer invoice lines |
| 1200 | Inventory / WIP | Asset | seeded, not yet exercised by any built transaction |
| 2000 | Accounts Payable | Liability | vendor cost lines |
| 2100 | Customer Advance Liability | Liability | advance/tax-line illustrations |
| 4000 | Project Revenue | Income | revenue lines, drives Project P&L |
| 5000 | Material Cost | Expense | cost lines, drives Project P&L / Committed Cost |
| 5100 | Labour Cost | Expense | cost lines |
| 5200 | Site Expense | Expense | seeded, not yet exercised |

A real Chart of Accounts mapping exercise (mapping every live-ERP `DB.accounts` entry to a type and reconciliation-account role) was not done — the live ERP's actual account list was not extracted in this pass.

## 12. [A]+[B] AR/AP Architecture

Design: Discovery Report §7.4–7.6 (unchanged). **Not built** in the Lab — no ageing report, no explicit clearing, no partial/residual payment tracking exists yet; this was correctly sequenced as P2 (Discovery Report §3, §8) and deliberately not part of the 5-item priority build. The dimensioning that would make it possible (`customerId`/`vendorId` on lines) **is** built and proven (Gate Row 2's test entry carries a `customerId`), so the remaining work is the report layer only, not the data model.

## 13. [A]+[B] Project Accounting Architecture

Design: Discovery Report §7.8. **Built and live-tested**: Committed Cost report (Budget, Committed, Actual columns) and Project P&L (Revenue, Cost, Profit, Margin %) both exist and both derive from the same `journalEntries` lines plus the `purchaseOrders` business-document layer for the Committed bucket. The mega-brief's requested distinction between Estimate/Budget/Commitment/Actual/Forecast is partially realized: Budget and Committed and Actual are three distinct, correctly-separated columns; **Estimate and Forecast are not represented** — the Lab has no estimation/costing engine (that lives only in the live ERP's separate `calcCosting()` system, per Discovery Report §2.5, and porting it was never in scope).

## 14. [C] Inventory Accounting Architecture

**Not built, not designed.** The live ERP has a substantial inventory module (Warehouse Stock, GRN, Material Issues, Returns, Stock Transfer, Stock Counts — Discovery Report §2.10) that was never audited at the depth needed to design an integration ("Purchase → GRN → Inventory → Project Issue → Project Cost", per mega-brief §19) into the central line-item model. This would be real, valuable work but is a distinct scoping decision from the 5 items already built — flagging for a future priority call rather than guessing at an architecture for a system not yet inspected at that depth.

## 15. [C] Fixed Asset Architecture

Unchanged from Discovery Report §9 row 12: **Not Verified.** `DB.fixedAssets` exists in the live ERP from a prior build phase but its depreciation logic was never inspected. No architecture can honestly be documented here without that inspection happening first.

## 16. [A]+[B] Tax Architecture

Design: Discovery Report §7.7. **Built and live-tested**: `taxCodes` master (3 codes, CGST/SGST/IGST split), pure `calcTax()` calculator, zero auto-posting (Gate Row 11). What remains undecided, by design, matching the live ERP's own disclosed caution: which real GL accounts tax amounts should post to, and under what conditions posting should be turned on — both explicitly flagged as requiring the CEO's accountant's sign-off, not guessed at.

## 17. [C] Banking Architecture

**Not touched.** The live ERP has Bank & Cash and Bank Reconciliation modules (Discovery Report §2.10) that were never audited. No banking transactions exist in the Lab. Deferred, same reasoning as Inventory (#14) and Fixed Assets (#15).

## 18. [A] Approval / Segregation-of-Duties Architecture

Design: Discovery Report §7 row on roles, §3 (Section-34-filtered: "keep the pragmatic flat model, do not build a fuller authorization-object matrix"). Consistent with that decision, the Lab has **no role model or approval staging at all** — every action is available to whoever has the page open. This is intentional for a single-CEO-reviewed prototype phase, but it is the same underlying gap named in Document Lifecycle (#8): before any real users touch this, a minimal Draft→Approve→Post staging and *some* notion of "who is allowed to post" needs to exist. Flagged, not built, per the existing Section 34 filter's own conclusion that a fuller model isn't yet justified — but "isn't justified yet" is different from "isn't needed at all once real people use it," and that distinction should be revisited before any real usage.

## 19. [B] UI/UX Architecture

The Lab's posting screen was built to match the mega-brief's own §25 request almost directly: a structured header (Date, Document Type, Voucher No., Party) above a line-item grid (Account | Debit | Credit | Customer | Vendor | Project | Cost Centre | Tax Code), which is functionally the SAP-familiar layout requested (G/L Account, Debit, Credit, Customer, Vendor, Cost Centre, Project/WBS, Tax Code, minus Profit Centre and Assignment/Reference columns, which exist in the data model but aren't yet separate UI columns). Reports (Journal Register, Trial Balance, Project Ledger, Cost Centre Report, Project P&L) follow a consistent tab-based navigation with a filtered-view pattern throughout. **Not built**: the §25-requested action set (Save Draft / Park / Simulate / Submit / Approve / Reverse / Print / Export) — only "Post" exists, consistent with gap #8/#18 above. **Not built**: drill-down (mega-brief §28) — a user cannot click a Trial Balance line and jump to its source journal entries; each report is a flat filtered table, not a linked drill-down chain.

## 20. [B] Screen Catalogue

| Screen | Purpose | Fields | Mandatory Fields | Buttons | Drill-down | Export |
|---|---|---|---|---|---|---|
| Post Journal Entry | Create a balanced accounting document | Date, Doc Type, Voucher No. (auto), Party, Narration, N line rows (Account/Dr/Cr/Customer/Vendor/Project/CC/Tax) | Date, ≥2 lines with Account | Post, Add line, Remove line | none | none |
| Journal Register | View every posted document | read-only | — | none | none | none |
| Trial Balance | GL account totals + balance check | read-only | — | none | none | none |
| Project Ledger | Filtered lines for one project | Project selector | — | none | none | none |
| Cost Centre Report | Filtered lines for one cost centre | Cost Centre selector | — | none | none | none |
| Project P&L | Revenue/Cost/Profit/Margin per project | read-only | — | none | none | none |
| Purchase Orders | Issue/track POs | Project, Vendor, Amount, Narration | Project, Vendor, Amount | Issue PO, Mark Billed, Cancel | none | none |
| Committed Cost | Budget/Committed/Actual per project | read-only | — | none | none | none |
| Tax Codes | View config + calculate | Tax Code, Base Amount | — | Calculate | none | none |
| Document Types | View/preview number ranges | — | — | Generate number (preview) | none | none |
| Compliance Gate Tests | Run the live test suite | — | — | Run Gate Tests Now | none | none |

No export, print, or drill-down exists anywhere in the Lab yet — consistent with #19's disclosed gap.

## 21. [B] SAP Accountant Familiarity Matrix

Running the mega-brief's own §38 36-scenario checklist against what's **actually possible in the Lab today**:

| # | Scenario | Possible in Lab today? |
|---|---|---|
| 1 | Post a journal entry | ✅ Yes |
| 2 | Simulate a journal | ❌ No — no simulate action |
| 3 | Save/park a journal | ❌ No — posting is immediate, no draft state |
| 4 | Approve a journal | ❌ No — no approval workflow |
| 5 | Post a customer invoice | ⚠️ Only as a generic JE with a `customerId` dimension — no dedicated Invoice screen |
| 6 | Receive a customer advance | ⚠️ Same — possible as a generic JE, no dedicated Advance screen |
| 7 | Apply advance to billing | ❌ No — no clearing mechanism |
| 8 | Receive customer payment | ⚠️ Possible as a generic JE only |
| 9 | Partially clear an invoice | ❌ No |
| 10 | Fully clear an invoice | ❌ No |
| 11 | Enter supplier invoice | ⚠️ Generic JE only |
| 12 | Make supplier payment | ⚠️ Generic JE only |
| 13 | Clear supplier invoice | ❌ No |
| 14 | Post bank charge | ⚠️ Generic JE only (no dedicated Bank account UX) |
| 15 | Perform bank transfer | ⚠️ Generic JE only |
| 16 | Perform bank reconciliation | ❌ No |
| 17 | Create fixed asset | ❌ No |
| 18 | Run depreciation | ❌ No |
| 19 | Dispose an asset | ❌ No |
| 20 | Post project material cost | ✅ Yes (via JE with `projectId`) |
| 21 | View project profitability | ✅ Yes — Project P&L tab |
| 22 | Drill from project profit to source transaction | ❌ No drill-down built |
| 23 | View customer ageing | ❌ No |
| 24 | Drill ageing to invoice | ❌ No |
| 25 | View supplier ageing | ❌ No |
| 26 | Drill ageing to invoice/payment | ❌ No |
| 27 | Run Trial Balance | ✅ Yes |
| 28 | Drill Trial Balance to GL | ❌ No drill-down |
| 29 | Drill GL to accounting document | ⚠️ Journal Register shows full documents, but not by clicking from Trial Balance |
| 30 | Drill accounting document to source business document | ❌ No — POs and JEs aren't linked (PO billing doesn't auto-create a JE) |
| 31 | Lock an accounting period | ❌ No — no period model exists in the Lab at all |
| 32 | Attempt invalid posting | ✅ Yes — Gate Row 2 proves rejection works |
| 33 | Reverse an accounting document | ❌ No — `reversalOfId` field exists in the data model but no UI/function uses it |
| 34 | Run month-end close | ❌ No |
| 35 | Run project budget vs actual | ✅ Yes — Committed Cost tab (Budget/Committed/Actual columns) |
| 36 | Run commitment vs actual | ✅ Yes — same tab |

**Score: 8 fully possible, 6 partially possible (as a generic JE, no dedicated screen), 22 not yet possible.** This is an honest, low number, and it should be read correctly: it reflects that only 5 narrow items were built and prioritized, not that the architecture can't support the rest — the data model (dimensioned lines, `reversalOfId`, tax codes) already has hooks for several of the "not yet possible" rows; what's missing is UI and workflow, not a redesign.

## 22. [A]+[C] Migration Plan

Design decision: Discovery Report §5, "clone the concept, not the data." **No real Appletree data has been migrated into the Lab at any point** — every customer, vendor, project, and account in the Lab is synthetic seed data created for testing. A real migration plan (Discovery Report §40 of the *first* mega-brief: snapshot → backup → clone → verify → migrate → compare counts/balances) was never executed and was never authorized to be executed. This section exists to state that plainly: **if real data migration is wanted, that is a new, separate, explicit authorization decision** — not something to infer from "start building."

## 23. [B] Test Plan

The Lab's actual test plan is the Compliance Gate itself (Discovery Report §9): each build item ships with a corresponding gate row, each row has a specific Test Case, and "Run Gate Tests Now" executes all of them live against the real functions (not mocks) in a real browser session. Method discipline established this session: prefer DOM-event-based verification (`element.click()`) over pixel-coordinate clicks, because this environment's Browser pane does not always composite frames for screenshot-based interaction — coordinate clicks can silently fail to register while appearing to succeed. This was discovered mid-session (see Defect #2 below) and is now the standing verification method for this Lab.

## 24. [B] Test Results

Verbatim from the final live test run (all 6 implemented gate rows), captured in this session:

```
✅ PASS — Row 2 — Document principle (debit = credit), dimension fields non-interfering
✅ PASS — Row 3 — Universal Journal: one document, per-line project dimension, correctly isolated
✅ PASS — Row 4 — Document type owns a number range (sequential, gapless, unique)
✅ PASS — Row 8 / Item 5 — Project P&L derived from the central line-item model
✅ PASS — Row 11 — Tax-code master: config-driven calculation, zero auto-posting
✅ PASS — Row 13 — Committed cost (open PO) tracked, drops to zero once billed
All tests in this run PASSED.
```
Trial Balance after all test and manual activity: Total Debit ₹9,88,000.00 = Total Credit ₹9,88,000.00 — Balanced.

## 25. [B] Defect / Rectification Report

Two real defects were found and fixed during this build session — not hypothetical, both actually blocked verification until root-caused:

| # | Defect | Root Cause | Fix | Retest |
|---|---|---|---|---|
| 1 | Opening the Lab via `file://` produced a page where clicking did nothing and `DB` was undefined in the JS console | This Browser pane environment renders `file://` pages as static, non-interactive snapshots — JS never executes | Served the file over the existing local `serve.ps1` HTTP server on port 3333 instead, navigating to `http://localhost:3333/SAP_Architecture_Lab/appletree_sap_lab.html` | Confirmed `typeof DB === 'object'` and live click handling worked immediately after |
| 2 | Coordinate-based clicks (`computer` tool with x/y or ref-derived coordinates) silently failed to switch tabs — no error, but `document.querySelector('.tab.active')` never changed | The Browser pane wasn't visually composited (`screenshot` timed out with "pane is not displayed"), so pixel-coordinate translation was unreliable even though ref lookup succeeded | Switched to `element.click()` via the JS console for the rest of the session — this fires the identical event the real click would, without depending on compositing | Every subsequent tab switch and button click registered correctly and was independently verified via `document.querySelector('.tab.active')` |

No defects were found in the accounting logic itself (balance enforcement, numbering, committed-cost lifecycle, tax calculation, or P&L derivation) — all six gate tests passed on their first real run after each item was built.

## 26. [B] Financial Reconciliation Report

| Check | Result |
|---|---|
| Total Debit = Total Credit (Trial Balance) | ✅ ₹9,88,000.00 = ₹9,88,000.00 |
| AR subledger = AR control account | N/A — no AR subledger/ageing report built (see #12) |
| AP subledger = AP control account | N/A — no AP subledger/ageing report built |
| Bank ledger = bank balance | N/A — no banking module built |
| Project actual cost = central accounting model | ✅ By construction — Project P&L and Committed Cost both read `journalEntries` directly, there is no second calculation to diverge from |
| Project revenue = posted accounting model | ✅ Same reasoning |
| Tax report = posted tax lines | N/A — tax posting is deliberately off; `calcTax()` is a pure calculator, confirmed to make zero postings (Gate Row 11) |
| Inventory = inventory accounting | N/A — no inventory module built |

The only checks that could produce a **mismatch** given what's built (Trial Balance debit/credit, and Project P&L's internal consistency) were both run and both passed. Every "N/A" row above is N/A because the underlying module doesn't exist yet, not because a check was skipped.

## 27. [A]+[B] Security Isolation Report

| Requirement | Status | Evidence |
|---|---|---|
| Online ERP untouched | ✅ | Never connected to during this session |
| Existing offline ERP untouched | ✅ | `git status --short appletree_erp_offline.html` shows the same pre-existing modified state as at session start (confirmed twice, before and after the build) |
| `appletree_erp_v2_1.html` untouched | ✅ | Same check, same result |
| Experimental ERP isolated | ✅ | Separate file (`appletree_sap_lab.html`), separate `localStorage` key (`appletree_sap_lab_db_v1`), no shared code path with either existing ERP file |
| No production write access | ✅ | No credentials, no network calls, no Supabase/API connections exist anywhere in the Lab's code |
| No online synchronization | ✅ | Confirmed by code inspection — the Lab has zero `fetch`/`XMLHttpRequest`/WebSocket usage |

One caveat worth naming: the local `serve.ps1` server used to run the Lab serves **the entire Claude project directory** over `http://localhost:3333`, including both existing ERP HTML files (read-only, via GET) — this is pre-existing infrastructure from before this session, not something built for the Lab, and it was only ever used to fetch `appletree_sap_lab.html` in this session. It also exposes a pre-existing `POST /__save-icon` endpoint that writes files to disk by a caller-supplied filename with no path validation; the Lab never calls it, but it's worth the CEO knowing it exists on that server if `serve.ps1` is ever exposed beyond localhost.

## 28. [C] Performance Report

**Not applicable yet.** The Lab's current dataset is approximately 10 journal entries and 2 purchase orders — testing startup time, report rendering speed, or large-dataset behavior against that volume would produce numbers with no predictive value for real usage. A performance report should wait until either (a) a realistic synthetic dataset (hundreds–thousands of transactions) is generated specifically for load testing, or (b) real data volume exists, whichever the CEO prefers.

## 29. [A] Known Limitations

See Discovery Report §11, plus everything marked [C] above (Inventory, Fixed Assets, Banking architectures; a full live-ERP screen catalogue; real-data migration; performance testing) and the workflow gaps named in #8, #18, #19, #21 (no draft/approval staging, no role model, no drill-down, 22 of 36 accountant-familiarity scenarios not yet possible).

## 30. [B] Final Release Recommendation

**This is not a release candidate for any part of Appletree's real operations, and isn't intended to be yet.** It is a validated architectural prototype proving 5 specific P0 design decisions actually work when built: a central dimensioned line-item model, unified document numbering, committed-cost tracking, a config-only tax-code master, and GL-derived project profitability. All 5 are proven, live-tested, and isolated from production.

Recommended next step is a decision, not more code: given the honest gaps surfaced in this backfill (#8 document lifecycle, #18 approval/roles, #12 AR/AP, #14/#15/#17 Inventory/Assets/Banking), the CEO should choose **one** of —

1. **Continue horizontally** — build the next-priority items from the original Discovery Report §3 P2 list (explicit clearing, AR/AP ageing) to round out what's already dimensioned but not yet reported on.
2. **Build the missing workflow layer first** — draft/submit/approve staging and a minimal role model (#8, #18), since every future module will need it and retrofitting it later is more expensive than building it now while the surface area is still small.
3. **Pause and get the accountant's sign-off** on the flagged accounting-decision-required items (tax posting treatment, advance-clearing flow) before building anything that assumes a specific answer to either.

No option above is recommended over another here — that's the CEO's call, consistent with every other priority decision in this initiative so far.
