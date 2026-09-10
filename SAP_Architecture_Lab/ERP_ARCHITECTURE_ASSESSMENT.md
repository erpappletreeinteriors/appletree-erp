# ERP Architecture Assessment — ERP-001 / ERP-005 / ERP-006

**Date:** 2026-09-10
**Context:** Independent 58-finding audit (NO-GO), remediation session 1.

## The honest architectural conclusion

The current persistence model — the entire application state as one in-memory JavaScript object,
serialized wholesale to a single `db.json` file on every mutating call — **cannot provide real
ACID guarantees across multiple processes**, no matter how much in-process locking is layered on
top of it. This session already found and closed the exact scenario the audit reproduced
(ERP-005 — two processes, same file, one process's write silently lost), but that fix is a
**mitigation** (making the dangerous configuration impossible to start), not a structural cure.
This is stated plainly per this engagement's own instruction: don't hide an architectural problem
behind increasingly complicated locks.

## What's already real, in-process

Before this session, prior phases had already built a surprising amount of genuine transaction
machinery *within a single process*:
- `withTransaction()` — snapshot/rollback boundary around multi-write sequences.
- Write-point guards (`journalEntries`/`inventoryMovements`/`clearings` wrapped in a `Proxy` that
  can throw if mutated outside an active transaction).
- A persisted idempotency ledger (`DB.idempotencyKeys`) preventing duplicate commits from client
  retries.
- Atomic single-file writes (`save()` writes to a temp file, `fsync`s it, then does an atomic
  `rename()` onto `db.json` — so a process crash mid-write can never leave `db.json` itself
  truncated or half-written).

All of this is real and load-bearing for a **single process**. None of it — by construction — is
visible to a *second* process's separate copy of this same module, which is exactly what ERP-005
exploited.

## What this session did (ERP-005 mitigation)

Added `acquireSingleInstanceLock()` in `domain.js`, called at module load, before the first read
of `db.json`:
- Claims an exclusive lock file (`db.json.lock`) using `fs.openSync(..., 'wx')` — the same
  atomic-at-the-OS-level primitive `save()` already relies on for its own rename-based guarantee.
- A second process pointed at the same `db.json` is refused at startup with a clear error naming
  the PID already holding the lock.
- A stale lock left behind by a crashed process (PID no longer running, checked via
  `process.kill(pid, 0)`) is detected and safely reclaimed — a crash never permanently locks out a
  legitimate restart.
- Verified live: a real second OS process was spawned against a running isolated server's
  `db.json` and was refused (see `tests/erp_audit_concurrency_tests.js`).

This closes the *reproduction path* the audit used. It does **not** provide row-level locking,
proper isolation levels, or the ability to safely run more than one process by design.

## Recommended long-term architecture (audit's own Stage 2)

Migrate transactional persistence to **SQLite** (not Postgres) as the correct choice for this
system, because:
- The product's own non-negotiable constraint is **offline-first, single-site, no cloud
  dependency** — SQLite is an embedded, zero-server, single-file database with real ACID
  transactions, proper locking (including cross-process, unlike the current design), and WAL mode
  for concurrent readers. It satisfies every constraint Postgres would require a running server
  process for, without giving up any of the "just works on one machine" property this Lab has
  deliberately preserved through every phase so far.
- `better-sqlite3` is synchronous (matches this codebase's current zero-`await`-in-domain.js
  design almost exactly — see the idempotency-ledger comment in `domain.js` — so the migration
  does not also require a parallel rewrite to async/await throughout).

### Why this is NOT attempted in this session

This is a genuinely large, multi-week undertaking, not a same-session patch:
- ~100+ top-level `DB.*` collections, each currently a plain JS array with ad-hoc `.find()`/
  `.filter()`/`.push()` call sites scattered across an 11,000+ line file.
- Every one of those call sites would need to become a real SQL query or a prepared statement.
- The 3 write-point-guarded collections' Proxy mechanism, `withTransaction()`'s snapshot/rollback,
  and the idempotency ledger would all need to be re-expressed in terms of real SQL transactions
  (`BEGIN`/`COMMIT`/`ROLLBACK`) rather than JS object snapshots — conceptually simpler with a real
  database, but every call site touching those 3 collections needs to change.
- A full data migration tool would be needed (JSON → SQLite tables), with count/checksum
  verification before any cutover, plus a tested rollback path.

Attempting this in the same session as the P0 validation fixes would risk exactly what this
engagement has explicitly warned against — a blind, high-blast-radius rewrite with no isolated
proof of correctness before touching the thing the business actually runs on.

### Recommended migration plan (phased, for a dedicated future session)

1. **Schema design** — one SQLite table per current `DB.*` collection, columns matching current
   object shape; preserve every existing ID exactly (no re-numbering).
2. **Migration tool** — a one-way JSON → SQLite import script with record-count verification per
   table, checksum of migrated totals (JE debit=credit, inventory qty sums) against the source
   JSON, and a dry-run mode that reports without writing.
3. **Data-access layer swap, module by module** — start with the 3 already-guarded collections
   (`journalEntries`, `inventoryMovements`, `clearings` — highest blast radius, already isolated
   behind a small number of write points), converting their reads/writes to real SQL inside real
   transactions, while every OTHER collection stays exactly as-is (still JS arrays in the same
   `db.json`, still working, via a **hybrid** period where both stores coexist). This lets the
   highest-risk collections get real ACID protection first without a single flag-day cutover of
   the entire file.
4. **Remaining collections, in blast-radius order** — masters (customers/vendors/materials) next,
   then the rest.
5. **Retire `db.json` for anything except backups** — once every collection has migrated, `db.json`
   becomes purely an export/backup format (still fully offline, still a single portable file for
   backup/restore), not the live store.
6. **Rollback plan at every stage** — the JSON-based store must remain the fallback until its
   SQLite replacement has run in parallel and reconciled clean for a full real business cycle.

Until this migration happens, the honest operational constraint is: **run exactly one
`server.js` process per `db.json`** (now enforced automatically by the ERP-005 lock) and do not
attempt to scale this deployment horizontally.

## ERP-006 (full-snapshot save cost)

Same root cause as ERP-001 — `save()` re-serializes the *entire* `DB` object on every mutating
call. The audit's own measured figures (526ms at 100k journal entries) are real and not disputed.
This is resolved as a byproduct of the SQLite migration above (a real database only writes the
changed rows, not the whole store) and is not independently fixable without that migration —
patching `save()` to do partial writes against a single JSON file would reintroduce exactly the
partial-write corruption risk the current atomic-rename design was built to prevent.
