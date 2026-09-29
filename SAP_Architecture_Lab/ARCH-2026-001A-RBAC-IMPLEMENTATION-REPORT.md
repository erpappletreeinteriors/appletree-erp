# ARCH-2026-001A — RBAC Implementation Report

**Date:** 2026-09-21. What was implemented, grounded in the pre-implementation checkpoint
(`ARCH-2026-001A-PREIMPLEMENTATION-CHECKPOINT.md`) and the frozen design documents.

## 1. What was built

A data-driven implementation of the frozen target model, entirely inside `server/domain.js`:

```
USER -> BUSINESS ROLE -> DUTIES -> PRIVILEGES -> ACTIONS -> DATA SCOPE -> APPROVAL AUTHORITY
     -> SoD -> SERVER-SIDE AUTHORIZATION -> AUDIT
```

| Layer | Implementation |
|---|---|
| User | `DB.users` (unchanged) |
| Business Role | `RBAC_BUSINESS_ROLES` — 10 entries, 1:1 with the existing 10 roles |
| Duties | `RBAC_DUTIES` — 18 entries (10 auto-generated `LegacyBridge.<role>` + 8 resource-specific) |
| Privileges | `RBAC_PRIVILEGES` — 28 entries (12 `Global.*` legacy-bridge + 16 resource-specific) |
| Actions | `RBAC_ACTIONS` — the 12-word canonical vocabulary from §6 (VIEW/CREATE/EDIT/SUBMIT/APPROVE/POST/EXECUTE/REVERSE/CANCEL/DELETE/EXPORT/PRINT), used by the resource-specific privilege slice |
| Data Scope | `DB.roleScopes` — framework present, seeded empty (no restriction invented) |
| Approval Authority | `DB.approvalAuthorities` — 3 reference rows pointing at the 4 pre-existing rule tables |
| SoD | `DB.sodRules` / `DB.sodExceptions` + `checkSoD()` — 4 reference rows + a working generic evaluator |
| Server-Side Authorization | Unchanged — every existing route still enforces via `can()`/`roles`/`authCheck`; `can()` itself now reads from the new engine |
| Audit | Unchanged — new security events use the SAME `logAudit()`/`DB.auditLog` path, no new array |

## 2. Backward compatibility — the central design commitment

`can(actor, action)` — the pre-existing, 99+-call-site permission primitive — was refactored to call
`hasPrivilege(actor, 'Global.'+action)`. The `Global.*` privileges are **mechanically derived** from
the unchanged `ROLE_ACTIONS` table at module-load time (`RBAC_LEGACY_TAGS.forEach(tag => ...
ROLE_ACTIONS[role][tag]===true ...)`) — there is no second, hand-maintained copy of this data that
could silently drift. This is verified by `tests/erp_arch_2026_001a_rbac_foundation_tests.js` TEST 1:
**120/120 assertions** (10 roles × 12 legacy tags) confirming `hasPrivilege(actor, 'Global.'+tag) ===
ROLE_ACTIONS[role][tag]` for every combination — `can()`'s behavior is unchanged by construction, not
by inspection alone.

`can()` also retains a defensive fallback to the original direct `ROLE_ACTIONS` lookup for any actor
not backed by a real `DB.users` record, so no caller shape that worked before this refactor can be
newly broken.

## 3. Resource-specific privilege slice — proving the full model

Beyond the legacy bridge, 16 resource-specific privileges across 4 resources (`PurchaseOrder`,
`SupplierBill`, `PaymentRequest`, `Project`) prove Duties actually compose Privileges into a coherent,
resource-aware model — not just a renamed copy of the 12 generic legacy tags. Two examples, chosen
because they demonstrate GREATER precision than the legacy system, grounded in real existing data:

- **`PurchaseOrder.APPROVE`** is granted to exactly `{CEO, FinanceManager}` — read directly from
  `DB.poApprovalAuthorityMatrix.roles.*.financialApprovalAuthority`, NOT from the generic legacy
  `approve` tag (which Admin also holds). This correctly EXCLUDES Admin, consistent with the existing
  Phase 12 P0 fix's own principle ("System Administration Authority != Financial Approval Authority").
  Verified by TEST 2 and TEST 3.
- **`PaymentRequest.EXECUTE`** is granted to exactly `{CEO, FinanceManager}` (TEST 4) — matching who
  can genuinely act as the third-person executor in the existing SOP §9 workflow.

This slice is **read-only infrastructure** — `D.hasPrivilege()` / `D.effectivePrivilegesForUser()` are
exported and available, but nothing in `server.js` was changed to consult them. No existing route's
enforcement changed. A future, separately-authorized CR (`ARCH-2026-001b`) would adopt this privilege
set into real route enforcement, one route at a time.

## 4. Data Scope, Approval Authority, SoD — frameworks, not redesigns

- **Data Scope**: `DB.roleScopes` starts empty (TEST 9) — no restriction invented for any existing
  user. The pre-existing informal scope checks (`isProjectManagerOf`, `branchAllowed`, `canSeeLead`)
  remain the real, unchanged enforcement.
- **Approval Authority**: `DB.approvalAuthorities` holds 3 rows (TEST 10) that DOCUMENT the existing
  `poApprovalRules`/`poApprovalAuthorityMatrix`, `discountApprovalRules`, and `paymentApprovalMatrix`
  tables/functions — none of those four are modified, read, or re-implemented by this CR's own
  enforcement paths.
- **SoD**: `DB.sodRules` holds 4 rows (TEST 11) documenting the existing Payment Request maker-checker
  (`req.maker===actor.id` check), the maker/checker/executor 3-person separation, the Excess Billing/
  Material Issue second-person approval, and the Snag verifier/resolver rule. `checkSoD()` is a real,
  working generic evaluator (TEST 12-14), proven by unit test, **not called from any existing
  enforcement path** — the existing hardcoded checks remain the sole active enforcement.

## 5. Security administration foundation

`assignUserRole()` and `getEffectivePermissionsReport()` — both gated to `Admin`/`CEO` only (TEST 15,
17), both auditable: `assignUserRole()` writes a `SecurityRoleAssigned` entry through the existing
`logAudit()`/`DB.auditLog` path (TEST 16), never a new audit system.

## 6. Existing 10 roles — confirmed operational, confirmed unchanged

Every one of the 10 existing roles (`Admin, CEO, Accountant, FinanceManager, ProjectManager, Purchase,
Sales, Estimator, SiteInCharge, Viewer`) maps to a Business Role of the identical name — no renaming,
no deletion, no new role invented. See `ARCH-2026-001A-ROLE-MIGRATION-REPORT.md` for the full
before/after verification.

## 7. Final forensic check

- Production `server/db.json`: sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, mtime `2026-09-19T09:24:59.947Z` — IDENTICAL before this CR began, after the code
  changes, after the new test suite, after the full regression battery, and at final sign-off. Same
  values recorded at the end of CR-2026-002 — proves this CR made zero writes to the production file
  at any point.
- `server/db.json.bak`: mtime unchanged (`2026-09-19T09:24:59.947Z`).
- `server/db.json.lock`: present, pre-existing (unrelated to this CR — every isolated test instance
  this CR spawned used its own scratch-directory lock file, never this one).
- The Sep 19 login-history record: untouched (implied by the unchanged file hash — no byte of
  `server/db.json` changed).
- No Phase 39/40/43 code was modified — `withTransaction()` call sites for `submitPurchaseOrder()`,
  `approvePurchaseOrder()`, `executePaymentRequest()`, `issueProductionMaterial()`,
  `issueServiceMaterial()`, `submitStockCount()` are untouched (confirmed by `git diff` scope: only
  the RBAC Foundation section, the `can()` refactor, the `freshDB()`/migration-guard additions, and
  the `module.exports` addition were touched in `domain.js` — no other function's body changed).

## 8. What this CR explicitly did NOT do

- Did not implement HR, Payroll, Maintenance/EAM, PLM, MRP, Transportation, or Advanced Warehouse.
- Did not implement any new business workflow, accounting engine, inventory engine, or project-cost
  engine.
- Did not redesign any existing business approval matrix — the four existing tables/functions are
  untouched.
- Did not implement every business-domain SoD rule — only the 4 already-existing rules were
  formalized as reference data.
- Did not decide the CEO/technical-administrator split (`ARCH-2026-001f` remains blocked on that
  open management decision).
- Did not wire the new resource-specific privileges into any existing route's enforcement.
- Did not touch `server/server.js` or `client_secure/index.html`.
