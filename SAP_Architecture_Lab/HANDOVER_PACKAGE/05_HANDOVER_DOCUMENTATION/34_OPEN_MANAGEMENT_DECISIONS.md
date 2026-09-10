# 34 — Open Management Decisions

These require a decision from Appletree management/accounts leadership — none have been guessed or defaulted by the software.

## 1. Real Chart of Accounts
Supply the real account list (see `08_CHART_OF_ACCOUNTS_IMPORT.md` for the exact import format).

## 2. Real bank account identity
The tested ICICI statement shows account ending **…1137**; the account already configured in this system (from an earlier reference document) ends **…1112**. Confirm: same account (transcription error somewhere) or two real accounts?

## 3. Tax / GST professional validation
Real GSTIN, real applicable rates per product/service category, HSN/SAC mandatory-or-not for your filing bracket, reverse charge applicability.

## 4. Supplier Debit Note
When a supplier invoice needs a downward adjustment (pricing error, quantity shortfall) without the supplier's own credit note. Options: (A) a fresh Supplier Invoice — only works for a NEW charge, not a reduction; (B) build a dedicated Supplier Debit Note (mirrors the existing Customer Debit Note); (C) use the existing Purchase Return process — only correct if goods are physically returned; (D) other. **Recommendation, not a decision: B, since it reuses an already-built, already-tested pattern.**

## 5. AMC Cancellation — 5 scenarios, each needs its own answer
| Scenario | Question |
|---|---|
| Cancel before any service | Full refund? |
| Cancel after partial service | Refund only the unused portion? |
| Invoice raised, unpaid | Cancel the receivable, or still collect for value already delivered? |
| Revenue already recognized | (Revenue for service actually rendered cannot simply be un-recognized — confirm this understanding) |
| Customer already paid | Real cash refund, or a Credit Note? |

## 6. Distribution Rule
Automatic percentage cost-splitting across multiple projects/cost centres from one entry. No real business need has surfaced in 20 phases of development and testing. **Recommendation: NOT REQUIRED** — confirm formally to close this item.

## 7. Payment/Receipt Methods beyond the standard 8
Cash/Cheque/Bank Transfer/NEFT/RTGS/IMPS/UPI/Card are pre-configured. Confirm whether any additional method is genuinely needed.

## 8. Document Numbering — annual reset confirmed; branch-specific numbering?
Annual reset (Indian FY) is implemented. Confirm whether numbering should ALSO vary by branch (currently it does not — one global series per document type per year).

## 9. Fixed Assets — existing pre-system assets
If Appletree already owns fixed assets acquired before this system's use, their real historical cost, capitalization date, useful life, depreciation method, and existing accumulated depreciation must be supplied — see `17_FIXED_ASSETS.md`. Confirm how to treat existing accumulated depreciation specifically (a policy question, not assumed).

## 10. Password Policy tier
Current: strong password (8+ chars, mixed case, digit, special character) + 5-attempt lockout, no expiry. Confirm this is sufficient, or specify a stricter tier (e.g., forced rotation).

## 11. Backup Retention
Suggested starting point (not yet adopted): daily backup, 30-day retention, monthly restore-drill. Confirm or replace.

## 12. Opening Balances
Real opening AR, AP, Inventory, and GL figures, with supporting documentation and a named approver, per `10_OPENING_BALANCE_IMPORT.md`.

## 13. Profit Centres
Confirmed NOT required (Phase 19 decision). No action needed unless this changes.

## 14. Multi-Currency
Confirmed INR only (Phase 19 decision). No action needed unless Appletree begins real foreign-currency transactions.
