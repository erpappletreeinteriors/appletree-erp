# MIGRATION READINESS CHECKLIST

**Status: rehearsal completed with masked/synthetic data only (Phase 21). No real Appletree data has been migrated.**

| Data Type | Import Mechanism Ready? | Rehearsed? | Notes |
|---|---|---|---|
| Chart of Accounts | Yes — `MASTER_IMPORT_SPECS.ChartOfAccounts` | Not explicitly rehearsed | Validated field-level (code/name/type/parent) |
| Customers | Yes | **Rehearsed** (Phase 21, 3 synthetic records, exact count match) | Duplicate-name prevention confirmed |
| Suppliers | Yes | **Rehearsed** (Phase 21) | |
| Materials | Yes, incl. UoM conversion fields | **Rehearsed** (Phase 21) | `purchaseUom`/`purchaseConversionFactor` importable |
| Opening Balances (AR/AP/Inventory/GL) | Yes — dedicated Opening Balance Engine | **Rehearsed** (Phase 21, incl. a full rollback-before-commit test) | Reuses the standard Draft→Approve→Post lifecycle; account 3000 balancing to zero is the reconciliation proof |
| Fixed Assets | Yes | Not explicitly rehearsed | |
| Projects | Yes | **Rehearsed** (Phase 21) | |
| Cost Centres | Yes | Not explicitly rehearsed | |
| Bank Accounts | Yes, now with mandatory `glAccount` (Phase 24) | Not explicitly rehearsed with the new mandatory field | Template updated |
| Historical transaction references | N/A | Not applicable — no historical transactions exist to migrate | |

## What Was Proven (Phase 21 rehearsal, masked data)

- Per-row validation: one invalid row is rejected on its own; valid rows in the same batch still succeed.
- Source count = imported count, for every master type tested.
- No duplicate records created.
- Opening balance import is **reversible before commit** (a draft can be cancelled with zero GL impact) and produces a real, traceable posted entry once committed.

## What Remains — Cannot Be Closed Without Real Data

- A rehearsal using **real or masked-real Appletree data** (not synthetic placeholder records).
- Source-total vs. migrated-total reconciliation for every real balance (AR, AP, Inventory, GL, Fixed Assets).
- A real cutover rehearsal (extract → transform → validate → import → reconcile → go-live) end to end.

**Target for real migration: ZERO unexplained difference between source and migrated totals, for every balance.** This has not yet been attempted with real numbers to compare against.
