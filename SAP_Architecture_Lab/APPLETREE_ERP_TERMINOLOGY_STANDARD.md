# Appletree ERP Terminology Standard

**Date:** 2026-09-11. Part 39 deliverable — the canonical terminology dictionary for the Appletree
ERP, built from the Phase 37 nomenclature audit. This becomes the reference for all future feature
work, documentation, and training. It reflects the terminology AS DECIDED in
`PHASE37_SAP_APPLETREE_TERMINOLOGY_CROSSWALK.md` — including the 2 MUST CHANGE corrections, which
this document treats as the target state even where the live code has not yet been updated to match
(see `PHASE37_NOMENCLATURE_CHANGE_PLAN.md` for implementation status).

## How to read this document

Each entry: **Term** — Definition — When to use — When NOT to use — SAP equivalent — Appletree
meaning — Abbreviation (if any).

---

### Supplier
**Definition**: A company or individual Appletree buys goods or services from.
**When to use**: All document/transaction labels, reports, and user-facing text (Supplier Bill,
Supplier Payment, Supplier Credit Note, Supplier Debit Note, Supplier Quotations, Supplier Ledger).
**When NOT to use**: Do not introduce "Business Partner" as an alternative — Appletree's Customer and
Vendor/Supplier masters are separate, not unified.
**SAP equivalent**: Supplier (S/4HANA, post-2015 rename) / Vendor (Business One).
**Appletree meaning**: Identical to SAP's Supplier concept — a goods/services vendor master with
GSTIN, PAN, category, bank details.
**Abbreviation**: None. **Internal note**: the underlying database field/parameter is still named
`vendorId`/`DB.vendors` — this is intentional (Part 31, API compatibility) and does not need to
change; only display text follows this standard.

### GRN
**Definition**: The document recording what actually arrived against a Purchase Order — never what
was ordered.
**When to use**: Everywhere — menu, buttons, reports, messages.
**When NOT to use**: Do not expand to "Goods Receipt" or "Goods Receipt PO" in user-facing text
(acceptable in internal code comments/registry labels only, as today).
**SAP equivalent**: Goods Receipt (S/4HANA, transaction MIGO) / Goods Receipt PO (Business One).
**Appletree meaning**: Identical function to both SAP equivalents; term choice follows India-ERP/
Tally-market convention instead.
**Abbreviation**: GRN = Goods Receipt Note (spell out once on first appearance in any new
document/screen, per the SOP's own example at `APPLETREE_ERP_SOP.md:299`).

### Material Issue
**Definition**: The transaction that consumes material from a warehouse or site — the ONLY event
that hits Project Actual Cost.
**When to use**: Everywhere.
**When NOT to use**: Do not use "Goods Issue."
**SAP equivalent**: Goods Issue (both S/4HANA and Business One).
**Appletree meaning**: Identical function; deliberate India-market term choice.
**Abbreviation**: None; internal document prefix `ISS`.

### Material Return (Site)
**Definition**: An internal custody transfer moving material from a project site back into a company
warehouse — never references a vendor or a GRN. A "Damaged"/"Lost" line writes off value instead.
**When to use**: Site-facing inventory movements only.
**When NOT to use**: Do not confuse with "Purchase Returns" (vendor-facing).
**SAP equivalent**: No exact match — closest is a generic Goods Movement/Transfer Posting.
**Appletree meaning**: A genuinely distinct concept from Purchase Return; see below.
**Abbreviation**: None; internal document prefix `SRET`.

### Purchase Return
**Definition**: A vendor-facing return against a specific GRN line, reducing the vendor payable.
**When to use**: Any return of goods TO a supplier.
**When NOT to use**: Do not use for site-to-warehouse internal movements (see Material Return
(Site)).
**SAP equivalent**: Return to Vendor / Purchase Return (both SAP products).
**Appletree meaning**: Identical.
**Abbreviation**: None; internal document prefix `PRET`.

### Stock
**Definition**: The on-hand quantity of material, reported at a warehouse, site, or location.
**When to use**: Stock Report, Stock by Location, Stock Counts, Stock Movement Ledger, and any
numeric on-hand-quantity display.
**When NOT to use**: Do not use for the module/domain name (use "Inventory" instead) or for the
GL valuation account.
**SAP equivalent**: Stock / Available Stock (both SAP products).
**Appletree meaning**: Identical.
**Abbreviation**: None.

### Inventory
**Definition**: The module/domain name, and the GL account/valuation concept (moving-average cost).
**When to use**: Module/menu grouping, GL account names ("Inventory," "Inventory Adjustment"),
valuation-method labels.
**When NOT to use**: Do not use for the on-hand-quantity report itself (use "Stock").
**SAP equivalent**: Inventory (both SAP products).
**Appletree meaning**: Identical.
**Abbreviation**: None.

### Stock Count
**Definition**: The document/process for physically counting and reconciling on-hand stock.
**When to use**: Everywhere this feature is referenced.
**When NOT to use**: Do not use "Physical Inventory."
**SAP equivalent**: Physical Inventory Document (S/4HANA) / Inventory Counting Transaction (B1).
**Appletree meaning**: Identical function; India-SME term choice.
**Abbreviation**: None; internal document prefix `SCT`.

### Warehouse
**Definition**: A company-owned central store. Seed-only master data (no user-facing creation flow).
**When to use**: Everywhere.
**SAP equivalent**: Warehouse (Business One) / Plant + Storage Location (S/4HANA, more granular).
**Appletree meaning**: Matches Business One's simpler single-tier model.
**Abbreviation**: None.

### Location
**Definition**: An optional bin/shelf-level sub-division within a Warehouse.
**When to use**: Only where the extra granularity genuinely matters (some GRN lines).
**When NOT to use**: Do not confuse with, or use as a synonym for, "Warehouse" or "Site."
**SAP equivalent**: Storage Location (S/4HANA) / Bin Location (B1).
**Appletree meaning**: Matches both, deliberately kept optional/lightweight.
**Abbreviation**: None.

### Site
**Definition**: A project execution location (a construction/installation site) with its own pooled
inventory ledger, distinct from a Warehouse.
**When to use**: Any project-site context (MRS, Delivery Challan, Site Material Receipt, Site
Return, Site In-charge role).
**When NOT to use**: Do not use interchangeably with "Warehouse" or "Location."
**SAP equivalent**: No direct match.
**Appletree meaning**: A genuine, industry-specific concept for Appletree's construction/interior-
fitout business.
**Abbreviation**: None. **Appletree business term.**

### MRS (Material Requisition — Site)
**Definition**: A Site In-charge's formal request for material to be sent to their site.
**When to use**: Site material request/approval flow.
**When NOT to use**: Do not confuse with Purchase Requisition (a separate, procurement-facing
document) or Material Requirement/Material Request (project-level demand documents).
**SAP equivalent**: No direct match — India-SME/construction-specific process.
**Appletree meaning**: The site-facing counterpart to a Purchase Requisition.
**Abbreviation**: MRS = Material Requisition — Site (spell out once on first appearance; this is
the standard form, matching the SOP, the live UI, AND the `glDocumentTypes` registry — updated
2026-09-16 per Phase 42's low-risk implementation to close the prior registry/UI label mismatch).

### Purchase Requisition (PR)
**Definition**: A formal, SOP-governed request to purchase, subject to the approval matrix.
**When to use**: Procurement's own request-to-buy flow.
**When NOT to use**: Do not confuse with Material Requirement (MRQ) or Material Request (MR).
**SAP equivalent**: Purchase Requisition (both SAP products).
**Appletree meaning**: Identical.
**Abbreviation**: PR (spell out on first appearance — the UI already does this via the "Purchase
Requisitions" menu label).

### Material Requirement (MRQ)
**Definition**: A single line of material demand raised against a project or BOM — the atomic
"need" record.
**When to use**: Project-level demand raising, BOM-linked material need.
**When NOT to use**: Do not confuse with Material Request (MR) — see the distinction below.
**SAP equivalent**: No single equivalent (closer to a PR line item).
**Appletree meaning**: Stage 1 of Appletree's 2-stage demand model.
**Abbreviation**: MRQ. **Naming caution**: near-identical to "Material Request" — see the Change
Plan's Management Decision #1 for a possible future rename.

### Material Request (MR)
**Definition**: An aggregated, procurement-facing document that bundles one or more APPROVED
Material Requirements into lines an RFQ/PO can be issued against.
**When to use**: The actual procurement trigger document.
**When NOT to use**: Do not confuse with Material Requirement (MRQ) — MR consumes/references MRQs,
it is not the same document.
**SAP equivalent**: No single equivalent.
**Appletree meaning**: Stage 2 of Appletree's 2-stage demand model, feeding RFQ/PO directly.
**Abbreviation**: MR.

### Delivery Challan
**Definition**: A transporter/vehicle-carrying dispatch document, used both for site material issue
and job-work dispatch.
**When to use**: Any physical goods movement requiring transport documentation.
**When NOT to use**: Do not confuse with "Delivery (Confirmation)" below — both legitimately use the
word "Delivery" but are unrelated documents; a Delivery Challan never needs a Dispatch to exist, and
a Delivery (Confirmation) is never issued against site material or job-work movements.
**SAP equivalent**: Delivery Challan — a genuine Indian statutory/logistics term also used by
S/4HANA's India localization.
**Appletree meaning**: Identical to the Indian statutory concept.
**Abbreviation**: DC.

### Delivery (Confirmation)
**Definition**: A customer-facing proof-of-receipt event recorded against a Dispatch (which itself
references a completed Production Order), supporting cumulative partial deliveries against one
Dispatch.
**When to use**: Manufacturing → Dispatch → Delivery → Installation execution-chain contexts only.
**When NOT to use**: Do not confuse with Delivery Challan (above) — a genuinely different document
serving a different, internal-material-movement purpose. Never abbreviate this one as "DC."
**SAP equivalent**: Proof of Delivery (approximate only).
**Appletree meaning**: The execution-chain confirmation step between Dispatch and Installation.
**Abbreviation**: None (spell out as "Delivery" in its own execution-chain context, where Dispatch
and Installation already disambiguate it from Delivery Challan).

### Job Worker
**Definition**: An outside-processing company (not an individual) that Appletree sends material to
for job work, tracked with GSTIN/PAN/registration status.
**When to use**: All job-work dispatch/return/scrap contexts.
**When NOT to use**: Do not call this "Subcontractor" (a different SAP mechanism with different tax
treatment) or imply it is a personal/employee master.
**SAP equivalent**: No exact match — closest is Subcontracting, a genuinely different mechanism.
**Appletree meaning**: India GST-specific job-work process.
**Abbreviation**: None. **Appletree/India business term.**

### APOB (Additional Place of Business)
**Definition**: A GST declaration formally registering a job worker's premises as Appletree's own
additional place of business, required before a direct customer dispatch from an unregistered job
worker's site.
**When to use**: Job-work direct-dispatch compliance contexts only.
**SAP equivalent**: No SAP equivalent — Indian GST statutory term.
**Appletree meaning**: Identical to the statutory concept.
**Abbreviation**: APOB (spelled out on first UI appearance — added to the APOB Declarations screen
heading 2026-09-16 per Phase 42's low-risk implementation).

### Change Request (Variations)
**Definition**: A formal change to a project's scope, cost, or revenue.
**When to use**: Project change-management flow.
**SAP equivalent**: No exact match in either SAP product for this specific revenue/cost variation
model.
**Appletree meaning**: "Change Request" and "Variation" are used 100% interchangeably — not two
concepts.
**Abbreviation**: CR.

### Clearing
**Definition**: Matching/applying a payment, receipt, credit note, or debit note against an open
AR/AP invoice item.
**When to use**: Any AR/AP open-item settlement context.
**When NOT to use**: Do not use "Settlement" as an alternate term in user-facing text (it appears
once in an internal code comment only, informally).
**SAP equivalent**: Clearing (both S/4HANA and Business One use this exact term).
**Appletree meaning**: Identical.
**Abbreviation**: None; internal document prefix `CLR`.

### Journal Voucher
**Definition**: The manual GL posting document (Draft → Submitted → Approved → Posted).
**When to use**: All user-facing labels (per the Change Plan's standardization decision).
**When NOT to use**: Avoid "Journal Entry" in new user-facing text; it may remain in internal code/
comments where changing it carries no user benefit.
**SAP equivalent**: Journal Entry (S/4HANA) / Journal Voucher (India-localized ERPs, including B1
India).
**Appletree meaning**: Identical function; India-market term choice.
**Abbreviation**: JV (internal prefix).

### Cost Centre
**Definition**: An independent GL-line tagging dimension representing an internal operating unit
(Design, Factory, Site, Installation).
**When to use**: Any transaction needing internal-cost attribution, alongside (not instead of) a
Project tag.
**SAP equivalent**: Cost Center (both SAP products; British spelling is Appletree's own
India-localization convention, used consistently).
**Appletree meaning**: Identical.
**Abbreviation**: None.

### Profit Centre
**Definition**: An independent GL-line tagging dimension for profit-responsibility reporting.
Currently seeded empty pending real management-defined values.
**When to use**: Once real values are defined by management.
**SAP equivalent**: Profit Center (both SAP products).
**Appletree meaning**: Identical, deliberately not pre-populated with invented data.
**Abbreviation**: None.

### BOM (Bill of Materials)
**Definition**: A project-scoped, versioned "recipe" of materials — one concept, used identically
for site-material budget-checking and Production Orders.
**When to use**: Everywhere.
**When NOT to use**: Do not invent a separate "Production BOM" concept — none exists.
**SAP equivalent**: Bill of Material (universal SAP term).
**Appletree meaning**: Identical.
**Abbreviation**: BOM (spell out once on first appearance, per `index.html:242`'s existing example).

### Production Order
**Definition**: A real manufacturing order with Job Cards, a schedule, and a factory dashboard — the
codebase's own comment discloses this is "not the full factory ERP" (no Work Centre/Routing).
**When to use**: Everywhere manufacturing execution is tracked.
**SAP equivalent**: Production Order (both SAP products).
**Appletree meaning**: Identical, with an honestly disclosed feature-scope limitation (not a
terminology issue).
**Abbreviation**: None; internal document prefix `PROD`.

### Snag
**Definition**: A post-installation defect/punch item requiring resolution before project handover.
**When to use**: Everywhere.
**When NOT to use**: Do not use "Punch List."
**SAP equivalent**: No SAP-specific term; closest is the general construction-industry "Punch List"
(US-English) or "Snag List" (UK/India-English).
**Appletree meaning**: Matches UK/India construction-industry usage.
**Abbreviation**: None. **Appletree/India business term.**

### Reconciliation (two distinct screens)
**Definition**: TWO real, separate features share this word: (1) the "Reconciliation" tab — AR/AP
subledger-to-GL-control-account proof plus tax/customer-advance checks; (2) the "Bank Reconciliation"
tab — bank-statement-line matching.
**When to use**: Always with its qualifying scope clear from the screen/tab it lives on.
**SAP equivalent**: Account Reconciliation vs. Bank Reconciliation (both SAP products distinguish
these).
**Appletree meaning**: Identical distinction, already correctly implemented as 2 separate tabs.
**Abbreviation**: None.

### Trial Balance
**Definition**: The company-wide (or period-scoped) sum of debits and credits by GL account.
**When to use**: Everywhere.
**SAP equivalent**: Trial Balance (universal).
**Appletree meaning**: Identical; verified to genuinely compute a real trial balance, not
mislabeled.
**Abbreviation**: None.

### Accept / Reject vocabulary (four distinct, unrelated concepts — added Phase 42)
**Definition**: Four genuinely separate concepts each independently use "Accept"/"Reject"/"Pass"/
"Fail" wording, and must never be assumed to share one status or one meaning:
1. **QC item result** — `passFail`, per-inspection-item, present tense (`Pass`/`Fail`).
2. **QC checklist status** — `status` on the whole checklist, past tense (`Pending`/`InProgress`/
   `Passed`/`Failed`) — see the QC Checklist entry above.
3. **GRN accepted/rejected quantity** — `qtyAccepted`/`qtyRejected`, a goods-receipt quality split,
   unrelated to any QC checklist.
4. **Production accepted/rejected quantity** — `acceptedQty`/`rejectedQty` on a Production Order,
   unrelated to both QC and GRN.
5. **Quotation acceptance** — `recordAcceptance()`, a customer's commercial acceptance of a
   Quotation, unrelated to all of the above.
**When to use**: Always with its module/document context explicit — never say "Accepted"/"Rejected"/
"Passed"/"Failed" alone in training material without naming which of the 5 above it refers to.
**SAP equivalent**: Each has its own SAP analogue (QM Usage Decision, GR quality split, production
scrap/rework quantity, Sales Order acceptance) — not a single shared SAP concept either.
**Appletree meaning**: Five correctly-distinct concepts; no code defect exists here (unlike the QC
Dashboard's own separate field-read defect, tracked as DEF-2026-001) — this entry exists purely to
prevent a documentation/training reader from assuming these terms are interchangeable.
**Abbreviation**: None.

---

## Abbreviation quick-reference

| Abbreviation | Full form | First-use expansion required? |
|---|---|---|
| GRN | Goods Receipt Note | Already done in SOP; do in UI too |
| MRS | Material Requisition — Site | Already done once in UI; keep consistent |
| PR | Purchase Requisition | Already done (menu label) |
| MRQ | Material Requirement | Recommended, currently bare |
| MR | Material Request | Recommended, currently bare |
| APOB | Additional Place of Business | Missing — add per Change Plan item #5 |
| BOM | Bill of Materials | Already done once |
| AR / AP | Accounts Receivable / Accounts Payable | Statutory/universal abbreviation, widely understood by target audience, expansion optional |
| GST / CGST / SGST / IGST | Goods and Services Tax (+ Central/State/Integrated) | Statutory term, universally understood by Indian ERP users, expansion optional |
| HSN / SAC | Harmonized System of Nomenclature / Services Accounting Code | Statutory term, expansion optional given audience familiarity |
| TDS | Tax Deducted at Source | Statutory term, expansion optional |
| ITC | Input Tax Credit | Statutory term, expansion optional |
| JV | Journal Voucher | Already done (menu label) |
| CLR | Clearing (internal document prefix only, not user-facing as bare "CLR") | N/A |

This document should be updated whenever a new module or document type is added, and reviewed
whenever a future phase revisits any terminology decided here.
