# WAVE3_TREASURY-RESULTS.md

**Date:** 2026-09-22. Bank Reconciliation / Payment Control / Petty Cash / Cash Limit verification
results for ARCH-2026-002 Wave 3.

## Headline statement

**No new Treasury capability was built this pass.** W3-2 (Bank Account creation vs. payment execution
SoD), W3-4 (Bank Import→Reconciliation SoD), W3-5 (Petty Cash GL control account), and W3-6 (true
daily-aggregate cash limit) are all classified IMPLEMENTATION BLOCKER by
`WAVE3_IMPLEMENTATION_SCOPE.md`. Everything below is live re-confirmation of EXISTING behavior.

## Bank Reconciliation — single-engine consolidation (Wave 1) re-confirmed intact

Source-level re-confirmation this pass (`tests/erp_arch_2026_002_wave3_tests.js`, section B1):

- Exactly ONE definition each of `matchBankImportLine()`, `unmatchBankImportLine()`,
  `reconcileBankImportLine()` exists in `server/domain.js` — the single consolidated engine built by
  ARCH-2026-002 Wave 1.
- `importBankStatement()` still delegates to `createBankImportBatch()`; `matchBankStatementLine()` still
  delegates to `matchBankImportLine()`; `unmatchBankStatementLine()` still delegates to
  `unmatchBankImportLine()`; `bankReconciliationStatus()` still reads the SAME single
  `DB.bankImportLines` collection every other engine function reads/writes (directly, not via a getter —
  still the one consolidated store, not a second one).
- Manual full-file review: no second, independent bank-statement reconciliation/matching function exists
  anywhere in `server/domain.js`. Every other `reconcile*` name in the file
  (`reconcileAR`/`reconcileAP`/`reconcileOutputTax`/`reconcileInputTax`/`reconcileCustomerAdvances`/
  `reconcileFixedAssets`/`reconcileOpeningBalances`) is an unrelated REPORT — a read-only comparison
  function, not a second bank-statement engine — and none of them touch `DB.bankImportLines` or
  `DB.bankStatementLines`.

**Live end-to-end chain re-confirmed** (also serves as `WAVE3_BROWSER-UAT.md` chain (b)): a real ICICI-
format CSV statement was imported (`POST /api/bank-import/batches`), the resulting line matched to a real,
fully-posted Customer Invoice's receipt entry (`POST /api/bank-import/lines/:id/match`), then reconciled
(`POST /api/bank-import/lines/:id/reconcile`) — all three steps succeeded and the line's terminal status
was `Reconciled`. Full transcript in `WAVE3_BROWSER-UAT.md`.

## Payment Control chain (SOD-1/SOD-2/SOD-5/SOD-6) — pure re-confirmation

This is EXISTING, already well-tested behavior — re-run, not rebuilt, per
`WAVE3_IMPLEMENTATION_SCOPE.md` §4's own framing. Live 3-way chain exercised this pass (also serves as
`WAVE3_BROWSER-UAT.md` chain (c)):

1. A real, posted Supplier Bill was created for a services vendor.
2. Purchase raised a Payment Request against it (`POST /api/payment-requests`) — succeeded.
3. Purchase attempting to approve their own request was blocked (SOD-1, maker≠checker) — the SAME,
   unmodified error path.
4. FinanceManager approved the request — succeeded.
5. FinanceManager (the approver) attempting to also execute was blocked with the exact, unmodified error:
   `"Maker-checker: execution must be a third person distinct from the maker and the approver (or
   CEO/Admin), per SOP §9."` (SOD-2).
6. Admin — a genuine third actor, neither maker nor checker — executed successfully.

`tests/erp_arch_2026_001d_sod_tests.js` (SOD-5/SOD-6 direct coverage) re-run fresh: **30/30 PASS**, zero
modification.

## Petty Cash — confirmed still an operational register, not a GL subledger

Re-confirmed by source read: `createPettyCashFloat()`/`recordPettyCashVoucher()` still do not post to the
GL (only `replenishPettyCashFloat()` does, unchanged from Wave 3 Phase 0's finding). W3-5 (a formal GL
control account) remains blocked — it requires its own accounting-policy sub-decision (which account,
what entry shape) that the decision record does not resolve, and this pass did not invent one.

## Cash Limit — confirmed still per-transaction, not a true daily aggregate

Re-confirmed by source read: `checkCashLimit()` still compares a single transaction's amount against the
configured ceiling, not a same-day/same-person running sum. `DB.cashLimits.approvedByFinance` is still
`false` — the limit VALUE itself remains finance-unapproved, a separate, pre-existing open item this
pass's CR text explicitly warns against silently converting into new hard-coded policy (W3-6). Not
implemented.

## Conclusion

**PASS (VERIFICATION ONLY — no new Treasury capability built; Bank Reconciliation single-engine
consolidation confirmed intact and exercised end to end live; Payment Control chain re-confirmed intact
end to end live; Petty Cash and Cash Limit gaps re-confirmed unchanged, per
`WAVE3_IMPLEMENTATION_SCOPE.md` for why W3-2/W3-4/W3-5/W3-6 remain blocked).**
