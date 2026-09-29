'use strict';
// ERP-059 permanent security regression suite, part 2 — restart/lock-expiry persistence
// (items 9-12 of the Phase ERP-059A matrix). This script coordinates its own server process
// restart against a disposable, isolated directory — it must be run with Node's ability to
// spawn/kill a local process, and MUST be pointed at a scratch directory, never the real
// server/ directory. Usage:
//   node erp_059_restart_persistence_tests.js <isolated-server-dir> <port>
'use strict';
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const serverDir = process.argv[2];
const port = process.argv[3] || '4093';
if(!serverDir){ console.error('Usage: node erp_059_restart_persistence_tests.js <isolated-server-dir> <port>'); process.exit(2); }
const BASE = `http://localhost:${port}`;
const dbPath = path.join(serverDir, 'db.json');
const results = [];
function record(n, name, pass, detail){ results.push({n, name, pass, detail}); }

const jars = {};
async function login(u,p){ const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return {status:r.status, ...(await r.json().catch(()=>({})))}; }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r = await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

function startServer(){
  // ERP-059C — this suite spawns its own server instance and predates the APP_ENV/DB_PATH gating
  // added this phase (see docs/erp-remediation/phases/ERP-059C-TEST-ISOLATION-REPORT.md). Without
  // these, the spawned server now defaults to APP_ENV=production (fail-closed default) and its
  // /api/test/reset calls below would be rejected with 403. DB_PATH is also required now whenever
  // APP_ENV=test; pointing it explicitly at this same serverDir keeps the isolation this file
  // already had (cwd=serverDir), just made explicit instead of implicit.
  const child = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    env: { ...process.env, APP_ENV: 'test', DB_PATH: dbPath, PORT: port },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return child;
}
function stopServer(child){
  execSync(`taskkill /F /PID ${child.pid}`, { stdio: 'ignore' });
}
function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function main(){
  // Fresh start
  try{ fs.unlinkSync(dbPath); }catch(e){}
  try{ fs.unlinkSync(dbPath+'.bak'); }catch(e){}
  try{ fs.unlinkSync(dbPath+'.lock'); }catch(e){}
  let child = startServer();
  await wait(2000);

  await login('admin','Admin@12345');
  await api('admin','POST','/api/test/reset');
  await login('admin','Admin@12345');

  // Trigger a lock on 'site1'
  for(let i=0;i<5;i++) await login('site1','wrong'+i);
  const dbBefore = JSON.parse(fs.readFileSync(dbPath,'utf8'));
  const uBefore = dbBefore.users.find(x=>x.username==='site1');
  record('pre', 'Lock triggered before restart (setup, not a numbered matrix item)', !!uBefore.lockedUntil, {lockedUntil: uBefore.lockedUntil});

  // 9. Lock remains after server restart
  stopServer(child);
  await wait(1000);
  child = startServer();
  await wait(2000);
  const lockedAttempt = await login('site1','Site@12345');
  record(9, 'Lock remains after server restart (correct password still rejected)', lockedAttempt.status===423, {status:lockedAttempt.status, error:lockedAttempt.error});

  // Sessions are in-memory only (auth.js) and do NOT survive a restart, by existing, disclosed
  // design (see ERP-013/014) — re-authenticate as admin before querying an admin-gated endpoint,
  // exactly as any real operator would have to after a real restart.
  await login('admin','Admin@12345');

  // 12. Failed-login history survives restart
  const auditAfterRestart = await api('admin','GET','/api/audit-log');
  const site1History = (auditAfterRestart.loginHistory||[]).filter(h=>h.username==='site1');
  record(12, 'Failed-login history survives restart', site1History.filter(h=>h.result==='DENY').length>=5, {denyCount: site1History.filter(h=>h.result==='DENY').length});

  // 10. Lock expiry permits login after expiry — the real lock duration is 15 minutes, too long
  // to wait out in an automated test. Tested honestly via direct manipulation of the DISPOSABLE
  // test database's lockedUntil field to a past timestamp (white-box technique on throwaway test
  // data only — never done against production), then restarting so the running server re-reads
  // the modified file from disk, proving the EXPIRY CHECK itself (not just the persistence fix)
  // works correctly end-to-end.
  stopServer(child);
  await wait(1000);
  const dbForExpiry = JSON.parse(fs.readFileSync(dbPath,'utf8'));
  const uExpiry = dbForExpiry.users.find(x=>x.username==='site1');
  uExpiry.lockedUntil = Date.now() - 60000; // 1 minute in the past — expired
  fs.writeFileSync(dbPath, JSON.stringify(dbForExpiry));
  child = startServer();
  await wait(2000);
  const afterExpiry = await login('site1','Site@12345');
  record(10, 'Lock expiry permits login after expiry (lockedUntil manually set to the past on disposable test data, server restarted to re-read it)', afterExpiry.status===200 && afterExpiry.ok===true, {status:afterExpiry.status});

  // 11. Successful login behaves correctly after expiry — counter/lock should be cleared
  const dbAfterExpiryLogin = JSON.parse(fs.readFileSync(dbPath,'utf8'));
  const uAfterExpiryLogin = dbAfterExpiryLogin.users.find(x=>x.username==='site1');
  record(11, 'Successful login after expiry clears failedLoginCount and lockedUntil', uAfterExpiryLogin.failedLoginCount===0 && uAfterExpiryLogin.lockedUntil===null, {failedLoginCount:uAfterExpiryLogin.failedLoginCount, lockedUntil:uAfterExpiryLogin.lockedUntil});

  stopServer(child);
  await wait(500);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log(`\n=== ERP-059 RESTART/EXPIRY PERSISTENCE: ${pass}/${results.length} passed ===\n`);
  results.forEach(r=>console.log(`${r.pass?'PASS':'FAIL'} [${r.n}] ${r.name}${r.pass?'':' -- '+JSON.stringify(r.detail)}`));
  if(fail>0) process.exitCode = 1;
}
main().catch(e=>{ console.error('TEST RUNNER CRASHED:', e); process.exitCode=1; });
