# 19 — ICICI Import Guide

This importer was built and tested against a REAL ICICI "Detailed Statement" export (121 real transactions, tested individually, not sampled).

## Required CSV columns (exact header names)
`No, Transaction ID, Value Date, Txn Posted Date, Cheque No, Description, Cr/Dr, Transaction Amount, Available Balance`

| Column | Maps to | Notes |
|---|---|---|
| No | Row number | For your own reference |
| Transaction ID | Bank Transaction ID | The unique key used for duplicate detection |
| Value Date | Value Date | Format `DD/MM/YYYY` |
| Txn Posted Date | Posted Date + Time | `DD/MM/YYYY HH:MM:SS AM/PM` |
| Cheque No | Cheque Number | `-` if none |
| Description | Raw bank description | Preserved exactly, never altered — always available for audit |
| Cr/Dr | Credit/Debit indicator | Must be exactly `CR` or `DR` |
| Transaction Amount | Amount | Numeric |
| Available Balance | Running balance after this transaction | Used to validate the import — see below |

## Import steps
1. Export your real statement from ICICI in this format (or convert it to match — the column names must match exactly).
2. Go to **Finance → ICICI Bank Import**, select the Bank Account, optionally enter the statement's own printed account number for cross-checking, paste the CSV, click Import.
3. Review the row count, duplicate count, and any balance mismatches shown immediately.
4. Work through the transaction list: Match against an existing document, Allocate a new entry, Exclude with a reason, or confirm a Returned transaction.
5. Check the Reconciliation Summary before considering the period reconciled.

## Duplicate handling
Re-importing the same statement (or an overlapping date range from a later export) will correctly flag every already-seen transaction as a Duplicate — nothing is double-counted.

## Returned payment handling
See `18_BANK_RECONCILIATION.md`.

## KNOWN OPEN ITEM — bank account identity
The real statement tested during development showed an account number ending **...1137**. The Bank Account record already configured in this system (from an earlier reference document) ends **...1112**. **This discrepancy has been deliberately left unresolved** — the system does not silently assume they are the same account or merge them. Before real use, Appletree's accounts team must confirm: is this the same account (and one of the two numbers was a transcription error), or are there genuinely two ICICI accounts? Whichever is confirmed, update the Bank Account master accordingly (`09_MASTER_DATA_IMPORT.md`, Banks template).
