# Appletree ERP — Reporting Audit, Phase 1: The Vendor-Wise Report Question

**Scope of this pass:** the specific UAT complaint (why can't Accounts find vendor-wise reports) plus a real, code-verified first-pass report census. The full 28-part/20-deliverable reporting brief (Customer/Vendor/Labour/Project/Material matrices in full, cross-dimensional analysis, drill-down audit, export audit, saved-report design, universal report engine feasibility) is **not** attempted in this pass — see "Deferred" at the end. No code was changed — this is audit only, per the brief's own explicit instruction.

---

## THE DIRECT ANSWER

**The vendor-wise report is not missing. It exists, is backed by real per-vendor-filterable logic, and is genuinely hard to find and hard to use as shipped.** Classification: **(C) existing but hidden inside another module** + **(E) existing but lacking entity-wise filtering in the UI** + **(F) existing but lacking grouping/subtotals** + **(I) existing technically but not discoverable** — all four apply simultaneously. Per the brief's own rule, this is correctly labeled **"FUNCTIONALLY INACCESSIBLE / UX REPORTING GAP,"** not "missing" and not "complete."

### The evidence, precisely

- **`purchaseVendorReport(vendorId)`** (`server/domain.js:4592`) is a real backend function that **already accepts an optional `vendorId` parameter** — pass a vendor's ID and it filters to just that vendor's purchase orders; omit it and it returns everything. Per PO it returns `orderedValue`, `grnValue`, `invoicedValue`, `paidValue`, `outstandingValue` — exactly the fields a "Vendor-wise Purchase / Outstanding" report needs.
- **The UI never uses that parameter.** `renderPurchVendor()` (`client_secure/index.html:3164`) calls `GET /api/purchase-vendor-report` with **no query string at all**, so the screen always renders the full company-wide list of every PO from every vendor, mixed together in one flat table — no vendor dropdown, no search box, no "group by vendor" toggle, no subtotal row. With 379 purchase orders across 11 vendors in the live UAT dataset, an accountant looking for "how much have we bought from Vendor X" has to scroll and manually eyeball/sum the Vendor column by hand.
- **The screen is named "Purchase & Vendor Report,"** not "Vendor Report" or "Vendor-wise Purchase" — someone typing "vendor report" into their own mental search wouldn't obviously land on it by name.
- **It sits inside the PROCUREMENT navigation group**, not a Finance-adjacent one — and per the Phase 1 UI audit, PROCUREMENT already had 10 sub-items in one wrapping horizontal row in the old nav, with "Purchase & Vendor Report" listed last.
- **Three other, genuinely different vendor-adjacent reports exist elsewhere**, each solving one piece of the puzzle but none the whole thing: `supplierLedger(vendorId)` (`domain.js:7080`, already vendor-filterable — full transaction history for ONE selected vendor), `supplierAgeing(asOf)` (`domain.js:2804`, company-wide overdue-bucket view, not filterable to one vendor), and `vendorRating()` (`domain.js:4579`, a computed performance score per vendor, not a purchase-value report). None of these is "total purchase value by vendor, for all vendors, grouped, exportable" — the specific thing being asked for.

### Why this matters more than a simple "missing report" would

This is a **UI/UX finding, not a backend data-integrity finding** — the underlying numbers are real, computed correctly from actual POs/GRNs/invoices/clearings (the same 5-figure "never combined" discipline used throughout the rest of the app), and reachable by anyone willing to read the whole unfiltered table. The fix is cheap relative to the frustration it's causing: add a vendor filter dropdown that passes `vendorId` to the *already-built* backend, add a search box, and group/subtotal the result by vendor — no new backend logic required, since `purchaseVendorReport()` already supports the exact filter that's missing from its own screen.

---

## CUSTOMER-WISE, BY COMPARISON: meaningfully more mature

Checking the equivalent customer-side reports for calibration:

- **`customerProfitability(customerId)`** (`domain.js:6944`) — already vendor-equivalent-filterable by customer, AND has a prominent, well-named UI screen ("Customer Profitability," `tab-custprofit`) sitting in the AFTER-SALES nav group alongside "Customer 360."
- **`customerLedger(customerId)`** (`domain.js:7072`) — same pattern, filterable, has its own screen.
- **`customerAgeing(asOf)`** (`domain.js:2798`) — the AR-side equivalent of `supplierAgeing`.

The customer side did not skip this problem — it solved it earlier and more completely. The vendor side has equivalent underlying data and even equivalent *backend* filterability (`purchaseVendorReport` already accepts `vendorId`) — it's specifically the UI screen that never wires the filter up, and the screen's name/placement that makes it hard to find. This is a **narrow, well-scoped fix**, not a structural rebuild.

---

## LABOUR-WISE: real gap of a different kind — worker identity, not report existence

**`labourPerformance()`** (`domain.js:5821`) already groups by worker and returns `totalCost`, `totalDays`, `totalHours`, `costPerHour` per worker — genuinely a working, pre-grouped "labour-wise cost" report, with its own screen ("Labour Performance," `tab-labourperf`).

**But per the brief's own required distinction**: this groups by **free-text `workerName`** (confirmed at `domain.js:5113`, `recordLabourWages({workerName, ...})` — there is no employee-master ID anywhere in the labour-cost path). If "Ramesh Kumar" is entered as "Ramesh K." on one wage entry and "ramesh kumar" on another, `labourPerformance()`'s `byWorker[l.workerName]` grouping will silently treat them as two different people, splitting one worker's true cost across two rows with no way to reconcile it after the fact. **This is a genuine, real limitation of the underlying identity model, not a discoverability problem** — it can't be fixed by relocating a screen or adding a filter; it needs either a real employee master (a bigger change) or, at minimum, a normalized/autocomplete worker-name picker at data-entry time to stop new inconsistencies from being created (a much smaller one).

---

## MATERIAL-WISE: the weakest of the four dimensions checked this pass

No function matching a "material-wise" report pattern was found in this pass's sweep (searched for `materialConsumption`, `materialWiseReport`, and similar names — none exist). What exists instead: `stockReport()` (`domain.js:7503`) and `siteMaterialReconciliationReport(siteId)` (`domain.js:9640`, site-scoped, not material-scoped) plus the raw stock-lookup functions (`getStockLevel`, `getMovingAverageRate`) used by the Stock screens. **A genuine cross-dimensional "Material X consumed how much value, by which project, from which vendor" report does not appear to exist as a single function anywhere** — this is a real candidate for the Top 50 Missing Reports list in the full follow-up pass, not a discoverability problem like the vendor one.

---

## A REAL (non-exhaustive) REPORT CENSUS — 32 report-shaped functions found this pass

Found via a single targeted sweep (`function \w+(Report|Summary|Ageing|Ledger|Profitability|Analysis|Rating|Performance|Reconciliation|Statement|Register|Dashboard|Intelligence|Variance)\(` across `domain.js`) — this pattern alone, not an exhaustive walk of every module, already surfaces 32 distinct functions. The full Part 1 census (all modules, all naming conventions, cross-referenced to their UI screens and API routes) is the first deliverable of the deferred follow-up pass.

| Function | Line | Entity focus |
|---|---|---|
| `customerAgeing` | 2798 | Customer (AR) |
| `supplierAgeing` | 2804 | Vendor (AP) |
| `changeRequestProcurementValueSummary` | 3523 | Change Request |
| `changeRequestVariationProfitability` | 3546 | Change Request |
| `procurementIntelligence` | 4553 | Vendor (company-wide) |
| `vendorRating` | 4579 | Vendor |
| `purchaseVendorReport` | 4592 | Vendor / PO (see finding above) |
| `qcDashboard` | 5202 | QC |
| `bomConsumptionReport` | 5576 | Project / BOM |
| `factoryDashboard` | 5779 | Factory |
| `jobAnalysis` | 5788 | Production job |
| `labourPerformance` | 5821 | Labour (worker name — see finding above) |
| `customerAfterSalesSummary` | 6785 | Customer |
| `customerProfitability` | 6944 | Customer |
| `generalLedger` | 7047 | GL (multi-filter: account/date/project/cost-centre/party) |
| `customerLedger` | 7072 | Customer |
| `supplierLedger` | 7080 | Vendor |
| `companyAfterSalesSummary` | 7092 | Company-wide |
| `companyProjectProfitability` | 7116 | Project (multi-filter: date/project/customer/PM/status) |
| `stockReport` | 7503 | Inventory (company-wide) |
| `bankImportReconciliationSummary` | 8362 | Bank |
| `periodCloseReconciliation` | 9228 | Financial period |
| `sellerCumulativeReport` | 9417 | Tax (194Q) |
| `tdsComplianceSummary` | 9450 | Tax (TDS) |
| `siteMaterialReconciliationReport` | 9640 | Site |
| `pettyCashReconciliation` | 9795 | Petty cash |
| `cashControlExceptionsReport` | 9822 | Cash |
| `jobWorkAgingReport` | 10048 | Job Work |
| `itcReversalReport` | 10149 | Tax (ITC) |
| `projectBOQVarianceReport` | 10161 | Project |
| `sopComplianceDashboard` | 10206 | Compliance |

*(Not counting the accounting-statement family already well-documented from prior phases: `companyBalanceSheet`, `companyProfitAndLoss`, `periodTrialBalance`, `projectPL`, `coreProjectPL`, `projectFinancial360`, `projectCostBreakdown`, and the `reconcileAR/AP/OutputTax/InputTax/CustomerAdvances/FixedAssets` family — all real, all previously verified in this session's SAP-comparison pass.)*

---

## IMMEDIATE, LOW-COST RECOMMENDATIONS (no backend change required)

1. **Wire the existing `vendorId` filter into the Purchase & Vendor Report screen** — add a vendor dropdown, pass it through to the already-built `GET /api/purchase-vendor-report?vendorId=...`, add a search box (the same `filterRows()` pattern already used on 6 other screens), and group/subtotal the result by vendor. This alone directly answers the UAT complaint with zero new backend code.
2. **Rename the screen** to something an accountant would actually type — "Vendor-wise Purchase Report" or similar — and consider surfacing it (or a shortcut to it) from the FINANCE module too, not just PROCUREMENT, since Accounts staff look for vendor reports from a finance mindset, not a procurement one.
3. **Do the same filter-wiring check for every other "exists but might not be filtered/discoverable" report** before assuming any of them are complete — this pass only verified the vendor case in this depth; the Customer/Labour/Material equivalents need the same rigor in the follow-up pass.

---

## DEFERRED TO THE FOLLOW-UP PASS

Per the brief's own scale (Parts 1–28, 20 deliverables), this pass covered the triggering complaint plus a partial census. Not yet done: the full Customer/Vendor/Labour/Project/Material entity-wise matrices, cross-dimensional analysis (Part 8), drill-down chain verification (Part 11), a real export audit re-run against the current code (Part 12), saved-report/report-center design (Parts 13–17), the SAP benchmark comparison (Part 18), Top 50 Missing Reports (Part 22), Top 25 Reporting Improvements (Part 23), universal report-engine feasibility (Part 24), and the Final Reporting Maturity Score (Part 20/28). Tell me which of these to pick up next.
