# PHASE 40 — Job Work Report

**Date:** 2026-09-13. Full detail: `PHASE_40_BROWSER_UAT_MATRIX.md` area G;
`PHASE_40_DEFECT_REGISTER.md` DEF-P40-03.

## What was proven, live, through the browser

Job Worker creation blocked for the wrong role (Purchase — real RBAC), created correctly by
FinanceManager → Dispatch 2 units MAT-1 to the (unregistered) job worker, real Delivery Challan
produced → **Return** 1 unit: stock checkpoint 1.9→2.9 (exactly +1) → **Scrap** the remaining 1
unit, disposition "Destroyed/Written Off": real GL write-off entry (`Dr 5300 / Cr 1200`, `JE-0012`,
₹2,800) posted, stock checkpoint unchanged at 2.9 (correctly — scrapped material never re-enters
warehouse custody).

## The mandatory "no double stock mutation" invariant — explicitly re-proven

| Checkpoint | Stock | Event |
|---|---|---|
| Pre-dispatch | (baseline) | — |
| Post-dispatch | −2 | 2 units to job worker |
| Post-return | +1 (net −1) | 1 unit back |
| Post-scrap | unchanged | 1 unit written off, never re-entered custody |

Each of the 2 physical movements (1 returned, 1 scrapped) is represented **exactly once** — live-
reproduced through real UI clicks and real stock-level checkpoints, not inferred.

## Access finding

DEF-P40-03: Purchase (the role that actually approves/issues MRS material and is a natural Job Work
operator per this same module) previously had no menu path to Site Material — fixed this phase (see
Fix Log). Job Work's own screen was directly reachable by Purchase already; the finding was specific
to the adjacent Site Material screen.

## Verdict

Job Work fully browser-proven, the specific mandated invariant re-confirmed with real checkpoints.
