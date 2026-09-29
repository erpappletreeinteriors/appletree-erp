# PHASE 41 — Baseline

**Date:** 2026-09-13. Recorded before any Phase 41 code change, after re-reading all 19 Phase 40
documents in full (they were authored earlier this same session) plus fresh source-code inspection
of the Lead/Estimation/Costing/Quotation chain and the Backup/Restore mechanism.

## Version control state

- Last real commit: `d96234b`, unchanged. Nothing has been committed since Phase 39 began.
- Uncommitted working-tree changes carried in from Phases 39-40 (still uncommitted, per this
  engagement's "only commit when asked" rule): `server/domain.js`, `server/server.js`,
  `client_secure/index.html` — all Phase 39/40 fixes, unchanged entering Phase 41.

## Test environment

Phase 40's isolated test server is still running: `APP_ENV=test`, port 4100, scratch directory
`C:\Users\Lenovo\AppData\Local\Temp\claude\D--APPLETREE-INTERIORS-Claude\phase40_e2e\`. This phase
continues to use it (no need for a fresh instance — `/api/test/reset` provides a clean dataset
per-suite as already established). `server/db.json` (port 4001, production-shaped) remains untouched
and will not be referenced by any Phase 41 test.

## Current test counts (Phase 40 close)

300/300 automated assertions (+2 pre-existing documented-not-tested items), 118 real browser-driven
UAT steps, 525-document stress batch — all clean, all re-confirmed at the end of Phase 40.

## Current open defects

0 P0, 0 P1, 0 P2. Open: DEF-P38-03 (P4, cosmetic), DEF-P39-01 (P4, cosmetic), DEF-P39-03 (P3, a
genuine Board-level policy question, not a code defect). All four Phase 40 defects (DEF-P40-01
through 04) are CLOSED — FIXED.

## Current Phase 40 A− reasons (the exact 3 items Phase 41 exists to close)

Per `PHASE_40_FINAL_A_GRADE_VERDICT.md` Section 23: Viewer role was never exercised through the
browser; the Lead→Estimation→Costing→Quotation chain was not exercised through the browser (only
confirmed to render); Backup/Restore has no dedicated UI screen and was not evaluated as an existing
operational capability.

## Current browser coverage

15/15 required Phase 40 areas covered, 9 with complete real multi-step transaction chains. Not
covered: Viewer role (zero transactions), Lead/Estimation/Quotation (screen-render only), Backup/
Restore (not touched at all, UI or API).

## Current traceability status

AR/AP settlement gap closed (DEF-P40-01) — both directions live-proven. 0 orphans at 525-document
stress volume. Not yet traced this engagement: a Lead→Quotation→Won→Project→Invoice chain (the
`wonTransition()` function's own `leadId`/`quotationId`/`estimationRequestId` fields on the created
Project record are the mechanism that would make this traceable — confirmed present by code reading,
not yet exercised live).

## Current security status

11 live-blocked unauthorized operations in Phase 40 (6 API probes + 5 browser RBAC negatives), 0
succeeded. Viewer role's own negative-test coverage: **zero** — this is the specific gap Section 4
requires closing.

## Current regression status

300/300 (+2 documented), zero regressions through Phase 40's 4 fixes.

## Current backup/restore mechanism — inspected fresh this phase, before any test

Confirmed by direct source-code reading (`server/domain.js:1099-1230`, `server/server.js:2626-2649`):

- **Exists**: `createBackup()`, `listBackups()`, `restoreBackup()`, `validateRestoreCandidate()` —
  all real, all already covered by `erp_059b_durable_audit_tests.js`'s B6/B7 items (restore
  rejection on checksum mismatch / validation failure) since at least Phase 39.
- **Where**: pure backend (`server/domain.js` + 3 routes in `server/server.js`); confirmed by Phase
  40's own source search that **no UI screen or deep-link exists anywhere in `client_secure/
  index.html`** for any of the three routes.
- **Who can invoke it**: `POST /api/admin/backup`, `GET /api/admin/backups`, `POST /api/admin/
  restore`, `POST /api/admin/restore-validate` — all four gated to `['Admin','CEO'].includes(actor.
  role)` at the route layer (`server.js:2627/2632/2636/2645`).
- **Completeness**: `createBackup()` copies the ENTIRE `DB_FILE` (the single JSON file this whole
  system stores everything in — GL, subledgers, masters, attachments, audit log, policy config) —
  a backup is structurally complete by construction, not a partial snapshot.
- **Integrity**: SHA-256 checksum computed and stored in the audit log at creation time;
  `restoreBackup()` re-verifies it against the audit record before restoring (best-effort — skipped
  only when no matching audit record exists, e.g. an externally-supplied file).
- **Restore safety**: `validateDatabaseSnapshot()` structurally checks every array-typed collection
  the CURRENTLY RUNNING schema depends on is present and correctly typed in the snapshot, plus a
  referential spot-check on `journalEntries` — this is the exact mechanism ERP-040 (a prior real
  audit finding) fixed after a "valid-but-incomplete" snapshot was once accepted. A failed check
  aborts with the live database left untouched.
- **Audit trail**: `BackupCreated` and `BackupRestored` audit entries, both including checksum/count
  metadata; rejected restores are recorded via `durableFailureAudit` so they survive transaction
  rollback (an ERP-059B-era fix).
- **Documented**: the mechanism's own code comments are extensive and cite the real prior findings
  (ERP-040, ERP-059B) that shaped it; no separate user-facing runbook exists (disclosed, not
  invented as a problem — see Section 10's classification-not-defect framing).
- **Testable in isolation**: yes — `erp_059b_durable_audit_tests.js` already exercises the rejection
  paths against a disposable instance; this phase will exercise the successful backup→alter→restore
  round trip for the first time.

This baseline records the mechanism as **substantial and already tested for its rejection paths**,
with the successful round-trip and the authorization boundary still to be live-tested this phase
(Sections 11-13).

## Current production-readiness state

Entering Phase 41 with 0 open P0/P1/P2, clean regression, and a mature (if UI-less) backup/restore
mechanism. The remaining question this phase answers is narrowly: can the 3 named coverage items be
closed (or correctly, honestly dispositioned) without introducing any new code beyond what a genuine
defect requires.

## Scope discipline for this phase

Per Section 0: no new modules, no new UI screens built merely to satisfy a checklist (explicitly
including Backup/Restore — Section 10's own instruction), no refactoring, no policy changes. Any
code change this phase will follow the same defect-ID/root-cause/minimal-fix/regression discipline
established in Phases 39-40. No such change is anticipated as of this baseline; it will be recorded
here-forward only if a genuine defect is found.
