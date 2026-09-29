# DEF-2026-001 — Fix Log

**Date:** 2026-09-16. Status: **FIXED**.

## Exact fix

**File:** `server/domain.js`, inside `qcDashboard()` (~line 5686-5699).

**Before:**
```js
function qcDashboard(){
  const byProject = {};
  DB.qcChecklists.forEach(c=>{
    if(!byProject[c.projectId]) byProject[c.projectId] = {projectId:c.projectId, total:0, passed:0, failed:0, pending:0};
    const b = byProject[c.projectId]; b.total++;
    if(c.result==='Pass') b.passed++; else if(c.result==='Fail') b.failed++; else b.pending++;
  });
```

**After:**
```js
function qcDashboard(){
  const byProject = {};
  DB.qcChecklists.forEach(c=>{
    if(!byProject[c.projectId]) byProject[c.projectId] = {projectId:c.projectId, total:0, passed:0, failed:0, pending:0};
    const b = byProject[c.projectId]; b.total++;
    if(c.status==='Passed') b.passed++; else if(c.status==='Failed') b.failed++; else b.pending++;
  });
```

Plus a 6-line explanatory comment recording the defect ID, root cause, and the deliberate design
choice to group `InProgress` with `Pending` (see Design Reasoning below).

**Diff size:** 2 tokens changed on the logic line (`c.result`→`c.status`, `'Pass'`→`'Passed'`,
`'Fail'`→`'Failed'`) plus a comment block. No other line in the codebase was touched.

## Design reasoning

1. **Field correction, not redesign.** The dashboard's own output shape (`byProject`, `totals`, with
   `total`/`passed`/`failed`/`pending`/`passRatePct` fields) is UNCHANGED — only the internal read
   that populates it was corrected. This is the textbook minimum-scope fix: make the dashboard read
   the field that was already being written correctly everywhere else, rather than inventing a new
   field, a new endpoint, or a new persisted representation.
2. **`InProgress` grouped with `Pending`, not given its own bucket.** The dashboard's bucket set is a
   3-way split (`passed`/`failed`/`pending`) — it always has been, and DEF-2026-001 did not ask for a
   4th bucket. This choice also matches every other real consumer's own treatment: both
   `handoverReadinessCheck()` and `projectClosureReadiness()` treat "anything other than `Passed`" as
   not-yet-done, never distinguishing `Pending` from `InProgress`. Adding a 4th bucket would be a
   genuine feature change (a new dashboard concept), not a defect fix, and is explicitly out of scope
   per Section 8's "avoid unrelated cleanup" instruction.
3. **Values corrected alongside the field name.** Simply renaming `result`→`status` without also
   correcting `'Pass'`/`'Fail'`→`'Passed'`/`'Failed'` would have left the function silently broken in
   exactly the same way (the canonical enum uses the past-tense forms, confirmed at `domain.js:430`)
   — both halves of the defect had to be fixed together to actually work.

## Files changed

| File | Change |
|---|---|
| `server/domain.js` | 1 function (`qcDashboard()`), 1 logic line + 1 comment block |

## Files deliberately NOT changed

- `server/server.js` — the `/api/qc-dashboard` route passes `qcDashboard()`'s return value through
  unchanged; no route-level change was needed or made.
- `client_secure/index.html` — `renderQCDash()` already correctly consumes the `totals`/`byProject`
  shape; the shape did not change, so no client change was needed or made.
- `createQCChecklist()`, `submitQCResult()`, `handoverReadinessCheck()`, `projectClosureReadiness()`
  — all already correctly use `status`; confirmed unaffected by regression testing.
- `server/phase28_modules_tests.js` — the pre-existing, unrelated BOM-workflow test-harness defect
  documented in `DEF-2026-001-INVESTIGATION.md` was left exactly as found, per Section 3's explicit
  instruction not to fix a defect outside this change's scope.
- No database migration, no field rename on persisted data, no API contract change.

## Compatibility considerations

**Persisted data:** completely unaffected. Every existing `qc.status` value on disk (test or, in a
real deployment, production) is read as-is; nothing about how QC checklists are created or how their
results are submitted changed. A QC checklist created before this fix and one created after it are
indistinguishable — both use the same `status` field with the same 4 allowed values, because that
field was never actually changed; only the dashboard's read of it was corrected.

**API contract:** `GET /api/qc-dashboard`'s response shape is byte-identical before and after this
fix (`{ok, byProject:[{projectId,total,passed,failed,pending,passRatePct}], totals:{...}}`) — only
the VALUES inside `passed`/`failed`/`pending` are now correct. Any existing client or integration
consuming this endpoint's shape continues to work unmodified; only a consumer that was somehow
depending on the WRONG values (implausible, since the values were unconditionally wrong for the
entire life of this function) could be affected.

**No database migration:** not required and not performed — the fix is entirely a read-path
correction.

## Production safety considerations

This fix was designed, implemented, and verified entirely on the isolated disposable test server
(`APP_ENV=test`, port 4100, scratch `db.json`). `server/db.json` (the real, production-shaped file)
was not read, written, or referenced at any point in this change — confirmed unchanged (timestamp
2026-09-10 18:14, identical before and after this entire task) in
`DEF-2026-001-TEST-REPORT.md`'s Production Safety section.

## Tests added

`tests/erp_def_2026_001_qc_dashboard_tests.js` — 19 permanent regression assertions covering Pending/
Passed/Failed/InProgress/mixed/zero-record/multi-record cases plus read-only safety checks. See
`DEF-2026-001-TEST-REPORT.md` for full results, including a deliberate revert-and-rerun that confirms
the new test suite genuinely fails against the original buggy code (6/19 failures, all and only the
dashboard-classification assertions) rather than being a vacuous pass.

## Tests modified

None. No existing test file was edited.

## Test results

19/19 new tests PASS. Full regression sweep (existing suites) clean — see `DEF-2026-001-TEST-REPORT.md`.

## Git

No commit made. Working tree changes only, per standing "only commit when explicitly authorized" rule.
