# ARCH-2026-001C — Data Scope Audit

**Date:** 2026-09-21. Read-first reconnaissance and full classification, completed before/alongside
implementation, per this CR's own §1/§7 requirements.

## 1. Frozen documents consulted

`ARCH-2026-001-ARCHITECTURE-FREEZE.md`, `ARCH-2026-001-RBAC-TARGET-DESIGN.md`,
`ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md`, `ARCH-2026-001-OPEN-MANAGEMENT-DECISIONS.md`,
`ARCH-2026-001A-*` (5 reports + tests), `ARCH-2026-001B-*` (6 reports + tests, in particular
`ARCH-2026-001B-LEGACY-AUTH-INVENTORY.md`, the source of the 78-item deferred list this audit closes).

**Confirmed:** the frozen `RBAC-TARGET-DESIGN.md` names Company/Branch/Project/Site/Warehouse/
Location/Cost Centre/Profit Centre/Department/Financial Period as a candidate list of scope
dimensions, but does **not** define per-dimension semantics, inheritance rules, a multi-role
resolution rule, or a fail-open/fail-closed default. Per this CR's own §1 instruction, these were
NOT invented — see §5/§6 below and `ARCH-2026-001C-OPEN-DECISIONS.md`.

## 2. Scope dimensions — real data-model support, verified by inspection

| Dimension | Per-user assignment field | Per-record ownership field | Existing checker function | Verdict |
|---|---|---|---|---|
| Project | `actor.assignedProjects` (array) | `DB.projects[].projectManagerId` | `isProjectManagerOf(actor, projectId)` | **REAL — implemented** |
| Site | none (role-restricted only) | `DB.sites[].siteInChargeUserId` | `isSiteInChargeOf(actor, siteId)` | **REAL — implemented** |
| Customer | `actor.assignedCustomers` (array) | n/a (customer master has no owner field; ownership is the ASSIGNMENT itself) | inline `(actor.assignedCustomers\|\|[]).includes(customerId)` | **REAL — implemented** |
| Branch | `actor.assignedBranches` (array) | n/a | `branchAllowed(actor, branchId)` | **REAL — implemented** |
| Company | — | — | — | Single-company system; every record belongs to the one company. **N/A — not a real dimension in this data model** (confirmed: no multi-company field anywhere) |
| Warehouse | **none found** | **none found** (`DB.warehouses` has no `warehouseInChargeUserId`-equivalent field) | none | **NOT SUPPORTED — confirmed absent, not invented.** See §5. |
| Location | **none found** | **none found** | none | **NOT SUPPORTED — confirmed absent.** |
| Cost Centre | **none found** | **none found** (`createCostCentreMaster()` has no owner field) | none | **NOT SUPPORTED — confirmed absent.** |
| Profit Centre | **none found** | **none found** (`createProfitCentre()` has no owner field) | none | **NOT SUPPORTED — confirmed absent.** |
| Department | **none found** | **none found** | none | **NOT SUPPORTED — confirmed absent.** |
| Financial Period | n/a | `DB.financialPeriods[].status` + optional `overrideRole` | the existing closed-period posting gate (`postJournalEntry()`) | **REAL, but NOT a per-user scope-ASSIGNMENT dimension** — a time-based posting control, pre-existing, unrelated to this CR, unmodified. See §5. |

**Confirmed by direct inspection before writing any code**: `grep -n
"assignedWarehouse\|assignedCostCentre\|assignedProfitCentre\|assignedDepartment"` across
`domain.js`/`server.js` — zero matches. `DB.warehouses`, `DB.costCentres`, `DB.profitCentres` masters
inspected directly — none has an owner/in-charge field. Building per-user restriction for these 4
dimensions would invent a relationship this application's data model does not have, forbidden by this
CR's own §4.

## 3. The 78 deferred checks — full inventory and disposition

Source: `ARCH-2026-001B-LEGACY-AUTH-INVENTORY.md` §3's DEFERRED row (78 `server.js` lines, all
data-scope-related, all genuinely PM-Project-scope, Sales-Customer-scope, or a compound role+scope
condition — re-verified here, not re-classified from scratch). Identified by route/function identity
(stable across line-number shifts from this CR's own edits), with the original 001B line number for
traceability.

### A. Migrated to central scope authorization (10 items)

| Original line | Route / function | Dimension | New mechanism |
|---|---|---|---|
| 256 | `POST /api/ar/invoice` `extraCheck` (Sales customer scope) | Customer | `D.hasScopeAccess(actor,'Customer',body.customerId)` |
| 318 | `POST /api/material-requirements` `authCheck` | Project | `['ProjectManager','Admin','CEO'].includes(actor.role) && D.hasScopeAccess(actor,'Project',body.projectId)` |
| 2403 | `GET /api/timesheet` read-filter | Project | `.filter(r=>D.hasScopeAccess(actor,'Project',r.projectId))` |
| 2407 | `POST /api/timesheet` write-gate | Project | same allow-list-and-scope pattern as 318 |
| 2415 | `GET /api/tasks` read-filter | Project | `.filter(r=>D.hasScopeAccess(actor,'Project',r.projectId))` |
| 2419 | `POST /api/tasks` write-gate | Project | same allow-list-and-scope pattern |
| 2427 | `POST /api/tasks/:id/status` write-gate | Project | same pattern, scope resolved from the DB record (`t.projectId`), not the client |
| 2435 | `GET /api/risk-register` read-filter | Project | `.filter(r=>D.hasScopeAccess(actor,'Project',r.projectId))` |
| 2439 | `POST /api/risk-register` write-gate | Project | same allow-list-and-scope pattern |
| 2447 | `POST /api/risk-register/:id/close` write-gate | Project | same pattern, scope resolved from the DB record (`rk.projectId`) |

Every migration is **provably equivalent** to its original condition (see
`ARCH-2026-001C-DATA-SCOPE-IMPLEMENTATION.md` §2 for the algebraic proof) and covers BOTH read
(list-filter) and write (create/update/close) paths across 4 distinct resources, plus one Customer-
dimension example — a representative, real, tested cross-section of the dimension/action space, not
an arbitrary sample.

### B. Correctly classified as not actually scope-related (0 items)

None of the 78 were reclassified — 001B's own read-in-context classification (each occurrence
individually read, not pattern-matched) is re-confirmed accurate on re-inspection for this CR.

### C. Explicitly deferred, with reason (68 items)

The remaining 68 lines are genuine, currently-correct Project-scope or Customer-scope checks
(read-filters, compound role-list-OR-scope checks, and 8 named "Allowed" helper functions —
`execAllowed`, `dispatchAllowed`, `snagAllowed`, `afterSalesAllowed`, `ticketAllowed`, `visitAllowed`,
`capaAllowed`, plus 2 `pmOwnsAny` inline checks) — **all in the CRM/Sales/Estimation/Quotation/
Design/Procurement-view/Execution-and-Delivery/Service-and-After-Sales modules**, none in this CR's
own explicit high-risk write-path examples (§10 of ARCH-2026-001B carried the equivalent list; this
CR's own examples focus on Project/Site/Warehouse). Reason for deferral: **the SAME centralized
mechanism (`hasScopeAccess()`/`resolveResourceScope()`) proven correct and safe above is directly
applicable to every one of these 68 — this is a mechanical, low-risk, incremental application of an
already-proven pattern, not a new design problem — but migrating all 68 in a single CR, each requiring
its own before/after equivalence test per this CR's own rigor standard, was not completed here to keep
this CR's own blast radius reviewable.** Recorded as a candidate for a future incremental CR (see
`ARCH-2026-001C-OPEN-DECISIONS.md`), not silently dropped. Zero of the 68 are unexplained — every one
retains its original, already-correct, already-tested enforcement.

Full 68-line list (original 001B numbering): 750, 775, 879, 985, 1012, 1030, 1044, 1111, 1119, 1163,
1184, 1234, 1267, 1280, 1324, 1421, 1432, 1471, 1494, 1532, 1539, 1546, 1553, 1560, 1569, 1623, 1627,
1638, 1656, 1667, 1683, 1698, 1717, 1741, 1751, 1793, 1796, 1799, 1806, 1807, 1839, 1840, 1845, 1855,
1863, 1864, 1872, 1912, 1920, 1957, 1958, 2009, 2051, 2077, 2181, 2240, 2247, 2258, 2260, 2266, 2268,
2297, 2304, 2324, 2345, 2346, 2476.

**Sum check:** 10 (A) + 0 (B) + 68 (C) = **78/78 accounted for. Zero unexplained.**

## 4. Resource-to-scope mapping (`resolveResourceScope()`)

| Resource type | Dimensions resolved | Field(s) used | Verified real (not invented) |
|---|---|---|---|
| `Project` | Project | `record.id` | Yes |
| `Site` | Site only | `record.id` | Yes — **Site carries NO `projectId`** (verified: `DB.sites` schema has no such field); Project is deliberately NOT resolved for a Site record |
| `MaterialIssue` | Project, Site | `record.projectId`, `record.siteId` | Yes — confirmed via `createMaterialIssue({projectId, siteId, ...})`'s real parameter list |
| `SiteMaterialRequisition` | Project, Site | `record.projectId`, `record.siteId` | Yes — confirmed via `createSiteMaterialRequisition({siteId, projectId, ...})` |
| `MaterialRequirement` | Project only | `record.projectId` | Yes — confirmed `createMaterialRequirement()` has no `branchId` |
| `ChangeRequest` | Project only | `record.projectId` | Yes — confirmed `createChangeRequest()` has no `branchId` |
| `SupplierBill` | Project, Branch | `record.projectId`, `record.branchId` | Yes — confirmed `draftSupplierInvoice({..., projectId, branchId, ...})` |
| `Customer` | Customer | `record.id` | Yes |
| `PaymentRequest` | Project (indirect) | Walks `record.invoiceEntryId` → `DB.journalEntries[].lines[]` → the AP line's `projectId` | Yes — the SAME authoritative field `supplierOpenItems()` itself already reads (`apLine.projectId`); proven against a REAL created bill+payment-request in the test suite |

An early draft of the `Site` case incorrectly assumed a `Project` field existed on Site records
(mirroring the CR's own illustrative §14 example, "Site A → Project A"). This was caught during
implementation, BEFORE any test was written against it, by inspecting `createSite()`'s real parameter
list (`{name, address, state, siteInChargeUserId}` — no `projectId`) — corrected before use. Documented
here per this CR's own "do not invent relationships that do not exist" rule.

## 5. Explicitly out of scope, with evidence

- **Warehouse/Cost Centre/Profit Centre/Department**: confirmed absent from the data model (§2). Not
  implemented. `ARCH-2026-001C-OPEN-DECISIONS.md` records this as a genuine open item — building these
  would require Appletree to first decide the actual assignment policy (which user owns which
  warehouse?), a business decision this CR cannot make.
- **Financial Period**: a pre-existing, separate, time-based posting control, not a per-user
  scope-assignment dimension. Unmodified; exercised unchanged by the existing regression suite (which
  already tests closed-period rejection).
- **SoD, Approval Authority, CEO/Admin split, new business domains**: untouched, per this CR's own §26
  "no feature creep" rule.

## 6. Scope assignment model

**Decision: reuse the existing per-user fields (`assignedProjects`, `assignedCustomers`,
`assignedBranches`) and per-record fields (`projectManagerId`, `siteInChargeUserId`) exactly as they
already exist — no new `DB.userScopeAssignments`/generic scope-grant table was created.** Per this
CR's own §8 ("If users/roles already have a scope-assignment structure, reuse it... Do not create
duplicate competing scope models"), these pre-existing fields ARE the real scope-assignment model —
`hasScopeAccess()` is a thin, centralized DISPATCHER over them, not a new model. `DB.roleScopes`
(ARCH-2026-001A, seeded empty) remains empty and unused: ARCH-2026-001A's own design correctly
anticipated a *possible* future generic scope table but did not commit to one, and this CR's own
inspection found the REAL scope model already existed elsewhere in the schema — using it is more
faithful to "reuse, don't invent" than populating a previously-unused generic table would have been.

## 7. Inheritance rules

Documented per-resource in §4. The one genuinely indirect (multi-hop) chain in this application today
is `PaymentRequest → JournalEntry line → projectId` (the exact example named in this CR's own §13) —
implemented and proven against a real created bill + payment request (see
`ARCH-2026-001C-DATA-SCOPE-TEST-REPORT.md`). No other indirect chain was found to be both real and
in-scope for this CR's representative migration slice.

## 8. Remaining legacy checks — final count

`grep -c "role==="`: `domain.js` 14 (unchanged — none of the 78 deferred items used the literal
`role===` string; they used `.includes()`/compound conditions, consistent with 001B's own finding),
`server.js` 89 (was 98 before this CR's 9 literal `role===` eliminations — see
`ARCH-2026-001C-CHANGELOG.md`-equivalent detail in the Implementation Report). **Zero unexplained scope
checks** — every one of the 78 originally-deferred items has an explicit disposition in §3 above.
