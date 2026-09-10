# 23 — Tax / GST

## Current state
Three generic tax codes exist (GST18, GST5, GST12) as a working development placeholder. **No real GST rate, no real Appletree GSTIN, and no real applicability rule (which item/service gets which rate) has ever been validated by a tax professional.**

## What must happen before real use
**ACCOUNTING/TAX PROFESSIONAL VALIDATION REQUIRED.** Specifically confirm: Appletree's real GSTIN, the correct CGST/SGST/IGST split for each real product/service category, whether HSN/SAC codes are mandatory for your invoice format and turnover bracket (see `24_HSN_SAC.md`), whether reverse charge applies to any of your real supplier categories, and your real tax invoice formatting requirements.

## How tax codes work today
A tax code has separate CGST%/SGST%/IGST% fields, applied when a code is attached to an invoice line. New codes can be added via Master Data Import (`09_MASTER_DATA_IMPORT.md`) — but the RATES themselves must come from your tax professional, not be guessed.

## What this system does NOT do
It does not generate GSTR-1/GSTR-3B filings or any statutory tax report. Tax reporting beyond the basic invoice-level tax lines is out of scope for this build.
