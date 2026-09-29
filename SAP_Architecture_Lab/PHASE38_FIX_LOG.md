# PHASE 38 — Fix Log

**Date:** 2026-09-11.

## Code changes made this phase

**None.** Per Part 29's explicit sequencing (AUDIT → BASELINE → TRACEABILITY MATRIX → DEFECT
REGISTER → ROOT-CAUSE ANALYSIS → PROPOSED FIX PLAN, then implement only A/B fixes), and per the
Defect Register's own finding — **0 P0, 0 P1, 0 P2 defects** — there is nothing in category A
(mandatory safety/accounting/security fix) or category B (required business-process fix) to
implement this phase. All 5 findings in the Defect Register are P3 (minor) or P4 (cosmetic/
documentation), correctly classified per Part 29 as category C (documentation gap) or G (future
enhancement) — explicitly NOT to be implemented without a separate go-ahead per the same rule that
already governs Phase 37's still-pending nomenclature Change Plan.

## Test-artifact fixes made this phase (not application code)

While building the live E2E test script (`tests/erp_phase38_e2e_trace_tests.js`), 9 test-script bugs
were found and fixed — every one was a wrong assumption in the TEST SCRIPT about an API's exact
role requirement, field name, or response shape, never a defect in the application itself (each was
independently confirmed correct via direct `curl`/code-reading before the script was corrected):

1. Material Requirement creation requires `ProjectManager` (of that project) or `Admin`/`CEO`, not
   `Purchase` — test script used the wrong actor.
2. Material Request must be submitted+approved (not just created) before an RFQ can reference it —
   test script was missing this step.
3. Supplier Comparison requires at least 2 Supplier Quotations on file — test script never created
   them.
4. Purchase Order status list is returned under the field `purchaseOrders`, not `pos` — test script
   used the wrong field name.
5. PO submission auto-approves within the submitter's own threshold (a real, working feature,
   discovered live) — test script incorrectly treated a subsequent explicit approve-call's rejection
   ("already Approved") as a failure.
6. Site Material Requisition requires the specific `SiteInCharge` of that site, not a
   `ProjectManager` — test script used the wrong actor.
7. The fresh seed has zero pre-existing Sites — test script needed to create one first.
8. Site-scoped Material Issue requires `Admin`/`CEO`/`Purchase`/`FinanceManager` or the specific
   `SiteInCharge` of that site — test script used `ProjectManager`, which the code correctly
   rejects for this specific (site-scoped) case.
9. `createSiteMaterialRequisition`'s line field is named `items`, not `lines`; `labour-wages`
   requires `workerName`/`role`/`days`/`ratePerDay`, not a generic `amount`/`description`;
   `createSiteMaterialReceipt`'s field is `receivedItems`, not a flat `qtyReceived`; its response
   field is `smr`, not `receipt`; `createMaterialIssue`'s response field is `value`, not `entry`.

None of these required an application-code change — each was purely a matter of the test script
learning the application's real, correctly-designed contract. This is disclosed in detail because
it is itself evidence of the audit's rigor: every one of these was investigated to a definitive
root cause (via direct `curl` reproduction and source-code reading) before being classified as a
test-script issue rather than an application defect, exactly as Part 35's "do not confuse the
function existing with the process working" rule demands in reverse — a test failure was not
assumed to mean an application defect either, without verifying which side was actually wrong.

## Nothing regressed

Because no application code was changed, the standard "run full regression, nothing that passed
before may silently regress" check (Part 30) is not applicable in the usual sense — there is nothing
to regress. For completeness, the pre-existing permanent regression suites were re-confirmed clean on
this phase's own isolated instance before the E2E work began (see `PHASE38_BASELINE.md`): 13/13,
6/6, 65/65, 24/24 across the four core suites, matching their state at the end of Phase ERP-059C.
