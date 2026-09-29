# PHASE 39 — Final Defect Register

**Date:** 2026-09-12. Severity: P0 = data/accounting corruption or security bypass, P1 = major
financial/business-process failure, P2 = material functional defect, P3 = minor defect, P4 =
cosmetic/documentation. This register both closes Phase 38's 5 carried-forward findings and records
everything found live this phase.

## Summary

| ID | Severity | Status | Origin |
|---|---|---|---|
| DEF-P38-01 | P3 | **CLOSED — FIXED** | Carried from Phase 38 |
| DEF-P38-02 | P3→**P2** (expanded) | **CLOSED — FIXED** | Carried from Phase 38, scope widened live |
| DEF-P38-03 | P4 | OPEN — deliberately not fixed (category G) | Carried from Phase 38 |
| DEF-P38-04 | P3 | **CLOSED** — investigated, superseded by DEF-P39-03 | Carried from Phase 38 |
| DEF-P38-05 | P4 | **CLOSED — FIXED** (prior session this phase) | Carried from Phase 38 |
| DEF-P39-01 | P4 | OPEN — cosmetic, not fixed | Found this phase (Manufacturing) |
| DEF-P39-02 | **P1** | **CLOSED — FIXED** | Found this phase (Banking) |
| DEF-P39-03 | P3 | OPEN — genuine policy decision, not implemented | Found this phase (Payment Approval Matrix), supersedes DEF-P38-04 |
| DEF-P39-04 | **P2** | **CLOSED — FIXED** | Found this phase (Browser Workflow Test — Bank Accounts UI) |

**This phase: 0 new P0, 1 new P1 (fixed), 1 expanded P2 (fixed), 1 new P2 (fixed), 1 P3 (policy
question, correctly left open), 1 new P4 (cosmetic, open). Combined with Phase 38's carry-forward: 3
of 5 original findings closed, 1 left open by deliberate cost/benefit decision, 1 closed via
reclassification with fuller evidence.**

---

### DEF-P38-01 — `/api/test/architectural-violations` inconsistent gating
**Status: CLOSED — FIXED.** Added the same `if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(...)`
guard used by every sibling `/api/test/*` route. One-line fix, `server/server.js`. See
`PHASE39_FIX_LOG.md`.

### DEF-P38-02 — document-numbering registry gap (expanded from SRET-only to 6 document types)
**Status: CLOSED — FIXED.** Investigation found the original P3 framing ("not yet determined
whether `returnFromSite()` depends on a `glDocumentTypes` SRET entry") resolved to a real, live-
confirmed P2 functional defect affecting **6** document types, not 1: `SRET`, `BOM`, `XMI`, `XBA`,
`CR`, `MRQ` were each registered only via a once-only migration-guard patch, never the base `SEED`
literal `resetToFreshSeed()` actually reads — silently losing their doc-number series on every test
reset (live-proven: a BOM created after `/api/test/reset` returned `docNo:null`). This exact failure
mode was already found and fixed once before, for different document types, documented in this same
file (search "P0-4 FIX") — later phases repeated the identical mistake for 6 more types without
cross-referencing that fix. All 6 added to the base literal; live-confirmed fixed
(`docNo:"BOM/2026-27/0001"` after the fix, on a freshly-reset instance). See
`PHASE39_FIX_LOG.md`.

### DEF-P38-03 — Chart-of-accounts literals not fully centralized
**Status: OPEN — deliberately not fixed.** Re-verified live this phase: the premise still holds
(`CUSTOMER_ADVANCE_ACCOUNT` used at 2 sites, 5 bare `'2100'` literals elsewhere), with **zero live
inconsistency found** — every site posts the correct value. Per the original recommendation
("optional... not worth a dedicated change on its own") and this engagement's standing discipline
against unnecessary broad refactors, this was investigated and consciously left open (category G —
future enhancement) rather than executing a ~40-site mechanical hoist for a P4 item with no live
defect behind it.

### DEF-P38-04 — Payment Approval Matrix's lower tiers rely on route-level role exclusion
**Status: CLOSED**, investigated to a fuller, live-proven conclusion — see
`PHASE39_PAYMENT_APPROVAL_MATRIX_REPORT.md` for full detail. The original P3 finding ("enforced
correctly in practice... via a second mechanism") is now proven MORE consequential than the code-
reading-only pass could show: the roles the matrix itself names for its two lower tiers
(`Accountant`, `Purchase`) are **structurally blocked at the route level from ever approving their
own designated tier** — live-reproduced both directions. Not fixed unilaterally: the correct fix
would expand who may approve company payments, a genuine Board-level policy decision (the matrix is
explicitly "To Be Finalised" per SOP §9.1), not a mechanical bug. Recorded with full evidence as
**DEF-P39-03** below, which supersedes this entry.

### DEF-P38-05 — Phase 37's 2 MUST-CHANGE nomenclature items
**Status: CLOSED — FIXED**, in a prior session this same phase (before this conversation began):
`domain.js`'s `glDocumentTypes` PAY entry now reads "Supplier Payment" (was "Vendor Payment"), and
`client_secure/index.html`'s JE print template now reads "Party" (was "Business Partner"). Confirmed
present via `git show HEAD:...` at the start of this phase's investigation.

---

### DEF-P39-01 — Material Issue narration/UOM mislabeled for a multi-line BOM issue (P4, cosmetic)
- **Module**: Manufacturing
- **Found**: live, during Manufacturing reconciliation (`PHASE39_MANUFACTURING_LIVE_TEST.md`)
- **Issue**: the MAT-2 (Laminate, uom `nos`) material-issue inventory movement (`MV-000004`) and its
  GL journal entry narration both record `uom: "sheet"` — copied from the first BOM line
  (MAT-1, genuinely `sheet`) rather than each line's own uom.
- **Financial impact**: none — quantity (200), valuation rate (₹1,200), and valuation amount
  (₹240,000) are all correct; this is a display/narration label bug only.
- **Severity**: P4.
- **Status**: OPEN, not fixed this phase (cosmetic, no functional or financial impact — consistent
  with this register's threshold for what gets a same-phase fix vs. documented for a future pass).

### DEF-P39-02 — Bank Import Allocation misposted to the wrong GL account (P1, critical)
- **Module**: Banking
- **Found**: live, during Banking validation (`PHASE39_BANKING_LIVE_TEST.md`)
- **Issue**: `postBankImportLine()` hardcoded the bank side of its journal entry to account `1000`
  unconditionally, ignoring the specific bank account (`line.bankAccountId`) the imported statement
  line actually belonged to — contradicting the real per-account GL segregation Phase 24 Part A4
  already established for the three sibling posting functions.
- **Financial impact**: for any bank/cash account other than the one coded `1000`, allocating an
  imported line would silently misattribute real money movement to an unrelated GL account while
  that bank account's own balance never moved — a genuine, reproducible accounting-integrity defect.
- **Severity**: **P1**.
- **Status**: **CLOSED — FIXED**. Resolved the bank side to the line's own bank account's configured
  `glAccount`, mirroring the already-correct sibling functions. Full regression: 173/173 + 1 + 5,
  zero regressions. See `PHASE39_FIX_LOG.md`.

### DEF-P39-03 — Payment Approval Matrix's designated lower-tier roles cannot reach their own tier (P3, policy)
- **Module**: Finance / approvals
- **Found**: live, Payment Approval Matrix audit (`PHASE39_PAYMENT_APPROVAL_MATRIX_REPORT.md`) —
  supersedes DEF-P38-04 with live-reproduced, both-directions proof.
- **Issue**: the approval route's role gate (`SOP_FINANCE_ROLES = {Admin, CEO, FinanceManager}`)
  excludes `Accountant` and `Purchase`, the exact two roles the (explicitly "Not Finalised") matrix
  names for its two lower tiers — making tiered delegation below CEO-level structurally
  unreachable by design, not merely unenforced by the domain function.
- **Financial/security impact**: none adverse — no unauthorized role gains approval power; the
  effect is that FinanceManager/CEO/Admin approve every payment regardless of displayed tier, safe
  but not matching the matrix's own stated design.
- **Severity**: P3 (a real, live-proven inconsistency between displayed policy and actual
  enforcement; not a security hole).
- **Status**: OPEN — genuinely a Board-level policy decision (expand approval authority to
  Accountant/Purchase, or formally simplify the matrix to reflect current reality), correctly not
  implemented unilaterally. Two concrete options documented in the linked report for the user's
  decision when the matrix is next formally finalized.

### DEF-P39-04 — Bank Accounts UI form could never successfully create a bank account (P2, functional)
- **Module**: Finance / Master Data (UI)
- **Found**: live, during Browser Workflow Testing (`PHASE39_BROWSER_WORKFLOW_TEST.md`)
- **Issue**: `submitBankAccount()` (`client_secure/index.html`) never collected or sent a
  `glAccount` field, which `createBankAccount()` has required unconditionally since Phase 24 Part
  A4. Every submission through this screen failed, for every role, with no way to succeed.
- **Impact**: the real per-account GL segregation feature — the same feature DEF-P39-02's fix
  depends on — was reachable only via direct API calls, never through the actual application UI. A
  real user could never add a second, properly-segregated bank/cash account through the app.
- **Severity**: P2 (a core Master Data feature completely non-functional via the UI, though the
  underlying API/accounting logic was always correct — no financial corruption, just an unusable
  screen).
- **Status**: **CLOSED — FIXED**. Added a GL Account Code field to the form, wired through to the
  API call, corrected the stale hint text. Live-verified end-to-end through the actual rendered UI
  after the fix (new bank account created with its own distinct GL code, listed correctly alongside
  the original account). See `PHASE39_BROWSER_WORKFLOW_TEST.md` and `PHASE39_FIX_LOG.md`.
