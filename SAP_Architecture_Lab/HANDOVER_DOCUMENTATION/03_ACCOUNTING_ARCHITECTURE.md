# 03 — Accounting Architecture

## Document model (SAP-familiar)
Every posted accounting document carries the same fields, regardless of type: Series/Voucher Number (e.g. `JV/2026-27/0001`), Posting Date, Document Date, Due Date, Narration, Origin (Manual/GRN/Reversal/etc.), Branch, Reference 1-3, and a set of Debit/Credit lines, each of which can carry Customer, Vendor, Project, Cost Centre, Profit Centre, Tax Code, and Remarks. This mirrors the structure an SAP Business One or S/4HANA accountant already knows.

## Numbering
Document numbers reset every **Indian Financial Year (1 April – 31 March)**, e.g. `INV/2026-27/0001`, then `INV/2027-28/0001` from 1 April onward. The internal record ID (invisible to normal use, e.g. `JE-0047`) never resets and is never reused — this is what guarantees every document is uniquely identifiable forever, even though the printed voucher number legitimately repeats across different years.

## The 34 document types
Manual Journal, Customer Invoice, Customer Credit/Debit Note, Customer Receipt, Supplier Invoice, Supplier Credit Note, Supplier Payment, GRN, Purchase Return, Inventory Transfer/Adjustment, Material Issue, Production/Installation/Service Labour, Fixed Asset Capitalization/Depreciation/Disposal, AMC Revenue Recognition, Bank Import Allocation, Opening Balance (AR/AP/Inventory/GL), and Reversal — all route through the one posting engine described in `02_ARCHITECTURE.md`.

## Reversal, not deletion
Nothing posted is ever deleted or edited in place. A mistake is corrected by **Reversing** the original entry, which creates a new, linked entry with debits and credits flipped. Both the original and the reversal remain visible forever in the Document Viewer, each pointing to the other. This is deliberate — it is what makes every number in the system fully auditable back to its source.

## Financial Period control
A period (e.g. "August 2026") can be explicitly Closed. Once closed, no new posting can be dated inside it — not through the UI, not through a direct API call. The only way back in is either (a) an authorized role reopening the period with a stated reason, or (b) if management has explicitly configured an override role for that specific period, that role posting with a mandatory reason — both fully audited. See `21_FINANCIAL_PERIODS.md`.

## Opening Balance Equity (account 3000)
A single technical account used only to balance opening-balance entries during setup. It is clearly labeled "not a real Appletree account" everywhere it appears. Once every real opening balance (AR, AP, Inventory, GL) is loaded and posted, this account's balance should be exactly zero — that zero is the proof the opening trial balance is complete and internally consistent. See `10_OPENING_BALANCE_IMPORT.md`.

## What is NOT invented
The current Chart of Accounts (13 accounts + technical accounts like 3000/2050) is a development placeholder, not Appletree's real chart. No real tax rate, GSTIN, customer, supplier, or opening balance has ever been entered. See `33_KNOWN_LIMITATIONS.md` and `34_OPEN_MANAGEMENT_DECISIONS.md`.
