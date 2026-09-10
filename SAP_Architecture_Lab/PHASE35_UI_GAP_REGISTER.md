# PHASE 35 — UI GAP REGISTER
## Backend Capability vs. Accountant-Accessible UI

Verified directly against `client_secure/index.html` (checksum confirmed unchanged since the Phase 32 checkpoint before this phase started) and the `NAV_GROUPS`/`renderTab()` dispatch table — not assumed from any prior report.

## Finance

| Capability | UI Before Phase 35 | Phase 35 Action |
|---|---|---|
| Journal Entry, GL, Trial Balance, AR, AP, Supplier Payment, Customer Receipt, Clearing, Bank, Bank/Cash Transfer, Fixed Assets, Reconciliation | Existing screens (Document Workflow, Journal Register, Trial Balance, AR/AP Ageing, Supplier Payment, Customer Receipt, Bank Reconciliation, Fixed Assets, Reconciliation) | **Already present — verified, not rebuilt.** |
| TDS | No dedicated screen — the Phase 33 TDS engine only ran as an optional parameter inside Supplier Payment, with no UI to view rates/thresholds or the deduction history | **BUILT**: TDS rates/thresholds table inside SOP Configuration; TDS Deductions are visible via the existing Document Viewer (the posted Journal itself) |
| GST / Place of Supply | No screen | **BUILT**: Company GST Registration section in SOP Configuration |
| Petty Cash | No screen at all (backend fully built in Phase 33, zero UI) | **BUILT**: full Petty Cash screen (floats, vouchers, reconciliation, replenish) |
| Payment Approval / Maker-Checker | No screen at all (backend fully built in Phase 33, zero UI) | **BUILT**: Payment Requests screen (raise/approve/reject/execute) |
| SOP Compliance Dashboard | No screen at all (backend fully built in Phase 33/34, zero UI) | **BUILT** |

## Procurement

| Capability | UI Before Phase 35 | Phase 35 Action |
|---|---|---|
| Purchase Order, PO approval, Vendor, Vendor Rating, Purchase Intelligence, Purchase/Vendor Report | Existing screens | **Already present.** |
| Purchase Requisition + PR approval | No screen at all (backend fully built in Phase 33, zero UI) | **BUILT** |

## Inventory

| Capability | UI Before Phase 35 | Phase 35 Action |
|---|---|---|
| GRN, Material Requirement, Material Issue, Material Return, Damage, Stock Count, Stock Report, Locations, Stock by Location | Existing screens | **Already present.** |
| Weighment (GRN variance gate) | GRN screen exists but has no weighment input fields — the backend gate (Phase 33) is fully functional via the API but unreachable from the UI | **NOT built this phase** — see Remaining Gaps below; disclosed, not silently skipped |

## Site

| Capability | UI Before Phase 35 | Phase 35 Action |
|---|---|---|
| Sites master, MRS, MRS approval, Delivery Challan, Site Receipt, Site Stock, Site Consumption, Site Reconciliation | No screen at all (backend fully built in Phase 33, zero UI) | **BUILT**: one consolidated Site Material screen covering the full chain |
| Gate Pass | Delivery Challan already captures transporter name + vehicle number (the SOP's own Gate Pass fields) — no SEPARATE Gate Pass document type exists in the backend, so none was invented for the UI | **N/A — already satisfied by the Delivery Challan fields**, not a missing screen |

## Job Work

| Capability | UI Before Phase 35 | Phase 35 Action |
|---|---|---|
| Job Worker Master, Job Work Order, Dispatch, Return, Scrap, Direct Dispatch, APOB, Job Work Aging, Ship-to GSTIN, E-way Bill | No screen at all (backend fully built in Phase 34, zero UI) | **BUILT**: Job Work screen (master + dispatch + orders + return/scrap/direct-dispatch actions + aging) and a separate APOB & E-way Bill screen |

## Project

| Capability | UI Before Phase 35 | Phase 35 Action |
|---|---|---|
| Project, BOM, Material Requirement, Material Consumption, Labour, Project Expenses, Timesheet, Tasks, Risk, Project Cost, Project P&L | Existing screens | **Already present.** |
| BOQ/BOM Variance | No screen at all (backend fully built in Phase 34, zero UI) | **BUILT**: BOQ Variance report inside the new Compliance Reports screen |

## Factory

| Capability | UI Before Phase 35 | Phase 35 Action |
|---|---|---|
| Factory Dashboard, Machines, Job Cards, Production Schedule, Job Analysis, Job Cost, Product Costing, Labour Performance | Existing screens | **Already present — untouched by Phases 33/34, no gap.** |

## Reports

| Capability | UI Before Phase 35 | Phase 35 Action |
|---|---|---|
| Financial reports, Project profitability, Inventory reports, Procurement reports, Vendor reports, Reconciliation reports | Existing screens | **Already present.** |
| SOP reports (ITC Reversal, Seller Cumulative/194Q, Cash Control Exceptions) | No screen | **ITC Reversal BUILT** (Compliance Reports screen). Seller Cumulative and Cash Control Exceptions reports exist as APIs but were **NOT** given dedicated screens this phase — see Remaining Gaps |
| Compliance dashboard | No screen | **BUILT** |

## Remaining UI Gaps (disclosed, not silently built or ignored)

1. **GRN Weighment fields** — the backend variance gate (SOP §1/§8) works correctly via the API (proven in Phase 33's own test suite) but the existing GRN screen has no input fields for `weighmentQtyAtPurchase`/`weighmentQtyAtFactoryGate`. A Purchase user today can create a GRN through the UI, but cannot trigger or see the weighment check without using the API directly.
2. **Seller Cumulative (₹50L / Section 194Q) report** — no dedicated screen; visible only via a direct API call.
3. **Cash Control Exceptions report** — no dedicated screen; visible only via a direct API call.
4. **Payment Approval Matrix editing** — the matrix is viewable in SOP Configuration but not editable from the UI (the SOP itself calls it unfinalized — this was a deliberate choice not to build a UI encouraging premature editing of an admittedly-illustrative table; it remains editable via a direct, Admin-audited API call if Finance genuinely wants to adjust the illustrative tiers before Board approval).
5. **Sequential/multi-line Job Work orders in the UI** — the backend supports a Job Work Order with multiple material lines; the UI form only supports dispatching one material line at a time (return/scrap/direct-dispatch UI actions likewise assume `lineIndex:0`). A multi-line order can still be created via a direct API call; the UI is scoped to the common single-line case.

None of these block the core workflows tested in this phase's browser walkthrough — each is a real, disclosed, bounded gap, not a hidden one.
