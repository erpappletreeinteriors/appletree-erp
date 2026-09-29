# ARCH-2026-002 — End-to-End Process Trace

**Date:** 2026-09-22. Phase 0 deliverable, §9. Each chain traced by reading actual function bodies in
`server/domain.js` (not inferred from names). Verdict is one of WORKING / PARTIAL / BROKEN / ABSENT /
DUPLICATED, with the exact point of any gap cited.

## A. Lead-to-Quotation
`createLead`:3604 → `createEstimationRequest`:3640 → `createCostingVersion`:3663 → **[BOM/BOQ — no such
step exists here]** → `createQuotation`:3725 → `submitQuotation`:3779/`approveQuotationDiscount`:3790 →
`recordAcceptance`:3848

**PARTIAL.** Every step from Lead through Acceptance is real and genuinely wired — `createQuotation`
reads `costingVersionId` directly and cross-validates it traces to the same
`estimationRequestId`/`leadId` (a past Phase 41 fix); `approveQuotationDiscount` gates on a real
tiered-role matrix. But the named "BOM/BOQ" step **does not exist** between Costing Version and
Quotation — `createQuotation` never reads a BOM; price is derived purely from
`costingVersion.sellingPrice` (Material/Labour/Transport/Installation/Other line categories act as an
informal BOQ substitute). `createBOM`:6347 requires an existing `projectId`, and the only
project-creation path is `wonTransition`:3917 — confirming BOM can only be created **after** Won, never
between costing and quotation. Same structural fact already flagged in
`ARCH-2026-002-OPEN-DECISIONS.md` item 5.

## B. Quote-to-Project
`recordAcceptance`:3848 (status Accepted) → `wonTransition`:3917 → creates Project (`budget:
q.finalPrice`) + `findOrCreateCustomer`:3872 → `freezeStandardCostBaseline`:3902 (called internally)

**WORKING.** Idempotency-guarded (`q.wonProjectId` check), requires `status==='Accepted'`, a valid
acceptance record, and `q.approvedBy` set. Fully connected, code-confirmed.

## C. Project-to-Profit
Commitments: `approvePurchaseOrder`:4775 → `createCommitmentFromPO`:4877. Material:
`createMaterialIssue`:5910 (Dr 5000/Cr 1200). Labour: `recordLabourWages`:6088 (Dr 5100). Expenses:
`recordProjectExpense`:6143 (Dr 5200). Revenue: `draftCustomerInvoice`:3169 /
`draftCustomerInvoiceFromMilestone`:7158 (Cr 4000). Actual/Profitability: `projectPL`:3568 →
`coreProjectPL`:7964 → `projectFinancial360`:7974 → `companyProjectProfitability`:8253.

**WORKING.** Commitments are reduced by `createGRN` (`reduceCommitment` call). Every cost-posting
function tags GL lines with `projectId`; the profitability aggregators read those same lines (correctly
netting debit-credit for reversals). Fully connected, code-verified end to end.

## D. Source-to-Pay
`createMaterialRequirement`:4420 → `createMaterialRequest`:4483 → `createRFQ`:4517 (requires MR status
APPROVED) → `recordSupplierQuotation`:4529 → `createSupplierComparison`:4541 (requires ≥2 quotes) →
`approveSupplierComparison`:4554 → `createPurchaseOrder`:4650 (cross-validated via
`assertPoSourceDocumentsConsistent`:4578) → `createGRN`:5067 (GR/IR 2050, reduces commitment) →
`draftSupplierInvoiceFromPO`:5327 (clears 2050, three-way-matched) → `createPaymentRequest`:11610 →
`approvePaymentRequest`:11628 → `executePaymentRequest`:11668 → `postSupplierPayment`:3430 →
`applyClearing`:3366.

**WORKING**, with one structural note: `createPurchaseRequisition`:11194 is an **alternate, parallel**
entry point into `createPurchaseOrder`, not a stage the RFQ chain must pass through —
`assertPoSourceDocumentsConsistent` accepts a PR-only or an RFQ/Comparison-only lineage independently.
Not a break; PR and RFQ are two optional tracks into PO, not one linear chain.

## E. Plan-to-Produce
**[Demand — absent]** → `createBOM`:6347/`approveBOM`:6400 → `createProductionOrder`:6606 (requires
BOM Approved, same project) → `issueProductionMaterial`:6627 (loops BOM lines) →
`postProductionLabourCost`:6682 → `createJobCard`:6764/`startJobCard`:6776/`completeJobCard`:6786 →
`completeProductionOrder`:6713.

**PARTIAL.** Material and Labour issuance correctly derive from the BOM and post to GL/inventory.
Two real gaps: (1) no "Demand" function triggers a Production Order —
`materialReplenishmentReport`:12426 is a **read-only MRP-style suggestion report** feeding procurement
reorder decisions, disconnected from `createProductionOrder`, which is purely manual; (2) Job Card
completion and Production Order completion are **independent, uncoupled actions** — the code's own
comment at :6761-6762 states Job Cards are "purely operational... does not post to the GL," and nothing
in `completeJobCard` checks against `completeProductionOrder`.

## F. Stock-to-Site
`createGRN`:5067 (receipt to warehouse) → `createSiteMaterialRequisition`:11330 →
`approveSiteMaterialRequisition`:11350 → `issueToSite`:11377 (posts the Issue/SiteReceipt movement
pair, auto-generates the Delivery Challan) → `createSiteMaterialReceipt`:11417 (site-side confirmation,
flags discrepancies) → Site Stock: `getSiteStockLevel`:5012 → Consumption:
`createMaterialIssue({siteId})`.

**WORKING**, fully code-confirmed — `issueToSite` itself generates the Delivery Challan (no separate
step needed); the pooled site ledger is read by both `returnFromSite` and the site-scoped
`createMaterialIssue`.

## G. Site-to-Handover
`createSite`:11137 → `createInstallation`:6973/`postInstallationLabourCost`:6986 →
`createQCChecklist`:7031/`submitQCResult`:7048 → `createSnag`:7066→`assignSnag`→`resolveSnag`→
`verifySnag`→`closeSnag`:7097 → `handoverReadinessCheck`:7106 → `createHandover`:7121 →
`createBillingMilestone`:7140/`markMilestoneReady`:7150/`draftCustomerInvoiceFromMilestone`:7158.

**WORKING.** `handoverReadinessCheck` is a real, fail-closed gate: requires every Installation
`Completed`, at least one QC checklist all Passed (a fail-closed fix — "no QC record" is explicitly not
treated as passed), and zero open Critical snags. `createHandover` also blocks duplicate handovers.
Billing Milestone creation is a deliberate manual step, not auto-triggered — by design, per the code's
own comment.

## H. Order-to-Cash
`draftCustomerInvoice`:3169 (or milestone/service equivalents) → `submitDraft`:2537 →
`approveDraft`:2545 → `postDraft`:2574 → `postCustomerReceipt`:3377 → `applyClearing`:3366.

**WORKING**, fully code-confirmed, including SoD (creator cannot approve/post without CEO/Admin
override) and rollback-on-failure snapshotting around the GL/clearing pair.

## I. Record-to-Report
Any `postJournalEntry`:2297 caller → `allLines()` shared accessor → `generalLedger`:8184 /
`customerLedger`:8209 / `supplierLedger`:8217 → `periodTrialBalance`:11082 →
`companyProfitAndLoss`:8157 → `companyBalanceSheet`:8119.

**WORKING.** All four reports independently filter `allLines()` by account/date/type — exactly one GL
writer feeds every one; no parallel/shadow ledger exists. `companyBalanceSheet` self-checks `balanced`
and reports `unmappedAccounts`.

## J. Acquire-to-Retire
`createFixedAsset`:9647 (Purchased) → `capitalizeFixedAsset`:9667 (Dr 1400/Cr 1000 or 2000) →
`postAssetDepreciation`:9736 (Dr 5400/Cr 1450) → `transferFixedAsset`:9758 (blocks if Disposed) →
`disposeFixedAsset`:9808 (books gain/loss to 5500).

**WORKING**, fully code-confirmed with correct status-gating at every transition and rollback-on-failure
snapshots.

## K. Bank-to-Reconciliation
`createBankAccount`:10910 → `createBankImportBatch`:9990 (parses CSV, duplicate-detects by
`bankTxnId`) → `matchBankImportLine`:10067 or `postBankImportLine`:10127 (new GL entry via
`postJournalEntry`) → `reconcileBankImportLine`:10158.

**WORKING**, but with the same finding as `ARCH-2026-002-TRANSACTION-OWNERSHIP.md` row 32: a separate,
parallel legacy path (`importBankStatement`:10954 → `matchBankStatementLine`:10979 →
`bankReconciliationStatus`:11007 over `DB.bankStatementLines`) also exists and is also live-wired. Both
converge on the same GL, so neither chain itself is broken — but two front doors exist for the same
real-world event, which is the one real duplicate-ownership finding of this Phase 0.

## L. Service-to-Cash
`createServiceTicket`:7344 → `createServiceVisit`:7396 → `recordDiagnosis`:7419 →
`completeServiceVisit`:7438 (blocked while diagnosis is `PendingApproval`) →
`draftServiceInvoice`:7512 (requires ticket `Chargeable`, set via `setTicketClassification`; calls
`draftCustomerInvoice` — same engine as chain H) → `submitDraft`/`approveDraft`/`postDraft` →
`postCustomerReceipt`:3377.

**WORKING.** `serviceTicketCostBreakdown`:7501 ties Material (`issueServiceMaterial`:7468) and Labour
(`postServiceLabourCost`:7484) costs back to the ticket for margin visibility. One soft dependency:
billing requires a separate, manual `setTicketClassification` call — a warranty-classified ticket is
correctly blocked from billing ("Warranty work must not create customer AR").

## Summary

| Chain | Verdict |
|---|---|
| A. Lead-to-Quotation | **PARTIAL** — named "BOM/BOQ" step absent between Costing Version and Quotation |
| B. Quote-to-Project | WORKING |
| C. Project-to-Profit | WORKING |
| D. Source-to-Pay | WORKING (PR and RFQ are parallel entry paths into PO, not one track) |
| E. Plan-to-Produce | **PARTIAL** — no Demand trigger; Job Card completion doesn't drive Production Order completion |
| F. Stock-to-Site | WORKING |
| G. Site-to-Handover | WORKING |
| H. Order-to-Cash | WORKING |
| I. Record-to-Report | WORKING |
| J. Acquire-to-Retire | WORKING |
| K. Bank-to-Reconciliation | WORKING (two convergent front doors — see Transaction Ownership row 32) |
| L. Service-to-Cash | WORKING |

**10 of 12 chains are genuinely WORKING end-to-end with real code-level linkage.** The 2 PARTIAL chains
are each narrow, precisely-located gaps, not broad architectural failures — both are carried into
`ARCH-2026-002-OPEN-DECISIONS.md` (items 5 and 7) as questions for Wave 1/Wave 2 detailed design, not
silently resolved here.
