# ARCH-2026-002 — Wave 4 Security Baseline

**Date:** 2026-09-23. Wave 4 Phase 0 (Part B) deliverable, per this CR's own §15-§20. **No CRITICAL
vulnerability found — no STOP condition triggered.** All live testing performed against a disposable
isolated server (`server/scripts/start-isolated-test-server.js --app-env test --port 4532`),
`server/db.json` never touched (hash confirmed identical before/after — see the master Phase 0 Audit
document §M/§N).

## 1. Service Material & Inventory

**Trace:** Service Ticket/Visit → `issueServiceMaterial()` (`domain.js:7549`) → `createMaterialIssue()`
(Phase 7 engine, **unmodified**) → `postInventoryMovement()` (the single confirmed inventory-movement
engine, `ARCH-2026-002-WAVE-PLAN.md` §Cross-wave preservation) → `DB.inventoryMovements`.

**Confirmed exactly ONE inventory-movement engine — no Service-specific stock ledger.** `issueServiceMaterial()`
does not write to `DB.inventoryMovements` directly; it delegates entirely, tagging only
`sourceType:'ServiceVisit'`/`sourceId:visitId` (the exact same pass-through parameter Phase 7 already
defined for every other movement source) for later cost-rollup by `serviceTicketCostBreakdown()`. This is
a read-only rollup over an already-correct collection, not a second posting path — matches this
engagement's own established, repeatedly-verified single-writer discipline.

**Warranty material accounting classification, as coded TODAY (not assumed):** warranty material issue
posts to account **5000 (Material Expense/Consumption)** — the SAME account every non-warranty project
material issue uses. It is **company cost** (an ordinary project expense), **not** customer-billable,
**not** separately capitalized, and **is** counted as ordinary inventory consumption (the
`postInventoryMovement()` valuation/costing mechanism is identical regardless of `sourceType`). There is
no separate "Warranty Reserve" or "Warranty Provision" account or GL treatment anywhere in the codebase —
warranty cost is recognized as a plain expense at the moment of issue, rolled up for REPORTING via
`afterSalesFinancials().warrantyMaterialCost` (`:8019-8028`), never given its own balance-sheet treatment.
This is reported as the code's actual current behavior, not assumed policy — whether Appletree wants a
warranty provision/reserve accounting treatment instead is a genuine open policy question (see Decisions).

## 2. Service Labour & Cost

**Recording:** `postServiceLabourCost()` (`:7565`) — thin posting function, requires
`assertCanPostServiceLabourCost(actor)` (route-level authorization gate) plus a positive
`amount` or `hours×rate`.

**Cost rate:** `setServiceLabourRate()`/`getServiceLabourRate()` (`:7877`/`:7891`, POL-06) — a real,
admin-configurable rate card keyed by `technicianLevel|skill|location`, with `normalHourRate`/
`overtimeRate`/`emergencyRate`/`weekendHolidayRate`/`travelRate`/optional `sacCode`. **Not wired into
`postServiceLabourCost()` itself** — the posting function accepts a caller-supplied `rate`/`hours` or flat
`amount` directly; it does not look up `DB.serviceLabourRates` to derive or validate the amount posted. This
is a genuine, disclosed structural gap: the rate card exists as configuration but is not the SOURCE of the
posted amount, only a reference an operator must consult and re-key manually.

**Technician/service visit/project-customer linkage:** `technicianId` is accepted but **not persisted onto
the JE line or the visit record** — `postServiceLabourCost()`'s JE lines carry only `projectId`/`customerId`,
never `technicianId`; the parameter is effectively write-only today (accepted by the function signature,
never stored or read back). This means per-technician labour-cost reporting is not currently derivable
from posted entries — a real, disclosed gap for any future "technician productivity/cost" reporting need.

**Warranty/chargeable classification:** inherited from the visit's `warrantyDecision`/`chargeableDecision`
(set at diagnosis time), never re-derived at labour-posting time — a labour entry posted against a visit
has no independent classification of its own; `afterSalesFinancials()` attributes it based on the VISIT's
ticket classification at aggregation time (`:8019-8028`), so a later reclassification of the ticket would
correctly and automatically reclassify historical labour/material cost on next read (confirmed by code
read — no stale/cached classification is stored per-entry).

**Cost Centre tagging — a real, disclosed gap found this pass:** Wave 3 Phase 0's own audit
(`ARCH-2026-002-WAVE-3-CONTROLLING-AUDIT.md`) found only 2 of ~13 posting paths tag Cost Centre
(`postProductionLabourCost()`→`CC-FACTORY`, `postInstallationLabourCost()`→`CC-INSTALLATION`), re-confirmed
live this pass (`erp_arch_2026_002_wave3_tests.js` [C1] assertions, all PASS). **`postServiceLabourCost()`
is a natural third instance of this exact labour-costing pattern and does NOT tag `costCentreId`** — direct
read of `domain.js:7571-7574` confirms no `costCentreId` field on either JE line. This is a new, real,
narrow finding this pass adds to the pre-existing Wave 3 Controlling-coverage gap register — not a
duplicate/forked engine (it reuses account 5100/1000 identically), simply an un-tagged posting path,
consistent with the already-disclosed W3-7/W3-8 Controlling-expansion decision area.

**Profitability:** `serviceTicketCostBreakdown()` (`:7582`) and `afterSalesFinancials()`/`coreProjectPL()`
(`:8013`/`:8058`) correctly tie Material+Labour cost back to the ticket/project for margin visibility —
confirmed no second cost-calculation engine (`coreProjectPL()` is explicitly built by SUBTRACTING
after-sales amounts back out of `projectPL()`'s own existing, byte-unchanged output, "by construction",
per its own code comment, never two independently-computed numbers that could drift).

## 3. Service Billing

Covered exhaustively in `ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md` rows 8a/8b. Summary for this
document's own required scope:
- **Chargeable service**: discounts/taxes inherited from `draftCustomerInvoice()`'s own existing
  `calcTax()` mechanism, no new tax logic. Approval: full inherited Draft maker-checker-poster chain.
  Invoice linkage: `serviceTicketId` tag on the draft.
  **Duplicate-billing protection: MISSING** — nothing prevents a second `draftServiceInvoice()` call
  against the same already-invoiced ticket; `serviceTicketClosureReadiness()` only checks that AT LEAST ONE
  invoice draft exists, never that exactly one does.
- **Warranty service**: cannot be billed at all — enforced (`:7596`).
- **AMC service**: discounts N/A (contract-value-driven), taxes via `calcTax()` identically. Approval:
  same inherited chain. **Duplicate-billing protection: MISSING** in the same way — nothing prevents
  drafting two AMC billing invoices for the same contract in the same period (only `recognizeAMCRevenue()`,
  a SEPARATE later step, is period-guarded; the billing DRAFT step itself is not).
- **Confirmed: NO direct AR posting from Service anywhere** — both sub-paths route exclusively through
  `createDraft()`/`postJournalEntry()`, the single shared engine; no `account:'1100'` or `AR_ACCOUNT` write
  exists anywhere in the Phase 10 block outside these two functions (confirmed by direct grep of the block).

## 4. CAPA

- **SOD-11 re-verified intact, unmodified**: `checkSoD('SOD-11', {makerId: capa.effectivenessCheckedBy,
  checkerId: actor.id})` present verbatim at `domain.js:7832`, matching `RBAC_SOD_RULES_SEED` entry
  `SOD-11` at `:547`, built by this same engagement's own Wave 2 pass. No code in or near `closeCAPACase()`
  was touched by anything in this Phase 0 (read-only pass).
- **Exactly one CAPA engine** — the After-Sales entry point (`sourceComplaintId`/`sourceTicketId`) and
  Quality Management's own pre-existing entry point both write into the SAME `DB.capaCases` collection
  through the SAME functions; there is no separate "Service CAPA" table or state machine.
- **Origins the current architecture supports vs. would need new authorization for:** `createCAPACase()`
  accepts `sourceComplaintId`/`sourceTicketId` with **no existence check** on either (a disclosed finding —
  see §5 below) — so today ANY caller with `AS_SUPERVISE_ROLES` or scoped-PM authority can create a CAPA
  tagging a nonexistent complaint/ticket ID with zero rejection. Quality-origin and Customer-Complaint-origin
  are both supported today (the latter via `sourceComplaintId`). Service-Ticket-origin is supported today
  (via `sourceTicketId`). A distinct "Site issue" origin (as named in the CR's own list) has **no dedicated
  field** — it would need to be represented via one of the two existing optional source-ID fields (a
  reasonable but currently-undocumented convention) or a new field, which is new scope requiring its own
  authorization, not assumed here.

## 5. Security/SoD audit — pair-by-pair, per this CR's own §19 list

Reused `checkSoD()`/`RBAC_SOD_RULES_SEED` throughout — **no new framework invented.**

| Pair | Classification | Evidence |
|---|---|---|
| Complaint creator vs. closer | **missing-rule** | `changeComplaintStatus()` (`:7415`) has zero identity check; role-tier only |
| Ticket creator vs. resolver/closer | **missing-rule** (role-tier substitutes) | `closeServiceTicket()`/`setTicketClassification()` gated `AS_SUPERVISE_ROLES` only, no `createdBy` comparison |
| Service visit creator vs. approver | **existing-rule, conditional** | POL-07: diagnoser≠approver enforced (inline, `:7921`) ONLY when the diagnosis is above-threshold or disputed; below-threshold has no check at all — a genuine, disclosed, policy-scoped partial coverage, not a false claim of full coverage |
| Warranty decision vs. service execution | **missing-rule** | The same technician records `warrantyDecision` AND performs the work AND (below threshold) completes the visit — no separation |
| Service completion vs. billing | **missing-rule** (workflow-separated, not identity-separated) | `completeServiceVisit()` and `draftServiceInvoice()` are distinct actions by design, but nothing prevents the same actor performing both |
| AMC creation vs. billing | **missing-rule** | `createAMCContract()`/`draftAMCBillingInvoice()` — no identity check |
| CAPA creator vs. closure | **existing-rule (indirect)** | Not directly guarded (creator may become closer if never owner/verifier/effectiveness-checker), but the 3-link owner→verifier→effectiveness-checker→closer chain that IS enforced makes an unbroken solo run structurally very difficult in practice — a partial, evidenced mitigation, not a full guarantee |
| Service material requester vs. issuer | **N/A — not a modeled pair** | No separate request step exists for Service Material (see Transaction Ownership row 12); not comparable to Site Material Requisition's distinct requester/issuer roles |

**Policy-decision-required items** (genuine open questions, not silently resolved either way — carried to
Decisions): should Complaint/Ticket/AMC gain new formal `checkSoD()` rules mirroring the SOD-7..SOD-11
precedent (creator≠closer / creator≠biller), and should below-threshold Service Visit diagnoses gain ANY
identity separation, or is the ₹10,000/disputed threshold itself the intended, sufficient control?

## 6. Data Scope

**Reused the centralized `hasScopeAccess()`/role-tier model throughout — no new scope dimension
invented.** Live-tested this pass against the isolated server (`http://localhost:4532`, seeded fixtures):

- Logged in as `sales1` (`assignedCustomers: ['CUST-1','CUST-2','CUST-3']`).
- `GET /api/customers/CUST-4/after-sales-summary` (a customer NOT assigned to `sales1`) →
  `{"ok":false,"error":"Role \"Sales\" cannot view after-sales summary for CUST-4."}` — **403, correctly
  denied.**
- `GET /api/customers/CUST-1/after-sales-summary` (assigned) → `200`, full summary returned.
- `GET /api/warranties` as `sales1` → returned exactly 1 record, `customerId:'CUST-1'` only — confirmed the
  list endpoint is genuinely filtered server-side, not merely the detail endpoint.

This directly answers the CR's own explicit instruction to "test that service personnel cannot access
another customer's service history via direct URL/API" — **confirmed resistant to direct-API traversal**
for the Customer 360 and Warranty-list endpoints. Not independently re-tested this pass for
Complaint/Ticket/Visit/AMC list endpoints individually (all four use the byte-identical
`hasScopeAccess`/`assignedCustomers` filtering pattern at the same code locations, confirmed by direct
source read — `server.js:1903-1932,2021-2026` — so the mechanism is the same one just live-proven, not a
different one left unverified).

**Export/print:** no dedicated export/print route exists for any After-Sales entity specifically (unlike
Reporting & Analytics' Report Builder, which Section 14's prior pass already audited) — so there is no
additional export-specific bypass surface to test; the same list/detail routes above ARE the only read
surface.

**Branch/site scope:** neither Warranty/Complaint/Ticket/Visit/AMC/CAPA carries a `branchId` or `siteId`
scope field distinct from Project/Customer — confirmed absent by schema inspection (`Service Visit`
carries a free-text `site` string field, not a scoped master-data reference) — consistent with the
original Phase 0's finding that Branch/Warehouse/Cost-Centre/Profit-Centre scope dimensions remain
generally unimplemented outside the 4 real ones (Project/Site/Customer/Branch, and even Branch/Site are
inconsistently wired per `ARCH-2026-001C`).

## Summary

**No CRITICAL vulnerability. No STOP condition.** Findings, by severity:

| Severity | Finding |
|---|---|
| MODERATE | Duplicate-billing protection missing for both Chargeable Service and AMC billing drafts |
| MODERATE | Service Labour Rate Card (POL-06) not wired into the actual posting function — configuration exists but doesn't govern the posted amount |
| LOW-MODERATE | `technicianId` accepted but never persisted — no per-technician cost reporting possible from posted data |
| LOW | Service Labour not Cost-Centre-tagged, unlike its 2 sibling labour-posting functions (extends the pre-existing Wave 3 Controlling-coverage finding) |
| LOW | `createCAPACase()` performs no existence check on `sourceComplaintId`/`sourceTicketId` |
| LOW | Complaint/Ticket/AMC/AMC-Schedule SoD coverage is role-tier-only, no identity checks (uneven vs. CAPA/Service-Visit) |
| LOW | `rejectServiceTicket()`, `startServiceVisit()`, `cancelServiceVisit()`, `recordCAPAAnalysis()`, AMC Schedule create/link — 6 functions missing `logAudit()` calls (same class of finding as the pre-existing, already-disclosed QC-checklist-creation gap from Wave 2) |

None of the above meets this engagement's own established CRITICAL/STOP bar (no unauthenticated access, no
client-side identity override, no second GL/inventory/CAPA/billing engine, no ambiguous transaction
ownership). All are reported per this CR's own Phase-0-only rule — **not fixed.**
