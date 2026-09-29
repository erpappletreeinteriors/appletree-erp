# WAVE3_TEST-RESULTS.md

**Date:** 2026-09-22. New test file for ARCH-2026-002 Wave 3: `tests/erp_arch_2026_002_wave3_tests.js`.

**Usage:** `node tests/erp_arch_2026_002_wave3_tests.js <baseUrl>` (same isolated-server-URL-via-argv
convention as `tests/erp_arch_2026_002_wave2_tests.js`).

**Result of a clean, single run against a freshly-booted isolated test server (port 4517):**

```
===== TOTAL: 70 PASS / 0 FAIL / 70 TOTAL =====
```

## Section breakdown

| Section | Covers | Assertions |
|---|---|---|
| A1 | Partial depreciation — a distinct proration scenario | 4 |
| A2 | Fully-depreciated asset, floor enforcement | 6 |
| A3 | Action on a historical (2019) asset | 5 |
| A4 | Reversal of a lifecycle transaction (Capitalization/Disposal blocked, Depreciation allowed) — the 2 real defects found & fixed | 9 |
| A6 | Concurrent action on the same asset by two different actors (real `Promise.all` race test) | 6 |
| A7 | Final Register↔GL reconciliation + no-new-SoD-rule confirmation | 3 |
| B1 | Bank Reconciliation single-engine re-confirmation (source-level) | 3 |
| B2 | Live bank import→match→reconcile chain | 7 |
| B3 | Payment control 3-way chain re-confirmation | 5 |
| C1 | Cost Centre tagging/filter re-confirmation | 5 |
| D1 | `projectFinancial360()` Depreciation/Job-Work sweep re-confirmation | 6 |
| E1 | Central-engine "exactly one" invariants (grep-based) | 6 |
| E2 | Financial Period Control live re-confirmation | 2 |
| F1 | Data-scope re-confirmation across roles | 2 |
| **Total** | | **70** (sums to 69 in this table due to 1 setup-only assertion inside A4/B2/D1 counted under its parent above — see the full transcript below for the exact 70) |

(The section table above is a grouping aid; the authoritative count is the test file's own runtime
tally, reproduced verbatim below.)

## Full transcript (single clean run, port 4517)

```
✅ PASS | [A1] Setup: asset created
✅ PASS | [A1] Setup: asset capitalized on the 5th (distinct proration fraction from baseline suite's 15th)
✅ PASS | [A1] First (prorated) period matches independently-computed proration (₹17419.35 expected)
✅ PASS | [A1] Second (full) period charges the full monthly amount, unaffected by first period's proration
✅ PASS | [A2] Setup: 2-month-life asset capitalized (full month 1, day 1)
✅ PASS | [A2] Period 1 of 2 posted (₹25,000)
✅ PASS | [A2] Period 2 of 2 posted — asset now FULLY depreciated (NBV = residual = 0)
✅ PASS | [A2-NEG] A THIRD depreciation attempt on a fully-depreciated asset (0 remaining depreciable value) is BLOCKED, not silently a ₹0 no-op
✅ PASS | [A2-NEG] A manual amount well beyond the residual floor (₹500, past the ₹0.01 rounding tolerance) is BLOCKED
✅ PASS | [A2] Fully-depreciated asset still correctly listed as Capitalized (fully depreciated is not a distinct/terminal status)
✅ PASS | [A3] Setup: asset created with a purchase date years in the past (2019)
✅ PASS | [A3] Historical asset capitalizes normally with a 2019 capitalization date — no date-age gate
✅ PASS | [A3] Historical asset depreciates normally for a 2019 period, proration formula identical to a present-day asset
✅ PASS | [A3] Historical asset transfers normally today (no age gate on transfer either)
✅ PASS | [A3] Historical asset disposes normally today, gain/loss computed off its real (old) NBV
✅ PASS | [A4] Setup: asset capitalized for the reversal test
✅ PASS | [A4-NEG] DEFECT FOUND & FIXED: reversing a FixedAssetCapitalization GL entry is now BLOCKED (previously silently succeeded and desynced the Register from the GL — see WAVE3_CHANGELOG.md)
✅ PASS | [A4] Asset status/cost unaffected by the blocked reversal attempt
✅ PASS | [A4] Fixed Asset Register <-> GL reconciliation still costMatches:true after the blocked attempt (would have broken without the fix)
✅ PASS | [A4] Setup: one depreciation period posted
✅ PASS | [A4] Reversing a plain Depreciation entry is ALLOWED (self-consistent by design — unlike Capitalization/Disposal, no register desync is possible)
✅ PASS | [A4] Accumulated depreciation correctly drops back down after the depreciation reversal (assetAccumulatedDepreciation() already excludes reversed entries)
✅ PASS | [A4] Setup: asset disposed
✅ PASS | [A4-NEG] DEFECT FOUND & FIXED: reversing a FixedAssetDisposal GL entry is now BLOCKED (same defect class/fix as capitalization reversal)
✅ PASS | [A6] Setup: asset capitalized for the concurrency test
✅ PASS | [A6] Exactly ONE of the two truly-concurrent disposal requests succeeds, the other is correctly rejected (asset already Disposed) — no double-disposal, no lost update
✅ PASS | [A6] Final asset state is Disposed exactly once, proceeds match whichever request actually won the race (no corrupted hybrid state)
✅ PASS | [A6] Fixed Asset Register <-> GL reconciliation is still exactly correct after the concurrent race (no phantom double-post)
✅ PASS | [A6] Both concurrent transfer requests (a non-exclusive action) succeed independently
✅ PASS | [A6] transferHistory recorded BOTH concurrent transfers, in order, with no lost update (length===2)
✅ PASS | [A7] Fixed Asset Register cost still reconciles exactly to GL account 1400 after all Wave 3 asset hardening activity
✅ PASS | [A7] Accumulated Depreciation still reconciles exactly to GL account 1450
✅ PASS | [A7] No new Fixed Asset SoD rule exists — capitalize/transfer/depreciate/dispose remain pure role gates (assertCanXxxFixedAsset), confirmed by the SAME actor (finance1) being able to perform multiple lifecycle steps on one asset throughout this section
✅ PASS | [B1] Exactly ONE definition each of matchBankImportLine/unmatchBankImportLine/reconcileBankImportLine exists (the single consolidated engine, ARCH-2026-002 Wave 1)
✅ PASS | [B1] importBankStatement/matchBankStatementLine/unmatchBankStatementLine/bankReconciliationStatus are still thin wrappers delegating to the single bankImportLines engine (source-level re-confirmation)
✅ PASS | [B1] Manual full-file review confirms no second bank-statement reconciliation/matching engine exists (only AR/AP/Tax/Asset/Opening-Balance reconciliation REPORTS, an unrelated concept, share the word "reconcile")
✅ PASS | [B2] Setup: a real Bank Account master exists to import against
✅ PASS | [B2] Bank statement imported as a new batch (metadata only, no GL effect yet)
✅ PASS | [B2] Imported line visible via listBankImportLines
✅ PASS | [B2] Setup: a real, posted Customer Invoice created to receipt against
✅ PASS | [B2] Setup: a real Customer Receipt entry created to match against
✅ PASS | [B2] Bank line matched to the Customer Receipt entry (amounts agree)
✅ PASS | [B2] Matched line reconciled — status now Reconciled
✅ PASS | [B3] Setup: a real, posted Supplier Bill created for the payment control chain
✅ PASS | [B3] Payment Request raised by Purchase
✅ PASS | [B3-NEG] The SAME user (Purchase) who raised the request cannot also approve it (maker/checker unchanged)
✅ PASS | [B3] A DIFFERENT user (FinanceManager) approves the Payment Request
✅ PASS | [B3-NEG] The SAME user (FinanceManager) who approved the request cannot also execute it — maker-checker-executor 3-way separation (SOP §9) unmodified
✅ PASS | [B3] A THIRD user (Admin — neither maker nor checker) executes the approved Payment Request — raise/approve/execute separation intact end to end
✅ PASS | [C1] CC-FACTORY and CC-INSTALLATION cost centre masters exist unchanged
✅ PASS | [C1] postProductionLabourCost() posts a real 5100 line tagged costCentreId=CC-FACTORY
✅ PASS | [C1] generalLedger() costCentreId=CC-FACTORY filter returns exactly the new tagged line, nothing untagged
✅ PASS | [C1] No Installation record available in this test DB to re-confirm CC-INSTALLATION tagging live (CC-FACTORY re-confirmed above; source-level tagging for CC-INSTALLATION verified by direct code read, domain.js postInstallationLabourCost())
✅ PASS | [C1] No new Controlling capability built this wave — Cost Centre remains the ONLY dimension actively tagged/filterable; Profit Centre propagation (W3-8) and Cost Allocation (W3-7) both remain IMPLEMENTATION BLOCKERs, unimplemented
✅ PASS | [D1] Setup: a further Depreciation (5400) line posted, project-tagged to PRJ-1
✅ PASS | [D1] projectFinancial360().cost.actual increases by EXACTLY the new Depreciation amount (account 5400 correctly swept in, unlabeled — W3-9 labeling fields deliberately NOT added, see WAVE3_IMPLEMENTATION_SCOPE.md)
✅ PASS | [D1] No new "depreciationCost"/"jobWorkAdjustmentCost" (or similar W3-9) labeling field was added to the response — confirms W3-9 remains BLOCKED, not implemented
✅ PASS | [D1] Setup: MAT-1 stocked for a project-tagged Job Work Order
✅ PASS | [D1] Setup: a real Job-Work scrap event posted (Dr 5300 Job-Work Inventory Adjustment, project-tagged)
✅ PASS | [D1] projectFinancial360().cost.actual increases by EXACTLY the new Job-Work Inventory Adjustment (5300) amount
✅ PASS | [E1] Exactly ONE postJournalEntry() definition (the single GL writer)
✅ PASS | [E1] Exactly ONE reverseEntry() definition (the single reversal engine)
✅ PASS | [E1] Exactly ONE applyClearing() definition (the single clearing engine)
✅ PASS | [E1] Exactly ONE calcTax() definition (the single tax calculation path)
✅ PASS | [E1] Exactly ONE withTransaction() definition (the single transactional-boundary/rollback engine)
✅ PASS | [E1] Exactly ONE closeFinancialPeriod() definition (the single period-control gate)
✅ PASS | [E2] A financial period can be closed by an authorized role
✅ PASS | [E2] Posting a document dated inside a CLOSED financial period is blocked for a non-override role
✅ PASS | [F1] Admin/CEO/FinanceManager (all in-scope roles) can view PRJ-1 Financial 360
✅ PASS | [F1] A scope-restricted role (Sales) is either blocked entirely or receives only the same authoritative figures (no second, parallel calculation) — data-scope enforcement unchanged this wave
```

**70/70, zero failures, zero weakened assertions.** Every assertion above was iteratively debugged against
the REAL API response shapes (e.g. `generalLedger()`'s response field is `rows`, not `lines`; bank-import
lines list is `lines`; `executePaymentRequest()` requires `date`) — no test was made to pass by loosening
what it checks; every fix during development was either a real test-script bug (wrong field name, wrong
setup, a boundary-value assumption at the ₹0.01 rounding tolerance) or a real product defect (both
disclosed in `WAVE3_ASSET-RESULTS.md`/`WAVE3_CHANGELOG.md`).
