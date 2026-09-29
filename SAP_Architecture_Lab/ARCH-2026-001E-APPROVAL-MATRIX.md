# ARCH-2026-001E — Approval Matrix

**Date:** 2026-09-21. Every rule below is clearly labeled — nothing here is presented as approved
Appletree policy beyond what the pre-existing codebase already enforced.

| Rule ID | Transaction Type | Action | Approval Level | Amount Threshold | Scope Requirement | SoD Requirement | Self-Approval Rule | Effective Date | Exception Rule | Approver Eligibility | Audit Requirement | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AA-PO-1 | PurchaseOrder | Approve | Role-tier (no numbered level) | `DB.poApprovalRules`: ≤₹500,000 auto / ≤₹2,000,000 FinanceManager / above CEO | None (no scope-restricted role holds this authority) | None dedicated | Creator blocked unless `selfApprovalAllowed` AND a finalised `selfApprovalLimit` covers the amount — **currently always blocked** (limit not finalised, pre-existing OPEN decision) | N/A (no effective-date concept in this mechanism) | None | Role in `poApprovalAuthorityMatrix` with `financialApprovalAuthority:true`, or exact `requiredRole` match | `logAudit()` (existing) | **EXISTING APPROVED RULE** (unchanged by this CR) |
| AA-QD-1 | QuotationDiscount | Approve | Role-tier | `DB.discountApprovalRules`: ≤5% auto / ≤10% FinanceManager / above CEO | None | None dedicated | Creator blocked unless CEO/Admin (no threshold exemption exists) | N/A | None | Exact `requiredRole` match, or Admin | `logAudit()` (existing) | **EXISTING APPROVED RULE** (unchanged) |
| AA-PR-1 | PaymentRequest | Approve (checker) | Role-tier | `DB.paymentApprovalMatrix`: ≤₹5,000 Accountant / ≤₹100,000 Purchase-tier / above CEO (**Not Finalised, pre-existing OPEN item**) | None | **SOD-1** (unconditional maker≠checker) | N/A (SOD-1 covers this) | N/A | None | `SOP_FINANCE_ROLES` + top-tier CEO/Admin requirement | `logAudit()` (existing) | **EXISTING APPROVED RULE** (unchanged) |
| AA-PR-2 | PaymentRequest | Execute | N/A | N/A | None at this step | **SOD-2** (maker/checker≠executor, CEO/Admin exempt — pre-existing) + **SOD-5** (vendor-creator≠executor — ARCH-2026-001D, no exemption) | Covered by SOD-2/SOD-5 | N/A | None | `can(actor,'pay')` | `logAudit()` (existing) | **EXISTING APPROVED RULE** (unchanged) |
| AA-CR-1 | ChangeRequest | Approve | Role-list | None (no amount gate) | None | None dedicated | Creator blocked unless CEO/Admin | N/A | None | `{Admin,CEO,FinanceManager}` | `logAudit()` (existing) | **EXISTING APPROVED RULE** (unchanged) |
| AA-BOM-1 | BOM | Approve | Generic `approve` tag | None | None at approval (create/view already scope-filtered) | None dedicated | Creator blocked unless CEO/Admin | N/A | None | `can(actor,'approve')` | `logAudit()` (existing) | **EXISTING APPROVED RULE** (unchanged) |
| AA-DSN-1 | DesignReview | Approve/Reject/UnderReview | Role-list | N/A | `hasScopeAccess(actor,'Project',design.projectId)` for ProjectManager (existing, ARCH-2026-001C-F) | None dedicated | **IMPLEMENTED THIS CR** — submitter blocked from approving their own design unless CEO/Admin (same convention as every other row above) | N/A | None | `{Admin,CEO,ProjectManager}` (+ scope for ProjectManager) | `logAudit()` (existing) | **IMPLEMENTED RULE** (the fix) |
| AA-DIAG-1 | (all 4 types above) | Read-only "can I approve?" check | N/A | N/A | Reused from the type's own rule | Reused from the type's own rule | Reflects the type's own rule | N/A | N/A | Authenticated user, self-referential only | `GET /api/approval-authority/check` — no audit write (pure read, no state change) | **IMPLEMENTED RULE** (new diagnostic, not a new enforcement point) |

## Compatibility rules

None required — every existing mechanism's actual enforcement function (`approvePurchaseOrder()`,
`approveQuotationDiscount()`, `approvePaymentRequest()`, `executePaymentRequest()`,
`approveChangeRequest()`, `approveBOM()`, `reviewDesign()`) remains the sole, unchanged, authoritative
enforcement path — `resolveApprovalAuthority()` is a read-only mirror, never a competing engine.

## Proposed rules — none

No further rule is proposed. The audit (`ARCH-2026-001E-APPROVAL-AUDIT.md` §4) found no other
evidenced scope/SoD gap given the current role-authority overlap reality.

## Open management decisions carried by this matrix

- **AA-PO-1's self-approval limit** (`poApprovalAuthorityMatrix.selfApprovalLimit`, currently `null`
  for CEO/FinanceManager) — pre-existing, not decided by this CR.
- **AA-PR-1's threshold finalisation** (`paymentApprovalMatrix.finalised:false`) — pre-existing, not
  decided by this CR.

Neither is newly discovered by this CR — both are re-confirmed, unchanged, pre-existing OPEN items.
