'use strict';
// ERP-059C — Step 9 permanent safety test. Proves the incident (a hardcoded-port test file
// wiping the real production database via /api/test/reset) cannot recur, by exercising the new
// APP_ENV mechanism against two REAL, disposable server instances this test itself starts:
//   - a "production-shaped" instance (APP_ENV unset, i.e. the fail-closed default — this is
//     deliberately NOT told to run as APP_ENV=production explicitly, because the exact incident
//     scenario was a server nobody had configured as anything in particular)
//   - a real APP_ENV=test instance, to prove the guard is not simply broken/always-on
//
// This is a safety test, not a production-data test: both instances are spawned by this file
// against their own scratch directories/ports, never against the real server/db.json. It must be
// run with TEST_BASE_URL unset for these two instances (they are spawned directly, not addressed
// via the usual preflight convention) — see the two constants below.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const results = [];
function record(name, pass, detail){ results.push({name, pass, detail}); }

const SERVER_JS = path.join(__dirname, '..', 'server', 'server.js');
const UNSET_ENV_PORT = 4098;
const TEST_ENV_PORT = 4099;

function startServer(env, port, dbPath){
  return new Promise((resolve, reject) => {
    // ERP-059C — each spawned instance gets an EXPLICIT, disposable DB_PATH (see the DB_PATH
    // support added to server/domain.js this same phase). Earlier draft of this test spawned
    // server.js with only a different `cwd`, wrongly assuming that would isolate the database —
    // it does not: domain.js resolves DB_FILE relative to its OWN file location (__dirname), not
    // the process cwd, so that draft briefly ran a real server bound to the REAL server/db.json
    // (caught, investigated, and disclosed in ERP-059C-PRODUCTION-SAFETY-REPORT.md — no data was
    // written, but a stale lock file was left behind and had to be cleaned up). DB_PATH closes
    // this properly: it does not matter where this process's cwd is, only DB_PATH governs which
    // file gets read/written.
    const child = spawn(process.execPath, [SERVER_JS], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => out += d.toString());
    const timer = setTimeout(() => { reject(new Error('Server did not start within 10s. Output so far:\n' + out)); }, 10000);
    const check = setInterval(() => {
      if(out.includes('listening on http://localhost:'+port)){
        clearInterval(check); clearTimeout(timer);
        resolve({ child, getOutput: () => out });
      }
    }, 150);
  });
}

async function main(){
  // Two disposable scratch DB files — explicit DB_PATH, never the real server/db.json.
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'erp059c-unset-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'erp059c-test-'));
  const dbA = path.join(dirA, 'db.json');
  const dbB = path.join(dirB, 'db.json');

  console.log('[SAFETY TEST] production-shaped instance DB_PATH:', dbA);
  console.log('[SAFETY TEST] APP_ENV=test instance DB_PATH:', dbB);

  let prod, test;
  try {
    // APP_ENV deliberately left UNSET on the "production-shaped" instance — the incident this
    // phase responds to happened on a server nobody had explicitly configured as anything, which
    // is exactly the fail-closed default case this test needs to prove is safe. DB_PATH is still
    // given explicitly so THIS TEST doesn't repeat its own earlier mistake of touching the real file.
    prod = await startServer({}, UNSET_ENV_PORT, dbA);
    test = await startServer({ APP_ENV: 'test' }, TEST_ENV_PORT, dbB);
    const PROD_BASE = `http://localhost:${UNSET_ENV_PORT}`;
    const TEST_BASE = `http://localhost:${TEST_ENV_PORT}`;

    // 1. Environment identity is correctly distinguishable and readable without auth.
    const prodEnv = await (await fetch(PROD_BASE + '/api/system/environment')).json();
    record('1. Unset-APP_ENV instance reports appEnv="production" (fail-closed default)', prodEnv.appEnv === 'production' && prodEnv.destructiveTestEndpointsEnabled === false, prodEnv);
    const testEnv = await (await fetch(TEST_BASE + '/api/system/environment')).json();
    record('2. APP_ENV=test instance reports appEnv="test", destructive endpoints enabled', testEnv.appEnv === 'test' && testEnv.destructiveTestEndpointsEnabled === true, testEnv);

    // 2. Log in as a real Admin on the production-shaped instance — this is exactly the incident's
    // own precondition (a valid Admin session existed; that alone was enough to fire the reset).
    const loginRes = await fetch(PROD_BASE + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'admin', password:'Admin@12345'}) });
    const cookie = (loginRes.headers.get('set-cookie')||'').split(';')[0];
    const loginBody = await loginRes.json();
    record('3. Admin login succeeds on the production-shaped instance (proves the guard is NOT an auth bypass — it is a separate, additional gate)', loginBody.ok === true, loginBody);

    // 3. Create a real, identifiable marker record, so we can prove the reset genuinely never ran
    // (rather than merely returning an error while secretly still wiping the DB).
    const markerRes = await fetch(PROD_BASE + '/api/leads', { method:'POST', headers:{'Content-Type':'application/json', Cookie:cookie}, body: JSON.stringify({name:'ERP-059C Safety Test Marker', source:'Referral', contact:'9990001111', requirement:'Safety test marker record'}) });
    const markerBody = await markerRes.json();
    const markerCreated = markerRes.status === 200 && markerBody.ok === true && markerBody.lead && markerBody.lead.id;
    record('4. Setup: created a real marker record on the production-shaped instance to prove against', markerCreated, markerBody);

    // 4. THE CORE ASSERTION — attempt the exact incident action (an authenticated Admin calling
    // /api/test/reset) against the production-shaped instance. Must be rejected.
    const resetRes = await fetch(PROD_BASE + '/api/test/reset', { method:'POST', headers:{'Content-Type':'application/json', Cookie:cookie} });
    const resetBody = await resetRes.json();
    record('5. /api/test/reset is REJECTED (403) on the production-shaped instance despite a valid Admin session', resetRes.status === 403 && resetBody.ok === false, resetBody);

    // 5. Prove the rejection was not merely cosmetic: the marker record must still exist.
    const leadsRes = await fetch(PROD_BASE + '/api/leads', { headers:{ Cookie:cookie } });
    const leadsBody = await leadsRes.json();
    const markerStillExists = (leadsBody.leads||leadsBody.rows||[]).some(l => l.name === 'ERP-059C Safety Test Marker');
    record('6. No production DB mutation occurred: the marker record created in step 4 still exists after the blocked reset attempt', markerStillExists, {found: markerStillExists});

    // 6. The rejection itself produced a durable, surviving audit record (Step 4's "rejection must
    // be audited" requirement) — attributed to the real actor, not anonymous.
    const auditRes = await fetch(PROD_BASE + '/api/audit-log', { headers:{ Cookie:cookie } });
    const auditBody = await auditRes.json();
    const auditEntries = (auditBody.entries||auditBody.auditLog||auditBody.log||[]);
    const blockedEntry = auditEntries.find(e => e.type === 'DestructiveTestEndpointBlocked' && e.path === '/api/test/reset');
    record('7. A clear diagnostic audit entry explains why execution was blocked, attributed to the real actor', !!blockedEntry && blockedEntry.userId === 'U-ADMIN' && blockedEntry.appEnv === 'production', blockedEntry);

    // 7. Every other destructive test endpoint is rejected the same way, not just /api/test/reset.
    const otherEndpoints = [
      ['POST','/api/test/set-fault', {point:'x'}],
      ['POST','/api/test/set-crash', {point:'x'}],
      ['POST','/api/test/set-enforce-transaction-boundary', {enforce:true}],
      ['POST','/api/test/set-skip-rollback', {skip:true}],
    ];
    let allOthersBlocked = true;
    const otherResults = [];
    for(const [method, p, body] of otherEndpoints){
      const r = await fetch(PROD_BASE + p, { method, headers:{'Content-Type':'application/json', Cookie:cookie}, body: JSON.stringify(body) });
      const ok = r.status === 403;
      otherResults.push({path:p, status:r.status});
      if(!ok) allOthersBlocked = false;
    }
    record('8. Every other destructive test-only endpoint is also rejected (403) on the production-shaped instance', allOthersBlocked, otherResults);

    // 8. Sanity/negative-of-negative: the SAME reset call succeeds on the real APP_ENV=test instance,
    // proving this is a genuine environment gate, not a global kill-switch that would silently
    // disable legitimate test infrastructure too.
    const testLoginRes = await fetch(TEST_BASE + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'admin', password:'Admin@12345'}) });
    const testCookie = (testLoginRes.headers.get('set-cookie')||'').split(';')[0];
    const testResetRes = await fetch(TEST_BASE + '/api/test/reset', { method:'POST', headers:{'Content-Type':'application/json', Cookie:testCookie} });
    const testResetBody = await testResetRes.json();
    record('9. The identical /api/test/reset call SUCCEEDS on the real APP_ENV=test instance (the gate is a real environment check, not a broken/always-off switch)', testResetRes.status === 200 && testResetBody.ok === true, testResetBody);

    // 9. Non-destructive, ordinary endpoints are unaffected by this phase's change (no over-blocking).
    const ordinaryRes = await fetch(PROD_BASE + '/api/trial-balance', { headers:{ Cookie:cookie } });
    const ordinaryBody = await ordinaryRes.json();
    record('10. Normal application endpoints remain unaffected (e.g. /api/trial-balance still works on the production-shaped instance)', ordinaryRes.status === 200 && ordinaryBody.ok === true, {status: ordinaryRes.status});

  } finally {
    if(prod) prod.child.kill();
    if(test) test.child.kill();
  }

  console.log('\n================ ERP-059C PRODUCTION-TARGET REJECTION TEST ================\n');
  let pass = 0, fail = 0;
  for(const r of results){
    console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'} | ${r.name}`);
    if(!r.pass) console.log('    detail:', JSON.stringify(r.detail));
    r.pass ? pass++ : fail++;
  }
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('SAFETY TEST HARNESS ERROR:', e); process.exit(2); });
