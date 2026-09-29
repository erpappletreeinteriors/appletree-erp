# PHASE 39 — Fixed Assets Live Test

**Date:** 2026-09-12. Isolated test server, `APP_ENV=test`, port 4091, fictional `TEST39-FA-*`-
scope data only. Test script: `tests/erp_phase39_fixed_assets_tests.js`. Raw results:
`phase39_fixed_assets_results.json`.

## What was live-executed

Full chain: Fixed Asset creation (status `Purchased`) → capitalization (Bank-funded and,
separately, AP/vendor-funded) → straight-line depreciation across 3 monthly periods with
partial-period proration → transfer (location/custodian, then project — including a closed-project
override) → disposal, both at a **loss** and at a **gain**, with net book value independently
reconciled → Fixed Asset Register vs. GL reconciliation.

**30 assertions, 30/30 PASS.**

## Negative tests (all correctly BLOCKED)

| # | Scenario | Result |
|---|---|---|
| 1 | Unauthorized role (`Purchase`, has `create` but not `post`) capitalizing an asset | BLOCKED |
| 2 | Capitalization with missing Useful Life | BLOCKED — "ACCOUNTING POLICY REQUIRED... never defaulted" |
| 3 | Capitalization with missing Depreciation Method | BLOCKED — same policy-required message |
| 4 | Capitalization with Residual Value ≥ Cost | BLOCKED |
| 5 | Double-capitalization of an already-Capitalized asset | BLOCKED |
| 6 | Depreciation amount exceeding the remaining depreciable value (past the residual floor) | BLOCKED |
| 7 | Unauthorized role (`Purchase`) posting depreciation | BLOCKED |
| 8 | Depreciation against a not-yet-Capitalized asset | BLOCKED |
| 9 | Asset transfer with no reason (mandatory unconditionally, every transfer) | BLOCKED |
| 10 | `FinanceManager` (non-CEO/Admin) transferring an asset **into** a CLOSED project | BLOCKED |
| 11 | `CEO` transferring an asset into a CLOSED project with **no override reason** | BLOCKED |
| 12 | Unauthorized role (`Purchase`) disposing an asset | BLOCKED |
| 13 | Disposal of an already-Disposed asset | BLOCKED |

Scenarios 10-11 specifically live-prove the closed-project posting gate (`assertProjectOpenForPosting`)
on the Fixed Asset **transfer** action — a genuine, audited two-tier control (role tier, then
mandatory-reason tier) — not merely assumed from the code comment describing it. Scenario 11 depends
on a subtlety worth stating plainly: the transfer route reuses its own `reason` field as the closed-
project override reason (one field satisfies both requirements), so the negative test had to omit
`reason` entirely, not merely the concept of an "override reason." A follow-up call (12th line in
the results) with `reason` supplied by CEO **succeeded**, confirming the override path itself works,
not just the block.

## Depreciation — independently recomputed, not assumed

Asset `TEST39-FA-001`: cost ₹600,000, residual ₹60,000, useful life 24 months, StraightLine,
capitalized 2026-01-15. Full monthly charge = `(600,000 − 60,000) / 24 = ₹22,500`.

- **Period 1 (Jan, prorated):** capitalized on the 15th of a 31-day month → 17 of 31 days remaining
  → expected `22,500 × 17/31 = ₹12,338.71`. **Live-confirmed exact match** via the posted JE's
  `totalDebit`.
- **Period 2 (Feb, full month):** expected exactly ₹22,500. **Live-confirmed exact match.**
- **Period 3 (Mar, full month):** expected exactly ₹22,500. **Live-confirmed exact match.**

Each period posted a real, balanced JE (`Dr 5400` Depreciation Expense / `Cr 1450` Accumulated
Depreciation).

## Disposal — gain/loss independently recomputed, not assumed

- **Asset 1** (`TEST39-FA-001`): NBV captured immediately before disposal via
  `GET /api/fixed-assets`, disposed for ₹400,000 proceeds. Independently computed expected
  `gainOrLoss = proceeds − NBV`; **live result matched to the paisa** (tolerance 0.02 for
  floating-point rounding only). Result: a **loss**, correctly posted as a debit to account 5500.
- **Asset 2** (`TEST39-FA-002`, AP/vendor-funded capitalization, 1 depreciation period posted):
  disposed for ₹145,000 proceeds. Independently computed expected gain; **live result matched
  exactly.** Result: a **gain**, correctly posted as a credit to account 5500.

Both disposal JEs correctly removed the asset's full original cost (credit 1400) and its full
accumulated depreciation (debit 1450) from the books in the same balanced entry as the gain/loss
line and any cash-proceeds line — proven via the JE's own line items, not inferred from the domain
function's source alone.

## Register ↔ GL reconciliation — live, not inferred

`GET /api/fixed-assets/reconciliation` after both disposals:
`registerCost: 0, glCost: 0, costMatches: true, registerAccumDep: 0, glAccumDep: 0,
accumDepMatches: true, assetCount: 0, disposedCount: 2` — both test assets correctly fell out of
the "on books" register the instant they were disposed (matching the Phase 22-era fix documented
in `reconcileFixedAssets()`'s own comment, now independently re-confirmed live rather than trusted
from the comment), and register cost/accumulated-depreciation match GL accounts 1400/1450 exactly
(both zero, correctly, since nothing remains on the books).

## Test-script bug found and fixed (not an application defect)

The reconciliation endpoint's response shape is `{ok:true, reconciliation:{...}}` — the first draft
of this test read the fields (`costMatches`, `disposedCount`, etc.) directly off the top-level
response instead of `response.reconciliation.*`, producing 3 false failures on the first run.
Confirmed via direct inspection of the route handler (`server.js:2668`) before correcting the test;
the application's actual reconciliation values were correct on both runs.

## Verdict

**Fixed Assets is now LIVE-PROVEN**, not merely code-traced — the full acquisition→capitalization→
depreciation (multi-period, prorated)→transfer (incl. closed-project override)→disposal (loss and
gain)→register-GL-reconciliation lifecycle executed for real, with every dependent figure
independently recomputed and matched, not assumed correct because the code looked right. Zero new
defects found in this domain.
