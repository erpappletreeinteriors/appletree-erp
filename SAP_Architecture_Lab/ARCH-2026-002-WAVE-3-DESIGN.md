# ARCH-2026-002 — Wave 3 Design

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §28. **Design only — no implementation code written.**
Every item is contingent on its corresponding decision in `ARCH-2026-002-WAVE-3-DECISIONS.md`.

## 1. Exact scope (of this Phase 0 pass)

Audit, readiness assessment, dependency analysis, security review, data-model review, process trace,
and this design document only. **No Wave 3 application code is authorized by this Phase 0.**

## 2. Existing functionality to preserve

The single GL engine (`postJournalEntry()`), the consolidated Bank Reconciliation engine, the
`projectPL`/`projectFinancial360` project-cost sweep, the Draft lifecycle SoD (creator≠approver,
creator≠poster), SOD-1/2/5/6 (all re-confirmed intact), the Fixed Asset Register/GL reconciliation logic
— none of this is to be rebuilt.

## 3. Missing functionality (contingent on decisions)

Per `ARCH-2026-002-WAVE-3-DECISIONS.md`: 3 new SoD rules (W3-2/W3-3/W3-4), a Petty Cash GL account
(W3-5), a true daily cash-limit aggregate (W3-6), a cost-allocation mechanism (W3-7), Profit Centre
transaction propagation (W3-8), and a reporting-labeling fix (W3-9).

## 4-17. Changes required, per decision item

### If W3-2/W3-3/W3-4 (new SoD rules) are authorized

- **Pattern**: mirror SOD-7 through SOD-11 exactly — new entries in `RBAC_SOD_RULES_SEED`, guard
  clauses using `checkSoD()`+`durableFailureAudit` (the established, correct pattern this engagement's
  own prior pass found and fixed a real defect around) inside the protected functions.
- **W3-2** (Bank Account creation vs. payment execution): guard in `postSupplierPayment`/
  `postCustomerReceipt`/`createBankTransfer`/`executePaymentRequest`, comparing `bankAccount.createdBy`
  to the acting user.
- **W3-3** (Fixed Asset lifecycle): guard in `capitalizeFixedAsset` (creator≠capitalizer, the
  specifically-named item), with `transferFixedAsset`/`disposeFixedAsset` as separate, smaller
  decisions if management wants the FULL chain separated, not just the first step.
- **W3-4** (Bank Import → Reconciliation): guard in `matchBankImportLine`/`reconcileBankImportLine`,
  comparing `batch.importedBy` (or the specific line's own import attribution) to the acting user.
- **Data model**: none — reuses the existing engine exactly.
- **UI/API**: none new — guard clauses only, inside existing functions/routes.
- **Test strategy**: mirror the Wave 2 pattern exactly — for each rule: maker creates, same maker
  blocked, different authorized user succeeds, audit trail present (via `durableFailureAudit`, learned
  from Wave 2's own real defect), forged-role bypass blocked, full regression re-run for zero net new
  failures (Wave 2's own experience shows pre-existing test fixtures using a single actor for what
  becomes a maker≠checker pair WILL need the same disclosed, non-weakening fix pattern).

### If W3-5 (Petty Cash GL account) is authorized

Requires ITS OWN accounting-policy decision (which account, float-creation entry shape) before any
design detail can be finalized — explicitly not detailed further here, matching how W2-5 (Production
Output→FG) was left for its own dedicated pass in the prior wave.

### If W3-6 (daily cash-limit aggregate) is authorized

Small, scoped addition to `checkCashLimit()` — sum same-day/same-person vouchers before comparing to the
cap. No data model change (reads existing `DB.pettyCashVouchers`).

### If W3-7 (cost allocation) is authorized

The most architecturally significant item in this register — requires its own dedicated design pass,
explicitly building against the existing `projectPL()`/`postJournalEntry()` engines, never a second cost
calculation. Not detailed further here per this CR's own "do not assume this order/do not over-design a
possibly-declined feature" discipline.

### If W3-8 (Profit Centre propagation) is authorized

Requires resolving W3-8's own open sub-question first (what determines a transaction's Profit Centre) —
a business-process decision, not a technical one. Not detailed further here.

### If W3-9 (reporting labeling) is authorized

Trivial — add 2 named fields to `projectFinancial360()`'s existing response shape, no calculation
change. Lowest-risk item in this entire register.

## 18. Migration

**None required for any item** — every proposal here is either a pure guard-clause addition (SoD items)
or contingent on its own accounting-policy decision before migration risk could even be assessed
(Petty Cash GL account, cost allocation). No item proposes touching production data in this Phase 0.

## 19-21. Test strategy, Browser UAT, Rollback (general)

Same discipline as Wave 2: full parity/regression proof for every new control; dedicated new suite for
every new capability; minimum roles per this CR's own convention (FinanceManager/Accountant/CEO/Admin
for Finance/Treasury items). Every item is additive — rollback in every case is "remove the addition,"
never "restore a prior version of unrelated logic."

## 22. Production safety

Repeat this Phase 0's own discipline: hash before/mid/after, isolated test environment only, no
production migration without separate explicit authorization.

## 23. Deferred items

Cost allocation (W3-7) and Profit Centre propagation (W3-8) are both explicitly flagged as requiring
their OWN dedicated design pass if authorized — not detailed to implementation level in this document,
consistent with not over-designing features that may be declined.

## Proposed sub-wave sequence (a proposal, not a mandate)

Based on the dependency analysis in `ARCH-2026-002-WAVE-3-DEPENDENCY-MAP.md`: every Wave 3 domain's CORE
capability is already EXISTING, so — as with Wave 2 — there is no strict inter-domain build order. The
real sequencing driver is risk and decision-readiness:

- **Wave 3A — Finance/Treasury security closure** (W3-2, W3-3, W3-4, if authorized): lowest risk, zero
  data-model change, reuses the exact proven pattern from Wave 2's own 5 rules (including the
  `durableFailureAudit` lesson learned there). No dependency on any other Wave 3 item.
- **Wave 3B — Treasury cash-control hardening** (W3-6, if authorized): small, independent, low risk.
- **Wave 3C — Reporting clarity** (W3-9, if authorized): trivial, independent, can be done any time,
  including alongside 3A.
- **Wave 3D — Treasury subledger completion** (W3-5 Petty Cash GL account, if authorized): gated on its
  own accounting-policy sub-decision; sequence after 3A-3C since it's more architecturally significant.
- **Wave 3E — Controlling expansion** (W3-7 Cost Allocation, W3-8 Profit Centre propagation, if
  authorized): the most architecturally significant items in this register; sequence last, each
  deserving its own dedicated design pass rather than being bundled into a general "Wave 3" push.

**This sequence is not authorized by this document** — offered as the reasoned default this CR's own
§28 asks for, to be confirmed or overridden by whoever authorizes Wave 3's actual implementation.
