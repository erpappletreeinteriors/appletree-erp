# ARCH-2026-001C — Data Scope Test Report

**Date:** 2026-09-21. All positive/negative tests, mapped against this CR's own §12 test matrix (A-P).
All 32 assertions in `tests/erp_arch_2026_001c_data_scope_tests.js` use REAL application records
(real seeded users/projects/customers, real created tasks/timesheets/risk entries/AR invoices/supplier
bills/payment requests) — no authorization code was edited mid-test to fake a result, per §15.

## 1. §12 test matrix coverage

| Item | Scenario | Result | Evidence |
|---|---|---|---|
| A | Correct scope — PM own project (PRJ-1) — ALLOW | **PASS** | Engine test + live API (`[C/M]`) |
| B | Wrong project — PM attempts PRJ-2 — DENY | **PASS** | Engine test + live API (`[B/M]`) |
| C | (folded into A/M) | **PASS** | `[C/M]` — real task created via direct API |
| D/E | Warehouse ALLOW/DENY | **N/A** | No per-user Warehouse scope exists in the data model (Audit §2/§5) — cannot be tested without inventing a relationship this CR explicitly forbids inventing |
| F/G | Cross-branch DENY / correct branch ALLOW | **PASS (existing precedent unchanged)** | `[G]` — `branchAllowed()` unrestricted-when-unassigned confirmed, matching pre-existing behavior; `branchAllowed()` itself untouched, so its own existing coverage (Phase 18's own tests) continues to apply |
| H/I | Cost-centre / Profit-centre mismatch DENY | **N/A** | No per-user Cost/Profit-Centre scope exists in the data model (Audit §2/§5) |
| J | Financial-period violation | **N/A to this CR — pre-existing, separate control, unaffected** | Exercised unchanged by the existing regression suite (closed-period rejection tests, unrelated to user-scope) |
| K | Parent-scope mismatch (Project A user attempts a Site belonging to Project B) | **N/A as literally stated** | Confirmed by inspection: Sites are NOT sub-entities of Projects in this data model (Audit §4) — the scenario as described does not correspond to a real relationship. Site-scope and Project-scope were each tested independently instead (`[A]`/`[B]` for Project; Site dimension proven via the engine-level `hasScopeAccess` dispatcher, §2 of the Implementation Report — no live-HTTP Site-creation route with a Project link exists to test the literal K scenario against) |
| L | ID-tampering — change a resource ID in the request | **PASS** | `[L]` — a REAL Project B task's real ID submitted by a Project-A-only PM; scope resolved from the DB record, not the client — DENY |
| M | Direct API access (bypass UI) | **PASS** | The entire suite is direct `fetch()` — never through `client_secure/index.html` |
| N | Forged scope payload | **PASS** | `[N]` — extra fabricated scope-looking fields in the request body do not bypass the real `projectId` field's own check |
| O | Missing scope | **PASS** | `[Missing-scope]` — `hasScopeAccess` with a falsy `scopeId` returns `true` (nothing to check against), matching every one of the 78 original checks' own implicit "no value, no restriction" behavior; and `[Global-unrestricted]` — a user with no scope assignment for a dimension is unrestricted for it, per the preserved existing precedent |
| P | Multiple roles | **N/A** | No multi-role assignment capability exists in this codebase (Audit §2, `ARCH-2026-001C-OPEN-DECISIONS.md`) |

## 2. Cross-project protection (§14) — full results

Used REAL, pre-existing application projects (PRJ-1 = "Project A", PRJ-2 = "Project B" — a direct
`POST /api/projects` route does not exist in this application, confirmed by inspection; Projects are
created only via the Lead→Quotation→Won pipeline) and the REAL seeded `pm1` user (`assignedProjects:
['PRJ-1','PRJ-3']`), exercised entirely through direct API calls:

- Project A (PRJ-1) → **ALLOW** (`[A]`, `[C/M]`, `[G2]`)
- Project B (PRJ-2) → **DENY** (`[B]`, `[B/M]`)
- Repeated through 4 distinct real write operations (task create, task status change, risk-register
  create, risk-register close, timesheet create) plus 3 read-filter checks (tasks/timesheets/risks
  list) — **DENY on every Project B attempt, ALLOW on every Project A attempt, zero exceptions.**

## 3. Cross-site / cross-warehouse protection (§15)

**Site**: `hasScopeAccess(actor,'Site',siteId)` proven correct at the engine level (dispatches to the
pre-existing, already-tested `isSiteInChargeOf()`) — no live-HTTP write route in this application
currently gates on Site scope alone (Material Issue's site branch grants access to
`{Admin,CEO,Purchase,FinanceManager}` OR a matching `isSiteInChargeOf()`, an OR-composition already
covered by ARCH-2026-001B's own migration, not re-tested here to avoid duplicate coverage).

**Warehouse**: **N/A** — confirmed absent from the data model (Audit §2/§5). No test exists because no
real enforcement point exists to test without inventing one.

## 4. Write operations (§16)

Proven for View (read-filters on tasks/timesheets/risk-register), Create (tasks/timesheets/risk-
register/AR-invoice/material-requirements), Edit (task status change), and a close/cancel-equivalent
(risk-register close) — every action type CURRENTLY implemented for these resources. Approve/Execute/
Post/Reverse were not exercised for THESE specific 5 migrated resources because none of them currently
has such an action (Tasks/Timesheets/Risk entries have no approval workflow in this application) —
confirmed by inspection, not assumed.

## 5. Delete/Cancel/Reverse (§17)

Risk-register "close" is the closest existing cancel-equivalent action for the migrated resource set —
tested (`[Write-CRUD] ... closes ... ALLOW` / `DENY`). No new delete capability was introduced. No
existing posting control was touched (the Financial Period / SoD / Approval Authority mechanisms
remain completely unmodified — confirmed by the unchanged regression suite results).

## 6. Reports / Exports (§18/§19)

Not exercised by this test suite. Inspection of the existing Reports module found no report endpoint
currently filters by the 4 real scope dimensions independently of the underlying transactional data
they already read (a report reads `DB.projects`/`DB.tasks`/etc. directly, inheriting whatever scope
enforcement — if any — the underlying list route applies; report endpoints themselves are role-gated,
not scope-gated, matching the existing, unmodified `can()`-based pattern). No change was made to any
report or export endpoint in this CR; this is disclosed as an untested area, not claimed as passing.

## 7. Audit (§20)

No new audit event type was needed — this CR created no new mutable scope-assignment record (§8's
"reuse the existing structure" decision means there is no NEW assignment-change event to audit;
`assignedProjects`/`assignedCustomers`/`assignedBranches` are set via the existing user-management
flow, whose own audit coverage is unchanged and untouched by this CR).

## 8. Browser UAT (§21)

Not performed as a manual browser click-through in this CR. Every test in this suite is a direct API
call, which is the actual security boundary (§21 itself: "Client UI changes are NOT mandatory... Do
not redesign the UI unnecessarily" — no UI change was made, so there is no new UI behavior to verify).
`client_secure/index.html` has zero diff from this CR.

## 9. Security testing (§22) — forged fields

- Forged role: covered by ARCH-2026-001B's own tests (unchanged mechanism, re-confirmed by regression).
- Forged project ID: `[L]`, `[N]` — DENY, scope resolved from the DB record.
- Forged user ID: not separately tested (the session IS the user identity; no separate user-ID
  parameter exists on any migrated route to forge).
- Manipulated query/route parameter, manipulated POST body: `[N]` — extra fabricated fields in the
  POST body do not bypass the real field's check.
- Cross-project/cross-site/cross-warehouse request, direct API call, hidden UI action: covered above.

## 10. Conclusion

32/32 new assertions pass. Every applicable §12 scenario is covered; every N/A scenario is explained by
a confirmed absence in the data model, not silently skipped.
