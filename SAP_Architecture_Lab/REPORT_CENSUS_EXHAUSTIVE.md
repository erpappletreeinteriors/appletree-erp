# Report Census — Appletree ERP (SAP_Architecture_Lab), Exhaustive Pass

Evidence gathered by reading `server/domain.js` (494 top-level functions), `server/server.js` (~250 GET/POST routes), and `client_secure/index.html` (`fns{}` tab-dispatch map + ~120 `renderXxx()` bodies). Line numbers cited are exact grep/read hits. This is the companion detail document referenced by `REPORTING_AUDIT_FORENSIC.html`'s Deliverable B and Finding 4.

## Legend
G = Grouped/subtotaled · D = Drill-down/doclink · E = Export · S = Search-in-table

---

## CRM / Sales / Estimation & Costing

| Report Name | Function:Line | API Route | UI Screen (tab) | Entity | Filters (fn / UI) | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| Leads list | (route only, no aggregation) | GET /api/leads | `leads` | Customer/Lead | none / none | No | No | No | Yes (name/source/status) |
| Estimation Requests + Costing Versions | (route list) | GET /api/estimation-requests, /api/costing-versions | `estcost` | Project/Estimation | none / none | No | No | No | No |
| Quotations list | (route list) | GET /api/quotations | `quotations` | Customer/Quotation | none / none | No | No | No | No |

## Projects / Execution

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters (fn/UI) | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| Project P&L | `projectPL` 2784 | GET /api/project-pl?projectId | `project360` | Project | fn: projectId / UI: dropdown | No | No | Export tab only (`project-pl`) | No |
| Project Cost Breakdown | `projectCostBreakdown` 5290 | GET /api/projects/:id/cost-breakdown | `project360` (line 706) | Project | fn: projectId (path) / UI: dropdown | Yes (by category) | Yes (goto PO/GRN/movements/ARage) | No | No |
| Project Financial 360 | `projectFinancial360` 6867 | GET /api/projects/:id/financial-360 (implied) | `project360` | Project | projectId / dropdown | Yes | Yes | Export tab (`financial-360`) | No |
| Core Project P&L | `coreProjectPL` 6857 | (internal, folded into Financial 360) | `project360` | Project | projectId | Yes | via 360 | via 360 | No |
| Project Commitments | `projectCommitments` 4015 | GET /api/commitments?projectId | `project360` (commitment drilldown, line 742) | Project/Vendor | projectId / dropdown+link | Yes (by PO) | Yes (`showCommitmentDrilldown`) | No | No |
| Project Financial Readiness | `projectFinancialReadiness` 3166 | GET /api/projects/:id/financial-readiness | `custadvance` | Project | projectId | No | No | No | No |
| Project Closure Readiness | `projectClosureReadiness` 6105 | (used in close-project flow) | inline in `projects`/`project360` action | Project | projectId | No | No | No | No |
| Project Document Trace | `projectDocumentTrace` 10251 | GET /api/projects/document-trace?projectId | `project360` (line 807) | Project | projectId / dropdown | Yes (by doc type) | Yes | No | No |
| Project BOQ/BOM Variance | `projectBOQVarianceReport` 10161 | GET /api/boq-variance?projectId | `compliancereports` (loadBoq) | Project/Material | fn: projectId / UI: dropdown+button | Yes (per material line) | No | No | No |
| Company-Wide Project Profitability | `companyProjectProfitability` 7116 | GET /api/company-project-profitability | `companyprofit` | Project | fn: dateFrom, dateTo, projectId, customerId, projectManagerId, status / UI: ALL 6 wired (2286-2292) | Yes (per project + totals) | Yes (→ Project 360) | No | No |
| QC Dashboard | `qcDashboard` 5202 | GET /api/qc-dashboard | `qcdash` | Project/Quality | none / none | Yes (by project) | No | No | No |
| Risk Register | (list) | GET /api/risk-register | `riskregister` | Project | none | No | No | No | No |
| Weekly Scorecard | `captureWeeklySnapshot` 5274 | GET /api/weekly-scorecard | `weeklyscorecard` | Project/Company | none | Yes (snapshot) | No | No | No |

## Change Request / Project Variation — SEE FINDING 4: zero UI presence for the entire module

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| CR → Invoices Consumption | `invoicesConsumingChangeRequest` 3385 | GET /api/change-requests/:id/consumption | **NONE** | Project/CR | changeRequestId | No | n/a | No | No |
| CR → BOMs list | `bomsForChangeRequest` 3394 | GET /api/change-requests/:id/execution | **NONE** | Project/CR | changeRequestId | No | n/a | No | No |
| CR → POs + GRNs | `posForChangeRequest` 3407 | GET /api/change-requests/:id/execution | **NONE** | Project/CR/Vendor | changeRequestId | Yes (per PO w/ GRNs) | n/a | No | No |
| CR → Material Requirements chain | `materialRequirementsForChangeRequest` 3428 | GET /api/change-requests/:id/execution | **NONE** | Project/CR | changeRequestId | No | n/a | No | No |
| CR Procurement Value Summary | `changeRequestProcurementValueSummary` 3523 | GET /api/change-requests/:id/procurement-value | **NONE** | Project/CR | changeRequestId | Yes (5 value figures) | n/a | No | No |
| CR Variation Profitability | `changeRequestVariationProfitability` 3546 | GET /api/change-requests/:id/profitability | **NONE** | Project/CR | changeRequestId | Yes | n/a | No | No |
| Procurement Scope Classifier | `resolveProcurementScope` 3469 | GET /api/procurement-scope?docType&docId | **NONE** | Project/PO/BOM | docType, docId | No | n/a | No | No |

*A project-wide grep for `change-requests` and `Change Request` across `client_secure/index.html` returns zero hits. The entire Change Request create/submit/approve/reject/revise/cancel lifecycle AND all 7 report functions above have zero UI presence.*

## Procurement

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters (fn/UI) | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| Procurement Intelligence | `procurementIntelligence` 4553 | GET /api/procurement-intelligence | `procint` | Vendor | none / none | Yes (per vendor) | No | No | No |
| Vendor Rating | `vendorRating` 4579 | GET /api/vendor-rating | `vendorrating` | Vendor | none / none | Yes (per vendor, sorted) | No | No | No |
| **Purchase & Vendor Report** | `purchaseVendorReport` 4592 | GET /api/purchase-vendor-report?vendorId | `purchvendor` | Vendor/PO | fn accepts `vendorId`; route reads `parsed.query.vendorId` (line 2043-2045); UI (`renderPurchVendor`, line 3164-3171) calls the endpoint with **no query string at all** — `vendorId` never sent | No (1 row/PO) | No | No | No |
| Invoiceable GRNs for Vendor | `invoiceableGRNsForVendor` 4483 | GET /api/ap/invoiceable-grns?vendorId | `si` (PO-aware billing) | Vendor | vendorId / dropdown | Yes (per GRN) | Yes (opens invoice draft) | No | No |
| Purchase Requisitions worklist | (list) | GET /api/purchase-requisitions | `purchreq` | Project/Vendor | none | No | No | No | No |
| Seller Cumulative Purchases (194Q) | `sellerCumulativeReport` 9417 | GET /api/seller-cumulative-report | `compliancereports` | Vendor/Tax | none / none | Yes (per vendor) | No | No | No |
| TDS Compliance Summary | `tdsComplianceSummary` 9450 | GET /api/tds-deductions (returns `deductions`+`summary`) | **NONE** (only `/api/tds-config` policy screen consumes UI; deductions list/summary never rendered) | Vendor/Tax | none | Yes (aggregate) | No | No | No |
| Job Work Aging Report | `jobWorkAgingReport` 10048 | GET /api/job-work-aging | `jobwork` (per-line pill, line 4230-4238) | Job Worker/Material | none / none | No (per JWO line, not aggregated) | No | No | No |

## Inventory / Site Operations

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters (fn/UI) | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| Stock Report (material × warehouse) | `stockReport` 7503 | GET /api/stock-report | `stockreport` | Material | none / none | Yes (material×warehouse) | No | Export tab (`inventory`) | No |
| Stock by Location | `stockByLocation` 7486 | GET /api/stock-by-location | `stockbyloc` | Material | none / none | Yes (material×wh×location) | No | No | No |
| Movement Ledger | (chronological list) | GET /api/inventory/movements | `movements` | Material | none | No | No | Export tab (filterable by materialId only in export, not UI) | No |
| Stock Counts / Variance | `submitStockCount` 7567 | GET /api/stock-counts | `stockcounts` | Material | warehouseId | Yes (per material) | No | No | No |
| Damage Reports | `createDamageReport` 7521 | GET /api/damage-reports | `damagereports` | Material | none | No | No | No | No |
| Site Material Reconciliation | `siteMaterialReconciliationReport` 9640 | GET /api/site-material-reconciliation?siteId | `sitematerial` | Material/Site | fn: siteId / UI: check | Yes (per site, per material) | No | No | No |
| ITC Reversal Report | `itcReversalReport` 10149 | GET /api/itc-reversal-report | `compliancereports` | Material/Tax | none | Yes (total + entries) | No | No | No |
| Cash Control Exceptions Report | `cashControlExceptionsReport` 9822 | GET /api/cash-control-exceptions | `compliancereports` | Cash/Payment | none | No | No | No | Yes (party/date/type) |

**Confirmed absent**: no function combines `getStockLevel()` (warehouse) and `getSiteStockLevel()` (site) into one material-wise aggregate cross-referenced to project/vendor. `stockReport()`/`stockByLocation()` are warehouse-only; `siteMaterialReconciliationReport()` is site-only, no vendor/warehouse dimension.

## Production & Job Work

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| BOM Consumption Report | `bomConsumptionReport` 5576 | GET /api/reports/bom-consumption?projectId | **NONE — no `bom-consumption` string anywhere in index.html** | Project/Material | projectId | Yes | No | No | No |
| Production Schedule | `productionSchedule` 5772 | GET /api/production-schedule | `prodschedule` | Production | none | Yes (per prod order + job cards) | No | No | No |
| Factory Dashboard | `factoryDashboard` 5779 | GET /api/factory-dashboard | `factorydash` | Production | none | Yes (by status) | No | No | No |
| Job Analysis | `jobAnalysis` 5788 | GET /api/job-analysis | `jobanalysis` | Production | none | No (1 row/completed job card) | No | No | No |
| Job Cost Sheet | `jobCostSheet` 5797 | GET /api/job-cost-sheet?productionOrderId | `jobcostsheet` | Material/Production | productionOrderId (dropdown) | Yes | No | No | No |
| Product Costing | `productCosting` 5811 | GET /api/product-costing?bomId | `productcosting` | Material | bomId (dropdown) | Yes | No | No | No |
| **Labour Performance** | `labourPerformance` 5821 | GET /api/labour-performance | `labourperf` | Labour | none / none | Yes — grouped by `workerName` (free-text). Neither `DB.labourWages` nor `DB.timesheetEntries` carries any workerId/employeeId field — `workerName` is the ONLY worker identifier the data model has. | No | No | No |

## Execution & Delivery

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| Dispatch Readiness | `dispatchReadinessCheck` 5846 | (inline, used by markDispatchReady) | `dispatches` | Project | dispatch obj | No | No | No | No |
| Handover Readiness | `handoverReadinessCheck` 6039 | GET (inline) | `handovers` | Project | projectId | No | No | No | No |

## Finance — Ledgers & Statements

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters (fn/UI) | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| **General Ledger** | `generalLedger` 7047 | GET /api/general-ledger | `generalledger` | Account | fn: `account, fromDate, toDate, projectId, costCentreId, party, docCategory` (7 params, route line 732-735) / UI wires only 5 (3710-3714) — `party` and `docCategory` have no UI control at all | Yes (running balance) | Yes (`openDoc`) | No | No |
| Customer Ledger | `customerLedger` 7072 | GET /api/customer-ledger?customerId | `customerledger` | Customer | fn+UI: customerId (dropdown) | Yes + reconciliation check | Partial (voucher no, not doclink) | No | No |
| Supplier Ledger | `supplierLedger` 7080 | GET /api/supplier-ledger?vendorId | `supplierledger` | Vendor | fn+UI: vendorId | Yes + reconciliation check | Partial | No | No |
| Trial Balance | (route) | GET /api/trial-balance | `tb` | Account | none | Yes | No | No | No |
| Company Balance Sheet | `companyBalanceSheet` 6982 | GET /api/balance-sheet?asOfDate | `balancesheet` | Account/Company | fn: asOfDate / UI: check | Yes (current/non-current) | No | No | No |
| Company P&L | `companyProfitAndLoss` 7020 | GET /api/company-pl?fromDate&toDate | `companypl` | Account/Company | fn: fromDate,toDate / UI: check | Yes | No | No | No |
| **Customer Ageing (AR)** | `customerAgeing` 2798 | GET /api/ar/ageing | `arage` | Customer | fn accepts `asOf` (defaults today) / **route calls `D.customerAgeing()` with zero arguments (line 781) — `asOf` never wired even at the route layer** | Yes (per customer, bucketed) | Yes (Open Items drill) | Export tab (`ar`) | No |
| **Supplier Ageing (AP)** | `supplierAgeing` 2804 | GET /api/ap/ageing | `apage` | Vendor | same: fn supports `asOf`, **route calls `D.supplierAgeing()` unparameterized (line 795)** | Yes | Yes | Export tab (`ap`) | No |
| Customer Open Items | `customerOpenItems` 2560 | GET /api/ar/open-items?customerId | `arage` (drill), `cr` | Customer | customerId | No | Yes (openDoc) | No | No |
| Supplier Open Items | `supplierOpenItems` 2571 | GET /api/ap/open-items?vendorId | `apage` (drill) | Vendor | vendorId | No | Yes | No | No |
| Reconciliation (AR/AP/Output Tax/Input Tax/Cust Advances) | `reconcileAR/AP/OutputTax/InputTax/CustomerAdvances` 2730-2777 | GET /api/reconciliation | `recon` | Account | none | Yes (5 control-account checks) | No | No | No |
| Fixed Assets Reconciliation | `reconcileFixedAssets` 8069 | GET /api/fixed-assets/reconciliation | `fixedassets` | Asset | none | Yes | No | No | No |
| Fixed Assets Register | `listFixedAssets` 8065 | GET /api/fixed-assets | `fixedassets` | Asset | none | No | No | No | No |
| Bank Account Balances | `bankAccountBalances` 9058 | GET /api/bank-accounts/balances | `bankaccounts` | Bank | none | Yes (per account) | No | No | No |
| Bank Reconciliation Status | `bankReconciliationStatus` 9142 | GET /api/bank-reconciliation?bankAccountId | `bankrecon` | Bank | bankAccountId / dropdown | Yes | Yes (matched entries → openDoc) | No | No |
| Bank Import Reconciliation Summary | `bankImportReconciliationSummary` 8362 | GET /api/bank-import/reconciliation-summary?bankAccountId | `bankimport` | Bank | bankAccountId | Yes | No | No | No |
| Period Trial Balance | `periodTrialBalance` 9217 | (internal only) | folded into `periodCloseReconciliation`, shown in `finperiods` | Account/Period | period | Yes | No | No | No |
| Period Close Reconciliation | `periodCloseReconciliation` 9228 | GET /api/financial-periods/:id/reconciliation | `finperiods` | Account/Period | periodId (path) | Yes | No | No | No |
| Journal Entry Register | (list) | GET /api/journal-entries | `jereg` | Account | none (route-level) | No | Yes (`openDoc`) | No | No |
| **Customer Profitability** | `customerProfitability` 6944 | GET /api/customers/:id/profitability | `custprofit` | Customer | customerId (path) — fully wired end-to-end | Yes (per project + totals) | Yes (→ Project 360) | Export tab (`customer-profitability`) | No |
| Company After-Sales Summary | `companyAfterSalesSummary` 7092 | GET /api/after-sales-summary | `home`/`homeFinance` dashboards | Company | none | Yes | No | Export tab (`after-sales`) | No |
| Customer After-Sales Summary | `customerAfterSalesSummary` 6785 | GET /api/customers/:id/after-sales-summary | `cust360` | Customer | customerId | Yes (by doc type) | No | No | No |
| Journal Templates list | `listJournalTemplates` 7612 | GET /api/journal-templates | `jetmpl` | Account | none | No | No | No | No |
| Recurring Entries list | `listRecurringEntries` 7642 | GET /api/recurring-entries | `jerec` | Account | none | No | No | No | No |

## Service & After-Sales

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| Service Ticket SLA Status | `ticketSlaStatus` 6753 | GET /api/service-tickets/:id/sla | `tickets` | Service Ticket | ticketId | No | No | No | No |
| **Service Ticket Cost Breakdown** | `serviceTicketCostBreakdown` 6413 | GET /api/service-tickets/:id/cost-breakdown | **NONE — only the analogous project cost-breakdown is wired, not this one** | Service Ticket | ticketId | Yes | n/a | No | No |
| **Repeat Complaint History** | `repeatComplaintHistory` 6777 | GET /api/repeat-complaint-history?customerId&projectId&product | **NONE — zero UI calls** | Customer/Complaint | customerId, projectId, product | Yes | n/a | No | No |
| AMC Revenue Schedule | `amcRevenueSchedule` 6544 | GET /api/amc-contracts/:id/revenue-schedule | `amc` | Customer/AMC | amcId (path) | Yes (per period) | No | No | No |
| Warranty/Complaint/Ticket/Visit/AMC lists | (route lists) | GET /api/warranties, /complaints, /service-tickets, /service-visits, /amc-contracts | `warranty`,`complaints`,`tickets`,`visits`,`amc` | Customer | none | No | No | No | No |
| CAPA case list | (list) | GET /api/capa | `capa` | Complaint/Ticket | none | No | No | No | No |

## Master Data / Administration

| Report Name | Function:Line | API Route | UI Screen | Entity | Filters | G | D | E | S |
|---|---|---|---|---|---|---|---|---|---|
| SOP Compliance Dashboard | `sopComplianceDashboard` 10206 | GET /api/sop-compliance-dashboard | `sopdash` | Company-wide | none | Yes (multi-category) | No | No | No |
| Audit Log | (list) | GET /api/audit-log | `audit` | System | none (route-level filters exist but not confirmed wired) | No | No | No | No |
| Backups list | `listBackups` 956 | GET /api/admin/backups | **NONE — no UI call found** | System | none | No | n/a | No | No |
| Admin Sessions list | (route) | GET /api/admin/sessions | **NONE — no UI call found** | System/User | none | No | n/a | No | No |
| Users & Roles | (list) | GET /api/admin/users | `usersroles` | User | none | No | No | No | No |

---

## Backend-exists-but-UI-missing — complete list

1. `bomConsumptionReport(projectId)` — domain.js:5576, route server.js:1378-1383, zero UI calls.
2. Entire Change Request module's report layer (7 functions) — routes server.js:1242-1281, zero UI calls (see Finding 4).
3. `serviceTicketCostBreakdown(ticketId)` — domain.js:6413, route server.js:1714, no UI call.
4. `repeatComplaintHistory({customerId, projectId, product})` — domain.js:6777, route server.js:1846, no UI call.
5. `tdsComplianceSummary()` / the underlying `DB.tdsDeductions` list — domain.js:9450, route server.js:2651; only the config screen is rendered, the actual deduction ledger/summary never is.
6. `listBackups()` (server.js:956/2301) and the admin sessions list (server.js:2532) — live routes, no render function.

## Unused filter parameters — complete list

1. `purchaseVendorReport(vendorId)` — domain.js:4592. Route correctly threads `vendorId` (server.js:2043-2045); UI never sends it (index.html:3164-3171).
2. `generalLedger({...7 params})` — domain.js:7047. Route passes all 7 through (server.js:732-735); UI wires only 5, `party` and `docCategory` unreachable.
3. `customerAgeing(asOf)` / `supplierAgeing(asOf)` — domain.js:2798/2804. Routes call both with zero arguments (server.js:779-782, 793-796) — `asOf` unreachable even at the route layer, not just the UI.
4. `companyProjectProfitability` and `customerProfitability`, by contrast, are fully and correctly wired end-to-end — confirmed clean, included for completeness.
