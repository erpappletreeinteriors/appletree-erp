# ARCH-2026-002 — Wave 4 Data-Model Gap Register

**Date:** 2026-09-23. Wave 4 Phase 0 (Part B) deliverable, per this CR's own §23. Every item below is a
genuinely missing entity/field, evidenced against current code — not speculative. Consistent with prior
waves' registers, none proposes a duplicate engine.

## 1. `technicianId` persistence on Service Labour postings

- **Entity/field:** `technicianId` on the posted JE line (or on the Service Visit's `labourEntryIds`
  cross-reference record).
- **Relationship:** Service Visit → Technician (currently a `DB.users` id, accepted but discarded).
- **Owner:** Service Labour posting (`postServiceLabourCost()`, `domain.js:7565`).
- **Lifecycle:** write-once at posting time.
- **Scope:** would need no new scope dimension — technician is already a `DB.users` record.
- **Accounting:** no GL change — purely a tagging addition, same class as `costCentreId` below.
- **Inventory:** N/A.
- **Project:** already linked via `projectId`.
- **Reporting:** would enable per-technician cost/productivity reporting, currently impossible from
  posted data.
- **Migration risk:** NONE for new records (additive field); NO retrofit possible for historical entries
  (the value was never captured, cannot be reconstructed).

## 2. Cost Centre tag on Service Labour postings

- **Entity/field:** `costCentreId` on `postServiceLabourCost()`'s JE lines.
- **Relationship:** mirrors the 2 existing precedents exactly (`postProductionLabourCost()`→`CC-FACTORY`,
  `postInstallationLabourCost()`→`CC-INSTALLATION`).
- **Owner:** Service Labour posting.
- **Accounting/Reporting:** would extend `generalLedger()`'s existing Cost-Centre filter (already proven
  working, Wave 3 [C1]) to cover Service; zero new engine.
- **Migration risk:** NONE for new records; historical entries would need a value invented (which
  Cost Centre would Service Labour belong to — a genuine open naming/mapping question, not assumed here).

## 3. Service Labour Rate Card → posting linkage

- **Entity/field:** no new entity — `DB.serviceLabourRates` (POL-06) already exists; the gap is that
  `postServiceLabourCost()` does not READ it.
- **Relationship:** Service Visit/technician level+skill+location → `DB.serviceLabourRates` lookup →
  computed amount, instead of the current caller-supplied `rate`/`hours`/`amount`.
- **Owner:** would remain `postServiceLabourCost()`; a lookup addition, not a new function.
- **Accounting:** no account change — same 5100/1000 posting, only the AMOUNT's derivation would change.
- **Migration risk:** NONE — purely additive; existing caller-supplied-amount behavior could remain as a
  fallback/override path if desired (a design choice for whoever authorizes this, not assumed here).

## 4. Duplicate-billing guard for Service Invoice / AMC Billing drafts

- **Entity/field:** either a uniqueness constraint (one OPEN/Posted draft per `serviceTicketId` at a time)
  or a period-key on AMC billing drafts (mirroring `recognizeAMCRevenue()`'s own existing
  `recognizedPeriods` array pattern).
- **Relationship:** Service Ticket → Service Invoice Draft (1:1 intended, currently unenforced, 1:many
  possible); AMC Contract → Billing period → Billing Draft (currently unenforced per-period uniqueness).
- **Owner:** `draftServiceInvoice()`/`draftAMCBillingInvoice()`.
- **Accounting:** would prevent a real double-AR-posting risk if triggered twice by operator error (not
  observed in production, a preventive control gap, not an observed defect).
- **Migration risk:** NONE — a new guard clause on future calls; would not retroactively affect any
  existing posted data.

## 5. AMC Schedule auto-generation at contract frequency

- **Entity/field:** no new entity — `createAMCScheduleEntry()` already exists; the gap is that nothing
  auto-generates entries at `serviceFrequencyMonths` cadence across an AMC's `startDate`-`endDate` span.
- **Relationship:** AMC Contract → N AMC Schedule entries (currently 1 manual call per entry).
- **Owner:** would be a new, small scheduling function, explicitly NOT a new engine — it would call the
  EXISTING `createAMCScheduleEntry()` in a loop, not invent a second scheduling mechanism.
- **Migration risk:** NONE for new contracts; existing ACTIVE contracts with no schedule entries could
  optionally be backfilled, a genuine operational decision, not assumed here.

## 6. `createCAPACase()` source-ID existence validation

- **Entity/field:** no new field — `sourceComplaintId`/`sourceTicketId` already exist; the gap is the
  missing existence check (same class of finding as the ERP-042/043/044 fixes already applied to
  Warranty/Ticket/AMC in this same Phase 10 block, which this specific function was evidently NOT included
  in when those fixes were made).
- **Owner:** `createCAPACase()` (`domain.js:7771`).
- **Migration risk:** NONE — a validation tightening on new calls only; would need a check that no
  existing `DB.capaCases` record already carries a phantom ID before enabling in enforce mode (standard
  practice already established elsewhere in this codebase for this exact class of fix).

## 7. Audit-log completeness (6 functions)

- **Entity/field:** no new entity — `logAudit()` calls, same mechanism used elsewhere in this exact block.
- **Functions:** `rejectServiceTicket()`, `startServiceVisit()`, `cancelServiceVisit()`,
  `recordCAPAAnalysis()`, `createAMCScheduleEntry()`, `linkAMCScheduleToTicket()`.
- **Migration risk:** NONE — purely additive logging, zero behavior change.

## 8. Site/Branch scope dimension for Service Visit

- **Entity/field:** Service Visit currently carries `site` as a free-text string, not a scoped master-data
  reference (unlike Project/Customer, which ARE real, scope-checked references).
- **Relationship:** would need a `siteId`/`branchId` FK if Appletree wants multi-branch service-territory
  scoping distinct from Project/Customer scope.
- **Owner:** would be additive to `createServiceVisit()`.
- **Migration risk:** LOW-MEDIUM — existing free-text `site` values would need either a one-time mapping to
  a new master or would need to coexist (both fields present, old data unmapped) — a genuine, non-trivial
  migration decision, explicitly not designed further here (matches this CR's own discipline of not
  over-designing a possibly-declined feature).

## 9. Warranty Provision/Reserve accounting treatment

- **Entity/field:** would require a new GL account (e.g. a Warranty Provision liability/contra-expense
  account) if Appletree wants warranty cost recognized as a provision at contract/handover time rather than
  expensed at actual material-issue time (the current, confirmed behavior).
- **Owner:** would be a new, dedicated accounting-policy decision and design pass — explicitly NOT
  detailed further here, matching how Wave 3's Petty-Cash-GL-account and Cost-Allocation items were each
  left for their own dedicated pass rather than speculatively designed inside this register.
- **Migration risk:** would be significant if authorized (a change in WHEN warranty cost is recognized,
  not just how it's tagged) — flagged, not characterized further, per this CR's own instruction not to
  invent scope.

**No item above proposes a second GL engine, a second inventory engine, a second CAPA engine, or a second
billing/AR engine.** Every item is either a tagging/validation addition to an EXISTING function, or (items
5 and 9) explicitly deferred to its own dedicated design pass if authorized.
