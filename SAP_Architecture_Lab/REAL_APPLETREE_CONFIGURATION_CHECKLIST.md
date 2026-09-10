# REAL APPLETREE CONFIGURATION CHECKLIST

**For the Accounts Team to supply. Every item is currently NOT SUPPLIED.**

Status meanings (Phase 35 §30): **NOT SUPPLIED** — no real value exists anywhere in this system for this item. **SUPPLIED** — a real value has been entered, but nobody has independently checked it's correct/complete. **VALIDATED** — a real value exists AND someone with the authority to confirm it (Finance/Management/Tax-Legal, as applicable) has checked it. A test/demo value in the seed data never counts as SUPPLIED, and SUPPLIED never automatically becomes VALIDATED just because it was typed in.

| Item | Status | Notes |
|---|---|---|
| Chart of Accounts | NOT SUPPLIED | Real account codes, names, types, hierarchy |
| Customers | NOT SUPPLIED | At minimum a starter list |
| Suppliers | NOT SUPPLIED | At minimum a starter list |
| Materials | NOT SUPPLIED | Including real UoM/conversion factors where applicable (e.g., Sheet→Sq.Ft) |
| UoM | NOT SUPPLIED | Which units Appletree actually uses and their real conversion factors |
| Tax Configuration | NOT SUPPLIED | Real GST rates, HSN/SAC codes as applicable |
| Projects | NOT SUPPLIED | At least one real project for initial validation |
| Cost Centres | NOT SUPPLIED | |
| Bank Accounts | NOT SUPPLIED | Real bank name, account number, IFSC — **explicitly resolve whether the real account ends 1112 or 1137** (an unresolved discrepancy flagged in Phase 21) |
| Cash Accounts | NOT SUPPLIED | If Appletree maintains a cash-in-hand account |
| Opening Balances | NOT SUPPLIED | Real AR, AP, Inventory, GL, Fixed Asset opening positions |
| Fixed Assets | NOT SUPPLIED | Real asset register with cost, depreciation-to-date, useful life, method |
| Users | NOT SUPPLIED | Real staff names/roles |
| Roles | NOT SUPPLIED | Confirm the existing role model matches Appletree's real org structure, or specify changes |
| Approval Matrix | NOT SUPPLIED | Real ₹-value thresholds for PO/discount/journal approval |
| Numbering | NOT SUPPLIED | Confirm the existing voucher-numbering scheme (prefix/FY/sequence) is acceptable, or specify a different one |
| Financial Year | NOT SUPPLIED | Confirm April–March (current assumption) is correct |
| Posting Periods | NOT SUPPLIED | Confirm monthly period-close cadence |
| Profit Centres | NOT SUPPLIED | Real profit centre structure if Appletree uses one |

## Added Phase 33/34/35 (Finance SOP compliance)

| Item | Status | Notes |
|---|---|---|
| Company GSTIN (new) | NOT SUPPLIED | Apple Tree Pvt Ltd's own real, distinct GSTIN — never the erstwhile partnership firm's |
| Company GSTIN (old/erstwhile) | NOT SUPPLIED | Recorded ONLY so the system can prevent it being reused for a new sale/purchase — never used itself |
| Company Registered State | NOT SUPPLIED | Drives the Place of Supply / CGST+SGST-vs-IGST determination |
| Company preceding-FY turnover > ₹10 crore? | NOT SUPPLIED | Gates whether Section 194Q (goods TDS) applies at all |
| Real Cash-type bank/cash account | NOT SUPPLIED | None exists in the seed data — the Cash Payment Limit engine has nothing to detect against until one is created |
| Vendor PAN (per vendor) | NOT SUPPLIED | Feeds TDS rate selection (PAN vs no-PAN) |
| Vendor individual/HUF vs. other classification | NOT SUPPLIED | Feeds TDS rate selection |
| Transporter carriage-count + PAN declarations | NOT SUPPLIED | Feeds the transport-TDS exemption check |
| Board-approved Payment Approval Matrix | NOT SUPPLIED | The SOP's own ₹5,000/₹1,00,000/Director tiers are illustrative only — `finalised:false` until a CEO/Admin user completes the real Submit-for-Review→Approve workflow (SOP Configuration screen) with a genuine Board Resolution reference. See `MANAGEMENT_DECISION_REGISTER.md` #1 |
| PR-before-PO enforcement decision | NOT SUPPLIED | Built and tested, ships OFF (`requirePRForPO:false`). See `MANAGEMENT_DECISION_REGISTER.md` #3 |
| PO approval threshold reconciliation | NOT SUPPLIED | CONFLICT, not resolved by this engagement. See `MANAGEMENT_DECISION_REGISTER.md` #2 |
| Payment-category three-way-match policy | NOT SUPPLIED | See `MANAGEMENT_DECISION_REGISTER.md` #4 |
| Real Site list | NOT SUPPLIED | Only test sites exist; real site names/addresses/states/Site In-charge assignments needed |
| Real Job Worker master | NOT SUPPLIED | Name/address/GSTIN/registration status/PAN/state for every job worker Appletree actually uses |
| Real APOB declarations | NOT SUPPLIED | For every UNREGISTERED job worker whose premises Apple Tree wants to dispatch customer goods directly from |
| Ship-to GSTIN effective-date confirmation | NOT SUPPLIED | Defaults to the SOP's own stated 2026-08-01. See `MANAGEMENT_DECISION_REGISTER.md` #6 |
| Tax/Legal sign-off on all TDS rates/thresholds | NOT SUPPLIED | Every rate implemented exactly as the SOP states it — none independently re-verified as current tax law |
| Tax/Legal sign-off on all cash-limit figures | NOT SUPPLIED | Same caveat — SOP-sourced, not independently re-verified as current Income Tax Act thresholds |

**Do not proceed to real data entry until this list is substantially complete** — partial real data mixed with demo data is a real risk of confusion, not a shortcut. As real values are entered, update the status column to SUPPLIED, and only move an item to VALIDATED once someone with the actual authority for that item has checked it — not merely because a value now sits in the field.
