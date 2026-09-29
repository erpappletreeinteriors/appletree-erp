# ARCH-2026-002 — Wave 3 Treasury Audit

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §13-§16. **Result: Bank Reconciliation consolidation
(Wave 1) remains intact through both subsequent Wave 2 passes — no second reconciliation engine found.**

## 1. Bank Reconciliation consolidation — re-verified intact

All 4 legacy compatibility wrapper functions still correctly delegate to the single `bankImportLines`
engine:
- `importBankStatement()` (`domain.js:11132`) → delegates to `createBankImportBatch({format:'GENERIC'})`.
- `matchBankStatementLine()` (`11143`) → resolves id, calls `matchBankImportLine()` +
  `reconcileBankImportLine()`.
- `unmatchBankStatementLine()` (`11159`) → calls `unmatchBankImportLine()`.
- `bankReconciliationStatus()` (`11173`) → reads only `DB.bankImportLines`, never `DB.bankStatementLines`.

`createBankImportBatch()` (`10094`) still accepts `format` (`'GENERIC'`/`'ICICI'`), both adapters
(`parseGenericBankCsv()`, `parseICICICsv()`) are pure input parsers feeding the ONE shared line-creation/
matching/posting/reconciliation logic. `DB.bankStatementLines` is touched only by the additive,
non-destructive `migrateLegacyBankStatementLines()`, never auto-invoked. **No second `matchBankImportLine`-
shaped function exists anywhere. Consolidation confirmed intact after both Wave 2 passes.**

## 2. Full Treasury transaction inventory

| Area | Function(s) | Posts via `postJournalEntry()`? | Classification |
|---|---|---|---|
| Bank/Cash Accounts (master) | `createBankAccount()` (11025) | No — correctly master-data only | Master data |
| Bank/Cash Transfer | `createBankTransfer()` (11047) | **Yes** (11058) | Genuine GL-backed transaction |
| Petty Cash — Float creation | `createPettyCashFloat()` (11867) | **No** | Operational-only register |
| Petty Cash — Spend | `recordPettyCashVoucher()` (11877) | **No** | Operational-only register |
| Petty Cash — Replenishment | `replenishPettyCashFloat()` (11898) | **Yes** (11907, Dr 5200/Cr bank) | Only step that touches GL |
| Petty Cash — Reconciliation | `pettyCashReconciliation()` (11892) | N/A (read-only) | Computes purely from voucher records |
| Bank Import/Reconciliation | `createBankImportBatch`/`matchBankImportLine`/`postBankImportLine`/`reconcileBankImportLine` | Only `postBankImportLine()` (10252) | Metadata/matching operational; GL effect only at "Allocate" |

**Petty Cash is NOT a true GL-backed subledger** — it is a spend-tracking register bolted onto ordinary
JE postings. Neither float creation nor voucher recording ever calls `postJournalEntry()`; the only GL
entries this area produces are periodic replenishment entries (Dr 5200 expense / Cr bank). There is no
dedicated "Petty Cash on Hand" GL control account anywhere — `pettyCashReconciliation()` computes its
expected balance purely from in-memory voucher/float records, never cross-checked against a GL balance
the way `bankImportReconciliationSummary()` does for bank accounts. Real architecture characteristic,
not a bug.

## 3. Payment control chain — full SoD trace, re-verified

`createPaymentRequest()`→`approvePaymentRequest()`→`executePaymentRequest()`→`postSupplierPayment()`→
`applyClearing()`.
- **SOD-1** (maker≠checker): `approvePaymentRequest()` line 11797 — unmodified, active.
- **SOD-2** (maker/checker≠executor): `executePaymentRequest()` lines 11837-11839 — unmodified, active,
  CEO/Admin exempted (unchanged, pre-existing).
- **SOD-5** (vendor-creator≠executor): `executePaymentRequest()` lines 11847-11854 — unmodified, active,
  no exemption.

**Payment Approval Matrix re-verified still `finalised:false`/`status:'Draft'`** — a pre-existing,
unresolved OPEN item, re-confirmed unchanged this pass (`domain.js:1362`).

## 4. Bank account creation vs payment execution — MISSING SoD control (real finding)

**No identity check ties `createBankAccount()`'s creator to who can subsequently execute payments
through that account.** `masterData:true` and `pay:true` are BOTH held by Admin and CEO simultaneously
(`ROLE_ACTIONS`, domain.js:372-382) — the same user can create a Bank Account master record and then
execute a payment out of, or into, that same account, with zero separation. No function in the payment
chain (`postSupplierPayment`, `postCustomerReceipt`, `createBankTransfer`, `executePaymentRequest`) ever
reads `bankAccount.createdBy`. A directly analogous control exists for the vendor-master case (SOD-5) —
the same pattern was NOT applied to bank account masters. See
`ARCH-2026-002-WAVE-3-SECURITY-BASELINE.md` and `-DECISIONS.md` item W3-2.

## 5. Duplicate payment protection

Beyond the client-supplied idempotency-key system (`withTransaction`), `executePaymentRequest()` has a
real state-guard: `req.status!=='Approved'` (11836) blocks re-execution after `status='Executed'` is set
(11860), and the whole function is atomically wrapped. `postSupplierPayment()` also independently
re-derives the vendor's open balance and rejects overpayment — incidental protection against duplicate
full-amount re-execution, not a dedicated fingerprint/dedup mechanism (partial-amount replay scenarios
are not fully covered by this incidental check alone).

## 6. Cash limits — enforced vs. documented

`DB.cashLimits` (domain.js:1044): `dailyExpensePerPerson:10000`, `dailyTransporterExpense:35000`,
`loanDepositReceived:20000`, `loanDepositRepaid:20000`, `cashReceiptAggregate:200000`,
`approvedByFinance:false` (the limits themselves are not yet finance-approved).

**Real gap**: `checkCashLimit()` (domain.js:11414) compares only the SINGLE incoming voucher amount to
the cap — it never sums same-day/same-person vouchers first. The "₹10,000/day" label is enforced as a
**per-transaction ceiling**, not a genuine daily aggregate. The float-ceiling check (11885), by
contrast, IS a genuine running total against `DB.pettyCashVouchers` for that specific float. Role gating
for petty cash routes is enforced at the `server.js` route layer only (not inside the `domain.js`
functions themselves, except `replenishPettyCashFloat()` which self-enforces) — a direct domain-function
call would bypass the route-level role check, though no such call site currently exists.

## Conclusion

Bank Reconciliation consolidation intact. Payment control (SOD-1/2/5) intact, unmodified. Two real,
disclosed gaps found this pass: (1) bank-account-creation vs. payment-execution has no identity
separation; (2) the daily cash limit is enforced per-transaction, not as a true daily aggregate. Neither
is fixed here, per this CR's own Phase-0-only rule.
