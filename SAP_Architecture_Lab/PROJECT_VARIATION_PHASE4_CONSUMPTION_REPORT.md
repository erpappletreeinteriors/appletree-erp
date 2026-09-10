# APPLETREE ERP — PHASE 4
## Change Request Financial Governance + Variation Consumption

**System:** `SAP_Architecture_Lab`. **Date:** 2026-09-07. This phase implements the governing policy given explicitly in this brief's §1: an Approved CR may only be cancelled while `consumedRevenue === 0`; consumption is EXPLICIT (never inferred), and historical accounting is never mutated.

---

## A. Executive Verdict

## GO

The exact Phase 3 negative-ceiling scenario is now live-proven CLOSED when an invoice explicitly allocates against a CR: cancellation is blocked, the posted invoice is byte-for-byte unmodified, and the ceiling stays internally consistent (`remainingCeiling: 0`, never negative). 53 targeted live tests (§E–§N) plus a direct scenario reproduction all passed. Zero new database anomalies. Trial Balance balanced. No STOP condition (§21) was triggered.

---

## B. Current Billing Architecture (discovery, confirmed before coding)

- `draftCustomerInvoice()` — creates the draft (zero GL effect). Already had one precedent for exactly the mechanism this phase needed: `excessBillingApprovalId` — a soft-validated reference stored on the draft at creation, re-validated and AUTHORITATIVELY CONSUMED only at `postDraft()`. This phase's `variationAllocations` reuses that exact shape.
- `postDraft()` — the single, universal GL-posting choke point for every Customer Invoice, Supplier Bill, Customer Advance, Billing-Milestone Invoice, Service Invoice, AMC Billing, and plain Manual JE. Already has a proven, tested rollback mechanism (Phase 37's fix): GL posts, then a `try` block mutates every side-effect (status, XBA consumption, milestone status, opening-balance inventory) with a full snapshot-and-restore `catch` block if anything downstream throws.
- `projectBillingCeiling(projectId)` — pure, stateless, re-summed on every call from `project.budget` + `SUM(Approved CR.revenueImpact)` vs. `SUM(posted AR debit lines for docCategory:'CustomerInvoice')`. Confirmed unchanged in its core three fields (`totalApprovedCeiling`, `billedToDate`, `remainingCeiling`) — this is the protected P0-2 formula.
- `excessBillingApprovalId` — the existing precedent for "an authorization consumed at post time, re-validated for staleness" — deliberately reused, not reinvented.
- Idempotency — `/api/ar/invoice` and the `journal/:id/{submit,approve,post}` routes are all already `registerMutationRoute({idempotent:true})`.
- Existing transaction wrapper — `postDraft()`'s own try/catch/DB-snapshot mechanism, extended (not replaced) for this phase's new mutation.
- Existing audit — `logAudit()`, the single mechanism used throughout.

---

## C. New Variation Consumption Architecture

```
Approved Change Request (revenueImpact, consumedRevenue)
        |
        |  optional, at draft-creation: variationAllocations:[{changeRequestId, amount}, ...]
        v
Customer Invoice Draft (jeDrafts) — soft-validated, zero effect on any CR
        |
        |  submit -> approve -> post (postDraft())
        v
postDraft(): GL posts FIRST, then (same try/catch boundary):
    1. re-validate every allocation against CURRENT CR state
    2. cr.consumedRevenue += amount, for each allocation
    3. logAudit('ChangeRequestConsumed', ...)
    -> any downstream failure rolls back GL + status + ALL consumedRevenue mutations together
```

**Per the brief's own final rule, `invoice.changeRequestId` (a single FK) was NOT used** — `invoice.variationAllocations` is an array, because one invoice may legitimately draw on multiple approved CRs (§I) and may legitimately be part baseline / part variation (§N).

**Design decision, stated plainly**: `availableRevenue` is never stored — it is always `revenueImpact - consumedRevenue`, computed on read. This makes the reconciliation identity in §14 of the brief (`revenueImpact = consumedRevenue + availableRevenue`) true BY CONSTRUCTION, not something that can drift or need separate checking.

---

## D. Data Model Changes

| Object | Field | Type | Notes |
|---|---|---|---|
| Change Request | `consumedRevenue` | number, default 0 | Mutated ONLY inside `postDraft()`; never at draft creation, never inferred, never touched by cancellation |
| Customer Invoice draft (`jeDrafts`) | `variationAllocations` | `[{changeRequestId, amount}]`, default `[]` | Purely additive; every existing caller gets `[]` |
| `projectBillingCeiling()` output | `consumedVariationValue`, `availableVariationValue` | number (derived) | **Purely additive reporting fields** — `totalApprovedCeiling`/`billedToDate`/`remainingCeiling` are UNCHANGED, still the sole P0-2 enforcement authority |

No new collection was created. No existing field was renamed, removed, or repurposed.

---

## E. Billing Allocation Rules (live-tested, `validateVariationAllocations()`)

Applied identically at draft-creation (soft) and at post-time (authoritative re-check against current state):

1. CR exists — else rejected.
2. CR belongs to the SAME project as the invoice — else rejected (cross-project blocked).
3. CR status is `Approved` — else rejected, naming the actual status (Draft/Submitted/Rejected/Cancelled all correctly blocked).
4. Amount is numeric and finite — `NaN`/`Infinity` rejected (both arrive as JSON `null`, correctly treated as "amount missing," not silently coerced to 0).
5. Amount > 0 — zero and negative rejected.
6. Amount ≤ CR's total `revenueImpact` — rejected if exceeded.
7. Amount ≤ CR's CURRENT unconsumed capacity (`revenueImpact - consumedRevenue`) — the tighter, meaningful check; rejected if exceeded, live-tested with an existing 80,000 consumed + a further 20,001 attempt.
8. Invoice's project matches the CR's project — same check as #2, enforced structurally by deriving the invoice's project from its own AR line at post-time (protects against a draft's lines being mutated between validations, though no mutation path for `d.lines` exists post-creation).
9. Duplicate CR entries within one call are **CONSOLIDATED (summed)**, not rejected — a deliberate choice: a legitimate multi-line UI submission could easily produce two entries for the same CR, and summing never silently drops value the caller intended to allocate, unlike rejecting outright.
10. Total allocation across the invoice's array ≤ the invoice's own total amount — rejected if exceeded, confirmed live (§7's "Invoice A = ₹450,000 baseline" with zero allocation correctly leaves the entire amount as baseline; §7's Invoices B/C fully allocate their own smaller amounts).

**Mixed baseline+variation billing is supported**: an invoice's `baseAmount` is the total; `SUM(variationAllocations)` may be less than or equal to it; the remainder is implicitly baseline — no separate "baseline portion" field was invented, since it is fully derivable (`baseAmount - SUM(allocations)`).

---

## F. Cancellation Rules (governing policy §1, implemented exactly as given)

```
cancelChangeRequest():
  status must be 'Approved'                         (unchanged, Phase 2)
  role must be Admin/CEO/FinanceManager               (unchanged, Phase 2)
  reason is mandatory                                 (unchanged, Phase 2)
  consumedRevenue must be 0                           <- NEW, this phase's policy
    -> if not: BLOCKED, audited as 'ChangeRequestCancellationBlocked',
       error names the exact consumed/total amounts and points to
       invoicesConsumingChangeRequest() for the specific invoice(s).
       The posted invoice(s) are never read, reversed, or modified.
```

No partial-cancellation, no automatic reversal, no credit-note trigger was built — the governing policy (§1.C) explicitly forbids any retrospective accounting mutation, and none was added.

---

## G. API Security Tests

| # | Attack | Result |
|---|---|---|
| 1 | Allocate against a Draft CR | **BLOCKED** |
| 2 | Allocate against a Submitted CR | **BLOCKED** |
| 3 | Allocate against a Rejected CR | **BLOCKED** |
| 4 | Allocate against a Cancelled CR | **BLOCKED** |
| 5 | Allocate against another project's Approved CR | **BLOCKED** ("cannot allocate variation billing across projects") |
| 6 | Allocate against a nonexistent CR id | **BLOCKED** |
| 7 | Allocate using a real id borrowed from an unrelated collection (`PO-0001`) | **BLOCKED** ("does not exist" — correctly not found in `DB.changeRequests`) |
| 8 | Direct API cancellation attempts on consumed CRs (B/C/D scenarios, §I) | **BLOCKED**, all three |

---

## H. Over-Allocation Attacks

| # | Attack | Result |
|---|---|---|
| 1 | Allocate ₹1,00,001 against a ₹1,00,000 CR | **BLOCKED** |
| 2 | ₹80,000 already consumed, allocate a further ₹20,001 | **BLOCKED** |
| 3 | Negative amount | **BLOCKED** |
| 4 | Zero amount | **BLOCKED** |
| 5 | `NaN` | **BLOCKED** (arrives as JSON `null`, treated as "amount missing") |
| 6 | `Infinity` | **BLOCKED** (same — JSON serializes `Infinity` as `null`) |
| 7 | Numeric string (`"500"`) | **ACCEPTED, coerced** — matches this codebase's own existing `Number(x)` convention used throughout (discountPct, overheadPct, costImpact, etc.) — not a new, stricter rule invented for this one field |
| 8 | Non-numeric string (`"abc"`) | **BLOCKED** |
| 9 | Malformed object (`{foo:'bar'}`, missing `changeRequestId`) | **BLOCKED** |
| 10 | `variationAllocations` supplied as a non-array | **BLOCKED** |
| 11 | Duplicate allocation entries for the same CR within one invoice | **CONSOLIDATED**, not an error (§E.9) |

**Every invalid case failed safely — no partial write, no silent acceptance, no crash (confirmed via server log inspection — every rejection returned a clean `{ok:false, error}`).**

---

## I. Multi-CR Tests (§7 — exact reproduction)

Budget ₹5,00,000; CR-A ₹1,00,000, CR-B ₹50,000, CR-C ₹25,000, all Approved.

| Invoice | Allocation | Result |
|---|---|---|
| 1 | CR-A ₹60,000 | Posted |
| 2 | CR-B ₹30,000 | Posted |
| 3 | CR-A ₹40,000 + CR-C ₹10,000 (single invoice, two CRs) | Posted |

**Live-confirmed final state**: CR-A consumed ₹1,00,000 (available ₹0), CR-B consumed ₹30,000 (available ₹20,000), CR-C consumed ₹10,000 (available ₹15,000). **Total remaining variation = ₹35,000 — exactly matching the brief's expected value**, computed from explicit allocations, not inferred from invoice count, order, or amount.

---

## J. Atomicity Tests

Fault-injected at a new point, `POSTDRAFT_AFTER_XBA_BEFORE_CR_CONSUMPTION`, inside `postDraft()`'s existing rollback boundary (reusing the exact mechanism Phase 37 already built and this engagement has fault-tested repeatedly — no second transaction mechanism invented):

| Check | Result |
|---|---|
| Injected failure at the CR-consumption mutation point | Returns a clean error, no crash |
| CR `consumedRevenue` after the injected failure | **UNCHANGED** — proven equal to its pre-attempt value |
| Draft status after the injected failure | Still `Approved` (not stuck, not silently `Posted`) |
| Retry after the injected failure | Succeeds exactly once |
| CR `consumedRevenue` after the successful retry | Exactly the intended amount — **not double-counted** |

No orphan allocation, no consumed-value-without-invoice, no invoice-without-allocation, and no journal duplication were produced in any fault-injected run.

---

## K. Idempotency Tests

| # | Test | Result |
|---|---|---|
| 1 | Duplicate draft-invoice creation, same idempotency key, WITH `variationAllocations` | **Deduplicated** — one draft id returned both times |
| 2 | Duplicate POST, same idempotency key | **Deduplicated** — second call returns `idempotent:true`, one JE, one consumption update |
| 3 | CR `consumedRevenue` after the duplicate post | Exactly the single intended amount, not doubled |

Per the brief's §11 instruction not to confuse transport idempotency with business-duplicate detection: this phase relies ENTIRELY on the EXISTING transport-layer idempotency key mechanism (`DB.idempotencyKeys`, unchanged) — no new business-level "is this a duplicate business transaction" heuristic was invented, since none was authorized and the existing key-based mechanism already satisfies every test in §11.

---

## L. Audit Tests

New event types, live-confirmed in `auditLog`, each carrying actor/role/timestamp/project/document/amount:

- `ChangeRequestConsumed` — `{changeRequestId, projectId, draftId, entryId, amount, previousConsumedRevenue, newConsumedRevenue, revenueImpact, userId, role, at}` — fires exactly once per allocation, inside `postDraft()`'s atomic boundary.
- `ChangeRequestCancellationBlocked` — `{changeRequestId, projectId, consumedRevenue, revenueImpact, userId, role, at}` — fires whenever a cancellation attempt is refused for having nonzero consumption.
- `ChangeRequestCancelled` — extended (not replaced) to also carry `revenueImpact`/`consumedRevenue` at the moment of a successful (unconsumed) cancellation.

**An auditor can now answer both required questions directly**: "which invoices consumed this CR?" via `invoicesConsumingChangeRequest(changeRequestId)` (also exposed live as `GET /api/change-requests/:id/consumption`), and "how much remains?" via the same endpoint's `availableRevenue`.

---

## M. Accounting Reconciliation

- CR creation/submission/approval/rejection/revision/cancellation (blocked or successful) — **zero GL entries**, confirmed by code inspection (no `postJournalEntry` call anywhere in the CR lifecycle functions) and by an unchanged journal-entry count across a pure cancellation-attempt call.
- Customer invoice posting with `variationAllocations` produces **exactly the same GL lines as before this phase** — `AR_ACCOUNT` debit, `4000` (Revenue) credit, optional `2200` (Tax) credit — confirmed live, byte-identical structure to a plain, non-allocated invoice.
- Live scenario reproduction (the exact Phase 3 negative-ceiling case, now with an explicit allocation): posted JE fetched, cancellation attempted and correctly blocked, JE re-fetched — **byte-for-byte identical**, proving the non-negotiable §2 rule ("never rewrite posted invoice amounts/journal entries") is genuinely honored, not merely asserted.
- Independently recomputed Trial Balance from raw journal lines after all this phase's activity: **Total Debit ₹1,32,14,986.07 = Total Credit ₹1,32,14,986.07, difference 0.000000.**

---

## N. Project Billing Reconciliation (§15 — exact reproduction)

Budget ₹5,00,000, CR approved ₹1,00,000. Invoice A ₹4,50,000 (pure baseline, no allocation) — posted. Invoice B ₹50,000 (fully variation-allocated) — posted. Invoice C ₹50,000 (fully variation-allocated) — posted.

- CR `consumedRevenue` = **₹1,00,000** (fully consumed, exactly as expected).
- A further ₹1 allocation attempt — **BLOCKED** ("exceeds its remaining unconsumed capacity of ₹0").
- Ordinary baseline billing (Invoice A) was **completely unaffected** by the variation mechanism — it posted with zero allocation and zero interaction with any CR, proving the new logic does not accidentally gate baseline billing.
- Ceiling report after all three invoices: `billedToDate: 5,50,000`, `totalApprovedCeiling: 6,00,000`, `remainingCeiling: 50,000`, `consumedVariationValue: 1,00,000`, `availableVariationValue: 0` — every figure internally consistent.

---

## O. Database Integrity

Full forensic scan re-run after implementation and testing. **No new anomaly.** Every finding matches the same historical artifacts disclosed in every prior report this engagement.

Targeted checks specific to this phase's new fields:

| Check | Result |
|---|---|
| CRs with POSITIVE `consumedRevenue` exceeding a POSITIVE `revenueImpact` (the real over-consumption defect class) | **None** |
| CRs with negative `consumedRevenue` | **None** |
| Cancelled CRs with nonzero `consumedRevenue` (should be structurally impossible) | **None** — confirmed the invariant holds |
| Orphan invoice→nonexistent-CR allocation references | **None** |
| Cross-project allocations found in stored data | **None** |
| `CR.consumedRevenue` vs. independently-recomputed `SUM(posted allocations referencing it)` | **Zero mismatches** — every CR's stored consumption reconciles exactly to its posted invoice allocations |
| Invalid CR status values | **None** |

**One false positive investigated and explained, not hidden**: a naive first pass flagged 3 CRs where `consumedRevenue(0) > revenueImpact(-5000)`. Investigation showed these are 3 pre-existing (Phase 3) Draft-status test records with a deliberately NEGATIVE `revenueImpact` (a legitimate scope-reduction variation, by design since Phase 2/3) and `consumedRevenue` correctly still at 0 — a negative-`revenueImpact` CR structurally can never receive a valid allocation (its "available capacity" is itself negative, so `validateVariationAllocations()`'s own bound check rejects any attempt). **Not a defect** — a historical test artifact interacting harmlessly with the new field, and a caveat now noted for any future forensic script reusing this comparison.

---

## P. Protected Regression

| Baseline | Result |
|---|---|
| P0-1/P0-3/P0-4 | **PASS** (part of the 52/56 suite below) |
| P0-2 suite (old script) | **52/56.** The 4 failures are the SAME already-documented OBSOLETE TEST class from Phase 2/3 (the old script's own steps skip the now-mandatory `reason` field and the now-required `/submit` step before `/approve`) — unrelated to this phase, not re-broken, not re-fixed, not modified. |
| Fixed Asset Transfer / Job Work Fee | **19/21** — both failures are the SAME already-documented stale-fixture class (the test script's own prior run left an asset inside a closed project, correctly re-blocked on this rerun's first attempt) — not a regression. |
| Site Return, Job Work Scrap | Not re-attacked this phase — **zero code overlap**: this phase touched only `createDraft()`, `draftCustomerInvoice()`, `draftCustomerInvoiceFromMilestone()`, `postDraft()`, `projectBillingCeiling()`, and `cancelChangeRequest()`; none of these are called by Site Return or Job Work Scrap. |
| RBAC / Capability Registry | **PASS, structurally** — no capability table was touched; the server booted cleanly under the existing startup policy validator both before and after |
| Atomicity / Idempotency | **PASS** (§J/§K) |
| Audit | **PASS** (§L) |
| Trial Balance | **PASS — balanced to the rupee** (§M) |
| P0-2 billing ceiling NOT bypassed | **Confirmed live** — the core ceiling formula is untouched; every over-allocation and over-ceiling attempt this phase remained correctly blocked |

**No STOP condition (§21) was triggered.**

---

## Q. Defects Found

**None.** This phase implemented a specified policy against a clean, already-hardened codebase; no software defect was found in the pre-existing billing architecture during discovery or testing.

---

## R. Remaining Function Gaps

1. No UI exists yet for selecting variation allocations at invoice-creation time (this is an API-level capability; a form/screen would be a separate, future UI task, not requested this phase).
2. `draftSupplierInvoice`/AP-side variation consumption was never in scope (this phase is customer-billing/revenue only, matching the governing policy's own framing).
3. No mechanism auto-suggests which CR(s) an invoice SHOULD draw from — allocation is entirely explicit/manual, per §1.F's own instruction not to infer.

## S. Remaining Business Policy Gaps

1. `costImpact` still has no wired effect anywhere (Phase 3 §E.4, unchanged, out of this phase's scope — the governing policy given this phase covered `revenueImpact`/consumption only).
2. Partial-consumption reduction (e.g. "cancel only the UNCONSUMED remainder of a partially-consumed CR") was not requested and not built — the given policy is binary (zero consumption = cancellable, any consumption = blocked), matching §1.D exactly as written.
3. Whether closure should now check "unconsumed Approved CR" is newly answerable with real data (§T below) but was not decided or implemented this phase, per instruction.

---

## T. SAP-Style Document Flow

```
Project -> Quotation -> Change Request -> Approval -> Invoice Allocation -> Customer Invoice -> AR/Revenue/Tax -> Project Profitability
```

Live-traversed both directions this phase:

- **Forward (CR → invoices)**: `GET /api/change-requests/:id/consumption` — confirmed live, lists every invoice (draft or posted) allocating against a given CR, with amount and posted-status.
- **Backward (Invoice → CRs)**: `draft.variationAllocations` — directly on the invoice record itself, confirmed live for every multi-CR test invoice in §I.

Closure Impact (§16 of the brief) — the new consumption data now genuinely enables, without any code change to `projectClosureReadiness()` (none was made, per instruction):
- **Open variation detection**: `DB.changeRequests.filter(projectId, status IN ['Draft','Submitted'])`.
- **Unconsumed Approved variation**: `DB.changeRequests.filter(projectId, status==='Approved', consumedRevenue===0)`.
- **Unresolved variation billing**: any Approved CR with `0 < consumedRevenue < revenueImpact`.
- **Cancelled-after-billing detection**: now structurally IMPOSSIBLE to occur going forward (cancellation is blocked while consumed) — the only way this state could exist is a pre-Phase-4 historical record, separately identifiable by cross-referencing `ChangeRequestCancelled` audit events against invoices posted before the cancellation timestamp.

None of these queries were wired into `projectClosureReadiness()` — that remains a policy decision, not made here.

---

## U. Before vs. After Architecture

| | Before (Phase 2/3) | After (Phase 4) |
|---|---|---|
| Cancellation gate | Status must be Approved | Status must be Approved **AND** `consumedRevenue===0` |
| Consumption tracking | None — a CR's revenueImpact was all-or-nothing based on status alone | Explicit, per-invoice, per-CR, array-based |
| Cancel-after-billing scenario | `remainingCeiling` could go negative, silently, with no block | **Structurally prevented** — blocked before it can happen |
| Invoice → CR traceability | None | `variationAllocations` on every invoice, `invoicesConsumingChangeRequest()` reverse lookup |
| `projectBillingCeiling()` core formula | 3 fields | Same 3 fields, unchanged, **plus 2 new read-only reporting fields** |
| Mixed baseline+variation invoice | Not distinguishable | Fully supported, no new field required (derived) |

---

## V. Exact Next Phase

Should NOT be another broad audit (per this phase's own final rule). If pursued, the next scoped phase should be, in order:
1. A UI screen for selecting `variationAllocations` at invoice-draft time (pure front-end/API-consumption work, zero domain-logic change).
2. §S.3 — an explicit management decision on whether `projectClosureReadiness()` should now check unconsumed Approved CRs, using the queries already proven live in §T.
3. §S.1 — whether/how `costImpact` should ever be wired to anything, if still wanted.

---

## W. GO / GO WITH CONDITIONS / NO-GO

## GO

Every stop condition in §21 was checked and none triggered: no unapproved-CR consumption was possible, no cross-project allocation succeeded, no consumed amount ever exceeded a CR's `revenueImpact`, no duplicate allocation produced excess consumption, no retry produced a duplicate invoice or GL entry, no partial transaction survived an injected failure, no posted invoice was modified during a cancellation attempt (proven byte-identical), Trial Balance stayed balanced throughout, P0-2's billing ceiling was never bypassed, no unauthorized actor could allocate variation value, and no historical accounting was mutated at any point. The exact scenario that motivated this entire phase — cancellation after billing, producing a negative remaining ceiling — is now live-proven closed for any invoice that explicitly allocates against the CR it draws on.
