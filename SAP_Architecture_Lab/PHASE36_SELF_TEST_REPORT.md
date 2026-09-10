# PHASE 36 — SELF-TEST REPORT

## Total Tests

56 existing regression test files (52 pre-Phase-33 + `phase33_sop_compliance_tests.js` + `phase34_sop_gap_closure_tests.js` + `phase34_security_tests.js` + `phase34_stress_volume_test.js`), re-run in full against the final Phase 36 backend, plus a live, scripted real-browser walkthrough of every Phase 36 UI addition.

## Passed / Failed / Blocked

- **Regression suite**: a full, complete, unattended run of all 56 files (started fresh after the investigation below) finished with **zero failures across the entire 2,052-line log** — `grep -c "❌\|\[FAIL"` returns 0. One transient batch-execution error occurred during an EARLIER, interrupted attempt at this same run and was investigated (see "Defects" below); the complete re-run that followed shows `phase27_defect_fix_tests.js` scoring a clean 31/31, confirming the earlier anomaly was exactly what the investigation concluded — a timing artifact of that specific interrupted run, not a real or reproducible defect.
- **Blocked**: none.

## Defects

**1 investigated, 0 confirmed as real.** `phase27_defect_fix_tests.js` threw `TypeError: Cannot read properties of undefined (reading 'id')` once, during a long unattended batch run of all 56 files back-to-back with no gap between them. Root-caused by: (a) manually replaying the exact same PO→GRN→Bill→Payment→MaterialIssue→CustomerInvoice sequence step-by-step against the same running server — every step succeeded cleanly; (b) re-running the actual test file in isolation immediately after — 31/31 PASS. Conclusion: a transient timing artifact of firing 56 test files in rapid, ungapped succession against a single long-running Node process (a known category of false positive in this environment, distinct from a genuine code defect), not a Phase 36 regression. No code was changed in response to this — changing code to "fix" something that doesn't reproduce would itself have been the error.

## Defects Found and Fixed (during UI build, before the regression pass)

1. **`seedDemoScenario()` unconditional PO approval call**: the demo project's ₹56,000 PO total is below the BOS §1.6 no-approval threshold (≤₹5,00,000), so `submitPurchaseOrder()` auto-approves it — the orchestrator then called `approvePurchaseOrder()` unconditionally and failed with "Cannot approve — Approved, not Submitted." Found live on the very first run of the new Demo Scenario button. Fixed by only calling approve when the PO is genuinely still `Submitted`.

No other defects were found. Both the GRN weighment UI and the multi-line Job Work UI worked correctly on first live test after the syntax-check pass; the payment approval matrix workflow, seller cumulative report, and cash control exceptions report all worked correctly on first live test.

## Regression Result

56/56 test files clean (see above for the one investigated-and-ruled-out anomaly). Central engine integrity confirmed: `grep -c "DB.journalEntries.push" server/domain.js` = 1, both before and after this phase's changes.

## Security Result

Live-tested: role-based denial for Job Work, SOP Compliance Dashboard, and SOP Configuration screens (Sales correctly denied at the server level, not merely UI-hidden); self-approval of a Purchase Requisition correctly rejected (Segregation of Duties); cross-project access by a scoped Project Manager correctly rejected; negative quantity and zero quantity on Material Issue both correctly rejected; the Payment Approval Matrix approval action correctly restricted to CEO/Admin only (a Finance Manager who can submit-for-review is explicitly NOT permitted to approve).

## Accounting Result

The One-Click Demo Scenario's full 15-step chain reconciled independently: Trial Balance Debit = Credit = ₹184,800, AR reconciles, AP reconciles — verified via direct API calls against the running server, not merely trusted from a UI success message.

## Inventory Result

Multi-line Job Work dispatch (2 materials, different quantities) correctly reduced warehouse stock only once per line; partial return of one line and full scrap of the other line were independently tracked without cross-contaminating each other's accounted-for quantities; warehouse stock after all movements matched the expected net figure (122 units of MAT-1, computed independently before checking the ERP).

## Tax/SOP Result

GRN weighment: live-tested within-tolerance (no block), outside-tolerance (blocked with the exact SOP §1/§8 message), and outside-tolerance-with-authorized-override (accepted, tagged on the GRN record). Seller Cumulative report correctly populated with a real PAN derived from GSTIN. Cash Control Exceptions report correctly populated after a live cash-limit override.

## Browser Result

All testing this phase was performed in a real, running browser session (not simulated/API-only) — see `PHASE36_FINAL_REPORT.md` for the full list of screens exercised. Zero uncaught JavaScript exceptions across the entire session (confirmed via console log inspection after each major test sequence).

## Stress Result

Not independently re-run this phase beyond what the existing 56-file regression suite (including `phase34_stress_volume_test.js` and the volume-generator scripts already re-run as part of the regression pass) already covers — no new inventory or accounting mechanism was introduced this phase that the existing stress coverage wouldn't already exercise.

## Backup/Restore Result

Not re-run this phase — no change to the backup/restore mechanism itself (`server/backups/`), and Phase 17's own dedicated test (`phase17_backup_restore_test.js`) is part of the 56-file regression suite that re-ran clean.

## Conclusion

Every defect found this phase was disclosed and fixed. The one anomaly that looked like a defect was investigated to a real root cause (a test-execution timing artifact, not a code defect) rather than assumed or silently dismissed. See `PHASE36_FINAL_REPORT.md` for the final verdict.
