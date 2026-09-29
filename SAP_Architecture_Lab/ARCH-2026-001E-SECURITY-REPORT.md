# ARCH-2026-001E — Security Report

**Date:** 2026-09-21. Explicit security testing per this CR's own §25.

## 1. API bypass tests

| Attack | Result |
|---|---|
| Forged user | Every approval route derives `actor` exclusively from the session (`getActor()`), unchanged by this CR — a forged `userId` in a request body is never consulted for identity |
| Forged role | Same mechanism — proven live (Sales cannot approve a design regardless of any client-supplied role claim) |
| Forged approver | The approval-authority diagnostic and every real approval route resolve eligibility from the AUTHENTICATED actor only, never a client-supplied "approverId" |
| Forged approval level | `requiredRole`/tier is computed server-side from the record's own stored amount/percentage — never trusted from the client |
| Forged amount | PO/Quotation/PaymentRequest amounts are read from the stored record (`po.total`, `q.discountPct`, `req.amount`), never from the approval request's own body |
| Forged project/branch/site | `scopeOk` is resolved via `hasScopeAccess()` against the record's own stored `projectId`, never a client-supplied value — proven live (PM blocked from approving a design for PRJ-2 despite requesting exactly that record's real ID) |
| Forged transaction ID | A forged/nonexistent record ID on the diagnostic endpoint returns 404, not a crash or a false eligibility |
| Direct endpoint call | Every test in this CR's suite is a direct `fetch()`/in-process domain call, live-proven via both an automated suite and a real browser session |
| Alternate endpoint | The diagnostic endpoint (`GET /api/approval-authority/check`) is read-only and cannot itself perform an approval — even a full "canApprove:true" response requires a SEPARATE call to the real, independently-checked enforcement route to have any effect |
| Repeated approval | Re-approving an already-`Approved` design (or PO) is rejected by the pre-existing state guard, unaffected by this CR, re-proven live |
| Approval after cancellation | Not separately re-tested this CR (no new cancellation-adjacent logic was touched); covered by the unchanged, pre-existing state-guard pattern already exercised by the full regression battery |

## 2. Self-approval protection

Proven for all 4 checked in this CR: PO (pre-existing, re-confirmed), Quotation Discount (pre-existing,
re-confirmed), Payment Request (pre-existing SOD-1, re-confirmed), **Design Review (the fix, newly
proven both at the engine level and live through a real browser session)**.

## 3. Data-scope interaction

Proven for Design Review (the one mechanism where a scope-restricted role holds approval authority) —
both via the engine-level `resolveApprovalAuthority()` diagnostic and the real, already-existing route
check (ARCH-2026-001C-F), which this CR did not modify.

## 4. SoD interaction

Proven for Payment Request (SOD-1, pre-existing) and, incidentally during the browser UAT chain-
building, SOD-6 (ARCH-2026-001D) was independently re-confirmed still correctly blocking a same-user
GRN-then-bill attempt — proof the 001D SoD layer and this CR's new code coexist without interference.

## 5. Concurrency

Two simultaneous, independently-authorized approval attempts on the SAME high-value PO: exactly one
succeeded, the other was cleanly rejected by the pre-existing status guard — no duplicate approval, no
state corruption, verified via a real concurrent `Promise.all()` HTTP race against a live server.

## 6. Auditability

Every approval action (PO, Quotation Discount, Payment Request, Design Review) continues to call the
existing, unmodified `logAudit()`/`DB.auditLog` path — no new audit collection was created. The new
diagnostic endpoint is read-only and does not itself write an audit entry (it performs no state
change) — consistent with this codebase's existing convention of auditing MUTATIONS, not reads.

## 7. Performance

`resolveApprovalAuthority()` performs the SAME lookups (`DB.users.find()`,
`poApprovalAuthorityFor()`'s in-memory object access, `hasScopeAccess()`'s existing O(1)/small-array
checks) the real enforcement functions already perform — no new N+1 pattern, no new full-table scan,
no caching of any authorization decision (every call re-resolves fresh from current data).

## 8. Conclusion

No approval bypass found. Self-approval gap (Design Review) found and fixed, then proven closed by
both automated and live browser tests. Scope and SoD interaction confirmed correct for every
mechanism where they apply. Concurrency proven safe using the existing, unmodified state-guard
mechanism.
