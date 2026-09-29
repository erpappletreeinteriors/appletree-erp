# ARCH-2026-001B — Changelog

**Date:** 2026-09-21. Every code/configuration change made for this CR.

## Files changed

### `server/domain.js`

1. **5 new privilege entries** added to the existing `RBAC_PRIVILEGES` array literal (extends
   ARCH-2026-001A's registry, does not replace it): `MaterialIssueSite.CREATE`,
   `MaterialIssueWarehouse.CREATE`, `PurchaseRequisition.APPROVE`, `SiteMaterialRequisition.APPROVE`,
   `AuditLog.VIEW`.
2. **4 new duty entries** added to `RBAC_DUTIES`: `MaterialIssueFull`, `MaterialIssueSiteOnly`,
   `RequisitionApproval`, `AuditVisibility`.
3. **5 business roles' duty-grant lists updated** (`Admin`, `CEO`, `FinanceManager`, `Purchase`,
   `SiteInCharge`) to include the new duties, each grant read directly from the exact legacy check it
   corresponds to.
4. **`assertCanCreateMaterialIssue()`** — both role-array base checks (`['Admin','CEO','Purchase',
   'FinanceManager'].includes(...)` and `['Admin','CEO','Purchase'].includes(...)`) replaced with
   `hasPrivilege(actor,'MaterialIssueSite.CREATE')` / `hasPrivilege(actor,'MaterialIssueWarehouse.CREATE')`.
   The `isSiteInChargeOf()`/`isProjectManagerOf()` scope checks and the error-message ternary are
   UNCHANGED.
5. **`approvePurchaseRequisition()`** — base gate (`!PURCHASE_APPROVAL_ROLES.has(actor.role) &&
   actor.role!=='SiteInCharge'`) replaced with `!hasPrivilege(actor,'PurchaseRequisition.APPROVE')`.
   The amount-threshold sub-check and everything downstream is UNCHANGED.
6. **`approveSiteMaterialRequisition()`** — base gate (`!['SiteInCharge','Purchase','FinanceManager',
   'CEO','Admin'].includes(actor.role)`) replaced with
   `!hasPrivilege(actor,'SiteMaterialRequisition.APPROVE')`. The threshold sub-check and the SoD
   self-approval check are UNCHANGED.

### `server/server.js`

1. **`GET /api/audit-log`** — `!(actor.role==='Admin' || actor.role==='CEO')` replaced with
   `!D.hasPrivilege(actor,'AuditLog.VIEW')`.

### Files NOT changed

- `client_secure/index.html` — not touched.
- `server/env.js`, `server/scripts/start-isolated-test-server.js` — used, not modified.
- Every one of the 112 remaining `role===` occurrences classified in
  `ARCH-2026-001B-LEGACY-AUTH-INVENTORY.md` — none edited.
- The four pre-existing approval-authority tables/functions and the two pre-existing maker-checker
  enforcement sites — untouched.
- `registerMutationRoute()` and every route already dispatched through it — untouched (treated as an
  already-approved-equivalent centralization mechanism, per this CR's own §8).
- `server/db.json` (production data), `server/db.json.bak`, `server/db.json.lock` — untouched
  throughout (verified by hash — see the Regression Report).

## New files created

- `ARCH-2026-001B-PREIMPLEMENTATION-BASELINE.md`
- `ARCH-2026-001B-LEGACY-AUTH-INVENTORY.md`
- `tests/erp_arch_2026_001b_route_auth_migration_tests.js` (18 assertions)
- `ARCH-2026-001B-ROUTE-AUTH-MIGRATION-REPORT.md`
- `ARCH-2026-001B-ROUTE-AUTH-TEST-REPORT.md`
- `ARCH-2026-001B-REGRESSION-REPORT.md`
- `ARCH-2026-001B-CHANGELOG.md` (this file)

## Issues found during implementation (disclosed)

No product-code defect was found during this CR (unlike ARCH-2026-001A, which caught a real duty-list
gap). One test-invocation methodology issue was found and resolved, documented in
`ARCH-2026-001B-REGRESSION-REPORT.md` §4 — a pre-existing convention inconsistency across this
engagement's own test suite (some files read `TEST_BASE_URL`, others take a positional argument), not
a code change.
