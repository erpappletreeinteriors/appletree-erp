# ARCH-2026-001A — Role Migration Report

**Date:** 2026-09-21. Old → new role mapping and verification.

## 1. Migration mechanism

A deterministic, one-time migration (`server/domain.js`, the migration-guard section): for every
record in `DB.users`, if `DB.userRoles` is empty, create exactly one `DB.userRoles` row:

```js
{ id, userId: u.id, businessRoleKey: u.role, assignedAt: nowIso(), assignedBy: 'ARCH-2026-001A-migration', active: true }
```

`businessRoleKey` is set to the user's EXISTING `role` string, verbatim — no renaming, no
reinterpretation. This is provably a no-op for effective access even if the migration never ran:
`effectivePrivilegesForUser()`'s resolver (`_rbacResolveBusinessRoleKeyForUser()`) already falls back
to `user.role` when no assignment row exists. The migration exists to make the assignment EXPLICIT,
auditable data, not because effective access depends on it.

## 2. Before → after mapping (all 10 roles, unchanged)

| Legacy role | Business Role key | Renamed? | Duties added |
|---|---|---|---|
| Admin | Admin | No | LegacyBridge.Admin, ProcurementManagement, AccountsPayable, ProjectAdministration |
| CEO | CEO | No | LegacyBridge.CEO, ProcurementManagement, ProcurementApproval, AccountsPayable, AccountsPayableApproval, TreasuryExecution, ProjectAdministration |
| Accountant | Accountant | No | LegacyBridge.Accountant, AccountsPayable |
| FinanceManager | FinanceManager | No | LegacyBridge.FinanceManager, ProcurementApproval, AccountsPayable, AccountsPayableApproval, TreasuryExecution |
| ProjectManager | ProjectManager | No | LegacyBridge.ProjectManager, ProjectViewing |
| Purchase | Purchase | No | LegacyBridge.Purchase, ProcurementManagement |
| Sales | Sales | No | LegacyBridge.Sales |
| Estimator | Estimator | No | LegacyBridge.Estimator |
| SiteInCharge | SiteInCharge | No | LegacyBridge.SiteInCharge, ProjectViewing |
| Viewer | Viewer | No | LegacyBridge.Viewer, ReadOnlyProcurementFinance, ProjectViewing |

No role was renamed, merged, split, or deleted. Every "Duties added" entry beyond the auto-generated
`LegacyBridge.<role>` is ADDITIVE, resource-specific infrastructure not wired into any existing route
— it cannot cause a privilege loss or gain in anything a user could actually do through the
application today (see the Implementation Report §3 for why each grant is evidence-grounded, not
invented).

## 3. Verification performed (before/after)

**Before:** 21 `DB.users` records (11 original `SEED_USERS` + 10 UAT-specific accounts), 0
`DB.userRoles` records (collection did not exist before this CR).

**After migration** (`tests/erp_arch_2026_001a_rbac_foundation_tests.js`):
- TEST 7: every one of the 21 seeded users has EXACTLY ONE active `userRoles` assignment, and that
  assignment's `businessRoleKey` equals the user's own `role` field — **21/21 verified, zero
  exceptions**.
- TEST 8: `DB.userRoles.length === DB.users.length` (21 === 21) — no user missing an assignment, no
  duplicate assignment.
- TEST 1: the 120-assertion `can()`/`ROLE_ACTIONS` equivalence check (§2 of the Implementation Report)
  is itself a full-coverage proof that migrating to the new engine did not change what any of the 10
  roles can do through the pre-existing, 99+-call-site authorization primitive.

## 4. No unexplained privilege loss or gain

- **No user lost access**: `can()`'s behavior is unchanged by construction (120/120 equivalence), and
  every resource-specific privilege granted is ADDITIVE (not wired into enforcement, so it cannot
  block anything that worked before).
- **No user gained high-risk privilege**: the only NEW, evidence-grounded distinctions introduced
  (`PurchaseOrder.APPROVE`, `PaymentRequest.EXECUTE` restricted to CEO/FinanceManager, explicitly
  excluding Admin) are MORE conservative than the legacy generic tags, not less — and are inert
  (unused by any route) regardless.
- **Intentional differences, fully documented**: the resource-specific duty grants in §2's table are
  the only "difference" from a pure 1:1 carry-forward, and each is explained in the Implementation
  Report §3 with its evidentiary source. None of them is reachable by any real user action today.

## 5. Existing workflows verified intact

The full existing regression battery (`ARCH-2026-001A-REGRESSION-REPORT.md`) — including the
Purchase Order approval chain, Payment Request maker-checker-executor chain, and every other
role-gated workflow — passes unchanged against the migrated, `can()`-refactored codebase.

## 6. Conclusion

Migration verified **deterministic and fully access-preserving**: 21/21 users migrated, 0 unexplained
privilege changes, 120/120 legacy-behavior equivalence assertions passing, full regression battery
green.
