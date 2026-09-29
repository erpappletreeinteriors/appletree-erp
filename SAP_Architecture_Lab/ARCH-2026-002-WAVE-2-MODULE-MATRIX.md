# ARCH-2026-002 — Wave 2 Module Matrix

**Date:** 2026-09-22. Wave 2 Phase 0 deliverable, §4. Domains per the current `ARCH-2026-002-WAVE-PLAN.md`
Wave 2 grouping (unchanged, not re-invented): Procurement & Supplier Management, Inventory/Warehouse/
Logistics, Manufacturing, Job Work/Subcontracting, Site Execution & Delivery, Quality Management.
Classification taxonomy per this CR's §4: EXISTING / PARTIAL / ABSENT / BLOCKED / DUPLICATE /
CONFLICTING. No capability classified from menu presence alone — every row cites a real function or
test.

## 1. Procurement & Supplier Management

| Capability | Status | Evidence |
|---|---|---|
| Material Requirement → Material Request → RFQ → Supplier Quotation → Comparison → PO | EXISTING | `ARCH-2026-002-TRANSACTION-OWNERSHIP.md` rows 6-11 (unchanged since Phase 0); full chain WORKING per `ARCH-2026-002-PROCESS-TRACE.md` chain D |
| Purchase Requisition (parallel PO entry) | EXISTING | `createPurchaseRequisition` (domain.js:11194), safe `nextId()`/`nextDocNumber('PR')` numbering (11299/11309); PR raiser≠approver SoD enforced (`approvePurchaseRequisition`, 11328) |
| PO Amendment | **ABSENT — deliberate, disclosed** | domain.js:4849-4852, explicit comment: "PO AMENDMENT... is deliberately NOT built here — a materially different, larger capability with no existing precedent." Only cancel (pre-execution) and reject (pre-approval) exist |
| GRN, 3-way match | EXISTING | `createGRN`(5067), `checkThreeWayMatch`(5281) — WORKING per Process Trace chain D |
| Purchase Return | EXISTING | `createPurchaseReturn`(5454), safe numbering, posts via `postInventoryMovement()` (5470), full rollback-on-exception |
| Supplier Bill (PO and non-PO paths) | EXISTING | `draftSupplierInvoice`(3245)/`draftSupplierInvoiceFromPO`(5327), SOD-6 enforced |
| Payment Request → Payment → Clearing | EXISTING | SOD-1/2/5 all enforced (`ARCH-2026-002-SECURITY-BASELINE.md`, re-confirmed this pass) |
| TDS / GST on procurement | EXISTING | Reused from the single tax/GL engine, unchanged since Phase 0 |
| Commitment creation from PO | EXISTING | `createCommitmentFromPO`, reduced by GRN — WORKING per Process Trace chain C |
| **Cross-document SoD (PR raiser vs PO approver vs Payment maker/checker/executor)** | **PARTIAL — real gap, see Security Baseline** | Each document has its own creator≠approver control; no control ties the PR raiser's identity to PO approval or to Payment Request identity — see `ARCH-2026-002-WAVE-2-SECURITY-BASELINE.md` §1 |

## 2. Inventory / Warehouse / Logistics

| Capability | Status | Evidence |
|---|---|---|
| Stock (derived, never stored) | EXISTING | Confirmed no shadow balance field anywhere; `getStockLevel()` reduces over `DB.inventoryMovements` |
| Movement Ledger, Transfer, Adjustment | EXISTING | `createInventoryTransfer`(8626, safe numbering, rollback-on-exception), `createInventoryAdjustment`(8697→8719) |
| Material Issue / Return | EXISTING | Single-writer confirmed, project/site scope enforced |
| Purchase Return | EXISTING | (see Procurement row above — same transaction, Inventory-owned movement) |
| Damage report | **PARTIAL — ID-collision risk only, not a financial risk** | `id` still `.length+1` (domain.js:9321), but delegates entirely to `createInventoryAdjustment()` → the single writer; no shadow inventory effect |
| Stock Count | **PARTIAL — same ID-collision risk** | `id` still `.length+1` (9351); each variance line uses `createInventoryAdjustment()` → single writer, wrapped per-line in `withTransaction()` |
| Location/warehouse transfer | EXISTING | `createInventoryTransfer` is the real mechanism; `createLocation`(8737) is master-data only (a bin/shelf tag), no separate mutation function exists nor is one needed |
| Material Analysis, Replenishment report | EXISTING (read-only) | `materialReplenishmentReport()`(~12524) — real, working, explicitly disconnected from any writer (by design) |
| Warehouse as a data-scope dimension | **ABSENT, confirmed not silently added** | `hasScopeAccess()` supports Project/Site/Customer/Branch only, NOT Warehouse — re-confirmed this pass. See `ARCH-2026-002-WAVE-2-DECISIONS.md` item W2-3 |

## 3. Manufacturing

| Capability | Status | Evidence |
|---|---|---|
| Production Order lifecycle | EXISTING | `createProductionOrder`(6606) through `completeProductionOrder`(6738), `closeProductionOrder`(6675) |
| BOM (creator≠approver SoD) | EXISTING | `approveBOM`(6409), SoD enforced |
| Job Card | EXISTING | `createJobCard`/`startJobCard`/`completeJobCard`(6764-6795) — operational only, no GL, by design |
| Machine model | EXISTING, 4-state (richer than Phase 0's shorthand) | `MACHINE_STATUSES=['Available','InUse','Maintenance','Down']`(6743); no capacity/shift/maintenance-schedule fields |
| Production Schedule / Job Analysis / Job Cost Sheet / Product Costing / Labour Performance / Factory Dashboard | EXISTING, real (not placeholders) | All 6 are genuine query functions over live data (domain.js:6797-6850); `productCosting()` computes a real per-unit standard cost, using a **disclosed** flat 15% labour/overhead heuristic, not an approved allocation policy |
| Production Output / Scrap → Inventory | **ABSENT, deliberate** | `completeProductionOrder`'s own comment (6735-6736): "Finished-goods inventory/accounting is deliberately NOT posted here." Output/rejection are status/number fields only, no `postInventoryMovement()` call anywhere in production completion |
| Production labour-hours costing | **PARTIAL** | `postProductionLabourCost` takes a lump-sum amount, no hours/rate; Job Card `actualStart`/`actualEnd` duration is tracked but disconnected from labour-cost posting |
| Routing / Work Centre | **ABSENT — unchanged from Phase 0** | Confirmed still absent |
| Demand trigger into Production Order | **ABSENT — unchanged from Phase 0, minimum viable path identified** | See `ARCH-2026-002-WAVE-2-DESIGN.md` §Plan-to-Produce for the smallest legitimate trigger already in the data model (`DB.materialRequirements`, optionally BOM-tagged) |
| **SoD across the entire execution chain** | **MISSING — real, new finding this pass** | See `ARCH-2026-002-WAVE-2-SECURITY-BASELINE.md` §1 — one user, one role, can plan-and-run a Production Order start to finish with zero second-person control anywhere in the execution leg |

## 4. Job Work / Subcontracting

| Capability | Status | Evidence |
|---|---|---|
| Job Worker master, Job Work Order, dispatch, return, scrap, direct dispatch | EXISTING | Full chain re-verified this pass (`ARCH-2026-002-WAVE-2-TRANSACTION-OWNERSHIP.md`) |
| APOB gate for unregistered job workers | EXISTING | Re-confirmed live-tested control, unchanged |
| No-double-stock net-quantity math | EXISTING, re-verified | Net warehouse change = -(dispatched-returned), scrap/direct-dispatch correctly never re-enter warehouse — re-derived from actual movement-type/sign citations this pass, matches the existing regression assertion (`erp_phase39_manufacturing_jobwork_tests.js`, still 36/36) |
| Gate Pass | **ABSENT** | Zero references anywhere in the codebase |
| Transporter / Vehicle master | **ABSENT — free text only** | `transporterName`/`vehicleNo` are plain strings on documents, no master table, no validation |
| Job-worker processing charge | EXISTING (as an ordinary Supplier Bill) | Deliberately not separately modeled — an explicit design choice, not a gap |
| **SoD across dispatch→return→settlement** | **MISSING — real, new finding this pass** | Same 4-role set gates every step with no identity comparison; see Security Baseline §1 |

## 5. Site Execution & Delivery

| Capability | Status | Evidence |
|---|---|---|
| Full Project→Site→Material Requirement→Site Material→Delivery→Site Receipt→Site Stock→Consumption chain | EXISTING | WORKING per Process Trace chain F, re-confirmed |
| Installation, QC, Snag, Handover (fail-closed gate), Billing Milestone | EXISTING | WORKING per Process Trace chain G, re-confirmed |
| Site Material single ownership | EXISTING, re-verified this pass | Exhaustive grep confirms `issueToSite`/`createSiteMaterialReceipt`/`returnFromSite` are the sole writers; no `DB.siteStock` collection exists (fully derived); no competing Project-domain owner found |
| Delivery Challan | EXISTING | Real document type, safe numbering, auto-generated as a side effect of `issueToSite` |
| E-way Bill record | EXISTING (manual-entry tracking, self-disclosed as such) | `createEwayBillRecord`, not a live government API |
| Gate Pass | **ABSENT** | Zero references |
| Labour & Wages / Project Expense project scope | EXISTING, double-enforced | Route-level AND domain-level checks both call the same `isProjectManagerOf`/role-gate; SiteInCharge is categorically excluded from these two functions (a stronger control than scope-limiting) |
| **QC Checklist / Snag / Handover / CAPA internal ID pattern** | **PARTIAL — known, previously self-disclosed gap** | Doc numbers safe (`nextDocNumber()`); internal `id` still `.length+1` for these 4 collections specifically, unlike Installation/Billing Milestone/Delivery Challan which already use `nextId()` |

## 6. Quality Management

| Capability | Status | Evidence |
|---|---|---|
| QC Checklist lifecycle | EXISTING | `createQCChecklist`/`submitQCResult` |
| Inspection / NCR as a distinct entity | **ABSENT** | Confirmed — QC Checklist is the only quality-record type; no separate Inspection or NCR entity/status/workflow exists |
| CAPA full state machine | EXISTING, with a real effectiveness-before-closure gate | Owner≠verifier and verifier≠effectiveness-checker SoD both enforced; `closeCAPACase` hard-gates on `status==='EFFECTIVENESS'` AND `effectivenessResult==='Effective'` |
| CAPA auto-origination from Snag/QC-failure/Complaint | **ABSENT — deliberate** | `createCAPACase` is called from exactly one place (itself); comment confirms this is intentional ("a deliberate escalation, never auto-created"). `sourceComplaintId`/`sourceTicketId` are unvalidated free-text references only |
| QC checklist audit-log gap (Phase 0 LOW finding) | **CONFIRMED, still not fixed (correctly — Phase 0 rule)** | `createQCChecklist` has no `logAudit()` call; only `submitQCResult` does. Exact fix requirement documented in `ARCH-2026-002-WAVE-2-DESIGN.md`, not implemented here |
| **QC self-attestation (creator = approver, with no approve/review step at all)** | **MISSING — real, new finding this pass, HIGH relevance** | No `approveQC`/`reviewQC` function exists anywhere; `submitQCResult` never compares `actor.id` to the checklist's own creator/inspector field. This directly gates Handover readiness. See Security Baseline §1 |
| **CAPA closer vs effectiveness-checker** | **MISSING** | `closeCAPACase` checks status/result only, no identity comparison to `verifiedBy`/`effectivenessCheckedBy`/`owner` |

## Summary

| Status | Domains represented |
|---|---|
| Fully EXISTING core chains | All 6 domains' primary transaction chains are EXISTING and WORKING |
| Deliberate, disclosed ABSENT items | PO Amendment, Production Output→Inventory, Routing/Work Centre, Demand trigger, Gate Pass, Transporter/Vehicle master, Inspection/NCR, CAPA auto-origination, Warehouse scope dimension |
| Real NEW findings this pass (not previously documented) | 3 SoD-missing high-risk chains (Production Order execution, Job Work dispatch→settlement, QC self-attestation/CAPA closure) — see Security Baseline |
| DUPLICATE / CONFLICTING | **None found** — re-confirmed across all 6 domains this pass |
