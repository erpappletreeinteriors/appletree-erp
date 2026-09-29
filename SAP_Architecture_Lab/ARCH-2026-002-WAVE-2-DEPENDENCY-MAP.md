# ARCH-2026-002 — Wave 2 Dependency Graph

**Date:** 2026-09-22. Wave 2 Phase 0 deliverable, §20.

## Dependency table

| From → To | Type | Evidence |
|---|---|---|
| Master Data → Procurement | Hard | PO requires Vendor master; Material Master required for every line |
| Master Data → Inventory | Hard | Every movement requires a Material master record |
| Projects → Procurement | Hard | PO/GRN/Payment Request all require an open project (`assertProjectOpenForPosting`) |
| Projects → Manufacturing | Hard | Production Order requires a project-scoped, Approved BOM |
| Projects → Job Work | Hard | Job Work Order dispatch requires an open project |
| Projects → Site Execution | Hard | Every Site transaction requires a project |
| Estimation & Costing (Wave 1) → Manufacturing | Hard | BOM is created and approved in the Estimation & Costing domain group but consumed by Production Order creation — a genuine Wave-1→Wave-2 seam, already identified in the original Dependency Map, re-confirmed unaffected by Wave 1's own changes |
| Procurement → Inventory | Hard | GRN, Purchase Return both post through the single inventory engine — Procurement does not own inventory, it triggers it |
| Inventory → Manufacturing | Hard | `issueProductionMaterial` consumes warehouse stock via the same single inventory engine |
| Inventory → Job Work | Hard | Dispatch/Return both move stock via the same single engine |
| Inventory → Site Execution | Hard | `issueToSite`/Site consumption both move stock via the same single engine |
| Manufacturing → Finance (Wave 3) | Soft | Labour cost posts through the single GL engine; Product Costing reads GL/movement data but does not write to Finance's own domain |
| Job Work → Finance (Wave 3) | Soft | Scrap write-off and settlement Supplier Bill both post through the single GL engine |
| Site Execution → Finance (Wave 3) | Soft | Labour & Wages, Project Expense, Billing Milestone→Invoice all post through the single GL engine |
| Quality → Site Execution | Hard | `handoverReadinessCheck` requires QC Checklist status directly |
| Quality → Service & After-Sales (Wave 4) | Soft | CAPA's `sourceComplaintId`/`sourceTicketId` are optional, unvalidated references — a soft, not hard, dependency |
| Security (RBAC/Scope/SoD/Approval, Wave 1-authorized foundation) → all 6 Wave 2 domains | Shared engine | `can()`, `hasScopeAccess()`, `checkSoD()`, `resolveApprovalAuthority()` all reused, not duplicated, across every Wave 2 domain — re-confirmed this pass |
| Reporting & Analytics (Wave 1) → all 6 Wave 2 domains | Shared engine (read-only) | Every Wave 2 report (Job Cost Sheet, Factory Dashboard, Material Analysis, etc.) reads the same single GL/inventory/project-cost sources Reporting already reads from |
| Procurement ↔ Inventory | Shared transaction | GRN is jointly "Procurement's receipt" and "Inventory's inbound movement" — confirmed single-owner (Procurement), Inventory only consumes the resulting movement, not a conflict |
| Site Execution ↔ Inventory | Shared transaction | Site Material is jointly "Site Execution's requisition/delivery" and "Inventory's movement type" — confirmed single-owner, no conflict (re-verified this pass) |
| Manufacturing ↔ Job Work | Shared master | Both reference `DB.materials`, `DB.machines`(Manufacturing only) — no shared transaction type between them |
| Master Data (Wave 1) → Job Work | Hard | Job Worker master is itself a Wave 2 (Job Work domain) master, but Vendor/Material masters it depends on are Wave 1's Master Data domain |

## Hard vs. soft dependency summary

**Hard dependencies** (Wave 2 cannot function without): Master Data, Projects, and — critically —
Estimation & Costing's BOM (a Wave 1 domain) for Manufacturing specifically. All 3 are Wave 1 domains,
already EXISTING and unaffected by anything Wave 2 would build.

**Soft dependencies** (Wave 2 posts into, but doesn't require to function): Finance & Accounting
(Wave 3) — every Wave 2 domain already posts through the single GL engine today, so this "dependency" is
already satisfied by the EXISTING engine, not something Wave 3 needs to newly provide.

**No Wave 2 domain hard-depends on anything not yet built** (HR, Payroll, Maintenance/EAM, PLM, MRP,
Transportation, Advanced Warehouse are all Wave 5/6 domains — none is a prerequisite for Wave 2).

## Cross-wave seams requiring care in any future Wave 2 implementation

1. **BOM's `activeBomsFor`/`materialBomQuota`** (Estimation & Costing, Wave 1) is the sole gate
   `createMaterialIssue()` already relies on — any Wave 2 implementation touching Production Order
   material issuance must keep calling into this existing mechanism, never fork it.
2. **`postProductionLabourCost`'s CC-FACTORY tag** and **Job Work's scrap write-off posting** both
   already reuse the single GL engine correctly — any Wave 2 implementation extending labour-hours
   costing (per Decision W2-1's cousin question) must preserve this, not introduce a second labour-cost
   posting path.
3. **`materialReplenishmentReport()`** (read-only) is the existing "what do we need" computation any
   Demand-trigger design (W2-1) should extend, not duplicate.
