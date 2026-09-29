# ARCH-2026-002 — Wave 3 Implementation: Scope Classification

**Date:** 2026-09-22. First deliverable of the Wave 3 Implementation Authorization CR, per that CR's own
§5 requirement: *"BEFORE IMPLEMENTING ANY ITEM DEPENDENT ON ONE OF THESE DECISIONS: Read the current
W3-DECISIONS document. For every decision classify: RESOLVED / DEFERRED / NOT APPLICABLE / IMPLEMENTATION
BLOCKER. DO NOT choose an answer on management's behalf."*

This document performs that classification, states the reasoning for each, and — per §5's own 7-point
format — reports every item that must STOP before any code is written for it.

## 1. Method

Each of the 9 items in `ARCH-2026-002-WAVE-3-DECISIONS.md` is checked against two things:

1. **Does the decision record itself resolve it?** (It does not — every item there is explicitly recorded
   as "No recommendation given.")
2. **Does this Wave 3 Implementation CR's own operative text independently authorize it, unconditionally,
   the way Wave 2's CR did for its 5 SoD rules** (e.g. Wave 2 §5B: *"Pay particular attention to: Job Work
   transaction → Supplier Bill"* — a direct instruction, not conditioned on a decision record)?

Wave 3's CR text was re-read section by section for this. Unlike Wave 2, **every operative section of this
CR that touches a new capability uses conditional language that defers to the decision record**, not
direct instruction:

- §8 (Finance SoD): *"Implement it only if W3 decision authorization permits... Do not invent the
  organizational rule yourself."* / *"Treat this as a policy-controlled item. Do not silently impose a
  maker/checker rule without approved policy."*
- §12 (Project Profitability labeling): *"Audit and, **where authorized**, improve..."*
- §17 (Petty Cash): *"Do not create a new cash ledger unless explicitly authorized."*
- §18 (Cash Limits): *"Do not change this policy unless explicitly authorized... Do not hard-code
  thresholds."*
- §21 (Fixed Asset SoD): *"Implement ONLY the rule authorized by W3 decisions... Do not invent
  exemptions."*
- §9-14 (Controlling): *"Determine the authorized target state. If approved: ..."*

No section of this CR states a concrete, unconditional requirement the way Wave 2's did. This is a
deliberate difference in how this CR was written, and it is honored exactly as written: **every item whose
decision record says "No recommendation given" and whose CR text says "if/where authorized" is an
IMPLEMENTATION BLOCKER**, full stop, regardless of how low-risk the item appears. This includes W3-9,
which the Decisions document itself flagged as "low-stakes... more a scheduling choice than a genuine open
question" — that framing describes the item's *risk*, not its *authorization status*. The CR's own §12
text ("where authorized") was not overridden by that framing, so W3-9 is classified as BLOCKED, not
implemented, in this pass. This is a stricter reading than Wave 2's, and is a direct, intentional
consequence of how this CR (unlike Wave 2's) was drafted — it is reported here transparently rather than
resolved unilaterally in either direction.

## 2. Classification table

| ID | Item | Classification | Reason |
|---|---|---|---|
| — | Account 1400 sharing | RESOLVED (by evidence, prior pass) | Not reproducible in current code; this CR's §2 ratifies "CLOSED BY EVIDENCE," no further action |
| W3-1 | Payment Approval Matrix finalization | DEFERRED | Pre-existing, unchanged; a governance/documentation sign-off, not a functional gap; this CR does not instruct action on it |
| W3-2 | Bank Account creation vs. payment execution SoD | **IMPLEMENTATION BLOCKER** | Decision record: no recommendation. CR §8 lists as an investigation item only, no unconditional instruction |
| W3-3 | Fixed Asset full-lifecycle SoD | **IMPLEMENTATION BLOCKER** | Decision record: no recommendation (same item the original 46-phase audit already declined to resolve). CR §21: "Implement ONLY the rule authorized by W3 decisions... Do not invent exemptions" |
| W3-4 | Bank Import → Reconciliation SoD | **IMPLEMENTATION BLOCKER** | Decision record: no recommendation, and explicitly notes a real risk-profile difference from SOD-5/6 (externally-sourced document) requiring management's own judgment. CR §8/§16: "only if W3 decision authorization permits" |
| W3-5 | Petty Cash GL control account | **IMPLEMENTATION BLOCKER** | Decision record: no recommendation, explicitly requires its own accounting-policy sub-decision (which account, what entry shape). CR §17: "unless explicitly authorized" |
| W3-6 | True daily-aggregate cash limit | **IMPLEMENTATION BLOCKER** | Decision record: no recommendation, a real operational-control question. CR §18: "unless explicitly authorized... do not hard-code thresholds" |
| W3-7 | Cost allocation mechanism | **IMPLEMENTATION BLOCKER** | Decision record: no recommendation; the most architecturally significant item in the register, explicitly flagged as requiring its own dedicated design pass |
| W3-8 | Profit Centre transaction propagation | **IMPLEMENTATION BLOCKER** | Decision record: no recommendation; requires resolving its own business-process sub-question (what determines a transaction's Profit Centre) first |
| W3-9 | Depreciation/Job-Work cost labeling in `projectFinancial360` | **IMPLEMENTATION BLOCKER** | Decision record: no recommendation. Low business-policy content does not substitute for CR §12's "where authorized" condition, which the decision record does not satisfy. See §1 above for why this is deliberately not treated as an implicit W2-2-style exception |

**Net result: 7 items are hard IMPLEMENTATION BLOCKERS (W3-2 through W3-9). 1 item is DEFERRED unchanged
(W3-1). 0 items are newly RESOLVED by this pass.**

## 3. Per-item STOP report (§5's required 7-point format)

For each blocked item: decision ID, affected functionality, why implementation cannot safely proceed,
technical alternatives, accounting impact, security impact, migration impact.

### W3-2 — Bank Account creation vs. payment execution SoD
1. **Decision ID**: W3-2
2. **Affected functionality**: `postSupplierPayment`/`postCustomerReceipt`/`createBankTransfer`/
   `executePaymentRequest` — no identity check between `bankAccount.createdBy` and the acting payer
3. **Why it cannot proceed**: three mutually exclusive design options remain open (no exemption / CEO-Admin
   exemption / accept as disclosed risk); choosing one is a policy call, not an engineering default
4. **Technical alternative**: none needed if deferred — role-gating (`can(actor,'pay')`) remains the
   control; a `checkSoD()` rule is a straightforward drop-in (mirrors SOD-5 exactly) whenever authorized
5. **Accounting impact**: none from deferring — no GL behavior changes either way
6. **Security impact**: the existing disclosed gap (Admin/CEO can create a bank account and pay through it
   with no identity check) persists unchanged; this is the same class of accepted small-company risk
   already disclosed for CEO/Admin combined roles elsewhere in the system
7. **Migration impact**: none — no data model change proposed

### W3-3 — Fixed Asset full-lifecycle SoD
1. **Decision ID**: W3-3
2. **Affected functionality**: `createFixedAsset`/`capitalizeFixedAsset`/`transferFixedAsset`/
   `disposeFixedAsset` — role-only gates throughout, zero identity separation
3. **Why it cannot proceed**: the ORIGINAL 46-phase forensic audit already surfaced this exact item and
   explicitly declined to resolve it unilaterally, classifying it as "a business judgment, not an
   engineering default." This CR's own §21 repeats that instruction verbatim ("Do not invent exemptions")
4. **Technical alternative**: none needed if deferred; a creator≠capitalizer rule (the narrowest option) is
   a straightforward drop-in mirroring SOD-7 through SOD-11 whenever authorized
5. **Accounting impact**: none from deferring
6. **Security impact**: a single FinanceManager/Admin/CEO can still run the entire asset lifecycle alone;
   unchanged from every prior pass's finding
7. **Migration impact**: none — no data model change proposed

### W3-4 — Bank Import → Reconciliation SoD
1. **Decision ID**: W3-4
2. **Affected functionality**: `matchBankImportLine`/`reconcileBankImportLine` (the Wave-1-consolidated
   Bank Reconciliation engine) — no identity check between `batch.importedBy` and the reconciling actor
3. **Why it cannot proceed**: the decision record itself notes a genuine, substantive difference from
   SOD-5/6 — a bank statement is an externally-sourced document (from the bank), so the self-dealing risk
   profile may be materially lower; this CR's own §6/§8/§16 explicitly condition implementation on
   authorization ("only if W3 decision authorization permits")
4. **Technical alternative**: none needed if deferred; the design (`ARCH-2026-002-WAVE-3-DESIGN.md` §4-17)
   is fully specified and ready to implement the moment authorization exists
5. **Accounting impact**: none from deferring — the Bank Reconciliation consolidation itself (Wave 1) is
   unaffected and remains the sole engine
6. **Security impact**: the disclosed gap persists — same importer can reconcile their own import batch
7. **Migration impact**: none — no data model change proposed

### W3-5 — Petty Cash GL control account
1. **Decision ID**: W3-5
2. **Affected functionality**: `createPettyCashFloat`/`recordPettyCashVoucher` — neither posts to the GL;
   Petty Cash remains an operational register, not a reconcilable subledger
3. **Why it cannot proceed**: requires its own accounting-policy sub-decision (which GL account, what the
   float-creation entry should look like) before any implementation design is even possible — explicitly
   not detailed in the Wave 3 Design document for exactly this reason
4. **Technical alternative**: none — this is a prerequisite-decision gap, not a technical one
5. **Accounting impact**: deferring leaves Petty Cash un-reconcilable against an independent GL balance,
   an existing, disclosed limitation, unchanged
6. **Security impact**: none directly
7. **Migration impact**: unassessable until the account/entry-shape decision is made — explicitly flagged
   in the Wave 3 Design document as unable to be scoped further without it

### W3-6 — True daily-aggregate cash limit
1. **Decision ID**: W3-6
2. **Affected functionality**: `checkCashLimit()` — enforces the ₹10,000 ceiling per-transaction, not as a
   same-day/same-person aggregate
3. **Why it cannot proceed**: a real operational-control policy question (should the aggregate be enforced
   at all, and if so how strictly); additionally `DB.cashLimits.approvedByFinance:false` — the limit VALUE
   itself is not yet finance-approved, a separate, pre-existing open item this CR's §18 explicitly warns
   against silently converting into new hard-coded policy
4. **Technical alternative**: none needed if deferred; the fix (sum same-day/same-person vouchers before
   comparing to the cap) is small and scoped, ready to implement whenever authorized
5. **Accounting impact**: none from deferring
6. **Security/control impact**: the "₹10,000/day" framing continues to not be literally enforced as a
   daily aggregate — an existing, disclosed gap, unchanged
7. **Migration impact**: none — reads existing `DB.pettyCashVouchers`, no schema change

### W3-7 — Cost allocation mechanism
1. **Decision ID**: W3-7
2. **Affected functionality**: no allocation mechanism exists at all today; Controlling reporting is
   served entirely by `generalLedger()`'s Cost-Centre filter and `projectPL()`'s sweep
3. **Why it cannot proceed**: the decision record itself frames this as an open question of NEED ("does
   Wave 3 need a formal cost-allocation-rules engine, or is the real reporting need already served") —
   answering that requires management's own view of what reporting Appletree actually needs, not a
   technical determination
4. **Technical alternative**: none proposed — explicitly flagged in the Wave 3 Design document (§4-17) as
   "the most architecturally significant item in this register... requires its own dedicated design pass"
5. **Accounting impact**: none from deferring — no new capability, no new posting path
6. **Security impact**: none
7. **Migration impact**: unassessable — no design exists to scope until the need itself is confirmed

### W3-8 — Profit Centre transaction propagation
1. **Decision ID**: W3-8
2. **Affected functionality**: Profit Centre remains master-data-only (confirmed via the codebase's own
   explicit disclosure at `domain.js:10995-10998`); no function anywhere tags a `profitCentreId` on a GL
   line
3. **Why it cannot proceed**: requires resolving its own open sub-question first — what determines a
   transaction's Profit Centre (a Branch mapping? a Project mapping? manual entry per transaction?) — a
   business-process decision, not a technical one, per this CR's own §7 instruction not to invent a
   dimension's *usage* merely because the master record exists
4. **Technical alternative**: none proposed until the derivation question is answered
5. **Accounting impact**: none from deferring
6. **Security impact**: none
7. **Migration impact**: unassessable until the derivation mechanism is decided

### W3-9 — Depreciation/Job-Work cost labeling in `projectFinancial360`
1. **Decision ID**: W3-9
2. **Affected functionality**: `projectFinancial360()`'s API response — Depreciation and Job-Work
   Inventory Adjustment costs are correctly included in `cost.actual` today but not separately named as
   fields
3. **Why it cannot proceed**: this CR's own §12 conditions even this trivial, no-calculation-change item on
   "where authorized"; the decision record records it as open (though explicitly low-stakes). Per §1's
   reasoning above, that condition is honored literally rather than treated as implicitly satisfied by the
   item's low risk — the same standard applied to every other item in this table, for consistency and to
   avoid choosing on management's behalf by a different route (i.e., not quietly deciding "this one's small
   enough to not need real authorization")
4. **Technical alternative**: none needed if deferred; the fix is a 2-line addition to an existing response
   object, zero calculation change, ready to implement immediately whenever authorized
5. **Accounting impact**: NONE either way — this is a labeling-only change; both costs are already
   correctly summed into `cost.actual` today
7. **Migration impact**: none — no data model or stored-value change proposed

## 4. What IS independently authorized and proceeds in this pass

None of the above 8 items proceed. What this CR's text DOES unconditionally require, independent of any
W3 decision, is **audit-confirmation, hardening verification, and testing of EXISTING behavior** — every
"preserve," "verify," and "test" instruction throughout §7, §19, §22 (asset accounting edge cases:
partial depreciation, fully depreciated asset, disposal, transfer, reversal, historical asset, duplicate
disposal, concurrent action), §23-25 (Financial Period Control, Tax, Journal Control), §26-28 (Reporting
security across all scope dimensions), §29 (audit pattern reuse — applicable to any new test assertions
here), and §30-34 (accounting/controlling/treasury/asset invariants). This work:

- Requires no policy decision (it proves EXISTING, already-authorized behavior remains correct)
- Directly satisfies this CR's own extensive audit/verify/test language
- Produces genuine new regression coverage the codebase did not previously have for several edge cases
  this CR specifically calls out (duplicate disposal, concurrent asset action, etc.)

This is the entirety of Wave 3's authorized implementation scope in this pass. No `domain.js` business-
logic change is made for any of the 8 blocked items. If `domain.js` needs a genuine, in-scope code fix
during hardening verification (e.g., an edge case proves incorrect, not just untested), it will be made
using the established `durableFailureAudit` pattern per this CR's own §29 reminder, and disclosed as a
real defect fix, not a policy implementation.

## 5. Verdict of this classification

Per §5: *"Continue only with independent, already-authorized work."* That is exactly what this pass does.
