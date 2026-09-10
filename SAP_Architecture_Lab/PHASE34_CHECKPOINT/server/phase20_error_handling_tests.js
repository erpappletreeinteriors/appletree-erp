'use strict';
// Phase 20 §24/§34 — DEFECT FOUND & FIXED by code review (not a test): the entire route-dispatch
// if-chain ran directly inside the async request-listener callback with NO surrounding try/catch
// anywhere in server.js, and no process-level uncaughtException/unhandledRejection handler
// either. An unhandled exception from any single malformed request could either hang that request
// forever or, in newer Node versions, crash the ENTIRE process for every user. Fixed by wrapping
// the whole handler in try/catch (returning a generic, safe 500 with no stack trace/internal
// detail) plus process-level safety nets. This test proves both halves: (1) a genuinely thrown
// exception returns a clean, safe error, and (2) the server survives and keeps serving other
// requests afterward — the actual availability property that matters.
const BASE = 'http://localhost:4001';
const results = [];
function record(name, pass, detail){ results.push({name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345');

  // A genuinely malformed request that throws deep inside a domain function (a number where a
  // string is expected, causing `.trim is not a function`).
  const crash1 = await api('admin','POST','/api/masters/vendor',{name:12345});
  record('A request that throws an unhandled exception returns HTTP 500 with a clean, generic error message', crash1.status===500 && crash1.ok===false, crash1);
  record('The error response never leaks a stack trace, file path, or the raw exception message', !/TypeError|at Object|domain\.js|server\.js|\.trim/.test(JSON.stringify(crash1)), crash1.error);

  // A second, different malformed shape (object where a string is expected).
  const crash2 = await api('admin','POST','/api/masters/material',{code:{a:1}, description:'x', uom:'pc'});
  record('A SECOND, differently-shaped malformed request ALSO returns a safe error, not a crash', crash2.status===500 || crash2.status===400, crash2);

  // The server must still be fully alive and correctly serving normal requests after both.
  const stillAlive1 = await api('admin','GET','/api/customers');
  record('The server is still alive and correctly serving a normal request immediately after the first crash', stillAlive1.ok, stillAlive1.ok);
  const reLogin = await login('finance1','Fin@12345');
  record('A completely different user can still log in normally right after — the whole process did not go down for everyone', reLogin.ok, reLogin);
  const stillAlive2 = await api('finance1','GET','/api/bank-accounts');
  record('Normal business operations continue working correctly after the exceptions', stillAlive2.ok, stillAlive2.ok);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 20 ERROR HANDLING / GLOBAL EXCEPTION SAFETY NET ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
