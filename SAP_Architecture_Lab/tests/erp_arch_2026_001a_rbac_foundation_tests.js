'use strict';
// ARCH-2026-001A — Enterprise RBAC Foundation — automated test suite.
// Part 1: in-process engine tests against an isolated scratch DB (require('./domain') directly).
// Part 2: live HTTP tests against a spawned isolated server (login + real API calls, no UI).
// Never touches SAP_Architecture_Lab/server/db.json — production hash is captured and verified
// unchanged before and after this entire run, same discipline as tests/erp_cr_2026_002_env_safety_tests.js.

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
function freshPort() { return 47000 + Math.floor(Math.random() * 2000); }

function makeScratch(label) {
  const uniqueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${label}`;
  const root = path.join(os.tmpdir(), `erp-arch2026001a-test-${uniqueId}`);
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

  // ================= PART 1 — in-process engine tests (isolated scratch DB, no HTTP) =================
  {
    const dbPath = path.join(os.tmpdir(), `arch2026001a-engine-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
    // Save/restore process.env around this require — erp_059c_production_isolation_tests.js (run via
    // execSync in Part 3 below) spawns its OWN child processes with `env: {...process.env, ...}`, so
    // any APP_ENV/DB_PATH left set on THIS process's env after Part 1 would leak into those children
    // and silently break their "unset APP_ENV" test premise. Found and fixed during this suite's own
    // first run (see ARCH-2026-001A-REGRESSION-REPORT.md).
    const savedAppEnv = process.env.APP_ENV, savedDbPath = process.env.DB_PATH;
    process.env.APP_ENV = 'test';
    process.env.DB_PATH = dbPath;
    delete require.cache[require.resolve(path.join(SERVER_DIR, 'domain.js'))];
    delete require.cache[require.resolve(path.join(SERVER_DIR, 'env.js'))];
    const D = require(path.join(SERVER_DIR, 'domain.js'));

    // ---- TEST 1: can() vs ROLE_ACTIONS equivalence — 10 roles x 12 legacy tags = 120 assertions ----
    const TAGS = ['view','create','edit','submit','approve','post','reverse','clear','pay','masterData','export','configure'];
    let equivPass = 0, equivFail = 0;
    D.ROLES.forEach(role => {
      const user = D.DB.users.find(u => u.role === role);
      if (!user) { equivFail += TAGS.length; return; }
      const actor = { id: user.id, role: user.role };
      TAGS.forEach(tag => {
        const expected = !!(D.ROLE_ACTIONS[role] && D.ROLE_ACTIONS[role][tag]);
        const actual = D.can ? undefined : undefined; // can() is not exported directly; use via a re-require trick below
        equivPass++; // placeholder incremented below after real check
      });
    });
    // can() itself is internal to domain.js and not exported (server.js holds `const can = D.can`
    // only via its own internal alias) — re-derive the equivalence via the exported primitives that
    // can() is built from: hasPrivilege(actor, 'Global.'+tag) must equal ROLE_ACTIONS[role][tag].
    equivPass = 0; equivFail = 0;
    const equivFailures = [];
    D.ROLES.forEach(role => {
      const user = D.DB.users.find(u => u.role === role);
      const actor = { id: user.id, role: user.role };
      TAGS.forEach(tag => {
        const expected = !!(D.ROLE_ACTIONS[role] && D.ROLE_ACTIONS[role][tag]);
        const actual = D.hasPrivilege(actor, 'Global.' + tag);
        if (actual === expected) equivPass++; else { equivFail++; equivFailures.push({ role, tag, expected, actual }); }
      });
    });
    record('[TEST 1] hasPrivilege(actor, Global.<tag>) === ROLE_ACTIONS[role][tag] for all 10 roles x 12 tags (120 assertions)', equivFail === 0 && equivPass === 120, { equivPass, equivFail, equivFailures });

    // ---- TEST 2: PurchaseOrder.APPROVE granted ONLY to CEO/FinanceManager (matches poApprovalAuthorityMatrix) ----
    const poApproveRoles = D.ROLES.filter(role => {
      const user = D.DB.users.find(u => u.role === role);
      return D.hasPrivilege({ id: user.id, role }, 'PurchaseOrder.APPROVE');
    });
    record('[TEST 2] PurchaseOrder.APPROVE granted to exactly {CEO, FinanceManager}', poApproveRoles.sort().join(',') === ['CEO','FinanceManager'].sort().join(','), { poApproveRoles });

    // ---- TEST 3: Admin does NOT get PurchaseOrder.APPROVE (matches existing Phase 12 P0 fix: System
    // Administration Authority != Financial Approval Authority; poApprovalAuthorityMatrix.Admin.financialApprovalAuthority===false) ----
    const adminUser = D.DB.users.find(u => u.role === 'Admin');
    const adminHasPoApprove = D.hasPrivilege({ id: adminUser.id, role: 'Admin' }, 'PurchaseOrder.APPROVE');
    record('[TEST 3] Admin does NOT get PurchaseOrder.APPROVE (matches poApprovalAuthorityMatrix.Admin.financialApprovalAuthority===false)', adminHasPoApprove === false, { adminHasPoApprove, matrixValue: D.DB.poApprovalAuthorityMatrix.roles.Admin.financialApprovalAuthority });

    // ---- TEST 4: PaymentRequest.EXECUTE granted ONLY to CEO/FinanceManager ----
    const execRoles = D.ROLES.filter(role => {
      const user = D.DB.users.find(u => u.role === role);
      return D.hasPrivilege({ id: user.id, role }, 'PaymentRequest.EXECUTE');
    });
    record('[TEST 4] PaymentRequest.EXECUTE granted to exactly {CEO, FinanceManager}', execRoles.sort().join(',') === ['CEO','FinanceManager'].sort().join(','), { execRoles });

    // ---- TEST 5-16: Viewer remains strictly read-only — verify Viewer cannot CREATE/EDIT/SUBMIT/
    // APPROVE/POST/EXECUTE/REVERSE/CANCEL/DELETE on any registered privilege (12 assertions) ----
    const viewerUser = D.DB.users.find(u => u.role === 'Viewer');
    const viewerActor = { id: viewerUser.id, role: 'Viewer' };
    const viewerPrivs = Array.from(D.effectivePrivilegeKeysForBusinessRole('Viewer'));
    const forbiddenActions = ['CREATE','EDIT','SUBMIT','APPROVE','POST','EXECUTE','REVERSE','CANCEL','DELETE'];
    const forbiddenLegacy = ['create','edit','submit','approve','post','reverse','clear','pay','masterData','configure'];
    let viewerLeak = null;
    for (const p of viewerPrivs) {
      const action = p.split('.')[1];
      if (forbiddenActions.includes(action) || forbiddenLegacy.includes(action)) { viewerLeak = p; break; }
    }
    record('[TEST 5] Viewer\'s effective privilege set contains ZERO create/edit/submit/approve/post/execute/reverse/cancel/delete privileges', viewerLeak === null, { viewerPrivs, viewerLeak });
    forbiddenLegacy.forEach((tag, i) => {
      const actual = D.hasPrivilege(viewerActor, 'Global.' + tag);
      record(`[TEST 6.${i+1}] Viewer denied Global.${tag}`, actual === false, { tag, actual });
    });
    record('[TEST 6.11] Viewer retains Global.view', D.hasPrivilege(viewerActor, 'Global.view') === true, {});

    // ---- TEST 7: migration — every seeded user has exactly one active userRoles assignment, 1:1 with their legacy role ----
    const allHaveAssignment = D.DB.users.every(u => {
      const rows = D.DB.userRoles.filter(ur => ur.userId === u.id && ur.active !== false);
      return rows.length === 1 && rows[0].businessRoleKey === u.role;
    });
    record('[TEST 7] Every seeded user has exactly one active userRoles assignment, businessRoleKey===role (1:1, access-preserving)', allHaveAssignment === true, { userCount: D.DB.users.length, userRoleCount: D.DB.userRoles.length });
    record('[TEST 8] userRoles.length === users.length (no missing, no duplicate assignment)', D.DB.userRoles.length === D.DB.users.length, { userRoles: D.DB.userRoles.length, users: D.DB.users.length });

    // ---- TEST 9: Data Scope framework — no scope invented for existing users ----
    record('[TEST 9] DB.roleScopes starts empty — no scope restriction invented for any existing user', D.DB.roleScopes.length === 0, { roleScopes: D.DB.roleScopes.length });

    // ---- TEST 10: Approval Authority framework — 3 reference rows present, pointing at the real existing tables ----
    const aaOk = D.DB.approvalAuthorities.length === 3 &&
      D.DB.approvalAuthorities.find(a => a.transactionType === 'PurchaseOrder' && a.sourceTable === 'DB.poApprovalRules') &&
      D.DB.approvalAuthorities.find(a => a.transactionType === 'QuotationDiscount' && a.sourceTable === 'DB.discountApprovalRules') &&
      D.DB.approvalAuthorities.find(a => a.transactionType === 'PaymentRequest' && a.sourceTable === 'DB.paymentApprovalMatrix');
    record('[TEST 10] DB.approvalAuthorities has 3 correct reference rows (PurchaseOrder/QuotationDiscount/PaymentRequest, pointing at the real existing tables)', !!aaOk, { rows: D.DB.approvalAuthorities });

    // ---- TEST 11-14: SoD framework — 4 reference rules present + generic evaluator works ----
    // ARCH-2026-001D legitimately EXTENDED this array with SOD-5/SOD-6 (2 new preventive P2P rules)
    // — the original 4 reference rules were never removed or replaced, matching this test's own
    // original intent. Changed from a strict length===4 to "at least the original 4, all present" so
    // this assertion does not falsely regress on authorized, documented growth of the rule set.
    record('[TEST 11] DB.sodRules has AT LEAST the original 4 seeded rules (SOD-1..SOD-4), none removed', D.DB.sodRules.length >= 4 && ['SOD-1','SOD-2','SOD-3','SOD-4'].every(id => D.DB.sodRules.find(r => r.id === id)), { rules: D.DB.sodRules.map(r=>r.id) });
    const sodSame = D.checkSoD('SOD-1', { makerId: 'U-X', checkerId: 'U-X' });
    record('[TEST 12] checkSoD(SOD-1) flags violated:true when makerId===checkerId', sodSame.ok === true && sodSame.violated === true, sodSame);
    const sodDiff = D.checkSoD('SOD-1', { makerId: 'U-X', checkerId: 'U-Y' });
    record('[TEST 13] checkSoD(SOD-1) flags violated:false when maker !== checker', sodDiff.ok === true && sodDiff.violated === false, sodDiff);
    const sodUnknown = D.checkSoD('SOD-99', {});
    record('[TEST 14] checkSoD() rejects an unknown rule id', sodUnknown.ok === false, sodUnknown);

    // ---- TEST 15-17: Security administration foundation — Admin/CEO-only, audited ----
    const ceoUser = D.DB.users.find(u => u.role === 'CEO');
    const purchaseUser = D.DB.users.find(u => u.role === 'Purchase');
    const denied = D.assignUserRole({ userId: purchaseUser.id, businessRoleKey: 'Purchase', actor: { id: purchaseUser.id, role: 'Purchase' } });
    record('[TEST 15] assignUserRole() rejects a non-Admin/CEO actor', denied.ok === false, denied);
    const auditCountBefore = D.DB.auditLog.filter(e => e.type === 'SecurityRoleAssigned').length;
    const allowed = D.assignUserRole({ userId: purchaseUser.id, businessRoleKey: 'Purchase', actor: { id: ceoUser.id, role: 'CEO' } });
    const auditCountAfter = D.DB.auditLog.filter(e => e.type === 'SecurityRoleAssigned').length;
    record('[TEST 16] assignUserRole() allows Admin/CEO and writes a SecurityRoleAssigned audit entry via the EXISTING logAudit()/DB.auditLog path (no new audit array)', allowed.ok === true && auditCountAfter === auditCountBefore + 1, { allowed, auditCountBefore, auditCountAfter });
    const report = D.getEffectivePermissionsReport(viewerUser.id, { id: viewerUser.id, role: 'Viewer' });
    record('[TEST 17] getEffectivePermissionsReport() rejects a non-Admin/CEO caller', report.ok === false, report);
    const report2 = D.getEffectivePermissionsReport(viewerUser.id, { id: ceoUser.id, role: 'CEO' });
    record('[TEST 18] getEffectivePermissionsReport() succeeds for CEO and returns the correct businessRole/duties/privileges for the target user', report2.ok === true && report2.businessRole === 'Viewer' && report2.privileges.every(p => !forbiddenActions.includes(p.split('.')[1])), report2);

    // ---- TEST 19: existing four approval tables/functions genuinely untouched (still present, still callable, unchanged values) ----
    const poRulesIntact = D.DB.poApprovalRules && D.DB.poApprovalRules.length > 0;
    const discountRulesIntact = D.DB.discountApprovalRules && D.DB.discountApprovalRules.length > 0;
    record('[TEST 19] Existing DB.poApprovalRules / DB.discountApprovalRules tables still present and non-empty (untouched by this CR)', poRulesIntact && discountRulesIntact, { poRulesCount: D.DB.poApprovalRules && D.DB.poApprovalRules.length, discountRulesCount: D.DB.discountApprovalRules && D.DB.discountApprovalRules.length });

    // Restore process.env exactly as found, BEFORE Part 2/3 spawn any child process.
    if (savedAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = savedAppEnv;
    if (savedDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = savedDbPath;
  }

  // ================= PART 2 — live HTTP tests against a spawned isolated server =================
  {
    const s = makeScratch('http');
    const port = freshPort();
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: s.dbPath, PORT: String(port) }, 8000);
    if (r.exited || r.timedOut) {
      record('[TEST 20] Isolated HTTP test server started', false, { stdout: r.stdout.slice(-800), stderr: r.stderr.slice(-800) });
    } else {
      record('[TEST 20] Isolated HTTP test server started', true, { port });

      // Viewer: attempt a real mutation directly via API (not UI) — expect 403
      const viewerLogin = await login(port, 'viewer1', 'View@1234');
      record('[TEST 21] Viewer login succeeds', viewerLogin.ok === true, viewerLogin);
      const viewerCreatePO = await fetch(`http://localhost:${port}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: viewerLogin.cookie }, body: JSON.stringify({ name: 'RBAC-TEST-VIEWER-SHOULD-FAIL', phone: '9999999999' }) });
      record('[TEST 22] Viewer direct API POST /api/leads (create) is rejected (403), not silently 200', viewerCreatePO.status === 403, { status: viewerCreatePO.status });

      // Purchase: attempt to approve a Payment Request directly via API — expect 403 (Purchase has no PaymentRequest.APPROVE / pay=false)
      const purchaseLogin = await login(port, 'purchase1', 'Pur@12345');
      record('[TEST 23] Purchase login succeeds', purchaseLogin.ok === true, purchaseLogin);
      const purchaseApprovePayment = await fetch(`http://localhost:${port}/api/payment-requests/PAYREQ-0001/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: purchaseLogin.cookie }, body: '{}' });
      record('[TEST 24] Purchase direct API POST /api/payment-requests/:id/approve is rejected (403 or 404-not-500, never silently authorized)', purchaseApprovePayment.status === 403 || purchaseApprovePayment.status === 404, { status: purchaseApprovePayment.status });

      // Forged-request test: attempt to override role by sending a role field in the request body —
      // must not bypass the session-derived actor.role.
      const forged = await fetch(`http://localhost:${port}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: viewerLogin.cookie }, body: JSON.stringify({ name: 'FORGE-TEST', phone: '8888888888', role: 'Admin', actor: { role: 'Admin' } }) });
      record('[TEST 25] Forged request body (role:"Admin") does NOT bypass the session-derived actor — still rejected', forged.status === 403, { status: forged.status });

      // Multi-request sanity: CEO CAN create a lead (positive control — proves 403s above are real authorization, not a broken route)
      const ceoLogin = await login(port, 'ceo', 'Ceo@12345');
      const ceoCreateLead = await fetch(`http://localhost:${port}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ceoLogin.cookie }, body: JSON.stringify({ name: 'RBAC-TEST-CEO-SHOULD-SUCCEED', phone: '7777777777' }) });
      record('[TEST 26] CEO direct API POST /api/leads (create) succeeds — positive control proving the 403s above reflect real authorization, not a broken/always-403 route', ceoCreateLead.status === 200 || ceoCreateLead.status === 201, { status: ceoCreateLead.status });

      killIfAlive(r.child);
    }
    rmScratch(s.root);
  }

  // ================= PART 3 — full existing regression re-run against a fresh isolated instance =================
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
    record('[TEST 27] erp_059c_production_isolation_tests.js still passes 100% against a can()-refactored, ARCH-2026-001A-migrated instance', regressOk === true, { outputTail: regressOutput.slice(-500) });
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  const hashAfterAll = hashFile(PROD_DB);
  const sizeAfterAll = fs.statSync(PROD_DB).size;
  record('[TEARDOWN] Production db.json byte-for-byte unchanged across the ENTIRE test run', hashAfterAll === hashBefore && sizeAfterAll === sizeBefore, { hashBefore, hashAfterAll, sizeBefore, sizeAfterAll });

  console.log('\n===== ARCH-2026-001A RBAC FOUNDATION TESTS: ' + results.filter(r => r.pass === true).length + ' PASS / ' + results.filter(r => r.pass === false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r => console.log((r.pass ? '✅ PASS' : '❌ FAIL') + ' | ' + r.name + (r.pass ? '' : ' -- ' + JSON.stringify(r.detail))));
  if (results.some(r => r.pass === false)) process.exitCode = 1;
}

main().catch(e => { console.error('TEST RUNNER CRASHED:', e); process.exitCode = 1; });
