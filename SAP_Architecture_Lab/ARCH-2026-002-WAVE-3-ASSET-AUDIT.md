# ARCH-2026-002 — Wave 3 Asset Management Audit

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §18. Includes a **documentation-vs-code discrepancy**
that this CR's own §2 requires be reported, not silently resolved — see §2 below.

## 1. Fixed Asset SoD — re-confirmed still absent (unchanged open item)

`createFixedAsset()` (domain.js:9715) has no `assertCan*` call at all beyond the route-level
`permission:'create'` gate. `capitalizeFixedAsset()` (9735) gates only via
`assertCanCapitalizeFixedAsset(actor)` → `can(actor,'post')` (domain.js:5894) — a pure role-capability
check with **zero comparison of `actor.id` to `asset.createdBy`**. `transferFixedAsset()` (9826) and
`disposeFixedAsset()` (9876) show the identical pattern — role-only gates, no identity check anywhere in
the chain.

This contrasts directly with the established pattern used everywhere else in this codebase for the same
class of risk (PO approval, BOM, Change Request, Design, Dispatch, Excess Billing/Material Issue all use
`createdBy===actor.id && !['CEO','Admin'].includes(...)`-style checks). `ROLE_ACTIONS` confirms this is a
live, exploitable gap: FinanceManager, Admin, and CEO all hold both `create:true` and `post:true`
simultaneously — a single FinanceManager can register AND capitalize the same asset alone.

**Verdict: unchanged from the prior 46-phase forensic audit's own disclosed, open policy decision —
still factually present in the code today, not newly discovered, not a regression.**

## 2. Account 1400 sharing — DOCUMENTATION-VS-CODE DISCREPANCY FOUND, reported per this CR's own §2

**The prior audit (`FINAL_AUDIT_COMPLETION_AND_CERTIFICATION_FREEZE.md`, lines 84, 154, 291-292, 347)
states**: *"Account 1400 is shared between Inventory Asset and Fixed Asset capitalization postings"* —
recorded there as an unresolved, disclosed accounting-policy question, not a defect.

**The current code does NOT show this.** An exhaustive grep for `'1400'` across `domain.js` finds:
account 1400 is seeded specifically as `{id:'1400', name:'Fixed Assets — Cost', type:'Asset'}`
(domain.js:166), under an explicit comment: *"4 new accounts, none reused from an existing one, since
none of the existing 13 correctly represents capitalized cost... without misclassifying it."* Every
posting to 1400 traces to Fixed Asset functions only (`capitalizeFixedAsset`/`disposeFixedAsset`,
domain.js:9753, 9755, 9901). **Every Inventory/GRN posting instead goes to account `1200` (Inventory /
WIP)** — a completely separate account (`createGRN`, inventory adjustment, job-work consumption, opening
balance import, stock write-off — all confirmed posting to 1200, none to 1400).

**This document reports the discrepancy rather than silently choosing a side, per this CR's own explicit
instruction.** Two possible explanations, neither confirmed: (a) the prior audit was describing a
stale/pre-fix state that was never corrected in that document's own text after the accounts were
separated; or (b) the prior audit's claim was simply incorrect at the time it was written. **Either way,
the CURRENT code shows clean separation between 1200 and 1400** — this Phase 0 does not resolve which
explanation is correct (that would require comparing against a specific historical commit, out of this
audit's scope), but recommends this item be treated as CLOSED going into Wave 3 design rather than
carried forward as a live accounting-policy risk, since the code today demonstrably does not exhibit the
problem the prior document described. See `ARCH-2026-002-WAVE-3-DECISIONS.md` item W3-1.

## 3. Asset Register ↔ GL reconciliation — confirmed correct, with a clarified nuance

Two distinct functions, not one, serve different purposes:
- `listFixedAssets()` (domain.js:9927) — the full register, intentionally shows ALL assets including
  Disposed ones (standard register/history behavior, not a defect).
- `reconcileFixedAssets()` (domain.js:9931) — the actual GL-comparison function. Its `onBooks` filter
  (line 9941) correctly excludes BOTH un-capitalized (`Purchased`) and `Disposed` assets before summing
  register cost/accumulated-depreciation and comparing against the GL (1400/1450) balance. The
  in-code comment documents exactly why Disposed must be excluded (disposal removes cost+accum-dep from
  the GL, so including it would permanently mismatch the reconciliation).

**Verdict: re-confirmed correct.** No filter defect in either function; the "disposed assets excluded"
claim is true specifically for the RECONCILIATION function, not the raw list (which correctly shows
disposed history).

## 4. Asset lifecycle → accounting trace

`createFixedAsset`(Purchased)→`capitalizeFixedAsset`(Dr 1400/Cr 1000-or-2000)→`postAssetDepreciation`
(Dr 5400/Cr 1450)→`transferFixedAsset`(no GL effect, project reassignment + mandatory reason + closed-
project gates on both source/destination)→`disposeFixedAsset`(removes 1400/1450, books gain/loss to
5500). All posts through the single `postJournalEntry()`, re-confirmed this pass.

## 5. What Asset Management owns vs. Finance

Asset Management (Fixed Asset functions) owns the asset lifecycle state machine and triggers every
posting; Finance's single GL engine is the sole executor of the resulting accounting entries — no
duplicate asset-accounting mechanism exists. Confirmed clean separation of concern, not a duplication.

## Conclusion

One re-confirmed, unchanged open item (Fixed Asset SoD gap — see Security Baseline / Decisions). One
real documentation-vs-code discrepancy found and reported, not silently resolved (Account 1400 sharing
claim does not match current code). Asset Register/GL reconciliation confirmed correct. No duplicate
asset-accounting engine found.
