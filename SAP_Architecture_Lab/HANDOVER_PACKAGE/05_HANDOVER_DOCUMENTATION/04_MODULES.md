# 04 — Modules

| Module | What it does | Status |
|---|---|---|
| CRM (Lead/Estimation/Quotation) | Lead capture through to a Won quotation, with discount approval thresholds | Complete |
| Projects | Project master, Financial 360 (full cost/revenue trace), Project P&L (Core vs Lifecycle margin) | Complete |
| Procurement | Material Requirement → Request → RFQ → Comparison → PO → GRN → 3-way match → Supplier Invoice | Complete |
| Inventory | Moving-average valuation, Transfer, Adjustment, Stock Ledger | Complete |
| Manufacturing | BOM, Production Orders, Material Issue, Production Labour costing | Complete |
| Site Execution | Dispatch, Delivery, Installation, QC, Snags, Handover, Billing Milestones | Complete |
| AR/AP | Customer/Supplier Invoices, Credit/Debit Notes, Receipts/Payments, Clearing, Ageing | Complete |
| After-Sales | Warranty, Complaints, Service Tickets/Visits, Diagnosis approval | Complete |
| AMC | Contracts, Scheduling, Billing, Deferred Revenue Recognition | Complete |
| Fixed Assets | Purchase → Capitalize → Depreciate → Transfer → Dispose, full GL integration | Complete |
| Bank | ICICI statement import (real format), matching, allocation, reconciliation | Complete |
| Financial Periods | Open/Close, authorized override with mandatory reason, full audit | Complete |
| Master Data Import | Chart of Accounts, Customers, Suppliers, Items, Projects, Cost Centres, Banks, Tax Codes, Payment Methods, Service Rates, Fixed Assets — validated CSV import | Complete |
| Opening Balance Engine | Opening AR/AP/Inventory/GL, via the same Draft→Approve→Post workflow as everything else | Complete |
| Reports/Exports | Trial Balance, AR/AP Ageing, Company Profitability, Customer Profitability, 8 real CSV export types | Complete |
| Audit | ~120 distinct logged event types, immutable log | Complete |
| Backup/Restore | Full-database backup/restore, tested end-to-end | Complete |
| Security | RBAC, Segregation of Duties, data scoping, field-level security | Complete |

## Deliberately not built (configuration, not software)
Real Chart of Accounts, real customers/suppliers/items, real opening balances, real tax rates, real GSTINs, real Fixed Asset register, Supplier Debit Note policy, AMC cancellation policy, Distribution Rule, Multi-Currency. See `33_KNOWN_LIMITATIONS.md` and `34_OPEN_MANAGEMENT_DECISIONS.md`.
