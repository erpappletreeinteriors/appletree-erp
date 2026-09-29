# ARCH-2026-001C-F — Migration Report

**Date:** 2026-09-21. What was migrated, what was reverted, and why — full equivalence account.

## 1. Summary

32 raw `isProjectManagerOf(actor,X)` call sites in `server/server.js` were migrated to
`D.hasScopeAccess(actor,'Project',X)`. During this CR's OWN live testing (before any test file was
even written — caught via a manual `curl` probe), a real equivalence defect was found in 9 of the 32.
All 9 were reverted to the original primitive. **23 remain migrated. 9 remain on the direct primitive
(correctly — see §4).**

## 2. Migration method

A scripted, line-targeted substitution (not a blind global regex) was used, with three explicit
categories established BEFORE any edit:

1. **Simple unconditional read-filters** (no `else` clause follows) — the outer `if(actor.role===
   'ProjectManager')` guard was DROPPED and the filter made unconditional, since
   `hasScopeAccess`'s own internal role check reproduces the guard exactly.
2. **Guarded compound conditions** (`actor.role==='ProjectManager' && isProjectManagerOf(...)`,
   inside a larger expression) — the OUTER structure was left completely untouched; only the inner
   `isProjectManagerOf(...)` call itself was swapped for `hasScopeAccess(...)`.
3. **A bulk pass** over every remaining raw `isProjectManagerOf(actor,X)` call in the file, applying
   the SAME "swap the primitive only" transformation.

Every transformation was written to a scratch copy first, diffed line-by-line against the original,
and syntax-checked (`node --check`) before being applied to the real file — the same discipline used
in ARCH-2026-001B.

## 3. A caught-and-fixed defect during the "simple filter" category (before the main migration)

The very first bulk attempt (before the categorized approach above) converted an `if(PM) filter; else
if(Sales) filter;` pair into two sequential unconditional statements using the LITERAL word `else`,
producing a `SyntaxError: Unexpected token 'else'` — because an `else` cannot follow a bare statement.
Caught immediately by `node --check` before any test ran. Fixed by removing the stray `else` keyword
(two independent, unconditional filter statements are behaviorally equivalent when both underlying
`hasScopeAccess` calls already no-op for the role they don't restrict — proven algebraically and
reused from ARCH-2026-001C's own established equivalence proof).

A SECOND, more serious defect was then found in the SAME class of transformation: 4 of the "PM/Sales
else-if pairs" turned out to have a hidden THIRD `else if(!ALLOWLIST.has(role)) return deny(...)`
clause the initial 2-line diff review did not surface (warranties, complaints, service-tickets, amc-
contracts). Collapsing these to two sequential unconditional filters would have made the deny clause
UNREACHABLE — every role, not just PM/Sales, would have silently passed through with an unfiltered (or
wrongly-filtered) list, a real authorization regression. **Caught by re-reading each of the 4 routes'
FULL context (3+ lines, not 2) before finalizing the transformation — the deny clause was preserved by
keeping the original `if/else if/else if` structure intact and swapping ONLY the two inner predicates.**

## 4. The main defect — 9 sites, found live, fixed

**Root cause:** `hasScopeAccess(actor,'Project',X)` is defined as `actor.role!=='ProjectManager' ||
isProjectManagerOf(actor,X)`. This is safe to substitute for a bare `isProjectManagerOf(actor,X)` call
ONLY when that call already sits inside an expression that has separately established
`actor.role==='ProjectManager'`. It is UNSAFE inside a bare `OR` or an un-narrowed `!X && !Y`
DENY-guard, because `hasScopeAccess` returns TRUE unconditionally for every non-PM role — silently
turning "deny everyone not on the explicit allow-list" into "allow everyone except a non-owning PM."

**How it was found:** after the "bulk pass" (category 3 above) completed with `node --check` passing
cleanly, a manual `curl` sanity probe was run — `GET /api/projects/PRJ-2/financial-readiness` as
`sales1` (a role NOT on that route's own allow-list, NOT a ProjectManager) returned **`200 {"ok":true,
...}`** instead of the expected `403`. This was investigated immediately, BEFORE writing the formal
test suite, and traced to the exact root cause above.

**Full re-audit performed:** every one of the (then) 32 migrated `hasScopeAccess(actor,'Project',...)`
call sites was individually re-read against the safety rule in §3 above (not just the one that failed
the manual probe). **9 sites failed the rule:**

| # | Function/Route | Original shape |
|---|---|---|
| 1 | `pmOrAdminCeo()` helper | `['Admin','CEO'].includes(role) \|\| isProjectManagerOf(actor,X)` |
| 2 | `GET /api/project-pl` | `if(!fullAccess.has(role)){ if(isProjectManagerOf(...)) allow; else deny; }` |
| 3 | `GET /api/projects/:id/financial-readiness` | `!fullAccess.has(role) && !isProjectManagerOf(actor,id)` → deny |
| 4 | `POST /api/designs` | `!(['Admin','CEO'].includes(role) \|\| isProjectManagerOf(actor,body.projectId))` → deny |
| 5 | `GET /api/projects/:id/cost-breakdown` | same `fullAccess` pattern as #3 |
| 6 | `GET /api/projects/:id/financial-360` | same `fullAccess` pattern as #3 |
| 7 | `GET /api/projects/:id/billing-ceiling` | same `fullAccess` pattern as #3 |
| 8 | `GET /api/projects/:id/closure-readiness` | same `fullAccess` pattern as #3 |
| 9 | `POST /api/export` (`report:'financial-360'`) | same `fullAccess` pattern as #3 |

`pmOrAdminCeo()` is itself called from 2 further sites (`GET /api/material-requirements/:id` cost view
and `prodOrderAllowed()`, used by the Production Order routes), so fixing the helper transitively fixed
those too — no separate revert needed for its callers.

**Fix:** all 9 reverted to the original direct `isProjectManagerOf(actor,X)` call — a pure revert, zero
new logic. Verified via `node --check` and a live re-probe of the exact failing case:

| Test | Before fix | After fix |
|---|---|---|
| Sales, `GET .../financial-readiness` for a project they have no relation to | **200 (bug)** | **403 (correct)** |
| CEO (fullAccess), same route | 200 | 200 (unaffected, positive control) |
| pm1, own project | 200 | 200 (unaffected) |
| pm1, a different project | 403 | 403 (unaffected) |

Re-confirmed for all 9 sites, not just the one manually probed — see
`ARCH-2026-001C-F-SECURITY-REPORT.md` and the 33/33 test suite.

## 5. The 23 sites that remain safely migrated

All are either (a) unconditional read-filters where `hasScopeAccess`'s built-in role check reproduces
the original `if(role==='PM')` guard exactly, or (b) compound conditions where the
`isProjectManagerOf(...)` call was already directly ANDed with `actor.role==='ProjectManager'` in the
same expression, making the substitution's own internal role-recheck redundant-but-harmless. Full list
in `ARCH-2026-001C-F-AUDIT.md` §5's safety rule and the per-site classification.

## 6. Files changed

- `server/server.js`: 32 substitutions (23 kept, 9 reverted), plus one explanatory comment block near
  the `isProjectManagerOf` alias declaration documenting the safety rule and the defect.
- No change to `server/domain.js` in this CR — the `hasScopeAccess`/`resolveResourceScope`/
  `assertScopeAccess` engine itself (ARCH-2026-001C) was not modified, only additional CALLERS were
  added/removed in `server.js`.

## 7. Lesson recorded for any future CR touching this pattern

A "provably equivalent" transformation is only as trustworthy as the boolean context it's inserted
into — the SAME primitive substitution was safe at 23 sites and a real security regression at 9,
depending entirely on surrounding structure. Any future migration of the remaining 3 (§6 of the Audit)
or the 68-vs-70 discrepancy items must re-apply this exact per-site safety check, not assume the
pattern generalizes.
