# ARCH-2026-001C — Security Report

**Date:** 2026-09-21. Explicit security testing per this CR's own §22, plus the performance check
required by §25.

## 1. Forged/manipulated input tests

| Attack | Route tested | Result |
|---|---|---|
| Forged project ID (client sends a project the user isn't scoped to) | `POST /api/tasks`, `/api/timesheet`, `/api/risk-register`, `/api/material-requirements` | **DENY (403)** — scope check runs server-side against the actual `body.projectId`/DB record, regardless of what the client sends |
| Forged scope-looking extra fields (`scopeOverride`, a `__proto__scope`-style field) | `POST /api/tasks` | **DENY (403)** — only the real `projectId` field is ever read; fabricated fields are ignored |
| ID-tampering (a real OTHER project's real record ID, targeted directly) | `POST /api/tasks/:id/status`, `POST /api/risk-register/:id/close` | **DENY (403)** — scope is resolved from the loaded DB record (`t.projectId`/`rk.projectId`), never from a client-supplied scope value |
| Missing authentication | `POST /api/tasks` (no session cookie) | **DENY (401)** |
| Forged customer ID | `POST /api/ar/invoice` | **DENY (403)** for an unassigned customer; **ALLOW** for the actor's own assigned customer (positive control, proves the check is real, not always-403) |
| Direct API call (bypassing any UI entirely) | Every test in this CR's suite | This IS the test methodology — every single assertion is a raw `fetch()` call, never through `client_secure/index.html` |
| Cross-project request | Multiple (see Test Report §2) | **DENY** on every Project B attempt by a Project-A-only user, **ALLOW** on every Project A attempt — zero exceptions across 2 read-filters, 5 writes, and the engine-level equivalence sweep |
| Forged role, forged user ID | Not newly re-tested here | Already proven by ARCH-2026-001B's own security tests (TEST 7, 9, 11), unchanged mechanism, re-confirmed passing by this CR's own regression re-run of that suite (18/18) |

Cross-site, cross-warehouse, forged site ID, forged warehouse ID, forged cost-centre, forged
profit-centre: **N/A** — no live-HTTP write route in this application currently gates on Site scope
alone (Site gating is always OR-composed with a role check already covered by ARCH-2026-001B), and
Warehouse/Cost-Centre/Profit-Centre have no scope-assignment mechanism to attack (confirmed absent,
`ARCH-2026-001C-DATA-SCOPE-AUDIT.md` §2/§5) — there is no enforcement point to test without inventing
one, which this CR does not do.

## 2. Server-side enforcement — confirmed, not assumed

Every migrated check runs inside `registerMutationRoute()`'s `authCheck`/`extraCheck` mechanism (for
`material-requirements` and `ar/invoice`) or directly in the legacy route dispatcher (for
`timesheet`/`tasks`/`risk-register`, following the exact pre-existing pattern those routes already
used) — both execute BEFORE the domain-layer mutation, both are unconditionally server-side, and
neither depends on any client-supplied trust signal. No menu-visibility, hidden-button, or
client-side-filter mechanism was used or relied upon anywhere in this CR.

## 3. Performance (§25)

`hasScopeAccess()` performs at most ONE lookup per call (`DB.projects.find()` inside
`isProjectManagerOf()`, or a plain array `.includes()` for Customer/Branch) — identical cost to the
original inline checks it replaces (it calls the SAME functions, not new ones). The read-filter
migrations (`rows.filter(r=>hasScopeAccess(...))`) are the same O(n) single-pass filter the original
`if(role===...) rows=rows.filter(...)` already was — no new N+1 pattern introduced, since no NEW
per-row lookup was added (the underlying `isProjectManagerOf()`/`assignedCustomers` check was already
O(1) or O(small-array) before this CR and remains so). `resolveResourceScope('PaymentRequest', ...)`
performs one `DB.journalEntries.find()` — a single lookup, not a loop, and this function is not called
from any hot path (it is exposed but not wired into live enforcement, per the Implementation Report).
No caching was added or needed; none was removed.

## 4. Auditability

No new audit event type was required (§20) — see `ARCH-2026-001C-DATA-SCOPE-TEST-REPORT.md` §7 for the
reasoning (no new mutable scope-assignment record was created; existing user-management audit coverage
is unchanged).

## 5. Conclusion

Every protected operation tested was evaluated server-side, using the authoritative database record,
never a client-supplied value. No scope bypass was found. Performance is unchanged from the pre-
migration baseline by construction (same underlying functions, same call shape).
