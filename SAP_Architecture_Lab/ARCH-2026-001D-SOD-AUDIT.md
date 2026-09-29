# ARCH-2026-001D — SoD Audit

**Date:** 2026-09-21. Read-first reconnaissance and inventory, completed before any implementation.

## 1. Frozen documents consulted

`ARCH-2026-001-ARCHITECTURE-FREEZE.md`, `ARCH-2026-001-RBAC-TARGET-DESIGN.md`,
`ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md`, `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md`,
`ARCH-2026-001A-*`, `ARCH-2026-001B-*`, `ARCH-2026-001C-*`, `ARCH-2026-001C-F-*` (all reports + tests).

**Confirmed:** the frozen `RBAC-TARGET-DESIGN.md` names SoD as a target layer but does NOT define
specific rules beyond what ARCH-2026-001A already formalized (SOD-1..SOD-4, all pre-existing hardcoded
maker-checker patterns). It does not specify a P2P rule set, a role-vs-user evaluation level, or an
Admin/CEO exemption policy for any NEW rule. These gaps are handled per §10/§17 of this CR — resolved
where the existing architecture already implies an answer, recorded as OPEN where it does not.

## 2. Existing SoD framework — inventory (before this CR)

| Element | Location | State before this CR |
|---|---|---|
| `RBAC_SOD_RULES_SEED` | `server/domain.js` | 4 reference rules (SOD-1..SOD-4), each DESCRIBING an already-existing hardcoded check, not itself the enforcement |
| `checkSoD(ruleId, {makerId, checkerId})` | `server/domain.js` | A generic, working maker!=checker evaluator with exception support — proven by ARCH-2026-001A's own unit test, but **never called from any real enforcement path** before this CR |
| `DB.sodRules` | seeded from `RBAC_SOD_RULES_SEED` | Reference data only |
| `DB.sodExceptions` | seeded empty | No administration function existed to write to it before this CR |
| Real enforcement of SOD-1..4 | `approvePaymentRequest()` (`req.maker===actor.id`), `executePaymentRequest()` (maker/checker/executor 3-person rule, with a pre-existing, approved CEO/Admin exemption), `assertCanApproveExcessBilling()`+Excess Material Issue pattern, Snag verification workflow | All ALREADY hardcoded, independent of `checkSoD()` — this CR does not touch any of these 4 |

**Conclusion:** the existing framework is a real, working, but UNUSED-IN-PRODUCTION generic
evaluator, sitting beside 4 independently-hardcoded checks it merely documents. This CR's job is to
(a) make the generic evaluator ACTUALLY load-bearing for new rules, reusing it rather than duplicating
it, and (b) extend the reference-rule set with genuinely NEW capability conflicts, per §3-§7.

## 3. Role/action combinations relevant to SoD — P2P chain capability audit

| Step | Function | Role gate (verified by reading the code, not assumed) |
|---|---|---|
| Vendor Master create | `createVendorMaster()` / `POST /api/masters/vendor` | `can(actor,'masterData')` → `{Admin, CEO}` only |
| PO create | `createPurchaseOrder()` / `POST /api/purchase-orders` | Purchase + Admin/CEO (existing gate, unchanged) |
| PO approve | `approvePurchaseOrder()` | `poApprovalAuthorityMatrix` — CEO/FinanceManager have `financialApprovalAuthority` (existing, unchanged) |
| GRN create | `createGRN()` / `assertCanCreateGRN()` | `{Admin, CEO, Purchase}` |
| Supplier Bill (PO-matched) create | `draftSupplierInvoiceFromPO()` | `can(actor,'create')`-tag roles (existing, unchanged) |
| Payment Request create (maker) | `createPaymentRequest()` | Purchase-tier roles (existing, unchanged) |
| Payment Request approve (checker) | `approvePaymentRequest()` | `SOP_FINANCE_ROLES = {Admin, CEO, FinanceManager}` (existing) + SOD-1 maker!=checker (existing) |
| Payment execution | `executePaymentRequest()` / `can(actor,'pay')` | `{Admin, CEO, FinanceManager}` + SOD-2 maker/checker!=executor, WITH a pre-existing, approved CEO/Admin exemption (existing, unchanged) |

**Real overlap found (the actual SoD exposure, not assumed):**
- **Vendor Master create `{Admin, CEO}` ∩ Payment execution `{Admin, CEO, FinanceManager}` = `{Admin, CEO}`.** A single Admin or CEO login can legitimately do BOTH — the classic P2P "fictitious vendor" risk. **→ new rule SOD-5.**
- **GRN create `{Admin, CEO, Purchase}` ∩ Supplier Bill (PO-matched) create-tag roles overlaps for `{Admin, CEO}` (Purchase alone cannot create the matched bill via the generic create-tag path in the same way — verified: Purchase DOES have `create:true` generically, so Purchase can ALSO create bills) — the real, most common risk is a SINGLE Purchase-role (or Admin/CEO) user recording the goods receipt AND creating the matching bill for the SAME transaction. **→ new rule SOD-6.**

No other pairing in the chain showed a real, evidenced overlap worth a NEW rule within this CR's own
scope (Payment Request maker/checker/executor separation is already fully covered by the pre-existing
SOD-1/SOD-2).

## 4. No fake privileges invented

SOD-5 and SOD-6 are evaluated using the SAME real, pre-existing authorization gates listed in §3 above
(`can(actor,'masterData')`, `assertCanCreateGRN()`, the PO-matched bill creation path, `can(actor,'pay')`)
— no new privilege, duty, or role was created to manufacture a conflict. The conflict is a real,
already-existing overlap in the current role model, not a synthetic test fixture.

## 5. Multi-role — confirmed still not operational

Re-confirmed (matching ARCH-2026-001C-F's own finding): `DB.users.role` is a single string field. No
multi-role assignment capability exists. SoD evaluation in this CR is therefore inherently per-USER
(and, since role⇔user is 1:1, this is equivalent to per-role for THIS codebase specifically) — see
§10/§12 discussion in `ARCH-2026-001D-SOD-IMPLEMENTATION.md` for why this does NOT mean "block an
entire role forever" (the conflict is evaluated PER TRANSACTION INSTANCE — same identity across a
SPECIFIC document chain — not as a static role-capability ban).

## 6. Audit hooks — reused, not duplicated

`logAudit()`/`DB.auditLog` (unchanged) is the sole audit path used for every new SoD event
(`SoDViolationBlocked`, `SoDDetectiveScanRun`, `SoDExceptionGranted`, `SoDExceptionRevoked`) — no new
audit collection was created.

## 7. Conclusion

The existing framework (`checkSoD`/`DB.sodRules`/`DB.sodExceptions`) is sound and directly reusable.
Its 4 reference rules remain unchanged. Two new, real, evidence-grounded rules (SOD-5, SOD-6) close
the one genuine gap this audit found in the P2P chain within this CR's own scope. See
`ARCH-2026-001D-SOD-RULE-MATRIX.md` for the full rule detail.
