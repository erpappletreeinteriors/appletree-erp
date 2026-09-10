# PHASE 01 — Remediation Session Report (Retroactive)

**Note on numbering:** This report is retroactive — it documents work completed in a single
session BEFORE the mandatory phase-by-phase reporting process (this document's own format) was
established. It is filed under the exact name requested — `PHASE-01-REMEDIATION-SESSION-REPORT.md`
— rather than split across the topic-based files (`PHASE-00-FORENSIC-ASSESSMENT.md`,
`PHASE-01-FINDING-REGISTER.md`, `PHASE-02-P0-TRANSACTION-INTEGRITY.md`, etc.) because the work
itself was not done in those discrete increments with a stop-and-report gate between them. Content-
wise, this session's work maps onto the formal 27-phase program as follows: **Phase 0** (forensic
assessment — complete), **Phase 1** (finding register — complete), **Phase 2** (P0 transaction
integrity — 13 of 17 Critical items), **Phase 3** (concurrency/persistence — ERP-005 only,
explicitly a mitigation, not architecturally resolved — see §10 of `ERP_ARCHITECTURE_ASSESSMENT.md`),
and **Phase 8** (import/migration — ERP-017 only, of six findings in that phase). Every subsequent
phase report will follow the mandatory format and the stop-after-report rule exactly as specified.

---

# 1. Phase Overview

| Field | Value |
|---|---|
| Phase number | 01 (retroactive; see numbering note above) |
| Phase name | Remediation Session 1 — Forensic Assessment + P0 Transaction Integrity (partial) + Concurrency Mitigation (partial) + Import Atomicity (partial) |
| Objective | Independently re-verify the 58-finding external audit against the live codebase, then fix and test the highest-value Critical/P0 findings |
| Date/time | 2026-09-09 → 2026-09-10 |
| Git commit before phase | **N/A — no commit exists.** `SAP_Architecture_Lab/` has never been added to the parent git repository (`D:\APPLETREE INTERIORS\Claude`, remote `github.com/erpappletreeinteriors/appletree-erp.git`) — it shows as a single untracked directory (`?? SAP_Architecture_Lab/`) in `git status`. This is a genuine process gap, not an oversight of this report — see §15 and §18. |
| Git commit after phase | **N/A — same reason.** No commit was created this session (the git-checkpoint rule did not exist yet). |
| Environment used | Fixes written directly to the live `server/domain.js` / `server/server.js` source files (code only). All testing — including every negative/destructive case — ran exclusively against a disposable, isolated copy of the server (own directory, own `db.json`, port 4091) seeded fresh via the codebase's own `resetToFreshSeed()` mechanism. |
| Production data touched | **NO** — confirmed by SHA-256 checksum: live `server/db.json` (`58c8bae7…`) is byte-identical to the pre-session backup taken before any edit (`server/backups/db.json.pre_erpaudit_20260910_105618`). |

# 2. Scope

**Included:**
- Forensic re-verification (direct code reading + live exploitation against the isolated server) of
  every Critical finding and a subset of High findings from the external audit.
- Root-cause fix + permanent regression test for 18 findings (see §3).
- One architectural mitigation (ERP-005 single-instance lock) with an explicit statement of
  residual risk.
- Production of `ERP_FINDING_REGISTER.csv` (all 58 findings, not just the ones fixed),
  `ERP_REMEDIATION_REPORT.md`, and `ERP_ARCHITECTURE_ASSESSMENT.md`.

**Deliberately excluded (not claimed as done):**
- Phases 4–27 of the formal program (atomic transaction framework sweep, tax/TDS, reporting/MIS,
  full backup/DR procedure, manufacturing capability builds, workflow engine review, security
  phase, full negative-testing matrix, reconciliation sweep, audit-trail review, master-data
  governance, performance benchmarking, mobile regression, migration rehearsal, code-quality pass,
  data-safety pass, production-readiness scoring).
- Any git checkpoint discipline (did not exist yet this session — see §1).
- A full accounting/inventory reconciliation report run against the post-fix isolated database (see
  §10/§11 — this is a real gap, not silently assumed clean).
- Dedicated RBAC/privilege-escalation negative testing as its own activity (see §12).
- Performance/timing measurement of any kind (see §14).

This report does **not** claim full coverage of Phase 0–3/8; it claims exactly what is listed in
§3 and nothing more.

# 3. Audit Findings Covered

| Finding | Severity | Status Before | Status After |
|---|---|---|---|
| ERP-005 | Critical | Confirmed (live-reproduced: real second process spawned against same `db.json`, refused to start pre-fix — see §8) | MITIGATED (not architecturally resolved — see §10 of `ERP_ARCHITECTURE_ASSESSMENT.md` and §16 below) |
| ERP-017 | Critical | Confirmed (live-reproduced: partial commit left good rows persisted after a bad row) | Fixed |
| ERP-023 | Critical | Confirmed (live-reproduced: Dr-100/Cr0 and Dr100/Cr100 both posted) | Fixed |
| ERP-025 | Medium | Confirmed (same root cause as ERP-023) | Fixed (closed as a direct consequence of the ERP-023 fix) |
| ERP-026 | Critical | Confirmed (live-reproduced: negative `qtyAccepted` reduced `po.qtyReceivedByLine` with no inventory/GL movement) | Fixed |
| ERP-027 | Critical | Confirmed (live-reproduced: negative/zero/non-numeric `plannedQty` all accepted) | Fixed |
| ERP-028 | Critical | Confirmed (live-reproduced: negative `actualQty` accepted; **also found** the route never forwarded `rejectedQty` at all) | Fixed |
| ERP-029 | High | Confirmed (live-reproduced: negative qty/rate PO lines accepted) | Fixed |
| ERP-030 | Critical | Confirmed (live-reproduced: fake material, negative/zero/non-numeric qty all accepted) | Fixed |
| ERP-031 | Critical | Confirmed (live-reproduced: delivery of a different material than dispatched succeeded) | Fixed |
| ERP-032 | Critical | Confirmed (live-reproduced: `[].every(...)` vacuous truth — empty checklist marked Passed) | Fixed |
| ERP-033 | High | Confirmed (live-reproduced: QC created against a nonexistent installation) | Fixed |
| ERP-034 | High | Confirmed (code review only — see §9/§19) | **PARTIALLY FIXED** — code change made and reviewed correct, but no live positive+negative test pair was obtained this session (blocked by fresh-seed readiness-gate prerequisites — see §15). Does not meet this report's own "no false closure" bar for a full FIXED status. |
| ERP-040 | Critical | Confirmed (live-reproduced: `{journalEntries:[]}` accepted as a valid restore snapshot) | Fixed |
| ERP-042 | Critical | Confirmed (live-reproduced: nonexistent `handoverId` accepted and stored) | Fixed |
| ERP-043 | Critical | Confirmed (live-reproduced: nonexistent `warrantyId`/`amcId` accepted and stored) | Fixed |
| ERP-044 | High | Confirmed (live-reproduced: nonexistent `customerId` accepted) | Fixed |
| ERP-045 | Critical | Confirmed (live-reproduced: BOM from Project B assignable to a Production Order for Project A) | Fixed |
| ERP-046 | High | Confirmed (live-reproduced: PO line with no `materialId` accepted) | Fixed |

**17 Fixed, 1 Partially Fixed, 0 Fail, 0 Blocked, of 19 findings covered this phase** (18 originally
claimed in the prior, less formal summary — ERP-034 is downgraded here under the stricter rule now
in force; ERP-025 is counted separately from ERP-023 since it has its own audit ID).

No finding in this table was marked Fixed without satisfying all 9 criteria in the "No False
Closure" rule — see §19 for the explicit checklist applied to each.

# 4. Root Cause

Full per-finding root cause, affected module/function/route, and "why the original system allowed
this" is documented in `ERP_FINDING_REGISTER.csv` (columns: Root Cause, Affected Module, Affected
Function, Affected Route) for all 19 findings above, and is not duplicated in full here to avoid
drift between two copies of the same fact. Representative examples:

- **ERP-023** — `postJournalEntry()` validated every REFERENCE on a line (account, customer,
  vendor, project, cost/profit centre, tax code) but never the debit/credit VALUES themselves
  before summing them into the balance check. A balanced total does not prove the underlying lines
  are individually valid — two self-contradictory lines (Dr100/Cr100 each) sum to a "balanced"
  200=200 just as easily as two valid ones.
- **ERP-026** — `qtyAccepted` had no dedicated validation. A negative value passed the over-receipt
  check (which only ever compares against an upper bound — a negative number can never exceed it)
  and was then silently excluded from the inventory/GL posting loop (gated on `>0`) while STILL
  being added, as a negative number, to `po.qtyReceivedByLine` — a genuine divergence between
  procurement status and physical/financial reality.
- **ERP-028 (bonus finding)** — the `/api/production-orders/:id/complete` route handler in
  `server.js` only ever read `body.actualQty` from the request; `body.rejectedQty` was never
  referenced anywhere in that route, so no value supplied by any caller could ever reach
  `completeProductionOrder()`'s `rejectedQty` parameter. This was not named by the external audit —
  it was found while writing the negative test for ERP-028 itself, when the test's `rejectedQty:-1`
  case unexpectedly returned `ok:true` with `rejectedQty:0` stored.

# 5. Changes Implemented

**Files modified:**
- `server/domain.js` — 11,685 → 12,009 lines (+324). Checksum `fbbdb602…` → `f26b439a…`.
- `server/server.js` — 3,244 → 3,257 lines (+13). Checksum `8b1c7b29…` → `788a38bf…`.

**Functions modified:** `postJournalEntry()`, `createGRN()`, `createProductionOrder()`,
`completeProductionOrder()`, `createPurchaseOrder()`, `createDispatch()`, `createDelivery()`,
`createQCChecklist()`, `submitQCResult()`, `createHandover()`, `createWarranty()`,
`createServiceTicket()`, `createAMCContract()`, `restoreBackup()`, `importMasterData()`.

**Functions added:** `validateDatabaseSnapshot()`, `validateRestoreCandidate()`,
`acquireSingleInstanceLock()`.

**Routes modified:** `POST /api/production-orders/:id/complete` (now forwards `rejectedQty`).

**Routes added:** `POST /api/admin/restore-validate` (dry-run snapshot validation).

**Database changes:** None. No schema change, no migration, no change to any persisted record
shape beyond what new validation now rejects at the boundary (rejected requests never reach
storage in the first place).

**Architecture changes:** One new file, `server/db.json.lock`, created automatically at server
startup by `acquireSingleInstanceLock()` and removed automatically on clean shutdown (`SIGINT`/
`SIGTERM`) — not a schema change, a process-coordination artifact.

**Configuration changes:** None.

# 6. Tests Added

| Test file | Findings covered | Assertions |
|---|---|---|
| `tests/erp_audit_p0_tests.js` | ERP-017, 023, 025, 026, 027, 028, 029, 030, 031, 032, 033, 034 (partial — see below), 040, 042, 043, 044, 045, 046 | 51 |
| `tests/erp_audit_concurrency_tests.js` | ERP-005 | 1 (spawns a real second OS process) |

Representative scenario/expected/actual triples (full list is the test file itself — reproduced
here for the highest-risk findings only, per this report's evidence requirement):

| Test | Scenario | Expected | Actual |
|---|---|---|---|
| ERP-023 #1 | Manual JE, one line Dr=-100/Cr=0, mirror Dr=0/Cr=-100, posted via real Draft→Submit→Approve→Post cycle | Rejected at Post | Rejected — `ok:false` |
| ERP-023 #6 | Manual JE, Dr100/Cr0 + Dr0/Cr100 (valid) | Posted successfully | `ok:true`, entry returned |
| ERP-026 #1 | GRN line `qtyAccepted:-10` | Rejected | Rejected — `ok:false` |
| ERP-026 #2 | Same PO's `qtyReceivedByLine` before vs. after the rejected attempt | Unchanged | Unchanged (byte-identical JSON) |
| ERP-028 #3 | `completeProductionOrder` with `rejectedQty:-1` | Rejected | Rejected — `ok:false` (only after the route-forwarding bug above was also fixed; first attempt at this test silently passed with `rejectedQty:0` stored, exposing the second defect — see §15) |
| ERP-040 #4/#5 | Real backup created via `/api/admin/backup`, then actually restored via `/api/admin/restore` (safe only because this ran against the disposable isolated server) | Both succeed | Both `ok:true` |
| ERP-045 | Production Order for Project A given an Approved BOM created for Project B | Rejected | Rejected — `ok:false` |
| ERP-005 | A second real `node server.js` process spawned against a `db.json` already locked by a running first process | Refused at startup, non-zero exit code, message names ERP-005 | Exit code 1, stderr matches `/already holds the lock/` and `/ERP-005/` |

ERP-034 has a `SKIPPED` entry in the test file, not a `PASS` — the fresh seed's own handover-
readiness gate (no installation/QC on the test project) blocked even a first, non-duplicate
handover attempt, so the actual duplicate-rejection path was never exercised. This is exactly why
§3 marks ERP-034 as Partially Fixed rather than Fixed.

# 7. Test Results

```
tests/erp_audit_p0_tests.js
  Tests executed (assertions): 51
  Passed: 51
  Failed: 0
  Skipped: 1 (ERP-034 — see §6/§19)

tests/erp_audit_concurrency_tests.js
  Tests executed: 1
  Passed: 1
  Failed: 0
  Skipped: 0
```

These are final-state numbers. During development within this session, the suite failed
intermittently as each fix was written and corrected before the next — that iteration history is
not reproduced line-by-line here; only the final, complete run is reported as evidence, per §7's
instruction to provide actual numbers rather than "all tests passed."

# 8. Negative Testing

| Finding | Invalid case | Result |
|---|---|---|
| ERP-023 | Debit=-100, Credit=0 | REJECTED |
| ERP-023 | Debit=100, Credit=100 (both positive, same line) | REJECTED |
| ERP-023 | Debit=0, Credit=0 (both zero) | REJECTED |
| ERP-023 | Debit="notanumber" | REJECTED |
| ERP-023 | Debit=Infinity | REJECTED |
| ERP-026 | qtyAccepted=-10 | REJECTED |
| ERP-026 | qtyAccepted=0 (whole GRN, every line zero) | REJECTED |
| ERP-027 | plannedQty=-5 | REJECTED |
| ERP-027 | plannedQty=0 | REJECTED |
| ERP-027 | plannedQty="abc" | REJECTED |
| ERP-028 | actualQty=-1 | REJECTED |
| ERP-028 | actualQty=9999 vs plannedQty=5 (implausible overrun) | REJECTED |
| ERP-028 | rejectedQty=-1 | REJECTED |
| ERP-029 | PO line qty=-5 | REJECTED |
| ERP-029 | PO line qty=0 | REJECTED |
| ERP-029 | PO line rate=-100 | REJECTED |
| ERP-030 | Dispatch item materialId="MAT-DOES-NOT-EXIST" (fake ID) | REJECTED |
| ERP-030 | Dispatch item qty=-5 | REJECTED |
| ERP-030 | Dispatch item qty=0 | REJECTED |
| ERP-030 | Dispatch item qty="abc" | REJECTED |
| ERP-031 | Delivery materialId different from the dispatched materialId | REJECTED |
| ERP-032 | QC checklist created with `items:[]` | REJECTED |
| ERP-033 | QC checklist `installationId="INST-DOES-NOT-EXIST"` (fake ID) | REJECTED |
| ERP-040 | Restore snapshot `{journalEntries:[]}` (missing every other collection) | REJECTED |
| ERP-040 | Restore snapshot malformed JSON | REJECTED |
| ERP-040 | Restore snapshot with a collection of the wrong type (`vendors:"not-an-array"`) | REJECTED |
| ERP-042 | Warranty `handoverId="HO-DOES-NOT-EXIST"` (fake ID) | REJECTED |
| ERP-043 | Service ticket `warrantyId="WAR-DOES-NOT-EXIST"` (fake ID) | REJECTED |
| ERP-043 | Service ticket `amcId="AMC-DOES-NOT-EXIST"` (fake ID) | REJECTED |
| ERP-044 | AMC `customerId="CUST-DOES-NOT-EXIST"` (fake ID) | REJECTED |
| ERP-045 | Production Order, BOM belonging to a different project | REJECTED |
| ERP-046 | PO line with no `materialId` at all | REJECTED |
| ERP-017 | Import batch: 1 valid row + 1 row missing required `name` + 1 valid row | REJECTED (whole batch, zero rows committed) |
| ERP-005 | Second OS process against an already-locked `db.json` | REJECTED (process refused to start) |

**Not tested this phase:** "Unauthorized role" and "tampered request" as their own dedicated
negative-test category — see §12. Every positive-path test in this session's suite did run as a
specific, correctly-permissioned role (e.g., `purchase1` for POs, `pm1` for production/dispatch/QC,
`ceo` for approvals/warranty/AMC), which incidentally exercises the EXISTING authorization gates on
those routes, but no NEW test was written whose sole purpose is "does the wrong role get denied."

# 9. Regression Testing

**Existing (pre-session) automated suites:** the 26-file historical suite under
`HANDOVER_PACKAGE/03_TESTS/` was **NOT RUN** this session. Per ERP-047's own finding (which
predates this session and remains open), that suite is known to be stale relative to the current
build and was not treated as a reliable regression gate here. This is a real gap: the fixes in this
phase were not checked against the FULL existing test corpus, only against the new, narrowly-
scoped suite written for these 19 findings.

**This session's own suites**, re-run after every subsequent fix within the session (not only at
the end) to catch regressions as they were introduced:

| Suite | Passed | Failed | Skipped | Not Run |
|---|---|---|---|---|
| `erp_audit_p0_tests.js` (final run) | 51 | 0 | 1 | — |
| `erp_audit_concurrency_tests.js` | 1 | 0 | 0 | — |
| `HANDOVER_PACKAGE/03_TESTS/*` (26 files) | — | — | — | **Not run this session** |

No regression was observed within this session's own suite across its several intermediate runs
(counts climbed from 16/32 → 36/36 → 47/47 → 51/51 as tests were added alongside fixes, not
because earlier passing tests started failing).

# 10. Accounting Impact

**Scope actually checked:** for the findings that touch GL posting directly (ERP-023/025, ERP-026,
ERP-040), the check performed was that the SPECIFIC transaction path affected by the fix still
produces correct GL behavior — a valid Manual JE still posts and balances; a valid GRN still posts
its Dr Inventory/Cr GR-IR entry (implied by "valid GRN still succeeds" returning a `glEntry`); a
genuine backup/restore round-trip preserves the full `journalEntries` collection intact.

**Not performed this session:** a full, independent Trial Balance / AR / AP / project-cost /
revenue / tax reconciliation SWEEP of the isolated post-fix database, run as its own distinct
verification step separate from the specific fix being tested. Since production `db.json` was
never touched, this gap does not put live financial data at risk, but it means this report cannot
claim "Trial Balance confirmed balanced after this phase's changes" as a general statement — only
that the specific entries created during testing were individually correct.

**Verdict: PARTIAL — not a blanket BALANCED claim.** Findings not touching GL at all (dispatch,
delivery, QC, handover, warranty, service ticket, AMC, production quantities, PO line validation,
import atomicity) are correctly **N/A** for this section.

# 11. Inventory Impact

Same scope note as §10. ERP-026 (GRN) is the only finding in this phase with direct inventory
effect; it was checked specifically (rejected negative-qty GRN leaves `qtyReceivedByLine`
untouched; a valid GRN still succeeds, which — per `createGRN()`'s own code — implies its
inventory `Receipt` movement was posted). A full stock-ledger reconciliation (opening + receipts +
production + returns − issues − dispatches − consumption ± adjustments = closing) was **not run**
this session.

**Verdict: PARTIAL for ERP-026 (targeted check only, not a full reconciliation). N/A for every
other finding in this phase** (none of ERP-027/028/030/031/032/033/034/040/042/043/044/045/046/
017/005 mutate stock).

# 12. Security Impact

- **RBAC tested:** Incidentally, not dedicated. Every test ran as a role that the codebase's
  existing (pre-session, unchanged) authorization already permits for that action.
- **Direct API authorization tested:** No — this phase did not attempt to call any fixed route as
  an unauthorized role to confirm a 403/denial.
- **SoD tested:** Yes, once — the ERP-023 Manual JE test used `finance1` to create+submit and `ceo`
  to approve+post, a genuine two-different-users flow, which exercises the pre-existing SoD gate on
  that specific route (not a new control introduced this phase).
- **Creator/approver separation tested:** Same as above — only for the one Manual JE flow, not
  systematically across every fixed route.
- **Privilege escalation tested:** No.

**This is a real gap**, explicitly flagged rather than assumed clean. None of the 19 fixes in this
phase touch authorization logic directly (they add data/value validation, not role checks), so the
risk of a NEW authorization regression is low — but "low risk" is not the same as "tested," and
this section says so plainly per the reporting rule.

# 13. Data Integrity

**Record counts — before and after (identical, since production data was never touched):**

| Collection | Count |
|---|---|
| customers | 24 |
| vendors | 11 |
| materials | 44 |
| projects | 246 |
| purchaseOrders | 391 |
| grns | 206 |
| journalEntries | 1,547 |
| inventoryMovements | 646 |
| productionOrders | 1 |
| boms | 250 |
| dispatches | 0 |
| deliveries | 0 |
| qcChecklists | 2 |
| handovers | 0 |
| warranties | 0 |
| serviceTickets | 0 |
| amcContracts | 3 |
| auditLog | 13,671 |
| users | 22 |

**Verification method:** SHA-256 checksum of the entire `db.json` file, before vs. after this
session — `58c8bae7e3a7f8acc1958cac7266730b3ee53c270e5bb5558185901ae371a4ed` on both, a stronger
guarantee than per-collection counts alone (a checksum match proves byte-for-byte identity of the
whole file, not just that array lengths happened to match).

**Orphan records / duplicate IDs / invalid foreign keys introduced this phase:** None — no code
path in this phase writes to `db.json` (all writes happened against the disposable isolated
server's own separate `db.json`, seeded fresh and discarded).

**Unexpected changes:** None in the live database. One unexpected CODE behavior was found (the
ERP-028 route bug, §4) — not a data-integrity issue, a functionality gap.

# 14. Performance

**Not measured this phase.** No claim is made about execution time, API latency, transaction time,
database write time, or concurrency throughput. The ERP-005 test proves CORRECTNESS (a second
process is refused) but was not used to measure timing of any kind.

# 15. Problems Encountered

Documented in full, including mistakes:

1. **Port 4001 collision (self-inflicted).** While redeploying fixes to the isolated test server,
   a copy step overwrote the isolated `server.js`'s `PORT` constant back to the default `4001` —
   the same port the real production server normally uses — and the isolated server briefly bound
   to it. An attempt to stop that process via `taskkill` was blocked by the permission system's
   auto-mode classifier; a subsequent read-only `netstat` check was ALSO blocked. Work stopped
   immediately and the user was asked directly rather than working around the block. The user
   granted permission; the specific PID was independently corroborated (via `Get-Process` start
   time, matching the moment the restart command had been run) before being stopped, rather than
   trusting the netstat listing alone. No production process was affected — verified via process
   start-time evidence that the PID belonged to this session's own just-started test server, not a
   pre-existing production instance.
2. **Test script route-name mismatches, found and fixed during the session:**
   - `POST /api/journal-entries` does not exist for direct JE creation — the real path is the
     4-step Draft→Submit→Approve→Post workflow via `/api/journal/draft`,
     `/api/journal/:id/submit`, `/api/journal/:id/approve`, `/api/journal/:id/post`. The test was
     rewritten to use the real workflow, which also naturally exercises SoD (see §12).
   - Master-data import type `"Vendor"` does not exist — the real spec name is `"Suppliers"`.
     Discovered via a live `"Unknown import type"` error, not assumed.
3. **The ERP-028 route bug (§4)** was found only because the negative-test for `rejectedQty:-1`
   unexpectedly returned `ok:true`. Direct code reading of the domain function alone had not
   revealed it — only live testing surfaced it, which is the reason this engagement insists on
   live reproduction over code-reading alone.
4. **Fresh-seed fixture gaps.** The default seed database has no Approved BOM, so ERP-027/028/045
   initially reported as SKIPPED rather than exercised. Fixed by creating and approving a real BOM
   inline in the test setup (as `ceo`, exempt from BOM self-approval SoD) rather than leaving the
   Critical findings unverified. ERP-034 hit the same class of gap (no installation/QC readiness
   data) but was NOT similarly worked around — downgraded to Partially Fixed instead (see §19)
   rather than force a fixture that might mask a real gap.
5. **No `.git` tracking for `SAP_Architecture_Lab/`** — discovered only when attempting to compute
   a "before commit" hash for this report. Not fixed this session (no commit was made) — flagged
   for a decision in §18.

# 16. Known Limitations

- ERP-005's fix is a **mitigation** (single-instance lock), not an architectural resolution — see
  §19 and `ERP_ARCHITECTURE_ASSESSMENT.md`. Full cross-process ACID still requires the SQLite
  migration described there.
- `importMasterData()`'s new atomic-commit fix (ERP-017) does not detect in-batch duplicates (two
  new rows describing "the same" new record within one file) — only duplicates against
  ALREADY-persisted records. Disclosed in `ERP_FINDING_REGISTER.csv`.
- The 26-file historical test suite was not re-run (§9) — this phase's regression coverage is
  scoped to the 19 findings actually touched, not the whole application.
- No accounting/inventory reconciliation sweep, no RBAC/privilege-escalation testing, no
  performance measurement — all explicitly disclosed above, not silently skipped.
- The live production server (if one is running) is still executing the pre-fix code until
  restarted — these are code-only changes with no effect until a restart occurs.

# 17. Findings Remaining Open (Critical only — full list of all 40 open findings is in
`ERP_FINDING_REGISTER.csv`)

| Finding | Severity | Reason Still Open | Next Action |
|---|---|---|---|
| ERP-001 | Critical | Architectural — single-file JSON database has no real cross-process transaction engine | Phased SQLite migration (plan written, not started) — see `ERP_ARCHITECTURE_ASSESSMENT.md` |
| ERP-036 | Critical | Project Profitability report ignores the selected transaction date range | Requires reconstructing historical state as of the requested date — not attempted this phase (Phase 7 scope) |
| ERP-037 | Critical | AR/AP ageing does not reconstruct historical open items as of a selected date | Same class as ERP-036 — Phase 7 scope |
| ERP-050 | Critical | Finished Goods receipt/inventory/accounting chain does not exist (deliberately, pending a valuation-method decision) | **Business decision required — see §18.** Substantial new capability, Phase 10 scope |

# 18. Business / Management Decisions Required

**ERP-050 — Finished Goods valuation methodology.** Cannot be built without either inventing a
number or silently picking an unapproved method. Three options with tradeoffs are laid out in
`ERP_REMEDIATION_REPORT.md` (§"Policy decision required"): (A) Standard cost, (B) Actual cost
derived from the Production Order's own recorded material/labour, (C) Weighted average matching
the existing purchased-inventory pattern. A recommendation (B) is offered there but not acted on
without confirmation.

**New this report — git checkpoint baseline.** `SAP_Architecture_Lab/` has never been committed to
its parent git repository. The mandatory git-checkpoint rule (before/after every phase) cannot be
followed until an initial baseline commit exists. **This was not created without asking** — it
would be the first-ever commit of an 11,000+ line, actively-used codebase into a repository with a
real GitHub remote, which this engagement's own safety principles treat as worth a specific
confirmation rather than an assumed default. Recommend: confirm whether to (a) create an initial
baseline commit now covering the current state (pre-fix baseline + this session's fixes as one or
two clearly-labeled commits), (b) create it later once a `.gitignore` policy for this directory
(e.g., excluding `db.json`, `backups/`) has been decided, or (c) keep this project deliberately
outside version control, matching the apparent existing practice for this directory tree.

# 19. Phase Verdict

# **PASS WITH CONDITIONS**

Explicit checklist applied to every finding marked Fixed in §3 (all 9 criteria required):

1. Root cause identified — ✅ all 18 Fixed findings (§4/`ERP_FINDING_REGISTER.csv`)
2. Code/configuration changed — ✅ all 18
3. Positive test passed — ✅ all 18
4. Negative test passed — ✅ all 18
5. Regression test added (permanent) — ✅ all 18
6. Relevant cross-module test passed — ✅ where applicable (ERP-045 BOM/project, ERP-031
   dispatch/delivery material, ERP-042/043/044 relationship checks); N/A for single-module fixes
7. Accounting/inventory impact checked where applicable — ✅ ERP-023/025/026/040 (the only ones
   with direct GL/inventory effect); N/A for the rest — see §10/§11 for the honest scope of what
   "checked" means here (targeted, not a full reconciliation sweep)
8. Evidence recorded — ✅ this report + `ERP_FINDING_REGISTER.csv` + test files
9. No known regression introduced — ✅ within this session's own suite (§9); **not independently
   confirmed** against the historical 26-file suite, which was not run

ERP-034 fails criteria 3/4 (no live positive+negative test pair obtained) and is correctly
downgraded to Partially Fixed rather than counted toward the Fixed total.

**Conditions for full PASS:**
1. ERP-034 needs a real live test (positive: first handover succeeds; negative: second is
   rejected) using proper fixtures, not the bare fresh seed.
2. A full accounting/inventory reconciliation should be run against the isolated post-fix database
   as a distinct verification step (§10/§11 gap).
3. The historical 26-file suite should be run once against the current build to establish whether
   this phase introduced any regression outside its own narrow test scope (§9 gap).
4. A decision is needed on the git-checkpoint baseline (§18) before the mandatory git-checkpoint
   rule can actually be followed for Phase 2 onward.
5. The live production server needs an explicit restart to actually run this phase's fixes — until
   that happens, none of the 18 Fixed findings are protecting the running system, only the source
   code on disk.

None of these conditions represent a defect in the fixes themselves — all 18 Fixed findings are
genuinely fixed and tested to the standard in §3/§6/§7/§8. They represent process/verification
steps this phase did not reach.

# 20. Recommendation for Next Phase

Do not proceed directly into a new topic (e.g., Phase 4 or Phase 10) yet. Recommend Phase 2's
remaining scope first (it is already 13 of 17 Critical items complete, the closest to finished):

1. Resolve the ERP-034 test gap (condition 1 above) — small, fast, closes the one open item in
   this phase.
2. Resolve the git-checkpoint decision (§18) so Phase 2's own before/after commits are possible.
3. Run the accounting/inventory reconciliation and the historical suite (conditions 2/3) as a
   short verification pass before adding new code.
4. Then continue Phase 2's remaining Critical items not yet touched: ERP-036, ERP-037 (reporting
   date semantics) and get a decision on ERP-050 (§18) so its build can be scoped.

---

============================================================
PHASE 1 COMPLETE
============================================================

Verdict:
PASS WITH CONDITIONS

Findings fixed:
17

Findings partially fixed:
1 (ERP-034)

Findings still open (Critical, this phase's relevant set):
4 (ERP-001, ERP-036, ERP-037, ERP-050)

Tests:
51/51 passed (1 skipped — ERP-034), plus 1/1 concurrency test

Accounting:
PARTIAL (targeted checks only on ERP-023/025/026/040 — no full reconciliation sweep run)

Inventory:
PARTIAL (targeted check only on ERP-026 — no full reconciliation sweep run)

Security:
PARTIAL (SoD exercised once incidentally; no dedicated RBAC/privilege-escalation testing)

Production data touched:
NO (verified by SHA-256 checksum match, before/after)

Major remaining risk:
ERP-001 (architecture) and ERP-050 (Finished Goods chain) remain the two largest structural gaps;
ERP-036/ERP-037 mean historical financial reports can still be wrong; the live server has not yet
been restarted to actually run these fixes.

Report:
docs/erp-remediation/phases/PHASE-01-REMEDIATION-SESSION-REPORT.md

============================================================
