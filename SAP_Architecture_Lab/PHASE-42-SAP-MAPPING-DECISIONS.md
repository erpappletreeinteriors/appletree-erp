# PHASE 42 — SAP Mapping Decisions

**Date:** 2026-09-14. Per Part 4's explicit instruction: do not assume SAP equivalence. For every
term where a mapping decision was non-obvious, this document states the conceptual basis and the
decision, rather than a bare label swap.

## Decisions where a SAP-sounding term was deliberately NOT adopted

| Appletree term | Candidate SAP label | Why NOT adopted |
|---|---|---|
| Site (inventory-holding project location) | Storage Location (S/4HANA) | A Storage Location is a sub-division of a Plant/Warehouse in SAP's model — a purely internal warehouse concept. Appletree's "Site" is a project execution location with its OWN pooled inventory ledger, customer-facing, tied to a Project, not a Warehouse. These are different concepts even though both involve "where material sits" — forcing "Storage Location" would misrepresent Site's real role in the business |
| Handover | Proof of Delivery / Goods Receipt confirmation | SAP's Logistics Execution ends at delivery/goods-issue/billing — it has no concept of a physical, on-site, QC-and-snag-gated customer handover event. Handover is fit-out-specific; no SAP LE term captures what it actually gates on |
| Installation | Service Order / Work Order | Neither S/4HANA Service nor S/4HANA PP's Work Order concept models "labour cost posted against an on-site fit-out installation, gating a later Handover." Installation is closer to a project-execution milestone than either a Service Order (customer-support-ticket-driven) or Work Order (shop-floor-manufacturing-driven) |
| Dispatch → Delivery (customer-facing chain) | Outbound Delivery / Goods Issue | SAP's Outbound Delivery always culminates in a Goods Issue posting that moves real inventory value and typically hits COGS. Appletree's Dispatch/Delivery explicitly post ZERO inventory or GL value (confirmed by an explicit code comment) — they are pure tracking/proof-of-receipt documents referencing an already-completed Production Order. Adopting "Outbound Delivery"/"Goods Issue" would falsely imply a GL/inventory transaction that does not occur |
| Job Worker | Subcontractor (S/4HANA Subcontracting) | SAP Subcontracting is a specific PO-based mechanism with its own tax treatment (subcontracting challan, component reconciliation against a subcontract PO). Appletree's Job Worker model is India-GST-specific (registered/unregistered job worker, APOB declarations) with a genuinely different tax mechanism — not equivalent, correctly kept separate |
| Won (Quotation → Project conversion) | Sales Order creation | SAP converts an accepted Quotation into a repeatable Sales Order that can then be fulfilled from stock/production, potentially many times. Appletree converts directly into a single Project — a fundamentally different, project-based (not make-to-stock/make-to-order-repeatable) business model. No Sales Order concept exists or should be forced in |
| Costing Version | Sales Order Costing / Unit Costing | Approximate, adopted as an alias only — SAP's Sales Order Costing is tightly bound to an actual Sales Order (which Appletree doesn't have); Costing Version stands alone, tied only to an Estimation Request. Kept as Appletree's own term, with the SAP concept documented for context, not as a rename target |
| "Company" as a real entity | Company Code (S/4HANA org structure) | Appletree is a single-entity SME with no multi-company-code structure — introducing a real Company/CompanyCode master would be a significant, unjustified architecture change disproportionate to Appletree's actual scale. "Company" stays a report-title adjective only |

## Decisions where a SAP term WAS adopted as primary (or already matches)

See the master matrix (`PHASE-42-SAP-APPLETree-SIDE-BY-SIDE-MATRIX.csv`) rows classified **A** (exact
SAP equivalent, already correct) — Quotation, Purchase Requisition, Purchase Return, Cost Centre/
Profit Centre, BOM, Production Order, Clearing, Credit Note/Debit Note, Trial Balance, Post/Submit/
Approve/Reverse/Cancel/Close/Clear verb discipline, Maker-Checker/SoD, Lockout, Audit Log.

## Formal Business Decisions Required (no action taken — awaiting explicit sign-off)

Carried forward from Phase 37, none resolved by this phase (nomenclature audits don't resolve
business decisions — they surface them):

1. **MRQ rename target** — "Material Requirements" (MRQ) needs a replacement label distinct from
   "Material Requests" (MR). Candidates: "Material Demand," "BOM Material Need," or keep as-is with
   clearer on-screen explanatory text. **Not decided here.**
2. **Status-value internal casing** — whether to normalize 10 UPPERCASE_SNAKE / 16 PascalCase enums,
   contingent on first verifying zero raw-enum-value user exposure across all screens. **Not decided
   here; verification not yet performed.**
3. **SAC (Services Accounting Code) scope** — whether Appletree's billable services need first-class
   SAC treatment like HSN, or whether the current optional rate-card attribute is a deliberate,
   sufficient scope decision. **A Finance/Compliance question, not decided here.**
4. **"Business Partner" as a real unified-master concept** — explicitly out of scope for a
   nomenclature-only pass; would require unifying the Customer/Vendor masters, a genuine architecture
   change. Raised only so the question stays visible. **Not recommended either way.**

## New this phase

5. **Delivery Confirmation (DLV) vs Delivery Challan (DC) — documentation disambiguation** — both are
   correct, real, distinct documents; recommend the terminology standard explicitly separate them in
   writing so training material never conflates the two. **Documentation-only, no business decision
   needed — can proceed once the standard is approved.**
6. **Login History / Lockout UI** — same non-defect pattern as Phase 41's Backup/Restore: a real,
   working, fully-audited capability with no dedicated screen. Per this engagement's own established
   precedent (Phase 41 Section 13), **recommend NOT building a UI merely to satisfy a nomenclature
   symmetry with other admin screens** — flagged as an existing capability, not a gap requiring a
   business decision, unless Appletree separately wants a Security/Audit UI as its own feature
   request.

## Out-of-scope findings surfaced, not resolved

**QC Dashboard field-mismatch (`c.result` vs `c.status`)** is NOT a nomenclature/SAP-mapping question
— it is a functional code defect, fully detailed in `PHASE-42-NOMENCLATURE-AUDIT.md` §4c and
`PHASE-42-EXECUTIVE-SUMMARY.md`. It requires a separate, formally authorized change request
(`DEF-YYYY-NNN` per the Phase 41 baseline), not a mapping decision.
