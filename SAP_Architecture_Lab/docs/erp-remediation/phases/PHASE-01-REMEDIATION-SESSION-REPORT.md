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

---

# PHASE 1 CLOSURE ADDENDUM

**Date:** 2026-09-10 (same day, follow-on session). Closes every condition raised in the original
report above, per an explicit 8-item closure gate. Nothing in the original report above is edited
or removed — this addendum stands alongside it, including where it corrects an earlier claim.

## Addendum 1 — ERP-034 final status: now genuinely FIXED

The original report downgraded ERP-034 to Partially Fixed because no live positive+negative test
pair existed. This gate required building the minimum legitimate prerequisite chain rather than
leaving it skipped. Done: a disposable project (PRJ-3, otherwise untouched by the rest of the
suite) was taken through a real Installation (created → marked Completed) → real QC Checklist
(created → submitted with all items Passed) → **Test A**: first handover created — **SUCCEEDED**
→ **Test B**: second handover attempt on the same project — **REJECTED**. Verified explicitly, not
assumed:
- **Response**: Test A `ok:true` with a real handover id; Test B `ok:false`.
- **Database records**: exactly 1 `DB.handovers` record for the project after Test A, still
  exactly 1 after Test B's rejected attempt (no duplicate written).
- **Project state**: `GET /api/projects/PRJ-3/closure-readiness` shows `handoverComplete:true`
  after Test A.
- **Audit trail**: exactly 1 `HandoverCompleted` entry in `DB.auditLog` after Test A, still exactly
  1 after Test B.
- **No duplicate financial/inventory side effect**: confirmed by direct code reading —
  `createHandover()` calls only `DB.handovers.push()` and `logAudit()`, no `postJournalEntry()` or
  `postInventoryMovement()` call exists in the function at all, so "no duplicate side effect"
  reduces exactly to "no duplicate handover record," already proven above.

All 12 assertions for this fixture (4 setup + 8 verification) pass. Added permanently to
`tests/erp_audit_p0_tests.js`. **ERP-034 status: FIXED** (all 9 criteria in the original report's
own checklist now satisfied — this was the only one previously failing criteria 3/4).

## Addendum 2 — Git baseline: CREATED

- **`.gitignore` created** at `SAP_Architecture_Lab/.gitignore` (nested, respected by the parent
  repo at `D:\APPLETREE INTERIORS\Claude`). Excludes, at every path via `**/` globs: all
  `db.json*` variants (live, `.bak`, every `pre_*_backup`, every checkpoint/baseline copy, the
  runtime `.lock` file), all `backups/` directories, all `*.log` files, `.claude/settings.local.json`,
  OS junk, the packaged handover `.zip`, and `node_modules/` (none currently present — future-proofed).
- **Verified before committing**: a dry-run (`git add -n`) confirmed 897 files would be staged and
  that none of `db.json`, any `backups/` path, or any `.log` file appeared in that list. The 20
  largest files staged were manually reviewed (source code at various historical phases, a PDF
  handbook, README-shaped markdown) — nothing resembling real business data or a secret.
- **`ACCOUNTANT_UAT_PACKAGE/19_TEST_CREDENTIALS.md`** was considered for exclusion (named
  "credentials") but included after review: its content is dedicated UAT/demo test accounts,
  explicitly self-documented as never-real, and functionally identical to what `server/domain.js`'s
  own `SEED_USERS` constant already contains in source form — excluding the summary doc while
  committing the source that generates the same accounts would not have reduced any real exposure.
  Flagged here for visibility rather than decided silently.
- **Baseline commit created**: `86c6947` — "Add SAP_Architecture_Lab to version control (baseline
  commit)", 897 files changed, 411,302 insertions, **local only, not pushed** (repo is 19 commits
  ahead of `origin/main` after this commit; user has not authorized a push).
- Working tree status after commit: clean for everything under `SAP_Architecture_Lab/` (confirmed
  via `git status --short SAP_Architecture_Lab` returning no output).
- **Files deliberately excluded**: every pattern in the `.gitignore` above — concretely, at time of
  commit this excluded the live `server/db.json` (7.2MB), `server/db.json.bak`, 9 `db.json.pre_*_backup`
  files in `server/`, 8 `PHASE*_CHECKPOINT/server/db.json[.bak]` pairs, 7 `PHASE_*_BASELINE/db.json.*`
  files, 9 `backups/` directories (~150MB combined), and ~38 `*.log` files.

## Addendum 3 — Full historical regression: run twice, final result below

All 26 files in `HANDOVER_PACKAGE/03_TESTS/` were run against an isolated server (fresh seed,
port 4001, disposable — never the live `db.json`) — once as a true first pass, and again after the
two genuine defects found during the first pass (Addendum 4) were fixed and redeployed. **Final,
stable result** (unchanged across a third confirmation run):

| Category | Count | Files |
|---|---|---|
| **Clean pass** | 15 | after_sales_tests (21/21), capa_tests (15/15), delivery_partial_tests (14/14), financial_integration_tests (15/15), phase13_policy_tests (24/24), phase14_accounting_tests (48/48), phase15_gap_closure_tests (25/25), phase16_performance_tests (9/9), phase17_concurrency_tests (5/5), phase18_financial_period_tests (39/39), phase19_cache_invalidation_tests (5/5), phase20_error_handling_tests (6/6), phase9b_misc_tests (19/19), service_tests (27/27), warranty_tests (15/15) |
| **(A) Genuine regression — found and FIXED this gate** | 2 | amc_tests (13/13 after fix), phase16_reconciliation_tests (11/11 after fix) — both caused by the SAME root cause, see Addendum 4 |
| **(B) Stale test** | 7 | crm_tests (matches known ERP-009), id_tamper_tests (1 of 47 — expects HTTP 403/404, current code deliberately uses 400 for business-state rejections per an earlier, documented Phase 9B convention change), phase19_icici_import_tests (asserts a quotation can exceed its project's Excess-Billing-Approval ceiling unchallenged — a control added after this test was written), phase20_handover_tests (asserts the OLD non-atomic partial-commit import behavior this session's own ERP-017 fix deliberately replaced), procurement_tests (skips the BOM `/submit` step before `/approve` — predates the BOM Governance phase's Draft→Submitted→Approved lifecycle), security_matrix (4 of 1080 — matches known, already-disclosed ERP-048 exactly), site_tests (same missing-BOM-submit-step as procurement_tests) |
| **(C) Fixture problem** | 2 | phase19_icici_import_tests and phase20_concurrency_tests both originally failed on a missing `icici_statement_121.csv` (present in `HANDOVER_PACKAGE/04_TEST_FIXTURES/`, not co-located with the test file that needs it — a packaging gap, not a code defect); copying the fixture resolved phase20_concurrency_tests completely (now 6/6) and left phase19_icici_import_tests at its separate, real (B) stale-test failure |
| **(D) Environment problem** | 0 | none found |
| **(E) Existing unrelated defect — found, NOT fixed (new finding)** | 1 | security_tests (2 of 44) — see Addendum 5, a new, genuine, pre-existing security defect unrelated to this session's 19 original fixes |

No test file was edited to make it pass. Where a fixture was missing, the fixture was supplied (a
copy operation, not a test-content change). Every (B)/(C)/(E) classification above is backed by a
live reproduction and root-cause trace performed during this gate, not asserted from the failure
message alone.

## Addendum 4 — A genuine regression, found and fixed: ERP-044's first version was too strict

`amc_tests.js` and `phase16_reconciliation_tests.js` both create an AMC contract with
`projectId:'PRJ-2'` (or an equivalent seeded project) alongside a `customerId`. The **first**
version of the ERP-044 fix (from the original session) rejected this whenever
`project.customerId !== customerId` — which also fires when `project.customerId` is simply
`null`/unset, not just on a genuine mismatch. Checked directly against the real production
database (`server/db.json`, read-only): **50 of 246 real projects have no `customerId` set at
all** (legacy/pre-linkage projects — e.g. `PRJ-1`, "Habeeb Kaithakkunda — Residence" — and every
project in the fresh test seed, `PRJ-1`..`PRJ-5`). The original fix would have blocked legitimate
AMC creation for roughly one project in five in the real database — a genuine regression, caught
only because this gate mandated running the full historical suite rather than trusting the
session's own narrower test file.

**Fix**: `createAMCContract()` in `domain.js` now only rejects when `_proj.customerId` is present
**and** disagrees (`if(_proj.customerId && _proj.customerId!==customerId)`) — an unset
`customerId` is absence of data, not proof of a conflict.

**Regression test added**: `tests/erp_audit_p0_tests.js`'s ERP-044 section now creates two real
customers and a project explicitly linked to one of them (via the already-fixed, already-tested
ERP-017 import path) so the mismatch case is tested against real, populated data — a genuine
mismatch is rejected, the matching case still succeeds, and a separate assertion proves a
project with **no** `customerId` set is no longer treated as a false-positive mismatch.

**A second, related drift was found and fixed while building that regression test**: the
`Projects` master-import spec's `validateRow()` never checked for `migrationReason`, even though
`createProjectMaster()` (the function it calls) has always required a non-empty one. Under the
OLD, non-atomic `importMasterData()` this was merely a confusingly-worded single-row rejection;
under this session's OWN new atomic engine (ERP-017), a row that passes validation but fails at
commit time rolls back the **entire batch** — so this pre-existing drift needed closing at its
source. Fixed by adding `migrationReason` to the spec's `requiredFields`, mirroring
`createProjectMaster()`'s own exact requirement.

Both fixes were deployed to the isolated historical-regression server and reconfirmed: `amc_tests.js`
13/13, `phase16_reconciliation_tests.js` 11/11, and the full `erp_audit_p0_tests.js` suite 65/65.

## Addendum 5 — NEW FINDING (not one of the original 58): account lockout is completely non-functional

**Discovered while classifying `security_tests.js`'s 2 failures** ("Account locks after 5 failed
logins" and "Locked sales1 cannot log in even with correct password"). Root-caused via live,
instrumented reproduction (temporary debug logging added to an isolated copy only, removed before
this document was written) — not fixed, no code changed in domain.js/server.js login logic itself.

**Root cause**: `/api/login` is a `POST` route not registered via the modern
`registerMutationRoute()` framework, so it falls through `server.js`'s legacy-dispatch wrapper,
which wraps it in `D.withTransaction(actor, {name:'legacy-dispatch:...'}, () => { handleRequest(...);
return {ok: capturedOk}; })`. `withTransaction()`'s own documented behavior (see its header comment
in `domain.js`) is: **on a plain `{ok:false}` return — not just a throw — it restores `DB` to the
pre-request snapshot, defensively, in case the handler mutated before rejecting.** A failed login
(wrong password) intentionally mutates `user.failedLoginCount`/`user.lockedUntil` **as the entire
point of returning `ok:false`** — but the wrapper cannot distinguish "this mutation IS the
security bookkeeping the failure is supposed to produce" from "this mutation should never have
happened because the request was rejected," and unconditionally rolls back the former along with
the latter. Confirmed with an instrumented reproduction: the in-memory mutation and its `save()`
call were proven to run correctly (`failedLoginCount` reaches 1, same object reference, written to
disk) — and then a **subsequent, later `save()` call from the transaction wrapper's own rollback**
overwrites the file back to the pre-request state, silently erasing both the failed-login counter
AND the `loginHistory` DENY record for that attempt.

**Confirmed live, directly**: 5 wrong-password attempts against `sales1`, followed by the correct
password, still succeeds (HTTP 200) — no lockout, ever, no matter how many wrong passwords are
tried. `loginHistory` shows zero record of any of the 5 failed attempts.

**Severity assessment**: Critical from a security-control-effectiveness standpoint — the account
lockout / brute-force-protection mechanism the code clearly intends to have (the schema fields,
the increment logic, the 401→423 status-code branch all exist and are individually correct) is
completely inert in practice. **Confirmed pre-existing, not caused by this session**: neither the
login route, the legacy-dispatch wrapper, nor `withTransaction()` were touched by any of this
session's 19 fixes; git history (pending — see Addendum 2, no prior commits exist to diff against)
cannot confirm exactly when this was introduced, but the mechanism (`withTransaction`'s
rollback-on-`ok:false` heuristic) is describved in `domain.js`'s own Phase 38 header comments as a
deliberate, general design choice made in an earlier phase, long before this session.

**Scope note**: this specific failure mode (a route that deliberately wants a "failed" response to
still persist a side effect) appears narrow — most legitimate business-rule rejections in this
codebase validate BEFORE their first mutation, so an empty rollback is a harmless no-op for them.
Login is unusual in wanting persisted bookkeeping on failure. A full audit for other routes with
the same shape was **not** performed this gate (out of scope — this is a new finding requiring its
own triage, not something to fix reactively mid-closure-gate per the explicit "do not start new
work" instruction).

**Status: OPEN — logged as a new finding, not fixed.** Recommend tracking as **ERP-059** (next
available ID after the original 58) in `ERP_FINDING_REGISTER.csv`, Critical severity, for
prioritized remediation in an upcoming phase. Candidate fix directions (not decided, not
implemented): (a) give `/api/login` its own dedicated, unwrapped code path that never enters the
legacy-dispatch transaction wrapper (cleanest — login is not itself a business-transaction in the
GL/inventory sense); (b) special-case failed-login bookkeeping to persist unconditionally,
independent of the wrapping transaction's outcome; (c) reconsider whether `withTransaction`'s
blanket "roll back on `ok:false`" rule is the right default for ALL legacy-dispatched routes, or
should be opt-out for routes with an intentional persist-on-failure shape.

## Addendum 6 — Full accounting reconciliation

Performed against the isolated historical-regression server, after running a comprehensive,
realistic test file (`after_sales_tests.js` — real POs, GRNs, service tickets, visits, material
issues, labour cost postings, concurrency races, and its own internal reconciliation checks) to
generate genuine transactional activity, THEN independently re-verified directly (not just trusting
the test file's own assertions):

```
GET /api/reconciliation (as finance1):
  ar:               {subledgerTotal: 0, controlAccountBalance: 0, matches: true}
  ap:               {subledgerTotal: 0, controlAccountBalance: 0, matches: true}
  outputTax:        {subledgerTotal: 0, controlAccountBalance: 0, matches: true}
  inputTax:         {subledgerTotal: 0, controlAccountBalance: 0, matches: true}
  customerAdvances: {subledgerTotal: 0, controlAccountBalance: 0, matches: true}

GET /api/trial-balance (as finance1):
  Total Debit:  ₹143,200.00
  Total Credit: ₹143,200.00
  Difference:   ₹0.00 — BALANCED
```

**Additionally, independently re-verified against the REAL production database** (read-only GET
requests only, as part of the Addendum 8 live-server smoke test):

```
GET /api/trial-balance (as admin, against server/db.json — 1,547 real journal entries):
  Total Debit:  ₹21,080,548.64
  Total Credit: ₹21,080,548.64
  Difference:   ₹0.00 — BALANCED
```

**Journal integrity**: no invalid journal lines (this session's own ERP-023 fix — verified live via
`erp_audit_p0_tests.js` — makes an invalid line structurally impossible to post going forward); no
orphan journals or unexpected duplication observed in either dataset above (both reconcile exactly
with zero unexplained variance).

**Scope disclosed honestly**: this reconciliation covers (a) all activity generated during this
session's own testing on the isolated server, and (b) a read-only Trial Balance check against the
REAL production ledger's full 1,547-entry history. It is **not** a line-by-line audit of every
historical entry in the real production database for pre-existing anomalies — that would be a
separate, larger undertaking (closer to the original audit's own Phase 16 scope) than "verify this
gate's changes didn't break anything," which is what this addendum certifies.

**Result: PASS** (upgraded from the original report's "PARTIAL" — a genuine reconciliation was run
and passed, on both the isolated test database and, for Trial Balance specifically, the real
production ledger).

## Addendum 7 — Full inventory reconciliation

Performed on the same isolated server / activity as Addendum 6 (the one material with real
movement activity, `MAT-1` @ `WH-1`):

```
Movements (2 total, both verified against real source documents):
  MV-000001  Receipt   +50 @ ₹2,800/unit = ₹140,000   source: GRN-0001
  MV-000002  Issue      -1 @ ₹2,800/unit =  -₹2,800    source: ServiceVisit VIS-0001

Opening: 0
+ Receipts:     50
- Issues:        1
= Closing:      49    <- matches GET /api/inventory/stock?materialId=MAT-1&warehouseId=WH-1 exactly

Closing stock value:  49 × ₹2,800 (moving average rate) = ₹137,200
GL Account 1200 (Inventory): debit ₹140,000, credit ₹2,800, net = ₹137,200

STOCK VALUE (₹137,200) = GL INVENTORY BALANCE (₹137,200) — RECONCILED, exact match.
```

**Checks performed**: no negative stock (49 ≥ 0); no orphan movements (both movements trace to a
real, existing source document — GRN-0001 and VIS-0001 respectively); no duplicate movements (2
distinct movement IDs, MV-000001/MV-000002, no repeated source-document reference); no invalid
material/warehouse references (MAT-1 and WH-1 both real, pre-existing masters); project/site
consistency (both movements correctly tagged `projectId:PRJ-1`, matching their source documents).

**Scope disclosed honestly, same as Addendum 6**: this reconciles the material/movement activity
this session's own testing generated. It is **not** a full stock-take reconciliation of every
material/warehouse combination in the real production database (which has far more movement
history than this session touched or needed to verify). No dedicated single "inventory
reconciliation report" endpoint exists in this codebase (confirmed by search) — this reconciliation
was built from the existing granular endpoints (`/api/inventory/movements`, `/api/inventory/stock`,
`/api/trial-balance`) rather than a single report call.

**Result: PASS** for the material/activity actually checked (upgraded from the original report's
"PARTIAL").

## Addendum 8 — ERP-005 recheck: MITIGATED (unchanged conclusion), with fuller test coverage

Per the explicit instruction, ERP-005 remains labelled **MITIGATED**, not "architecturally
resolved" or "enterprise-grade" — the underlying single-JSON-file architecture still has no real
cross-process ACID engine; the lock only makes the audit's specific reproduction scenario
(two processes, same file) impossible to reach. Full residual-risk statement is unchanged from
`ERP_ARCHITECTURE_ASSESSMENT.md`.

Tests performed this gate (in addition to the original Phase 1 report's single "second process
refused" test, which remains a permanent regression test in `tests/erp_audit_concurrency_tests.js`):

| Test | Method | Result |
|---|---|---|
| Second process, same `db.json` | Real second `node server.js` spawned against a live-locked directory | **Refused at startup**, exit code 1, citing ERP-005 explicitly — confirmed (this is the permanent regression test) |
| Stale lock recovery | A prior process force-killed (`taskkill /F`, simulating a crash), then a new process started against the same directory | **Auto-reclaimed**: `[WARN] Found a stale lock file from PID <n> (no longer running) — reclaiming it.` — reproduced repeatedly (a dozen+ times) across this entire two-session engagement, always successful |
| Abnormal termination | Identical to stale-lock-recovery above — `taskkill /F` IS the abnormal-termination case on Windows | Confirmed safe: no corruption, no stuck lock, clean recovery on next start every time |
| Server restart | Repeated stop/start cycles throughout both sessions (dozens of times) | Always clean; `db.json`/`db.json.bak` never corrupted (verified via `node -c` syntax checks and successful subsequent loads throughout) |
| Lock recovery after real (non-test) usage | The REAL production server was stopped (nothing was running — confirmed via `netstat`/`tasklist` before any action) and started fresh this gate (Addendum 9) | Clean start, fresh lock created, no conflict |
| Graceful shutdown via SIGTERM (external) | `taskkill` without `/F` | **Refused by Windows itself**: `"This process can only be terminated forcefully (with /F option)."` — Windows does not offer this console process a graceful-close path |
| Graceful shutdown via SIGTERM (external, via `process.kill(pid,'SIGTERM')`) | Node's own cross-process signal API, from a separate process | Process terminated, but **the lock file was NOT cleanly removed** — Windows' SIGTERM emulation for a signal sent from an unrelated process behaves like a forceful kill, not a catchable signal; the target process does not get to run its `process.on('SIGTERM', ...)` handler |
| Graceful shutdown via `CloseMainWindow()` (.NET's standard Windows graceful-close API) | PowerShell `[System.Diagnostics.Process]::CloseMainWindow()` | **Explicitly failed** — `HasExited: False` after 2 seconds; this console process has no window handle to close, so this mechanism cannot reach it at all |

**New, honest platform finding (not a defect in this session's code — the `SIGINT`/`SIGTERM`
handlers registered in `acquireSingleInstanceLock()` are correctly written per Node's documented
API)**: on Windows, there is **no reliable way for an external process or script to gracefully
signal this console-based Node server** — not `taskkill`, not `process.kill()` from another
process, not `.NET`'s standard graceful-close API. Only a real, interactive Ctrl+C typed directly
into the server's own controlling console window would trigger the registered `SIGINT` handler
(this is standard, documented Windows/Node behavior, not specific to this codebase) — and that
could not be exercised inside this scripted, non-interactive environment. **This is precisely why
the stale-lock-auto-recovery mechanism matters**: since a clean external shutdown cannot be
guaranteed on Windows, the system is deliberately designed to also survive an UNCLEAN one — which
this gate proved works reliably, repeatedly, across both sessions of this engagement.

**Conclusion: ERP-005 = MITIGATED** (unchanged). The mitigation's own effectiveness is now proven
across a fuller matrix of restart/recovery scenarios than the original report covered; the
underlying architectural limitation (no true cross-process ACID) is unchanged and remains tracked
as ERP-001's own open item.

## Addendum 9 — Live server restart: COMPLETED

**Pre-restart verification** (all performed before any action):
1. **Current process**: `netstat`/`tasklist` confirmed NO Appletree production server was running
   at the start of this gate — the two `node.exe` processes found were both this session's own
   disposable isolated test servers (verified by process command-line and working directory: one
   at the `erp_audit_iso` scratch path on port 4091, one at `erp_audit_hist` on port 4001 — neither
   is the real `server/` directory).
2. **Database path**: `D:\APPLETREE INTERIORS\Claude\SAP_Architecture_Lab\server\db.json` — the
   real, live file, confirmed present, 7,245,009 bytes.
3. **Backup**: pre-session backup `server/backups/db.json.pre_erpaudit_20260910_105618` confirmed
   present; the file's own auto-generated `db.json.bak` also confirmed present.
4. **Checksum**: `58c8bae7e3a7f8acc1958cac7266730b3ee53c270e5bb5558185901ae371a4ed` — **identical**
   to the value recorded at the start of the original Phase 1 session, confirming the live database
   was never touched by any of this session's work (verified again, freshly, at this exact moment
   — not merely re-quoting the earlier figure).
5. **Server configuration**: `PORT = 4001` confirmed in the live `server.js`.
6. **Syntax check**: `node -c domain.js && node -c server.js` on the exact files about to run —
   clean.
7. **Port availability**: this session's own two isolated test servers (occupying 4001 and 4091)
   were stopped first — their PIDs (18960, 14168) were independently confirmed via
   `Get-CimInstance`/command-line inspection to be this session's own scratch-directory processes,
   not anything else, before being stopped.

**Restart**: `node server.js` started from the real `server/` directory. Result:
- **Process ID**: 15732
- **Port**: 4001, confirmed listening
- **Database path**: the real `server/db.json` (unchanged, per checksum above)
- **Lock**: `server/db.json.lock` created cleanly, no stale-lock conflict (expected, since nothing
  was previously running against this file)
- **Log**: `server/server_live_restart_20260910.log` — clean startup, no errors

**Post-restart smoke test** (read-only checks only, against real data):
1. Admin login — `200 OK`.
2. `GET /api/projects` — 246 projects (matches the pre-session count exactly, data intact).
3. `GET /api/journal-entries` — 1,547 entries (matches pre-session count exactly).
4. `GET /api/trial-balance` on the real ledger — balanced, ₹21,080,548.64 = ₹21,080,548.64 (see
   Addendum 6).
5. The new `/api/admin/restore-validate` route (this session's ERP-040 fix) responds correctly —
   confirms the fixed code is genuinely running, not stale cached behavior.

**A mistake made during this smoke test, disclosed rather than hidden**: step 6 of the smoke test
attempted to verify the ERP-023 fix's behavior by creating a Manual JE Draft with a negative-debit
line. This succeeded (`ok:true`, `DRAFT-0981` created) — which is **expected and correct**
(`createDraft()` itself has never validated line values; the ERP-023 fix lives in `postJournalEntry()`,
reached only via the final `postDraft()` step, not at draft creation — a draft has zero financial
effect by this codebase's own design). However, **this created a real, harmless-but-unintended
record in the live production database**: `DRAFT-0981`, narration "SMOKE TEST - DO NOT APPROVE",
status `Draft`. This record has **zero GL/inventory/financial effect** (drafts are inert until
Submitted→Approved→Posted, and this one has explicitly not been, and should not be) — but it should
not have been created against real production data at all; a read-only check would have sufficed
to confirm the same thing by inspecting `postJournalEntry()`'s code directly instead. **Recommend**:
an authorized user reject or ignore `DRAFT-0981` via the normal Journal Voucher screen at their
convenience — it will never post on its own and carries no risk, but it is real, unintended
clutter in the real database and should not be mistaken for a genuine business document.

**Live server restart status: RESTARTED AND VERIFIED**, with the one disclosed, low-risk mistake
above.

## Addendum summary

| Item | Status |
|---|---|
| 1. ERP-034 | **FIXED** (upgraded from Partially Fixed) |
| 2. Git baseline | **CREATED** — commit `86c6947`, local only |
| 3. Historical regression | **COMPLETE** — 15 clean, 2 regressions found+fixed, 7 stale (pre-existing, documented), 1 new finding (ERP-059, open), 0 environment problems |
| 4. Accounting reconciliation | **PASS** |
| 5. Inventory reconciliation | **PASS** |
| 6. ERP-005 recheck | **MITIGATED** (unchanged conclusion, fuller evidence) |
| 7. Live server restart | **RESTARTED AND VERIFIED** (1 disclosed low-risk mistake — a stray inert Draft) |
| 8. This addendum | **COMPLETE** |

============================================================

---

# PHASE 1 FINAL CLEANUP — CORRECTION AND DISPOSITION (2026-09-10, follow-on gate)

## Addendum 10 — Explicit correction to prior "Production data touched: NO" statements

Two earlier statements in this document must be read together with this correction, not in
isolation — neither is deleted, both were accurate at the moment they were written:

- **Line ~29 ("Production data touched: NO", original report body)** — accurate for the scope it
  describes: the original remediation session's 19 code fixes never wrote to `server/db.json`
  (proven by the SHA-256 checksum match cited there). This remains true and unchanged.
- **Addendum 9's closure summary table ("7. Live server restart — RESTARTED AND VERIFIED (1
  disclosed low-risk mistake)")** — already disclosed that the post-restart smoke test created
  `DRAFT-0981` in the real database. That disclosure was correct but the summary table's
  characterization needs to be stated more explicitly here, as its own line item, per this gate's
  instruction.

**Explicit, unambiguous statement, superseding any looser phrasing elsewhere in this document:**

> The remediation fixes themselves (all 19 code changes from the original session, plus ERP-034's
> fixture-based test and the ERP-044/Projects-import corrections from the Closure Gate) **did not
> modify the production database**. Separately and later, **one unintended record — `DRAFT-0981`
> — was created in the real production database** as a side effect of a live post-restart smoke
> test (Addendum 9). This was a testing mistake, disclosed at the time, not a defect in any fix.
> **It produced zero GL posting, zero inventory movement, and zero downstream financial effect at
> any point** — verified directly: `postedEntryId` was `null` throughout its entire life, and
> `postDraft()` structurally cannot act on a document that was never `Approved`.

**Final disposition (this gate, via the application's own legitimate document workflow — no direct
database edit was made):**

1. Verified live: `DRAFT-0981` existed, status `Draft`, `postedEntryId: null`, `history` showing
   only a single `Created` event — confirmed not Submitted, not Approved, not Posted, no GL
   entry, no inventory movement anywhere in the database referencing it.
2. The application's own document lifecycle (`Draft → Submitted → Approved → Posted`, OR
   `Submitted → Rejected`) is the only legitimate disposal path for an unwanted draft — there is no
   direct "delete a Draft" route (confirmed by code search: no such function exists), by design,
   for auditability.
3. Executed via the real API, as `admin`, using the exact same routes any legitimate user would:
   `POST /api/journal/DRAFT-0981/submit` → `{ok:true, status:"Submitted"}`, then
   `POST /api/journal/DRAFT-0981/reject` with an explicit, honest reason ("Unintended record
   created during Phase 1 Closure Gate live smoke test... never a real business transaction...
   zero GL/inventory effect at any point") → `{ok:true, status:"Rejected"}`.
4. **Final state: `DRAFT-0981`, status `Rejected`, full `history` trail preserved** (`Created` →
   `Submitted` → `Rejected`, each with real user/role/timestamp — nothing removed or hidden,
   audit integrity fully preserved).
5. **Confirmed it can never accidentally become Posted**: `POST /api/journal/DRAFT-0981/post`
   was attempted directly afterward and correctly returned `400 — "Cannot post — document is
   'Rejected', not Approved."` — structurally a dead end, exactly as the codebase's own
   `postDraft()` guard requires.
6. **Post-cleanup verification, all on the real production database**:
   - Trial Balance: **unchanged**, before and after — ₹21,080,548.64 = ₹21,080,548.64, both times.
   - Journal entry count: **unchanged** — 1,547 before, 1,547 after (confirms zero GL entries were
     ever created from this draft, at any point in its lifecycle).
   - `GET /api/reconciliation` (journal/GL integrity check), on real data: AR
     (₹81,00,849.92 = ₹81,00,849.92), AP (₹10,72,478 = ₹10,72,478), Output Tax
     (₹1,19,824.03 = ₹1,19,824.03), Input Tax (₹92,628.02 = ₹92,628.02), Customer Advances
     (₹0 = ₹0) — **all `matches: true`**.

**No direct edit of `db.json` was made or considered necessary** — the legitimate application
workflow fully and correctly disposed of the record while preserving a complete, honest audit
trail explaining exactly what happened and why. This is the outcome required by Part A of the
2026-09-10 follow-on gate; see `PHASE-01-CLOSURE-ERP059-GATE-REPORT.md` for the full gate record.

============================================================
