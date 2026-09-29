# ARCH-2026-001 — Implementation Wave Plan

**Date:** 2026-09-21. DESIGN DOCUMENT ONLY. Nothing listed below is authorized for implementation.
Every row is a proposal for a future, separately-authorized `CR-YYYY-NNN`. No code, schema, or
business behavior has changed as a result of this document.

## 1. Architecture preserved — no proposal below may duplicate or replace these

Every future CR proposed in this document must explicitly extend, not duplicate or replace:

- **One GL engine** — `postJournalEntry()`, the sole confirmed journal writer.
- **One AR engine, one AP engine** — the existing Customer Invoice/Receipt and Supplier Bill/Payment
  chains, both posting through the single GL engine.
- **One inventory engine** — the single confirmed inventory-movement writer family.
- **One project-cost model** — Project 360's Budget vs Commitment vs Actual aggregation.
- **Central journal posting, central inventory movements** — no domain-specific shadow ledger or
  shadow stock table.
- **Existing server-side authorization** — role checks on every route (to be upgraded in shape, not
  replaced in principle, by the RBAC waves below).
- **Existing audit logging** — the Audit Log screen and its underlying write path.
- **Existing document numbering** — the existing per-document-type numbering scheme.
- **Existing Phase 39/40/43 fixes** — including this session's own Track B discovery: P42-01
  (`submitPurchaseOrder()`/`approvePurchaseOrder()` → `createCommitmentFromPO()` transaction guard) and
  P43-01 through P43-04 (`executePaymentRequest()`, `issueProductionMaterial()`,
  `issueServiceMaterial()`, `submitStockCount()` — all wrapped in `withTransaction()`). Any future CR
  touching these functions must preserve their existing atomicity guarantees, not just their outputs.

## 2. Domain-specific future CRs (12 domains requiring one)

The 14 fully-EXISTING domains (#1-6, #8-11, #14-17) require no future CR under this plan. The
remaining 12 — 4 EXISTING-PARTIAL, 1 REQUIRES-CLARIFICATION, 7 NOT-APPLICABLE/FUTURE-ROADMAP — each
get one proposed CR number, continuing sequentially from CR-2026-002.

| CR | Domain | Objective | Existing capability (preserved) | New capability | Dependencies | DB impact | Accounting impact | Inventory impact | Security impact | Migration impact | Test requirements | Rollback strategy | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CR-2026-003 | #7 Manufacturing | Add Routing & Work Centre | BOM, Production Orders, Job Cards unchanged | Routing (ordered operation sequence per BOM), Work Centre (capacity unit) entities | None | New `DB.routings`, `DB.workCentres` collections; Production Order gains optional routing reference | None directly — labour cost posting unchanged, just re-sequenced | None directly | Standard role-gated CRUD on new masters | Additive only — existing Production Orders without a routing continue to function exactly as today | New suite covering routing creation, work-centre capacity check, and a full regression of `erp_phase39_manufacturing_jobwork_tests` | Feature-flag the routing reference optional; revert = drop 2 new collections, remove 1 optional field | LOW — additive, no existing writer touched |
| CR-2026-004 | #12 Controlling | Formal Controlling reporting layer | Cost/Profit Centre dimension tags on GL lines unchanged | Dedicated CO-vs-FI reconciliation report; cross-project/cross-cost-centre allocation rules | None | No new collection — reads existing `DB.journalEntries` dimension tags | Read-only — no new posting logic | None | Standard read-access role gating | None — pure reporting addition | New report-accuracy tests reconciling against Trial Balance | Pure removal of new read-only report screen; zero data risk | LOW — read-only |
| CR-2026-005 | #13 Treasury | Cash-flow forecasting | Bank Reconciliation, Petty Cash unchanged | Forward-looking cash position dashboard from open Payment Requests + AR aging | None | No new collection — projection computed from existing `DB.paymentRequests`, `DB.invoices` | Read-only | None | Standard read-access role gating | None | New projection-accuracy tests against a known open-item set | Pure removal of new dashboard screen | LOW — read-only, projection is advisory not authoritative |
| CR-2026-006 | #18 Administration & Governance | RBAC foundation completion | Existing role-only route guards remain the fallback during migration | See §3 below — this domain's CR is the RBAC wave sequence itself, not a single feature | ARCH-2026-001a through g | See §3 | Indirect only (approval-authority thresholds become data-driven, values unchanged) | Indirect only (data-scope enforcement on inventory routes) | This IS the security-model change — see §3 for the full sequencing and risk breakdown | Full 1:1 access-preserving migration required — no user's effective access may change silently | Full parity regression: every existing role/route combination must produce the identical allow/deny result before and after | Documented per-wave rollback in §3 | See §3 — sequenced specifically to keep risk LOW per wave |
| CR-2026-007 | #19 Integration & Platform | Resolve OPEN scope items, then build what's confirmed | Existing CSV/bank imports unchanged | Depends entirely on which OPEN item (external connector / webhook framework / SSO) is confirmed in scope | **BLOCKED** — requires `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md` resolution first | Unknown until scoped | Unknown until scoped | Unknown until scoped | Unknown until scoped — SSO in particular would be a genuine new attack-surface decision | Unknown until scoped | Unknown until scoped | Unknown until scoped | UNKNOWN — cannot be assessed until the domain itself is defined |
| CR-2026-008 | #20 HR / Workforce | Employee master + leave/attendance | Labour & Wages, Project Timesheet unchanged (continue as project-cost inputs) | Employee master, leave management, attendance | None | New `DB.employees`, `DB.leaveRequests`, `DB.attendance` | None directly (Labour & Wages posting path unchanged) | None | New role scope: employee data is more sensitive than most masters — needs its own access tier | Additive — Labour & Wages entries do not require an employee-master link retroactively | New suite; full regression of Finance module (Labour & Wages posting unaffected) | Additive collections only; revert = drop 3 new collections | MEDIUM — first PII-bearing domain in the system, needs real access-control thought before building |
| CR-2026-009 | #21 Payroll | Statutory payroll processing | N/A — net-new | PF/ESI/PT/salary-TDS calculation, payslips, statutory filing | CR-2026-008 (employee master); **Appletree-confirmed statutory configuration** (blocks even design work, not just implementation) | New `DB.payrollRuns`, `DB.payslips`, statutory-rate masters | New posting path (salary/statutory liability) — must go through the existing single GL engine, not a parallel ledger | None | Highest-sensitivity domain in the system — mandatory FinanceManager/CEO-tier gating | Net-new, no migration | Statutory-compliance test suite (PF/ESI/PT calculation accuracy) — cannot be written until rates/rules are confirmed | N/A — not started until statutory scope confirmed | HIGH — real legal/statutory risk if built on assumed rather than confirmed rules; genuinely blocked, not just sequenced |
| CR-2026-010 | #22 Maintenance / EAM | Maintenance scheduling & work orders | Machines master unchanged | Maintenance work orders, scheduling, meter readings, asset-condition tracking | None | New `DB.maintenanceOrders`, `DB.meterReadings` | Cost of maintenance work orders posts through the single GL engine (new cost centre tag, no new engine) | Parts consumption for maintenance uses the existing single inventory engine (new movement reason code, not a new writer) | Standard role-gated CRUD | Additive — existing Machines records unaffected | New suite; regression of Manufacturing module | Additive collections only | LOW-MEDIUM — additive, but touches the shared inventory-movement writer (new reason code), needs care not to introduce a second writer |
| CR-2026-011 | #23 PLM | Engineering-change-order workflow | BOM lifecycle unchanged | ECO workflow, BOM revision history, design-document management | None | New `DB.engineeringChangeOrders`; BOM gains a revision-history sub-collection | None directly | None directly | Standard role-gated CRUD + approval workflow (reuses existing approval-tier pattern) | BOM's existing single-version-at-a-time behavior must remain valid for any BOM never touched by an ECO | New suite; regression of Estimation & Costing (BOM approval flow) | Additive; revert = drop 1 new collection, remove revision sub-collection | LOW-MEDIUM — touches the existing BOM approval state machine, needs care not to break Draft→Submitted→Approved |
| CR-2026-012 | #24 Advanced Planning / MRP | Automated MRP run | Material Requirements (manual) unchanged as the fallback | Automated netting run, lead-time-aware planning, automatic PR generation | None | New `DB.mrpRuns` | None directly | Reads existing stock/BOM data; does not add a new inventory writer | Auto-generated PRs must flow through the EXISTING PR→PO approval chain, not bypass it | Additive — manual Material Requirements path remains available | New suite; must prove auto-generated PRs respect the same tiered-approval gates as manually created ones | Additive; revert = drop 1 new collection, disable auto-PR generation flag | MEDIUM — auto-generating PRs is the first "system-initiated" transaction in the codebase; must not weaken the approval chain |
| CR-2026-013 | #25 Transportation / Logistics | Route planning & freight allocation | Delivery Challan, E-way Bill Tracking (manual) unchanged | Route planning, carrier management, freight-cost allocation to projects | None | New `DB.routes`, `DB.carriers` | Freight cost allocation posts through the single GL engine (existing cost-centre tagging pattern) | None directly | Standard role-gated CRUD | Additive | New suite; regression of Site Execution & Delivery module | Additive; revert = drop 2 new collections | LOW — additive |
| CR-2026-014 | #26 Advanced Warehouse | Bin-level putaway & wave picking | Locations, Stock Counts unchanged | Bin-level putaway strategy, wave picking, warehouse-task engine | None | New `DB.bins`, `DB.warehouseTasks` | None directly | Directly extends the single inventory engine's granularity (bin-level, not a second engine) — highest-risk item in this table for accidentally forking the inventory writer | Standard role-gated CRUD | Additive — existing location-level stock tracking remains valid for any warehouse not opted into bin-level tracking | New suite; FULL regression of the inventory engine (`erp_phase39_stress_test` at minimum) given the shared-writer risk | Additive; revert = drop 2 new collections, disable bin-level flag | MEDIUM-HIGH — the one domain in this table most likely to tempt a second inventory-movement writer if not built carefully against the existing single engine |

## 3. RBAC implementation sequencing (CR-2026-006 / ARCH-2026-001a through g)

Proposed sequence, exactly matching the dependency order implied by the target model
(`USER → BUSINESS ROLE → DUTIES → PRIVILEGES → ACTIONS → DATA SCOPE → APPROVAL AUTHORITY → SoD →
SERVER-SIDE AUTHORIZATION → AUDIT`). **None of the following is implemented or authorized by this
document.**

| Step | Scope | Access-preservation requirement | Rollback |
|---|---|---|---|
| **ARCH-2026-001a** | Data model + migration: create `DB.businessRoles`, `DB.duties`, `DB.privileges`, `DB.roleDuties`, `DB.dutyPrivileges`, `DB.userRoles`; migrate the 10 existing roles into an equivalent Business-Role/Duty/Privilege composition | Migration must be 1:1 access-preserving — every user's effective permissions before and after must be provably identical | Drop the 6 new collections; existing `DB.users.role` field (unchanged, never removed) continues to work exactly as today |
| **ARCH-2026-001b** | Route-layer authorization rewrite: route guards read from the new Privilege/Action model instead of the current flat role string, but produce identical allow/deny decisions | Full parity regression — every existing role x route combination tested to prove zero behavior change | Revert route guards to the flat role-string checks; the new collections remain inert but unused |
| **ARCH-2026-001c** | Data-scope enforcement: e.g. Project Manager restricted to assigned projects — this already exists informally in places; formalize it as configurable `DB.roleScopes` data | Any currently-enforced scope restriction must remain enforced; this step should ADD formal enforcement where informal, not loosen anything | Revert to the prior informal/hardcoded scope checks |
| **ARCH-2026-001d** | SoD rule engine: `DB.sodRules` + `DB.sodExceptions`, e.g. "cannot both create and approve the same Payment Request" — the 3-person Payment Request separation already exists as hardcoded logic; this formalizes it as data | Existing hardcoded SoD-equivalent checks (Payment Request 3-person rule, Snag independent-verifier rule) must not be weakened | Revert to hardcoded checks; new SoD engine remains inert but unused |
| **ARCH-2026-001e** | Approval Authority as configurable data: `DB.approvalAuthorities` replacing hardcoded thresholds (PO tiers, discount tiers) with data-driven values, same default values | Every existing threshold (₹5L/₹20L PO tiers, 5%/10% discount tiers) must be seeded as the exact current value — this step must not silently change a single rupee threshold | Revert to hardcoded threshold constants |
| **ARCH-2026-001f** | CEO/Admin technical-vs-business split | **BLOCKED** on the Option A/B management decision (§3 of the RBAC Target Design doc) — cannot be sequenced further until decided |
| **ARCH-2026-001g** (new, this document) | Effective Access Reporting + full Role Migration completion: a report showing, per user, their full resolved Duty/Privilege/Scope set, used as the final verification gate before any hardcoded role-string fallback is removed | Fallback role-string check must remain available and correct throughout — never removed until this report proves zero discrepancy across every user | N/A — this is a verification step, not a removal step |

Each step is independently revertible and independently testable — this is a deliberate design choice
so that no single CR in this sequence is an all-or-nothing bet on the entire RBAC model working
correctly on the first attempt.

## 4. What this document does NOT do

No CR listed above is opened, started, or authorized by this document. No collection, route, or role
has been created or altered. This is a proposal register only, to be worked through one separately-
authorized CR at a time, in whatever order management chooses (this plan proposes a dependency-safe
default order — RBAC foundation before domain-specific security enhancements, statutory-blocked items
last — but does not mandate it).
