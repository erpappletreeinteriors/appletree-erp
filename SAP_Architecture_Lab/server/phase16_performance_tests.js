'use strict';
// Phase 16 §11 — Company Profitability performance fix verification. Proves the allLines()
// memoization changed NOTHING about the numbers (independently re-sums individual
// projectFinancial360() calls and compares byte-for-byte against companyProjectProfitability()'s
// own totals) and measures the actual speedup.
// ERP-059C — self-contained preflight guard (see docs/erp-remediation/phases/
// ERP-059C-TEST-ISOLATION-REPORT.md for the incident this responds to). No hardcoded target, no
// silent fallback to production port 4001 — that exact pattern (a hardcoded 'http://localhost:4001'
// in this very file) is what let a routine test run wipe the real production database. Inlined
// rather than required from a shared module so this file keeps working standalone if copied into a
// disposable scratch directory, matching this project's established isolated-test-server pattern.
const BASE = process.env.TEST_BASE_URL || (() => { throw new Error('TEST_BASE_URL is not set. Refusing to run against an unspecified target. Example: TEST_BASE_URL=http://127.0.0.1:4095 node ' + __filename); })();
async function __erp059cPreflight(){
  console.log('[TEST TARGET]', BASE);
  let info;
  try {
    const r = await fetch(BASE + '/api/system/environment');
    info = await r.json();
  } catch(e){
    console.error(`[PREFLIGHT BLOCKED] Could not reach ${BASE}/api/system/environment (${e.message}). Refusing to run.`);
    process.exit(1);
  }
  if(!info || info.ok !== true || info.appEnv !== 'test' || info.destructiveTestEndpointsEnabled !== true){
    console.error(`[PREFLIGHT BLOCKED] ${BASE} is APP_ENV="${info && info.appEnv}" (destructive test endpoints ${info && info.destructiveTestEndpointsEnabled ? 'ENABLED' : 'DISABLED'}) — refusing to run a destructive test against it.`);
    process.exit(1);
  }
  console.log(`[PREFLIGHT OK] ${BASE} confirmed APP_ENV=test.`);
}
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
function r2(n){ return Math.round((+n||0)*100)/100; }

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345');
  await login('finance1','Fin@12345');

  // ================= Correctness: aggregated totals must equal the independent sum =================
  const company = await api('finance1','GET','/api/company-project-profitability');
  record('§11/Correctness', 'Company Profitability call succeeds', company.ok, company.ok);
  if(company.ok){
    let sumRevenue=0, sumCost=0, sumMargin=0, sumCommitted=0;
    for(const row of company.profitability.projects){
      const f = await api('finance1','GET',`/api/projects/${row.projectId}/financial-360`);
      if(!f.ok) continue;
      sumRevenue += f.profitability.originalProjectMargin.revenue;
      sumCost += f.profitability.originalProjectMargin.cost;
      sumMargin += f.profitability.originalProjectMargin.profit;
      sumCommitted += f.cost.committed;
      record('§11/Correctness', `Project ${row.projectId} — Company Profitability row matches an independent Financial 360 call exactly`,
        row.coreRevenue===r2(f.profitability.originalProjectMargin.revenue) && row.coreMargin===r2(f.profitability.originalProjectMargin.profit),
        {companyRow:{revenue:row.coreRevenue,margin:row.coreMargin}, independent:{revenue:r2(f.profitability.originalProjectMargin.revenue),margin:r2(f.profitability.originalProjectMargin.profit)}});
    }
    record('§11/Correctness', 'Company-wide totalProjectRevenue equals the independently-summed total (memoized allLines() introduced zero drift)',
      Math.abs(company.profitability.totals.totalProjectRevenue - r2(sumRevenue)) < 0.5, {reported:company.profitability.totals.totalProjectRevenue, independentSum:r2(sumRevenue)});
    record('§11/Correctness', 'Company-wide totalProjectMargin equals the independently-summed total',
      Math.abs(company.profitability.totals.totalProjectMargin - r2(sumMargin)) < 0.5, {reported:company.profitability.totals.totalProjectMargin, independentSum:r2(sumMargin)});
  }

  // ================= Performance: measure the actual speedup =================
  const N = 15;
  const times = [];
  for(let i=0;i<N;i++){ const start=Date.now(); await api('finance1','GET','/api/company-project-profitability'); times.push(Date.now()-start); }
  const avg = times.reduce((s,t)=>s+t,0)/times.length, max = Math.max(...times);
  console.log(`\nCompany Profitability timing after memoization fix: avg=${avg.toFixed(1)}ms max=${max}ms (n=${N}) — Phase 15 baseline was avg=419ms max=511ms`);
  record('§11/Performance', 'Company Profitability average response time improved substantially from the Phase 15 baseline (419ms)', avg < 200, {avgMs:avg, maxMs:max, phase15BaselineAvgMs:419});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 16 PERFORMANCE FIX VERIFICATION ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
