# DEF-2026-001 — Test Report

**Date:** 2026-09-16. Status: **VERIFIED**. Environment: isolated disposable test server,
`APP_ENV=test`, port 4100, scratch `db.json` — the same environment used throughout Phase 41, its
`domain.js`/`server.js`/`client_secure/index.html` confirmed byte-identical to the primary repo
before this change began.

## Before-fix reproduction (Phase B)

Reset to a clean seed, then created 3 controlled QC checklists on `PRJ-1`:

| Case | Action | Persisted `status` |
|---|---|---|
| 1 — Pending | Created, never submitted | `Pending` |
| 2 — Passed | Submitted, all items `Pass` | `Passed` |
| 3 — Failed | Submitted, one critical item `Fail` | `Failed` |

`GET /api/qc-dashboard` BEFORE the fix:
```json
{"byProject":[{"projectId":"PRJ-1","total":3,"passed":0,"failed":0,"pending":3,"passRatePct":0}],
 "totals":{"total":3,"passed":0,"failed":0,"pending":3,"passRatePct":0}}
```

- **Test data:** 3 real QC checklists, one of each true outcome.
- **API response (raw list):** each record's `status` field correctly showed `Pending`/`Passed`/`Failed`.
- **Persisted field:** `status` (confirmed via `GET /api/qc-checklists`), never `result`.
- **Dashboard input:** the same 3 records, read via `c.result` (always `undefined`).
- **Aggregation result:** `passed:0, failed:0, pending:3`.
- **Displayed result (client):** "Passed: 0, Failed: 0" stat tiles, all 3 rows shown as Pending — the
  client performs no transformation, so this is exactly what a real user would see.
- **Expected result:** `passed:1, failed:1, pending:1`.
- **Actual result (before fix):** `passed:0, failed:0, pending:3` — confirmed, deterministic, 100%
  reproducible (re-confirmed on a second, independent revert-and-rerun — see below).

## Fix applied

See `DEF-2026-001-FIX-LOG.md`. `qcDashboard()` corrected to read `c.status` with the real enum values
(`'Passed'`/`'Failed'`).

## After-fix live verification

Same 3 records, same server (restarted with the fix, data persisted via the file-backed DB):
```json
{"byProject":[{"projectId":"PRJ-1","total":3,"passed":1,"failed":1,"pending":1,"passRatePct":33.33}],
 "totals":{"total":3,"passed":1,"failed":1,"pending":1,"passRatePct":33.33}}
```
Exact match to the expected result.

## Test cases (Phase F) — `tests/erp_def_2026_001_qc_dashboard_tests.js`, 19 assertions

| # | Case | Result |
|---|---|---|
| 1 | Zero-record project | PASS — no phantom row, totals all zero |
| 2 | Pending QC | PASS — persists `status:'Pending'` |
| 3 | Passed QC | PASS — persists `status:'Passed'` |
| 4 | Failed QC | PASS — persists `status:'Failed'` |
| 5 | Mixed dataset (all 3 together) | PASS — dashboard shows `passed:1, failed:1, pending:1` (was `0,0,3` before the fix) |
| 6 | Aggregation consistency | PASS — `pending+passed+failed === total` |
| 7 | Pass rate correctness | PASS — `33.33%` (was `0%` before the fix) |
| 8 | Company-wide totals match project row | PASS |
| 9 | InProgress (partial submission) | PASS — persists `status:'InProgress'`, correctly grouped into the `pending` bucket, not dropped or double-counted |
| 10 | Multiple QC records, same project | PASS — 4 records total across cases 2-9, all correctly counted |
| 11-13 | Read-only safety: raw record count unchanged, individual record statuses unchanged after repeated dashboard reads | PASS ×3 |
| 14-15 | Accounting safety: Trial Balance balanced AND byte-identical before/after all QC activity | PASS ×2 |
| 16 | Inventory safety: movement count unchanged before/after | PASS |

**19/19 PASS.**

## Negative/safety testing (Phase G)

Explicitly verified the fix does NOT:

| Check | Result |
|---|---|
| Modify QC records unexpectedly | PASS — each of the 3 original records' `status` re-read identical after multiple dashboard calls |
| Modify accounting | PASS — Trial Balance debit/credit totals byte-identical before vs. after |
| Modify inventory | PASS — inventory movement count byte-identical before vs. after |
| Create duplicate QC records | PASS — raw `qc-checklists` count matches exactly the number of records created by the test (4) |
| Change QC workflow status outside a real submission | PASS — Pending/Passed/Failed records untouched by dashboard reads |
| Change API behavior outside the required correction | PASS — response shape unchanged; only the aggregated VALUES changed, and only in the direction the defect required |

The dashboard endpoint is read-only by design (`qcDashboard()` never calls `save()` and never mutates
`DB.qcChecklists`); this was confirmed by code reading AND by the live before/after equality checks
above, not assumed.

## Proof the test suite is a genuine regression guard, not a vacuous pass

The fix was temporarily reverted in the isolated scratch copy only (never in the primary repo), the
server restarted, and the SAME 19-assertion suite re-run:

**Result: 13 PASS / 6 FAIL** — the 6 failures were exactly and only the 6 assertions that directly
probe the dashboard's pass/fail/pending classification (cases 5, 7, 9-partial); every safety and
raw-persistence assertion still passed, confirming those checks are independent of the field-read bug
as intended. The fix was then restored and the server restarted again; the suite returned to 19/19.
This proves the new test will genuinely fail if this defect is ever reintroduced.

## Regression results (Phase H)

| Suite | Result |
|---|---|
| **A. New DEF-2026-001 tests** (`erp_def_2026_001_qc_dashboard_tests.js`) | **19/19 PASS** |
| **B. Relevant QC tests** — `erp_audit_p0_tests.js` (ERP-032/033/034: empty-checklist rejection, nonexistent-installation rejection, full handover-readiness fixture incl. QC Passed gate) | **65/65 PASS** (whole suite; all QC-specific rows individually confirmed PASS) |
| **B. Relevant QC tests** — `server/phase28_modules_tests.js` §7 (QC Dashboard shape assertion) | Executes and would PASS (confirmed by direct reproduction of the identical API call); the script itself crashes LATER, in its unrelated §9 Production Order section, due to a pre-existing stale-fixture defect — see Known Issue below, NOT counted as a DEF-2026-001 failure |
| **C. Relevant project/install/handover tests** — `erp_audit_p0_tests.js` ERP-034 (handover readiness, duplicate-handover rejection, audit trail) | **PASS** — all rows, confirming `handoverReadinessCheck()`'s correct `status`-based QC gate is unaffected |
| **D. Relevant historical regression** — `erp_059_security_tests.js` | 13/13 PASS |
| | `erp_059_transaction_contract_tests.js` | 6/6 PASS |
| | `erp_059c_production_isolation_tests.js` | 10/10 PASS |
| | `erp_059b_durable_audit_tests.js` | 22/24 PASS (+2 documented-not-tested — pre-existing, unchanged environmental limitation, see below) |
| | `erp_phase38_e2e_trace_tests.js` | 49/49 PASS |
| | `erp_phase39_manufacturing_jobwork_tests.js` | 36/36 PASS |
| | `erp_phase39_fixed_assets_tests.js` | 30/30 PASS |
| | `erp_phase39_banking_tests.js` | 34/34 PASS |
| | `erp_phase39_payment_approval_matrix_tests.js` | 18/18 PASS |
| **E. Directly affected dashboard/report tests** | Covered by A above — `qcDashboard()` has exactly one producer and one consumer system-wide (confirmed via search in the Investigation report); no other report duplicates this aggregation |
| **Stress volume** — `erp_phase39_stress_test.js` (525-document batch) | See addendum below (ran in background; result appended once complete) |

### Known issues, classified honestly (not hidden, not silently marked PASS)

1. **`phase28_modules_tests.js` — TEST-HARNESS DEFECT, pre-existing, unrelated.** Crashes at its own
   line 141 (`TypeError: Cannot read properties of undefined`) because its §9 section calls
   `/api/boms/:id/approve` directly on a Draft BOM without a `/submit` step first — a workflow
   requirement added in Phase 40 (DEF-P40-02/03/04), after this test file was last updated. Root-
   caused via direct API reproduction (see Investigation report). Its §7 QC Dashboard assertion
   executes successfully before this unrelated crash (independently re-confirmed). NOT fixed, per
   Section 3's explicit "document separately, do not fix unless same root cause" instruction — this
   defect shares no code, field, or module with DEF-2026-001.
2. **`erp_059b_durable_audit_tests.js` B6/B7 — DOCUMENTED-NOT-TESTED, pre-existing, unrelated.** The
   same environmental test-harness limitation (a fixture file path relative to the wrong working
   directory) documented and unchanged since it was first identified in Phase 39, re-confirmed
   unchanged here. Unrelated to QC.

Neither known issue is a production/application defect and neither was introduced by this change —
both were independently verified to predate it by direct reproduction against the ORIGINAL,
unmodified code path (the BOM workflow gate; the B6/B7 fixture path), not merely assumed pre-existing.

## Production safety verification (Section 12)

| Check | Result |
|---|---|
| `server/db.json` modified? | **NO** — timestamp 2026-09-10 18:14:36, identical before and after this entire task |
| Production server targeted? | **NO** — every test ran against `http://localhost:4100`, the isolated scratch instance, confirmed `APP_ENV=test` via `/api/system/environment` before every destructive call (ERP-059C preflight guard, built into every test script used) |
| Destructive endpoint called against production? | **NO** |
| Production backup modified? | **NO** — no backup operation was performed at all this change |
| Production business record created? | **NO** |
| Production accounting transaction occurred? | **NO** |
| Production inventory transaction occurred? | **NO** |

## Addendum — 525-document stress test result

`erp_phase39_stress_test.js` (105 Sales Invoices + 105 Supplier Bills + 105 Customer Receipts + 105
Supplier Payments + 105 GRNs, plus full Trial Balance/AR/AP/GST/numbering reconciliation) —
**11/11 PASS, 0 FAIL.** This suite does not touch QC at all; it is included here as the standing
highest-volume proof that the fix (a single 2-token read-path correction in one read-only function)
has zero measurable effect on the rest of the system, even under load.

## Final verification (Section 15)

1. **Canonical QC field?** `status` (values `Pending`/`InProgress`/`Passed`/`Failed`).
2. **Exact cause of the dashboard defect?** `qcDashboard()` read a `c.result` field that was never
   written anywhere in the codebase, so every record unconditionally fell into the `pending` bucket.
3. **Exact code changed?** One line inside `qcDashboard()` (`server/domain.js` ~line 5692), changing
   `c.result==='Pass'`/`'Fail'` to `c.status==='Passed'`/`'Failed'`, plus an explanatory comment.
4. **Was persisted data changed?** No. Zero writes to `DB.qcChecklists` or any other collection.
5. **Was the API contract changed?** No. `GET /api/qc-dashboard`'s response shape is unchanged; only
   the previously-always-wrong aggregated values are now correct.
6. **Was a database migration required?** No.
7. **What was the blast radius?** Exactly one function. Five other QC consumers (creation, submission,
   handover gate, closure gate, 3 UI renders) were confirmed already correct and confirmed unaffected
   by both source reading and live regression testing.
8. **Which tests prove the defect is fixed?** `tests/erp_def_2026_001_qc_dashboard_tests.js`, 19/19
   PASS, including a deliberate revert-and-rerun proving the suite genuinely fails (6/19) against the
   original buggy code.
9. **Did all relevant regression tests pass?** Yes — every suite run returned 0 unexplained failures;
   the two known non-zero results (`phase28_modules_tests.js`'s unrelated crash, `erp_059b`'s
   pre-existing B6/B7) are both independently confirmed pre-existing and unrelated to this change, not
   hidden or silently marked PASS.
10. **Were any unrelated defects discovered?** Yes, one — the `phase28_modules_tests.js` stale BOM-
    workflow test-harness defect, documented in `DEF-2026-001-INVESTIGATION.md` and this report, NOT
    fixed, per Section 3's explicit instruction.
11. **Was production untouched?** Yes — `server/db.json` timestamp unchanged throughout.
12. **Was Git left uncommitted?** Yes — no commit was made.
13. **Is any residual risk remaining?** None identified for DEF-2026-001 itself. The unrelated
    `phase28_modules_tests.js` defect remains open as its own, separately-trackable item (not a
    DEF-2026-001 residual risk, since it predates and is unrelated to this change) — see the
    Controlled Change Register for tracking.
