# Phase 1 Final Cleanup + ERP-059 Security Gate — Report

**Date:** 2026-09-10. Follow-on gate to the Phase 1 Closure Addendum, per an explicit 8-part
mandate (A–H). This gate is **forensic and cleanup only** — no broad remediation was implemented,
per the gate's own explicit instruction.

---

## 1. Executive Summary

Two things were accomplished: (1) a real production-database artifact from the prior gate's live
smoke test (`DRAFT-0981`) was disposed of through the application's own legitimate document
workflow, with the earlier report's "Production data touched: NO" statement now explicitly
corrected rather than left ambiguous; and (2) ERP-059 (account lockout defeated by transaction
rollback) was forensically investigated — root cause confirmed with an instrumented, reproducible
trace; its blast radius mapped across the codebase (found to be a systemic pattern affecting at
least 23 call sites, 2 independently live-confirmed, one of which silently defeats a previous
phase's own dedicated audit-trail fix); a 13-scenario security test matrix run against a disposable
server; and three remediation options documented with a recommendation — **without implementing
any of them**, per this gate's explicit "forensic first" instruction. **No application source
code was changed in this gate.**

## 2. DRAFT-0981 Disposition

**Verified live, before any action:**
- Existed in the real `server/db.json`, `status: "Draft"`, `postedEntryId: null`.
- `history` showed exactly one event: `Created`.
- Confirmed: not Submitted, not Approved, not Posted, no GL entry, no inventory movement anywhere
  in the database referencing it.

**Legitimate disposal mechanism identified:** this codebase has no direct "delete a Draft" route
(confirmed by code search — none exists, by design, for auditability). The only legitimate path
for an unwanted Draft is its own document lifecycle: `Submitted → Rejected` (a dead end that can
never reach `Posted`).

**Action taken**, via the real API as `admin` (no direct database edit):
1. `POST /api/journal/DRAFT-0981/submit` → `{ok:true, status:"Submitted"}`.
2. `POST /api/journal/DRAFT-0981/reject` with an explicit reason documenting exactly why
   → `{ok:true, status:"Rejected"}`.

**Final state:** `DRAFT-0981`, status `Rejected`, full `history` trail preserved
(`Created → Submitted → Rejected`, each with real user/role/timestamp).

**Confirmed it cannot accidentally become Posted:** `POST /api/journal/DRAFT-0981/post` was
attempted directly afterward and correctly returned `400 — "Cannot post — document is 'Rejected',
not Approved."`

**Post-cleanup verification, on the real production database:**
- Trial Balance: unchanged before/after — ₹21,080,548.64 = ₹21,080,548.64 both times.
- Journal entry count: unchanged — 1,547 before, 1,547 after.
- `GET /api/reconciliation`: AR (₹81,00,849.92=₹81,00,849.92), AP (₹10,72,478=₹10,72,478), Output
  Tax (₹1,19,824.03=₹1,19,824.03), Input Tax (₹92,628.02=₹92,628.02), Customer Advances (₹0=₹0) —
  all `matches: true`.

Full detail: `PHASE-01-REMEDIATION-SESSION-REPORT.md`, Addendum 10.

## 3. Correction to the Production-Data Statement

Explicit, unambiguous correction recorded in Addendum 10 of the remediation report (not deleting
or hiding the original disclosure): the original session's 19 code fixes never touched
`server/db.json` (SHA-256 checksum-verified); a **separate, later, disclosed testing mistake**
during the live smoke test created one inert Draft, now cleanly disposed of per §2 above, with zero
GL/inventory effect at any point in its lifecycle.

## 4. ERP-059 Reproduction Evidence

Reproduced twice, cleanly, on a disposable isolated server (`erp_059_forensic`, port 4092, fresh
seed, never the live database):

**Case 1 — the original finding (login lockout):** 5 sequential wrong-password attempts against
`sales1`, followed by the correct password, still succeeds (`200 OK`) — no lockout, ever.
`loginHistory` retains **zero** record of any of the 5 failed attempts (all silently erased, not
merely the counter).

**Case 2 — `reverseEntry()`'s `ReversalRejected` audit trail (found during blast-radius search,
Part D below):** a real posted JE was reversed with a blank `reason` (a rejection this function
explicitly logs, per its own Phase 41 comment, specifically because "a rejected... attempt left no
audit trace at all... every rejection path below now logs who attempted what, and why it was
refused"). Correctly rejected (`400`), but the audit log shows **zero** `ReversalRejected` entries
afterward — only a generic `BusinessRuleRejected` fallback survives. **The Phase 41 fix has never
worked, for any of its rejection paths, since it was written.**

## 5. Root Cause

`/api/login` is legacy-dispatched (not on the modern `registerMutationRoute` framework), so it
falls through `server.js`'s legacy-dispatch wrapper, which wraps it in
`D.withTransaction(actor, {name:'legacy-dispatch:...'}, () => { handleRequest(...); return {ok:
capturedOk}; })`. `withTransaction()`'s own documented behavior: on a plain `{ok:false}` result —
not only a thrown exception — it restores `DB` to a snapshot taken **before** the handler ran, and
re-`save()`s. A failed login **intentionally** mutates `user.failedLoginCount`/`user.lockedUntil`
as the entire point of returning `ok:false` — the wrapper cannot distinguish that intentional
bookkeeping from an ordinary rejected business mutation, and erases both identically.

Confirmed with instrumented, removable tracing (5 trace points added to a disposable isolated
copy only, verified, then fully reverted — never present in the live code at any point):

```
[TRACE-1 DISPATCH]     /api/login is NOT a modern route -> WILL be wrapped by legacy-dispatch withTransaction
[TRACE-2 PRE-TX]       withTransaction() takes its DB snapshot NOW, before the handler runs
[TRACE-4 MUTATION+SAVE] failedLoginCount incremented to 1, D.save() called — CONFIRMED persisted to disk at this exact moment
[TRACE-3 CAPTURED-OK]  response body has ok:false -> capturedOk=false
[TRACE-5 ROLLBACK]     withTransaction() sees ok:false -> restores the PRE-REQUEST snapshot -> save() AGAIN -> OVERWRITES the TRACE-4 mutation
```
Final on-disk state after this sequence: `failedLoginCount: 0` — matching the trace's own
prediction exactly.

## 6. Transaction Lifecycle (as traced)

```
POST /api/login (wrong password)
  -> legacy-dispatch wrapper (server.js ~line 548)
     -> isModernRoute = false  (no registerMutationRoute registration exists for /api/login)
        -> D.withTransaction(actor, {name:'legacy-dispatch:POST:/api/login'}, handler)
           -> _snapshot = deep clone of DB (BEFORE handler runs)
           -> handler() = handleRequest(req, res, body)
              -> login route body:
                 -> user found, active, not locked
                 -> D.verifyPassword() returns false (wrong password)
                 -> user.failedLoginCount++ (0 -> 1)                         [mutation #1]
                 -> if >=5: user.lockedUntil = now+15min, reset to 0         [mutation #2, conditional]
                 -> D.save()                                                  [correctly persists mutation #1/#2 to disk, in isolation]
                 -> D.DB.loginHistory.push({result:'DENY', reason:'bad password', ...})  [mutation #3]
                 -> D.save()                                                  [correctly persists mutation #3 too]
                 -> res.end(JSON {ok:false, error:'Invalid username or password.'})
                    -> res.end override sees parsed.ok===false -> capturedOk = false
           -> handler() returns to withTransaction as {ok: capturedOk} = {ok:false}
           -> if(result.ok === false): DB = _snapshot (mutations #1/#2/#3 ALL discarded in memory)
                                        save() AGAIN (overwrites the file with the pre-mutation state)
              -> return {ok:false, ...}
  -> HTTP 401 sent to client (correct status/body — the BUG is invisible to the caller)
FINAL PERSISTED STATE: failedLoginCount=0, lockedUntil=null, no loginHistory DENY record — as if the attempt never happened
```

## 7. Blast-Radius Analysis

Full document: `ERP-059-TRANSACTION-ROLLBACK-BLAST-RADIUS.md`. Summary:

- **22 additional call sites** in `domain.js` share the identical shape
  (`logAudit({type:'XRejected',...}); return {ok:false,...}`, inside a function that is the direct
  `handler` of either a legacy route or a modern `registerMutationRoute`) — covering procurement,
  inventory, manufacturing, finance, user provisioning, and (notably) this session's own ERP-017
  and ERP-040 fixes.
- **1 of those 22 (`ReversalRejected`) live-confirmed broken** (§4 above). The remaining 21 are
  classified **PRESUMED AFFECTED** by structural analysis, not individually live-tested this gate.
- **0 genuinely ambiguous (Category C) cases found** — every instance has clear, code-commented
  author intent.
- The pattern that DOES work correctly: `registerMutationRoute`'s `auditReject:true` flag logs a
  generic `BusinessRuleRejected` entry (path/method/error only) from OUTSIDE the transaction
  boundary, after `withTransaction()` has already returned — this is the codebase's own existing,
  working precedent for "persist something outside a rolled-back transaction."

## 8. Security Test Matrix — Results (Part E, all against the disposable `erp_059_forensic` server)

| # | Scenario | HTTP status | Response `ok` | DB state after | Audit/loginHistory state |
|---|---|---|---|---|---|
| 1 | One wrong password | 401 | false | `failedLoginCount` never leaves 0 | 0 entries recorded |
| 2 | Two wrong passwords (cumulative) | 401 | false | still 0 | 0 |
| 3 | Four wrong passwords (cumulative) | 401 | false | still 0 | 0 |
| 4 | Five wrong passwords (cumulative) | 401 | false | still 0 (never reaches the >=5 lock branch in a way that survives) | 0 |
| 5 | Correct password immediately after 5 failures | **200** (expected 423) | **true** | login succeeds | — |
| 6 | Correct password again, immediately after #5 | 200 | true | login succeeds again | — |
| 7 | Lock expiry logic, tested independent of the persistence bug (pure comparison `lockedUntil && Date.now()<lockedUntil`, evaluated directly, not via HTTP) | N/A | N/A | past timestamp → `false` (correctly allows login); future timestamp → `true` (correctly blocks); `null` → `false` | **The expiry comparison logic itself is correctly written** — the defect is entirely in persistence, not in this logic |
| 8 | Failed-login audit history for `sales1` after 6 wrong + 2 correct attempts | — | — | — | Only the 2 `PASS` entries exist; **zero `DENY` entries for any of the 6 failed attempts** |
| 9 | Counter persistence across server restart | — | — | 0 before restart, 0 after restart | Consistent — because there was never a nonzero value to lose; the bug already erases it before any restart is even involved |
| 10 | Counter persistence across process restart | — | — | Same as #9 (process restart = server restart in this architecture, single process) | Same conclusion as #9 |
| 11 | Different user account (`finance1`), one wrong password | 401 | false | not per-user special-cased — same bug | 0 entries — confirms the defect is universal, not `sales1`-specific |
| 12 | Successful login "resets counter" | — | — | Moot: the counter is already always 0, so a "reset" cannot be distinguished from the base bug | — |
| 13 | 5 CONCURRENT wrong-password attempts (`Promise.all`) against `purchase1` | all 401 | all false | — | 0 entries recorded — the defect holds even under concurrency (each request's own rollback independently erases its own mutation) |

**No test was weakened to force a pass.** Every result above is the actual, current, unfixed
behavior.

## 9. Results — Exact Counts

- **Login attempts tested:** 1 + 1 + 2 + 1 + 1(correct) + 1(correct) + 6(finance1/purchase1
  combined) + 5(concurrent) = 18 total HTTP login requests across the matrix.
- **DENY audit/loginHistory entries that should exist if the mechanism worked:** at minimum 13
  (every wrong-password attempt across items 1-4, 11, 13).
- **DENY audit/loginHistory entries actually found:** **0**.
- **Account lockouts that should have triggered:** 1 (item 4/5, the 5th cumulative failure).
- **Account lockouts actually observed:** **0**.
- **`ReversalRejected` audit entries that should exist after the reproduction in §4:** 1.
- **`ReversalRejected` audit entries actually found:** **0**.

## 10. Candidate Remediation Options (documented, NOT implemented)

### Option A — Dedicated non-transactional authentication path
Move `/api/login` off the legacy-dispatch wrapper entirely (it is not itself a business
transaction in the GL/inventory sense the wrapper was built to protect).
- **Correctness:** High — removes the login route from a boundary it was never designed for.
- **Security:** High — directly fixes the lockout defect with no side effects on unrelated routes.
- **Accounting risk:** None — login touches no financial data.
- **Audit implications:** Fixes login's own audit trail; does **not** fix the other 22 call sites
  in the blast radius (each still individually broken).
- **Regression risk:** Low — a narrowly-scoped, well-understood change to one route.
- **Implementation complexity:** Low.
- **Compatibility with future SQLite migration:** Neutral — this route's persistence would migrate
  independently regardless.

### Option B — Explicit persist-on-failure semantics for login/security bookkeeping
Give `withTransaction()` (or a wrapper around it) a way to mark specific mutations as
"survive rollback" — e.g., persist `loginHistory`/`failedLoginCount` writes outside the snapshot
capture, mirroring the already-working `auditReject:true` idiom but for arbitrary in-handler
mutations, not just the generic post-hoc `BusinessRuleRejected` entry.
- **Correctness:** High, if scoped precisely — risks under-scoping (missing a call site) or
  over-scoping (accidentally exempting a mutation that SHOULD roll back).
- **Security:** High — closes the whole blast-radius class, not just login.
- **Accounting risk:** Requires care — must not accidentally exempt any GL/inventory write from
  rollback protection.
- **Audit implications:** Best of the three options for audit completeness — could close all 23
  `Rejected`-audit call sites at once with one mechanism.
- **Regression risk:** Medium — touches the shared transaction framework every mutating route
  depends on; needs the kind of fault-injection regression battery this codebase has used for
  every other `withTransaction()`-adjacent change (Phases 35-38's own precedent).
- **Implementation complexity:** Medium — the mechanism itself is conceptually simple (a
  `persistOnFailure` marker), but validating it doesn't leak protection anywhere requires the same
  rigor as those prior phases.
- **Compatibility with future SQLite migration:** Good — "some writes are always durable
  regardless of the surrounding transaction's outcome" maps cleanly onto a real database's own
  distinction between DDL/audit tables and transactional business tables.

### Option C — General transaction framework supporting intentional persisted side effects
Redesign `withTransaction()` itself to accept a declared list of "non-transactional" mutations per
call (broader and more architectural than Option B's narrower marker), or split the framework into
two boundaries: one for the business mutation (rollback-eligible) and one for its accompanying
audit/security bookkeeping (never rolled back), composed together at each call site.
- **Correctness:** Potentially the most correct long-term shape, but highest design risk if rushed.
- **Security:** High, eventually — but broader scope means broader risk during the transition.
- **Accounting risk:** Highest of the three — a framework-level change touches every one of the
  ~215+ legacy routes and all `registerMutationRoute` handlers at once.
- **Audit implications:** Best possible end state, but not something to build reactively inside a
  forensic gate.
- **Regression risk:** **High** — this is precisely the kind of "broad change to
  `withTransaction()`" this gate's own instructions say not to make without first proving the
  blast radius (§7 above is that proof, but proof of scope is not the same as proof of a safe
  redesign).
- **Implementation complexity:** High.
- **Compatibility with future SQLite migration:** Good in principle (a real database's transaction
  isolation levels map naturally onto this), but the design work should happen alongside that
  migration, not before it, to avoid building two incompatible abstractions in sequence.

### Recommendation

**Option A first (immediate, narrow, closes ERP-059 itself with near-zero risk), then Option B as
a follow-up phase (closes the other 22 call sites systematically, reusing the already-proven
`auditReject:true` idiom's underlying principle).** Option C is the right eventual architecture but
should be deferred to align with the ERP-001 SQLite migration rather than attempted as a
standalone framework rewrite first. **Not implemented this gate** — this recommendation is offered
for the next phase's authorization, per the gate's explicit "do not silently implement" instruction.

## 11. Recommended Remediation

See §10 — Option A now, Option B next, Option C deferred to the SQLite migration phase. Awaiting
authorization; not started.

## 12. Whether Code Was Changed

**No.** This gate touched only: (a) live production data, via the application's own legitimate
Submit→Reject workflow (§2 — an operational action through the real UI/API, not a code change);
and (b) documentation (`PHASE-01-REMEDIATION-SESSION-REPORT.md` Addendum 10,
`ERP-059-TRANSACTION-ROLLBACK-BLAST-RADIUS.md`, this report). All forensic trace instrumentation
was added only to disposable isolated copies of `domain.js`/`server.js` in a scratch directory and
fully reverted before this report was written — `git status` on `SAP_Architecture_Lab/server/`
confirms zero modification to the tracked source files.

## 13. Regression Risk

None introduced — no source code changed. The three documented options each carry their own
regression-risk assessment in §10 for when one is actually implemented.

## 14. Git Status / Checkpoint

- Verified before this gate began: `git status` showed `SAP_Architecture_Lab/` clean except for
  this gate's own forthcoming documentation changes; `HEAD` at commit `dd78a9e` (Phase 1 Closure
  Gate), parent `86c6947` (baseline) — both confirmed present via `git log`.
- **No source-code checkpoint created this gate** — per the explicit instruction not to create a
  meaningless commit when no code changed.
- **Documentation-only commit created**, covering the Addendum 10 correction and the new
  blast-radius/gate-report documents — a real, substantive addition to the audit trail, not a
  no-op.
- `db.json`, `db.json.bak`, and all `backups/` content remain excluded per the established
  `.gitignore` (unchanged, still in force).
- **Not pushed** — local commits only, as in every prior step of this engagement.

## 15. Remaining Critical Findings

Unchanged from the Phase 1 Closure Addendum, plus ERP-059 now fully forensically characterized
(not fixed): **ERP-001** (architecture, disclosed), **ERP-036**, **ERP-037** (reporting date
semantics), **ERP-050** (Finished Goods chain, policy decision required), **ERP-059** (account
lockout — root cause confirmed, blast radius mapped to ~23 call sites, remediation options
documented, **still OPEN — no fix implemented**).

## 16. Phase Verdict

# **BLOCKED** (on your authorization to proceed with a remediation option)

Not "FIXED," not "PARTIALLY FIXED," not "MITIGATED" — ERP-059 remains exactly **OPEN**, now with
complete forensic evidence instead of a suspected root cause. This gate's own explicit scope was
investigation and cleanup, not remediation — every one of its 8 parts (A-H) is complete, but
closing ERP-059 itself requires a decision on §10's three options before any code is written.

---

============================================================
GATE COMPLETE
============================================================

Draft-0981: DISPOSED (Rejected, via legitimate workflow, zero GL/inventory effect throughout)

Production data statement: CORRECTED (Addendum 10)

ERP-059: root cause CONFIRMED, blast radius MAPPED (22 additional presumed-affected call sites,
1 additional live-confirmed: ReversalRejected), NOT FIXED

Security test matrix: 13/13 scenarios run, 0 weakened, exact counts in §9

Code changed: NO

Git: documentation-only commit (no source checkpoint — none needed)

Reports:
docs/erp-remediation/phases/PHASE-01-CLOSURE-ERP059-GATE-REPORT.md (this report)
docs/erp-remediation/phases/ERP-059-TRANSACTION-ROLLBACK-BLAST-RADIUS.md
docs/erp-remediation/phases/PHASE-01-REMEDIATION-SESSION-REPORT.md (Addendum 10)

============================================================

STOP. Awaiting review and an explicit decision on Section 10's remediation options before any
ERP-059 fix is implemented, and awaiting "Proceed to the next phase" before ERP-036/037/050 or any
other new work begins.
