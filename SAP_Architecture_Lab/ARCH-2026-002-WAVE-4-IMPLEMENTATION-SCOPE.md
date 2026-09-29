# ARCH-2026-002 — Wave 4 Implementation Scope

**Date:** 2026-09-26. Deliverable per this CR's own §15, produced after `ARCH-2026-002-W4-GAP-
DISPOSITION.md`. **No implementation code was written to produce this document.**

## Classification (IN SCOPE / DEFERRED / POLICY DEPENDENT / NO CHANGE / NOT APPLICABLE)

### IN SCOPE (recommended for the next authorized implementation CR)

#### 1. Missing audit-log calls (6 functions)
- **Requirement:** add `logAudit()` calls to `rejectServiceTicket()`, `startServiceVisit()`,
  `cancelServiceVisit()`, `recordCAPAAnalysis()`, `createAMCScheduleEntry()`, `linkAMCScheduleToTicket()`.
- **Current behavior:** these 6 state-change functions execute without an audit trail entry.
- **Target behavior:** each call logs a durable audit entry with the fields specified in
  `ARCH-2026-002-W4-GAP-DISPOSITION.md` GAP 6's table.
- **Files/modules likely affected:** `server/domain.js` only (6 one-line additions inside existing
  functions).
- **Data-model change:** none — reuses the existing `DB.auditLog` array and `logAudit()` function.
- **API change:** none.
- **UI change:** none (audit log already has a viewer; new entries simply appear in it).
- **Authorization:** unchanged.
- **SoD:** unchanged.
- **Approval:** unchanged.
- **Audit:** this IS the change.
- **Accounting:** unaffected.
- **Inventory:** unaffected.
- **Project cost:** unaffected.
- **Reporting:** audit-log completeness reporting improves; no other report affected.
- **Migration:** none.
- **Test requirements:** one positive assertion per function confirming a new `DB.auditLog` entry with the
  correct `type`/`actor`/`object` appears after the call.
- **Rollback requirement:** remove the 6 added lines — trivial, no data-shape change.

#### 2. CAPA source-ID existence validation
- **Requirement:** `createCAPACase()` rejects a `sourceComplaintId`/`sourceTicketId` that does not exist,
  mirroring the ERP-042/043/044 pattern already applied to Warranty/Ticket/AMC in this same file.
- **Current behavior:** no existence check — a CAPA case can be created referencing a nonexistent
  complaint/ticket ID with zero rejection.
- **Target behavior:** if either ID is supplied and does not resolve to a real record, the call is
  rejected with a clear error (existing IDs remain valid; omitting both fields remains valid, matching the
  ERP-042/043/044 precedent's own "existence required only when supplied" rule).
- **Files/modules likely affected:** `server/domain.js` (`createCAPACase()`, one guard clause each for the
  two optional fields).
- **Data-model change:** none.
- **API change:** none (same route, tighter validation).
- **UI change:** none.
- **Authorization/SoD/Approval:** unchanged.
- **Audit:** unaffected (an existing `logAudit()` call already exists on this function per the Transaction
  Ownership matrix; no new call needed here).
- **Accounting/Inventory/Project cost:** unaffected.
- **Reporting:** unaffected.
- **Migration:** should include a one-time check that no EXISTING `DB.capaCases` record already carries a
  phantom ID before enabling in enforce mode — standard practice already established elsewhere in this
  codebase for this exact class of fix (not a schema migration, a pre-flight data-integrity check).
- **Test requirements:** a positive case (valid IDs succeed), a negative case (a fabricated ID is
  rejected), an omitted-both-fields case (still valid).
- **Rollback requirement:** remove the 2 guard clauses — trivial.

### POLICY DEPENDENT (cannot be scoped to IN SCOPE until management decides)

All items in `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md` except the 2 above: W4-1 (Warranty
policy), W4-2 (classification automation), W4-3 (AMC scheduling automation), W4-4 (Resolution SLA), W4-5
(rate-card enforcement), W4-6 (Warranty accounting treatment), W4-7 (duplicate-billing rule), W4-8 (SoD
expansion), W4-9 (diagnosis-threshold identity control), W4-10 part b ("Site issue" origin), W4-11
(technician persistence + Cost Centre tagging), W4-12 (Site/Branch scope). None may proceed until its
corresponding management decision is recorded.

### DEFERRED

None — every finding in the Gap Disposition is either IN SCOPE or POLICY DEPENDENT; nothing was found
worth flagging yet explicitly postponing beyond "awaiting a decision."

### NO CHANGE

None — every audited item that was working correctly (all 9 Module Matrix capabilities, all 4 Process
Trace chains, the single-engine architecture across GL/AR/Inventory/CAPA) is preserved as EXISTING, not
listed here as a "no change" disposition item, because "NO CHANGE" in this document's sense means "an
audit finding was reviewed and explicitly found to warrant no action" — no such finding exists; every
finding in the Gap Register/Security Baseline is a real, evidenced gap, not a false positive.

### NOT APPLICABLE

None.

## Summary

**2 items IN SCOPE for a future implementation CR (zero business-policy content, ready-to-implement
specification already provided in the Gap Disposition). 10 items POLICY DEPENDENT, each with a full
management-ready decision record already produced.** This CR itself authorizes neither — implementation of
even the 2 IN SCOPE items requires a separate authorization CR, per this CR's own §4/§24/§28.
