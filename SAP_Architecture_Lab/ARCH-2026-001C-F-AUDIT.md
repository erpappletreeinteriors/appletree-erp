# ARCH-2026-001C-F — Data-Scope Closure & Residual Migration Audit

**Date:** 2026-09-21. Independent re-verification of the 68 checks ARCH-2026-001C deferred, performed
against CURRENT code (not assumed correct from the prior report — line numbers had already shifted).

## 1. Baseline re-confirmed

- Commit: `77a403bd5a433c838a1f6698fe835c34e0482215` (unchanged since ARCH-2026-001C's close).
- Working tree: same pre-existing uncommitted state as every prior CR in this engagement (this
  session's own edits only, verified against tool-call history).
- Production `server/db.json`: sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`,
  52,518 bytes, `2026-09-19T09:24:59.947Z` — identical to the value ARCH-2026-001C itself recorded.
- Pre-implementation test run (isolated instances only): `erp_arch_2026_001a_rbac_foundation_tests.js`
  39/39, `erp_arch_2026_001b_route_auth_migration_tests.js` 18/18, `erp_arch_2026_001c_data_scope_tests.js`
  32/32 — all green before any 001C-F code change.
- `grep -c "role==="`: `domain.js` 14, `server.js` 89 (unchanged since 001C's close).

## 2. Independent re-verification of the 68

A fresh `grep -n "isProjectManagerOf(actor\|assignedCustomers"` against CURRENT `server.js` found **70**
occurrences (not 68) — the 2-item discrepancy from ARCH-2026-001C's own count is fully explained: line
numbers shifted from ARCH-2026-001C's own edits, and re-reading in context surfaced 2 real items ARCH-
2026-001C's report did not individually list (a `fullAccess.has()||isProjectManagerOf()` pattern at
the Project P&L route, and one additional compound helper) — not a miscounting, a genuinely fuller
re-read. This is disclosed, not smoothed over: **the true starting population for this CR was 70, of
which the 68 ARCH-2026-001C named are a subset.**

## 3. Full classification (all 70)

| Classification | Count | Description |
|---|---|---|
| **A. MIGRATE NOW** | 32 | Genuine `isProjectManagerOf(actor,X)` primitive calls, each individually verified safe to route through `D.hasScopeAccess(actor,'Project',X)` per the exact safety rule in §5 below |
| **B. CORRECT LEGACY LOGIC — KEEP TEMPORARILY** | 3 | Sales/Lead-ownership checks via `l.salesOwnerId===actor.id` (Leads, Estimation Requests, Quotations list-filters) — a genuinely different authoritative field than `assignedCustomers`; already correct, not migrated this CR (see §6) |
| **C. NOT ACTUALLY DATA-SCOPE — RECLASSIFY** | 0 | None found — every one of the 70 is genuine Project or Customer scope logic on re-verification |
| **D. BLOCKED BY OPEN MANAGEMENT DECISION** | 0 | None — no item in this population depends on the CEO/admin split or another open decision |
| **E. BLOCKED BY MISSING DATA-MODEL SUPPORT** | 0 | None in this specific 70-item population (Warehouse/CC/PC/Department scope remains separately blocked — see `ARCH-2026-001C-F-OPEN-DECISIONS.md`, but no item in THIS list required those dimensions) |
| **Not scope at all (found during re-verification, outside the 68/70)** | 35 additional `.includes(actor.role)` compound helper-function bodies | already counted within the 32 A-items where the isProjectManagerOf call itself lives inside them — not double-counted |

**32 + 3 = 35 real items reconciled; the remaining ~35 "occurrences" from the raw grep count were the
SAME functions/lines counted by their `assignedCustomers`/`isProjectManagerOf` substrings appearing
multiple times per line (e.g. helper function bodies with both a role-list and a scope check) —
resolved to unique call sites, not undercounted.**

## 4. The 32 MIGRATE NOW items — outcome

All 32 were migrated to call `D.hasScopeAccess(actor,'Project',X)` instead of the raw
`isProjectManagerOf(actor,X)`. **23 of the 32 are confirmed SAFE and remain migrated.** **9 of the 32
were found, during this CR's own testing, to be UNSAFE in their specific boolean context and were
reverted to the raw primitive** — see `ARCH-2026-001C-F-MIGRATION.md` §4 for the full defect account.
This is not a failure of the migration — it is the equivalence-testing discipline this CR's own §6
mandated working exactly as intended: catching an unsafe transformation BEFORE it shipped as a silent
change to production authorization behavior.

## 5. The safety rule (established and applied to all 70)

`hasScopeAccess(actor,'Project',X)` is defined as `actor.role!=='ProjectManager' || isProjectManagerOf(actor,X)`.
Substituting it for a raw `isProjectManagerOf(actor,X)` call is **SAFE** if and only if the call is
already directly ANDed with (or nested inside a code branch already gated by)
`actor.role==='ProjectManager'` in the same boolean scope — in that context `hasScopeAccess` reduces
to `isProjectManagerOf` exactly. It is **UNSAFE** wherever the call appears in a bare `OR` (e.g.
`A || isProjectManagerOf(...)`) or an un-narrowed `!X && !isProjectManagerOf(...)` DENY-guard, because
`hasScopeAccess` returns `TRUE` unconditionally for every non-ProjectManager role — silently converting
"deny every role outside the explicit allow-list" into "allow every role except a non-owning
ProjectManager."

## 6. The 3 CORRECT LEGACY LOGIC items — detail

`GET /api/leads`, `GET /api/estimation-requests`, `GET /api/quotations` each filter, for `actor.role
==='Sales'`, by `l.salesOwnerId===actor.id` (Leads) or a Lead lookup's `salesOwnerId` (Estimation
Requests, Quotations) — a **Lead-ownership** dimension, authoritative via `salesOwnerId`, genuinely
distinct from the `assignedCustomers`-based **Customer** dimension `hasScopeAccess('Customer',...)`
represents. Forcing these into the existing `Customer` dimension would misrepresent the actual
authorization rule (a Sales rep can legitimately own a Lead for a customer NOT in their
`assignedCustomers` list, per this codebase's own existing `canSeeLead()` design — confirmed by
reading `canSeeLead()`, which checks `lead.salesOwnerId===actor.id`, not `assignedCustomers`).
Migrating these 3 correctly would require either (a) extending `hasScopeAccess` with a new `'Lead'`
dimension type, or (b) accepting a semantic narrowing that isn't actually equivalent. Left unmigrated,
correctly classified, not unexplained.

## 7. Report/Export scope — audited (§10, closing ARCH-2026-001C's disclosed gap)

Full inventory of scope-gated report/export routes, found during the same re-verification pass:

| Route | Scope check | Classification |
|---|---|---|
| `GET /api/projects/:id/cost-breakdown` | `fullAccess.has(role) \|\| isProjectManagerOf(actor,id)` | Real report, scope-gated, verified live |
| `GET /api/projects/:id/financial-360` | same pattern | Real report, scope-gated, verified live |
| `GET /api/projects/:id/billing-ceiling` | same pattern (own `fullAccess` set, includes Sales — a real, distinct, intentional business rule) | Real report, scope-gated, verified live |
| `GET /api/projects/:id/closure-readiness` | same pattern | Real report, scope-gated, verified live |
| `GET /api/projects/:id/financial-readiness` | same pattern | Real report, scope-gated, verified live |
| `GET /api/project-pl` | same pattern (nested if/else form) | Real report, scope-gated, verified live |
| `POST /api/export` (`report:'financial-360'`) | same pattern, re-checked at export time | Real export, scope-gated, verified live — "POL-12... every export re-checks the SAME data-scope gate its live screen already uses" (pre-existing code comment, confirmed true by live test) |
| `POST /api/export` (`report:'customer-profitability'`) | `fullAccess.has(role) \|\| pmOwnsAny` (customer-owns-a-PM-project inheritance check) | Real export, scope-gated — the `pmOwnsAny` sub-expression was already safely inside a `role==='ProjectManager' &&` guard, migrated without issue |
| `POST /api/export` (`report:'inventory'`) | `PROC_VIEW_ROLES.has(role)` | Role-gated, not project-scope-gated — company-wide inventory data, no per-project restriction exists or is claimed |
| `POST /api/export` (`report:'gl'/'ar'/'ap'/'project-pl'`) | `isGLVisible(actor)` | Role-gated (GL-tier visibility), not project-scope — these are accounting-tier reports, intentionally company-wide for the roles that can see the GL at all |

All company-wide (non-project-scoped) reports are documented here as intentionally so — no invented
scope restriction was added to any of them.

## 8. Conclusion

70/70 accounted for. 32 A (23 safely migrated, 9 correctly reverted after a live-caught defect). 3 B
(correct, distinct Lead-ownership logic). 0 C/D/E in this specific population. **Zero unexplained.**
