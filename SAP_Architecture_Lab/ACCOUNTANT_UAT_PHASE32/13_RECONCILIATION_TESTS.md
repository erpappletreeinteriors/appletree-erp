# 13. Reconciliation Tests (Accountant / Finance Authorizer)

Do these LAST, after you've done a reasonable amount of testing across the other sections, so there's real activity to reconcile.

## 13.1 Trial Balance
Debit total = Credit total.

## 13.2 Balance Sheet
Assets = Liabilities + Equity, difference shown as ₹0.00.

## 13.3 AR
Customer Ledger totals = AR Ageing totals = Reconciliation screen's AR figure.

## 13.4 AP
Supplier Ledger totals = AP Ageing totals = Reconciliation screen's AP figure.

## 13.5 Inventory
Stock Report quantities x rates should be broadly consistent with the Inventory account balance on the Balance Sheet (small timing differences during heavy testing are normal — a large, unexplained gap is not).

## 13.6 Company P&L vs Balance Sheet
Net Profit on Company P&L = Retained Earnings on Balance Sheet.

## 13.7 Project P&L Consistency
On any project you've tested, every place "Actual Cost" appears (top summary, Cost section, Profitability section) should show the exact same number.

If anything in this section does NOT match, that is a genuine defect — please report it using the template in file 14, even if the mismatch is small.
