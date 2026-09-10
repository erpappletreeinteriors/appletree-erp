# 11 — AR / AP

## Customer Invoice → Receipt → Clearing
1. **Finance → Customer Invoice**: pick customer, project, amount, tax code → creates a Draft.
2. **Document Workflow**: Submit → Approve → Post (posts Dr AR / Cr Revenue + tax).
3. **Finance → Customer Receipt**: pick customer, the specific open invoice, amount, and optionally a Payment Method → posts immediately (Dr Bank / Cr AR) and clears the invoice by the amount received. Cannot exceed the invoice's remaining open balance.

## Supplier Bill → Payment → Clearing
Same shape: **Supplier Bill** (Draft, needs workflow) → **Supplier Payment** (posts + clears immediately, cannot overpay).

## Credit / Debit Notes
Customer/Supplier Credit Notes reduce what's owed (capped at the invoice's actual remaining open balance — cannot over-clear). Customer Debit Notes add a new open balance. All reversible.

## Ageing
**AR Ageing / AP Ageing** screens bucket every open item by days overdue (Current / 1-30 / 31-60 / 61-90 / 91-180 / 181-365 / 365+).

## Reconciliation guarantee
AR Subledger (the sum of all open customer invoices) always equals the AR Control Account balance in the General Ledger — proven by automated tests on every regression run, and viewable live at **Reconciliation**. Same for AP.
