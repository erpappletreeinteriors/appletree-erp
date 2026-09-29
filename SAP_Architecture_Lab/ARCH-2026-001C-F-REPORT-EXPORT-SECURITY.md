# ARCH-2026-001C-F — Report & Export Security

**Date:** 2026-09-21. Closes ARCH-2026-001C's disclosed gap: "no report/export scope testing was
performed." Full audit in `ARCH-2026-001C-F-AUDIT.md` §7; this document covers the live testing.

## 1. Scoped reports — live tested

| Report | Scope | Estimator (non-fullAccess, non-PM) on Project B | CEO (fullAccess) on Project B | pm1 on own Project A | pm1 on Project B |
|---|---|---|---|---|---|
| Financial Readiness | Project | **403** | 200 | 200 | **403** |
| Cost Breakdown | Project | **403** | 200 | — | — |
| Financial 360 | Project | **403** | 200 | — | — |
| Billing Ceiling | Project (+ Sales explicitly included, a real business rule) | **403** | 200 | — | — |
| Closure Readiness | Project | **403** | 200 | — | — |
| Project P&L | Project | **403** | 200 | — | — |

All 6 tested via direct API calls (`tests/erp_arch_2026_001c_f_residual_scope_tests.js`), and 2 of the
6 (Financial Readiness) additionally verified through a real logged-in browser session (see
`ARCH-2026-001C-F-BROWSER-UAT.md`).

## 2. Scoped exports — live tested

| Export | Scope | Test |
|---|---|---|
| `POST /api/export` `report:'financial-360'` | Project | Sales (not in `fullAccess`) attempting to export Project B's Financial 360 — **403**. Confirms the pre-existing code comment ("POL-12... every export re-checks the SAME data-scope gate its live screen already uses") holds true under live test, not just by inspection. |
| `POST /api/export` `report:'customer-profitability'` | Customer (via a PM-owns-any-project-of-this-customer inheritance check) | Not separately re-tested this CR (the underlying `pmOwnsAny` sub-expression was already safely inside a `role==='ProjectManager' &&` guard and required no revert — see Migration Report §5) |

## 3. Company-wide (intentionally unscoped) reports/exports — documented, not tested for scope leakage

| Report/Export | Why company-wide |
|---|---|
| `report:'inventory'` | Role-gated (`PROC_VIEW_ROLES`), not project-scoped — inventory is a company-wide asset, no per-project restriction exists or is claimed anywhere in the application |
| `report:'gl'`/`'ar'`/`'ap'`/`'project-pl'` (export variants) | Role-gated (`isGLVisible`) — accounting-tier reports are intentionally visible company-wide to the roles that can see the GL at all; this is the SAME "Controlling on FI" design already documented as intentional in `ARCH-2026-001-ARCHITECTURE-FREEZE.md` |

No new scope restriction was invented for these — they were confirmed, by reading the code, to have
never claimed a project-scope boundary in the first place.

## 4. Export format coverage

Only `POST /api/export` (a single unified JSON-returning endpoint used by all report types, whose
consuming client renders it to CSV/Excel/PDF client-side) exists in this application — confirmed by
inspection; there is no separate server-side CSV/Excel/PDF generation endpoint to test independently.
The single endpoint's scope gate is what was tested (§2).

## 5. Manipulated parameters

Every report/export test above used the ACTUAL target project ID (Project B) as the request parameter
— i.e., every test IS a "manipulated project ID" test (a Project-A-scoped or non-scoped actor
deliberately requesting Project B's data). No separate broader/no-filter request bypass was found: the
`filters.projectId` value is read directly from the request but the AUTHORIZATION decision never
trusts it alone — it is checked against the authoritative `isProjectManagerOf()`/`fullAccess` state
server-side, exactly as required by §5 of this CR's own brief.

## 6. Conclusion

Every tested scoped report/export correctly denies cross-project access and correctly allows
same-project/fullAccess-role access. No report or export was found to leak cross-scope data. The one
real defect found during this CR's implementation (see the Migration Report) directly affected 5 of
these 6 report routes plus the financial-360 export — all are now confirmed fixed and covered by a
permanent regression test.
