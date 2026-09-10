# Production Configuration Sequence

**This is a HANDOVER GUIDE only. Do not execute this sequence against a production environment as part of this engagement — no production deployment or migration has been performed or is authorized here.**

Recommended order for the Appletree accounts team to configure this system with real data, once a real deployment environment is decided:

1. **Install/build** — deploy the `SAP_Architecture_Lab/server/` + `client_secure/` code to wherever it will actually run.
2. **Database initialize** — start from the `HANDOVER_CLEAN_SEED.json` (see `02_DATABASE/` in this package), not from a phase's test data.
3. **Security configuration** — decide and document the real password policy tier (`31_ADMIN_GUIDE.md`), create real Admin/CEO accounts, deactivate the demo accounts.
4. **Users/roles** — create real staff accounts with the correct role per `05_USER_ROLES.md`.
5. **Company configuration** — confirm branch(es), any company-level settings.
6. **Financial periods** — decide the real period calendar (e.g., monthly) going forward.
7. **Chart of Accounts** — import the real COA (`08_CHART_OF_ACCOUNTS_IMPORT.md`).
8. **Tax** — after professional validation, configure real tax codes (`23_TAX_GST.md`).
9. **Banks** — confirm real bank account identity (resolve the …1137/…1112 open item first), import real bank accounts.
10. **Payment methods** — confirm the standard 8 are sufficient or add more.
11. **Cost Centres** — import the real list.
12. **Customers** — import the real customer master.
13. **Suppliers** — import the real supplier master.
14. **Items** — import the real material/item master.
15. **Services** — import real Service Labour Rates.
16. **Projects** — import the real active project list.
17. **Fixed Assets** — bulk-register existing assets, then capitalize each with real historical data and confirmed depreciation policy.
18. **Opening AR** — import real open customer invoices.
19. **Opening AP** — import real open supplier bills.
20. **Opening Inventory** — import real stock quantities/costs.
21. **Opening GL** — import remaining real account balances (Bank, Equity, etc.).
22. **Opening Fixed Assets** — post the capitalization entries from step 17.
23. **Bank opening balance** — confirm the Bank GL balance matches the real bank statement as of the cutover date.
24. **Reconciliation** — verify Debit=Credit, AR=Subledger, AP=Subledger, Inventory=GL, and Opening Balance Equity (account 3000) = 0 (see `10_OPENING_BALANCE_IMPORT.md`).
25. **User UAT** — have real Appletree staff exercise every screen with the real data before relying on it.
26. **Management approval** — formal sign-off on the loaded COA, opening balances, and tax configuration.
27. **Controlled go-live** — begin recording real, live transactions only after steps 1-26 are complete and approved.

This sequence assumes each step's prerequisites are genuinely satisfied before moving to the next — do not skip ahead if an earlier step surfaced an open question (see `34_OPEN_MANAGEMENT_DECISIONS.md`).
