# WAVE2_SECURITY-RESULTS.md

**Date:** 2026-09-22. Security testing summary for this Wave 2 implementation pass, per this CR's own
§14/§22. For this pass, SoD is the entire security surface touched (no RBAC, data-scope, or approval
mechanism was added or modified) — the full maker/checker/protected-transaction/enforcement-point/
audit-behavior/exception-mechanism table lives in `WAVE2_SOD-RESULTS.md`; this document summarizes the
broader security posture per this CR's own §14 test list.

## RBAC

Unaffected. No route's role gate was added, removed, or narrowed. Re-confirmed via the full regression
battery (`erp_arch_2026_001a_rbac_foundation_tests.js`, 39/39 unchanged) and this pass's own new suite
(`erp_arch_2026_002_wave2_tests.js` Parts covering unauthorized-role attempts on every new guard's
surrounding route, all still correctly blocked with the SAME pre-existing role gate).

## Direct API access / forged roles

Every one of the 5 new SoD guards derives its identity comparison from the session-authenticated
`actor`, never from a client-supplied field. Explicitly tested: `WAVE2_TEST-RESULTS.md`'s
SOD-7-BYPASS assertion — a forged `actor:{id:'U-ADMIN',role:'Admin'}` field in the request body does
NOT change the outcome; the real, session-derived identity is used throughout.

## Missing authentication

Unaffected — every route protecting a new guard already required a valid session before this pass;
unchanged.

## Data scope (Project/Site/Customer/Branch)

Unaffected. No Wave 2 change touches `hasScopeAccess()` or any scope-filtered route. Re-confirmed via
full regression (`erp_arch_2026_001c_data_scope_tests.js` 32/32,
`erp_arch_2026_001c_f_residual_scope_tests.js` 33/33, both unchanged).

## Warehouse scope

Not introduced — re-confirmed absent, per `ARCH-2026-002-WAVE-2-DECISIONS.md` item W2-3 (not
authorized by this CR).

## SoD

The primary subject of this pass — see `WAVE2_SOD-RESULTS.md` for the complete rule-by-rule record.

## Approval

Unaffected — no Wave 2 item touches `resolveApprovalAuthority()` or any of the 4 real approval
enforcement functions it mirrors.

## Audit

5 new `SoDViolationBlocked`-class audit entries (one per new rule) plus 1 new `QCChecklistCreated`
entry, all confirmed present and correctly attributed via live testing. **One real defect found and
fixed within this same pass**: a bare `logAudit()` call before an `{ok:false}` return inside a
`withTransaction()`-wrapped function is silently rolled back along with the rest of the DB snapshot —
corrected across all 8 new call sites using the established `durableFailureAudit` mechanism. See
`WAVE2_SOD-RESULTS.md` for full detail, including the disclosed, out-of-scope, PRE-EXISTING instance of
the same pattern found (not fixed) in SOD-6.

## Conclusion

No CRITICAL vulnerability found or introduced. No RBAC, data-scope, or approval mechanism was touched.
The 5 new SoD rules close 3 previously zero-coverage operational chains, live-tested for maker-blocked,
different-user-succeeds, audit-trail-present, and API-bypass-blocked in every case.
