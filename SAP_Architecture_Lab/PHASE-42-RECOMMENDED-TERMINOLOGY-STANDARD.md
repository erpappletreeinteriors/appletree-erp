# PHASE 42 — Recommended Terminology Standard (Proposed, Not Yet Approved)

**Date:** 2026-09-14. This extends `APPLETREE_ERP_TERMINOLOGY_STANDARD.md` (Phase 37's canonical
dictionary, 26 entries covering Procurement/Inventory/Manufacturing/Accounting) with the domains this
phase newly covered: Sales/CRM/Estimation, Security/Administration, Quality, and Logistics/Execution.
**Proposed only — supersedes nothing until explicitly approved; the existing Phase 37 document remains
authoritative for its 26 entries until then.**

Each entry: definition, SAP equivalent (with specific product/module context), recommendation
category (per Part 15's 7-category scheme), and use/don't-use guidance.

---

## Sales / CRM / Estimation (new this phase)

**Lead**
- Definition: first-contact prospect record, `LEAD_STATUSES` lifecycle NEW→…→WON/LOST
- SAP equivalent: Lead (SAP CRM/Sales Cloud — not native to S/4HANA Core)
- Recommendation: **KEEP** — correct India-SME term, no reason to adopt a CRM-suite concept Appletree doesn't run

**Estimation Request**
- Definition: formal request to size/cost a Lead's requirement, staging document between Lead and Costing
- SAP equivalent: none
- Recommendation: **APPLETREE-SPECIFIC**

**Costing Version**
- Definition: versioned internal cost buildup (material/labour/overhead/profit) against one Estimation Request
- SAP equivalent: Cost Estimate / Sales Order Costing (S/4HANA Sales)
- Recommendation: **KEEP + SAP ALIAS** ("Cost Estimate" documented as the conceptual equivalent, not used in UI)

**Quotation**
- Definition: customer-facing priced offer derived from a Costing Version, with a real discount-approval workflow
- SAP equivalent: Quotation (S/4HANA / Business One — exact)
- Recommendation: **KEEP** (already exact)

**Won / Mark Won**
- Definition: the event converting an Accepted Quotation into a real Project + Customer + Cost Baseline
- SAP equivalent: Quotation→Sales Order conversion (approximate — different downstream object)
- Recommendation: **APPLETREE-SPECIFIC** (a genuinely different, correct business-model choice)

**Sales Order / Opportunity / Inquiry**
- Definition: confirmed absent as real concepts anywhere in the codebase
- Recommendation: **DEFER** (not a naming question — a feature/roadmap question if Appletree ever wants a repeatable-order model; do not introduce a label for something that doesn't exist)

---

## Security / Administration (new this phase)

**Role** (user-facing) / Authorization, Permission (internal-only)
- Definition: one of 10 named business roles (`ROLES` array)
- SAP equivalent: Authorization Profile (S/4HANA) — a technical bundle, not a fixed business title
- Recommendation: **KEEP** the user-facing "Role" term; keep "Authorization"/"Permission" as internal-only code vocabulary, never surface to users

**Maker-Checker**
- Definition: the named 3-person maker→approver→executor flow, reserved specifically for Payment Requests
- SAP equivalent: Maker-Checker (SAP also uses this exact India-banking-derived term in payment contexts)
- Recommendation: **KEEP** — do not broaden this specific term to other document types (that's what "Segregation of Duties" is for)

**Segregation of Duties (SoD)**
- Definition: the generic creator-cannot-also-approve rule reused across ~20+ document types
- SAP equivalent: Segregation of Duties (universal)
- Recommendation: **KEEP**

**Login History**
- Definition: every login attempt, fully tracked server-side (`DB.loginHistory`), no dedicated UI
- SAP equivalent: Security Audit Log (SM20)
- Recommendation: **APPLETREE-SPECIFIC / DEFER** (real capability, no naming issue — a UI is a feature question, not addressed by this standard)

**Audit Log**
- Definition: the durable event-audit trail, menu label "Audit Log"
- SAP equivalent: Change Documents / Security Audit Log
- Recommendation: **KEEP**

**Branch**
- Definition: the closest real entity to a legal-entity/company record; no CompanyCode concept exists
- SAP equivalent: Company Code (not adopted — see `PHASE-42-SAP-MAPPING-DECISIONS.md`)
- Recommendation: **KEEP** — do not introduce "Company"/"Company Code" as a real entity

**Financial Period**
- Definition: the real accounting-period entity, `DB.financialPeriods`
- SAP equivalent: Fiscal Year Variant / Posting Period
- Recommendation: **KEEP**

**Master Data Import**
- Definition: the user-facing bulk-import feature; "migration guard" is a separate, internal-only code-comment term for schema-upgrade shims
- SAP equivalent: LSMW / Data Migration (Basis/technical tooling)
- Recommendation: **KEEP** both terms, kept correctly separate

**Backup / Restore**
- Definition: SHA-256-checksummed, Admin/CEO-gated, full-database backup and restore; no dedicated UI (by design, matching SAP's own Basis-layer pattern)
- SAP equivalent: Backup and Restore (SAP Basis)
- Recommendation: **KEEP** — do not build a UI merely for nomenclature symmetry (Phase 41's own established precedent)

---

## Quality (new this phase)

**QC Checklist**
- Definition: a one-off inspection instance (no reusable Inspection Plan/template exists)
- SAP equivalent: Quality Inspection / Inspection Lot (S/4HANA QM)
- Recommendation: **KEEP + SAP ALIAS**

**QC Dashboard**
- Definition: intended per-project Passed/Failed/Pending aggregation
- Naming: **KEEP** the name — the underlying aggregation has a confirmed functional defect (reads `c.result`, never set; real field is `c.status`), tracked separately, NOT a naming issue — see `PHASE-42-EXECUTIVE-SUMMARY.md`

**Inspection Plan** (reusable checklist template)
- Definition: confirmed absent — every QC Checklist is created fresh, no template entity exists
- Recommendation: **DEFER** (a feature question, not a naming one)

**QC Result / GRN Accepted-Rejected Qty / Production Rejected Qty / Quotation Acceptance**
- Definition: 4 genuinely distinct concepts that each independently use "Accepted"/"Rejected"/"Pass"/"Fail" vocabulary
- Recommendation: **KEEP all 4 distinct**, document explicitly so no future reader assumes they're one shared status

---

## Logistics / Execution (new this phase)

**Dispatch**
- Definition: readiness-checked, approved release event referencing a completed Production Order — posts zero inventory/GL
- SAP equivalent: Outbound Delivery initiation (approximate only — Appletree's does not post inventory)
- Recommendation: **KEEP**

**Delivery (Confirmation)**
- Definition: customer-facing proof-of-receipt against a Dispatch, cumulative partial tracking
- SAP equivalent: Proof of Delivery (approximate)
- Recommendation: **KEEP**, but see the Delivery Challan disambiguation below

**Delivery Challan**
- Definition: an UNRELATED internal warehouse→site/job-worker material-movement document
- SAP equivalent: Delivery Note / Goods Issue Document, and a genuine Indian statutory term
- Recommendation: **KEEP**, explicitly documented as distinct from "Delivery (Confirmation)" — both real, both correctly named, never actually confused in code, but a written standard must separate them

**Installation**
- Definition: on-site fit-out labour execution step, posts labour cost to Cost Centre CC-INSTALLATION
- SAP equivalent: none
- Recommendation: **APPLETREE-SPECIFIC**

**Handover**
- Definition: customer sign-off event, gated on Installation Completed + QC Passed + zero open Critical Snags
- SAP equivalent: none
- Recommendation: **APPLETREE-SPECIFIC**

**Billing Milestones**
- Definition: manually-reviewed billing trigger points (Advance/Production/Dispatch/Delivery/Installation/Handover/FinalBilling), never auto-triggered
- SAP equivalent: Milestone Billing (S/4HANA Project Systems)
- Recommendation: **KEEP + SAP ALIAS**

---

## Phase 37's original 26-entry standard

Remains authoritative and unchanged for Supplier, GRN, Material Issue, Material Return (Site),
Purchase Return, Stock, Inventory, Stock Count, Warehouse, Location, Site, MRS, Purchase Requisition
(PR), Material Requirement (MRQ), Material Request (MR), Delivery Challan (cross-referenced above),
Job Worker, APOB, Change Request (Variations), Clearing, Journal Voucher, Cost Centre, Profit Centre,
BOM, Production Order, Snag, Reconciliation, Trial Balance — see
`APPLETREE_ERP_TERMINOLOGY_STANDARD.md` for full entries.

## Approval status

**PROPOSED ONLY.** No entry above has been implemented in code, UI, database, API, or existing
documentation. This document exists to be reviewed and approved (in whole or per-entry) before any
implementation work begins, per this phase's STOP GATE.
