# ARCH-2026-002 — W3 Decision Resolution

**Date:** 2026-09-23. Part A deliverable of the "Wave 3 Decision Resolution + Wave 4 Readiness Gate" CR.
This document does not decide any open item on management's behalf. Where current evidence closes a
previously-open item, that is recorded as CLOSED BY EVIDENCE with the exact code citation, not as a
developer preference. Every genuinely open item remains OPEN, with a management-ready decision record
per §5 of the CR, and the recommendation field (where populated) is attributed to an existing
architecture/design document, never to this document's own opinion.

## 1. Method

Each of the 9 items catalogued in `ARCH-2026-002-WAVE-3-DECISIONS.md` was re-examined against the
current source code (`server/domain.js`, as of this pass, immediately following ARCH-2026-002 Wave 3
Implementation) rather than relied upon from the historical Wave 3 Phase 0 summary. One additional item —
item 6 in `ARCH-2026-002-OPEN-DECISIONS.md` (Bank Reconciliation duplicate ownership), dated 2026-09-21,
predating the Wave 1 implementation that ran the next day — was also re-checked for the same reason and is
included in §3 below as an appendix item, since it is thematically a Treasury/Wave-3-adjacent item that
this CR's own §2 instructed be read.

## 2. Decision inventory and classification summary

| ID | Item | Classification | Blocks Wave 4? |
|---|---|---|---|
| — | Account 1400 sharing with Inventory | **CLOSED BY EVIDENCE** (carried forward, unchanged this pass) | No |
| Appendix | Bank Reconciliation duplicate ownership (`ARCH-2026-002-OPEN-DECISIONS.md` item 6) | **CLOSED BY EVIDENCE** (new this pass — see §4) | No |
| W3-1 | Payment Approval Matrix finalization | **DEFERRED** | No |
| W3-2 | Bank Account creation vs. payment execution SoD | **OPEN** | No |
| W3-3 | Fixed Asset full-lifecycle SoD | **OPEN** | No |
| W3-4 | Bank Import → Reconciliation SoD | **OPEN** | No |
| W3-5 | Petty Cash GL control account | **OPEN** | No (see note in record) |
| W3-6 | True daily-aggregate cash limit | **OPEN** | No |
| W3-7 | Cost allocation mechanism | **OPEN** | No (limits reporting depth only — see note) |
| W3-8 | Profit Centre transaction propagation | **OPEN** | No (limits reporting depth only — see note) |
| W3-9 | Depreciation/Job-Work cost labeling | **OPEN** | No |

**None of the 9 W3 items block Wave 4.** Wave 4 (Service & After-Sales) is a different domain group with
its own transaction chain (Warranty→Complaint→Ticket→Visit→Billing) that does not depend on any of these
9 items being resolved first — confirmed in the Wave 4 dependency map (`ARCH-2026-002-WAVE-4-DEPENDENCY-
MAP.md`, produced under Part B of this same CR).

## 3. Full decision inventory (§3's 13-field format)

### Account 1400 sharing — CLOSED BY EVIDENCE (unchanged)
- **Current status**: Closed by evidence, recorded in the prior Wave 3 Phase 0 pass, ratified by this
  CR's own §2 (not re-litigated).
- **Exact question**: Does GL account 1400 serve as a shared account for both Inventory Asset and Fixed
  Asset capitalization postings, as the original 46-phase forensic audit claimed?
- **Current behavior**: No — Fixed Assets post exclusively to 1400; Inventory posts exclusively to 1200.
  Cleanly separated, re-confirmed again this pass (no code change touched account routing since the last
  check).
- **Affected module**: Asset Management, Central Accounting.
- **Affected transaction**: Fixed Asset Capitalization, GRN/Inventory valuation.
- **Affected users/roles**: N/A — accounting structure, not a permission question.
- **Accounting impact**: None — historical documentation error, not a code defect.
- **Security impact**: None.
- **Data-model impact**: None.
- **Reporting impact**: None — reports already reflect the correct, separated accounts.
- **Migration impact**: None — no change proposed or needed.
- **Implementation impact**: None.
- **Blocks Wave 4?**: No.

### Bank Reconciliation duplicate ownership (Appendix — `ARCH-2026-002-OPEN-DECISIONS.md` item 6) — CLOSED BY EVIDENCE (new this pass)
- **Current status**: Was OPEN as of 2026-09-21 (Phase 0 baseline, before Wave 1 ran). Found CLOSED BY
  EVIDENCE this pass.
- **Exact question**: Are `importBankStatement`/`matchBankStatementLine`/`bankReconciliationStatus` (over
  `DB.bankStatementLines`) and `createBankImportBatch`/`matchBankImportLine`/`reconcileBankImportLine`
  (over `DB.bankImportLines`) two fully independent, live-wired reconciliation engines?
- **Current behavior**: No — re-verified directly in `server/domain.js` this pass:
  `importBankStatement()` (line 11174) calls `createBankImportBatch({...format:'GENERIC'...})` internally;
  `matchBankStatementLine()` (line 11185) resolves the line from `DB.bankImportLines` (falling back to
  `migratedFromLegacyId` for pre-consolidation data) and delegates to `reconcileBankImportLine()`;
  `bankReconciliationStatus()` (line 11215) reads exclusively from `DB.bankImportLines`. All three legacy
  functions are thin compatibility wrappers over the single `bankImportLines` engine — this is Wave 1's
  own delivered consolidation work (`WAVE1_CHANGELOG.md`), re-verified intact through every subsequent
  Wave 2/3 pass this session.
- **Affected module**: Treasury.
- **Affected transaction**: Bank Statement Import/Reconciliation (both entry points).
- **Affected users/roles**: FinanceManager/Accountant/Admin/CEO (existing reconciliation roles, unchanged).
- **Accounting impact**: None — both entry points post through the same single GL engine
  (`postJournalEntry()`), confirmed in every Wave 3 pass.
- **Security impact**: None — no new access surface, same underlying data.
- **Data-model impact**: `DB.bankStatementLines` remains a frozen, non-destructively-migratable historical
  archive (unchanged).
- **Reporting impact**: None — both front doors report the same underlying reconciliation state.
- **Migration impact**: None — already delivered, already regression-tested (Wave 1's own 42/42 suite,
  re-confirmed every subsequent pass including Wave 3's 667/667 full regression).
- **Implementation impact**: None — no further work needed; this item can be marked resolved in
  `ARCH-2026-002-OPEN-DECISIONS.md`.
- **Blocks Wave 4?**: No.
- **Recommended action**: Update `ARCH-2026-002-OPEN-DECISIONS.md` item 6 to CLOSED BY EVIDENCE (done as
  part of this pass — see §4).

### W3-1 — Payment Approval Matrix finalization — DEFERRED
- **Current status**: DEFERRED (pre-existing, unchanged; not re-opened, not resolved).
- **Exact question**: Should `DB.paymentApprovalMatrix` (`finalised:false`/Draft) be formally finalized
  with Appletree-confirmed tier values?
- **Current behavior**: The matrix exists and is read by `resolveApprovalAuthority()`, but SOD-1/2/5 and
  role-tier checks are the actual enforcement mechanism today — finalizing the matrix is a governance/
  documentation step, not a functional gap. Re-confirmed live in Wave 3's own
  `erp_phase39_payment_approval_matrix_tests.js` re-run (18/18 PASS): every tier in practice still
  requires FinanceManager/CEO/Admin regardless of the matrix's own configured values.
- **Affected module**: Treasury (Payment Control).
- **Affected transaction**: Payment Request approval.
- **Affected users/roles**: FinanceManager, CEO, Admin (approval roles).
- **Accounting impact**: None.
- **Security impact**: None — enforcement is already real, independent of the matrix's finalization
  status.
- **Data-model impact**: None if deferred — `finalised:true` plus confirmed tier values whenever
  authorized.
- **Reporting impact**: None.
- **Migration impact**: None.
- **Implementation impact**: None if deferred — a data-only finalization (no code change) whenever
  management supplies the confirmed values.
- **Blocks Wave 4?**: No.

### W3-2 — Bank Account creation vs. payment execution SoD — OPEN
*(Fields carried forward unchanged from `WAVE3_IMPLEMENTATION_SCOPE.md`, re-verified against current
code — no change in status.)*
- **Current status**: OPEN.
- **Exact question**: Should a new SoD rule (mirroring SOD-5's shape) separate `bankAccount.createdBy`
  from the actor executing a payment through that account?
- **Current behavior**: No separation — re-confirmed via `RBAC_SOD_RULES_SEED` (11 rules, SOD-1 through
  SOD-11, none address this pair) and via `postSupplierPayment`/`postCustomerReceipt`/
  `createBankTransfer`/`executePaymentRequest`, none of which check `bankAccount.createdBy`.
- **Affected module**: Treasury, Master Data.
- **Affected transaction**: Bank Account creation, Supplier Payment, Customer Receipt, Bank Transfer,
  Payment Request execution.
- **Affected users/roles**: Admin, CEO, FinanceManager (roles holding both `masterData:true` and
  `pay:true`).
- **Accounting impact**: None either way — posting behavior unaffected.
- **Security impact**: Deferring leaves the existing disclosed gap unchanged (same actor can create a
  bank account master and pay through it).
- **Data-model impact**: None — reuses `checkSoD()` exactly if authorized.
- **Reporting impact**: None.
- **Migration impact**: None.
- **Implementation impact**: Low if authorized — mirrors SOD-7 through SOD-11 exactly (see
  `ARCH-2026-002-WAVE-3-DESIGN.md` §4-17).
- **Blocks Wave 4?**: No — Wave 4 (Service & After-Sales) does not touch bank account master data or
  payment execution.

### W3-3 — Fixed Asset full-lifecycle SoD — OPEN
- **Current status**: OPEN (the same item the original 46-phase forensic audit already declined to
  resolve unilaterally; re-confirmed unchanged through Wave 3 Implementation's own hardening pass, which
  fixed 2 unrelated defensive defects in the SAME functions without touching this identity-separation
  question).
- **Exact question**: Should new SoD rule(s) close the zero-identity-check gap across
  create→capitalize→transfer→dispose?
- **Current behavior**: Role-only gates throughout (`assertCanCapitalizeFixedAsset()` etc.) — a single
  FinanceManager/Admin/CEO can run the entire lifecycle alone.
- **Affected module**: Asset Management.
- **Affected transaction**: Fixed Asset create/capitalize/transfer/dispose.
- **Affected users/roles**: FinanceManager, Admin, CEO.
- **Accounting impact**: None either way.
- **Security impact**: Deferring leaves the existing, previously-disclosed gap unchanged.
- **Data-model impact**: None if authorized — reuses `checkSoD()`.
- **Reporting impact**: None.
- **Migration impact**: None.
- **Implementation impact**: Low if authorized for the narrowest option (creator≠capitalizer); higher if
  the full pairwise chain is wanted.
- **Blocks Wave 4?**: No.

### W3-4 — Bank Import → Reconciliation SoD — OPEN
- **Current status**: OPEN.
- **Exact question**: Should a new SoD rule tie the importing actor to the reconciling actor?
- **Current behavior**: Purely role-gated — re-confirmed via `matchBankImportLine`/
  `reconcileBankImportLine`, neither checks `batch.importedBy` against the acting user.
- **Affected module**: Treasury.
- **Affected transaction**: Bank Import Batch creation, Bank Import Line matching/reconciliation.
- **Affected users/roles**: FinanceManager, Accountant, Admin, CEO.
- **Accounting impact**: None either way.
- **Security impact**: Deferring leaves the disclosed gap unchanged; note the decision record's own
  substantive point (a bank statement is externally-sourced, from the bank itself, so the self-dealing
  risk profile may be genuinely lower than SOD-5/6's fictitious-vendor scenario) — unresolved by this
  pass, a real risk-judgment call for management.
- **Data-model impact**: None if authorized.
- **Reporting impact**: None.
- **Migration impact**: None.
- **Implementation impact**: Low if authorized — full design already specified in
  `ARCH-2026-002-WAVE-3-DESIGN.md` §37 (test sequence).
- **Blocks Wave 4?**: No.

### W3-5 — Petty Cash GL control account — OPEN
- **Current status**: OPEN.
- **Exact question**: Should Petty Cash gain a dedicated GL control account, becoming a true reconcilable
  subledger?
- **Current behavior**: Only `replenishPettyCashFloat()` posts to the GL; `createPettyCashFloat()`/
  `recordPettyCashVoucher()` never call `postJournalEntry()`; no independently-derivable GL balance to
  reconcile against.
- **Affected module**: Treasury.
- **Affected transaction**: Petty Cash Float creation, Petty Cash Voucher recording.
- **Affected users/roles**: FinanceManager, Accountant, site/field staff who draw petty cash.
- **Accounting impact**: A real, non-trivial accounting-policy decision (which account, what the
  float-creation entry shape is) — explicitly not invented by any prior pass.
- **Security impact**: None directly.
- **Data-model impact**: Requires its own accounting-policy sub-decision before scoping is even possible.
- **Reporting impact**: Deferring leaves Petty Cash un-reconcilable against an independent GL balance —
  an existing, disclosed limitation.
- **Migration impact**: Unassessable until the account/entry-shape decision is made.
- **Implementation impact**: Non-trivial — requires its own dedicated design pass if authorized.
- **Blocks Wave 4?**: No directly. **Note**: if Wave 4's Service module ever needs field-technician
  expense reimbursement via Petty Cash, that would be a NEW Wave 4 scope item depending on this decision
  — not assumed or designed here; Wave 4 Design (Part B) does not include this dependency because no
  such technician-expense-via-petty-cash requirement has been stated or found in the existing Service
  code.

### W3-6 — True daily-aggregate cash limit — OPEN
- **Current status**: OPEN.
- **Exact question**: Should `checkCashLimit()` sum same-day/same-person vouchers rather than checking
  each transaction in isolation?
- **Current behavior**: Per-transaction ceiling only (`checkCashLimit()`, re-confirmed unchanged);
  `DB.cashLimits.approvedByFinance:false` — the limit VALUE itself remains finance-unapproved, a separate
  pre-existing open item.
- **Affected module**: Treasury.
- **Affected transaction**: Petty Cash Voucher recording.
- **Affected users/roles**: FinanceManager, Accountant, field/site staff.
- **Accounting impact**: None either way.
- **Security/control impact**: Deferring leaves the "₹10,000/day" framing not literally enforced as a
  daily aggregate — an existing, disclosed gap.
- **Data-model impact**: None — reads existing `DB.pettyCashVouchers`.
- **Reporting impact**: None.
- **Migration impact**: None.
- **Implementation impact**: Small and scoped if authorized.
- **Blocks Wave 4?**: No.

### W3-7 — Cost allocation mechanism — OPEN
- **Current status**: OPEN — the most architecturally significant item in the register.
- **Exact question**: Does Wave 3 (or any later wave) need a formal cost-allocation-rules engine, or is
  the real reporting need already served by `generalLedger()`'s Cost-Centre filter + `projectPL()`'s
  sweep?
- **Current behavior**: No allocation mechanism exists at all.
- **Affected module**: Controlling.
- **Affected transaction**: N/A — a reporting/allocation capability, not a transaction type.
- **Affected users/roles**: FinanceManager, CEO (Controlling report consumers).
- **Accounting impact**: None from deferring — no new posting path.
- **Security impact**: None.
- **Data-model impact**: Large if authorized — a genuinely new capability, not a small closable gap (see
  `ARCH-2026-002-WAVE-3-DATA-MODEL-GAP-REGISTER.md`).
- **Reporting impact**: Deferring limits Controlling reporting to what `generalLedger()`'s Cost-Centre
  filter and `projectPL()`'s sweep already provide — real, but coarser than a formal allocation engine
  would produce.
- **Migration impact**: Unassessable — no design exists to scope until the need itself is confirmed.
- **Implementation impact**: Large — requires its own dedicated design pass if authorized.
- **Blocks Wave 4?**: No, but relevant context: Wave 4's own scope includes "Service profitability"
  reporting (per `ARCH-2026-002-WAVE-PLAN.md`'s Wave 4 objective). Without W3-7, Service profitability
  reporting can still be built the same way Project Profitability is today (a direct sweep over
  Service-tagged GL lines) — it does not require a formal allocation engine to exist. This is noted in
  `ARCH-2026-002-WAVE-4-DESIGN.md` (Part B) as a scoping boundary, not a blocker.

### W3-8 — Profit Centre transaction propagation — OPEN
- **Current status**: OPEN.
- **Exact question**: Should Profit Centre become a real posting/reporting dimension, and if so, what
  determines a transaction's Profit Centre?
- **Current behavior**: Confirmed master-data-only (codebase's own explicit disclosure at
  `domain.js:10995-10998`, re-verified); no derivation mechanism exists.
- **Affected module**: Controlling.
- **Affected transaction**: N/A — a dimension-propagation question, not a transaction type.
- **Affected users/roles**: FinanceManager, CEO.
- **Accounting impact**: None from deferring.
- **Security impact**: None.
- **Data-model impact**: Requires resolving its own open sub-question first (Branch mapping? Project
  mapping? manual entry per transaction?) before scoping is possible.
- **Reporting impact**: Deferring means Profit Centre cannot yet be used as a real reporting slice for
  any domain, including Wave 4 Service — same non-blocking relationship as W3-7 (see W3-7's Wave 4 note).
- **Migration impact**: Unassessable until the derivation mechanism is decided.
- **Implementation impact**: Requires its own dedicated design pass if authorized.
- **Blocks Wave 4?**: No.

### W3-9 — Depreciation/Job-Work cost labeling in `projectFinancial360` — OPEN
- **Current status**: OPEN (per this CR's own §4 instruction — "Do not use 'resolved' merely because the
  developer chose an option" — the low-stakes framing recorded in the original decision item does not
  itself constitute authorization; Wave 3 Implementation's own scope-classification pass reached the same
  conclusion and this pass does not revisit that reasoning).
- **Exact question**: Should the API response gain explicit `depreciationCost`/`jobWorkInventoryAdjustment`
  fields (a pure labeling addition, no calculation change)?
- **Current behavior**: Both costs are correctly included in `cost.actual` today, just not separately
  named — re-confirmed unchanged by Wave 3 Implementation's own verification pass.
- **Affected module**: Reporting, Project Cost.
- **Affected transaction**: N/A — a reporting-clarity fix, not a transaction type.
- **Affected users/roles**: Anyone viewing Project Financial 360 (ProjectManager, FinanceManager, CEO,
  Admin, scoped viewers).
- **Accounting impact**: None — this is a labeling-only change.
- **Security impact**: None.
- **Data-model impact**: None.
- **Reporting impact**: Deferring means the two costs remain correctly summed but not separately
  visible — a transparency limitation, not a calculation error.
- **Migration impact**: None.
- **Implementation impact**: Trivial (2-line addition) whenever authorized.
- **Blocks Wave 4?**: No — Wave 4's own "Service profitability" reporting is a separate rollup, not
  dependent on this Project-Profitability labeling fix.

## 4. Management Decision Records (§5 format, every OPEN item)

The following 7 records are provided in the exact management-ready format this CR's §5 requires. Each
recommendation, where given, is explicitly attributed to the architecture/design document it comes from —
never presented as this document's own preference.

---
**Decision ID:** W3-2
**Question:** Should a new SoD rule separate bank-account-master creation from payment execution through
that account?
**Current system behavior:** No separation; Admin/CEO/FinanceManager can create a bank account and pay
through it with zero identity check.
**Option A:** Add the rule with no CEO/Admin exemption (matches the SOD-5/7-11 precedent — the newer,
formal-engine convention).
**Option B:** Add the rule with a CEO/Admin exemption (matches the older inline-check convention used
elsewhere, e.g. SOD-2).
**Option C:** Defer — accept as a disclosed small-company risk, comparable to the already-accepted
CEO/Admin combined-role reality elsewhere in this system.
**Operational consequence:** Options A/B add a second, distinct actor requirement to bank-account-funded
payment execution in a small finance team — may increase friction if the finance team is very small.
**Accounting consequence:** None under any option.
**Security consequence:** Options A/B close a real, currently-open self-dealing path; Option C leaves it
open, disclosed.
**Reporting consequence:** None under any option.
**Migration consequence:** None under any option.
**Development consequence:** Options A/B are low-effort (mirrors SOD-7 through SOD-11 exactly, per
`ARCH-2026-002-WAVE-3-DESIGN.md` §4-17); Option C requires no development.
**Recommendation from existing architecture documents:** None given — `ARCH-2026-002-WAVE-3-DECISIONS.md`
W3-2 explicitly states "No recommendation given," and no other architecture document takes a position on
this specific item.

---
**Decision ID:** W3-3
**Question:** Should new SoD rule(s) close the identity-separation gap across the Fixed Asset lifecycle
(create→capitalize→transfer→dispose)?
**Current system behavior:** Role-only gates throughout; a single FinanceManager/Admin/CEO can run the
entire lifecycle alone.
**Option A:** Add a creator≠capitalizer rule only — the narrowest option, most directly analogous to what
the original 46-phase forensic audit flagged.
**Option B:** Add rules for every pairwise transition in the lifecycle (create/capitalize/transfer/
dispose), a fuller separation.
**Option C:** Defer — accept as a disclosed policy decision, exactly as the 46-phase audit itself already
classified it ("a business judgment... not an engineering default").
**Operational consequence:** Options A/B require a second finance-tier actor at each guarded step; Option
C preserves current single-actor flexibility.
**Accounting consequence:** None under any option.
**Security consequence:** Options A/B close a real, previously-disclosed gap (present since before this
engagement began); Option C leaves it open, already twice-disclosed (original 46-phase audit, and this
engagement's own Wave 3 Phase 0/Implementation passes).
**Reporting consequence:** None under any option.
**Migration consequence:** None under any option.
**Development consequence:** Option A is low-effort; Option B is proportionally larger (multiple guard
clauses); Option C requires none.
**Recommendation from existing architecture documents:** None given — the original 46-phase forensic
audit explicitly declined to resolve this unilaterally, and `ARCH-2026-002-WAVE-3-DECISIONS.md` W3-3
re-confirms "No recommendation given," re-stating it is the same item, not re-decided.

---
**Decision ID:** W3-4
**Question:** Should a new SoD rule tie the bank-statement-importing actor to the reconciling/allocating
actor?
**Current system behavior:** Purely role-gated; no identity check between `batch.importedBy` and the
reconciling actor.
**Option A:** Add the rule (mirrors the existing SOD-5/6/7-11 pattern).
**Option B:** Defer, on the basis that a bank statement is an externally-sourced document (from the bank
itself), so the self-dealing risk profile may be genuinely lower than SOD-5/6's fictitious-vendor-payment
scenario — a real, substantive difference the decision record itself raises.
**Operational consequence:** Option A requires a second actor at reconciliation time; Option B preserves
current single-actor flexibility for what may be a lower-risk document class.
**Accounting consequence:** None under either option.
**Security consequence:** Option A closes the currently-open gap; Option B leaves it open, disclosed,
with the risk-profile caveat above.
**Reporting consequence:** None under either option.
**Migration consequence:** None under either option.
**Development consequence:** Option A is low-effort — full test sequence already specified in
`ARCH-2026-002-WAVE-3-DESIGN.md` §37 (10 numbered steps).
**Recommendation from existing architecture documents:** None given — `ARCH-2026-002-WAVE-3-DECISIONS.md`
W3-4 explicitly states "No recommendation given," and explicitly frames Option B's risk-profile
distinction as "a real, substantive difference worth management's own risk judgment, not assumed away
here."

---
**Decision ID:** W3-5
**Question:** Should Petty Cash gain a dedicated GL control account, becoming a true reconcilable
subledger?
**Current system behavior:** Only float replenishment posts to the GL; no independently-derivable GL
balance exists to reconcile float/voucher records against.
**Option A:** Add a dedicated "Petty Cash on Hand" GL control account, with float creation and voucher
issuance each posting through `postJournalEntry()`.
**Option B:** Defer — keep Petty Cash as an operational-only register, as today.
**Operational consequence:** Option A adds a GL posting step to float creation and every voucher
(currently posting-free); Option B preserves current lightweight operational flow.
**Accounting consequence:** Option A makes Petty Cash independently reconcilable against a real GL
balance; Option B leaves the current limitation (reconciliation is purely in-memory, never cross-checked
against a GL balance).
**Security consequence:** None materially different under either option.
**Reporting consequence:** Option A enables a true Petty Cash reconciliation report; Option B leaves the
current operational-only reporting.
**Migration consequence:** Unassessable under Option A until the account and entry-shape decision itself
is made — this is a prerequisite, not a detail that can be filled in independently.
**Development consequence:** Option A requires its own dedicated design pass (explicitly not detailed in
`ARCH-2026-002-WAVE-3-DESIGN.md`, matching how W2-5 — Production Output→FG — was left for its own
dedicated pass in Wave 2); Option B requires none.
**Recommendation from existing architecture documents:** None given — `ARCH-2026-002-WAVE-3-DECISIONS.md`
W3-5 states this "requires its own accounting-policy decision... explicitly not invented here."

---
**Decision ID:** W3-6
**Question:** Should `checkCashLimit()` sum same-day/same-person vouchers as a true daily aggregate rather
than checking each transaction in isolation?
**Current system behavior:** Per-transaction ceiling only; the "₹10,000/day" framing is not literally
enforced as a daily aggregate. Separately, `DB.cashLimits.approvedByFinance:false` — the limit VALUES
themselves are not yet finance-approved.
**Option A:** Extend `checkCashLimit()` to sum same-day/same-person vouchers before comparing to the cap.
**Option B:** Defer — keep the current per-transaction check.
**Operational consequence:** Option A may block a legitimate second same-day voucher that individually
falls under the cap but pushes the day's total over it — a real behavior change field staff would notice;
Option B preserves current behavior.
**Accounting consequence:** None under either option.
**Security/control consequence:** Option A closes the literal "not really a daily aggregate" gap; Option
B leaves it open, disclosed.
**Reporting consequence:** None under either option.
**Migration consequence:** None under either option.
**Development consequence:** Option A is small and scoped (reads existing `DB.pettyCashVouchers`, no
schema change); Option B requires none.
**Recommendation from existing architecture documents:** None given — `ARCH-2026-002-WAVE-3-DECISIONS.md`
W3-6 states this is "a real operational-control question, not a technical one," and separately flags that
the limit VALUE's own finance-approval is a distinct, still-open pre-existing item regardless of which
option is chosen here.

---
**Decision ID:** W3-7
**Question:** Does the business need a formal cost-allocation-rules engine, or is the real reporting need
already served by existing tools (`generalLedger()`'s Cost-Centre filter + `projectPL()`'s sweep)?
**Current system behavior:** No allocation mechanism exists at all.
**Option A:** Build a formal cost-allocation-rules engine (the most architecturally significant option in
this entire register).
**Option B:** Defer — confirm that `generalLedger()`'s existing Cost-Centre filter and `projectPL()`'s
existing sweep already meet Appletree's real reporting need, and do not build a new capability.
**Operational consequence:** Option A is a substantial new capability requiring its own scoping;
Option B changes nothing operationally.
**Accounting consequence:** None under either option — no new posting path either way.
**Security consequence:** None under either option.
**Reporting consequence:** Option A would allow formal, rules-based cost distribution across Cost
Centres; Option B keeps reporting at its current, coarser-but-real level.
**Migration consequence:** Unassessable under Option A until the need itself is confirmed and scoped.
**Development consequence:** Option A requires its own dedicated design pass, explicitly not detailed
further in any existing design document; Option B requires none.
**Recommendation from existing architecture documents:** None given — `ARCH-2026-002-WAVE-3-DECISIONS.md`
W3-7 states "this is a genuinely large, new capability... not a small closable gap," with no
recommendation attached in any reviewed document.

---
**Decision ID:** W3-8
**Question:** Should Profit Centre become a real posting/reporting dimension (currently master-data-only),
and if so, what determines a transaction's Profit Centre?
**Current system behavior:** Confirmed master-data-only; full CRUD exists but zero business function
tags a `profitCentreId` on any GL line; not derivable from Branch (Branch has no `profitCentreId` field).
**Option A:** Define a derivation rule (e.g. a Branch→Profit-Centre mapping, or a Project→Profit-Centre
mapping) and propagate it onto relevant postings.
**Option B:** Require manual Profit Centre entry per transaction.
**Option C:** Defer — keep Profit Centre master-data-only.
**Operational consequence:** Option A is transparent to end users once the mapping is defined; Option B
adds a manual field to relevant transaction entry; Option C changes nothing operationally.
**Accounting consequence:** None under any option — no new account, only a new dimension tag.
**Security consequence:** None under any option.
**Reporting consequence:** Options A/B enable Profit-Centre-sliced reporting; Option C leaves this
dimension unusable for reporting, as today.
**Migration consequence:** Unassessable until the derivation mechanism (Option A) or manual-entry policy
(Option B) is decided.
**Development consequence:** Requires its own dedicated design pass under either A or B, explicitly not
detailed further in any existing design document; Option C requires none.
**Recommendation from existing architecture documents:** None given — `ARCH-2026-002-WAVE-3-DECISIONS.md`
W3-8 states this "is exactly that judgment call, left to management," per this CR's own §7 instruction not
to invent a dimension's usage merely because the master record exists.

---
**Decision ID:** W3-9
**Question:** Should `projectFinancial360()`'s API response gain explicit `depreciationCost`/
`jobWorkInventoryAdjustment` fields (a pure labeling addition, no calculation change)?
**Current system behavior:** Both costs are correctly included in `cost.actual` today, just not
separately named as fields.
**Option A:** Add the two named fields.
**Option B:** Defer — leave the response shape as-is.
**Operational consequence:** Option A gives report viewers visibility into these two cost components
without changing any total; Option B preserves the current, correct-but-less-transparent shape.
**Accounting consequence:** None under either option — this is a labeling-only change; the underlying
sum is identical either way.
**Security consequence:** None under either option.
**Reporting consequence:** Option A improves transparency for Project Profitability and any Wave 4
Service-profitability rollup that might reuse the same sweep pattern; Option B leaves this as a known,
disclosed transparency gap (not a calculation defect).
**Migration consequence:** None under either option.
**Development consequence:** Trivial under Option A (2-line addition); none under Option B.
**Recommendation from existing architecture documents:** None formally given, though
`ARCH-2026-002-WAVE-3-DECISIONS.md` W3-9 itself notes this item "carries no business-policy content...
more a scheduling choice than a genuine open question" — this characterization is the closest thing to a
recommendation any document offers, and even so this pass does not treat it as management authorization
(per §4 of this CR: "Do not use 'resolved' merely because the developer chose an option").

## 5. W3 Decision Impact Analysis (§7)

| ID | Affects Wave 3 (completed) | Wave 4 | Wave 5 | Wave 6 | Security arch. | Data model | Txn ownership | Accounting | Controlling | Treasury | Asset Mgmt |
|---|---|---|---|---|---|---|---|---|---|---|---|
| W3-1 | Yes (governance only) | No | No | No | No | No | No | No | No | Yes | No |
| W3-2 | Yes | No | No | No | Yes | No | No | No | No | Yes | No |
| W3-3 | Yes | No | No | No | Yes | No | No | No | No | No | Yes |
| W3-4 | Yes | No | No | No | Yes | No | No | No | No | Yes | No |
| W3-5 | Yes | No | No | No | No | Yes (if authorized) | No | Yes (if authorized) | No | Yes | No |
| W3-6 | Yes | No | No | No | No | No | No | No | No | Yes | No |
| W3-7 | Yes | No (see §3 note) | No | No | No | Yes (if authorized) | No | No | Yes | No | No |
| W3-8 | Yes | No (see §3 note) | No | No | No | Yes (if authorized) | No | No | Yes | No | No |
| W3-9 | Yes | No | No | No | No | No | No | No | No | No | No |

No W3 item is a hard dependency for Wave 4. This matches `ARCH-2026-002-WAVE-4-DEPENDENCY-MAP.md`'s own
finding (Part B of this CR).

## 6. Audit trail

`ARCH-2026-002-WAVE-3-DECISIONS.md` has been updated (not overwritten) with a new §E appending this
pass's re-classification, preserving the original document's content in full. `ARCH-2026-002-OPEN-
DECISIONS.md` item 6 has been updated in place with a "RECLASSIFIED 2026-09-23" note, preserving the
original finding text as history, per this CR's own §6 instruction not to erase historical decision
records.
