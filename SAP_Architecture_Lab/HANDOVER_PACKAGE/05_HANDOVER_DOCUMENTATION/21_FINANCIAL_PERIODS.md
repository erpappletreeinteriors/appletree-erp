# 21 — Financial Periods

Screen: **Finance → Financial Periods**.

## Creating and closing a period
Create a period with a name and Start/End date (any date range you choose — typically a calendar month). A date with **no** period record covering it is always open — periods are opt-in, they never retroactively block anything you haven't explicitly closed.

Closing a period requires a reason and immediately blocks **any** new posting dated inside it — Journal, AR, AP, Receipt, Payment, GRN, Inventory, Fixed Assets, Bank Allocation, Reversal — every single document type, because they all funnel through the one shared posting engine (`03_ACCOUNTING_ARCHITECTURE.md`).

## Reopening
Only FinanceManager, CEO, or Admin can reopen a closed period, and only with a stated reason — fully audited. This is the normal, safe way to make a genuine correction to a closed month: reopen, post the correction, close again.

## Authorized Override (advanced — requires management decision)
A period can optionally have a specific role designated as its "Override Role" — that role can then post directly into the closed period **with a mandatory reason**, without reopening it for everyone else. **By default, no override role is configured on any period** — closed genuinely means closed for everyone until management explicitly decides which role, if any, should have this power. This is intentional: the system will never invent this decision for you.

## Before closing a period — reconciliation checklist
The Financial Periods screen's "Reconciliation" action checks: Trial Balance for that period's postings, AR/AP subledger vs control, Inventory vs GL, unmatched bank statement lines, and AMC billed/recognized/deferred consistency — surfacing any issue in plain language before you close, never hiding a discrepancy.

## Tested scenarios
Unauthorized user posting into a closed period → blocked. Authorized override role WITHOUT a reason → still blocked. Authorized override role WITH a reason → succeeds, fully audited with the real document reference. Direct API manipulation and ID tampering → both blocked, same as the UI.
