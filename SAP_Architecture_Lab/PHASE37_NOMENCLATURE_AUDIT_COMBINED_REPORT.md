# Phase 37 — SAP-Grade Nomenclature Audit — Combined Report

**Date:** 2026-09-11. This single document consolidates all Phase 37 deliverables — baseline,
inventory, crosswalk, scorecard, change plan, documentation cross-check, terminology standard, and
final verdict — into one report. The individual source documents remain on disk as detailed backing
evidence: `PHASE37_NOMENCLATURE_BASELINE.md`, `PHASE37_CURRENT_NOMENCLATURE_INVENTORY.md`,
`PHASE37_SAP_APPLETREE_TERMINOLOGY_CROSSWALK.md`, `PHASE37_SAP_NOMENCLATURE_SCORECARD.md`,
`PHASE37_NOMENCLATURE_CHANGE_PLAN.md`, `PHASE37_DOCUMENTATION_TERMINOLOGY_AUDIT.md`,
`APPLETREE_ERP_TERMINOLOGY_STANDARD.md`. Checksums/checkpoint copies of the 3 audited files
(`server/domain.js`, `server/server.js`, `client_secure/index.html`, all taken at the start of this
phase) are in `PHASE37_CHECKPOINT/`.

**No code has been changed.** This is an audit, crosswalk, and recommendation deliverable only —
implementation is explicitly gated on the user's review and approval of the Change Plan section
below.

**Note on numbering**: this project already has an unrelated, earlier `PHASE37_ARCHITECTURAL_ENFORCEMENT_FORENSIC_REPORT.md`
(dated 2026-09-05, transaction-atomicity topic). This nomenclature audit shares the same "Phase 37"
number — a collision worth resolving in the project's own phase history, flagged for the user's
decision, not resolved unilaterally here.

---

## 1. Executive Summary

This audit examined the Appletree ERP's terminology — module names, document types, master data,
status values, field labels, abbreviations, reports, and 3 primary documentation files — against
SAP S/4HANA and SAP Business One terminology, across ~22,000 lines spanning `server/domain.js`,
`server/server.js`, and `client_secure/index.html`.

**Bottom line**: the terminology is substantially SAP-aligned and internally disciplined. Verb usage
(Post/Submit/Approve/Reverse/Cancel/Close/Clear) was confirmed, via direct function-level sampling,
to have exactly one non-overlapping meaning each across roughly 250 routes — a genuinely disciplined
result. A small number of CONCRETE, confirmed inconsistencies exist — most importantly a
Supplier/Vendor split across three different layers of the codebase, and one document-type label
("Vendor Payment") that disagrees with the rest of the system's "Supplier Payment" wording for the
identical transaction. Several places where Appletree deliberately does NOT use literal SAP wording
(GRN instead of "Goods Receipt," Material Issue instead of "Goods Issue," Stock Count instead of
"Physical Inventory," Snag instead of "Punch List," Job Worker instead of "Subcontractor") were
investigated and confirmed to be CORRECT choices for this India-SME audience, not naming defects —
the audit explicitly recommends **not** changing these, even though they diverge from literal SAP
terminology.

**Final Verdict: B — MOSTLY ALIGNED, MINOR TERMINOLOGY GAPS.** Scorecard average 4.2/5 across 19
domains, none below 3. Full reasoning in §9 below.

---

## 2. Method and SAP Reference Scope

Extraction was direct against the live source (grep + function-context mapping), not from memory,
with every claim cited to a real file:line. Given the codebase's size, every module, document type,
status enum, and abbreviation was covered exhaustively; prose (hints, tooltips, error messages) was
sampled representatively, with every example cited to a real line — not claimed to be a literal
reading of every one of the thousands of individual strings in the app.

**Which SAP product is this codebase closer to?** Evidence:
- Single-entity, SME-scale operation (one company, branches — no multi-company-code group
  structure; no `CompanyCode` concept exists, `DB.branches` is the closest analog).
- A simple document flow (PR→PO→GRN→Bill→Payment→Clearing) with no multi-level release strategies,
  no purchasing-org/purchasing-group hierarchy, no plant-vs-storage-location split — matching
  **Business One's** flatter document model far more than S/4HANA's MM/FI multi-org structure.
- But the codebase never uses B1's own literal document names — "Goods Receipt PO," "A/P Invoice,"
  "A/R Invoice" are all confirmed **absent**. It uses more generic, India-market-familiar terms
  ("GRN," "Supplier Bill," "Customer Invoice") sitting between the two products.
- Cost Centre/Profit Centre as independent GL-line tagging dimensions (not a hierarchy) is closer to
  **S/4HANA CO's** dimension model than to B1's simpler project/cost-centre attachment.
- Clearing, the GR/IR Clearing account, and the Draft→Submit→Approve→Post workflow are universal to
  both products.

**Decision**: Business One terminology is the primary reference for document/transaction structure;
S/4HANA terminology is used for accounting/controlling concepts where B1 has no equivalent
distinction. Every crosswalk row below states which source applies, per the brief's own rule that
S/4HANA and B1 differences must be documented, not silently resolved.

This audit did not have live access to SAP's official documentation portal in this environment —
citations reflect widely and consistently documented SAP product terminology, not a single
blog/forum source, but any disputed mapping should be independently verified before being used in a
customer-facing "SAP-grade" claim.

---

## 3. Live Navigation Structure (ground truth)

`client_secure/index.html` defines two navigation arrays. Only one is live:
- **`NAV_GROUPS`** (line 357) — inside a comment marked "unused, safe to delete once this shell is
  verified in UAT." **Dead code, never rendered.**
- **`MODULE_TREE`** (line 375) — the live structure actually rendered as the sidebar. The
  authoritative source of module/menu terminology. `NAV_GROUPS` is missing several tabs `MODULE_TREE`
  has (`bomconsumption`, `replenishment`, `sitereturn`, `labourcost`, `materialanalysis`,
  `tdsreport`, `acctquickreports`, `accountantmis`, `managementmis`, `crossdim`, `hsnquality`) and
  groups some tabs differently — a documentation-hygiene risk if anyone ever re-enables the dead
  array, not a live inconsistency today.

**`MODULE_TREE`** (module → tab id → label), extracted verbatim:

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

Two immediate ambiguities visible from this inventory alone (investigated in full below):
- **"Material Requirements" (matreq) vs "Material Requests" (matreqs)** — near-identical labels
  under PROCUREMENT.
- **"cr" as a tab id means "Customer Receipt"**, but the document prefix `CR` (via
  `createChangeRequest`) means **"Change Request."** — investigated below and found NOT to collide
  in practice (see §5).

**Roles** — `server/domain.js:352`:
```js
const ROLES = ['Admin','CEO','Accountant','FinanceManager','ProjectManager','Purchase','Sales','Estimator','SiteInCharge','Viewer'];
```

---

## 4. Document Type Dictionary

Two overlapping but distinct registries exist. **51 `nextDocNumber()` prefixes** (internal record ID
+ user-facing voucher prefix), mapped to their enclosing function:

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
| ISS | createMaterialIssue | SMR | createSiteMaterialReceipt |
| ITCR | reverseITCForWriteOff | SNG | createSnag |
| ITR | createInventoryTransfer | SRET | returnFromSite |
| JC | createJobCard | TKT | createServiceTicket |
| JE | postJournalEntry | VIS | createServiceVisit |
| JT | createJournalTemplate | WAR | createWarranty |
| JWO | dispatchToJobWorker | XBA | createExcessBillingApprovalRequest |
| LBR | recordLabourWages | XMI | createExcessMaterialIssueRequest |

The format is `PREFIX/FINANCIAL-YEAR/SEQUENCE` (e.g. `INV/2026-27/0001`) for the visible voucher
number, generated via `nextDocNumber(d.docTypeCode, d.date)` — confirmed by
`HANDOVER_PACKAGE/05_HANDOVER_DOCUMENTATION/22_DOCUMENT_NUMBERING.md`, which also documents the
separate, permanent internal record ID (e.g. `JE-0047`) that a user rarely sees directly.

**The `glDocumentTypes` label registry** (`server/domain.js:269-327` base seed) — the authoritative
label used for GL-postable document types:

| code | label | prefix | code | label | prefix |
|---|---|---|---|---|---|
| JE | Journal Voucher | JV | JT | Journal Template | JT |
| INV | Sales Invoice | INV | REC | Recurring Entry | REC |
| PO | Purchase Order | PO | FA | Fixed Asset | FA |
| RCPT | Customer Receipt | RCPT | OB | Opening Balance | OB |
| PAY | **Vendor Payment** *(inconsistent, see §5)* | PAY | BXFR | Bank/Cash Transfer | BXFR |
| CN | Credit Note | CN | SDN | Supplier Debit Note | SDN |
| DN | Debit Note | DN | DMG | Damage Report | DMG |
| BILL | Supplier Bill | BILL | SCT | Stock Count | SCT |
| CLR | Clearing Document | CLR | LBR | Labour Wages | LBR |
| QTN | Quotation | QTN | PEXP | Project Expense | PEXP |
| MR | Material Request | MR | JC | Job Card | JC |
| RFQ | RFQ | RFQ | PR | Purchase Requisition | PR |
| GRN | Goods Receipt Note | GRN | MRS | Material Requisition Slip (Site) | MRS |
| PRET | Purchase Return | PRET | DC | Delivery Challan | DC |
| SCN | Supplier Credit Note | SCN | SMR | Site Material Receipt | SMR |
| PROD | Production Order | PROD | PCV | Petty Cash Voucher | PCV |
| ISS | Material Issue | ISS | PCF | Petty Cash Float | PCF |
| DSP | Dispatch | DSP | JWO | Job Work Order | JWO |
| DLV | Delivery Confirmation | DLV | EWB | E-way Bill Record | EWB |
| INST | Installation | INST | ITCR | ITC Reversal | ITCR |
| QCK | QC Checklist | QCK | SNG | Snag | SNG |
| HO | Handover | HO | WAR | Warranty | WAR |
| CMP | Complaint | CMP | TKT | Service Ticket | TKT |
| VIS | Service Visit | VIS | AMC | AMC Contract | AMC |
| CAPA | CAPA Case | CAPA | ITR | Inventory Transfer | ITR |
| IADJ | Inventory Adjustment | IADJ | | | |

Plus migration-guard-patched additions (pushed at runtime for pre-existing databases): XMI (Excess
Material Issue Approval), BOM (Bill of Materials), XBA (Excess Billing Approval), CR (Change
Request), MRQ (Material Requirement). One confirmed registry gap: the guard list at `domain.js:850`
references `['SRET','Site Return']` as a Phase-33 addition, but no such entry exists in the base
seed array — flagged as a REVIEW item (§8) pending a direct code check on whether this is a stale
comment or a real latent numbering gap.

## 5. Status Value Dictionary

Every `*_STATUSES` constant in `server/domain.js` — **26 distinct status enumerations**:

```
LEAD_STATUSES            = ['NEW','CONTACTED','QUALIFIED','ESTIMATION','QUOTATION','NEGOTIATION','WON','LOST','ON HOLD']
ESTIMATION_STATUSES      = ['DRAFT','SUBMITTED','IN PROGRESS','COMPLETED','CANCELLED']
QUOTATION_STATUSES       = ['Draft','Submitted','PendingApproval','Approved','Sent','Accepted','Rejected','Superseded']
PROJECT_STATUSES         = ['DRAFT','PLANNED','ACTIVE','ON HOLD','COMPLETED','CLOSED']
DESIGN_STATUSES          = ['Submitted','UnderReview','Approved','RevisionRequested']
MR_STATUSES              = ['DRAFT','SUBMITTED','APPROVED','REJECTED','CONVERTED']
PO_STATUSES              = ['Draft','Submitted','Approved','PartiallyReceived','FullyReceived','Closed','Cancelled']
PROD_STATUSES            = ['Draft','Released','InProgress','PartiallyCompleted','Completed','Closed','OnHold','Cancelled']
DISPATCH_STATUSES        = ['Draft','Ready','Approved','Dispatched','Delivered','Cancelled']
INSTALLATION_STATUSES    = ['Planned','InProgress','Completed','OnHold']
QC_STATUSES              = ['Pending','InProgress','Passed','Failed']
SNAG_STATUSES            = ['Open','Assigned','InProgress','Resolved','Verified','Closed']
CHANGE_REQUEST_STATUSES  = ['Draft','Submitted','Approved','Rejected','Cancelled']
TASK_STATUSES            = ['Open','InProgress','Done','Cancelled']
BOM_STATUSES             = ['Draft','Submitted','Approved','Rejected','Superseded']
MACHINE_STATUSES         = ['Available','InUse','Maintenance','Down']
JOB_CARD_STATUSES        = ['Planned','InProgress','Completed','Cancelled']
WARRANTY_STATUSES_MANUAL = ['VOID','CANCELLED']  (time-computed statuses NOT_STARTED/ACTIVE/EXPIRED are derived, never stored)
COMPLAINT_STATUSES  = ['NEW','TRIAGED','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER','WAITING_PARTS','RESOLVED','CLOSED','REJECTED']
TICKET_STATUSES     = ['NEW','ASSIGNED','IN_PROGRESS','WAITING_PARTS','RESOLVED','CLOSED','REJECTED']
VISIT_STATUSES      = ['PLANNED','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED']
AMC_STATUSES        = ['DRAFT','ACTIVE','EXPIRED','CANCELLED','RENEWED']
CAPA_STATUSES       = ['OPEN','ANALYSIS','ACTION','VERIFICATION','EFFECTIVENESS','CLOSED']
PR_STATUSES         = ['Draft','Submitted','Approved','Rejected','Converted','Cancelled']
MRS_STATUSES        = ['Draft','Submitted','Approved','Rejected','Issued','Cancelled']
JOB_WORK_ORDER_STATUSES = ['Dispatched','PartiallyReturned','Returned','DirectDispatched']
```

**A real, structural naming-convention inconsistency**: 10 enums use `UPPERCASE_WITH_UNDERSCORES`
and 16 use `PascalCase`. This is an internal representation split, not necessarily user-visible —
most screens render a styled status "pill" with its own label, not the raw enum string. Recommend
verifying the display layer maps every enum before deciding whether the raw values need normalizing
(see Management Decision #2 in §8) — real code risk for a possibly-zero user-facing benefit.

**Workflow verbs** — `Post`/`Submit`/`Approve`/`Reverse`/`Cancel`/`Close`/`Clear` — were verified via
direct function-name sampling (domain.js `postXxx`/`submitXxx`/`approveXxx`/`reverseEntry`/
`cancelXxx`/`closeXxx`/`clear*` families, ~250 routes) to each carry exactly one, non-overlapping
meaning:
- **Post** = commit a financial/GL or stock transaction (final, generally irreversible-without-a-
  reversal step): `postJournalEntry`, `postCustomerReceipt`, `postSupplierPayment`,
  `postInventoryMovement`, `postAssetDepreciation`, etc.
- **Submit** = move a Draft into the approval queue (the step before Approve, never a GL posting):
  `submitDraft`, `submitQuotation`, `submitPurchaseOrder`, `submitBOM`, etc.
- **Approve** = authorize a Submitted document to proceed (maker-checker second step):
  `approveDraft`, `approvePurchaseOrder`, `approveBOM`, etc.
- **Release** — confirmed **not used as a UI button anywhere** (zero button-label matches). Has two
  internal-only meanings: a Production Order status value (`'Released'`), and "free up a held/
  reserved financial amount" (`releaseCommitment`, `releaseInvoiceReservation`) — neither is a
  document-lifecycle action a user clicks. Appletree's "Approve" already covers what SAP calls
  "Release" for POs/production orders.
- **Reverse** = undo a *posted* GL entry via a compensating JE (`reverseEntry`) — distinct from
  `reverseITCForWriteOff` (a GST input-tax-credit reversal, a different concept sharing the verb).
- **Cancel** = void/terminate a document before or after approval, distinct from Reverse:
  `cancelDraft`, `cancelChangeRequest`, `cancelProductionOrder`, etc.
- **Close** = mark a document/entity finished/finalized (`closeProject`, `closeSnag`,
  `closeCAPACase`) — and, separately, `closeFinancialPeriod` = lock an accounting period against new
  postings.
- **Clear** — two cleanly separated senses: the **accounting sense** (settle an AR/AP open item
  against a payment/receipt — `DB.clearings`, `applyClearing`, account 2050 "GR/IR Clearing," a
  dedicated `clear` role-permission), and the **generic UI sense** ("Clear Filters" buttons on 5+
  list screens) — confirmed zero overlap between the two.
- **Save** — confirmed used ONLY on configuration screens (Policy Config, GST Config, Cash Limits,
  PO Config), never on a transactional document (those use Draft/Submit/Approve/Post) — a clean,
  consistent split.

---

## 6. Full Terminology Findings (inventory + crosswalk, combined)

Each row: current term, what it actually means (with evidence), the SAP equivalent and which
product it comes from, and the recommended action.

| Current Term | Meaning / Evidence | SAP Equivalent (source) | Finding | Action |
|---|---|---|---|---|
| **Supplier vs Vendor** | Display layer (documents, UI, menu) predominantly says "Supplier" (Supplier Bill, Supplier Credit/Debit Note, Supplier Payment heading — 44-57 hits); internal code (`vendorId`, `DB.vendors`, `VENDOR_LOCKED_FIELDS...`) says "Vendor" throughout (135 hits incl. identifiers) — confirmed even `postSupplierPayment({vendorId,...})` mixes both in one function signature. Documentation (SOP: 13 Supplier/2 Vendor; Manual: 2/0) is already predominantly "Supplier," reinforcing this as the intended canonical term. | Supplier (S/4HANA, post-2015 rename) / Vendor (Business One) | Real, 3-layer inconsistency | **MUST CHANGE** the one orphaned display label (below); internal `vendorId`/`DB.vendors` may stay per API-compatibility (Part 31) — zero user-facing benefit to a ~135-reference internal rename |
| **"Vendor Payment" vs "Supplier Payment"** | `domain.js:274` seeds `{code:'PAY', label:'Vendor Payment'}` — the SOLE "Vendor Payment" occurrence anywhere in the 3 files. Every other surface (`sourceType:'Supplier Payment'` at domain.js:2992, UI heading index.html:288, menu label, "Supplier Payment Register" report name) already says "Supplier Payment," for the identical transaction. | Supplier Payment (S/4HANA) | Confirmed label bug — 2 names for 1 document type | **MUST CHANGE**: `domain.js:274` label → `'Supplier Payment'`. Zero risk — display string only, `code`/`prefix` (`PAY`) unchanged, no numbering/GL/voucher impact |
| **"Business Partner"** | index.html:3569 — the JE print-template's one `<td>Business Partner</td>` cell, labeling the `party` field. Zero occurrences elsewhere in domain.js/server.js; no `businessPartner` field/master exists anywhere — Customer and Vendor remain fully separate masters everywhere else. | Business Partner (S/4HANA's real unified-master architecture) | Misleading — implies an architecture that doesn't exist in this codebase | **MUST CHANGE** the one label to "Party" or "Customer/Vendor." **ARCHITECTURAL TERMINOLOGY DIFFERENCE** — do not adopt Business Partner as a real concept without first unifying the Customer/Vendor masters (a genuine architecture change, out of this audit's scope) |
| **GRN** | 147 (domain.js) + 64 (client) hits, universal — menu, functions (`createGRN`), stats, messages. Registry spells out "Goods Receipt Note" once (domain.js:282); UI spells it out once, parenthetically (index.html:226). SOP (`APPLETREE_ERP_SOP.md:299`) spells it out on first use too — a BETTER model of the abbreviation-discipline rule than the live UI. | Goods Receipt (S/4HANA, MIGO) / Goods Receipt PO (B1) | Deliberate, consistent, India-ERP-standard departure from either SAP product's literal term | **DO NOT CHANGE** |
| **Material Issue** | 21 client hits, universal. "Goods Issue" confirmed **absent** everywhere in the codebase. The `ISS` prefix maps to `createMaterialIssue` — "the ONLY event that hits Project Actual Cost" (domain.js:5363 comment). | Goods Issue (both SAP products) | Clean, deliberate departure | **DO NOT CHANGE** — would cost real India-market user retraining for a cosmetic SAP-alignment gain |
| **Material Return (Site) vs Purchase Returns** | Two genuinely different, code-verified documents: `returnFromSite` (site→warehouse, NO vendor/GRN reference, zero GL for "Usable" condition, write-off GL for "Damaged"/"Lost") vs `createPurchaseReturn` (vendor-facing, requires a `grnId`, reduces vendor payable via account 2050). Already disambiguated in the UI by the "(Site)" qualifier. | Goods Movement/Transfer Posting (S/4HANA, generic) vs Return to Vendor (both products) | None — correctly distinguished | **DO NOT CHANGE** |
| **Stock vs Inventory** | "Stock" (30 hits) = the on-hand-quantity report/figure (Stock Report, Stock by Location, Stock Counts, Stock Movement Ledger). "Inventory" (23 hits) = the module/domain name and GL valuation concept ("Inventory Adjustment," account 1200 "Inventory"). Cleanly distinguished except one hybrid heading, "Inventory Stock (Moving Average)" (index.html:227). | Both SAP products use "Stock" for on-hand qty and "Inventory" for the module/valuation the same way | None (one cosmetic hybrid heading) | **DO NOT CHANGE** (optional: split the one hybrid heading) |
| **Stock Count** | `createStockCount`, `DB.stockCounts`, prefix `SCT`. "Physical Inventory" confirmed **absent** everywhere. | Physical Inventory Document (S/4HANA) / Inventory Counting Transaction (B1) | Deliberate departure | **DO NOT CHANGE** |
| **Warehouse / Site / Location** | Three distinct real DB collections: `DB.warehouses` (seed-only, no `createWarehouse` — a small fixed set of physical warehouses), `DB.sites` (`createSite`, own pooled inventory ledger via `getSiteStockLevel`), `DB.locations` (`createLocation`, explicitly documented as "a lightweight, OPTIONAL bin/shelf dimension within a warehouse," requires parent `warehouseId`). No "Storage Location" term exists anywhere. | Warehouse (B1) / Plant+Storage Location (S/4HANA, more granular) for Warehouse; no SAP equivalent for Site; Storage Location (S/4HANA)/Bin Location (B1) for Location | None — all three correctly, distinctly modeled | **DO NOT CHANGE** any of the three. Site is an **Appletree business term** (genuine construction-industry concept, no SAP match) |
| **Material Requirements (MRQ) vs Material Requests (MR)** | Confirmed via function-level code reading to be genuinely different documents, not a naming collision: `createMaterialRequirement` (MRQ) = a single-line, per-project/BOM demand record with its own DRAFT→SUBMITTED→APPROVED lifecycle. `createMaterialRequest` (MR) = an aggregating document that bundles one or more APPROVED Requirements (`requirementIds` array, flips referenced Requirements to `PARTIALLY_PROCESSED`) into procurement-facing lines that feed RFQ/PO directly. | No single SAP equivalent — Appletree's own 2-stage internal demand model; PR (Purchase Requisition, both SAP products) is the separate, 3rd, SOP-governed document | Real objects, dangerously similar names — genuine user-confusion risk despite being correctly distinct | **SHOULD CHANGE / MANAGEMENT DECISION**: rename "Material Requirements" (MRQ) to something visually distinct (e.g. "Material Demand," "BOM Material Need") — the exact replacement label is a product-naming choice, not a fact this audit can resolve unilaterally |
| **MRS (Site Material Requisition)** | Real, extensively used (`submitSiteMaterialRequisition`, prefix MRS). TWO different spelled-out forms coexist: registry says "Material Requisition Slip (Site)" (domain.js:318); UI says "Material Requisition — Site (MRS)" (index.html:5908) — and the SOP (`APPLETREE_ERP_SOP.md:388`) matches the UI's form, not the registry's, meaning the registry is the outlier. | No SAP equivalent — India-SME/construction-specific | Minor, confirmed dual-expansion inconsistency | **SHOULD CHANGE**: standardize the registry label to match the UI+SOP form ("Material Requisition — Site"). **Appletree business term** |
| **Delivery Challan** | Real (`DB.deliveryChallans`), used for both site material issue and job-work dispatch; consistently documented in the SOP and matching the code's actual function chain. | A genuine Indian statutory/logistics term, also used by S/4HANA's India localization | None | **DO NOT CHANGE** |
| **Gate Pass** | Confirmed absent from `server/domain.js` and `client_secure/index.html` entirely (only referenced in 3 unrelated markdown gap-register docs, not opened this phase). | N/A | Not implemented, not a naming issue | **NOT APPLICABLE** |
| **Change Request (Variations)** | `createChangeRequest`, prefix `CR`. "Variation" is used 100% interchangeably with "Change Request" throughout the codebase's own comments/reports (`projectVariationSummary`, "Project x Variation" — confirmed to reuse Change Request data verbatim, not a separate calculation). The `cr` menu-tab-id ("Customer Receipt") vs. `CR` document-prefix ("Change Request") ambiguity noted in the baseline was investigated and found **not to collide** in practice — no second real "CR" document-prefix usage exists. | No exact SAP equivalent for this specific revenue/cost variation model | None — genuinely consistent synonym usage | **DO NOT CHANGE** |
| **Project Cost / Project P&L / Project Profitability** | Three distinct, correctly-scoped real functions: `projectPL` (literal revenue−cost P&L, GL-line-scoped); `projectCostBreakdown` (5-stage committed→received→invoiced→paid→consumed); `companyProjectProfitability` (company-wide rollup separating `committed` from `actualCost`, and Core vs. Lifecycle margin). | Actual Cost / Project P&L / Profitability Analysis (S/4HANA CO, all distinct real concepts) | None found at the UI-label level, though not independently re-verified for every screen | **REVIEW** — confirm the 3-way distinction is preserved in all UI copy before closing fully |
| **Cost Centre / Profit Centre** | Independent GL-line tagging dimensions (NOT a hierarchy) — confirmed via code (a JE line can carry `projectId` and `costCentreId` independently). Cost Centres real & seeded (CC-DESIGN/FACTORY/SITE/INSTALLATION); Profit Centres real, fully wired, but deliberately seeded **empty** (explicit comment: no real Appletree value has ever been supplied, none invented). British spelling used 100% consistently — zero American-spelling occurrences anywhere. | Cost Center / Profit Center (both SAP products; British spelling is Appletree's own consistent India-localization choice) | None | **DO NOT CHANGE** |
| **BOM (Bill of Materials)** | Spelled out once (index.html:242), registry label (domain.js:952). A single, project-scoped, versioned "recipe" — confirmed used identically for site-material budget-checking AND Production Orders. "Production BOM" as a separate concept confirmed **absent**. | Universal SAP term (both products) | None | **DO NOT CHANGE** |
| **Production Order** | Real, with Job Cards, Production Schedule, Factory Dashboard, Job Cost Sheet all hanging off it. The code's own comment discloses "not the full factory ERP." "Work Order," "Work Centre," and "Routing/Operation" as formal entities are all confirmed **absent** — a genuine feature gap, not a naming problem. | Production Order (both SAP products) | Terminology already SAP-aligned; feature completeness is a separate question | **DO NOT CHANGE** (feature-gap disclosure belongs in a different phase) |
| **Snag** | Real, extensively implemented (`createSnag`, prefix SNG). "Punch List" confirmed **absent**. | No SAP-specific term — closest is the general US-English "Punch List" or UK/India-English "Snag List" | None | **DO NOT CHANGE** — **Appletree/India business term**, correctly matches this market |
| **Job Worker** | Real entity master (`createJobWorker`, `DB.jobWorkers`) with GSTIN/PAN/registered/state fields — an outside-processing COMPANY, not a person; company-wide, not project-scoped. Full function family: `dispatchToJobWorker`, `returnFromJobWorker`, `recordJobWorkScrap`, `directDispatchFromJobWorker`, `jobWorkAgingReport`. | No exact SAP equivalent — closest S/4HANA analog is "Subcontracting," a genuinely different PO-based mechanism with different tax treatment | None — correctly modeled and named | **DO NOT CHANGE** — **Appletree/India business term** |
| **APOB** | Real feature (`createAPOBDeclaration`) — Additional Place of Business, a GST declaration required before direct customer dispatch from an unregistered job worker's premises. Never expanded in the live UI (only in `APPLETREE_ERP_SOP.md:448`). | Indian GST statutory term, no SAP equivalent | Abbreviation never defined on first UI appearance (the audit's own Part 19 rule) | **SHOULD CHANGE**: add a one-time inline expansion in the UI, matching the SOP's existing wording |
| **Journal Voucher vs Journal Entry** | Both used ~7 times each. UI/menu/heading dominant: "Journal Voucher" (index.html:283 `<h2>New Journal Voucher</h2>`, menu label, registry `label:'Journal Voucher'`). Internal/comment-prose dominant: "Journal Entry" (a handful of code comments, 1 user-visible prompt at index.html:4257, the JE-draft's default narration string). The form's own visible field says "Remarks" where the underlying field/API is `narration` — a small third drift. SOP cross-check not completed to full depth this phase (disclosed gap). | Journal Entry (S/4HANA) / Journal Voucher (India-localized ERPs incl. B1 India) | Same object, two labels — no real user-confusion risk (one screen, one doc type) but inconsistent | **SHOULD CHANGE**: standardize on "Journal Voucher" (already dominant in the live UI) — fix the prompt string, narration default, and code comments |
| **Clearing vs Settlement** | 88 "Clearing" hits (real: `DB.clearings`, `applyClearing`, account 2050 "GR/IR Clearing," a dedicated `clear` role permission, blocks reversal of already-cleared entries) vs. exactly 1 "Settlement" hit — informal prose in a single code comment (domain.js:2868), no `DB.settlements`, no `settleInvoice()`, no UI screen. | Clearing (both S/4HANA and B1 use this exact term) | None — confirmed non-issue | **DO NOT CHANGE** |
| **Reconciliation (overloaded)** | At least 4 structurally distinct real features share the word: (1) the `recon` tab — AR/AP/output-tax/input-tax/customer-advance subledger-vs-GL-control-account proof (`reconcileAR`, `reconcileAP`, `reconcileOutputTax`, `reconcileInputTax`, `reconcileCustomerAdvances`); (2) the `bankrecon` tab — bank-statement-line-vs-GL matching, a separate ICICI-import pipeline; (3) `periodCloseReconciliation` — a period-close checklist bundling several of the above; (4) non-financial: `siteMaterialReconciliationReport` (quantity only, no GL) and `pettyCashReconciliation` (float reconciliation). Already correctly split into 2 distinct menu tabs. | Account Reconciliation vs. Bank Reconciliation (both SAP products distinguish these) | Low real ambiguity (2 correctly-scoped tabs already exist); the bare `recon` tab label doesn't itself state its scope | **OPTIONAL**: consider a more explicit `recon` tab label (e.g. "AR/AP & Tax Reconciliation") |
| **Customer/Supplier Credit Note & Debit Note** | Both sides fully symmetric: `createCustomerCreditNote`/`createCustomerDebitNote` and `createSupplierCreditNote`/`createSupplierDebitNote` all real, distinct functions/collections. The code's own comment discloses the Supplier-side Debit Note was added in "Phase 24 Part B" specifically because an earlier audit found the Supplier side asymmetric (Credit Note only) — a genuinely resolved prior gap. | Credit Memo/Debit Memo (S/4HANA) or Credit Note/Debit Note (B1, India-standard) | None | **DO NOT CHANGE** |
| **Trial Balance** | Genuinely, correctly computed — `server/server.js:810-815` sums real debit/credit by GL account across every posted line (`D.allLines()`), verified directly, not mislabeled. Implemented inline in the route handler rather than as a `domain.js` function (a separately-scoped `periodTrialBalance()` DOES exist in domain.js for period-close use) — an engineering-architecture note, not a naming defect. | Trial Balance (universal) | None (nomenclature); one engineering-hygiene observation | **DO NOT CHANGE** (nomenclature) |
| **WBS / Work Breakdown Structure** | Confirmed **absent** — zero matches in domain.js or index.html. | Work Breakdown Structure (S/4HANA Project System) | Not a naming issue — a genuine unimplemented feature | **NOT APPLICABLE — NO DIRECT SAP EQUIVALENT IMPLEMENTED** |
| **Batch / Serial Number / Bin tracking** | Confirmed **absent** — stock is a single fungible moving-average-costed pool per warehouse/site; no lot/batch or serial tracking anywhere in the domain model. Never falsely implied by any label. | Batch Management / Serial Number Profile (S/4HANA MM) | Not a naming issue — genuine unimplemented features | **NOT APPLICABLE — NO DIRECT SAP EQUIVALENT IMPLEMENTED** |
| **SAC (Services Accounting Code)** | Exists only as an optional rate-card attribute (domain.js comment: "SAC... OPTIONAL, attached at the rate-card level"), never a first-class master/field the way HSN is. May reflect a genuine scope decision (Appletree's billable services — installation, AMC — may not need distinct SAC coding) rather than a gap. | Indian GST statutory term, parallel to HSN for services | Ambiguous — business scope question, not a pure terminology defect | **MANAGEMENT DECISION**: confirm with Finance/Compliance whether SAC needs first-class treatment |
| **Bare "Receipt"** | Confirmed genuinely ambiguous in at least 2 isolated strings, disambiguated only by page context, not the string itself: "Receipt Recorded" (index.html:903) and "Record Receipt" (index.html:5924, 5961) — both actually mean Site/Goods Receipt, not cash. | N/A — a clarity issue | 2 confirmed ambiguous strings | **SHOULD CHANGE**: qualify as "Site Receipt Recorded" / "Record Site Receipt" |
| **Bare "Payment"** | Confirmed to mean at least 4 different things across the codebase: a Supplier Payment transaction; a Payment Method master (shared by both the Customer Receipt and Supplier Payment forms); a Payment Approval Matrix/Payment Request governance object; contractual Payment Terms. The "Payment Requests" tab heading and the Clearings table's bare "Payment" column are the clearest ambiguous cases. | N/A | Confirmed overloaded word, 2 clear ambiguous UI locations | **SHOULD CHANGE**: minor label clarification on the 2 locations, not a structural rename |
| **"Release" as a UI verb** | Confirmed **not used** as a button/action anywhere in the live UI. | Release (S/4HANA MM/PP standard workflow verb) | Not a gap — "Approve" already covers this | **DO NOT CHANGE** — do not introduce "Release" merely to match SAP, it would fragment the existing clean verb discipline |
| **Status-value internal CASE inconsistency** | 10 of 26 status enums use UPPERCASE_SNAKE, 16 use PascalCase (see §5). Internal representation; user-facing display-layer mapping not verified either way this phase. | N/A | Real but unverified user-facing impact | **MANAGEMENT DECISION**: verify display-layer mapping before deciding whether to normalize; do not touch 26 internal enum arrays for a possibly-zero benefit |
| **Goods Receipt PO / A/P Invoice / A/R Invoice** (SAP B1's literal document names) | Confirmed **absent** — zero matches for any of the three phrases anywhere in the codebase. | SAP Business One | Confirms the app does not literally mirror B1's own document names | **REFERENCE ONLY** — informs the SAP-source-attribution decision in §2 |
| **Material** | 135 (domain.js) / 159 (client) hits, dominant and well-established; "Item" (5) and "Product" (6) are incidental, not competing terms. | Material (S/4HANA MM) / Item (B1) | None | **DO NOT CHANGE** |

---

## 7. Documentation Cross-Check (SOP / User Manual / UAT Guide)

Compared against `APPLETREE_ERP_SOP.md`, `APPLETREE_ERP_USER_MANUAL.md`,
`APPLETREE_ERP_UAT_USER_GUIDE.md`, and `HANDOVER_PACKAGE/05_HANDOVER_DOCUMENTATION/`.

**No contradictions found.** Where a difference exists between the documentation and the live app,
the documentation is consistently the MORE correct/consistent source, meaning the fixes recommended
above bring the live application INTO alignment with documentation that was already written
correctly — not the other way around:

- **GRN**: SOP spells it out on first use (`PART 13 — GRN (GOODS RECEIPT NOTE)`) — a better model of
  the abbreviation rule than the live UI itself.
- **Delivery Challan**: consistent everywhere, matches the real `DB.deliveryChallans` feature.
- **MRS**: SOP's expansion ("Material Requisition — Site") matches the UI, confirming the registry
  label is the outlier that should change, not the other way around.
- **Supplier vs Vendor**: SOP is 13:2 in favor of "Supplier"; the User Manual is 2:0 — both already
  predominantly "Supplier," reinforcing it as the intended canonical term the live app hasn't fully
  caught up to.
- **Document flow language**: the SOP's documented flows (`PR→PO→GRN→Bill→Payment→Clearing`,
  `MRS→Delivery Challan→Site Receipt→Consumption`) match the actual code's function chain exactly,
  confirmed via direct function tracing.
- **HSN/SAC**: the dedicated handover doc (`24_HSN_SAC.md`) already treats them as a paired-but-
  distinct concept, matching the code's own framing.
- **Journal Voucher/Entry**: not cross-checked to the same depth as the items above — disclosed as a
  genuine gap in this pass, not assumed clean.

---

## 8. Change Plan

Nothing below has been implemented. Grouped per the brief's own required categories.

### MUST CHANGE (trivial, isolated, zero functional risk)

1. **`server/domain.js:274`** — `label:'Vendor Payment'` → `label:'Supplier Payment'`. Display
   string only; `code`/`prefix` (`PAY`) unchanged — no numbering, GL, or existing voucher impact.
2. **`client_secure/index.html:3569`** — the JE print-template's `Business Partner` cell → `Party`
   (or `Customer/Vendor`). Static label only; the underlying `${e.party}` value is unchanged.

### SHOULD CHANGE (low-risk, each needs one small judgment call)

3. Standardize "Journal Entry" → "Journal Voucher" in the minority locations (narration default,
   one user-visible prompt, a few comments).
4. Standardize the MRS spelled-out form — update the registry label to match the UI+SOP's
   "Material Requisition — Site."
5. Add a one-time inline expansion of "APOB" in the UI (matching the SOP's existing wording).
6. Qualify the 2 bare-"Receipt" strings ("Receipt Recorded" → "Site Receipt Recorded"; "Record
   Receipt" → "Record Site Receipt").
7. Clarify the 2 bare-"Payment" locations (Payment Requests heading; Clearings table column).
8. Investigate a distinct replacement name for "Material Requirements" (MRQ) — see Management
   Decision #1; this item is "should decide," not yet "should implement a specific label."

### OPTIONAL

9. Split the one hybrid heading "Inventory Stock (Moving Average)."
10. Consider a more explicit `recon` tab label (e.g. "AR/AP & Tax Reconciliation").
11. Delete the dead `NAV_GROUPS` array (already marked "safe to delete" in its own comment).
12. Resolve the `SRET` registry-vs-seed divergence (verify whether it's a stale reference or a real
    gap).

### DO NOT CHANGE

GRN · Material Issue · Stock Count · Warehouse/Location/Site · Snag · Job Worker · Delivery Challan
· Cost/Profit Centre spelling · Clearing · Customer/Supplier Credit-Debit Note symmetry · BOM ·
Production Order · the Save/Post/Submit/Approve verb discipline · do NOT introduce "Release" as a
new verb · do NOT adopt "Business Partner" as a real architectural concept beyond the one label fix
· do NOT normalize status-enum casing without first confirming user-facing impact.

### MANAGEMENT DECISIONS REQUIRED (no action without explicit sign-off)

1. **MRQ rename target** — pick the actual replacement label for "Material Requirements" (options:
   "Material Demand," "BOM Material Need," or keep as-is with better on-screen explanatory text
   instead of a rename).
2. **Status-value internal casing** — confirm whether any raw enum value is ever shown to a user
   unmodified before deciding whether a 26-array normalization pass is worth the risk.
3. **SAC scope** — confirm with Finance/Compliance whether Appletree's billable services need
   first-class SAC treatment.
4. **"Business Partner" as a real concept** — explicitly out of this audit's scope (would require
   unifying the Customer/Vendor masters); raised only so the question is visible, not recommended
   either way.

### Implementation sequencing (once approved)

1. The 2 MUST CHANGE items first — `node -c` syntax check + browser check of the 2 screens touched.
2. Approved SHOULD CHANGE items one at a time, each followed by a targeted browser check of the
   specific screen touched.
3. Full existing test suite after any change — expect 100% of what passed before to still pass
   (label-only changes, zero accounting-logic impact).
4. No OPTIONAL or MANAGEMENT DECISION item touched without a separate, explicit go-ahead.

---

## 9. Scorecard

0 = seriously inconsistent, 5 = SAP-grade alignment. No score inflated — a domain with one confirmed
inconsistency cannot score 5 even if most of its terminology is correct.

| Domain | Score | Basis |
|---|---|---|
| Master Data | **3** | Supplier/Vendor 3-layer split + Business Partner mislabel, both confirmed |
| Procurement | **4** | PR/MRQ/MR genuinely 3 distinct, well-designed documents; near-identical MRQ/MR labels are a real confusability risk |
| Inventory | **5** | GRN/Material Issue/Stock Count/Locations clean and deliberately India-aligned; no feature overclaiming |
| Sales | **4** | Clean at the structural level; not independently deep-audited to the same depth as other domains (disclosed) |
| Finance | **3** | Journal Voucher/Entry + Vendor/Supplier Payment, both confirmed label bugs; otherwise strong |
| AR | **4** | Customer Invoice/Receipt/Credit-Debit Note/Ageing/Ledger all clean |
| AP | **4** | Supplier Bill/Credit-Debit Note/Ageing/Ledger clean; inherits the Vendor/Supplier split |
| Banking | **5** | Bank Reconciliation cleanly distinct from AR/AP Reconciliation |
| Tax | **4** | GST/HSN/GSTIN/TDS/E-way Bill correct and India-statutory-aligned; SAC scope unresolved, abbreviations never expanded |
| Projects | **4** | Project 360/Budget vs Commitment vs Actual/Change Requests clear; 3-function Project Cost distinction needs final UI confirmation |
| Controlling | **4** | Cost/Profit Centre correctly modeled as independent dimensions, matching S/4HANA CO |
| Manufacturing | **4** | Production Order/BOM/Job Card SAP-aligned; Work Order/Centre/Routing absence honestly disclosed, not a naming defect |
| Job Work | **5** | Job Worker/JWO/APOB/Scrap/Direct Dispatch correctly India-specific, not forced into "Subcontracting" |
| Site | **5** | Site/MRS/Delivery Challan/Site Return clearly, code-verifiably distinct from Warehouse/Purchase-Return equivalents |
| Service | **5** | Warranty/Complaint/Ticket/Visit/AMC/CAPA all clean and internally coherent |
| Reports | **4** | Trial Balance spot-checked and genuinely correct; full 27+-report catalog not individually re-verified |
| Workflow | **4** | Verb discipline confirmed clean; status-enum casing inconsistency real but unverified user-facing impact |
| Audit | **5** | Clean, independently strengthened by the ERP-059 series durable-audit work |
| UI | **3** | Dead `NAV_GROUPS` array + confirmed bare-word ambiguity in a handful of isolated strings |

**Unweighted average: 4.2 / 5** across 19 domains. No domain below 3. The three domains scoring 3
(Master Data, Finance, UI) correspond exactly to the domains carrying the confirmed MUST/SHOULD
CHANGE findings — not vague impressions.

---

## 10. Terminology Standard (canonical reference going forward)

Each entry: definition, when to use / not use, SAP equivalent, Appletree meaning.

| Term | Definition | SAP Equivalent | Use / Don't Use |
|---|---|---|---|
| **Supplier** | A company/individual Appletree buys from | Supplier (S/4HANA) / Vendor (B1) | Use everywhere in documents/UI/reports. Don't introduce "Business Partner." Internal `vendorId`/`DB.vendors` stays as-is (Part 31). |
| **GRN** | Records what actually arrived against a PO | Goods Receipt (S/4HANA) / Goods Receipt PO (B1) | Use everywhere; spell out once on first appearance ("Goods Receipt Note") |
| **Material Issue** | Consumes material — the only event hitting Project Actual Cost | Goods Issue (both) | Use everywhere; never "Goods Issue" |
| **Material Return (Site)** | Internal custody transfer, site→warehouse, no vendor/GRN | No exact SAP match | Site-facing movements only; don't confuse with Purchase Return |
| **Purchase Return** | Vendor-facing return against a specific GRN, reduces vendor payable | Return to Vendor / Purchase Return (both) | Any return TO a supplier; not for internal site→warehouse movements |
| **Stock** | On-hand quantity report/figure | Stock / Available Stock (both) | Reports and quantity displays; not the module/valuation name |
| **Inventory** | The module/domain name and GL valuation concept | Inventory (both) | Module grouping, GL account names; not the on-hand-qty report |
| **Stock Count** | Physical count/reconciliation cycle | Physical Inventory Document (S/4HANA) / Inventory Counting (B1) | Use everywhere; never "Physical Inventory" |
| **Warehouse** | Company-owned central store, seed-only master | Warehouse (B1) / Plant+Storage Location (S/4HANA) | Matches B1's simpler single-tier model |
| **Location** | Optional bin/shelf sub-division within a Warehouse | Storage Location (S/4HANA) / Bin Location (B1) | Only where extra granularity matters; not a Warehouse/Site synonym |
| **Site** | Project execution location with its own pooled inventory ledger | No direct SAP equivalent | Any project-site context. **Appletree business term.** |
| **MRS (Material Requisition — Site)** | Site In-charge's formal request for site material | No direct SAP equivalent | Site material request/approval only; don't confuse with PR or MRQ/MR. Spell out as "Material Requisition — Site" (not "...Slip") |
| **Purchase Requisition (PR)** | Formal, SOP-governed request to purchase | Purchase Requisition (both) | Procurement's request-to-buy flow; don't confuse with MRQ/MR |
| **Material Requirement (MRQ)** | Single line of project/BOM material demand | No single equivalent | Stage 1 of the 2-stage demand model; don't confuse with MR. *Rename target pending management decision.* |
| **Material Request (MR)** | Aggregated, procurement-facing document bundling approved MRQs | No single equivalent | Stage 2, feeds RFQ/PO directly; don't confuse with MRQ |
| **Delivery Challan** | Transporter/vehicle-carrying dispatch document | Delivery Challan (Indian statutory term, also in S/4HANA India localization) | Any physical goods movement needing transport documentation |
| **Job Worker** | An outside-processing company (not a person), GSTIN/PAN/registration tracked | No exact match (closest: Subcontracting, a different mechanism) | Job-work dispatch/return/scrap contexts. **India business term.** |
| **APOB** | GST declaration of a job worker's premises as Appletree's own additional place of business | No SAP equivalent — Indian statutory term | Job-work direct-dispatch compliance only; spell out on first UI appearance |
| **Change Request (Variations)** | Formal change to a project's scope/cost/revenue | No exact match | Project change-management flow; "Change Request" and "Variation" are fully interchangeable |
| **Clearing** | Matching a payment/receipt/CN/DN against an open AR/AP item | Clearing (both SAP products) | Any AR/AP open-item settlement; never "Settlement" in user-facing text |
| **Journal Voucher** | The manual GL posting document (Draft→Submitted→Approved→Posted) | Journal Entry (S/4HANA) / Journal Voucher (India-localized ERPs) | All user-facing labels; avoid "Journal Entry" in new text |
| **Cost Centre** | Independent GL-line tagging dimension for an internal operating unit | Cost Center (both, British spelling is Appletree's own convention) | Any transaction needing internal-cost attribution, alongside a Project tag |
| **Profit Centre** | Independent GL-line tagging dimension for profit-responsibility reporting | Profit Center (both) | Once real management-defined values exist (currently empty by design) |
| **BOM** | Project-scoped, versioned material "recipe" | Bill of Material (universal) | Everywhere; one concept only, no "Production BOM" |
| **Production Order** | Real manufacturing order (Job Cards, schedule, factory dashboard); explicitly "not the full factory ERP" | Production Order (both) | Manufacturing execution tracking |
| **Snag** | Post-installation defect/punch item | No SAP-specific term (US: "Punch List," UK/India: "Snag List") | Everywhere; never "Punch List." **India business term.** |
| **Trial Balance** | Company-wide (or period-scoped) sum of debits/credits by GL account | Trial Balance (universal) | Everywhere; verified to genuinely compute what it claims |

**Abbreviation quick-reference**: PR (spelled out via menu), GRN (spelled out once, SOP models this
well), MRS (spelled out once, standardize form), MRQ/MR (currently bare, recommended), APOB (bare,
should add expansion), BOM (spelled out once), AR/AP/GST/CGST/SGST/IGST/HSN/SAC/TDS/ITC (statutory/
universal abbreviations, expansion optional given target-audience familiarity), JV (spelled out via
menu).

---

## 11. Final Verdict

Per the brief's own checklist: master, transaction, finance, inventory, procurement, project,
manufacturing, tax, workflow/status, and field-label terminology were all audited (field labels and
reports at full depth for their primary screens, representative depth elsewhere — disclosed, not
hidden); documentation was cross-checked against 3 primary references; SAP sources were recorded
with an explicit source-attribution caveat; Appletree-specific terms were identified and protected
from unnecessary "SAP-ification" (Site, Snag, Job Worker, MRS, Delivery Challan, APOB); ambiguities
were resolved or scoped (bare Receipt/Payment, Reconciliation's 4 meanings); no misleading SAP
terminology was left uncorrected (the Business Partner mislabel is in the MUST CHANGE list); no
contradictory terminology was left unflagged (Vendor/Supplier Payment and Journal Entry/Voucher are
both flagged with fixes proposed). Regression testing has **not** run, because nothing has been
implemented yet — by design, per the brief's own "audit → crosswalk → recommend → implement →
browser-test → regression-test" sequencing.

### VERDICT: B — MOSTLY ALIGNED, MINOR TERMINOLOGY GAPS

Not an A: 2 confirmed MUST-CHANGE inconsistencies exist in the live system right now (Vendor
Payment/Supplier Payment; the Business Partner mislabel), and regression testing — a literal
checklist item for an A-grade close — hasn't run because nothing has changed yet. Well above C/D:
across 19 scored domains, none scored below 3, and the vast majority of the terminology surveyed is
either already correctly SAP-aligned or is a deliberate, evidence-backed departure from literal SAP
wording in favor of this application's real India-SME audience — not accidental drift. The path from
B to A is short and low-risk: implement the 2 MUST CHANGE items, the approved SHOULD CHANGE items,
then browser-test and regression-test — all described and ready, awaiting review of §8 above.

**No renaming has been implemented.** This report constitutes the audit, crosswalk, scorecard, and
recommendation only. Implementation awaits explicit approval of the items in §8.
