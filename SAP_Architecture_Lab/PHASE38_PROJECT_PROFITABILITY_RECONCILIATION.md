# PHASE 38 — Project Profitability Reconciliation

**Date:** 2026-09-11. Project PRJ-1, on the disposable isolated server used for this phase's E2E
run (never production). This section required a genuine independent recalculation, not a rubber
stamp — per Part 7's own instruction, a first-pass discrepancy was found, investigated to its exact
root cause (not dismissed as "timing"), and resolved. The full trace is included below rather than
only the clean final numbers, because the process itself is the proof of rigor Part 7 asks for.

## ERP's own reported figures

```
GET /api/projects/PRJ-1/cost-breakdown → {committed:0, received:140000, invoiced:165200, paid:99120, consumed:28000}
GET /api/project-pl?projectId=PRJ-1    → {revenue:231995, cost:39000, profit:192995, marginPct:83.19}
```

## Cost Breakdown — independently verified against the exact transactions posted this phase

| Field | ERP value | Independent derivation |
|---|---|---|
| `received` | 140,000 | 50 units × ₹2,800 (2 GRNs: 30+20 units, both against the one PO) — matches exactly |
| `invoiced` | 165,200 | Bill #1 (30×2,800=84,000 ×1.18 GST = 99,120) + Bill #2 (20×2,800=56,000 ×1.18 = 66,080) = 165,200 — matches exactly |
| `paid` | 99,120 | Only Bill #1 was paid this run — matches exactly |
| `consumed` | 28,000 | Material Issue of 10 units × ₹2,800 moving-average rate (the only inbound batch, so MAR = PO rate) = 28,000 — matches exactly |
| `committed` | 0 | PO fully received (50/50) — zero remaining open commitment — correct |

**All 5 fields independently reconciled to the rupee.**

## Project P&L — first-pass discrepancy found, traced to root cause, resolved

**First independent attempt**: summed the Revenue account (4000), project-filtered, EXCLUDING every
row flagged `reversed:true` → **226,995**, a **5,000 discrepancy** against the ERP's reported
231,995.

**Per Part 7's explicit instruction, this was not accepted as "probably fine" — traced to the exact
GL lines.** The discrepancy was exactly ₹5,000 — the same amount as a Customer Invoice
(`INV/2026-27/0003`, CUST-2) that this phase's own test suite deliberately created and then reversed
(as a negative-test fixture for "receipt against a reversed invoice"). Pulling both GL lines for that
document directly:

```
INV/2026-27/0003  credit:5000  debit:0     reversed:true   isReversal:false   (the original invoice)
JV/2026-27/0001   credit:0     debit:5000  reversed:false  isReversal:true    (its reversal)
```

**Root cause of the discrepancy: my own first-pass filter, not the ERP.** Excluding rows where
`reversed===true` removed the ORIGINAL invoice's 5,000 credit line while correctly keeping the
REVERSAL's 5,000 debit line — which left an unmatched -5,000 in my own sum instead of the two lines
correctly netting to zero. Re-run **without** excluding `reversed:true` rows — i.e., summing every
line and letting the original and its reversal cancel arithmetically, which is the correct treatment
for a double-entry reversal (both lines are real, audited GL entries; the net effect of a reversed
document is zero, not "absent from the books") — gives **231,995**, matching the ERP's reported
revenue exactly.

**Cost**: my first Material-Cost-only sum (account 5000) gave 28,000, short of the ERP's reported
39,000 by exactly 11,000. This is not a discrepancy — `projectPL()` sums ALL Expense-type accounts
project-tagged, not Material Cost alone. Independently summing the other two Expense-type postings
made this phase (Labour Wages 8,000 + Project Expense 3,000 = 11,000) and adding them to Material
Cost gives 28,000 + 11,000 = **39,000**, matching exactly.

**Profit**: 231,995 − 39,000 = **192,995**, matching the ERP's reported profit exactly.

## Final reconciliation table

| Line | Independent calc | ERP report | Match |
|---|---|---|---|
| Revenue | 231,995 (correctly netting the reversed test invoice to zero) | 231,995 | ✅ Exact |
| Cost (Material 28,000 + Labour 8,000 + Expense 3,000) | 39,000 | 39,000 | ✅ Exact |
| Profit | 192,995 | 192,995 | ✅ Exact |
| Committed / Received / Invoiced / Paid / Consumed | see table above | matches all 5 fields | ✅ Exact |

## Conclusion

`projectPL()` and `projectCostBreakdown()` both reconcile exactly to an independently-derived
figure built directly from the individual documents posted this phase — including correct handling
of a reversed document (net zero contribution, both audit-trail lines retained). The one
discrepancy found in this exercise was in the auditor's own first-pass methodology (an incorrect
exclusion filter), not in the ERP's calculation — disclosed here in full rather than silently
corrected, per this engagement's standing discipline of not hiding a mistake even when it turns out
to be the auditor's own.
