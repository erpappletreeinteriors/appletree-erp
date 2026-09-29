# ARCH-2026-001E — Approval Authority Audit

**Date:** 2026-09-21. Read-first reconnaissance, completed before any implementation.

## 1. Frozen documents consulted

`ARCH-2026-001-ARCHITECTURE-FREEZE.md`, `ARCH-2026-001-RBAC-TARGET-DESIGN.md`,
`ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md`, `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md`,
`ARCH-2026-001A/B/C/C-F/D-*` (all reports + tests).

**Confirmed:** `ARCH-2026-001A-RBAC-TARGET-DESIGN.md`'s own `RBAC_APPROVAL_AUTHORITIES_SEED` (3
descriptive/reference rows) already named the 4 pre-existing approval mechanisms this audit re-verifies
below, explicitly as "referenced not replaced." No frozen document defines new amount thresholds,
approval levels, or a company/currency dimension beyond what already exists — none are invented here.

## 2. Existing approval mechanisms — full inventory

| Mechanism | Resource | Action | Current approver determination | Current amount rule | Current scope rule | Current SoD rule | Current audit | Current API | Already centralized? |
|---|---|---|---|---|---|---|---|---|---|
| PO approval | `PurchaseOrder` | Approve | `requiredPOApprovalRole(total)` + `poApprovalAuthorityFor(role).financialApprovalAuthority` | `DB.poApprovalRules` (₹500,000 / ₹2,000,000 / CEO tiers) | **NONE** — no scope-restricted role (ProjectManager) holds PO approval authority in the current `poApprovalAuthorityMatrix` (verified: only CEO/FinanceManager/Purchase/Admin are represented) | Self-approval blocked via `poApprovalAuthorityMatrix.selfApprovalAllowed`/`selfApprovalLimit` (currently `null` for both CEO/FinanceManager — **matrix itself is `finalised:false`, a pre-existing OPEN MANAGEMENT DECISION**, not invented by this CR) | `logAudit()` on the domain function (approval itself; not itemized per-field before this CR) | `POST /api/purchase-orders/:id/approve` | Yes — single function, single table set |
| Quotation Discount approval | `Quotation` | Approve | `requiredDiscountApprovalRole(discountPct)` (role match or Admin) | `DB.discountApprovalRules` (5% / 10% / CEO tiers) | **NONE** — Sales (the Customer-scope-restricted role) never holds discount-approval authority | Self-approval blocked unconditionally unless CEO/Admin (no threshold-based exemption exists for this one) | `logAudit()` | `POST /api/quotations/:id/approve-discount` | Yes |
| Payment Request approval | `PaymentRequest` | Approve (checker) | `SOP_FINANCE_ROLES={Admin,CEO,FinanceManager}` + `paymentApprovalRoleFor(amount)`'s `'Director (CEO)'` top tier requiring CEO/Admin specifically | `DB.paymentApprovalMatrix` (₹5,000 / ₹100,000 / CEO tiers — **matrix itself is `finalised:false`, "Not Finalised," a pre-existing OPEN item**) | **NONE** — same reasoning as PO | **SOD-1** (maker≠checker, unconditional, no exemption) — pre-existing, ARCH-2026-001A-formalized, ARCH-2026-001D-unchanged | `logAudit()` | `POST /api/payment-requests/:id/approve` | Yes |
| Payment execution | `PaymentRequest` | Execute | `can(actor,'pay')` (`{Admin,CEO,FinanceManager}`) | N/A (executes the already-approved amount) | **NONE** at this step specifically | **SOD-2** (maker/checker≠executor, CEO/Admin exempted — pre-existing) + **SOD-5** (vendor-creator≠executor, NEW this CR's predecessor ARCH-2026-001D, no exemption) | `logAudit()` | `POST /api/payment-requests/:id/execute` | Yes |
| Change Request approval | `ChangeRequest` | Approve | `{Admin,CEO,FinanceManager}` | None (no amount threshold — CR value is informational, not gated) | Not scope-checked (same role-overlap reasoning: none of the 3 approving roles is Project-scope-restricted) | Self-approval blocked unless CEO/Admin | `logAudit()` | `POST /api/change-requests/:id/approve` | Yes |
| BOM approval | `BOM` | Approve | `can(actor,'approve')` (generic tag) | None | Not scope-checked at approval time (BOM creation/view already scope-filtered per ARCH-2026-001C/C-F) | Self-approval blocked unless CEO/Admin | `logAudit()` | `POST /api/boms/:id/approve` | Yes |
| **Design Review** | `Design` | Approve/Reject/UnderReview | `{Admin,CEO,ProjectManager}` + (for ProjectManager) `hasScopeAccess(actor,'Project',design.projectId)` (already wired by ARCH-2026-001C-F) | N/A | **YES — already scope-checked** (the one design approval that DOES involve a scope-restricted approving role) | **MISSING — real, evidenced gap found by this audit** (see §3) | `logAudit()` | `POST /api/designs/:id/review` | Partially — no self-approval check existed before this CR |

## 3. The one real gap found

Every approval mechanism in §2 EXCEPT Design Review already implements the "creator/maker cannot also
approve" convention (with a consistent CEO/Admin exemption pattern used everywhere it exists).
`reviewDesign()` had NO such check — `submitDesign()` stores `submittedBy:actor.id` but
`reviewDesign()` never read it. This is a genuine, evidenced, isolated outlier (confirmed by reading
every comparable function, not assumed), and is the ONE functional defect this CR fixes — see
`ARCH-2026-001E-IMPLEMENTATION.md`.

## 4. Why no other new scope/SoD wiring was needed

For PO, Quotation Discount, Payment Request approval/execution, and Change Request approval: the
approving roles (`CEO`, `FinanceManager`, `Admin`) are NEVER the scope-restricted roles (`ProjectManager`
for Project, `Sales` for Customer) in the CURRENT role model — confirmed by reading each authority
table/role-list directly, not assumed. This means there is currently no REAL, exploitable "wrong
project/wrong customer approver" scenario for these mechanisms — adding a scope check to them would be
defensive but not closing an actual gap, and this CR's own §5 instructs against changing what is
already correct. Design Review is the one mechanism where a scope-restricted role (`ProjectManager`)
DOES hold approval authority, and it was ALREADY scope-checked by ARCH-2026-001C-F — only the
self-approval dimension was missing.

## 5. Amount thresholds — audited, not invented

Two pre-existing amount-threshold tables (`poApprovalRules`, `paymentApprovalMatrix`) both carry
`finalised:false` / "Draft" / "Not Finalised" status fields, predating this CR by multiple prior CRs
(the PO matrix's own status note dates to "Phase 12"). These are pre-existing, already-disclosed OPEN
MANAGEMENT DECISIONS, re-confirmed here, not newly discovered or newly invented. This CR does not set
or change any threshold value.

## 6. Approval levels — audited

No generic "Level 1/2/3" concept exists anywhere in this codebase's approval mechanisms — each uses a
ROLE-tier (not a numbered level) determined by an amount/percentage threshold. This CR does not invent
a numbered-level hierarchy; `resolveApprovalAuthority()` (see Implementation) exposes `requiredRole`,
matching the existing convention exactly.

## 7. Conclusion

7 existing approval mechanisms inventoried. 1 real, evidenced self-approval gap found (Design Review).
0 other gaps found requiring new scope/SoD wiring, given the current role-authority overlap reality.
See `ARCH-2026-001E-APPROVAL-MATRIX.md` for the full rule-by-rule classification.
