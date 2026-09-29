# WAVE3_CHANGELOG.md

**Date:** 2026-09-22. Every subsystem touched in this ARCH-2026-002 Wave 3 Implementation pass.

## `server/domain.js` — 2 real defects found and fixed

Both fixes were found live while building the new Fixed Asset hardening tests this wave's own CR text
calls for (§7/§19/§22 — partial depreciation, fully-depreciated asset, disposal, transfer, reversal,
historical asset, duplicate disposal, concurrent action). Neither implements any of the 7 items
`WAVE3_IMPLEMENTATION_SCOPE.md` classifies as an IMPLEMENTATION BLOCKER — both are narrow, defensive
fixes to EXISTING `reverseEntry()`/`disposeFixedAsset()` behavior, using the codebase's own established
patterns (a guard clause reusing the existing `rejectReversal()`/`durableFailureAudit` helper for the
first; a conditional-line-push mirroring the pattern the same function already uses two lines below, for
the second).

### 1. `reverseEntry()` — Fixed Asset Capitalization/Disposal reversal desynced the Register from the GL

**Found:** live-reproduced by the new `[A4]` test section. Capitalizing a ₹1,00,000 asset then reversing
that capitalization's GL entry (`POST /api/journal/:id/reverse`) succeeded (200 OK): GL account 1400
correctly dropped back to ₹0, but `asset.status` stayed `'Capitalized'` — nothing in
`capitalizeFixedAsset()`/`disposeFixedAsset()` is ever notified a reversal happened. The Fixed Asset
Register (`reconcileFixedAssets()`) immediately and *permanently* showed `costMatches:false`, with no
compensating mechanism anywhere in the Lab to close that gap. The same risk exists symmetrically for
disposal reversal. Depreciation-entry reversal is NOT affected — `assetAccumulatedDepreciation()` already
filters `!je.reversedByEntryId`, so it is self-consistent by construction.

**Fix:** added a guard in `reverseEntry()`, immediately after the existing reversal-of-a-reversal guard,
that refuses to reverse any `FixedAssetCapitalization` or `FixedAssetDisposal` entry, using the SAME
`rejectReversal()` helper (and therefore the same `durableFailureAudit` survival mechanism) every other
guard in this function already uses. This is the identical "refuse rather than allow a silent divergence"
philosophy the function's own comments already state for the reversal-of-a-reversal case. The rejection
message points the caller at the correct alternative (post a new, independently-authorized Fixed Asset
transaction).

### 2. `disposeFixedAsset()` — disposing an asset with zero accumulated depreciation crashed

**Found:** live-reproduced by the new `[A4]`/zero-accumulated-depreciation probe. Capitalizing an asset
and disposing it before a single depreciation period was ever posted (`accumDep === 0`) — an entirely
ordinary real-world scenario — unconditionally failed with `"Line on account \"1450\" has neither a debit
nor a credit — every line must have exactly one positive side."` The GL line `{account:'1450',
debit:accumDep, credit:0, ...}` was pushed unconditionally even when `accumDep` is exactly 0, producing a
debit:0/credit:0 line that `postJournalEntry()`'s own line-validation correctly rejects. The exact same
path is also reachable after a legitimate Depreciation-entry reversal brings `accumDep` back to 0 before
disposal (see defect #1's test, `[A4]` section).

**Fix:** the 1450 line is now pushed only when `accumDep > 0`, using the SAME already-established pattern
this very function already uses two lines below for `proceeds` (`if(proceeds>0) lines.push(...)`) and
`gain`/`loss` (`if(gain<0)`/`if(gain>0)`) — not a new idiom, the one line that had been missed brought
into line with the rest of the function. Double-entry balance is unaffected either way, since a
debit:0/credit:0 line never contributed anything to `totalDebit`/`totalCredit`.

**No other line in `server/domain.js` was changed.** No new function, no new collection, no new central
engine, no new SoD rule, no new GL account, no new cost-allocation/Profit-Centre/cash-limit logic — all 7
items `WAVE3_IMPLEMENTATION_SCOPE.md` classifies as IMPLEMENTATION BLOCKER remain unimplemented.

## `server/server.js`

**No changes.** Both fixes above are internal to `reverseEntry()`/`disposeFixedAsset()` in `domain.js`;
the routes that call them (`POST /api/journal/:id/reverse`, `POST /api/fixed-assets/:id/dispose`) are
unchanged.

## `client_secure/index.html`

**No changes.**

## Tests

- `tests/erp_arch_2026_002_wave3_tests.js` — new, 70/70 PASS. See `WAVE3_TEST-RESULTS.md`.

**No pre-existing test file required any correction this wave** (contrast Wave 2, which needed 4
disclosed test-fixture fixes) — both `domain.js` fixes above only change behavior for previously-crashing
or previously-silently-wrong edge cases that no pre-existing suite exercised; every pre-existing suite's
existing assertions continue to hold unmodified (see `WAVE3_REGRESSION.md`).

## Documentation deliverables created

`WAVE3_CHANGELOG.md` (this file), `WAVE3_SECURITY-RESULTS.md`, `WAVE3_SOD-RESULTS.md`,
`WAVE3_CONTROLLING-RESULTS.md`, `WAVE3_TREASURY-RESULTS.md`, `WAVE3_ASSET-RESULTS.md`,
`WAVE3_ACCOUNTING-RESULTS.md`, `WAVE3_PROJECT-COST-RESULTS.md`, `WAVE3_REPORTING-RESULTS.md`,
`WAVE3_TEST-RESULTS.md`, `WAVE3_BROWSER-UAT.md`, `WAVE3_REGRESSION.md`, `WAVE3_ACCEPTANCE.md`. Plus an
update to `CONTROLLED_CHANGE_REGISTER.md` (1 new summary-table row + 1 new detail block).

## Why this is additive/defensive-only

Both `domain.js` changes are guard clauses or conditional-line fixes inside already-existing functions,
found while proving EXISTING behavior correct for edge cases this wave's own CR text calls out by name.
Neither adds a capability, a route, a role check, an SoD rule, a GL account, or a data-model field. Every
existing passing scenario is unaffected — the full regression battery (`WAVE3_REGRESSION.md`) shows zero
net new failures, only two previously-broken/crashing edge cases now behave correctly.
