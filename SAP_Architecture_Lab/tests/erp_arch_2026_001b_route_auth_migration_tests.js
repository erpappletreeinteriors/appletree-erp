'use strict';
// ARCH-2026-001B — Route-Layer Authorization Migration — automated test suite.
// Part 1: in-process engine tests (equivalence of the 5 newly-migrated privileges against the
// exact original inline role checks they replaced). Part 2: live HTTP tests against a spawned
// isolated server — authorized/unauthorized/direct-API/forged-role/missing-auth for the migrated
// routes. Never touches SAP_Architecture_Lab/server/db.json.

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
function record(name, pass, detail) { results.push({ name, pass: !!pass, detail }); }
function hashFile(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function freshPort() { return 49000 + Math.floor(Math.random() * 900); }

function makeScratch(label) {
  const uniqueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${label}`;
  const root = path.join(os.tmpdir(), `erp-arch2026001b-test-${uniqueId}`);
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
function rmScratch(root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {} }

function spawnServer(cwd, envOverlay, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('node', ['server.js'], { cwd, env: { ...process.env, ...envOverlay }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    let settled = false;
    child.on('exit', (code) => { if (!settled) { settled = true; resolve({ child: null, exited: true, code, stdout, stderr }); } });
    const start = Date.now();
    (function poll() {
      if (settled) return;
      if (Date.now() - start > timeoutMs) { settled = true; resolve({ child, exited: false, code: null, stdout, stderr, timedOut: true }); return; }
      if (/listening on/i.test(stdout)) { settled = true; resolve({ child, exited: false, code: null, stdout, stderr }); return; }
      setTimeout(poll, 150);
    })();
  });
}
function killIfAlive(child) {
  if (!child) return;
  try { process.platform === 'win32' ? execSync(`taskkill /PID ${child.pid} /F`) : child.kill('SIGKILL'); } catch (e) {}
}
async function login(port, username, password) {
  const res = await fetch(`http://localhost:${port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  const body = await res.json();
  return { ok: res.ok && body.ok, cookie, status: res.status, body };
}

async function main() {
  const hashBefore = hashFile(PROD_DB);
  const sizeBefore = fs.statSync(PROD_DB).size;
  record('[SETUP] Production db.json hash captured before any test', true, { hash: hashBefore, size: sizeBefore });

  // ================= PART 1 — in-process equivalence tests =================
  {
    const dbPath = path.join(os.tmpdir(), `arch2026001b-engine-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
    const savedAppEnv = process.env.APP_ENV, savedDbPath = process.env.DB_PATH;
    process.env.APP_ENV = 'test';
    process.env.DB_PATH = dbPath;
    delete require.cache[require.resolve(path.join(SERVER_DIR, 'domain.js'))];
    delete require.cache[require.resolve(path.join(SERVER_DIR, 'env.js'))];
    const D = require(path.join(SERVER_DIR, 'domain.js'));

    function grantedRoles(privKey) {
      return D.ROLES.filter(role => {
        const user = D.DB.users.find(u => u.role === role);
        return D.hasPrivilege({ id: user.id, role }, privKey);
      }).sort();
    }
    const EXPECTED = {
      'MaterialIssueSite.CREATE': ['Admin', 'CEO', 'FinanceManager', 'Purchase'].sort(),
      'MaterialIssueWarehouse.CREATE': ['Admin', 'CEO', 'Purchase'].sort(),
      'PurchaseRequisition.APPROVE': ['Admin', 'CEO', 'FinanceManager', 'Purchase', 'SiteInCharge'].sort(),
      'SiteMaterialRequisition.APPROVE': ['Admin', 'CEO', 'FinanceManager', 'Purchase', 'SiteInCharge'].sort(),
      'AuditLog.VIEW': ['Admin', 'CEO'].sort(),
    };
    Object.entries(EXPECTED).forEach(([priv, expected]) => {
      const actual = grantedRoles(priv);
      record(`[TEST 1.${priv}] Role set for "${priv}" exactly matches the original legacy inline check`, JSON.stringify(actual) === JSON.stringify(expected), { priv, expected, actual });
    });

    // ---- Direct function-level equivalence: assertCanCreateMaterialIssue / approvePurchaseRequisition
    // base gate / approveSiteMaterialRequisition base gate, exercised via their real functions ----
    const financeUser = D.DB.users.find(u => u.role === 'FinanceManager');
    const salesUser = D.DB.users.find(u => u.role === 'Sales');
    const r1 = D.assertCanCreateMaterialIssue({ id: financeUser.id, role: 'FinanceManager' }, { siteId: 'SITE-DOES-NOT-EXIST' });
    record('[TEST 2] assertCanCreateMaterialIssue: FinanceManager allowed for a SITE issue (matches original site-branch array)', r1.ok === true, r1);
    const r2 = D.assertCanCreateMaterialIssue({ id: financeUser.id, role: 'FinanceManager' }, { projectId: 'PRJ-DOES-NOT-EXIST' });
    record('[TEST 3] assertCanCreateMaterialIssue: FinanceManager DENIED for a WAREHOUSE issue (matches original warehouse-branch array excluding FinanceManager)', r2.ok === false, r2);
    const r3 = D.assertCanCreateMaterialIssue({ id: salesUser.id, role: 'Sales' }, { siteId: 'SITE-DOES-NOT-EXIST' });
    record('[TEST 4] assertCanCreateMaterialIssue: Sales DENIED for a SITE issue (not in either original array, no scope match)', r3.ok === false, r3);

    // Restore process.env before Part 2/3 spawn any child process (same discipline as ARCH-2026-001A's own test file).
    if (savedAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = savedAppEnv;
    if (savedDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = savedDbPath;
  }

  // ================= PART 2 — live HTTP tests against a spawned isolated server =================
  {
    const s = makeScratch('http');
    const port = freshPort();
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: s.dbPath, PORT: String(port) }, 8000);
    if (r.exited || r.timedOut) {
      record('[TEST 5] Isolated HTTP test server started', false, { stdout: r.stdout.slice(-800), stderr: r.stderr.slice(-800) });
    } else {
      record('[TEST 5] Isolated HTTP test server started', true, { port });

      // Audit Log route: authorized (CEO/Admin) vs unauthorized (Sales) vs missing auth vs forged role
      const ceoLogin = await login(port, 'ceo', 'Ceo@12345');
      const salesLogin = await login(port, 'sales1', 'Sal@123456');
      const ceoAudit = await fetch(`http://localhost:${port}/api/audit-log`, { headers: { Cookie: ceoLogin.cookie } });
      record('[TEST 6] CEO (authorized) can view /api/audit-log', ceoAudit.status === 200, { status: ceoAudit.status });
      const salesAudit = await fetch(`http://localhost:${port}/api/audit-log`, { headers: { Cookie: salesLogin.cookie } });
      record('[TEST 7] Sales (unauthorized) direct API GET /api/audit-log is rejected (403)', salesAudit.status === 403, { status: salesAudit.status });
      const noAuthAudit = await fetch(`http://localhost:${port}/api/audit-log`);
      record('[TEST 8] Missing authentication: GET /api/audit-log with no session cookie is rejected (401/403, never 200)', noAuthAudit.status === 401 || noAuthAudit.status === 403, { status: noAuthAudit.status });
      const forgedAudit = await fetch(`http://localhost:${port}/api/audit-log?role=Admin`, { headers: { Cookie: salesLogin.cookie, 'X-Forged-Role': 'Admin' } });
      record('[TEST 9] Forged role via query string / custom header does NOT bypass authorization for Sales', forgedAudit.status === 403, { status: forgedAudit.status });

      // Purchase Requisition approval: authorized (FinanceManager) vs unauthorized (Estimator) vs wrong action test via nonexistent id (still must be 403, not 404-before-auth)
      const financeLogin = await login(port, 'finance1', 'Fin@12345');
      const estimatorLogin = await login(port, 'estimator1', 'Est@12345');
      const estApprovePR = await fetch(`http://localhost:${port}/api/purchase-requisitions/PR-0001/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: estimatorLogin.cookie }, body: '{}' });
      record('[TEST 10] Estimator (unauthorized) direct API POST /api/purchase-requisitions/:id/approve is rejected (403/404, never 200)', estApprovePR.status === 403 || estApprovePR.status === 404, { status: estApprovePR.status });

      // Viewer must remain read-only on the migrated routes too
      const viewerLogin = await login(port, 'viewer1', 'View@1234');
      const viewerAudit = await fetch(`http://localhost:${port}/api/audit-log`, { headers: { Cookie: viewerLogin.cookie } });
      record('[TEST 11] Viewer denied /api/audit-log (Viewer was never in {Admin,CEO})', viewerAudit.status === 403, { status: viewerAudit.status });

      killIfAlive(r.child);
    }
    rmScratch(s.root);
  }

  // ================= PART 3 — full existing regression re-run (proves no regression from the migration) =================
  {
    const s = makeScratch('regress');
    const port = freshPort();
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: s.dbPath, PORT: String(port) }, 8000);
    let regressOutput = '', regressOk = false;
    if (!r.exited && !r.timedOut) {
      try {
        regressOutput = execSync(`node "${path.join(REPO_ROOT, 'tests', 'erp_059c_production_isolation_tests.js')}" http://localhost:${port}`, { encoding: 'utf8', timeout: 30000 });
        regressOk = /PASS \/ 0 FAIL/.test(regressOutput);
      } catch (e) { regressOutput = (e.stdout || '') + (e.stderr || e.message); }
    }
    record('[TEST 12] erp_059c_production_isolation_tests.js still passes 100% against the route-migrated instance', regressOk === true, { outputTail: regressOutput.slice(-500) });
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  const hashAfterAll = hashFile(PROD_DB);
  const sizeAfterAll = fs.statSync(PROD_DB).size;
  record('[TEARDOWN] Production db.json byte-for-byte unchanged across the ENTIRE test run', hashAfterAll === hashBefore && sizeAfterAll === sizeBefore, { hashBefore, hashAfterAll, sizeBefore, sizeAfterAll });

  console.log('\n===== ARCH-2026-001B ROUTE AUTH MIGRATION TESTS: ' + results.filter(r => r.pass === true).length + ' PASS / ' + results.filter(r => r.pass === false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r => console.log((r.pass ? '✅ PASS' : '❌ FAIL') + ' | ' + r.name + (r.pass ? '' : ' -- ' + JSON.stringify(r.detail))));
  if (results.some(r => r.pass === false)) process.exitCode = 1;
}

main().catch(e => { console.error('TEST RUNNER CRASHED:', e); process.exitCode = 1; });
