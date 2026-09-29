# ARCH-2026-001C-F — Security Report

**Date:** 2026-09-21. Explicit security testing per this CR's own §12, and the defect account per §22.

## 1. The defect (full account)

See `ARCH-2026-001C-F-MIGRATION.md` §4 for the complete root-cause and fix. Summary: a blind primitive
substitution (`isProjectManagerOf(actor,X)` → `hasScopeAccess(actor,'Project',X)`) was UNSAFE at 9 of
32 sites because `hasScopeAccess` returns TRUE unconditionally for every non-ProjectManager role — at
those 9 sites (all `fullAccess.has(role) || isProjectManagerOf(...)`-shaped DENY-guards, plus
`pmOrAdminCeo()` and its 2 callers, plus `POST /api/designs`), the substitution silently converted
"deny every role outside an explicit allow-list" into "allow every role except a non-owning
ProjectManager." **This is exactly stop-condition §22.2 ("migration changes an existing business
permission unexpectedly").** Per this CR's own instruction not to "work around a stop condition," the
correct response taken was: stop the migration work immediately upon discovering the anomaly (a manual
`curl` probe, run before any formal test file existed), diagnose the root cause fully, fix all 9
affected sites (not just the one manually found), verify the fix with both a live re-probe and a
permanent regression test, and only then continue.

## 2. API security tests (§12)

| Attack | Route(s) | Result |
|---|---|---|
| Cross-project access | 6 report routes + `POST /api/designs` + `POST /api/export` | **DENY (403)** for the non-fullAccess, non-owning role; **ALLOW (200)** for fullAccess/owning roles — 33/33 assertions |
| Forged project ID | Every route above (the "wrong" project ID IS the forgery in each test) | **DENY** — scope resolved from the authoritative check, never trusted from the request alone |
| ID tampering (a REAL other-project record, targeted by its real ID) | `POST /api/tasks/:id/status` (pre-existing from 001C, re-confirmed via regression) | **DENY (403)** |
| Direct API call (no UI) | Every test in the new suite | This IS the methodology — raw `fetch()`, and separately, real browser-session `fetch()` calls (see Browser UAT) |
| Missing authentication | Covered by the pre-existing, unchanged suites (001A/001B/001C) | **DENY (401)**, re-confirmed by full regression |
| Forged role/user/customer/branch/cost-centre/profit-centre | Forged role/user/customer: covered by 001A/001B/001C's own tests, re-confirmed unaffected by regression. Cost-centre/profit-centre: **N/A** — no scope-assignment mechanism exists for these dimensions (confirmed absent, `ARCH-2026-001-...AUDIT.md`), so there is no enforcement point to attack | N/A where the dimension doesn't exist; DENY where it does |

## 3. Server-side enforcement — confirmed, not assumed

Every one of the 23 remaining migrated sites and all 9 reverted sites were re-verified via LIVE HTTP
calls (not code inspection alone) — both through a synthetic test harness AND through a real logged-in
browser session (see Browser UAT). No menu-visibility, hidden-button, or client-side-filter mechanism
was used or relied upon anywhere in this CR.

## 4. Performance (§16)

No new N+1 pattern introduced. Every migrated/reverted call site invokes the SAME underlying
`isProjectManagerOf()`/`hasScopeAccess()` functions at the SAME call frequency as before this CR — the
substitution changed which function name is called, never how many times or in what loop structure.
The 23 kept-migrated sites route through one additional function-call layer (`hasScopeAccess` wrapping
`isProjectManagerOf`), a negligible, non-measurable overhead (a single extra `if` check), not a new
database/collection lookup.

## 5. Auditability (§15)

No new scope-assignment data was created or changed by this CR (the same "reuse existing fields, no
new assignment model" decision from ARCH-2026-001C applies unchanged) — no new audit event type was
needed. The existing `logAudit()`/`DB.auditLog` path, unmodified, continues to record every
`AccessDenied` event from the 9 fixed routes exactly as it did before this CR (the `deny()` helper
function itself, which calls `logAudit()`, was not touched).

## 6. Conclusion

One real, live-caught, fully-fixed defect — disclosed in full, not minimized. Every migrated and
reverted site individually re-verified. No remaining unexplained authorization bypass. No performance
regression. No new audit surface needed.
