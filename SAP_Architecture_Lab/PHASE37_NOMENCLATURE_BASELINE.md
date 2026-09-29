# PHASE 37 — Nomenclature Baseline

**Date:** 2026-09-11. Part 1 deliverable. This document records the ACTUAL current terminology
in the codebase, verbatim, before any Phase 37 analysis or change. It is evidence, not judgment —
SAP-alignment decisions are made in `PHASE37_SAP_APPLETREE_TERMINOLOGY_CROSSWALK.md` and
`PHASE37_FINAL_NOMENCLATURE_AUDIT.md`, built on top of this baseline.

Checksums of the 3 primary application files at this exact baseline are in
`PHASE37_CHECKPOINT/CHECKSUMS.txt`; verbatim copies are in `PHASE37_CHECKPOINT/server/` and
`PHASE37_CHECKPOINT/client_secure/`.

## 1. Live navigation structure (the actual terminology every user sees first)

`client_secure/index.html` defines TWO navigation arrays. Only one is live:

- **`NAV_GROUPS`** (line 357) — inside a comment block starting "Old NAV_GROUPS, for reference
  (unused, safe to delete once this shell is verified in UAT)". **Dead code, not rendered.**
- **`MODULE_TREE`** (line 375) — the live structure actually rendered as the sidebar. **This is
  the authoritative source of module/menu terminology.**

Both arrays are almost, but not perfectly, identical in content — `MODULE_TREE` has several extra
tabs `NAV_GROUPS` lacks (e.g. `bomconsumption`, `replenishment`, `sitereturn`, `labourcost`,
`materialanalysis`, `tdsreport`, `acctquickreports`, `accountantmis`, `managementmis`, `crossdim`,
`hsnquality`) and regroups some existing tabs differently (e.g. `purchreq`/Purchase Requisitions
moves from a dedicated "FINANCE SOP" group in `NAV_GROUPS` into "PROCUREMENT" in `MODULE_TREE`;
`sitematerial`/Site Material moves from "FINANCE SOP" into "SITE OPERATIONS"). This is a
documentation-hygiene finding (dead code left with terminology drift relative to the live version)
— flagged in the final audit, not itself a live inconsistency since `NAV_GROUPS` never renders.

**`MODULE_TREE` — the live, authoritative module/tab inventory** (module name → tab id → label):

```
HOME → home → Dashboard

SALES & CRM → leads → Leads
            → quotations → Quotations

ESTIMATION & COSTING → estcost → Estimation & Costing
                      → boms → BOM
                      → bomconsumption → BOM Consumption Report

PROJECTS → projects → Projects
         → project360 → Project 360
         → budgetvariance → Budget vs Commitment vs Actual
         → changereq → Change Requests (Variations)

PROCUREMENT → matreq → Material Requirements
            → matreqs → Material Requests
            → rfqs → RFQs
            → squotes → Supplier Quotations
            → comparisons → Comparisons
            → pos → Purchase Orders
            → grns → GRNs
            → procint → Procurement Intelligence
            → replenishment → Replenishment Recommendation
            → vendorrating → Vendor Rating
            → purchvendor → Vendor-wise Purchase Report
            → purchreq → Purchase Requisitions

INVENTORY → grnstock → Stock
          → movements → Movement Ledger
          → invtransfer → Transfer
          → invadjust → Adjustment
          → matissues → Material Issues
          → sitereturn → Material Return (Site)
          → returns → Purchase Returns
          → damagereports → Damage Reports
          → stockreport → Stock Report
          → locations → Locations
          → stockbyloc → Stock by Location
          → stockcounts → Stock Counts
          → materialanalysis → Material Analysis

SITE OPERATIONS → labourwages → Labour & Wages
                → labourcost → Labour Cost Analysis
                → projexpenses → Project Expenses
                → qcdash → QC Dashboard
                → timesheet → Project Timesheet
                → tasks → Tasks
                → riskregister → Risk Register
                → weeklyscorecard → Weekly Scorecard
                → sitematerial → Site Material

PRODUCTION & JOB WORK → prods → Production Orders
                       → factorydash → Factory Dashboard
                       → machines → Machines
                       → jobcards → Job Cards
                       → prodschedule → Production Schedule
                       → jobanalysis → Job Analysis
                       → jobcostsheet → Job Cost Sheet
                       → productcosting → Product Costing
                       → labourperf → Labour Performance
                       → jobwork → Job Work

EXECUTION & DELIVERY → dispatches → Dispatch
                      → deliveries → Delivery
                      → installations → Installation
                      → qc → QC
                      → snags → Snags
                      → handovers → Handover
                      → milestones → Billing Milestones

FINANCE → workflow → Document Workflow
        → newje → New Journal Voucher
        → ci → Customer Invoice
        → cr → Customer Receipt
        → ccn → Customer Credit/Debit Note
        → si → Supplier Bill
        → sp → Supplier Payment
        → custadvance → Customer Advance
        → jetmpl → Journal Templates
        → jerec → Recurring Entries
        → jeimport → Import (CSV)
        → jereg → Journal Register
        → docviewer → Document Viewer
        → bankrecon → Bank Reconciliation
        → recon → Reconciliation
        → finperiods → Financial Periods
        → fixedassets → Fixed Assets
        → banktransfer → Bank / Cash Transfer
        → supplierdn → Supplier Debit Note
        → bankimport → ICICI Bank Import
        → masterimport → Master Data Import
        → openingbalance → Opening Balances
        → sopdash → Compliance Dashboard
        → sopconfig → SOP Configuration
        → paymentreq → Payment Requests
        → pettycash → Petty Cash
        → apobeway → APOB & E-way Bill
        → compliancereports → ITC / BOQ Reports
        → tdsreport → TDS Reporting

FINANCIAL STATEMENTS → balancesheet → Balance Sheet
                      → companypl → Company Profit & Loss
                      → generalledger → General Ledger
                      → customerledger → Customer Ledger
                      → supplierledger → Supplier Ledger
                      → tb → Trial Balance
                      → arage → AR Ageing
                      → apage → AP Ageing

SERVICE & AFTER-SALES → cust360 → Customer 360
                       → custprofit → Customer Profitability
                       → warranty → Warranty
                       → complaints → Complaints
                       → tickets → Service Tickets
                       → visits → Service Visits
                       → amc → AMC
                       → amcsched → AMC Schedule
                       → svcbilling → Service Billing
                       → capa → CAPA

REPORTS & ANALYTICS → acctquickreports → Accounting & MIS Quick Reports
                     → accountantmis → Accountant MIS
                     → managementmis → Management MIS
                     → crossdim → Cross-Dimensional Reports
                     → companyprofit → Company Profitability
                     → hsnquality → HSN Data Quality
                     → exports → Exports
                     → audit → Audit Log

MASTER DATA → branches → Branches
            → profitcentres → Profit Centres
            → bankaccounts → Bank Accounts
            → chartofaccounts → Chart of Accounts
            → costcentres → Cost Centres

ADMINISTRATION → policyconfig → Policy Configuration
               → usersroles → Users & Roles
               → deny → Try Unauthorized Action
```

Note two immediate, real ambiguities visible from this inventory alone (analyzed further in the
final audit):
- **"Material Requirements" (matreq) vs "Material Requests" (matreqs)** — two separate menu items
  under PROCUREMENT with near-identical names. Investigated in the full audit.
- **"cr" as a tab id means "Customer Receipt"** here, but the document prefix `CR` (via
  `createChangeRequest`) means **"Change Request."** Two entirely different concepts share the
  two-letter code `CR` in different parts of the system (tab id namespace vs document-prefix
  namespace) — flagged as a genuine ambiguity, investigated further.

## 2. Roles

`server/domain.js:352` —
```js
const ROLES = ['Admin','CEO','Accountant','FinanceManager','ProjectManager','Purchase','Sales','Estimator','SiteInCharge','Viewer'];
```

## 3. Document number prefixes (internal record ID AND, via `docTypeCode`, the user-facing voucher
number prefix) — every `nextDocNumber('XXX'...)` call site in `server/domain.js`, mapped to its
enclosing function:

| Prefix | Function | Prefix | Function |
|---|---|---|---|
| AMC | createAMCContract | MR | createMaterialRequest |
| BOM | createBOM | MRQ | createMaterialRequirement |
| BXFR | createBankTransfer | MRS | submitSiteMaterialRequisition |
| CAPA | createCAPACase | PAY | postSupplierPayment |
| CLR | applyClearing | PCF | createPettyCashFloat |
| CMP | createComplaint | PCV | recordPettyCashVoucher |
| CN | createCustomerCreditNote | PEXP | recordProjectExpense |
| CR | createChangeRequest | PO | submitPurchaseOrder |
| DC | issueToSite | PR | submitPurchaseRequisition |
| DLV | createDelivery | PRET | createPurchaseReturn |
| DMG | createDamageReport | PROD | createProductionOrder |
| DN | createCustomerDebitNote | QCK | createQCChecklist |
| DSP | approveDispatch | QTN | nextQuotationNo |
| EWB | createEwayBillRecord | RCPT | postCustomerReceipt |
| FA | capitalizeFixedAsset | REC | createRecurringEntry |
| GRN | createGRN | RFQ | createRFQ |
| HO | createHandover | SCN | createSupplierCreditNote |
| IADJ | createInventoryAdjustment | SCT | createStockCount |
| INST | createInstallation | SDN | createSupplierDebitNote |
| ISS | (needs deeper context — see full audit) | SMR | createSiteMaterialReceipt |
| ITCR | reverseITCForWriteOff | SNG | createSnag |
| ITR | createInventoryTransfer | SRET | returnFromSite |
| JC | createJobCard | TKT | createServiceTicket |
| JE | (needs deeper context — see full audit) | VIS | createServiceVisit |
| JT | createJournalTemplate | WAR | createWarranty |
| JWO | dispatchToJobWorker | XBA | createExcessBillingApprovalRequest |
| LBR | recordLabourWages | XMI | createExcessMaterialIssueRequest |

**51 distinct document-number prefixes** exist. This is the ground truth for Part 32 (Document
Numbering) and a primary input to Part 16 (Document Type Nomenclature).

`HANDOVER_PACKAGE/05_HANDOVER_DOCUMENTATION/22_DOCUMENT_NUMBERING.md` (existing documentation,
pre-dates Phase 37) confirms the numbering FORMAT is `PREFIX/FINANCIAL-YEAR/SEQUENCE` (e.g.
`INV/2026-27/0001`) for the user-visible voucher number, generated via the same `nextDocNumber()`
function shown above (`postJournalEntry()` calls `nextDocNumber(d.docTypeCode, d.date)` at
`domain.js:2149`) — confirming the prefixes above ARE what a real user sees, not merely an internal
implementation detail.

## 4. Status value dictionaries — every `*_STATUSES` constant in `server/domain.js`

```
LEAD_STATUSES            = ['NEW','CONTACTED','QUALIFIED','ESTIMATION','QUOTATION','NEGOTIATION','WON','LOST','ON HOLD']
ESTIMATION_STATUSES      = ['DRAFT','SUBMITTED','IN PROGRESS','COMPLETED','CANCELLED']
QUOTATION_STATUSES       = ['Draft','Submitted','PendingApproval','Approved','Sent','Accepted','Rejected','Superseded']
PROJECT_STATUSES         = ['DRAFT','PLANNED','ACTIVE','ON HOLD','COMPLETED','CLOSED']
DESIGN_STATUSES          = ['Submitted','UnderReview','Approved','RevisionRequested']
MR_STATUSES               = ['DRAFT','SUBMITTED','APPROVED','REJECTED','CONVERTED']
PO_STATUSES               = ['Draft','Submitted','Approved','PartiallyReceived','FullyReceived','Closed','Cancelled']
PROD_STATUSES              = ['Draft','Released','InProgress','PartiallyCompleted','Completed','Closed','OnHold','Cancelled']
DISPATCH_STATUSES          = ['Draft','Ready','Approved','Dispatched','Delivered','Cancelled']
INSTALLATION_STATUSES      = ['Planned','InProgress','Completed','OnHold']
QC_STATUSES                = ['Pending','InProgress','Passed','Failed']
SNAG_STATUSES               = ['Open','Assigned','InProgress','Resolved','Verified','Closed']
CHANGE_REQUEST_STATUSES    = ['Draft','Submitted','Approved','Rejected','Cancelled']
TASK_STATUSES               = ['Open','InProgress','Done','Cancelled']
BOM_STATUSES                 = ['Draft','Submitted','Approved','Rejected','Superseded']
MACHINE_STATUSES             = ['Available','InUse','Maintenance','Down']
JOB_CARD_STATUSES             = ['Planned','InProgress','Completed','Cancelled']
COMPLAINT_STATUSES  = ['NEW','TRIAGED','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER','WAITING_PARTS','RESOLVED','CLOSED','REJECTED']
TICKET_STATUSES     = ['NEW','ASSIGNED','IN_PROGRESS','WAITING_PARTS','RESOLVED','CLOSED','REJECTED']
VISIT_STATUSES      = ['PLANNED','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED']
AMC_STATUSES        = ['DRAFT','ACTIVE','EXPIRED','CANCELLED','RENEWED']
CAPA_STATUSES       = ['OPEN','ANALYSIS','ACTION','VERIFICATION','EFFECTIVENESS','CLOSED']
PR_STATUSES                = ['Draft','Submitted','Approved','Rejected','Converted','Cancelled']
MRS_STATUSES                = ['Draft','Submitted','Approved','Rejected','Issued','Cancelled']
JOB_WORK_ORDER_STATUSES      = ['Dispatched','PartiallyReturned','Returned','DirectDispatched']
```

**24 distinct status enumerations found.** A real, structural inconsistency is already visible at
the baseline level: roughly half use `UPPERCASE_WITH_SPACES_OR_UNDERSCORES`
(`LEAD_STATUSES`, `ESTIMATION_STATUSES`, `MR_STATUSES`, `COMPLAINT_STATUSES`, `TICKET_STATUSES`,
`VISIT_STATUSES`, `AMC_STATUSES`, `CAPA_STATUSES`, `PROJECT_STATUSES` — 9 of 24), while the other
half use `PascalCase` (`QUOTATION_STATUSES`, `DESIGN_STATUSES`, `PO_STATUSES`, `PROD_STATUSES`,
`DISPATCH_STATUSES`, `INSTALLATION_STATUSES`, `QC_STATUSES`, `SNAG_STATUSES`,
`CHANGE_REQUEST_STATUSES`, `TASK_STATUSES`, `BOM_STATUSES`, `MACHINE_STATUSES`,
`JOB_CARD_STATUSES`, `PR_STATUSES`, `MRS_STATUSES`, `JOB_WORK_ORDER_STATUSES` — 15 of 24). This is
a genuine cross-module naming-convention inconsistency (Part 22), analyzed further in the final
audit — it is a display/internal-value inconsistency, not necessarily user-visible if the UI always
re-labels these for display (verified in the full audit).

## 5. Terminology usage counts (contested term pairs, Part 41), raw grep counts as of this baseline

| Term | `server/domain.js` | `client_secure/index.html` |
|---|---|---|
| "Supplier" (whole word) | 57 | 44 |
| "Vendor" (whole word) | 135 total incl. compound identifiers* | 49 |
| "Business Partner" (exact phrase) | 0 | 1 (incidental, not a real feature — confirmed in full audit) |
| "Material" (whole word) | 135 | 159 |
| "Item" (whole word) | — | 5 |
| "Product" (whole word) | — | 6 |

*"Vendor" count in `domain.js` includes internal identifiers like `vendorId`, `VENDOR_LOCKED_FIELDS_WITH_HISTORY` — the master-data object is internally a "vendor" (variable/field names), while transaction/document LABELS consistently say "Supplier" (Supplier Bill, Supplier Credit Note, Supplier Debit Note). One confirmed, concrete inconsistency already found at baseline: `domain.js:274` seeds `{code:'PAY', label:'Vendor Payment', ...}` in the `glDocumentTypes` table, while `domain.js:2992`'s actual posting code uses `sourceType:'Supplier Payment'` for the same real transaction — **two different labels for the identical document type**, investigated fully in the crosswalk.

## 6. Scope and method note

This baseline was built from direct, targeted extraction (grep + function-context mapping) against
the live source files, not from memory or assumption. The full terminology inventory (Part 2) and
domain-by-domain audits (Parts 3-21) draw on this baseline plus further targeted extraction,
documented with file:line evidence throughout. Given the codebase's size (~22,000 lines across the
3 primary files, plus dozens of documentation files), the audit targets every STRUCTURALLY
significant term — module names, document types, status values, master data objects, abbreviations,
report names, and the specific disputed term-pairs Part 41 names explicitly — with real evidence for
each. It does not claim to have manually read every one of the thousands of individual tooltip/
error-message strings in the codebase; where a domain was sampled rather than exhaustively
enumerated, that is stated explicitly rather than implied.
