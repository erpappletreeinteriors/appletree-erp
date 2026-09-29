# PHASE 42 — Canonical Document Vocabulary

**Date:** 2026-09-14. Source: `server/domain.js`'s 51 `nextDocNumber()` prefixes and the
`glDocumentTypes` label registry (both extracted verbatim by Phase 37, re-verified current this
phase), extended with the Sales/CRM/Estimation documents Phase 37 explicitly left under-audited and
Phase 41 live-verified. Format for every document: `PREFIX/FINANCIAL-YEAR/SEQUENCE` for the
user-facing voucher number (e.g. `INV/2026-27/0001`), plus a separate permanent internal record ID
(e.g. `JE-0047`) a user rarely sees directly.

Every entry: canonical name, abbreviation, internal identifier prefix, SAP equivalent, lifecycle.

---

## Sales & CRM

**Lead**
- Abbreviation: none
- Internal ID prefix: `LEAD`
- SAP equivalent: Lead (SAP CRM/Sales Cloud concept — not native to S/4HANA Core)
- Lifecycle: `NEW → CONTACTED → QUALIFIED → ESTIMATION → QUOTATION → NEGOTIATION → WON` (or `LOST` /
  `ON HOLD` at any point)

**Estimation Request**
- Abbreviation: ER (informal, not a formal doc-numbering prefix — no `nextDocNumber` entry;
  identified by its own `ER-NNNN` internal id)
- SAP equivalent: none (Appletree-specific staging document)
- Lifecycle: `DRAFT → SUBMITTED → IN PROGRESS → COMPLETED` (or `CANCELLED`)

**Costing Version**
- Abbreviation: none formal (internal id `COST-NNNN`)
- SAP equivalent: Cost Estimate / Sales Order Costing (S/4HANA Sales)
- Lifecycle: no formal status field — versioned (`version: 1, 2, 3…`) against one Estimation Request;
  superseded by creating a new version, never edited in place

**Quotation**
- Abbreviation: QTN
- Internal ID prefix: `QTN` (voucher format `QTN/FY-FY/NNNN`, e.g. `QTN/2026-27/0001`)
- SAP equivalent: Quotation (both S/4HANA and Business One — exact)
- Lifecycle: `Draft → Submitted → PendingApproval → Approved → Sent → Accepted → Rejected/Superseded`

**Won (transition event, not a stored document)**
- No prefix of its own — `wonTransition()` consumes an Accepted Quotation and produces a Project,
  a Customer, and a Cost Baseline in one atomic step
- SAP equivalent: Quotation→Sales Order conversion (approximate — Appletree's downstream object is a
  Project, not a Sales Order; see the Nomenclature Audit's AT-045/AT-046 for why this is a correct
  business-model difference, not a naming gap)

---

## Procurement

| Document | Abbreviation | Prefix | SAP Equivalent | Lifecycle |
|---|---|---|---|---|
| Material Requirement | MRQ | `MRQ` | none (Appletree 2-stage demand model, stage 1) | Draft→Submitted→Approved |
| Material Request | MR | `MR` | none (stage 2, aggregates approved MRQs) | Draft→Submitted→Approved→Rejected→Converted |
| Purchase Requisition | PR | `PR` | Purchase Requisition (exact) | Draft→Submitted→Approved→Rejected→Converted→Cancelled |
| RFQ | RFQ | `RFQ` | Request for Quotation (exact) | (quote-collection document, no formal status enum) |
| Purchase Order | PO | `PO` | Purchase Order (exact) | Draft→Submitted→Approved→PartiallyReceived→FullyReceived→Closed/Cancelled |
| GRN (Goods Receipt Note) | GRN | `GRN` | Goods Receipt (S/4HANA) / Goods Receipt PO (B1) | (recorded, not a multi-state lifecycle) |
| Supplier Bill | BILL | `BILL` | Supplier Invoice (S/4HANA) / A/P Invoice (B1) | Draft→Submitted→Approved→Posted |
| Purchase Return | PRET | `PRET` | Return to Vendor / Purchase Return (exact) | (recorded against a specific GRN line) |
| Payment Request | — | (governance object, no doc-numbering prefix of its own) | Payment Approval Workflow | Draft→Review→Approved→Executed |

## Inventory

| Document | Abbreviation | Prefix | SAP Equivalent | Lifecycle |
|---|---|---|---|---|
| Material Issue | ISS | `ISS` | Goods Issue | (posted, single event) |
| Material Return (Site) | SRET | `SRET` | none (site-to-warehouse internal transfer) | (recorded) |
| Inventory Transfer | ITR | `ITR` | Stock Transfer | (recorded) |
| Inventory Adjustment | IADJ | `IADJ` | Inventory Adjustment (exact) | (recorded) |
| Damage Report | DMG | `DMG` | none | (recorded) |
| Stock Count | SCT | `SCT` | Physical Inventory Document (S/4HANA) / Inventory Counting (B1) | (count → variance → adjustment) |
| Delivery Challan | DC | `DC` | Delivery Challan (Indian statutory, also S/4HANA India localization) | (issued) |
| Site Material Receipt | SMR | `SMR` | none | (matched against a Delivery Challan) |
| Site Material Requisition (MRS) | MRS | `MRS` | none | Draft→Submitted→Approved→Rejected→Issued→Cancelled |

## Manufacturing / Job Work

| Document | Abbreviation | Prefix | SAP Equivalent | Lifecycle |
|---|---|---|---|---|
| BOM | BOM | `BOM` | Bill of Material (exact) | Draft→Submitted→Approved→Rejected→Superseded |
| Production Order | PROD | `PROD` | Production Order (exact) | Draft→Released→InProgress→PartiallyCompleted→Completed→Closed/OnHold/Cancelled |
| Job Card | JC | `JC` | none (Appletree factory-floor tracking) | Planned→InProgress→Completed→Cancelled |
| Job Work Order | JWO | `JWO` | none (India job-work model, ≠ SAP Subcontracting's PO mechanism) | Dispatched→PartiallyReturned/Returned/DirectDispatched |
| QC Checklist | QCK | `QCK` | Quality Inspection (approximate) | Pending→InProgress→Passed/Failed |

## Execution & Delivery

| Document | Abbreviation | Prefix | SAP Equivalent | Lifecycle |
|---|---|---|---|---|
| Dispatch | DSP | `DSP` | Outbound Delivery (approximate) | Draft→Ready→Approved→Dispatched→Delivered→Cancelled |
| Delivery (confirmation) | DLV | `DLV` | Proof of Delivery (approximate) | (cumulative partial/full tracking against a Dispatch) |
| Installation | INST | `INST` | none (fit-out-specific) | Planned→InProgress→Completed→OnHold |
| Snag | SNG | `SNG` | none (India/UK "Snag List"; US "Punch List") | Open→Assigned→InProgress→Resolved→Verified→Closed |
| Handover | HO | `HO` | none (fit-out-specific project handover) | (gated on QC pass + snag closure) |

## Finance

| Document | Abbreviation | Prefix | SAP Equivalent | Lifecycle |
|---|---|---|---|---|
| Journal Voucher | JV | `JE` | Journal Entry (S/4HANA) / Journal Voucher (India-localized ERPs) | Draft→Submitted→Approved→Posted |
| Customer Invoice | INV | `INV` | Sales Invoice / A/R Invoice | Draft→Submitted→Approved→Posted |
| Customer Receipt | RCPT | `RCPT` | Incoming Payment (exact concept) | (posted, clears an open invoice) |
| Supplier Payment | PAY | `PAY` | Supplier Payment (exact — see AT-002 for the one label that still says "Vendor Payment") | (posted, clears an open bill) |
| Credit Note / Debit Note (Customer + Supplier) | CN / DN / SCN / SDN | `CN`/`DN`/`SCN`/`SDN` | Credit Memo/Debit Memo (S/4HANA) or Credit/Debit Note (B1 India) | Draft→Submitted→Approved→Posted |
| Clearing Document | CLR | `CLR` | Clearing (exact) | (system-generated at settlement) |
| Fixed Asset | FA | `FA` | Asset Master (S/4HANA Asset Accounting) | Purchased→Capitalized→Depreciating→Disposed |
| Bank/Cash Transfer | BXFR | `BXFR` | Bank Transfer | (posted) |

## Administration (see also the Nomenclature Audit's Security/Administration section)

| Concept | SAP Equivalent | Notes |
|---|---|---|
| Backup | Backup (SAP Basis/DBA function) | API/command-only, matching SAP's own Basis-layer pattern — no dedicated business-process UI, by design |
| Restore | Restore (SAP Basis/DBA function) | Same as above |
| Financial Period | Fiscal Period (S/4HANA) | `closeFinancialPeriod()` |
| Branch | closest to Company Code (S/4HANA) but not a full multi-company-code structure | No formal "Company" concept exists separately from Branch — confirmed absent |

**Note:** Backup/Restore and Financial Period/Branch entries here are carried from the existing
crosswalk; the full Security/Administration terminology inventory (Users, Roles, Sessions, Audit Log,
Login History, Maker-Checker/SoD, Master Data Import) is detailed in
`PHASE-42-SAP-APPLETree-SIDE-BY-SIDE-MATRIX.csv` and `PHASE-42-NOMENCLATURE-AUDIT.md`.
