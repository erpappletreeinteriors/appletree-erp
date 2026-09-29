# PHASE 40 — Banking Report

**Date:** 2026-09-13. Full detail: `PHASE_40_BROWSER_UAT_MATRIX.md` area I.

## What was proven, live, through the browser

1. **Bank Account creation** (the exact feature DEF-P39-04 fixed in Phase 39) — 2 new, temporary
   bank accounts (`PHASE40 Current Account A`/`B`) created through the real UI form, each with its
   own distinct GL account (`PHASE40-BANK-A`/`B`), confirmed listed correctly.
2. **Transfer** — ₹5,000 posted through the real Bank/Cash Transfer screen, Account A → Account B.
3. **Segregation — the critical test**: Bank A's balance moved from ₹0 to −₹5,000, Bank B's from ₹0
   to +₹5,000, and the pre-existing third account (ICICI, GL `1000`) remained completely unchanged
   at its own prior balance (−₹32,716, from earlier unrelated transactions) throughout. **Bank A's
   transaction did not post to Bank B's GL, or to any other account's GL.**
4. **Reconciliation** — the Reconciliation screen (exercised separately in areas B/C/D) reads the
   same live GL data these transfers post to; no separate, second calculation exists.

## Not re-tested this phase (carried from Phase 39, unchanged)

Duplicate-import detection and statement-account-number mismatch flagging were not re-exercised
through the browser this phase (Phase 39 already live-proved both — `PHASE39_BANKING_LIVE_TEST.md`
— and no code in that area changed). Reversal of a bank transaction was also not re-exercised this
phase (Phase 39's own live reversal proof stands unchanged).

## Verdict

The specific critical test Section 14 names explicitly — "Bank A transaction MUST NOT post to Bank
B's GL" — is live-proven true, through the real UI, with a real third, untouched account as an
additional control.
