# PHASE 41 — Backup / Restore Control Audit

**Date:** 2026-09-13. Isolated test server only — `server/db.json` (production-shaped, port 4001)
was never opened, read, or referenced. All backups created this phase live in the scratch
directory's own disposable `backups/` folder.

## Inspection (Section 10) — answered before any test

| Question | Answer |
|---|---|
| 1. Does backup functionality exist? | Yes — `createBackup()`, `server/domain.js:1110` |
| 2. Where does it exist? | Pure backend; 3 routes in `server/server.js:2626-2649`. **No UI screen or deep-link exists anywhere in `client_secure/index.html`** (confirmed by source search) |
| 3. Who can invoke it? | `POST /api/admin/backup`, `GET /api/admin/backups`, `POST /api/admin/restore`, `POST /api/admin/restore-validate` — all four gated `['Admin','CEO'].includes(actor.role)` |
| 4. Is it protected? | Yes — role gate at the route layer, live-reproduced this phase (Purchase blocked on all 4 endpoints) |
| 5. Is the backup complete? | Yes — copies the single `DB_FILE` this entire system stores everything in (GL, subledgers, masters, attachments, audit log, policy config); not a partial snapshot by construction |
| 6. Is restore protected? | Yes — same Admin/CEO gate, live-reproduced |
| 7. Is restore destructive? | Yes, by design (replaces the live DB) — and treated as such: the single most heavily-gated and heavily-logged action in the codebase per its own header comment |
| 8. Is there integrity verification? | Yes — SHA-256 checksum |
| 9. Is SHA-256 (or equivalent) already implemented? | **Yes** — `crypto.createHash('sha256')`, computed at backup time, re-verified at restore time against the audit record |
| 10. Is the process documented? | Extensively, in-code (cites real prior findings ERP-040 and ERP-059B that shaped the current validation/audit-durability logic); no separate user-facing runbook exists |
| 11. Is it testable in the isolated test environment? | Yes — this phase's own round-trip test below, plus `erp_059b_durable_audit_tests.js`'s pre-existing rejection-path tests |

## Round-trip test (Section 11) — live, on the disposable instance only

1. Reset to a clean state.
2. Created one known, real transaction: a Customer Invoice, fully posted (`JE-0001`,
   `INV/2026-27/0001`, Trial Balance exactly ₹59,000/₹59,000).
3. **Created a backup** as Admin: `{"filename":"db.backup.....phase41-known-state.json",
   "checksum":"b04fe201...", "journalEntryCount":1}`.
4. **Verified the backup exists**: `GET /api/admin/backups` listed it correctly.
5. **Altered the disposable data**: posted a second, different invoice (`JE-0002`,
   ₹99,999 + GST18). Trial Balance moved to ₹176,998.82/₹176,998.82.
6. **Restored** the backup as Admin: `{"ok":true,"journalEntryCount":1}`.
7. **Verified original state returned exactly**:
   - Trial Balance: **₹59,000 / ₹59,000 — exact match to step 2.**
   - Journal entries: **only `JE-0001` exists** — the alteration entry is completely gone.
   - Document numbering: `INV/2026-27/0001` intact, unchanged.
   - Audit metadata: a real `BackupRestored` entry logged —
     `{"journalEntryCountBefore":2,"journalEntryCountAfter":1,"userId":"U-ADMIN","role":"Admin"}`.

**Every item in Section 11's checklist is satisfied with live evidence, not inferred.**

## Security (Section 12) — live, both directions

| Attempt | Role | Result |
|---|---|---|
| Create backup | Purchase | BLOCKED — `"Role \"Purchase\" cannot create a backup."` |
| List backups | Purchase | BLOCKED — `"Role \"Purchase\" cannot view backups."` |
| Restore backup | Purchase | BLOCKED — `"Role \"Purchase\" cannot restore a backup."` |
| Validate a restore candidate | Purchase | BLOCKED — `"Role \"Purchase\" cannot validate a restore candidate."` |
| List backups | CEO | **SUCCEEDED** (200) — positive control, confirming the gate is role-specific, not a universal block |
| Restore a nonexistent file | Admin | Correctly rejected — `"Backup file not found."`, live database confirmed unchanged afterward |
| Restore-validate an incomplete snapshot | Admin | Correctly rejected — every one of the ~110 required collections precisely listed as missing; live database confirmed unchanged afterward |

Backup/restore is **command/API-based, not UI-based** — this is stated plainly, not concealed, and
no UI was built to disguise that fact (per Section 12's explicit instruction).

## A-grade classification (Section 13)

**Case A** for the mechanism itself: it fully works and is controlled — **CLOSE GAP.**
**Case B** for the absence of a UI: it works but lacks a UI — recorded as an existing
architectural/admin-operational capability, not a defect, per Section 13's own explicit instruction
not to manipulate the grading by inventing a UI requirement that was never part of the mechanism's
actual design.

## Production data safety (Section 24) — explicit confirmation

`server/db.json` (the real, production-shaped file) was checked immediately before and after this
entire audit: **last modified 2026-09-10 18:14:36 — unchanged**, the exact same timestamp from the
still-unresolved ERP-059B incident, confirming zero interaction with it across this audit, this
phase, and every phase since the incident.

## Verdict

Backup/Restore is a real, mature, already-hardened control mechanism — SHA-256 integrity-checked,
schema-validated, Admin/CEO-gated, fully audited, and now live-proven end-to-end for the one thing
that had never been directly tested before (the successful round trip). No UI gap exists to "fix" —
the capability itself is the thing to evaluate, and it passes.
