# 10 — Opening Balance Import

Screen: **Finance → Opening Balances**. API: `POST /api/opening-balance/import` (Admin/CEO to import; FinanceManager/CEO/Admin to post).

## The workflow (do not skip steps)
```
Import (CSV)  →  Validate  →  creates a DRAFT  →  Submit  →  Approve  →  Post  →  Reconcile
```
Importing does **not** post anything to the ledger — it only creates Draft documents. An accountant must then Submit, a FinanceManager/CEO/Admin must Approve, and (someone other than the creator, per Segregation of Duties) must Post — through the exact same **Document Workflow** screen used for every other transaction in the system. This is deliberate: opening balances get the same control discipline as live transactions, no shortcuts.

## Templates

### Opening AR
| Field | Required | Example | Validation | Duplicate Rule |
|---|---|---|---|---|
| customerId | Yes | CUST-1 | Must reference an existing customer | |
| invoiceRef | Yes | INV-2025-0341 | | Same customer + same invoiceRef rejected as a duplicate on a second import |
| invoiceDate | Yes | 2026-01-15 | Must be YYYY-MM-DD | |
| dueDate | No | 2026-02-14 | | |
| amount | Yes | 45000 | Must be a positive number | |
| project | No | PRJ-1 | Must reference an existing project if supplied | |

Posts Dr Accounts Receivable / Cr Opening Balance Equity (3000), tagged to the customer — it appears immediately as a real open item in AR Ageing once posted, exactly like a live invoice.

### Opening AP
Same shape as Opening AR: `vendorId, billRef, billDate, amount, project`. Posts Dr Opening Balance Equity / Cr Accounts Payable.

### Opening Inventory
| Field | Required | Example | Validation |
|---|---|---|---|
| materialId | Yes | MAT-1 | Must reference an existing item |
| warehouseId | Yes | WH-1 | Must reference an existing warehouse |
| qty | Yes | 100 | Must be positive |
| unitCost | Yes | 2800 | Must be ≥ 0 |

Posts Dr Inventory / Cr Opening Balance Equity **and** creates the real stock movement — but only once the draft is actually Posted, not at import time, so stock quantity and its backing accounting entry always change together.

### Opening GL Balances
| Field | Required | Example | Validation |
|---|---|---|---|
| accountCode | Yes | 1000 | Must be a real account; **AR/AP/Inventory control accounts are rejected here — use the templates above instead**, to keep the subledger and the control account in sync |
| amount | Yes | 200000 | Must be positive |
| drCr | Yes | DR | Must be DR or CR |

Use this for everything else — Bank opening balance, existing loans, capital, etc.

### Opening Fixed Assets
Register via the Fixed Assets bulk import (`09_MASTER_DATA_IMPORT.md`), then capitalize each one individually with its real historical cost, capitalization date, and (if it already has some depreciation) the accountant must decide how to reflect existing accumulated depreciation — this system does not assume a formula for pre-existing depreciation; see `17_FIXED_ASSETS.md`.

## Reconciliation
The Opening Balances screen shows the live balance of account 3000 (Opening Balance Equity). **Once every real opening balance is imported and posted, this should be exactly zero.** A non-zero balance means either more opening entries remain, or something was entered incorrectly — the system will never silently force this to zero for you.
