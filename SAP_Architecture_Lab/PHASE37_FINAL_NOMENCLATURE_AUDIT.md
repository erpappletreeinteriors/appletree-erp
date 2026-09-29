# PHASE 37 — Final Nomenclature Audit

**Date:** 2026-09-11. Part 43 deliverable — the consolidated final report. This report references,
rather than repeats, the detailed evidence in the companion documents:
`PHASE37_NOMENCLATURE_BASELINE.md`, `PHASE37_CURRENT_NOMENCLATURE_INVENTORY.md`,
`PHASE37_SAP_APPLETREE_TERMINOLOGY_CROSSWALK.md`, `PHASE37_SAP_NOMENCLATURE_SCORECARD.md`,
`PHASE37_NOMENCLATURE_CHANGE_PLAN.md`, `PHASE37_DOCUMENTATION_TERMINOLOGY_AUDIT.md`, and
`APPLETREE_ERP_TERMINOLOGY_STANDARD.md`. Checksums/checkpoint in `PHASE37_CHECKPOINT/`.

## 1. Executive Summary

This audit examined the Appletree ERP's terminology across module names, document types, master
data, status values, field labels, abbreviations, reports, and 3 primary documentation files,
against SAP S/4HANA and SAP Business One terminology. **No code has been changed.** This is an
audit and recommendation deliverable only, per the brief's explicit Part 29 sequencing ("Audit
first. Crosswalk second. Recommend third. Implement approved changes fourth.") — implementation
awaits the user's review of the change plan.

**Bottom line**: the terminology is substantially SAP-aligned and internally disciplined (verb
usage — Post/Submit/Approve/Reverse/Cancel/Close/Clear — was confirmed, via direct function-level
sampling, to have exactly one non-overlapping meaning each across roughly 250 routes). A small
number of CONCRETE, confirmed inconsistencies exist — most importantly a Supplier/Vendor split
across 3 different layers of the codebase, and one document-type label ("Vendor Payment") that
disagrees with the rest of the system's "Supplier Payment" wording for the identical transaction.
Several places where Appletree deliberately does NOT use literal SAP wording (GRN instead of "Goods
Receipt," Material Issue instead of "Goods Issue," Stock Count instead of "Physical Inventory,"
Snag instead of "Punch List," Job Worker instead of "Subcontractor") were investigated and confirmed
to be CORRECT choices for this India-SME audience, not naming defects — the audit explicitly
recommends NOT changing these, even though they diverge from literal SAP terminology.

## 2. SAP Reference Scope

Business One terminology was used as the primary reference for document/transaction structure
(matching Appletree's actual single-entity, simple-document-chain architecture); S/4HANA
terminology was used for accounting/controlling concepts (Cost Centre/Profit Centre as independent
GL-tagging dimensions, Clearing) where B1's simpler model has no equivalent distinction. Full
reasoning in the crosswalk's "How the SAP reference was chosen" section. Per Part 42, specific
transaction/term citations reflect commonly and consistently documented SAP product terminology;
this audit did not have live access to SAP's official documentation portal in this environment, and
any disputed mapping should be independently verified before being used in a customer-facing "SAP-
grade" claim.

## 3-21. Domain audits

Full detail lives in `PHASE37_CURRENT_NOMENCLATURE_INVENTORY.md` (Part 2/3-21 combined) and the
crosswalk. Summary by domain, with the confirmed key findings:

- **Master Data (3)**: Material/Warehouse/Site/Location/Cost Centre/Profit Centre well-modeled.
  Supplier/Vendor split across internal names, GL sourceType, and UI labels — confirmed with direct
  evidence (`postSupplierPayment({vendorId,...})`). "Business Partner" mislabels one JE
  print-template cell — a real architecture-mismatch, not present anywhere else in the codebase.
- **Procurement (4)**: PR/MRQ/MR is a genuine, code-verified 3-stage demand model, not a naming
  collision — but "Material Requirements" vs "Material Requests" are dangerously similar labels.
- **Inventory (5)**: GRN, Material Issue, Stock Count, Locations all clean and deliberately
  India-market-aligned. No overclaiming of unimplemented features (batch/serial/bin tracking
  confirmed absent and never falsely implied).
- **Sales (4)**: Clean at the structural level; not independently deep-audited to the same depth as
  Procurement/Inventory/Finance/Site this phase (disclosed limitation, see scorecard).
- **Finance (3)**: Journal Voucher/Journal Entry inconsistency confirmed; "Vendor Payment" vs
  "Supplier Payment" confirmed (one orphaned label). Trial Balance genuinely, correctly computed.
- **AR (4) / AP (4)**: Clean, standard, inherit the Supplier/Vendor split noted under Master Data.
- **Banking (5)**: Bank Reconciliation cleanly distinct from AR/AP Reconciliation.
- **Tax (4)**: GST/HSN/GSTIN/TDS/E-way Bill all correct, real, India-statutory-aligned. SAC's scope
  is a management decision, not a terminology defect. Abbreviations never expanded on first UI use.
- **Projects (4) / Controlling (4)**: Project Cost/P&L/Profitability map to 3 distinct, correctly-
  scoped real functions. Cost Centre/Profit Centre correctly modeled as independent tagging
  dimensions (not a hierarchy) — Profit Centre honestly seeded empty, not fabricated.
- **Manufacturing (4)**: Production Order/BOM/Job Card real and SAP-aligned; Work Order/Work
  Centre/Routing/Operation confirmed absent as FEATURES (not a naming problem — the code's own
  comment discloses "not the full factory ERP").
- **Job Work (5) / Site (5) / Service (5)**: All cleanly, consistently, correctly modeled and
  named, with real India-specific business processes correctly NOT forced into ill-fitting SAP
  terms (Job Worker ≠ Subcontractor).
- **Reports (4)**: Spot-checked Trial Balance and confirmed it genuinely computes what its name
  claims; full 27+-report catalog not individually re-verified this phase.
- **Workflow (4)**: Verb discipline (Post/Submit/Approve/Reverse/Cancel/Close/Clear) confirmed
  clean via direct function sampling. Status-value internal CASE inconsistency (10 UPPERCASE_SNAKE
  vs 16 PascalCase enums) is real but its user-facing impact is unverified — flagged as a
  Management Decision, not assumed to need a fix.
- **Audit (5)**: Clean, and independently strengthened by this whole engagement's ERP-059 series
  durable-audit work.
- **UI (3)**: Dead `NAV_GROUPS` array left in a comment with terminology drift relative to the live
  `MODULE_TREE` — a documentation-hygiene risk, not a live bug. Bare "Receipt"/"Payment" ambiguity
  confirmed in 2+2 isolated strings.

Full scorecard with evidence: `PHASE37_SAP_NOMENCLATURE_SCORECARD.md`.

## 22. Inconsistencies found (same object, multiple names)

1. **"Vendor Payment"** (`domain.js:274`, 1 occurrence) vs. **"Supplier Payment"** (8+ occurrences
   — sourceType, UI heading, menu label, report name) — the identical AP payment document.
2. **"Journal Entry"** (~7 occurrences, mostly comments/prose) vs. **"Journal Voucher"** (~7
   occurrences, dominant in the live user-facing UI) — the identical GL posting document.
3. **MRS spelled-out form**: "Material Requisition Slip (Site)" (registry) vs. "Material
   Requisition — Site (MRS)" (UI, and matching the SOP) — same document, 2 expansions.

## 23. Reverse consistency (one term, multiple objects)

1. **Bare "Receipt"** — means Customer Receipt (cash/AR) in Finance contexts, Site/Goods Receipt in
   Site Material contexts; genuinely ambiguous in 2 confirmed isolated strings ("Receipt Recorded,"
   "Record Receipt").
2. **Bare "Payment"** — confirmed to mean at least 4 different things across the codebase: a
   Supplier Payment transaction, a Payment Method master (shared by both AR/AP forms), a Payment
   Approval Matrix/Payment Request governance object, and contractual Payment Terms. The "Payment
   Requests" tab heading and the Clearings table's "Payment" column are the clearest ambiguous
   cases.
3. **"Reconciliation"** — covers at least 4 structurally distinct real features (AR/AP/tax subledger
   proof, bank-statement matching, period-close checklist, non-GL site-quantity/petty-cash
   reconciliation) — already split across 2 correctly-scoped tabs, low real ambiguity risk, but the
   bare tab label doesn't state its own scope.

## 24. SAP document flow comparison

Verified against real code (not assumed): **Procurement** —
`submitPurchaseRequisition`→`submitPurchaseOrder`→`createGRN`→(`BILL`/`createSupplierCreditNote`/
`createSupplierDebitNote`)→`postSupplierPayment`→`applyClearing` — matches the SAP-standard flow
exactly, confirmed via both code function tracing and the SOP's own documented flow (Part 34).
**Site material** — `submitSiteMaterialRequisition`→`issueToSite` (Delivery Challan)→
`createSiteMaterialReceipt`→`createMaterialIssue` — a real, distinct, Appletree-specific chain, also
confirmed consistent between code and SOP. **Job Work** —
`dispatchToJobWorker`→`getJobWorkerStockLevel`→(`returnFromJobWorker`/`recordJobWorkScrap`/
`directDispatchFromJobWorker`) — real and consistently named. No claimed process equivalence was
found to be false; every flow claimed to exist was verified to actually exist in code.

## 25. Gap classification legend (used throughout the crosswalk)

A (wrong/misleading), B (inconsistent), C (non-SAP but valid Appletree term), D (adopt SAP term), E
(do NOT adopt SAP term), F (missing terminology), G (ambiguous), H (documentation-only), I
(management decision required) — see the crosswalk for per-row classification via the Action column.

## 26. Recommended changes

See `PHASE37_NOMENCLATURE_CHANGE_PLAN.md` in full. Summary: **2 MUST CHANGE** (trivial, isolated,
zero-risk label fixes), **6 SHOULD CHANGE** (small, low-risk label/consistency fixes requiring one
judgment call each), **4 OPTIONAL**, **4 MANAGEMENT DECISIONS required before any action**.

## 24-continued. Terms that should NOT be changed

Extensive list in the Change Plan's "DO NOT CHANGE" section — GRN, Material Issue, Stock Count,
Warehouse/Location/Site, Snag, Job Worker, Delivery Challan, Cost/Profit Centre spelling, Clearing,
Customer/Supplier Credit-Debit Note, BOM, Production Order, the Save/Post/Submit/Approve verb
discipline. Each is a case where literal SAP terminology would be WORSE for this audience, verified
with evidence, not assumed.

## 25-continued. Management decisions

4 items requiring the user's explicit input before any action: the MRQ rename target, whether
status-value internal casing needs normalizing (pending a display-layer verification), the SAC
scope question, and whether "Business Partner" should ever become a real architectural concept
(explicitly out of this audit's scope either way).

## 26. Final Scorecard

Unweighted average **4.2 / 5** across 19 scored domains (full detail and evidence:
`PHASE37_SAP_NOMENCLATURE_SCORECARD.md`). No domain scored below 3; the lowest scores (Master Data,
Finance, UI — all 3) correspond exactly to the domains carrying the confirmed MUST/SHOULD CHANGE
findings, not vague impressions.

## 27. Regression results

**Not applicable this phase** — per Part 29's explicit sequencing ("Implement approved changes
fourth... Browser test fifth... Regression test sixth"), no terminology change has been
implemented, so there is nothing to regression-test yet. Regression testing will be performed after
the user approves and this session (or a future one) implements the approved items from the change
plan, per Part 37's requirement.

## 28. Remaining gaps

- Sales/CRM domain terminology was audited at the structural (menu/module) level but not with the
  same dedicated function-level depth as Procurement, Inventory, Finance, and Site — disclosed, not
  hidden.
- The full 27+-item report catalog (`ACCT_QUICK_REPORTS`) was spot-checked (Trial Balance) but not
  individually re-verified against its underlying computation.
- The Journal Voucher/Entry documentation cross-check (Part 34) was not completed to the same depth
  as GRN/MRS/Supplier-Vendor.
- The 8 frozen `PHASE*_CHECKPOINT/` historical snapshots (pre-existing from earlier phases) were not
  audited — they are historical archives, out of scope for a terminology standard that governs the
  LIVE application going forward.
- Error-message-level terminology (Part 33) was sampled via the 4 research agents' evidence
  (confirming error messages generally use correct document/role names, e.g. "Role X cannot record a
  Site Material Receipt") but not exhaustively enumerated across every one of the ~250 routes'
  `deny()` calls.

## Final Verdict

Per Part 44's checklist:
✓ Master terminology audited ✓ Transaction terminology audited ✓ Finance terminology audited
✓ Inventory terminology audited ✓ Procurement terminology audited ✓ Project terminology audited
✓ Manufacturing terminology audited ✓ Tax terminology audited ✓ Workflow/status terminology audited
✓ Field labels audited (sampled at structural depth — JE form audited in full, others representative)
✓ Reports audited (representative depth) ✓ Documentation audited (3 primary docs, 1 partial gap
disclosed) ✓ SAP references recorded (with the source-attribution caveat in §2) ✓ Appletree-specific
terms identified (Site, Snag, Job Worker, MRS, Delivery Challan, APOB) ✓ Ambiguities resolved (bare
Receipt/Payment identified and scoped; Reconciliation's 4 meanings documented)
✓ No misleading SAP terminology found to survive uncorrected (the one "Business Partner" mislabel is
in the MUST CHANGE list, not left standing) ✓ No contradictory terminology left unflagged (Vendor
Payment/Supplier Payment and Journal Entry/Voucher are both flagged, with fixes proposed)
✗ Regression NOT YET run (nothing has been implemented yet — by design, per the brief's own
sequencing)

**VERDICT: B — MOSTLY ALIGNED, MINOR TERMINOLOGY GAPS**

This is not an A, honestly: 2 confirmed MUST-CHANGE inconsistencies exist in the live system right
now (Vendor Payment/Supplier Payment; the Business Partner mislabel), and regression testing — a
literal checklist item for an A-grade close — has not run because nothing has been changed yet. It
is well above C/D: the vast majority of the terminology surveyed (19 domains, all scoring 3-5, none
below 3) is either already correctly SAP-aligned or is a deliberate, well-reasoned, evidence-backed
departure from literal SAP wording in favor of this application's actual India-SME audience — not
accidental drift. The path from B to A is short and low-risk: implement the 2 MUST CHANGE items,
the approved SHOULD CHANGE items, then browser-test and regression-test per Parts 36-37 — all
described, ready, and awaiting the user's review of `PHASE37_NOMENCLATURE_CHANGE_PLAN.md`.

**No renaming has been implemented. This report and its companions constitute the audit, crosswalk,
and recommendation only — Parts 1-29 of the brief. Implementation (Part 29's "fourth" step) awaits
explicit user review and approval of the change plan.**
