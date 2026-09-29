# ARCH-2026-002 — Wave 4 Acceptance Criteria

**Date:** 2026-09-26. Deliverable per this CR's own §18. Testable acceptance criteria for every IN-SCOPE
item from `ARCH-2026-002-WAVE-4-IMPLEMENTATION-SCOPE.md`. **No requirement enters implementation without
an acceptance test, per this CR's own instruction** — none of these tests have been written or run yet;
this document defines what they must prove once a future CR authorizes the actual implementation.

## Item 1 — Missing audit-log calls (6 functions)

| Category | Criterion |
|---|---|
| Functional | After calling each of the 6 functions, exactly one new `DB.auditLog` entry with the correct `type` (per the Gap Disposition's table) exists, and no pre-existing audit entry is duplicated or altered. |
| Security | No new access path is created — this is a logging-only change; existing role gates are unaffected. |
| RBAC | Confirm the 6 functions' existing role checks are byte-identical before/after. |
| Data Scope | N/A — audit-log visibility already follows the existing `GET /api/audit-log` scope rules, unchanged. |
| SoD | N/A — no SoD rule is touched. |
| Approval | N/A. |
| Audit | This IS the acceptance criterion — verify entry presence, `actor.id`/`role`, object id, and timestamp for each of the 6 functions. |
| Accounting | Confirm zero GL entries are created/altered by this change (pure logging). |
| Inventory | Confirm zero inventory movements are created/altered. |
| Project Cost | Confirm `projectFinancial360()`/`coreProjectPL()` outputs are byte-identical before/after for a fixture exercising all 6 functions. |
| Reporting | Confirm the audit-log viewer surfaces the 6 new entry types correctly. |
| Concurrency | Two near-simultaneous calls to the same function (e.g. two `cancelServiceVisit()` calls) each produce their own audit entry — no entry is lost. |
| Duplicate prevention | N/A — audit logging is intentionally NOT deduplicated (matches the established `erp_059b` "each failure/action is a distinct event" policy). |
| Regression | Full regression battery re-run, zero net new failures. |
| Browser UAT | Not required — no UI change. |

## Item 2 — CAPA source-ID existence validation

| Category | Criterion |
|---|---|
| Functional | `createCAPACase()` with a valid `sourceComplaintId`/`sourceTicketId` (or neither) succeeds exactly as today; with a fabricated ID for either field, the call is rejected with a clear error and NO `DB.capaCases` record is created. |
| Security | Closes a data-integrity gap — a CAPA can no longer silently reference a nonexistent source. |
| RBAC | Unchanged — same actors who could create CAPA cases before still can, for valid inputs. |
| Data Scope | Unchanged. |
| SoD | Unchanged — SOD-11 (effectiveness-checker≠closer) remains independently intact, re-verified by regression. |
| Approval | N/A. |
| Audit | The existing `logAudit()` call on `createCAPACase()` still fires on success; a rejected attempt should itself be audited (durable, via the established `durableFailureAudit` pattern, since this is a rejection reached through `withTransaction()`). |
| Accounting | Unaffected. |
| Inventory | Unaffected. |
| Project Cost | Unaffected. |
| Reporting | Unaffected. |
| Concurrency | Two near-simultaneous `createCAPACase()` calls referencing the same valid source both succeed independently (multiple CAPA cases per source is valid, unlike the duplicate-billing question). |
| Duplicate prevention | N/A — this item does not address duplicate CAPA cases, only source-ID existence. |
| Regression | Full regression battery re-run, zero net new failures — with particular attention to any pre-existing test fixture that (knowingly or not) creates a CAPA case with a fabricated source ID, which would need the same disclosed, non-weakening actor/fixture-substitution fix precedent this engagement has used before (e.g. Wave 2's 4 corrected fixtures). |
| Browser UAT | Confirm the CAPA-creation screen in `client_secure/index.html` surfaces the new rejection error clearly if a stale/deleted source ID is somehow submitted from the UI. |

## Acceptance gate

No POLICY DEPENDENT item (W4-1 through W4-12, minus the 2 above) has acceptance criteria defined here,
because none has a target behavior yet — acceptance criteria cannot meaningfully be written for a
requirement whose shape depends on an undecided policy. Once any POLICY DEPENDENT item is resolved by
management, a follow-up CR must produce its own acceptance criteria before implementation, per this same
discipline.
