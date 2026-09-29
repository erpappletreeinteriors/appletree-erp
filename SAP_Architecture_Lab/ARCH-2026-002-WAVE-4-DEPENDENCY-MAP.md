# ARCH-2026-002 — Wave 4 Dependency Map

**Date:** 2026-09-23. Wave 4 Phase 0 (Part B) deliverable, per this CR's own §24.

## Cross-domain dependency classification

| Domain pair | Classification | Evidence |
|---|---|---|
| Service ↔ Customer | **HARD dependency + shared master** | Every After-Sales entity requires an existing `DB.customers` record (existence-checked); no Service entity can exist without a real Customer. |
| Service ↔ Project | **HARD dependency (mostly)** | Warranty/AMC require `projectId`; Service Material issue requires `vis.projectId` explicitly (`:7552`); Ticket/Complaint allow `projectId` optional. Service is therefore dependent on Wave 1 (Project) exactly as the Wave Plan states. |
| Service ↔ Finance | **HARD dependency + shared engine** | Service Billing (both sub-paths) is entirely dependent on the Finance domain's `createDraft()`/`postJournalEntry()`/AR engine — confirmed a SHARED ENGINE, not a soft integration. Service Labour posting equally depends on `postJournalEntry()`. |
| Service ↔ Inventory | **HARD dependency + shared engine** | Service Material issue depends entirely on `createMaterialIssue()`/`postInventoryMovement()` — SHARED ENGINE, zero Service-specific stock logic. |
| Service ↔ Labour | **HARD dependency + shared pattern (not shared function)** | `postServiceLabourCost()` is its own thin function but reuses the EXACT accounts/shape `postProductionLabourCost()`/`postInstallationLabourCost()` established — a shared PATTERN, correctly implemented as 3 separate small functions rather than 1 shared one (consistent with how Production/Installation labour are already separately implemented, not a Wave 4 architectural deviation). |
| Service ↔ Quality/CAPA | **HARD dependency + shared engine** | CAPA is entirely Quality Management's pre-existing engine, reused unmodified by Service's `sourceTicketId`/`sourceComplaintId` origin tagging — confirmed SHARED ENGINE, zero fork. |
| Service ↔ Reporting | **SOFT dependency, already satisfied** | `afterSalesFinancials()`/`customerAfterSalesSummary()`/dashboard tiles already exist and already work against Wave 1's Reporting foundation — no blocking dependency. |
| Service ↔ Master Data | **HARD dependency** | Customers, Projects, Materials, Users(technicians) are all pre-existing Wave-1/pre-Wave-1 masters; Service adds NO new master-data type of its own (the closest is `DB.serviceLabourRates`, a small internal configuration table, not a shared enterprise master). |
| Service ↔ Security (RBAC/Scope/SoD) | **HARD dependency, already satisfied** | Uses `hasScopeAccess()`, `checkSoD()` (once, for SOD-11), and the standard role-based `can()`/inline-role-array pattern throughout — built directly against the existing foundation, per the Wave Plan's own cross-wave preservation list, not the legacy pattern. |
| Reporting & Analytics (deepened) ↔ everything above | **SOFT, largely already satisfied** | The Wave Plan's own Wave 4 objective bundles "Reporting & Analytics (deepened)" alongside Service; the existing Customer 360/Customer Profitability/company-wide after-sales summary screens already constitute real, working deepening. Remaining reporting gaps (per-technician cost, Cost-Centre-tagged Service Labour) are themselves consequences of Gap Register items 1-2, not a separate Reporting dependency. |

## Dependency on Wave 1-3 items specifically

Per this CR's own instruction to check, not assume, whether any Wave 1-3 open item blocks Wave 4:

- **Wave 1 open items** (RBAC/ID-numbering cleanup, BOM pre-Quotation sequencing, Reporting cross-project
  leak — already fixed in Wave 1 itself): none touch Service & After-Sales at all; re-confirmed no
  reference to Sales/CRM/BOM code exists anywhere in the Phase 10 block.
- **Wave 2 open items** (W2-1/3/5/6/7 — Demand trigger, Warehouse scope, Production Output→FG, Gate
  Pass/Transporter, Inspection/NCR): none touch Service; Service Material issue uses the EXISTING,
  already-correct `postInventoryMovement()` regardless of whether Warehouse scope (W2-3) is later added —
  when/if Warehouse scope IS added, Service Material issue would inherit it automatically (it already
  passes `warehouseId` through to `createMaterialIssue()`), not a hard blocker either direction.
- **Wave 3 open items** (W3-1 through W3-9): **re-verified this pass, none block Wave 4**, matching
  `ARCH-2026-002-W3-DECISION-RESOLUTION.md`'s own §36-38/§493-505 finding. One genuine, non-blocking
  relationship confirmed: if W3-7 (Cost Allocation) is ever authorized, it would be the natural mechanism
  to properly allocate Service overhead into "Service profitability" reporting — but `afterSalesFinancials()`/
  `coreProjectPL()` already produce a real, correct, evidenced Service profitability figure TODAY without
  it (direct labour+material cost vs. direct billed revenue) — W3-7's absence narrows what "Service
  profitability" reporting CAN show (no allocated-overhead view), it does not prevent it from existing.
  Same non-blocking relationship for W3-8 (Profit Centre propagation). Neither is a hard dependency.
- **W3-3 (Fixed Asset lifecycle SoD)**: no relationship to Service — Service does not touch Fixed Assets.
- **W3-5/W3-6 (Petty Cash)**: `ARCH-2026-002-W3-DECISION-RESOLUTION.md` itself already flags the one
  plausible future linkage (field-technician expense reimbursement via Petty Cash) as a NEW, not-yet-
  authorized Wave 4 scope item, not a current dependency — re-confirmed here: no code anywhere in the
  Phase 10 block references `DB.pettyCashVouchers` or any Petty Cash function.

## Shared engines Wave 4 correctly reuses (re-confirmed, zero forks)

| Engine | Reused by Wave 4 via |
|---|---|
| `postJournalEntry()` | `postServiceLabourCost()`, `recognizeAMCRevenue()`, and indirectly via `postDraft()` for both Service Billing sub-paths |
| `createDraft()` | `draftAMCBillingInvoice()` directly; `draftCustomerInvoice()` (which itself calls it) for Chargeable Service |
| `postInventoryMovement()` (via `createMaterialIssue()`) | `issueServiceMaterial()` |
| `checkSoD()` | `closeCAPACase()` (SOD-11) |
| `hasScopeAccess()` | every list/detail route across Warranty/Complaint/Ticket/AMC/Customer-360 |
| `nextDocNumber()`/`nextId()` | every new document type this domain creates (`WAR`,`CMP`,`TKT`,`VIS`,`AMC`,`CAPA`, plus `nextId()` for AMC's own id) |
| `logAudit()` | most (not all — 6 disclosed gaps) create/state-change functions |
| CAPA state machine | Quality Management's pre-existing engine, reused unmodified |

**Zero new engine was found anywhere in the Phase 10 block.** This is the central, re-confirmed finding
underpinning the "no STOP condition" verdict.
