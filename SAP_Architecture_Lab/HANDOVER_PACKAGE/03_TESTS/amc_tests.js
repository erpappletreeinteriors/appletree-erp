'use strict';
// Phase 10 §20-§22,§47 — AMC Contract -> Activate -> Schedule -> Ticket -> Billing -> Renewal.
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

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([login('ceo','Ceo@12345'), login('finance1','Fin@12345'), login('accountant1','Acc@12345'), login('sales1','Sal@123456')]);

  // §20 — no contractValue/frequency must NOT be defaulted.
  const noValue = await api('sales1','POST','/api/amc-contracts',{customerId:'CUST-1', projectId:'PRJ-1', startDate:'2026-09-01', endDate:'2027-08-31'});
  record('Policy', 'AMC without contractValue is BUSINESS POLICY REQUIRED, not defaulted', noValue.ok===false && /BUSINESS POLICY REQUIRED/.test(noValue.error), noValue.error);
  const noFreq = await api('sales1','POST','/api/amc-contracts',{customerId:'CUST-1', projectId:'PRJ-1', startDate:'2026-09-01', endDate:'2027-08-31', contractValue:24000});
  record('Policy', 'AMC without serviceFrequencyMonths is BUSINESS POLICY REQUIRED', noFreq.ok===false && /BUSINESS POLICY REQUIRED/.test(noFreq.error), noFreq.error);

  const amc = await api('sales1','POST','/api/amc-contracts',{customerId:'CUST-1', projectId:'PRJ-1', site:'Customer Home', coveredSystems:'Kitchen, Wardrobes', startDate:'2026-09-01', endDate:'2027-08-31', contractValue:24000, billingTerms:'Annual upfront', serviceFrequencyMonths:3, coverage:'Preventive maintenance', exclusions:'Accidental damage', sla:'48hr response'});
  record('Create', 'AMC contract created DRAFT', amc.ok && amc.amc.status==='DRAFT', amc.amc?.status);

  const salesActivate = await api('sales1','POST',`/api/amc-contracts/${amc.amc.id}/activate`);
  record('Security', 'Sales cannot activate an AMC contract (commercial sign-off tier)', salesActivate.ok===false, JSON.stringify(salesActivate));
  const activate = await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/activate`);
  record('Lifecycle', 'FinanceManager activates AMC contract', activate.ok && activate.amc.status==='ACTIVE', activate.amc?.status);

  // §21 — AMC schedule creates planned service obligations, links to a real ticket.
  const sched = await api('finance1','POST','/api/amc-schedules',{amcId:amc.amc.id, plannedDate:'2026-12-01'});
  record('Schedule', 'AMC schedule entry created', sched.ok && sched.schedule.status==='Planned', sched.schedule?.status);
  const tkt = await api('ceo','POST','/api/service-tickets',{customerId:'CUST-1', projectId:'PRJ-1', amcId:amc.amc.id, issue:'Quarterly AMC visit', priority:'Normal', severity:'Minor'});
  const link = await api('finance1','POST',`/api/amc-schedules/${sched.schedule.id}/link-ticket`,{ticketId:tkt.ticket.id});
  record('Schedule', 'Schedule entry linked to a real service ticket', link.ok && link.schedule.status==='Ticketed' && link.schedule.ticketId===tkt.ticket.id, JSON.stringify(link.schedule));

  // §21 — billing event reuses the existing AR engine, no deferred-revenue invented.
  const billDraftOnDraftAmc = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amc.amc.id, taxCode:'GST18', date:'2026-09-01'});
  record('Billing', 'Billing an ACTIVE AMC works via existing draftCustomerInvoice path', billDraftOnDraftAmc.ok && billDraftOnDraftAmc.draft.amcContractId===amc.amc.id, JSON.stringify(billDraftOnDraftAmc.draft));
  await api('accountant1','POST',`/api/journal/${billDraftOnDraftAmc.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${billDraftOnDraftAmc.draft.id}/approve`);
  const posted = await api('finance1','POST',`/api/journal/${billDraftOnDraftAmc.draft.id}/post`);
  // Phase 13 POL-05 (approved: Option B, deferred/monthly recognition): billing now credits
  // 2100 (Deferred Revenue — the existing Customer Advance Liability account, reused per §16),
  // NOT 4000 directly — 4000 is only credited later, by a separate recognition entry. Still an
  // EXISTING account either way, no new GL account created.
  record('Billing', 'AMC billing event posts through EXISTING accounts — AR (1100) debited, Deferred Revenue (2100) credited, NOT Revenue (4000) directly (Option B, approved)', posted.ok && posted.entry.lines.some(l=>l.account==='1100') && posted.entry.lines.some(l=>l.account==='2100') && !posted.entry.lines.some(l=>l.account==='4000'), JSON.stringify(posted.entry?.lines));

  const amc2 = await api('sales1','POST','/api/amc-contracts',{customerId:'CUST-2', projectId:'PRJ-2', startDate:'2026-09-01', endDate:'2027-08-31', contractValue:18000, serviceFrequencyMonths:6});
  const billBeforeActive = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amc2.amc.id, date:'2026-09-01'});
  record('Billing', 'Cannot bill a DRAFT (not yet Activated) AMC contract', billBeforeActive.ok===false, JSON.stringify(billBeforeActive));

  // §22 — renewal is explicit, never automatic; original marked RENEWED, new contract linked both ways.
  const renew = await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/renew`,{startDate:'2027-09-01', endDate:'2028-08-31', contractValue:26000});
  record('Renewal', 'AMC renewed — original marked RENEWED, new contract created and cross-linked', renew.ok && renew.previous.status==='RENEWED' && renew.amc.renewedFromId===amc.amc.id, JSON.stringify({old:renew.previous?.status, new:renew.amc?.id, link:renew.amc?.renewedFromId}));

  const cancel = await api('finance1','POST',`/api/amc-contracts/${amc2.amc.id}/cancel`,{reason:'Customer request'});
  record('Lifecycle', 'AMC contract cancelled', cancel.ok && cancel.amc.status==='CANCELLED', cancel.amc?.status);
  const billCancelled = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amc2.amc.id, date:'2026-09-01'});
  record('Billing', 'Cannot bill a CANCELLED AMC contract', billCancelled.ok===false, JSON.stringify(billCancelled));

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 10 AMC TESTS ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
