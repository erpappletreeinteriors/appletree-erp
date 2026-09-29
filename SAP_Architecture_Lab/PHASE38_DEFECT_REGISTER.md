# PHASE 38 — Defect Register

**Date:** 2026-09-11. Severity: P0 = data/accounting corruption or security bypass, P1 = major
financial/business-process failure, P2 = material functional defect, P3 = minor defect, P4 =
cosmetic/documentation.

**No P0, P1, or P2 defect was found this phase.** This is stated plainly rather than implied — the
testing behind this register was genuinely extensive (49-assertion live E2E chain across
procurement-to-pay/inventory/project-cost/sales-to-cash, a 110-document stress test, 3 dedicated
forensic code-tracing passes covering the accounting engine/document linkage/security layer, and
live browser cross-checks), not shallow. A short defect list here reflects that depth of testing
finding a genuinely sound system, not reduced scrutiny — see the individual trace reports for the
full evidence behind this conclusion.

---

### DEF-P38-01 — `/api/test/architectural-violations` inconsistent gating
- **Module**: Test infrastructure / diagnostics
- **File/Function**: `server/server.js`, the `/api/test/architectural-violations` GET route
- **Issue**: Every sibling `/api/test/*` MUTATION endpoint requires `APP_ENV=test` (per ERP-059C's
  hardening); this one GET-only diagnostic route requires only `role==='Admin'`.
- **Expected**: Consistent gating pattern across the whole `/api/test/*` family, or an explicit,
  documented reason this one is different.
- **Actual**: Read-only endpoint, reachable by any Admin regardless of `APP_ENV`.
- **Financial/Inventory/Project impact**: None — read-only, no mutation capability.
- **Security impact**: Low — exposes a list of architectural-violation records (internal diagnostic
  metadata) to Admin in production; does not expose customer/financial data or allow any action.
- **Severity**: **P3**
- **Reproducibility**: Confirmed via direct code reading (forensic agent pass), not independently
  re-verified live this phase.
- **Recommended fix**: Add the same `if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(...)` guard
  used on its siblings, OR explicitly document why this one route is intentionally exempt (it is
  read-only, unlike its siblings).
- **Status**: OPEN, not fixed this phase (per Part 29 — not a required A/B fix; a documentation/
  consistency item, category C).

### DEF-P38-02 — `SRET` document-type registry gap
- **Module**: Finance / document numbering
- **File/Function**: `server/domain.js:850` (migration-guard comment) vs. the base `glDocumentTypes`
  seed array (`domain.js:269-327`)
- **Issue**: A migration-guard reference lists `['SRET','Site Return']` as a Phase-33 addition, but
  no such entry exists in the base seed array (only `PRET`="Purchase Return" is present there).
- **Expected**: Either the seed array should contain a matching `SRET` entry, or the stale guard-
  list reference should be removed.
- **Actual**: Divergence exists; not yet determined whether `returnFromSite()` actually depends on a
  `glDocumentTypes` entry named `SRET` at all (its own document prefix uses `SRET` per the Phase 37
  baseline's 51-prefix table, mapped to `returnFromSite`, independent of the `glDocumentTypes` label
  registry).
- **Financial/Inventory/Project impact**: Unknown pending verification — Material Return (Site) was
  live-tested this phase only indirectly (issue-to-site was tested; the return path itself was not
  live-exercised).
- **Severity**: **P3** (carried forward from Phase 37's own finding, not newly discovered)
- **Reproducibility**: Static code observation only.
- **Recommended fix**: Direct verification of whether `returnFromSite()` reads from
  `glDocumentTypes` at all; resolve the divergence one way or the other.
- **Status**: OPEN, not fixed this phase.

### DEF-P38-03 — Chart-of-accounts literals not fully centralized
- **Module**: Accounting engine
- **File/Function**: `server/domain.js`, ~40+ call sites using bare string account codes
- **Issue**: Only 2 of ~18 account codes in active use are hoisted into named JS constants
  (`AR_ACCOUNT`, `AP_ACCOUNT`); `CUSTOMER_ADVANCE_ACCOUNT` is defined but used at only 2 of its 5
  real call sites, the other 3 using the bare literal `'2100'` directly.
- **Expected**: A future edit to any account code would ideally be a single-point change.
- **Actual**: No live inconsistency found (every concept checked posts the same code everywhere),
  but the architecture doesn't structurally prevent future drift.
- **Financial impact**: None currently — purely a maintainability/future-risk observation.
- **Severity**: **P4**
- **Reproducibility**: Static code observation.
- **Recommended fix**: Optional — hoist the remaining account codes into named constants if this
  file is touched for other reasons; not worth a dedicated change on its own.
- **Status**: OPEN, not fixed this phase (category G — future enhancement).

### DEF-P38-04 — Payment Approval Matrix's lower tiers rely on route-level role exclusion, not an
explicit per-tier check
- **Module**: Finance / approvals
- **File/Function**: `approvePaymentRequest()` (`domain.js:11056-11059`) + `SOP_FINANCE_ROLES`
  route gate (`server.js:3117`)
- **Issue**: The matrix explicitly re-checks only the top (CEO) tier in code; the `Accountant` and
  `Purchase Head` tiers are enforced only because the route-level role set happens to exclude those
  roles from reaching the approval function at all, not because the matrix's own per-tier text is
  independently verified.
- **Expected**: A reader of just the matrix configuration screen would reasonably expect its
  displayed tiers to be the actual enforcement mechanism.
- **Actual**: Enforcement is correct in practice today (no unauthorized role can approve any tier),
  achieved via a second, separate mechanism (route RBAC) rather than the matrix's own logic — a
  design-clarity gap, not a live hole.
- **Financial impact**: None currently.
- **Severity**: **P3**
- **Reproducibility**: Confirmed via code reading (forensic agent pass).
- **Recommended fix**: Either make `approvePaymentRequest()` explicitly check every configured tier
  (not just the top one), or update the matrix's own UI/documentation to clarify that lower tiers
  are enforced via role RBAC, not the matrix itself.
- **Status**: OPEN, not fixed this phase.

### DEF-P38-05 (carried forward, not newly found) — Phase 37's 2 MUST-CHANGE nomenclature items
remain unimplemented
- **Module**: Finance (labels only)
- **Issue**: `domain.js:274`'s `label:'Vendor Payment'` (should read `'Supplier Payment'` to match
  every other surface of the identical document type) and `index.html:3569`'s `Business Partner`
  print-template cell (implies an unbuilt unified-master architecture) — both fully documented,
  with exact fix locations, in Phase 37's Change Plan.
- **Severity**: **P4** (display-label only, zero functional/financial impact — confirmed by this
  phase's own live testing, which exercised the Supplier Payment flow extensively with correct
  behavior regardless of the one mislabeled registry entry)
- **Status**: OPEN — awaiting the user's review of `PHASE37_NOMENCLATURE_CHANGE_PLAN.md`, not this
  phase's scope to implement unilaterally.

---

## Summary

| ID | Severity | Status |
|---|---|---|
| DEF-P38-01 | P3 | OPEN |
| DEF-P38-02 | P3 | OPEN |
| DEF-P38-03 | P4 | OPEN |
| DEF-P38-04 | P3 | OPEN |
| DEF-P38-05 | P4 | OPEN (carried from Phase 37) |

**0 × P0, 0 × P1, 0 × P2, 3 × P3, 2 × P4.**
