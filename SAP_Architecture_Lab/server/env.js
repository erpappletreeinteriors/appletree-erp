'use strict';
// CR-2026-002 — Environment & Database Safety Hardening.
//
// The single authoritative environment/database-resolution mechanism for this server. Before this
// change, APP_ENV/DB_PATH resolution was duplicated independently in both domain.js and server.js
// (each read process.env directly) — functionally consistent (same process, same env vars) but not
// structurally single-sourced, and neither file made the resolved environment/database visible at
// startup beyond a single APP_ENV line. This module consolidates both concerns and adds the missing
// 'development' state, per CR-2026-002 §5.
//
// Context this responds to: ERP-059C (2026-09-10/11) closed the class of incident where a test
// script with no environment awareness accidentally targeted the production-port server. The
// residual gap ERP-059C did NOT close: a server process started with APP_ENV and DB_PATH BOTH unset
// resolves, by design, to the production default (server/db.json) — correct and required for
// legitimate production startup (CR-2026-002 §7 forbids breaking this), but silent. A real,
// low-severity instance of exactly this ambiguity was investigated 2026-09-21 (see
// ARCH-2026-001-LOGIN-PROVENANCE-INVESTIGATION.md) — a successful login was recorded against
// server/db.json with no corroborating evidence of who started that process or why, precisely
// because nothing at startup made the resolved environment/database loud enough to notice. This
// module's job is to make that resolution impossible to miss, and to extend the existing
// APP_ENV=test/DB_PATH-required fail-closed guard to a new, explicit 'development' state — WITHOUT
// changing what a bare, unconfigured start resolves to (still 'production' + the default DB path,
// unchanged, per §7).

const path = require('path');

const RECOGNIZED_ENVS = ['production', 'test', 'development'];

const RAW_APP_ENV = process.env.APP_ENV || 'production';
// An unrecognized APP_ENV value (a typo, e.g.) falls back to 'production' behavior — the existing,
// already-documented philosophy in server.js's own ERP-059C comment ("an absent APP_ENV, an
// unrecognized value... all disable [destructive test endpoints] identically") extended consistently
// to database-path resolution too. This is a fail-closed default in the security-relevant direction
// (an unrecognized value never accidentally unlocks test-only behavior), not a weakening.
const APP_ENV = RECOGNIZED_ENVS.includes(RAW_APP_ENV) ? RAW_APP_ENV : 'production';
const APP_ENV_WAS_UNRECOGNIZED = RAW_APP_ENV !== APP_ENV;

const IS_TEST_ENV = APP_ENV === 'test';
const IS_DEV_ENV = APP_ENV === 'development';
// IS_TEST_ENV alone continues to gate destructive test-only endpoints (server.js) — unchanged.
// IS_DEV_ENV is new and deliberately does NOT gate anything destructive; it only participates in the
// DB_PATH-required safety check below. Keeping these two flags separate preserves the existing
// security boundary (only 'test' unlocks /api/test/* endpoints) while still letting 'development'
// opt into the same "you must tell me where your disposable database is" discipline as 'test'.

const DB_PATH_ENV = process.env.DB_PATH;

function _failClosedNoDbPath(envLabel) {
  const msg =
    `[FATAL] APP_ENV=${envLabel} but DB_PATH is not set.\n` +
    `  Current environment : ${envLabel}\n` +
    `  Resolved database    : (refused — no DB_PATH given)\n` +
    `  Why startup was refused: a ${envLabel} instance must be given an explicit, disposable\n` +
    `    database path instead of silently defaulting to the db.json next to the source files,\n` +
    `    which may be the real one.\n` +
    `  How to fix:\n` +
    `    Set DB_PATH to a scratch file path before starting, e.g.\n` +
    `      APP_ENV=${envLabel} DB_PATH=/path/to/scratch/db.json node server.js\n` +
    `    Or use the provided isolated-test launcher, which does this for you:\n` +
    `      node server/scripts/start-isolated-test-server.js`;
  console.error(msg);
  process.exit(1);
}

let DB_FILE;
if (DB_PATH_ENV) {
  DB_FILE = path.resolve(DB_PATH_ENV);
} else if (IS_TEST_ENV) {
  _failClosedNoDbPath('test'); // does not return — process.exit(1)
} else if (IS_DEV_ENV) {
  _failClosedNoDbPath('development'); // does not return — process.exit(1)
} else {
  // Production default — UNCHANGED from the pre-CR-2026-002 behavior. This is the one path this
  // change deliberately does NOT make stricter, per §7 ("do not break legitimate production
  // startup"). Its resolved value is anchored to this file's own directory (server/), matching the
  // pre-existing anchor point (domain.js's own __dirname), since env.js lives in the same directory.
  DB_FILE = path.join(__dirname, 'db.json');
}

// PORT — unchanged default (4001) and override behavior, just consolidated here alongside the other
// two environment inputs rather than duplicated in server.js.
const PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

function label() {
  return APP_ENV.toUpperCase();
}

// Loud, hard-to-miss startup identification (CR-2026-002 §10). Printed once at process start by
// server.js. Never includes credentials, tokens, or any request/session data — DB_FILE is a
// filesystem path, not a secret.
function printStartupBanner() {
  const bar = '='.repeat(64);
  console.log(bar);
  console.log(`  APPLETREE ERP — ENVIRONMENT: ${label()}`);
  console.log(`  DATABASE : ${DB_FILE}`);
  console.log(`  PORT     : ${PORT}`);
  if (APP_ENV === 'production') {
    console.log(`  (No APP_ENV/DB_PATH override supplied — this is the production default path.`);
    console.log(`   If you intended to run an isolated test/dev instance, stop now and use`);
    console.log(`   node server/scripts/start-isolated-test-server.js instead.)`);
  }
  if (APP_ENV_WAS_UNRECOGNIZED) {
    console.log(`  NOTE: APP_ENV="${RAW_APP_ENV}" is not a recognized value (expected one of:`);
    console.log(`   ${RECOGNIZED_ENVS.join(', ')}) — treated as PRODUCTION, fail-closed default.`);
  }
  console.log(bar);
}

module.exports = {
  RECOGNIZED_ENVS,
  APP_ENV,
  IS_TEST_ENV,
  IS_DEV_ENV,
  DB_FILE,
  PORT,
  printStartupBanner,
};
