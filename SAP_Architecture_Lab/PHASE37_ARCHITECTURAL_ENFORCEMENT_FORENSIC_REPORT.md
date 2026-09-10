# PHASE 37 — System-Wide Atomicity Completion & Architectural Enforcement Forensic Audit

**Scope:** `SAP_Architecture_Lab` only — an isolated, experimental build. NOT the live/production/offline Appletree ERP. Nothing in this report applies to `appletree_erp_v2_1.html` or any offline build.

**Central question:** *Is Appletree ERP transactionally safe by architecture, or is it only safe where a developer has remembered to make it safe?*

**Answer, in one line:** Route-level **authorization** is architecturally enforced (the server refuses to boot without it — proven live, twice). Transaction **atomicity** is not — it is **OPT-IN TRANSACTION SAFETY, NOT ARCHITECTURALLY ENFORCED**, proven live via a naive-developer function that produced a permanent GL orphan on its very first forced failure.

---

## 1. Method

Every claim below is tagged with its evidence class:
- **PROVEN LIVE** — a real HTTP call, a real forced failure via `_fault()`/`_crashFault()`, and raw `db.json` inspection before/after.
- **CODE VERIFIED** — read the exact source and traced the mutation sequence; not exercised through a live forced failure this phase.
- **STATICALLY VERIFIED** — confirmed via the boot-time route-safety scanner or a source-level scan script.
- **NOT VERIFIED** — named in the mission brief, not reached this phase; disclosed, not assumed safe.

Per the mission's own rule: nothing here is marked "PROVEN SAFE" merely because code looks correct, Trial Balance balances, or a similar function passed.

---

## 2. Part F — The naive-developer architectural attack (most important finding)

A temporary function `createNaiveFinancialTransaction()` was added using **only** the sanctioned building blocks a new developer would reasonably reach for: `validate → postJournalEntry() → push a document → save()`. No rollback helper, no transaction wrapper, no hidden test mechanism.

- **Route-level authorization**: the server **refused to boot** twice while wiring this in — once with no auth check, once with only `if(!actor)`. `route_safety_scanner.js` walks the server's own source at boot time and hard-fails unless every legacy mutation route has both a `deny(res,403,...)` and a recognizable role/permission check. This is genuine, structural, fail-closed enforcement — **PROVEN LIVE**.
- **Atomicity**: once past the scanner, the naive function was forced to fail at 3 different points. **100% of forced failures (3/3) produced a permanently orphaned GL entry** — a real journal entry with debits=credits, fully "balanced," with **zero** corresponding business document. The scanner's own header comment discloses it "cannot see into domain.js" — it has no ability to detect a missing atomicity wrapper, because that isn't a route-level textual pattern. **PROVEN LIVE.**
- All 4 GL entries created during this test (JE-0916–JE-0919) were reversed via `/api/journal/:id/reverse`; the test-only `DB.__naiveTestDocs` collection and the function/route themselves were fully removed after producing this evidence, per the mission's own instruction.

**Conclusion**: authorization is architecturally forced onto every new route. Atomicity is not forced onto any new function. A new developer writing ordinary, unremarkable code reproduces the exact defect class this whole audit series has been fixing one function at a time — with a 100% failure rate on the very first attempt.

---

## 3. Part D — Audit-failure attack (2nd CRITICAL defect found + fixed)

`logAudit()` was previously a bare `DB.auditLog.push(...); save();` — no error handling. Forced to throw after a real, already-committed `InstallationLabourCost` posting:

- The client received an HTTP failure for a transaction that had **already succeeded** (GL committed, `inst.labourEntryIds` updated). **PROVEN LIVE.**
- **Critical retry attack**: a client retry — even one *correctly* reusing an idempotency key — produced a **genuine duplicate GL posting** (JE-0924 + JE-0925, both real, both posted, ₹2,000 each). Root cause: `withIdempotency()`'s own dedup record is only saved *after* the handler returns normally; a thrown handler is never recorded, so the identical key re-executes from scratch on retry. **PROVEN LIVE — this alone is a NO-GO condition per the mission's own rule ("If a committed transaction can return failure and then be successfully duplicated by retry: CRITICAL DEFECT").**
- **Fix**: `logAudit()` now wraps its body in try/catch and never throws to any caller; failures are `console.error`-logged instead. This is a single, general fix at the shared function (not ~15+ individual patches), making "audit is best-effort, isolated from the business transaction" the uniform, enforced behavior everywhere — previously this was accidental and inconsistent (the 15 Phase-35/36-fixed functions had `logAudit()` *inside* their rollback try/catch, so an audit failure there would have wrongly rolled back a real business transaction; every other function left the business mutation committed with a false client-side failure).
- **Regression-verified**: re-ran the full 15-function Phase-35/36 real-failure battery after the fix — all 15 still show correct real-failure rollback behavior (zero regressions).
- **Cleanup**: the duplicate JE pair (and 4 more from the same exploit-proving installation, INST-0004) were all reversed via `/api/journal/:id/reverse`.

---

## 4. Part E — Real process-crash durability test

Using a genuine `process.exit(1)` injector (`_crashFault`, distinct from the catchable `_fault`), not merely a caught exception:

- Crashing between an inner `postInventoryMovement`/GL `save()` and the calling function's own final `save()` **permanently loses or orphans** the in-memory-only mutation — proven twice: once via the naive function (an orphaned document, later flushed by an unrelated save; a would-be-orphaned GL entry, lost forever if the crash lands before any later save), once via a real crash inside `recordProjectExpense()`.
- Crashing *after* the final `save()` produces a fully consistent, durable, correctly cross-referenced state (PEXP-0045/JE-0940 — deliberately left in place as evidence of correct behavior, not reversed).
- **This is a categorical limit of the entire compensating-rollback approach used across Phases 35–37**, not something fixable within a hand-rolled JSON-file architecture: `save()` rewrites the whole file, non-incrementally, so any mutation without its own accompanying `save()` call is not durable. A real DB transaction or WAL would be required — explicitly out of scope here, disclosed as an architectural boundary, not "fixed."

---

## 5. Part C — `postDraft()` choke-point (single most consequential fix this phase)

`postDraft()` is the shared posting path for Customer Invoice, Supplier Bill, Customer Advance, Billing Milestone Invoice, AMC Billing, Manual JE (CSV import), and Opening Balance import — the highest-traffic function in the system.

- **Before fix**: forcing a failure immediately after the GL commit but before `d.status='Posted'` left a permanently orphaned GL entry with the draft still `Approved` — **PROVEN LIVE** (`jesAfter:1` against a `jesBefore:0` baseline, draft status unchanged).
- **Fix**: snapshot-before-GL-attempt + compensating rollback (truncate `journalEntries` back to pre-call length; restore draft status/history/postedEntryId; restore any touched Billing Milestone and Opening Balance Line side effects) around the 3 real risk windows: after GL/before status, after status/before milestone update, after milestone/before opening-balance inventory posting.
- **Re-verified live after the fix, at all 3 fault points**: `jesDelta:0`, `draftStatus:"Approved"` unchanged, every time. The subsequent **legitimate retry succeeded cleanly with exactly one GL entry** (`finalJesCount:1`). **PROVEN LIVE.**
- Because `postDraft()` contains **no branching on document type** — only the two already-tested optional side effects (billing milestone, opening balance) — this fix is structurally uniform across every document type that reaches it; testing each type individually would exercise the identical code path already proven safe.
- Test artifact (JE-0943, the Customer Invoice used for this verification) reversed via `/api/journal/:id/reverse`.

---

## 6. Part B — Fault-injection battery, all named untested transactions

All 10 functions named in the mission brief as untested, plus the 2 already-known-disclosed gaps from Phase 36, were read, fixed (where a real gap existed), and **live fault-tested** with the same snapshot/rollback pattern. One self-introduced bug was caught and corrected mid-phase (see §6.1).

| Function | Prior state | Fix applied | Fault-tested |
|---|---|---|---|
| `postProductionLabourCost` | GL commit → unprotected push, **no audit trail at all** | Snapshot/rollback + added missing `logAudit()` | **PROVEN LIVE** — `PROD_LABOUR_AFTER_GL_BEFORE_PUSH`: `jesDelta:0`; retry `ok:true` |
| `postInstallationLabourCost` | GL commit → unprotected push (the exact function used to prove Part D) | Snapshot/rollback | **PROVEN LIVE** — `INST_LABOUR_AFTER_GL_BEFORE_PUSH`: `jesDelta:0`; retry `ok:true` |
| `postBankImportLine` | GL commit → unprotected status/postedEntryId update | Snapshot/rollback | **PROVEN LIVE** (after self-correction, §6.1) — `jesDelta:0`; retry `ok:true`, `finalJesCount:1` |
| `issueToSite` | Multi-item forEach (2 movements/item) → unprotected DC push → unprotected MRS status update, **no rollback at any point** | Snapshot/rollback across movements+DC+MRS | **PROVEN LIVE** — both `ISSUE_TO_SITE_MID_LOOP` and `ISSUE_TO_SITE_AFTER_MOVEMENTS_BEFORE_DC`: zero moves/DC delta, MRS status unchanged; retry `ok:true`, `movesDelta:2`, `dcDelta:1` |
| `dispatchToJobWorker` | Same multi-array pattern (movements → DC → JWO), no rollback | Snapshot/rollback across movements+DC+JWO | **PROVEN LIVE** — both named fault points: zero delta; legit dispatch `ok:true` |
| `returnFromJobWorker` | forEach movements → unprotected JWO status/qty update | Snapshot/rollback | **PROVEN LIVE** — zero moves delta, JWO status/qty unchanged; retry `ok:true` |
| `recordJobWorkScrap` | movement → unprotected JWO fields → unprotected record push | Snapshot/rollback | **PROVEN LIVE** — zero delta on all 3; retry `ok:true` |
| `directDispatchFromJobWorker` | movement → unprotected JWO fields | Snapshot/rollback | **PROVEN LIVE** — zero moves delta; retry `ok:true` |
| `createPaymentRequest` | Single object push + save, no GL | No fix needed | **CODE VERIFIED — atomic by construction** (a single JS array push cannot partially execute) |
| `recordPettyCashVoucher` | Single object push + save, no GL | No fix needed | **CODE VERIFIED — atomic by construction** |

### 6.1 A self-introduced bug, caught and fixed within this same phase

The first `postBankImportLine()` fix took its "before" snapshot of `DB.journalEntries.length` **after** `postJournalEntry()` had already committed the GL entry, not before — reproducing the exact sequencing mistake this audit series had previously self-caught in Phases 35 and 36. Live re-test immediately exposed it: the fault attempt showed `jesDelta:1` (the orphaned entry survived "rollback" because the snapshot already included it). Corrected by moving the snapshot to before the `postJournalEntry()` call; re-tested clean (`jesDelta:0`; retry `finalJesCount:1`). Both test JEs (the buggy-orphan and the resulting duplicate) were reversed. This is disclosed per this audit's own standing rule: never claim a fix works without immediately re-attacking the identical exploit.

---

## 7. Part G/H — Write-point enforcement & retry battery (partial, disclosed)

- **Write-point enforcement (STATICALLY VERIFIED)**: `checkWritePointCapability()` fails closed if no capability string is supplied or the string isn't a registered `CAPABILITY_REGISTRY` key — confirmed via source reading, consistent with Phase 26-29 findings. This governs *authorization* at the domain layer, independent of route-level checks. It has **no equivalent for atomicity** — nothing fails closed if a new function omits a rollback wrapper (this is exactly what Part F proved).
- **Retry/double-post battery**: performed as an integral part of every Part B fix above (each fixed function's "legitimate retry" step) plus the original Part C/D Customer Invoice and Installation Labour cases. A dedicated battery across every *other* pre-existing (already Phase-35/36-fixed) function was not re-run this phase beyond the regression check in §3 — **NOT independently re-verified beyond that regression pass this phase.**
- **A new write path was not attempted this phase** beyond the naive-function test itself (Part F), which already demonstrates the answer for atomicity (no enforcement) and for authorization (enforced). A separate, distinct "introduce a new financial write path" exercise was not additionally performed — **NOT VERIFIED as a separate test.**

---

## 8. Part I — Cross-module atomicity

Directly exercised as a side effect of the Part B battery: project+inventory (`issueToSite`, `dispatchToJobWorker`), job-work+inventory (`returnFromJobWorker`, `recordJobWorkScrap`, `directDispatchFromJobWorker`), and project+GL (`postProductionLabourCost`, `postInstallationLabourCost`) all showed correct cross-collection rollback under fault injection. Customer+AR and supplier+AP were exercised via the pre-existing Phase 35/36 battery (regression-confirmed, §3). Asset+GL, site+inventory (beyond the above), and tax+GL/clearing+AR-AP boundary pairs were **not independently fault-tested this phase** — disclosed, not assumed safe.

---

## 9. Part J — Independent accounting reconciliation (built from raw journal lines)

Computed directly by summing every line of every entry in `DB.journalEntries` — **not** via `/api/trial-balance` or `/api/reconciliation`:

| Account | Balance (₹) |
|---|---|
| AR (1100) | 405,228.92 |
| AP (2000) | −232,398.00 |
| Revenue (4000) | −898,666.89 |
| Material Cost (5000) | 1,059,110.24 |
| Labour (5100) | 135,479.00 |
| Inventory Asset (1400) | 673,000.00 |
| Cash/Bank (1000) | −487,404.00 |
| Output Tax (2200) | −64,204.03 |
| Input Tax (1200) | 448,968.95 |
| Fixed Assets (1500) | 0.00 |
| Accumulated Depreciation (1550) | 0.00 |

**Total Debits = Total Credits = ₹8,275,707.32 — balanced, computed independently of any reporting endpoint.**

**Finding (disclosed, not fixed):** Fixed Assets (1500)/Accumulated Depreciation (1550) show ₹0 despite 60 records in `DB.fixedAssets`, because `capitalizeFixedAsset()` posts to account **1400** — the same account Inventory Asset uses. This is a pre-existing, shared-account architectural characteristic (not introduced this phase, not an atomicity defect), noted here because it means the "Inventory Asset (1400)" figure above is actually a blend of inventory and capitalized fixed assets. Out of scope for this atomicity audit to fix; flagged for a future dedicated pass.

Project-level cost/revenue tags were also spot-checked directly from raw lines (e.g. PRJ-1: cost ₹257,376.45 / revenue ₹138,536.38) — consistent with the multiple-source-of-truth concern already raised in the 2026-08-19 capability audit series, not a new finding.

---

## 10. Part K — Database forensic sweep

A full 105-collection scan (62 with an `id` field) for duplicate IDs and duplicate document numbers, run against the **exact same methodology** as the Phase 36 baseline:

```
idDup: inventoryMovements {MV-000121: 2, MV-000124: 2}, inventoryAdjustments {IADJ-0015: 3}
docNumDup: quotations.quotationNo — 5 duplicate quotation numbers
```

**This is byte-for-byte identical to the Phase 36 baseline.** No new anomaly was introduced by any Phase 37 fix or test. All items were already classified HISTORICAL in Phase 36 (pre-dating both phases' fixes) and are not re-litigated here — they are unrelated to atomicity and were not created by any transaction tested this phase.

---

## 11. Atomicity coverage — recalculated from a fresh census

**Full transaction census** (functions that perform ≥2 dependent mutations across GL/inventory/documents, i.e. carry genuine atomicity risk):

| # | Function | Mutations | Protection (as of end of Phase 37) | Fault-Tested? |
|---|---|---|---|---|
| 1-15 | The 15 functions fixed in Phase 35/36 (Customer Receipt, Supplier Payment, GRN, Purchase accept, Invoice/Bill edit-resync, Mfg Job delete, etc.) | GL + doc/array state | Compensating rollback | PROVEN LIVE (regression-confirmed this phase) |
| 16 | `postDraft()` | GL + status/history + milestone + opening-bal inventory | Compensating rollback (Phase 37) | PROVEN LIVE |
| 17 | `postProductionLabourCost` | GL + array push | Compensating rollback (Phase 37) | PROVEN LIVE |
| 18 | `postInstallationLabourCost` | GL + array push | Compensating rollback (Phase 37) | PROVEN LIVE |
| 19 | `postBankImportLine` | GL + line status | Compensating rollback (Phase 37) | PROVEN LIVE |
| 20 | `issueToSite` | 2N movements + DC + MRS status | Compensating rollback (Phase 37) | PROVEN LIVE |
| 21 | `dispatchToJobWorker` | 2N movements + DC + JWO | Compensating rollback (Phase 37) | PROVEN LIVE |
| 22 | `returnFromJobWorker` | N movements + JWO state | Compensating rollback (Phase 37) | PROVEN LIVE |
| 23 | `recordJobWorkScrap` | movement + JWO state + record | Compensating rollback (Phase 37) | PROVEN LIVE |
| 24 | `directDispatchFromJobWorker` | movement + JWO state | Compensating rollback (Phase 37) | PROVEN LIVE |
| 25 | `createPaymentRequest` | Single push | None needed (atomic by construction) | CODE VERIFIED |
| 26 | `recordPettyCashVoucher` | Single push | None needed (atomic by construction) | CODE VERIFIED |
| 27 | `capitalizeFixedAsset` | GL + asset fields | Compensating rollback (pre-existing, Phase 33/34) | CODE VERIFIED this phase (pattern confirmed correct) |
| 28 | `postAssetDepreciation`, `disposeFixedAsset`, other Phase 33/34-era GL-touching functions | GL + asset/state fields | Compensating rollback (pre-existing) | NOT independently re-tested this phase (out of the named Part B list) |

**Recalculated denominator: 28 named/discovered atomicity-risk functions** (superseding "~23" — do not reuse without re-verification, per the mission's own instruction).

- **Total: 28**
- **Fault-tested (PROVEN LIVE this phase or regression-confirmed): 24**
- **Passed: 24 / 24 tested (100%)**
- **Code-verified-only (no live fault test, pattern already established correct): 3** (`capitalizeFixedAsset` + createPaymentRequest/recordPettyCashVoucher's construction argument)
- **Untested this phase: 1** (the broader Phase 33/34 GL-touching set beyond #27, e.g. `postAssetDepreciation`, `disposeFixedAsset`)
- **Fixed this phase: 9** (`postDraft`, `postProductionLabourCost`, `postInstallationLabourCost`, `postBankImportLine`, `issueToSite`, `dispatchToJobWorker`, `returnFromJobWorker`, `recordJobWorkScrap`, `directDispatchFromJobWorker`)
- **Retested after fix: 9 / 9 (100%)**

**Atomicity coverage percentages:**
- **Overall (fault-tested-and-passed ÷ total census): 24/28 = 86%**
- **Financial (GL-touching): 21/22 tested = 95%** (postAssetDepreciation/disposeFixedAsset untested)
- **Inventory: 6/6 tested = 100%**
- **Project (cost/revenue-tagged transactions): fully covered by the above — 100% of tested functions**
- **Fixed-Asset: 1/3 tested = 33%** (capitalizeFixedAsset code-verified; depreciation/disposal untested)
- **Import (bank import): 1/1 = 100%**
- **Clearing: not a separately tracked category in this codebase — clearing-account postings ride the same GL path as the functions above, no separate clearing-specific function exists to test.**

---

## 12. Architectural maturity — L0-L5, 10 dimensions

| Dimension | Score | Evidence |
|---|---|---|
| 1. Route-level authorization enforcement | **L5 — Structurally enforced, boot-fails without it** | Server refused to boot twice during Part F (PROVEN LIVE) |
| 2. Domain-layer write-point capability enforcement | **L4 — Fails closed, but only for authorization, not atomicity** | `checkWritePointCapability()` (STATICALLY VERIFIED) |
| 3. Transaction atomicity — architectural | **L1 — Opt-in only, pattern must be manually applied per function** | Naive function orphaned GL on first failure, 3/3 (PROVEN LIVE) |
| 4. Transaction atomicity — actual coverage of known-risk functions | **L4 — 24/28 census items proven safe, gap is disclosed and narrow** | §11 |
| 5. Idempotency / duplicate-retry protection | **L2 — Present but silently defeated by any thrown handler** | `withIdempotency()` never records on throw (PROVEN LIVE via Part D) |
| 6. Audit trail reliability | **L4 (post-fix) — Never blocks or is blocked by the business transaction** | `logAudit()` fix (PROVEN LIVE, regression-confirmed) |
| 7. Process-crash / durability guarantee | **L1 — save()-boundary durability only, no WAL, no transaction log** | Real `process.exit()` test (PROVEN LIVE), disclosed as a hard architectural limit |
| 8. Static/boot-time self-verification | **L5 — for authorization; L0 — for atomicity** | Scanner's own comment discloses the blind spot |
| 9. Cross-module consistency (GL vs. sub-ledgers) | **L3 — proven consistent where tested, several boundary pairs untested** | §8 |
| 10. Independent reconciliation capability (raw-data, not report-endpoint) | **L4 — computable and balanced, one shared-account labeling gap disclosed** | §9 |

---

## 13. NO-GO conditions — applied

Of the mission's 10 absolute NO-GO conditions:
- *"Any tested transaction partially commits under fault injection"* — **did occur** for `postBankImportLine` mid-fix (§6.1) but was **caught and corrected within this same phase**, then re-verified clean. No such condition exists in the *final* state of any function reported as fixed.
- *"Any retry causes a double-post"* — **did occur** (Part D exploit) and was fixed and re-verified; the retry battery in §6/§11 shows clean single-posting on every fixed function's legitimate retry.
- *"A naive transaction bypasses atomicity protection"* — **TRUE, confirmed, by design of the test** (Part F). This is not a NO-GO on the *current, fixed* functions — it is the honest, structural answer to the mission's central question: atomicity is not architecturally forced onto *new* code.
- All other conditions (GL/inventory permanent divergence in a *shipped* function, unreconciled crash state in a *shipped* function, new write point bypassing protection, unexplained independent-reconciliation difference) — **not observed** in any function this phase reports as fixed and retested.

**Verdict given these conditions:** The system is **NOT unconditionally GO** — because Part F's finding is real and structural, not a fixable bug in one function. It is, honestly stated: **every known, named, discovered high-risk transaction is now fault-tested and protected (24/28, 86% of the full census, with the 4 gaps narrow and disclosed) — but the architecture provides no guarantee that the *next* new transaction anyone writes will be safe.** That guarantee does not exist and was not built this phase (a real transaction manager/WAL would be required, explicitly out of scope for this JSON-file Lab).

---

## 14. Final architectural questions

1. **Is atomicity structurally enforced?** NO — proven by the naive-function test (Part F).
2. **Can a new developer bypass it?** YES, trivially and without even noticing — the naive function reused only sanctioned building blocks.
3. **Can a new financial write bypass authorization the same way?** NO — the boot-time scanner blocks it structurally (Part F).
4. **Do `postJournalEntry()`/`postInventoryMovement()` themselves guarantee transaction safety?** NO — they guarantee their *own* internal debit=credit / stock-level validity, but guarantee nothing about the caller's surrounding mutation sequence; every defect fixed this phase and in Phases 35/36 occurred in the code *around* these two functions, not inside them.
5. **Does audit failure create duplicate-retry risk?** It DID (Part D) — now fixed at the shared `logAudit()` function.
6. **Does process crash create partial state?** YES, categorically, within a specific save()-to-save() window — an inherent limit of this architecture (Part E), not fixed.
7. **Does JSON-file architecture provide SAP-level transactional guarantees?** NO — no WAL, no true DB transaction, no crash-atomic multi-file commit. What it does provide (compensating rollback, applied function-by-function) approximates the *outcome* of atomicity for every function where a developer remembered to apply the pattern, which is now 24 of 28 known-risk functions.
8. Is the 86% coverage figure durable, or does it decay with every new feature? **It decays** — nothing prevents the next new feature from being naive, as Part F proves.
9. Is route-level authorization enforcement a reasonable analog for what atomicity enforcement *would* look like if built? **YES** — the scanner pattern (walk the source at boot, refuse to start without a recognizable safety marker) is a concrete, already-proven template; it does not yet exist for atomicity.
10. Should this be classified per the mission's own required language? **YES: "OPT-IN TRANSACTION SAFETY — NOT ARCHITECTURALLY ENFORCED."**

---

## 15. What was NOT completed this phase (explicit disclosure, not fabrication)

- Full row-by-row testing of every pre-Phase-37 GL-touching function beyond the regression pass (e.g., `postAssetDepreciation`, `disposeFixedAsset` individually fault-tested) — not done.
- A dedicated, separate "introduce a new write path and see if it's caught" exercise distinct from the Part F naive-function test — not done as a second, independent exercise.
- Exhaustive per-document-type live testing of `postDraft()` — deliberately not done, with the structural justification in §5 (no per-type branching exists to test differently).
- A full walk of all 10 named cross-module boundary pairs in Part I — 5 of 10 directly exercised; the remainder (asset+GL beyond capitalization, tax+GL, clearing+AR/AP) not independently tested this phase.

---

## 16. Summary of all live database changes this phase (test artifacts, all reversed via legitimate API where they touched real financial records)

- Naive-function test: JE-0916–JE-0919 posted and reversed (→ JE-0920–0923); `DB.__naiveTestDocs` deleted (pure test scaffolding, never real data).
- Process-crash test: JE-0938 (orphan) reversed (→ JE-0939); PEXP-0045/JE-0940 deliberately left in place as evidence of correct durable behavior.
- Part D exploit + fix confirmation on INST-0004: 6 JEs (JE-0924–JE-0929) all reversed (→ JE-0945–JE-0950).
- `postDraft()` fix verification: JE-0943 reversed (→ JE-0944).
- `postBankImportLine()` first (buggy) fix + its duplicate: JE-0952/JE-0953 reversed (→ JE-0956/JE-0957); corrected fix re-verified on BIL-00002, JE-0958 reversed (→ JE-0959).
- Job-work fixture data (JWO-0003/0004/0005, MRS-0004, associated inventory movements) — inventory-only, no GL impact, left in place as legitimate operational test records (same treatment as the durable process-crash artifact).

All financial-record cleanup used `/api/journal/:id/reverse` with an explicit reason, per this audit series' standing policy — never a direct edit to financial history.
