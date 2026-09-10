// Phase 21 §14 — Scale Test. Progressive 1x/5x/10x volume, REAL measured response times (no
// invented "production capacity" number). This tests functional correctness AND performance
// under growing data volume — it is explicitly NOT claimed to be equivalent to real production
// load (no real concurrent users, no real network conditions).
const BASE = 'http://localhost:4001';
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
async function timeIt(fn){ const t0=Date.now(); await fn(); return Date.now()-t0; }

async function generateInvoices(n){
  let ok=0, errors=0;
  for(let i=0;i<n;i++){
    const inv = await api('sales1','POST','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:1000+i,date:'2026-08-15',taxCode:'GST18',narration:'Scale test invoice '+i});
    if(!inv.ok){ errors++; continue; }
    const id = inv.draft.id;
    await api('accountant1','POST',`/api/journal/${id}/submit`);
    await api('finance1','POST',`/api/journal/${id}/approve`);
    const post = await api('finance1','POST',`/api/journal/${id}/post`);
    if(post.ok) ok++; else errors++;
  }
  return {ok, errors};
}

async function measureTier(label){
  const fs = require('fs');
  const dbSize = fs.statSync('db.json').size;
  const dbRaw = JSON.parse(fs.readFileSync('db.json','utf8'));
  const jeCount = dbRaw.journalEntries.length;

  const results = {};
  results.login = await timeIt(async()=>{ await login('admin','Admin@12345'); });
  results.dashboardCustomers = await timeIt(async()=>{ await api('admin','GET','/api/customers'); });
  results.search_ARAgeing = await timeIt(async()=>{ await api('admin','GET','/api/ar/ageing'); });
  results.journalPost_singleInvoice = await timeIt(async()=>{
    const inv = await api('sales1','POST','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:5000,date:'2026-08-15',taxCode:'GST18',narration:'Scale test timing sample'});
    if(inv.ok){ const id=inv.draft.id; await api('accountant1','POST',`/api/journal/${id}/submit`); await api('finance1','POST',`/api/journal/${id}/approve`); await api('finance1','POST',`/api/journal/${id}/post`); }
  });
  results.projectPL = await timeIt(async()=>{ await api('admin','GET','/api/project-pl?projectId=PRJ-1'); });
  results.projectFinancial360 = await timeIt(async()=>{ await api('finance1','GET','/api/projects/PRJ-1/financial-360').catch(()=>{}); });
  results.trialBalance = await timeIt(async()=>{ await api('admin','GET','/api/trial-balance'); });
  results.reconciliationReport = await timeIt(async()=>{ await api('admin','GET','/api/reconciliation'); });
  results.companyProjectProfitability = await timeIt(async()=>{ await api('admin','GET','/api/company-project-profitability'); });
  results.auditLog = await timeIt(async()=>{ await api('admin','GET','/api/audit-log'); });

  console.log(`\n=== ${label} — journalEntries: ${jeCount}, db.json: ${(dbSize/1024).toFixed(1)} KB ===`);
  Object.entries(results).forEach(([k,v])=>console.log(`  ${k.padEnd(30)} ${v}ms`));
  return {label, jeCount, dbSizeKB: +(dbSize/1024).toFixed(1), ...results};
}

(async()=>{
  await login('admin','Admin@12345');
  await login('sales1','Sal@123456');
  await login('accountant1','Acc@12345');
  await login('finance1','Fin@12345');
  await api('admin','POST','/api/test/reset');

  const tier1Baseline = await measureTier('TIER 1 (baseline — fresh seed)');

  console.log('\nGenerating 1x volume batch (50 invoices)...');
  const gen1 = await generateInvoices(50);
  console.log('Generated:', gen1);
  const tier2 = await measureTier('TIER 2 (1x — after 50 invoices)');

  console.log('\nGenerating 5x volume batch (200 more invoices, ~250 total)...');
  const gen5 = await generateInvoices(200);
  console.log('Generated:', gen5);
  const tier3 = await measureTier('TIER 3 (5x — after 250 total invoices)');

  console.log('\nGenerating 10x volume batch (250 more invoices, ~500 total)...');
  const gen10 = await generateInvoices(250);
  console.log('Generated:', gen10);
  const tier4 = await measureTier('TIER 4 (10x — after 500 total invoices)');

  console.log('\n================ SCALE TEST SUMMARY ================');
  console.log('Tier'.padEnd(20), 'JEs'.padEnd(8), 'DB(KB)'.padEnd(10), 'Login'.padEnd(8), 'TB'.padEnd(8), 'Recon'.padEnd(8), 'ProjPL'.padEnd(8), 'CompProf'.padEnd(10));
  [tier1Baseline, tier2, tier3, tier4].forEach(t=>{
    console.log(t.label.padEnd(20), String(t.jeCount).padEnd(8), String(t.dbSizeKB).padEnd(10), (t.login+'ms').padEnd(8), (t.trialBalance+'ms').padEnd(8), (t.reconciliationReport+'ms').padEnd(8), (t.projectPL+'ms').padEnd(8), (t.companyProjectProfitability+'ms').padEnd(10));
  });
  const totalErrors = gen1.errors + gen5.errors + gen10.errors;
  console.log('\nTotal generation errors across all tiers:', totalErrors, totalErrors===0 ? '(clean)' : '(INVESTIGATE)');
})();
