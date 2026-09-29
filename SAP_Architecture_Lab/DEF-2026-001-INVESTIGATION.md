# DEF-2026-001 — Investigation Report

**Date:** 2026-09-16. Status: **INVESTIGATING → FIXED (pending final regression sign-off)**.
Conducted under the Phase 41 frozen-baseline change-management workflow. No code was changed until
this investigation was complete and the canonical field was established from repository evidence.

## Defect statement

The QC Dashboard's pass/fail/pending aggregation was reported as potentially reading the wrong field
on QC Checklist records, possibly causing Passed/Failed records to display as Pending.

## Forensic investigation — the CREATE → PERSIST → API → READ → AGGREGATE → DASHBOARD → DISPLAY trace

| Stage | Finding | Evidence |
|---|---|---|
| CREATE | `createQCChecklist()` initializes the checklist with `status:'Pending'` | `server/domain.js:6534-6538` |
| PERSIST | The outcome is written ONLY to `qc.status`, values from the exported enum `QC_STATUSES = ['Pending','InProgress','Passed','Failed']` | `server/domain.js:430`, `6551` (`submitQCResult()`) |
| API (list) | `GET /api/qc-checklists` returns raw `qc` objects unchanged — `status` present, no `result` field ever set | `server/server.js:1679-1683` |
| API (dashboard) | `GET /api/qc-dashboard` returns `qcDashboard()`'s aggregation verbatim, no transform | `server/server.js:2394-2396` |
| READ (buggy) | `qcDashboard()` read `c.result==='Pass'` / `c.result==='Fail'` — a field never written anywhere | `server/domain.js:5686-5697` (before fix) |
| AGGREGATE | Because `c.result` is always `undefined`, neither comparison ever matched, so EVERY record fell into the `else` branch (`b.pending++`) unconditionally | Same function |
| DASHBOARD/DISPLAY | Client `renderQCDash()` renders the server's `totals`/`byProject` values with zero client-side transformation — the defect is 100% server-side | `client_secure/index.html:5264-5272` |

## Root cause

`qcDashboard()` was written against a field/value scheme (`result`: `'Pass'`/`'Fail'`) that was never
actually implemented anywhere else in the codebase. The real, canonical field (`status`, values
`'Pending'/'InProgress'/'Passed'/'Failed'`) has been in place since Phase 8 and is the field every
OTHER consumer already reads correctly:

- `handoverReadinessCheck()` — `q.status==='Passed'` (`domain.js:6608`)
- `projectClosureReadiness()` — `q.status==='Passed'` (`domain.js:6686`)
- Project 360 UI (QC Checklists section) — `r.status` rendered as a colored pill (`index.html:1631`)
- Project 360 UI ("QC Not Yet Passed" stat) — `q.status!=='Passed'` (`index.html:1329`)
- QC submit-result message — `r.qc.status` (`index.html:2696`)

Full-file searches (`grep -n "\.result\b"` across `server/domain.js`, and `.result` across
`client_secure/index.html`) confirm `c.result`/`qc.result` is set or read NOWHERE else in either
file. The only other `.result` occurrences in the codebase are two completely unrelated concepts: a
generic idempotency-cache object (`existing.result`, `domain.js:1248/1377`) and a warranty-eligibility
API response field (`r.result`, `index.html:2905`) — neither shares any code path, data structure, or
root cause with QC.

**Consequence, precisely stated (stronger than the original report's "may remain incorrect"):** this
was not an intermittent or partial defect — it was a 100%, unconditional misclassification. No QC
checklist record, regardless of its true outcome, could ever be counted as Passed or Failed by this
function as originally written; every record was always counted as Pending.

## Canonical QC field determination

- **CANONICAL QC FIELD:** `status`
- **TYPE:** string enum
- **ALLOWED VALUES:** `'Pending'`, `'InProgress'`, `'Passed'`, `'Failed'` (`QC_STATUSES`, `domain.js:430`, publicly exported at `domain.js:12061`)
- **LEGACY/COMPATIBILITY FIELDS:** none found — `result` was never a real field, not a deprecated one
- **SOURCE OF TRUTH:** `submitQCResult()` (`domain.js:6540-6555`) is the sole writer after initial creation; `createQCChecklist()` (`domain.js:6523-6538`) is the sole initializer (always to `'Pending'`)

This is established from direct, multi-path code evidence (5 independent correct consumers, 1
exported enum, 0 occurrences of the field the dashboard was reading) — not assumed from the defect
report's own framing, per this investigation's explicit instruction not to trust that framing without
verification.

## Blast radius (Phase C)

| Location | Classification | Notes |
|---|---|---|
| `qcDashboard()` (`domain.js:5686`) | **B — incorrect usage** | The sole defect site |
| `handoverReadinessCheck()` (`domain.js:6608`) | A — correct canonical usage | Unaffected, untouched |
| `projectClosureReadiness()` (`domain.js:6686`) | A — correct canonical usage | Unaffected, untouched |
| QC Checklist creation/submission (`domain.js:6523-6555`) | A — correct canonical usage | Unaffected, untouched |
| Project 360 QC section (`index.html:1631`) | A — correct canonical usage | Unaffected, untouched |
| Project 360 "QC Not Yet Passed" stat (`index.html:1329`) | A — correct canonical usage | Unaffected, untouched |
| QC submit-result message (`index.html:2696`) | A — correct canonical usage | Unaffected, untouched |
| Idempotency-cache `.result` (`domain.js:1248/1377`) | D — unrelated field, same name | Different data structure entirely, no relation to QC |
| Warranty eligibility `.result` (`index.html:2905`) | D — unrelated field, same name | Different feature entirely (Warranty, not QC), no relation |
| `phase28_modules_tests.js` §7 (`server/phase28_modules_tests.js:116-117`) | C — shape-only, non-diagnostic | Asserts `typeof totals.total==='number'` only, never asserted real counts — this is exactly why the defect went undetected across every prior regression run |
| Management MIS / Weekly Scorecard | Not applicable | Confirmed via search: neither duplicates QC pass/fail aggregation; `qcDashboard()` has exactly one producer and one consumer system-wide |

**No other occurrence of "result" or "status" anywhere in the QC domain required a change.** This is a
single-site, single-function defect.

## Unrelated issue discovered during regression testing (documented separately per Section 3's instruction, NOT fixed)

While running the pre-existing `server/phase28_modules_tests.js` suite as part of this defect's
regression sweep, that script crashed with `TypeError: Cannot read properties of undefined (reading
'id')` at its own line 141 — in its §9 (Machines/Job Cards/Production Order) section, entirely
unrelated to QC. Root-caused via direct API reproduction: the script calls `POST /api/boms/:id/approve`
directly on a freshly-created (Draft-status) BOM without first calling `/submit`, and now correctly
receives `"Cannot approve — \"Draft\" — a BOM must be Submitted before it can be approved."` — the
Draft→Submitted→Approved BOM workflow was tightened during Phase 40 (DEF-P40-02/03/04), after this
test file was last updated. This is a **stale test-harness fixture defect**, not a production defect,
and shares no root cause with DEF-2026-001 (different module, different field, different workflow).
Per Section 3's explicit instruction, it is documented here and NOT fixed as part of this change. The
QC Dashboard assertion in the SAME file (§7, line 116-117) executes and completes successfully before
this unrelated later crash — independently re-confirmed via direct API call and via the new dedicated
`tests/erp_def_2026_001_qc_dashboard_tests.js` suite (19/19 PASS).
