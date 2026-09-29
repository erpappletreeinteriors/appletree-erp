# ARCH-2026-002 — Wave 4 Design

**Date:** 2026-09-23. Wave 4 Phase 0 (Part B) deliverable, per this CR's own §26. **Design only — no
implementation code written.** Every item is contingent on its corresponding decision in
`ARCH-2026-002-WAVE-4-DECISIONS.md`. Format follows `ARCH-2026-002-WAVE-3-DESIGN.md`.

## 1. Exact scope (of this Phase 0 / Part B pass)

Audit, transaction-ownership trace, security baseline, gap analysis, and this design document only. **No
Wave 4 application code is authorized by this Phase 0.**

## 2. Existing functionality to preserve

The entire Phase 10 After-Sales block as-is: the Warranty/Complaint/Ticket/Visit/AMC/AMC-Schedule/CAPA
state machines, `draftServiceInvoice()`/`draftAMCBillingInvoice()`'s exact routing through
`draftCustomerInvoice()`/`createDraft()`, `issueServiceMaterial()`'s unmodified delegation to
`createMaterialIssue()`, `postServiceLabourCost()`'s existing account usage (5100/1000), POL-06/07/08's
existing configuration mechanism, `serviceTicketClosureReadiness()`'s real gate, SOD-11 (re-verified
intact this pass, not to be re-implemented), `afterSalesFinancials()`/`coreProjectPL()`/
`projectFinancial360()`'s existing by-construction computation. **None of this is to be rebuilt.**

## 3. Missing functionality (contingent on decisions)

Per `ARCH-2026-002-WAVE-4-DECISIONS.md`: warranty template/policy (W4-1), classification-automation
(W4-2), AMC scheduling automation (W4-3), Resolution SLA (W4-4), rate-card enforcement (W4-5), warranty
accounting treatment (W4-6), duplicate-billing guard (W4-7), 3 new SoD rules (W4-8), diagnosis-threshold
policy (W4-9), CAPA hygiene fix + Site-issue origin (W4-10), technician tracking + Cost Centre tag (W4-11).

## 4-23. Changes required, per decision item, split into sub-waves by risk/decision-readiness

### Sub-wave 4A — Low-risk hygiene closures (no business-policy content, mirrors W3-9/W2-2 precedent)

Covers: W4-10's validation half (CAPA source-ID existence check), the 6 missing `logAudit()` calls
(Data-Model Gap Register item 7), W4-7 (duplicate-billing guard).

- **Data model**: none new.
- **API/UI**: none new — internal validation/logging additions only.
- **Workflow**: unchanged.
- **Authorization/Scope/SoD/Approval**: unchanged.
- **Audit**: directly improved (the point of this sub-wave).
- **Accounting/Inventory/Project cost**: unchanged.
- **Reporting**: unaffected.
- **Migration**: NONE — purely additive guard clauses and logging calls inside existing functions,
  identical risk profile to Wave 3's own 3C (reporting labeling) and Wave 2's W2-2 closure.
- **Tests**: new assertions mirroring ERP-042/043/044's own existing-CAPA-guard-clause pattern for the
  source-ID checks; a positive/negative pair per newly-logging function.
- **Browser UAT**: not required (no UI change).
- **Rollback**: remove the added guard clauses/log calls — trivial, no data-shape change.
- **Production safety**: standard hash-before/after discipline, isolated server only.
- **Deferred items**: none within this sub-wave.

### Sub-wave 4B — Reporting-depth additions (low business-policy content, mirrors W3-9 precedent)

Covers: W4-11 (technician persistence + Service Cost Centre tag).

- **Data model**: add `technicianId` to the JE line/labour-entry cross-reference; add `costCentreId:
  'CC-SERVICE'` (a new cost-centre master record, one line, same shape as `CC-FACTORY`/`CC-INSTALLATION`)
  to `postServiceLabourCost()`'s existing lines.
- **API**: no new route — `postServiceLabourCost()`'s existing parameters already include `technicianId`;
  this closes the gap between accepting and persisting it.
- **Workflow/Authorization/SoD/Approval**: unchanged.
- **Accounting**: no new account, no calculation change — pure tagging, identical in kind to the existing
  CC-FACTORY/CC-INSTALLATION precedent Wave 3 already tested and confirmed working.
- **Reporting**: enables per-technician and per-Cost-Centre Service Labour reporting via the EXISTING
  `generalLedger()` Cost-Centre filter — no new reporting engine.
- **Migration**: NONE for new postings; historical entries cannot be retrofitted (value never captured) —
  disclosed, not treated as a blocker.
- **Tests**: extend the Wave 3 [C1]-style assertion pattern to Service Labour specifically.
- **Rollback**: revert the 2 added fields — trivial.

### Sub-wave 4C — SoD expansion (contingent on W4-8/W4-9)

Covers: new `checkSoD()` rules for Complaint/Ticket/AMC creator≠closer/biller (if W4-8 authorized), and
any change to the POL-07 diagnosis-threshold identity control (if W4-9 resolves toward adding one).

- **Pattern**: mirror SOD-7 through SOD-11 exactly (the SAME pattern Wave 2 and Wave 3's own W3-2/W3-3/W3-4
  proposals both use) — new entries in `RBAC_SOD_RULES_SEED`, guard clauses using `checkSoD()`+
  `durableFailureAudit` inside `changeComplaintStatus()`/`closeServiceTicket()`/`draftAMCBillingInvoice()`.
- **Data model**: none — reuses the existing engine exactly.
- **UI/API**: none new — guard clauses only.
- **Test strategy**: mirror Wave 2's own proven pattern precisely — maker creates, same maker blocked,
  different authorized user succeeds, audit trail present, forged-role bypass blocked, full regression
  re-run for zero net new failures; pre-existing test fixtures using a single actor for what becomes a
  maker≠checker pair will need the SAME disclosed, non-weakening actor-substitution fix Wave 2's own
  experience already proved necessary (`erp_audit_p0_tests.js`'s own already-modified fixtures, e.g. the
  `pm1`→`ceo` completer substitution, are the direct precedent).
- **Migration**: NONE.

### Sub-wave 4D — Requires its own accounting-policy decision first (contingent on W4-6)

Warranty Provision/Reserve accounting treatment — explicitly NOT detailed further here, matching exactly
how Wave 3 left W3-5 (Petty Cash GL account) and W3-7 (Cost Allocation) for their own dedicated design
passes rather than speculatively designed inside this document.

### Sub-wave 4E — Convenience automation (contingent on W4-1/W4-2/W4-3/W4-4/W4-5, all genuine
product/policy questions, lowest implementation urgency)

Warranty template/master, diagnosis-to-eligibility automation, AMC schedule auto-generation, Resolution
SLA + Warning threshold, rate-card-to-posting linkage. Each requires its own policy answer before ANY
implementation detail could be responsibly specified — deliberately not designed further here, per this
CR's own "do not over-design a possibly-declined feature" discipline, exactly as Wave 3 treated W3-7/W3-8.

## 18. Migration

**None required for Sub-waves 4A/4B/4C** — every item is a pure guard-clause/tagging addition. Sub-wave 4D
is contingent on its own accounting-policy decision before migration risk could even be assessed. Sub-wave
4E's items are each independently low-migration-risk (all additive) but are gated on policy decisions, not
technical migration complexity.

## 19-21. Test strategy, Browser UAT, Rollback (general)

Same discipline as Wave 2/3: full parity/regression proof for every new control; dedicated new suite
extending `tests/erp_audit_p0_tests.js`'s existing After-Sales coverage (ERP-042/043/044) rather than
fragmenting into a brand-new file, unless the eventual authorized scope is large enough to warrant its own
file (a call for whoever authorizes implementation, not pre-decided here); minimum roles per this CR's
own convention (Admin/CEO/FinanceManager/Sales/ProjectManager for After-Sales items, matching
`AS_VIEW_ROLES`/`AS_SUPERVISE_ROLES`). Every item is additive — rollback in every case is "remove the
addition," never "restore a prior version of unrelated logic."

## 22. Production safety

Repeat this Phase 0's own discipline: hash before/after, isolated test environment only, no production
migration without separate explicit authorization.

## 23. Deferred items

Sub-wave 4D (Warranty Provision accounting) and every item in Sub-wave 4E are both explicitly flagged as
requiring their OWN dedicated design pass (4D) or their own policy resolution before implementation
detail is meaningful (4E) — consistent with not over-designing features that may be declined.

## Proposed sub-wave sequence (a proposal, not a mandate)

- **Wave 4A — Hygiene closures**: lowest risk, zero policy content, independent of everything else.
- **Wave 4B — Reporting-depth additions**: low risk, low policy content, independent, can run alongside 4A.
- **Wave 4C — SoD expansion**: low-medium risk, contingent on W4-8/W4-9 decisions, reuses a fully-proven
  pattern (SOD-5 through SOD-11) with zero new mechanism.
- **Wave 4D — Warranty accounting treatment**: contingent on its own accounting-policy decision (W4-6);
  sequence after 4A-4C since it's the most architecturally significant item in this register.
- **Wave 4E — Convenience automation**: contingent on 5 separate product/policy decisions
  (W4-1/2/3/4/5); sequence last, lowest urgency, each deserving its own scoping conversation rather than
  being bundled into a general "Wave 4" push.

**This sequence is not authorized by this document** — offered as the reasoned default this CR's own §26
asks for, to be confirmed or overridden by whoever authorizes Wave 4's actual implementation.
