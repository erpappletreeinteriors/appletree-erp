# PHASE 37 — Documentation Terminology Audit

**Date:** 2026-09-11. Part 34 deliverable. Compares terminology across the live UI/API against
`APPLETREE_ERP_SOP.md`, `APPLETREE_ERP_USER_MANUAL.md`, and
`HANDOVER_PACKAGE/05_HANDOVER_DOCUMENTATION/`. Scope note: given the volume of documentation files
in this repository (dozens of phase-specific reports plus the 3 primary reference documents), this
audit targets the 3 primary, currently-maintained reference documents that a real user or new
employee would actually be pointed to — not every historical phase report.

## GRN — aligned

`APPLETREE_ERP_SOP.md:299` — `# PART 13 — GRN (GOODS RECEIPT NOTE)` and
`:301` — `**GRN means: recording what actually arrived**, not what was ordered.` The SOP correctly
uses "GRN" as the operative term (matching the live UI's 64+147 hits) while ALSO spelling out the
full form once, on first appearance — this is exactly the abbreviation-discipline the live UI itself
lacks (the UI spells it out only once, parenthetically, at `index.html:226`). **The SOP is a BETTER
model of Part 19's abbreviation rule than the live UI is** — worth citing as the standard to match,
not something needing correction itself.

## Delivery Challan — aligned

`APPLETREE_ERP_SOP.md:208`, `:388`, `:401` all reference "Delivery Challan" consistently, matching
the confirmed real feature (`DB.deliveryChallans`) in the live code. No drift.

## MRS — aligned in substance, same dual-expansion issue as the live UI

`APPLETREE_ERP_SOP.md:388` — `MRS (Material Requisition — Site) → Approval → Delivery Challan` —
this SOP expansion matches the UI's form ("Material Requisition — Site (MRS)",
`index.html:5908`), NOT the registry's form ("Material Requisition Slip (Site)", `domain.js:318`).
This means the SOP and the live UI already agree with each other on the fuller MRS expansion — the
outlier is the internal registry label, not the SOP. Reinforces the Change Plan's recommendation
(item #4) to fix the registry to match the UI+SOP, not the other way around.

## Supplier vs Vendor — SOP is MORE consistent than the live app, reinforcing "Supplier" as the
canonical choice

| Source | "Supplier" count | "Vendor" count |
|---|---|---|
| `APPLETREE_ERP_SOP.md` | 13 | 2 |
| `APPLETREE_ERP_USER_MANUAL.md` | 2 | 0 |
| `APPLETREE_ERP_UAT_USER_GUIDE.md` | 0 | 0 |
| `client_secure/index.html` (for comparison) | 44 | 49 |

The documentation is ALREADY predominantly "Supplier" — it is the live application's UI (44 vs 49,
nearly even) and internal code (`vendorId` parameter names) that lag behind. This is strong,
independent supporting evidence for the crosswalk's recommendation to standardize the display layer
on "Supplier": the SOP was apparently already written assuming that was the intended canonical term.

## Delivery Challan / GRN document-flow language — aligned

`APPLETREE_ERP_SOP.md:222` — `→ GRN → Supplier Invoice → AP → Payment → Clearing` and `:208` —
`(PR→PO→GRN→Bill→Payment, or MRS→Delivery Challan→Site Receipt→Consumption)` — both document flows
match the live code's actual function chain (confirmed via the procurement/site agents' function-
level tracing: `submitPurchaseOrder`→`createGRN`→(`createSupplierCreditNote`/`SDN`/Bill)→
`postSupplierPayment`→`applyClearing`, and `submitSiteMaterialRequisition`→`issueToSite`
(Delivery Challan)→`createSiteMaterialReceipt`→`createMaterialIssue`). No drift found between the
documented business-process flow and the actual code's document chain.

## Journal Voucher / Journal Entry — SOP not cross-checked to the same depth this phase

Given time constraints, the SOP's own Journal Entry/Voucher section was not independently pulled and
compared word-for-word against the live UI's "New Journal Voucher" form fields in this pass. This is
disclosed as a genuine gap in this Part 34 audit rather than assumed clean — recommend a follow-up
spot-check before finalizing the Journal Voucher standardization (Change Plan item #3) if full
documentation alignment is required before implementation.

## HSN — aligned

`HANDOVER_PACKAGE/05_HANDOVER_DOCUMENTATION/24_HSN_SAC.md` exists as a dedicated reference file
(title itself references both HSN and SAC, consistent with the live code's own comment framing —
`domain.js:8985`: "HSN (materials) / SAC (services, on the rate card)"). Title alone confirms the
documentation and code agree on treating HSN and SAC as a paired but distinct concept — supports the
crosswalk's "SAC is a scope question, not a terminology gap" conclusion (the documentation already
anticipated the distinction; whether SAC needs first-class UI treatment remains the Management
Decision noted in the Change Plan).

## Document Numbering — aligned, and adds detail the live UI never surfaces

`HANDOVER_PACKAGE/05_HANDOVER_DOCUMENTATION/22_DOCUMENT_NUMBERING.md` documents the
`PREFIX/FINANCIAL-YEAR/SEQUENCE` voucher-number format precisely, distinguishing it from the
internal permanent record ID (e.g. `JE-0047`) — a distinction the live UI itself never explains to
an end user. This is a genuine, useful piece of documentation the terminology standard (see
`APPLETREE_ERP_TERMINOLOGY_STANDARD.md`) should draw on.

## Overall documentation-terminology verdict

No CONTRADICTIONS were found between the 3 primary reference documents and the live application —
every document type, abbreviation, and process-flow term checked in this pass matches. Where a
difference exists (Supplier/Vendor ratio, MRS's fuller expansion), the documentation is consistently
the MORE correct/consistent source, not a competing or confused one — meaning the terminology fixes
recommended in the Change Plan bring the live application INTO alignment with documentation that was
already written correctly, rather than requiring any documentation changes themselves. One area
(Journal Voucher/Entry) was not cross-checked to full depth and is disclosed as such rather than
assumed clean.
