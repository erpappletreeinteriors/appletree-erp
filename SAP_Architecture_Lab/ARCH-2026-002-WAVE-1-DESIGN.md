# ARCH-2026-002 — Wave 1 Detailed Design

**Date:** 2026-09-22. Phase 0 deliverable, §22. Design only — no implementation code written, no file
modified to produce this document. Wave 1 = Home & Workspace, Sales & Customer Management, Estimation &
Costing, Project & Contract Management, Master Data, Reporting & Analytics — all 6 already classified
**EXISTING** in `ARCH-2026-002-MODULE-MATRIX.md`. Per this CR's own §1 rule ("DO NOT add new business
features"), Wave 1's actual implementation content is **hardening and closing disclosed gaps in
already-working functionality**, not new capability — every item below traces to a specific finding in
this Phase 0's own audit, not an invented feature.

## 1. What Wave 1 is (and is not)

Wave 1 does **not** rebuild Lead→Estimation→Costing→Quotation→Approval→Project — that chain is already
real, tested, and working (`ARCH-2026-002-PROCESS-TRACE.md` chains A-B). Wave 1's actual scope is:

1. Resolve `ARCH-2026-002-OPEN-DECISIONS.md` item 4 (RBAC/ID-numbering cleanup) — a decision, then
   (if authorized) a behavior-preserving refactor.
2. Resolve item 5 (BOM pre-Quotation sequencing) — a decision, then (if authorized) either a documented
   no-change or a scoped schema/workflow change.
3. Resolve item 8 (Reporting & Analytics cross-project data-scope gap, `ARCH-2026-002-SECURITY-BASELINE.md`
   §3.1) — this is squarely a Wave 1 domain (Reporting & Analytics) finding and should be fixed as part
   of Wave 1's own security-completion work, not deferred to a later wave.
4. Confirm and, where needed, formally document the existing module tree, screens, and API surface for
   these 6 domains as Wave 1's own accepted baseline (this section), since none of it requires rebuilding.

## 2. Module tree (existing, confirmed — no change proposed)

- **HOME** — Dashboard (role-aware).
- **SALES & CRM** — Leads, Quotations.
- **ESTIMATION & COSTING** — Costing Versions, BOM, BOM Consumption Report.
- **PROJECTS** — Projects, Project 360, Change Requests (Variations), Budget vs Commitment vs Actual.
- **MASTER DATA** — Branches, Profit Centres, Bank Accounts, Chart of Accounts, Cost Centres, Customers
  (via `findOrCreateCustomer`), Vendors, Materials.
- **REPORTS & ANALYTICS** (Wave-1-relevant subset) — Management MIS, Cross-Dimensional Reports, Company
  Profitability, Budget Variance report, Exports, Audit Log.

## 3. Screen list (existing — Wave 1 touches zero new screens; item 3 below is a fix inside an existing screen's backend, not a new UI)

Dashboard; Leads list/detail; Quotations list/detail (incl. discount-approval action); Costing Versions
list/detail; BOM list/detail (incl. approve action); Projects list/detail; Project 360; Change Requests;
Master Data screens (Branches/Profit Centres/Bank Accounts/COA/Cost Centres); Budget Variance report;
Management MIS; Audit Log.

## 4. API list (existing routes Wave 1 depends on; the one API-level change is item 3's fix, marked below)

`POST /api/leads`, `POST /api/leads/:id/activities`, `POST /api/estimation-requests`,
`POST /api/costing-versions`, `POST /api/boms`, `POST /api/boms/:id/approve`, `POST /api/quotations`,
`POST /api/quotations/:id/submit`, `POST /api/quotations/:id/approve-discount`,
`POST /api/quotations/:id/accept`, `POST /api/quotations/:id/won` (or equivalent `wonTransition`
route), `POST /api/change-requests`, `POST /api/change-requests/:id/approve`, Master Data CRUD routes,
`GET /api/reports/budget-variance` — **this route gains a `hasScopeAccess()` check as item 3's fix; no
new route is added.**

## 5. Data model changes proposed for Wave 1 (contingent on the 2 open decisions — none is unconditionally in scope)

| Change | Contingent on | If authorized |
|---|---|---|
| Migrate `Lead`/`EstimationRequest`/`CostingVersion`/`Design`/standard-cost-baseline record IDs from `array.length+1` to `nextId()` | Item 4 decision | Additive, no schema change — only the ID-generation call site changes in 5 functions (`ARCH-2026-002-DEPENDENCY-MAP.md` §2) |
| BOM creation sequencing (pre-Quotation vs. current post-Won-only) | Item 5 decision | If Appletree confirms pre-Quotation BOM is wanted: `createBOM()` gains an alternate `estimationRequestId`/`costingVersionId`-scoped creation path alongside the existing `projectId`-scoped one — a real, non-trivial addition, not a rename. If not wanted: no change, decision recorded as closed. |
| None for item 3 (Reporting fix) | — | Pure backend logic change (`hasScopeAccess()` call added to `projectBudgetVarianceReport()`'s route handler) — no data model impact |

## 6. Workflow, authorization, data scope, SoD, approval touchpoints — per item

### Item 3 (Reporting fix — recommended to proceed, no open business decision blocks it)
- **Workflow:** none — read-only report, no state transition.
- **Authorization:** unchanged (existing role allow-list on `GET /api/reports/budget-variance`).
- **Data scope:** **the fix itself** — add `hasScopeAccess(actor,'Project',projectId)` filtering, matching
  the exact pattern already used by `ARCH-2026-001C-F`'s other read-filter fixes (e.g.
  `GET /api/purchase-orders`, `GET /api/designs` — see `erp_arch_2026_001c_f_residual_scope_tests.js`
  for the established test pattern to extend).
- **SoD / Approval Authority:** N/A — read-only.
- **Audit:** N/A — reads are not audited in this codebase's existing convention (consistent with
  `resolveApprovalAuthority()`'s own precedent).

### Item 4 (RBAC/ID cleanup — contingent on decision)
- **Workflow:** none — ID-generation is internal, not user-facing.
- **Authorization:** if `approveQuotationDiscount`/`canSeeLead` are migrated onto `can()`/`checkSoD()`,
  this is a **behavior-preserving refactor**: the new dispatcher must produce the identical allow/deny
  decision for every existing role×route combination — the same "full parity regression" discipline
  `ARCH-2026-001B` used when migrating route-layer authorization.
- **Data scope:** unaffected — `canSeeLead`'s existing Sales-owner filter is preserved exactly, just
  re-expressed through `hasScopeAccess()` if migrated.
- **SoD:** `approveQuotationDiscount`'s inline self-check (`q.createdBy===actor.id &&
  !['CEO','Admin'].includes(actor.role)`) would become a real `checkSoD()` call — functionally
  identical, formalized.
- **Approval Authority:** unaffected — the existing tiered discount-role matrix is untouched.
- **Audit:** unaffected — `logAudit()` calls already exist at every touchpoint.

### Item 5 (BOM sequencing — contingent on decision, likely NOT in Wave 1's critical path if declined)
- If Appletree confirms no change wanted: zero workflow/authorization/scope/SoD/approval/audit impact.
- If a pre-Quotation BOM path is wanted: it would need its own approval gate (reusing the existing
  `approveBOM()` state machine, not a new one), its own scope check (reusing `hasScopeAccess()` against
  the owning Lead/EstimationRequest's Sales-owner, mirroring the existing pattern), and its own audit
  entries (`logAudit()`, same convention) — full detail deferred to a follow-up design pass ONLY if this
  decision is made affirmatively, per this CR's own "do not build ahead of a decision" discipline.

## 7. Numbering

Item 4's ID migration is the only numbering-relevant change, and it is internal-ID-only — none of the
5 affected records (Lead, EstimationRequest, CostingVersion, Design, Baseline) currently has a
`DB.glDocumentTypes` entry, so no customer/audit-facing document number format changes either way.

## 8. Integrations

None — Wave 1 touches no other domain's data. `wonTransition`'s existing calls into Master Data
(`findOrCreateCustomer`) and Project & Contract Management (Project creation) are both already
in-Wave-1 (per `ARCH-2026-002-DEPENDENCY-MAP.md` §4's confirmation that `wonTransition` does not reach
into Inventory, Procurement, or Manufacturing).

## 9. Reports

Item 3 IS the report change. No other report is touched.

## 10. Tests required

- Item 3: a new negative test (ProjectManager requests another project's `projectId`, or omits it,
  expects a 403 or a properly-filtered result) extending the existing
  `erp_arch_2026_001c_f_residual_scope_tests.js` pattern.
- Item 4 (if authorized): a full regression of `erp_arch_2026_001a_rbac_foundation_tests.js` (39
  assertions) plus every Sales/Estimation existing test, proving zero behavior change — same discipline
  ARCH-2026-001B used.
- Item 5 (if authorized): a new suite covering the new BOM creation path, plus full regression of
  `erp_phase39_manufacturing_jobwork_tests.js` (BOM approval flow) to prove the existing path is
  unaffected.

## 11. Browser UAT required

Per this CR's own §52, minimum roles for Wave 1: Sales (Lead/Quotation), Estimator (Costing/BOM),
ProjectManager (Project, and the item-3 negative test — confirming they can no longer see another
project's budget variance), FinanceManager/CEO (discount approval), Viewer (confirming no access
regression). Consistent with the 6-role UAT pattern already established in ARCH-2026-001D/E.

## 12. Exit criteria for Wave 1

1. Item 3 fixed and regression-proven (recommended — no blocking decision).
2. Items 4 and 5 each resolved as an explicit decision (proceed or decline) — not silently skipped.
3. If items 4/5 proceed: full parity/regression discipline applied, zero behavior change beyond the
   authorized new behavior.
4. All 6 Wave-1 domains' `ARCH-2026-002-MODULE-MATRIX.md` classification remains EXISTING (no
   regression to PARTIAL/ABSENT).
5. Production `server/db.json` hash unchanged throughout.
6. A Wave 1 completion report in the same PASS/PASS WITH DOCUMENTED DEFERMENTS/FAIL format this
   engagement has used for every prior CR.

## 13. What this design does NOT do

No code is written. No route, function, or collection is created or modified to produce this document.
Items 4 and 5 remain open decisions (`ARCH-2026-002-OPEN-DECISIONS.md`) — this design describes what
Wave 1 WOULD do if each is authorized, it does not authorize either.
