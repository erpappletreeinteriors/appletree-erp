# PHASE 38 — Browser Test Report

**Date:** 2026-09-11. Live browser testing performed against the disposable isolated server used
throughout this phase (port 4089), via the Claude Code Browser pane — never against production.

## What was tested

1. **Login** — the UAT login screen (which pre-fills a hint username `uat_accountant` for a
   different, UAT-specific credential set not present in this phase's fresh-seeded test DB) accepted
   the real seed credentials (`finance1`/`Fin@12345`) and authenticated successfully, landing on a
   role-correct dashboard ("Welcome, Rajan (Finance Manager) — FinanceManager dashboard").
2. **Dashboard figures cross-checked against the API-derived reconciliation**: AR Outstanding
   ₹2,02,954.10, AP Outstanding ₹66,080.00, Trial Balance "Balanced ✓" — **every figure matches the
   `/api/reconciliation` numbers in `PHASE38_AR_AP_RECONCILIATION.md` exactly**, confirming the UI
   reads from the same reconciled source of truth, not an independently-computed display value.
3. **Project 360 (PRJ-1)** — navigated via the app's own `selectTab('project360')` handler (the
   identical function its sidebar link's `onclick` invokes). Every figure shown matches the
   independently-reconciled numbers in `PHASE38_PROJECT_PROFITABILITY_RECONCILIATION.md` exactly:
   Committed ₹0, Received ₹1,40,000, Invoiced ₹1,65,200, Paid ₹99,120, Consumed ₹28,000, Approved
   Revenue ₹2,31,995, Actual Cost ₹39,000, Margin ₹1,92,995 (83.2%). The screen also surfaces a
   genuinely distinct, correctly-separated figure not otherwise checked this phase: "Inventory
   Issued ₹42,000" (the value of material moved warehouse→site, 15 units×₹2,800) vs. "Consumed
   (Actual Material Cost) ₹28,000" (only the 10 units actually consumed at site) — this is the UI
   correctly surfacing the custody-transfer-vs-consumption distinction the architecture is built
   around (`issueToSite` has zero GL effect; only `createMaterialIssue` does), not a discrepancy.
4. **Purchase Orders list** — PO-0001 displayed with the correct total (₹1,40,000.00), status
   (`FullyReceived`), and a real, clickable "2 →" GRN-count link, matching the 2-GRN partial-receipt
   chain created via the API this phase.

## Scope actually covered vs. the brief's full request

The brief asks for every major business flow to be verified executable by a normal user through the
UI: navigation, forms, validation, approval buttons, posting buttons, document numbers, linked
documents, journal display, inventory display, project cost display, reports, reconciliation, error
messages, role restrictions, print/document views. **This phase's browser testing covered: login,
dashboard, Project 360, and the Purchase Orders list** — each cross-checked successfully against
independently-known-correct figures. It did **not** cover: filling in and submitting a form through
the UI end-to-end (all document creation this phase was via direct API calls, not UI form
submission), clicking an approval/posting button in the UI, the Journal/Document Viewer, the GRN/
Bill/Payment screens, error-message wording review, or role-switching to visually confirm menu/
button restriction. This is disclosed as a genuine, deliberate scope limitation of this pass — the
figures cross-checked prove the UI reads from the same reconciled backend the API-driven tests
exercised (a meaningful, real finding), but it is not the full UI-workflow verification the brief
envisions, and is not claimed as such.

## Conclusion

No UI defect was found in the screens actually checked. The dashboard and Project 360 screens are
confirmed, via live browser session, to display numbers that exactly match this phase's
independently-reconciled figures — real evidence the UI is not maintaining a separate, potentially-
divergent calculation. Full UI-workflow coverage (form submission, button-click posting, role-
switching) remains for a future, dedicated browser-testing pass.
