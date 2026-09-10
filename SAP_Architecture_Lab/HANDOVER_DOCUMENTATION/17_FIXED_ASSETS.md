# 17 — Fixed Assets

Screen: **Finance → Fixed Assets**.

## Lifecycle
**Purchase** (register the asset — name, class, purchase date, cost, location, custodian; no GL impact yet) → **Capitalize** (the real accounting event) → **Depreciate** (repeatable, one entry per period) → **Transfer** (location/custodian change, no GL impact) → **Dispose** (removes cost and accumulated depreciation, books the real gain or loss).

## Capitalization — accounting policy is NEVER assumed
When you capitalize an asset, you must explicitly provide:
- **Useful Life** (in months)
- **Depreciation Method** (e.g. "StraightLine")
- **Residual Value** (enter 0 if genuinely nil — never left blank)

If any of these is missing, capitalization is **rejected** with a clear "ACCOUNTING POLICY REQUIRED" message. The system will never guess a useful life or pick a depreciation method for you.

## Depreciation
If the method is "StraightLine," the monthly amount is automatically calculated as (Cost − Residual Value) ÷ Useful Life Months — you can still override the amount for a specific period if needed. Any other method requires you to enter the amount manually each time, since this system does not assume a formula for a method it wasn't told about.

## Disposal
Enter the disposal date and any proceeds received. The system calculates the Net Book Value at that moment (Cost − Accumulated Depreciation) and automatically posts the correct Gain or Loss.

## GL Accounts used
1400 (Fixed Assets — Cost), 1450 (Accumulated Depreciation), 5400 (Depreciation Expense), 5500 (Gain/Loss on Disposal) — four accounts added specifically for this module, since none of the original 13 accounts correctly represented these concepts.

## Reconciliation
**Fixed Assets → Load Reconciliation** proves the Asset Register's total cost and accumulated depreciation exactly match the General Ledger — always, by construction, since every lifecycle action posts through the same central accounting engine as everything else.

## Existing (pre-system) assets
See `10_OPENING_BALANCE_IMPORT.md` — register via bulk import, then capitalize each with its REAL historical cost/date/policy. Existing accumulated depreciation on an asset acquired before this system's use requires an accounting decision on how to reflect it — do not assume.
