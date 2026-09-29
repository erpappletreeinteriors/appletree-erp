# PHASE 39 — Payment Approval Matrix Live Audit

**Date:** 2026-09-12. Isolated test server, `APP_ENV=test`, port 4091. Test script:
`tests/erp_phase39_payment_approval_matrix_tests.js`. Raw results:
`phase39_payment_approval_matrix_results.json`. This report closes both Part 11 of the Phase 39
brief and Phase 38's carried-forward finding **DEF-P38-04**.

**18 assertions, 18/18 PASS.**

## Matrix status

The matrix is correctly, honestly shown as `finalised: false` — SOP §9.1's own table is headed "To
Be Finalised — calibrate to Board-approved DOA," and this codebase never silently treats it as
binding policy. Current (illustrative, unapproved) tiers:

| Up to | Required role |
|---|---|
| ₹5,000 | Accountant |
| ₹100,000 | Purchase Head (Purchase role) |
| unlimited | Director (CEO) |

## Threshold boundary tests — all correct

- A request safely at/below ₹5,000 → `requiredApprovalRole: "Accountant"`. ✅
- A request just above ₹5,000 → correctly escalates to `"Purchase Head (Purchase role)"`. ✅
- A request above ₹100,000 → correctly escalates to `"Director (CEO)"`. ✅

The tier-selection arithmetic itself (`paymentApprovalRoleFor()`) is correct and live-confirmed at
every boundary tested.

## CEO tier — the one tier the code itself actually enforces

- `FinanceManager` attempting to approve a >₹100,000 (CEO-tier) request: **BLOCKED** — this is the
  one explicit check `approvePaymentRequest()` performs itself (`requiredApprovalRole==='Director
  (CEO)'` → require `['CEO','Admin']`).
- `CEO` approving the same request: **SUCCEEDS**.
- Re-approving an already-Approved request: **BLOCKED** (modification-after-approval).

## THE CORE FINDING (closes DEF-P38-04 with a materially fuller picture than Phase 38 had)

Phase 38's original finding said the lower two tiers are enforced "correctly in practice today...
via route RBAC, not the matrix's own logic" and rated it P3, design-clarity-only. **Live testing this
phase proves the actual behavior is more consequential than that framing suggested:**

The mutation route for approval (`POST /api/payment-requests/:id/approve`) is gated by
`SOP_FINANCE_ROLES = {'Admin','CEO','FinanceManager'}` (`server.js`) — a set that **excludes both
`Accountant` and `Purchase`**, the exact two roles the matrix itself names for its two lower tiers.
Live-proven, both directions:

- A ₹4,230 payment request (`requiredApprovalRole: "Accountant"`) — **the `Accountant` role itself
  is blocked with 403** ("Role \"Accountant\" cannot approve a payment request.") from ever
  approving it. **FinanceManager, a role the matrix never names for any tier, approves it instead**,
  with `checkerRole: "FinanceManager"` recorded right next to `requiredApprovalRole: "Accountant"`
  in the same record — unenforced, not merely unchecked in code, but **structurally unreachable** by
  the role the matrix designates.
- A ₹7,080 payment request (`requiredApprovalRole: "Purchase Head (Purchase role)"`) — **the
  `Purchase` role is likewise blocked** from approving its own designated tier; FinanceManager
  approves it too.

**The practical consequence:** every payment request, regardless of amount, can in reality only ever
be approved by Admin/CEO/FinanceManager. The matrix's tiered delegation of small/medium payment
approval authority down to Accountant/Purchase Head is **not merely weakly enforced — it is
completely non-operative**, for a structural reason (the route's own role gate) that has nothing to
do with the matrix's `tiers` configuration at all. This is safe (no unintended role can approve
anything — FinanceManager/CEO/Admin are all legitimately senior enough to approve any tier), but it
means the recorded `requiredApprovalRole` field is, for two of three tiers, decorative: it reflects
an illustrative SOP table, not the system's real access-control boundary.

### Why this was NOT fixed unilaterally

Two candidate fixes exist:
1. Widen `SOP_FINANCE_ROLES` (or add a tier-aware check inside `approvePaymentRequest()`) to
   actually admit `Accountant`/`Purchase` for their own designated tiers.
2. Leave the code as-is and update the matrix UI/documentation to state plainly that all approvals
   currently require FinanceManager or above, regardless of displayed tier.

**Option 1 would genuinely expand who has authority to approve company payments** — handing
Accountant and Purchase roles a new financial-approval power they do not have today. That is a real
business-policy decision (exactly the kind of decision SOP §9.1's own "To Be Finalised — calibrate
to Board-approved DOA" language is explicitly waiting on), not a mechanical bug fix, and this
engagement's standing discipline is explicit: audit and recommend, never implement a change to who
may authorize money movement without the CEO's own sign-off. **No code change was made for this
finding.**

### Recommendation (for the user's decision, not implemented)

When the Payment Approval Matrix is formally finalized (via its own existing
Draft→Review→Approved workflow, `approvePaymentApprovalMatrix()` — a CEO/Admin-only, board-reference-
required action that already exists and works), the finalization should explicitly address this
gap one of two ways: (a) widen the approval route's role gate to match whatever tiers are actually
approved, or (b) simplify the matrix's own tier table to state the true, current policy (FinanceManager/
CEO/Admin approve every payment regardless of amount) rather than a table describing authority that
cannot be exercised.

## Maker-checker and execution — all live-confirmed working correctly

- **Self-approval blocked**: the same user (`finance1`) who raised a payment request cannot approve
  it, even though FinanceManager has approval authority in general — a real per-request maker≠checker
  check, not merely a role check.
- **3-person separation for execution**: a checker (`FinanceManager`, not CEO/Admin) who is NOT the
  maker still cannot also be the executor of the same request — correctly blocked, live-proven.
- **CEO/Admin exemption from the 3-person rule** is real and intentional (confirmed via the code's
  own explicit `!['CEO','Admin'].includes(actor.role)` condition and live-reproduced): a CEO acting
  as both checker and executor is allowed, consistent with SOP §9's "at least 2, ideally 3" wording
  (2 is the floor, not always 3) and this codebase's consistent pattern of CEO/Admin override
  exemptions elsewhere (always audited).

## Verdict

**DEF-P38-04 is now CLOSED** — investigated to a definitive, live-proven root cause (not merely
re-confirmed via code reading as Phase 38 left it), found to be more consequential than originally
scoped (a structural unreachability, not just a design-clarity note), and left correctly OPEN for a
genuine business-policy decision rather than fixed unilaterally. Recorded as
**DEF-P39-03 (P3, informational/policy)** in the Phase 39 defect register, superseding DEF-P38-04's
entry with this fuller evidence.
