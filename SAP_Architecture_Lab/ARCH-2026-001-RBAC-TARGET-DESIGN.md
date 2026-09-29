# ARCH-2026-001 — RBAC Target Design

**Date:** 2026-09-21. DESIGN DOCUMENT ONLY. Nothing in this document has been implemented. No
`DB.businessRoles`, `DB.duties`, `DB.privileges`, or any related collection exists in the codebase
today (confirmed by grep against `server/domain.js`).

## 1. Target model (confirmed as given, not altered)

```
USER → BUSINESS ROLE → DUTIES → PRIVILEGES → ACTIONS → DATA SCOPE → APPROVAL AUTHORITY
     → SEGREGATION OF DUTIES (SoD) → SERVER-SIDE AUTHORIZATION → AUDIT
```

Read left to right: a **User** is assigned one or more **Business Roles**; each Business Role is
composed of **Duties** (coherent job responsibilities, e.g. "Approve Purchase Orders"); each Duty
grants **Privileges** (specific permission bundles); each Privilege authorizes concrete **Actions**
(API-route-level operations); every Action is filtered by **Data Scope** (which records — e.g. which
projects, which branches — the user may act on, not just which actions); certain Actions additionally
require **Approval Authority** (a monetary or procedural threshold, e.g. the existing PO tiering);
**SoD** rules forbid one user holding two specific duties simultaneously (e.g. "cannot both create and
approve the same Payment Request"); every Action passes through **Server-Side Authorization** (the
actual enforcement point — never a client-side filter); and every authorization decision, grant,
denial, and SoD exception is written to the **Audit** trail.

This is a target design only. No sequencing, migration, or implementation decision in this document
authorizes building any part of it.

## 2. The existing 10 roles remain the current personas — unchanged

`Admin, CEO, Accountant, FinanceManager, ProjectManager, Purchase, Sales, Estimator, SiteInCharge,
Viewer` (`server/domain.js` `ROLES`, confirmed unchanged this session). This document does **not**
implement the expanded duty/privilege catalogue proposed in `ARCH-2026-001-ROLE-SECURITY-DESIGN.md`
§3-§5. Those 10 roles remain the system's only authorization unit today, and remain so after this
document — the catalogue is a target shape for a future, separately-authorized CR
(`ARCH-2026-001a` onward, see the Wave Plan), not something adopted by writing this design down.

Under the target model, each of the 10 existing roles would eventually map to one or more Business
Roles composed of Duties — the illustrative Procurement and Finance breakdowns already sketched in
`ARCH-2026-001-ROLE-SECURITY-DESIGN.md` §5 remain the reference examples; they are not repeated here
to avoid two documents diverging over time. That document's role-mapping table is the canonical
sketch; this document is the canonical sequencing and open-decision record.

## 3. Open decision: CEO / technical-administrator split

The current `CEO` role is both the highest business authority (final discount/PO approval tier) and,
in practice, functions with the same effective system access as `Admin` for anything the UI does not
specifically restrict. The target RBAC model raises a real question this document does not decide:

### Option A — CEO retains combined business + technical-admin access
The `CEO` role continues to carry both ultimate business approval authority AND full technical
administration capability (user management, backup/restore, policy configuration, security audit log
access) as it effectively does today.

**Consequences:**
- Simplest to migrate — the existing `CEO` persona maps to one Business Role, no behavior changes for
  the CEO user.
- No new "who administers the administrator" question — CEO remains the root of trust, consistent
  with a small-company reality where the CEO IS the ultimate authority.
- Weaker separation of duties at the very top: the same person who can approve their own discretionary
  spend can also, technically, alter the audit log's own access controls or reset any user's
  credentials — a real SoD gap by strict SAP/enterprise standards, though one many small/mid-size
  businesses accept deliberately.
- Fewer new roles to provision, train, and maintain.

### Option B — CEO splits into distinct business and technical personas
`CEO` (business approval authority only) is separated from new roles such as `Business Administrator`
(user/role management), `System Administrator` (backups, environment, technical configuration), and
`Auditor` (read-only access to the audit trail, security log, and financial records, with no write
capability anywhere).

**Consequences:**
- Matches strict SAP-grade SoD practice — no single login can both act and audit/administer itself.
- Requires Appletree to decide who actually holds the new technical roles day-to-day (a real staffing
  question, not just a system one — this is a business decision, not a technical one).
- More roles to provision and keep current; more logins to manage; a genuine operational cost for a
  business of Appletree's current size.
- If the CEO is also the only person Appletree currently trusts with technical administration, Option
  B may just relabel the same person under two logins without changing the actual risk — the benefit
  is only realized if a genuinely different person holds the technical-admin role.

**This document deliberately does not recommend between Option A and Option B.** This is a management
decision, consolidated with all other open items in `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md`. No
implementation proceeds on either option until that decision is made.

## 4. Integration & Platform (Domain #19) — scope resolution

Reproduced from `ARCH-2026-001-ARCHITECTURE-FREEZE.md` §3 for completeness in this design document:

**Included, Existing:** CSV Journal Voucher Import, Master Data Import, ICICI Bank Import, E-way Bill
Tracking (manual entry), Exports screen.

**Excluded:** an internal message bus / event system between modules — the single-GL/single-inventory-
engine architecture already provides cross-module consistency without one; nothing has been requested
that would need it.

**OPEN (ambiguous, not decided here):**
- A general-purpose external-system connector (GST portal API, e-invoicing API, accounting-software
  sync) — no such capability exists; whether it belongs in "Integration & Platform" scope at all is
  undecided.
- An API/webhook framework for third-party integration — not built, not scoped.
- Authentication/SSO integration (Google/Microsoft login) — current auth is local username/password
  only; whether SSO is in-domain here is undecided.

**Future:** any OPEN item above, once scope is confirmed by the requester — proposed as
`CR-2026-007`, explicitly blocked pending that clarification (see Wave Plan).

## 5. What this document does NOT do

- Does not create `DB.businessRoles`, `DB.duties`, `DB.privileges`, `DB.roleDuties`,
  `DB.dutyPrivileges`, `DB.userRoles`, `DB.roleScopes`, `DB.approvalAuthorities`, `DB.sodRules`,
  `DB.sodExceptions`, or `DB.securityAuditLog`.
- Does not change any route's authorization check.
- Does not migrate any user.
- Does not decide Option A vs. Option B.
- Does not resolve the Integration & Platform OPEN items.

Confirms only the target shape and records the decisions still needed before `ARCH-2026-001a` (data
model + migration) can be authorized.
