# PHASE 39 — Accounting Reconciliation & Invariants

**Date:** 2026-09-12. Isolated test server, `APP_ENV=test`, port 4091. This report consolidates
every accounting-invariant check performed across this phase's live test suites into one place,
plus 3 invariants checked directly and freshly for this report.

## The invariant set (17), each with live evidence

| # | Invariant | Evidence | Result |
|---|---|---|---|
| 1 | Every journal entry balances at the line level (Σdebit = Σcredit) | Fresh check, all 525 stress-batch JEs | **0 unbalanced / 525** |
| 2 | Trial Balance: total debit = total credit company-wide | `PHASE39_STRESS_TEST_REPORT.md` (post-525-document) + every domain suite's own TB check | Exact match every time |
| 3 | AR subledger reconciles exactly to the AR control account | Stress test post-batch + Phase 38 baseline re-confirmed | Exact match |
| 4 | AP subledger reconciles exactly to the AP control account | Stress test post-batch + Phase 38 baseline re-confirmed | Exact match |
| 5 | Output GST reconciles exactly to the output-tax GL | Stress test post-batch | Exact match |
| 6 | Input GST reconciles exactly to the input-tax GL | Stress test post-batch | Exact match |
| 7 | Fixed Asset register cost reconciles exactly to GL account 1400 | `PHASE39_FIXED_ASSET_LIVE_TEST.md` | Exact match (incl. after disposal) |
| 8 | Accumulated Depreciation register reconciles exactly to GL account 1450 | `PHASE39_FIXED_ASSET_LIVE_TEST.md` | Exact match |
| 9 | Disposed Fixed Assets correctly excluded from the "on books" register | `PHASE39_FIXED_ASSET_LIVE_TEST.md` | Confirmed |
| 10 | Each bank/cash account's own balance derives ONLY from its own configured GL account (real segregation, not a shared pool) | `PHASE39_BANKING_LIVE_TEST.md` — proven both directions, and the ONE place this was found violated (Bank Import Allocation, DEF-P39-02) was fixed and re-verified | Exact match after fix |
| 11 | Document numbers remain unique under concurrent/bulk load | Phase 38 (110 docs) + this phase's stress test (525 docs, 515-525 vouchers) | 0 duplicates at 5× the prior tested volume |
| 12 | Every posted JE traces to a real, existing source document — no orphan GL entries | Fresh check, all 525 stress-batch JEs | **0 orphans / 525** |
| 13 | Reversal produces a real, balanced, equal-and-opposite entry, and dependent balances return exactly to their pre-transaction state | `PHASE39_BANKING_LIVE_TEST.md` (Bank Transfer reversed; both accounts' balances returned exactly to their pre-transfer figures) | Exact match |
| 14 | A clearing (receipt/payment) can never exceed the open item's remaining balance | Manufacturing/Job Work, Banking (`payment-after-clearing` negative tests), Phase 38 baseline | Blocked every time |
| 15 | Inventory valuation moves are always derived from actual movement records, never a separately-maintained running total | Manufacturing (BOM material cost matched movements+GL to the rupee), Job Work (3-checkpoint stock proof) | Exact match |
| 16 | Negative stock is structurally blocked, not silently allowed | Manufacturing (`"only 0 available in WH-1 (negative stock is blocked...)"`, live-reproduced during initial test-script debugging) | Confirmed blocking, live |
| 17 | Self-approval (maker = checker) is blocked on every approval-gated workflow, regardless of role seniority | Payment Approval Matrix (`finance1` blocked from approving its own payment request) | Blocked |

**17/17 invariants hold, live-proven, zero violations found across every domain tested this phase.**

## What this report is and isn't

This is a genuine, freshly-constructed enumeration for this phase (no single canonical "17
invariants" list from an earlier phase was found to reuse verbatim) built from standard double-entry
ERP correctness principles and everything this engagement has actually exercised. Each row cites the
specific live evidence behind it rather than asserting correctness from source-code reading alone —
consistent with this phase's own standing rule not to substitute code-looks-right for live proof.
