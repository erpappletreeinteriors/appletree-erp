# PHASE 38 — Security / RBAC / Controls Trace Report

**Date:** 2026-09-11. Built from a dedicated forensic code-tracing pass (real file:line citations)
plus live reproduction of several controls during the E2E test run. Roles: Admin, CEO, Accountant,
FinanceManager, ProjectManager, Purchase, Sales, Estimator, SiteInCharge, Viewer.

## Server-side enforcement is real, not a UI convenience

Every SoD check traced lives **inside the domain function itself**, comparing `x.createdBy===
actor.id` where `actor.id` comes from the server's own session/auth layer — never a client-supplied
field. Confirmed for: JE approval (`approveDraft`/`postDraft`), PO approval, Payment Request
approval/execution, BOM approval, Change Request, Supplier Comparison, Quotation discount, Dispatch,
CAPA, warranty/service diagnosis, Purchase Requisition, Site Material Requisition.

**3 sensitive routes traced end-to-end** (`journal/:id/approve`, `purchase-orders/:id/approve`,
`ap/payment`) — in every case the authorization check (`can(actor,'approve')`/`authCheck(actor,
body)`) executes and can `deny()` **before** the domain mutation function is ever called. For the
modern `registerMutationRoute` dispatcher this is structural: `authCheck` runs at line ~469-479,
the domain handler is invoked at line 501, strictly after.

**No unchecked mutation route exists — enforced by two independent structural mechanisms**, not
just by observation:
1. `route_safety_scanner.runRouteSafetyAudit()` runs unconditionally before `server.listen()` — if
   any legacy `if(pathname...)` mutation branch lacks a recognizable authorization signal, the
   process **refuses to boot**. Independently re-run this phase against the live current
   `server.js`: **218 routes checked, 0 violations.**
2. Every route registered via the modern `registerMutationRoute()` framework is structurally forced
   to declare `permission`/`roles`/`authCheck` at registration time — omitting all three throws at
   startup.

## Segregation of duties — spectrum from strict to CEO/Admin-overridable

| Function | SoD rule | CEO/Admin exemption? |
|---|---|---|
| Payment Request approval | Unconditional maker≠checker | **No** |
| Payment Request execution | Must be a 3rd person distinct from maker+checker | **Only** CEO/Admin may collapse this to fewer people |
| Excess Billing Approval | Unconditional | **No** |
| Excess Material Issue | Unconditional | **No** |
| Purchase Order approval | Creator≠approver unless a finalised, board-approved self-approval limit covers the PO value | **No blanket exemption** — Admin has no PO approval authority by default |
| Journal Entry approve/post | Creator≠approver | **Yes**, logged as `SelfApprovalOverride` |
| BOM approval | Creator≠approver | **Yes** |
| Change Request / Supplier Comparison / Dispatch / PR / MRS approval | Creator≠approver | **Yes** (same pattern as JE/BOM) |

This is a genuine, deliberate spectrum (confirmed by the code's own comments distinguishing "no
Admin exemption, matching the Excess Material Issue [pattern]" from the JE/BOM pattern) — not an
oversight. Live-reproduced this phase: Payment Request maker≠checker enforcement, and Purchase Order
auto-approval-within-threshold (a real, working authority-matrix feature discovered live during
E2E testing, not previously documented in this session's own test script assumptions).

## Payment Approval Matrix / PO Approval Authority Matrix — real but partial enforcement

The Payment Approval Matrix **is consulted** (`paymentApprovalRoleFor(amount)` is called when a
Payment Request is created and the required role is stored on the request), but
`approvePaymentRequest()` only explicitly re-checks the **top (CEO)** tier in code — the lower
tiers' role requirement is enforced indirectly, via the fact that the route-level `SOP_FINANCE_ROLES`
set (`Admin`/`CEO`/`FinanceManager`) doesn't include `Accountant`/`Purchase` at all, so those roles
can never reach the approval function regardless of what their configured tier says. The matrix
itself defaults `finalised:false` and its own error text self-labels as "(Not Finalised) SOP
illustrative approval matrix" until walked through a separate board-level finalisation flow.

The PO Approval Authority Matrix **does not** drive the base amount-threshold routing (a separate,
always-active `poApprovalRules`/`requiredPOApprovalRole()` config does that) — it only governs
whether a PO's own creator may self-approve, and by how much. Both matrices are real, connected to
real enforcement, but neither is a simple "single source of truth" — a human reader of just the
matrix screen would not see the complete picture without also reading `poApprovalRules`.

## Blast radius if an Admin account is compromised

An attacker holding Admin could: self-approve/self-post JEs (audited, not blocked); approve any-tier
quotation discount regardless of configured threshold; self-approve most maker-checker workflows
except Payment Request/Excess Billing/Excess Material Issue (unconditionally blocked, no Admin
exemption); post into closed projects with a self-supplied reason (audited); reopen closed financial
periods (subject to being separately granted that period's configured override role to then post
into it); collapse the Payment Request 3-person chain. It could **not** self-approve a PO without a
finalised, board-configured self-approval limit, nor bypass the unconditional maker≠checker checks
on Payment Request/Excess Billing/Excess Material Issue.

## Financial period control

Confirmed as a single choke point inside `postJournalEntry()`, keyed off the transaction's own
posting `date` (not system time), with override requiring a per-period-configured role plus a
mandatory reason — both audited (`FinancialPeriodOverrideRoleSet`, `FinancialPeriodReopened`). Live-
reproduced this phase: a period was created and closed, and a subsequent posting attempt into it
was blocked at the draft stage.

## Live-reproduced negative security tests this phase

| Test | Result |
|---|---|
| Payment Request approved by a different user than the requester (maker≠checker) | PASS (enforced) |
| PO submit auto-approves within threshold; explicit re-approval of an already-Approved PO correctly rejected ("not Submitted") | PASS (correct behavior, not a bug) |
| Posting into a closed financial period | BLOCKED |
| Over-receipt beyond remaining PO quantity | BLOCKED |
| Duplicate Supplier Bill against an already-billed GRN | BLOCKED |
| Payment exceeding/re-paying an already-fully-paid Bill | BLOCKED |
| Reversal of a document with existing clearings | BLOCKED |
| Site Material Requisition creation by ProjectManager (wrong role) | BLOCKED (403, live-reproduced) |
| Material Issue with a `siteId` by ProjectManager (wrong role for site-scoped issue) | BLOCKED (403, live-reproduced) |
| Material Issue exceeding available site stock | BLOCKED |
| Receipt against an already-fully-cleared Customer Invoice (overpayment) | BLOCKED |
| Receipt against a reversed/cancelled Customer Invoice | BLOCKED |

## Not tested this phase

Browser-based/UI-manipulation attack vectors (crafted requests via dev tools, stale-page resubmits,
alternate-screen access) were not independently exercised this phase beyond the direct-HTTP
negative tests above — the server-side authorization findings above make UI-only bypass
structurally impossible for the routes examined (the check happens before the domain function
regardless of what the UI shows), but this was not separately browser-verified. See
`PHASE38_BROWSER_TEST_REPORT.md`.

**No P0 (security bypass) finding was produced by this trace.**
