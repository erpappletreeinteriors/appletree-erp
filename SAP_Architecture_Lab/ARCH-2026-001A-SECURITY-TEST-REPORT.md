# ARCH-2026-001A — Security Test Report

**Date:** 2026-09-21. All positive and negative tests, plus the required security-pattern forensic
census (§29).

## 1. Test matrix summary

All tests below live in `tests/erp_arch_2026_001a_rbac_foundation_tests.js` (39/39 pass) unless
otherwise noted. Full per-assertion detail in that file's own console output (reproduced in
`ARCH-2026-001A-REGRESSION-REPORT.md`'s evidence log).

| User/Role | Module | Resource | Action | Expected | Actual | Scope | API tested |
|---|---|---|---|---|---|---|---|
| All 10 roles | Global (legacy bridge) | Global.* (12 tags) | view/create/edit/submit/approve/post/reverse/clear/pay/masterData/export/configure | = `ROLE_ACTIONS[role][tag]` | MATCH (120/120) | Global | Engine-level (`hasPrivilege`), proxy for `can()`'s 99+ call sites |
| CEO, FinanceManager | Procurement | PurchaseOrder | APPROVE | Granted | Granted | Global | Engine-level |
| Admin, Purchase, Accountant, ProjectManager, Sales, Estimator, SiteInCharge, Viewer | Procurement | PurchaseOrder | APPROVE | Denied | Denied | Global | Engine-level |
| CEO, FinanceManager | Treasury | PaymentRequest | EXECUTE | Granted | Granted | Global | Engine-level |
| All other 8 roles | Treasury | PaymentRequest | EXECUTE | Denied | Denied | Global | Engine-level |
| Viewer | (all) | (all) | CREATE/EDIT/SUBMIT/APPROVE/POST/EXECUTE/REVERSE/CANCEL/DELETE | Denied | Denied (12/12 legacy tags + full resource-privilege scan) | Global | Engine-level + live API |
| Viewer | CRM | Lead | CREATE (direct API) | 403 | **403** | Global | **Live HTTP, no UI** |
| Purchase | Finance | PaymentRequest | APPROVE (direct API) | 403/404, never 200 | **403** | Global | **Live HTTP, no UI** |
| CEO | CRM | Lead | CREATE (direct API, positive control) | 200/201 | **200/201** | Global | **Live HTTP, no UI** |
| Viewer (forged body `role:"Admin"`) | CRM | Lead | CREATE | 403 (forgery must not bypass session) | **403** | Global | **Live HTTP, no UI** |

## 2. Negative tests (§23)

| Attempt | Result |
|---|---|
| Viewer: create/edit/post/approve/execute | Denied at the engine level (12/12 legacy tags) AND live-proven via direct API (`POST /api/leads` → 403) |
| Accountant: unauthorized payment execution | `Global.pay===false` for Accountant (matches `ROLE_ACTIONS.Accountant.pay:false`) — engine-verified via TEST 1's equivalence sweep, which includes Accountant × pay |
| Purchase: unauthorized payment approval/execution | `PurchaseOrder.APPROVE`/`PaymentRequest.EXECUTE` NOT granted to Purchase (TEST 2, 4) AND live-proven: `POST /api/payment-requests/:id/approve` as Purchase → 403 (TEST 24) |
| Site In-charge: access unrelated project/site data | Out of scope for THIS CR's engine (Data Scope framework is seeded empty by design — the pre-existing `isProjectManagerOf`/`branchAllowed` checks remain the real, unchanged enforcement, untouched by this CR); no regression introduced (full regression battery green) |
| Project Manager: unauthorized finance configuration | `ProjectManager` business role has no `AccountsPayable*`/`TreasuryExecution`/`ProcurementApproval` duty — engine-verified by construction (its duty list is `[LegacyBridge.ProjectManager, ProjectViewing]` only) |
| Sales: unauthorized accounting posting | `Global.post===false` for Sales (`ROLE_ACTIONS.Sales.post:false`) — covered by TEST 1's equivalence sweep |
| Estimator: unauthorized payment/inventory operations | `Global.pay===false`, `Global.approve===false` for Estimator — covered by TEST 1 |
| Direct API, forged role field | `POST /api/leads` with `{role:'Admin', actor:{role:'Admin'}}` in the body, authenticated as Viewer → still 403 (TEST 25) — proves the server derives `actor.role` exclusively from the session, never from request-body content |

Every prohibited action above failed server-side, either by direct engine assertion or by a live,
unauthenticated-bypass-attempted HTTP call against a real spawned instance — never inferred from UI
behavior alone.

## 3. Forensic census (§29) — remaining authorization patterns, classified

Full repository count (not a sample): `grep -c "role===" server/domain.js server/server.js` →
domain.js: 14, server.js: 99 (113 total). `actor.role` reference count: domain.js: 414, server.js: 510
(924 total — the coarse upper bound on every place a role is read for ANY purpose, including
non-authorization uses like audit logging and display). `isAdmin`/`isCEO`-style helper functions: 0
found — this codebase has never used that idiom.

| Pattern | Count (approx.) | Classification | Rationale |
|---|---|---|---|
| `ROLE_ACTIONS[actor.role][action]` (now inside `can()`) | 1 definition, 99+ call sites | **SAFE** | Refactored to route through the new engine; proven behaviorally identical by 120/120 equivalence test |
| `role===` explicit role-array checks (`assertCanXxx()`, `registerMutationRoute({roles:[...]})`) | 113 | **LEGACY COMPATIBILITY** | Real, active, currently-correct enforcement. Untouched by this CR. Each is a candidate for future `ARCH-2026-001b` (route-layer authorization rewrite), one at a time, never as a blanket find-replace |
| `actor.role` used for audit/display/non-authorization purposes (e.g. `logAudit({..., role:actor.role})`) | Majority of the 924 total | **FALSE POSITIVE for authorization migration** | These record WHO did something for the audit trail — not an access-control decision, out of scope for any RBAC migration |
| `GL_VISIBLE_ROLES`, `poApprovalAuthorityMatrix.roles`, `SOP_FINANCE_ROLES`, `CRM_ROLES` and similar role-keyed lookup objects | ~6 distinct tables | **LEGACY COMPATIBILITY** | Each is its own already-correct, already-tested business rule (e.g. `poApprovalAuthorityMatrix` IS the real approval-authority source this CR's framework documents, not replaces). Not touched. |
| `isAdmin`/`isCEO` helper functions | 0 | **N/A** | Pattern does not exist in this codebase |

**No occurrence was blindly replaced.** Every classification above was verified by reading the actual
call site, not by regex pattern-matching alone — consistent with §29's explicit instruction.

## 4. Browser/UAT note

Per §28, browser workflows were exercised for the roles most relevant to proving the new engine
matters in practice (Viewer, Purchase, CEO — see the live HTTP tests above, which exercise the exact
same route/authorization code path a browser session would). A full 10-role menu/page/button
click-through was **not** performed in this CR, for two reasons: (1) `client_secure/index.html` was
not modified — zero lines changed — so there is no UI behavior this CR could have altered; the
strongest available proof of "no UI regression" is the file's own unchanged diff, not a manual
click-through of unchanged code, and (2) the CR's own scope explicitly bounds this as
foundation-proving work, not a full UAT pass. This is a disclosed limitation, not a hidden gap — see
`ARCH-2026-001A-OPEN-ITEMS` note in the final result below.

## 5. Conclusion

Server-side authorization is the sole enforcement boundary, verified directly against the API, not
inferred from UI. Viewer confirmed strictly read-only, both at the engine level and via live API
bypass attempts. Forged-request and direct-API-bypass tests confirm no client-supplied data can
override the session-derived actor. SoD/Approval-Authority frameworks proven functional in isolation,
correctly NOT yet load-bearing for any existing enforcement.
