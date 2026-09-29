'use strict';
// ARCH-2026-001C — Data Scope Enforcement — automated test suite.
// Part 1: in-process engine tests (hasScopeAccess/resolveResourceScope equivalence + inheritance).
// Part 2: live HTTP tests against a spawned isolated server, using REAL data created through the
// API (a fresh test user, real projects/sites already in the seed, real tasks/timesheets/risk
// entries/AR invoices created live) — never faking a scope result by editing authorization code
// mid-test, per this CR's own §15. Never touches SAP_Architecture_Lab/server/db.json.

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
function freshPort() { return 50000 + Math.floor(Math.random() * 900); }

function makeScratch(label) {
  const uniqueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${label}`;
  const root = path.join(os.tmpdir(), `erp-arch2026001c-test-${uniqueId}`);
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

  // ================= PART 1 — in-process engine tests =================
  {
    const dbPath = path.join(os.tmpdir(), `arch2026001c-engine-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
    const savedAppEnv = process.env.APP_ENV, savedDbPath = process.env.DB_PATH;
    process.env.APP_ENV = 'test';
    process.env.DB_PATH = dbPath;
    delete require.cache[require.resolve(path.join(SERVER_DIR, 'domain.js'))];
    delete require.cache[require.resolve(path.join(SERVER_DIR, 'env.js'))];
    const D = require(path.join(SERVER_DIR, 'domain.js'));

    function actorFor(user) { return { id: user.id, role: user.role, assignedProjects: user.assignedProjects, assignedCustomers: user.assignedCustomers, assignedBranches: user.assignedBranches }; }
    const pm = D.DB.users.find(u => u.role === 'ProjectManager'); // seeded assignedProjects: ['PRJ-1','PRJ-3']
    const pmActor = actorFor(pm);
    const sales = D.DB.users.find(u => u.role === 'Sales'); // seeded assignedCustomers: ['CUST-1','CUST-2','CUST-3']
    const salesActor = actorFor(sales);
    const ceoActor = actorFor(D.DB.users.find(u => u.role === 'CEO'));
    const viewerActor = actorFor(D.DB.users.find(u => u.role === 'Viewer'));

    record('[A] Correct scope — PM own project (PRJ-1) — ALLOW', D.hasScopeAccess(pmActor, 'Project', 'PRJ-1') === true, {});
    record('[B] Wrong project — PM attempts PRJ-2 (not assigned, not manager of) — DENY', D.hasScopeAccess(pmActor, 'Project', 'PRJ-2') === false, {});
    record('[G] Correct branch — no assignedBranches set (existing precedent: unrestricted) — ALLOW', D.hasScopeAccess(pmActor, 'Branch', 'BR-ANY') === true, {});
    record('[G2] Correct project (second assigned project, PRJ-3) — ALLOW', D.hasScopeAccess(pmActor, 'Project', 'PRJ-3') === true, {});
    record('[Global-unrestricted] CEO unrestricted across Project dimension (role is not the restricted one)', D.hasScopeAccess(ceoActor, 'Project', 'PRJ-2') === true, {});
    record('[Global-unrestricted] Viewer unrestricted across Project dimension (role is not the restricted one — matches existing precedent, Viewer was never scope-gated by any of the 78 original checks)', D.hasScopeAccess(viewerActor, 'Project', 'PRJ-2') === true, {});
    record('[Customer] Sales own customer (CUST-1) — ALLOW', D.hasScopeAccess(salesActor, 'Customer', 'CUST-1') === true, {});
    record('[Customer] Sales wrong customer (CUST-4, not assigned) — DENY', D.hasScopeAccess(salesActor, 'Customer', 'CUST-4') === false, {});
    record('[Missing-scope] hasScopeAccess with no scopeId (falsy) — ALLOW (nothing to check against — matches every original check\'s own `if(!x) return true`-style guard)', D.hasScopeAccess(pmActor, 'Project', null) === true, {});

    // ---- resolveResourceScope / assertScopeAccess — inheritance proof (§13's own named example) ----
    const project1 = D.DB.projects.find(p => p.id === 'PRJ-1');
    record('[Inheritance] resolveResourceScope(Project) resolves the project itself', JSON.stringify(D.resolveResourceScope('Project', project1)) === JSON.stringify({ Project: 'PRJ-1' }), {});
    // Real PaymentRequest inheritance: a fresh scratch DB starts with zero posted journal entries
    // (freshDB() seeds journalEntries:[]), so first create a REAL supplier bill against a REAL
    // project (draftSupplierInvoice, the same function this application's own AP module uses), then
    // a REAL payment request against it (createPaymentRequest), then confirm resolveResourceScope
    // walks PaymentRequest -> JournalEntry line -> projectId to the SAME authoritative value
    // supplierOpenItems() itself reports — proving the multi-hop inheritance chain named in this
    // CR's own §13 example (Payment Request -> Supplier Bill -> ... -> Project).
    const purchaseUser = D.DB.users.find(u => u.role === 'Purchase');
    // Some vendors are goods-category (require PO/GRN 3-way match — a real P0-3 control this test
    // must not bypass); try each seeded vendor until one accepts a direct, non-PO service bill.
    let vendor = null, billResult = { ok: false };
    for (const v of D.DB.vendors) {
      const attempt = D.draftSupplierInvoice({ vendorId: v.id, projectId: 'PRJ-1', baseAmount: 5000, taxCode: 'GST18', date: '2026-09-21', narration: 'ARCH-2026-001C inheritance test bill', createdByUserId: purchaseUser.id, createdByRole: 'Purchase' });
      if (attempt.ok) { vendor = v; billResult = attempt; break; }
    }
    let inheritanceProven = false, inheritanceDetail = { billResult };
    if (billResult.ok) {
      // draftSupplierInvoice() returns a DRAFT, not yet a real journal entry — walk the real
      // Submit -> Approve -> Post lifecycle (the same one every supplier bill in this application
      // goes through) before supplierOpenItems() will see it. CEO approves/posts to trivially
      // satisfy the (unrelated, untouched) SoD self-approval exemption.
      const ceoUser = D.DB.users.find(u => u.role === 'CEO');
      const ceoActor2 = { id: ceoUser.id, role: 'CEO' };
      D.submitDraft(billResult.draft.id, purchaseUser);
      D.approveDraft(billResult.draft.id, ceoActor2);
      // postDraft() posts a real GL entry and must run inside the same transaction boundary every
      // mutation route opens automatically — reproduced here directly since this is an in-process
      // engine test, not a route call.
      const postResult = D.withTransaction(ceoActor2, { name: 'ARCH-2026-001C-inheritance-test-post' }, () => D.postDraft(billResult.draft.id, ceoActor2));
      inheritanceDetail.postResult = postResult;
      const postedEntryId = postResult.ok ? (postResult.entry ? postResult.entry.id : postResult.draft && postResult.draft.postedEntryId) : null;
      const openItems = D.supplierOpenItems(vendor.id).filter(i => i.entryId === postedEntryId);
      const item = openItems[0];
      if (item) {
        const prResult = D.createPaymentRequest({ vendorId: vendor.id, invoiceEntryId: item.entryId, amount: Math.min(1, item.open), narration: 'ARCH-2026-001C inheritance test', actor: { id: purchaseUser.id, role: 'Purchase' } });
        if (prResult.ok) {
          const resolved = D.resolveResourceScope('PaymentRequest', prResult.paymentRequest);
          inheritanceProven = resolved.Project === item.projectId && item.projectId === 'PRJ-1';
          inheritanceDetail = { expected: item.projectId, resolved: resolved.Project, vendorId: vendor.id };
        } else { inheritanceDetail = { prResult }; }
      }
    }
    record('[Inheritance] resolveResourceScope(PaymentRequest) correctly walks PaymentRequest -> JournalEntry line -> projectId (the SAME value supplierOpenItems() itself reports), proving real multi-hop inheritance against a REAL created record', inheritanceProven, inheritanceDetail);

    if (savedAppEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = savedAppEnv;
    if (savedDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = savedDbPath;
  }

  // ================= PART 2 — live HTTP tests, real created data, no UI =================
  {
    const s = makeScratch('http');
    const port = freshPort();
    const r = await spawnServer(s.serverDir, { APP_ENV: 'test', DB_PATH: s.dbPath, PORT: String(port) }, 8000);
    if (r.exited || r.timedOut) {
      record('[SETUP] Isolated HTTP test server started', false, { stdout: r.stdout.slice(-800), stderr: r.stderr.slice(-800) });
    } else {
      record('[SETUP] Isolated HTTP test server started', true, { port });

      const adminLogin = await login(port, 'admin', 'Admin@12345');
      const pmLogin = await login(port, 'pm1', 'Pm@123456'); // seeded assignedProjects: PRJ-1, PRJ-3
      const salesLogin = await login(port, 'sales1', 'Sal@123456'); // seeded assignedCustomers: CUST-1..3
      const sales2Login = await login(port, 'sales2', 'Sal2@12345'); // seeded assignedCustomers: CUST-4, CUST-5
      const ceoLogin = await login(port, 'ceo', 'Ceo@12345');

      // ---- Real test data: Project A = PRJ-1 (pm1 IS assigned — real, pre-existing application
      // record). Project B = PRJ-2 (pm1 is NOT assigned — equally real, pre-existing record). A
      // brand-new "Project C"-equivalent is not creatable directly (this application creates
      // Projects only via the Lead->Quotation->Won pipeline, confirmed by inspection — no direct
      // POST /api/projects route exists) — using two distinct REAL seeded projects with a REAL,
      // already-assigned test user (pm1) satisfies "real application records," documented here
      // rather than silently assumed. ----
      const PROJECT_A = 'PRJ-1', PROJECT_B = 'PRJ-2';

      // [C] Correct project — ALLOW: pm1 creates a task on Project A
      const taskA = await api(port, pmLogin.cookie, 'POST', '/api/tasks', { projectId: PROJECT_A, title: 'ARCH-2026-001C scope test task A', description: 'test' });
      record('[C/M] pm1 (Project A scope) creates a task on Project A via direct API — ALLOW', taskA.status === 200 && taskA.ok === true, taskA);

      // [B/M] Wrong project — DENY: pm1 attempts a task on Project B (direct API, not UI)
      const taskB = await api(port, pmLogin.cookie, 'POST', '/api/tasks', { projectId: PROJECT_B, title: 'ARCH-2026-001C scope test task B — should be denied', description: 'test' });
      record('[B/M] pm1 (Project A scope only) attempts a task on Project B via direct API — DENY (403)', taskB.status === 403, taskB);

      // [L] ID-tampering: create a task on Project A, then attempt to change its status while
      // impersonating via a tampered id — the route resolves scope from the DB record (t.projectId),
      // not from any client-supplied project value, so this must still be denied for Project B tasks.
      const taskBviaAdmin = await api(port, adminLogin.cookie, 'POST', '/api/tasks', { projectId: PROJECT_B, title: 'Admin-created Project B task', description: 'test' });
      record('[setup] Admin creates a real Project B task (for the ID-tamper test below)', taskBviaAdmin.status === 200 && taskBviaAdmin.ok === true, taskBviaAdmin);
      const taskBId = taskBviaAdmin.task && taskBviaAdmin.task.id;
      const tamperAttempt = await api(port, pmLogin.cookie, 'POST', `/api/tasks/${taskBId}/status`, { status: 'InProgress' });
      record('[L] pm1 attempts to change status of a REAL Project B task by its real ID (server resolves scope from the DB record, not a client field) — DENY (403)', tamperAttempt.status === 403, tamperAttempt);

      // [N] Forged scope payload: pm1 submits a task creation for Project B but ALSO forges a fake
      // "projectId" look-alike field or duplicate parameter — server must still resolve the real
      // projectId field and deny.
      const forged = await api(port, pmLogin.cookie, 'POST', '/api/tasks', { projectId: PROJECT_B, title: 'forged', description: 'test', scopeOverride: 'PRJ-1', __proto__scope: 'PRJ-1' });
      record('[N] Forged extra scope-looking fields do not bypass the real projectId check — DENY (403)', forged.status === 403, forged);

      // [M] Direct API access — same result as browser would get (this whole suite IS direct API,
      // never through client_secure/index.html, proving the server is the real boundary).
      const readTasksAsPM = await api(port, pmLogin.cookie, 'GET', '/api/tasks');
      const pmSeesOnlyOwn = Array.isArray(readTasksAsPM.tasks) && readTasksAsPM.tasks.every(t => t.projectId === PROJECT_A);
      record('[Read-filter] pm1 GET /api/tasks returns ONLY Project A tasks, never Project B (list-level scope enforcement)', pmSeesOnlyOwn === true, { count: readTasksAsPM.tasks && readTasksAsPM.tasks.length, projects: readTasksAsPM.tasks && [...new Set(readTasksAsPM.tasks.map(t=>t.projectId))] });

      // ---- Customer dimension — real cross-customer test via AR invoice creation ----
      const invoiceOwnCustomer = await api(port, salesLogin.cookie, 'POST', '/api/ar/invoice', { customerId: 'CUST-1', projectId: PROJECT_A, baseAmount: 1000, taxCode: 'GST18', date: '2026-09-21', narration: 'ARCH-2026-001C scope test' });
      record('[Customer-ALLOW] sales1 (assigned CUST-1) creates an AR invoice for CUST-1 — ALLOW (200/201, or a real business-rule 400, never 403)', invoiceOwnCustomer.status !== 403, invoiceOwnCustomer);
      const invoiceWrongCustomer = await api(port, salesLogin.cookie, 'POST', '/api/ar/invoice', { customerId: 'CUST-4', projectId: PROJECT_A, baseAmount: 1000, taxCode: 'GST18', date: '2026-09-21', narration: 'ARCH-2026-001C scope test — should be denied' });
      record('[Customer-DENY] sales1 (NOT assigned CUST-4) attempts an AR invoice for CUST-4 — DENY (403)', invoiceWrongCustomer.status === 403, invoiceWrongCustomer);
      const invoiceOtherSalesOwnCustomer = await api(port, sales2Login.cookie, 'POST', '/api/ar/invoice', { customerId: 'CUST-4', projectId: PROJECT_A, baseAmount: 1000, taxCode: 'GST18', date: '2026-09-21', narration: 'ARCH-2026-001C scope test — sales2 owns CUST-4' });
      record('[Customer-ALLOW] sales2 (assigned CUST-4) creates an AR invoice for CUST-4 — ALLOW (not 403)', invoiceOtherSalesOwnCustomer.status !== 403, invoiceOtherSalesOwnCustomer);

      // ---- Risk register — full write-path scope proof (create + close, cross-project) ----
      const riskA = await api(port, pmLogin.cookie, 'POST', '/api/risk-register', { projectId: PROJECT_A, description: 'ARCH-2026-001C scope test risk', severity: 'Low', likelihood: 'Low' });
      record('[Write-CRUD] pm1 creates a risk entry for Project A — ALLOW', riskA.status === 200 && riskA.ok === true, riskA);
      const riskB = await api(port, pmLogin.cookie, 'POST', '/api/risk-register', { projectId: PROJECT_B, description: 'ARCH-2026-001C scope test risk — should be denied', severity: 'Low', likelihood: 'Low' });
      record('[Write-CRUD] pm1 attempts a risk entry for Project B — DENY (403)', riskB.status === 403, riskB);
      if (riskA.ok && riskA.risk) {
        const closeOwnRisk = await api(port, pmLogin.cookie, 'POST', `/api/risk-register/${riskA.risk.id}/close`, {});
        record('[Write-CRUD] pm1 closes their OWN Project A risk entry — ALLOW', closeOwnRisk.status === 200 && closeOwnRisk.ok === true, closeOwnRisk);
      }
      const riskBByAdmin = await api(port, adminLogin.cookie, 'POST', '/api/risk-register', { projectId: PROJECT_B, description: 'Admin-created Project B risk (for cross-project close test)', severity: 'Low', likelihood: 'Low' });
      if (riskBByAdmin.ok && riskBByAdmin.risk) {
        const closeOthersRisk = await api(port, pmLogin.cookie, 'POST', `/api/risk-register/${riskBByAdmin.risk.id}/close`, {});
        record('[Write-CRUD] pm1 attempts to close a REAL Project B risk entry (created by Admin) — DENY (403), scope resolved from the DB record', closeOthersRisk.status === 403, closeOthersRisk);
      }

      // ---- Timesheet — same cross-project pattern, a different resource ----
      const tsA = await api(port, pmLogin.cookie, 'POST', '/api/timesheet', { projectId: PROJECT_A, workerName: 'ARCH-2026-001C Test Worker', date: '2026-09-21', hours: 2, task: 'scope test' });
      record('[Write-CRUD] pm1 logs a timesheet entry for Project A — ALLOW', tsA.status === 200 && tsA.ok === true, tsA);
      const tsB = await api(port, pmLogin.cookie, 'POST', '/api/timesheet', { projectId: PROJECT_B, workerName: 'ARCH-2026-001C Test Worker', date: '2026-09-21', hours: 2, task: 'scope test — should be denied' });
      record('[Write-CRUD] pm1 attempts a timesheet entry for Project B — DENY (403)', tsB.status === 403, tsB);

      // ---- Missing authentication / API bypass ----
      const noAuthTask = await api(port, null, 'POST', '/api/tasks', { projectId: PROJECT_A, title: 'no auth', description: 'x' });
      record('[Missing-auth] POST /api/tasks with no session cookie — DENY (401/403, never 200)', noAuthTask.status === 401 || noAuthTask.status === 403, noAuthTask);

      // ---- CEO/Admin unrestricted across Project dimension (existing, unchanged precedent) ----
      const taskByCEOonB = await api(port, ceoLogin.cookie, 'POST', '/api/tasks', { projectId: PROJECT_B, title: 'CEO task on Project B', description: 'test' });
      record('[Global-unrestricted] CEO creates a task on Project B — ALLOW (CEO is not the Project-restricted role, matches pre-existing behavior)', taskByCEOonB.status === 200 && taskByCEOonB.ok === true, taskByCEOonB);

      killIfAlive(r.child);
    }
    rmScratch(s.root);
  }

  // ================= PART 3 — regression re-run (proves this CR did not regress 001A/001B) =================
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
    record('[Regression] erp_059c_production_isolation_tests.js still passes 100% against the scope-migrated instance', regressOk === true, { outputTail: regressOutput.slice(-500) });
    killIfAlive(r.child);
    rmScratch(s.root);
  }

  const hashAfterAll = hashFile(PROD_DB);
  const sizeAfterAll = fs.statSync(PROD_DB).size;
  record('[TEARDOWN] Production db.json byte-for-byte unchanged across the ENTIRE test run', hashAfterAll === hashBefore && sizeAfterAll === sizeBefore, { hashBefore, hashAfterAll, sizeBefore, sizeAfterAll });

  console.log('\n===== ARCH-2026-001C DATA SCOPE TESTS: ' + results.filter(r => r.pass === true).length + ' PASS / ' + results.filter(r => r.pass === false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r => console.log((r.pass ? '✅ PASS' : '❌ FAIL') + ' | ' + r.name + (r.pass ? '' : ' -- ' + JSON.stringify(r.detail))));
  if (results.some(r => r.pass === false)) process.exitCode = 1;
}

main().catch(e => { console.error('TEST RUNNER CRASHED:', e); process.exitCode = 1; });
