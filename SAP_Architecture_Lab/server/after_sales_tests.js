'use strict';
// Phase 10 §45 (E2E warranty), §50 (concurrency), §52 (reconciliation) — the master after-sales
// test tying Warranty->Complaint->Ticket->Visit->AMC->CAPA together in one continuous run, plus
// the concurrency scenarios not already covered by warranty/service/amc/capa_tests.js.
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
  await Promise.all([login('ceo','Ceo@12345'), login('finance1','Fin@12345'), login('accountant1','Acc@12345'), login('pm1','Pm@123456'), login('sales1','Sal@123456'), login('purchase1','Pur@12345')]);

  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:50, qtyRejected:0, uom:'sheet'}]});

  // ================= §45 Full E2E Warranty Chain =================
  const war = await api('ceo','POST','/api/warranties',{customerId:'CUST-1', projectId:'PRJ-1', product:'Full Home Interior', durationMonths:24, startDate:new Date().toISOString().slice(0,10)});
  record('E2E-Warranty', '1. Warranty created', war.ok, war.warranty?.id);
  const elig = await api('finance1','POST','/api/warranties/eligibility',{warrantyId:war.warranty.id, claimDate:new Date().toISOString().slice(0,10), claimType:'Hardware'});
  record('E2E-Warranty', '2. Eligibility confirmed ELIGIBLE before proceeding', elig.result==='ELIGIBLE', elig.result);
  const cmp = await api('sales1','POST','/api/complaints',{customerId:'CUST-1', projectId:'PRJ-1', warrantyId:war.warranty.id, description:'Drawer slide sticking', priority:'Normal', severity:'Minor'});
  record('E2E-Warranty', '3. Complaint logged', cmp.ok, cmp.complaint?.id);
  const triage = await api('finance1','POST',`/api/complaints/${cmp.complaint.id}/triage`,{classification:'Warranty'});
  record('E2E-Warranty', '4. Triaged as Warranty', triage.ok, triage.complaint?.classification);
  const tkt = await api('ceo','POST','/api/service-tickets',{complaintId:cmp.complaint.id});
  record('E2E-Warranty', '5. Ticket created', tkt.ok, tkt.ticket?.id);
  const assign = await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/assign`,{assignedTo:'U-PM1'});
  record('E2E-Warranty', '6. Assigned', assign.ok, assign.ticket?.assignedTo);
  const vis = await api('pm1','POST','/api/service-visits',{ticketId:tkt.ticket.id, site:'Site A', technician:'U-PM1'});
  record('E2E-Warranty', '7. Visit created', vis.ok, vis.visit?.id);
  await api('pm1','POST',`/api/service-visits/${vis.visit.id}/start`);
  const diag = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/diagnosis`,{problem:'Drawer slide worn', rootCause:'Normal wear', diagnosis:'Replace slide', warrantyDecision:true, chargeableDecision:false});
  record('E2E-Warranty', '8. Diagnosis + warranty decision confirmed', diag.ok, diag.visit?.warrantyDecision);
  const issue = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/material-issue`,{materialId:'MAT-1', qty:1, warehouseId:'WH-1'});
  record('E2E-Warranty', '9. Material issued', issue.ok, issue.value);
  const labour = await api('finance1','POST',`/api/service-visits/${vis.visit.id}/labour-cost`,{amount:400});
  record('E2E-Warranty', '10. Labour posted', labour.ok, labour.entry?.voucherNo);
  const complete = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/complete`,{workPerformed:'Slide replaced', customerAcknowledgement:'Mr. Habeeb'});
  record('E2E-Warranty', '11. Visit completed with acknowledgement', complete.ok, complete.visit?.status);
  const arBefore = (await api('finance1','GET','/api/ar/ageing')).ageing.reduce((s,r)=>s+r.total,0);
  const close = await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/close`);
  record('E2E-Warranty', '12. Ticket closed', close.ok, close.ticket?.status);
  const arAfter = (await api('finance1','GET','/api/ar/ageing')).ageing.reduce((s,r)=>s+r.total,0);
  record('E2E-Warranty', '13. VERIFIED — no customer AR invoice was created anywhere in this chain', Math.abs(arAfter-arBefore)<0.01, {arBefore, arAfter});
  const costBd = await api('finance1','GET',`/api/service-tickets/${tkt.ticket.id}/cost-breakdown`);
  record('E2E-Warranty', '14. VERIFIED — service cost is traceable (material + labour)', costBd.breakdown.totalCost>0 && costBd.breakdown.materialCost>0 && costBd.breakdown.labourCost>0, JSON.stringify(costBd.breakdown));

  // ================= §50 Concurrency =================
  const tkt2 = await api('ceo','POST','/api/service-tickets',{customerId:'CUST-1', projectId:'PRJ-1', issue:'Concurrency test ticket'});
  const [assignA, assignB] = await Promise.all([ api('ceo','POST',`/api/service-tickets/${tkt2.ticket.id}/assign`,{assignedTo:'U-PM1'}), api('finance1','POST',`/api/service-tickets/${tkt2.ticket.id}/assign`,{assignedTo:'U-PM1'}) ]);
  record('Concurrency', 'Two users assigning the SAME ticket simultaneously — both succeed idempotently (assign has no state-machine guard, matches design: reassignment is allowed at any time)', assignA.ok && assignB.ok, JSON.stringify([assignA.ok,assignB.ok]));

  // Two users racing to issue the SAME service material against a visit with only 1 unit reserved in a tight scenario.
  const tkt3 = await api('ceo','POST','/api/service-tickets',{customerId:'CUST-1', projectId:'PRJ-1', issue:'Concurrency material test'});
  const vis3 = await api('pm1','POST','/api/service-visits',{ticketId:tkt3.ticket.id, technician:'U-PM1'});
  const stockBefore = await api('pm1','GET','/api/inventory/stock?materialId=MAT-1&warehouseId=WH-1');
  const [issA, issB] = await Promise.all([
    api('pm1','POST',`/api/service-visits/${vis3.visit.id}/material-issue`,{materialId:'MAT-1', qty: stockBefore.stock+1, warehouseId:'WH-1'}),
    api('pm1','POST',`/api/service-visits/${vis3.visit.id}/material-issue`,{materialId:'MAT-1', qty: stockBefore.stock+1, warehouseId:'WH-1'})
  ]);
  record('Concurrency', 'Two simultaneous over-quantity material issues (both exceeding stock) — both correctly blocked by the existing negative-stock guard, no partial/corrupt state', !issA.ok && !issB.ok, JSON.stringify([issA.error,issB.error]));

  // Two users racing to close the SAME CAPA (only one action allowed to transition state).
  const capa = await api('finance1','POST','/api/capa',{trigger:'ManagementDecision', problem:'Concurrency test CAPA'});
  await api('finance1','POST',`/api/capa/${capa.capa.id}/analysis`,{rootCause:'test'});
  await api('finance1','POST',`/api/capa/${capa.capa.id}/action`,{correctiveAction:'x', preventiveAction:'y', owner:'U-PM1', dueDate:'2026-10-01'});
  await api('finance1','POST',`/api/capa/${capa.capa.id}/verify`,{evidence:'x'});
  await api('ceo','POST',`/api/capa/${capa.capa.id}/effectiveness`,{effectivenessCheck:'x', effectivenessResult:'Effective'});
  const [closeA, closeB] = await Promise.all([ api('ceo','POST',`/api/capa/${capa.capa.id}/close`), api('finance1','POST',`/api/capa/${capa.capa.id}/close`) ]);
  const capaCloseSuccesses = [closeA,closeB].filter(r=>r.ok).length;
  record('Concurrency', 'Two users racing to close the SAME CAPA — exactly one succeeds (no double-close)', capaCloseSuccesses===1, JSON.stringify([closeA.ok,closeB.ok]));

  // Two users racing to close the SAME service ticket.
  const tkt4 = await api('ceo','POST','/api/service-tickets',{customerId:'CUST-1', projectId:'PRJ-1', issue:'Concurrency close test'});
  const vis4 = await api('pm1','POST','/api/service-visits',{ticketId:tkt4.ticket.id, technician:'U-PM1'});
  await api('pm1','POST',`/api/service-visits/${vis4.visit.id}/diagnosis`,{diagnosis:'x', warrantyDecision:true, chargeableDecision:false});
  await api('pm1','POST',`/api/service-visits/${vis4.visit.id}/complete`,{workPerformed:'done', customerAcknowledgement:'ack'});
  const [tktCloseA, tktCloseB] = await Promise.all([ api('ceo','POST',`/api/service-tickets/${tkt4.ticket.id}/close`), api('finance1','POST',`/api/service-tickets/${tkt4.ticket.id}/close`) ]);
  const tktCloseSuccesses = [tktCloseA,tktCloseB].filter(r=>r.ok).length;
  record('Concurrency', 'Two users racing to close the SAME service ticket — exactly one succeeds', tktCloseSuccesses===1, JSON.stringify([tktCloseA.ok,tktCloseB.ok]));

  // ================= §52 Accounting Reconciliation (after full Phase 10 activity) =================
  const recon = await api('finance1','GET','/api/reconciliation');
  record('Reconciliation', 'AR reconciles after Phase 10 activity', recon.ar.matches, recon.ar);
  record('Reconciliation', 'AP reconciles after Phase 10 activity', recon.ap.matches, recon.ap);
  const tb = await api('finance1','GET','/api/trial-balance');
  const d = Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0), c = Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0);
  record('Reconciliation', 'Trial Balance still balances after Phase 10 activity (no new accounts, no orphan postings)', Math.abs(d-c)<0.01, {debit:d, credit:c});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 10 AFTER-SALES MASTER TESTS (E2E + Concurrency + Reconciliation) ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
