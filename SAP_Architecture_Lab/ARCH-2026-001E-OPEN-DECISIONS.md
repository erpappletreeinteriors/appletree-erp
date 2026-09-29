# ARCH-2026-001E — Open Decisions

**Date:** 2026-09-21. Consolidates decisions this CR deliberately did not make silently — all carried
forward, pre-existing, none newly created by this CR.

## 1. PO self-approval limit — pre-existing, unchanged

`DB.poApprovalAuthorityMatrix.roles.{CEO,FinanceManager}.selfApprovalLimit` remains `null`, and the
matrix's own `finalised:false` status is unchanged. This CR did not set a value — doing so would be
inventing an arbitrary monetary threshold, explicitly forbidden by this CR's own §7. **Practical
effect, re-confirmed by this CR's own tests:** self-approval of a PO requiring approval is currently
ALWAYS blocked, for every role, regardless of amount, until Appletree finalises specific limits.

## 2. Payment Request approval matrix finalisation — pre-existing, unchanged

`DB.paymentApprovalMatrix.finalised:false`, status `"Draft"`, tier role labels partially descriptive
(`"Purchase Head (Purchase role)"`) rather than exact role-name matches for the middle tier. This CR
did not finalise or alter this matrix. Re-confirmed, not newly found.

## 3. No new SoD rule was needed for Approval Authority — confirmed, not assumed

Per this CR's own explicit instruction ("do not add new SoD rules unless absolutely required to
correct a defect"), the audit found no approval mechanism requiring a NEW dedicated SoD rule — Payment
Request approval already has SOD-1; no other approval type has an evidenced role-overlap creating a
real SoD exposure (see `ARCH-2026-001E-APPROVAL-AUDIT.md` §4). This is a closed finding, not an open
item — recorded here only for completeness of the decision trail.

## 4. Scope integration for PO/Quotation Discount/Payment Request/Change Request approval — not added, and why this is not itself an open decision

The audit found NO scope-restricted role (`ProjectManager` for Project, `Sales` for Customer) holds
approval authority for these 4 mechanisms under the CURRENT role-authority tables. Adding a scope
check to them today would be inert (a no-op, since the check would never actually restrict any
currently-possible approver). This is not deferred as "open" — it is a closed, evidence-based finding
that the current data does not require it. **If Appletree's role-authority tables are EVER changed in
the future** (e.g. if a ProjectManager were ever granted PO approval authority), this finding would
need to be re-audited — flagged here as a standing awareness item for any future CR touching those
tables, not a currently-live gap.

## 5. Summary table

| # | Item | Status | Blocks |
|---|---|---|---|
| 1 | PO self-approval limit value | OPEN (pre-existing, unchanged) | Finalising self-approval for POs above ₹0 |
| 2 | Payment Request matrix finalisation | OPEN (pre-existing, unchanged) | Finalising the exact tier thresholds/role labels |
| 3 | New SoD rule for approval | CLOSED — none needed | Nothing |
| 4 | Scope integration for 4 mechanisms | CLOSED — not currently needed | Re-audit only if the role-authority tables change |

No implementation proceeds on items 1-2 until Appletree management provides the specific values —
this CR does not choose them.
