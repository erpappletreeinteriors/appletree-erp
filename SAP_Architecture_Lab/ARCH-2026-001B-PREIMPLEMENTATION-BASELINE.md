# ARCH-2026-001B — Pre-Implementation Baseline

**Date:** 2026-09-21. Read-only reconnaissance, completed before any ARCH-2026-001B code change.

## 1. Current commit / working-tree status

- Current commit: `77a403bd5a433c838a1f6698fe835c34e0482215`.
- `git status --short` at the start of this CR showed pre-existing, expected uncommitted changes:
  `M ../.claude/launch.json`, `M APPLETREE_ERP_USER_MANUAL.md`, `D PHASE39_DATA_INTEGRITY_FORENSIC_REPORT.md`,
  `M client_secure/index.html`, `M server/domain.js`, `M server/server.js`, plus a large number of
  untracked report/document files. This is the SAME cumulative uncommitted state left by
  CR-2026-001, CR-2026-002, and ARCH-2026-001A earlier in this engagement — this repository's
  established working pattern does not commit after every CR. **This is not unexpected/foreign
  change** — it is this engagement's own accumulated, disclosed work, verified against this
  session's own edit history. No other session's work was overwritten.

## 2. Current database environment

- `DB_PATH`/`APP_ENV` resolution: `server/env.js` (CR-2026-002), unchanged by this CR's baseline.
- Production DB: `server/db.json`.

## 3. Current DB hash (production, before this CR)

- sha256: `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`
- Size: 52,518 bytes
- mtime: `2026-09-19T09:24:59.947Z`
- `db.json.bak` mtime: `2026-09-19T09:24:59.947Z` (unchanged)
- `db.json.lock`: present (pre-existing, unrelated — see the Sep 19 provenance investigation)

Identical to the value recorded at the close of ARCH-2026-001A — confirms nothing has touched
production data between that CR's close and this one's start.

## 4. Existing authorization functions (as left by ARCH-2026-001A)

- `can(actor, action)` (`server/domain.js`) — powered by `hasPrivilege(actor, 'Global.'+action)`,
  itself backed by the mechanically-derived `Global.*` legacy-bridge privileges, with a defensive
  fallback to the original direct `ROLE_ACTIONS` lookup for non-DB-backed actors.
- `hasPrivilege(actor, privilegeKey)`, `effectivePrivilegesForUser()`,
  `effectivePrivilegeKeysForBusinessRole()`, `effectiveDutyKeysForBusinessRole()` — the centralized
  engine, all exported from `domain.js`.
- `assignUserRole()`, `getEffectivePermissionsReport()` — security administration foundation.
- `registerMutationRoute()` (`server/server.js`) — the Phase 21-24 mutation-route registry, an
  ALREADY-CENTRALIZED mechanism for routes registered through it (requires exactly one of
  `permission`/`roles`/`authCheck` — throws at startup if omitted). Treated in this CR as an
  "approved equivalent" central mechanism per this CR's own §8 — routes already using it are not
  re-migrated to `can()`/`hasPrivilege()` merely to reduce inline-check counts.
- Dozens of `assertCanXxx(actor)` functions in `domain.js` — some already call `can()`, some use
  inline role arrays (the migration targets for this CR).

## 5. Existing middleware / route dispatch

No Express-style middleware (bare Node `http`, deliberate — see `server.js`'s own header comment).
Every request resolves `actor` via `getActor(req)`, then either matches a `registerMutationRoute()`
entry or falls into the large legacy `handleRequest()` if-block chain, each with its own inline
authorization check.

## 6. Existing role checks — quantified before this CR

- `role===` occurrences: `server/domain.js` 14, `server/server.js` 99 — **113 total**, matching the
  exact number ARCH-2026-001A's own forensic census reported and this CR's own brief independently
  re-states as the verified baseline.
- `actor.role` reference count (broader, includes non-authorization uses like audit/display):
  `domain.js` 414, `server.js` 510 — 924 total.
- `isAdmin`/`isCEO`-style helper functions: 0 (this idiom has never been used in this codebase).

Full occurrence-by-occurrence classification: `ARCH-2026-001B-LEGACY-AUTH-INVENTORY.md`.

## 7. Existing permission registry

`RBAC_PRIVILEGES`, `RBAC_DUTIES`, `RBAC_BUSINESS_ROLES` (`server/domain.js`, ARCH-2026-001A) — 28
privileges (12 legacy-bridge + 16 resource-specific), 18 duties, 10 business roles (1:1 with the
existing 10 roles).

## 8. Existing security tests

- `tests/erp_arch_2026_001a_rbac_foundation_tests.js` — 39/39 (ARCH-2026-001A).
- `tests/erp_059_security_tests.js` — 13/13.
- `tests/erp_059c_production_isolation_tests.js` — 10/10 (standalone, confirmed fresh this session).
- `tests/erp_cr_2026_002_env_safety_tests.js` — 19/19.
- `server/route_safety_scanner.js` — static route-declaration check (used for regression, not
  modified).

## 9. Existing regression result (immediately before this CR)

All suites listed in ARCH-2026-001A's own `ARCH-2026-001A-REGRESSION-REPORT.md` passed at that CR's
close. Re-confirmed fresh at the start of THIS CR: `erp_arch_2026_001a_rbac_foundation_tests.js`
39/39, `erp_059c_production_isolation_tests.js` 10/10 (both run standalone before any 001B code
change, see console output captured in this CR's own regression report).

## 10. Files expected to change in this CR

- `server/domain.js` — additive privilege/duty/business-role entries (extending, not replacing,
  ARCH-2026-001A's registry) + up to ~4-6 enforcement-site edits (inline role-array checks replaced
  by `hasPrivilege()` calls), scoped to the high-risk-list-relevant, unambiguous authorization gates
  identified in the inventory.
- `server/server.js` — a small number of matching enforcement-site edits (same pattern).
- New test file: `tests/erp_arch_2026_001b_route_auth_migration_tests.js`.
- New reports (6, listed in the CR's own §24) + `CONTROLLED_CHANGE_REGISTER.md` update.

## 11. Confirmation

No code was modified to produce this baseline. Implementation begins only after this document and
the full legacy-auth inventory are complete.
