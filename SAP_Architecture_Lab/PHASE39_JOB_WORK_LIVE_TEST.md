# PHASE 39 — Job Work Live Test

**Date:** 2026-09-12. Isolated test server, `APP_ENV=test`, port 4091, fictional `PRJ-1`/`TEST39`-
scope data only. Test script: `tests/erp_phase39_manufacturing_jobwork_tests.js`. Raw results:
`phase39_mfg_jobwork_results.json`.

## What was live-executed

Job Worker (unregistered + registered) creation → dispatch to job worker (Delivery Challan
produced) → partial return (5 of 10) → over-return block → scrap disposition (remaining 5) →
second dispatch (to unregistered job worker) → Direct Dispatch blocked with no APOB → APOB
Declaration creation → Direct Dispatch succeeding once APOB is on file.

**18 assertions, 18/18 PASS** (of the suite's 36 total — Manufacturing reported separately).

## Negative tests (all correctly BLOCKED)

| # | Scenario | Result |
|---|---|---|
| 1 | Dispatch to a nonexistent Job Worker ID | BLOCKED |
| 2 | Dispatch of a nonexistent material | BLOCKED |
| 3 | Unauthorized role (`Sales`) dispatching Job Work | BLOCKED |
| 4 | Over-return beyond remaining dispatched qty (999 requested, only 5 left) | BLOCKED |
| 5 | **Direct Dispatch from an unregistered job worker with no active APOB declaration** — the required GST-compliance control | BLOCKED, `apobRequired:true` |

Scenario 5 is a real, live-confirmed APOB (Additional Place of Business) compliance gate: an
unregistered job worker's premises must be declared as an APOB before goods can be dispatched
directly from there to a customer (bypassing return to Appletree's own warehouse first) — a genuine
GST regulatory control, not a generic permission check.

## Stock-custody reconciliation — three checkpoints, independently verified

The test previously asserted a single collapsed before/after stock figure, which produced a false
failure (see Fix Log) because the "before" snapshot was taken *after* the dispatch had already run.
Rebuilt with three real checkpoints on MAT-1 in WH-1:

| Checkpoint | WH-1 MAT-1 stock | Event | Expected delta | Live result |
|---|---|---|---|---|
| Pre-dispatch | 150 | — | — | baseline |
| Post-dispatch | 140 | 10 units dispatched to job worker | −10 | **PASS**, exactly −10 |
| Post-partial-return | 145 | 5 of 10 returned | +5 | **PASS**, exactly +5 |
| Post-scrap | 145 | remaining 5 scrapped (Destroyed/Written Off) | 0 (scrapped material was never back in Appletree's warehouse custody) | **PASS**, unchanged |
| Net (dispatch+return+scrap cycle) | 145 (from 150) | 10 out, 5 back, 5 scrapped | −5 | **PASS**, exactly −5 |

This directly proves the brief's mandatory "no double stock mutation" invariant: dispatch removes
custody once, return credits custody back once, and scrap (which represents material that never
re-enters Appletree's own warehouse) causes no further stock movement — not silently double-counted
in either direction.

## GL / accounting effect

Dispatch and partial return are **pure custody-transfer inventory movements** — no GL entry is
posted for either, which is architecturally correct (no value has left the business; the material is
still an Appletree-owned asset, merely held at a different physical location). The **scrap
disposition** is the point value actually leaves the business, and it is the only Job Work event
that posts a GL entry:

- **JE-0006** (`JobWorkScrapWriteOff`, sourceId `JWO-0001`): debit/credit both ₹14,000
  (5 units MAT-1 × ₹2,800 moving-average rate), balanced. Matches inventory movement `MV-000009`'s
  `valuationAmount: 14000` exactly.

Direct Dispatch (JWO-0002, to the unregistered job worker, post-APOB) posted an `Issue`-type
inventory movement removing 5 units of MAT-2 from WH-1 custody, but no GL entry — consistent with
revenue/COGS recognition happening at a later Sales Invoice step (out of this specific chain's
scope), not at the point of physical dispatch to the customer.

## Verdict

**Job Work is now LIVE-PROVEN**, not merely code-traced, including the brief's specific mandatory
"no double stock mutation" invariant (proven via 3 independent checkpoints, not a single collapsed
assertion) and the real APOB compliance gate on Direct Dispatch. Zero new defects found in this
domain.
