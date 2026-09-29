# ARCH-2026-001C — Data Scope Implementation

**Date:** 2026-09-21. What was built, grounded in `ARCH-2026-001C-DATA-SCOPE-AUDIT.md`.

## 1. The central scope engine (`server/domain.js`)

```js
function hasScopeAccess(actor, scopeType, scopeId){
  if(!scopeId) return true;
  switch(scopeType){
    case 'Project': return actor.role!=='ProjectManager' || isProjectManagerOf(actor, scopeId);
    case 'Site': return actor.role!=='SiteInCharge' || isSiteInChargeOf(actor, scopeId);
    case 'Customer': return actor.role!=='Sales' || (actor.assignedCustomers||[]).includes(scopeId);
    case 'Branch': return branchAllowed(actor, scopeId);
    default: return true;
  }
}
```

This is a thin DISPATCHER, not a reimplementation — `isProjectManagerOf()`, `isSiteInChargeOf()`, and
`branchAllowed()` are the SAME pre-existing, already-tested functions every one of the 78 original
checks already called. The `actor.role!=='X' ||` guard mechanically reproduces the universal shape of
every one of the 78 original checks (only ONE specific role is ever restricted per dimension; every
other role, including Admin/CEO, was always unrestricted for that dimension).

`resolveResourceScope(resourceType, record)` and `assertScopeAccess(actor, resourceType, record)`
implement the "resolve from the authoritative database record, never the client payload" requirement
(§5/§13) — see the Audit's §4 resource-to-scope mapping table.

## 2. Equivalence proofs for the 10 migrated sites

**Read-filter pattern** (`timesheet`/`tasks`/`risk-register` GET routes):
```
OLD: if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
NEW: rows = rows.filter(r=>hasScopeAccess(actor,'Project',r.projectId));
```
For `actor.role==='ProjectManager'`: `hasScopeAccess` = `isProjectManagerOf(actor,r.projectId)` —
identical to the OLD filter predicate. For every OTHER role: `hasScopeAccess` = `true` unconditionally
— identical to OLD's implicit "no filter applied" (the `if` was simply skipped). **Provably
equivalent for all 10 roles.**

**Write-gate pattern** (`material-requirements`/`timesheet`/`tasks`/`risk-register` POST routes):
```
OLD: (actor.role==='ProjectManager' && isProjectManagerOf(actor,body.projectId)) || ['Admin','CEO'].includes(actor.role)
NEW: ['ProjectManager','Admin','CEO'].includes(actor.role) && hasScopeAccess(actor,'Project',body.projectId)
```
- `actor.role==='ProjectManager'`: NEW = `true && isProjectManagerOf(...)` = `isProjectManagerOf(...)` — matches OLD's left disjunct exactly (OLD's right disjunct is false for PM).
- `actor.role==='Admin'` or `'CEO'`: NEW = `true && hasScopeAccess(...)`. Since `actor.role!=='ProjectManager'`, `hasScopeAccess` returns `true` unconditionally — NEW = `true`. OLD = `false || true` = `true`. **Match.**
- Any other role: NEW's allow-list membership is `false` — NEW = `false` regardless of the second clause. OLD's both disjuncts are `false` — OLD = `false`. **Match.**

**Proven identical for every one of the 10 roles, algebraically and by test** (39/39 + 18/18 + 32/32
— see the Test Report).

**Customer dimension** (`/api/ar/invoice` `extraCheck`):
```
OLD: (actor.role==='Sales' && body.customerId && !assignedCustomers.includes(body.customerId)) -> DENY
NEW: (body.customerId && !hasScopeAccess(actor,'Customer',body.customerId)) -> DENY
```
`hasScopeAccess` negated equals `actor.role==='Sales' && !assignedCustomers.includes(...)` exactly
(the `actor.role!=='Sales' ||` guard collapses to `false` only when role IS Sales AND the customer
isn't assigned) — **identical to OLD.**

## 3. Scope resolution for indirect resources — the inheritance proof

`resolveResourceScope('PaymentRequest', record)` walks `record.invoiceEntryId` to the real posted
`DB.journalEntries` record, finds the AP line matching `record.vendorId`, and reads its `projectId` —
the SAME field `supplierOpenItems()` itself already surfaces. Proven against a REAL created chain in
the test suite: a real supplier bill drafted via `draftSupplierInvoice()`, submitted/approved/posted
through the actual Submit→Approve→Post lifecycle, then a real Payment Request created against it —
`resolveResourceScope()`'s result matched `supplierOpenItems()`'s own reported `projectId` exactly.

This capability is exposed (`D.resolveResourceScope`/`D.assertScopeAccess`) but **not wired into
`createPaymentRequest()`'s own enforcement** — Payment Requests have no pre-existing project-scope
restriction as a business rule (any Purchase-role user may create a PR for any vendor today); adding
one would be new business policy, out of this CR's scope. This is a demonstrated CAPABILITY, not a new
restriction — documented explicitly, not silently wired in.

## 4. Global/unrestricted default

Preserves the existing `branchAllowed()` precedent exactly: a user with no scope assignment, or whose
role is not the one dimension-restricted role, remains unrestricted for that dimension. Not a new
policy choice — see the Audit §2/§6 and `ARCH-2026-001C-OPEN-DECISIONS.md` for the explicit rationale.

## 5. Multi-role behavior

N/A — not implemented, not invented. This codebase has no multi-role assignment capability
(`DB.users.role` is a single string; ARCH-2026-001A's `DB.userRoles` is a 1:1 migration mirror of that
same field). See `ARCH-2026-001C-OPEN-DECISIONS.md`.

## 6. Files changed

- `server/domain.js`: new Data Scope section (`hasScopeAccess`, `resolveResourceScope`,
  `assertScopeAccess`), exported via `module.exports`. No existing function's body modified.
- `server/server.js`: 10 enforcement-site edits (see Audit §3.A) — all provably equivalent, all
  covered by direct equivalence tests before being trusted.

## 7. What this CR did NOT build

`DB.userScopeAssignments` or any new generic scope-grant collection (existing per-user/per-record
fields reused instead, per §8). Warehouse/Cost Centre/Profit Centre/Department scope (confirmed absent
from the data model). SoD, Approval Authority, CEO/Admin split, any new business domain.
