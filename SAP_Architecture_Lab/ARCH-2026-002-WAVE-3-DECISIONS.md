# ARCH-2026-002 — Wave 3 Management Decisions

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §27. No decision is made on management's behalf.

## A. Existing decisions reviewed — none affect Wave 3 directly

CEO/Admin technical split, Integration & Platform scope, Payroll statutory configuration (original
register) and W2-1/3/5/6/7 (Wave 2's deferred items — Demand trigger, Warehouse scope, Production
Output→FG, Gate Pass/Transporter, Inspection/NCR) all remain scoped to their own domains (Manufacturing/
Job Work/Quality/HR/Payroll/Integration) and do not affect Finance/Controlling/Treasury/Assets.

## B. A prior item CLOSED by this pass's own evidence, not carried forward

**Account 1400 sharing with Inventory** — the 46-phase forensic audit's own disclosed open policy
question (`FINAL_AUDIT_COMPLETION_AND_CERTIFICATION_FREEZE.md`) is **not reproducible in the current
code**: Fixed Assets post exclusively to 1400, Inventory posts exclusively to 1200, cleanly separated.
Per this CR's own §2 instruction, this discrepancy is reported, not silently resolved — recorded here as
CLOSED-BY-EVIDENCE rather than carried forward as a live accounting-policy risk. If management wants an
authoritative determination of WHY the prior document described a different state, that is a historical/
documentation question, not a code question this Phase 0 can answer.

## C. New decisions surfaced by this Wave 3 Phase 0

### W3-1. Payment Approval Matrix finalization — carried forward, unchanged, still open

- **Question**: should `DB.paymentApprovalMatrix` (currently `finalised:false`/`Draft`) be formally
  finalized with Appletree-confirmed tier values?
- **Current behavior**: the matrix exists, is read by `resolveApprovalAuthority()` and internal checks,
  but is not itself the enforcement mechanism (SOD-1/2/5 and role-tier checks are what actually gate
  payment approval today) — finalizing it would primarily be a governance/documentation step, not a
  functional gap.
- **No recommendation given** — pre-existing, unchanged, re-confirmed this pass only.

### W3-2. Bank Account creation vs. payment execution SoD

- **Question**: should a new SoD rule (mirroring SOD-5's exact shape: `bankAccount.createdBy` vs.
  payment-executing actor) be added?
- **Current behavior**: no separation exists; Admin/CEO can create a bank account master and execute
  payments through it with zero identity check.
- **Options**: (a) add the rule, no exemption (matching SOD-5/7-11 precedent); (b) add with a CEO/Admin
  exemption (matching the older inline-check precedent); (c) defer, accept as a disclosed small-company
  risk (comparable to the already-accepted CEO/Admin combined-role reality).
- **Accounting/security impact**: LOW-risk if added — reuses the existing `checkSoD()` engine exactly.
- **No recommendation given.**

### W3-3. Fixed Asset full-lifecycle SoD

- **Question**: should new SoD rule(s) close the zero-identity-check gap across
  create→capitalize→transfer→dispose?
- **Current behavior**: role-only gates throughout; a single FinanceManager/Admin/CEO can run the entire
  lifecycle alone.
- **Options**: (a) add a creator≠capitalizer rule only (the narrowest, most directly analogous to the
  46-phase audit's own flagged item); (b) add rules for every pairwise transition; (c) defer, accept as
  a disclosed policy decision (as the 46-phase audit itself classified it — "a business judgment... not
  an engineering default").
- **No recommendation given** — this is the SAME open item the 46-phase audit already surfaced and
  explicitly declined to resolve unilaterally; this Phase 0 re-confirms it, does not re-decide it.

### W3-4. Bank Import → Reconciliation SoD

- **Question**: should a new SoD rule tie the importing actor to the reconciling actor?
- **Current behavior**: purely role-gated, no identity check.
- **Options**: (a) add (mirrors the existing pattern); (b) defer — note that unlike a fictitious-vendor-
  payment scenario, a bank statement is an externally-sourced document (from the bank itself), so the
  self-dealing risk profile may be genuinely lower than SOD-5/6's — this is a real, substantive
  difference worth management's own risk judgment, not assumed away here.
- **No recommendation given.**

### W3-5. Petty Cash GL control account

- **Question**: should Petty Cash gain a dedicated GL control account, making it a true reconcilable
  subledger rather than an operational-only register?
- **Current behavior**: only replenishment touches the GL; no independently-derivable GL balance exists
  to reconcile the float/voucher records against.
- **Accounting impact**: a real, non-trivial accounting-policy decision (which account, what the
  float-creation entry should be) — explicitly not invented here.
- **No recommendation given.**

### W3-6. True daily-aggregate cash limit

- **Question**: should `checkCashLimit()` be extended to sum same-day/same-person vouchers rather than
  checking each transaction in isolation?
- **Current behavior**: per-transaction ceiling only; the "₹10,000/day" framing is not literally
  enforced as a daily aggregate. Also note: `DB.cashLimits.approvedByFinance:false` — the limit VALUES
  themselves are not yet finance-approved, a separate, pre-existing open item.
- **No recommendation given** — a real operational-control question, not a technical one.

### W3-7. Cost allocation mechanism

- **Question**: does Wave 3 need a formal cost-allocation-rules engine, or is Appletree's real reporting
  need already served by `generalLedger()`'s Cost-Centre filter + `projectPL`'s sweep?
- **Current behavior**: no allocation mechanism exists at all.
- **No recommendation given** — this is a genuinely large, new capability (see Data-Model Gap
  Register), not a small closable gap.

### W3-8. Profit Centre transaction propagation

- **Question**: should Profit Centre become a real posting/reporting dimension (currently master-data-
  only), and if so, what determines a transaction's Profit Centre (a Branch mapping? a Project mapping?
  manual entry per transaction)?
- **Current behavior**: confirmed master-data-only; no derivation mechanism exists.
- **No recommendation given** — per this CR's own §7 instruction not to invent a dimension's *usage*
  merely because the master exists; this is exactly that judgment call, left to management.

### W3-9. Depreciation/Job-Work cost labeling in `projectFinancial360`

- **Question**: should the API response gain explicit `depreciationCost`/`jobWorkInventoryAdjustment`
  fields (a pure labeling addition, no calculation change)?
- **Current behavior**: both are correctly included in `cost.actual` today, just not separately named.
- **Accounting impact**: none — this is a reporting-clarity fix, not a policy decision.
- **No recommendation given**, though this item carries no business-policy content (like W2-2 in the
  prior wave), so it is a low-stakes scheduling choice more than a genuine open question.

## D. Summary table

| ID | Item | Status | Blocks | New this Phase 0? |
|---|---|---|---|---|
| — | Account 1400 sharing | **CLOSED BY EVIDENCE** | Nothing | Yes (resolution, not a new open item) |
| W3-1 | Payment Approval Matrix finalization | OPEN (pre-existing) | Formal governance sign-off only | No |
| W3-2 | Bank Account creation vs. payment execution SoD | OPEN | Whether a new SoD rule is added | Yes |
| W3-3 | Fixed Asset full-lifecycle SoD | OPEN (pre-existing, re-confirmed) | Whether new SoD rule(s) are added | No (re-confirmed) |
| W3-4 | Bank Import → Reconciliation SoD | OPEN | Whether a new SoD rule is added | Yes |
| W3-5 | Petty Cash GL control account | OPEN | Whether Petty Cash becomes a true subledger | Yes |
| W3-6 | True daily-aggregate cash limit | OPEN | Whether `checkCashLimit()` is extended | Yes |
| W3-7 | Cost allocation mechanism | OPEN | Whether a new Controlling capability is built | Yes |
| W3-8 | Profit Centre transaction propagation | OPEN | Whether Profit Centre becomes a real dimension | Yes |
| W3-9 | Depreciation/Job-Work cost labeling | OPEN (low-stakes) | Trivial fix, scheduling only | Yes |

No implementation proceeds on any item until its corresponding decision is made.

## E. 2026-09-23 re-classification pass (ARCH-2026-002-W3-DECISION-RESOLUTION.md)

Every item above was re-checked against current source code as part of the "Wave 3 Decision Resolution +
Wave 4 Readiness Gate" CR. **No item in this document's §C was resolved by that pass** — per that CR's
own §4 ("Do not use 'resolved' merely because the developer chose an option"), every W3-1 through W3-9
item above remains exactly as classified in this document (DEFERRED for W3-1, OPEN for W3-2 through
W3-9). The 2026-09-23 pass's only outputs were: (a) a full re-verification that current code still matches
every "Current behavior" description above, (b) management-ready decision records for every OPEN item, in
the exact format `ARCH-2026-002-W3-DECISION-RESOLUTION.md` §5 requires, and (c) confirmation that none of
these 9 items blocks Wave 4 (Service & After-Sales). Full detail, including per-item audit-trail
citations to the exact current code re-verified: `ARCH-2026-002-W3-DECISION-RESOLUTION.md`.

Previous state (this document, 2026-09-22) → decision (none made; re-verified and formally packaged for
management review) → effective state: unchanged — all 9 items remain exactly as classified above, now
with management-ready records attached in the companion document.
