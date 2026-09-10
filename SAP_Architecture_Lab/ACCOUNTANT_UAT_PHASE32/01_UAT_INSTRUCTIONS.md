# UAT Instructions — Phase 32 Package

This is the final test package before real Appletree staff use this system. Please read this page fully before starting.

## What this system is
A separate, experimental test copy of an ERP built on SAP-style accounting principles. It is **not** your live Appletree system and **not** connected to it in any way. Nothing you do here affects real company data.

## What to test with
Use only made-up test data — a fake customer name, a fake supplier, round numbers. Never type in real customer names, real amounts, or real supplier details.

## How to record results
For every test in this package, write down one of:
- **PASS** — worked exactly as expected
- **FAIL** — did not work, gave a wrong number, or let you do something it shouldn't have
- **CONFUSING** — it worked, but you weren't sure what it meant, where to find something, or whether the number was right

A **CONFUSING** result is just as useful as a FAIL — please don't mark something PASS just because it didn't crash.

## Login
Use the test accounts your project lead gives you. Do not share passwords. If your test account doesn't have access to something you think you need, tell your project lead rather than trying another account.

## Files in this package
- `02_ACCOUNTING_TESTS.md` — journal entries, ledgers, trial balance
- `03_PURCHASE_TESTS.md` — purchase orders through supplier bills
- `04_INVENTORY_TESTS.md` — GRN, material issue, requirements, BOM budget
- `05_PROJECT_TESTS.md` — creating and tracking a project
- `06_FACTORY_TESTS.md` — production, job cards, machines
- `07_SITE_TESTS.md` — labour, project expenses, site activity
- `08_BILLING_TESTS.md` — customer invoices and receipts
- `09_AR_AP_TESTS.md` — outstanding balances and ledgers
- `10_BANK_TESTS.md` — bank and cash accounts
- `11_REPORT_TESTS.md` — Balance Sheet, Company P&L, Project P&L
- `12_SECURITY_TESTS.md` — what you should and shouldn't be able to do
- `13_RECONCILIATION_TESTS.md` — checking the numbers agree with each other
- `14_DEFECT_REPORT_TEMPLATE.md` — how to report a problem you find
- `15_UAT_SIGNOFF.md` — the final sign-off sheet

## Known issues already found and fixed this phase (for your awareness)
- A fabricated customer, supplier, or vendor ID used to silently create a real document — found and fixed. If you ever see a document referencing a customer/supplier/material that clearly doesn't exist, please report it immediately regardless.
- Issuing more material than a project's Bill of Materials allows now requires management authorization (a reason, or an Admin/CEO/Finance Manager login) — this is intentional, matching real company practice, not a bug.
