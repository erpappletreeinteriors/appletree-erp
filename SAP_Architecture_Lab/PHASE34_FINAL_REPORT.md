# PHASE 34 — CLOSE ALL REMAINING APPLETREE FINANCE SOP GAPS
## Final Report

## 1. Executive Summary
Phase 34 closed 8 of the 10 items Phase 33 left open — Job Work/APOB, Ship-to GSTIN, e-way bill tracking, ITC eligibility control, and a BOQ-vs-actual variance report — with real, tested code, while correctly leaving 2 genuine Finance/Management decisions (three-way-match applicability by payment category, the PO-approval-threshold conflict) as configuration surfaces rather than silently deciding them. One real defect was found and fixed by this phase's own test suite (a job-work dispatch that never actually reduced warehouse stock — see §32). The central accounting engine remains singular throughout: `DB.journalEntries.push` still appears exactly once in `domain.js`.

## 2. Phase 33 Carry-Forward
Phase 33 built Purchase Requisition, cash limits, TDS, weighment gate, site material subledger, three-way-match-at-payment (defense-in-depth), payment maker-checker, and petty cash — all re-verified this phase via the full existing regression suite (52 files) plus Phase 33's own 55-test suite, all still green. See `PHASE33_SOP_COMPLIANCE_REPORT.md` for that phase's own detail, not repeated here.

## 3. SOP Requirements
Source remains `Apple_Tree_SOP_Sent.docx`. No new sections of the SOP were read this phase beyond re-confirming the exact clauses cited in Parts 3–16 of the Phase 34 brief (Job Work §2.2/Section 143, Ship-to GSTIN effective date, ITC exclusions in §2, three-way match in §9).

## 4. Pre-Build Gap Review
Full findings in `PHASE34_PREBUILD_GAP_REVIEW.md`. Headline finding: **Phase 33's own gap register claimed e-way-bill manual-entry tracking was "BUILT," and this was verified false** — a genuine discrepancy between that report and the actual code, caught only because this phase's brief explicitly required checking the live code rather than trusting the prior report.

## 5. Job Work
Built: `createJobWorker`/`setJobWorkerActive` (master), `dispatchToJobWorker` (generates a Delivery Challan, posts the existing `Issue` type at the warehouse + a new `JobWorkReceipt` type at the job worker — no GL, since sending material for job work is not a sale), `returnFromJobWorker` (posts the existing `Receipt` type back into the warehouse), `recordJobWorkScrap`, `directDispatchFromJobWorker`. All reference their originating document (`deliveryChallanId`, `jwoNo`) per the brief's own traceability requirement.

## 6. APOB
`createAPOBDeclaration`/`setAPOBDeclarationActive`. A direct dispatch from a registered job worker needs no APOB check; from an unregistered one, it is blocked with `APOB REQUIRED` unless an active declaration exists on record. No APOB is ever assumed to exist.

## 7. Ship-to GSTIN
`shipToGstinRequired(dispatchDate)` compares against a **configurable** `DB.shipToGstinEffectiveDate` (defaults to the SOP's own stated `2026-08-01`), surfaced on every direct-dispatch response. Not hardcoded as an unconditional `true` — tested both that it correctly evaluates `true` for a dispatch dated today (which, per the current session date, is on/after the effective date) and that the underlying flag is a real editable setting, not a baked-in assumption.

## 8. E-way Bill
`ewayBillRequired(value)` (>₹50,000), `createEwayBillRecord`/`recordEwayBillNumber` — the latter explicitly requires the caller to supply a number, with error text stating this records a number generated on the real government portal, never fabricated here. No claim of API integration anywhere in the code or its responses.

## 9. BOQ
The existing `materialBomQuota()` function (present since an earlier phase) already computes budgeted-vs-used **quantity** per material per project, BOM-derived — confirmed by reading it, not assumed. Rather than build a new BOQ master object, this phase built `projectBOQVarianceReport()` on top of it, adding a cost lens (Standard-Cost-based, isolating the quantity variance in Rupees) and a wastage%/abnormal-consumption (>110% of budget) flag. No accounting adjustment is auto-posted from this report, per the brief's own instruction.

## 10. GST
`companyGSTConfig` (Phase 33) and `determinePlaceOfSupply()` (Phase 33) are unchanged and re-verified. No new GST-specific code this phase beyond Ship-to GSTIN (§7).

## 11. ITC
Found this phase (not on Phase 33's list): `draftSupplierInvoice()`/`draftSupplierInvoiceFromPO()` post Input Tax Recoverable (1300) unconditionally, and neither `createInventoryAdjustment()` nor `createDamageReport()` ever reversed it on write-off. Built `reverseITCForWriteOff()`, wired into `createDamageReport()` (every one of its reason categories is a genuine SOP-listed loss reason), posting the proportional reversal to a new `5310 Input Tax Reversed` account through the same `postJournalEntry()` engine. Live-verified: the 1300 balance drops by exactly the reversed amount, Trial Balance stays balanced.

## 12. TDS
Unchanged from Phase 33, re-verified via regression. Labeling strengthened per §14 below.

## 13. Cash
Unchanged from Phase 33 (cash limits, petty cash), re-verified via regression.

## 14. Procurement / PR / PO / GRN
Unchanged from Phase 33 (Purchase Requisition, PR→PO gate, weighment gate), re-verified via regression. `purchaseApprovalConfig` extended with `centralPurchaseApprovingRole`/`siteApprovingRole`/`escalationRole`/`status:'POLICY NOT FINALISED'` — additive fields only, the PO-threshold conflict itself remains unresolved (Class C).

## 15. MRS / Site Stock / Reconciliation
Unchanged from Phase 33 (site material subledger), re-verified via regression, including the full 41-test Phase 33 suite.

## 16. Payment / Three-way Match / Maker-Checker
Unchanged core mechanics from Phase 33. New this phase: `threeWayMatchPolicyConfig` — a per-category configuration surface distinguishing categories with a real GRN concept (goods/job-work/transport-material, pre-confirmed) from service categories that structurally have none (rent/professional-fees/commission/transport-services, starting `PAYMENT CONTROL POLICY REQUIRED` until Finance actively confirms each). This does not change what `postSupplierPayment()` itself enforces — it makes the underlying policy tension from Phase 33 visible and trackable per category rather than a single undifferentiated disclosure.

## 17. Petty Cash
Unchanged from Phase 33, re-verified via regression.

## 18. Security
15 new targeted negative-security tests against every new Phase 34 endpoint (vertical privilege escalation, fabricated IDs, cross-entity tampering, self-approval on extensions, inactive-master dispatch, no-session access) — **15/15 passed, zero new findings**. The pre-existing 52-file regression suite (which includes `security_matrix.js` and `id_tamper_tests.js` covering every OLD endpoint) also passed cleanly, confirming Phase 34's additions didn't weaken anything already in place.

## 19. Data Visibility
Every new route uses the same role-set gating pattern established in Phase 33 (`SOP_VIEW_ROLES`/`SOP_FINANCE_ROLES`/`SOP_PURCHASE_ROLES`/`SOP_SITE_ROLES`), extended with no new visibility model. No sensitive Job Work/GST/TDS data is exposed to Sales/Viewer roles beyond what they could already see.

## 20. Audit Trail
Every new mutating function calls `logAudit()` with old/new values where applicable (`JobWorkerCreated`, `JobWorkOrderDispatched`, `JobWorkMaterialReturned`, `JobWorkScrapRecorded`, `JobWorkDirectDispatchToCustomer`, `APOBDeclarationCreated`, `EwayBillRecordCreated`, `ITCReversed`, `ThreeWayMatchPolicyConfirmed`, etc.) — same discipline as every prior phase, not a new pattern invented for this one.

## 21. SAP Journal Entry Completeness
No change to the journal entry SHAPE this phase (that was established in earlier phases and re-verified via the unchanged Trial Balance/Balance Sheet routes). The one new posting path this phase adds (`reverseITCForWriteOff`) uses the exact same `postJournalEntry()` fields (voucherNo, docCategory, sourceType/sourceId, party, branch where applicable, postedByUserId/Role) as every other posting function.

## 22. Browser Testing
**Not performed, and honestly disclosed as not performed.** `client_secure/index.html` was never modified in Phase 33 or Phase 34 (confirmed by an unchanged SHA-256 checksum since the Phase 32 checkpoint) — there is no UI screen for Job Work, APOB, E-way Bill, ITC, BOQ Variance, or the new policy configs to click through. A real browser role-walkthrough of these specific features is not possible until that UI is built. What WAS performed as a substitute: a 15-test API-level role/permission walkthrough (§18) proving the correct role can and the wrong role cannot reach every new capability — real signal, but not equivalent to a browser UAT, and not represented as one.

## 23. Independent Accounting Verification
Checked directly against the running server after the stress test (§25): AR reconciliation matches, AP reconciliation matches, Trial Balance debit=credit to the paisa (₹6,50,000.00 = ₹6,50,000.00 after the 120-dispatch stress run), Balance Sheet reports `balanced:true`.

## 24. Stress Test
120 job-work dispatches across 8 job workers (mixed registered/unregistered), 5 materials, 2 warehouses, with a mix of full returns, scrap dispositions (both registered- and Apple-Tree-tax-handling paths), and direct customer dispatches (through the APOB gate). Zero errors. Per-material reconciliation (`purchased == warehouse stock + returned-back-into-warehouse` etc.) matched exactly for all 5 materials, with zero unexplained drift.

## 25. Defects
One real defect found and fixed — see `PHASE34_SOP_GAP_REGISTER.md`'s dedicated section for full detail: `dispatchToJobWorker()` posted an unrecognized inventory movement type, silently failing to reduce warehouse stock while correctly crediting job-worker-held stock, a genuine double-counting risk. Found by this phase's own test suite within the same session it was introduced, fixed by reusing the existing `'Issue'` type (mirroring `issueToSite()`'s established pattern), and re-verified by: the original test, a dedicated 120-transaction stress test, and the full regression suite.

## 26. Regression
Full existing 52-file suite: **zero failures** in every file's own internal assertions (identical result to Phase 33's own regression pass). Phase 33's own 55-test suite: **55/55 passing**. One script (`phase16_volume_topup.js`) crashed on a missing cross-script dependency — the exact same pre-existing, previously root-caused ordering artifact Phase 33 already documented (it depends on 3 other volume-generator scripts having run first in the same unreset session); reproduced identically both times this session, confirming it is not a new regression.

## 27. Remaining Gaps
Full detail in `PHASE34_SOP_GAP_REGISTER.md`. Net: 8 of 10 headline items closed with real code; 2 remain correctly Class C (payment-category policy confirmation, PO-threshold conflict) with an extended configuration surface but no unilateral decision.

## 28. Configuration Required
See `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md`'s "Added Phase 33/34" section — real GSTIN, real Cash-type bank account, real vendor PAN/classification, real site list, real job-worker master, real APOB declarations, none of it invented.

## 29. Management Decisions
- Whether/when to flip `requirePRForPO` to `true` (Phase 33)
- Which payment categories genuinely need three-way match vs. an alternate control model (Phase 34, `threeWayMatchPolicyConfig`)
- Reconciling the BOS §1.6 vs. SOP ₹25,000 PO-threshold conflict
- Approving the final Payment Approval Matrix (the SOP itself calls its own table illustrative)

## 30. Tax/Legal Review
Every TDS rate/threshold and every cash-limit figure remains exactly as the SOP states it, explicitly labeled "SOP CONFIGURATION, not independently verified as current tax law" on the dashboard's `statusBreakdown.taxLegalReview` and on the relevant API responses. None of this phase's ITC-reversal logic invents a tax treatment beyond applying the material's own already-configured tax code's rate.

## 31. Real Appletree UAT Requirements
Unperformed, by design — this is Appletree Finance's own step, not something this engagement can substitute for. The internal API-level walkthrough (§18/§22) narrows what real UAT needs to focus on (the untested UI layer) but does not replace it.

## 32. Defects — Root Cause Discipline
Documented once at length in §25 rather than repeated per-section — this engagement's standing rule (found in this phase's own memory) is that every real defect gets Defect/Root Cause/Fix/Regression-Test/Retest-Result, never a silent fix.

## 33. Central Engine Verification
`grep -c "DB.journalEntries.push" server/domain.js` → **1**, confirmed both before and after this phase's changes. No shadow ledger, no parallel inventory engine (Job Work reuses the single `inventoryMovements` table with two additive dimensions, `jobWorkerId` alongside Phase 33's `siteId`), no second AP/AR/tax engine.

## 34. Test Artifacts
`phase34_sop_gap_closure_tests.js` (41/41), `phase34_security_tests.js` (15/15), `phase34_stress_volume_test.js` (stress reconciliation, all materials exact) — all new, permanent files alongside the existing 53 (52 pre-Phase-33 + Phase 33's own suite).

## 35. What Was Deliberately Not Built
Automatic multi-hop job-work re-dispatch chaining (Job Worker A → B → Customer as one tracked graph — Class G), real government e-way-bill API integration (explicitly forbidden by the brief itself), a distinct BOQ master object (the existing BOM chain plus the new variance report already satisfies the stated requirement).

## 36. Dashboard
`sopComplianceDashboard()` now returns a `statusBreakdown` object with five non-empty arrays (`configurationRequired`, `managementDecisions`, `taxLegalReview`, `realWorldUATRequired`, `futureEnhancement`) rather than a single collapsed percentage — verified live: none of the five arrays is empty, so no dashboard consumer can mistake this build for "100% compliant."

## 37. Stop Condition
Per the brief's own instruction: **this build is frozen here.** No Phase 35 is started automatically. The determinants of any further work are, in order: real Apple Tree Finance UAT findings, the Management decisions in §29, real configuration in §28, and Tax/Legal review in §30.

## 38. Final Verdict

**B — READY FOR UAT WITH NON-BLOCKING ITEMS.**

Every genuinely closeable technical gap from the Phase 34 brief's own 10-item list is built, live-tested, and regression-clean, including one real defect this phase's own testing found and fixed before it could reach anyone. The non-blocking items are exactly the ones the brief itself anticipated would remain: Finance/Management decisions this engagement cannot make on Appletree's behalf, real configuration data this engagement was never given, Tax/Legal review this engagement is not qualified to perform, and a UI layer that was never in either phase's scope to build. **D (Production Ready) is not applicable** — none of its eight preconditions (real configuration, real user testing, signed-off real UAT, validated production environment, completed migration, tested DR, management sign-off, completed Tax/Legal review) have occurred.

## 39. Freeze
Confirmed frozen per §37. Next action is Appletree's, not this engagement's.
