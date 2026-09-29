# UAT Known Limitations

**Date:** 2026-09-16. Per Section 13: known capability gaps, none automatically treated as blockers.
Only Appletree's own business scope decides whether a gap blocks UAT for a given business process.

| Item | Classification | Detail |
|---|---|---|
| JSON persistence architecture (single `db.json` file, not a real DBMS) | LIMITATION | Confirmed working, file-locked, backed up/restored with SHA-256 integrity; adequate at Appletree's current single-entity SME scale. Not a UAT blocker for functional/business-process testing. A future capacity/concurrency question, not a defect |
| Historical reporting limitations | LIMITATION | The full 27+-report catalog is not individually re-verified term-by-term every phase (Phase 42's own honest finding #8) — Trial Balance and the core reconciliation reports ARE independently verified exact, repeatedly. Report-by-report UAT sign-off should specifically confirm any report not already covered by `UAT-TRACEABILITY-MATRIX.csv` |
| FG (Finished Goods) receipt/valuation/accounting completeness | LIMITATION | Manufacturing cost tracking (Job Cost Sheet, Product Costing) exists and is tested; a full FG-asset capitalization pathway analogous to a discrete-manufacturing ERP is not part of this system's current scope (Appletree is fit-out/project-based, not make-to-stock) |
| Routing / Work Centres | NOT APPLICABLE | Confirmed absent by direct code search (Phase 42 audit); BOM/Production Order exist and are correctly SAP-aligned for what they model. No SAP Work Centre/Routing concept exists in this system's design, by deliberate scope choice, not omission |
| MRP (Material Requirements Planning) | FUTURE ROADMAP | Confirmed absent; a genuine feature question for a future phase, not a defect. The existing Material Requirement (MRQ) mechanism covers manual BOM-driven material need, not automated MRP run/netting |
| Sales Order | NOT APPLICABLE | Confirmed absent by direct code search; Appletree's business model converts a Won Quotation directly into a Project (a deliberate, correct architectural choice per `PHASE-42-SAP-MAPPING-DECISIONS.md`), not a repeatable Sales Order. Do not test for or expect this concept |
| WBS (Work Breakdown Structure) | FUTURE ROADMAP | Confirmed absent; Project 360/Budget vs Commitment vs Actual provide project-level financial structure without a formal WBS hierarchy |
| Batch/Serial tracking | FUTURE ROADMAP | Confirmed absent; Moving Average inventory valuation exists without lot/serial granularity — adequate for Appletree's current material types (sheet goods, hardware), a genuine feature question if that ever changes |
| Workforce / Payroll scope | NOT APPLICABLE | Labour & Wages / Timesheet exist as project-cost and time-tracking mechanisms, deliberately NOT a payroll system — Appletree's actual payroll (if any) is out of this system's scope by design |
| Maintenance scope (plant/equipment maintenance, distinct from Service/AMC) | NOT APPLICABLE | Service/Complaint/Ticket/Visit/AMC exist for CUSTOMER-facing after-sales service; internal equipment/machine maintenance scheduling is a different, unbuilt concept |
| E-signature | LIMITATION | Quotation Acceptance is explicitly recorded as `"Acceptance recorded (manual — e-signature integration pending)"` — a disclosed, intentional gap, not hidden. Not a UAT blocker unless Appletree's business scope specifically requires digital signature capture for legal purposes |
| Advanced manufacturing QC (SPC, sampling plans, Inspection Plan templates) | FUTURE ROADMAP | Confirmed absent — every QC Checklist is created fresh, no reusable Inspection Plan/template entity exists (Phase 42 finding). Ad-hoc QC Checklists ARE fully functional and tested |
| Import limitations | LIMITATION | CSV import for Journal Vouchers and Master Data exists and is atomic (a batch with one bad row is rejected as a whole — `erp_audit_p0_tests.js` ERP-017); scope is limited to what those two importers cover, not a general-purpose data-migration tool |
| Opening balance atomicity | LIMITATION | Opening Balances screen exists; the underlying mechanism was part of the original Financial ERP Engine build (2026-07-29) — not independently re-verified for atomicity this specific engagement's own testing window. Recommend one confirmatory UAT scenario if Appletree plans to use it for a real go-live cutover |
| TDS edge cases | LIMITATION | Core TDS engine (auto-deduction at Supplier Payment time, category/threshold-driven) works and is explicitly, honestly labeled "SOP CONFIGURATION, not independently verified as current tax law — Tax/Legal review required before relying on this for filing" (the system's own on-screen disclosure, unchanged this engagement) |
| Billing milestone edge cases | LIMITATION | Core milestone billing (never auto-triggers, requires explicit Ready mark) works and is tested; a known, previously-disclosed edge case exists (invoice reversal does not reset a milestone's status back to Ready — a Phase 9 finding, still an open Business Decision Required item, Option A reset vs Option B preserve-history) |
| Advanced reporting (ad-hoc report builder, drill-anywhere BI) | NOT APPLICABLE | Cross-Dimensional Reports and the existing report catalog cover structured, purpose-built reports; a general-purpose ad-hoc report builder is not part of this system's scope |
| Backup/Restore UI | NOT APPLICABLE (not a gap) | Deliberately API-only, Admin/CEO-gated, per an explicit Phase 41/42 precedent NOT to build a UI merely for nomenclature/screen symmetry. A real, fully-tested capability — see `PHASE_41_BACKUP_RESTORE_AUDIT.md` |
| MRQ vs MR naming confusability | LIMITATION | A genuine, disclosed internal-terminology confusability risk (Phase 37/42 finding), pending a Business Decision on a rename target — does NOT affect functional correctness, only training/onboarding clarity |
| Status-enum internal casing inconsistency (26 arrays, 10 UPPERCASE_SNAKE / 16 PascalCase) | LIMITATION | Confirmed real (Phase 42), rated HIGH-risk to normalize (would touch hundreds of call sites); display-layer impact not yet verified. Does not affect functional correctness — purely an internal code-style question |
| The historical production database incident (ERP-059B) | SEPARATE, NOT REOPENED HERE | See Section 14 discussion in `UAT-READINESS-REPORT.md` — its documented status is unchanged by this UAT-readiness phase; not re-investigated, not claimed resolved, not touched |

## Reading this table

**None of the LIMITATION, NOT APPLICABLE, or FUTURE ROADMAP items are UAT BLOCKERS.** No item in
this table is classified UAT BLOCKER — every domain a real UAT cycle needs to exercise (the 42-domain
`UAT-SCOPE-MATRIX.csv`) is either UAT READY or UAT READY WITH LIMITATIONS, and every "WITH
LIMITATIONS" domain's limitation is listed here with its honest reason. Appletree's business owner
should review this table specifically to confirm none of these gaps fall inside the business scope
they intend to test — if one does, that single item becomes a genuine UAT BLOCKER for that specific
scenario only, not for the system as a whole.
