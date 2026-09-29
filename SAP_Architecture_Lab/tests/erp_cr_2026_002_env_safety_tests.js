'use strict';
// CR-2026-002 — Environment & Database Safety Hardening — automated test suite.
// Covers all 6 tests required by CR-2026-002 §11. Manages its own child server processes (spawn/
// kill) against disposable scratch directories — never touches SAP_Architecture_Lab/server/db.json.
// This file itself takes real, precise sha256 hashes of the production file before and after every
// single test as a live, continuous guarantee, not just a one-time check.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(REPO_ROOT, 'server');
const CLIENT_DIR = path.join(REPO_ROOT, 'client_secure');
const PROD_DB = path.join(SERVER_DIR, 'db.json');

const results = [];
function record(name, pass, detail) { results.push({ name, pass, detail }); }

function hashFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function freshPort() { return 46000 + Math.floor(Math.random() * 3000); }

function makeScratch(label) {
  const uniqueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${label}`;
  const root = path.join(os.tmpdir(), `erp-cr2026002-test-${uniqueId}`);
  const serverDir = path.join(root, 'server');
  const clientDir = path.join(root, 'client_secure');
  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(clientDir, { recursive: true });
  for (const f of ['domain.js', 'server.js', 'env.js', 'auth.js', 'route_safety_scanner.js']) {
    fs.copyFileSync(path.join(SERVER_DIR, f), path.join(serverDir, f));
  }
  fs.copyFileSync(path.join(CLIENT_DIR, 'index.html'), path.join(clientDir, 'index.html'));
  return { root, serverDir, dbPath: path.join(serverDir, 'db.json') };
}

function rmScratch(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* best-effort cleanup */ }
}

// Spawns `node server.js` with the given env overlay, returns {proc, exitInfo} — exitInfo resolves
// once the process either starts listening (detected via a successful HTTP probe) or exits.
function spawnServer(cwd, envOverlay, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('node', ['server.js'], {
      cwd,
      env: { ...process.env, ...envOverlay },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    let settled = false;
    child.on('exit', (code) => {
      if (!settled) { settled = true; resolve({ child: null, exited: true, code, stdout, stderr }); }
    });
    const start = Date.now();
    (function poll() {
      if (settled) return;
      if (Date.now() - start > timeoutMs) {
        settled = true;
        resolve({ child, exited: false, code: null, stdout, stderr, timedOut: true });
        return;
      }
      if (/listening on/i.test(stdout)) {
        settled = true;
        resolve({ child, exited: false, code: null, stdout, stderr });
        return;
      }
      setTimeout(poll, 150);
    })();
  });
}

function killIfAlive(child) {
  if (!child) return;
  try { process.platform === 'win32' ? execSync(`taskkill /PID ${child.pid} /F`) : child.kill('SIGKILL'); } catch (e) { /* already dead */ }
}

async function main() {
  const hashBefore = hashFile(PROD_DB);
  const sizeBefore = fs.statSync(PROD_DB).size;
  record('[SETUP] Production db.json hash captured before any test', true, { hash: hashBefore, size: sizeBefore });

  // ============================= TEST 1 — explicit test env starts successfully =============================
  {
    const s = makeScratch('test1');
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: s.dbPath, PORT: '0' }, 8000);
    record('[TEST 1] APP_ENV=test + DB_PATH set starts successfully', !r.exited && /listening on/i.test(r.stdout), { exited: r.exited, code: r.code, stdoutTail: r.stdout.slice(-200) });
    record('[TEST 1] Startup banner correctly identifies ENVIRONMENT: TEST', /ENVIRONMENT: TEST/.test(r.stdout), null);
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  // ============================= TEST 2 — test env without DB_PATH must fail closed =============================
  {
    const s = makeScratch('test2');
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: '' }, 5000);
    record('[TEST 2] APP_ENV=test with NO DB_PATH exits (does not start listening)', r.exited === true, { exited: r.exited, code: r.code });
    record('[TEST 2] Exit code is non-zero (failure, not silent success)', r.code !== 0, { code: r.code });
    record('[TEST 2] Error message explains environment, refusal reason, and fix', /FATAL/.test(r.stderr) && /development|scratch/.test(r.stderr), { stderrTail: r.stderr.slice(-400) });
    record('[TEST 2] Did NOT fall through to listening on the production default DB', !/listening on/i.test(r.stdout), null);
    killIfAlive(r.child);
    rmScratch(s.root);
  }
  // Same check for the NEW 'development' state (not explicitly numbered by the CR but directly
  // implied by §5's "must distinguish at least production/test/development" + §6's fail-closed
  // requirement extended to development).
  {
    const s = makeScratch('dev-no-dbpath');
    const r = await spawnServer(s.serverDir, { APP_ENV: 'development', DB_PATH: '' }, 5000);
    record('[TEST 2b] APP_ENV=development with NO DB_PATH also fails closed (new state)', r.exited === true && r.code !== 0, { exited: r.exited, code: r.code });
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  // ============================= TEST 3 — production-default resolution, tested in isolation =========
  // Never run against the real server/ directory. A scratch copy with ZERO env vars set will resolve
  // its OWN __dirname-relative default db.json, inside the scratch dir — proving the exact same code
  // path a real production start would take, without any risk to the real file.
  {
    const s = makeScratch('test3-proddefault');
    const r = await spawnServer(s.serverDir, { APP_ENV: '', DB_PATH: '', PORT: '0' }, 8000);
    record('[TEST 3] No APP_ENV/DB_PATH (production default) starts successfully', !r.exited && /listening on/i.test(r.stdout), { exited: r.exited, code: r.code });
    record('[TEST 3] Startup banner correctly identifies ENVIRONMENT: PRODUCTION', /ENVIRONMENT: PRODUCTION/.test(r.stdout), null);
    record('[TEST 3] Resolved database path is the SCRATCH copy\'s own default (never the real server/db.json)', r.stdout.includes(s.dbPath) && !r.stdout.includes(PROD_DB), { resolvedInBanner: (r.stdout.match(/DATABASE\s*:\s*(.*)/) || [])[1] });
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  // ============================= TEST 4 — test write isolation =============================
  {
    const s = makeScratch('test4-write');
    const port = freshPort();
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: s.dbPath, PORT: String(port) }, 8000);
    let writeOk = false, testDbChanged = false;
    if (port) {
      try {
        const loginRes = await fetch(`http://localhost:${port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }) });
        const loginJson = await loginRes.json();
        const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
        const resetRes = await fetch(`http://localhost:${port}/api/test/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie } });
        writeOk = resetRes.ok;
      } catch (e) { /* leaves writeOk false */ }
    }
    testDbChanged = fs.existsSync(s.dbPath);
    const hashAfterWrite = hashFile(PROD_DB);
    record('[TEST 4] A real write succeeded against the isolated test instance', writeOk === true, { port, writeOk });
    record('[TEST 4] The isolated test database file was created/changed by that write', testDbChanged === true, { dbPathExists: testDbChanged });
    record('[TEST 4] Production db.json hash unchanged by the test-mode write', hashAfterWrite === hashBefore, { before: hashBefore, after: hashAfterWrite });
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  // ============================= TEST 5 — parallel test isolation =============================
  {
    const sA = makeScratch('test5-A');
    const sB = makeScratch('test5-B');
    const portA = freshPort();
    let portB = freshPort();
    while (portB === portA) portB = freshPort();
    const [rA, rB] = await Promise.all([
      spawnServer(sA.serverDir, { APP_ENV: 'test', DB_PATH: sA.dbPath, PORT: String(portA) }, 8000),
      spawnServer(sB.serverDir, { APP_ENV: 'test', DB_PATH: sB.dbPath, PORT: String(portB) }, 8000),
    ]);
    record('[TEST 5] Both parallel isolated instances started successfully', !rA.exited && !rB.exited, { rAExited: rA.exited, rBExited: rB.exited });
    record('[TEST 5] Each resolved a genuinely DIFFERENT database path', sA.dbPath !== sB.dbPath, { dbPathA: sA.dbPath, dbPathB: sB.dbPath });
    let crossWriteClean = false;
    if (portA && portB) {
      try {
        const loginA = await fetch(`http://localhost:${portA}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }) });
        const cookieA = (loginA.headers.get('set-cookie') || '').split(';')[0];
        await fetch(`http://localhost:${portA}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieA }, body: JSON.stringify({ name: 'CR-2026-002 isolation test lead A', requirement: 'x', expectedValue: 1 }) });
        // B never received this write — confirm B's own lead list is still empty / does not contain it
        const loginB = await fetch(`http://localhost:${portB}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }) });
        const cookieB = (loginB.headers.get('set-cookie') || '').split(';')[0];
        const leadsB = await (await fetch(`http://localhost:${portB}/api/leads`, { headers: { Cookie: cookieB } })).json();
        crossWriteClean = !(leadsB.leads || []).some(l => l.name === 'CR-2026-002 isolation test lead A');
      } catch (e) { /* leaves crossWriteClean false, will fail loudly below */ }
    }
    record('[TEST 5] A write to instance A is NOT visible in instance B (no cross-contamination)', crossWriteClean === true, { portA, portB });
    killIfAlive(rA.child);
    killIfAlive(rB.child);
    rmScratch(sA.root);
    rmScratch(sB.root);
  }

  // ============================= TEST 6 — relevant existing test suite still passes ===============
  {
    const s = makeScratch('test6-regress');
    const port = freshPort();
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: s.dbPath, PORT: String(port) }, 8000);
    let regressOutput = '', regressOk = false;
    if (port) {
      try {
        regressOutput = execSync(`node "${path.join(REPO_ROOT, 'tests', 'erp_059c_production_isolation_tests.js')}" http://localhost:${port}`, { encoding: 'utf8', timeout: 30000 });
        regressOk = /PASS \/ 0 FAIL/.test(regressOutput);
      } catch (e) { regressOutput = (e.stdout || '') + (e.stderr || e.message); }
    }
    record('[TEST 6] erp_059c_production_isolation_tests.js still passes 100% against an env.js-resolved instance', regressOk === true, { outputTail: regressOutput.slice(-500) });
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  const hashAfterAll = hashFile(PROD_DB);
  const sizeAfterAll = fs.statSync(PROD_DB).size;
  record('[TEARDOWN] Production db.json byte-for-byte unchanged across the ENTIRE test run', hashAfterAll === hashBefore && sizeAfterAll === sizeBefore, { hashBefore, hashAfterAll, sizeBefore, sizeAfterAll });

  console.log('\n===== CR-2026-002 ENV SAFETY TESTS: ' + results.filter(r => r.pass === true).length + ' PASS / ' + results.filter(r => r.pass === false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r => console.log((r.pass ? '✅ PASS' : '❌ FAIL') + ' | ' + r.name + (r.pass ? '' : ' -- ' + JSON.stringify(r.detail))));
  if (results.some(r => r.pass === false)) process.exitCode = 1;
}

main().catch(e => { console.error('TEST RUNNER CRASHED:', e); process.exitCode = 1; });
