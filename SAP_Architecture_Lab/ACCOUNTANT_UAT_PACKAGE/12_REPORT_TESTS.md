# REPORT TESTS

For each report, pick a number it shows you, then go find the actual transaction(s) behind that number and confirm they add up correctly by hand.

1. **Trial Balance** — pick one account, add up its transactions yourself, compare to the report.
2. **AR Ageing** (who owes us money, and how overdue) — pick one customer, check the number matches their actual open invoices.
3. **AP Ageing** (who we owe money to) — same check, for a supplier.
4. **Project Profitability report** — pick one project, and independently calculate its profit from its actual transactions (see `07_PROJECT_TESTS.md` step 5). It must match exactly.
5. **Bank Reconciliation** — check the bank balance shown matches what you'd expect from the transactions you posted.

Any report that shows a number that doesn't match the underlying transactions is a FAIL, even if the report "looks fine."
