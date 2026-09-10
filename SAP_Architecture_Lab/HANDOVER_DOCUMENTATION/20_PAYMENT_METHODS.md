# 20 — Payment Methods

## 8 standard methods pre-configured
Cash, Cheque, Bank Transfer, NEFT, RTGS, IMPS, UPI, Card.

## What they do — and importantly, what they do NOT do
Tagging a Receipt or Payment with a Payment Method is **purely informational/reconciliation metadata**. It never changes which GL account the transaction posts to — every Receipt still posts Dr Bank / Cr AR, and every Payment still posts Dr AP / Cr Bank, regardless of which method is selected. This was a deliberate, tested design decision (Phase 19) so that adding methods can never accidentally misroute real accounting.

## Adding a new method
Use Master Data Import (`09_MASTER_DATA_IMPORT.md`, Payment Methods template) if a real need arises for a method not in the standard 8 (e.g., a specific wallet or a named bank transfer variant).

## Where they appear
Optional dropdown on Customer Receipt and Supplier Payment screens; recorded on the resulting journal entry for later reporting/reconciliation.
