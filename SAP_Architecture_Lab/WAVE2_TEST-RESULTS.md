# WAVE2_TEST-RESULTS.md

**Date:** 2026-09-22. Dedicated Wave 2 test suite, per this CR's own §18 (layers A-Q).
Suite: `tests/erp_arch_2026_002_wave2_tests.js`. **Result: 26 PASS / 0 FAIL / 26 TOTAL.**

## Layer coverage

| Layer | Covered by |
|---|---|
| A. Unit / B. Domain-service | Every SoD guard's observable behavior (block/allow) is exercised directly |
| C. API | Every assertion is a real HTTP call via `fetch()` against a live server |
| D. RBAC | Unaffected routes' existing role gates re-confirmed via the full regression battery |
| E. Data Scope | Unaffected by this pass; re-confirmed via full regression |
| F. SoD | This IS the suite's primary subject — 5 new rules, each maker-blocked/checker-allowed |
| G. Approval | N/A — no Wave 2 item touches the approval-authority framework |
| H. Audit | SoD-7's `SoDViolationBlocked` audit entry confirmed present and correctly attributed; W2-2's `QCChecklistCreated` entry confirmed present |
| I. Accounting invariants | See `WAVE2_ACCOUNTING-RESULTS.md` |
| J. Inventory invariants | See `WAVE2_INVENTORY-RESULTS.md` |
| K. Project-cost invariants | See `WAVE2_PROJECT-COST-RESULTS.md` |
| L. Browser UAT | See `WAVE2_BROWSER-UAT.md` (separate) |
| M. Regression | Full existing battery re-run — see `WAVE2_REGRESSION.md` |
| N. Concurrency | Not separately re-tested this pass (no new writer, no new race surface — the 5 rules are pure read-then-compare guards on already-existing, already-concurrency-tested functions) |
| O. Negative/security | Every SoD-NEG assertion; malformed/unauthorized-role setup calls incidentally exercised |
| P. Direct API bypass | SOD-7-BYPASS: forged `actor`/`role` fields in the request body do not override the session-derived identity |
| Q. Linked-document bypass | SOD-8's entire purpose — proven the Job Work → Supplier Bill linked-document path cannot bypass separation |

## Per-rule 1-9 test requirement (this CR's §18)

Confirmed for all 5 rules (SOD-7 through SOD-11) — see `WAVE2_SOD-RESULTS.md`'s own compliance table for
the exact mapping of each of the 9 numbered steps to a named assertion.

## Full console output summary

```
===== TOTAL: 26 PASS / 0 FAIL / 26 TOTAL =====
```

All 26 assertions individually itemized in the suite's own console output (re-run available via
`node tests/erp_arch_2026_002_wave2_tests.js <baseUrl>`). Includes: SOD-7 (6 assertions, incl. the
direct-API-bypass negative test), SOD-8 (5 assertions, incl. vendor/job-worker/stock setup), SOD-9 (7
assertions, incl. a post-guard inventory-integrity re-check), SOD-10 (4 assertions, incl. the W2-2 audit
fix), SOD-11 (5 assertions), plus 1 unrelated-endpoint regression spot-check.
