# APPLETREE ERP — PHASE 3
## Change Request Financial Policy Lock + Downstream Governance Design

**System:** `SAP_Architecture_Lab`. **Date:** 2026-09-07. **No code was changed this phase.** This is a policy-and-architecture-definition exercise per instruction — live re-verification and scenario reproduction only. Every implementation question in this report is answered as a design/options document for the next engineering phase, not as new code.

---

## A. Executive Summary

The Phase 2 Change Request implementation is confirmed intact and unregressed. The critical cancellation-after-billing scenario is reproduced exactly as the Phase 2 report described (`remainingCeiling = -₹50,000`), and two further scenarios not tested in Phase 2 — **partial billing** and **multiple cumulative CRs** — were run live this phase and reveal the precise shape of the underlying gap: **the system has no concept of a variation's revenue being "consumed" by a specific invoice, and no historical/per-CR earmarking at all.** It purely re-sums the CURRENT status of all Change Requests on every read. This is not a bug — it is an architecture that was never asked to do anything else, until now. Four policy options (A–D) are presented for management, none chosen. No protected baseline regressed. No STOP condition was triggered.

---

## B. Current Change Request Architecture (re-verified, unchanged since Phase 2)

Live-confirmed this phase, fresh CR creation returns all 22 expected fields with zero missing: `id, documentNo, projectId, description, reason, quotationId, supportingReference, costImpact, revenueImpact, scheduleImpactDays, status, createdBy, createdAt, submittedBy, submittedAt, approvedBy, approvedAt, rejectedBy, rejectedAt, rejectReason, cancelledBy, cancelledAt, cancellationReason`.

State machine, unchanged and confirmed still enforced:

```
Draft --submit--> Submitted --approve--> Approved --cancel--> Cancelled
                       |
                    reject
                       v
                   Rejected --revise--> Draft
```

`projectBillingCeiling(projectId)` — the single source of truth for the ceiling — computes, on every call, LIVE:

```
approvedVariationValue = SUM(revenueImpact) over changeRequests WHERE projectId = X AND status = 'Approved'
totalApprovedCeiling   = project.budget + approvedVariationValue
```

This is a **pure, stateless, current-status re-sum** — it has no memory of what was true at any past moment, no link from a posted invoice to the specific CR(s) that authorized it, and no concept of "consumed" vs. "available" variation value. This single fact is the root of every scenario in §C–§E below.

---

## C. Financial Cancellation Scenario (§2 — reproduced exactly, live)

| Step | Result |
|---|---|
| Project budget ₹5,00,000 | Confirmed |
| CR approved, revenueImpact ₹50,000 | Ceiling → **₹5,50,000** (confirmed) |
| Customer invoice ₹5,50,000 | **POSTED** successfully |
| CR cancelled | **Succeeds — no code blocks it** |
| `totalApprovedCeiling` after cancel | **₹5,00,000** |
| `billedToDate` after cancel | **₹5,50,000** (unchanged — the posted invoice is never touched) |
| `remainingCeiling` after cancel | **−₹50,000** |
| No GL entry posted by the cancellation itself | Confirmed (Trial Balance and journal-entry count unchanged by the cancel call) |
| Trial Balance | Balanced throughout |

**Classification: BUSINESS POLICY GAP, not a software defect.** The code did exactly what it was ever specified to do (sum Approved CRs); nothing has ever told it what SHOULD happen to a variation's ceiling contribution once real money has already moved against it.

---

## D. Policy Options (presented, not chosen)

### Option A — Cancellation prohibited after dependent billing
`cancelChangeRequest()` would need a new precondition: compute "billed against this variation's headroom" and refuse cancellation if that figure is nonzero. **This requires an answer to §E's open question below** — the system has NO way to compute "billed against THIS variation" specifically, only "billed against the PROJECT in total," because billing is never earmarked to a CR. Implementing Option A therefore requires first answering: does "billed against this variation" mean (a) any billing at all once cumulative billing exceeds the project's base budget, or (b) some new per-CR consumption ledger that does not exist today? Both are real, different designs with different implementation cost.

### Option B — Cancellation allowed, financial reversal required
Would need a NEW linked workflow (CR cancellation → mandatory invoice reversal/credit note) with GST, period, and approval treatment all separately defined by Finance before a single line of code is written. **Not implementable until every one of the 8 sub-questions in the brief's §3 Option B is answered** — none are answered today.

### Option C — Cancellation allowed, ceiling stays protected retroactively
Would require the ceiling calculation to distinguish "ceiling that authorized ALREADY-POSTED billing" (frozen, permanent) from "ceiling for FUTURE billing" (revocable by cancellation) — a genuinely different formula from today's flat re-sum, and a new concept ("cancelled-but-already-consumed") with its own audit requirements.

### Option D — Other
Not proposed by this phase; reserved for management.

**No option is recommended over another here** — each has a real, materially different accounting consequence, and choosing is explicitly out of scope for this phase.

---

## E. Management Decisions Required

| # | Decision | Blocks |
|---|---|---|
| 1 | Which of Options A/B/C/D governs cancellation-after-billing? | Any code change to `cancelChangeRequest()` |
| 2 | (§4) For PARTIAL billing specifically — live-reproduced this phase: cancelling a CR with ₹40,000 of its ₹1,00,000 already billed currently drops `totalApprovedCeiling` to ₹0 and leaves `remainingCeiling` at **−₹40,000** — i.e., today's actual behavior is closest to "the ENTIRE revenueImpact is revoked regardless of how much was billed," which matches NONE of the brief's 5 candidate answers (A–E) precisely — it is not "blocked," not "remaining frozen," not "entire amount reversed" (the invoice itself is untouched), and not "credit note required" (nothing forces one). This needs an explicit choice. | Same |
| 3 | (§5) Does the ceiling model need to move from **CURRENT-status aggregation** (what it is today, live-reproduced: cancelling the MIDDLE of three approved CRs simply removes its value from today's sum, with zero awareness of which CR "paid for" which invoice) to a **historical or hybrid** model? | Any redesign of `projectBillingCeiling()` |
| 4 | Does `costImpact` mean anything operationally today, or is it purely a report-line? (§6) | Any code touching cost/budget/costing |
| 5 | Execution-gate model (§F, Models 1–5) | BOM/MR/PR/PO/billing gating |
| 6 | Closure-gate policy (§G matrix) | `projectClosureReadiness()` |
| 7 | Quotation-revision policy (§H) | Any quotation-side CR integration |
| 8 | Approval-hierarchy / value-threshold policy (§K) | Any tiered/value-based approval |

---

## F. Execution-Gate Options (§7 of the brief)

| Model | Accounting effect | Audit effect | Operational impact | ERP complexity | Bypass risk |
|---|---|---|---|---|---|
| 1. Every incremental scope requires approved CR | Cleanest — every cost/revenue line traceable to an authorization | Strongest | Highest friction — could block legitimate fast-moving work | High — needs a gate on BOM, MR, PR, PO, billing, each correctly scoped to "incremental" vs. "baseline" | Low, if built correctly |
| 2. Only changes above a threshold require CR | Matches how PO/discount approval already works in this codebase (tiered) | Good | Moderate friction | Medium — reuses the existing threshold-tier pattern (`discountApprovalRules`) | Threshold itself becomes a target (structuring below it) |
| 3. Only scope/cost/revenue changes require CR (not schedule-only) | Good, narrower scope | Good | Low friction for schedule-only variations | Medium | Ambiguity in "what counts as scope" |
| 4. Execution may precede approval, reconciled later | Weakest control — money/material can move before authorization exists | Requires a NEW "unreconciled execution" report/queue that does not exist today | Lowest friction, matches how some real construction/interiors firms actually operate | High — needs a genuinely new reconciliation subsystem | High — "later" can mean "never" |
| 5. Baseline work proceeds freely; only VARIATION work requires CR | Matches this engine's actual data shape best (BOM already optionally tags `changeRequestId`; untagged BOM = baseline) | Good, if "variation work" is reliably distinguishable from "baseline" | Low friction for the common case | Medium — the hard part is defining "variation work" unambiguously at each of BOM/MR/PR/PO | Medium — someone could avoid tagging a BOM as variation-sourced to dodge the gate |

**No model is recommended** — each is a real, materially different operating philosophy for the business, not an engineering choice.

---

## G. Closure-Gate Options (§8 of the brief) — Policy Matrix

| Condition | Block closure? | Warning only? | Ignore? |
|---|---|---|---|
| Draft CR (never submitted) | — | — | **Candidate: Ignore** (no financial commitment exists yet) — BUSINESS DECISION REQUIRED |
| Submitted CR (pending decision) | **Candidate: Block or Warning** — a live, undecided commercial question | — | — | BUSINESS DECISION REQUIRED |
| Rejected CR | — | — | **Candidate: Ignore** (formally closed out, no live commitment) — BUSINESS DECISION REQUIRED |
| Approved CR, fully executed/billed | — | — | **Candidate: Ignore** — BUSINESS DECISION REQUIRED |
| Approved CR, NOT yet executed/billed | **Candidate: Block or Warning** — represents unbilled authorized revenue | — | — | BUSINESS DECISION REQUIRED |
| Cancelled CR | — | — | **Candidate: Ignore**, UNLESS §E.1 is unresolved for that specific CR (i.e. it was cancelled after partial billing with no reversal) — that case may need its own explicit closure condition | BUSINESS DECISION REQUIRED |
| Pending Site Return | Existing closure has no such check today | | | BUSINESS DECISION REQUIRED (carried over from Phase 2's own §H) |
| Open PO | Existing closure has no such check today | | | BUSINESS DECISION REQUIRED (carried over) |
| Pending Supplier Bill | Existing closure has no such check today | | | BUSINESS DECISION REQUIRED (carried over) |
| Unresolved variation billing (the §C scenario itself) | **Strong candidate for a hard block** — closing a project with a negative `remainingCeiling` on record is a real financial-control gap | | | BUSINESS DECISION REQUIRED, but flagged as the single most defensible candidate for "Block" in this table |
| Retention | Not modeled anywhere in this codebase yet (Phase 2's own §D.11, carried over) | | | BUSINESS DECISION REQUIRED |
| Warranty | `createWarranty()` exists but is never required by closure today (carried over) | | | BUSINESS DECISION REQUIRED |

**No condition has been implemented as a blocker.** `projectClosureReadiness()` is unchanged this phase, confirmed by inspection.

---

## H. Quotation / Costing / BOM Policy

**Quotation revision (§9):** Per instruction, no new "Quotation Revision" collection was invented, and none is proposed. The 4 candidate answers, evaluated against the EXISTING architecture (a revision = a new `DB.quotations` row, chained by `revision`/`previousRevisionId`):

- **(A) Create a new quotation revision** — structurally possible (the mechanism exists), but `reviseQuotation()` currently REFUSES to revise an `Accepted` quotation (the Won one) — so this would require either lifting that restriction specifically for post-Won variations (a real behavior change to a protected function) or building a parallel path. Not free.
- **(B) Reference the existing accepted quotation** — this is what Phase 2 already built (`CR.quotationId`, validated via `wonProjectId`). **This is the ALREADY-IMPLEMENTED, lowest-risk option**, and needs no further architecture work — only a policy decision on whether it should become MANDATORY rather than optional.
- **(C) Create a separate variation quotation** — would be a new, second commercial-document concept; explicitly the kind of "invent a new system" this phase is told not to do without explicit approval.
- **(D) Remain independent** — is today's default when `quotationId` is omitted.

**Recommendation deferred to management**: (B) is architecturally the path of least resistance since it is already built; (A) is the only other option that doesn't invent a new concept, but requires touching a protected function's own business rule.

**Costing Version (§10):** `costingVersions` deliberately still has NO `projectId` — not added this phase, per instruction ("do not add projectId merely for convenience"). The traceability chain `Quotation Revision → Costing Version → Change Request` IS already fully walkable without any new FK: `CR.quotationId → quotation.costingVersionId → DB.costingVersions`. **No new FK is required to make this chain explicit — it already is one, via the existing `quotationId` field.** If management wants a DIRECT `costingVersionId` on the CR record itself (bypassing the join), that duplicates information already reachable and was explicitly rejected as a design choice in Phase 2 for exactly that reason — reconfirmed here, not changed.

**BOM (§11):** Current: `BOM.changeRequestId` optional, validated (CR must exist, be Approved, same project). Six open policy questions, none decided:
1. Should EVERY variation-driven BOM require a CR? (Currently: no, it's optional even for variation-driven ones — nothing distinguishes "variation BOM created without tagging" from "baseline BOM.")
2. Should only INCREMENTAL BOM lines require CR, with a baseline BOM remaining untagged? (Not supported today — a BOM is tagged as a whole, not per-line.)
3. Should baseline BOM remain fully independent of CR? (Yes today, by default — untagged is the default and unaffected.)
4. Must a variation BOM be a NEW version (not an edit)? (Already true structurally — BOM has no "edit," only new-version-plus-supersession, unchanged this phase.)
5. May multiple BOMs reference the SAME CR? (Yes today — no uniqueness constraint exists on `BOM.changeRequestId`, confirmed by the data model; not tested live this phase since it requires no new code — it already works this way.)
6. May one CR generate multiple BOMs? (Same answer — yes, structurally already possible.)

---

## I. Procurement Policy (§12)

`requirePRForPO` **NOT touched this phase**, per explicit instruction. The chain `CR → Material Requirement → PR → RFQ → Comparison → PO` exists structurally in this codebase's collections but has **zero mandatory linkage enforced anywhere today** (Material Requirement has no `changeRequestId`; PR/RFQ/Comparison have no CR linkage of any kind — none was added this phase, since none was authorized). Whether PR/RFQ/Comparison should be mandatory for variation-driven procurement, and whether thresholds or emergency/petty-procurement exemptions apply, is entirely open — BUSINESS DECISION REQUIRED across the board, no default assumed.

---

## J. Billing Traceability Policy (§13)

**Recommendation (design opinion, not implemented): do NOT add `changeRequestId` directly to Customer Invoice as a new FK.** Reasoning, following the brief's own "avoid redundant FKs unless they materially improve auditability and cannot drift" instruction:

- Today, an auditor asking "which approved variation authorized this incremental billing?" can already answer it **indirectly**: `projectBillingCeiling(projectId)` shows the CURRENT total approved variation value, and `DB.changeRequests.filter(projectId, status='Approved')` lists which CRs are contributing right now.
- What an auditor CANNOT do today — live-proven this phase (§D/§E) — is answer "which SPECIFIC rupee of THIS SPECIFIC invoice came from THIS SPECIFIC CR," because billing has never been earmarked to a CR at posting time, only checked against an aggregate ceiling.
- Adding a bare `changeRequestId` field to a Customer Invoice would NOT actually solve this without also deciding HOW an invoice gets attributed to a CR (proportionally? first-approved-first-consumed? user-selected at invoice-creation time?) — that allocation policy is itself a new, undecided business rule, not a data-model gap.
- **The real fix, if wanted, is upstream**: at draft-invoice-creation time, let the user OPTIONALLY select which Approved CR(s) this specific invoice is drawing against (mirroring how `excessBillingApprovalId` already lets a draft reference a specific authorization), and track consumption per-CR from that point forward. This is a genuine, non-trivial feature — not a one-field addition — correctly deferred to the next engineering phase, not built here.

---

## K. Security / SoD Policy (§15)

| Action | Current role gate | Value-based tiering? |
|---|---|---|
| Create | `can(actor,'create')` (broad) | No — BUSINESS DECISION REQUIRED if wanted |
| Submit | `can(actor,'submit')` (broad) | No |
| Review | N/A — no distinct review step exists (Phase 2 design decision, reconfirmed) | N/A |
| Approve | Admin/CEO/FinanceManager, creator excluded (SoD) | No — a ₹500 variation and a ₹50,00,000 variation are approved by the identical tier today |
| Reject | Admin/CEO/FinanceManager | No |
| Revise | `can(actor,'edit')` (broad) | No |
| Cancel | Admin/CEO/FinanceManager, no creator-exclusion (documented Phase 2 choice) | No |
| Execute | N/A — no execution step is gated to CR status at all (§F) | N/A |
| Bill | Unrelated to CR role model — governed by the pre-existing AR/billing role tiers | N/A |

**No threshold is invented here.** If management wants value-based escalation (e.g., CEO-only above ₹X), the threshold, the escalation role, and whether it stacks with or replaces the existing Admin/CEO/FinanceManager tier are all open — matching the brief's explicit "do not invent thresholds."

---

## L. Audit Requirements (§17 — already fully met, confirmed live this phase, unchanged)

Every one of the 10 listed events (Created/Submitted/Rejected/Revised/Approved/Cancelled) already carries actor (`userId`), role, timestamp (`at`), project (`projectId`), document (`changeRequestId`), and reason where applicable, via `logAudit()`. **"Executed," "Linked to BOM," "Linked to procurement," "Linked to billing" are not yet events at all** — because no execution/procurement/billing linkage exists to log (§F/§I/§J are all undecided or unbuilt). Once any of those are built, they must emit their own typed audit event following the exact same shape — this is a specification for the next phase, not a gap in what exists today.

---

## M. Implementation Readiness Matrix

| Control | Existing | Policy Required | Ready to Build | Blocker |
|---|---|---|---|---|
| CR cancellation (general) | Yes | Yes | No | §E.1 |
| Billing ceiling after cancellation | Partially (current-sum only) | Yes | No | §E.1, §E.3 |
| Partial billing on cancellation | No special handling | Yes | No | §E.2 |
| Cost impact effect | None wired | Yes | No | §E.4 |
| Execution gate (BOM/MR/PR/PO/billing) | None | Yes | No | §F |
| BOM linkage | **Yes, built Phase 2** | No (optional tagging works today) | **Already built** | None — this is DONE |
| Procurement linkage | None | Yes | No | §I |
| Billing linkage (per-invoice CR attribution) | None | Yes | No | §J |
| Closure gate | None | Yes | No | §G |
| Quotation revision policy | Structurally possible (Option B already live) | Yes (mandatory or optional?) | Partially — Option B needs no new code | §H |
| Costing version chain | Already walkable via existing FK | No new FK needed | **Already sufficient** | None |
| Approval hierarchy | Existing flat tier | Yes, if tiering wanted | No | §K |
| Value thresholds | None | Yes | No | §K |

---

## N. Risks

| Risk | Severity | Status |
|---|---|---|
| A project can be closed today with a negative `remainingCeiling` on record (the §C/§D scenario, unresolved) — closure has no check for this | Real, live-provable | Open, disclosed §G |
| Partial-billing cancellation currently revokes the ENTIRE variation authorization, not just the unbilled remainder — an asymmetric, undecided outcome | Real, live-provable | Open, disclosed §E.2 |
| Multiple-CR cumulative billing has no per-CR earmarking — cancelling any one of several approved CRs can never be proven to correspond to any specific invoice | Real, live-provable | Open, disclosed §E.3 |
| No execution gate exists at all — a BOM/PO/bill can proceed with zero relationship to variation approval | Disclosed since Phase 2, reconfirmed | Open, disclosed §F |

---

## O. Protected Regression Results

All spot-checked live this phase, zero regressions:

| Baseline | Result |
|---|---|
| Approved CR increases ceiling | **PASS** |
| Submitted CR does not increase ceiling | **PASS** |
| Cancelled CR removed from Approved-sum | **PASS** |
| Already-posted billing remains posted after cancellation | **PASS** |
| No GL posted by create/approve/cancel of a CR | **PASS** — journal-entry count and Trial Balance identical before/after the cancel call |
| Trial Balance balanced | **PASS — Debit ₹1,23,46,985.07 = Credit ₹1,23,46,985.07, difference 0.000000** |
| CR cancel idempotency | **PASS** — duplicate cancel with the same idempotency key correctly deduplicated |
| CR cross-project quotation linkage still blocked | **PASS** |
| CR creator/approver SoD | Unchanged, not re-attacked this phase (zero code touched it) |
| P0-1/P0-3/P0-4, Site Return, Fixed Asset Transfer, Job Work Fee | Unchanged, not re-attacked this phase (zero code touched any of them — this was a documentation-only phase) |

**No STOP condition (§22) was triggered.**

---

## P. Exact Recommended Next Engineering Phase

Once management has resolved §E (at minimum items 1–3, the financial-cancellation core), the next engineering phase should implement, in this order:

1. **§E.1–2 resolution** — whichever of Options A/B/C/D is chosen, applied to `cancelChangeRequest()`, with the partial-billing sub-case (§E.2) resolved identically or explicitly differently.
2. **§E.3 resolution, if a historical/hybrid ceiling model is chosen** — a redesign of `projectBillingCeiling()`'s aggregation, which is a materially larger change than #1 and should be scoped separately.
3. **§J, if per-invoice CR attribution is wanted** — a genuinely new feature (optional CR selection at draft-invoice time + consumption tracking), not a one-field addition.
4. **§F (execution gate) and §G (closure gate)** — only after #1–3 exist, since both depend on knowing exactly what "an approved, unconsumed variation" means once §E is resolved.
5. **§I (procurement linkage) and §K (value-threshold approval)** — lowest priority, no live financial inconsistency currently traces to either.

Do NOT begin any of the above until the corresponding §E item is explicitly decided — building against a guess would have to be redone.

---

## Q. GO / GO WITH CONDITIONS / NO-GO

## GO WITH CONDITIONS

No code was changed this phase. No protected baseline regressed (§O). No STOP condition was triggered (§22). The critical cancellation-after-billing scenario is now fully characterized with live evidence for the general case (§C), the partial-billing case (§4/§E.2), and the multiple-CR cumulative case (§5/§E.3) — all three were previously only partially understood (§C alone, from Phase 2). **Condition for the next phase to proceed: management must resolve §E items 1–3 before any downstream governance code is written.** This report is the precise decision matrix requested — the next engineering session can proceed unambiguously once those decisions land, with no further broad audit needed first.
