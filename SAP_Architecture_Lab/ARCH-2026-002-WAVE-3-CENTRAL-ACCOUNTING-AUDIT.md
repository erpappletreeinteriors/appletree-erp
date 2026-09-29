# ARCH-2026-002 — Wave 3 Central Accounting Audit

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §5. **Result: single-writer architecture fully
intact. No second accounting engine found. No STOP condition triggered.**

## 1. GL writer — re-verified singular

`DB.journalEntries.push(` — exactly **one** occurrence in the entire codebase, at `domain.js:2459`,
inside `postJournalEntry()` (`domain.js:2308-2475`). The other 3 textual hits (`domain.js:64, 6663,
11822`) are comments describing historical, already-removed test-only functions used once to prove
the write-point guard, not live code. `server.js` never writes to `journalEntries`, only reads.

`postJournalEntry()`'s own internal comment independently reasserts this: *"This is the ONE function
every accounting-relevant posting path funnels through... so the lock AND the override are enforced
HERE ONCE."*

## 2. Reversal and clearing engines — re-verified singular

- `reverseEntry()` — exactly one definition (`domain.js:2768`), routes its compensating entry through
  `postJournalEntry()`, no second posting path. A guard blocks re-reversing an already-reversed entry.
- `reverseITCForWriteOff()` (`domain.js:12252`) is a DIFFERENT domain concept (GST Input Tax Credit
  reversal on a write-off, not a competing GL-reversal mechanism) — it builds its own entry and posts
  it through the same single `postJournalEntry()` (call at `12263-12266`). Not a second reversal engine.
- `applyClearing()` — exactly one definition (`domain.js:3387`).

## 3. No duplicate posting function

No second "postEntry"/"createJournal"/"writeJournal"-style function exists. `createJournalTemplate()`
(`domain.js:9462`) is CRUD for reusable line templates only — every consumer
(`createDraftFromTemplate()`) routes through the shared `createDraft()` engine, never bypasses it.

## 4. No direct balance mutation

No pattern like `.balance +=`, `.glBalance =`, `.outstandingAmount =` (outside read-only derivation)
exists anywhere in `domain.js`. The single `glBalance` hit (`domain.js:11279`) is a read-only comparison
inside `periodCloseReconciliation()`'s report. One `server.js:782` hit
(`base.outstandingBalance = ...`) is a per-request response-shaping copy, discarded after the HTTP
response — never written back to `DB.customers`.

## 5. No second source of financial truth in reporting

`companyBalanceSheet()`, `companyProfitAndLoss()`, `periodTrialBalance()`, `generalLedger()` all compute
directly from `allLines()` (`domain.js:3322`, the shared GL-line accessor over `DB.journalEntries`,
length-keyed memoization only, explicitly invalidated on reset/restore/rollback). MIS composition
layers (`accountantMisSummary`, `managementMisSummary`) compute nothing financial of their own — every
KPI carries a `source:` field naming the underlying GL-derived function. `periodCloseReconciliation()`
explicitly documents, in its own code, that Project Cost/Revenue figures are "live GL-derived... no
reconciliation drift is structurally possible" — not a re-derived claim, a structural one.

## 6. Journal Control — re-verified, including recurring entries

Manual JE: `createDraft()`→`submitDraft()`→`approveDraft()`→`postDraft()`→`postJournalEntry()`. SoD
enforced independently at BOTH `approveDraft()` (`domain.js:2560`) and `postDraft()` (`domain.js:2594`)
— creator≠approver, creator≠poster, both with a separately-audited CEO/Admin override path.

**Recurring entries do NOT bypass this chain.** No scheduler/cron exists anywhere in this codebase
(confirmed by a repo-wide grep for `cron`/`setInterval`/`scheduler` — zero matches). Generation is
manual-trigger only (`generateDueRecurringDrafts()`, `domain.js:9515`), and the generated record still
must pass through the identical `approveDraft()`/`postDraft()` SoD checks — the function's own code
comment states this is "structurally impossible" to bypass, since nothing in the generation path can
reach `postDraft()` directly.

## 7. Financial Period Control — mechanism confirmed, one real boundary noted

The posting-restriction check lives inside `postJournalEntry()` itself (`domain.js:2354-2365`), keyed on
`findPeriodForDate(date)` — a closed period blocks posting unless the actor's role matches the period's
configured override role AND a non-blank reason is supplied (server-derived role, never client-supplied).
A future-dated-posting control is separate (`domain.js:2366-2392`), gated by `DB.policyConfig.maxFuturePostingDays`.

**Real, disclosed mechanism boundary**: both `date` (posting date) and `docDate` (document date) are
accepted and stored, but the period-lock and future-date checks are keyed exclusively on `date` — a
document dated inside a closed period but posted with a `date` in an open period would not be blocked by
this specific mechanism. This is a factual observation about the current mechanism's scope, not a
newly-discovered defect (the two-date model itself is a deliberate, existing design) — recorded for
Wave 3 design awareness, not flagged as a security gap.

## Conclusion

**No shadow writer, no duplicate reversal/clearing engine, no second source of financial truth found
anywhere in Wave 3's central accounting surface.** No STOP condition (§33 items 2, 3, 4) was triggered.
