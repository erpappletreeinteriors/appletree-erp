# PHASE 42 — Executive Summary

**Date:** 2026-09-14. Nomenclature standardization / SAP benchmark audit. **AUDIT AND DESIGN ONLY —
NO CODE WAS CHANGED.**

## Bottom line

Appletree ERP's terminology is substantially SAP-aligned and internally disciplined, extending the
same conclusion Phase 37 reached for Procurement/Inventory/Finance/Manufacturing/Service into the
domains this phase newly covered (Sales/CRM, Security/Administration, Quality, Logistics/Execution).
Both of Phase 37's confirmed label bugs ("Vendor Payment," "Business Partner") were **already fixed
in Phase 39**, independent of this engagement — re-verified fresh this phase. No new critical naming
defect was found in the new domains. **One genuine functional code defect (not a naming issue) was
discovered incidentally: the QC Dashboard reads a field that is never set, so its Passed/Failed
counts are always wrong.** This is flagged for a separate, formally authorized change request per the
Phase 41 change-management baseline — it is explicitly NOT fixed in this audit-only phase.

## Part 20 — Repository-wide totals (second independent pass, per Part 20's own requirement)

A second search confirmed the master matrix (`PHASE-42-SAP-APPLETree-SIDE-BY-SIDE-MATRIX.csv`, 65
rows) covers all major ERP modules, screens, documents, workflows, statuses, reports, and business
entities named in the brief's own Part 3 domain list. Counts, derived directly from the matrix
(Classification column), not padded:

| Metric | Count |
|---|---|
| Total significant terms/term-groups found | **65** |
| Exact SAP equivalents (Classification A) | **17** |
| SAP-equivalent concept, Appletree terminology retained (Classification B) | **21** |
| SAP aliases recommended (subset of B, documented not adopted in UI) | **~21** (same rows — every B-classified term already carries a documented SAP alias) |
| Appletree-specific terms, no SAP equivalent (Classification D) | **15** |
| Internal inconsistencies requiring standardization (Classification E) | **10** |
| Business decisions required (Classification F + flagged rows) | **~8** (SAC scope, MRQ rename, status casing, WBS/Batch-tracking feature questions, Business Partner architecture question, Sales Order feature question) |
| Potential semantic/functional defects surfaced (not nomenclature) | **1** (QC Dashboard field mismatch) |
| Potential terminology changes identified (open, not yet approved) | **~10** (2 already closed pre-phase: Vendor Payment, Business Partner) |
| High-risk terminology changes | **1** (26-array status-enum casing normalization, if ever pursued) |

## Part 17 — Executive nomenclature maturity score (0-100 per domain)

| # | Domain | Score | Basis |
|---|---|---|---|
| 1 | Finance | **82** | Both confirmed label bugs already fixed; Journal Voucher/Entry minority-usage split and bare Receipt/Payment ambiguity remain open, low-severity |
| 2 | Sales | **85** | Clean, newly-audited domain; Costing-vs-Quotation separation correctly mirrors SAP's own cost/price split; no Sales Order/Opportunity/Inquiry falsely implied anywhere |
| 3 | Procurement | **78** | Strong document-flow discipline; MRQ/MR near-identical naming is a genuine, still-open confusability risk pending a business decision |
| 4 | Inventory | **92** | Deliberately, consistently India-aligned (GRN, Material Issue, Stock Count); zero confirmed defects |
| 5 | Project | **84** | Cost/P&L/Profitability 3-way distinction is SAP-CO-aligned and correctly separated; final UI-copy confirmation still pending from Phase 37 |
| 6 | Manufacturing | **80** | BOM/Production Order terminology correctly SAP-aligned; Work Centre/Routing absence is an honestly-disclosed feature gap, not a naming defect, so it doesn't depress this score further |
| 7 | Quality | **80** | QC Checklist/Snag terminology itself is clean and correctly India-aligned; a present/past-tense split (Pass/Fail vs Passed/Failed) and the 4-way Accept/Reject vocabulary overlap are real but minor documentation gaps — the QC Dashboard's functional defect does NOT lower this score, since the term "QC Dashboard" itself is correctly named (the underlying bug is tracked separately, not as a nomenclature finding) |
| 8 | Logistics | **78** | Dispatch/Installation/Handover are cleanly, correctly named for a genuinely non-SAP-LE-shaped process; the Delivery Confirmation vs. Delivery Challan overlap is the one real finding needing written disambiguation |
| 9 | Service | **90** | Warranty/Complaint/Ticket/Visit/AMC/CAPA all clean and internally coherent (Phase 37 finding, unchanged, not independently re-verified this phase) |
| 10 | Security | **86** | Role/Authorization/Permission/Maker-Checker/SoD all cleanly, deliberately distinct; Login History's UI absence is a non-defect capability gap, not a naming issue |
| 11 | Reporting | **78** | Trial Balance spot-checked and genuinely correct; the full 27+-report catalog is not individually re-verified this phase or last (disclosed, not hidden) |
| 12 | Cross-module consistency | **68** | The weakest category — bare Receipt/Payment, Delivery vs Delivery Challan, the 4-way Accept/Reject overlap, and status-enum casing splitting even within the single Lead→Quotation pipeline are all genuine cross-cutting findings, none individually severe but collectively the most room for improvement |
| 13 | SAP alignment | **83** | 17 exact + 21 deliberate-alias mappings out of 65 terms, with every departure from literal SAP wording evidence-backed as a deliberate, reasoned India-SME choice rather than accidental drift |
| 14 | User friendliness | **88** | India-market-familiar terms (GRN, Snag, Job Worker, MRS, Delivery Challan) deliberately preserved over literal SAP wording; SAP terms adopted only where they don't cost real-world usability |

**Unweighted average: 82.3 / 100** across 14 domains. No domain below 68. The lowest-scoring domain
(Cross-module consistency) corresponds exactly to where the confirmed Classification-E findings
concentrate — not a vague impression.

## What changed vs. what's still open

**Closed before this phase began** (Phase 39, re-verified fresh this phase): "Vendor Payment"→
"Supplier Payment" label; "Business Partner"→"Party" label.

**Still open, low-risk, ready for approval**: Journal Voucher/Entry standardization, MRS registry
label fix, APOB inline expansion, bare Receipt/Payment qualification, Delivery Confirmation/Delivery
Challan documentation disambiguation, Accept/Reject 4-concept documentation clarification, dead
`NAV_GROUPS` array deletion, snag-severity dead-code cleanup.

**Business decisions required, not yet made**: MRQ rename target, status-enum casing normalization
(pending display-layer verification), SAC first-class-field scope, Business Partner architecture
question, WBS/Batch-tracking/Sales-Order feature questions (all explicitly feature questions, not
nomenclature ones).

**Flagged, not a nomenclature item — requires a separate authorized change request**: QC Dashboard
reads `c.result` (never set) instead of `c.status` — every project's QC pass/fail counts render
incorrectly. See `PHASE-42-NOMENCLATURE-AUDIT.md` §4c for full detail.

## Confirmation: no code changed

`git status`/`git diff` for `server/domain.js`, `server/server.js`, `server/auth.js`, and
`client_secure/index.html` show **zero modifications from this phase**. Every file touched or created
this phase is a `PHASE-42-*.md`/`.csv` document. No git commit was made.

## Next step

Per this phase's STOP GATE: **wait for explicit user approval before implementing any nomenclature
change.** See `PHASE-42-NOMENCLATURE-FINAL-CHECK.md` for the closing 14-question self-test.
