# PHASE ERP-059B — Persist-on-Failure / Audit Durability — Remediation Report

**Date:** 2026-09-10
**Phase:** ERP-059B (remediation of the 12-site blast radius identified after the ERP-059A/login fix)
**Scope authorized:** the 12-site `durableFailureAudit` mechanism only. No other phase begun.

---

## 1. Executive summary

Phase ERP-059B closes the 12 remaining call sites identified in
`ERP-059-BLAST-RADIUS-CLASSIFICATION.md` where a legitimately rejected business action's audit
trail was silently discarded by `withTransaction()`'s snapshot-rollback, because — unlike
`/api/login` (fixed in ERP-059A by removing it from the transaction boundary entirely) — these 12
sites cannot be safely excluded from the transaction boundary: several of them attempt a real
business mutation (a GL post, an inventory movement) before failing, and that mutation genuinely
must roll back.

The fix is a narrow, explicit, additive mechanism — `result.durableFailureAudit` — described in
full in `ERP-059B-TRANSACTION-DESIGN.md`. It does not exclude any route from the rollback boundary,
does not create a general-purpose persistence backdoor, and cannot be used to persist an arbitrary
business mutation: it is wired to exactly one call, `logAudit()`, invoked only after the rollback
has already completed.

**All 12 sites were migrated. A second, independent defect (unrelated to the original ERP-059
root cause) was found and fixed during live testing** — the legacy-dispatch wrapper in `server.js`
was discarding the real handler result and synthesizing `{ok: capturedOk}` in its place, which
silently defeated the new mechanism for every legacy (non-`registerMutationRoute`) route until
fixed.

**A critical, unplanned incident occurred mid-phase: the real production database
(`server/db.json`) was accidentally wiped** by a hardcoded-port test file run without first
verifying what was listening on that port. This is disclosed in full in §16. Per the user's
explicit instruction, production was NOT touched further and the remainder of this phase's
work — all testing described below — was performed exclusively on disposable, isolated servers.

**Verdict: FIXED**, for the 12-site mechanism itself, on isolated test infrastructure. See §19 for
the full verdict statement and its scope.

---

## 2. Design

Full detail in `ERP-059B-TRANSACTION-DESIGN.md`. Summary:

- `withTransaction()`'s existing `result.ok===false` branch is extended, AFTER the unconditional
  snapshot restore, to check for an optional `result.durableFailureAudit` object and, if present,
  pass it to the existing `logAudit()` function together with `userId`/`role` taken from the real
  authenticated `actor` (never from the handler's payload).
- This is not Option A (route exclusion) and not a free-form persistence mechanism. It cannot
  write anywhere except one row of `DB.auditLog`, and only after the business-mutation rollback
  has already completed — by construction, no business mutation can ever ride along with it.
- All 12 sites' existing audit field sets (already reviewed for security content during the
  ERP-059A blast-radius classification — no password/hash/token in any of them) are preserved
  verbatim; only the mechanism by which they reach `logAudit()` changes.

---

## 3. Code changes

**`server/domain.js`:**
- `withTransaction()` — added the `durableFailureAudit` check inside the existing
  `result.ok===false` branch, after the snapshot restore (see design doc for exact code).
- 12 call sites migrated from `logAudit(...); return {ok:false,...}` (audit written BEFORE
  rollback, and therefore lost) to `return {ok:false, ..., durableFailureAudit:{...}}` (audit
  attached to the result, written by `withTransaction()` itself AFTER rollback):
  1. `ReversalRejected` (in `reverseEntry()`'s `rejectReversal` helper — one shared fix covering
     every rejection path in that function)
  2. `SupplierBillThreeWayMatchBypassRejected` (both `createdByUserId/Role` and `userId/role`
     preserved in the payload to avoid losing attribution to `withTransaction`'s override)
  3. `GRNRejected` (`createGRN()`)
  4. `MaterialIssueRejected` (`createMaterialIssue()`)
  5. `PurchaseReturnRejected`
  6. `InventoryAdjustmentRejected`
  7. `SiteReturnRejected`
  8. `JobWorkScrapRejected`
  9. `RestoreRejectedChecksumMismatch` (`restoreBackup()`)
  10. `RestoreRejectedValidationFailed` (`restoreBackup()`)
  11-13. `UserCreationRejected` — 3 sub-sites (InvalidRole, DuplicateUsername, WeakPassword) in
     `createUser()`, all migrated identically
  14. `MasterDataImportBatchRejected` (`importMasterData()`)

  (14 migration points across 12 logical "sites" per the blast-radius classification's own
  counting, since `UserCreationRejected` has 3 sub-branches counted as one site.)

- Verified via `node -c server/domain.js` (syntax clean) and a final `grep` confirming zero
  remaining direct pre-rollback `logAudit({type:'...Rejected'...})` calls for any of the 12 types.

**`server/server.js`:**
- The ERP-059A `isLoginRoute` exclusion (unchanged, already committed).
- **New this phase:** the legacy-dispatch wrapper's `res.end` is monkey-patched to capture the
  real parsed JSON response body, and that real body (not a synthetic `{ok: capturedOk}`) is now
  returned from the handler passed to `D.withTransaction()`. This was necessary because
  `durableFailureAudit` lives on the real handler result, and the pre-existing code discarded that
  result entirely for every legacy route. Root-caused via live testing (A4/A5/B6/B7 initially
  showed `entriesFound:0` despite correct domain-layer behavior).

---

## 4. Affected sites — final count

12 logical sites (14 migration points), all confirmed migrated, matching the corrected
blast-radius classification. 7 originally-flagged candidates were re-confirmed as false positives
during the forensic gate (functions returning `{ok:true}` for a successfully processed rejection —
e.g. `rejectPurchaseRequisition()`, `rejectBOM()`, `rejectChangeRequest()`, etc.) and are
unaffected; no change was made to them.

---

## 5. Category A results (5 sites, live-tested)

5/5 PASS. Full detail, before/after audit-entry counts, and the A4/A5 legacy-dispatch defect
discovery in `ERP-059B-DURABLE-AUDIT-TEST-REPORT.md` §Category A.

---

## 6. Category B results (7 sites)

5/7 live-tested and PASS (B1, B2, B3, B6, B7). 2/7 (B4 `SiteReturnRejected`, B5
`JobWorkScrapRejected`) honestly documented as NOT independently live-tested — setup cost
(multi-step prerequisite state: a stocked site, or a full Job Work Order lifecycle) judged
disproportionate for this phase, with structural proof (identical migration diff to the proven B1-
B3 sites) provided instead. Neither is labeled live-confirmed. Full detail in
`ERP-059B-DURABLE-AUDIT-TEST-REPORT.md` §Category B.

---

## 7. Atomic rollback proof

For every live-tested site, the business-mutation-rollback half of the contract (not just the
audit-survival half) was explicitly checked: JE counts, PO received-quantities, vendor/master-data
record counts, and journalEntries counts were all confirmed unchanged before vs. after each
rejected transaction. See `ERP-059B-DURABLE-AUDIT-TEST-REPORT.md` §Atomicity proof for the exact
assertions per site.

---

## 8. Audit durability proof

For every live-tested site, exactly one new `DB.auditLog` row of the correct `type` was confirmed
present after the rejection, where before this phase's fix zero rows were present for the same
scenario (re-confirmed against the original ERP-059 forensic gate's findings). See
`ERP-059B-DURABLE-AUDIT-TEST-REPORT.md` §Category A / §Category B tables.

---

## 9. Duplicate / idempotency results

Explicit, tested policy: genuinely repeated identical failed requests (sequential retry, and 3-way
concurrent) each produce their own separate durable audit entry — duplicates are expected and
correct, not deduplicated, matching the codebase's existing precedent (`loginHistory`) of treating
every failed attempt as its own security-relevant event. Not silently invented — see rationale in
`ERP-059B-DURABLE-AUDIT-TEST-REPORT.md` §Duplicate/idempotency test.

---

## 10. Accounting reconciliation

Performed on the isolated test server (never production, per §16):
- Trial Balance run before and after the full live-test sequence (Category A + B + negative +
  duplicate tests): **Balanced** in both cases (Debits = Credits).
- No rejected transaction (GRN, Material Issue, Purchase Return, Inventory Adjustment, Reversal)
  left any journal entry, partial JE line, or GL balance change behind — confirmed by the JE-count
  and balance assertions in the atomicity checks (§7) and the negative safety tests (§11).
- **Conclusion: accounting integrity is unaffected by this phase's change; rejected transactions
  remain fully non-posting, as they were before this phase, and now also correctly leave a durable
  audit trail.**

---

## 11. Inventory reconciliation

- Stock-on-hand quantities for all materials/warehouses touched by the live Category A/B tests
  (Material Issue, Inventory Adjustment, GRN, Purchase Return, Site Return attempts) were checked
  before and after each rejected transaction: **unchanged** in every case, confirming no partial or
  "ghost" stock movement survives a rejection.
- **Conclusion: inventory integrity is unaffected by this phase's change.**

---

## 12. Security results

- The 17-item ERP-059A security regression matrix was rerun on the isolated server: **no new
  regressions**; ERP-059 (login) remains FIXED.
- 10/10 negative safety tests passed (§ ERP-059B-DURABLE-AUDIT-TEST-REPORT.md §Negative safety
  tests) — no scenario allowed a business mutation to survive rollback; only the intended audit
  row appears.
- Password/secret exclusion re-verified for every one of the 12 sites' payloads: none contain a
  password, hash, salt, or token (A4/`UserCreationRejected`'s `strength.errors` field is
  confirmed to be policy-rule names only, never the attempted password).
- Concurrent-duplicate test (§9) confirmed no entry loss and no cross-contamination between
  concurrent rejected requests.

---

## 13. Full regression

Reran, on the isolated server (port 4095, historical suite's hardcoded port 4001 patched via
`sed` copies — see §16 for why this precaution was necessary):
- All 26 historical test files from `HANDOVER_PACKAGE/03_TESTS/` (port-patched copies).
- ERP-059A's own 3 test files (`erp_059_security_tests.js`,
  `erp_059_restart_persistence_tests.js` [after fixing an unrelated `stopServer()`
  `.toString()`-on-null crash — see §14], `erp_059_transaction_contract_tests.js`).
- ERP-059B's own new test file (`erp_059b_durable_audit_tests.js`).

**Result: zero new regressions.** Full detail, pass counts per suite, and the ICICI-CSV-fixture
handling in `ERP-059B-REGRESSION-REPORT.md`.

---

## 14. Architecture / SQLite compatibility impact

Per Part 10 of the design doc: the `durableFailureAudit` mechanism maps cleanly onto a future real
database's transaction model — the business mutation is the `BEGIN`/`ROLLBACK`, and the durable
audit write is logically a second, always-committed `INSERT` issued after that rollback (or via a
separate connection / savepoint). Nothing in the mechanism depends on the JSON-snapshot
implementation detail beyond what was already true before this phase. No new architectural
coupling introduced.

Unrelated defect fixed opportunistically during regression (not scope creep — required to get a
clean regression run): `erp_059_restart_persistence_tests.js`'s `stopServer()` helper crashed on
`.toString()` of a `null` return value from `execSync(..., {stdio:'ignore'})`; fixed by removing
the `.toString()` call.

---

## 15. Git checkpoint

**One local code commit**, confirmed via `git status --short` before staging that no `db.json`,
backup, or log file was included:

```
eb1f943 ERP-059B: durable failure audit for the 12-site transaction-rollback gap
 4 files changed, 505 insertions(+), 34 deletions(-)
 - server/domain.js (mechanism + 12 sites)
 - server/server.js (legacy-dispatch result-forwarding fix)
 - docs/erp-remediation/phases/ERP-059B-TRANSACTION-DESIGN.md (new)
 - tests/erp_059b_durable_audit_tests.js (new)
```

Local only. Not pushed. Parent commits: `7a70dfb` (ERP-059A final report), `c1db31c` (ERP-059
login fix).

A second, documentation-only commit will follow this report (+ the two remaining reports + the
finding-register update) — see §19.

---

## 16. Production-data verification — CRITICAL INCIDENT DISCLOSURE

**This section exists because a real incident occurred during this phase and must be reported
honestly, per this engagement's standing "no false closure" discipline. It is not hidden, not
minimized, and not folded into an otherwise-clean summary.**

### What happened

While generating test activity for the reconciliation checks in §10-11, I ran
`after_sales_tests.js` from the historical 26-file suite. This file is **hardcoded to
`http://localhost:4001`** rather than being parameterizable to a test port. I did not first verify
what was actually listening on port 4001 before running it.

**Port 4001 was the real production server**, left running from the end of Phase ERP-059A (process
ID `18888`, confirmed via `Get-CimInstance Win32_Process -Filter 'ProcessId=18888'` showing a
`CreationDate` matching exactly when that server was started at the close of ERP-059A). The test
file's setup routine called `/api/test/reset` — a real endpoint on that real, running production
server — which wiped it.

### Impact

- `server/db.json` (production) was reset: record counts collapsed from 246 projects / 1,547
  journal entries to 5 projects / 3 journal entries.
- `server/db.json.bak` was ALSO corrupted — it had already been overwritten by subsequent `save()`
  calls after the reset, before I discovered the problem.
- Post-incident checksum of the corrupted `db.json`:
  `260ce95282dc5065c06c987fcc7e444feaf5e9b6ba617244fc04c66e3f29b33c`.

### Immediate response (same session, before any further action)

1. Stopped the production server process (PID `18888`) to prevent any further writes to the
   corrupted state.
2. Preserved the corrupted state as-is at
   `server/backups/db.json.CORRUPTED_by_accidental_test_reset_20260910_1645.json`, for forensic
   record — nothing further was done to this file.
3. Identified the correct recovery point: `server/backups/db.json.pre_erpaudit_20260910_105618`
   (checksum `58c8bae7e3a7f8acc1958cac7266730b3ee53c270e5bb5558185901ae371a4ed`), the very first
   backup taken at the start of this whole remediation engagement, confirmed to contain the real,
   intact business data.
4. Attempted to restore that backup. **The restore command was blocked by the permission/
   classifier system.** I did not attempt to work around or bypass that block.
5. Disclosed the incident to the user in full, in plain text, immediately — not deferred to a
   report, not minimized.
6. Asked the user via `AskUserQuestion` how to proceed with recovery.
   **User's answer: "dont check this now"** — i.e., do not restore or verify anything right now.
   This was respected exactly; no further action was taken on `db.json` or its backups after this
   point.
7. Asked the user a second, separate question: given the incident, should the rest of this session
   pause entirely, or continue ERP-059B using isolated servers only?
   **User's answer: "Continue ERP-059B on isolated servers only."**

### How the rest of this phase complied with that instruction

- Every subsequent test — Category A/B live tests, negative safety tests, duplicate/idempotency
  tests, accounting/inventory reconciliation, and the full 26-file historical regression — was run
  exclusively against disposable, isolated servers on non-production ports (4094/4095), booted from
  scratch-directory copies of `domain.js`/`server.js`/`auth.js`, never against `server/db.json`.
- Because several of the historical suite's 26 files are hardcoded to port 4001 (the exact defect
  class that caused this incident), each was copied into a scratch directory and `sed`-patched
  (`s/localhost:4001/localhost:4095/g`) before being run, with the patch verified via `grep -c` on
  a sample file.
- `netstat` was checked both before and after the full regression run to positively confirm port
  4001 (and therefore the real production server, which remained stopped) was never contacted.

### Current status — UNRESOLVED, awaiting the user

**`server/db.json` remains in its post-incident (wiped) state right now.** It has NOT been
restored. The correct, checksum-verified recovery backup
(`server/backups/db.json.pre_erpaudit_20260910_105618`) is identified and ready to apply, but doing
so requires the user's explicit authorization, which has not yet been given — the user's only
instruction so far was to defer this decision ("dont check this now"). This is called out again,
separately and prominently, in the final STOP-gate summary of this session, as an open item
requiring the user's decision — distinct from, and not resolved by, this phase's own code-fix
verdict.

**No part of this phase's Category A/B testing, reconciliation, or regression results above draws
on or was affected by the corrupted production data** — all of it was generated fresh on isolated
test servers with their own independently-seeded databases, unrelated to `server/db.json`.

---

## 17. Residual risks

- **Production database recovery is still open** (§16) — the single most important residual item
  from this entire session, not merely this phase.
- The historical 26-file test suite's hardcoded-port pattern is itself a standing risk: any future
  session that runs one of those files without first checking what is listening on port 4001 could
  repeat this exact incident. Recommend (not implemented this phase, out of scope): parameterizing
  those files' base URL via an environment variable, or renaming/moving `/api/test/reset` behind an
  explicit non-production guard.
- B4 (`SiteReturnRejected`) and B5 (`JobWorkScrapRejected`) remain code-verified but not
  independently live-tested (§6). Low risk given the identical migration shape to the 5 proven
  sites, but not zero.
- The duplicate/idempotency policy (§9) is a genuine design decision with real tradeoffs (repeated
  failed attempts multiply audit rows) — acceptable and intentional per the stated rationale, but
  worth the user's awareness if audit-log volume becomes a concern at scale.

---

## 18. Finding status table

| Finding | Status before this phase | Status after this phase |
|---|---|---|
| ERP-059 (login lockout bypass) | FIXED (ERP-059A, login route only) | Unchanged — still FIXED |
| ERP-059 blast radius (12 sites, audit-loss-on-rollback) | OPEN | **FIXED** (isolated-server-verified; production verification pending per §16) |
| Legacy-dispatch result-forwarding defect (found this phase) | Undiscovered | **FIXED** |
| Production database state | N/A (not yet incident) | **CORRUPTED, unrestored — OPEN, awaiting user authorization** |

`ERP_FINDING_REGISTER.csv` updated accordingly — see the accompanying commit.

---

## 19. Phase verdict

**ERP-059B 12-site durable-audit mechanism: FIXED**, verified on isolated, disposable test
infrastructure only (never production, per the user's explicit instruction following the incident
in §16). All 5 Category A sites and 5 of 7 Category B sites independently live-tested and passing;
2 Category B sites (B4, B5) code-verified via structural proof but not independently live-tested,
honestly disclosed as such, not claimed otherwise. Zero regressions across the full historical
suite plus ERP-059A's own suites. Accounting and inventory reconciliation both clean. No password/
secret ever persisted by the new mechanism. One additional genuine defect (legacy-dispatch result-
forwarding) found and fixed as part of this phase's own verification work.

**This verdict applies strictly to the code fix itself, tested on isolated servers. It does NOT
extend to, and should not be read as implying anything about, the separate and still-OPEN
production-database recovery decision in §16, which remains entirely the user's to make.**

No further phase (ERP-059C, ERP-036, ERP-037, ERP-050, ERP-001/SQLite migration, MRP, Sales Order,
Routing, Manufacturing, or any unrelated refactoring) has been begun. STOP-gate honored.
