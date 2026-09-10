# 22 — Document Numbering

## Format
`PREFIX/FINANCIAL-YEAR/SEQUENCE`, e.g. `INV/2026-27/0001`. The Financial Year follows the Indian convention: 1 April to 31 March. A document dated 31 March 2027 falls in FY 2026-27; a document dated 1 April 2027 falls in FY 2027-28 and the sequence restarts at 0001 for that document type.

## Applies to every document type
Journal, Customer Invoice, Customer Receipt, Supplier Bill, Supplier Payment, Credit Note, Debit Note, GRN, Fixed Asset (Capitalization/Disposal), AMC Recognition, Bank Allocation, Opening Balance — all share the same numbering mechanism, so the behavior is identical and predictable everywhere.

## What never changes
The internal record ID (e.g. `JE-0047`), which you will rarely see directly, keeps counting up forever and is never reused or reset — this is what guarantees every document remains uniquely identifiable even though two different documents from two different years can legitimately show the same visible sequence number (e.g. `JV/2026-27/0001` and `JV/2027-28/0001` are two different, distinguishable documents).

## Historical documents are never renumbered
Anything posted before this numbering scheme was introduced keeps its original number exactly as it was — this system never retroactively renumbers existing documents.
