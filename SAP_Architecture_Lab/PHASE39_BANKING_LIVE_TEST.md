# PHASE 39 — Banking Live Test

**Date:** 2026-09-12. Isolated test server, `APP_ENV=test`, port 4091, fictional `TEST39-*`-scope
GL accounts and bank accounts only. Test script: `tests/erp_phase39_banking_tests.js`. Raw results:
`phase39_banking_results.json`.

## What was live-executed

Two fictional bank/cash accounts created with genuinely distinct GL accounts (`TEST39-1001`,
`TEST39-1002`) → Customer Receipt via Bank A → Supplier Payment via Bank B → Bank Transfer A→B →
reversal of that transfer → ICICI-format bank statement import with duplicate detection →
statement-account-number mismatch flagging → allocation of an imported line to a real GL entry →
reconciliation of that line → bank reconciliation summary.

**34 assertions, 34/34 PASS** (after one application defect — see below — was found, fixed, and the
suite re-run clean).

## Negative tests (all correctly BLOCKED)

| # | Scenario | Result |
|---|---|---|
| 1 | Unauthorized role (`Purchase`, lacks `masterData`) creating a bank account | BLOCKED |
| 2 | Second bank account reusing a GL account already in active use by another account | BLOCKED |
| 3 | Customer Receipt against a nonexistent `bankAccountId` (wrong account) | BLOCKED |
| 4 | Further receipt against an already-fully-cleared invoice (payment-after-clearing) | BLOCKED |
| 5 | Unauthorized role (`Sales`, lacks `pay`) making a supplier payment | BLOCKED |
| 6 | Further payment against an already-fully-cleared bill (payment-after-clearing) | BLOCKED |
| 7 | Unauthorized role (`Accountant`, lacks `pay`) initiating a bank transfer | BLOCKED |
| 8 | Bank transfer with identical source and destination account | BLOCKED |
| 9 | Reversing an already-reversed journal entry | BLOCKED |
| 10 | Re-allocating (posting) an already-Posted bank import line | BLOCKED |

Scenario 3 ("wrong account") and scenarios 4/6 ("payment-after-clearing") are both explicit brief
requirements, live-confirmed rather than assumed from the code.

## Real per-account GL segregation — proven, not assumed

Bank A (`glAccount: TEST39-1001`) and Bank B (`glAccount: TEST39-1002`) are genuinely separate GL
ledgers, not the shared default account 1000:

- Customer Receipt of ₹94,400 posted via Bank A → Bank A's own balance (from
  `GET /api/bank-accounts/balances`) increased by **exactly** ₹94,400, live-confirmed via a real
  before/after balance comparison.
- Supplier Payment of ₹59,000 posted via Bank B → Bank B's own balance decreased by **exactly**
  ₹59,000.
- Bank Transfer of ₹30,000 (A→B) decreased Bank A by exactly ₹30,000 and increased Bank B by
  exactly ₹30,000 — a single balanced JE (`Dr` destination's GL / `Cr` source's GL).
- Reversing that transfer returned both accounts to their exact pre-transfer balances (live-
  confirmed, not inferred from the reversal function's source).

## Duplicate-import and account-mismatch detection — proven live

- A 2-line ICICI-format statement was imported once (`duplicateCount: 0`), then the **identical**
  statement was re-imported a second time — both lines were correctly flagged `Duplicate`
  (`duplicateCount: 2`), matched by `bankTxnId` across batches, not merely by description.
- A statement carrying a `statementAccountNumber` that does **not** match the configured bank
  account's last-4 digits was correctly flagged (`accountNumberMismatch`) rather than silently
  accepted or silently blocked — consistent with this codebase's disclosed policy that a mismatch is
  "flagged, never silently resolved," now independently reproduced live rather than trusted from the
  comment describing it.

## Real defect found and fixed this phase

**DEF-P39-02 (P1 — critical, accounting-integrity):** `postBankImportLine()` (the "Allocate" action
that turns an imported statement line into a real GL entry) hardcoded the bank side of its journal
entry to account `1000` unconditionally, **ignoring the specific bank account the imported line
actually belonged to.** This directly contradicted the real per-account GL segregation that
`postCustomerReceipt()`, `postSupplierPayment()`, and `createBankTransfer()` all correctly implement
(established Phase 24 Part A4) — this one sibling function was evidently never updated to match.

**Live proof of the defect (before the fix):** allocating a ₹5,000 DR line imported against Bank A
(`glAccount: TEST39-1001`) posted a journal entry crediting account `1000` instead of `TEST39-1001`
— Bank A's own balance (queried via `GET /api/bank-accounts/balances`) did not move at all
(`before: 94400, after: 94400`), while an unrelated account absorbed the movement instead. For any
bank/cash account other than the one account that happens to be coded `1000`, this would have
permanently broken that account's own reconciliation — the exact failure mode the Banking domain's
tests exist to catch.

**Fix:** `postBankImportLine()` now resolves the bank side to `DB.bankAccounts.find(b=>b.id===line.
bankAccountId).glAccount`, the same resolution pattern already used correctly by the three sibling
functions — not a new mechanism, closing the one place that pattern was missing. See
`server/domain.js` (function `postBankImportLine`) for the fix and its inline explanation.

**Regression:** full permanent suite re-run clean after the fix, **173/173 assertions pass, zero
regressions** — `erp_059_security_tests.js` (13/13), `erp_059_restart_persistence_tests.js` (5/5),
`erp_059_transaction_contract_tests.js` (6/6), `erp_059b_durable_audit_tests.js` (24/24 + 2
documented-not-tested, matching baseline), `erp_059c_production_isolation_tests.js` (10/10),
`erp_audit_concurrency_tests.js` (1/1), `erp_audit_p0_tests.js` (65/65),
`erp_phase38_e2e_trace_tests.js` (49/49). This Banking suite itself: 34/34 after the fix.

## Verdict

**Banking is now LIVE-PROVEN**, not merely code-traced — and this domain's live testing is the ONLY
one of the four newly-tested domains this phase (Manufacturing, Job Work, Fixed Assets, Banking)
that surfaced a real, previously-undetected accounting-integrity defect, found only because the test
used a genuinely non-default bank account rather than relying on the shared account 1000 the way
every pre-existing test/call site in this codebase happened to. Fixed at the root cause, matching
the established sibling-function pattern, with a full clean regression. One earlier-noted P4
cosmetic defect (DEF-P39-01, Manufacturing's MAT-2 uom label) remains open, unrelated to this domain.
