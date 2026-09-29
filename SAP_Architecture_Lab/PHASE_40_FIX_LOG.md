# PHASE 40 — Fix Log

**Date:** 2026-09-13. Every change follows Section 43's change-control discipline: defect ID → root
cause → smallest safe change → targeted test → regression → browser test (if UI) → reconciliation
(if financial) → this log entry.

## 1. DEF-P40-01 — `projectDocumentTrace()` AR/AP settlement gap

- **File**: `server/domain.js`, function `projectDocumentTrace()`.
- **Change**: added two read-only forward walks (Customer Invoice → `DB.clearings`(AR) → Receipt;
  Supplier Bill → `DB.clearings`(AP) → Payment Request (if any) → Payment), using the existing
  `DB.clearings` ledger only. No new collection, no new posting path, no change to any existing
  chain node.
- **Test before**: chain omitted AR/AP settlement entirely (confirmed by code reading).
- **Test after**: live HTTP — full AR chain (Invoice→2 Receipts→2 Clearings) and full AP chain
  (Bill→Payment Request→Payment→Clearing), both exactly linked. See
  `PHASE_40_DOCUMENT_TRACEABILITY_FINAL.md`.
- **Regression**: 173/173 permanent + 118/118 Phase 39 domain suites, zero regressions.
- **Browser**: N/A (API-level report).
- **Reconciliation**: every clearing amount matched its receipt/payment exactly.

## 2. DEF-P40-02 — Purchase → Payment Requests navigation gap

- **File**: `client_secure/index.html`, `MODULE_TREE` (`PROCUREMENT` module).
- **Change**: added `{tab:'paymentreq', label:'Payment Requests'}` to Purchase's existing
  `PROCUREMENT` module. No change to `ROLE_MODULES`, no change to any server-side route or
  permission — this is a pure navigation-discoverability fix (the file's own established pattern:
  "ROLE_MODULES is a DISCOVERABILITY filter only... never a security control").
- **Test before**: `allowedModules()` for Purchase contained no path to `paymentreq`; no `goto()`
  deep-link existed anywhere in the file.
- **Test after**: `purchase1` → sidebar → Payment Requests visible and functional → raised
  `PAYREQ-0001` for real.
- **Regression**: client-only change; full server-side suite re-run regardless, zero regressions.
- **Browser**: found and fixed within the browser UAT pass itself (Matrix UAT-C8).

## 3. DEF-P40-03 — Purchase → Site Material navigation gap

- **File**: `client_secure/index.html`, `MODULE_TREE` (`PROCUREMENT` module).
- **Change**: added `{tab:'sitematerial', label:'Site Material'}` to Purchase's existing
  `PROCUREMENT` module. Same pattern and same justification as DEF-P40-02.
- **Test before**: `allowedModules()` for Purchase contained no path to `sitematerial`, despite the
  server's own MRS-approval error message explicitly naming Purchase as an authorized approver.
- **Test after**: `purchase1` → sidebar → Site Material → approved `MRS/2026-27/0001` → issued
  `DC/2026-27/0001` for real.
- **Regression**: zero regressions (client-only).
- **Browser**: found and fixed within the browser UAT pass (Matrix UAT-D6).

## 4. DEF-P40-04 — BOM Submit action missing entirely

- **File**: `client_secure/index.html`, function `renderBOMs()` (action-button logic) and a new
  `submitBOM2(id)` function (mirroring the existing `approveBOM2(id)` pattern exactly).
- **Change**: the action column now renders "Submit" for a `Draft` BOM (calling the new
  `submitBOM2()`, which POSTs to the already-existing, already-tested `/api/boms/:id/submit`) and
  "Approve" for a `Submitted` BOM (unchanged `approveBOM2()`). No server-side change of any kind —
  the API this now calls has existed and been tested since Phase 39.
- **Test before**: every Draft BOM showed only an "Approve" button, which always failed with
  `"a BOM must be Submitted before it can be approved"` — no way to progress a BOM past Draft.
- **Test after**: `estimator1` → Submit → `Submitted`; `finance1` → Approve → `Approved`; full
  downstream Production Order → Issue Material → Labour → Complete chain then succeeded, cost
  reconciled exactly (`materialCost:5880` = 2×1.05×₹2,800).
- **Regression**: zero regressions (client-only change; the underlying API was already covered by
  Phase 39's own test suite, unchanged here).
- **Browser**: this was the single most consequential finding of the entire Phase 40 browser pass —
  found and fixed live, in-browser.

## What was NOT changed

- No new modules, dashboards, reports, workflows, approval systems, master-data concepts, tax
  features, or integrations were added, per Section 2's explicit prohibition.
- `ROLE_MODULES` itself was never widened for any role — every fix added one shared tab reference to
  a module the affected role already has, never a new module grant.
- No business policy was changed. DEF-P39-03 (Payment Approval Matrix) was investigated, confirmed
  unchanged, and correctly left as a recorded management decision, not a code change.
- `server/db.json` (the production-shaped instance) and the ERP-059B production database incident
  were never touched, opened, or referenced by any test this phase.

## Combined regression evidence (all 4 fixes applied together)

| Suite | Result |
|---|---|
| `erp_059_security_tests.js` | 13/13 |
| `erp_059_restart_persistence_tests.js` | 5/5 |
| `erp_059_transaction_contract_tests.js` | 6/6 |
| `erp_059b_durable_audit_tests.js` | 22/24 (+2 documented-not-tested, unchanged environmental limitation) |
| `erp_059c_production_isolation_tests.js` | 10/10 |
| `erp_audit_concurrency_tests.js` | 1/1 |
| `erp_audit_p0_tests.js` | 65/65 |
| `erp_phase38_e2e_trace_tests.js` | 49/49 |
| `erp_phase39_manufacturing_jobwork_tests.js` | 36/36 |
| `erp_phase39_fixed_assets_tests.js` | 30/30 |
| `erp_phase39_banking_tests.js` | 34/34 |
| `erp_phase39_payment_approval_matrix_tests.js` | 18/18 |
| **Total** | **291/291** (excluding the 2 documented-not-tested items, unchanged since Phase 39) |

**Zero regressions from any of the 4 fixes applied this phase.**
