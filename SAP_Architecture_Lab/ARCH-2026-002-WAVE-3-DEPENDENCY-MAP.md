# ARCH-2026-002 — Wave 3 Dependency Map

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §26.

| From ↔ To | Type | Evidence |
|---|---|---|
| Finance → Projects (Wave 1) | Hard | Every cost/revenue posting tags `projectId`; `projectPL` sweep is the sole project-cost source |
| Finance → Procurement (Wave 2) | Hard | GRN/Supplier Bill/Payment Request all post through Finance's single GL engine |
| Finance → Inventory (Wave 2) | Hard | GRN valuation posts to account 1200 through the same single GL engine |
| Finance → Manufacturing/Job Work (Wave 2) | Hard | Labour cost, scrap write-off post through the same engine |
| Finance → Site Execution (Wave 1/2) | Hard | Labour & Wages, Project Expense, Billing Milestone→Invoice all post through the same engine |
| Controlling → Finance | Hard | Controlling is entirely a read-composition over Finance's single GL — no independent data |
| Controlling → Master Data (Wave 1) | Hard | Cost Centre/Profit Centre masters live in Master Data |
| Treasury → Finance | Hard | Bank Reconciliation's "Allocate" step posts through Finance's single GL engine |
| Treasury → Procurement (Wave 2) | Soft | Payment Requests may be Procurement-initiated but are Finance/AP-owned end to end |
| Asset Management → Finance | Hard | Every lifecycle step posts through the single GL engine; no independent asset-accounting mechanism |
| Asset Management → Projects (Wave 1) | Soft | Assets may optionally be project-tagged; project-cost impact only occurs when tagged |
| Reporting (Wave 1) → Finance/Controlling/Treasury/Assets | Shared engine (read-only) | Every Wave 3 report reads the same `allLines()`/single-GL source Reporting already reads |
| Security (RBAC/Scope/SoD/Approval, Wave 1-established) → all 4 Wave 3 domains | Shared engine | `can()`, `hasScopeAccess()`, `checkSoD()`, `resolveApprovalAuthority()` all reused, not duplicated |
| Wave 2 (Manufacturing/Job Work/Quality) → Finance | Soft | Production labour cost, Job Work scrap write-off post into Finance's engine, but Finance has no reciprocal hard dependency on Wave 2 |

## Hard vs. soft dependency summary

**Hard dependencies** (Wave 3 cannot function without): the single GL engine itself (already existing,
not a Wave 3 deliverable), Projects (Wave 1), Master Data (Wave 1, for Cost/Profit Centre masters).

**No Wave 3 domain hard-depends on anything not yet built.** HR, Payroll, Maintenance/EAM, PLM, MRP,
Transportation, Advanced Warehouse (Wave 5/6) are not prerequisites for any Wave 3 item in this register.

## Cross-wave seams requiring care in any future Wave 3 implementation

1. **`projectPL()`'s generic Income/Expense-type sweep** is the sole project-cost source every Wave 2/3
   domain already feeds correctly (including, silently, Depreciation and Job-Work write-offs) — any
   future Wave 3 work (e.g. cost allocation) must extend this sweep's OUTPUT labeling, never fork a
   second project-cost calculation.
2. **`postJournalEntry()`'s pass-through Cost/Profit Centre validation** is the correct integration
   point for any future Controlling work — it already accepts and validates these dimensions; the gap
   is entirely on the CALLING side (which functions supply a value), not the engine itself.
3. **The Bank Reconciliation consolidation (Wave 1)** must remain the sole reconciliation engine — any
   future Treasury work (e.g. a Petty Cash GL account) must post through the same single
   `postJournalEntry()`, never introduce a parallel cash-ledger mechanism.
