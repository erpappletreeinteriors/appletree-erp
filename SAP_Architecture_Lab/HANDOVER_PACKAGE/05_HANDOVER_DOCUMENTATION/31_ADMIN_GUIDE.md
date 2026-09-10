# 31 — Admin Guide

## Pre-configured demo accounts (change or replace before real use)
| Username | Role | Password |
|---|---|---|
| admin | Admin | Admin@12345 |
| ceo | CEO | Ceo@12345 |
| accountant1 | Accountant | Acc@12345 |
| finance1 | FinanceManager | Fin@12345 |
| pm1 | ProjectManager | Pm@123456 |
| purchase1 | Purchase | Pur@12345 |
| sales1 / sales2 | Sales | Sal@123456 / Sal2@12345 |
| estimator1 | Estimator | Est@12345 |
| viewer1 | Viewer | View@1234 |

**These are demo credentials for an offline development build. Change every password (or create fresh real accounts and deactivate these) before this system is used for real Appletree data.**

## Creating a real user — ADMIN ACTION
Admin → Create User (or `POST /api/admin/users`): username, name, role, password (must meet the strong-password rule: 8+ chars, upper, lower, digit, special character).

## Resetting a locked/forgotten password — ADMIN ACTION
Admin → Reset Password for that user. Clears the lockout too.

## Master data / imports — ADMIN or CEO ACTION
Chart of Accounts, Customers, Suppliers, Items, Projects, Cost Centres, Banks, Tax Codes, Payment Methods, Fixed Assets, Service Rates — all via Master Data Import (`09_MASTER_DATA_IMPORT.md`).

## Financial Periods — FINANCE MANAGER / CEO / ADMIN ACTION
Create/Close/Reopen. Configuring an Override Role for a specific closed period is CEO/ADMIN ONLY (the single most sensitive configuration action in the system).

## Backup / Restore — ADMIN or CEO ACTION ONLY
See `28_BACKUP_RESTORE.md`.

## Document series / numbering
No manual configuration needed — resets automatically each Indian Financial Year for every document type. See `22_DOCUMENT_NUMBERING.md`.

## Audit — ADMIN or CEO ACTION (view only, nothing can be edited)
Reports → Audit Log.

## Security — nothing to configure day-to-day
RBAC and Segregation of Duties are built into the code, not a configuration screen — see `06_SECURITY.md`. If Appletree's real role needs ever diverge from the 9-role model here, that requires a developer to change the code, not an admin setting.

## Exports
Available to most roles for their own scope; full Ledger export restricted to GL-visible roles (Admin/CEO/Accountant/FinanceManager).
