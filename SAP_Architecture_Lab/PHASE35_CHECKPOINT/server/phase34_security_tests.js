'use strict';
// Phase 34 Part 25 — negative/security testing targeted specifically at the NEW Phase 34
// endpoints (Job Work/APOB/E-way Bill/ITC/BOQ/policy config). The pre-existing security_matrix.js
// and id_tamper_tests.js already comprehensively cover every OLD endpoint and passed cleanly in
// this session's regression run — this file adds the same discipline for what's new this phase.
const BASE = 'http://localhost:4001';
const results = [];
function record(name, pass, detail){ results.push({name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u]) h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([login('finance1','Fin@12345'), login('purchase1','Pur@12345'), login('accountant1','Acc@12345'), login('sales1','Sal@123456'), login('site1','Site@12345'), login('viewer1','View@1234')]);

  // ---------- Vertical privilege escalation: low-privilege roles on high-privilege routes ----------
  const r1 = await api('viewer1','POST','/api/job-workers',{name:'x'});
  record('Viewer cannot create a Job Worker', r1.status===403, JSON.stringify(r1));
  const r2 = await api('sales1','POST','/api/apob-declarations',{jobWorkerId:'JW-001'});
  record('Sales cannot create an APOB Declaration', r2.status===403, JSON.stringify(r2));
  const r3 = await api('site1','POST','/api/payment-category-policy/confirm',{category:'rent', confirmed:true});
  record('SiteInCharge cannot confirm payment-category policy', r3.status===403, JSON.stringify(r3));
  const r4 = await api('purchase1','POST','/api/purchase-approval-config',{status:'FINALISED'});
  record('Purchase cannot configure PO approval policy', r4.status===403, JSON.stringify(r4));
  const r5 = await api('accountant1','POST','/api/job-work-extensions/JWEXT-0001/approve');
  record('Accountant cannot approve a Job Work extension (Admin/CEO/FinanceManager only)', r5.status===403 || r5.ok===false, JSON.stringify(r5));

  // ---------- ID tampering: fabricated IDs must fail cleanly, not crash or leak ----------
  const r6 = await api('finance1','POST','/api/job-workers/JW-FAKE-999/active',{active:false});
  record('Fabricated Job Worker ID fails cleanly (not a crash/500)', r6.status!==500 && r6.ok===false, JSON.stringify(r6));
  const r7 = await api('purchase1','POST','/api/job-work-orders/JWO-FAKE-999/return',{returnedLines:[{qty:1}]});
  record('Fabricated Job Work Order ID fails cleanly', r7.status!==500 && r7.ok===false, JSON.stringify(r7));
  const r8 = await api('purchase1','POST','/api/eway-bills/EWB-FAKE-999/record-number',{number:'123'});
  record('Fabricated E-way Bill ID fails cleanly', r8.status!==500 && r8.ok===false, JSON.stringify(r8));
  const r9 = await api('finance1','GET','/api/boq-variance?projectId=PRJ-FAKE-999');
  record('Fabricated Project ID on BOQ Variance fails cleanly (not a crash)', r9.status!==500 && r9.ok===false, JSON.stringify(r9));
  const r10 = await api('finance1','GET','/api/payment-category-policy?category=NOT-A-REAL-CATEGORY');
  record('Unknown payment category returns a clean UNKNOWN status, not a crash', r10.status!==500 && r10.status==='UNKNOWN CATEGORY', JSON.stringify(r10));

  // ---------- Cross-entity manipulation: dispatch against a job worker that belongs to no relationship, tamper line index ----------
  const jw = await api('finance1','POST','/api/job-workers',{name:'Sec Test JW', registered:true});
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:10, rate:2800}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:10}]});
  const dispatch = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jw.jobWorker.id, warehouseId:'WH-1', lines:[{materialId:'MAT-1', qty:5}]});
  const r11 = await api('purchase1','POST',`/api/job-work-orders/${dispatch.jobWorkOrder.id}/scrap`,{lineIndex:99, qty:1, disposition:'Other'});
  record('Tampered/out-of-range lineIndex on scrap fails cleanly, not a crash', r11.status!==500 && r11.ok===false, JSON.stringify(r11));
  const r12 = await api('purchase1','POST',`/api/job-work-orders/${dispatch.jobWorkOrder.id}/return`,{returnedLines:[{qty:9999}]});
  record('Tampered over-qty return still blocked (would have created negative job-worker stock)', r12.ok===false, JSON.stringify(r12));

  // ---------- Maker-checker style self-approval on job-work extension ----------
  const extR = await api('purchase1','POST',`/api/job-work-orders/${dispatch.jobWorkOrder.id}/request-extension`,{newDueDate:'2030-01-01', reason:'test'});
  const r13 = await api('purchase1','POST',`/api/job-work-extensions/${extR.extension.id}/approve`,{});
  record('Requester role (Purchase) cannot approve their own extension request (role-gated to Admin/CEO/FinanceManager)', r13.status===403 || r13.ok===false, JSON.stringify(r13));

  // ---------- Inactive Job Worker cannot be dispatched to ----------
  await api('finance1','POST',`/api/job-workers/${jw.jobWorker.id}/active`,{active:false});
  const r14 = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jw.jobWorker.id, warehouseId:'WH-1', lines:[{materialId:'MAT-1', qty:1}]});
  record('Inactive Job Worker cannot receive a new dispatch', r14.ok===false, JSON.stringify(r14));

  // ---------- Direct API access without going through any UI (this whole suite already proves this — every call above IS direct API access with real auth cookies, no UI involved) ----------
  const r15 = await api('__nobody__','GET','/api/job-workers');
  record('No session cookie at all is rejected (not defaulted to any role)', r15.status===401 || r15.status===403, JSON.stringify(r15));

  console.log('\n================ PHASE 34 SECURITY/NEGATIVE TEST RESULTS ================\n');
  let pass=0, fail=0;
  for(const r of results){ console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}`); if(!r.pass) console.log('    detail: '+r.detail); r.pass?pass++:fail++; }
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL ================\n`);
  process.exit(fail>0?1:0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
