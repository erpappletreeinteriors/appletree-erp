# ARCH-2026-002 — Wave Plan

**Date:** 2026-09-22. Phase 0 deliverable, §21/§29. No wave below is implemented, started, or
authorized by this document — Phase 0 only designs and sequences. Wave groupings are exactly this CR's
own §9-§14 groupings; no domain was silently renamed, merged, or moved between waves.

## Final Wave Matrix

| Wave | Domains | Main Objective | Prerequisites | Major Risks | Exit Criteria |
|---|---|---|---|---|---|
| **1** | Home & Workspace, Sales & CRM, Estimation & Costing, Project & Contract Mgmt, Master Data, Reporting & Analytics | Complete the commercial front end: Lead→Estimation→Costing→Quotation→Approval→Project, on the existing RBAC/scope/SoD foundation | None — all 6 domains already EXISTING (`ARCH-2026-002-MODULE-MATRIX.md`) | Wave-1-internal RBAC/ID-numbering inconsistency (item 4); BOM-sequencing question (item 5); Reporting cross-project leak (item 8) | See `ARCH-2026-002-WAVE-1-DESIGN.md` §Exit Criteria |
| **2** | Procurement & Supplier Mgmt, Inventory/Warehouse/Logistics, Manufacturing, Job Work/Subcontracting, Site Execution & Delivery, Quality Management | Connect Project→Requirement→Procurement→GRN→Inventory→Site Material→Consumption→Manufacturing→Job Work→QC→Delivery→Handover without creating duplicate stock/cost movements | Wave 1 (Project must exist for BOM/Material Requirement to attach to) | Manufacturing's Routing/Work Centre gap (Plan-to-Produce PARTIAL, `ARCH-2026-002-PROCESS-TRACE.md` chain E); must extend `postInventoryMovement()`, never fork it | 6 domains' own completeness criteria (§5) all YES/N-A; Plan-to-Produce chain upgraded from PARTIAL only if Routing/Work Centre is in scope (else documented DEFERRED); zero new inventory writers |
| **3** | Finance & Accounting, Controlling, Treasury & Cash Mgmt, Asset Management | Integrate AR/AP/GL/Inventory/Projects/Fixed Assets/Banking/Cash/Budget/Commitment/Actual/Profitability, all reconciling to the single existing GL engine | Waves 1-2 (transactions must exist to reconcile) | **Bank Reconciliation duplicate-ownership** (`ARCH-2026-002-TRANSACTION-OWNERSHIP.md` row 32) must be resolved or explicitly ratified as intentional-dual, not silently left ambiguous; Controlling's CO-vs-FI reporting layer must stay read-only over existing GL tags, never a parallel ledger | Trial Balance/AR/AP reconciliation unchanged; Bank Reconciliation ownership decision recorded, not silently resolved |
| **4** | Service & After-Sales, Reporting & Analytics (deepened) | Customer 360, Warranty, Complaints, Service Tickets, Visits, AMC, AMC Schedule, Service Billing, CAPA — integrate with Customer/Project/Finance/Reporting | Waves 1-3 | Service Billing must keep routing through the single `draftCustomerInvoice()`, never a second billing engine (already confirmed true today, `ARCH-2026-002-TRANSACTION-OWNERSHIP.md` "Service Billing" row) | Service-to-Cash chain remains WORKING (already confirmed, `ARCH-2026-002-PROCESS-TRACE.md` chain L); no second billing path introduced |
| **5** | Master Data (extended), Administration & Governance, Integration & Platform, HR/Workforce, Payroll | People & enterprise operations | Domain #19 blocked on `ARCH-2026-002-OPEN-DECISIONS.md` item 2; Payroll blocked on item 3 (statutory config — blocks DESIGN, not just implementation); HR (#20) needs its own PII-access-tier decision first | Payroll legal/statutory risk if built on assumed rules (explicitly forbidden by this CR's own §35); HR is the first PII-bearing domain, needs real access-control design before any code | Integration & Platform and Payroll remain explicitly NOT STARTED until their blocking decisions are made; HR built only with an access-control design reviewed first |
| **6** | Maintenance/EAM, PLM, Advanced Planning/MRP, Transportation/Logistics, Advanced Warehouse | Advanced enterprise operations, built only after their dependencies are stable | All prior waves; PLM depends on BOM (Wave 1) remaining singular; MRP depends on Inventory (Wave 2) remaining singular; Advanced Warehouse depends on Inventory (Wave 2) remaining singular | Advanced Warehouse is the domain in this whole program **most likely to tempt a second inventory-movement writer** if not built carefully (`ARCH-2026-002-DATA-MODEL-GAP-REGISTER.md`); MRP's auto-PR-generation must not bypass the existing approval chain | Zero new GL/inventory/audit/numbering engines introduced across all 5 domains; each domain's completeness criteria (§5) explicitly marked, no domain silently declared COMPLETE without evidence |

## Cross-wave architecture preservation (carried forward from `ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md` §1, re-confirmed by this Phase 0's own fresh Dependency Map)

Every wave above must extend, never duplicate or replace:
- **One GL engine** — `postJournalEntry()` (domain.js:2297), sole confirmed journal writer, re-confirmed by this Phase 0.
- **One inventory engine** — `postInventoryMovement()` (domain.js:4976), sole confirmed writer, re-confirmed.
- **One clearing function** — `applyClearing()` (domain.js:3366).
- **One transaction wrapper** — `withTransaction()`, applied automatically at the request-dispatch layer (`server.js:530`, `685`), never called from inside domain functions.
- **One project-cost model** — Project 360's Budget vs Commitment vs Actual aggregation (`projectFinancial360`/`companyProjectProfitability`).
- **One document-numbering mechanism** — `nextDocNumber()` + `nextId()` (see `ARCH-2026-002-DEPENDENCY-MAP.md` §2 for the one disclosed exception: Wave 1's own ad-hoc-ID pattern, an open item, not yet a violation of a GL/audit-facing number).
- **The now-real RBAC/Data-Scope/SoD/Approval-Authority foundation** (`can()`, `hasScopeAccess()`, `checkSoD()`, `resolveApprovalAuthority()`) — every new Wave 2-6 module should be built directly against this foundation from day one, not the legacy inline-role-check pattern some Wave-1 functions still use (see `ARCH-2026-002-OPEN-DECISIONS.md` item 4).

## What this document does NOT do

No wave is opened, started, or authorized by this document. No collection, route, role, or UI screen
has been created or altered to produce it. Wave 1's own detailed design is in the separate
`ARCH-2026-002-WAVE-1-DESIGN.md`, per this CR's own §22 instruction to keep Phase 0's implementation
detail scoped to Wave 1 only — Waves 2-6 above are sequencing and risk-scoping only, not detailed
designs, consistent with this CR's own §31 "wait for explicit authorization" rule.
