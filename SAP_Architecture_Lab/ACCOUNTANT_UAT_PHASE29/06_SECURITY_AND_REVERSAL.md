# 6. Security & Correcting Mistakes

## 6.1 Reversing a Mistake
Post a small test Journal Voucher on purpose (e.g. a made-up ₹100 entry). Then reverse it from the Journal Register. Confirm:
- The original entry now shows as reversed.
- A new reversing entry appears, with opposite Debit/Credit.
- The Trial Balance still balances.

## 6.2 Try to Approve Your Own Work
Create a document (e.g. a Journal Voucher) as one user, then try to approve or post it while still logged in as that same user. You should be blocked — someone else (or a manager override) must approve it.

## 6.3 Try to Bill a GRN Twice
Using a GRN you've already fully billed in Part 2, try to enter another Supplier Bill against the exact same GRN for the same quantity. It should be rejected.

## 6.4 Try to Overbill
Try to enter a Supplier Bill for MORE than a GRN actually received. It should be rejected.

## 6.5 Try a Negative or Zero Quantity
Try entering a negative or zero quantity anywhere that accepts a quantity (Material Issue, Damage Report, Stock Count, Labour days). Most places should reject it. If "Issue Material" accepts a negative number, please note that down — this is a known issue already being tracked, and we want to confirm exactly where it shows up.

## 6.6 Try to See Another Role's Data
Log in as a Sales user and try to open **Labour & Wages** or **Factory Dashboard** — these are not part of a Sales role and you should be denied.

## 6.7 Closed Period
If a Financial Period has been closed for testing, try to post a transaction dated inside that closed period. It should be blocked with a clear message.
