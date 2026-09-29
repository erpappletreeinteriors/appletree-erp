# ARCH-2026-002 — Wave 2 Transaction Ownership Matrix

**Date:** 2026-09-22. Wave 2 Phase 0 deliverable, §5. Extends (does not duplicate)
`ARCH-2026-002-TRANSACTION-OWNERSHIP.md`, which already covers Material Requirement, Material Request,
RFQ, Supplier Quotation, Comparison, Purchase Order, GRN, Supplier Bill, Payment Request, Supplier
Payment, Material Issue, Material Return, Site Receipt, Site Consumption, Production Order, Job Card,
Job Work Dispatch, Job Work Return, QC, Snag, CAPA — all re-confirmed unchanged this pass, single-owner.
This document adds the transaction types this CR's own §5 names that were NOT yet in that matrix.

| Transaction | Authoritative Module | Creating Function | Approve/Execute | Accounting Impact | Inventory Impact | Project-Cost Impact | Audit | Approval Requirement | Scope Requirement | Downstream Consumers | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Purchase Requisition | Procurement | `createPurchaseRequisition`(11194) | `approvePurchaseRequisition`(11328), creator≠approver SoD | None directly | None directly | None directly | Yes | Role-tier + SoD | Project-open gate | Feeds `createPurchaseOrder` as an alternate entry path to RFQ/Comparison | EXISTING |
| PO Amendment | — | **Does not exist** | — | — | — | — | — | — | — | — | **ABSENT, deliberate** (domain.js:4849-4852) |
| Purchase Return | Procurement / Inventory | `createPurchaseReturn`(5454) | Self-executing | GL via `postJournalEntry` | `postInventoryMovement(type:'Return')`(5470) | Via project tag on GL lines | Yes | Role-gated | Project-open gate | Finance reads for AP adjustment | EXISTING |
| Site Material | Site Execution / Inventory (dual-role, not a conflict) | `createSiteMaterialRequisition`(11330)→`issueToSite`(11377)→`createSiteMaterialReceipt`(11417) | `approveSiteMaterialRequisition`(11350), creator≠approver SoD | None directly (consumption triggers GL via Material Issue) | `postInventoryMovement` (Issue/SiteReceipt pair) | Via projectId tag | Yes | Value-tier: SiteInCharge capped at petty limit; above that Purchase/FinanceManager/CEO/Admin | Project + Site scope | Consumption (`createMaterialIssue({siteId})`) | EXISTING, single-owner re-confirmed |
| Stock Movement / Transfer | Inventory | `createInventoryTransfer`(8626) | Self-executing | None directly | `postInventoryMovement` (TransferOut+TransferIn pair, 8630/8632) | N/A | Yes | Role-gated | N/A | Reports | EXISTING |
| Adjustment | Inventory | `createInventoryAdjustment`(8697→8719) | Self-executing, reason mandatory | None directly (valuation impact) | `postInventoryMovement(type:'Adjustment')` | N/A | Yes | Role-gated (no silent override) | N/A | Damage, Stock Count both delegate here | EXISTING |
| Damage report | Inventory | `createDamageReport`(9321-ish) | Delegates to Adjustment | Via Adjustment | Via `createInventoryAdjustment()` → single writer | N/A | Yes | Role-gated | N/A | — | EXISTING (ID-collision risk only, `.length+1`) |
| Stock Count | Inventory | `createStockCount`(9351-ish) | Variance lines delegate to Adjustment, per-line `withTransaction()` | Via Adjustment | Via `createInventoryAdjustment()` → single writer | N/A | Yes | Role-gated | N/A | — | EXISTING (ID-collision risk only, `.length+1`) |
| Location movement | Inventory | **No separate mutation function** — `createLocation`(8737) is master-data only; movement IS `createInventoryTransfer` | — | — | — | — | — | — | — | — | EXISTING (Location = master; movement = Transfer, not a separate transaction type) |
| Production Schedule | Manufacturing | **Read-only report** — `productionSchedule()`(6797) | N/A | N/A | N/A | N/A | N/A (read) | N/A | N/A | — | EXISTING (report, not a transaction) |
| Production Output | Manufacturing | `completeProductionOrder`(6713) sets `actualQty`/`acceptedQty` | Self-executing (status only) | **None — deliberate, disclosed** (6735-6736) | **None — no `postInventoryMovement()` call** | N/A | Yes (status change) | Role-gated only, no identity check | Project-open gate | `jobCostSheet` reads actual qty | **PARTIAL — status-only, no real FG inventory effect** |
| Production Scrap | Manufacturing | **No dedicated transaction type** — `rejectedQty` is a field on `completeProductionOrder`, not its own record | — | None | None | N/A | Via the order's own status change | — | — | — | **ABSENT as a distinct transaction** (contrast with Job Work Scrap, which IS a real, GL-integrated type) |
| Machine activity | Manufacturing | `setMachineStatus`(6751) + auto-transitions on Job Card start/complete | Self-executing | None | None | None | Yes | Role-gated | N/A | `factoryDashboard` utilization % | EXISTING, minimal (no capacity/shift model) |
| Labour activity (production) | Manufacturing | `postProductionLabourCost`(6682) — lump-sum only, no hours/rate | Self-executing | GL (Dr 5100/Cr 1000, tagged CC-FACTORY) | None | Via CC-FACTORY tag | Yes | Role-gated | Role-gated only | `jobCostSheet` sums labour entries | EXISTING, cost-only (no hours integration) |
| Production costing | Manufacturing | `jobCostSheet(productionOrderId)`(6819), `productCosting(bomId)`(6831) | N/A (read-only) | N/A | N/A | N/A | N/A | N/A | N/A | — | EXISTING, real rollup (disclosed 15% labour/overhead heuristic in `productCosting`, not an approved policy) |
| Job Worker (master) | Job Work | `createJobWorker`(11868) | N/A (master data) | N/A | N/A | N/A | Yes | Role-gated | N/A | Dispatch/Return/Scrap all reference it | EXISTING (ID-collision risk, `.length+1`) |
| APOB | Job Work | `createAPOBDeclaration`(12113) | N/A | None | None | None | Yes | Role-gated | Attached to jobWorkerId, not project | Gates `directDispatchFromJobWorker` | EXISTING (ID-collision risk, `.length+1`) |
| Subcontracting consumption | Job Work | Implicit — no return means consumed; tracked via `getJobWorkerStockLevel` balance | — | — | — | — | — | — | — | — | EXISTING (derived, not a separate transaction) |
| Delivery | Site Execution | `createDelivery`(~6962) | Self-executing | Zero GL value by design | Tracking-only, zero inventory value posted by design | N/A | Yes | Role-gated | Project scope | Handover readiness check | EXISTING (ID-collision risk, `.length+1`) |
| Installation | Site Execution | `createInstallation`(6973) | `postInstallationLabourCost`(6986) | GL for labour only | None | Via CC-INSTALLATION tag | Yes | Role-gated | Project scope | Handover readiness gate | EXISTING, safe `nextId()` |
| Billing Milestone | Site Execution / Finance | `createBillingMilestone`(7140) | `markMilestoneReady`(7150)→`draftCustomerInvoiceFromMilestone`(7158) | Via the shared invoice engine | None | Via revenue recognition tag | Yes | Manual trigger by design (not auto from Handover) | Project scope | Finance's Customer Invoice chain | EXISTING, safe `nextId()` |
| Inspection / NCR | Quality | **Does not exist as a distinct entity** | — | — | — | — | — | — | — | — | **ABSENT** — QC Checklist is the only quality-record type |

## Critical rule compliance

**No transaction in this table acquired a second authoritative owner.** Every row above traces to
exactly one creating function and, where applicable, exactly one approve/execute function. The 3 items
marked ABSENT (PO Amendment, Production Scrap as a distinct type, Inspection/NCR) are genuinely absent,
not duplicated or conflicting — there is nothing to have a second owner.
