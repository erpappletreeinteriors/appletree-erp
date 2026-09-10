# 26 — Reports

## Built-in report screens
Trial Balance, AR Ageing, AP Ageing, Reconciliation (AR/AP subledger vs control), Company-Wide Project Profitability, Customer Profitability, Journal Register (searchable/filterable), Document Viewer (drill-down into any posted document, its reversal if any, and its clearings), Bank Reconciliation Summary, Fixed Asset Register + Reconciliation, Opening Balance Reconciliation.

## Exports (real CSV, not placeholders)
8 report types can be exported as real CSV data directly from the Reports → Exports screen: General Ledger, Leads, and others as configured. Every export is gated by the same role rules as viewing the underlying screen, and every export attempt is logged (who, when, what report, what filters, how many records).

## All figures are computed live
No report in this system is a stale, separately-maintained cache — every number is computed directly from the current posted Journal Entries at the moment you view it. This is slower for very large datasets than a pre-computed report would be, but guarantees the number you see is always correct as of right now (see `29_TROUBLESHOOTING.md` for the one performance optimization this required at scale).
