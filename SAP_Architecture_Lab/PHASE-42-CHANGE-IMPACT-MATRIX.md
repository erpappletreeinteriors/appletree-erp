# PHASE 42 — Change Impact Matrix

**Date:** 2026-09-14. Per Part 16: for every OPEN proposed change (not the already-closed AT-002/
AT-003, not the DO-NOT-CHANGE items), the blast radius and affected layers. **No change listed here
has been implemented.**

| Change | Blast Radius | Frontend | Backend | API | Database | Reports | Exports | Audit | Tests | Integrations | Documentation | UAT | User Training |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Standardize "Journal Entry"→"Journal Voucher" (minority locations) | **LOW** | Yes (1 prompt) | Yes (narration default + comments) | No | No | No | No | No | Possible (if any test asserts the old default string) | No | Yes | No | No |
| MRS registry label → "Material Requisition — Site" | **LOW** | No | Yes (1 label) | No | No | No | No | No | No | No | No | No | No |
| APOB inline expansion in UI | **LOW** | Yes (1 addition) | No | No | No | No | No | No | No | No | No | No | No |
| Qualify bare "Receipt" (2 strings) | **LOW** | Yes (2 strings) | No | No | No | No | No | No | No | No | No | No | No |
| Clarify bare "Payment" (2 locations) | **LOW** | Yes (2 labels) | No | No | No | No | No | No | No | No | No | No | No |
| MRQ rename (pending Business Decision) | **MEDIUM** | Yes (menu label, form headings, table headers, tooltips) | No (function/field names can stay `MRQ`/`materialRequirement*` internally) | No (route paths can stay as-is) | No | Possible (any report titled "Material Requirements") | No | No | No (label-only) | No | Yes (SOP, User Manual references) | Yes (existing UAT scenarios reference the term) | Yes (staff already trained on the current label) |
| Status-enum casing normalization (26 arrays) | **HIGH — if pursued at all** | Unknown until display-layer verified | Yes (26 array literals + every `===` comparison against them, ~hundreds of call sites) | Possible (any API response returning raw status strings) | No (arrays are code, not stored data — but STORED records with an old-casing status value would need a data migration) | Possible | Possible | No | Yes (every test asserting an exact status string) | Unknown | No | No | No |
| Delivery Confirmation vs Delivery Challan — documentation disambiguation | **LOW** | No (code unchanged) | No | No | No | No | No | No | No | No | Yes (terminology standard, training material) | No | Yes (clarify in onboarding) |
| Accept/Reject 4-concept documentation clarification | **LOW** | No | No | No | No | No | No | No | No | No | Yes | No | Yes (clarify in onboarding) |
| SRET registry-vs-seed reconciliation | **LOW to MEDIUM — depends on investigation outcome** | No | Possible (if a real gap, needs a registry fix) | No | Possible (if `SRET` numbering was ever silently broken) | No | No | No | Possible | No | No | No | No |
| Dead `NAV_GROUPS` array deletion | **LOW (zero functional risk — already marked dead)** | Yes (code deletion only, no rendered change) | No | No | No | No | No | No | No | No | No | No | No |
| Snag-severity dead-code fallback cleanup | **LOW (currently unreachable)** | Yes (1 array literal) | No | No | No | No | No | No | No | No | No | No | No |
| **NOT a nomenclature change — QC Dashboard `c.result`→`c.status` field fix** | **MEDIUM (functional defect fix, not covered by this document's change-management scope)** | No | Yes (1 function) | No | No | Yes (QC Dashboard numbers) | No | No | Yes (needs a new/updated test asserting correct pass/fail counts) | No | No | Yes (re-verify dashboard numbers post-fix) | No |

## Reading this matrix

Every row above marked LOW carries near-zero functional risk — display-string-only changes with no
touch to posting logic, numbering, GL, or inventory. The MEDIUM/HIGH rows (MRQ rename,
status-casing normalization, SRET reconciliation, and the separately-tracked QC Dashboard defect)
each require either a Business Decision or a dedicated investigation before any implementation, per
`PHASE-42-SAP-MAPPING-DECISIONS.md`.

**No item in this matrix has been implemented.** Implementation of any LOW-risk item still requires
the user's explicit approval per this phase's own STOP GATE — impact classification is not itself
authorization.
