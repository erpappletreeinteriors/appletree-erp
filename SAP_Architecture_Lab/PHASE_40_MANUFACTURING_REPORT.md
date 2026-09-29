# PHASE 40 — Manufacturing Report

**Date:** 2026-09-13. Full detail: `PHASE_40_BROWSER_UAT_MATRIX.md` area F;
`PHASE_40_DEFECT_REGISTER.md` DEF-P40-04.

## The headline finding

Before this phase's fix, Manufacturing was **entirely unreachable through the browser**: the BOM
screen could create a Draft BOM but never submit it (no Submit button existed, only a permanently-
failing "Approve" button), and Production Orders require an Approved BOM. A real user, using only
the application UI, could never manufacture anything — despite the backend fully supporting the
entire chain (proven by Phase 39's own API-level tests). This is disclosed prominently because it is
the single most significant finding of Phase 40.

## What was proven, live, through the browser, after the fix

BOM created (estimator1) → self-approve blocked (SoD) → **Submit** (the fix) → Approve (finance1) →
Production Order created against the approved BOM (pm1) → Issue Material → Labour Cost ₹9,000
(purchase1) → Complete attempted by the wrong role (BLOCKED — real RBAC) → Complete (pm1) →
`Status: Completed`.

## Cost reconciliation

`GET /api/job-cost-sheet?productionOrderId=PROD-0001` → `{materialCost:5880, labourCost:9000,
totalActualCost:14880}`. `materialCost` independently recomputed: BOM line 2 units MAT-1 × 5% scrap
× ₹2,800 = 2.1 × 2,800 = **₹5,880 — exact match.** `labourCost` matches the exact amount posted.

## Negative tests, live

- Estimator self-approving own BOM: BLOCKED.
- Purchase completing a Production Order (wrong role): BLOCKED.

## Verdict

Manufacturing is now fully browser-proven end-to-end, cost-reconciled exactly, with the phase's most
consequential defect found and fixed in the same pass.
