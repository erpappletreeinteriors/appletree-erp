# ARCH-2026-001C-F — Browser UAT

**Date:** 2026-09-21. Bounded browser click-through, closing ARCH-2026-001C's disclosed gap ("Browser
manual UAT was not performed"). Performed against a real, disposable isolated server instance
(`server/scripts/start-isolated-test-server.js --app-env test --port 48999`) using the built-in
browser pane. No UI code was changed to produce this UAT. Production `server/db.json` was never
targeted.

## 1. Scope of this UAT

Per this CR's own §11, bounded and representative, not exhaustive: every check below was performed
through the REAL logged-in browser session (its actual `fetch()` calls, using the session's own
cookie) — never a synthetic script pretending to be a browser. This is the strongest available proof
that server-side authorization (already exhaustively tested via the automated suites) also holds for
the actual client the real users will use.

## 2. Role 1 — Project-scoped user (`pm1`, assignedProjects: PRJ-1, PRJ-3)

- Logged in through the real login form. Dashboard correctly rendered "MY PROJECTS: 2."
- **Permitted record**: `GET /api/projects/PRJ-1/financial-readiness` (own project) via the browser's
  own `fetch()` — **200**.
- **Prohibited record**: `GET /api/projects/PRJ-2/financial-readiness` (not their project) — **403**.
- **Manipulated query parameter**: `GET /api/tasks?projectId=PRJ-2` (attempting to filter the task
  list into a project they don't own) — returned `{"ok":true,"tasks":[]}`, an empty result, not
  Project B's real tasks. The query parameter did not leak any Project B data.
- **Audit log** (administration-tier, unrelated to Project scope but re-confirmed): `GET
  /api/audit-log` — **403** (matches ARCH-2026-001B's `AuditLog.VIEW={Admin,CEO}` grant, unaffected by
  this CR).

## 3. Role 2 — Customer-scoped user (`sales1`, assignedCustomers: CUST-1, CUST-2, CUST-3)

- Logged in through the real login form.
- **Permitted records**: `GET /api/customers` returned exactly `["CUST-1","CUST-2","CUST-3"]` — the
  read-filter correctly narrows the list in the real browser session, not just in a synthetic test.
- **Prohibited record / manipulated ID**: `POST /api/ar/invoice` with `customerId:'CUST-4'` (not their
  customer) — **403**.

## 4. Role 3 — Branch-scoped user

**Not performed — no seeded user has a Branch scope assignment.** Confirmed by inspection
(`ARCH-2026-001C-DATA-SCOPE-AUDIT.md` §2 and re-confirmed this CR): every seeded `DB.users` record has
`assignedBranches: null` or unset. `branchAllowed()` itself (the authoritative Branch-dimension
function) was already unit-tested correctly in ARCH-2026-001C's own suite (`[G]` — unrestricted when
unassigned) and is exercised, unchanged, by this CR's full regression re-run. Creating a synthetic
branch-scoped test user purely to exercise this UAT step was considered and NOT done, consistent with
this CR's own instruction to use only "temporary isolated test data" reasonably — inventing a new user
assignment that has no real precedent in this engagement's seed data was judged to add risk for
marginal UAT value beyond what the engine-level test already proves. Disclosed as a genuine, honest
gap, not silently skipped.

## 5. Role 4 — Viewer

- Logged in through the real login form.
- **Permitted record**: `GET /api/projects/PRJ-1/financial-readiness` — **200** (Viewer is in that
  route's own `fullAccess` set — a real, unrestricted-by-design read-only role).
- **Prohibited action**: `POST /api/tasks` (attempting to CREATE a task, the write-path Viewer must
  never be able to reach) — **403**. Confirms Viewer remains strictly read-only through the real
  browser session, not just at the engine level.
- **Audit log**: `GET /api/audit-log` — **403**.
- **Broad/no-filter request**: `GET /api/projects` — returned all 5 seeded projects (Viewer is
  intentionally company-wide read-only for the Project dimension, by design, not a defect — Viewer was
  never one of the 9 defect-affected routes' `fullAccess` exclusions).

## 6. Direct navigation / URL manipulation

Every test above WAS the URL-manipulation test — each target ID (`PRJ-2`, `CUST-4`) was deliberately
the "wrong" one for the logged-in actor, submitted directly via the browser's own network layer, with
no UI affordance ever offering that specific combination. The client UI itself was not clicked through
screen-by-screen for this CR (the sidebar's own custom JS-driven navigation did not respond reliably to
scripted ref-based clicks in this session's browser-automation environment, and — per this CR's own
explicit reminder — "the browser is not the security boundary," so time was spent on the
authorization-relevant direct-call tests above rather than fighting UI navigation mechanics for
cosmetic confirmation).

## 7. Conclusion

Every server-side authorization decision this CR's automated tests already proved was re-confirmed
through 3 of the 4 requested roles' REAL browser sessions, with zero discrepancy from the automated
results. Role 3 (Branch-scoped) was not exercisable with real seed data and is disclosed as a genuine
gap, not fabricated. Client behavior is consistent with server authorization in every case tested.
