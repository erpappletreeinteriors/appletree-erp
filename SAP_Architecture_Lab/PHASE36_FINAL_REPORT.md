# PHASE 36 — APPLETREE UAT RELEASE, FINAL GAP CLOSURE & SHAREABLE TEST ERP
## Final Report

## 1. Executive Summary
Phase 36 closed every remaining genuine UI gap Phase 35 disclosed (GRN weighment, Seller Cumulative/194Q, Cash Control Exceptions, Payment Approval Matrix workflow, multi-line Job Work) and turned this Lab into a real, shareable UAT environment: a persistent UAT/Demo banner, a dedicated 10-user credential set, an exposed and confirmed "Reset UAT Data" function, a One-Click Demo Scenario that seeds one complete connected transaction chain, and a Document Flow / Traceability panel. Everything was verified against the live code first, not assumed from prior reports — no discrepancy was found this time between what Phase 35's reports claimed and what the code actually contained. One real defect was found and fixed during this phase's own self-testing (a script-level bug in the new demo-scenario orchestrator, not a domain-logic defect). Zero backend architecture changes to the central engine; `DB.journalEntries.push` remains exactly 1.

## 2. Phase 35 Baseline
Verified directly against the live code before any change (per this phase's own "do not modify code immediately" instruction): `client_secure/index.html` and `server/domain.js`/`server.js` checksums matched Phase 35's own end-state exactly, confirming no drift.

## 3. Pre-Build Gap Review
Cross-checked `PHASE35_UI_GAP_REGISTER.md`'s 5 disclosed items against the live code — all 5 confirmed genuinely still open (GRN weighment fields, Seller Cumulative report screen, Cash Control Exceptions report screen, Payment Approval Matrix editing UI, single-line-only Job Work dispatch). All 5 were committed to closure this phase.

## 4. GRN Weighment UI
Built: per-line "Weighment Qty at Purchase" / "Weighment Qty at Factory Gate" fields, a live client-side variance preview (a display-only convenience — the server's own `createGRN()` remains the single source of truth for the actual accept/block decision), and a conditional override-reason field. A new small `/api/weighment-tolerance` GET route was added so the UI can display the real configured tolerance rather than hardcoding a number. Live-tested: within tolerance (10 vs 9.95, no block), outside tolerance (50 vs 45, 10% variance, correctly blocked with the exact SOP §1/§8 message), and outside-tolerance-with-authorized-override (correctly accepted, tagged on the GRN's own `weighmentIssues` field, visible in the GRN list).

## 5. Seller Cumulative / 194Q Report
Built a real screen showing Supplier, PAN, Financial Year, Cumulative Purchases, Threshold, Utilization %, 194Q flag, and transaction count. PAN is *derived* from the supplier's own recorded GSTIN (a real structural fact — PAN occupies characters 3–12 of a GSTIN — not a separately invented value); a supplier with no GSTIN on file shows "Not on record," never a fabricated PAN. `sellerCumulativeReport()` was extended (backend) to expose `thresholdUtilizationPct`, `relevantTransactions`, and `pan` — the underlying cumulative-purchase calculation itself was not touched or duplicated. Live-tested with a real vendor bill and confirmed the row populates correctly.

## 6. Cash Control Exceptions Report
Built a real screen showing Date, Party, Type, Amount, Applicable Limit, Exceeded By, Status, and Approved By/Reason, with a single combined search box (matching this app's own established list-filtering convention rather than three separate, confusingly-independent filter boxes). `checkCashLimit()` was extended (backend) to record `party`/`paymentMethodId`/`projectId`/`exceededBy`/`date` on every exception it already creates — no new exception-recording path, no new policy. Live-tested with a real cash override payment and confirmed the row populates correctly.

## 7. Payment Approval Matrix Workflow
Built a genuine Draft → Review → Approved workflow, replacing Phase 33/34's permanently-unfinalizable design now that this phase's brief explicitly asked for a real approval mechanism (a legitimate evolution, not a reversal — the earlier phases correctly built "no path to finalize" when none was requested; this phase adds the path *with* the safeguards the brief itself demands). A Finance user can submit the matrix for review; **only CEO/Admin can approve it**, and only with a real reference (e.g. a Board Resolution number) — never silently. Editing the tiers at any point resets the status back to Draft, since an edited matrix is no longer the one that was reviewed. Live-tested the full sequence: Finance submits → Finance's own attempt to approve is correctly denied ("Board-level policy decision... not a routine Finance configuration change") → CEO approves with a reference → the matrix correctly shows `finalised:true`, `status:'Approved'`, the approver, date, and reference → editing the tiers afterward correctly resets everything back to Draft.

## 8. Multi-Line Job Work UI
Reworked the dispatch form to support Add/Remove Material lines (mirroring this app's own existing multi-line pattern from Purchase Requisitions and Material Requirements). Reworked the Job Work Orders table to show one row per line with its own Return/Scrap/Direct-Dispatch actions targeting that specific line index, using a sparse-array technique (`{qty:0}` at every non-target position) that required zero backend changes — the existing `returnFromJobWorker()`/`recordJobWorkScrap()`/`directDispatchFromJobWorker()` functions already operated per-line-index since Phase 34. Live-tested with a genuine 2-line dispatch (Material A ×5, Material B ×4): partial return of line 1 and full scrap of line 2 were independently tracked (`returnedQtyByLine`/`scrapQtyByLine` correctly keyed by index), the order's status correctly showed `PartiallyReturned`, and warehouse stock reflected the correct net figure.

## 9. Sharable UAT Environment
A persistent red banner ("APPLE TREE ERP — UAT / DEMO ENVIRONMENT — NOT PRODUCTION — NO REAL MONEY / NO REAL PRODUCTION DATA") above the login screen and the app header at all times; the header badge changed from "PHASE 9 — SECURE UI" to "UAT MODE"; the post-login user line now reads "Name — Role (username) · UAT/Demo Environment · Test Dataset". 10 dedicated `uat_*` users added to the seed (both the base SEED_USERS array and the migration guard, per this Lab's established "add to both" discipline) with temporary, clearly-non-real passwords. This Lab's role model has no separate Store or Factory role — rather than inventing two new roles purely to match a naming convenience, `uat_store` and `uat_factory` are mapped to the closest existing real role (Purchase, which already gates warehouse/GRN and Factory/MES screens), disclosed in `19_TEST_CREDENTIALS.md` and this report, not silently substituted.

## 10. Reset UAT Data
Verified the existing mechanism (`resetToFreshSeed()`, already used by the automated test harness via `/api/test/reset`) before building anything new, per this phase's own explicit instruction. It already does exactly what was asked — wipes every transaction, restores the clean seed, preserves application code and the full user list — and this environment has no separate "production" data it could ever touch, since it is a UAT/demo instance only. No new, riskier mechanism was built. It was simply exposed for the first time as a real, confirmation-gated, Admin-only button on the Users & Roles screen.

## 11. Demo Data & One-Click Demo Scenario
Built `seedDemoScenario()` — a pure orchestrator over existing domain functions (no new posting, inventory, or approval logic) that creates one complete, connected, clearly-tagged ("PHASE36-DEMO") transaction chain: Project → Purchase Requisition → PO → GRN → Supplier Bill → AP Journal Entry → Payment Request (maker: Purchase) → Approval (checker: Finance) → Payment + Clearing (executor: CEO) → Site Material Requisition → Delivery Challan → Site Material Receipt → Site Consumption → Project P&L. Uses the dedicated UAT users as actors so the real maker-checker/SoD structure is visible in the resulting data. **One real defect was found and fixed** on the very first live run (see §21).

## 12. Document Flow / Traceability
Built `projectDocumentTrace()` — a read-only assembler that walks the same `purchaseRequisitionId`/`poId`/`grnId`/`deliveryChallanId`/`sourceId` reference chains every existing doclink in this app already relies on, returning one ordered list. Surfaced as a new "Document Flow" section on the existing Project 360 screen, rendering the chain as a connected series of pills with hover detail. Live-tested against the demo scenario's own project and confirmed the full 9-document chain rendered correctly in order.

## 13. SAP-Style Journal Entry
Verified, not rebuilt: the existing Document Workflow / Journal Register screens already expose Series, Number, Posting Date, Due Date, Remarks, Origin, Project, Branch, Reference fields, GL Account, Debit, Credit, Tax Code, Business Partner, Cost Centre — and Debit=Credit is enforced server-side on every single posting, not merely displayed. No fields were fabricated to look more complete than the backend actually supports.

## 14. Accounting Architecture Test
Proved through real transactions, not diagrams: the One-Click Demo Scenario's full chain independently reconciled (Trial Balance Debit=Credit=₹184,800, AR matches, AP matches), confirmed via direct API calls against the running server rather than trusted from a UI success message.

## 15. Complete Accounting Trace Test
The demo scenario itself IS this trace, executed for real: Project → PR → PO → GRN → Supplier Bill → AP → Payment → Clearing → Site Material → Consumption → Project Actual Cost, with every document number captured in the returned trace and independently re-verified via the Document Flow panel afterward.

## 16. Inventory Trace
Proved via the multi-line Job Work test: Purchase → Warehouse → Job Worker (dispatch) → Return (partial, line-specific) and → Scrap (full, line-specific on a different line) simultaneously, with warehouse stock reflecting the correct net figure and no cross-contamination between the two lines' own accounted-for quantities.

## 17. Security
Live-tested role denial for Job Work, SOP Compliance Dashboard, and SOP Configuration (Sales correctly denied at the server level in every case, not merely UI-hidden) — confirming both UI and direct-API-level enforcement.

## 18. Segregation of Duties
Live-tested: a Purchase Requisition's own creator correctly cannot approve it ("Segregation of duties: PR creator cannot also be PR approver"); the Payment Approval Matrix's Submit-for-Review and Approve actions are correctly split across different authorization tiers (Finance can submit, only CEO/Admin can approve); the maker-checker-executor chain in the demo scenario used 3 genuinely different UAT users.

## 19. Tax / SOP Test
GRN weighment (within/outside/overridden), Seller Cumulative/194Q (real PAN derivation, real threshold math), Cash Control Exceptions (real override capture) — all live-tested this phase; TDS/cash-limit/site-material/job-work/APOB/ship-to-GSTIN/e-way-bill controls were live-tested in Phases 33–35 and reconfirmed clean by the unchanged 56-file regression suite this phase. Every occurrence continues to carry the "SOP-sourced, not independently verified tax law" disclaimer.

## 20. Negative Testing
Live-tested: negative quantity on Material Issue (rejected), zero quantity (rejected), self-approval of a Purchase Requisition (rejected), a Project Manager accessing an unassigned project's financials (rejected). All produced clean, correctly-worded errors — no silent failures, no crashes.

## 21. Defects Found
One, in the new `seedDemoScenario()` orchestrator: it called `approvePurchaseOrder()` unconditionally after submit, but the demo PO's ₹56,000 total is below the existing BOS §1.6 no-approval threshold, so `submitPurchaseOrder()` had already auto-approved it — the subsequent unconditional approve call then failed with "Cannot approve — Approved, not Submitted." Found on the very first live run of the new Create Demo Scenario button.

## 22. Defects Fixed
Fixed the same session: the orchestrator now only calls `approvePurchaseOrder()` when the PO is genuinely still in `Submitted` status after submit. Re-verified live immediately afterward — the full 15-step chain completed successfully end to end. One additional investigation (not a confirmed defect): a single transient error in `phase27_defect_fix_tests.js` during an unattended 56-file batch run, root-caused to a test-execution timing artifact (manual step-by-step replay succeeded; immediate isolated re-run of the same file scored 31/31) — see `PHASE36_SELF_TEST_REPORT.md` for the full investigation.

## 23. Regression
56/56 test files clean against the final Phase 36 backend (full detail in `PHASE36_SELF_TEST_REPORT.md`). Central engine integrity reconfirmed: `grep -c "DB.journalEntries.push" server/domain.js` = 1, unchanged.

## 24. Documentation
`PHASE36_FINAL_GAP_REGISTER.md`, `PHASE36_SELF_TEST_REPORT.md`, this report, `START_HERE.md` (new, root-level), `ACCOUNTANT_UAT_PACKAGE/19_TEST_CREDENTIALS.md` and `21_UAT_SIGNOFF.md` (new), `20_DEFECT_REPORT_TEMPLATE.md` (renamed from a numbering collision found during this phase's own file creation — see below), plus updates to `FINAL_HANDOVER_DOCUMENT.md`, `APPLETREE_ERP_USER_MANUAL.md`, `MANAGEMENT_DECISION_REGISTER.md`, `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md`, and `ACCOUNTANT_UAT_DASHBOARD.md`.

**A minor process note, disclosed rather than hidden:** while adding new UAT package files, two of the new filenames (`02_TEST_CREDENTIALS.md`, `13_DEFECT_REPORT_TEMPLATE.md`) collided with existing Phase-25 filenames (`02_TEST_SCENARIOS.md`, `13_RECONCILIATION_TESTS.md` — different names, same numeric prefix). Caught before finalizing this report; renamed to `19_TEST_CREDENTIALS.md` and `20_DEFECT_REPORT_TEMPLATE.md` (continuing the existing sequence past Phase 35's `18_...md`) rather than disrupting the established Phase-25 numbering.

## 25. UAT Package
Extended, not restructured: the existing 18-file package (117 scenarios) plus 3 new files this phase (`19_TEST_CREDENTIALS.md`, `20_DEFECT_REPORT_TEMPLATE.md`, `21_UAT_SIGNOFF.md`) closing the credential-list and formal-signoff gaps the brief specifically named, without discarding any of the substantial existing scenario content by renumbering it to match a differently-ordered naming scheme.

## 26. Management Decisions
`MANAGEMENT_DECISION_REGISTER.md` updated: item #1 (Payment Approval Matrix) now notes the real approval mechanism exists, without treating that as the decision itself being made.

## 27. Configuration Required
`REAL_APPLETREE_CONFIGURATION_CHECKLIST.md` updated (NOT SUPPLIED/SUPPLIED/VALIDATED model, unchanged from Phase 35) with the Payment Approval Matrix entry reflecting the new workflow.

## 28. Tax/Legal Review
Unchanged — every TDS rate and cash-limit figure, including in the two newly-built report screens, is explicitly labeled "SOP CONFIGURATION — NOT INDEPENDENTLY VERIFIED AS CURRENT TAX LAW."

## 29. Remaining Gaps
14-item final register in `PHASE36_FINAL_GAP_REGISTER.md` — 10 closed this phase, 2 verified-not-rebuilt/unchanged, 4 remain Class C (Management decisions), 1 Class E (real UAT), 1 Class F (tax/legal), 2 Class G, 2 Class D (disclosed data/role refinements).

## 30. Production Readiness

**Verdict: B — READY FOR UAT WITH NON-BLOCKING ITEMS.**

Every genuine UI gap Phase 35 disclosed is now closed and live-tested. The environment is now genuinely shareable: a clear UAT/Demo identity, dedicated credentials, a one-click way to see a working example, a safe way to reset, and a way to trace any document chain without memorizing IDs. Not upgraded to A because this phase's own self-testing found and fixed a real defect (the demo-scenario orchestrator) — a UAT tester should not be the first to hit that. **D (Production Ready) remains forbidden**: none of its 10 preconditions have occurred — no real Appletree configuration is loaded (every item in `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md` reads NOT SUPPLIED), no real Appletree user has tested it, no real UAT has been completed or signed off (`21_UAT_SIGNOFF.md` remains blank), no management sign-off exists, no Tax/Legal review has been performed, no production environment has been validated, no real data migration has occurred, and production-grade backup/restore/security have not been separately validated against real data.

Per this phase's own stop condition: **the build is frozen here.** No Phase 37 is started automatically. The next step is entirely Appletree's: open `START_HERE.md`, log in with a `uat_*` account, click Create Demo Scenario, and begin real UAT using `ACCOUNTANT_UAT_PACKAGE/`.
