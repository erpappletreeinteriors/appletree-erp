# ARCH-2026-002 — Wave 4 Final Implementation Scope

**Date:** 2026-09-26. Deliverable per this CR's own §17. Because **zero of 12 management decisions have
been supplied** (see the Questionnaire in `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`), there are
zero "approved" items to fully specify with a committed target behavior. This document provides complete
detail for the 2 items whose target behavior does NOT depend on an undecided policy (IMPLEMENT-recommended,
still not authorized for coding by this or any CR to date), and records every POLICY DEPENDENT item's
candidate target behaviors (per its options) without committing to one, per this CR's own §18.

## IMPLEMENT-recommended items (target behavior does not depend on a policy choice)

### Item 1 — Missing audit-log calls (6 functions)
- **ID:** Gap-6 (unnumbered; not one of W4-1..12, carries no business question).
- **Requirement:** add `logAudit()` calls to `rejectServiceTicket()`, `startServiceVisit()`,
  `cancelServiceVisit()`, `recordCAPAAnalysis()`, `createAMCScheduleEntry()`, `linkAMCScheduleToTicket()`.
- **Current behavior:** these 6 functions execute with no audit-trail entry.
- **Approved target behavior:** N/A — not yet approved by any CR; candidate target behavior is each call
  logging a durable entry per `ARCH-2026-002-W4-GAP-DISPOSITION.md`'s table (event/actor/object/action).
- **Affected module:** Service & After-Sales.
- **Affected transaction:** Ticket rejection, Visit start/cancel, CAPA analysis recording, AMC Schedule
  create/link.
- **Data model:** none.
- **API:** none.
- **UI:** none.
- **RBAC:** unchanged.
- **Data Scope:** unchanged.
- **SoD:** unchanged.
- **Approval:** unchanged.
- **Audit:** this is the entire change.
- **Accounting:** unaffected.
- **Inventory:** unaffected.
- **Project Cost:** unaffected.
- **Reporting:** audit-log completeness improves.
- **Migration:** none.
- **Acceptance tests:** see `ARCH-2026-002-WAVE-4-FINAL-ACCEPTANCE-CRITERIA.md`.
- **Rollback:** remove the 6 added lines.

### Item 2 — CAPA source-ID existence validation
- **ID:** W4-10a.
- **Requirement:** `createCAPACase()` rejects a nonexistent `sourceComplaintId`/`sourceTicketId`.
- **Current behavior:** no existence check; a CAPA case can reference a phantom source ID.
- **Approved target behavior:** N/A — not yet approved; candidate target behavior is existence validation
  mirroring the ERP-042/043/044 precedent already applied elsewhere in this file.
- **Affected module:** Service & After-Sales / Quality (CAPA).
- **Affected transaction:** CAPA case creation.
- **Data model:** none.
- **API:** none (same route, tighter validation).
- **UI:** none.
- **RBAC:** unchanged.
- **Data Scope:** unchanged.
- **SoD:** unchanged — SOD-11 remains independently intact.
- **Approval:** N/A.
- **Audit:** the existing success-path `logAudit()` call is unaffected; a rejected attempt should itself be
  durably audited via the established `durableFailureAudit` pattern (this function is reached through
  `withTransaction()`).
- **Accounting/Inventory/Project Cost:** unaffected.
- **Reporting:** unaffected.
- **Migration:** a pre-flight check of existing `DB.capaCases` for phantom IDs is recommended before
  enabling in enforce mode (standard practice already established in this codebase for this exact class of
  fix) — not a schema migration.
- **Acceptance tests:** see `ARCH-2026-002-WAVE-4-FINAL-ACCEPTANCE-CRITERIA.md`.
- **Rollback:** remove the 2 guard clauses.

## POLICY DEPENDENT items — candidate target behaviors only, none approved

| ID | Requirement | Current behavior | Candidate target behavior(s) | Cannot finalize until |
|---|---|---|---|---|
| W4-1 | Warranty policy | Full manual entry, no default | Per Option A/B/C in the Questionnaire | Management answers W4-1 |
| W4-2 | Classification automation | 100% manual, `warrantyEligibility()` unused automatically | Per Option A/B/C | Management answers W4-2 |
| W4-3 | AMC scheduling automation | 100% manual | Per Option A/B/C | Management answers W4-3 |
| W4-4 | Resolution SLA | Explicitly unconfigured | Per Option A/B/C (requires a numeric hour value if B/C) | Management answers W4-4 (and supplies the number) |
| W4-5 | Rate-card enforcement | Disconnected from posting | Per Option A/B/C | Management answers W4-5 |
| W4-6 | Warranty accounting | Expense-at-issue | Per Option A/B (B requires its own dedicated design pass) | Management answers W4-6 |
| W4-7 | Duplicate-billing rule | Unguarded | Per Option A/B/C | Management answers W4-7 |
| W4-8 | SoD expansion | Role-tier only | Per Option A/B/C | Management answers W4-8 |
| W4-9 | Diagnosis threshold | ₹10,000/disputed only | Per Option A/B/C | Management answers W4-9 |
| W4-10b | "Site issue" CAPA origin | No dedicated field | Per Option A/B/C | Management answers W4-10 part b |
| W4-11a | Technician ID persistence | Accepted, discarded | Per Option A/B | Management answers W4-11 part a |
| W4-11b | Cost Centre tagging | Not tagged | Per Option A/B | Management answers W4-11 part b |
| W4-12 | Site/Branch scope | Free text | Per Option A/B | Management answers W4-12 |

## Scope categories (§18 summary)

| Category | Count | Items |
|---|---|---|
| IMPLEMENT | 2 | Audit-log completeness (Gap-6), CAPA source-ID validation (W4-10a) |
| DEFER | 0 | — |
| POLICY DEPENDENT | 12 (11 whole + W4-10b + W4-11a + W4-11b as sub-items of W4-10/11) | W4-1 through W4-9, W4-10b, W4-11a, W4-11b, W4-12 |
| NO CHANGE | 0 | — |
| NOT APPLICABLE | 0 | — |

**"IMPLEMENT" here is eligible for a future implementation CR. It is NOT automatically authorized for
implementation by this CR** — no code was written to produce this document, and none will be until a
separate CR explicitly authorizes it.
