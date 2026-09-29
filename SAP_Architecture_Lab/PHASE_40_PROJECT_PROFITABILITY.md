# PHASE 40 — Project Profitability

**Date:** 2026-09-13.

## Browser-UAT-driven reconciliation (the primary evidence this phase — real UI transactions)

From the full B+C+D+E browser journey in `PHASE_40_BROWSER_UAT_MATRIX.md` (all real, UI-driven
transactions against PRJ-1/PRJ-2):

`GET /api/projects/PRJ-1/cost-breakdown` → `{committed:0, received:28000, invoiced:33040,
paid:13216, consumed:8400}`.

Every one of these four figures was independently traceable, live, to a specific real transaction
performed through the browser earlier in the same session:
- `received: 28000` = exactly the PO-0001 total (10 units MAT-1 × ₹2,800), confirmed at UAT-C1.
- `invoiced: 33040` = exactly `BILL/2026-27/0001` (₹13,216) + `BILL/2026-27/0002` (₹19,824),
  confirmed at UAT-C5/C6.
- `paid: 13216` = exactly the one Payment Request executed (`PAYREQ-0001`), confirmed at UAT-C10.
- `consumed: 8400` = exactly 3 units MAT-1 × ₹2,800, the Site Consumption entered at UAT-D9 — the
  ONLY project-cost event among everything tested (GRN receipts are a balance-sheet asset movement,
  not yet a cost, until consumed — this distinction was actively verified, not assumed).

No project cost appeared without a real, traceable source transaction; no source transaction
performed disappeared from the cost breakdown.

## Stress-dataset reconciliation (525-document batch, independent recomputation)

`GET /api/project-pl?projectId=PRJ-1` → `{revenue: 10520.79, cost: 326550, profit: -316029.21,
marginPct: -3003.85%}`.

Recomputed independently by summing GL account `4000` (Project Revenue) credit lines tagged
`projectId:"PRJ-1"` directly from `GET /api/journal-entries`: **₹10,520.79 — exact match.**

Cost was deliberately recomputed TWO ways to stress-test the reconciliation (not just confirm it):
a naive sum of GRN receipts (`1200` debit) + Bill cost (`5000` debit) gave ₹620,550 — which did
**not** match, correctly, because GRN receipts are an asset movement, not yet a cost (the stress
batch never issued the GRN'd stock). The correct reconciliation (Bill cost `5000` debit alone,
₹326,550) matched `projectPL()`'s reported cost exactly. Profit and margin then followed exactly
from revenue − cost.

## Verdict

Project profitability reconciles exactly to independently-recomputed GL figures on both the real
browser-driven transaction set and the 525-document stress dataset — and, in both cases, the
reconciliation exercise itself actively proved a real accounting distinction (asset vs. recognized
cost) rather than merely re-confirming a number that happened to match.
