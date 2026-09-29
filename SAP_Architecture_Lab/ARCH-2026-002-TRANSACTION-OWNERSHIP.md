# ARCH-2026-002 — Transaction Ownership Matrix

**Date:** 2026-09-22. Phase 0 deliverable, §8. Evidence method: every collection's `DB.<collection>.push(`
site was grepped to confirm a single writer (or to name every writer where more than one exists), and
every creating function was confirmed wired to a live `server.js` route, not dead code. All line
numbers are from actual `server/domain.js` reads, not inference from naming.

| # | Transaction | Authoritative Module | Creating Function(s) | Approve/Execute Function(s) | Other Domains That Reference (not own) It | Duplicate/Conflict? | Status |
|---|---|---|---|---|---|---|---|
| 1 | Lead | Sales & Customer Management | `createLead` :3604 | `changeLeadStatus` :3631 | Estimation & Costing reads it for `createEstimationRequest`; Project reads `salesOwnerId`/`leadId` | No | EXISTING |
| 2 | Estimation Request | Estimation & Costing | `createEstimationRequest` :3640 | `setEstimationStatus` :3653 | Sales references `leadId`; Quotation references `estimationRequestId` | No | EXISTING |
| 3 | Costing Version | Estimation & Costing | `createCostingVersion` :3663 | Implicitly locked via `freezeStandardCostBaseline` :3902 at project Won | Quotation consumes `costingVersionId` | No | EXISTING |
| 4 | Quotation | Sales & Customer Management | `createQuotation` :3725, `reviseQuotation` :3819 | `submitQuotation` :3779, `approveQuotationDiscount` :3790 | Estimation & Costing supplies `costingVersionId`; Project consumes it in `wonTransition` | No | EXISTING |
| 5 | Project | Project & Contract Management | `wonTransition` :3917 (normal path, `DB.projects.push` :3943) | N/A — status flows via other functions | Administration has a **second, deliberately-gated** entry point: `createProjectMaster` :10442, requires mandatory `migrationReason`, sets `isMigrationRecord:true`, error text itself says "use the quotation Won-transition instead" for ordinary projects | Two push sites exist, but the second is an explicitly-guarded, audit-logged migration/admin path — **not an accidental duplicate** | EXISTING |
| 6 | Material Requirement | Project & Contract Management | `createMaterialRequirement` :4420 | `submitMaterialRequirement` :4466, `approveMaterialRequirement` :4473 | Procurement consumes via `createMaterialRequest({requirementIds})`, never writes back | No | EXISTING |
| 7 | Material Request | Procurement & Supplier Management | `createMaterialRequest` :4483 | `submitMaterialRequest` :4493, `approveMaterialRequest` :4500, `rejectMaterialRequest` :4509 | Project supplies `requirementIds` as input only | No | EXISTING |
| 8 | RFQ | Procurement & Supplier Management | `createRFQ` :4517 | None (feeds Supplier Quotation/Comparison) | — | No | EXISTING |
| 9 | Supplier Quotation | Procurement & Supplier Management | `recordSupplierQuotation` :4529 | None (pure capture) | — | No | EXISTING |
| 10 | Comparison | Procurement & Supplier Management | `createSupplierComparison` :4541 | `approveSupplierComparison` :4554 | — | No | EXISTING |
| 11 | Purchase Order | Procurement & Supplier Management | `createPurchaseOrder` :4650 | `submitPurchaseOrder` :4756, `approvePurchaseOrder` :4775, `rejectPurchaseOrder` :4838 | Inventory and Finance read PO status only | No | EXISTING |
| 12 | GRN | Procurement & Supplier Management | `createGRN` :5067 (create+post combined, calls `postInventoryMovement` inline) | Self-executing | Inventory consumes the movement; Finance reads it for 3-way match | No | EXISTING |
| 13 | Supplier Bill | Finance & Accounting | `draftSupplierInvoice` :3245 (non-PO/services path), `draftSupplierInvoiceFromPO` :5327 (PO/GRN 3-way-match path) | `submitDraft`/`approveDraft`/`postDraft` :2537/2545/2574 (shared engine) | Procurement supplies PO/GRN linkage | Two creating functions, but deliberately segmented — `draftSupplierInvoice` explicitly rejects goods-category vendors via `vendorRequiresThreeWayMatch()`, forcing them onto the PO path — **not an accidental conflict**, same pattern as row 5 | EXISTING |
| 14 | Payment Request | Treasury & Cash Management | `createPaymentRequest` :11610 | `approvePaymentRequest` :11628, `rejectPaymentRequest` :11639, `executePaymentRequest` :11668 (internally calls `postSupplierPayment`, its own comment states "no second posting path") | Finance owns the actual GL posting reached through it | No | EXISTING |
| 15 | Supplier Payment | Finance & Accounting | `postSupplierPayment` :3430 (single AP-payment writer) | Self-executing; maker-checker enforced upstream by Payment Request | Treasury drives it via the Payment Request workflow | No | EXISTING |
| 16 | Customer Invoice | Finance & Accounting | `draftCustomerInvoice` :3169 (also reached via `draftCustomerInvoiceFromMilestone` :7158, which "extends, does not replace" it per its own comment) | `submitDraft`/`approveDraft`/`postDraft` | Project triggers billing via milestones, which call the same authoritative function | No | EXISTING |
| 17 | Customer Receipt | Finance & Accounting | `postCustomerReceipt` :3377 (single writer, applies clearing via `applyClearing`) | Self-executing, role-gated by `assertCanClearReceipt` | — | No | EXISTING |
| 18 | Customer Advance | Finance & Accounting | `draftCustomerAdvance` :3961 ("reuses the existing Phase 5 draft lifecycle") | `submitDraft`/`approveDraft`/`postDraft` | Project sets requirement via `setProjectAdvanceRequirement`, does not create the advance itself | No | EXISTING |
| 19 | Material Issue | Inventory / Warehouse / Logistics | `createMaterialIssue` :5910 (warehouse branch) | Self-executing (`postInventoryMovement` called inline) | Project supplies `projectId`/`materialRequirementId`; role check also allows PM/Site-in-charge | No | EXISTING |
| 20 | Material Return | Site Execution & Delivery | `returnFromSite` :11448 | Self-executing | Inventory receives the reversing movement | No | EXISTING |
| 21 | Site Receipt | Site Execution & Delivery | `createSiteMaterialReceipt` :11417 (site-side confirmation vs. `issueToSite`'s delivery challan, flags discrepancies per SOP §8 step 4) | Self-executing | — | No | EXISTING |
| 22 | Site Consumption | Site Execution & Delivery | **Same function as Material Issue** — `createMaterialIssue({siteId})`, internally posts movement type `'SiteConsumption'` | Self-executing | Inventory owns the underlying `postInventoryMovement` primitive | No — intentional single-function dual-mode design | EXISTING |
| 23 | Production Order | Manufacturing | `createProductionOrder` :6606 | `issueProductionMaterial` :6627, `completeProductionOrder` :6713, hold/resume/cancel/close :6653-6675 | Project references `bomId`; Quality references rejected-qty on completion | No | EXISTING |
| 24 | Job Card | Manufacturing | `createJobCard` :6764 | `startJobCard` :6776, `completeJobCard` :6786 | — | No | EXISTING |
| 25 | Job Work Dispatch | Job Work / Subcontracting | `dispatchToJobWorker` :11792 | Self-executing (paired Issue/JobWorkReceipt movements) | Procurement supplies `jobWorkOrderId` linkage on Supplier Bill | No | EXISTING |
| 26 | Job Work Return | Job Work / Subcontracting | `returnFromJobWorker` :11844 (+ `recordJobWorkScrap` :11880, `directDispatchFromJobWorker` :11948 — related, distinct movement types) | Self-executing | — | No | EXISTING |
| 27 | QC (Checklist) | Quality Management | `createQCChecklist` :7031 | `submitQCResult` :7048 | Manufacturing/Site Execution reference `installationId`/`productionOrderId` | No | EXISTING |
| 28 | Snag | Quality Management | `createSnag` :7066 | `assignSnag` :7074, `resolveSnag` :7081, `verifySnag` :7088, `closeSnag` :7097 | Site Execution's `handoverReadinessCheck` reads open snags | No | EXISTING |
| 29 | CAPA | Quality Management | `createCAPACase` :7690 | `recordCAPAAnalysis` :7701, `recordCAPAAction` :7708, `recordCAPAVerification` :7717, `recordCAPAEffectivenessCheck` :7729, `closeCAPACase` :7739 | Service & After-Sales supplies `sourceComplaintId`/`sourceTicketId` | No | EXISTING |
| 30 | Fixed Asset | Asset Management | `createFixedAsset` :9647 | `capitalizeFixedAsset` :9667, `postAssetDepreciation` :9736, `transferFixedAsset` :9758, `disposeFixedAsset` :9808 | Finance supplies `sourceInvoiceEntryId` | No | EXISTING |
| 31 | Bank Transfer | Treasury & Cash Management | `createBankTransfer` :10932 | Self-executing, role-gated `assertCanTransferBankFunds` | — | No | EXISTING |
| 32 | Bank Reconciliation | Treasury & Cash Management | **Two parallel, independently-wired, both-live systems** — (a) legacy `importBankStatement` :10954 → `matchBankStatementLine` :10979 / `bankReconciliationStatus` :11007 over `DB.bankStatementLines`; (b) newer `createBankImportBatch` :9990 → `matchBankImportLine` :10067 / `postBankImportLine` :10127 / `reconcileBankImportLine` :10158 over `DB.bankImportLines` | Both self-execute their own match/reconcile step; only `postBankImportLine` posts to GL (still via the single `postJournalEntry`) | — | **YES — the one real duplicate-ownership conflict found in this audit.** Both `/api/bank-statement/*` and `/api/bank-import/*` routes are live; both collections are first-class in `freshDB()`; neither supersedes or migrates data from the other | EXISTING (both, in parallel — this is itself the defect) |
| 33 | Service Ticket | Service & After-Sales | `createServiceTicket` :7344 | `assignServiceTicket` :7365, `escalateServiceTicket` :7378, `setTicketClassification` :7386, `closeServiceTicket` :7766, `rejectServiceTicket` :7875 | Quality's CAPA references `sourceTicketId` | No | EXISTING |
| 34 | Service Visit | Service & After-Sales | `createServiceVisit` :7396 | `startServiceVisit` :7409, `completeServiceVisit` :7438, `cancelServiceVisit` :7454, `approveDiagnosis` :7821 | Inventory posts material via `issueServiceMaterial` referencing `visitId` | No | EXISTING |
| 35 | AMC | Service & After-Sales | `createAMCContract` :7523 | `activateAMCContract` :7553, `cancelAMCContract` :7562, `renewAMCContract` :7578 | Finance bills against it via `draftAMCBillingInvoice` | No | EXISTING |
| — | Service Billing | Finance & Accounting | `draftServiceInvoice` :7512 (calls `draftCustomerInvoice` internally), `draftAMCBillingInvoice` :7618 (same pattern) | `submitDraft`/`approveDraft`/`postDraft` | Service triggers it from ticket/AMC context, does not post independently | No | EXISTING |

## Findings

**Single-writer architecture holds for 34 of 35 transaction types.** Every collection's push site traces
to exactly one function, and every GL/inventory side-effect traces back to the single `postJournalEntry()`
(sole `DB.journalEntries.push` at :2448) and single `postInventoryMovement()` (sole
`DB.inventoryMovements.push` at :5009). Two apparent "second creators" — Project (row 5) and Supplier
Bill (row 13) — are deliberately gated, self-documenting dual paths, not accidental conflicts.

**The one real duplicate-ownership conflict: Bank Reconciliation (row 32).** Two fully independent,
live-wired subsystems match bank lines to GL entries: the legacy generic-CSV path over
`DB.bankStatementLines`, and the newer ICICI-format-aware path over `DB.bankImportLines` (richer
duplicate-detection and return-matching). Both are seeded, both have live routes, neither supersedes or
migrates the other. **This is reported as a finding for Wave 3 (Treasury) scoping — not fixed here per
this Phase 0's own "audit only, do not implement" rule.** See `ARCH-2026-002-OPEN-DECISIONS.md` item 6.
