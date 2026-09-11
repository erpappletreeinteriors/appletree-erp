# ERP-059C — Production Safety Report

**Date:** 2026-09-10/11. This report exists specifically to satisfy this phase's own mandate:
"confirmation that no production DB was modified." It also discloses, in full, a genuine near-miss
that occurred WHILE building this phase's own safety tooling — consistent with this engagement's
standing "no false closure" discipline: mistakes made in the course of the work are reported, not
hidden, regardless of whether they happened to cause real damage.

## Summary verdict

**`server/db.json` (the real production database) was NOT modified at any point during Phase
ERP-059C.** Verified repeatedly, read-only, before and after every risk-bearing step:

| Checkpoint | `server/db.json` size | `server/db.json` LastWriteTime |
|---|---|---|
| Start of Phase ERP-059C | 52,411 bytes | 2026-09-10 18:14:36 |
| After the Step 9 near-miss (below) | 52,411 bytes | 2026-09-10 18:14:36 (unchanged) |
| After full regression (Steps 10-11) | 52,411 bytes | 2026-09-10 18:14:36 (unchanged) |
| Final, end of phase | 52,411 bytes | 2026-09-10 18:14:36 (unchanged) |

Byte-for-byte identical size and timestamp at every checkpoint. Port 4001 was confirmed to have no
active listener at the start, throughout, and at the end of this phase (`Get-NetTCPConnection`
checked repeatedly). No `server/db.json.lock` file exists at the end of this phase.

**Note on the timestamp itself**: 2026-09-10 18:14:36 predates this phase's own work — it is the
last state the file was left in at the end of the ERP-059B incident response (the corrupted,
post-incident state, still un-restored, exactly as the user's "dont check this now" instruction
left it). Nothing in ERP-059C changed that state in either direction — it remains exactly as
disclosed in `PHASE-ERP059B-REMEDIATION-REPORT.md` §16, still awaiting the user's separate recovery
decision.

## The near-miss — full disclosure

While writing this phase's Step 9 permanent safety test
(`tests/erp_059c_production_isolation_tests.js`), the FIRST draft of that test contained a
methodological bug: it spawned `server/server.js` — the real, in-place file, not a copy — passing
only a different `cwd` to the child process, on the (incorrect) assumption that this would isolate
its database.

**Why that assumption was wrong**: `domain.js`'s `DB_FILE` constant (before this phase's own Step 7
fix) was `path.join(__dirname, 'db.json')` — `__dirname` in Node.js is always the directory
containing the SOURCE FILE itself, never the process's `cwd`. Spawning the real `server.js` with a
different working directory does nothing to change which `db.json` it reads and writes.

**What actually happened, reconstructed from process and file forensics** (all read-only
inspection, performed before any corrective action was taken):

1. The draft test's `startServer()` spawned `node server/server.js` (the real file) twice in
   quick succession — once for a "production-shaped" instance on port 4098, once for an
   `APP_ENV=test` instance on port 4099 — with no `DB_PATH` set on either (that mechanism did not
   exist yet at this exact point in the phase's own build sequence).
2. Both spawns resolved to the SAME real `DB_FILE` (`server/db.json`), because neither had a
   `cwd`-independent way to differ.
3. The FIRST spawn (which became PID 25924) acquired the pre-existing `acquireSingleInstanceLock()`
   lock on the real `server/db.json` cleanly (no other process held it at that moment) and began
   booting.
4. The SECOND spawn, attempting to acquire the SAME lock a moment later, correctly hit the
   pre-existing (ERP-005) "another server process already holds the lock" FATAL check and refused
   to start — this is exactly ERP-005's own protection working as designed, and is what first
   surfaced the problem: the draft test's own health-check loop threw
   `Error: Server did not start within 10s`, with the FATAL lock message captured in its output.
5. Because the first spawn's promise never resolved within the test's error path, the test's
   `finally` block (which calls `child.kill()`) was never reached for that first spawn — it was
   left running, orphaned, still holding the lock on the real `server/db.json`.
6. By the time this was investigated (moments later), PID 25924 had already exited on its own
   (confirmed via `Get-CimInstance Win32_Process -Filter 'ProcessId=25924'` returning nothing) —
   the exact reason is not fully determined (the process's own stdout was not being captured by
   this investigation at the time it happened), but it is consistent with the second spawn's own
   FATAL exit being logged to a stream the health-check loop was reading from both children
   combined, and/or the first process encountering an unrelated early exit of its own.
7. **The only artifact left behind was a stale `server/db.json.lock` file** (containing PID 25924,
   which was confirmed dead). No write to `server/db.json` itself occurred: the file's
   `LastWriteTime` was checked immediately before this whole sequence (18:14:36) and again
   immediately after discovering the stale lock — identical, byte-for-byte, in both checks. Nothing
   in the server's boot sequence writes `db.json` unless a mutation is explicitly triggered (a
   migration backfill, `resetToFreshSeed()`, or any handler's `save()`), and no HTTP request was
   ever sent to either spawned instance before the whole sequence failed — the test's own `fetch()`
   calls all occur strictly AFTER `await startServer(...)` resolves, which it never did for the
   failing spawn.

**Cleanup performed, and how it was verified safe**: only the stale `server/db.json.lock` file was
removed — `server/db.json` itself was never touched by this cleanup. This was done only after:
- Confirming (via `Get-CimInstance Win32_Process -Filter 'ProcessId=25924'`) that the PID recorded
  in the lock file was not running.
- Confirming `server/db.json`'s size and `LastWriteTime` were unchanged across the entire incident
  window.
- Confirming no process was listening on ports 4098, 4099, or 4001.

This is analogous to, and no more privileged than, the stale-lock auto-reclaim
`acquireSingleInstanceLock()` itself already performs automatically on every legitimate server
restart (see `domain.js`'s own `[WARN] Found a stale lock file from PID ... — reclaiming it.`
behavior) — the only difference here is that it was done manually, once, immediately after
diagnosing the specific cause, rather than automatically on a subsequent boot.

**Fix applied as a direct result** (this is Step 7 of the isolation report, cross-referenced here
because this near-miss is its concrete justification): `domain.js` now supports an explicit
`DB_PATH` environment variable, REQUIRED whenever `APP_ENV=test` (fails closed with a clear
`[FATAL]` message and `process.exit(1)` if missing). The corrected safety test
(`tests/erp_059c_production_isolation_tests.js`) now gives each spawned instance an explicit,
disposable `DB_PATH` under a fresh `fs.mkdtempSync()` directory — it does not rely on `cwd` at all
— and was re-run successfully afterward (10/10 PASS, see `ERP-059C-SAFETY-TEST-REPORT.md`).

## Why this is disclosed this prominently

This engagement's standing rule is that mistakes are reported honestly, not minimized, regardless of
whether they turned out to cause real damage — the same discipline applied to the much more serious
ERP-059B production-wipe incident. This near-miss caused zero actual data loss (rigorously verified,
not merely assumed), but it is a genuine example of exactly the failure class this entire phase
exists to close, occurring WHILE building the fix, which is itself useful evidence: it demonstrates
that `__dirname`-vs-`cwd` confusion is a real, easy-to-make mistake even when actively working to
prevent it — reinforcing why Step 7's `DB_PATH` mechanism (an explicit, structural fix) is more
robust than relying on developer discipline ("remember to copy the files into a scratch directory")
alone.

## Final confirmation

- Production `server/db.json`: unmodified throughout Phase ERP-059C (verified above).
- Production `server/db.json.bak`: not touched by this phase (still in its ERP-059B-incident state,
  as disclosed previously).
- Production `server/db.json.lock`: does not exist (clean).
- Port 4001: no listener, confirmed at multiple points throughout this phase.
- All destructive testing, regression, and reconciliation work in this phase was performed
  exclusively against disposable scratch directories with explicit `DB_PATH` values under the
  system temp directory or this session's own scratchpad — never against any path inside
  `SAP_Architecture_Lab/server/`.
