# 13 — Project Accounting

## Project Financial 360
One screen showing everything about a project's money: Committed (open PO value), Received (GRN value), Invoiced (supplier invoices), Paid, Consumed (material actually issued to the project = Actual Cost), Installation Cost, Warranty Cost, Chargeable Service Revenue, AMC Revenue, and full Project P&L — all computed LIVE from the same posted General Ledger, never a separately-maintained number that could drift out of sync.

## Project P&L: Core vs Lifecycle margin
- **Core margin** = the original project scope only (materials, labour, installation for the original job).
- **Lifecycle margin** = Core + everything after handover (Warranty cost, Chargeable Service revenue/cost, AMC revenue) — the true long-term profitability of the customer relationship, not just the initial job.

## Full traceability, both directions
Every number on Project Financial 360 can be traced back to its source document (which GRN, which Supplier Invoice, which Payment), and every posted document is tagged with its project, so you can also go the other direction — from a Journal Entry, see exactly which project it affected. This has been proven end-to-end in automated testing (Project → PO → GRN → Supplier Invoice → AP → Payment → Clearing → Material Consumption → Actual Cost → Financial 360 → P&L, and back again).

## Company-wide view
**Reports → Company Profitability** aggregates every project's Core and Lifecycle margin into one filterable table (by project, customer, project manager, status, date range) — computed live, not a stale cached report.
