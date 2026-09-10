'use strict';
// Phase 9 §18/§40 — dedicated regression test for the multi-partial delivery defect found and
// fixed during Phase 9 UI work: createDelivery() used to compare only the CURRENT call's qty
// against the dispatch total (never summing prior partial deliveries) and flipped the dispatch
// to 'Delivered' after the very first delivery record of ANY type, which silently blocked every
// subsequent partial. This test proves the fix: Partial 1 -> Partial 2 -> Partial 3 -> Final
// against ONE dispatch, with correct cumulative/remaining tracking and over-delivery blocked.
const BASE = 'http://localhost:4001';
const results = [];
function record(name, pass, detail){ results.push({name, pass, detail}); }
const jars = {};
async function login(username, password){
  const res = await fetch(BASE+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password})});
  const json = await res.json(); const setCookie = res.headers.get('set-cookie'); if(setCookie) jars[username] = setCookie.split(';')[0];
  return {status:res.status, ...json};
}
async function api(username, method, path, body){
  const headers = {'Content-Type':'application/json'}; if(jars[username]) headers['Cookie'] = jars[username];
  const res = await fetch(BASE+path, {method, headers, body: body?JSON.stringify(body):undefined});
  const json = await res.json().catch(()=>({})); return {status:res.status, ...json};
}

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([ login('finance1','Fin@12345'), login('pm1','Pm@123456'), login('sales1','Sal@123456'), login('estimator1','Est@12345') ]);

  const lead = await api('sales1','POST','/api/leads',{name:'Delivery Test Customer', requirement:'Partial delivery test'});
  const er = await api('sales1','POST','/api/estimation-requests',{leadId:lead.lead.id});
  const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, overheadPct:10, profitPct:15, lines:[{category:'Material',qty:1,uom:'lot',rate:100000}]});
  const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, prospectName:'Delivery Test Customer', discountPct:0});
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'Delivery Test Customer'});
  const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1'});
  const projectId = won.project.id, customerId = won.customer.id;
  record('Setup: project created', won.ok, projectId);

  // Dispatch 10 units of MAT-1 (no production-order link needed — dispatchReadinessCheck only
  // requires a linked production order to be Completed/PartiallyCompleted WHEN one is linked).
  const dsp = await api('pm1','POST','/api/dispatches',{projectId, customerId, items:[{materialId:'MAT-1', qty:10}], dispatchDate:'2026-09-01', destination:'Site'});
  record('Dispatch created for 10 units', dsp.ok, JSON.stringify(dsp.dispatch));
  await api('pm1','POST',`/api/dispatches/${dsp.dispatch.id}/ready`);
  await api('finance1','POST',`/api/dispatches/${dsp.dispatch.id}/approve`);
  const go = await api('pm1','POST',`/api/dispatches/${dsp.dispatch.id}/dispatch`);
  record('Dispatch marked Dispatched', go.ok && go.dispatch.status==='Dispatched', go.dispatch?.status);
  const dispatchId = dsp.dispatch.id;

  // Partial 1: 3 units. Expect cumulative=3, remaining=7, type=Partial, dispatch stays Dispatched.
  const p1 = await api('pm1','POST','/api/deliveries',{dispatchId, deliveredItems:[{materialId:'MAT-1', qty:3}], receivedBy:'Site Guard'});
  record('Partial 1 (3 units): accepted', p1.ok, JSON.stringify(p1.delivery||p1));
  record('Partial 1: seq=1, cumulative=3, remaining=7, type=Partial', p1.ok && p1.delivery.seq===1 && p1.delivery.cumulativeDeliveredQty===3 && p1.delivery.remainingQty===7 && p1.delivery.type==='Partial', JSON.stringify(p1.delivery));
  const afterP1 = await api('pm1','GET','/api/dispatches');
  const dspAfterP1 = afterP1.dispatches.find(d=>d.id===dispatchId);
  record('Dispatch status still "Dispatched" after Partial 1 (THE defect this test targets)', dspAfterP1.status==='Dispatched', dspAfterP1.status);

  // Partial 2: 4 units. Expect cumulative=7, remaining=3.
  const p2 = await api('pm1','POST','/api/deliveries',{dispatchId, deliveredItems:[{materialId:'MAT-1', qty:4}], receivedBy:'Site Guard'});
  record('Partial 2 (4 units): accepted, seq=2, cumulative=7, remaining=3, type=Partial', p2.ok && p2.delivery.seq===2 && p2.delivery.cumulativeDeliveredQty===7 && p2.delivery.remainingQty===3 && p2.delivery.type==='Partial', JSON.stringify(p2.delivery));

  // Over-delivery attempt: try to deliver 5 when only 3 remain — must be blocked.
  const over = await api('pm1','POST','/api/deliveries',{dispatchId, deliveredItems:[{materialId:'MAT-1', qty:5}], receivedBy:'Site Guard'});
  record('Over-delivery (5 units when only 3 remain) is BLOCKED', over.ok===false && /remains undelivered/.test(over.error||''), over.error);

  // Partial 3: 2 units. Expect cumulative=9, remaining=1, still Partial (not yet complete).
  const p3 = await api('pm1','POST','/api/deliveries',{dispatchId, deliveredItems:[{materialId:'MAT-1', qty:2}], receivedBy:'Site Guard'});
  record('Partial 3 (2 units): accepted, seq=3, cumulative=9, remaining=1, type=Partial', p3.ok && p3.delivery.seq===3 && p3.delivery.cumulativeDeliveredQty===9 && p3.delivery.remainingQty===1 && p3.delivery.type==='Partial', JSON.stringify(p3.delivery));

  // Final: 1 unit. Expect cumulative=10, remaining=0, type=Full, dispatch flips to Delivered.
  const final = await api('pm1','POST','/api/deliveries',{dispatchId, deliveredItems:[{materialId:'MAT-1', qty:1}], receivedBy:'Site Guard'});
  record('Final delivery (1 unit): accepted, seq=4, cumulative=10, remaining=0, type=Full', final.ok && final.delivery.seq===4 && final.delivery.cumulativeDeliveredQty===10 && final.delivery.remainingQty===0 && final.delivery.type==='Full', JSON.stringify(final.delivery));
  const afterFinal = await api('pm1','GET','/api/dispatches');
  const dspFinal = afterFinal.dispatches.find(d=>d.id===dispatchId);
  record('Dispatch status now "Delivered" only after cumulative delivery is complete', dspFinal.status==='Delivered', dspFinal.status);

  // Duplicate full delivery attempt after completion — must be blocked, not silently accepted.
  const dup = await api('pm1','POST','/api/deliveries',{dispatchId, deliveredItems:[{materialId:'MAT-1', qty:1}], receivedBy:'Site Guard'});
  record('Delivery attempt after full completion is BLOCKED (no duplicate full delivery)', dup.ok===false && /already been fully delivered/.test(dup.error||''), dup.error);

  // Verify all 4 delivery records exist against this one dispatch (the original bug allowed only 1).
  const allDlv = await api('pm1','GET','/api/deliveries');
  const forThisDispatch = allDlv.deliveries.filter(d=>d.dispatchId===dispatchId);
  record('All 4 delivery records (3 partial + 1 final) persisted against the SAME dispatch', forThisDispatch.length===4, forThisDispatch.length);
  const sumQty = forThisDispatch.reduce((s,d)=>s+d.thisQty,0);
  record('Sum of all delivered quantities equals dispatched quantity (10) — no over/under delivery', sumQty===10, sumQty);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 9 §18/§40 DELIVERY PARTIAL-SEQUENCE TEST ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}${r.pass?'':' | '+r.detail}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
