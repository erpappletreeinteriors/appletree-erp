# ERP-059B — Transaction Design: Durable Failure Audit

**Date:** 2026-09-10. Part 1-4 and 14 of Phase ERP-059B. Written before any code change.

## What exists today (inspected fresh, not assumed from memory)

- **`withTransaction(actor, options, handler)`** (`domain.js`) — the single authoritative
  snapshot/rollback boundary. Takes a full `JSON.parse(JSON.stringify(DB))` snapshot before
  `handler()` runs. On `result.ok===false` (a plain rejection, no throw), it unconditionally does
  `DB = installWriteGuards(_snapshot); _invalidateReportingCaches(); save();` and returns `result`
  — every mutation the handler made, INCLUDING any `logAudit()` call it made along the way, is
  discarded and the pre-transaction state is written back to disk. On a thrown exception, the same
  restore happens, plus a `TransactionRolledBack` audit entry (logged AFTER the restore — this is
  the existing precedent this phase's mechanism follows).
- **`registerMutationRoute()` / `dispatchMutationRoute()`** (`server.js`) — the modern route
  framework. Every registered route's handler runs inside `D.withTransaction()`. Separately,
  `auditReject:true` makes `dispatchMutationRoute()` log a generic `BusinessRuleRejected` entry
  (path/method/error only) **after** `withTransaction()` has already returned — i.e., genuinely
  outside the rolled-back boundary, which is why it reliably survives today. This is real,
  working precedent that a mutation logged *after* the transaction boundary closes survives; it
  just can't carry per-handler business detail (`poId`, `entryId`, etc.) because it's written from
  outside the handler's own scope.
- **`logAudit(entry)`** (`domain.js`) — pushes one row to `DB.auditLog` and calls `save()`
  internally; it never throws (catches its own errors, logs to console). This is the exact
  function every existing audit call site in this codebase already uses — this phase's mechanism
  reuses it verbatim, it does not invent a second audit-writing path.
- **The 12 affected sites** (re-confirmed by code reading, not re-typed from the prior phase's
  notes) all share one additional, load-bearing property: **at the point each one calls
  `logAudit({type:'...Rejected',...})`, no OTHER mutation has happened yet** — every one of them
  is a pure validation/read-only check (a `.find()`, a status comparison, an authorization check,
  or — for the GL-posting-failure group — a `postJournalEntry()` attempt that itself commented
  "Nothing has been written yet" on failure) followed immediately by the audit call and the
  `return {ok:false, ...}`. This is why the fix below is sufficient and safe for all 12: there is
  no OTHER business mutation at risk of leaking through alongside the audit event, because none
  exists at that point in any of these functions.

## Design questions answered

**1. What exactly rolls back?** Everything, as today — the full snapshot restore in
`withTransaction()`'s `result.ok===false` branch is completely unchanged. No handler's business
mutation is exempted from rollback by this mechanism.

**2. What exactly survives?** Exactly one thing, and only if the handler explicitly provides it:
a plain object attached to the failure result under a new, reserved field —
`result.durableFailureAudit`. Nothing else on `result`, and nothing the handler wrote to `DB`
before failing, survives.

**3. How is persisted audit data represented?** As a normal row in `DB.auditLog`, written via the
existing `logAudit()` function — same shape, same collection, same retrieval (`GET
/api/audit-log`) as every other audit entry in this codebase. No new storage mechanism.

**4. Can arbitrary business mutations accidentally survive?** No. The snapshot restore
(`DB = installWriteGuards(_snapshot)`) always runs FIRST, unconditionally, before the
`durableFailureAudit` payload is ever looked at. By the time `logAudit()` is called, `DB` is
already the pre-transaction state — there is no window where a handler's own business mutation
(a `DB.grns.push(...)`, a `DB.journalEntries.push(...)`, etc.) coexists with the durable audit
write. The mechanism only ever adds ONE new row to ONE collection (`DB.auditLog`) to a DB that has
already been fully reset.

**5. Can GL mutations survive a failed transaction?** No — `DB.journalEntries` is restored to the
snapshot exactly as before this phase; nothing about this mechanism touches that collection.

**6. Can inventory mutations survive?** No — same reasoning, `DB.inventoryMovements` is restored
exactly as before.

**7. Can master-data mutations survive?** No — `DB.users`/`DB.vendors`/`DB.materials`/etc. are all
restored exactly as before; only `DB.auditLog` ever receives a new row from this mechanism.

**8. Can restore mutations survive?** No — for the two `RestoreRejected*` sites, the failure
happens BEFORE `DB = installWriteGuards(restored)` is ever assigned in `restoreBackup()` itself; by
definition there is no restore-mutation for this mechanism to interact with at all at that point.

**9. Can audit evidence itself be duplicated?** Only if the SAME failing request is genuinely sent
twice (a real client retry, or two genuinely concurrent identical requests) — each such attempt is
a real, distinct rejection event and this phase's design records each one once, deliberately (see
Part 9 test results in the regression report — this is an explicit policy decision, not an
accident, documented there).

**10. How does this map to eventual SQLite transactions?** Cleanly — this design is already
structured as two logically separate concerns that a real database's own transaction model
naturally supports: (a) the BUSINESS TRANSACTION (the handler's own mutations, `BEGIN`/`ROLLBACK`
in SQL terms), and (b) a DURABLE AUDIT RECORD insert that happens *after* that rollback completes,
in its own separate, always-committed statement (or, in SQL terms, an `INSERT` issued outside the
rolled-back transaction, or via `PRAGMA` savepoint semantics / a separate connection). Nothing in
this design depends on JSON-specific behavior (the `JSON.parse(JSON.stringify(DB))` snapshot
mechanism is *itself* JSON-specific, but that is pre-existing to this phase and unchanged by it) —
the `durableFailureAudit` field is a plain, small, serializable object with no coupling to how the
snapshot/restore happens to be implemented today.

## Preferred mechanism (implemented in Part 5)

```js
// withTransaction()'s existing result.ok===false branch, extended:
if(result && result.ok === false){
  DB = installWriteGuards(_snapshot);
  _invalidateReportingCaches();
  // ERP-059B — durable failure audit. See ERP-059B-TRANSACTION-DESIGN.md. A handler MAY attach
  // EXACTLY ONE explicit, named payload to its ok:false result via `durableFailureAudit` — this
  // is the ONLY thing that can survive the rollback above: it is written via the SAME logAudit()
  // every other audit trail already uses, AFTER DB has already been restored to its pre-
  // transaction snapshot, so no business mutation the handler made can ever ride along with it.
  // A handler that omits durableFailureAudit behaves exactly as before this phase.
  if(result.durableFailureAudit && typeof result.durableFailureAudit === 'object'){
    logAudit({...result.durableFailureAudit, userId: actor && actor.id, role: actor && actor.role});
  }
  save();
  return result;
}
```

`logAudit()` never throws and already calls `save()` internally; the trailing `save()` (already
present in the existing code, unconditionally) is kept as a defensive belt-and-suspenders write in
case the `durableFailureAudit` branch didn't run — this exactly matches the existing code's own
style elsewhere in this file (e.g. the login route calls `save()` twice per branch).

**Why not Option A (route exclusion) for these 12, and not a free-form "persist anything"
mechanism:** the brief is explicit that login's fix must not be duplicated here and that arbitrary
mutation must never be allowed through. Excluding 12 more routes from `withTransaction()` would
mean 12 more places where the atomicity guarantee is *entirely* absent for ANY mutation those
handlers might make — safe today only because none of them currently mutate anything else before
failing, but a fragile invariant to rely on forever. The `durableFailureAudit` field is narrow by
construction: it is a plain data object copied into a `logAudit()` call, never `eval`'d, never used
to address an arbitrary collection, never given write access to anything but one row of
`DB.auditLog`. A future handler CANNOT accidentally "persist" a business mutation through this
mechanism no matter what it puts in the field — the field has no mechanism to write anywhere else.

## Reserved field contract

- `result.durableFailureAudit` — optional. If present, must be a plain object; every property on
  it is copied verbatim into the `logAudit()` call (so it should contain exactly the same shape
  every other `logAudit({type:'X', ...})` call in this codebase already uses: a `type`, and
  whatever contextual IDs/reasons are relevant — see Part 4 below for what each of the 12 sites
  actually sends).
- `userId`/`role` are ALWAYS taken from the real, authenticated `actor` passed into
  `withTransaction()` itself — never from the handler's payload — exactly matching how every other
  audit call in this codebase derives identity (never client-supplied), closing off any path for a
  handler to forge or omit who performed the rejected action.

## Part 4 — Security/audit contract per site (what is safe to persist)

Every one of the 12 sites' existing `logAudit({type:'...Rejected', ...})` calls was already
reviewed line-by-line during the Phase ERP-059A blast-radius classification. None of them include
a password, password hash, salt, session token, or raw unvalidated request body — each already
sends only specific, named, contextual fields (a document ID, a material ID, a reason string, a
GL-failure error message, an attempted username/name — never a password). Part 5 migrates these
exact same field sets into the new `durableFailureAudit` object verbatim; **no site's persisted
field set changes as part of this migration**, only WHERE that payload is attached (to the return
value, not a direct `logAudit()` call mid-handler).
