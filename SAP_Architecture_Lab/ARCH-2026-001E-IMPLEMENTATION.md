# ARCH-2026-001E — Implementation

**Date:** 2026-09-21. What was built, grounded in `ARCH-2026-001E-APPROVAL-AUDIT.md` and
`ARCH-2026-001E-APPROVAL-MATRIX.md`.

## 1. The real fix — Design Review self-approval

`reviewDesign()` (`server/domain.js`) gained the ONE check every comparable approval function already
had:
```js
if(status==='Approved' && d.submittedBy===actor.id && !['CEO','Admin'].includes(actor.role)){
  return {ok:false, error:'Segregation of duties: design submitter cannot also approve their own design.'};
}
```
Scoped to `status==='Approved'` specifically (not every status this combined review/reject/approve
function can set) — moving a design to `UnderReview` or `RevisionRequested` is not a self-approval
risk, and this codebase's own existing SoD checks elsewhere are likewise scoped to the approval act
itself, not every state transition. Uses the IDENTICAL `!['CEO','Admin'].includes(actor.role)`
exemption already used in every other self-approval check in this file (PO, Quotation Discount,
Change Request, BOM) — not a new, stricter, or looser policy.

## 2. The centralized diagnostic — `resolveApprovalAuthority()`

A single, read-only function composing the frozen formula:
```
CAN APPROVE = base permission AND data scope AND no SoD conflict AND approval authority
```
for the 4 transaction types with a real, tested approval mechanism (`PurchaseOrder`,
`QuotationDiscount`, `PaymentRequest`, `DesignReview`). It does **not** replace or duplicate any
existing enforcement — `approvePurchaseOrder()`/`approveQuotationDiscount()`/
`approvePaymentRequest()`/`reviewDesign()` remain the sole, authoritative, unchanged enforcement for
each type. `resolveApprovalAuthority()` mirrors their EXACT existing logic (re-read from each function
fresh, not assumed) so any caller — this CR's own test suite, or a future UI — can ask "would this
actor be allowed to approve this record" without attempting the mutation. Cross-checked against the
REAL enforcement functions in the test suite (`[Cross-check]` assertions) to prove the mirror is
faithful, not just internally self-consistent.

Reused, not reinvented, for every sub-check:
- Base permission / role-tier: reads `requiredPOApprovalRole()`, `poApprovalAuthorityFor()`,
  `requiredDiscountApprovalRole()`, `paymentApprovalRoleFor()` — the exact existing functions.
- Data scope: reuses `hasScopeAccess()` (ARCH-2026-001C) unchanged.
- SoD: the `sodOk` field is structurally present for every type (per the frozen formula) but is only
  ever `false` for PaymentRequest, where it reflects the SAME `isCreator`/maker check
  `approvePaymentRequest()` itself already enforces as SOD-1 — no NEW SoD rule was added this CR (per
  the task's own explicit "do not add new SoD rules unless absolutely required" instruction; none was
  required, since PO/Quotation/DesignReview approval never had a dedicated SoD rule to reuse, and
  none of the ARCH-2026-001D P2P rules apply to the *approval* step itself).

## 3. New route — read-only, not a new enforcement point

`GET /api/approval-authority/check?transactionType=X&id=Y` — resolves the real record from the
correct collection, calls `resolveApprovalAuthority()`, returns the result. Requires authentication
(via the existing `getActor()` mechanism) but no additional role gate — it is self-referential ("can
**I** approve this") and reveals nothing about any other actor's eligibility. Forged/unknown
`transactionType` → 400; nonexistent record ID → 404; both proven live, not just by inspection.

## 4. Data-scope + SoD interaction — verified, not assumed

For the one type where a scope-restricted role holds approval authority (`DesignReview` /
`ProjectManager`), `scopeOk` is computed from the SAME `hasScopeAccess()` call the real route already
performs (ARCH-2026-001C-F) — proven identical by the engine test (`scopeOk:false` for a
wrong-project ProjectManager, matching the real route's live 403). For `PaymentRequest`, `sodOk`
mirrors the real SOD-1 check exactly. No dimension was invented, and no existing scope/SoD function
was modified by this CR.

## 5. Concurrency — verified, not assumed

Two authorized users (CEO, FinanceManager) fired simultaneous `POST .../approve` requests at the SAME
high-value PO. Exactly one succeeded; the other received the correct rejection (the PO's status had
already transitioned to `Approved` by the time the second request's own `po.status!=='Submitted'`
check ran) — this is the PRE-EXISTING status-guard mechanism (unchanged by this CR) proven to already
be safely concurrency-resistant for this scenario; no new locking/transaction code was needed or added.

## 6. What this CR deliberately did NOT change

- `poApprovalRules`, `poApprovalAuthorityMatrix`, `discountApprovalRules`, `paymentApprovalMatrix` —
  untouched (values, structure, `finalised` status all unchanged).
- `approvePurchaseOrder()`, `approveQuotationDiscount()`, `approvePaymentRequest()`,
  `executePaymentRequest()`, `approveChangeRequest()`, `approveBOM()` — untouched (the ONLY function
  body changed is `reviewDesign()`, for the one real gap).
- No new SoD rule was added (SOD-5/SOD-6 from ARCH-2026-001D remain the full set of P2P rules; no
  SOD-7 was created).
- No CEO/Admin separation, no new business role, no new business domain.

## 7. Files changed

- `server/domain.js`: `reviewDesign()` self-approval check (the fix); `APPROVAL_TRANSACTION_TYPES` +
  `resolveApprovalAuthority()` (new); `module.exports` extended.
- `server/server.js`: 1 new route (`GET /api/approval-authority/check`).
