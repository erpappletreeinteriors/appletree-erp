# PHASE 38 — AR/AP Subledger Reconciliation

**Date:** 2026-09-11. Live-pulled from `/api/reconciliation` on the disposable isolated server, at
the end of the full E2E run (procurement-to-pay + sales-to-cash + 110-document stress test).
`reconcileAR()`/`reconcileAP()`/`reconcileOutputTax()`/`reconcileInputTax()`/
`reconcileCustomerAdvances()` each independently compare a subledger-derived total (summing open
items from `customerOpenItems()`/`supplierOpenItems()`/tax-account source lines) against the GL
control account's own balance.

| Check | Subledger Total | Control Account Balance | Non-subledger/non-source lines | Result |
|---|---|---|---|---|
| AR (Accounts Receivable, acct 1100) | ₹202,954.10 | ₹202,954.10 | 0 | **MATCHES** |
| AP (Accounts Payable, acct 2000) | ₹66,080.00 | ₹66,080.00 | 0 | **MATCHES** |
| Output GST (acct 2200) | ₹41,759.10 | ₹41,759.10 | 0 | **MATCHES** |
| Input GST (acct 1300) | ₹25,200.00 | ₹25,200.00 | 0 | **MATCHES** |
| Customer Advances (acct 2100) | ₹0.00 | ₹0.00 | 0 | **MATCHES** (none posted this phase) |

**Every check reports `nonSubledgerLines`/`nonSourceLines: 0`** — meaning no journal line hit these
control accounts through any path OTHER than the recognized subledger-generating functions
(`draftCustomerInvoice`/`postCustomerReceipt`/`draftSupplierInvoiceFromPO`/`draftSupplierInvoice`/
`postSupplierPayment`/tax-calculation code), for the entire duration of this phase's activity
(procurement chain, sales chain, 15 concurrent-request test, 110-document stress batch). A non-zero
count here would indicate a manual JE or some other path posting directly to a control account
without a matching subledger entry — none was found.

## What this proves, and what it doesn't

This confirms, with live numbers rather than code inspection alone, that the control-account
balances the Trial Balance and Balance Sheet report are NOT a second, independently-maintained
number that could drift from the underlying open-item detail — they are provably the same figure,
recomputed two different ways (subledger detail sum vs. GL account balance) and shown to agree to
the paisa. It does not, by itself, prove every historical transaction ever posted to this codebase
reconciles (only the activity generated during this phase's own test run is covered) — but combined
with the forensic finding that `postJournalEntry()`/`postInventoryMovement()` are the sole write
paths for these collections (see `PHASE38_ACCOUNTING_TRACE_REPORT.md`), there is no structural
mechanism by which a future transaction could desync them either.

## Bank/cash and Fixed Assets

Not independently reconciled this phase (no bank transfer, petty cash, or fixed asset transaction
was posted in this phase's E2E run) — see `PHASE38_END_TO_END_TRACEABILITY_MATRIX.md` for the
explicit "NOT TESTED THIS PHASE" disclosure on Banking and Fixed Assets.
