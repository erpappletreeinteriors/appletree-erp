# ARCH-2026-001D — SoD Implementation

**Date:** 2026-09-21. What was built, grounded in `ARCH-2026-001D-SOD-AUDIT.md` and
`ARCH-2026-001D-SOD-RULE-MATRIX.md`.

## 1. Reused, not duplicated

`checkSoD(ruleId, {makerId, checkerId})` — the exact same function ARCH-2026-001A built and proved by
unit test — is the ONLY evaluator used for SOD-5 and SOD-6. No second SoD engine, no
resource-specific competing evaluator, no client-only check. `DB.sodRules`/`DB.sodExceptions` are the
same collections, extended (2 new rows) not replaced.

## 2. Preventive enforcement — server boundary only

**SOD-5**, inside `executePaymentRequest()` (`server/domain.js`), after the existing maker/checker/
executor check, before `withTransaction()`:
```js
const vendor = DB.vendors.find(v=>v.id===req.vendorId);
const sod5 = checkSoD('SOD-5', {makerId: vendor && vendor.createdBy, checkerId: actor.id});
if(sod5.violated){
  logAudit({type:'SoDViolationBlocked', ruleId:'SOD-5', ...});
  return {ok:false, error:`SoD violation: ...`};
}
```

**SOD-6**, inside `draftSupplierInvoiceFromPO()` (`server/domain.js`), immediately after the existing
`grn.poId!==poId` check (earliest possible rejection point, matching this file's own stated
principle):
```js
const sod6 = checkSoD('SOD-6', {makerId: grn.createdBy, checkerId: createdByUserId});
if(sod6.violated){
  logAudit({type:'SoDViolationBlocked', ruleId:'SOD-6', ...});
  return {ok:false, error:`SoD violation: ...`};
}
```

Both checks live INSIDE the domain function itself (not only at the route layer) — the same
"duplicate-door" defense-in-depth discipline this codebase already applies to its highest-risk
functions (`postDraft()`, `reverseEntry()`, `createMaterialIssue()`). No client-side, menu-visibility,
or hidden-button mechanism exists or was relied upon.

## 3. Detective scan

`detectSoDConflicts(actor)` — Admin/CEO-only, scans:
- `DB.paymentApprovals` (status `Executed`) for SOD-5 (vendor `createdBy` === payment `executedBy`).
- `DB.jeDrafts` (with a `grnId`) for SOD-6 (GRN `createdBy` === bill draft `createdByUserId`,
  regardless of whether the draft has since been posted).

Returns user, resource, related resource, rule ID, effective status, and timestamp for each conflict
found — including conflicts that PREDATE this CR's own preventive checks (this CR's preventive
controls only stop NEW attempts; the detective scan finds anything already in the data). Every scan
run is itself audited (`SoDDetectiveScanRun`).

## 4. Level of evaluation — resolved, not invented

Per `ARCH-2026-001D-SOD-AUDIT.md` §5, multi-role assignment does not exist in this codebase — every
user has exactly one role. SoD in this CR therefore evaluates **per-user identity, per-transaction-
instance** (does the SAME login ID appear at both conflicting steps of THIS SPECIFIC chain?) — not a
static "does this ROLE hold both capabilities" ban, which would incorrectly lock an entire role out of
legitimate work forever. This is the ONLY level the existing architecture's own maker-checker
precedent (SOD-1..4) actually models, so no new semantics were invented — SOD-5/6 are a direct,
mechanical extension of the exact same pattern to 2 new document-type pairs.

## 5. SoD administration

`grantSoDException()`/`revokeSoDException()` — Admin/CEO-only (enforced both inside the domain
function AND at the route layer, per this codebase's route-safety-scanner requirement that every
legacy route declare its own `deny()` call). A user can never self-grant (`userId===actor.id` is
explicitly rejected). Every grant/revoke requires a documented reason and is fully audited via the
existing `logAudit()` path. No administration UI was built — 3 new backend routes
(`GET /api/sod/rules`, `GET /api/sod/conflicts`, `POST /api/sod/exceptions`,
`POST /api/sod/exceptions/:id/revoke`) are sufficient and consistent with this codebase's existing
"backend-controlled configuration" pattern (e.g. `DB.poApprovalAuthorityMatrix` has no dedicated UI
either).

## 6. A defect found and fixed during implementation

The first version of the 2 new POST routes (`/api/sod/exceptions`, `/api/sod/exceptions/:id/revoke`)
relied ONLY on the domain-layer Admin/CEO check (`grantSoDException()`/`revokeSoDException()`
returning `{ok:false}` on an unauthorized attempt) — this is CORRECT for actual security (an
unauthorized caller genuinely could not grant/revoke anything), but it caused the server to **refuse
to start entirely**: this codebase's `route_safety_scanner.js` runs a startup-time audit requiring
every legacy (non-`registerMutationRoute`) mutation route to declare its own `deny(res,403,...)` call
directly in the route block, and these 2 routes had none (the check lived one layer down, inside the
domain function). Caught immediately via `node --check`+a live foreground start attempt, before any
formal test file was written. Fixed by adding the same explicit `deny()` guard already used
successfully on the other 2 new SoD routes. Re-verified: server starts cleanly, full 30/30 new-suite
pass, zero change to the actual authorization outcome (the domain-layer check was always correct; this
was a startup-gate compliance fix, not a security fix).

## 7. Data-scope interaction (§11)

SOD-5/SOD-6 run in ADDITION to, never instead of, the existing permission + data-scope checks. Neither
new check can GRANT access — both are pure additional DENY conditions layered on top of the
already-passing base authorization (`can(actor,'pay')`/`assertCanCreateGRN()` etc. still run first,
unchanged). No scope assignment can bypass an SoD block — the two mechanisms are structurally
independent function calls, not a single merged condition that could accidentally OR together.

## 8. Files changed

- `server/domain.js`: `RBAC_SOD_RULES_SEED` extended (+2 rows), `detectSoDConflicts()`,
  `grantSoDException()`, `revokeSoDException()` (new), 2 new preventive checks inside
  `executePaymentRequest()` and `draftSupplierInvoiceFromPO()`, `module.exports` extended.
- `server/server.js`: 4 new routes (`/api/sod/rules`, `/api/sod/conflicts`, `/api/sod/exceptions`,
  `/api/sod/exceptions/:id/revoke`), each with its own explicit `deny()` guard.
- `tests/erp_arch_2026_001a_rbac_foundation_tests.js`: TEST 11's assertion changed from
  `sodRules.length===4` to `sodRules.length>=4` (with all 4 original IDs still required present) —
  the ONLY change to a prior CR's test file, reflecting this CR's own authorized, documented rule-set
  extension, not a weakened test (see the Regression Report for the full before/after).
