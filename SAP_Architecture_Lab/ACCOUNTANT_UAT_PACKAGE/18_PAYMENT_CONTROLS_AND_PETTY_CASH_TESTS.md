# PAYMENT CONTROLS & PETTY CASH TESTS (new — Finance SOP)

Menu: **FINANCE SOP → Payment Requests**, **FINANCE SOP → Petty Cash**, **FINANCE SOP → ITC / BOQ Reports**

## Payment Maker-Checker

1. **Raise a Payment Request** against a real open supplier bill.
2. **Try to approve your own payment request** (log in as the same user who raised it) — confirm this is refused.
3. **Approve it as a different, appropriately senior person.**
4. **Try to execute the payment as the SAME person who raised it, or the same person who approved it** — confirm both are refused. A genuine third person must execute it.
5. **Execute the payment as a third person** — confirm a real Journal entry number comes back, and the supplier's outstanding balance goes down.

## Cash Payment Limits

6. **Try to pay a supplier ₹15,000 in cash** (select "Cash" as the payment method) — confirm this is REFUSED, citing the ₹10,000/day limit.
7. **Try the same payment but as a Finance Manager with an override reason typed in** — confirm it now succeeds, and check the reason is recorded somewhere auditable.
8. **Try the identical ₹15,000 payment on a BANK TRANSFER instead of Cash** — confirm it succeeds normally (the cash limit should only ever apply to genuinely cash-tagged payments).

## Petty Cash

9. **Create a Petty Cash Float** for a site (default should be ₹10,000 if you don't type a different amount).
10. **Record a voucher WITHOUT an original bill reference** — confirm this is refused ("no unconditional top-up").
11. **Record a voucher WITH a bill reference**, for ₹2,000.
12. **Reconcile the float** and confirm it shows expected cash on hand = float amount minus vouchers recorded.
13. **Try to record a voucher for ₹15,000** (over the daily cash limit) — confirm this is refused too; the petty cash float doesn't create any exception to the cash limits.
14. **Replenish the float** and confirm a real Journal entry is created for the replenished amount.

## Input Tax Credit (ITC) Reversal

15. **Record a Damage Report** for a material that was purchased with GST on it.
16. **Check the ITC Reversal report** — confirm a new line appears showing the tax credit reversed for that damage, and that the amount looks like a reasonable percentage of the damaged material's value.

## BOQ / BOM Variance

17. **Load the BOQ Variance report** for a project that has an approved Bill of Materials and has had some material issued against it. Confirm it shows Estimated Quantity, Actual Quantity, and a Variance % for each material — and that nothing gets automatically posted to the accounts from this report (it's for review only).
