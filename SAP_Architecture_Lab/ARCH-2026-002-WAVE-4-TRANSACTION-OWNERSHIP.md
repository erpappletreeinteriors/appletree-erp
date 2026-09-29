# ARCH-2026-002 — Wave 4 Transaction Ownership Matrix

**Date:** 2026-09-23. Wave 4 Phase 0 (Part B) deliverable, per this CR's own §10. Every row cites the
exact function/line that authoritatively owns the transaction. **No transaction below has a second
owner.** This document re-verifies and deepens (per this CR's own §"re-verifying and deepening a PRIOR
finding, not starting from zero") the original `ARCH-2026-002-TRANSACTION-OWNERSHIP.md` rows 33-35 and the
"Service Billing" row, all previously classified EXISTING.

| # | Transaction type | Authoritative owner (create) | Authoritative owner (state change) | Customer linkage | Project linkage | Accounting impact | Inventory impact | Service cost | Revenue impact | Audit | SoD | Approval | Scope |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Customer 360 | N/A — read-only | N/A | Direct (`customerId` param) | Indirect (via warranties/tickets) | None | None | None | None | N/A (read) | N/A | N/A | `customerVisible()`, live-verified |
| 2 | Warranty | `createWarranty()` `domain.js:7331` | `voidWarranty()`/`cancelWarranty()` `:7359`/`:7367` | `customerId` FK-checked | `projectId` FK-checked, required | None at creation | None | None | None | `logAudit()` on all 3 | None (role-tier only) | None | Project(PM)/Customer(Sales) |
| 3 | Complaint | `createComplaint()` `:7396` | `triageComplaint()`/`changeComplaintStatus()` `:7406`/`:7415` | `customerId` required | `projectId` optional | None | None | None | None | `logAudit()` on all 3 | **MISSING** (creator can self-triage/close) | Supervisory role-tier only | Project(PM)/Customer(Sales) |
| 4 | Service Ticket | `createServiceTicket()` `:7425` | `assignServiceTicket()`/`escalateServiceTicket()`/`setTicketClassification()`/`closeServiceTicket()`/`rejectServiceTicket()` `:7446/7459/7467/7860/7969` | Inherited from Complaint or direct | Inherited from Complaint or direct | None directly (drives Service Billing, a SEPARATE transaction) | None directly | Sourced via linked Visits | None directly | `logAudit()` on 5 of 6 (reject omits it — disclosed) | **PARTIAL** (creator≠closer not identity-checked; role-tier only) | Closure gated on `serviceTicketClosureReadiness()` | Project(PM)/Customer(Sales) |
| 5 | Service Visit | `createServiceVisit()` `:7477` | `startServiceVisit()`/`recordDiagnosis()`/`completeServiceVisit()`/`cancelServiceVisit()` `:7490/7500/7519/7535` | Inherited from Ticket | Inherited from Ticket | None directly | None directly | Aggregates linked Material+Labour | None directly | `logAudit()` on create/diagnosis/complete only (start/cancel omit it — disclosed) | **EXISTING for high-value/disputed** (POL-07, diagnoser≠approver, inline check `:7921`); **MISSING below threshold** | POL-07 threshold (₹10,000)/disputed gate | Project(PM) only (Sales excluded, §40) |
| 6 | AMC (contract) | `createAMCContract()` `:7604` | `activateAMCContract()`/`cancelAMCContract()`/`renewAMCContract()` `:7634/7643/7659` | `customerId` FK+existence-checked | `projectId` optional, ownership-consistency-checked (ERP-044 fix) | None at creation | None | None | None (contract value ≠ revenue) | `logAudit()` on all 4 | **MISSING** | Role-tier: create broader (incl. Sales), activate/cancel narrower (excl. Sales) | Project(PM)/Customer(Sales) |
| 7 | AMC Schedule | `createAMCScheduleEntry()` `:7673` | `linkAMCScheduleToTicket()` `:7681` | Inherited from AMC | Inherited from AMC | None (operational only, §21) | None | None | None | **No `logAudit()` on either function** — disclosed gap | **MISSING** | Requires AMC status ACTIVE | View: AS_VIEW_ROLES+PM |
| 8a | Chargeable Service Invoice | `draftServiceInvoice()` `:7593` → **delegates fully to `draftCustomerInvoice()`** (`domain.js:3206`, unmodified) | Standard Draft lifecycle (`submitDraft`/`approveDraft`/`postDraft`, unchanged, shared with EVERY other invoice type) | Inherited from Ticket, re-validated by `draftCustomerInvoice()`'s own customer/project consistency check | Inherited from Ticket, ceiling-checked via `projectBillingCeiling()` | Dr AR (1100) / Cr Revenue (4000) / Cr Tax (2200) — **identical accounts to every other customer invoice** | None | Rolled up via `serviceTicketCostBreakdown()` (separate, non-posting) | Yes — full Revenue recognition, immediate | Inherited (`createDraft`→`postJournalEntry`) | **MISSING** (no identity check vs. ticket completer) | Full inherited Draft-lifecycle maker-checker-poster + billing-ceiling/Excess-Billing-Approval gate | Blocked outright unless `classification==='Chargeable'` |
| 8b | AMC Billing Invoice | `draftAMCBillingInvoice()` `:7699` → **calls `createDraft()` directly** (`:2502`), the same shared primitive `draftCustomerInvoice()` itself is built on — **not** `draftCustomerInvoice()` itself | Standard Draft lifecycle (identical to 8a) | `customerId` from AMC | `projectId` required on the AMC | Dr AR (1100) / **Cr Deferred Revenue (2100)**, not 4000 — approved POL-05 deferral policy, reusing the existing Customer-Advance-Liability account | None | N/A | Deferred — recognized separately via `recognizeAMCRevenue()` `:7745` (period-guarded, one recognition per YYYY-MM) | Inherited | **MISSING** (no identity check vs. AMC creator); billing-event uniqueness NOT guarded (see Process Trace) | Full inherited Draft-lifecycle maker-checker-poster; **NOT** subject to the project billing-ceiling/Excess-Billing-Approval gate (a real, disclosed, reasoned distinction — AMC billing is contract-driven, not quotation-ceiling-driven) | Blocked unless AMC status ACTIVE |
| 9 | CAPA | `createCAPACase()` `:7771` | `recordCAPAAnalysis()`/`recordCAPAAction()`/`recordCAPAVerification()`/`recordCAPAEffectivenessCheck()`/`closeCAPACase()` `:7782/7789/7798/7810/7820` | None directly (via `sourceComplaintId`) | None directly (via linked Ticket→Project) | None | None | None | None | `logAudit()` on 5 of 6 (analysis omits it — disclosed) | **EXISTING, strongest in domain**: owner≠verifier, verifier≠effectiveness-checker (inline), effectiveness-checker≠closer (formal `checkSoD('SOD-11')`, re-confirmed intact) | Closure requires `effectivenessResult==='Effective'` | AS_SUPERVISE_ROLES only, no Sales/Purchase/Estimator (§40) |
| 10 | Customer Service (generic label in CR scope list) | Not a distinct transaction type — this label maps to the composite of rows 1-9; no separate entity/collection named `CustomerService` exists in the data model | — | — | — | — | — | — | — | — | — | — | — |
| 11 | Service expense | Not a distinct transaction type — modeled as Service Labour (row 13) + Service Material (row 12); no separate "Service Expense" collection exists | — | — | — | — | — | — | — | — | — | — | — |
| 12 | Service material | `issueServiceMaterial()` `:7549` — delegates fully to `createMaterialIssue()` (Phase 7 engine), **unmodified**, tagged `sourceType:'ServiceVisit'` | N/A (one-shot issue, no state machine) | Inherited from Visit→Ticket | Required (`vis.projectId`, explicitly checked — a visit with no linked project cannot issue material) | Dr Material Expense (5000, same account every other issue uses) | **The single confirmed inventory-movement engine** (`postInventoryMovement()`, unchanged) — no new writer | Yes, rolled into `serviceTicketCostBreakdown()`/`afterSalesFinancials()` | None (cost only) | Inherited from `createMaterialIssue()` | N/A — no separate requisition step exists (technician issues directly; not comparable to Site Material Requisition's requester≠issuer model) | `withTransaction()`-wrapped (Phase 43 fix) | `visitAllowed()` or `PROC_CREATE_ROLES` |
| 13 | Service labour | `postServiceLabourCost()` `:7565` — thin posting function, same shape as `postProductionLabourCost()`/`postInstallationLabourCost()` | N/A (one-shot posting) | Inherited | Required | Dr Labour Cost (5100) / Cr Bank (1000) — same accounts Production/Installation labour use, tagged `docCategory:'ServiceLabour'` for reporting separation only | None | Yes | None | `logAudit()` present | None | `assertCanPostServiceLabourCost()` (route+domain gate) | — |
| 14 | Replacement material | Not a distinct transaction type — Warranty-classified Service Material issue (row 12) IS the replacement-material mechanism; no separate collection | — | — | — | — | — | — | — | — | — | — | — |
| 15 | Warranty claim | Not a distinct transaction type — modeled as the composite Complaint→Ticket(Warranty classification)→Visit(warrantyDecision) chain; `warrantyEligibility()` (`:7376`) is the one dedicated read-only decision function, invoked wherever a claim needs adjudicating | — | — | — | — | — | — | — | — | — | — | — |
| 16 | Chargeable service | Not a distinct transaction type — modeled as the composite Ticket(Chargeable classification)→Visit(chargeableDecision)→Service Invoice (row 8a) chain | — | — | — | — | — | — | — | — | — | — | — |
| 17 | Service invoice | See rows 8a/8b — this label is the CR's generic name for the composite of both sub-paths | — | — | — | — | — | — | — | — | — | — | — |

## Findings

1. **No transaction acquired a second authoritative owner.** Every row above resolves to exactly one
   creating function and one (or a small, named set of) state-transition functions, all inside the Phase
   10 block or a directly-cited pre-existing engine (`createMaterialIssue()`, `postJournalEntry()` via
   `createDraft()`).
2. **Service Billing is confirmed a single engine, precisely characterized as two sub-paths (8a/8b), not
   two engines.** This refines, rather than contradicts, the original Phase 0's
   `ARCH-2026-002-TRANSACTION-OWNERSHIP.md` row 45 ("Service Billing... does not post independently") and
   the Wave Plan's own major-risk framing ("must keep routing through the single `draftCustomerInvoice()`,
   never a second billing engine"). The literal claim that AMC billing routes through
   `draftCustomerInvoice()` specifically does **not** hold on direct code read — it routes through
   `createDraft()`, the shared primitive one level below `draftCustomerInvoice()` in the same call chain,
   for a reasoned, evidenced cause (a different credit account for deferred-revenue accounting).
   Per this CR's own §2 instruction, this is reported as a precision correction, not silently resolved in
   either direction: the SUBSTANCE of the major risk (no second AR/billing engine) is confirmed true; the
   LITERAL wording ("through `draftCustomerInvoice()`") is inaccurate for the AMC sub-path specifically.
3. **Five named rows in the CR's own §10 list (Customer Service, service expense, replacement material,
   warranty claim, chargeable service, service invoice) are not distinct transaction types in the data
   model** — each is a composite label over rows already covered above. This is disclosed explicitly
   rather than fabricating a phantom "owner" for a non-existent entity.
4. **SoD coverage is uneven and asymmetric across the domain**, ranging from CAPA (strongest — 3 chained
   identity checks, one formal) through Service Visit (strong but threshold-gated) to Complaint/Ticket/AMC/
   AMC Schedule (role-tier only, no identity check at all). This unevenness is itself the primary Security
   Baseline finding (see companion document) — not a transaction-ownership ambiguity (every transaction
   still has exactly one owner; the gap is in WHO WITHIN a role tier may act, not WHICH function owns the
   transaction).
5. **Service material has no separate requester role** — unlike Site Material Requisition (which the
   codebase models as a distinct requester→issuer pair), Service Material issue is a single-step action by
   whoever holds visit access. This is a genuine structural difference, not a control gap per se (see
   Security Baseline for the SoD-pair-by-pair classification the CR's own §15-20 requires).
