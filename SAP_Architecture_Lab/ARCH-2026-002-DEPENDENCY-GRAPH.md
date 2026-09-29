# ARCH-2026-002 — Dependency Graph (26 Domains)

**Date:** 2026-09-26. Deliverable per this CR's own §10. Built from source-code/architecture evidence
already established across every prior Phase 0/Implementation pass — no relationship below is invented.

| Source Domain | Destination Domain | Dependency Type | Hard/Soft | Current Status | Can Be Worked Around? | Requires Management Decision? | Requires Implementation? | Risk if Deferred? |
|---|---|---|---|---|---|---|---|---|
| Sales & CRM (#2) | Estimation & Costing (#3) | WORKFLOW | Hard | WORKING | No | No | No | Low — chain already traced WORKING |
| Estimation & Costing (#3) | Project & Contract Mgmt (#4) | WORKFLOW | Hard | WORKING (BOM sequencing question OPEN, item 5) | Yes — BOM's current post-Won creation order works, just doesn't match the Wave Plan's literal wording | Yes (item 5) | Only if item 5 resolves toward pre-Quotation BOM | Low — cosmetic/sequencing question only |
| Procurement (#5) | Inventory (#6) | TRANSACTION + INVENTORY | Hard | WORKING | No | No | No | Low |
| Procurement (#5) | Finance & Accounting (#11) | ACCOUNTING | Hard | WORKING | No | No | No | Low |
| Inventory (#6) | Manufacturing (#7) | INVENTORY | Hard | WORKING | No | No | No | Low |
| Manufacturing (#7) | Job Work (#8) | WORKFLOW | Soft | WORKING | Yes | No | No | Low |
| Manufacturing (#7) | Advanced Planning/MRP (#24) | WORKFLOW | Soft (currently no automated linkage at all) | PARTIAL — `materialReplenishmentReport()` exists, disconnected from `createProductionOrder()` | Yes — fully manual today, works | Yes (item 7 — Wave 2/6 boundary question) | Yes, if item 7 resolves toward automation | Medium — the longer this stays disconnected, the more manual-planning debt accumulates, but no functional break exists today |
| Site Execution (#9) | Finance & Accounting (#11) | ACCOUNTING | Hard | WORKING | No | No | No | Low |
| Quality (#10) | Job Work / Site Execution / Service (#8/#9/#15) | WORKFLOW (CAPA) | Hard (shared CAPA engine) | WORKING | No | No | No | Low |
| Finance & Accounting (#11) | Controlling (#12) | ACCOUNTING (read) | Hard | PARTIAL (Controlling is read-only over Finance, by design) | No | No (this IS the correct architecture) | No | None — this is the intended, correct relationship |
| Finance & Accounting (#11) | Treasury (#13) | ACCOUNTING | Hard | WORKING | No | No | No | Low |
| Finance & Accounting (#11) | Asset Management (#14) | ACCOUNTING | Hard | WORKING | No | No | No | Low |
| Finance & Accounting (#11) | Service & After-Sales (#15) | ACCOUNTING | Hard (shared engine) | WORKING | No | No | No | Low |
| Project & Contract Mgmt (#4) | Controlling (#12) | PROJECT COST | Hard | WORKING (via Project Cost model) | No | No | No | Low |
| Master Data (#17) | Controlling (#12) | MASTER DATA | Hard | WORKING (Cost/Profit Centre masters live here) | No | No | No | Low |
| Master Data (#17) | Asset Management (#14) | MASTER DATA | Soft | WORKING (assets may optionally be project-tagged) | Yes | No | No | Low |
| Reporting & Analytics (#16) | Everything (#2-#15, #17-#18) | REPORTING (read-only) | Shared engine | WORKING | No | No | No | Low |
| Security (RBAC/Scope/SoD/Approval/Audit, #18) | Everything | SECURITY (shared) | Shared engine | WORKING, unevenly adopted (legacy inline pattern in #2) | Yes (legacy pattern still functions correctly, just inconsistently) | No (item 4 is a scheduling choice, not a policy question) | Yes, if item 4 is scheduled | Low — legacy pattern is correctly enforced today, just not on the newer dispatcher |
| Integration & Platform (#19) | Everything | INTEGRATION | Soft (currently — no external integration exists to depend on) | BLOCKED (scope undecided, item 2) | Yes — nothing currently depends on external integration existing | Yes (item 2) | Yes, once scoped | Low currently (nothing blocked); would rise if any future domain assumed integration existed |
| HR/Workforce (#20) | Payroll (#21) | MASTER DATA | Hard | Both ABSENT | N/A — neither exists | Yes (items 1, 3) | Yes | N/A — Wave 5, parked |
| Service & After-Sales (#15) | Finance & Accounting (#11) | ACCOUNTING (shared engine) | Hard | WORKING | No | No | No | Low |
| Service & After-Sales (#15) | Inventory (#6) | INVENTORY (shared engine) | Hard | WORKING | No | No | No | Low |
| Service & After-Sales (#15) | Quality/CAPA (#10) | WORKFLOW (shared engine) | Hard | WORKING | No | No | No | Low |
| Wave 6 domains (#22-26) | Wave 1/2 foundations (BOM singularity, Inventory singularity) | ARCHITECTURE | Hard | Both foundations confirmed intact through every subsequent pass | No | No | N/A — Wave 6 not started | Low today; Advanced Warehouse (#26) carries the highest FUTURE risk of forking the inventory-movement writer if built without discipline — a design-time risk, not a current one |

## Domains with zero outbound dependency on any undecided item

Confirmed independent of Wave 4 (#15's 12 open decisions) and Wave 5 (#19/#20/#21's parked items): #1
Home & Workspace, #4 Project & Contract Mgmt, #5 Procurement, #6 Inventory, #8 Job Work, #9 Site
Execution, #11 Finance & Accounting, #12 Controlling, #13 Treasury, #14 Asset Management, #16 Reporting,
#17 Master Data. **These 12 domains are where any independent architecture-track activity should be
scoped**, per this CR's own §8 instruction.

## No new relationship invented

Every row above cites a specific, previously-established finding (Process Trace chains, Transaction
Ownership rows, Dependency Map entries from Waves 1-4) rather than a fresh assumption.
