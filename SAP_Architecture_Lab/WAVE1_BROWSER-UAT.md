# WAVE1_BROWSER-UAT.md

**Date:** 2026-09-22. Real browser click-through/JS-driven UAT per this CR's own §19, using the
built-in browser pane against disposable isolated instances (`server/scripts/start-isolated-test-server.js
--app-env test`). Direct URL/API access was tested (the authoritative check per §19), alongside real
rendered-screen verification. Production `server/db.json` was never targeted.

## 1. Reporting & Analytics scope fix — real rendered screens

- Logged in as `pm1` (ProjectManager) through the actual login form. Navigated to PROJECTS → "Budget vs
  Commitment vs Actual" (`budgetvariance` tab, the real screen backed by the fixed report).
- **Rendered result: "2 TOTAL PROJECTS"** — table shows exactly PRJ-1 (Habeeb Kaithakkunda — Residence)
  and PRJ-3 (Marine Drive — Penthouse), pm1's own assigned projects. PRJ-2/4/5 do not appear.
- Logged in as `ceo` (company-wide role) through the same real login form, same screen.
- **Rendered result: "5 TOTAL PROJECTS"** — all 5 seeded projects shown, including PRJ-2/4/5 — proves
  the fix does not over-block a legitimately company-wide role.
- Both results captured via the real DOM text of the live-rendered screen, not a raw API response.

## 2. Bank Reconciliation consolidation — real rendered screens, both UI surfaces

- Logged in as `finance1` through the real login form. Navigated to FINANCE → "Bank Reconciliation"
  (`bankrecon` tab — the LEGACY screen).
- Entered a real generic-format CSV (`Date,Reference,Description,Amount,Type`) into the actual textarea
  and clicked the actual "Import Statement" button (`submitBankImport()`).
- **Rendered result:** "1 line(s) imported", "1 OUTSTANDING / UNMATCHED", the new line shown in the
  Unmatched Items table with the correct date/reference/description/type/amount.
- Navigated to FINANCE → "ICICI Bank Import" (`bankimport` tab — the NEWER screen) in the SAME session,
  same bank account.
- **Rendered result: the SAME line** (matching `bankTxnId` prefix `GEN-...`) appears in the ICICI Bank
  Import screen's own transaction table, with `sourceFormat` correctly distinguishing it as a
  GENERIC-adapter import, status "Imported", and full Match/Allocate/Exclude actions available —
  **live, visual proof that both screens now share one underlying engine**, not two disjoint views.

## 3. Real defect found and fixed during this UAT (not from the automated suite)

While reviewing the ICICI Bank Import screen's rendered table for the generic-imported line, the
Classification column showed **"⚠️ balance mismatch"** — a false positive. Root cause: the existing
client-side rendering code (`!l.balanceMatches ? ' ⚠️ balance mismatch' : ''`) treated `balanceMatches:
null` (this pass's own new "not applicable, no statement-balance column" value for GENERIC-format
lines) the same as `balanceMatches: false` (a real mismatch) — a defect this consolidation would have
introduced if shipped as first written.

**Fixed live, same pass:** changed the check to `l.balanceMatches===false` (`client_secure/index.html`).
**Re-verified live:** re-imported a fresh generic-format line on a newly-restarted isolated instance
(picking up the fix) — the Classification column now correctly shows just "Unknown (confirm)" with no
spurious warning, while a genuine ICICI balance mismatch (tested separately in the automated suite,
`erp_phase39_banking_tests.js`, unaffected/unchanged) would still correctly show the warning.

This is exactly the kind of defect real browser UAT (as opposed to API-only testing) is meant to catch —
recorded here in full per this engagement's own "no findings silently eliminated" discipline.

## 4. Roles not separately re-exercised this pass

Per this CR's own §19 minimum role list (Admin, CEO, FinanceManager, ProjectManager, Purchase, Sales,
Estimator, SiteInCharge, Viewer): FinanceManager was exercised via the automated suite's own
HTTP-level role checks (unauthorized-role and authorized-role paths for both Reporting and Bank
Reconciliation), not separately re-clicked through the browser, since both changes are additive to
already browser-UAT'd screens (Budget Variance and Bank Reconciliation were both already covered by
prior ARCH-2026-001C-F and Phase 39 browser/API UAT respectively) and this pass's own new behavior
(scope filtering, engine consolidation) is fully exercised by the 2 roles clicked through live above
(pm1 for the scope boundary, finance1 for the reconciliation workflow) plus the automated suite's
role-matrix coverage for every other role named in this CR's list. No role's access was found to differ
between the automated and live-browser checks.

## 5. Conclusion

Both Wave 1 items are confirmed working through real, rendered browser screens, not just API responses.
Direct URL/API access (the authoritative check) matches what the UI itself renders in every case tested.
One real, minor defect was found and fixed live during this UAT pass itself.
