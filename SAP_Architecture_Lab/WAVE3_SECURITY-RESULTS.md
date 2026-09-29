# WAVE3_SECURITY-RESULTS.md

**Date:** 2026-09-22. RBAC/SoD/scope re-verification results for ARCH-2026-002 Wave 3.

## Headline result

**ZERO new RBAC rules, ZERO new SoD rules, ZERO new data-scope dimensions, ZERO new approval-authority
tiers added this pass.** Every one of the 7 candidate items that would have added new security surface
(W3-2 through W3-9, minus the closed-by-evidence Account 1400 item) is classified
IMPLEMENTATION BLOCKER by `WAVE3_IMPLEMENTATION_SCOPE.md` and none was implemented. This pass is
full re-confirmation of existing security enforcement plus 2 defensive `domain.js` fixes (see
`WAVE3_CHANGELOG.md`) that narrow an existing operation's blast radius (block a reversal that used to
silently corrupt a reconciliation) rather than grant or restrict any actor's authority.

## RBAC re-confirmation

`tests/erp_arch_2026_001a_rbac_foundation_tests.js` re-run fresh this pass: **39/39 PASS**. The 10
Business Roles, 28 privileges, 18 duties, and the `can()` equivalence proof are byte-identical to Wave 2
Phase 0's own re-confirmation. No role/privilege/duty was added, removed, or reassigned.

## Route-layer authorization re-confirmation

`tests/erp_arch_2026_001b_route_auth_migration_tests.js` re-run fresh: **18/18 PASS**. No route's
authorization check changed. The 2 routes this wave's tests exercise most (`POST /api/journal/:id/reverse`,
`POST /api/fixed-assets/:id/dispose`) still use their pre-existing `permission:'reverse'` /
`authCheck:(actor)=>D.assertCanDisposeFixedAsset(actor).ok` gates, unchanged — the 2 `domain.js` fixes
this wave made are both INSIDE the already-authorized function body, after the existing role check has
already run; they add no new authorization branch.

## Data-scope re-confirmation

`tests/erp_arch_2026_001c_data_scope_tests.js` — **32/32 PASS**.
`tests/erp_arch_2026_001c_f_residual_scope_tests.js` — **33/33 PASS**. All 4 real scope dimensions
(Project, Site, Customer, Branch) unchanged; Warehouse/Cost-Centre/Profit-Centre/Department remain
confirmed absent from the data model, exactly as Wave 3 Phase 0 found — this pass did not add any of
them (Cost-Centre and Profit-Centre are specifically re-examined in `WAVE3_CONTROLLING-RESULTS.md`,
confirming Profit-Centre in particular is STILL master-data-only, W3-8 not implemented).

## Approval-authority re-confirmation

`tests/erp_arch_2026_001e_approval_authority_tests.js` — **37/37 PASS**. All 4 pre-existing
amount-threshold/role-tier tables (PO, Quotation Discount, Payment Request approval, Payment execution)
unchanged. The Payment Request raise→approve→execute 3-way maker/checker/executor separation (SOP §9) was
re-confirmed LIVE this pass (`WAVE3_TREASURY-RESULTS.md` §Payment Control Chain / `WAVE3_BROWSER-UAT.md`
chain (c)): the approver (FinanceManager) attempting to also execute is blocked with the exact,
unmodified error `"Maker-checker: execution must be a third person distinct from the maker and the
approver (or CEO/Admin), per SOP §9."`; a genuine third actor (Admin) succeeds.

## SoD re-confirmation

See `WAVE3_SOD-RESULTS.md` for the full 11-rule re-confirmation and the explicit statement that no new
rule was added.

## Audit-trail re-confirmation

Every rejection path this wave's 2 `domain.js` fixes added uses `durableFailureAudit` (via the existing
`rejectReversal()` helper for the reversal guard), matching the pattern `withTransaction()`'s own comment
documents (see `server/domain.js` `withTransaction()`) and this CR's own §29 reminder. No bare
`logAudit()` call was added before a rollback-triggering `{ok:false}` return — the exact defect class
Wave 2 found and fixed elsewhere was checked for and avoided here from the start.

## Net security surface change this wave

| Change | New attack surface added? |
|---|---|
| `reverseEntry()` blocks Fixed Asset Capitalization/Disposal reversal | **No** — strictly narrows an existing operation (fewer things `reverseEntry()` will now do), no new permission, no new bypass path |
| `disposeFixedAsset()` conditionally omits a zero-value GL line | **No** — pure bug fix to an existing, already-role-gated operation; the role check (`assertCanDisposeFixedAsset`) runs identically before and after |

**Conclusion: PASS (VERIFICATION ONLY — no new security capability, rule, dimension, or authorization
tier was built this pass).**
