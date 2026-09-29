# ARCH-2026-002 — Wave 4 Final Acceptance Criteria

**Date:** 2026-09-26. Deliverable per this CR's own §20 — updates `ARCH-2026-002-WAVE-4-ACCEPTANCE-
CRITERIA.md` to the fuller required checklist (Functional / RBAC / Data Scope / SoD where applicable /
Approval where applicable / Audit / Accounting where applicable / Inventory where applicable / Project
Cost where applicable / Reporting / Negative / Concurrency where applicable / Duplicate-prevention where
applicable / Browser UAT) for the 2 IMPLEMENT items. No vague criteria — every row is a concrete, checkable
assertion.

## Item 1 — Missing audit-log calls (6 functions)

| Category | Criterion |
|---|---|
| Functional | Each of the 6 functions produces exactly one new `DB.auditLog` entry with the correct `type` per `ARCH-2026-002-W4-GAP-DISPOSITION.md`'s table, correct `actor.id`/`role`, correct object id, and a timestamp within the call's own execution window. |
| RBAC | The 6 functions' existing role checks are confirmed byte-identical before/after (diff the guard clauses). |
| Data Scope | N/A — audit-log visibility is unaffected; new entries follow the existing `GET /api/audit-log` scope rule unchanged. |
| SoD | N/A — no SoD rule is touched by this item. |
| Approval | N/A — none of the 6 functions is part of an approval chain. |
| Audit | This is the acceptance criterion itself — verified above under Functional. |
| Accounting | Confirm zero GL entries are created/altered by any of the 6 calls, before and after this change. |
| Inventory | Confirm zero inventory movements are created/altered. |
| Project Cost | Confirm `projectFinancial360()`/`coreProjectPL()` output is byte-identical for a fixture exercising all 6 functions, before vs. after. |
| Reporting | Confirm the audit-log viewer in `client_secure/index.html` correctly displays each of the 6 new entry types with readable labels. |
| Negative | Calling each function with an already-invalid input (e.g. a nonexistent ticket ID) still fails exactly as before — this change adds logging on the SUCCESS path only, so failure-path behavior must be provably unchanged. |
| Concurrency | Two near-simultaneous calls to the same function (e.g. two `cancelServiceVisit()` calls on different visits) each produce their own correct, non-conflated audit entry. |
| Duplicate prevention | N/A — audit entries are intentionally not deduplicated (matches the established, already-tested `erp_059b` "each event is distinct" policy). |
| Browser UAT | Perform each of the 6 actions once through the UI and confirm the resulting audit entry appears correctly in the Audit Log screen. |

## Item 2 — CAPA source-ID existence validation

| Category | Criterion |
|---|---|
| Functional | `createCAPACase()` succeeds unchanged for a valid `sourceComplaintId`/`sourceTicketId`/neither; is REJECTED for a fabricated ID in either field, with a clear error, and creates NO `DB.capaCases` record on rejection. |
| RBAC | Same actor set that could create CAPA cases before still can, for valid inputs — unchanged. |
| Data Scope | Unchanged. |
| SoD | SOD-11 (effectiveness-checker≠closer) re-confirmed intact via full regression re-run — this change does not touch that guard. |
| Approval | N/A. |
| Audit | The existing success-path `logAudit()` call still fires unchanged; the new rejection path is durably audited via `durableFailureAudit` (this function is reached through `withTransaction()`, so a bare `logAudit()` before the `{ok:false}` return would be silently rolled back — the established pattern must be used). |
| Accounting | Unaffected — confirm zero GL impact either way. |
| Inventory | Unaffected. |
| Project Cost | Unaffected. |
| Reporting | Unaffected. |
| Negative | The core negative case IS this feature — see Functional above. |
| Concurrency | Two near-simultaneous `createCAPACase()` calls referencing the SAME valid source both succeed independently (multiple CAPA cases per source remains valid — this item does not address CAPA duplication, only source-ID existence). |
| Duplicate prevention | N/A — not in scope for this item. |
| Browser UAT | Attempt to create a CAPA case from a stale/deleted source reference via the UI (if reachable) and confirm a clear, actionable error is shown, not a silent success or a raw stack trace. |

## Regression requirement for both items

Full regression battery (all 21 core suites + Wave 1/2/3 suites + this future item's own new assertions)
must show zero net new failures before either item may be considered complete, per this engagement's
established discipline. Any pre-existing test fixture that (knowingly or not) exercises a scenario these
2 items would newly reject must receive the same disclosed, non-weakening actor/fixture-substitution fix
this engagement has repeatedly and correctly applied before (Wave 2's 4 corrected fixtures is the direct
precedent) — never a loosened assertion.

## No criteria for POLICY DEPENDENT items

Consistent with `ARCH-2026-002-WAVE-4-ACCEPTANCE-CRITERIA.md`'s original position: acceptance criteria
cannot be meaningfully written for a requirement whose target behavior is not yet fixed. Each POLICY
DEPENDENT item's acceptance criteria must be produced as part of the follow-up CR that receives its
management decision, once — and only once — that decision fixes a single target behavior to test against.
