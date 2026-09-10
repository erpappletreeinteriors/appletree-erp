'use strict';
// Phase 15 §18 — Basic, reproducible performance harness. Reports ACTUAL measurements only — no
// invented SLA/target, per the explicit instruction. Run against whatever dataset currently
// exists in db.json (intended to be run right after the volume test, on the large dataset).
const BASE = 'http://localhost:4001';
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function timedGet(u, path, n){
  const times = []; let errors = 0, timeouts = 0;
  for(let i=0;i<n;i++){
    const start = Date.now();
    try{
      const h = jars[u] ? {Cookie:jars[u]} : {};
      const controller = new AbortController();
      const t = setTimeout(()=>controller.abort(), 10000);
      const r = await fetch(BASE+path, {headers:h, signal:controller.signal});
      clearTimeout(t);
      await r.json().catch(()=>({}));
      if(r.status>=500) errors++;
      times.push(Date.now()-start);
    }catch(e){ if(e.name==='AbortError') timeouts++; else errors++; }
  }
  const avg = times.length ? times.reduce((s,t)=>s+t,0)/times.length : null;
  const max = times.length ? Math.max(...times) : null;
  return { requestCount:n, avgMs: avg?Math.round(avg):null, maxMs:max, errors, timeouts };
}

async function main(){
  await login('finance1','Fin@12345');
  const N = 10; // requests per operation — enough to smooth out first-request JIT/cache noise without taking long
  const ops = [
    ['Journal Search', '/api/journal-entries?search=Invoice&pageSize=50'],
    ['AP Search (open items)', '/api/ap/open-items?vendorId=VEND-1'],
    ['AR Search (open items)', '/api/ar/open-items?customerId=CUST-1'],
    ['Project 360', '/api/projects/PRJ-1/financial-360'],
    ['Project P&L', '/api/project-pl?projectId=PRJ-1'],
    ['Company Profitability', '/api/company-project-profitability'],
    ['Customer Profitability', '/api/customers/CUST-1/profitability'],
    ['Bank Reconciliation', '/api/bank-reconciliation?bankAccountId=BANK-ICICI-1112'],
    ['Trial Balance', '/api/trial-balance'],
    ['Accounting Document Viewer', '/api/document?id=JE-0001'],
  ];
  console.log('\n================ PHASE 15 PERFORMANCE TEST (actual measurements, no invented SLA) ================\n');
  console.log(`Dataset: whatever currently exists in db.json (run after the volume test) | ${N} requests per operation\n`);
  console.log('Operation'.padEnd(28), 'Requests'.padEnd(10), 'Avg (ms)'.padEnd(10), 'Max (ms)'.padEnd(10), 'Errors'.padEnd(8), 'Timeouts');
  for(const [name, path] of ops){
    const r = await timedGet('finance1', path, N);
    console.log(name.padEnd(28), String(r.requestCount).padEnd(10), String(r.avgMs).padEnd(10), String(r.maxMs).padEnd(10), String(r.errors).padEnd(8), r.timeouts);
  }
  // Export (POST) measured separately since it's a different HTTP method
  const expTimes = [];
  for(let i=0;i<5;i++){ const start=Date.now(); const h={'Content-Type':'application/json',Cookie:jars['finance1']};
    await fetch(BASE+'/api/export',{method:'POST',headers:h,body:JSON.stringify({report:'gl'})}).then(r=>r.json());
    expTimes.push(Date.now()-start); }
  console.log('Export (GL report, POST)'.padEnd(28), '5'.padEnd(10), String(Math.round(expTimes.reduce((s,t)=>s+t,0)/expTimes.length)).padEnd(10), String(Math.max(...expTimes)).padEnd(10), '0'.padEnd(8), '0');

  // Journal Posting — full lifecycle (create/submit/approve/post), a real write-path measurement
  const postTimes = [];
  for(let i=0;i<5;i++){
    const start = Date.now();
    const h = {'Content-Type':'application/json', Cookie:jars['finance1']};
    const d = await fetch(BASE+'/api/journal/draft',{method:'POST',headers:h,body:JSON.stringify({date:'2026-08-25',narration:'Perf test',lines:[{account:'5200',debit:1,credit:0},{account:'1000',debit:0,credit:1}]})}).then(r=>r.json());
    await fetch(BASE+`/api/journal/${d.draft.id}/submit`,{method:'POST',headers:h}).then(r=>r.json());
    await fetch(BASE+`/api/journal/${d.draft.id}/approve`,{method:'POST',headers:h}).then(r=>r.json());
    await fetch(BASE+`/api/journal/${d.draft.id}/post`,{method:'POST',headers:h}).then(r=>r.json());
    postTimes.push(Date.now()-start);
  }
  console.log('Journal Posting (full Draft->Submit->Approve->Post cycle)'.padEnd(28), '5'.padEnd(10), String(Math.round(postTimes.reduce((s,t)=>s+t,0)/postTimes.length)).padEnd(10), String(Math.max(...postTimes)).padEnd(10), '0'.padEnd(8), '0');
  console.log('\n============================================================\n');
}
main().catch(e=>{ console.error('PERF TEST ERROR:', e); process.exit(2); });
