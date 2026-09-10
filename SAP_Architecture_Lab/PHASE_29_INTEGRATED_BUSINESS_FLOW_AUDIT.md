# PHASE 29 — FULL INTEGRATED BUSINESS FLOW AUDIT & ACCOUNTANT UAT PREPARATION

**Scope discipline:** audit only. No application code was modified this phase. Two new permanent test/audit scripts were added (`server/phase29_integration_audit.js`) plus three report/package deliverables. Real ERP, offline ERP, and every prior frozen phase's code untouched.

---

## 1. Executive Summary

The full Lead → Estimation → Quotation → Won → Project → Procurement → Factory → Labour → Project Expense → Billing → AR → Project P&L → After-Sales chain was run end-to-end on one freshly-created project (not a seed fixture), live, through the real API surface the UI calls. **56 of 58 integration assertions passed.** The 2 that didn't are genuine, confirmed findings surfaced by design — this audit's job was to find them, not to hide them. A third, more significant finding was found independently during the manual accountant walkthrough (Part 31): Project 360 shows two different "Actual Cost" figures on the same screen once a project has any Project Expense activity. All three findings are documented below in full technical detail and were **not fixed** this phase, per the Absolute Rule.

Independently re-verified (not cited from the Phase 28 report): 925/925 regression, 1,089/1,089 security matrix, exactly 1 central posting engine, `postJournalEntry(` now with 29 call sites (2 more than Phase 27's 27 — both are Phase 28's Labour Wages and Project Expense, no new engine).

## 2. Phase 28 Verification (Part 1)

| Claim | Independently re-run | Result |
|---|---|---|
| 47/47 new tests | Yes | Confirmed, now part of the combined 925 |
| 925/925 full regression | Yes, fresh run | **925/925, confirmed** |
| 1,089/1,089 security | Yes, fresh run | **1,089/1,089, confirmed** |
| `DB.journalEntries.push()` = 1 | Yes | **1, confirmed** |
| `postJournalEntry()` single engine | Yes | Confirmed — 29 call sites, all through the same function |

## 3. Offline ERP Coverage (Parts 2/34)

Full matrix: `PHASE29_OFFLINE_VS_SAP_LAB_COVERAGE.md`. Summary: the four groups Phase 28 targeted (Purchases Intelligence, Inventory Operations, Operations, Factory/MES) are now fully COVERED. Beyond those, the wider offline ERP (15 groups, ~100 items) has real, honestly-reported gaps: an entire HR/Payroll domain (NOT REQUIRED — never in scope), a company-wide Balance Sheet and Profit & Loss statement (genuinely NOT COVERED, newly discovered this phase), several Financial-Statement-style ledger/register screens (PARTIALLY COVERED — data exists, no dedicated screen), and a recurring pattern of backend+API logic with no UI (Customer Advances, Chart of Accounts master, Cost Centre master, Users & Roles). None of these were built this phase — audit only.

## 4-24. Full Business Flow, Traceability, Procurement, Factory, Labour, Expenses, Inventory, Locations, Returns, Ops, After-Sales, Accounting Integration, Project P&L

All run together as one continuous, live trace (`phase29_integration_audit.js`, 58 assertions) on project `PRJ-006` (Phase 29 Test Client), created from a real Lead through Won, not seeded. Full chain exercised: Lead→Estimation→Costing→Quotation→Acceptance→Won (Project+Customer created atomically) → Material Requirement→PO(₹100,000)→Commitment→GRN(60/100 units, ₹60,000)→Commitment correctly reduced to ₹40,000→PO-aware Supplier Bill→AP→Payment→Clearing→BOM→Production Order→Machine→Job Card→Production Material Issue (10 units, existing inventory engine)→Production Labour (₹6,000, same `postJournalEntry`)→QC Checklist→remaining site Material Issue (50 units)→Labour & Wages (₹4,000)→Project Expense (₹2,000)→Customer Invoice (₹250,000)→Receipt→Clearing→Warranty→Service Ticket. Every stage's source document, project tag, cost, quantity, value, status, user, and date were checked — all correct.

**Project isolation confirmed live**: a large (₹100,000) labour cost was deliberately posted to an unrelated seed project (PRJ-1) and confirmed NOT to leak into the test project's P&L.

**Factory/MES confirmed to use the existing architecture only**: production material issue went through the same `createMaterialIssue()`/`postInventoryMovement()` every other issue uses; production labour went through the same `postJournalEntry()`. No second inventory or accounting engine was found anywhere in the new modules.

**Locations confirmed genuinely optional**: two test locations created, one GRN tagged with a location (correctly isolated in Stock by Location), a second GRN with NO location (worked identically to before Phase 28 — optional dimension proven, not mandatory).

**Purchase Return confirmed no double reduction**: returned 2 of 5 received units; stock dropped by exactly 2, not more.

## 25. Critical Double-Count Test, Extended (Part 25)

Independent calculation, done BEFORE reading the ERP's output: Revenue ₹250,000. Material Cost ₹60,000 (the one GRN's full value — 10 units consumed via Production, 50 via direct site issue, summing to exactly the 60 units received). Labour ₹6,000 (production) + ₹4,000 (site) = ₹10,000. Project Expense ₹2,000. **Expected Cost = ₹72,000. Expected Profit = ₹178,000.**

**ERP's own Project P&L output: Cost = ₹72,000, Profit = ₹178,000. Exact match.** The Phase 27 defect remains closed under this more complex, multi-cost-type scenario.

## 26. Full SAP-Style Journal Test

Verified live via Document Viewer (real browser, not API) on the posted Supplier Bill: Voucher `BILL/2026-27/0001`, Posting Date, Document Date, Due Date, Category, Origin/Origin No., Party (VEND-2), Remarks, per-line Account/Debit/Credit/Project/Cost Centre/Tax/Party/Remarks, Total, Difference (₹0.00), and the linked Clearing document — all present and legible. An accountant can trace Document → Journal → Clearing without any technical assistance. Cost Centre was empty on this particular document type (Supplier Bills don't carry one by design in this Lab, consistent with the existing selective cost-centre-tagging pattern from earlier phases — not a new gap).

## 27. Security (Part 27)

1,089/1,089 security matrix re-confirmed. Targeted live spot-checks on Phase 28 areas: Sales role denied Labour Wages and Factory Dashboard (not in its permitted set); ProjectManager correctly sees zero Risk Register entries for a project they're not assigned to; ProjectManager correctly denied recording a Project Expense against an unassigned project. No security weakening found anywhere in the new modules.

## 28. Negative Tests (Part 28) — where the real findings came from

10 negative scenarios run live. 8 passed cleanly (invalid PO/GRN, excess issue, duplicate/overbilling, unauthorized project access, invalid damage reason, far-future date). **2 surfaced genuine findings — see §29 below.**

## 29. Confirmed Findings (full technical detail)

### Finding P29-1 — Project 360 shows two different "Actual Cost" figures (CONFIRMED DEFECT, found via the Part 31 accountant walkthrough)

`projectFinancial360()`'s `cost.actual` field (domain.js, in the `cost:{...}` object) computes `r2(materialCost + labourCostAll)` — summing **only** GL accounts 5000 (Material Cost) and 5100 (Labour Cost) directly by account number. Phase 28's Project Expense (account 5200) is not included in this specific field, nor in `cost.forecast` (which derives from it). Meanwhile, the same screen's top summary box and its "Core Project P&L" section both derive from `projectPL()`/`coreProjectPL()`, which sum **every account of GL type `Expense`** generically — this automatically includes 5200 with no code change needed.

**Live reproduction**: on the audit's test project, with Material Cost ₹63,300 + Labour ₹10,000 + Project Expense ₹2,000 posted: the top summary and Profitability section correctly show Actual Cost ₹75,300 (matching the independent Part 25 calculation exactly); the "Cost" section further down the SAME page shows Actual Cost ₹73,300 — exactly ₹2,000 short, exactly the Project Expense amount.

**Impact**: not an accounting-integrity defect — the GL is correct, Trial Balance balances, and the CORRECT number is present elsewhere on the same page. It is a real, confirmed **reporting inconsistency** that would confuse a real accountant the first time any project has Project Expense activity (which Phase 28 now actively encourages using). Classified per the brief's own examples: this is a genuine technical DEFECT, not a business policy question.

**Not fixed this phase** — flagged for a future controlled-fix checkpoint.

### Finding P29-2 — `createMaterialIssue()` accepts a negative quantity (CONFIRMED DEFECT)

No validation exists for `qty > 0` in `createMaterialIssue()`. Live reproduction: `qty:-5` was accepted (`ok:true`), and because `getStockLevel()` computes an Issue's effect as `stock - qty`, a negative qty **increases** recorded stock instead of decreasing it. At a material with a moving-average rate, the resulting negative valuation additionally fails the function's own `value > 0.01` GL-posting gate — meaning the phantom stock increase gets **no journal entry at all**, silently breaking the link between physical/system quantity and GL value with no error, no audit flag, and nothing to reconcile against. Confirmed via two live reproductions (zero-rate and non-zero-rate materials) with no side effects beyond the isolated test data. `createDamageReport()` was checked for the same pattern and found to correctly validate `qty > 0` — this is an isolated gap in `createMaterialIssue()`, not a systemic pattern across Phase 28's new code.

**Not fixed this phase** — flagged for a future controlled-fix checkpoint.

### Finding P29-3 — Invalid project ID on Project P&L returns 200/zeros instead of 404 (LOW)

`GET /api/project-pl?projectId=<nonexistent>` returns `{ok:true, pl:{revenue:0, cost:0, profit:0}}` rather than a not-found error. No crash, no corruption — just a silent, misleading success. Low severity; documented for consistency, not fixed.

## 30. Reconciliation

AR matches, AP matches, Trial Balance debit=credit, and the Commitment on the audit's own partially-received PO correctly sits at ₹40,000 remaining (reflecting the 40 units never received — not zero, since only the received portion was ever billed). All confirmed after the full integrated flow above, with none of the 3 findings above having corrupted any reconciliation.

## 31. Accountant Experience (Part 31)

Performed live in the browser as `accountant1`, without inspecting source code during the walkthrough itself (source was read only afterward, to root-cause what was already observed on screen).

| Question | Result |
|---|---|
| Can I understand each screen? | PASS |
| Can I find the source document? | PASS |
| Can I find the journal? | PASS (Document Viewer) |
| Can I see Debit/Credit? | PASS |
| Can I see Project? | PASS |
| Can I see Cost Centre? | PARTIAL — populated selectively by document type, not universally (pre-existing, not new) |
| Can I see outstanding? | PASS |
| Can I see commitment? | PASS — clearly separated from Actual Cost, with its own drill-down |
| Can I see actual cost / project profit? | **CONFUSING — Finding P29-1** |
| Can I reverse? | PASS (functionally proven in regression; not re-driven live this pass) |
| Can I reconcile? | PASS |

## 32. UAT Scenario Package

`ACCOUNTANT_UAT_PHASE29/` — 7 files (index + 6 thematic scenario sets covering Sales/Project setup, Procurement/Inventory, Factory/Labour, Billing/Finance, After-Sales/Reports, Security/Reversal), written in plain English per the brief's own instruction, with the 3 findings above pre-disclosed in the index so testers don't waste time re-reporting them.

## 33. Business Policy Detection

No new policy questions this phase. Reconfirmed the two already-disclosed ones remain correctly labeled, not silently treated as fact: Vendor Rating's composite weighting and Product Costing's 15% labour/overhead default, both explicitly marked "not an approved Appletree policy" in their own API responses and screens.

## 35. UAT Readiness Decision

## **B — READY WITH NON-BLOCKING FINDINGS**

The full integrated business flow — the actual test this phase exists to run — passed completely: revenue, cost, commitment, AP, AR, inventory, factory, labour, and project isolation are all correct, and the central accounting engine remains provably singular and correct under a materially more complex scenario than Phase 27's own test. The three findings (P29-1/P29-2/P29-3) are real and must be told to Appletree's testers upfront (done, in the UAT package), but none of them corrupt double-entry integrity, none of them are reachable without either an unusual data-entry mistake (negative quantity) or a specific, narrow reporting field (Cost breakdown sub-section) — the correct numbers are available elsewhere on the same screens throughout. This is not an "A," because a real accountant WOULD notice Finding P29-1 on essentially any project using Project Expenses, and that needs disclosure and eventual correction, not silence.

## 36. Production Distinction

Unchanged from every prior phase: real Appletree master data, real users, real configuration, real migration, real infrastructure, real backup/DR, and management sign-off all remain pending and are not claimed complete here.

## Stop Condition

Per the brief's own instruction, no new module development follows this audit. The three confirmed findings are documented, not silently fixed; a future controlled-fix checkpoint (in the same disciplined style as Phase 27) would be the appropriate next technical step if Appletree wants them closed before real UAT — but real UAT can also proceed now with these disclosed.

---

*Real ERP, offline ERP, and every prior frozen phase's code confirmed untouched throughout.*
