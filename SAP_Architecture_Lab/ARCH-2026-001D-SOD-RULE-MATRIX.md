# ARCH-2026-001D — SoD Rule Matrix

**Date:** 2026-09-21. Every rule below is clearly labeled by status — nothing here is presented as
"approved Appletree policy" beyond what the existing, pre-CR codebase already enforced.

| # | Rule ID | Status | Description | Capability A | Capability B | Affected role/duty/privilege | Preventive/Detective | Scope interaction | Exemption policy | Audit requirement | Test coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | SOD-1 | **EXISTING APPROVED RULE** (pre-CR, unchanged) | Payment Request Maker-Checker | Create (raise) a Payment Request | Approve a Payment Request | `PaymentRequest.CREATE`/`APPROVE` — all roles able to do either | Preventive | N/A (same document) | None (no exemption exists — always enforced) | Existing `logAudit()` on rejection | `erp_phase39_payment_approval_matrix_tests.js` (pre-existing) |
| 2 | SOD-2 | **EXISTING APPROVED RULE** (pre-CR, unchanged) | Payment Request Maker/Checker != Executor | Create/Approve a Payment Request | Execute the same Payment Request | Roles able to execute (`Admin`,`CEO`,`FinanceManager`) | Preventive | N/A (same document) | **Pre-existing, approved: CEO/Admin exempted** (`!['CEO','Admin'].includes(actor.role)` guard) | Existing `logAudit()` | `erp_phase39_payment_approval_matrix_tests.js` (pre-existing) — re-confirmed unaffected by this CR |
| 3 | SOD-3 | **EXISTING APPROVED RULE** (pre-CR, unchanged) | Excess Billing / Excess Material Issue Second-Person Approval | Raise an excess-billing/material-issue override | Approve that same override | `can(actor,'approve')`-gated roles | Preventive | N/A (same document) | None documented | Existing `logAudit()` | Pre-existing (unrelated to this CR) |
| 4 | SOD-4 | **EXISTING APPROVED RULE** (pre-CR, unchanged) | Snag Verifier != Resolver | Resolve a Snag | Verify that same Snag | Execution & Delivery roles | Preventive | N/A (same document) | **Pre-existing: CEO/Admin exempted** | Existing `logAudit()` | Pre-existing (unrelated to this CR) |
| 5 | SOD-5 | **IMPLEMENTED RULE** (NEW, this CR) | Vendor Master Maintenance vs Payment Execution | Create a Vendor Master record (`can(actor,'masterData')` → `{Admin,CEO}`) | Execute a Supplier Payment to that SAME vendor (`can(actor,'pay')` → `{Admin,CEO,FinanceManager}`) | Business Roles: Admin, CEO (the only roles holding both capabilities) | **Preventive** | User-level, per-transaction-instance (the specific vendor's `createdBy` vs the specific payment's executor) — NOT a static role ban | **No automatic exemption for any role, including CEO/Admin** — an exemption may be granted only via the new `grantSoDException()` mechanism (Admin/CEO-only, cannot self-grant, documented reason required) | `logAudit({type:'SoDViolationBlocked', ruleId:'SOD-5', ...})` on every block | 6 dedicated assertions in `tests/erp_arch_2026_001d_sod_tests.js` (engine + live HTTP) |
| 6 | SOD-6 | **IMPLEMENTED RULE** (NEW, this CR) | GRN Recording vs Matched Supplier Bill Creation | Record a GRN (`assertCanCreateGRN()` → `{Admin,CEO,Purchase}`) | Create the PO-matched Supplier Bill against that SAME GRN | Business Roles: Admin, CEO, Purchase (Purchase can do both via the generic create-tag path) | **Preventive** | User-level, per-transaction-instance (the specific GRN's `createdBy` vs the specific bill's creator) | **No automatic exemption for any role** — same exception mechanism as SOD-5 | `logAudit({type:'SoDViolationBlocked', ruleId:'SOD-6', ...})` on every block | 3 dedicated assertions in `tests/erp_arch_2026_001d_sod_tests.js` (engine + live HTTP) |

## Proposed but not implemented (out of this CR's scope, disclosed not invented)

No further rules are proposed as "PROPOSED RULE" in this CR — the P2P chain audit (§6 of the task
brief) found exactly 2 real, evidenced capability overlaps (§3 of the Audit), and both are implemented
above. Additional textbook P2P SoD rules exist in general ERP practice (e.g. "PO creator != PO
approver" — already covered by the existing `poApprovalAuthorityMatrix` self-approval logic, a
pre-existing Approval Authority control, not an SoD gap; "RFQ/Comparison creator != PO approver" — not
evidenced as a real role overlap in this codebase's current role model) — these were considered and
NOT proposed because this audit found no real, currently-exploitable overlap for them, not because
they were skipped for convenience.

## OPEN MANAGEMENT DECISION carried by this matrix

The deliberate absence of a CEO/Admin exemption on SOD-5/SOD-6 (in contrast to the pre-existing,
approved exemption on SOD-2/SOD-4) is a real operational question for a small company where the CEO
may legitimately need to both onboard a vendor and authorize its first payment. This is NOT decided by
this CR — see `ARCH-2026-001D-SOD-OPEN-DECISIONS.md` §1.
