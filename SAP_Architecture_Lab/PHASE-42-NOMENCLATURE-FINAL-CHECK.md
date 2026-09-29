# PHASE 42 — Nomenclature Final Check

**Date:** 2026-09-14. Per Part 21, the 14 required closing questions, answered honestly against the
evidence in the other 9 deliverables.

| # | Question | Answer |
|---|---|---|
| 1 | Is every major Appletree business term defined? | **Substantially yes.** 65 term-groups spanning all domains named in the brief's Part 3 list are matrix-defined with evidence. Not literally exhaustive — representative-depth sampling was used for prose/tooltips/error messages (consistent with Phase 37's own disclosed method), and 3 report catalogs (27+ reports) were not individually re-verified term-by-term |
| 2 | Is every major term mapped to SAP where a genuine equivalent exists? | **Yes.** 17 exact + 21 deliberate-alias mappings (Classification A/B), each with a specific SAP product/module context stated, not a bare "SAP uses this too" claim |
| 3 | Are false SAP equivalences avoided? | **Yes.** `PHASE-42-SAP-MAPPING-DECISIONS.md` documents 7 specific cases where a SAP-sounding label was deliberately NOT adopted (Site≠Storage Location, Handover≠Proof of Delivery, Dispatch/Delivery≠Outbound Delivery/Goods Issue, Job Worker≠Subcontracting, Won≠Sales Order creation, Costing Version kept distinct from Sales Order Costing, Company/CompanyCode not introduced) |
| 4 | Are Appletree-specific terms preserved where appropriate? | **Yes.** 15 terms classified D (Site, Estimation Request, Material Return (Site), Material Requirement/Request, Change Request, Job Worker, APOB, Snag, Installation, Handover, Won, and the confirmed-absent WBS/Batch-tracking/Sales-Order) — none recommended for forced SAP renaming |
| 5 | Is terminology internally consistent? | **Mostly, with 10 confirmed exceptions.** `PHASE-42-TERMINOLOGY-INCONSISTENCIES.md` lists all 16 found (2 already closed), plus 14 brief-suggested candidate pairs checked and found NOT to be real inconsistencies — reported honestly rather than padded |
| 6 | Are document names consistent? | **Yes, with one real overlap.** `PHASE-42-DOCUMENT-VOCABULARY.md` covers every major document type with prefix/SAP-equivalent/lifecycle; the one genuine overlap (Delivery Confirmation vs. Delivery Challan, both legitimately using "Delivery") is explicitly flagged for written disambiguation, not silently left ambiguous |
| 7 | Are workflow/status names consistent? | **Consistent in MEANING, inconsistent in internal CASING.** `PHASE-42-STATUS-VOCABULARY.md` confirms all 26 status enums share one coherent Draft→Submitted→Approved→Posted/Closed spine; the 10-vs-16 casing split is real but flagged as unverified for user-facing impact, not assumed harmless or assumed harmful |
| 8 | Are reports using semantically correct terminology? | **Spot-checked, not exhaustively re-verified.** Trial Balance independently confirmed to compute what it claims (Phase 37, unchanged). One genuine semantic defect was found in the QC Dashboard — correctly classified as a functional bug, not a terminology finding, and NOT fixed in this phase per the STOP GATE |
| 9 | Are API/database names documented without unnecessary migration? | **Yes.** Every internal-vs-display split found (vendorId/Supplier, migration-guard/Master Data Import) is recommended to STAY split — no database migration is proposed anywhere in this audit |
| 10 | Is the recommended vocabulary suitable for an interior-design ERP? | **Yes.** India-market terms (GRN, Snag, Job Worker, MRS, Delivery Challan, APOB) are explicitly preserved over literal SAP wording throughout; SAP terms are adopted only where they cost nothing in real-world usability |
| 11 | Would a professional SAP consultant understand the terminology? | **Yes, with context.** Every departure from literal SAP wording is documented WITH its SAP-equivalent alias (e.g., "GRN, SAP: Goods Receipt"), so a consultant reading the standard can map concepts even where Appletree's own screens use different words |
| 12 | Would an Appletree employee understand the terminology? | **Yes** — this is the explicit design principle behind every KEEP/APPLETREE-SPECIFIC recommendation; not one recommendation in this audit sacrifices staff usability to imitate SAP |
| 13 | Can the terminology standard be implemented incrementally? | **Yes.** `PHASE-42-CHANGE-IMPACT-MATRIX.md` scores every open item LOW/MEDIUM/HIGH individually — the LOW items (8 of them) can each be approved and implemented independently without waiting for the MEDIUM/HIGH business-decision items |
| 14 | Are all proposed changes traceable to a documented reason? | **Yes.** Every row in the 65-row matrix carries a Rationale column; every inconsistency in `PHASE-42-TERMINOLOGY-INCONSISTENCIES.md` cites its evidence; nothing is recommended on the basis of "SAP does it this way" alone |

## Confirmation of the stop-gate discipline

- **No terminology change implemented.**
- **No database field renamed.**
- **No API renamed.**
- **No UI label changed.**
- **No route changed.**
- **No document ID changed.**
- **No report calculation changed.**
- **No business logic changed.**
- **No git commit created.**

One functional defect (QC Dashboard) was discovered as a side effect of this research and is
explicitly, deliberately NOT fixed here — recorded for a future, separately authorized change request
per the Phase 41 change-management baseline's `DEF-YYYY-NNN` scheme.

## Final status

**STOP GATE HELD.** All 10 required deliverables are complete. Waiting for explicit user review and
approval before any implementation begins.
