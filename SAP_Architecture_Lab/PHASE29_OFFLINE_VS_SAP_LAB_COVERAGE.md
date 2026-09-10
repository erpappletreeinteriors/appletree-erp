# PHASE 29 — OFFLINE ERP vs. SAP ARCHITECTURE LAB — FULL COVERAGE MATRIX

Source: `appletree_erp_offline.html` sidebar (15 groups, ~100 items) vs. `SAP_Architecture_Lab/client_secure/index.html` NAV_GROUPS, as of Phase 28.

**Reminder of scope:** the Lab was never commissioned to be a full ERP replacement — it exists to prove SAP-style *accounting architecture* (Universal-Journal line items, three-way match, GR/IR clearing, Commitments, RBAC/SoD) can work. Many offline-ERP items are pure UI/business conveniences (Kanban boards, calendars) or entire domains (HR/Payroll) that were never in scope. This matrix reports the truth either way — COVERED and NOT REQUIRED are both legitimate, honest answers.

**Classification key:** COVERED / PARTIALLY COVERED / NOT COVERED / NOT REQUIRED / FUTURE ENHANCEMENT.

---

## Overview
| Offline ERP | Lab | Status |
|---|---|---|
| CEO Dashboard | Role-aware single Dashboard (CEO/Admin widget set) | COVERED — one adaptive screen instead of two |
| Dashboard | Dashboard | COVERED |

## Sales (14 items)
| Offline ERP | Lab | Status |
|---|---|---|
| Leads & Enquiries | Leads | COVERED |
| Quotations | Quotations | COVERED |
| Quotations Kanban | — | FUTURE ENHANCEMENT (UI convenience only) |
| Sales Orders | — | NOT REQUIRED — the Lab's architecture goes Quotation→Won→Project directly; there is no intermediate Sales Order document by design |
| Calendar | — | FUTURE ENHANCEMENT |
| Customers | Customer master exists and is used everywhere (Won, invoicing, AR) | PARTIALLY COVERED — no dedicated "browse/edit customers" screen |
| Partners & Referrals | — | NOT REQUIRED (no evidence this is part of the Lab's intended scope) |
| Payment Milestones | Billing Milestones | COVERED |
| Sales Invoices | Customer Invoice | COVERED |
| Receipts | Customer Receipt | COVERED |
| Customer Advances | Backend function `draftCustomerAdvance` + API route exist | PARTIALLY COVERED — no UI screen |
| Credit Note | Customer Credit/Debit Note | COVERED |
| Receivables Aging | AR Ageing | COVERED |
| Referral Commissions | — | NOT REQUIRED |

## Estimation (4 items)
| Offline ERP | Lab | Status |
|---|---|---|
| Estimator Dashboard | Folded into "Estimation & Costing" | PARTIALLY COVERED |
| Costing Masters | — | NOT COVERED as a distinct config screen |
| Costing Dashboard | — | NOT COVERED as a distinct screen |
| Costing Reports | — | NOT COVERED as a distinct screen |

*Underlying functions (createEstimationRequest, createCostingVersion) fully exist and work — this is a UI-depth gap, not a missing capability.*

## Projects (6 items)
| Offline ERP | Lab | Status |
|---|---|---|
| Projects | Projects | COVERED |
| Products / Items | Material master (used throughout, no dedicated "Products" framing) | PARTIALLY COVERED |
| Project BOM | BOM (project-scoped) | COVERED |
| Stage-Gate Dashboard | — | NOT COVERED |
| Deliverables & Deadlines | — | NOT COVERED |
| Project Performance | Project 360 + Company Profitability | COVERED |

## Purchases (9 items) — CLOSED IN PHASE 28
| Offline ERP | Lab | Status |
|---|---|---|
| Purchase Orders | Purchase Orders | COVERED |
| RFQ | RFQs | COVERED |
| Purchases (GRN) | GRNs | COVERED |
| Vendors / Bills | Supplier Bill | COVERED |
| Vendor Payments | Supplier Payment | COVERED |
| Debit Note | Supplier Debit Note | COVERED |
| Procurement Intelligence | Procurement Intelligence | COVERED (Phase 28) |
| Vendor Rating | Vendor Rating | COVERED (Phase 28) |
| Purchase & Vendor | Purchase & Vendor Report | COVERED (Phase 28) |

## Inventory (10 items) — CLOSED IN PHASE 28
| Offline ERP | Lab | Status |
|---|---|---|
| Warehouse Stock | Stock | COVERED |
| Purchases (GRN) | GRNs | COVERED |
| Material Issues | Material Issues | COVERED (Phase 28) |
| Returns | Returns | COVERED (Phase 28) |
| Damage Reports | Damage Reports | COVERED (Phase 28) |
| Stock Report | Stock Report | COVERED (Phase 28) |
| Locations | Locations | COVERED (Phase 28) |
| Stock by Location | Stock by Location | COVERED (Phase 28) |
| Stock Transfer | Transfer | COVERED |
| Stock Counts | Stock Counts | COVERED (Phase 28) |

## Operations (10 items) — CLOSED IN PHASE 28
| Offline ERP | Lab | Status |
|---|---|---|
| Labour & Wages | Labour & Wages | COVERED (Phase 28) |
| Project Expenses | Project Expenses | COVERED (Phase 28) — **see Finding P29-1: not yet wired into Project 360's Cost breakdown** |
| QC Checklist | QC (Execution group) | COVERED |
| QC Dashboard | QC Dashboard | COVERED (Phase 28) |
| Material Requests | Material Requirements/Requests (Procurement group) | COVERED (different grouping) |
| Project Timesheet | Project Timesheet | COVERED (Phase 28) |
| Tasks | Tasks | COVERED (Phase 28) |
| CAPA Register | CAPA (After-Sales group) | COVERED (different grouping) |
| Risk Register | Risk Register | COVERED (Phase 28) |
| Weekly Scorecard | Weekly Scorecard | COVERED (Phase 28) |

## Banking & Accounts (7 items)
| Offline ERP | Lab | Status |
|---|---|---|
| Chart of Accounts | Backend `createAccountMaster` exists | PARTIALLY COVERED — no browse/edit UI |
| Journal Entry | New Journal Voucher | COVERED |
| Bank & Cash | Bank Accounts + Bank/Cash Transfer | COVERED |
| Bank Reconciliation | Bank Reconciliation | COVERED |
| Financial Periods | Financial Periods | COVERED |
| Fixed Assets & Financing | Fixed Assets | PARTIALLY COVERED (financing/loan tracking not evidenced) |
| Accounting Export | Exports | COVERED |

## Financial Statements (14 items)
| Offline ERP | Lab | Status |
|---|---|---|
| General Ledger | Journal Register + Document Viewer (no per-account GL drill screen) | PARTIALLY COVERED |
| Trial Balance | Trial Balance | COVERED |
| **Balance Sheet** | — | **NOT COVERED — confirmed absent at both UI and domain layer (no `balanceSheet()` function exists anywhere)** |
| **Profit & Loss (company-wide)** | Project P&L and Company Profitability exist; NO company-wide GL-derived Income Statement | **NOT COVERED — see Finding P29-2** |
| Cash Flow Statement | — | NOT COVERED |
| Cash Flow Forecast | — | NOT COVERED |
| Budget vs Actual | — | NOT COVERED (no budget model exists — deliberately, per Phase 24's own documented decision not to invent one) |
| Cost vs Payment | — | NOT COVERED |
| Day Book / Voucher Register | Journal Register (functionally similar) | PARTIALLY COVERED |
| Customer Ledger | AR open items / Customer 360 (data exists, no ledger-style screen) | PARTIALLY COVERED |
| Vendor Ledger | AP open items (data exists, no ledger-style screen) | PARTIALLY COVERED |
| Payables Ageing | AP Ageing | COVERED |
| Reversal & Cancellation Register | Reversal exists functionally (Journal Register); no dedicated register view | PARTIALLY COVERED |
| Accounting Exceptions | — | NOT COVERED as a distinct screen |

## Reports & Insights (7 items)
| Offline ERP | Lab | Status |
|---|---|---|
| KPI Dashboard | — | NOT COVERED |
| Report Builder | — | NOT COVERED |
| Enterprise Insights | — | NOT COVERED |
| Data Quality & BI | — | NOT COVERED |
| Project P&L | Available via API + Project 360, no standalone screen | PARTIALLY COVERED |
| Work In Progress | — | NOT COVERED |
| Cost Centre Summary | Profit Centres exist; Cost Centre summary reporting does not | NOT COVERED |

## Site & Installation (3 items)
| Offline ERP | Lab | Status |
|---|---|---|
| Site Dashboard | — | NOT COVERED as a distinct dashboard |
| Deliveries | Delivery | COVERED |
| Installation | Installation | COVERED |

## Service (2 items)
| Offline ERP | Lab | Status |
|---|---|---|
| Service Tickets | Service Tickets | COVERED |
| Snag Management | Snags | COVERED |

## Factory / MES (11 items) — CLOSED IN PHASE 28
| Offline ERP | Lab | Status |
|---|---|---|
| Factory Dashboard | Factory Dashboard | COVERED (Phase 28) |
| Manufacturing Jobs | Production Orders | COVERED |
| Job Cards | Job Cards | COVERED (Phase 28) |
| Production | Production Orders | COVERED |
| BOM Templates | BOM (per-project, not a reusable template library) | PARTIALLY COVERED |
| Machines | Machines | COVERED (Phase 28) |
| Production Schedule | Production Schedule | COVERED (Phase 28) |
| Job Analysis | Job Analysis | COVERED (Phase 28) |
| Job Cost Sheet | Job Cost Sheet | COVERED (Phase 28) |
| Product Costing | Product Costing | COVERED (Phase 28) |
| Labour Performance | Labour Performance | COVERED (Phase 28) |

## HR & Payroll (12 items)
| Offline ERP | Lab | Status |
|---|---|---|
| Employees, Attendance, Payroll, Payroll Summary, Advances, Recruitment, Induction, Training Records, Performance Appraisals, Leave Requests, Recognition & Awards, Disciplinary Actions | — | **NOT REQUIRED** — HR/Payroll is a wholly separate business domain from accounting architecture and was never part of any Phase's stated scope. Zero coverage, explicitly and honestly reported, not silently ignored. |

## Master Data (7 items)
| Offline ERP | Lab | Status |
|---|---|---|
| Users & Roles | Backend `createUser` + API exist | PARTIALLY COVERED — no UI screen |
| Workers | Referenced by free-text name in Labour Wages/Timesheet, not a real master with IDs | NOT COVERED as a formal master |
| Item Master | Material master used throughout | PARTIALLY COVERED — no dedicated manage-materials screen |
| Vendor Master | Vendor master used throughout | PARTIALLY COVERED — no dedicated manage-vendors screen |
| Cost Centres | Backend `createCostCentreMaster` exists; `costCentreId` field used selectively (CC-INSTALLATION, CC-FACTORY) | PARTIALLY COVERED — no UI screen |
| Approval Workflows | Policy Configuration (thresholds) | PARTIALLY COVERED |
| Data Migration | Master Data Import | COVERED |

---

## Summary Findings From This Matrix (new this phase, not previously documented)

- **P29-1**: `projectFinancial360()`'s `cost.actual`/`cost.forecast` fields sum only accounts 5000+5100, excluding Project Expense (5200) added in Phase 28 — while `projectPL()`/`coreProjectPL()` (used elsewhere on the same screen) correctly sum all Expense-type accounts generically. See the main Phase 29 report for full detail — this is the audit's headline defect.
- **P29-2**: No company-wide Balance Sheet or Profit & Loss (Income Statement) exists anywhere in the Lab, at either the UI or domain layer. This is a genuine, previously-undocumented gap in an "accounting architecture" proof-of-concept, though it was never named in any prior phase's brief.
- A consistent pattern across many "PARTIALLY COVERED" rows: **backend + API logic exists (often from Phase 6B-15), but no accountant-facing UI screen was ever built for it** — Customer Advances, Chart of Accounts master, Cost Centre master, Users & Roles. This is the same class of gap Phase 25/28 closed for other features; these are the ones still open.

**None of the above were fixed or built this phase — Phase 29's Absolute Rule is audit only.**
