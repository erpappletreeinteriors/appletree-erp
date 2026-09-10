# ACCOUNTANT UAT — PHASE 29 PACKAGE

Use this package together with the existing `ACCOUNTANT_UAT_PACKAGE/` from Phase 25 (which covers login, basic navigation, and the original core modules). This Phase 29 package adds scenarios for everything built in Phase 28 (Purchases Intelligence, Inventory Operations, Operations, Factory/MES) plus the full end-to-end business flow.

**Rules for every scenario below:**
- Use only test/demo data. Never enter real Appletree customer, supplier, or financial data.
- Write down exactly what happened, even if it's not what you expected. "It let me do X and I don't think it should have" is a valid and useful result.
- For each numbered step, mark: **PASS** (worked as expected), **FAIL** (didn't work, or gave a wrong number), or **CONFUSING** (worked, but you weren't sure what it meant or where to find something).

## Files in this package

1. `01_SALES_AND_PROJECT_SETUP.md` — Lead through to a live Project
2. `02_PROCUREMENT_AND_INVENTORY.md` — Purchase Orders through Returns, Damage, Stock Counts, Locations
3. `03_FACTORY_AND_LABOUR.md` — Production, Job Cards, Machines, Labour & Wages, Project Expenses
4. `04_BILLING_AND_FINANCE.md` — Customer billing, receipts, and the Project Profit & Loss screen
5. `05_AFTER_SALES_AND_REPORTS.md` — Warranty, Service, the new dashboards and reports
6. `06_SECURITY_AND_REVERSAL.md` — What you should and shouldn't be able to do, and how to undo a mistake

## Known issues already found (so you don't waste time re-reporting them)

- On the **Project 360** screen, the "Actual Cost" number in the top summary box can differ slightly from the "Actual Cost" number further down in the "Cost" section, if the project has any Project Expenses recorded. The top summary is the correct/complete one. This is already logged for a future fix.
- A negative quantity typed into "Issue Material" is currently accepted instead of being rejected. Please don't type negative quantities during testing — if you do it by accident, tell us the exact project/material so we can check the data.
- Creating a Purchase Order or entering figures for a project that doesn't exist may return blank/zero results instead of a clear error on a couple of report screens. This is cosmetic, not a money-safety issue.
