# Appletree SAP Architecture Lab — Phase 12: Policy Freeze, Accounting Governance & Final UAT Baseline
**Date:** 2026-08-25
**Nature of this phase:** governance and documentation only. Per §25, no new business modules, CRM, procurement, inventory, manufacturing, service, accounting, HR, payroll, or asset functionality was built. No policy gap was "approved" during this phase, so per §3's own instruction ("do not silently convert assumptions into code"), **zero implementation code was written this phase.** Every recommendation below is a recommendation, not a decision — the DECISION/APPROVED BY/DATE columns in every register are intentionally blank, awaiting the CEO.
**Scope constraint honored:** only this report and no code files were touched. `git status --short` confirms zero changes to any protected file this session — the only diffs are the pre-existing, unrelated session-start change to `appletree_erp_v2_1.html` and the frozen reference showing as untracked (never modified).

---

## 0. Protected Baseline Reconfirmed (§1/§24)

Full regression re-run before any analysis began, exactly as received from Phase 11, zero changes:

| Suite | Result |
|---|---|
| `security_tests.js` (6A) | 44/44 |
| `crm_tests.js` (6B) | 44/44 |
| `procurement_tests.js` (7) | 43/43 |
| `site_tests.js` (8) | 41/41 |
| `delivery_partial_tests.js` (9) | 14/14 |
| `security_matrix.js` (9B, 450 cells) | 450/450 |
| `id_tamper_tests.js` (9B) | 42/42 |
| `phase9b_misc_tests.js` (9B) | 19/19 |
| `warranty_tests.js` (10) | 15/15 |
| `service_tests.js` (10) | 27/27 |
| `amc_tests.js` (10) | 13/13 |
| `capa_tests.js` (10) | 15/15 |
| `after_sales_tests.js` (10) | 21/21 |
| `financial_integration_tests.js` (11) | 13/13 |
| **Total** | **801/801 PASS — unchanged, zero regression** |

A fresh volume run (`after_sales_volume.js`) was also re-executed purely to generate real, substantial numbers for the reconciliation and accountant-acceptance evidence below (§11, §14) — 100 projects/customers, 100 warranties, 200 tickets, 100 visits, 100 posted chargeable invoices, 50 AMC, 50 CAPA, zero errors, then the database was reset back to a clean seed for handoff.

---

## 1. Executive UAT Readiness Report

Ten development phases (5 through 11) have built a from-scratch, SAP-architecture-inspired ERP covering the complete Appletree business cycle: Lead → Quotation → Project → Procurement → Inventory → Manufacturing → Execution → Handover → Billing → AR → Warranty → Service → AMC → CAPA → Financial Integration. Every phase is independently regression-tested and the full suite (801 checks) has never regressed once a defect was fixed. The system enforces real double-entry accounting (one shared posting engine, zero duplicate accounts), real server-side authorization (a 450-cell role×action matrix, closing a genuinely serious pre-existing gap found in Phase 9B), and real segregation of duties in every place tested (maker-checker on journal entries, PO approval thresholds, snag/CAPA independent verification).

**What UAT can rely on today**: the accounting engine, the security layer, the full transaction lifecycle from Lead to CAPA closure, and the new Financial 360 / Customer Profitability views — all proven via automated tests plus live browser walkthroughs, not code review alone.

**What UAT testers must be told before they start** (so gaps are read as known scope, not bugs): 9 open policy decisions (§2) that currently run on a documented-but-provisional default; 3 configuration structures that exist but carry no real Appletree values yet (labour rate card, SLA targets, GRN tolerance is fixed at the current 0% pending this decision); and 6 disclosed technical gaps (§7) that are real but non-blocking.

**Classification: see §15 below — B, UAT READY WITH CONDITIONS**, continuing the same designation Phases 9B/10/11 already carried, now with every remaining condition enumerated in one place for the first time rather than scattered across 4 phase reports.

---

## 2. Master Policy & Decision Register

*(§4's required columns. DECISION / APPROVED BY / DATE are intentionally blank — this document proposes, it does not decide.)*

| ID | Area | Current Behavior | Options | Recommendation | Accounting Impact | Operational Impact | Audit Impact | Security Impact | Technical Impact | Decision From | Decision | Approved By | Date | Impl. Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| POL-01 | Billing Milestone Reversal | Reversal reverses the GL correctly but leaves the milestone stuck at `Invoiced` forever | A: reset to Ready. B: preserve history, new billing event | **B** (unchanged from Phase 9B/11) | None — GL reversal identical either way | A allows re-billing the same record; B requires a new, traceable milestone | B keeps an append-only trail (the milestone genuinely was invoiced once); A retroactively erases that fact | None either way | A couples the generic `reverseEntry()` to one business module; B needs zero new coupling | CEO | — | — | — | DEFERRED |
| POL-02 | Inventory Valuation | Moving Average, GRN-triggered, all materials | Moving Average (current) vs Standard Cost + Variance | **Moving Average, with named exceptions — see §3** | See §3 full analysis | See §3 | See §3 | None | Standard Cost would require a new variance account + a Purchase Price Variance posting path (real new accounting policy, not yet approved) | CEO/FinanceManager | — | — | — | DEFERRED — current implementation stands as default |
| POL-03 | GRN Over-Receipt Tolerance | 0% — any receipt exceeding the ordered qty (even by a fraction) is rejected | 0% / 1% / 2% / 5% / configurable by material-category or supplier | **1%, company-wide, with a documented material-category override path for glass/stone (breakage-prone) — see §4** | Marginal — larger tolerance = more inventory value variance absorbed silently | 0% causes real friction for legitimately-oversupplied panel/sheet goods (suppliers round up to whole sheets) | Every over-receipt inside tolerance is silent — no exception record, unlike today's hard reject | None | Small: `GRN_TOLERANCE_PCT` is already a named constant in `domain.js`, changing it is a one-line, already-isolated edit | Purchase/FinanceManager | — | — | — | DEFERRED — current 0% stands |
| POL-04 | Warranty Accounting | Existing accounts 5000/5100/1200/1000, distinguished only by `docCategory`/`sourceType` tags | Current (shared accounts) vs dedicated Warranty/Service Expense account | **Current model, unless Appletree wants warranty cost visible on the raw Trial Balance without the Phase 11 rollup** — see §5 | See §5 full analysis | See §5 | See §5 | None | A new account is a 1-line SEED addition but is explicit new accounting policy, withheld per instruction | CEO/FinanceManager | — | — | — | DEFERRED — current model stands |
| POL-05 | AMC Revenue Recognition | Immediate, one-shot invoice per billing event, no deferral | Immediate recognition (current) vs deferred revenue / monthly recognition | **Immediate, for now — genuinely simpler and defensible if AMC billing is itself already structured as per-visit/per-quarter invoicing rather than annual lump-sum** — see §6 | See §6 full analysis, incl. the ₹1,20,000/12-month worked example | See §6 | See §6 | None | Deferred revenue requires a new Liability account + a recurring recognition job — real new accounting policy | CEO/FinanceManager | — | — | — | DEFERRED — current model stands |
| POL-06 | Service Labour Rate | 100% operator-entered amount or hours×rate, no rate card | Build a configurable rate card (Technician Tier × Skill × Location × Normal/OT/Travel/Emergency/Weekend) | **Build the configuration structure once real rates exist — see §7 for the proposed schema** | None — this is a UX/data-entry improvement, not an accounting change | Removes a manual-entry error source; today's numbers are only as reliable as whoever types them | No change — every entry is already individually auditable | None | Small — one new master table + a dropdown | CEO/HR/Ops | — | — | — | CONFIGURATION REQUIRED — no code yet |
| POL-07 | Warranty/Chargeable Diagnosis SoD | A single technician's diagnosis call is final, unverified | A: technician-only (current). B: always dual-sign. C: threshold-based (high-value only). D: dispute-flag-based. E: escalation-based | **A hybrid of C+D+E: independent review required only for high-value, disputed, or already-escalated tickets — not universal** — see §8 | Misclassification risk (warranty vs chargeable) is a real revenue-leakage or customer-relations risk above some threshold | Universal dual-sign would slow every routine visit for no proportional benefit | A threshold-based rule is itself auditable (the threshold amount becomes a real, inspectable config value) | Mirrors the already-proven Snag/CAPA independent-verification pattern — low implementation risk once approved | Small — reuses the exact SoD code pattern already built for Snags and CAPA | CEO/FinanceManager | — | — | — | BUSINESS DECISION REQUIRED — threshold amount not invented |
| POL-08 | Service SLA | `dueDate` field exists; no formal response/visit/resolution targets, no auto-escalation | Build a full SLA policy table (Priority → target hours × 3 + escalation rule) | **Build once real Appletree SLA commitments exist** — see §9 for the proposed schema | None | Currently nothing auto-escalates on a missed SLA — purely manual tracking today | An SLA breach, once built, becomes a real auditable event | None | Small — new config table + a scheduled/on-read breach check | CEO/Ops | — | — | — | CONFIGURATION REQUIRED — no code yet |
| POL-09 | Role Model (Warehouse/Production/Site) | 9 roles; Purchase does both PO-creation and GRN-receipt; ProjectManager both executes and self-certifies QC | Keep 9 roles (current) vs split into 12 (add Warehouse/Production/Site) | **KEEP the current 9, with the 2 disclosed SoD gaps (Purchase self-GRN, PM self-QC) formally accepted or independently mitigated — see §10** | None | Splitting roles means real new user accounts/training for what is currently a small team (10 seeded test users implies a small real headcount) | A split role model gives cleaner per-action audit attribution | Splitting closes 2 real, already-identified SoD gaps; keeping them open is a documented, accepted risk, not a hidden one | Splitting is a moderate change (new role in `ROLES`/`ROLE_ACTIONS`, re-gating ~15 endpoints) | CEO | — | — | — | BUSINESS DECISION REQUIRED |
| POL-10 | Company-Wide Project Margin | Not built — only per-project (Financial 360) and per-customer (Customer Profitability) margin exist | Build a blended company-wide margin rollup vs keep project/customer-level only | **Keep project/customer-level only, unless Management specifically wants one blended number — see §12** | A blended figure risks averaging away exactly the per-project variance Management most needs to see | A single "the company is at X% margin" number is easy to misread without the underlying project mix | None | None | Small if approved — a straightforward sum over `projectFinancial360()` results, same technique as `companyAfterSalesSummary()` | CEO/Management | — | — | — | DEFERRED — not built |
| POL-11 | PO Value on Financial 360 | `committed` (open PO value net of what's been invoiced) is shown; PO Gross/Net/Tax/Outstanding/Received are not separately broken out | Add the 5 separate PO-value figures vs keep `committed` as the sole proxy | **Add PO Gross Value and PO Outstanding (Gross − Invoiced) as 2 new figures; Net/Tax/Received are already covered by existing GRN/Supplier-Invoice figures and would be redundant** — see §13 | None — pure additional read-only aggregation, same technique as existing `projectCostBreakdown()` | Gives Purchase/PM a clearer "what's still open on this PO" number distinct from the accounting-driven `committed` figure | None | None | Small — 2 new fields on an existing, already-tested aggregation function | FinanceManager/PM | — | — | — | DEFERRED — not built |
| POL-12 | Export Data Payload | Authorization gate is real and tested; `/api/export` returns no actual file/data, only an audit log entry | Build real CSV/data export for GL/AR/AP/Project P&L/Inventory/Financial 360/Customer Profitability/After-Sales | **Build only the exports UAT testers will actually need to hand to auditors/management during the UAT window — see §14 for the per-report scope table; do not build all 8 speculatively** | None — export is a read path | Real exports let Finance hand real numbers to auditors without screen-scraping | Every export must itself be audit-logged (already true for the authorization event; the payload isn't) | Field-security must apply to export payloads exactly as it does to the live screens — this is real, non-trivial work per report | Moderate — 8 distinct CSV-shape decisions, not a single mechanism | CEO/FinanceManager | — | — | — | NOT IMPLEMENTED |

---

## 3. Accounting Policy Register

### 3.1 Inventory Valuation — Moving Average vs Standard Cost (§6)

**Current**: Moving Average, recomputed on every GRN from `totalValueReceived / totalQtyReceived`, applied at the moment of Material Issue.

**Evaluated specifically for Appletree's actual business** (not generic SAP guidance):

| Factor | Moving Average (current) | Standard Cost + Variance |
|---|---|---|
| Inventory valuation | Reflects actual paid price at all times — no separate variance account needed | Requires a Purchase Price Variance account; inventory carries a "should-cost" figure that can drift from cash reality |
| COGS / Project Actual Cost | Directly, automatically accurate — the exact price paid flows straight through to `Material Issue`'s GL posting, which is what Project P&L already relies on | Requires a variance allocation step at month-end to true up COGS to actual — a real new process, not currently built anywhere in this Lab |
| Project-based procurement (Appletree's actual model) | **Strong fit**: each project sources materials close to when they're needed, at whatever the current market/supplier price is — Moving Average captures that reality directly, project by project | **Weak fit**: Standard Cost assumes a stable, forecastable price set once a year/quarter — custom-furniture/interior-design procurement (bespoke veneers, imported hardware, one-off glass sizes) has much less price stability than, say, a factory's standard raw-material catalogue |
| Custom furniture / one-off site consumption | A one-off material bought for a single project at a one-off price gets its own accurate cost immediately — no variance to explain later | A one-off item would need its OWN standard cost set (defeating the purpose of "standard"), or would inherit a generic standard that's wrong for that specific purchase |
| Material price fluctuations | Absorbed automatically, transaction by transaction, into the moving average — visible in real time | Absorbed into a variance account that only surfaces the SIZE of the fluctuation at month-end, not which transaction caused it |
| Month-end closing | Nothing extra to do — the moving average IS the actual cost already | Requires an explicit variance-closing entry every period — new process, new account, new discipline |
| Management reporting | "What did this actually cost" is answered directly | "What did this actually cost vs. what we planned" is answered, which is valuable for OPERATIONAL variance analysis (are we buying efficiently?) but is a DIFFERENT question than project profitability |

**Recommendation**: Moving Average remains the better fit for Appletree's project-based, largely bespoke procurement model, and is what's implemented. Standard Cost's real value — flagging *purchasing efficiency* variance — is a genuinely useful management question Appletree might separately want answered, but it is an ADDITIONAL analytical need, not a replacement for how inventory should be valued given how Appletree actually buys materials. **DECISION REQUIRED** only if Management specifically wants purchasing-efficiency variance reporting; if so, the recommended path is a lightweight "PO rate vs. category average rate" comparison report (not a full Standard Cost re-architecture), which was not built this phase pending that decision.

### 3.2 GRN Over-Receipt Tolerance (§7)

| Tolerance | Inventory impact | PO/GR-IR impact | AP impact | Supplier control | Operational impact |
|---|---|---|---|---|---|
| 0% (current) | Zero variance ever silently absorbed | GR/IR clears exactly | AP matches exactly | Maximum — any over-delivery is hard-rejected | Real friction: sheet-good suppliers (plywood, laminate, glass) routinely deliver in whole-unit increments that can technically exceed an odd-numbered PO quantity by a fraction |
| 1% | Negligible inventory variance | Negligible GR/IR carry | Negligible | Still tight — catches genuine over-delivery, absorbs rounding | Removes the whole-sheet-rounding friction without materially loosening control |
| 2% | Small | Small | Small | Looser | Convenient but starts allowing real supplier short-shipment-then-overcorrection patterns to hide |
| 5% | Meaningful | Meaningful | Meaningful | Weak | Not recommended for a company this size — too much room for supplier gaming |
| Configurable per material-category | Precise where it matters | Precise | Precise | Best — tight where needed, loose where physically justified | Real implementation cost: needs a new field on the material master, plus UI to set it |

**Recommendation**: **1% company-wide as an immediate, low-risk improvement**, with an explicit note that glass/stone (which genuinely break and get re-cut, sometimes delivered slightly oversized to allow for on-site trimming) may warrant a category-level override later — but that override is a second, separate decision, not built or assumed here. **DECISION REQUIRED.**

### 3.3 Warranty Accounting (§8)

**Current**: 5000 (Material Cost)/5100 (Labour Cost) — the SAME accounts ordinary project costs use — distinguished only by the Phase 10/11 `docCategory`/`sourceType` tags, requiring the Financial 360 rollup to see warranty cost separately.

| | Current (shared accounts) | Dedicated Warranty/Service Expense account |
|---|---|---|
| Financial reporting | Warranty cost is invisible on a RAW Trial Balance — only visible via Financial 360's computed rollup | Warranty cost is visible on the Trial Balance itself, at a glance, no computation needed |
| Project profitability | Identical outcome either way — Financial 360 already correctly separates it | Identical outcome |
| Warranty reserve visibility | No reserve/provision exists either way — this Lab posts warranty cost as incurred, never accrues a forward-looking reserve | Same — a dedicated expense account doesn't itself create a reserve; that would be a THIRD, separate policy (warranty provisioning), not addressed here |
| Management reporting | Requires the Financial 360/dashboard screens specifically — cannot be read off a generic GL report | Works with ANY generic GL report, including ones outside this Lab (e.g. if Appletree's real accountant exports to Tally/Zoho) |
| Tax/accounting implications | None known either way at this Lab's level of detail | None known either way |
| Audit trail | Full — `sourceType`/`docCategory` tags are permanent and queryable | Full — arguably simpler for an external auditor unfamiliar with this Lab's tagging convention |

**Recommendation**: if Appletree's real accounting team will ever look at a Trial Balance OUTSIDE this Lab's own Financial 360 screens (e.g., exporting to their actual bookkeeping system), a dedicated account is genuinely more portable and should be considered. If all reporting stays inside this Lab, the current tagged-account model is equivalent and requires no new GL structure. **DECISION REQUIRED**, no account was added.

### 3.4 AMC Revenue Recognition (§9)

**Worked example, as requested**: a ₹1,20,000 AMC contract over 12 months represents ₹10,000/month of economic service obligation.

- **Immediate recognition (current)**: if Appletree bills this AMC as ONE ₹1,20,000 invoice at signing, the current implementation recognizes all ₹1,20,000 as revenue that instant — materially overstating that month's revenue and understating every subsequent month's, even though the actual service obligation is delivered evenly across the year.
- **Deferred revenue / monthly recognition**: the ₹1,20,000 would post to a new Deferred Revenue (Contract Liability) account at signing, then a recurring ₹10,000/month journal entry would move it into the Revenue account as each month's service is actually delivered.

**Journal flow if deferred** (documented, NOT implemented): 
- At signing: Dr Bank/AR ₹1,20,000 / Cr Deferred Revenue (Liability) ₹1,20,000.
- Each month: Dr Deferred Revenue ₹10,000 / Cr Revenue ₹10,000.

**Period-end implications**: at any month-end, the Deferred Revenue balance correctly represents "service Appletree still owes the customer" — a real liability, useful for both accurate P&L and for understanding forward service commitments.

**Cancellation/refund**: if a customer cancels mid-contract, the remaining Deferred Revenue balance would need an explicit refund/write-off policy — not addressed here, a further decision.

**Early termination / renewal**: renewal already exists operationally (Phase 10's `renewAMCContract`); if deferred revenue were built, a renewal would need its OWN new deferred-revenue schedule, cleanly separated from the terminating contract's (Phase 10's renewal already creates a fully separate, cross-linked contract record, which is compatible with this).

**Recommendation**: **this genuinely depends on how Appletree actually bills AMC contracts in practice.** If AMC is billed quarterly or per-visit (matching the `serviceFrequencyMonths` field already in the data model) rather than as one annual lump sum, immediate recognition per billing event is already reasonably accurate and deferred revenue would be over-engineering. If AMC is billed as one annual lump sum, deferred revenue is the accounting-correct answer and should be built. **DECISION REQUIRED**, nothing implemented.

---

## 4. Security Policy Register (§23 reconfirmation)

No control was weakened this phase. Re-confirmed by re-running the exact suites that prove each:

| Control | Proof | Status |
|---|---|---|
| RBAC | 450-cell Role × Action matrix, `security_matrix.js` | 450/450 PASS |
| Data Scope | `isProjectManagerOf`, `assignedCustomers` row-filtering, tested in every phase's suite | Confirmed unchanged |
| Field Security | Vendor bank/GST omission, costing-version cost-field omission, tested in Phase 6A/9 suites | Confirmed unchanged |
| SoD | Maker-checker (JE self-approval), PO approval thresholds, Snag resolve≠verify, CAPA owner≠verifier≠effectiveness-approver | All re-tested, all pass |
| ID Tampering | 42 dedicated cases (`id_tamper_tests.js`) — fabricated IDs never leak structure, never crash | 42/42 PASS |
| Cross-Project | PM-not-assigned denial, tested across Warranty/Complaint/Ticket/Production/Dispatch/QC/Snag/Handover | Confirmed unchanged |
| Cross-Customer | Sales row-scoping to `assignedCustomers`, tested | Confirmed unchanged |
| Financial Visibility | Customer Profitability and Service Visits/CAPA deliberately narrower than customer-facing screens (excludes Sales) — a Phase 10/11 design decision, re-verified this phase | Confirmed unchanged |

**No new security work was performed this phase** — this section is a reconfirmation, not new testing, per §23's own framing ("Reconfirm... Do not weaken existing controls").

---

## 5. Role Decision Matrix (§13)

| Role | Current Responsibilities | SoD Adequacy | Data Scope | Recommendation |
|---|---|---|---|---|
| Admin | Full system access, master data, overrides | N/A — inherently privileged | Full | KEEP |
| CEO | Full commercial + operational authority, override power | N/A — inherently privileged | Full | KEEP |
| Accountant | Create/submit financial documents, cannot approve/post/pay | Clean — maker only | GL-visible | KEEP |
| FinanceManager | Approve/post/pay, PO/discount approval tier, warranty void/AMC activate | Clean — checker tier | GL-visible + broad | KEEP |
| ProjectManager | Execute assigned projects: production, dispatch, installation, QC, service tickets | **Gap**: self-certifies own QC, no independent inspector | Row-scoped to assigned projects | KEEP role, but see POL-07/POL-09 for the QC self-certification gap specifically |
| Purchase | Create/submit POs, receive GRNs, issue service material | **Gap**: same person can create a PO and confirm its own receipt | Company-wide (procurement is not project-scoped by role) | KEEP role, but see POL-09 — GRN-receipt SoD is the more consequential of the two disclosed gaps (real cash/fraud exposure vs. QC's more reputational exposure) |
| Sales | Own leads/quotations/customers, create warranty/AMC-adjacent complaints | Clean — no financial posting authority | Row-scoped to assigned customers | KEEP |
| Estimator | Build costing versions, approve BOMs | Clean | Company-wide (costing is not customer-scoped) | KEEP |
| Viewer | Read-only, broad | N/A | Full read | KEEP |

**Recommendation on Warehouse/Production/Site**: **KEEP the current 9-role model.** None of the 3 proposed roles map cleanly onto this Lab's actual document/action boundaries (e.g., "Warehouse" would only ever touch the GRN-confirmation half of what "Purchase" currently does — splitting it purely to fix the GRN-SoD gap is a reasonable, narrow fix, but inventing "Production" and "Site" as full roles when ProjectManager already covers that ground with no confusion in 10 phases of testing would add real operational overhead (more users, more training, more role-switching for what may be a small real team) without a correspondingly large control benefit. **If only ONE new role is added, it should be a narrow "Warehouse/Receiving" role that takes over GRN confirmation from Purchase** — this closes the more consequential of the two disclosed SoD gaps with the smallest possible role-model change. **DECISION REQUIRED.**

---

## 6. Configuration Register

| Item | Current State | Proposed Schema | Status |
|---|---|---|---|
| Service Labour Rate Card | None — operator types every amount | `technicianTier` × `skill` × `location` → `{normalHourRate, overtimeRate, travelRate, emergencyRate, weekendHolidayRate}` | CONFIGURATION REQUIRED — no real Appletree rates supplied, none invented |
| Service SLA Policy | `dueDate` field only | `priority` → `{responseHours, visitTargetHours, resolutionTargetHours, escalationLevel, escalationUserId}` | CONFIGURATION REQUIRED — no real Appletree SLA commitments supplied, none invented |
| GRN Over-Receipt Tolerance | Fixed 0% constant | Single company-wide percentage (recommended 1%, see §3.2), with a documented (not built) future path to per-material-category override | BUSINESS DECISION REQUIRED before any code change |
| PO Approval Thresholds | Real, BOS §1.6-sourced, already implemented (≤₹500k none / ≤₹2M FinanceManager / above CEO) | No change proposed | IMPLEMENTED, TESTED, already governed by a real, cited policy — not a gap |
| Discount Approval Thresholds | Real, BOS §1.6-sourced, already implemented | No change proposed | IMPLEMENTED, TESTED |

---

## 7. UAT Gap Register (§19 — every disclosed gap from Phases 9B-11, consolidated)

| Gap | Severity | Business Impact | Accounting Impact | Security Impact | Current Workaround | Recommended Action | Blocks UAT? | Blocks Production? | Decision Required? |
|---|---|---|---|---|---|---|---|---|---|
| Export payload not implemented (auth-only) | Medium | Finance/Management cannot hand real files to auditors from this Lab | None — no data is lost, just not exportable | None | Screen-read + manual copy | Build the specific exports UAT actually needs (§2 POL-12) | No | **Yes** (auditors need real exports) | Yes — scope per report |
| ~10 lists (Customers/Suppliers/Supplier Invoices/Production Orders/Dispatches/Deliveries/Invoices/Receipts/AR/AP) lack dedicated search boxes | Low | Minor UX friction at current data volumes (tens, not thousands, of rows) | None | None | Scroll/scan manually | Add client-side search to the highest-traffic 2-3 lists first | No | No | No |
| ~6 document cross-links not clickable (Supplier Invoice→PO/GRN, Payment→AP Invoice, Delivery→Dispatch, Material Issue→Project/Inventory, Production→BOM/Material Issue, Dispatch→Production Output) | Low | Slower manual navigation, not a missing capability (the underlying IDs are all present as text) | None | None | Read the ID, navigate to that module's list manually | Wire the highest-value 2 (Supplier Invoice→PO/GRN, Payment→AP Invoice) first | No | No | No |
| Project P&L Revenue/Cost drill-down not one continuous click-chain | Low | Same data, one extra screen-hop instead of zero | None | None | Open Document Viewer separately | See §2 POL-15/§15 recommendation | No | No | Design preference, not urgent |
| Technician diagnosis has no independent verification | Medium | Real revenue-leakage/customer-relations risk on disputed/high-value claims specifically | Misclassified warranty-vs-chargeable cost/revenue, only on disputed cases | None (this is a business-process gap, not an authorization gap) | Manager can review after the fact via Service Tickets screen | Implement threshold-based SoD (POL-07) | No | **Yes**, if Appletree's real warranty exposure is material | Yes |
| No formal SLA engine | Low-Medium | No automatic breach detection/escalation today — purely manual | None | None | Manual `dueDate` tracking | Build once real SLA targets exist (POL-08) | No | No, unless customer contracts have real SLA penalties | Yes |
| Warranty/AMC/GRN policies run on documented defaults, not approved Appletree values | Medium | Every number the system produces in these 3 areas is provisional until approved | Real — warranty duration/AMC pricing/GRN tolerance all affect real postings | None | System correctly REJECTS creation without an explicit value (never silently defaults) | Approve real values before go-live | No (system behaves safely either way) | **Yes** | Yes — 3 separate decisions (POL-02/03/04 relate) |
| No dedicated Warehouse role — Purchase self-confirms its own GRN receipts | Medium | Real (if theoretical, never exploited in testing) fraud-control gap | None directly, but a colluding Purchase user could inflate receipt quantities | Real, disclosed SoD gap | None — currently accepted risk | Add a narrow Warehouse/Receiving role (§5 recommendation) | No | Recommend resolving before Production | Yes (POL-09) |
| Company-wide blended project margin not built | Low | Management must open multiple screens rather than see one number | None | None | Project 360 / Customer Profitability per-project | Build only if Management specifically wants it (POL-10) | No | No | Yes |
| PO Gross/Outstanding value not separately shown on Financial 360 | Low | `committed` serves as an adequate proxy today | None | None | Read PO list directly | Add 2 fields (POL-11) | No | No | Yes (low priority) |

**Zero of these gaps block UAT starting.** Two (export payload, technician diagnosis SoD, GRN-receipt SoD) are flagged as recommended to resolve before Production specifically.

---

## 8. Production Blocker Register (§27 — separate from UAT gaps; these are why classification cannot be D)

| Blocker | Status | Notes |
|---|---|---|
| Backup / Recovery | NOT ADDRESSED | This Lab persists to a single local `db.json` with no backup/restore tooling |
| Deployment Architecture | NOT ADDRESSED | Runs as a single local Node process; no discussion of hosting, HTTPS, process supervision |
| Data Migration | NOT ADDRESSED | No path exists from the real production ERP's live data into this Lab's schema |
| Monitoring | NOT ADDRESSED | No uptime/error monitoring, no alerting |
| Security Hardening (beyond application-layer) | PARTIAL | Application-layer RBAC/authentication is real and tested (450/450); infrastructure-layer hardening (TLS, secrets management, network exposure) is out of this Lab's scope entirely |
| Access Management (real user provisioning) | NOT ADDRESSED | 10 seeded test accounts only; no real employee onboarding/offboarding process |
| Tax Configuration | PARTIAL | 3 tax codes (GST18/GST5/GST12) exist and calculate correctly; no confirmation these match Appletree's actual current GST registration/filing setup |
| Accounting Policy Approval | **OPEN — this is what §2's register exists to close** | 5 of 12 register items are accounting-adjacent and unapproved |
| User Training | NOT ADDRESSED | No training material exists beyond this report series itself |
| Operational Support | NOT ADDRESSED | No support/escalation process defined for a live user base |
| Disaster Recovery | NOT ADDRESSED | Follows directly from the missing Backup/Recovery item |

**None of these are code gaps** — they are organizational/operational readiness items entirely outside what a Lab exercise like this can resolve. This is exactly why §27 forbids selecting classification D on the basis of passing tests alone.

---

## 9. SAP Accountant Acceptance Checklist (§21)

Each trace verified working end-to-end this session, using real data from the fresh volume run:

| # | Trace | Verified Path | Result |
|---|---|---|---|
| 1 | Project → Revenue → Invoice → AR → Receipt → Clearing | Financial 360 → Revenue figures → AR Ageing → Open Items → Document Viewer → Clearings | **PASS** — proven in `financial_integration_tests.js` and live in the volume run (AR subledger = AR control, ₹3,37,663.75 = ₹3,37,663.75) |
| 2 | Project → Cost → PO → GRN → Supplier Invoice → AP → Payment → Clearing | Financial 360 (Procurement figures) → PO list → GRN (clickable link) → Supplier Bill → AP Ageing → Payment → Clearing | **PASS** — proven across Phase 7-9 suites, unchanged |
| 3 | Project → Material Issue → Actual Cost | Financial 360 (Manufacturing Material Cost) ← `createMaterialIssue()` postings, unchanged since Phase 7 | **PASS** |
| 4 | Project → Warranty → Service Cost | Financial 360 (After-Sales → Warranty Cost) ← Service Ticket cost breakdown ← Material Issue + Labour postings | **PASS** — real figure confirmed in the volume run: ₹40,550.18 total warranty cost, company-wide, posted-only |
| 5 | Project → Chargeable Service → Invoice → AR | Financial 360 (After-Sales → Chargeable Service Revenue) ← posted Service Invoice ← AR engine | **PASS** — real figure confirmed: ₹3,11,090.31 total chargeable service revenue, posted-only, company-wide |
| 6 | Project → AMC → Invoice → AR | Financial 360 (After-Sales → AMC Revenue) ← posted AMC Billing Invoice ← AR engine | **PASS** — mechanism proven in `financial_integration_tests.js` (₹5,000 posted against a ₹20,000 contract shows correctly as ₹5,000 revenue, not ₹20,000) |

An accountant unfamiliar with the underlying code can perform all 6 traces using only the UI: Project 360 (Financial 360 section) as the entry point for traces 1, 3, 4, 5, 6; Purchase Orders/GRNs/Supplier Bill/AP Ageing screens for trace 2.

---

## 10. Management Acceptance Checklist (§22)

| Question | Where Answered | Drills To |
|---|---|---|
| Revenue? | Project 360 (Revenue section) / Customer Profitability (totals) | Posted customer invoices |
| Cost? | Project 360 (Cost section, Actual) | Material Issue + Labour postings |
| Commitment? | Project 360 (Cost section, Committed) | Open PO value |
| Actual? | Project 360 (Cost section, Actual) | Same source as Cost |
| Collected? | Project 360 (Revenue section, Collected) | AR Ageing / Clearings |
| Outstanding? | Project 360 (Revenue section, Outstanding) / AR Ageing | Open AR items |
| Project Margin? | Project 360 (Profitability — both Core AND Lifecycle, never blended) | `coreProjectPL()` / `projectPL()` |
| Warranty Cost? | Project 360 (After-Sales) / Management Dashboard (company-wide) | Service Visit material/labour |
| Service Revenue? | Project 360 (After-Sales) / Management Dashboard (company-wide) | Posted Service Invoices only |
| AMC Revenue? | Project 360 (After-Sales) / Management Dashboard (company-wide) | Posted AMC Billing Invoices only |
| Customer Profitability? | Customer Profitability screen | Per-project rollup, drills into each project's own Financial 360 |

**Every answer drills to source**, verified live this session. No hard-coded management figures exist anywhere in the codebase (confirmed by inspection during Phase 11, re-confirmed by this phase's read-only review — no new code was written to check).

---

## 11. Full Document Traceability Map (§15 analysis)

**Current state**: every individual hop in the chain `Financial 360 → Source → Accounting Document → Related Document → Clearing` exists and works — proven across every phase's test suite. What does NOT exist is all of them pre-wired as one continuous, single screen's worth of clicks starting from a Financial 360 figure.

**Recommendation**: a **document-flow timeline is the better fit for this Lab's architecture**, not single-click drill-down. Reasoning: this Lab's documents already carry rich cross-references (`sourceType`/`sourceId`, `poId`/`grnId`, `serviceTicketId`/`amcContractId`) — a timeline view (a single screen listing every related document for a given root document, in chronological order, each individually clickable into the Document Viewer) would surface ALL of them at once without requiring a rigid, hard-coded multi-hop click sequence for every possible document-type combination (Warranty's chain has 8 hops; Chargeable Service's has 3 — a single generic multi-hop UI would need one rigid path per document type, while a timeline generalizes). **Not implemented this phase** — this is a design recommendation for a future UI phase, explicitly deferred per §15's own "do not implement yet" instruction.

---

## 12. Accounting Reconciliation (§21 of Phase 11, reconfirmed here per this phase's own regression requirement)

Captured live this session, on a freshly volume-populated database, then reset to clean seed for handoff:

- Total Debit = Total Credit: **₹3,78,213.93 = ₹3,78,213.93** (Trial Balance, exact to the paisa)
- AR Subledger = AR Control: **₹3,37,663.75 = ₹3,37,663.75** — MATCH
- AP Subledger = AP Control: **₹0 = ₹0** — MATCH (no unpaid supplier invoices outstanding in this run)
- Project Actual Cost = authoritative source: confirmed via Financial 360's `actual` figure tracing directly to Material Issue + Labour GL postings, no independent number
- Posted Revenue = Project/AR source: confirmed — `projectPL().revenue` and AR subledger draw from the identical `journalEntries` collection
- Warranty Cost = source transactions: **₹40,550.18**, computed exclusively from posted Material Issue movements + ServiceLabour journal entries
- Service Revenue = posted Service Invoices: **₹3,11,090.31**, zero contribution from drafted/unposted invoices (tested explicitly in Phase 11)
- AMC Revenue = posted AMC Invoices: **₹0** in this particular run (no AMC billing events were posted in this specific volume script's scenario — the mechanism itself is separately proven in `financial_integration_tests.js`)

**No unexplained reconciling item.**

---

## 13. Regression Results

See §0 above — 801/801, unchanged, zero regression, confirmed before any analysis in this report was written.

---

## 14. Recommended Next Steps

1. **CEO reviews the 12-item Master Policy & Decision Register (§2)** and records a real decision, approver, and date against each row — this document's DECISION columns are intentionally blank pending that.
2. Prioritize the 3 items flagged as genuinely Production-relevant ahead of the rest: export payloads (§2 POL-12), technician-diagnosis SoD threshold (POL-07), and the Warehouse/Receiving role split (POL-09) — these are the only UAT-gap-register items marked as recommended-before-Production.
3. Once policy decisions land, implement ONLY the approved ones — this Lab's entire discipline across 12 phases has been "don't invent, ask" and that continues to apply.
4. Separately commission the Production-readiness workstreams in §8 (backup, deployment, migration, monitoring, training, support) — none of these are software-development tasks this Lab can resolve; they need their own owners.
5. If UAT proceeds before all 12 policy items are decided, brief testers explicitly using this report's §7 UAT Gap Register so provisional behavior isn't mistaken for a defect.

---

## 15. Explicit Classification

# **B — UAT READY WITH CONDITIONS**

Not A (the system is genuinely ready for structured user testing — 801/801 tests, a proven accounting engine, a hardened security layer, and full lifecycle coverage from Lead to CAPA to Financial Integration). Not C (UAT has not yet actually been run by real, independent testers against this build — Phase 9's/10's/11's own "accountant acceptance" walkthroughs were performed by the same agent that built the system, explicitly disclosed as a simulation, not independent UAT). Certainly not D — Production readiness requires the 11 organizational items in §8, none of which a code-development phase can satisfy, and §27 explicitly forbids selecting D on passing tests alone.

**Conditions for UAT to proceed cleanly**: brief testers on the UAT Gap Register (§7) and the 12 open policy decisions (§2) so provisional/default behavior is read as known scope, not a defect report.

---

## 16. Stop Condition

Per §28, STOP. No further development phase begins. Waiting for explicit CEO/management review of the Policy & Decision Register before any Phase 13.
