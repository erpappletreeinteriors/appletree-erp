# ARCH-2026-001A — Pre-Implementation Checkpoint

**Date:** 2026-09-21. Read-only reconnaissance, completed BEFORE any code was touched for this CR.
Authorized by ARCH-2026-001A ("Enterprise RBAC Foundation — Controlled Implementation CR"), building
on the frozen `ARCH-2026-001-ARCHITECTURE-FREEZE.md`, `ARCH-2026-001-RBAC-TARGET-DESIGN.md`,
`ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md`, `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md`.

## 1. Current user model

`server/domain.js` — `SEED_USERS` / `DB.users`. Fields per user: `id, username, name, role, active,
assignedProjects, assignedCustomers, assignedBranches, passwordHash, passwordSalt, failedLoginCount,
lockedUntil, mustChangePassword`. Exactly **one role string per user** — no multi-role assignment
exists today. Password hashing: Node `crypto.scryptSync` with per-user salt (`server/auth.js`),
timing-safe verification.

## 2. Current role model

`server/domain.js:371` — `const ROLES = ['Admin','CEO','Accountant','FinanceManager','ProjectManager',
'Purchase','Sales','Estimator','SiteInCharge','Viewer'];` — 10 flat roles, no hierarchy, no
composition.

`server/domain.js:372-383` — `ROLE_ACTIONS`: a role → 12-generic-action-tag boolean matrix
(`view, create, edit, submit, approve, post, reverse, clear, pay, masterData, export, configure`).
This is the single coarse-grained authorization table underlying the generic `can()` check.

## 3. Current authorization path

1. `server/server.js:62` `getActor(req)` — resolves the session cookie to `{id, username, role, name,
   assignedProjects, assignedCustomers, assignedBranches, token}`. Every downstream check reads
   `actor.role` (a plain string) — there is no richer authorization object today.
2. `server/domain.js:389` `function can(actor, action){ return !!(ROLE_ACTIONS[actor.role] &&
   ROLE_ACTIONS[actor.role][action]); }` — the single generic permission-tag check, aliased in
   `server.js:77` as `const can = D.can;` and used at 99+ call sites (per that line's own comment).
3. Many `assertCanXxx(actor)` functions in `domain.js` (e.g. `assertCanClearReceipt`,
   `assertCanPaySupplier`, `assertCanCreateSupplierCreditNote` at lines 5322-5324+) — some wrap
   `can()`, some hard-code an explicit role allow-list (`['Admin','CEO','FinanceManager',
   'Accountant'].includes(actor.role)`).
4. `server/server.js:161` `registerMutationRoute({method, path, permission, roles, authCheck,
   extraCheck, idempotent, auditReject, handler})` — the Phase 21-24 mutation-route registry. Every
   route registered through it MUST declare **exactly one** of `permission` (a `can()` tag),
   `roles` (an explicit array), or `authCheck` (a custom function) — registration throws at server
   startup otherwise. `extraCheck` layers an additional business-scoping rule on top of the base
   check (e.g. Sales may only invoice their own assigned customers). This registry currently covers
   a real but partial subset of routes (~9+ migrated so far per the Phase 22 comment at line 201-211);
   the remaining ~240 mutation routes are still direct if-blocks in `handleRequest()`, each with its
   own inline check, following the same three idioms (`can()` tag / role array / custom condition).
5. `server/server.js:84` `deny(res, code, reason, ctx)` — the single rejection path, always calls
   `D.logAudit({type:'AccessDenied', ...})` before sending the 403.
6. `server/route_safety_scanner.js` — an existing automated scanner that verifies every route
   declares SOME authorization check (used in regression, not modified by this CR).

## 4. Current security middleware

No separate "middleware" layer in the Express sense (this codebase uses Node's bare `http` module,
`server.js:14`, deliberately dependency-free). The equivalent function is `getActor()` (session
resolution) + the per-route check idiom described above, executed inline inside `handleRequest()` for
every request.

## 5. Existing scope-like checks (informal, pre-existing — this CR's Data Scope framework formalizes
   without replacing these)

- `D.isProjectManagerOf(actor, projectId)` (aliased `server.js:83`) — Project Manager restricted to
  `actor.assignedProjects`.
- `D.branchAllowed(actor, branchId)` — branch restriction using `actor.assignedBranches` (Phase 15 §8
  fix: this field was previously missing from `getActor()`'s returned object, making the check
  structurally unreachable; already fixed, unrelated to this CR).
- `D.canSeeLead(actor, lead)` — Sales restricted to `actor.assignedCustomers`-linked leads.
- `pmOrAdminCeo(actor, projectId)` (`server.js:514`).

## 6. Existing approval-authority precedent (this CR's Approval Authority framework formalizes,
   does not replace)

- `DB.poApprovalRules` (`DEFAULT_PO_APPROVAL_RULES`, `domain.js:410`) — amount-tiered `requiredRole`
  for Purchase Order approval (₹500,000 / ₹2,000,000 / unlimited → CEO), read by
  `requiredPOApprovalRole(amount)` (`domain.js:4073`).
- `DB.poApprovalAuthorityMatrix` (`domain.js:897`) — per-role `financialApprovalAuthority`/
  `selfApprovalAllowed`/`selfApprovalLimit`, read by `poApprovalAuthorityFor(role)` (`domain.js:4280`).
- `DB.discountApprovalRules` (`DEFAULT_DISCOUNT_APPROVAL_RULES`, `domain.js:402`) — pct-tiered
  `requiredRole` for Quotation discount approval, read by `requiredDiscountApprovalRole(pct)`
  (`domain.js:3294`).
- `DB.paymentApprovalMatrix` — amount-tiered `requiredApprovalRole` for Payment Requests, read by
  `paymentApprovalRoleFor(amount)` (`domain.js:11012`).

These four tables are ALREADY a real, working, data-driven approval-authority mechanism — narrower in
scope (each hard-wired to one transaction type) than the generic framework this CR proposes, but
proof that the underlying pattern (rule tables keyed by threshold → required role) is already
established practice in this codebase. This CR's `DB.approvalAuthorities` generalizes the SHAPE
without touching any of these four tables or their reader functions.

## 7. Existing SoD-equivalent enforcement (this CR's SoD framework formalizes, does not replace)

- **Payment Request maker-checker** (`domain.js:11112-11122`): `approvePaymentRequest()` rejects if
  `req.maker===actor.id` — the same person who created the request cannot approve it. A distinct
  `executePaymentRequest()` step exists as a third stage (SOP §9: "at least 2, ideally 3, different
  people").
- **Excess Billing / Excess Material Issue Approval** (`domain.js:2571-2573`, `5978+`): explicit
  "genuine second-person maker-checker" comments; same `can(actor,'approve')`-gated pattern.
- **Snag independent-verifier rule** (documented in this engagement's own prior UAT reports,
  `PHASE_41_...`): the Snag verifier cannot be the same person who resolved it, except CEO/Admin.

## 8. Existing audit mechanism

`DB.auditLog` (array, `domain.js:481`) + `logAudit(entry)` (`domain.js:1442`) — the single
authoritative audit-write path, called from `deny()`, every `assertCanXxx` rejection site, and
throughout the business-logic layer. Each entry: `{id: 'AUD-NNNNNN', ...entry, at: nowIso()}`. Wrapped
in try/catch so an audit-write failure can never silently roll back an already-successful business
transaction (Phase 37 Part D comment, line 1438-1441) — logs loudly to console instead.

**Decision for this CR:** security-model events (role/duty/privilege/scope/approval-authority/SoD
changes) will be written through this SAME `logAudit()` path with dedicated `type` values (e.g.
`RoleAssigned`, `SecurityConfigChanged`) — no second, parallel `DB.securityAuditLog` array will be
created. This satisfies §17's "Preserve the existing audit architecture. Do not create duplicate audit
systems."

## 9. Existing tests relevant to this CR

- `tests/erp_059_security_tests.js` (13/13) — session/auth fundamentals.
- `tests/erp_059c_production_isolation_tests.js` (10/10) — environment isolation (CR-2026-002).
- `tests/erp_audit_p0_tests.js` (65/65) — includes unauthorized-access rejection cases.
- `tests/erp_cr_2026_002_env_safety_tests.js` (19/19) — environment/DB-path safety.
- `server/phase21_remediation_tests.js`, `phase21_adversarial_tests.js`, `security_tests.js`,
  `security_matrix.js` — existing role/permission matrix tests (legacy phase-numbered suite, still
  live in the `server/` directory, distinct from the `tests/` directory's newer suites).
- `server/route_safety_scanner.js` — static check that every route declares an authorization
  mechanism.

## 10. Where role names are hard-coded (illustrative, not exhaustive — full census in the Changelog)

- `ROLE_ACTIONS` object keys (`domain.js:373-382`).
- Dozens of `assertCanXxx()` functions with inline `['Admin','CEO',...].includes(actor.role)` arrays.
- `registerMutationRoute({roles:[...]})` declarations in `server.js`.
- `GL_VISIBLE_ROLES` (`domain.js:430`), `poApprovalAuthorityMatrix.roles` keys, and similar
  role-keyed lookup objects scattered through both files.
- `client_secure/index.html`'s `ROLE_MODULES` — explicitly documented (per this engagement's own
  prior memory) as a client-side "discoverability filter only," never a security control.

## 11. Migration risks identified before implementation

1. **Regression risk to `can()`** — it is the single most-called authorization primitive (99+ sites).
   Any change to its behavior, even by construction, risks silent privilege drift. Mitigation: the
   new engine's "Global" legacy-bridge privileges will be MECHANICALLY DERIVED from the existing
   `ROLE_ACTIONS` table at build time (not manually re-typed into a second table), and a dedicated
   120-assertion equivalence test (10 roles × 12 tags) will gate this before anything depends on it.
2. **Seed/migration-guard omission risk** — this engagement's own memory
   (`localstorage_silent_save_failure.md`, a sibling project) records a real prior incident where new
   DB collections were forgotten from the seed object and silently wiped on reload. Mitigation: every
   new collection will be added to BOTH `freshDB()`'s returned object AND a `if(!DB.xxx) DB.xxx = []`
   migration guard, following the exact pattern already used for `reportVariants`
   (`domain.js:1043-1047`) and 15+ other precedents in this same file.
3. **Duplicate-authorization-system risk** — building a second, independently-enforced permission
   engine that competes with the existing one is explicitly prohibited (§4). Mitigation: `can()`
   itself will be refactored to call into the new engine (not duplicated beside it), and no new route
   will be authorized by the new engine alone without also passing through the existing `can()`/
   `roles`/`authCheck` mechanism — the new engine is additive infrastructure, read from `can()`, not a
   second gate a request could pass one but fail the other.
4. **Approval-authority/SoD duplication risk** — the four existing rule tables (§6) and two
   maker-checker enforcement sites (§7) must not be touched or re-implemented. Mitigation: the new
   `approvalAuthorities`/`sodRules` collections will be seeded as DOCUMENTED, READ-ONLY-REFERENCE
   mirrors of the existing values (proving the generic shape), while actual enforcement remains
   entirely on the existing, tested code paths.

## 12. Files expected to change

- `server/domain.js` — new RBAC foundation section (constants, DB collections, effective-permission
  engine, migration function); `can()` refactored to call the new engine; `module.exports` extended.
- `server/server.js` — no route behavior change; possibly a new read-only admin endpoint for
  effective-permission reporting (§20/§34's "security administration foundation" — evaluated during
  implementation, added only if it can be done without touching any existing route's authorization).
- New test file(s) under `tests/` for the security test matrix and negative tests.
- `CONTROLLED_CHANGE_REGISTER.md` — updated.
- New reports: `ARCH-2026-001A-RBAC-IMPLEMENTATION-REPORT.md`,
  `ARCH-2026-001A-ROLE-MIGRATION-REPORT.md`, `ARCH-2026-001A-SECURITY-TEST-REPORT.md`,
  `ARCH-2026-001A-REGRESSION-REPORT.md`, `ARCH-2026-001A-CHANGELOG.md`.

## 13. Files explicitly protected — will NOT be touched by this CR

- `server/db.json` (production data) — read-only throughout; all testing via CR-2026-002's isolated
  test-server mechanism.
- `server/db.json.bak`, `server/db.json.lock` — untouched.
- Any of the four existing approval-authority tables/functions (§6).
- Either existing maker-checker enforcement site (§7).
- `client_secure/index.html` — no UI change is required to prove a server-side foundation; if any
  admin-facing screen is added, it will be additive-only and separately called out — evaluated during
  implementation.
- `server/env.js`, `server/scripts/start-isolated-test-server.js` (CR-2026-002) — used, not modified.
- Any of the 26-domain business logic files/functions untouched by RBAC (e.g. no Manufacturing,
  Service, HR-adjacent code).
- `server/route_safety_scanner.js` — used for regression, not modified.

## 14. Confirmation

This checkpoint was completed by reading the current codebase, not by assumption. Implementation
begins only after this document is written. No code has been modified to produce this checkpoint.
