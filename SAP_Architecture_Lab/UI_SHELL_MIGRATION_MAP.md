# Appletree ERP — Screen-by-Screen Migration Map

Every one of the 111 existing screens, mapped from its OLD two-tier `NAV_GROUPS` location to its NEW Fiori-style `MODULE_TREE` location. Generated directly from the live `MODULE_TREE`/(archived) `NAV_GROUPS` arrays in `client_secure/index.html` — not hand-transcribed, so it cannot drift from the actual code.

No tab id, render function, or backend route changed. Only the navigation chrome around these 111 screens changed (Phase A/B: collapsible left-nav shell + role-based module filtering + breadcrumb).

| Screen | Tab ID | OLD Location (NAV_GROUPS) | NEW Location (MODULE_TREE) |
|---|---|---|---|
| Dashboard | `tab-home` | HOME | HOME |
| Leads | `tab-leads` | CRM | SALES & CRM |
| Quotations | `tab-quotations` | CRM | SALES & CRM |
| Estimation & Costing | `tab-estcost` | CRM | ESTIMATION & COSTING |
| BOM | `tab-boms` | MANUFACTURING | ESTIMATION & COSTING |
| Projects | `tab-projects` | PROJECTS | PROJECTS |
| Project 360 | `tab-project360` | PROJECTS | PROJECTS |
| Material Requirements | `tab-matreq` | PROCUREMENT | PROCUREMENT |
| Material Requests | `tab-matreqs` | PROCUREMENT | PROCUREMENT |
| RFQs | `tab-rfqs` | PROCUREMENT | PROCUREMENT |
| Supplier Quotations | `tab-squotes` | PROCUREMENT | PROCUREMENT |
| Comparisons | `tab-comparisons` | PROCUREMENT | PROCUREMENT |
| Purchase Orders | `tab-pos` | PROCUREMENT | PROCUREMENT |
| GRNs | `tab-grns` | PROCUREMENT | PROCUREMENT |
| Procurement Intelligence | `tab-procint` | PROCUREMENT | PROCUREMENT |
| Vendor Rating | `tab-vendorrating` | PROCUREMENT | PROCUREMENT |
| Purchase & Vendor Report | `tab-purchvendor` | PROCUREMENT | PROCUREMENT |
| Purchase Requisitions | `tab-purchreq` | FINANCE SOP | PROCUREMENT |
| Stock | `tab-grnstock` | INVENTORY | INVENTORY |
| Movement Ledger | `tab-movements` | INVENTORY | INVENTORY |
| Transfer | `tab-invtransfer` | INVENTORY | INVENTORY |
| Adjustment | `tab-invadjust` | INVENTORY | INVENTORY |
| Material Issues | `tab-matissues` | INVENTORY | INVENTORY |
| Returns | `tab-returns` | INVENTORY | INVENTORY |
| Damage Reports | `tab-damagereports` | INVENTORY | INVENTORY |
| Stock Report | `tab-stockreport` | INVENTORY | INVENTORY |
| Locations | `tab-locations` | INVENTORY | INVENTORY |
| Stock by Location | `tab-stockbyloc` | INVENTORY | INVENTORY |
| Stock Counts | `tab-stockcounts` | INVENTORY | INVENTORY |
| Labour & Wages | `tab-labourwages` | OPERATIONS | SITE OPERATIONS |
| Project Expenses | `tab-projexpenses` | OPERATIONS | SITE OPERATIONS |
| QC Dashboard | `tab-qcdash` | OPERATIONS | SITE OPERATIONS |
| Project Timesheet | `tab-timesheet` | OPERATIONS | SITE OPERATIONS |
| Tasks | `tab-tasks` | OPERATIONS | SITE OPERATIONS |
| Risk Register | `tab-riskregister` | OPERATIONS | SITE OPERATIONS |
| Weekly Scorecard | `tab-weeklyscorecard` | OPERATIONS | SITE OPERATIONS |
| Site Material | `tab-sitematerial` | FINANCE SOP | SITE OPERATIONS |
| Production Orders | `tab-prods` | MANUFACTURING | PRODUCTION & JOB WORK |
| Factory Dashboard | `tab-factorydash` | FACTORY/MES | PRODUCTION & JOB WORK |
| Machines | `tab-machines` | FACTORY/MES | PRODUCTION & JOB WORK |
| Job Cards | `tab-jobcards` | FACTORY/MES | PRODUCTION & JOB WORK |
| Production Schedule | `tab-prodschedule` | FACTORY/MES | PRODUCTION & JOB WORK |
| Job Analysis | `tab-jobanalysis` | FACTORY/MES | PRODUCTION & JOB WORK |
| Job Cost Sheet | `tab-jobcostsheet` | FACTORY/MES | PRODUCTION & JOB WORK |
| Product Costing | `tab-productcosting` | FACTORY/MES | PRODUCTION & JOB WORK |
| Labour Performance | `tab-labourperf` | FACTORY/MES | PRODUCTION & JOB WORK |
| Job Work | `tab-jobwork` | FINANCE SOP | PRODUCTION & JOB WORK |
| Dispatch | `tab-dispatches` | EXECUTION | EXECUTION & DELIVERY |
| Delivery | `tab-deliveries` | EXECUTION | EXECUTION & DELIVERY |
| Installation | `tab-installations` | EXECUTION | EXECUTION & DELIVERY |
| QC | `tab-qc` | EXECUTION | EXECUTION & DELIVERY |
| Snags | `tab-snags` | EXECUTION | EXECUTION & DELIVERY |
| Handover | `tab-handovers` | EXECUTION | EXECUTION & DELIVERY |
| Billing Milestones | `tab-milestones` | EXECUTION | EXECUTION & DELIVERY |
| Document Workflow | `tab-workflow` | FINANCE | FINANCE |
| New Journal Voucher | `tab-newje` | FINANCE | FINANCE |
| Customer Invoice | `tab-ci` | FINANCE | FINANCE |
| Customer Receipt | `tab-cr` | FINANCE | FINANCE |
| Customer Credit/Debit Note | `tab-ccn` | FINANCE | FINANCE |
| Supplier Bill | `tab-si` | FINANCE | FINANCE |
| Supplier Payment | `tab-sp` | FINANCE | FINANCE |
| Customer Advance | `tab-custadvance` | FINANCE | FINANCE |
| Journal Templates | `tab-jetmpl` | FINANCE | FINANCE |
| Recurring Entries | `tab-jerec` | FINANCE | FINANCE |
| Import (CSV) | `tab-jeimport` | FINANCE | FINANCE |
| Journal Register | `tab-jereg` | FINANCE | FINANCE |
| Document Viewer | `tab-docviewer` | FINANCE | FINANCE |
| Bank Reconciliation | `tab-bankrecon` | FINANCE | FINANCE |
| Reconciliation | `tab-recon` | FINANCE | FINANCE |
| Financial Periods | `tab-finperiods` | FINANCE | FINANCE |
| Fixed Assets | `tab-fixedassets` | FINANCE | FINANCE |
| Bank / Cash Transfer | `tab-banktransfer` | FINANCE | FINANCE |
| Supplier Debit Note | `tab-supplierdn` | FINANCE | FINANCE |
| ICICI Bank Import | `tab-bankimport` | FINANCE | FINANCE |
| Master Data Import | `tab-masterimport` | FINANCE | FINANCE |
| Opening Balances | `tab-openingbalance` | FINANCE | FINANCE |
| Compliance Dashboard | `tab-sopdash` | FINANCE SOP | FINANCE |
| SOP Configuration | `tab-sopconfig` | FINANCE SOP | FINANCE |
| Payment Requests | `tab-paymentreq` | FINANCE SOP | FINANCE |
| Petty Cash | `tab-pettycash` | FINANCE SOP | FINANCE |
| APOB & E-way Bill | `tab-apobeway` | FINANCE SOP | FINANCE |
| ITC / BOQ Reports | `tab-compliancereports` | FINANCE SOP | FINANCE |
| Balance Sheet | `tab-balancesheet` | FINANCIAL STATEMENTS | FINANCIAL STATEMENTS |
| Company Profit & Loss | `tab-companypl` | FINANCIAL STATEMENTS | FINANCIAL STATEMENTS |
| General Ledger | `tab-generalledger` | FINANCIAL STATEMENTS | FINANCIAL STATEMENTS |
| Customer Ledger | `tab-customerledger` | FINANCIAL STATEMENTS | FINANCIAL STATEMENTS |
| Supplier Ledger | `tab-supplierledger` | FINANCIAL STATEMENTS | FINANCIAL STATEMENTS |
| Trial Balance | `tab-tb` | FINANCE | FINANCIAL STATEMENTS |
| AR Ageing | `tab-arage` | FINANCE | FINANCIAL STATEMENTS |
| AP Ageing | `tab-apage` | FINANCE | FINANCIAL STATEMENTS |
| Customer 360 | `tab-cust360` | AFTER-SALES | SERVICE & AFTER-SALES |
| Customer Profitability | `tab-custprofit` | AFTER-SALES | SERVICE & AFTER-SALES |
| Warranty | `tab-warranty` | AFTER-SALES | SERVICE & AFTER-SALES |
| Complaints | `tab-complaints` | AFTER-SALES | SERVICE & AFTER-SALES |
| Service Tickets | `tab-tickets` | AFTER-SALES | SERVICE & AFTER-SALES |
| Service Visits | `tab-visits` | AFTER-SALES | SERVICE & AFTER-SALES |
| AMC | `tab-amc` | AFTER-SALES | SERVICE & AFTER-SALES |
| AMC Schedule | `tab-amcsched` | AFTER-SALES | SERVICE & AFTER-SALES |
| Service Billing | `tab-svcbilling` | AFTER-SALES | SERVICE & AFTER-SALES |
| CAPA | `tab-capa` | AFTER-SALES | SERVICE & AFTER-SALES |
| Company Profitability | `tab-companyprofit` | REPORTS | REPORTS & ANALYTICS |
| Exports | `tab-exports` | REPORTS | REPORTS & ANALYTICS |
| Audit Log | `tab-audit` | REPORTS | REPORTS & ANALYTICS |
| Branches | `tab-branches` | ADMIN | MASTER DATA |
| Profit Centres | `tab-profitcentres` | ADMIN | MASTER DATA |
| Bank Accounts | `tab-bankaccounts` | ADMIN | MASTER DATA |
| Chart of Accounts | `tab-chartofaccounts` | ADMIN | MASTER DATA |
| Cost Centres | `tab-costcentres` | ADMIN | MASTER DATA |
| Policy Configuration | `tab-policyconfig` | ADMIN | ADMINISTRATION |
| Users & Roles | `tab-usersroles` | ADMIN | ADMINISTRATION |
| Try Unauthorized Action | `tab-deny` | ADMIN | ADMINISTRATION |

**Total: 111 screens in the old structure, 111 screens in the new structure — exact 1:1 match, verified programmatically (zero added, zero removed, zero duplicated).**
