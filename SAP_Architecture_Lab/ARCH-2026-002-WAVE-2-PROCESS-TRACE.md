# ARCH-2026-002 — Wave 2 End-to-End Process Trace

**Date:** 2026-09-22. Wave 2 Phase 0 deliverable, §13. Traces the 6 named chains: START → document →
validation → approval → accounting → inventory → project cost → audit → downstream document → final
state. Classification: WORKING / PARTIAL / BROKEN / ABSENT / DEFERRED.

## 1. Source-to-Pay

`createMaterialRequirement`→`createMaterialRequest`→`createRFQ`→`recordSupplierQuotation`→
`createSupplierComparison`→`approveSupplierComparison`→`createPurchaseOrder`→`approvePurchaseOrder`→
`createGRN`(3-way matched)→`draftSupplierInvoiceFromPO`→`createPaymentRequest`→`approvePaymentRequest`→
`executePaymentRequest`→`postSupplierPayment`→`applyClearing`.

**WORKING**, re-confirmed unchanged from `ARCH-2026-002-PROCESS-TRACE.md` chain D. Purchase Requisition
remains a parallel, optional entry path into PO (not a required stage). Every accounting step posts
through the single `postJournalEntry()`; every GRN posts through the single `postInventoryMovement()`.
Audit: every step calls `logAudit()`. Downstream: Bank Reconciliation (Wave 1-consolidated engine)
correctly reconciles the resulting Supplier Payment. **One real gap re-confirmed this pass**: no
cross-document SoD ties the PR raiser to PO approval or to the Payment Request identity — see Security
Baseline §1.

## 2. Stock-to-Site

`createGRN`(receipt)→`createSiteMaterialRequisition`→`approveSiteMaterialRequisition`→`issueToSite`
(auto-generates Delivery Challan)→`createSiteMaterialReceipt`→site stock (derived)→
`createMaterialIssue({siteId})` (consumption).

**WORKING**, re-confirmed unchanged from Process Trace chain F. Site Material single-ownership
re-verified this pass (no competing writer found anywhere).

## 3. Site-to-Handover

`createSite`→`createInstallation`/`postInstallationLabourCost`→`createQCChecklist`/`submitQCResult`→
`createSnag`→...→`closeSnag`→`handoverReadinessCheck`(fail-closed: Installation Completed + ≥1 QC
checklist all-Passed + zero open Critical snags)→`createHandover`→`createBillingMilestone`→
`markMilestoneReady`→`draftCustomerInvoiceFromMilestone`.

**WORKING**, re-confirmed unchanged from Process Trace chain G. **New finding this pass, directly
relevant to this chain's integrity**: the QC step that gates Handover has no approve/review step at all
— the same person who creates a QC checklist can unilaterally submit its own Passed result, with no
second-person check. The chain's plumbing is WORKING; its **control integrity** at the QC gate is weaker
than the "fail-closed" framing implies — see Security Baseline §1 and §6.

## 4. Plan-to-Produce

**[Demand — absent]**→`createBOM`/`approveBOM`(creator≠approver SoD)→`createProductionOrder`(requires
BOM Approved, same project)→`issueProductionMaterial`(loops BOM lines)→`postProductionLabourCost`→
`createJobCard`/`startJobCard`/`completeJobCard`→`completeProductionOrder`.

**PARTIAL**, re-confirmed and DEEPENED this pass:
- No Demand trigger exists (unchanged finding). **Minimum viable trigger identified this pass**:
  `DB.materialRequirements` — already a real, statused document, optionally BOM-tagged with quota
  enforcement against the BOM's approved+wastage allowance. A human could plausibly convert an
  APPROVED, BOM-tagged Material Requirement into a Production Order suggestion today with a thin new
  mapping layer — this is the smallest legitimate extension point, not a proposal to build MRP.
  `materialReplenishmentReport()` (read-only, already computes Current Stock − Open Requirement − Open
  PO = Suggested Purchase Qty) remains disconnected from Production Order creation by design.
- **New finding this pass**: Production Output/Scrap have **no inventory effect at all** —
  `completeProductionOrder`'s own comment confirms Finished-Goods inventory is deliberately not posted.
  Output/rejection are status/number fields only. This means the chain's END STATE never actually
  updates real stock — a materially incomplete "Plan-to-Produce" outcome from an inventory-integrity
  standpoint, though explicitly scoped out by a prior, disclosed decision, not a hidden defect.
- **New finding this pass**: Job Card completion still does not gate Production Order completion
  (unchanged from Phase 0); additionally, no SoD exists across the entire execution leg (plan vs.
  execute) — see Security Baseline §1.
- Job Cost Sheet / Product Costing remain real, WORKING cost rollups regardless of the above gaps.

## 5. Job-Work-to-Settlement (NEW this pass)

`createJobWorker`(master)→ Job Work Order created implicitly by `dispatchToJobWorker`→APOB gate (for
unregistered workers)→[job-worker processing — modeled as an ordinary Supplier Bill, not a separate
step]→`returnFromJobWorker`/`recordJobWorkScrap`/`directDispatchFromJobWorker`→(optional)
`draftSupplierInvoice[FromPO]` tagged with `jobWorkOrderId` for the processing charge.

**WORKING** for the inventory/dispatch/return/scrap/direct-dispatch leg — re-verified this pass with
exact movement-sign math: dispatch of Q nets `Issue(-Q warehouse)+JobWorkReceipt(+Q job-worker-held)`;
return of R nets `JobWorkReturn(-R)+Receipt(+R warehouse)`; scrap of S and direct-dispatch of D correctly
never re-enter the warehouse. Net warehouse change = `-(Q-R)`, matching the existing regression
assertion (`erp_phase39_manufacturing_jobwork_tests.js`, still 36/36, unchanged). **Settlement leg
(booking the job-work-charges Supplier Bill) is WORKING as a transaction but carries no linkage-level
SoD** — `draftSupplierInvoice[FromPO]`'s `jobWorkOrderId` tag is for project-consistency only, never
checked against `jwo.createdBy`. **No Gate Pass or Transporter/Vehicle master exists** (confirmed
absent, not partially built) — `transporterName`/`vehicleNo` are free-text fields only.

## 6. Quality-to-CAPA (NEW this pass)

`createQCChecklist`/`submitQCResult` (optional, unvalidated `sourceComplaintId`/`sourceTicketId`
reference) → **[no programmatic link]** → `createCAPACase`(standalone only, requires an explicit
`trigger` reason) → `recordCAPAAnalysis`→`recordCAPAAction`→`recordCAPAVerification`(owner≠verifier
SoD)→`recordCAPAEffectivenessCheck`(verifier≠effectiveness-checker SoD)→`closeCAPACase`(hard-gated on
`status==='EFFECTIVENESS'` AND `effectivenessResult==='Effective'`).

**WORKING for the CAPA state machine itself** — every prerequisite step is structurally enforced (you
cannot skip a step; the status guard makes it impossible), and 2 of the 3 realistic SoD pairs within
CAPA are real, enforced controls. **PARTIAL for the chain's origin**: a CAPA never auto-originates from
a Snag, QC failure, or Service Complaint — it is always a deliberate, standalone escalation (confirmed
intentional design, not a gap). **New finding this pass**: the effectiveness-checker can close their own
CAPA case unchallenged — `closeCAPACase` checks status/result only, no identity comparison to
`verifiedBy`/`effectivenessCheckedBy`/`owner`. No Inspection/NCR entity exists to trace a "Quality" side
separate from the QC Checklist.

## Summary

| Chain | Verdict |
|---|---|
| 1. Source-to-Pay | WORKING (1 cross-document SoD gap disclosed) |
| 2. Stock-to-Site | WORKING |
| 3. Site-to-Handover | WORKING (1 QC self-attestation control gap disclosed) |
| 4. Plan-to-Produce | **PARTIAL** — no Demand trigger; Production Output has zero inventory effect; no execution-leg SoD |
| 5. Job-Work-to-Settlement | WORKING (1 settlement-linkage SoD gap disclosed; Gate Pass/Transporter master confirmed absent) |
| 6. Quality-to-CAPA | **PARTIAL** — state machine itself WORKING, but no auto-origination from Snag/QC/Complaint, and CAPA closure lacks a final identity check |

No chain is BROKEN or fully ABSENT. All gaps found are either previously disclosed (re-confirmed, not
newly discovered) or newly surfaced SoD-coverage gaps — none require a second engine or a redesign to
close, and none are fixed in this Phase 0 pass per this CR's own rule.
