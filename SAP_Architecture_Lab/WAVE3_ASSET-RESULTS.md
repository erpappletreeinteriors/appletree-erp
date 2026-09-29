# WAVE3_ASSET-RESULTS.md

**Date:** 2026-09-22. Fixed Asset lifecycle hardening results for ARCH-2026-002 Wave 3 — this is where
the real NEW test coverage this wave adds lives.

## Headline statement

**No new Fixed Asset SoD rule was added.** W3-3 (Fixed Asset full-lifecycle identity separation) is
classified IMPLEMENTATION BLOCKER by `WAVE3_IMPLEMENTATION_SCOPE.md` — capitalize/transfer/depreciate/
dispose remain pure role gates (`assertCanCapitalizeFixedAsset()` etc.), with zero identity/maker-checker
check added. This is proven directly by this pass's own tests: the same actor (`finance1`) performs
multiple lifecycle steps on the same asset throughout, with no identity-based rejection anywhere.

**2 real, genuine defects WERE found and fixed this pass** (see `WAVE3_CHANGELOG.md` for full detail) —
both inside `reverseEntry()`/`disposeFixedAsset()`, found while building the new edge-case coverage
below. Both are disclosed prominently here, separate from the "verification only" characterization of
everything else in this document.

## New hardening test coverage (`tests/erp_arch_2026_002_wave3_tests.js`, Section A)

| # | Edge case (per this wave's CR text) | Result |
|---|---|---|
| A1 | Partial depreciation — a second, distinct proration scenario (capitalized on the 5th of the month, vs. the existing baseline suite's 15th) | PASS — first period ₹17,419.35 (27/31 of the ₹20,000 monthly charge), independently computed and matched to the penny; second period the full ₹20,000, unaffected by the first period's proration |
| A2 | A fully-depreciated asset | PASS — a 2-month-life, ₹50,000 asset with 0 residual depreciates exactly to NBV=0 over 2 periods; a third depreciation attempt is BLOCKED (not a silent ₹0 no-op); a manual ₹500 amount well past the ₹0.01 rounding tolerance is also BLOCKED; the asset remains listed with `status:'Capitalized'` (fully-depreciated is correctly not treated as a distinct terminal status) |
| A3 | Action on a HISTORICAL (old) asset | PASS — an asset purchased 2019-04-01, capitalized 2019-04-10, capitalizes/depreciates/transfers/disposes normally in 2026 with no implicit "too old" date gate anywhere; the 2019 proration formula is identical to a present-day asset's |
| A4 | Reversal of a lifecycle transaction | **2 real defects found and fixed** — see below. After the fixes: reversing a Capitalization entry is correctly BLOCKED (previously silently succeeded and desynced the Register from the GL); reversing a Disposal entry is correctly BLOCKED (same defect class); reversing a plain Depreciation entry remains ALLOWED and is self-consistent (accumulated depreciation correctly drops back down, because `assetAccumulatedDepreciation()` already excludes reversed entries by filter) |
| A5 | Duplicate disposal attempt | **Confirmed via the pre-existing suite, not duplicated here**, per this wave's own instruction. `tests/erp_phase39_fixed_assets_tests.js`'s own `[FA-NEG] Disposal of an already-Disposed asset is BLOCKED` re-run fresh this pass: **30/30 PASS** for that entire suite, including this assertion |
| A6 | Concurrent/near-simultaneous action on the SAME asset by two different legitimate actors | PASS — a real race-condition-shaped test using `Promise.all` (both HTTP requests in flight together, not sequential `await`/`await`). Two different actors (FinanceManager, Admin) fired `dispose` at the same asset simultaneously: exactly ONE succeeded, the other was correctly rejected (`"not Capitalized"`, since the winning request's status flip is visible to the loser) — no double-disposal, no lost update, no corrupted hybrid state. A second scenario (concurrent `transfer`, a non-exclusive action) confirmed BOTH concurrent requests apply cleanly with a complete, ordered `transferHistory` (length exactly 2, no lost update) |
| A7 | Final reconciliation | PASS — Fixed Asset Register still reconciles exactly to GL accounts 1400/1450 after all of the above activity |

**Note on A6's concurrency semantics:** Node.js runs each request handler's synchronous body to
completion before starting the next (single-threaded event loop for CPU-bound/synchronous work, which
`disposeFixedAsset()`'s status check→mutation is). This test proves that guarantee holds correctly for
this codebase's actual server model — it is not a claim about true OS-thread-level parallelism, which
this Node.js server does not use for request handling. The result (exactly one winner, deterministic, no
corruption) is the CORRECT and expected outcome under that model, and this pass's HTTP-level `Promise.all`
test is a genuine, real verification of it (not a hypothetical one) — both requests were dispatched before
either resolved.

## Defect #1: `reverseEntry()` allowed silently corrupting Register/GL reconciliation

Live-reproduced: capitalize a ₹1,00,000 asset → `costMatches:true`. Reverse that capitalization's GL
entry (`POST /api/journal/JE-000x/reverse`) → succeeded (200 OK). GL account 1400 correctly dropped to
₹0 for that asset; `asset.status` stayed `'Capitalized'`. `GET /api/fixed-assets/reconciliation`
immediately showed `costMatches:false` (`registerCost:100000, glCost:0` for that asset's contribution),
permanently, with no compensating mechanism anywhere in the Lab. **Fixed**: `reverseEntry()` now refuses
to reverse a `FixedAssetCapitalization` or `FixedAssetDisposal` entry outright, using the same
`rejectReversal()`/`durableFailureAudit` mechanism the function already uses for its other guards (e.g.
the pre-existing reversal-of-a-reversal block). Depreciation-entry reversal is unaffected — confirmed
self-consistent by design (no fix needed there).

## Defect #2: `disposeFixedAsset()` crashed on zero accumulated depreciation

Live-reproduced: capitalize an asset, dispose it before a single depreciation period is ever posted
(`accumDep === 0`, an entirely ordinary scenario) → unconditionally failed with `"Line on account
\"1450\" has neither a debit nor a credit — every line must have exactly one positive side."` **Fixed**:
the 1450 line is now pushed only when `accumDep > 0`, mirroring the SAME conditional-push pattern the
function already uses for `proceeds`/`gain`/`loss` two lines below.

## Existing coverage re-confirmed (not duplicated, per this wave's own instruction)

`tests/erp_phase39_fixed_assets_tests.js` re-run fresh, in its own intended sequence position (after
Phase 38/39 Banking) this pass: **30/30 PASS**. Covers: acquisition (positive + 4 negative validation
paths), 3-period straight-line depreciation with the ORIGINAL (15th-of-month) proration scenario,
over-depreciation block, unauthorized-role block, depreciate-before-capitalize block, transfer (+
mandatory-reason, + closed-project gate both directions, + CEO override), disposal at a loss and at a
gain with independently-computed gain/loss verification, duplicate-disposal block, and final Register↔GL
reconciliation (including the post-disposal exclusion rule). Zero regressions from either `domain.js` fix
above.

## Conclusion

**PASS — genuine new hardening-test coverage added for every edge case this wave's CR text calls out by
name; 2 real, disclosed defects found and fixed (narrow, defensive fixes, not new capability); no new
Fixed Asset SoD rule added (W3-3 remains blocked, per `WAVE3_IMPLEMENTATION_SCOPE.md`); zero regression
against the pre-existing 30-assertion baseline suite.**
