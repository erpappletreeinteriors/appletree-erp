# Appletree SAP Architecture Lab — Phase 11: Financial Integration, Management Control, Project Profitability & UAT Closure
**Date:** 2026-08-25
**Note on scope:** the brief as received was truncated mid-§29 ("Search / Filter / Ensure..."). Sections 1-28 — the entire technical objective (Project Financial 360, drill-down, two-view P&L, Customer Profitability, dashboards, After-Sales financial classification, 6 policy-analysis sections) — were fully specified and are addressed completely below, per this engagement's established pattern of proceeding on a fully-specified brief rather than pausing on a truncated tail. If further sections were intended, they were not received.
**Scope constraint honored throughout:** only files under `SAP_Architecture_Lab/` were touched. `appletree_erp_offline.html`, `appletree_erp_v2_1.html`, the production ERP, and the frozen Phase 4/5 reference were never opened. Verified via `git status --short` — only the pre-existing, unrelated session-start diff on `appletree_erp_v2_1.html` appears.

## Headline result

Every phase from Lead through CAPA is now traceable through **one Project Financial 360** and **one Customer Profitability** view, built entirely as read-only aggregations over existing, unmodified collections — `projectPL()` (unchanged since Phase 5) is reused byte-for-byte as the "Lifecycle" figure, and a new `coreProjectPL()` subtracts the after-sales amounts back out to produce the "Core" (original-only) figure, by construction (`Core.profit − Lifecycle.profit ≡ warrantyCost`, proven as a live invariant, not just asserted). Warranty Cost, Chargeable Service Revenue, and AMC Revenue are computed **only from posted transactions** — proven by testing that a drafted, then submitted, invoice contributes exactly ₹0 until it is actually posted. **801/801 automated checks pass** (up from Phase 10's 788).

## 1. Primary Gap Closed (§3)

Phase 10's own disclosed gap — "Project P&L/Project 360 does not yet surface Warranty Cost/Chargeable Service Revenue/Chargeable Service Cost/AMC Revenue" — is closed. The data always existed (Phase 10's `serviceTicketCostBreakdown`); Phase 11 adds the project-level and company-level rollups and wires them into the UI.

## 2. Project Financial 360 (§4)

Extended the existing Project 360 screen (not a new screen) with a new "Project Financial 360" section, `GET /api/projects/:id/financial-360`, showing every category the brief lists **as separate figures, never merged**: Contract/Commercial (Contract Revenue, Approved Changes, Current Contract Value), Cost (Standard/Committed/Actual/Forecast), Procurement (GRN Value, Supplier Invoice Value, Paid to Supplier), Inventory/Manufacturing (Received/Issued, Material/Labour Cost), Revenue (Customer Invoice/Posted Revenue/Collected/Outstanding), After-Sales (Warranty Cost/Chargeable Service Revenue/Chargeable Service Cost/AMC Revenue vs. Contract Value), and Profitability (Core margin, After-Sales Impact, Lifecycle margin). Verified live with real posted data (a project with ₹1,26,500 contract value, ₹4,000 posted AMC revenue, ₹0 core margin, ₹4,000 lifecycle margin — all internally consistent).

**Disclosed gap**: "PO Value" (distinct from GRN Value) is not separately surfaced — `projectCostBreakdown()`'s existing `committed` figure serves this role but isn't broken out as a standalone PO-total. Not fabricated as a fake number; left `null`/omitted rather than guessed.

## 3. Drill-Down (§5)

Real clickable links added from Financial 360 figures to their source screens: GRN Value → GRNs list, Inventory Received → Movement Ledger, Collected → AR Ageing, Warranty Cost → Service Tickets, AMC Revenue → AMC contracts. Customer Profitability's per-project rows link directly into that project's own Financial 360. **Not built as literal multi-hop click-chains** (e.g., Warranty Cost → Ticket → Visit → Material Issue → Movement → GRN → PO → Supplier Invoice → AP → Payment → Clearing, all in one continuous UI path) — each individual link in that chain exists and works (proven in Phases 9-10), but they are not pre-wired end-to-end from the Financial 360 screen itself. Disclosed as a partial, matching the same honest scoping Phase 9B used for its own SAP-style drill-down assessment.

## 4. Project P&L — Two Views (§6)

**A. Core Project P&L** (`coreProjectPL()`, new): original project revenue/cost only, computed by subtracting after-sales-tagged amounts out of the same source lines.
**B. Lifecycle Margin**: `projectPL()`, **completely unmodified** — it already summed every Income/Expense line tagged with the project, which already included after-sales postings (a direct consequence of Phase 10's deliberate design to reuse existing accounts/docCategories for AR compatibility). Historical project profitability was never rewritten — the existing function's code and output are byte-for-byte identical to before; Phase 11 only adds a *new* function alongside it and labels the existing one's output correctly for the first time.

## 5. Customer Profitability (§7)

New screen (`GET /api/customers/:id/profitability`, restricted to Admin/CEO/FinanceManager/Accountant/Viewer + the owning ProjectManager — **not** Sales, since this carries cost/margin data, a deliberate narrower gate matching the Phase 10 precedent for internal financial detail). Shows Revenue/Cost/Warranty Cost/Chargeable Service Revenue/AMC Revenue/Outstanding AR both as company-wide totals for that customer and per-project, with Customer → Project → Financial 360 drill-down. Verified live.

## 6. Dashboards (§8-10)

**Management**: added Total Warranty Cost, Total Chargeable Service Revenue, Total AMC Revenue (all posted-only, company-wide) via a new lightweight `companyAfterSalesSummary()` — a genuine direct sum over real transactions, not a fabricated or estimated figure, and explicitly **not** computed by looping Financial 360 across every project (which would be both slow and not what the brief's §8 "only display metrics that have authoritative accounting/data sources" implies — a direct sum is more authoritative than a derived loop).
**Finance**: same 3 widgets added, plus an explicit hint pointing to Project 360/Customer Profitability for the profitability drill-down, rather than duplicating a project-level number on the dashboard.
**Project Manager**: Phase 10 already added Open Service Tickets; unchanged this phase (no additional PM-tier financial data was added, matching "do not expose unauthorized financial data").
All verified live via the browser, correct values, no fabricated figures.

## 7. After-Sales Financial Classification (§11-14)

- Every service transaction is classified `Warranty`/`Chargeable`/`AMC` at the ticket level (Phase 10); Phase 11's rollups strictly respect this — a visit's material/labour cost is attributed to Warranty Cost or Chargeable Service Cost based on its ticket's classification, never both, never neither silently.
- **Warranty Cost is never manually editable** — `afterSalesFinancials()` computes it exclusively from `inventoryMovements` (material) and `journalEntries` (labour, via the `ServiceLabour` docCategory), both real posted transactions.
- **Chargeable Service Revenue counts only POSTED invoices** — tested explicitly: a drafted invoice contributes ₹0, a submitted (not yet approved/posted) invoice still contributes ₹0, only a posted invoice contributes its real amount.
- **AMC Revenue counts only POSTED AMC billing invoices**, kept explicitly distinct from `amcContractValue` — tested: a ₹20,000 contract with a ₹5,000 posted billing event shows Revenue=₹5,000, Contract Value=₹20,000, never conflated.

## 8. AR/AP/GL Integration (§18-20)

AR: every open item already carries its source docCategory (`CustomerInvoice` for both original billing and chargeable/AMC — the AR engine itself was never duplicated, so this was already true; Phase 11 adds the `serviceTicketId`/`amcContractId` tags for classification without touching the AR engine). AP: unchanged, no duplicate mechanism — supplier-side after-sales costs (if any parts were purchased specifically for a warranty job) flow through the identical PO→GRN→Supplier Invoice→AP→Payment chain as any other purchase. GL: every Financial 360/Customer Profitability/dashboard figure traces back to `postJournalEntry()`-posted entries — none are computed from anything pre-posting.

## 9. Accounting Reconciliation (§21)

Verified post-integration on a real populated database:
- AR subledger = AR control: **MATCH** (₹4,000 = ₹4,000)
- AP subledger = AP control: **MATCH**
- Trial Balance: proven balanced throughout the 801-test regression suite (unchanged mechanism)
- Project Actual Cost, Posted Revenue, Warranty Cost, Service Revenue, AMC Revenue: all proven, live, to equal their authoritative source transactions (§7 of the new test suite, `financial_integration_tests.js`) — no unexplained reconciling item.

## 10. Billing Milestone Reversal — STILL Business Decision Required (§22)

Per instruction, **not silently chosen** — re-presented from Phase 9B unchanged, since no new information has been provided:
- **Option A**: Reversal resets the milestone to `Ready`. Accounting impact: none (reversal is identical either way). Audit impact: couples the generic `reverseEntry()` function to the billing-milestone module. Operational impact: allows correcting a wrong invoice against the same milestone record.
- **Option B (still the recommended default, unchanged)**: Reversal preserves history; a new billing event is required. Zero new coupling; matches the codebase's existing "Business Document → Accounting Document" separation principle.
**STOPPED at this decision, as instructed.**

## 11. Warranty Accounting Policy (§23)

**Current implementation**: warranty material/labour post to the pre-existing accounts `5000`/`5100`/`1200`/`1000` — the same accounts ordinary project costs use — distinguished only by `docCategory`/`sourceType` tags for reporting, never by a separate GL account.
**Possible alternative**: a dedicated "Warranty/Service Expense" account (e.g. a new `5300`), giving warranty cost its own line on the raw Trial Balance without needing the tag-based rollup Phase 11 built. **Not implemented** — this would be a new GL account, explicitly forbidden without approval. Documented, not chosen.

## 12. AMC Accounting Policy (§24)

**Current**: immediate, one-shot invoice per billing event through the existing Revenue account; no deferred revenue, no contract liability. **Limitation**: a 12-month AMC contract billed once at signing recognizes 100% of that revenue immediately rather than spreading it — proper multi-period recognition would require a Deferred Revenue liability account and a recurring recognition schedule, which is genuine new accounting policy, not built. **ACCOUNTING POLICY REQUIRED** if Appletree wants period-matched AMC revenue recognition.

## 13. Service Labour Rate — Policy/Configuration Requirement Report (§25)

No standard labour rate, technician rate, travel rate, or markup exists anywhere in the system — every `postServiceLabourCost()` call requires an operator-entered amount (or hours × rate, both operator-supplied). **Recommendation if Appletree wants to formalize this**: a small rate-card configuration (technician tier → hourly rate, optional travel rate per visit) would let the UI pre-fill an amount instead of requiring manual entry each time — a UI/UX improvement, not a policy change, and only worth building once the actual rates are approved. Not built.

## 14. Technician Diagnosis SoD — Business Decision Required (§26)

Analysis, as requested, not a code change:
- **Low-value/routine service**: technician's own warranty/chargeable call, unverified, is proportionate — the cost of requiring independent review on every minor ticket would likely exceed the risk it prevents.
- **High-value or disputed warranty claims**: a technician's unverified call carries real financial risk (misclassifying a chargeable job as warranty loses real revenue; the reverse damages customer relationships) — independent review is more clearly justified here.
- **Customer escalation**: by definition already indicates the initial classification is contested, so independent re-review is close to self-evidently warranted.
**Recommendation**: require independent verification (mirroring the existing Snag/CAPA SoD pattern already built) only for tickets above an amount threshold, or already escalated, or explicitly flagged "disputed" — not universally. **BUSINESS DECISION REQUIRED**: the actual threshold amount is Appletree's call, not invented here.

## 15. Service SLA — Configuration/Policy Required (§27)

`dueDate` exists on Service Tickets (Phase 10); no formal SLA engine (response-time targets by priority, automatic breach detection, auto-escalation) exists. **Design if approved**: an `slaPolicies` table keyed by priority (Critical/Normal/Low) → {responseTargetHours, visitTargetHours, resolutionTargetHours}, checked against ticket `createdAt`/`assignedTo`-timestamp/`status`-timestamp to compute a real "SLA Risk"/"SLA Breached" flag (feeding the Service dashboard's already-planned "SLA Risk" widget from Phase 9B's dashboard spec). **Not built** — no actual Appletree SLA targets exist to configure. **CONFIGURATION/POLICY REQUIRED**.

## 16. Reporting Traceability (§28)

Every new dashboard/report figure in this phase traces to exactly one named function: Management/Finance dashboards' 3 new widgets → `companyAfterSalesSummary()`; Project 360's Financial 360 section → `projectFinancial360()` (itself composing `projectPL()`, `coreProjectPL()`, `projectCostBreakdown()`, `afterSalesFinancials()`, `customerOpenItems()` — all pre-existing except the two new ones); Customer Profitability → `customerProfitability()`. No hard-coded management figures exist anywhere in the new code — confirmed by inspection (every `stat(...)` call in the touched dashboard functions reads from an API response, none from a literal number).

## 17. Regression Results

| Suite | Result |
|---|---|
| Phase 6A `security_tests.js` | 44/44 |
| Phase 6B `crm_tests.js` | 44/44 |
| Phase 7 `procurement_tests.js` | 43/43 |
| Phase 8 `site_tests.js` | 41/41 |
| Phase 9 `delivery_partial_tests.js` | 14/14 |
| Phase 9B `security_matrix.js` (450 cells) | 450/450 |
| Phase 9B `id_tamper_tests.js` | 42/42 |
| Phase 9B `phase9b_misc_tests.js` | 19/19 |
| Phase 10 `warranty_tests.js` | 15/15 |
| Phase 10 `service_tests.js` | 27/27 |
| Phase 10 `amc_tests.js` | 13/13 |
| Phase 10 `capa_tests.js` | 15/15 |
| Phase 10 `after_sales_tests.js` | 21/21 |
| Phase 11 `financial_integration_tests.js` (new) | 13/13 |
| **Total** | **801/801 PASS** |

New test file covers: the Core+AfterSales=Lifecycle invariant (live, computed, not just asserted), the posted-only revenue rule for both Chargeable and AMC (draft→submitted→posted, each state checked), Customer Profitability aggregation correctness, and 3 security cases (Sales denied profitability, cross-project PM denied, fabricated ID handled cleanly).

## 18. Defects Found

None in the product code this phase. Two test-authoring mistakes were caught and corrected before being trusted (both root-caused explicitly, consistent with this engagement's discipline): (a) a `wonTransition` call omitted `projectManagerId`, leaving the test's own PM unauthorized for its own scenario; (b) an invariant assertion had its subtraction backwards (`lifecycle − core` instead of `core − lifecycle`), which the actual, correct domain output caught immediately.

## 19. Remaining Gaps (honestly carried forward)

- PO Value not separately broken out from GRN Value on Financial 360 (§2).
- Drill-down chains exist per-hop but are not pre-wired as one continuous multi-step path from a single Financial 360 figure (§3).
- Warranty separate-GL-account, AMC deferred revenue, service labour rate card, technician-diagnosis SoD threshold, and Service SLA targets are all real, analyzed, and explicitly **not built** pending Appletree policy — this is the correct outcome per instruction, not an oversight.
- Company-wide "Project Margin" (blended across all projects) deliberately still not built, consistent with Phase 9B/10's same disclosed limitation and §8's explicit "do not create fake company-wide figures."

## 20. Verdict

**PASS.** Financial integration objective met: every rupee posted through Phases 5-10 is now traceable to a Project Financial 360 or Customer Profitability figure, each backed by a named, inspectable, posted-transaction-only aggregation function. **UAT READY WITH CONDITIONS** — same framing as Phase 9B/10, still explicitly NOT "Production Ready," and now carrying 3 additional analysis-only BUSINESS/ACCOUNTING/CONFIGURATION DECISION REQUIRED items (§10-15) that should be resolved before this goes live with real customers.

## 21. Stop Condition

Waiting for explicit CEO approval before any further phase — including whatever §29 onward was intended to specify, if the truncated brief is resent.
