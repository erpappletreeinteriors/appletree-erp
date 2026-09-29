# ARCH-2026-001 — Role & Security Architecture Design Proposal

**Date:** 2026-09-21. **DESIGN PROPOSAL ONLY. NOT IMPLEMENTED. No code changed to produce this
document.** Per the scoped-down authorization for this request, this is Section 4/5/46-D's own
deliverable — a role catalogue and target authorization model for review — not a build.

## 1. Why this is a real architecture change, not a controlled change

The current system (`ARCH-2026-001-CURRENT-STATE-MAP.md` §2) authorizes purely by role: every
protected route checks `actor.role` directly against a hardcoded list. The request asks for:

```
USER → BUSINESS ROLE → DUTIES → PRIVILEGES → ACTIONS → DATA SCOPE →
APPROVAL AUTHORITY → SoD VALIDATION → SERVER-SIDE AUTHORIZATION → AUDIT
```

This is a genuinely new authorization layer sitting underneath every existing route — not an
extension of the current model, a replacement of its enforcement mechanism (while preserving its
outcomes). That is why this sits outside "controlled change" and needs its own explicit,
separately-scoped implementation plan (see §6).

## 2. Target data model (sketch, per request §39)

Using the existing single-`db.json` architecture (no second security database, per the request's own
§39 instruction):

```
DB.users                 — unchanged, existing user records
DB.businessRoles         — NEW: id, name, description (the persona layer, e.g. "Project Manager")
DB.duties                — NEW: id, name, module (e.g. "Procurement Duties: Create Purchase Order")
DB.privileges            — NEW: id, action (VIEW/CREATE/EDIT/SUBMIT/APPROVE/POST/EXECUTE/REVERSE/
                            CANCEL/DELETE/EXPORT/PRINT), entity (e.g. "PurchaseOrder")
DB.roleDuties             — NEW: {roleId, dutyId} — which duties compose a business role
DB.dutyPrivileges         — NEW: {dutyId, privilegeId} — which privileges a duty grants
DB.userRoles              — NEW: {userId, roleId, scope} — replaces the current single actor.role field;
                            a user may hold multiple {role, scope} pairs
DB.roleScopes             — NEW: {userRoleId, scopeType (Project/Site/Warehouse/Branch/CostCentre/...), scopeValue}
DB.approvalAuthorities    — NEW: {transactionType, dimension, threshold, requiredRole} — replaces
                            today's hardcoded BOS §1.6 thresholds with configurable rows (the
                            existing thresholds become the SEED data for this table, not deleted)
DB.sodRules               — NEW: {dutyIdA, dutyIdB, riskLevel, policy} — conflicting duty pairs
DB.sodExceptions          — NEW: {userId, ruleId, approvedBy, expiry} — audited override
DB.securityAuditLog       — NEW, or an extension of the existing DB.auditLog with a dedicated
                            {category:'Security', ...} tag — who/what/when/old/new for every role,
                            duty, scope, and approval-limit change
```

**Migration approach (per request §40-41, design only):** `actor.role` (today's single string) maps
1:1 to one row in the new `userRoles` table at migration time, with a scope of "Company" (unrestricted)
by default — preserving exactly today's access, not silently narrowing or widening it. The 10 existing
`ROLES` become the seed content of `businessRoles`. No user loses or gains access on migration day;
narrower scopes and duty-level granularity would be a deliberate, separate, later configuration step
per role — not bundled into the migration itself.

## 3. Business role catalogue — mapped from the existing 10 roles

Per the request's own §4 instruction ("do not destroy the existing 10 roles... convert them into
duty compositions"). This is a first-pass mapping, not exhaustive — a real implementation would
refine this against actual Appletree usage patterns.

| Existing role | Becomes (business role, unchanged name) | Composed of (duty groups, illustrative) |
|---|---|---|
| Admin | Business Administrator + System Administrator (split per request §11) | All duties, both business-config and technical-admin |
| CEO | CEO (business authority only, per request §11) | All business-domain duties + top-tier approval authority; **loses automatic technical-admin duties** (Users/Roles/Backup/Restore/Policy Config move to Business/System Administrator) — this is the single most consequential proposed change, see §4 |
| Accountant | Accountant | Journal View/Create, Customer Invoice Create, Supplier Bill View, Reconciliation View |
| Finance Manager | Finance Manager | Journal Approve/Post, PO Approve (mid-tier), Payment Request Approve (checker), Reconciliation, Bank Recon |
| Project Manager | Project Manager | Project View/Edit, Budget Management, Change Request Create, scoped to assigned Projects only |
| Purchase | Purchase Executive (+ Purchase Manager as a separate, higher duty set) | Material Requirement View, PR/RFQ/Supplier-Quote/Comparison/PO Create, GRN Create — approval duties split OUT to a Purchase Manager role per request §5/§7 worked example |
| Sales | Sales Executive | Lead/Quotation Create/Submit — discount approval duties remain with FinanceManager/CEO, unchanged |
| Estimator | Estimator | Costing Version Create — unchanged |
| Site In-charge | Site Manager/In-charge | MRS Create, Site Consumption Record — scoped to assigned Site(s) only |
| Viewer | Auditor / Read-Only | VIEW-only privilege on every duty group, explicitly no CREATE/EDIT/SUBMIT/APPROVE/POST/EXECUTE/REVERSE/CANCEL/DELETE anywhere — matches today's already-proven behavior (`PHASE_41_VIEWER_UAT.md`) exactly, just expressed in the new model |

**Net-new roles proposed only where a real gap exists today** (not 30-40 invented personas, per the
request's own §51 closing principle): **Purchase Manager** (approval-only, split out of today's single
Purchase role, closing a real SoD gap — today's Purchase role can both create AND the maker-checker
model for POs relies purely on the approval-threshold auto-routing, not a distinct approver persona),
**Business Administrator** and **System Administrator** (split out of Admin/CEO, per §4 below).

## 4. The CEO-is-not-superuser change (request §11) — the highest-impact single item

Today, `CEO: null` in `ROLE_MODULES` means "sees everything," and CEO passes every `actor.role==='CEO'`
gate in the codebase, including Backup/Restore, User creation, Policy Configuration. The request asks
to separate business authority from technical administration.

**This is flagged, not decided, here.** It is a real, material change to who can do what — every
`['Admin','CEO'].includes(actor.role)` gate in `server.js` (confirmed present at the Backup/Restore
routes and others) would need to become `hasDuty(actor, 'SystemAdmin.Backup')` or equivalent, and CEO
would, by default, no longer pass it. **This needs an explicit business decision from Appletree**
(does the CEO want to retain technical superuser access, or genuinely delegate it?) before any
implementation — it is exactly the kind of "Business Decision Required" item this engagement has
consistently surfaced rather than decided unilaterally throughout (e.g., MRQ rename, status casing).

## 5. Illustrative duty/privilege breakdown (2 of 26 domains, matching the request's own worked examples)

**Procurement duties** (request §6, reproduced against real current functions):

| Duty | Privilege | Maps to existing function |
|---|---|---|
| View Material Requirements | VIEW | `GET /api/material-requirements` (real) |
| Create Purchase Requisition | CREATE | `createPurchaseRequisition()` (real) |
| Create Purchase Order | CREATE | `createPurchaseOrder()` (real) |
| Submit Purchase Order | SUBMIT | `submitPurchaseOrder()` (real — **and the exact function Track B's Phase 42 just fixed for a transaction-atomicity gap**, see Current-State Map §3) |
| Approve Purchase Order | APPROVE | `approvePurchaseOrder()` (real, same note) |
| Create GRN | CREATE | `createGRN()` / GRN route (real) |
| Request Supplier Payment | CREATE (on Payment Request) | `createPaymentRequest()` (real, already has maker-checker) |

**Finance duties** (request §6): View Journal / Create-Submit-Approve-Post Journal Voucher / Create-
Approve-Post Customer Invoice / Create-Execute Customer Receipt / Create-Approve Supplier Bill /
Create-Approve-Execute Payment Request / Perform Clearing / Reverse Transaction / Bank Reconciliation
/ Period Close — **every one of these already maps to a real, existing, tested function**; the design
work is entirely in EXPRESSING today's role-gate as a duty/privilege pair, not inventing new business
logic.

## 6. What actual implementation would require (not started, needs its own authorization)

Per the request's own §41 (migration safety) and this engagement's standing change-management
discipline, a real build would need to be sequenced as its own set of `ARCH-YYYY-NNN` /
`CR-YYYY-NNN` items, each with its own investigate→design→implement→test→regress→document cycle —
NOT one single mega-change:

1. **ARCH-2026-001a** — Data model + migration (the tables in §2), 1:1 preserving today's access,
   zero behavior change, full regression proving nothing broke.
2. **ARCH-2026-001b** — Route-layer authorization rewrite (replace `actor.role===X` checks with
   `hasDuty()` calls resolving to the SAME today's-correct answer) — a mechanical, testable,
   behavior-preserving refactor, one module at a time, each independently regression-tested.
3. **ARCH-2026-001c** — Data-scope enforcement (Project/Site/Warehouse scoping) — genuinely new
   restrictive behavior, needs explicit business sign-off on what each role's default scope should be.
4. **ARCH-2026-001d** — SoD rule engine + conflict detection + exception audit — new capability.
5. **ARCH-2026-001e** — Approval Authority as configurable data (replacing hardcoded thresholds) —
   needs Appletree confirmation the existing BOS §1.6 thresholds are correctly captured before cutover.
6. **ARCH-2026-001f** — CEO/Admin technical-vs-business split (§4 above) — blocked on the business
   decision named there.
7. Separate, individually-authorized `CR-YYYY-NNN` items for each of the 6 confirmed-absent domains
   (HR, Payroll, Maintenance, PLM, MRP, Transportation, Advanced Warehouse) — each a real, multi-week
   build, Payroll and HR carrying genuine statutory-compliance risk this engagement has never been
   authorized to take on and should not assume.

**None of items 1-7 have been started.** This document is the audit/design deliverable only, per the
scoped-down authorization given for this request.
