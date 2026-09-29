# ARCH-2026-001A — Changelog

**Date:** 2026-09-21. Every code/configuration change made for this CR, in one place.

## Files changed

### `server/domain.js` — the only application-code file modified

One new section, "ARCH-2026-001A — Enterprise RBAC Foundation," inserted between the existing
`ROLE_ACTIONS` table and the existing `can()` function (previously line 383/389), plus three smaller,
targeted edits elsewhere in the same file. No other function in this file was touched.

1. **New RBAC Foundation section** (~230 new lines): `RBAC_ACTIONS`, `RBAC_LEGACY_TAGS`,
   `RBAC_PRIVILEGES` (28 privileges: 12 mechanically-derived `Global.*` legacy-bridge privileges + 16
   hand-defined resource-specific privileges across `PurchaseOrder`, `SupplierBill`, `PaymentRequest`,
   `Project`), `RBAC_DUTIES` (18 duties: 10 auto-generated `LegacyBridge.<role>` duties + 8
   resource-specific duties), `RBAC_BUSINESS_ROLES` (10 business roles, 1:1 with the existing 10
   roles), `RBAC_APPROVAL_AUTHORITIES_SEED` (3 descriptive/reference rows), `RBAC_SOD_RULES_SEED` (4
   descriptive/reference rows), `checkSoD()`, `effectiveDutyKeysForBusinessRole()`,
   `effectivePrivilegeKeysForBusinessRole()`, `effectivePrivilegesForUser()`, `hasPrivilege()`,
   `assignUserRole()`, `getEffectivePermissionsReport()`, `_rbacResolveBusinessRoleKeyForUser()`
   (internal).
2. **`can(actor, action)` refactored** (previously a direct `ROLE_ACTIONS[actor.role][action]` lookup)
   to call `hasPrivilege(actor, 'Global.'+action)`, with a defensive fallback to the original direct
   lookup for any actor not backed by a real `DB.users` record. `ROLE_ACTIONS` itself is UNCHANGED —
   it remains the single source of truth the `Global.*` privileges are mechanically derived from.
3. **`freshDB()`** — added 5 new collection initializers: `userRoles: []`, `roleScopes: []`,
   `approvalAuthorities: JSON.parse(JSON.stringify(RBAC_APPROVAL_AUTHORITIES_SEED))`,
   `sodRules: JSON.parse(JSON.stringify(RBAC_SOD_RULES_SEED))`, `sodExceptions: []`.
4. **Migration guard section** (after the existing `reportVariants` guard) — 5 `if(!DB.xxx)` guards
   for the same 5 new collections (patches an already-persisted db.json that predates this CR,
   following the exact existing pattern used 15+ times elsewhere in this file), plus a one-time,
   deterministic migration loop: every `DB.users` record gets exactly one `DB.userRoles` row
   (`businessRoleKey === user.role`), only when `DB.userRoles.length===0`.
5. **`module.exports`** — added: `RBAC_ACTIONS, RBAC_PRIVILEGES, RBAC_DUTIES, RBAC_BUSINESS_ROLES,
   RBAC_APPROVAL_AUTHORITIES_SEED, RBAC_SOD_RULES_SEED, checkSoD, effectiveDutyKeysForBusinessRole,
   effectivePrivilegeKeysForBusinessRole, effectivePrivilegesForUser, hasPrivilege, assignUserRole,
   getEffectivePermissionsReport`.

### Files NOT changed

- `server/server.js` — read for reconnaissance only. No route, middleware, or authorization check
  modified. `can` continues to be imported as `const can = D.can;` with zero code change needed there.
- `client_secure/index.html` — not touched. No UI change is required to prove a server-side
  foundation; the new engine is not wired into any UI-facing behavior.
- `server/env.js`, `server/scripts/start-isolated-test-server.js` (CR-2026-002) — used for testing,
  not modified.
- The four pre-existing approval-authority tables/functions (`poApprovalRules`,
  `poApprovalAuthorityMatrix`, `discountApprovalRules`, `paymentApprovalMatrix` and their reader
  functions) — untouched.
- The two pre-existing maker-checker enforcement sites (`approvePaymentRequest()`'s
  `req.maker===actor.id` check; the Excess Billing/Material Issue approval functions) — untouched.
- `server/db.json` (production data), `server/db.json.bak`, `server/db.json.lock` — untouched
  throughout (verified by hash, see the Final Forensic Check in
  `ARCH-2026-001A-RBAC-IMPLEMENTATION-REPORT.md`).

## New files created

- `ARCH-2026-001A-PREIMPLEMENTATION-CHECKPOINT.md`
- `tests/erp_arch_2026_001a_rbac_foundation_tests.js` (39 assertions)
- `ARCH-2026-001A-RBAC-IMPLEMENTATION-REPORT.md`
- `ARCH-2026-001A-ROLE-MIGRATION-REPORT.md`
- `ARCH-2026-001A-SECURITY-TEST-REPORT.md`
- `ARCH-2026-001A-REGRESSION-REPORT.md`
- `ARCH-2026-001A-CHANGELOG.md` (this file)

## Correction made during implementation (disclosed, not hidden)

The first draft of `RBAC_BUSINESS_ROLES.FinanceManager`'s duty list omitted the `ProcurementApproval`
duty, meaning the new engine's `PurchaseOrder.APPROVE` privilege would have been granted only to CEO,
not to FinanceManager — inconsistent with the existing `poApprovalAuthorityMatrix`, where
`FinanceManager.financialApprovalAuthority===true`. This was caught by
`tests/erp_arch_2026_001a_rbac_foundation_tests.js` TEST 2 on the first run (a genuine test failure,
not a rubber-stamped pass) and fixed by adding `'ProcurementApproval'` to FinanceManager's duty list.
Re-run confirmed 39/39 pass. This privilege was never wired into any enforcement path, so the defect
had zero production/business impact at any point — it was caught before anything could have depended
on it.

A second issue was found and fixed in the TEST HARNESS itself (not the product code): Part 1 of the
new test file set `process.env.APP_ENV`/`process.env.DB_PATH` to isolate its own `require('./domain')`
call, but did not restore them afterward — Part 3's `execSync` call to
`erp_059c_production_isolation_tests.js` inherited the leaked values, causing that self-spawning
regression test's own child processes to see the wrong `APP_ENV`, producing 5 false failures. Fixed by
saving and restoring `process.env` around Part 1's `require()`. Confirmed as a test-harness-only issue
by running `erp_059c_production_isolation_tests.js` standalone (10/10 pass) before and after the fix.
