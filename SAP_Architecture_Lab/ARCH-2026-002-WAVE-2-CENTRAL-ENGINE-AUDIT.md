# ARCH-2026-002 — Wave 2 Central Engine Audit

**Date:** 2026-09-22. Wave 2 Phase 0 deliverable, §6. **Result: no shadow writer found. No STOP
condition triggered.**

## 1. GL engine

`postJournalEntry()` (domain.js:2297) — re-confirmed the ONLY `DB.journalEntries.push()` in the entire
codebase is at line 2448, inside this function. Every Wave 2 domain's accounting-relevant transaction
(GRN, Purchase Return, Supplier Bill, Payment Request/Payment, Material Issue, Adjustment, Labour Wages,
Project Expense, Production Labour Cost, Job Work Scrap write-off) posts through it exclusively —
re-verified this pass by direct function-body reads for every one of these, not grep alone.

## 2. Inventory engine

`postInventoryMovement()` (domain.js:4976) — re-confirmed the ONLY `DB.inventoryMovements.push()` is at
line 5009. Re-verified for every Wave 2 inventory-affecting transaction this pass: GRN, Purchase Return,
Material Issue/Return, Transfer, Adjustment, Damage (delegates to Adjustment), Stock Count variance
(delegates to Adjustment, per-line `withTransaction()`), Job Work dispatch/return/scrap/direct-dispatch,
Site Material issue/receipt/return. **Grep for `.stock[` (direct mutation) returns zero hits anywhere.**
Stock remains fully derived, never a stored/mutable balance — structurally prevents a shadow writer.

## 3. Clearing engine

`applyClearing()` (domain.js:3366) — unchanged, Wave 2 transactions do not directly clear (clearing is
a Finance & Accounting function reached via Supplier Payment, out of Wave 2's own domain but correctly
reused, not duplicated, when Wave 2 transactions trigger it).

## 4. Transaction wrapper

`withTransaction()` — confirmed still applied automatically at the request-dispatch layer only
(`server.js:530`/`685`), never called from inside a Wave 2 domain function directly. Explicit
`withTransaction()` usage was also found correctly applied to specific multi-step Wave 2 operations that
need their own internal atomicity beyond the request wrapper: `createBankImportBatch`-style batch loops
(Wave 1, unrelated to Wave 2), Stock Count's per-line adjustment loop (9373), Inventory Transfer's
two-movement pair (rollback-coded manually at 8635-8640 in addition to the outer wrapper).

## 5. Numbering engine

`nextId()`/`nextDocNumber()` re-confirmed as the two centralized mechanisms. **Real, disclosed gap
re-confirmed, not newly discovered**: several Wave 2 collections still generate their internal `id` via
the ad-hoc `array.length+1` pattern rather than `nextId()` — Machines, Job Cards, Dispatches, Deliveries,
Job Workers, Job Work Scrap Records, Job Work Extensions, APOB Declarations, Damage Reports, Stock
Counts, QC Checklists, Snags, Handovers, CAPA Cases, Locations. In every case, the customer/audit-facing
**document number** already uses the safe `nextDocNumber()` — only the internal cross-reference `id` is
at (low-probability, collision-only, not financial-double-posting) risk. This matches the codebase's own
Phase 35 self-disclosure (domain.js:4953-4972), which named this exact remaining bucket and explicitly
did NOT fix it that phase. Full list: `ARCH-2026-002-WAVE-2-DATA-MODEL-GAP-REGISTER.md`.

## 6. Authorization / Data-Scope / SoD / Approval / Audit engines

All confirmed reused, not duplicated, across every Wave 2 domain — `can()`, `hasScopeAccess()`,
`checkSoD()`, `resolveApprovalAuthority()`, `logAudit()`. **No second authorization mechanism found.**
The real, substantive finding this pass is not a second engine but **missing SoD rule coverage on the
existing, correctly-singular `checkSoD()` engine** — see `ARCH-2026-002-WAVE-2-SECURITY-BASELINE.md` §1.
This is a coverage gap, not an architectural duplication.

## 7. Project-cost model

`projectFinancial360`/`companyProjectProfitability` — re-confirmed the sole project-cost aggregation
path. No Wave 2 domain computes a competing project cost/margin figure; every cost-posting function
(Material Issue, Labour Wages, Project Expense, Production Labour Cost) tags `projectId` on its GL lines
and nothing else. `productCosting()`/`jobCostSheet()` (Manufacturing) compute BOM/production-order-level
cost, which is a different, narrower aggregation (per-unit/per-order standard or actual cost) than the
project-level P&L — **not a duplicate**, a legitimately different rollup at a different grain, both
reading the same underlying GL/movement data, neither writing a competing total.

## 8. Duplicate supplier/customer/payment-request/site-material ownership sweep

- **Supplier/Customer**: unchanged, single master (`findOrCreateCustomer`, vendor CRUD) — Wave 2
  transactions only reference these masters, never create a competing record.
- **Payment Request**: single owner confirmed (`ARCH-2026-002-TRANSACTION-OWNERSHIP.md` row 14,
  re-confirmed this pass — no Wave 2 domain function creates a second Payment Request path).
- **Site Material**: single owner re-confirmed this pass by exhaustive grep — `issueToSite`/
  `createSiteMaterialReceipt`/`returnFromSite` are the sole writers; no `DB.siteStock` collection exists
  to have a second owner; no Project-domain function (including `wonTransition`, Change Requests)
  independently touches site material state.

## 9. Conclusion

**No duplicate GL engine. No duplicate inventory engine. No duplicate clearing/transaction/numbering/
authorization/audit/project-cost engine. No new shadow writer found anywhere in Wave 2's 6 domains.**
The one real, substantive class of finding this pass surfaced is a **coverage gap on the existing SoD
engine** (missing rules, not a missing or duplicated mechanism) — reported in full in the Security
Baseline, not fixed here per this CR's own Phase-0-only rule. **No STOP condition (§26 items 2, 3, 4)
was triggered.**
