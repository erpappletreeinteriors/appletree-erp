# ARCH-2026-002 — Open Decisions

**Date:** 2026-09-21. Phase 0 deliverable. Carries forward every still-open item from
`ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md` (re-verified, not re-litigated) and adds items newly
surfaced by this Phase 0's own fresh code audit. No item below is decided by this document — each
requires a management decision before its dependent implementation work can be authorized. Nothing
here was invented; each is grounded in a specific, cited piece of evidence.

## 1. CEO / technical-administrator split — OPEN (carried forward, unchanged)

**Decision needed:** Option A (CEO retains combined business + technical-admin access) vs. Option B
(CEO splits into separate business + Business Administrator + System Administrator + Auditor personas).
**Full detail:** `ARCH-2026-001-RBAC-TARGET-DESIGN.md` §3. **Blocks:** the final CEO/Admin-separation
step of the RBAC sequence — explicitly out of scope for this CR's Phase 0 and for Wave 1 per the CR's
own §1 critical rule ("DO NOT create a second authorization engine") and its architecture-freeze
precedent. **No recommendation given** — a business staffing/governance decision, not a technical one.

## 2. Integration & Platform (Domain #19) scope — OPEN (carried forward, unchanged)

**Decision needed:** which of a general-purpose external-system connector, an API/webhook framework, or
Authentication/SSO integration (if any) Appletree wants classified as this domain's scope. **Full
detail:** `ARCH-2026-001-ARCHITECTURE-FREEZE.md` §3. **Blocks:** any implementation work on domain #19
— it cannot be scoped, designed, or estimated until this is answered. Domain #19 is not part of any
Wave 1-6 grouping in this CR's own §9-§14, so this item is not on the Wave 1 critical path, but is
recorded here so it is not silently dropped. **No recommendation given.**

## 3. Payroll (Domain #21) statutory configuration — OPEN, higher stakes than a scope question (carried forward, unchanged)

**Decision needed:** Appletree must supply actual PF/ESI/PT rates and rules, TDS-on-salary slabs, and
filing cadence/format before any DESIGN work on Payroll can safely begin — not just implementation.
Building against assumed defaults here carries real legal/compliance risk. **Blocks:** all Payroll work
(Wave 5, §13 of this CR). Per this CR's own §35 instruction ("Do not hard-code statutory values without
approved requirements... create configuration points and document open decisions rather than inventing
policy"), Wave 5 planning will define Payroll's data model as configuration-driven placeholders only,
never assumed rates. **No recommendation given — cannot be, this is legal/statutory, not a design
preference.**

## 4. Wave 1 RBAC/ID-numbering cleanup scope — NEW, surfaced by this Phase 0's fresh code audit

**Finding:** Sales & CRM's `approveQuotationDiscount()` and `canSeeLead()` still gate on legacy inline
`actor.role===X` checks rather than the `can()`/`checkSoD()` dispatcher ARCH-2026-001A/D built; and
`Lead`, `EstimationRequest`, `CostingVersion`, `Design`, and the standard-cost baseline record all still
generate their internal IDs via the ad-hoc `array.length+1` pattern rather than the collision-safe
`nextId()` mechanism already used by `Quotation`, `Project`, `Customer`, and `BOM` in the same chain.
See `ARCH-2026-002-DEPENDENCY-MAP.md` §2-3 for exact line citations.

**Decision needed:** should Wave 1's detailed implementation (i) migrate these 5 Sales/Estimation
functions onto `nextId()` as part of Wave 1 (low risk — additive, IDs are internal, not currently
GL/audit-facing document numbers) and (ii) migrate `approveQuotationDiscount`/`canSeeLead` onto the
`can()`/`checkSoD()` dispatcher (a real behavior-preserving refactor, not a new feature, but touches a
live, tested approval path and must be regression-proven identical before/after) — or should this be
deferred as its own narrowly-scoped follow-up CR, kept out of Wave 1's critical path?

**No recommendation given here** — both options are technically safe (neither invents policy or
duplicates an engine), so this is a sequencing/risk-appetite choice for whoever authorizes Wave 1's
detailed design, not a technical blocker to Phase 0 itself.

## 5. BOM sequencing vs. this CR's own stated chain order — NEW, surfaced by this Phase 0's fresh code audit

**Finding:** this CR's own §9/§17 states the Wave 1 priority chain as "Lead → Estimation Request →
Costing Version → **BOM** → Quotation → Approval → Project." The current codebase's `createBOM()`
requires an existing `DB.projects` record — i.e., BOM can only be created AFTER a project exists (after
Won), not between Costing Version and Quotation as the stated chain order implies. See
`ARCH-2026-002-DEPENDENCY-MAP.md` §4.

**Decision needed:** is the CR's stated chain order descriptive shorthand (BOM conceptually belongs in
the Estimation & Costing domain group, without asserting a strict pre-Quotation creation order), or does
Appletree actually want BOM creation possible pre-Quotation (a genuine, non-trivial schema/workflow
change to a currently project-scoped, tested entity)? Building a pre-Quotation BOM capability without
this being explicitly decided would risk inventing a scope change never actually requested.

**No recommendation given** — this is a business-process question (does Appletree's real estimation
workflow ever need a BOM before the deal is won?), not a technical one.

## 6. Bank Reconciliation duplicate-ownership — RECLASSIFIED 2026-09-23: CLOSED BY EVIDENCE

**RECLASSIFIED 2026-09-23** (`ARCH-2026-002-W3-DECISION-RESOLUTION.md` §3): Wave 1's own implementation,
delivered the day after this finding was originally recorded (2026-09-22, one day after this document's
2026-09-21 date), consolidated the two paths named below into one engine. Re-verified directly in
`server/domain.js` as of 2026-09-23: `importBankStatement()` (line 11174) calls `createBankImportBatch()`
internally; `matchBankStatementLine()` (line 11185) resolves against `DB.bankImportLines` (with a
`migratedFromLegacyId` fallback for pre-consolidation data) and delegates to `reconcileBankImportLine()`;
`bankReconciliationStatus()` (line 11215) reads exclusively from `DB.bankImportLines`. All three "legacy"
functions are now thin compatibility wrappers over the single `bankImportLines` engine — not a second,
independent engine. This finding is retained below, unmodified, as the historical record of what was true
on 2026-09-21; it no longer describes current behavior. No further action needed — this item does not
block anything and requires no management decision.

**Original finding (2026-09-21, preserved for history — no longer accurate as of 2026-09-22 onward):**
two fully independent, live-wired subsystems both match bank lines to GL entries: the
legacy `importBankStatement`/`matchBankStatementLine`/`bankReconciliationStatus` path over
`DB.bankStatementLines`, and the newer, ICICI-format-aware `createBankImportBatch`/
`matchBankImportLine`/`postBankImportLine`/`reconcileBankImportLine` path over `DB.bankImportLines`.
Both collections are seeded in `freshDB()`; both have live routes; neither supersedes or migrates data
from the other. See `ARCH-2026-002-TRANSACTION-OWNERSHIP.md` row 32 — this is the one real
duplicate-ownership conflict found across all 35 audited transaction types.

**Decision needed:** should one path be retired/deprecated in favor of the other (and if so, which —
the newer path has richer duplicate-detection and return-matching), or are both intentionally kept as
separate manual-entry vs. CSV-import front doors, formally documented as such rather than left
ambiguous? This is squarely a Wave 3 (Treasury) scoping question, not a Wave 1 one — recorded here so it
is not silently lost between now and Wave 3.

**No recommendation given** — this is a product-scope question about whether Appletree's own users ever
need the manual-entry fallback, not a technical one; both paths are individually correct and safe (both
converge on the same single GL engine).

## 7. Plan-to-Produce chain gaps — NEW, surfaced by the Process Trace audit

**Finding:** `ARCH-2026-002-PROCESS-TRACE.md` chain E found two real, narrow gaps: (a) no "Demand"
function triggers Production Order creation — `materialReplenishmentReport()` is a read-only
MRP-suggestion report, disconnected from `createProductionOrder()`, which remains purely manual; (b)
Job Card completion and Production Order completion are independent, uncoupled actions — the code's own
comment states Job Cards are "purely operational... does not post to the GL," and nothing in
`completeJobCard()` checks against `completeProductionOrder()`.

**Decision needed:** is (a) in scope for Wave 2 (Manufacturing) as part of closing Manufacturing's
existing PARTIAL classification (Routing/Work Centre), or is automated demand-to-production triggering
explicitly deferred to Wave 6 (Advanced Planning/MRP, domain #24)? Is (b) an intentional design (Job
Cards are genuinely operational-only, no GL tie) that should simply be documented as such, or a real
gap Appletree wants closed?

**No recommendation given** — (a) is a genuine wave-boundary question (this exact "MRP-suggestion
report exists but nothing is automated" finding is also recorded in
`ARCH-2026-002-DATA-MODEL-GAP-REGISTER.md` under domain #24); (b) is a business-process question about
whether job-card-level completion should gate order-level completion.

## 8. Reporting & Quality audit findings — NEW, surfaced by the Security Baseline audit

**Finding 1 (Reporting & Analytics, MODERATE):** `GET /api/reports/budget-variance` →
`projectBudgetVarianceReport(projectId)` has no `hasScopeAccess()` check — a ProjectManager can omit
`projectId` or supply another project's ID and see budget/commitment/actual/margin data for every
project company-wide. See `ARCH-2026-002-SECURITY-BASELINE.md` §3.1. Not CRITICAL (read-only, requires
an already-authenticated, already-role-checked session; no identity override) — does not trigger this
CR's stop condition, but is a genuine, currently-reproducible confidentiality gap.

**Finding 2 (Quality Management, LOW):** `createQCChecklist()` has no `logAudit()` call — only
`submitQCResult()` does, so checklist *creation* time/actor is not independently audited. See
`ARCH-2026-002-SECURITY-BASELINE.md` §3.2.

**Decision needed:** Finding 1 is recommended for inclusion in Wave 1 itself (it is a Wave-1-domain
finding, Reporting & Analytics, and the fix is a small, well-precedented `hasScopeAccess()` addition
matching the exact pattern ARCH-2026-001C-F already used elsewhere — see
`ARCH-2026-002-WAVE-1-DESIGN.md` §1 item 3 and §6). Finding 2 is lower priority and can be deferred to
whichever wave next substantively touches Quality Management (Wave 2), or fixed opportunistically
alongside Finding 1 since both are small, additive, audit/scope hygiene fixes with no business-policy
content — **neither invents policy, so this is a scheduling choice, not a business decision requiring
management input**, unlike items 1-3 and 6-7 above.

## 9. Summary table

| # | Item | Status | Blocks | New this Phase 0? |
|---|---|---|---|---|
| 1 | CEO / technical-admin split | **OPEN** | Final RBAC step only (explicitly out of this CR's scope) | No |
| 2 | Integration & Platform scope | **OPEN** | Domain #19 entirely (not on Wave 1-6 critical path) | No |
| 3 | Payroll statutory configuration | **OPEN** | Wave 5 Payroll design phase | No |
| 4 | Wave 1 RBAC/ID-numbering cleanup scope | **OPEN** | Whether Wave 1's detailed design includes this cleanup or defers it | **Yes** |
| 5 | BOM pre-Quotation sequencing | **OPEN** | Whether Wave 1's BOM design changes current creation-order behavior | **Yes** |
| 6 | Bank Reconciliation duplicate-ownership | **CLOSED BY EVIDENCE (2026-09-23)** | Nothing — resolved by Wave 1's own consolidation, see §6 | **Yes** |
| 7 | Plan-to-Produce Demand-trigger / Job-Card-decoupling | **OPEN** | Wave 2 Manufacturing scoping (or explicit deferral to Wave 6 MRP) | **Yes** |
| 8 | Reporting cross-project leak + QC audit-log gap | **OPEN (technical, low-risk)** | Recommended for Wave 1 itself (Finding 1) / Wave 2 (Finding 2) | **Yes** |

No implementation proceeds on any blocked item until the corresponding decision is made and recorded as
an update to this document. Items 4-5 and 8 are Wave-1-scoped; item 8 in particular carries no
business-policy content and can likely proceed on engineering judgment alone. Items 6-7 are Wave 2-3
scoped, recorded now so they are not lost. Items 1-3 remain out of scope for Wave 1 entirely.
