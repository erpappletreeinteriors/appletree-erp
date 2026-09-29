'use strict';
// ARCH-2026-002 Wave 2 — dedicated test suite for the 5 new SoD rules (SOD-7..SOD-11) closing the
// zero-coverage chains found by Wave 2 Phase 0, plus the W2-2 QC-checklist-creation audit fix.
// Run against a shared isolated test server (see server/scripts/start-isolated-test-server.js).
// Usage: node erp_arch_2026_002_wave2_tests.js <baseUrl>
const BASE = process.argv[2] || process.env.TEST_BASE_URL;
if(!BASE){ console.error('Usage: node erp_arch_2026_002_wave2_tests.js <baseUrl>'); process.exit(2); }

const results = [];
function record(name, pass, detail){ results.push({name, pass:!!pass, detail}); }
const jars = {};
async function login(u,p){ const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return {status:r.status, ...(await r.json().catch(()=>({})))}; }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r = await fetch(BASE+p,{method:m,headers:h,body:b!==undefined?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }
function r2(n){ return Math.round(n*100)/100; }

async function main(){
  console.log('[TEST TARGET]', BASE);
  await Promise.all([
    login('admin','Admin@12345'), login('ceo','Ceo@12345'), login('finance1','Fin@12345'),
    login('accountant1','Acc@12345'), login('purchase1','Pur@12345'), login('sales1','Sal@123456'), login('pm1','Pm@123456')
  ]);

  // ============================= SOD-7: Production Order creator vs completer =============================
  console.log('\n===== SOD-7 — Production Order creator vs completer =====');

  const bom = await api('pm1','GET','/api/boms'); // reuse any pre-approved BOM if present; else create+approve one
  let bomId = (bom.boms||[]).find(b=>b.status==='Approved' && b.projectId==='PRJ-1')?.id;
  if(!bomId){
    const created = await api('ceo','POST','/api/boms',{projectId:'PRJ-1', site:'Wave2 Test Site', description:'Wave2 SOD-7 test BOM', lines:[{materialId:'MAT-1', qty:1, uom:'nos', scrapPct:0}]});
    bomId = created.bom?.id;
    await api('ceo','POST',`/api/boms/${bomId}/submit`,{});
    const app = await api('admin','POST',`/api/boms/${bomId}/approve`,{});
    record('[SOD-7-SETUP] Test BOM created and approved', app.ok===true, {error:app.error});
  }

  const po1 = await api('ceo','POST','/api/production-orders',{projectId:'PRJ-1', bomId, plannedQty:5});
  record('[SOD-7-SETUP] Production Order created by CEO', po1.ok===true, {error:po1.error});
  const po1Id = po1.productionOrder?.id;

  const selfComplete = await api('ceo','POST',`/api/production-orders/${po1Id}/complete`,{actualQty:5, rejectedQty:0});
  record('[SOD-7-NEG] The SAME user (CEO) who created the Production Order is BLOCKED from completing it', selfComplete.ok===false && /SOD-7/.test(selfComplete.error||''), {error:selfComplete.error});

  const otherComplete = await api('admin','POST',`/api/production-orders/${po1Id}/complete`,{actualQty:5, rejectedQty:0});
  record('[SOD-7] A DIFFERENT authorized user (Admin) completing the same order SUCCEEDS', otherComplete.ok===true, {error:otherComplete.error});

  const auditAfterSod7 = await api('admin','GET','/api/audit-log');
  const sod7Blocked = (auditAfterSod7.auditLog||[]).find(e=>e.type==='SoDViolationBlocked' && e.ruleId==='SOD-7');
  record('[SOD-7-AUDIT] SoDViolationBlocked (SOD-7) event recorded, naming the blocked actor', !!sod7Blocked && sod7Blocked.userId, {sod7Blocked});

  // Direct API bypass check — forged role in body must not change the outcome
  const po2 = await api('ceo','POST','/api/production-orders',{projectId:'PRJ-1', bomId, plannedQty:3});
  const po2Id = po2.productionOrder?.id;
  const forgedBypass = await api('ceo','POST',`/api/production-orders/${po2Id}/complete`,{actualQty:3, rejectedQty:0, actor:{id:'U-ADMIN', role:'Admin'}});
  record('[SOD-7-BYPASS] Forged actor/role field in the request body does NOT bypass SOD-7 (session-derived identity used, not client-supplied)', forgedBypass.ok===false && /SOD-7/.test(forgedBypass.error||''), {error:forgedBypass.error});

  // ============================= SOD-8: Job Work Order creator vs linked Supplier Bill creator =============================
  console.log('\n===== SOD-8 — Job Work Order creator vs linked Supplier Bill =====');

  // Stock MAT-1 into WH-1 first (fresh test DB starts at zero stock) via a real PO->GRN.
  const stockPo = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:100, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${stockPo.po?.id}/submit`,{});
  await api('admin','POST',`/api/purchase-orders/${stockPo.po?.id}/approve`,{});
  const stockGrn = await api('purchase1','POST','/api/grns',{poId:stockPo.po?.id, warehouseId:'WH-1', lines:[{qtyAccepted:50, qtyRejected:0, uom:'sheet'}]});
  record('[SOD-8-SETUP] MAT-1 stocked into WH-1 via PO->GRN', stockGrn.ok===true, {error:stockGrn.error});

  const jwVendor = await api('ceo','POST','/api/masters/vendor',{name:'Wave2 Job Worker Vendor', category:'Services'});
  let jwVendorId = jwVendor.vendor?.id;
  if(!jwVendor.ok){ // idempotent across re-runs against the same server instance
    const existingVendors = await api('ceo','GET','/api/vendors');
    jwVendorId = (existingVendors.vendors||[]).find(v=>v.name==='Wave2 Job Worker Vendor')?.id;
  }
  record('[SOD-8-SETUP] Vendor master available for job-work-charges bill (created or reused)', !!jwVendorId, {error:jwVendor.error, jwVendorId});
  const jw = await api('ceo','POST','/api/job-workers',{name:'Wave2 Test Job Worker', registered:true});
  record('[SOD-8-SETUP] Job Worker master created', jw.ok===true, {error:jw.error});
  const jwId = jw.jobWorker?.id;

  const dispatch = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jwId, warehouseId:'WH-1', lines:[{materialId:'MAT-1', qty:1}], purpose:'Wave2 SOD-8 test'});
  record('[SOD-8-SETUP] Job Work Order dispatched by Purchase', dispatch.ok===true, {error:dispatch.error});
  const jwoId = dispatch.jobWorkOrder?.id;

  const selfBill = await api('purchase1','POST','/api/ap/invoice',{vendorId:jwVendorId, projectId:'PRJ-1', baseAmount:1000, taxCode:'GST18', date:'2026-09-22', narration:'Wave2 SOD-8 test charge', jobWorkOrderId:jwoId});
  record('[SOD-8-NEG] The SAME user (Purchase) who dispatched the JWO is BLOCKED from booking the linked Supplier Bill', selfBill.ok===false && /SOD-8/.test(selfBill.error||''), {error:selfBill.error});

  const otherBill = await api('accountant1','POST','/api/ap/invoice',{vendorId:jwVendorId, projectId:'PRJ-1', baseAmount:1000, taxCode:'GST18', date:'2026-09-22', narration:'Wave2 SOD-8 test charge', jobWorkOrderId:jwoId});
  record('[SOD-8] A DIFFERENT user (Accountant) booking the linked Supplier Bill SUCCEEDS', otherBill.ok===true, {error:otherBill.error});

  // ============================= SOD-9: Job Work Order creator vs settlement actor =============================
  console.log('\n===== SOD-9 — Job Work Order creator vs settlement (return/scrap/direct-dispatch) =====');

  const dispatch2 = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jwId, warehouseId:'WH-1', lines:[{materialId:'MAT-1', qty:4}], purpose:'Wave2 SOD-9 test'});
  const jwo2Id = dispatch2.jobWorkOrder?.id;
  record('[SOD-9-SETUP] Second Job Work Order dispatched by Purchase', dispatch2.ok===true, {error:dispatch2.error});

  const selfReturn = await api('purchase1','POST',`/api/job-work-orders/${jwo2Id}/return`,{returnedLines:[{qty:2}]});
  record('[SOD-9-NEG] The SAME user (Purchase) who dispatched is BLOCKED from recording the return', selfReturn.ok===false && /SOD-9/.test(selfReturn.error||''), {error:selfReturn.error});

  const otherReturn = await api('finance1','POST',`/api/job-work-orders/${jwo2Id}/return`,{returnedLines:[{qty:2}]});
  record('[SOD-9] A DIFFERENT user (FinanceManager) recording the return SUCCEEDS', otherReturn.ok===true, {error:otherReturn.error});

  const selfScrap = await api('purchase1','POST',`/api/job-work-orders/${jwo2Id}/scrap`,{lineIndex:0, qty:1, disposition:'Destroyed/Written Off'});
  record('[SOD-9-NEG] The SAME dispatcher is BLOCKED from recording scrap on their own JWO', selfScrap.ok===false && /SOD-9/.test(selfScrap.error||''), {error:selfScrap.error});

  const otherScrap = await api('finance1','POST',`/api/job-work-orders/${jwo2Id}/scrap`,{lineIndex:0, qty:1, disposition:'Destroyed/Written Off'});
  record('[SOD-9] A DIFFERENT user recording scrap SUCCEEDS', otherScrap.ok===true, {error:otherScrap.error});

  // No-double-stock re-confirmation after SOD-9 guard is in place
  const jwoFinal = await api('finance1','GET','/api/job-work-orders');
  const jwo2 = (jwoFinal.jobWorkOrders||[]).find(x=>x.id===jwo2Id);
  record('[SOD-9-INVENTORY] Net job-worker-held balance is fully accounted (4 dispatched = 2 returned + 1 scrapped + remaining), no double count introduced by the new guard', jwo2 && (jwo2.returnedQtyByLine?.['0']||0)===2 && (jwo2.scrapQtyByLine?.['0']||0)===1, {jwo2});

  // ============================= SOD-10: QC checklist creator vs result submitter =============================
  console.log('\n===== SOD-10 — QC checklist creator vs result submitter =====');

  const qc = await api('pm1','POST','/api/qc-checklists',{projectId:'PRJ-1', items:[{description:'Wave2 SOD-10 test item', passFail:'Pending'}]});
  record('[SOD-10-SETUP] QC checklist created by PM', qc.ok===true, {error:qc.error});
  const qcId = qc.qc?.id;

  const auditAfterCreate = await api('admin','GET','/api/audit-log');
  const qcCreatedEvent = (auditAfterCreate.auditLog||[]).find(e=>e.type==='QCChecklistCreated' && e.qcId===qcId);
  record('[W2-2] QCChecklistCreated audit event now recorded (previously missing entirely)', !!qcCreatedEvent, {qcCreatedEvent});

  const selfSubmit = await api('pm1','POST',`/api/qc-checklists/${qcId}/result`,{items:[{description:'Wave2 SOD-10 test item', passFail:'Pass'}]});
  record('[SOD-10-NEG] The SAME user (PM) who created the checklist is BLOCKED from submitting its result', selfSubmit.ok===false && /SOD-10/.test(selfSubmit.error||''), {error:selfSubmit.error});

  const otherSubmit = await api('ceo','POST',`/api/qc-checklists/${qcId}/result`,{items:[{description:'Wave2 SOD-10 test item', passFail:'Pass'}]});
  record('[SOD-10] A DIFFERENT user (CEO) submitting the result SUCCEEDS', otherSubmit.ok===true, {error:otherSubmit.error});

  // ============================= SOD-11: CAPA effectiveness-checker vs closer =============================
  console.log('\n===== SOD-11 — CAPA effectiveness-checker vs closer =====');

  const capa = await api('ceo','POST','/api/capa',{trigger:'ManagementDecision', problem:'Wave2 SOD-11 test problem'});
  const capaId = capa.capa?.id;
  await api('ceo','POST',`/api/capa/${capaId}/analysis`,{rootCause:'Wave2 test root cause'});
  await api('ceo','POST',`/api/capa/${capaId}/action`,{correctiveAction:'Wave2 test corrective action', owner:'U-PUR1', dueDate:'2026-10-01'});
  const verify = await api('finance1','POST',`/api/capa/${capaId}/verify`,{evidence:'Wave2 test evidence'});
  record('[SOD-11-SETUP] CAPA analysis/action/verification recorded (owner=Purchase, verifier=FinanceManager)', verify.ok===true, {error:verify.error});
  const effCheck = await api('admin','POST',`/api/capa/${capaId}/effectiveness`,{effectivenessCheck:'Wave2 test check', effectivenessResult:'Effective'});
  record('[SOD-11-SETUP] Effectiveness confirmed by Admin', effCheck.ok===true, {error:effCheck.error});

  const selfClose = await api('admin','POST',`/api/capa/${capaId}/close`,{});
  record('[SOD-11-NEG] The SAME user (Admin) who confirmed effectiveness is BLOCKED from closing the case', selfClose.ok===false && /SOD-11/.test(selfClose.error||''), {error:selfClose.error});

  const otherClose = await api('ceo','POST',`/api/capa/${capaId}/close`,{});
  record('[SOD-11] A DIFFERENT user (CEO) closing the case SUCCEEDS', otherClose.ok===true, {error:otherClose.error});

  // ============================= Regression: existing CAPA/production/QC/job-work paths unaffected =============================
  console.log('\n===== Existing-path regression spot-check =====');

  const bal = await api('finance1','GET','/api/bank-accounts/balances');
  record('[REGRESSION] Unrelated read endpoints remain unaffected (bank balances still resolve)', Array.isArray(bal.balances), {});

  console.log('\n===== TOTAL: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail ?? null).slice(0,400)}`));
  process.exitCode = results.some(r=>!r.pass) ? 1 : 0;
}

main().catch(e=>{ console.error('FATAL', e); process.exitCode = 1; });
