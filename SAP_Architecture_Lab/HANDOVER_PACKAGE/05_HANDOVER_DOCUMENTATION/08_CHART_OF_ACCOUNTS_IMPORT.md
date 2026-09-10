# 08 — Chart of Accounts Import

**The 13 accounts currently in the system are a development placeholder, not Appletree's real Chart of Accounts.** They exist only so the accounting engine had something real to post against while it was being built and tested. Replace them with the real chart before going live.

## How to import
Go to **Finance → Master Data Import**, select **ChartOfAccounts**, and paste CSV data with this template:

| Field | Required? | Type | Example | Validation | Duplicate Rule | Accounting Impact | Notes |
|---|---|---|---|---|---|---|---|
| accountCode | Yes | Text | `TEST1010` | Must be unique | Rejected if code already exists | Becomes the GL account ID used on every posting | Use your real chart's numbering scheme |
| accountName | Yes | Text | `TEST Petty Cash` | — | — | Display name only | |
| accountType | Yes | Enum | `Asset` | Must be Asset / Liability / Income / Expense | — | Determines Balance Sheet vs P&L placement | |
| parentAccount | No | Text | (blank) | Must reference an existing account code if supplied | — | For hierarchy/rollup reporting | Not yet used by any report — safe to leave blank |
| controlAccount | No | true/false | `false` | — | — | Flags a subledger control account (AR/AP/Inventory already exist) | |
| taxRelevant | No | true/false | `false` | — | — | Informational only currently | |
| projectRelevant | No | true/false | `true` | — | — | Informational only currently | |
| costCentreRelevant | No | true/false | `false` | — | — | Informational only currently | |
| profitCentreRelevant | No | true/false | `false` | — | — | Informational only currently | |

**Every example value above is clearly marked TEST — do not import these as real accounts.**

## What is protected automatically
- A duplicate account code is REJECTED, never silently overwritten.
- The system's own technical accounts (1100 AR, 2000 AP, 1200 Inventory, 2050 GR/IR, 3000 Opening Balance Equity, 1400/1450/5400/5500 Fixed Assets) are already in use by the posting engine — do not attempt to reimport or renumber these; if your real chart needs different numbers for these concepts, that is a code-level remapping exercise, not a CSV import (contact whoever maintains this build).
- Every posting is validated against the live account list — a typo'd or non-existent account code is always rejected at posting time, never silently accepted.

## Reconciliation before go-live
After importing the real chart, confirm: every account you expect to use appears in Trial Balance/Journal Entry account dropdowns; Bank/Inventory/Fixed Asset postings still map to the accounts you intend (re-check `17_FIXED_ASSETS.md` and `12_INVENTORY.md` if you changed the technical account numbers).
