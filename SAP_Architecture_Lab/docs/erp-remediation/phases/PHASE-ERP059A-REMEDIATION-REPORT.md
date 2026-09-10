# Phase ERP-059A — Security Remediation Report
## Account Lockout + Persist-on-Failure Control

**Date:** 2026-09-10.

---

## 1. Executive Summary

ERP-059 — account lockout completely non-functional because `/api/login`'s intentional
security-bookkeeping mutations (`failedLoginCount`, `lockedUntil`, `loginHistory` DENY records)
were silently rolled back by `withTransaction()`'s blanket "restore on `ok:false`" rule — is now
**FIXED**. The fix is the narrow, approved Option A from the prior forensic gate: `/api/login` is
excluded from the legacy-dispatch transaction wrapper entirely, the same way modern routes already
bypass it. Verified across a 17-scenario security matrix (all real HTTP requests, all passing), a
dedicated transaction-contract test proving five unrelated business-rejection paths across
Finance/Procurement/Inventory/Workflow still roll back exactly as before, a full 26-file historical
regression (zero new failures, one historical test file's own two pre-existing failures now
independently resolved), and a real production Trial Balance/reconciliation check before and after.
The broader blast radius (12 related call sites elsewhere in the codebase, corrected down from the
forensic gate's initial ~22-site estimate after this phase re-verified every site's actual return
value) remains **OPEN**, by design — this phase's mandate was the narrow login fix plus
classification, not a framework-wide rewrite.

## 2. Before-State Evidence

Reproduced on a disposable server, before any code change (full detail:
`PHASE-ERP059A-BASELINE.md`):

```
5x wrong password against sales1:     all 401 (correct)
correct password immediately after:   200, ok:true   <- EXPECTED 423
user.failedLoginCount on disk:        0 (never incremented)
user.lockedUntil on disk:             null (never set)
loginHistory entries for sales1:      1 (only the final PASS — zero DENY records for any of the 5 failures)
```

## 3. Root Cause

`/api/login` is legacy-dispatched (not on the modern `registerMutationRoute` framework), so it
falls through `server.js`'s legacy-dispatch wrapper, which wraps every such route in
`D.withTransaction()`. That function restores `DB` to a pre-request snapshot whenever the wrapped
handler's result has `ok:false` — not only on a thrown exception. A failed login **intentionally**
mutates `failedLoginCount`/`lockedUntil`/`loginHistory` as the entire point of returning `ok:false`
— the wrapper could not distinguish that intentional bookkeeping from an ordinary rejected business
mutation, and erased both identically. (Full lifecycle trace: the prior forensic gate's
`PHASE-01-CLOSURE-ERP059-GATE-REPORT.md`, §5-6.)

## 4. Code Change

**File:** `server/server.js`, the legacy-dispatch wrapper (~line 548-575).

**Before:**
```js
const isModernRoute = !!matchMutationRoute(req.method, pathnameForDispatch);
if(!MUTATING_METHODS.has(req.method) || isModernRoute){
  handleRequest(req, res, body);
  return;
}
```

**After:**
```js
const isModernRoute = !!matchMutationRoute(req.method, pathnameForDispatch);
const isLoginRoute = pathnameForDispatch === '/api/login' && req.method === 'POST';
if(!MUTATING_METHODS.has(req.method) || isModernRoute || isLoginRoute){
  handleRequest(req, res, body);
  return;
}
```

(Plus a explanatory comment block citing the forensic report — see the actual file for full text.)

**What did NOT change:** the `/api/login` handler itself (its password verification, account
status checks, lock-expiry comparison, session creation, and every one of its four branches'
`D.save()` calls) — zero lines of that function were touched. No second authentication
implementation was introduced; login still runs through exactly one code path, now simply outside
a transaction boundary it was never designed to need.

## 5. Architecture Impact

Minimal and precisely scoped: one route (`POST /api/login`) is excluded from one wrapper. Every
other one of the ~215 legacy routes, and every `registerMutationRoute()`-registered route, is
wrapped exactly as before — confirmed by the transaction-contract test (§11). No change to
`withTransaction()` itself, no change to `dispatchMutationRoute()`, no change to any domain
function. This is deliberately the smallest change that closes ERP-059, per the phase's own
"do not over-remediate" instruction (Part 9).

## 6. Security Test Results

17/17 scenarios PASS. Full table: `ERP-059-SECURITY-REGRESSION-MATRIX.md`. Headline results:

- 5 wrong passwords → correctly locks the account (was: never locked).
- Correct password while locked → `423` (was: `200`).
- Lock persists across a real server restart.
- Lock expires correctly once past its timestamp.
- Concurrent failed attempts (`Promise.all`, 3 simultaneous) are all recorded, none lost.
- No password/hash ever appears in any audit record.
- No session cookie is ever set on a failed/locked attempt.

## 7. Lockout Verification

Directly confirmed via HTTP: 5 sequential wrong-password attempts against `sales1`, immediately
followed by the correct password → `423 Locked`, not `200`. Direct database inspection confirms
`lockedUntil` set to a real future timestamp and all 5 `DENY` entries (plus the subsequent
`account locked` `DENY`) present in `loginHistory`.

## 8. Restart Persistence Verification

A real, separate OS process was spawned, driven to a lock, killed, and restarted against the same
disposable `db.json` — the lock (and its full failed-attempt history) survived the restart intact.
Sessions themselves do NOT survive a restart (in-memory only, by pre-existing, disclosed design —
ERP-013/014) — the test explicitly re-authenticates as `admin` after each restart, exactly as a
real operator would have to.

## 9. Concurrent Attempt Verification

3 concurrent (`Promise.all`) wrong-password attempts against `purchase1` produced exactly 3 `DENY`
entries in `loginHistory` — none silently dropped to interleaving, and the counter/lock mechanism
behaves correctly under concurrent load (Node's single-threaded event loop, with no `await` inside
the login handler's own mutation sequence, means these requests cannot actually interleave with
each other mid-mutation — confirmed empirically here, not merely assumed).

## 10. Blast-Radius Classification

Full document: `ERP-059-BLAST-RADIUS-CLASSIFICATION.md`. This phase **corrected** the forensic
gate's estimate: re-reading every one of the ~22 flagged call sites' actual return values found
that 7 of them (`ExcessBillingRejected`, `ChangeRequestRejected`, `BOMRejected`,
`ExcessMaterialIssueRejected`, `PurchaseRequisitionRejected`, `SiteMaterialRequisitionRejected`,
`PaymentRequestRejected`) describe a **successful** document-rejection action (`ok:true`), never
actually reachable by `withTransaction()`'s rollback rule — a false-positive correction, not a
new finding. The true remaining scope is **12 call sites** (excluding the now-fixed login):

- **Category A (live-confirmed broken this phase, 5):** `ReversalRejected` (Finance),
  `SupplierBillThreeWayMatchBypassRejected` (Procurement), `InventoryAdjustmentRejected`
  (Inventory), `UserCreationRejected` (Security/user provisioning),
  `MasterDataImportBatchRejected` (Audit — this session's own ERP-017 fix).
- **Category B (structurally confirmed, same exact code shape, not independently live-tested this
  phase, 7):** `GRNRejected`, `PurchaseReturnRejected`, `MaterialIssueRejected`,
  `SiteReturnRejected`, `JobWorkScrapRejected` (Manufacturing), `RestoreRejectedValidationFailed`
  and `RestoreRejectedChecksumMismatch` (Backup/DR — this session's own ERP-040 fix).
- **Category C:** none found.
- **Category D (not affected, corrected from the forensic gate):** the 7 listed above.

None of these 12 were touched this phase, per Part 9's explicit instruction.

## 11. Transaction-Contract Test Results

Full document: `ERP-059-TRANSACTION-CONTRACT-TEST-REPORT.md`. 6/6 PASS: invalid Manual JE
(negative debit), invalid GRN (negative quantity) against a real PO, invalid PO (negative line
quantity), invalid dispatch (fake material), and a Segregation-of-Duties self-approval rejection
were all correctly rejected **and** left zero trace of their attempted mutation (record counts and
document statuses unchanged before/after) — proving the login fix did not weaken rollback
protection anywhere else. The 6th case (login itself) is the deliberate positive control, proving
the fix's own mutation DOES now persist.

## 12. Accounting Reconciliation

On the disposable server, after regenerating real transactional activity (`after_sales_tests.js`):
Trial Balance ₹1,43,200 = ₹1,43,200 (balanced); `GET /api/reconciliation` — AR, AP, Output Tax,
Input Tax, Customer Advances all `matches: true`. **On the real production server**, before and
after the fix was deployed: Trial Balance ₹2,10,80,548.64 = ₹2,10,80,548.64, unchanged, balanced.
**Login has zero accounting effect, confirmed on both datasets.**

## 13. Inventory Reconciliation

On the disposable server: stock (`MAT-1`@`WH-1`) = 49 units at a ₹2,800 moving-average rate =
₹1,37,200 closing value, reconciling exactly to the GL Inventory account balance (debit ₹1,40,000,
credit ₹2,800, net ₹1,37,200). No negative stock, no orphan or duplicate movements (2 movements,
both tracing to real source documents). **Login has zero inventory effect** — it was never
plausible for it to have one (the login route touches no inventory collection at all), confirmed
by inspection rather than assumed.

## 14. Full Regression Results

| Suite | Result |
|---|---|
| `erp_059_security_tests.js` (permanent, new) | 13/13 PASS |
| `erp_059_restart_persistence_tests.js` (permanent, new) | 5/5 PASS |
| `erp_059_transaction_contract_tests.js` (permanent, new) | 6/6 PASS |
| `erp_audit_p0_tests.js` (from Phase 1) | 65/65 PASS |
| `erp_audit_concurrency_tests.js` (ERP-005, from Phase 1) | 1/1 PASS |
| Historical 26-file suite (`HANDOVER_PACKAGE/03_TESTS/`) | 18 files clean; `id_tamper_tests.js` 46/47 (1 known stale, unchanged); `security_matrix.js` 1076/1080 (4 known stale, unchanged, identical to the prior gate's ERP-048 baseline); **`security_tests.js` improved 42/44 → 44/44**; 5 files still crash on pre-existing stale-test/fixture issues identical in root cause and line number to the prior gate's classification (`crm_tests.js`, `phase19_icici_import_tests.js`, `phase20_handover_tests.js`, `procurement_tests.js`, `site_tests.js`) |

**Zero new regressions across the entire historical suite. One historical file's own
pre-existing failures independently resolved as a direct, corroborating side effect of the fix.**

## 15. Defects Discovered

- **ERP-059 itself** — already known coming into this phase; not a new discovery.
- **A blast-radius over-count** — the forensic gate's ~22-site estimate included 7 false
  positives; corrected this phase (§10). This is a correction to prior analysis, not a new defect
  in the application.
- **No new application defects were discovered during this phase's fault-injection/regression
  testing.**

## 16. Defects Fixed

- **ERP-059** (login lockout) — FIXED and independently verified across 24 permanent regression
  assertions (13+5+6) plus the historical suite's own corroborating improvement.

## 17. Defects Still Open

- **The 12-site blast radius (§10)** — OPEN, unfixed, by design (Part 9 scope).
- **ERP-001, ERP-036, ERP-037, ERP-050** — unchanged, out of scope for this phase, not touched.

## 18. Git Checkpoint

- **HEAD before this phase:** `e066c2d73b47006ecd098f175568a6ef4051c5e1`
- **Code-change commit:** `c1db31c509b9542cf11fedf4274a6c54f380cc7b` — "ERP-059 fix: move
  /api/login off the legacy transaction-rollback boundary" (8 files: 1 source file changed,
  7 new test/documentation files)
- **Local commit only — not pushed.**
- `db.json`, `db.json.bak`, `backups/`, `*.log`, and the runtime `.lock` file all remain excluded
  per the established `.gitignore` (verified unchanged, still in force).

## 19. Production-Data Verification

- **Checksum before this phase's code change:** `0cf464843ba3e791a3bd405eab59648e776052abdd25f6ef1c9a4a4c4820be9e`
  (recorded in `PHASE-ERP059A-BASELINE.md`).
- **All fault-injection, lockout, restart, and concurrency testing ran exclusively against
  disposable isolated servers** (ports 4093 and, for the historical suite, 4001 — both confirmed
  free of any real production process before use, and both stopped before the real server was
  started). No wrong-password attempts, no test business documents, and no destructive testing of
  any kind were run against production.
- **The real production server was stopped (confirmed via `netstat`/`tasklist`) at the start of
  this phase** — nothing was running against `server/db.json` when this phase began.
- **Live deployment, performed deliberately per the Production Safety instructions**: verified
  process (none running), verified port (4001, free), verified database path, verified backup
  (`db.json.bak` and the `backups/` directory both present), verified server configuration
  (`PORT = 4001`) and syntax (`node -c` on both `domain.js`/`server.js`), then started the real
  server (PID `1432`). **Post-restart read-only smoke test**: admin login succeeds; `projects`
  count 246 (unchanged); `journalEntries` count 1,547 (unchanged); Trial Balance balanced at
  ₹2,10,80,548.64 (unchanged); `DRAFT-0981` (the prior gate's disposed-of artifact) confirmed still
  `Rejected`. **No wrong-password attempt and no test business document was created against
  production at any point in this phase.**

## 20. Residual Risk

- **The 12-site blast radius remains genuinely exploitable** — any of those 12 rejection paths
  will continue to silently lose their specific audit-trail detail (though, for the 6 sites on
  modern routes, a generic `BusinessRuleRejected` fallback still survives via the unrelated
  `auditReject:true` mechanism; the other 6 — including `UserCreationRejected` and
  `MasterDataImportBatchRejected` — have no fallback at all). This is a real, disclosed,
  unaddressed risk pending the Option B follow-up phase.
- **Windows platform limitation (documented in the forensic gate, unchanged by this phase):** no
  reliable external graceful-shutdown signal exists for this console server; the stale-lock
  auto-recovery (ERP-005) remains the compensating control, and was re-confirmed working correctly
  during this phase's own server restarts.
- **No regression risk from this phase's fix itself** — proven narrowly scoped by the
  transaction-contract test (§11) and the full historical/P0/concurrency regression sweep (§14).

## 21. Phase Verdict

# **FIXED** (ERP-059, login lockout) — **12-site blast radius remains OPEN** (unaddressed by design)

ERP-059 itself meets every one of the original forensic gate's own "no false closure" criteria:
root cause identified, code changed, positive test passed (valid login still works), negative test
passed (17-scenario matrix), regression tests added and permanent, cross-module/transaction-
contract test passed, accounting/inventory impact checked (zero effect, confirmed on real
production data), evidence recorded, and — critically — **no regression introduced**, verified
across the complete historical suite plus this session's own P0 and concurrency suites. The broader
transaction-framework question (Option B/C) is explicitly and correctly left **OPEN** for a future,
separately-authorized phase.

---

============================================================
PHASE COMPLETE
============================================================

Phase verdict: FIXED (ERP-059 login lockout) / 12-site blast radius OPEN by design

ERP-059 status: FIXED

Exact test counts:
  erp_059_security_tests.js:              13/13 PASS
  erp_059_restart_persistence_tests.js:     5/5 PASS
  erp_059_transaction_contract_tests.js:    6/6 PASS
  erp_audit_p0_tests.js:                  65/65 PASS
  erp_audit_concurrency_tests.js:           1/1 PASS
  Historical 26-file suite:  18 clean, 2 with known pre-existing stale failures (unchanged),
                             5 with known pre-existing crashes (unchanged),
                             1 IMPROVED (security_tests.js 42/44 -> 44/44)

Regression results: ZERO new regressions found

Blast-radius classification: 12 genuinely-affected call sites (corrected down from ~22),
  5 live-confirmed broken this phase, 7 structurally confirmed, 0 ambiguous, 7 corrected to
  "not affected" (false positives from the prior gate)

New findings: none (one blast-radius over-count corrected, not a new application defect)

Commit hash: c1db31c509b9542cf11fedf4274a6c54f380cc7b

Report paths:
docs/erp-remediation/phases/PHASE-ERP059A-BASELINE.md
docs/erp-remediation/phases/PHASE-ERP059A-REMEDIATION-REPORT.md (this report)
docs/erp-remediation/phases/ERP-059-BLAST-RADIUS-CLASSIFICATION.md
docs/erp-remediation/phases/ERP-059-SECURITY-REGRESSION-MATRIX.md
docs/erp-remediation/phases/ERP-059-TRANSACTION-CONTRACT-TEST-REPORT.md

============================================================

STOP. Awaiting review and explicit authorization before ERP-059B (Option B for the remaining
12-site blast radius), ERP-036, ERP-037, ERP-050, ERP-001, or any other phase begins.
