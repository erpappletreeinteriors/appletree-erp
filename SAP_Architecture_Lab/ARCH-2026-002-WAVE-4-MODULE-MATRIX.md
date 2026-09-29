# ARCH-2026-002 — Wave 4 Module Matrix: Service & After-Sales, Reporting & Analytics (deepened)

**Date:** 2026-09-23. Wave 4 Phase 0 (Part B) deliverable, per this CR's own §9. **Audit only — no
application code was written to produce this document.** Every classification below is grounded in a
direct read of `server/domain.js` (Phase 10 — After-Sales block, `domain.js:7301`-`8065`, confirmed at
this line number as of this pass), `server/server.js` (routes `1853`-`2180`), `client_secure/index.html`
(SERVICE & AFTER-SALES module group, lines `272`-`281`/`367`/`413`/`2798`+), and `tests/erp_audit_p0_tests.js`
(the only suite exercising this domain today). Per this CR's own instruction ("do not rely on historical
summaries where current evidence exists"), every item was re-verified against current source, not assumed
from `APPLETREE_SAP_LAB_PHASE10_AFTER_SALES_2026-08-25.md` or any other prior narrative report.

**Headline finding, confirmed:** the CR brief's own warning was correct — Service & After-Sales is **not**
greenfield. A substantial, already-built, already-routed, already-UI'd implementation exists. 8 of 9 named
capabilities are EXISTING; the 9th (Customer 360) is EXISTING as a read aggregation, with one disclosed
scope nuance (see row 1). Zero ABSENT, zero DUPLICATE, zero CONFLICTING functionality found.

## Classification legend
EXISTING = fully implemented, routed, UI'd, authorized, and reachable in the live codebase today.
PARTIAL = implemented but with a real, named, evidenced gap in one of the audited dimensions.
ABSENT = no code implements this capability at all.
BLOCKED = code exists but cannot function correctly without a prior decision/dependency.
DUPLICATE = two independent implementations of the same capability exist.
CONFLICTING = two implementations disagree on outcome for the same input.

## 1. Customer 360

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-cust360` (`index.html:272`), `renderCust360()` (`index.html:2798`+), nav entry under SERVICE & AFTER-SALES (`index.html:367`,`413`). |
| API | EXISTING — `GET /api/customers/:id/after-sales-summary` (`server.js:2102`), `GET /api/after-sales-summary` (company-wide, `server.js:2108`). |
| Domain logic | EXISTING — `customerAfterSalesSummary()` (`domain.js:7986`): read-only composition over `DB.warranties`/`complaints`/`serviceTickets`/`serviceVisits`/`amcContracts`, plus `outstandingAR` via the existing `customerOpenItems()` — explicitly disclosed in its own code comment as "read-only composition, no duplicated customer data" (§4). |
| Persistence | N/A — no new collection; a pure aggregation. |
| Authorization | EXISTING — `customerVisible()` (`server.js:1860`): AS_VIEW_ROLES pass, Sales gated on `assignedCustomers`, ProjectManager gated on whether they hold scope over any project of that customer. |
| Data scope | EXISTING, **live-verified this pass** — `sales1` (assignedCustomers `CUST-1/2/3`) received `403` for `CUST-4`'s summary and `200` for `CUST-1`'s; the warranty list endpoint independently confirmed filtered to only `CUST-1` records for the same actor. |
| SoD / Approval / Audit / Numbering / Accounting / Inventory / Project cost | N/A — this is a pure read rollup, none of these apply directly (it surfaces figures already governed by the underlying transaction types below). |
| Reporting | EXISTING — company-wide `/api/after-sales-summary` feeds the "SERVICE & AFTER-SALES" dashboard stat tiles (`index.html:1301-1332`) and "Customer Profitability" (`custprofit`) screen. |
| Browser behavior | Not live-clicked this pass (no browser tool used — API/route/source-level verification only, disclosed under Security Baseline §Data Scope); UI markup and render function confirmed to exist and to call the correct endpoint by source read. |
| Test coverage | **PARTIAL** — no dedicated assertion exists for `customerAfterSalesSummary()`'s aggregation correctness or for the cross-customer-denial path found live this pass; the live test performed in this Phase 0 (see Security Baseline) is not captured in any committed test file. |
| **Classification** | **EXISTING**, with test-coverage as the only disclosed gap (see Data-Model Gap Register — not a data-model gap, a coverage gap, carried into Decisions/Design). |

## 2. Warranty

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-warranty` (`index.html:274`), `renderWarranty()`/`submitWarranty()`/`voidWarranty2()`/`checkEligibility()` (`index.html:2881`+), explicit on-screen hint that duration is a required, non-defaulted field. |
| API | EXISTING — `POST /api/warranties`, `GET /api/warranties`, `POST /api/warranties/:id/void`, `POST /api/warranties/:id/cancel`, `POST /api/warranties/eligibility` (`server.js:1870-1899`). |
| Domain logic | EXISTING — `createWarranty()` (`domain.js:7331`), `warrantyEffectiveStatus()` (`:7352`, time-computed NOT_STARTED/ACTIVE/EXPIRED, never stored — VOID/CANCELLED are the only stored manual statuses), `voidWarranty()`/`cancelWarranty()` (`:7359`/`:7367`), `warrantyEligibility()` (`:7376`, server-authoritative, never left to the browser). |
| Persistence | EXISTING — `DB.warranties`, seeded in `freshDB()` (Phase 10 collections, `domain.js:971`). |
| Authorization | EXISTING — creation gated by `afterSalesAllowed()`+FinanceManager (`server.js:1878`); void/cancel gated `['Admin','CEO','FinanceManager']` at BOTH route level (defense-in-depth, added per the codebase's own Phase 25 static-scanner finding) and domain level (`domain.js:7362`,`:7370`) — same pattern this engagement's own prior passes have repeatedly found and endorsed elsewhere. |
| Data scope | EXISTING — `GET /api/warranties` filtered by Project scope (PM) / Customer scope (Sales) (`server.js:1872-1873`); live-reconfirmed this pass (see §1 above). |
| SoD | **PARTIAL/MISSING** — no identity separation exists between warranty creator and voider/canceller; role-gating (`Admin/CEO/FinanceManager`) is the only control. Not evidenced as a business-critical gap (voiding a warranty has no direct GL/inventory effect), but genuinely uncovered by `checkSoD()`. |
| Approval | ABSENT by design — no approval workflow for warranty creation; this is a documented, deliberate business-policy stance, not an oversight (durationMonths itself requires explicit input — §5, see Decisions). |
| Audit | EXISTING — `logAudit()` on create/void/cancel (`domain.js:7349`,`:7364`,`:7372`). |
| Numbering | EXISTING — `nextDocNumber('WAR')`, same shared numbering engine as every other document type. |
| Accounting | N/A by design — warranty creation itself has zero GL effect (cost only arises later, at Material/Labour posting on a linked Service Visit). |
| Inventory | N/A directly — see Service Material row 9. |
| Project cost | EXISTING (indirect) — warranty-linked tickets roll into `afterSalesFinancials()`/`coreProjectPL()` (see row 9). |
| Reporting | EXISTING — surfaced via Customer 360 and company-wide after-sales summary. |
| Test coverage | PARTIAL — `erp_audit_p0_tests.js` (`ERP-042`) covers the handoverId-existence guard-clause fix only; no test exercises void/cancel/eligibility, the exclusions-text REQUIRES_REVIEW path, or the effective-status time computation. |
| **Classification** | **EXISTING**, with the durationMonths policy correctly left OPEN (not a gap — a deliberate `BUSINESS POLICY REQUIRED` guard, see Decisions/Process Trace). |

## 3. Complaints

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-complaints` (`index.html:275`), full render/submit/triage/status-change screen. |
| API | EXISTING — `GET/POST /api/complaints`, `POST /api/complaints/:id/triage`, `POST /api/complaints/:id/status` (`server.js:1903-1924`). |
| Domain logic | EXISTING — `createComplaint()` (`domain.js:7396`), `triageComplaint()` (`:7406`, classification is a distinct auditable decision, never assumed as Warranty per its own comment), `changeComplaintStatus()` (`:7415`). |
| Persistence | EXISTING — `DB.complaints`, 9-state lifecycle (`COMPLAINT_STATUSES`, `domain.js:7320`). |
| Authorization | EXISTING — creation: Admin/CEO/Sales or scope-checked PM (`server.js:1911`); triage: `AS_SUPERVISE_ROLES` only (`:1916`, a deliberate supervisory-tier gate); status change: role+PM-scope combination (`:1921`). |
| Data scope | EXISTING — list filtered by Project/Customer scope identically to Warranty. |
| SoD | **MISSING** — no identity check anywhere in the Complaint lifecycle; the same user can create, triage, and close/resolve a complaint end to end. No `checkSoD()` coverage. |
| Approval | ABSENT — no formal approval gate on triage classification or status transitions beyond the supervisory role check. |
| Audit | EXISTING — `logAudit()` on create/triage/status-change (`domain.js:7402`,`7412`,`7420`). |
| Numbering | EXISTING — `nextDocNumber('CMP')`. |
| Accounting/Inventory/Project cost | N/A directly — a Complaint has no direct financial effect; it is the upstream trigger for a Service Ticket. |
| Reporting | EXISTING — `repeatComplaintHistory()` (`domain.js:7978`) is a genuine, read-only repeat-pattern surfacing function, exposed at `GET /api/repeat-complaint-history` (`server.js:2098`). |
| Test coverage | **ABSENT** — no test file references `DB.complaints`, `createComplaint`, `triageComplaint`, or `changeComplaintStatus` at all. |
| **Classification** | **EXISTING**, with a disclosed SoD-coverage gap (creator≠closer not enforced) and zero automated test coverage — both carried to Security Baseline/Decisions. |

## 4. Service Tickets

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-tickets` (`index.html:276`), full lifecycle screen (assign/escalate/classify/close/reject/closure-readiness/cost-breakdown all wired). |
| API | EXISTING — 8 routes (`server.js:1927-1970`): list/create/assign/escalate/classification/close/reject/closure-readiness/cost-breakdown. |
| Domain logic | EXISTING — `createServiceTicket()` (`domain.js:7425`), `assignServiceTicket()` (`:7446`, first-response SLA checkpoint per POL-08), `escalateServiceTicket()` (`:7459`), `setTicketClassification()` (`:7467`, the `TICKET_CLASSIFICATIONS` enum `Warranty/Chargeable/AMC/Courtesy/RequiresInvestigation`, `:7321`), `rejectServiceTicket()` (`:7969`), `closeServiceTicket()` (`:7860`) gated by `serviceTicketClosureReadiness()` (`:7844`, a REAL gate — checks a Completed visit exists with diagnosis+customer acknowledgement, and that a Chargeable ticket has a drafted invoice — not a UI status flip). |
| Persistence | EXISTING — `DB.serviceTickets`, `TICKET_STATUSES` 7-state lifecycle (`:7322`). |
| Authorization | EXISTING — creation via `afterSalesAllowed()` or supervise-tier (`server.js:1935`); assign/escalate via per-ticket `ticketAllowed()` (`:1938`, checks the actual ticket's project against the actor); classification/close/reject restricted to `AS_SUPERVISE_ROLES` (`:1950,1954,1958`). |
| Data scope | EXISTING — list filtered by Project(PM)/Customer(Sales) scope (`:1929-1930`). |
| SoD | **PARTIAL** — creator≠assigner/closer is NOT enforced by identity (only by role tier); a `AS_SUPERVISE_ROLES` user who also happens to have created the ticket can classify, close, or reject it themselves. The one real identity control in this chain is diagnosis-approval (see row 5), which is enforced one level down, on the Service Visit, not the Ticket itself. |
| Approval | EXISTING (conditional) — closure is gated on `serviceTicketClosureReadiness()`, which itself depends on diagnosis-approval having cleared if it was required. |
| Audit | EXISTING — `logAudit()` on create/assign/escalate/classify/close (`domain.js:7443,7456,7464,7472,7868`); `rejectServiceTicket()` has **no** `logAudit()` call — a genuine, small, disclosed omission (mirrors the exact class of finding `ARCH-2026-002-OPEN-DECISIONS.md` item 8 already recorded for `createQCChecklist()` in Wave 2 — a scope-hygiene gap, not a security hole). |
| Numbering | EXISTING — `nextDocNumber('TKT')`. |
| Accounting | EXISTING (conditional) — Chargeable tickets connect to `draftServiceInvoice()` (row 9); Warranty/Courtesy/RequiresInvestigation tickets have zero AR effect by design. |
| Inventory | EXISTING (indirect via linked Visits — row 5). |
| Project cost | EXISTING — rolls into `afterSalesFinancials()`/`serviceTicketCostBreakdown()`. |
| Reporting | EXISTING — SLA status (`ticketSlaStatus()`, row 8) and cost breakdown both exposed. |
| Test coverage | PARTIAL — `ERP-043` (`erp_audit_p0_tests.js`) covers the warrantyId/amcId existence-guard fix only; no test exercises assign/escalate/classify/close/reject, SLA computation, or closure-readiness logic. |
| **Classification** | **EXISTING**, with the disclosed rejectServiceTicket audit-log gap and creator≠closer SoD gap carried to Security Baseline. |

## 5. Service Visits (incl. Diagnosis)

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-visits` (`index.html:277`). |
| API | EXISTING — 6 routes (`server.js:1976-2011`): list/create/start/diagnosis/complete/cancel/material-issue; labour-cost migrated to the generic `registerMutationRoute()` mechanism (per `server.js:2012` comment). |
| Domain logic | EXISTING — `createServiceVisit()` (`domain.js:7477`), `startServiceVisit()` (`:7490`), `recordDiagnosis()` (`:7500` — explicitly forbids a visit being classified BOTH warranty AND chargeable at once, "must not be financially mixed", and explicitly forbids posting anything financial from diagnosis itself — a deliberate separation of fact-recording from money-moving), `completeServiceVisit()` (`:7519`, blocked while `diagnosisApprovalStatus==='PendingApproval'`), `cancelServiceVisit()` (`:7535`). |
| Persistence | EXISTING — `DB.serviceVisits`, `VISIT_STATUSES` 5-state lifecycle (`:7323`). |
| Authorization | EXISTING — creation via `ticketAllowed()` on the parent ticket; start/diagnosis/complete/cancel via per-visit `visitAllowed()` (`server.js:1986`); Service Visits are deliberately **excluded from Sales's view** (unlike Warranty/Complaint/Ticket/AMC), per an explicit code comment (`server.js:1973-1975`, §40) reasoning that internal diagnosis/technician detail is not customer-facing status. |
| Data scope | EXISTING — list filtered by Project scope for PM; a narrower role set than the other After-Sales list endpoints. |
| SoD | **PARTIAL, the one genuinely strong control in this domain** — POL-07 (`domain.js:7900`): a diagnosis whose `estimatedAmount` exceeds the admin-editable `warrantyApprovalThreshold` (currently ₹10,000) OR is flagged `disputed` requires manager approval (`approveDiagnosis()`, `:7915`) before the visit can be completed; the technician who recorded the diagnosis is explicitly blocked from approving their own diagnosis unless CEO/Admin (`:7921`) — an **inline** identity check (`vis.diagnosedBy===actor.id`), not routed through the formal `checkSoD()` engine (a disclosed, deliberate pattern choice — see below). Below-threshold, non-disputed diagnoses have **zero** identity separation — the same technician who diagnoses can complete the visit alone. |
| Approval | EXISTING — POL-07 threshold-based approval, DB-backed and admin-editable via `setPolicyConfig()` (`:7904`). |
| Audit | EXISTING — `logAudit()` on create/diagnosis/complete (`:7487,7516,7532`); `startServiceVisit()`/`cancelServiceVisit()` have **no** `logAudit()` call — a small, disclosed omission of the same class as row 4's `rejectServiceTicket()`. |
| Numbering | EXISTING — `nextDocNumber('VIS')`. |
| Accounting | N/A directly at the Visit level — see Material/Labour (row 9). |
| Inventory | EXISTING — see row 9. |
| Project cost | EXISTING — via `materialIssueIds`/`labourEntryIds` tracked on the visit record itself, rolled up by `serviceTicketCostBreakdown()` (`:7582`). |
| Reporting | EXISTING. |
| Test coverage | **ABSENT** — no test file references `createServiceVisit`, `recordDiagnosis`, `approveDiagnosis`, `completeServiceVisit`, or the POL-07 threshold/disputed-approval logic at all. This is the single largest test-coverage gap in the whole domain, given it is also the one place real financial/SoD judgment is exercised. |
| **Classification** | **EXISTING**, functionally complete and well-controlled at the design level, but with the domain's most significant test-coverage gap. |

## 6. AMC (Contract)

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-amc` (`index.html:278`). |
| API | EXISTING — `GET/POST /api/amc-contracts`, `.../activate`, `.../cancel`, `.../renew` (`server.js:2021-2046`). |
| Domain logic | EXISTING — `createAMCContract()` (`domain.js:7604`, with the historically-significant `_proj.customerId` fix documented in its own comment: an unset project.customerId is correctly treated as absence-of-data, not a mismatch, after a regression was caught against real production data pre-deployment), `activateAMCContract()` (`:7634`), `cancelAMCContract()` (`:7643`, explicitly refuses to auto-post any refund/write-off for the remaining deferred balance — surfaces a `BUSINESS POLICY REQUIRED` disclosure instead, per §18), `renewAMCContract()` (`:7659`, never automatic — creates a new, explicitly linked contract record). |
| Persistence | EXISTING — `DB.amcContracts`, `AMC_STATUSES` (`:7324`). |
| Authorization | EXISTING — creation `['Admin','CEO','FinanceManager','Sales']`; activate/cancel `['Admin','CEO','FinanceManager']`; renew adds Sales back (`server.js:2029,2036,2040,2044`). |
| Data scope | EXISTING — list filtered by Project(PM)/Customer(Sales). |
| SoD | **MISSING** — no identity separation between contract creator and activator/canceller/biller; role-tier gating only. |
| Approval | EXISTING (implicit via role tier) — activation requires an Admin/CEO/FinanceManager role distinct from the broader creation role set (Sales can create a DRAFT AMC but cannot activate it alone). |
| Audit | EXISTING — `logAudit()` on create/activate/cancel/renew. |
| Numbering | EXISTING — `nextDocNumber('AMC')`. |
| Accounting | N/A at contract-creation time — see AMC Billing (row 9), a deliberate separation. |
| Reporting | EXISTING — `amcRevenueSchedule()` (row 9). |
| Test coverage | PARTIAL — `ERP-044`/`ERP-044 fixture`/`ERP-044 regression` (`erp_audit_p0_tests.js`) cover the customer-existence and customer/project-ownership-mismatch guard clauses thoroughly (including the false-positive regression fix), but nothing exercises activate/cancel/renew or the deferred-balance disclosure. |
| **Classification** | **EXISTING**. |

## 7. AMC Schedule

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-amcsched` (`index.html:367/413`). |
| API | EXISTING — `GET/POST /api/amc-schedules`, `.../link-ticket` (`server.js:2047-2058`). |
| Domain logic | EXISTING — `createAMCScheduleEntry()` (`domain.js:7673`, requires an ACTIVE AMC; §21 explicitly notes this is operational-only, no accounting), `linkAMCScheduleToTicket()` (`:7681`). |
| Persistence | EXISTING — `DB.amcSchedules`. |
| Authorization | EXISTING — creation `['Admin','CEO','FinanceManager']`; view AS_VIEW_ROLES+PM; link-ticket via `afterSalesAllowed()`/supervise-tier. |
| SoD | **MISSING** — no identity control on the schedule-to-ticket link. |
| Accounting/Inventory | N/A by design (operational scheduling record only). |
| Test coverage | **ABSENT** — no test references `createAMCScheduleEntry`/`linkAMCScheduleToTicket`. |
| **Classification** | **EXISTING**. |

## 8. Service Billing (Chargeable Service Invoice + AMC Billing Invoice)

**This is the highest-scrutiny item per the Wave Plan's own stated major risk. See
`ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md` §Service Billing for the full, precise finding — summary
below.**

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-svcbilling` (`index.html:367/413`, wired via `svcbilling` tab key). |
| API | EXISTING — `POST /api/service-invoice` (`server.js:2015`), `POST /api/amc-billing-invoice` (`:2059`). |
| Domain logic | EXISTING, **two distinct sub-paths, precisely characterized**: (a) `draftServiceInvoice()` (`domain.js:7593`) calls `draftCustomerInvoice()` **directly and unmodified** — inheriting its full validation set (customer/project consistency, billing-ceiling check, Excess Billing Approval consumption, variation-allocation validation) — blocked outright unless `ticket.classification==='Chargeable'` (Warranty work "must not create customer AR", enforced in code, `:7596`); (b) `draftAMCBillingInvoice()` (`:7699`) calls `createDraft()` **directly** — the same lower-level, shared primitive `draftCustomerInvoice()` itself is built on — because AMC billing needs a different credit line (2100 Deferred Revenue, not 4000 Revenue, per the approved POL-05 deferred-recognition policy) that `draftCustomerInvoice()`'s fixed-shape output doesn't support. AMC billing therefore does **not** inherit the project billing-ceiling/variation-allocation checks (a reasoned, evidenced distinction: AMC billing is contract-value-driven, not project-quotation-ceiling-driven — not assumed, disclosed as a genuine design characteristic). Both paths converge on the identical `Draft→Submit→Approve→Post` lifecycle, the identical AR debit account, and the identical numbering/audit/GL engine — **one billing/AR engine, not two**, confirmed by direct source read, not by re-running the original Phase 0's `ARCH-2026-002-TRANSACTION-OWNERSHIP.md` citation alone. |
| Persistence | EXISTING — both write into the shared `DB.jeDrafts` collection, tagged `serviceTicketId`/`amcContractId` respectively for traceability (the same pattern Phase 7 established for `poId`/`grnId`). |
| Authorization | EXISTING — `can(actor,'create')` (generic draft-creation privilege) at the route, plus the domain-level classification/status gates above. |
| SoD | **MISSING** — no identity separation between the technician/manager who completed the service and the person who drafts the invoice, nor between AMC contract creator and AMC biller. |
| Approval | EXISTING (inherited) — the standard `submitDraft`/`approveDraft`/`postDraft` maker-checker-poster chain applies identically to both (unchanged, unmodified — the exact SAME Draft lifecycle SoD `ARCH-2026-002-WAVE-3-DESIGN.md` §2 already confirmed intact). |
| Audit | EXISTING (inherited from `createDraft()`/`postDraft()`). |
| Numbering | EXISTING — shared `DRAFT-`/GL numbering, same collision-safe `nextId()` mechanism every other draft uses. |
| Accounting | EXISTING — reuses accounts `1100`/AR, `4000` Revenue (Chargeable), `2100` Customer Advance Liability repurposed as Deferred Revenue (AMC, per approved POL-05), `2200` Tax — zero new accounts. |
| Duplicate-billing protection | EXISTING — `serviceTicketClosureReadiness()` requires an invoice draft to exist for Chargeable tickets before closure, but nothing prevents drafting a SECOND service invoice against the same ticket (no idempotency/uniqueness guard on `serviceTicketId` across `DB.jeDrafts`) — a genuine, narrow, disclosed gap, same class as similar findings in prior waves. AMC billing has the same characteristic (nothing blocks two billing events in the same period beyond manual operator discipline — `recognizeAMCRevenue()` itself IS period-guarded, but the BILLING call, `draftAMCBillingInvoice()`, is not). |
| Test coverage | **ABSENT** — no test file exercises `draftServiceInvoice()` or `draftAMCBillingInvoice()` at all. |
| **Classification** | **EXISTING**, confirmed single-engine (no second AR/billing engine — the Wave Plan's major risk is NOT realized), with the AMC-vs-Chargeable sub-path distinction now precisely documented (a refinement of, not a contradiction to, the original Phase 0's finding) and a disclosed duplicate-billing coverage gap. |

## 9. CAPA

| Dimension | Finding |
|---|---|
| UI | EXISTING — `tab-capa` (`index.html:281`). |
| API | EXISTING — 6 routes (`server.js:2067-2094`): list/create/analysis/action/verify/effectiveness/close. |
| Domain logic | EXISTING — `createCAPACase()` (`domain.js:7771`, requires an explicit `trigger` from a closed enum `CAPA_TRIGGERS` — never auto-created for every complaint, per §26), `recordCAPAAnalysis()` (`:7782`), `recordCAPAAction()` (`:7789`), `recordCAPAVerification()` (`:7798`), `recordCAPAEffectivenessCheck()` (`:7810`, §28 — "action done" ≠ "action proven effective", a genuinely separate step), `closeCAPACase()` (`:7820`, requires `effectivenessResult==='Effective'`; a `NotEffective` case cannot be closed). |
| Persistence | EXISTING — `DB.capaCases`, `CAPA_STATUSES` 6-state lifecycle (`:7325`). |
| Authorization | EXISTING — creation `AS_SUPERVISE_ROLES` or scope-checked PM; analysis/action via `capaAllowed()`; verify/effectiveness/close via `AS_SUPERVISE_ROLES` only, deliberately excluding Sales/Purchase/Estimator (internal quality-investigation material, §40). |
| SoD | **EXISTING, the strongest-controlled chain in this whole domain** — three separate identity checks: owner≠verifier (`domain.js:7804`, inline), verifier≠effectiveness-checker (`:7814`, inline), effectiveness-checker≠closer (`:7825-7837`, **the one formal `checkSoD('SOD-11', ...)` call in the entire After-Sales domain**, built by this SAME engagement's own Wave 2 pass and **re-verified intact, unmodified, this pass** — exact match to `RBAC_SOD_RULES_SEED` entry `SOD-11` at `domain.js:547`). The first two checks use the older inline `actor.id===X` pattern rather than the formal engine — a disclosed, deliberate mix (mirrors the exact same disclosed pattern this engagement's own `WAVE2_SOD-RESULTS.md` already documented for the 2 earlier CAPA checks), not an inconsistency introduced by this pass. |
| Approval | EXISTING (via the SoD-gated verification/effectiveness chain itself). |
| Audit | EXISTING — `logAudit()` on create/action/verify/effectiveness/close; `recordCAPAAnalysis()` has **no** `logAudit()` call — a small, disclosed omission, same class as rows 4/5. |
| Numbering | EXISTING — `nextDocNumber('CAPA')`. |
| Origin support | Per the CR's own required question — the current architecture supports origination from `sourceComplaintId`/`sourceTicketId` (Quality/Customer-Complaint/Service-Ticket origins, both optional fields with no existence check performed — see Security Baseline), but has **no** dedicated field or code path for a "Site issue" origin distinct from a Complaint/Ticket, and CAPA creation everywhere in the codebase (both Quality's own pre-existing CAPA usage from Wave 1-2 and this After-Sales usage) remains a manual, deliberate act — never auto-triggered — confirming Wave 2's own prior finding (W2 Quality-to-CAPA "no auto-origination") still holds for the After-Sales entry point too. |
| Test coverage | **ABSENT** — no test file references `createCAPACase`, `recordCAPAAnalysis/Action/Verification/EffectivenessCheck`, or `closeCAPACase` via the After-Sales entry point (Wave 2's own SoD suite tests SOD-11 via the Quality-module CAPA entry point, not this one — the underlying function is identical and shared, so the control is proven, but the After-Sales-specific trigger/origin path itself is untested). |
| **Classification** | **EXISTING**, with SOD-11 re-confirmed intact (the CR's own explicit instruction to re-verify, not re-implement) and zero new CAPA engine — this IS the one, same, single CAPA engine Quality Management already uses. |

## Summary table

| # | Capability | Classification | Key finding |
|---|---|---|---|
| 1 | Customer 360 | EXISTING | Live cross-customer-denial re-confirmed; test-coverage gap only |
| 2 | Warranty | EXISTING | durationMonths correctly left as an open policy question, not defaulted |
| 3 | Complaints | EXISTING | SoD gap (creator≠closer unenforced); zero test coverage |
| 4 | Service Tickets | EXISTING | `rejectServiceTicket()` missing `logAudit()`; SoD gap on creator≠closer |
| 5 | Service Visits | EXISTING | Strongest financial control (POL-07 diagnosis approval); largest test gap |
| 6 | AMC | EXISTING | SoD gap; deferred-balance-on-cancellation correctly NOT auto-posted |
| 7 | AMC Schedule | EXISTING | Operational-only by design, no accounting, correctly so |
| 8 | Service Billing | EXISTING | **Single engine confirmed** — 2 precisely-characterized sub-paths, not 2 engines; duplicate-billing guard gap disclosed |
| 9 | CAPA | EXISTING | SOD-11 re-confirmed intact; same single engine as Quality Management |

**Zero DUPLICATE, zero CONFLICTING, zero fully ABSENT, zero BLOCKED capability found among the 9 named
Wave 4 items.** Every PARTIAL marking above is scoped to a specific, named sub-dimension (SoD coverage,
audit-log completeness, or test coverage) — no capability's CORE function is PARTIAL. This matches, and
extends with more precision, the original Phase 0's own `ARCH-2026-002-TRANSACTION-OWNERSHIP.md`
classification of rows 33-35 and the Service Billing row as EXISTING.
