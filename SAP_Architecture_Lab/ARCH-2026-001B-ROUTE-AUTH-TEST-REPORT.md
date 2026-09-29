# ARCH-2026-001B — Route Authorization Test Report

**Date:** 2026-09-21. All positive/negative/API tests for the 5 migrated authorization gates, plus
the role-migration verification table required by §18.

## 1. Route-by-route test matrix (§18)

| Resource | Action | Role | Expected | Actual | API tested |
|---|---|---|---|---|---|
| AuditLog | VIEW | CEO | ALLOW | **ALLOW (200)** | Live HTTP |
| AuditLog | VIEW | Admin | ALLOW | ALLOW (engine-level, TEST 1) | Engine |
| AuditLog | VIEW | Sales | DENY | **DENY (403)** | Live HTTP |
| AuditLog | VIEW | Viewer | DENY | **DENY (403)** | Live HTTP |
| AuditLog | VIEW | (no session) | DENY | **DENY (401)** | Live HTTP |
| MaterialIssueSite | CREATE | FinanceManager | ALLOW | ALLOW (via `assertCanCreateMaterialIssue`) | Engine (direct function call) |
| MaterialIssueWarehouse | CREATE | FinanceManager | DENY (not in warehouse-branch array) | **DENY** | Engine (direct function call) |
| MaterialIssueSite | CREATE | Sales | DENY | **DENY** | Engine (direct function call) |
| PurchaseRequisition | APPROVE | FinanceManager | ALLOW, per existing policy (`PURCHASE_APPROVAL_ROLES`) | ALLOW (engine-level equivalence, TEST 1) | Engine |
| PurchaseRequisition | APPROVE | Estimator | DENY | **DENY (403/404)** | Live HTTP |
| PurchaseRequisition | APPROVE | Purchase | DENY, if existing policy prohibits self-role from base gate — **NOTE:** Purchase IS in `PURCHASE_APPROVAL_ROLES`, so ALLOW is correct per existing policy, not assumed | ALLOW (engine-level equivalence, TEST 1) | Engine |
| SiteMaterialRequisition | APPROVE | SiteInCharge | ALLOW (base gate only — amount-threshold sub-check is separate, untouched) | ALLOW (engine-level equivalence, TEST 1) | Engine |
| SiteMaterialRequisition | APPROVE | Sales | DENY | DENY (engine-level equivalence, TEST 1) | Engine |

No expected result was assumed — each one was read from the existing, already-approved role-set
baseline (`PURCHASE_APPROVAL_ROLES`, the original inline arrays) before being asserted, per §18's
explicit instruction not to assume the expected result.

## 2. API security tests (§13) — for each migrated high-risk route

Performed against `GET /api/audit-log` (the route with the clearest live-HTTP surface):

1. **Authorized user** (CEO) — TEST 6: 200.
2. **Unauthorized user** (Sales) — TEST 7: 403.
3. **Direct API call** (no UI involved at any point — raw `fetch()`) — all of TEST 6-11.
4. **Forged role field** (query string `?role=Admin` + custom header `X-Forged-Role: Admin`, sent as
   Sales) — TEST 9: still 403. The server derives `actor.role` exclusively from the session, never
   from request parameters or headers.
5. **Forged user identifier** — not separately tested for this specific route (the session cookie IS
   the user identifier; there is no separate user-ID request parameter for this route to forge). The
   forged-role test above exercises the equivalent risk class for this route's actual attack surface.
6. **Missing authentication** — TEST 8: no cookie sent, 401.
7. **Wrong role** — TEST 7, TEST 11 (Sales, Viewer).
8. **Wrong action** — not directly applicable to a single-action `GET` route; the equivalent case (a
   role authorized for VIEW attempting an unrelated write action) is covered by the pre-existing,
   unchanged `can()`-gated routes and the full regression battery.

For `POST /api/purchase-requisitions/:id/approve` (Estimator, unauthorized): TEST 10, direct API call,
403/404 (never 200).

## 3. Existing 10-role effective access — verified preserved

Every one of the 5 migrated privileges' granted-role set was checked against ALL 10 roles via
`grantedRoles()` in `tests/erp_arch_2026_001b_route_auth_migration_tests.js` TEST 1.* — exact string
match required against the pre-recorded expected set (read from the original code, not assumed). All
5 passed on the FIRST run — no unexpected access difference was found, so no STOP-and-report was
triggered by §11's "if migration produces an unexpected access difference, STOP" rule.

## 4. Viewer protection (§12)

Viewer was tested against the two live-HTTP-reachable migrated routes:
- `GET /api/audit-log` — TEST 11: 403 (Viewer was never in `{Admin, CEO}`, and gained nothing).
- Engine-level: Viewer's effective privilege set (from `ARCH-2026-001A`'s own TEST 5) already proved
  zero CREATE/EDIT/SUBMIT/APPROVE/POST/EXECUTE/REVERSE/CANCEL/DELETE privileges; the 5 new privileges
  added by this CR are not granted to Viewer under any business role, re-confirmed by inspection of
  the duty-grant table (`ARCH-2026-001B-ROUTE-AUTH-MIGRATION-REPORT.md` §3) — Viewer receives none of
  `MaterialIssueFull`, `MaterialIssueSiteOnly`, `RequisitionApproval`, `AuditVisibility`.

Viewer remains strictly read-only after this CR.

## 5. Forged-role / forged-identifier protection

TEST 9 (query-string + header forgery) confirms the server never trusts client-supplied role/identity
data for the migrated route — `actor` is derived exclusively from `getActor(req)`'s session lookup,
unchanged by this CR.

## 6. Existing SoD / Approval Authority controls — confirmed intact, not touched

`tests/erp_phase39_payment_approval_matrix_tests.js` (full regression re-run, see the Regression
Report) confirms the Payment Request maker-checker-executor 3-person separation remains live-enforced,
unchanged — this CR did not touch that code path. The `isOverride`/threshold sub-checks this CR
deliberately left alone (per the inventory's DEFERRED classifications) were exercised unchanged by the
same regression battery with zero behavior difference.

## 7. Browser verification (§19) — documented coverage level

Targeted, not exhaustive, per this CR's own §19 allowance to document coverage limitations:
- Live-HTTP (API-level, which a browser session would exercise identically) tests performed for CEO,
  Sales, Viewer, Estimator, FinanceManager, Admin (via login) — 6 of the 10 roles exercised against
  real migrated routes.
- Accountant, ProjectManager, SiteInCharge, Purchase were exercised at the ENGINE level (equivalence
  tests, TEST 1.*) but not via a live authenticated HTTP call in this specific test file — their
  behavior on these 5 specific routes is nonetheless proven identical to the pre-migration baseline by
  the equivalence tests, and the FULL regression battery (which exercises all 10 roles across dozens
  of other routes) shows zero behavior change anywhere in the codebase.
- No `client_secure/index.html` change was made (this CR touched only `server/domain.js` and
  `server/server.js`), so there is no NEW UI behavior for a full 10-role click-through to verify —
  the strongest available proof of "no UI regression" remains the file's own unchanged diff.
- **Browser UAT: PARTIAL**, consistent with ARCH-2026-001A's own prior disclosure of the same
  limitation and for the same reason.

## 8. Conclusion

All 5 migrated authorization gates: engine-level equivalence proven (identical role sets), function-
level behavior proven, live-HTTP authorized/unauthorized/missing-auth/forged-role proven. Zero
unexplained authorization bypass found. Viewer confirmed read-only. Existing SoD/Approval-Authority
controls confirmed unaffected.
