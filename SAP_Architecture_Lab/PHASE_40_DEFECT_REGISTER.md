# PHASE 40 — Defect Register

**Date:** 2026-09-13. Severity: P0 = catastrophic, P1 = critical financial/control/security, P2 =
material business/control defect, P3 = moderate, P4 = minor/non-blocking. A-grade target: no open
P0/P1/P2.

## Summary

| ID | Severity | Module | Status |
|---|---|---|---|
| DEF-P40-01 | P2 | Document Traceability (`domain.js`) | **CLOSED — FIXED** |
| DEF-P40-02 | P2 | UI navigation (`client_secure/index.html`) | **CLOSED — FIXED** |
| DEF-P40-03 | P2 | UI navigation (`client_secure/index.html`) | **CLOSED — FIXED** |
| DEF-P40-04 | P2 | UI navigation (`client_secure/index.html`) | **CLOSED — FIXED** |

**Carried from Phase 39 (re-verified this phase, unchanged):**

| ID | Severity | Status |
|---|---|---|
| DEF-P38-03 | P4 | OPEN — deliberately not fixed (no live impact) |
| DEF-P39-01 | P4 | OPEN — cosmetic (uom mislabel in a narration field) |
| DEF-P39-03 | P3 | OPEN — genuine Board-level policy decision, not a code defect |

**0 open P0. 0 open P1. 0 open P2. A-grade defect gate (Section 34/38-J) is met.**

---

### DEF-P40-01 — `projectDocumentTrace()` did not walk AR/AP settlement (P2)
- **Module**: Document Traceability, `server/domain.js`
- **Reproduction**: `GET /api/projects/document-trace?projectId=PRJ-1` on a project with a posted
  Customer Invoice and a fully-settled Supplier Bill returned a chain with neither the Invoice, the
  Receipt, the Payment execution, nor the Clearing record — confirmed by direct code reading before
  any fix.
- **Root cause**: the function never queried `DB.clearings`; its Payment Request block was a flat,
  unlinked list.
- **Fix**: added two read-only walks (AR: Invoice→`DB.clearings`(type AR)→Receipt; AP: Bill→
  `DB.clearings`(type AP)→Payment Request (if any)→Payment), using only the existing clearing ledger.
- **Test after fix**: live HTTP chain — Invoice→2 partial Receipts→2 Clearings, and separately
  Bill→Payment Request→Approve→Execute→Clearing — both fully and correctly traced. See
  `PHASE_40_DOCUMENT_TRACEABILITY_FINAL.md`.
- **Regression**: 173/173 permanent + 118/118 Phase 39 domain-suite assertions, zero regressions.
- **Browser verification**: N/A (API-level report, no dedicated UI screen — see Browser Matrix
  area N).
- **Accounting verification**: exact — every clearing amount matched the corresponding
  receipt/payment amount to the rupee.
- **Status**: CLOSED — FIXED.

### DEF-P40-02 — Purchase had no UI path to Payment Requests (P2)
- **Module**: UI navigation, `client_secure/index.html`
- **Reproduction**: logged in as `purchase1`, `allowedModules()` returned no module containing the
  `paymentreq` tab, and a repository-wide search found zero `goto()`/deep-link references to it from
  any module Purchase can see — despite `purchase1` having live-tested domain authority to raise a
  Payment Request (Phase 39's own Payment Approval Matrix report) and being the exact role the
  "Purchase Head" tier names.
- **Root cause**: `paymentreq` existed only in the `FINANCE` module's tab list; `ROLE_MODULES.
  Purchase` does not include `FINANCE`; the file's own design comment claiming an alternate
  deep-link always exists was not actually true for this tab.
- **Fix**: added `{tab:'paymentreq', label:'Payment Requests'}` to Purchase's own `PROCUREMENT`
  module tab list (shared render function/API, zero new code) — not by widening `ROLE_MODULES.
  Purchase` to all of FINANCE.
- **Test after fix**: `purchase1` → sidebar → Payment Requests → raised `PAYREQ-0001` for real
  against `BILL/2026-27/0001`; `finance1` approved; `ceo` executed → `JE-0008`. Full real UI chain.
- **Regression**: no server-side change; full suite re-run anyway, zero regressions.
- **Browser verification**: yes — this defect and its fix were both found and proven through the
  browser itself (see Matrix UAT-C8/C9/C10).
- **Status**: CLOSED — FIXED.

### DEF-P40-03 — Purchase had no UI path to Site Material / MRS approval (P2)
- **Module**: UI navigation, `client_secure/index.html`
- **Reproduction**: same shape as DEF-P40-02, found immediately after it in the same pass. The
  server's own MRS-approval rejection message explicitly names Purchase as an authorized approver
  (`"must be approved by Purchase/FinanceManager/CEO/Admin (SOP §8)"`), and the screen's own
  description text says Purchase is the role that issues the resulting Delivery Challan — yet
  `sitematerial` existed only in the `SITE OPERATIONS` module, absent from `ROLE_MODULES.Purchase`.
- **Fix**: added `{tab:'sitematerial', label:'Site Material'}` to Purchase's own `PROCUREMENT`
  module tab list, same pattern as DEF-P40-02.
- **Test after fix**: `purchase1` → sidebar → Site Material → approved `MRS/2026-27/0001` → issued
  from WH-1 → Delivery Challan `DC/2026-27/0001`. Full real UI chain (continued by `site1` for
  receipt and consumption).
- **Regression**: zero regressions (client-only change).
- **Browser verification**: yes (Matrix UAT-D6/D7).
- **Status**: CLOSED — FIXED.

### DEF-P40-04 — BOMs could never be Submitted through the UI (P2, most severe UI finding this phase)
- **Module**: UI navigation/workflow, `client_secure/index.html`
- **Reproduction**: the BOM screen's action column rendered an "Approve" button for every `Draft`
  BOM, but `approveBOM()` has always required status `Submitted` first — confirmed live:
  `"DENIED: Cannot approve — \"Draft\" — a BOM must be Submitted before it can be approved."` A
  repository search found no `bomSubmit()`-equivalent function and no Submit button anywhere in the
  BOM screen's render logic — a BOM could never leave Draft through the UI, at all, for any role.
- **Impact**: Manufacturing's entire BOM→Production Order chain requires an Approved BOM; this made
  the ENTIRE Manufacturing domain unreachable from the browser, even though `POST /api/boms/:id/
  submit` fully exists and works server-side (confirmed via Phase 39's own API-level test script).
  The most severe UI-only finding of this phase — not a security or accounting defect, but a
  complete usability block on a whole business domain.
- **Fix**: render the correct action per status (`Draft` → "Submit" calling a new `submitBOM2(id)`
  wrapping the already-existing `POST /api/boms/:id/submit`; `Submitted` → "Approve", unchanged).
- **Test after fix**: `estimator1` → Submit → `Submitted`; `finance1` → Approve → `Approved`;
  `pm1` → Create Production Order → `PROD-0001` → Issue Material → Labour Cost → Complete →
  `Status: Completed`. Full real UI chain, cost independently reconciled to the rupee
  (`materialCost:5880` = 2×1.05×₹2,800 exactly).
- **Regression**: zero regressions (client-only change).
- **Browser verification**: yes — found AND fixed entirely within the browser UAT pass (Matrix
  UAT-F2/F3).
- **Status**: CLOSED — FIXED.

---

## Carried-forward items, re-verified this phase

### DEF-P38-03 — Chart-of-accounts literals not fully centralized (P4)
Re-verified: still no live inconsistency, still not worth a ~40-site mechanical refactor for a P4
item with zero live impact. Left OPEN by deliberate choice, unchanged from Phase 39's own reasoning.

### DEF-P39-01 — MAT-2 uom mislabel in a narration field (P4, cosmetic)
Not re-tested this phase (no Manufacturing code touched other than the UI submit-button fix, which
does not affect narration text). Left OPEN, zero financial impact, unchanged from Phase 39.

### DEF-P39-03 — Payment Approval Matrix's lower-tier roles structurally unreachable (P3, policy)
Not a defect requiring a code fix — see `PHASE39_PAYMENT_APPROVAL_MATRIX_REPORT.md`. Re-confirmed
this phase via the Payment Approval Matrix audit trail (Section 16): `PAYREQ-0001`'s
`requiredApprovalRole` showed `"Purchase Head (Purchase role)"` while the actual approver was
`finance1` (FinanceManager) — the exact, already-documented gap, unchanged. Recorded per Section 16
as: **PAYMENT_APPROVAL_POLICY_DECISION_REQUIRED** — management must decide either (a) widen
`SOP_FINANCE_ROLES` to admit Accountant/Purchase for their own designated tiers, or (b) formally
simplify the matrix to state that FinanceManager/CEO/Admin approve every payment regardless of
displayed tier. Not implemented unilaterally, consistent with Phase 40 Section 2's explicit
prohibition on changing business policy without authorization.

## A-grade defect gate assessment (Section 38-J)

Zero P0. Zero P1. Zero P2 open (all 4 found this phase were fixed and re-verified). 2 P4s and 1 P3
open, all clearly documented, all with no financial/control/security/data-integrity impact, all
appropriate for management acceptance rather than unilateral code changes. **Gate met.**
