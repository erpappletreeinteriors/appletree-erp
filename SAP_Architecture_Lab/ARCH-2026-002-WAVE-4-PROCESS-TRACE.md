# ARCH-2026-002 — Wave 4 Process Trace

**Date:** 2026-09-23. Wave 4 Phase 0 (Part B) deliverable, per this CR's own §11-§14. Re-verifies and
deepens the original `ARCH-2026-002-PROCESS-TRACE.md` chain L ("Service-to-Cash", classified WORKING) with
full code citations, and adds 3 new traces (Warranty, AMC, Complaint/Ticket control) the original Phase 0
did not separately trace.

## (a) Service-to-Cash

**Chain:** Customer → Complaint/Ticket → Service Visit → Labour/Material → Warranty-or-Chargeable →
Completion → Service Billing → Customer Invoice → Customer Receipt → Bank Reconciliation.

`createComplaint()` (`domain.js:7396`, optional entry point) →
`createServiceTicket()` (`:7425`, either from a Complaint or directly) →
`createServiceVisit()` (`:7477`) → `startServiceVisit()` (`:7490`) →
`recordDiagnosis()` (`:7500`, sets `warrantyDecision`/`chargeableDecision`, mutually exclusive,
enforced — `:7504-7506`) → `issueServiceMaterial()`/`postServiceLabourCost()` (`:7549`/`:7565`) →
`completeServiceVisit()` (`:7519`, **blocked** while `diagnosisApprovalStatus==='PendingApproval'`,
`:7526`) → `setTicketClassification()` (`:7467`, separate, deliberate act — the ticket's OWN
classification, distinct from the visit's warranty/chargeable decision, must be explicitly set to
`Chargeable` before billing) → `draftServiceInvoice()` (`:7593`, blocked unless `classification==='Chargeable'`,
`:7596`) → `draftCustomerInvoice()` (`:3206`, unmodified) → standard `submitDraft`/`approveDraft`/`postDraft`
lifecycle → the resulting posted entry is an ordinary AR-account (1100) journal entry, so it flows into
the **existing, unmodified** `customerOpenItems()`/AR-ageing/`postCustomerReceipt()`/`applyClearing()`
chain exactly like any other customer invoice → `bankReconciliationStatus()` (the Wave-1-consolidated
single engine, re-confirmed intact by Wave 3, re-confirmed again here by direct source read — no new
Bank Reconciliation code was touched or needed for Service).

**Verification performed this pass:** direct source read of every function above end to end; live
`erp_audit_p0_tests.js` run (fresh isolated server, `http://localhost:4532`) — 65/65 PASS, including the
3 Chargeable-Service-adjacent guard-clause fixes (ERP-042/043/044); confirmed no code path exists anywhere
in `domain.js` that posts a customer-facing AR entry for Service outside `draftCustomerInvoice()`/
`createDraft()` (`grep` for `account:.*1100` and `AR_ACCOUNT` across the After-Sales block returns only
the two Service Billing functions, both already covered in the Transaction Ownership matrix).

**Verdict: WORKING.** Confirms the original Phase 0's chain L classification. One refinement over the
original citation: AMC Billing's route is through `createDraft()`, not `draftCustomerInvoice()` itself —
see `ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md` finding 2 for the full, precise characterization. This
refinement does **not** change the WORKING verdict — both sub-paths still converge on exactly one AR/GL
engine, zero second billing/AR engine exists. One soft dependency, also already true in the original
trace: a warranty-classified ticket is correctly blocked from billing ("Warranty work must not create
customer AR", `domain.js:7596`) and requires a separate, manual `setTicketClassification()` call — a real,
disclosed manual step, not a broken link (an operator must deliberately mark a ticket Chargeable; nothing
does this automatically, which is itself a policy-correct design, not a gap).

## (b) Warranty trace

**Chain:** Customer → Product/Project → Warranty → Complaint/Ticket → Diagnosis → Service Visit →
Material/Labour → Warranty Decision → Closure.

`createWarranty()` (`:7331`, requires `customerId`+`projectId` both FK-checked, and explicitly **rejects**
creation if `durationMonths` is not supplied — see Decisions) → `warrantyEffectiveStatus()` (`:7352`,
computed on demand, never stored, from `startDate`/`endDate`/`manualStatus`) → a Complaint/Ticket
referencing `warrantyId` (existence-checked since the ERP-043 fix, `:7433`) → `recordDiagnosis()`'s
`warrantyDecision` flag (`:7500`) → `issueServiceMaterial()`/`postServiceLabourCost()` tagged to the visit
→ `warrantyEligibility()` (`:7376`) is the dedicated, server-authoritative adjudication function, called
independently of the ticket flow (its own route, `POST /api/warranties/eligibility`, `server.js:1897`) —
returns `ELIGIBLE`/`NOT_ELIGIBLE`/`REQUIRES_REVIEW`, the last for any exclusions-text match, deliberately
routed to human review rather than an automated deny/approve (`:7389-7391`) → closure via
`closeServiceTicket()`'s `serviceTicketClosureReadiness()` gate.

**What the code actually implements TODAY, as-is (not assumed):**
- **Duration**: never defaulted — `createWarranty()` returns an explicit `BUSINESS POLICY REQUIRED` error
  if `durationMonths` is omitted or `<=0` (`:7334`). No 1-year/2-year default exists anywhere.
- **Coverage/exclusions/terms**: free-text fields (`coverage`, `exclusions`, `terms`), operator-entered,
  never templated or validated against a master list.
- **Approval**: none on warranty creation itself. The one approval gate in the whole warranty chain is
  POL-07's diagnosis-approval threshold (₹10,000/disputed) at the Service Visit level, not at warranty
  creation or claim-adjudication.
- **Service cost**: warranty-classified visits' material+labour cost rolls into
  `afterSalesFinancials().warrantyCost` (`:8048`), a real, posted-transaction-sourced number (never a
  manually-typed figure).
- **Inventory impact**: warranty material issue reuses `createMaterialIssue()` unmodified, posting to
  account 5000 exactly like any other project material issue — cost, not a customer-billable movement.
- **Billing impact**: explicitly, deliberately zero — `draftServiceInvoice()` refuses to bill a
  Warranty-classified ticket.
- **Exclusions parsing**: explicitly NOT auto-parsed — free-form text matched only for a REQUIRES_REVIEW
  routing signal, never for an auto-deny (`:7387-7391`, the code's own comment explains why: "cannot be
  reliably auto-parsed").

**Genuinely undocumented-in-code policy question (recorded, not invented):** Appletree's actual standard
warranty duration/coverage/exclusion templates by product/project-type are not present anywhere in this
codebase — every warranty requires per-record manual entry. This is not a code defect; it is the exact
`BUSINESS POLICY REQUIRED` guard the code itself raises, carried into
`ARCH-2026-002-WAVE-4-DECISIONS.md`.

**Verdict: WORKING**, with the duration/coverage/exclusion **policy** (not the mechanism) explicitly and
correctly left to a human decision at every single record, per the code's own disclosed design intent.

## (c) AMC trace

**Chain:** AMC → AMC Schedule → Service Visit → Service Completion → AMC Billing.

`createAMCContract()` (`:7604`, contract value and service frequency both REQUIRED, no default price —
`:7625-7626`) → `activateAMCContract()` (`:7634`) → `createAMCScheduleEntry()` (`:7673`, requires ACTIVE
status) → `linkAMCScheduleToTicket()` (`:7681`, connects a planned schedule entry to a real Service
Ticket) → the ticket then flows through the SAME Service Visit/Diagnosis/Completion chain as any other
ticket (no separate AMC-specific visit mechanism — confirmed by direct read, a genuine single-mechanism
reuse, not a second visit engine) → `draftAMCBillingInvoice()` (`:7699`, requires ACTIVE status, credits
Deferred Revenue 2100 per approved POL-05) → `recognizeAMCRevenue()` (`:7745`, period-guarded — "Period
${period} has already been recognized... no double recognition", `:7751` — capped so recognized amount
never exceeds billed/contract value, final period absorbs rounding).

**Contract lifecycle/renewal:** `renewAMCContract()` (`:7659`) is never automatic — creates a genuinely
new, explicitly cross-linked contract record (`renewedIntoId`/`renewedFromId`), old contract moves to
`RENEWED` status. `cancelAMCContract()` (`:7643`) explicitly refuses to auto-post any refund/write-off for
the remaining deferred balance — surfaces `BUSINESS POLICY REQUIRED` disclosure instead of inventing an
accounting entry (`:7650-7656`), the SAME discipline the codebase applies to warranty duration.

**Scheduling/visit frequency:** `serviceFrequencyMonths` is a required, operator-supplied field — no
default cadence. `createAMCScheduleEntry()` itself does not auto-generate future entries at that cadence;
each schedule entry is created manually, one at a time. This is a genuine, narrow, disclosed
finding — see Decisions/Gap Register (not fabricated as ABSENT since scheduling entries DO exist and DO
work; the gap is the lack of auto-generation at the stated frequency, a convenience feature, not a missing
capability).

**Billing/revenue linkage:** confirmed 4 genuinely distinct numbers, never conflated
(`amcRevenueSchedule()`, `:7732`): Contract Value, Billed (`amcBilledTotal()`, `:7722`), Recognized
(`amcRecognizedTotal()`, `:7726`), Deferred Balance. All three money functions are ledger-sourced —
recomputed from actual posted entries every call, never a cached/typed total, and correctly skip reversed
entries (a real defect class this codebase's own Phase 16 §13 already found and fixed twice, both instances
re-confirmed present and correct this pass by direct read).

**Customer scope/audit/revenue linkage:** identical scope model to every other After-Sales entity (Project
PM / Customer Sales); `logAudit()` present on contract create/activate/cancel/renew; **absent** on AMC
Schedule create/link (disclosed above in Transaction Ownership).

**No second billing engine**: confirmed — see Transaction Ownership finding 2. AMC billing converges on the
same `createDraft()`→GL chain as every other invoice type.

**Verdict: WORKING**, with one disclosed convenience gap (no auto-generation of recurring schedule
entries at the contract's own stated frequency — a genuine, narrow ABSENT sub-feature, not a broken
chain).

## (d) Complaint/Ticket control trace

**Chain:** Complaint → Ticket → Assignment → Visit → Resolution → Closure.

`createComplaint()` (`:7396`, any of Admin/CEO/Sales, or a scope-checked PM) → `triageComplaint()`
(`:7406`, `AS_SUPERVISE_ROLES` only — Admin/CEO/FinanceManager — a deliberate supervisory tier, narrower
than who may create) → `createServiceTicket()` (`:7425`, from the complaint or directly) →
`assignServiceTicket()` (`:7446`, sets `firstRespondedAt` on FIRST assignment only, the POL-08 SLA
checkpoint) → `createServiceVisit()`/lifecycle → `closeServiceTicket()` (`:7860`, gated by
`serviceTicketClosureReadiness()`, `:7844`).

**Who can create/assign/resolve/close, precisely, per current code:**
- **Create** (Complaint): Admin/CEO/Sales, or PM scoped to the project (`server.js:1911`).
- **Create** (Ticket): `afterSalesAllowed()` (Admin/CEO, or scoped PM) OR `AS_SUPERVISE_ROLES`
  (`:1935`).
- **Assign/Escalate**: `ticketAllowed()` — resolves the actual ticket's project and checks
  `afterSalesAllowed()` against it, OR supervisory tier (`:1938-1947`).
- **Classify/Close/Reject**: `AS_SUPERVISE_ROLES` only (Admin/CEO/FinanceManager) — narrower than who may
  create or assign (`:1950,1954,1958`).
- **Can the creator close their own ticket?** **Yes, if they also hold an `AS_SUPERVISE_ROLES` role**
  (Admin/CEO/FinanceManager can both create and close the same ticket; no identity check prevents it).
  A `Sales`/`ProjectManager` creator CANNOT self-close (they lack the supervisory role entirely, a role-tier
  block, not an identity block) — this is the same "role-tier substitutes for identity-SoD" pattern found
  throughout this domain (see Security Baseline).
- **Escalation**: `escalateServiceTicket()` (`:7459`) appends to an `escalations[]` array with
  `escalateTo`/`reason`/actor/timestamp — a real, auditable record, but purely additive; nothing routes,
  notifies, or auto-reassigns based on an escalation (a workflow-automation gap, not a data-model gap).
- **SLA**: `ticketSlaStatus()` (`:7954`, POL-08) computes two independent, server-only clocks — Response
  (4h, approved) and Site Visit (72h, approved) — both purely derived from `tkt.createdAt`/event
  timestamps, **structurally impossible** to set/override via any API (no endpoint accepts a caller-supplied
  SLA due date or status, per the code's own explicit design comment `:7930-7938`). A third, Resolution
  SLA, is explicitly NOT configured (`resolution: {configured:false, status:'RESOLUTION SLA — NOT
  CONFIGURED'}`, `:7966`) — disclosed as an open policy item, not silently invented.
- **Audit**: present on create/triage/status-change/assign/escalate/classify/close; **absent** on
  `rejectServiceTicket()` (disclosed, Transaction Ownership row 4).

**Verdict: WORKING**, with the self-close-if-supervisory-role characteristic and the Resolution-SLA
non-configuration both explicitly disclosed as real, current, evidenced facts about the code — not gaps
in this trace's own completeness.

## Summary

| Chain | Verdict |
|---|---|
| (a) Service-to-Cash | WORKING (re-confirms and refines original chain L) |
| (b) Warranty | WORKING (duration/coverage policy correctly left open, not a code gap) |
| (c) AMC | WORKING (one disclosed convenience gap: no auto-recurring schedule generation) |
| (d) Complaint/Ticket control | WORKING (role-tier-based closure control; Resolution SLA disclosed unconfigured) |

**Zero chains classified PARTIAL, BROKEN, ABSENT, or DEFERRED.** This is a materially stronger result than
Wave 2 Phase 0's own trace (which found 2 of 6 chains PARTIAL) — consistent with Service & After-Sales
being a later, more mature build phase (Phase 10-13) than several Wave 2 domains, and consistent with the
CR brief's own warning that this is not greenfield work.
