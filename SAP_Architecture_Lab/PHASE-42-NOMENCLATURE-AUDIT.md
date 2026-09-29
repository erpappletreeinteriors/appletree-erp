# PHASE 42 — SAP Side-by-Side Nomenclature & Terminology Audit

**Date:** 2026-09-14. **Status: AUDIT / DESIGN PHASE ONLY. No code has been changed.** This document,
together with the 9 companion deliverables listed in §7, is the complete evidence base for a proposed
terminology standard. Nothing here is implemented until the user explicitly approves it.

Per the Phase 41 change-management baseline, this is a documentation/reporting-requirement task, not
a code change — confirmed appropriate to proceed without a separate change-request gate, since the
brief itself is the authorization and explicitly forbids any code/DB/route/UI modification.

## 1. Relationship to Phase 37

An earlier engagement phase, **Phase 37** (2026-09-11), already performed a rigorous, evidence-based
nomenclature audit covering Master Data, Procurement, Inventory, Finance, AR, AP, Banking, Tax,
Projects, Controlling, Manufacturing, Job Work, Site, Service, Reports, Workflow, Audit, and UI
terminology — ~22,000 lines, every claim cited to a real file:line, culminating in
`PHASE37_NOMENCLATURE_AUDIT_COMBINED_REPORT.md` (verdict B, 2 MUST-CHANGE items identified, never
implemented at the time).

**This phase does not repeat that work.** It:
1. Re-verifies, fresh, whether Phase 37's 2 MUST-CHANGE findings are still present in the current
   code (they are not — see §3).
2. Fills the two domains Phase 37 explicitly disclosed as under-audited or untouched: **Sales/CRM/
   Estimation** (Lead→Quotation, only lightly covered in Phase 37; fully live-tested since by Phase
   41) and **Security/Administration/Quality/Logistics** (never touched by Phase 37 at all).
3. Reformats the combined findings into the exact 19-column matrix, document/status vocabularies,
   executive scorecard, and business-decision framework this phase's brief requires.

## 2. Method

Two parallel, read-only research passes (Explore-agent-driven grep + code reading, zero code
modification) covered the gap domains, each grounding every claim in a real `file:line` citation from
`server/domain.js`, `server/server.js`, or `client_secure/index.html` — never from memory. Findings
were cross-checked against this engagement's own Phase 41 live-testing evidence (Lead, Estimation
Request, Costing Version, Quotation, Won transition, Viewer role, Backup/Restore — all already
API/browser-verified that phase) rather than re-derived from scratch.

**SAP reference scope**, per Part 5's own instruction not to assume one universal SAP label: this
audit cites **SAP S/4HANA** (by functional module — Finance, Sales, Procurement/MM, Manufacturing/PP,
Asset Accounting, Service, Security, Project Systems, Quality Management/QM, Logistics Execution/LE)
where a genuine equivalent exists, and **SAP Business One** where Appletree's flatter, single-entity
SME structure matches B1's simpler document model more closely than S/4HANA's multi-org one — the
same dual-source approach Phase 37 established and justified (single company, no CompanyCode/
multi-company-code structure; PR→PO→GRN→Bill→Payment→Clearing with no multi-level release strategy).
No live access to SAP's official documentation portal existed in this environment — citations reflect
widely and consistently documented SAP terminology, not a single source, per Part 5's own caveat.

## 3. Phase 37 currency re-verification (fresh this phase)

Both of Phase 37's confirmed MUST-CHANGE items are **already fixed** — done in Phase 39, entirely
independent of this nomenclature engagement, and re-verified fresh via direct grep this phase:

| Finding | Phase 37 status (2026-09-11) | Current status (verified 2026-09-14) |
|---|---|---|
| `domain.js` `label:'Vendor Payment'` | MUST CHANGE — inconsistent with "Supplier Payment" used everywhere else | **CLOSED.** `domain.js:279` now reads `label:'Supplier Payment'`, with an explicit in-code fix-comment citing the Phase 37 change plan. Zero "Vendor Payment" occurrences remain |
| `index.html` `<td>Business Partner</td>` (JE print template) | MUST CHANGE — implies a unified-master architecture that doesn't exist | **CLOSED.** `index.html:3556/3562/3608` now all say "Party"; the GL filter at `index.html:5561` labels it "Party (Customer / Vendor)". Zero "Business Partner" occurrences remain anywhere in `domain.js` or `index.html` |

Both are recorded as **CLOSED** in the master matrix (`PHASE-42-SAP-APPLETree-SIDE-BY-SIDE-MATRIX.csv`
rows AT-002/AT-003) rather than re-listed as open findings.

## 4. New domain coverage this phase

### 4a. Sales / CRM / Estimation

Lead → Estimation Request → Costing Version → Quotation → Won (Project+Customer+Baseline) is fully
inventoried (matrix rows AT-041 to AT-046). Key findings:
- **"Sales Order", "Opportunity", "Inquiry", and "Enquiry" are all confirmed absent** — zero matches
  anywhere in `domain.js`, `server.js`, or `index.html`. Appletree converts a Won Quotation directly
  into a Project, with no intermediate Sales Order document. This is a genuine, correct business-model
  difference (project-based fit-out vs. SAP's repeatable-order-against-stock model), not a naming gap.
- Costing Version vs. Quotation is correctly SAP-aligned (matches S/4HANA's own internal-cost-vs-
  customer-price separation) — Sales role is field-level-blocked from ever seeing cost breakdown.
- No real inconsistency found in this domain beyond a minor status-enum casing split (see §4c).

### 4b. Security / Administration

Fully inventoried (matrix rows AT-049 to AT-057). Key findings:
- The `ROLES` array (`domain.js:378`) is unchanged and confirmed: `Admin, CEO, Accountant,
  FinanceManager, ProjectManager, Purchase, Sales, Estimator, SiteInCharge, Viewer`.
- **"Authorization"/"Permission" are internal, code-only terms** — the UI correctly and consistently
  says "Role" to users. A deliberate, correct simplification for a non-technical audience.
- **"Maker-Checker" (named, Payment-Request-only) vs. "Segregation of Duties"/"SoD" (generic, ~20+
  document types)** are two distinct, correctly-scoped mechanisms — not interchangeable, not sloppy.
  No "4-eyes" terminology exists anywhere.
- **A newly-discovered non-defect gap, same pattern as Phase 41's Backup/Restore finding**: Login
  History (`DB.loginHistory`) and account-lockout state are fully tracked server-side but have **no
  dedicated UI screen** — `renderUsersRoles()` never displays either. This is an existing, working,
  fully-audited capability with no UI, exactly like Backup/Restore — **not a naming defect**, and per
  this engagement's own established precedent, not a gap this audit recommends building a UI to close.
- **"Company" is confirmed to be a report-title adjective only** ("Company Profit & Loss," "Company
  Balance Sheet"), never a real master-data entity — `DB.branches` remains the correct, closest analog
  to a legal-entity concept, matching Phase 37's own finding, re-confirmed fresh.

### 4c. Quality

Fully inventoried (matrix rows AT-058 to AT-060).

**A genuine functional code defect was discovered incidentally while researching this domain's
terminology — NOT a naming/nomenclature issue, and NOT fixed in this audit-only phase, per the
explicit STOP-GATE instruction governing this phase:**

> **`qcDashboard()` (`domain.js:5686-5697`) reads a field `c.result` that no QC Checklist record ever
> sets.** The real, actually-written field is `c.status` (`'Pending'/'InProgress'/'Passed'/'Failed'`,
> set at `domain.js:6536,6551`). Because `c.result` is always `undefined`, both the passed-branch and
> failed-branch conditions at `domain.js:5692` are permanently dead code — every QC Checklist,
> regardless of its real outcome, falls into the dashboard's "pending" bucket. The QC Dashboard's
> passed/failed counts and pass-rate percentage are wrong for every project, every time, as currently
> coded.

This is flagged here, in the master matrix (row AT-059), and in `PHASE-42-EXECUTIVE-SUMMARY.md` as a
**potential DEF finding requiring a separate, formally authorized change request** — consistent with
Part 13's own instruction ("If a label is conceptually wrong, classify it as a potential DEF finding
rather than merely a nomenclature preference. Do not change it in this phase.") and the Phase 41
change-management baseline's DEF-YYYY-NNN numbering scheme for any future fix.

Also found: 4 distinct, unconnected uses of "Accepted"/"Rejected" vocabulary (QC item/checklist
result, GRN receiving-quantity split, Production Order yield split, Quotation commercial acceptance)
— each internally consistent, but worth explicit documentation so a future reader never assumes they
share one meaning.

### 4d. Logistics / Execution

Fully inventoried (matrix rows AT-061 to AT-065).

**Assessment (per Part 4's explicit instruction not to force a SAP equivalence): Appletree's
Dispatch→Delivery→Installation→Handover chain does NOT map cleanly to SAP Logistics Execution, and
should not be forced into that vocabulary.** Evidence:
- Dispatch/Delivery here post **zero inventory or GL movement** — an explicit code comment
  (`domain.js:6348-6351`) states this outright. SAP's Outbound Delivery/Goods Issue pair always posts
  a real stock-out; Appletree's Dispatch/Delivery are pure tracking/proof-of-receipt documents.
- Installation and Handover (on-site labour execution, a QC-and-snag-gated customer sign-off) have
  **no SAP Logistics Execution equivalent at all** — SAP LE ends at delivery/billing.
- The pipeline that DOES resemble SAP-style goods movement with a challan is a **different, separate**
  module: Site Material / Delivery Challan (MRS→Delivery Challan→Site Material Receipt), which moves
  real inventory value and is unrelated to the customer-facing Dispatch chain.

**One genuine terminology overlap found**: "Delivery Confirmation" (DLV, customer-facing) and
"Delivery Challan" (DC, internal material movement) are two unrelated document types that both use
the word "Delivery." The code itself never confuses the IDs/prefixes, but a written standard should
explicitly disambiguate them for training/documentation purposes (matrix row AT-062).

## 5. Full findings

The complete, evidence-cited, 19-column, 65-row matrix is in
`PHASE-42-SAP-APPLETree-SIDE-BY-SIDE-MATRIX.csv`. Companion breakdowns:
`PHASE-42-DOCUMENT-VOCABULARY.md`, `PHASE-42-STATUS-VOCABULARY.md`,
`PHASE-42-TERMINOLOGY-INCONSISTENCIES.md`, `PHASE-42-SAP-MAPPING-DECISIONS.md`,
`PHASE-42-CHANGE-IMPACT-MATRIX.md`.

## 6. Recommendation categories used

Per Part 15, every term in the matrix received exactly one of: KEEP, RENAME, KEEP + SAP ALIAS, SAP
PRIMARY + APPLETREE ALIAS, APPLETREE-SPECIFIC, BUSINESS DECISION REQUIRED, DEFER. See
`PHASE-42-RECOMMENDED-TERMINOLOGY-STANDARD.md` for the consolidated, alphabetized standard.

## 7. Deliverable index

1. `PHASE-42-NOMENCLATURE-AUDIT.md` — this document
2. `PHASE-42-SAP-APPLETree-SIDE-BY-SIDE-MATRIX.csv` — the 65-row master matrix
3. `PHASE-42-RECOMMENDED-TERMINOLOGY-STANDARD.md`
4. `PHASE-42-DOCUMENT-VOCABULARY.md`
5. `PHASE-42-STATUS-VOCABULARY.md`
6. `PHASE-42-TERMINOLOGY-INCONSISTENCIES.md`
7. `PHASE-42-SAP-MAPPING-DECISIONS.md`
8. `PHASE-42-CHANGE-IMPACT-MATRIX.md`
9. `PHASE-42-EXECUTIVE-SUMMARY.md`
10. `PHASE-42-NOMENCLATURE-FINAL-CHECK.md`

## 8. No code changed — confirmed

`git status`/`git diff` for `server/domain.js`, `server/server.js`, `server/auth.js`, and
`client_secure/index.html` show **zero modifications from this phase** — every file touched this
phase is a new `PHASE-42-*` markdown or CSV document. See §8 of `PHASE-42-EXECUTIVE-SUMMARY.md` for
the explicit confirmation statement.
