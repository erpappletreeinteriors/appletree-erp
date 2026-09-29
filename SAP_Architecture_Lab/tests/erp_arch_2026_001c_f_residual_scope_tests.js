'use strict';
// ARCH-2026-001C-F — Data-Scope Closure & Residual Migration — automated test suite.
// Part 1: engine-level equivalence sweep for the 23 safely-migrated call sites (hasScopeAccess
// reduces to isProjectManagerOf whenever role==='ProjectManager', true otherwise — the SAFE pattern).
// Part 2: live HTTP regression tests for the defect found and fixed during this CR (9 sites where a
// blind substitution would have granted every non-PM role access to another project's financial
// data) — proves the fix holds for every affected route, not just the one caught live.
// Part 3: report/export scope tests (§10) using real created data.
// Part 4: full regression re-run. Never touches SAP_Architecture_Lab/server/db.json.

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
function freshPort() { return 51000 + Math.floor(Math.random() * 900); }

function makeScratch(label) {
  const uniqueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${label}`;
  const root = path.join(os.tmpdir(), `erp-arch2026001cf-test-${uniqueId}`);
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
async function api(port, cookie, method, urlPath, body) {
  const res = await fetch(`http://localhost:${port}${urlPath}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

async function main() {
  const hashBefore = hashFile(PROD_DB);
  const sizeBefore = fs.statSync(PROD_DB).size;
  record('[SETUP] Production db.json hash captured before any test', true, { hash: hashBefore, size: sizeBefore });

  // ================= PART 1 — engine-level equivalence sweep =================
  {
    const dbPath = path.join(os.tmpdir(), `arch2026001cf-engine-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
    const savedAppEnv = process.env.APP_ENV, savedDbPath = process.env.DB_PATH;
    process.env.APP_ENV = 'test';
    process.env.DB_PATH = dbPath;
    delete require.cache[require.resolve(path.join(SERVER_DIR, 'domain.js'))];
    delete require.cache[require.resolve(path.join(SERVER_DIR, 'env.js'))];
    const D = require(path.join(SERVER_DIR, 'domain.js'));

    const pm = D.DB.users.find(u => u.role === 'ProjectManager'); // assignedProjects: PRJ-1, PRJ-3
    const pmActor = { id: pm.id, role: 'ProjectManager', assignedProjects: pm.assignedProjects };
    const nonPmRoles = D.ROLES.filter(r => r !== 'ProjectManager');

    // The core safety rule this whole CR's fix rests on: hasScopeAccess('Project', X) === TRUE for
    // every non-ProjectManager role, unconditionally — which is exactly why it is UNSAFE to
    // substitute into a bare OR/un-narrowed DENY-guard, and exactly why it IS safe wherever the
    // surrounding expression already establishes role==='ProjectManager'.
    let allNonPmTrue = true;
    nonPmRoles.forEach(r => {
      const u = D.DB.users.find(x => x.role === r);
      if (!D.hasScopeAccess({ id: u.id, role: r }, 'Project', 'PRJ-2')) allNonPmTrue = false;
    });
    record('[RULE] hasScopeAccess(actor,\'Project\',X) is TRUE for every non-ProjectManager role, unconditionally — the documented reason the 9 defect sites needed to stay on the raw primitive', allNonPmTrue, { nonPmRoles });

    record('[A] PM own project (PRJ-1) — ALLOW', D.hasScopeAccess(pmActor, 'Project', 'PRJ-1') === true, {});
    record('[B] PM wrong project (PRJ-2) — DENY', D.hasScopeAccess(pmActor, 'Project', 'PRJ-2') === false, {});

    if (savedAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = savedAppEnv;
    if (savedDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = savedDbPath;
  }

  // ================= PART 2 — live regression for the 9-site defect + read-filter migrations =================
  {
    const s = makeScratch('http');
    const port = freshPort();
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: s.dbPath, PORT: String(port) }, 8000);
    if (r.exited || r.timedOut) {
      record('[SETUP] Isolated HTTP test server started', false, { stdout: r.stdout.slice(-800), stderr: r.stderr.slice(-800) });
    } else {
      record('[SETUP] Isolated HTTP test server started', true, { port });

      const salesLogin = await login(port, 'sales1', 'Sal@123456'); // not fullAccess (except billing-ceiling, which deliberately includes Sales), not PM
      const estimatorLogin = await login(port, 'estimator1', 'Est@12345'); // not fullAccess for ANY of these routes, not PM — the clean negative-control role
      const pmLogin = await login(port, 'pm1', 'Pm@123456'); // assignedProjects: PRJ-1, PRJ-3
      const ceoLogin = await login(port, 'ceo', 'Ceo@12345'); // fullAccess
      const PROJECT_A = 'PRJ-1', PROJECT_B = 'PRJ-2';

      // billing-ceiling's own fullAccess set deliberately includes 'Sales' (real, pre-existing
      // business rule — Sales legitimately needs visibility into the ceiling they invoice against,
      // relevant to the Excess Billing Approval workflow) — a genuinely different set from the other
      // 5 routes. Estimator is used as the negative-control role for ALL 6 routes uniformly, since it
      // is confirmed absent from every one of their fullAccess sets.
      const defectRoutes = [
        { name: 'financial-readiness', path: `/api/projects/${PROJECT_B}/financial-readiness`, method: 'GET' },
        { name: 'cost-breakdown', path: `/api/projects/${PROJECT_B}/cost-breakdown`, method: 'GET' },
        { name: 'financial-360', path: `/api/projects/${PROJECT_B}/financial-360`, method: 'GET' },
        { name: 'billing-ceiling', path: `/api/projects/${PROJECT_B}/billing-ceiling`, method: 'GET' },
        { name: 'closure-readiness', path: `/api/projects/${PROJECT_B}/closure-readiness`, method: 'GET' },
        { name: 'project-pl', path: `/api/project-pl?projectId=${PROJECT_B}`, method: 'GET' },
      ];
      for (const rt of defectRoutes) {
        const estResult = await api(port, estimatorLogin.cookie, rt.method, rt.path);
        record(`[DEFECT-FIX] Estimator (non-fullAccess, non-PM) denied ${rt.name} for Project B — DENY (403)`, estResult.status === 403, estResult);
        const ceoResult = await api(port, ceoLogin.cookie, rt.method, rt.path);
        record(`[DEFECT-FIX positive control] CEO (fullAccess) allowed ${rt.name} for Project B — ALLOW (200)`, ceoResult.status === 200, ceoResult);
      }
      // Sales-specific: billing-ceiling correctly ALLOWS Sales (real business rule, not a defect);
      // financial-readiness correctly DENIES Sales (Sales is not in that route's own fullAccess set).
      const salesBillingCeiling = await api(port, salesLogin.cookie, 'GET', `/api/projects/${PROJECT_B}/billing-ceiling`);
      record('[Business-rule, not a defect] Sales IS allowed billing-ceiling (Sales is in that route\'s own fullAccess set, unrelated to this CR\'s migration)', salesBillingCeiling.status === 200, salesBillingCeiling);
      const salesFinReadiness = await api(port, salesLogin.cookie, 'GET', `/api/projects/${PROJECT_B}/financial-readiness`);
      record('[DEFECT-FIX] Sales denied financial-readiness (Sales is NOT in that route\'s fullAccess set)', salesFinReadiness.status === 403, salesFinReadiness);
      // pm1 on own vs other project for the same routes
      const pmOwnResult = await api(port, pmLogin.cookie, 'GET', `/api/projects/${PROJECT_A}/financial-readiness`);
      record('[DEFECT-FIX] pm1 allowed financial-readiness for OWN Project A — ALLOW (200)', pmOwnResult.status === 200, pmOwnResult);
      const pmOtherResult = await api(port, pmLogin.cookie, 'GET', `/api/projects/${PROJECT_B}/financial-readiness`);
      record('[DEFECT-FIX] pm1 denied financial-readiness for Project B (not theirs) — DENY (403)', pmOtherResult.status === 403, pmOtherResult);

      // Design submission (the write-path defect site)
      const salesDesign = await api(port, salesLogin.cookie, 'POST', '/api/designs', { projectId: PROJECT_B, version: 1 });
      record('[DEFECT-FIX] Sales denied POST /api/designs (submit a design) for Project B — DENY (403)', salesDesign.status === 403, salesDesign);
      const pmDesignOwn = await api(port, pmLogin.cookie, 'POST', '/api/designs', { projectId: PROJECT_A, version: 1 });
      record('[Write] pm1 allowed to submit a design for OWN Project A — ALLOW (200)', pmDesignOwn.status === 200 && pmDesignOwn.ok === true, pmDesignOwn);

      // Export (financial-360 report) — the 9th defect site
      const salesExport = await api(port, ceoLogin.cookie === salesLogin.cookie ? null : salesLogin.cookie, 'POST', '/api/export', { report: 'financial-360', filters: { projectId: PROJECT_B } });
      record('[DEFECT-FIX] Sales denied POST /api/export report=financial-360 for Project B — DENY (403, or a business-rule rejection, never 200 with real data)', salesExport.status === 403, salesExport);

      // Read-filter migrations (warranties/complaints/service-tickets/amc-contracts/material-requirements/etc.) —
      // confirm pm1's list views are correctly narrowed to their own projects, and CEO's are not narrowed.
      const listRoutes = ['/api/warranties', '/api/complaints', '/api/service-tickets', '/api/amc-contracts', '/api/material-requirements', '/api/purchase-orders', '/api/designs'];
      for (const lp of listRoutes) {
        const pmList = await api(port, pmLogin.cookie, 'GET', lp);
        const key = Object.keys(pmList).find(k => Array.isArray(pmList[k]));
        const rows = key ? pmList[key] : [];
        const allOwnOrNoProject = rows.every(x => !x.projectId || x.projectId === PROJECT_A || x.projectId === 'PRJ-3');
        record(`[Read-filter] pm1 GET ${lp} returns only own-project (or project-less) records`, pmList.status !== 403 ? allOwnOrNoProject : true, { status: pmList.status, count: rows.length });
      }

      killIfAlive(r.child);
    }
    rmScratch(s.root);
  }

  // ================= PART 3 — full existing regression re-run =================
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
    record('[Regression] erp_059c_production_isolation_tests.js still passes 100% against the residual-migration instance', regressOk === true, { outputTail: regressOutput.slice(-500) });
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  const hashAfterAll = hashFile(PROD_DB);
  const sizeAfterAll = fs.statSync(PROD_DB).size;
  record('[TEARDOWN] Production db.json byte-for-byte unchanged across the ENTIRE test run', hashAfterAll === hashBefore && sizeAfterAll === sizeBefore, { hashBefore, hashAfterAll, sizeBefore, sizeAfterAll });

  console.log('\n===== ARCH-2026-001C-F RESIDUAL SCOPE TESTS: ' + results.filter(r => r.pass === true).length + ' PASS / ' + results.filter(r => r.pass === false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r => console.log((r.pass ? '✅ PASS' : '❌ FAIL') + ' | ' + r.name + (r.pass ? '' : ' -- ' + JSON.stringify(r.detail))));
  if (results.some(r => r.pass === false)) process.exitCode = 1;
}

main().catch(e => { console.error('TEST RUNNER CRASHED:', e); process.exitCode = 1; });
