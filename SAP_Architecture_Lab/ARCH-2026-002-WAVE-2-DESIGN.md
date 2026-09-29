# ARCH-2026-002 — Wave 2 Design

**Date:** 2026-09-22. Wave 2 Phase 0 deliverable, §21. **Design only — no implementation code written,
no file modified to produce this document.** Every item below is explicitly contingent on the
corresponding decision in `ARCH-2026-002-WAVE-2-DECISIONS.md`; none is pre-authorized by this document.

## 1. Exact authorized scope (of THIS Phase 0 pass)

Audit, readiness assessment, dependency analysis, security review, data-model review, process trace,
and this design document only. **No Wave 2 application code is authorized by this Phase 0.**

## 2. Existing capabilities to preserve (do not rebuild)

All 6 Wave 2 domains' core transaction chains are EXISTING and WORKING (Source-to-Pay, Stock-to-Site,
Site-to-Handover, Job-Work-to-Settlement fully; Plan-to-Produce and Quality-to-CAPA partially — see
Process Trace). Any future implementation must preserve, not rebuild: the single GL/inventory/clearing/
transaction-wrapper/numbering/authorization/audit/project-cost engines (all re-confirmed singular this
pass); every EXISTING SoD control (PR/PO/BOM/MRS/excess-issue/CAPA creator≠approver-family rules); the
no-double-stock Job Work movement math; Site Material's single ownership; the Bank Reconciliation
consolidation delivered in Wave 1.

## 3. Missing capabilities (contingent on decisions)

Per `ARCH-2026-002-WAVE-2-DECISIONS.md`: SoD coverage for 3 operational chains (W2-4), QC audit-log gap
(W2-2), Plan-to-Produce Demand trigger (W2-1), Production Output→FG inventory (W2-5), Warehouse scope
(W2-3), Gate Pass/Transporter master (W2-6), Inspection/NCR entity (W2-7). PO Amendment remains a
deliberately absent, larger capability not scoped for any near-term wave (no decision item created for
it — it was already dispositioned as out-of-precedent in the original code comment, re-confirmed, not
reopened here).

## 4-17. Changes required, data model, UI, API, workflow, authorization, scope, SoD, approval, audit,
## reporting, accounting, inventory, project-cost — per decision item

### If W2-4 (SoD coverage) is authorized

- **Data model**: none — reuses the existing `DB.sodRules`/`checkSoD()` engine exactly as SOD-5/SOD-6 did.
- **UI**: none required (server-side enforcement; UI would surface the resulting error message, no new screen).
- **API**: no new routes — the guard clauses insert into existing mutation functions
  (`issueProductionMaterial`/`postProductionLabourCost`/`completeProductionOrder` for Manufacturing;
  `returnFromJobWorker`/`recordJobWorkScrap`/`directDispatchFromJobWorker`/`draftSupplierInvoice[FromPO]`
  for Job Work; `submitQCResult` for Quality).
- **Workflow**: additive guard only — no new state, no new transition.
- **Authorization/SoD**: this IS the change — 3 new rule IDs (e.g. SOD-7/8/9), each mirroring the exact
  existing pattern (`checkSoD(ruleId,{makerId,checkerId})`), CEO/Admin exemption status a decision item.
- **Approval/Audit**: unaffected structurally; each new block would call `logAudit()` on violation,
  matching SOD-5/SOD-6's own precedent (`SoDViolationBlocked` event type).
- **Reporting/Accounting/Inventory/Project-cost**: unaffected — this closes an authorization gap, it
  does not change what gets posted.
- **Migration**: none.
- **Test strategy**: mirror `erp_arch_2026_001d_sod_tests.js`'s own pattern — engine-level + live HTTP +
  full regression re-run, proving zero behavior change for every currently-passing case plus the new
  block proven for the violating case.
- **Browser UAT**: the specific role pairs named in each SoD rule, live-tested attempting the
  self-conflicting sequence, blocked; a genuine second-person positive control succeeding.
- **Rollback**: remove the 3 new rule entries and their 5-6 call-site guard clauses; the engine itself
  is untouched.
- **Production safety**: purely additive server-side logic — no data migration risk.

### If W2-2 (QC audit-log gap) is authorized

Trivial: add one `logAudit()` call inside `createQCChecklist()`, mirroring `submitQCResult()`'s own
existing call shape exactly. No data model, UI, API, workflow, or accounting impact. Test: a single new
assertion confirming the audit log gains a `QCChecklistCreated`-class entry.

### If W2-1 (Demand trigger) is authorized

- **Data model**: an optional new field/flag on `DB.materialRequirements` OR a new thin
  `DB.productionSuggestions` mapping table (per Data-Model Gap Register) — additive only.
- **UI**: a new "Production Suggestions" view, likely extending the existing Replenishment report screen.
- **API**: one new read route (suggestions list) + reuse of the EXISTING `createProductionOrder` route
  for the human-confirmed conversion step — no new creation path, the suggestion is advisory only.
- **Workflow**: Suggestion → human confirms → real, unchanged `createProductionOrder` call. No automatic
  Production Order creation (explicitly avoiding "the first system-initiated transaction" risk this
  engagement has flagged elsewhere for auto-PR-generation-style features).
- **Authorization/Scope/SoD/Approval**: unaffected — reuses `createProductionOrder`'s existing gates.
- **Audit/Reporting/Accounting/Inventory/Project-cost**: unaffected directly.
- **Migration**: none. **Test strategy**: new suite proving the suggestion correctly reflects an
  APPROVED, BOM-tagged MR and that confirming it produces an identical Production Order to today's
  manual path. **Rollback**: remove the new field/table and the one new read route.

### If W2-5 (Production Output → FG) is authorized

The most architecturally significant item in this register — requires a genuine accounting-policy
decision (which GL account values Finished Goods) BEFORE any design detail can be finalized, per this
CR's own "do not invent accounting" discipline. Sketch only: `completeProductionOrder` would gain one
additional `postInventoryMovement()` call (new movement type, e.g. `'ProductionReceipt'`) using the
existing single writer, valued at `productCosting()`'s existing standard-cost figure or actual
`jobCostSheet()` figure (a further sub-decision). **Not detailed further here** — this item should be
re-scoped with its own dedicated design pass once the accounting-policy decision is made, not assumed.

### If W2-3 (Warehouse scope) is authorized

Adds one new `case 'Warehouse':` branch to `hasScopeAccess()`, plus a `warehouseId` field on relevant
user records — same shape as the existing Project/Site/Customer/Branch cases. **Must be regression-proven
that every existing scope check's behavior is byte-identical** (the same discipline ARCH-2026-001C used
for its own migration). Full detail deferred to its own design pass once W2-3's underlying question
(does Appletree's real structure need this) is answered.

### If W2-6 (Gate Pass / Transporter master) or W2-7 (NCR) are authorized

Both are genuinely new, self-contained entities per the Data-Model Gap Register — full detailed design
deferred to their own passes once authorized, consistent with not over-designing a feature that might be
declined.

## 18. Migration

**None required for any item in this register that is purely additive** (all except W2-5, which
requires its own accounting-policy-driven migration question, and W2-3, which requires none — scope
enforcement applies going forward, not retroactively). No item proposes touching production data in this
Phase 0.

## 19. Test strategy (general, applies to any future Wave 2 implementation)

Full parity/regression discipline: every new control proven not to weaken any EXISTING passing test;
every new capability proven additive via a dedicated new suite; full existing battery re-run before
sign-off (baseline: 569/571, per this Phase 0's own re-confirmation, §22 below).

## 20. Browser UAT (general)

Minimum roles per domain: Procurement (Purchase, FinanceManager, CEO), Inventory (Purchase, Admin),
Manufacturing (Purchase/Production role, CEO), Job Work (Purchase, FinanceManager), Site Execution
(SiteInCharge, ProjectManager), Quality (whichever role ends up authorized to inspect vs. approve, if
W2-4's Quality rule is built — today there is no "approver" role for QC to even test).

## 21. Rollback (general)

Every item above is designed additively against existing engines — no item in this register proposes
modifying an existing function's CURRENT behavior for the case that doesn't trigger the new rule/field,
so rollback in every case is "remove the addition," never "restore a prior version of unrelated logic."

## 22. Production safety

Every future Wave 2 implementation must repeat this Phase 0's own discipline: hash before/after,
isolated test environment only, no production migration without separate explicit authorization.

## 23. Deferred items

PO Amendment (no decision item raised — already dispositioned as a deliberately absent, larger
capability); MRP/automated Production Order generation beyond the minimal suggestion-only linkage in
W2-1; any Wave 3-6 domain functionality.

## Proposed sub-wave sequence (a proposal, not a mandate — actual sequencing depends on which decisions above are authorized and in what combination)

Based on the dependency analysis in `ARCH-2026-002-WAVE-2-DEPENDENCY-MAP.md`: every Wave 2 domain's CORE
capability is already EXISTING and WORKING, so — unlike a from-scratch build — there is no strict
inter-domain build order. The real sequencing driver is **risk and decision-readiness**, not dependency:

- **Wave 2A — Security closure** (W2-4 SoD additions + W2-2 QC audit fix, if authorized): lowest risk,
  zero data-model change, reuses a proven engine exactly. No dependency on any other Wave 2 item.
- **Wave 2B — Procurement cross-document SoD** (the PR→PO→Payment gaps found in Security Baseline §1,
  if a decision is made to close them — not yet a numbered decision item since this CR's own §14 named
  it as a review, not a build request; would need its own decision item if pursued): same low-risk
  pattern as 2A.
- **Wave 2C — Manufacturing Demand-trigger** (W2-1, if authorized): benefits from 2A's SoD closure being
  in place first (securing the execution chain before extending what feeds into it), though not strictly
  blocked by it.
- **Wave 2D — Warehouse scope** (W2-3, if authorized): fully independent, best sequenced after 2A proves
  the "extend the scope engine without regression" discipline at smaller scale (the SoD additions are a
  useful dry run for the same kind of change).
- **Wave 2E — Production Output→FG** (W2-5, if authorized): explicitly gated on its own accounting-policy
  sub-decision; sequence last among the "real functional gap" items since it is the most architecturally
  significant.
- **Wave 2F — Gate Pass/Transporter (W2-6) and NCR (W2-7)**, if authorized: fully independent, net-new,
  lowest urgency — natural candidates for last, or for a separate, smaller CR each.

**This sequence is not authorized by this document** — it is offered as the reasoned default this CR's
own §21 asks for, to be confirmed or overridden by whoever authorizes Wave 2's actual implementation.
