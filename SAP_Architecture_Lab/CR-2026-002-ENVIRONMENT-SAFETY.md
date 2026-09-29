# CR-2026-002 — Environment & Database Safety Hardening

**Date:** 2026-09-21. Scope: environment/database-path safety only — no RBAC, business workflow, or
data-model change. Status: **CLOSED — PASS** (see the change register for the full record).

## 1. Why this change exists

`ARCH-2026-001-LOGIN-PROVENANCE-INVESTIGATION.md` exhausted every available forensic source trying
to attribute a Sep 19, 2026 login recorded against `server/db.json` and could not — not because the
event was severe (it was not: one login-history record, zero business/accounting/inventory impact),
but because **nothing in this codebase made the resolved environment and database loud enough to
notice at the moment it mattered.** The architecture already correctly resolves a bare, unconfigured
server start to the production default path (`server/db.json`) — that is required, documented,
existing behavior (ERP-059C, 2026-09-10/11) that this change does not alter. What was missing was
visibility, an explicit "development" state distinct from "someone forgot to configure anything," and
a single, reusable, correct way to start an isolated instance instead of the ad hoc "copy files into
a scratch directory" pattern this whole engagement has relied on manually since Phase 6A.

## 2. Established behavior (verified from the current code, not assumed)

Before this change, both `domain.js` and `server.js` independently read `process.env.APP_ENV` /
`process.env.DB_PATH`:

- `APP_ENV` defaulted to `'production'` when unset.
- `DB_PATH`, when set, was used verbatim (resolved to an absolute path).
- When `DB_PATH` was unset **and** `APP_ENV==='test'`, the process refused to start (`process.exit(1)`)
  — a real, working, already-tested fail-closed guard (`tests/erp_059c_production_isolation_tests.js`).
- When `DB_PATH` was unset **and** `APP_ENV` was anything else (including simply absent), `DB_FILE`
  silently resolved to `path.join(__dirname, 'db.json')` — i.e., `server/db.json`, the production
  file, with no distinct signal that this had happened by default rather than by explicit choice.
- There was no `'development'` state; only `'test'` was distinguished from everything else.

This is exactly the mechanism confirmed responsible, architecturally, for how the Sep 19 event's
target file was `server/db.json` specifically.

## 3. What changed

**One new module, `server/env.js`**, now the single authoritative source for `APP_ENV`, `DB_FILE`,
and `PORT` resolution. `domain.js` and `server.js` were each updated to `require('./env')` instead of
duplicating the resolution logic — a structural consolidation, not a behavior change for the paths
that already worked correctly.

**New: an explicit `'development'` environment state.** Recognized values are now `production`,
`test`, `development`. `development` gets the *same* "you must supply `DB_PATH`" fail-closed
requirement as `test` — but deliberately does **not** unlock any destructive `/api/test/*` endpoint
(that gate remains keyed to the literal string `'test'` only, unchanged, preserving the exact security
boundary ERP-059C established). An unrecognized `APP_ENV` value (a typo) falls back to `'production'`
behavior, consistent with the security-relevant direction already documented for the destructive-
endpoint gate.

**Unchanged, by explicit design:** a bare, fully-unconfigured start still resolves to `APP_ENV=production`
and `DB_FILE=server/db.json` — identical to before. This was a deliberate choice, not an oversight:
CR-2026-002 §7 explicitly forbids breaking legitimate production startup, and the existing
`sap-lab-secure` launch configuration (and any real production deployment) depends on this exact
default continuing to work with zero configuration.

**Loud startup identification (`ENV.printStartupBanner()`)**, printed first, before every other
startup log line:

```
================================================================
  APPLETREE ERP — ENVIRONMENT: <PRODUCTION|TEST|DEVELOPMENT>
  DATABASE : <resolved absolute path>
  PORT     : <resolved port>
  (production-only note, telling the operator to stop and use the isolated launcher if this
   wasn't intended)
================================================================
```

Contains no credentials, tokens, or session data — a filesystem path and a port number are not
secrets.

**New: `server/scripts/start-isolated-test-server.js`**, a formal, reusable, deterministic launcher
that replaces the manual "copy source files into a scratch directory" ritual this engagement has
repeated by hand dozens of times since Phase 6A (including the exact mistake made once — a
non-sibling `client_secure/` copy — documented in this engagement's own memory). Every invocation:
- creates a uniquely-named scratch directory (timestamp + random suffix) under the OS temp directory;
- copies `domain.js`, `server.js`, `env.js`, `auth.js`, `route_safety_scanner.js`, and
  `client_secure/index.html` (as the required sibling directory) into it;
- sets `APP_ENV` (`test` by default, or `development` via `--app-env`), `DB_PATH` (inside the scratch
  directory — never `server/db.json`), and `PORT` (a random value in 45000-49999 by default, or
  `--port`);
- prints the scratch directory, resolved database path, port, and PID, and how to stop it.

Never touches `SAP_Architecture_Lab/server/db.json`. Two concurrent invocations get distinct scratch
directories and (by default) distinct random ports, directly satisfying the parallel-session-safety
requirement.

## 4. What deliberately did NOT change

- No RBAC, role, duty, privilege, scope, or SoD logic (`ARCH-2026-001` remains DESIGN ONLY).
- No business workflow, accounting, inventory, or project logic.
- No change to which destructive test endpoints exist or what gates them (`APP_ENV==='test'` only,
  unchanged).
- No change to `server/db.json`'s content — verified byte-for-byte identical (sha256
  `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22`, 52,518 bytes) before and after
  this entire change, including after running the full regression battery against a separate isolated
  instance.
- The Sep 19 login-history record is untouched (same file, same hash — it was never a separate
  target of any operation this change performed).
- No change to production startup's zero-configuration default behavior.

## 5. How to use this going forward

**To run an isolated test/dev instance** (replaces every prior manual scratch-copy procedure):
```
node server/scripts/start-isolated-test-server.js
node server/scripts/start-isolated-test-server.js --app-env development --port 48000 --foreground
```

**To run the real production/demo instance** — unchanged: the existing `sap-lab-secure` launch
configuration, or `node server/server.js` from the `server/` directory with no overrides. The startup
banner will now clearly print `ENVIRONMENT: PRODUCTION` and the resolved database path — if that is
not what you intended, stop the process and use the isolated launcher instead.

**If you see a `[FATAL] APP_ENV=test|development but DB_PATH is not set` message** — this is the
safety guard working as designed. Follow the message's own instructions (set `DB_PATH`, or use the
isolated launcher).

## 6. Test evidence

19/19 new automated tests (`tests/erp_cr_2026_002_env_safety_tests.js`), covering all 6 scenarios
CR-2026-002 §11 requires, plus a `development`-state variant of the fail-closed test. Full existing
regression battery (300/300 automated assertions +2 documented-not-tested, unchanged) re-run against
a fresh isolated instance using the new `env.js`-based resolution path, zero regressions. See
`CONTROLLED_CHANGE_REGISTER.md` for the itemized results.
