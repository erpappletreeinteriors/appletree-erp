# PHASE 28 — MISSING MODULES BUILD
## Closing the gap against the offline ERP's Purchases / Inventory / Operations / Factory-MES groups

**Scope discipline:** work confined to `SAP_Architecture_Lab/server/domain.js`, `server/server.js`, `client_secure/index.html`, plus one new permanent test file. Real ERP, offline ERP, and every prior frozen phase's report untouched. `PHASE28_CHECKPOINT/` taken before any change. Only temporary/demo data used throughout.

---

## 1. Background

A side-by-side comparison of the offline ERP's sidebar (`appletree_erp_offline.html`) against the Lab's nav found ~20 modules with no counterpart in the Lab, concentrated in four areas: Purchases Intelligence (Procurement Intelligence, Vendor Rating, Purchase & Vendor Report), Inventory Operations (Material Issues screen, Returns, Damage Reports, Stock Report, Locations, Stock by Location, Stock Counts), Operations (Labour & Wages, Project Expenses, QC Dashboard, Project Timesheet, Tasks, Risk Register, Weekly Scorecard), and Factory/MES (Factory Dashboard, Machines, Job Cards, Production Schedule, Job Analysis, Job Cost Sheet, Product Costing, Labour Performance). CEO approved building all of it into the Lab.

## 2. Architecture Principle Followed Throughout

**No second accounting or inventory engine was created.** Every module that has a real cost/value impact routes through mechanisms that already existed:
- **Damage Reports** and **Stock Counts** are purpose-built front ends over the *existing* `createInventoryAdjustment()` — same reason-required discipline, same GL treatment (Dr/Cr 5300↔1200), same engine. Not a new write-off mechanism.
- **Labour & Wages** and **Project Expenses** call `postJournalEntry()` directly, exactly like `postProductionLabourCost()` already did — posting to two previously-*existing-but-unused* chart-of-accounts entries (5100 Labour Cost, 5200 Site Expense) that had been sitting in the seed data since Phase 5/13 with nothing ever posting to them.
- **Locations** is a purely additive, optional dimension: `postInventoryMovement()`, `createGRN()`, `createMaterialIssue()`, and `getStockLevel()` all gained an optional `locationId` parameter that defaults to `null` — every one of the 878 pre-existing tests calls these functions exactly as before and is completely unaffected.
- Everything else (Tasks, Risk Register, Timesheet, Machines, Job Cards, Procurement Intelligence, Vendor Rating, Purchase & Vendor Report, Stock Report, QC Dashboard, Factory Dashboard, Job Analysis, Job Cost Sheet, Product Costing, Labour Performance, Production Schedule, Weekly Scorecard) is either pure operational record-keeping with zero GL impact, or a read-only computed report derived entirely from data the engine already tracks (no new posting, no re-derivation of an existing number a different way).

Verified: `grep -c "DB.journalEntries.push"` = **1**, unchanged. `postJournalEntry(` still funnels through the exact same single choke point.

## 3. What Was Built

| Area | Modules | New posting? |
|---|---|---|
| Purchases Intelligence | Procurement Intelligence, Vendor Rating, Purchase & Vendor Report | No — read-only, computed from existing PO/GRN/Invoice data |
| Inventory Operations | Material Issues screen, Returns screen, Damage Reports, Stock Report, Locations, Stock by Location, Stock Counts | Damage Reports & Stock Counts reuse `createInventoryAdjustment()`; the rest are UI/read-only |
| Operations | Labour & Wages, Project Expenses, QC Dashboard, Project Timesheet, Tasks, Risk Register, Weekly Scorecard | Labour & Project Expenses post via `postJournalEntry()`; the rest have no GL impact |
| Factory/MES | Factory Dashboard, Machines, Job Cards, Production Schedule, Job Analysis, Job Cost Sheet, Product Costing, Labour Performance | No new posting — Job Cost Sheet/Product Costing are computed strictly from data Production Orders/BOMs already track on themselves |

Two pre-existing backend functions had no UI at all (`createPurchaseReturn`, and `createMaterialIssue` only reachable via a Service Visit) — both now have real screens using their existing, unmodified logic.

## 4. A Real Latent Defect Found and Fixed Along the Way

Registering the five new document-numbering codes (DMG/SCT/LBR/PEXP/JC) only in the runtime migration-guard block (the pattern every prior phase used for *existing* saved databases) was not enough — `/api/test/reset` calls `freshDB()`, which rebuilds `glDocumentTypes` from the **base seed array**, not from the migration guards. The first live test showed Labour Wages posting under a generic "JV" voucher number instead of "LBR" — traced to this gap and fixed by adding the five codes to the base seed array as well, matching the exact pattern already established for BXFR/SDN/FA/OB in earlier phases (both a seed entry AND a load-time migration guard). Caught before writing any permanent test, via a manual live API check, not by assumption.

## 5. Live Verification

**47/47 new permanent tests pass** (`phase28_modules_tests.js`), each asserting a hand-calculated expected value, not just "no error" — e.g. Labour Wages Dr 5100 = exactly 5×800=₹4,000; Damage Report value = exactly 2×2,800=₹5,600; Stock Count variance = exactly -2; Job Cost Sheet material cost = exactly 3×2×1.05×2,800=₹17,640; Product Costing = exactly 2×1.05×2,800=₹5,880.

**Full real-browser walkthrough performed** (not API-only): logged in as Accountant/Admin, navigated all 25 new tabs and confirmed each renders with real data and no console errors; filled and submitted the Labour & Wages form through real DOM interaction (correct voucher `LBR/2026-27/0001`); filled the Damage Reports form including the conditional "Other" explanation field toggling correctly; started and submitted a real Stock Count session through its dynamically-rendered per-line input; confirmed the resulting Stock Report reflected the exact combined effect of a GRN receipt (+20), a damage report (-2), and a stock-count variance (-1) = 17 units, to the unit.

## 6. Full Regression

**925/925 PASS, 0 FAIL** across the complete suite (34 files: every pre-Phase-28 test unchanged and still passing, plus the new 47) + **1,089/1,089 security matrix** (unchanged from Phase 27 — no new role permissions were added or altered; the 5 new manager-tier/PM-scoped gates on Labour Wages/Project Expenses/Damage Reports/Stock Count submission all reuse existing permission tiers, never a new one).

## 7. Security / RBAC

No new security model. Damage Reports and Stock Count *submission* require the same manager tier (Admin/CEO/FinanceManager) as a manual Inventory Adjustment — deliberately not weakened to Purchase tier just because a Purchase user might discover the damage; Stock Count *creation* (the count session itself, before any value judgment) is open to Purchase, matching real workflow. Labour Wages/Project Expenses/Timesheet/Tasks/Risk Register all reuse the established Admin/CEO-or-assigned-PM pattern from Production Orders — verified live that a PM not assigned to a project is denied recording wages against it.

## 8. Before/After File Integrity

| File | Phase 27 checksum | Phase 28 checksum |
|---|---|---|
| `server/server.js` | `ee726cf9...` | `50f57e53...` |
| `server/domain.js` | `67da52e7...` | `9d7ef799...` |
| `client_secure/index.html` | `014c6175...` | `87a8f297...` |

No other file touched. `PHASE28_CHECKPOINT/` holds the pre-build snapshot.

## 9. Disclosed, Not Invented

- **Vendor Rating**'s composite score weighting (50% on-time / 30% quality / 20% spend-scale) is explicitly labeled in the UI and API response as "a disclosed default weighting, not an approved Appletree policy" — the same discipline already used for `maxFuturePostingDays`.
- **Product Costing**'s labour/overhead allocation (15% of material cost) is explicitly labeled "not an approved Appletree costing policy" in both the API response and the screen itself.
- Neither of these blocks usage (unlike a hard `BUSINESS POLICY REQUIRED` rejection elsewhere in the Lab) because they're read-only analytical estimates, not accounting postings — but they are never presented as authoritative fact.

## 10. Not Done / Out of Scope

- No changes to any already-frozen Phase 20-27 behavior.
- Locations remain genuinely optional — no existing GRN or Material Issue call was forced to start using one; only newly-created ones can opt in.
- No attempt was made to replicate the offline ERP's HR & Payroll, Financial Statements, or Banking & Accounts groups — those were not part of the four groups the CEO's screenshots identified as missing.

## 11. Status

All ~20 identified missing modules are now built, live-tested through the real UI, covered by permanent regression tests, and verified not to have introduced a second accounting engine, weakened any existing control, or regressed any of the 878 pre-existing tests. Per the established pattern of this engagement, this is a build-and-verify phase — it does not itself constitute a new UAT readiness claim; the Phase 27 "READY FOR ACCOUNTANT UAT" verdict stands for the accounting core, and these new modules would need their own accountant walkthrough as part of that same UAT before being called UAT-verified.

---

*Real ERP, offline ERP, and every prior frozen phase's report confirmed untouched throughout.*
