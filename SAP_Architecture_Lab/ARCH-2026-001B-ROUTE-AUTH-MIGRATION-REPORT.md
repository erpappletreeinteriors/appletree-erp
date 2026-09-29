# ARCH-2026-001B — Route Authorization Migration Report

**Date:** 2026-09-21. What was migrated, grounded in `ARCH-2026-001B-LEGACY-AUTH-INVENTORY.md`.

## 1. Summary

Of the 113 baseline `role===` occurrences, **1** was migrated to the centralized privilege engine
(`AuditLog.VIEW`), and **112** were classified and explicitly documented as an approved exception
(FALSE POSITIVE, BUSINESS LOGIC, or DEFERRED to a specific future CR). Beyond the literal 113 count,
**4 additional genuine `.includes(actor.role)` array-literal authorization gates** — a broader pattern
this CR's own §6 explicitly names ("legacy role arrays") — were also found and migrated, all in
high-risk-list-relevant functions (`MaterialIssueSite.CREATE`, `MaterialIssueWarehouse.CREATE`,
`PurchaseRequisition.APPROVE`, `SiteMaterialRequisition.APPROVE`). **5 authorization gates migrated in
total.**

## 2. Migrations performed

| # | Resource.Action | File / Function | Original check | New check | Role set (verified identical) |
|---|---|---|---|---|---|
| 1 | `AuditLog.VIEW` | `server.js`, `GET /api/audit-log` | `!(actor.role==='Admin' \|\| actor.role==='CEO')` | `!D.hasPrivilege(actor,'AuditLog.VIEW')` | Admin, CEO |
| 2 | `MaterialIssueSite.CREATE` | `domain.js`, `assertCanCreateMaterialIssue()` site branch | `['Admin','CEO','Purchase','FinanceManager'].includes(actor.role)` | `hasPrivilege(actor,'MaterialIssueSite.CREATE')` | Admin, CEO, Purchase, FinanceManager |
| 3 | `MaterialIssueWarehouse.CREATE` | `domain.js`, `assertCanCreateMaterialIssue()` warehouse branch | `['Admin','CEO','Purchase'].includes(actor.role)` | `hasPrivilege(actor,'MaterialIssueWarehouse.CREATE')` | Admin, CEO, Purchase |
| 4 | `PurchaseRequisition.APPROVE` | `domain.js`, `approvePurchaseRequisition()` base gate | `!PURCHASE_APPROVAL_ROLES.has(actor.role) && actor.role!=='SiteInCharge'` | `!hasPrivilege(actor,'PurchaseRequisition.APPROVE')` | Admin, CEO, Purchase, FinanceManager, SiteInCharge |
| 5 | `SiteMaterialRequisition.APPROVE` | `domain.js`, `approveSiteMaterialRequisition()` base gate | `!['SiteInCharge','Purchase','FinanceManager','CEO','Admin'].includes(actor.role)` | `!hasPrivilege(actor,'SiteMaterialRequisition.APPROVE')` | SiteInCharge, Purchase, FinanceManager, CEO, Admin |

Every new role set was **read directly from the exact original check it replaces** — never invented —
and verified identical by `tests/erp_arch_2026_001b_route_auth_migration_tests.js` TEST 1.* (5
assertions) before being trusted, plus direct function-level tests (TEST 2-4) and live HTTP
authorized/unauthorized/forged-role/missing-auth tests (TEST 5-11).

## 3. New privilege/duty catalog entries (extending, not replacing, ARCH-2026-001A's registry)

- **Privileges** (5 new, `RBAC_PRIVILEGES`): `MaterialIssueSite.CREATE`, `MaterialIssueWarehouse.CREATE`,
  `PurchaseRequisition.APPROVE`, `SiteMaterialRequisition.APPROVE`, `AuditLog.VIEW`.
- **Duties** (4 new, `RBAC_DUTIES`): `MaterialIssueFull` (Admin/CEO/Purchase — both Material Issue
  privileges), `MaterialIssueSiteOnly` (FinanceManager — site privilege only), `RequisitionApproval`
  (Admin/CEO/Purchase/FinanceManager/SiteInCharge — both requisition-approval privileges, since their
  role sets are identical), `AuditVisibility` (Admin/CEO only).
- **Business Role duty grants updated**: `Admin`, `CEO`, `FinanceManager`, `Purchase`, `SiteInCharge`
  each gained the appropriate new duty (see the Role Migration section of
  `ARCH-2026-001B-ROUTE-AUTH-TEST-REPORT.md` for the exact before/after grant table).

## 4. Route-level (not just engine-level) authorization confirmed

Unlike ARCH-2026-001A's resource-specific privilege slice (proven at the engine level only, never
wired into a route), this CR's 5 migrations are **live in the actual enforcement path** —
`GET /api/audit-log` and the two requisition-approval/material-issue domain functions now call
`hasPrivilege()` directly, and this is proven via live HTTP tests against a real spawned server (not
inferred from code reading alone).

## 5. What was deliberately NOT migrated (and why)

Per `ARCH-2026-001B-LEGACY-AUTH-INVENTORY.md`:
- **9 test-only diagnostic endpoints** (Admin-gated, already double-gated by `IS_TEST_ENV`) — low
  value, unnecessary risk to touch test-safety code without explicit authorization.
- **2 documented special-case Viewer-deny checks** — an explicit code comment already explains why a
  generic privilege tag deliberately does not apply; forcing one in risks the exact bug the comment
  warns against.
- **9 pure role-set view gates** (CRM/Sales/Estimation/Quotation/Customer-master domain) — genuine
  authorization, but outside this CR's explicit high-risk list (§10); left as LEGACY COMPATIBILITY
  for a future CR.
- **78 data-scope filters/checks** (ProjectManager/Sales record-visibility scoping, and compound
  role-list-OR-scope helpers) — explicitly protected by this CR's own §16 ("do not introduce new
  data-scope enforcement... do not accidentally create scope-based access changes while migrating").
  Belongs to `ARCH-2026-001C`.
- **2 SoD-exemption checks** (`approveDraft()`/`postDraft()` `isOverride` logic) — explicitly protected
  by §14. Belongs to `ARCH-2026-001D`.
- **4 approval-authority checks** (`approveQuotationDiscount()`'s dynamic tier check; the 3
  amount-threshold sub-checks in the two requisition-approval functions) — explicitly protected by
  §15. Belongs to `ARCH-2026-001E`.
- **7 false positives and 3 business-logic items** in `domain.js` — not authorization decisions at
  all (seed-data checks, default-value assignment, an unrelated "labour role" field, a
  target-record-validation check, and a comment).

## 6. Architecture preserved

No second authorization engine was created. `registerMutationRoute()` (the existing Phase 21-24
mutation-route registry) continues to be treated as an approved-equivalent central mechanism for
routes already registered through it — not re-migrated merely to reduce inline-check counts, per this
CR's own §8. `can()` and its `hasPrivilege()` foundation, established by ARCH-2026-001A, remain the
single authoritative engine — this CR only adds more real enforcement sites that read from it.
