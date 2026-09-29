#!/usr/bin/env node
'use strict';
// CR-2026-002 §8/§9 — formalizes the "copy source files into a scratch directory" pattern this
// engagement has used manually, ad hoc, since Phase 6A — the same pattern that a real mistake (a
// nested, non-sibling client_secure/ directory) was made against at least once earlier in this
// engagement's own history, precisely because it was manual and undocumented as a script. This
// script is the single, deterministic, reusable mechanism requested by §8: every invocation creates
// a fresh, uniquely-named, fully disposable scratch directory — never the production source tree,
// never server/db.json — with client_secure/ copied as the REQUIRED sibling directory
// (CLIENT_DIR = path.join(__dirname, '..', 'client_secure') in server.js requires this exact layout).
//
// Parallel-session safety (§9): every invocation gets its own randomly-suffixed scratch directory
// AND its own randomly-chosen port (default range 45000-49999, override with --port), so two
// concurrent invocations do not collide on either the database file or the listening port.
//
// Usage:
//   node server/scripts/start-isolated-test-server.js [--port N] [--app-env test|development] [--foreground]
//
// Prints the resolved scratch directory, DB_PATH, PORT, and PID, then exits (server keeps running in
// the background) unless --foreground is given, in which case this process stays attached and
// streams the child's output (Ctrl+C stops it).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SERVER_DIR = __dirname.endsWith(path.join('server', 'scripts'))
  ? path.join(__dirname, '..')
  : path.join(__dirname, '..', 'server');
const LAB_ROOT = path.join(SERVER_DIR, '..');
const REAL_CLIENT_DIR = path.join(LAB_ROOT, 'client_secure');

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const APP_ENV = argVal('--app-env', 'test');
if (!['test', 'development'].includes(APP_ENV)) {
  console.error(`[FATAL] --app-env must be "test" or "development" (isolated instances only — this script never starts a production instance). Got: "${APP_ENV}"`);
  process.exit(1);
}
const requestedPort = argVal('--port', null);
const PORT = requestedPort ? Number(requestedPort) : 45000 + Math.floor(Math.random() * 5000);
const FOREGROUND = args.includes('--foreground');

// Unique scratch root: OS temp dir + a timestamp + a random suffix, so two simultaneous invocations
// (this engagement's own past mistake risk — reusing the same scratch dir across sessions) never
// collide, satisfying §9's "Session A -> test DB A, Session B -> test DB B" requirement.
const uniqueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const scratchRoot = path.join(os.tmpdir(), `appletree-sap-lab-isolated-${uniqueId}`);
const serverScratchDir = path.join(scratchRoot, 'server');
const clientScratchDir = path.join(scratchRoot, 'client_secure'); // SIBLING of serverScratchDir — required
const dbPath = path.join(serverScratchDir, 'db.json');

fs.mkdirSync(serverScratchDir, { recursive: true });
fs.mkdirSync(clientScratchDir, { recursive: true });

const filesToCopy = ['domain.js', 'server.js', 'env.js', 'auth.js', 'route_safety_scanner.js'];
for (const f of filesToCopy) {
  fs.copyFileSync(path.join(SERVER_DIR, f), path.join(serverScratchDir, f));
}
fs.copyFileSync(path.join(REAL_CLIENT_DIR, 'index.html'), path.join(clientScratchDir, 'index.html'));

const child = spawn('node', ['server.js'], {
  cwd: serverScratchDir,
  env: { ...process.env, APP_ENV, DB_PATH: dbPath, PORT: String(PORT) },
  stdio: FOREGROUND ? 'inherit' : 'ignore',
  detached: !FOREGROUND,
});

if (!FOREGROUND) {
  child.unref();
}

console.log('================================================================');
console.log(`  ISOLATED ${APP_ENV.toUpperCase()} SERVER STARTED`);
console.log(`  Scratch directory : ${scratchRoot}`);
console.log(`  Database (DB_PATH): ${dbPath}`);
console.log(`  Port               : ${PORT}`);
console.log(`  PID                : ${child.pid}`);
console.log(`  URL                : http://localhost:${PORT}`);
console.log('  This instance never touches server/db.json. Stop it with:');
console.log(`    ${process.platform === 'win32' ? `taskkill /PID ${child.pid} /F` : `kill ${child.pid}`}`);
console.log('  Delete the scratch directory above when you are done with it.');
console.log('================================================================');

module.exports = { scratchRoot, dbPath, port: PORT, pid: child.pid };
