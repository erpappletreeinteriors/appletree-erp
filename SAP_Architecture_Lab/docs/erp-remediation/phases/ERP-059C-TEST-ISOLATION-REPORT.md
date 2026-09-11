# ERP-059C — Production / Test Isolation & Destructive-Test Safety Hardening — Test Isolation Report

**Date:** 2026-09-10/11. Steps 1-8 of Phase ERP-059C. Scope: eliminate the possibility that a test
can accidentally target the production ERP, per the incident disclosed in
`PHASE-ERP059B-REMEDIATION-REPORT.md` §16.

## Step 1 — Forensic precheck findings

Read before any code change: `PHASE-ERP059B-REMEDIATION-REPORT.md`, `ERP-059B-TRANSACTION-DESIGN.md`,
`ERP-059B-DURABLE-AUDIT-TEST-REPORT.md`, `ERP_FINDING_REGISTER.csv`, `server/server.js`,
`server/domain.js`, `server/auth.js`, `server/route_safety_scanner.js`, `.claude/launch.json`.

1. **Zero environment-variable infrastructure existed anywhere in this codebase.** No
   `process.env`/`NODE_ENV`/`APP_ENV` reference in any of the 4 server source files.
2. **`PORT` was a hardcoded literal** — `server.js:21`, `const PORT = 4001;` — no override path.
3. **`DB_FILE` was hardcoded relative to `__dirname`** — `domain.js:74`,
   `path.join(__dirname, 'db.json')`. This is why the established "copy source files into a scratch
   directory" pattern worked at all — but nothing made that requirement explicit or enforced.
4. **All 8 mutating test/demo endpoints were gated by Admin role ONLY, never by environment**:
   `/api/test/reset`, `/api/test/set-fault`, `/api/test/set-crash`,
   `/api/test/set-enforce-transaction-boundary`, `/api/test/set-skip-rollback`,
   `/api/demo/seed-scenario`, `/api/test/backdate-ticket`, `/api/test/backdate-visit`.
   (`/api/test/architectural-violations` is GET/read-only — out of scope.) The underlying
   `domain.js` setters (`setTestFaultPoint`, `setTestCrashPoint`, `setSkipRollbackForBeforeTest`)
   have no gating of their own — Admin-role-at-the-route was the only control, and Admin is an
   ordinary production role.
5. **Root cause of the incident, at the exact line**: `server/after_sales_tests.js:12` —
   `await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');` — the first
   line of `main()`, against a hardcoded `BASE = 'http://localhost:4001'`.
6. **The hardcoded-port defect was far larger than the known "26-file suite."**
   `grep -l "localhost:4001" server/*.js` returned **58 files** in `server/` alone — every
   phase-numbered test/volume/UAT file from Phase 9b through Phase 34, all using the byte-identical
   line `const BASE = 'http://localhost:4001';`. `HANDOVER_PACKAGE/03_TESTS/` holds an identical
   26-file subset (confirmed byte-identical via `diff`). **8 frozen `PHASE*_CHECKPOINT/`
   directories** (27, 28, 30, 32, 33, 34, 35, 36) each contain a full historical snapshot of
   `server/`, including their own hardcoded-4001 `server.js` — several hundred additional files
   carrying the identical pattern.
7. **`.claude/launch.json`'s `sap-lab-secure` entry launches `server/server.js` on port 4001** — the
   repo's own dev-preview tooling boots the identical process, port, and database as "production."
   There was no structural distinction between "dev preview" and "production" — they are the same
   process by construction.
8. The newer `tests/erp_059*` and `tests/erp_audit_p0_tests.js` files already used a safer, partial
   pattern (`process.argv[2] || 'http://localhost:409X'`) — parameterized but still silently falls
   back to a hardcoded default if the argument is omitted. Same anti-pattern in spirit, different
   port, not the incident's own defect class.

**Scope decision, stated before coding**: the officially-named 26-file suite (both `server/*.js` and
`HANDOVER_PACKAGE/03_TESTS/*.js`, byte-identical, both live/runnable locations) was migrated, PLUS
all 32 additional hardcoded-4001 files discovered in `server/` beyond that list (58 files total) —
Step 1 explicitly said not to assume the known 26 was the complete set, and it was not. The 8 frozen
`PHASE*_CHECKPOINT/` snapshots were **not** edited — rewriting historical point-in-time archives
would defeat their purpose as an audit trail, and the volume (several hundred files) is
disproportionate to this phase's scope. Their residual risk is documented in §"Residual risks"
below, not fixed. The server-side `APP_ENV` guard (Steps 3-4) is the real backstop regardless of
what any test file does, and only needs to exist in the one `server.js` that actually runs as
production.

## Step 2 — Base URL configuration

- `TEST_BASE_URL` is now the single, explicit test-target configuration mechanism for every
  migrated file. No file silently defaults to production port 4001.
- Missing `TEST_BASE_URL` causes a clear, synchronous failure:
  `const BASE = process.env.TEST_BASE_URL || (() => { throw new Error('TEST_BASE_URL is not set. ...'); })();`
- Every migrated file prints its target (`console.log('[TEST TARGET]', BASE)`) before doing
  anything else.
- No test infers its target from arbitrary running processes — the only source of truth is the
  environment variable.
- Existing tests that already took a `process.argv[2]`/serverDir argument (`erp_059_*`,
  `erp_audit_*`) were preserved as-is (compatibility) except where Step 3's `APP_ENV` gate broke
  their own server-spawn helper (see `erp_059_restart_persistence_tests.js` fix, §Step 8 below).

Verified via a repo-wide re-search after migration: zero remaining executable
`const BASE = 'http://localhost:4001'` anywhere in `server/` or `HANDOVER_PACKAGE/03_TESTS/` (the
only remaining "4001" hits are inside explanatory comments this phase added, plus one pre-existing,
harmless header comment in `security_tests.js`).

## Step 3 — Environment identity

`server/server.js`:
```js
const APP_ENV = process.env.APP_ENV || 'production';
const IS_TEST_ENV = APP_ENV === 'test';
```
- `production`, `test`, `development` are all valid values a deployer could set; only the literal
  string `'test'` enables destructive endpoints.
- **Fails closed by design**: an absent `APP_ENV`, an unrecognized value, and `'development'` are
  all treated identically to `'production'` for the purposes of destructive-endpoint gating. A
  bypass for "localhost" or for "development" was deliberately NOT built — the incident server was
  itself an unflagged, ordinary, localhost-bound process, indistinguishable from a disposable test
  server by port or address alone. Building a `development`-tier bypass would recreate exactly that
  ambiguity.
- `PORT` gained an optional override (`process.env.PORT || 4001`) so isolated servers can be started
  without editing the file; the default is unchanged, so an existing deployment that never sets
  `PORT` keeps listening on 4001 exactly as before.

## Step 4 — `/api/test/reset` (and the other 6) safety guard

A dedicated `denyDestructiveTestEndpoint(res, actor, pathname)` helper (NOT a reuse of the generic
`deny()`, see design note below) was placed as the FIRST check — before the pre-existing Admin-role
check — on all 7 genuinely test-only destructive endpoints:

```
/api/test/reset
/api/test/set-fault
/api/test/set-crash
/api/test/set-enforce-transaction-boundary
/api/test/set-skip-rollback
/api/test/backdate-ticket
/api/test/backdate-visit
```

**Why not the plain `deny()` helper**: `deny()` writes its audit entry via a direct `D.logAudit()`
call BEFORE the response is sent. Every one of these endpoints is a legacy-dispatched mutating
route, reached from inside the outer `D.withTransaction()` wrapper in `server.js`'s request
handler — so a direct `logAudit()` call there would itself be silently rolled back on rejection,
the EXACT defect class ERP-059B closed for the 12 business-rule sites. `denyDestructiveTestEndpoint`
instead reuses the already-proven `durableFailureAudit` mechanism: the rejection's audit record
rides on the JSON response body itself (`{ok:false, error, durableFailureAudit:{type:
'DestructiveTestEndpointBlocked', path, appEnv}}`), which the ERP-059B-fixed legacy-dispatch wrapper
forwards verbatim as the transaction result — no new mechanism, no secrets in the payload (path +
configured `APP_ENV` only).

`/api/demo/seed-scenario` was deliberately left OUT of this guard — see the inline code comment and
§"Scope question left open" below.

**Required behaviors, all live-verified** (see `ERP-059C-SAFETY-TEST-REPORT.md` for the full test
evidence):
1. `APP_ENV=test` + valid Admin session → reset permitted (200).
2. `APP_ENV` unset (fail-closed default = production-shaped) → reset rejected (403), even with a
   valid Admin session — this is the exact incident precondition, now blocked.
3. Every other destructive endpoint is rejected the same way, not just `/api/test/reset`.
4. Rejection is durably audited, attributed to the real actor (`userId`/`role` always taken from the
   authenticated `actor`, never from the request body).
5. Normal application endpoints are completely unaffected (no over-blocking).

An additional, explicit request-level authorization token/capability (beyond `APP_ENV=test` itself)
was considered per the brief's "if this can be implemented safely without broad scope" clause and
NOT added — `APP_ENV` is itself the capability boundary here (it is process-level, set once at
server start, not per-request), and adding a second per-request secret would either have to be a
hardcoded shared value (weak) or a new credential-management surface (real scope creep for a phase
explicitly bounded to isolation, not authentication redesign).

## Step 5 — Test target preflight guard

Two layers, both live-verified:

1. **`GET /api/system/environment`** (new, unauthenticated, read-only) — `server.js`, right after
   `/api/logout`, before the "everything below requires a valid session" boundary. Returns
   `{ok:true, appEnv, destructiveTestEndpointsEnabled}`. Deliberately unauthenticated: a preflight
   guard must be able to confirm "this is NOT a test target" BEFORE attempting any login, matching
   how the incident itself happened before any credential check could have mattered. No secret is
   exposed — the same two fields this phase already prints unconditionally to the server's own
   console at every boot.
2. **A self-contained preflight function, inlined into every migrated test file** (not required
   from a shared module — see rationale in §Step 8): calls the endpoint above and refuses to
   proceed (`process.exit(1)`, with a clear diagnostic) unless `appEnv === 'test'` AND
   `destructiveTestEndpointsEnabled === true`. No heuristic on port number or "localhost" is used
   anywhere — the guard only trusts the server's own explicit, authoritative self-report.

DB path was deliberately NOT exposed over this unauthenticated diagnostic endpoint (a raw filesystem
path returned to an unauthenticated caller was judged an unnecessary information exposure for the
marginal benefit); DB isolation is instead handled structurally by the new `DB_PATH` mechanism
(Step 7), which a test's own launcher controls directly rather than needing to read it back from the
target.

## Step 6 — Server startup safety

`server.js`'s `server.listen()` callback now unconditionally prints (production included, not
test-only — the incident's own server had nothing distinguishing it at a glance, which this phase
treats as the actual defect to fix):

```
[Phase 6A] Appletree SAP Lab secure server listening on http://localhost:<port>
[ERP-059C] APP_ENV=<value>
[ERP-059C] Database path: <resolved DB_FILE>
[ERP-059C] Destructive test endpoints (ENABLED|DISABLED): <the 7 endpoint list>
[ERP-059C] Process PID: <pid>
[ERP-059C] Running as PRODUCTION. Destructive test endpoints DISABLED regardless of port or role.
   -- or --
[ERP-059C] APP_ENV is not 'test' — destructive test endpoints DISABLED (fail-closed default). ...
```

No secret is ever printed (APP_ENV, port, DB path, PID, and an enabled/disabled flag are the only
new fields; none of them are credentials).

## Step 7 — Database path protection

**A genuine near-miss surfaced while building this exact step — see
`ERP-059C-PRODUCTION-SAFETY-REPORT.md` for the full account.** In short: an early draft of this
phase's own Step 9 safety test spawned `server/server.js` **in place**, only changing the child
process's `cwd`, wrongly assuming that would isolate its database. It does not — `DB_FILE` resolves
relative to `domain.js`'s own `__dirname`, never `cwd` — so that draft briefly became a real server
process bound to the REAL `server/db.json`. It crashed on its own before any HTTP request was ever
sent to it (no data was written, confirmed via unchanged file timestamp/size before and after); a
stale lock file was the only artifact left behind, and was removed after read-only verification that
its owning PID was dead. This is exactly the class of mistake Step 7 exists to make structurally
impossible, and it is now the concrete justification for the fix below (found DURING this phase, not
before it).

`domain.js` now supports an explicit `DB_PATH` environment variable:
```js
const DB_FILE = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : (() => {
      if(process.env.APP_ENV === 'test'){
        console.error('[FATAL] APP_ENV=test but DB_PATH is not set. ...');
        process.exit(1);
      }
      return path.join(__dirname, 'db.json');
    })();
const DB_DIR = path.dirname(DB_FILE);
const BACKUP_DIR = path.join(DB_DIR, 'backups');
const LOCK_FILE = path.join(DB_DIR, 'db.json.lock');
```
- Any `APP_ENV=test` instance now MUST be given an explicit, disposable `DB_PATH` — it no longer
  silently falls back to whatever `db.json` happens to sit next to the source file, which could be
  the real one. This closes the exact mechanism of both the original incident and this phase's own
  near-miss.
- Production behavior is unchanged: when `APP_ENV` is not `'test'`, `DB_PATH` remains optional and
  the pre-existing default (`path.join(__dirname, 'db.json')`) is preserved exactly, so an existing
  production deployment that never sets `DB_PATH` keeps working identically.
- `BACKUP_DIR`/`LOCK_FILE` now derive from the resolved `DB_FILE`'s own directory, not always
  `__dirname` — so a `DB_PATH`-isolated test instance also gets isolated backups and its own lock
  file, not just its own primary database.
- The historical "copy the 4 source files into a scratch directory" pattern this whole engagement
  has used remains valid and unaffected (copying naturally isolates `__dirname`-derived paths too),
  but `DB_PATH` now lets an isolated instance be created WITHOUT copying files at all, which is both
  simpler and removes an entire class of "did I copy the right/current files" staleness risk.

## Step 8 — Historical suite migration

Preferred configuration (`TEST_BASE_URL`) over sed-patching, per the brief's explicit instruction —
this was a ONE-TIME source-code migration, not a per-run patch step. Every migrated file now runs,
unmodified, as:
```
TEST_BASE_URL=http://127.0.0.1:4095 node <file>
```

**76 files migrated by a scripted transformation** (`async function main(){}` entry point,
identical `const BASE = 'http://localhost:4001';` line, mechanically verified identical across all
targets before the transform ran) + **8 files with a different entry-point shape**
(`(async()=>{...})();` IIFE) migrated by a second, near-identical script + one file
(`server/phase21_scale_test.js`) requiring a manual, precisely-scoped edit because it contains 10
NESTED inline `async()=>{}` closures in addition to its own top-level IIFE, which the automated
script correctly refused to touch (would have matched 11 occurrences instead of 1). All 3 forms
insert the identical self-contained preflight guard (see Step 5) as the very first statement of the
file's actual entry point.

**Self-contained by design, not `require()`d from a shared module**: every migrated file keeps
working standalone if copied into a disposable scratch directory (matching this project's
established isolated-test pattern) — a `require('../tests/preflight')` dependency would have broken
the moment a file was copied out on its own without also carrying that relative path correctly,
which is exactly the kind of fragile coupling this phase exists to remove, not add.

**76 + 8 + 1 (manual) = 85 files touched**, covering:
- All 26 officially-named historical suite files, in BOTH `server/` and `HANDOVER_PACKAGE/03_TESTS/`
  (52 files, kept byte-identical to each other as they were before this phase).
- 32 additional hardcoded-4001 files found in `server/` beyond that list (volume/UAT/adversarial/
  scale/audit test files spanning Phase 9b through Phase 34) — these were NOT required by the
  brief's literal "26-file suite" wording, but Step 1 explicitly warned not to assume the known 26
  was complete, and it was not; leaving 32 files in the exact same directory as production
  `server.js` still hardcoded to port 4001 would have left the door open to a near-identical
  incident via any one of them.

**Compatibility fix required and applied**: `tests/erp_059_restart_persistence_tests.js` (from the
ERP-059A/B era, predates ERP-059C) spawns its OWN server instance via a `startServer()` helper that
did not know about `APP_ENV`/`DB_PATH`. Once this phase's `IS_TEST_ENV` gate existed, that spawned
instance defaulted to `APP_ENV=production` (the fail-closed default), which silently rejected the
`/api/test/reset` calls this suite depends on. Fixed by passing `APP_ENV: 'test'` and an explicit
`DB_PATH` in that helper's spawn `env` — re-run clean afterward (5/5 PASS, see the regression
report). This is disclosed as a genuine, necessary side effect of this phase's own change, not a
pre-existing defect.

**No legacy test was left silently targeting 4001**: every file that previously had the hardcoded
line now either has the `TEST_BASE_URL` guard (85 files) or was never touched because it never had
the pattern (`server.js`, `domain.js`, `auth.js`, `route_safety_scanner.js` — confirmed via the same
migration script's own skip-report).

All 95 touched files (85 migrated + `server/domain.js` + `server/server.js` +
`tests/erp_059_restart_persistence_tests.js` fix + 2 new `tests/*.js` files + 5 files not otherwise
counted) pass `node -c` syntax verification — see `ERP-059C-REGRESSION-REPORT.md` §Code quality.

## Scope question left open, not silently decided

`/api/demo/seed-scenario` fabricates a real chain of demo transactions — the identical risk profile
to `/api/test/reset` if run against production by accident — but its own Phase 36 code comment
describes it as a genuine UAT-facing feature ("One-Click Demo Scenario") an authorized Admin might
need on a live pre-launch/UAT environment, not only inside an automated test run. Disabling it
outside `APP_ENV=test` would be a functional change beyond this phase's authorized scope (production/
test isolation) without the user's explicit sign-off. Left exactly as it was (Admin-gated only);
flagged here as an open question for the user, not silently resolved either way.

## Residual risks

- **The 8 frozen `PHASE*_CHECKPOINT/` snapshots remain unmigrated by design** (§Step 1 scope
  decision). If any one of them were ever manually started as a live server, it would have none of
  this phase's guards. Recommendation (not implemented): a `NOTICE`/`README` in each checkpoint
  directory warning it must never be started as a live server, or removing checkpoint `server.js`'s
  `server.listen()` call entirely — either is a documentation/process decision for the user, not a
  code change this phase's scope covers.
- The historical suite's remaining pattern of "each test calls `/api/test/reset` itself at its own
  start" is unchanged — this phase does not attempt to centralize or further harden that (it is now
  safe by construction, since `/api/test/reset` itself is gated).
