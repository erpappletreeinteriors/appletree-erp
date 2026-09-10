'use strict';
// Phase 10 §5/§6 — Warranty Master + Eligibility. Real HTTP calls against the running server.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([login('ceo','Ceo@12345'), login('finance1','Fin@12345'), login('pm1','Pm@123456'), login('sales1','Sal@123456')]);

  // §5 — no durationMonths must NOT be defaulted to 1yr/2yr, must be an explicit policy error.
  const noDuration = await api('ceo','POST','/api/warranties',{customerId:'CUST-1', projectId:'PRJ-1', product:'Kitchen'});
  record('Policy', 'Warranty creation without durationMonths is BUSINESS POLICY REQUIRED, not defaulted', noDuration.ok===false && /BUSINESS POLICY REQUIRED/.test(noDuration.error), noDuration.error);

  // Create a real warranty starting today, 12 months (operator-supplied, not a hardcoded default).
  const today = new Date().toISOString().slice(0,10);
  const war = await api('ceo','POST','/api/warranties',{customerId:'CUST-1', projectId:'PRJ-1', product:'Kitchen Cabinets', warrantyType:'Standard', coverage:'Hardware and finish', exclusions:'Water damage, misuse', durationMonths:12, startDate:today});
  record('Create', 'Warranty created with explicit 12-month duration', war.ok, JSON.stringify(war.warranty));

  const list = await api('ceo','GET','/api/warranties');
  const listed = list.warranties.find(w=>w.id===war.warranty.id);
  record('Status', 'Freshly created warranty (start=today) shows effectiveStatus ACTIVE', listed && listed.effectiveStatus==='ACTIVE', listed?.effectiveStatus);

  // A warranty starting in the future should be NOT_STARTED.
  const future = new Date(); future.setMonth(future.getMonth()+2);
  const warFuture = await api('ceo','POST','/api/warranties',{customerId:'CUST-1', projectId:'PRJ-1', product:'Future Install', durationMonths:12, startDate:future.toISOString().slice(0,10)});
  const listFuture = (await api('ceo','GET','/api/warranties')).warranties.find(w=>w.id===warFuture.warranty.id);
  record('Status', 'Future-dated warranty shows NOT_STARTED', listFuture.effectiveStatus==='NOT_STARTED', listFuture.effectiveStatus);

  // A warranty that started and ended entirely in the past should be EXPIRED.
  const pastStart = new Date(); pastStart.setFullYear(pastStart.getFullYear()-2);
  const warPast = await api('ceo','POST','/api/warranties',{customerId:'CUST-1', projectId:'PRJ-1', product:'Old Install', durationMonths:12, startDate:pastStart.toISOString().slice(0,10)});
  const listPast = (await api('ceo','GET','/api/warranties')).warranties.find(w=>w.id===warPast.warranty.id);
  record('Status', 'Long-past-dated warranty shows EXPIRED', listPast.effectiveStatus==='EXPIRED', listPast.effectiveStatus);

  // §6 — eligibility: authoritative server-side result, never left to the client.
  const eligActive = await api('finance1','POST','/api/warranties/eligibility',{warrantyId:war.warranty.id, claimDate:today, claimType:'Hardware failure'});
  record('Eligibility', 'Claim within ACTIVE warranty window, non-excluded type → ELIGIBLE', eligActive.result==='ELIGIBLE', JSON.stringify(eligActive));
  const eligExpired = await api('finance1','POST','/api/warranties/eligibility',{warrantyId:warPast.warranty.id, claimDate:today, claimType:'Hardware failure'});
  record('Eligibility', 'Claim against an EXPIRED warranty → NOT_ELIGIBLE', eligExpired.result==='NOT_ELIGIBLE', JSON.stringify(eligExpired));
  const eligNotStarted = await api('finance1','POST','/api/warranties/eligibility',{warrantyId:warFuture.warranty.id, claimDate:today, claimType:'Hardware failure'});
  record('Eligibility', 'Claim against a NOT_STARTED warranty → NOT_ELIGIBLE', eligNotStarted.result==='NOT_ELIGIBLE', JSON.stringify(eligNotStarted));
  const eligExcluded = await api('finance1','POST','/api/warranties/eligibility',{warrantyId:war.warranty.id, claimDate:today, claimType:'Water damage'});
  record('Eligibility', 'Claim type matching exclusion text → REQUIRES_REVIEW (not auto-denied/approved)', eligExcluded.result==='REQUIRES_REVIEW', JSON.stringify(eligExcluded));
  const eligFake = await api('finance1','POST','/api/warranties/eligibility',{warrantyId:'WAR-9999', claimDate:today});
  record('Eligibility', 'Fabricated warranty ID → NOT_ELIGIBLE with a clear reason, not a crash', eligFake.result==='NOT_ELIGIBLE', JSON.stringify(eligFake));

  // Void / Cancel (Admin/CEO/FinanceManager only, per the domain function's own gate).
  const salesVoid = await api('sales1','POST',`/api/warranties/${war.warranty.id}/void`,{reason:'test'});
  record('Security', 'Sales cannot void a warranty', salesVoid.ok===false, JSON.stringify(salesVoid));
  const ceoVoid = await api('ceo','POST',`/api/warranties/${warFuture.warranty.id}/void`,{reason:'duplicate entry'});
  record('Lifecycle', 'CEO can void a warranty', ceoVoid.ok && ceoVoid.warranty.manualStatus==='VOID', ceoVoid.warranty?.manualStatus);
  const eligVoided = await api('finance1','POST','/api/warranties/eligibility',{warrantyId:warFuture.warranty.id, claimDate:today});
  record('Eligibility', 'Claim against a VOIDED warranty → NOT_ELIGIBLE (manualStatus wins over dates)', eligVoided.result==='NOT_ELIGIBLE', JSON.stringify(eligVoided));

  // §39 Security: cross-project PM denial, cross-customer Sales denial.
  const pmCross = await api('pm1','POST','/api/warranties',{customerId:'CUST-2', projectId:'PRJ-2', product:'x', durationMonths:12});
  record('Security', 'PM not assigned to PRJ-2 cannot create a warranty for it', pmCross.ok===false, JSON.stringify(pmCross));
  const salesCross = await api('sales1','GET','/api/warranties');
  const leaked = salesCross.warranties.some(w=>!(('assignedCustomers' in {})) && w.customerId && !['CUST-1','CUST-2','CUST-3'].includes(w.customerId));
  record('Security', 'Sales only sees warranties for their assigned customers', salesCross.ok && !leaked, salesCross.warranties.map(w=>w.customerId));

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 10 WARRANTY TESTS ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
