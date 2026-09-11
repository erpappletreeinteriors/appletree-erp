'use strict';
// Phase 34 — SOP Gap Closure: Job Work/APOB, Ship-to GSTIN, E-way Bill, ITC control, BOQ
// variance, payment-category policy. Live test suite, same convention as phase33_sop_compliance_tests.js.
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
const today = new Date().toISOString().slice(0,10);

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('purchase1','Pur@12345'), login('site1','Site@12345'), login('sales1','Sal@123456')
  ]);

  // ============================================================
  // Job Worker master + dispatch/return/scrap/direct-dispatch
  // ============================================================
  const jwRegR = await api('finance1','POST','/api/job-workers',{name:'Kerala Veneer Processors', address:'Perumbavoor', gstin:'32AABCJ1111A1Z1', registered:true, state:'Kerala'});
  record('Job Work','Registered Job Worker created', jwRegR.ok && jwRegR.jobWorker.registered, JSON.stringify(jwRegR));
  const jwUnregR = await api('finance1','POST','/api/job-workers',{name:'Local Polishing Unit', address:'Angamaly', registered:false, state:'Kerala'});
  record('Job Work','Unregistered Job Worker created', jwUnregR.ok && jwUnregR.jobWorker.registered===false, JSON.stringify(jwUnregR));
  const jwDenied = await api('sales1','POST','/api/job-workers',{name:'Hacker JW'});
  record('Job Work','Sales role cannot create a Job Worker', jwDenied.ok===false, JSON.stringify(jwDenied));

  // Get real stock into WH-1 for MAT-3 (Teak Veneer) to dispatch to job work.
  const po1 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-3', qty:50, rate:3500}]});
  await api('purchase1','POST',`/api/purchase-orders/${po1.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po1.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po1.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:50}]});

  const dispatchR = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jwRegR.jobWorker.id, warehouseId:'WH-1',
    lines:[{materialId:'MAT-3', qty:20}], expectedReturnDate:'2027-01-01', purpose:'Veneer polishing', jobWorkReference:'JWREF-001', transporterName:'Kochi Carriers', vehicleNo:'KL-40-9999'});
  record('Job Work','Material dispatched to Job Worker — generates a Delivery Challan', dispatchR.ok && !!dispatchR.deliveryChallan.dcNo, JSON.stringify(dispatchR));
  const jwo = dispatchR.jobWorkOrder;
  const jwStockR = await api('finance1','GET',`/api/inventory/stock?materialId=MAT-3&warehouseId=WH-1`);
  record('Job Work','Warehouse stock correctly reduced by the dispatched qty (50-20=30)', jwStockR.ok && jwStockR.stock===30, JSON.stringify(jwStockR));

  const overReturnR = await api('purchase1','POST',`/api/job-work-orders/${jwo.id}/return`,{returnedLines:[{qty:25}]});
  record('Job Work','Cannot return more than was dispatched', overReturnR.ok===false, JSON.stringify(overReturnR));
  const returnR = await api('purchase1','POST',`/api/job-work-orders/${jwo.id}/return`,{returnedLines:[{qty:15}]});
  record('Job Work','Partial return recorded, warehouse stock increases back', returnR.ok && returnR.jobWorkOrder.status==='PartiallyReturned', JSON.stringify(returnR));
  const whStockAfterReturn = await api('finance1','GET',`/api/inventory/stock?materialId=MAT-3&warehouseId=WH-1`);
  record('Job Work','Warehouse stock correctly increased by the returned qty (30+15=45)', whStockAfterReturn.ok && whStockAfterReturn.stock===45, JSON.stringify(whStockAfterReturn));

  const scrapBadDispositionR = await api('purchase1','POST',`/api/job-work-orders/${jwo.id}/scrap`,{lineIndex:0, qty:5, disposition:'Sold By Job Worker (Registered, Tax-Paid)'});
  record('Job Work','Scrap "Sold By Job Worker" disposition accepted for a REGISTERED job worker', scrapBadDispositionR.ok && scrapBadDispositionR.scrapRecord.taxFlag.includes('no Apple Tree GL entry'), JSON.stringify(scrapBadDispositionR));
  const jwoAfterScrap = await api('finance1','GET','/api/job-work-orders');
  const jwoFinal = jwoAfterScrap.jobWorkOrders.find(j=>j.id===jwo.id);
  record('Job Work','Job Work Order fully accounted for (15 returned + 5 scrap = 20 dispatched) — status Returned', jwoFinal.status==='Returned', JSON.stringify(jwoFinal));

  // Unregistered job worker scrap "Sold By Job Worker" must be rejected
  const po2 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-4', qty:100, rate:450}]});
  await api('purchase1','POST',`/api/purchase-orders/${po2.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po2.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po2.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:100}]});
  const dispatch2 = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jwUnregR.jobWorker.id, warehouseId:'WH-1', lines:[{materialId:'MAT-4', qty:10}], purpose:'Edge banding'});
  const badScrapUnreg = await api('purchase1','POST',`/api/job-work-orders/${dispatch2.jobWorkOrder.id}/scrap`,{lineIndex:0, qty:2, disposition:'Sold By Job Worker (Registered, Tax-Paid)'});
  record('Job Work','Unregistered job worker CANNOT use "Sold By Job Worker (Registered, Tax-Paid)" disposition', badScrapUnreg.ok===false, JSON.stringify(badScrapUnreg));
  const okScrapUnreg = await api('purchase1','POST',`/api/job-work-orders/${dispatch2.jobWorkOrder.id}/scrap`,{lineIndex:0, qty:2, disposition:'Sold By Apple Tree'});
  record('Job Work','Unregistered job worker scrap "Sold By Apple Tree" flags APPLE TREE TAX HANDLING REQUIRED', okScrapUnreg.ok && okScrapUnreg.scrapRecord.taxFlag.includes('APPLE TREE TAX HANDLING REQUIRED'), JSON.stringify(okScrapUnreg));

  // ============================================================
  // APOB control on direct dispatch
  // ============================================================
  const directDispatchNoAPOB = await api('purchase1','POST',`/api/job-work-orders/${dispatch2.jobWorkOrder.id}/direct-dispatch`,{lineIndex:0, qty:5, customerId:'CUST-1'});
  record('APOB','Direct dispatch from an UNREGISTERED job worker with NO APOB declaration is BLOCKED (APOB REQUIRED)', directDispatchNoAPOB.ok===false && directDispatchNoAPOB.apobRequired===true, JSON.stringify(directDispatchNoAPOB));
  const apobR = await api('finance1','POST','/api/apob-declarations',{jobWorkerId:jwUnregR.jobWorker.id, location:'Angamaly Unit', approvalReference:'GST-APOB-REF-001'});
  record('APOB','APOB Declaration created by Finance', apobR.ok, JSON.stringify(apobR));
  const directDispatchWithAPOB = await api('purchase1','POST',`/api/job-work-orders/${dispatch2.jobWorkOrder.id}/direct-dispatch`,{lineIndex:0, qty:5, customerId:'CUST-1'});
  record('APOB','Direct dispatch now succeeds once an active APOB declaration exists', directDispatchWithAPOB.ok, JSON.stringify(directDispatchWithAPOB));
  record('Ship-to GSTIN','shipToGstinRequired flag correctly true for a dispatch dated today (>= 2026-08-01 SOP effective date)', directDispatchWithAPOB.shipToGstinRequired===true, JSON.stringify(directDispatchWithAPOB.shipToGstinRequired));

  // Registered job worker's direct dispatch needs NO APOB
  const dispatch3 = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jwRegR.jobWorker.id, warehouseId:'WH-1', lines:[{materialId:'MAT-3', qty:5}], purpose:'test'});
  const directDispatchRegistered = await api('purchase1','POST',`/api/job-work-orders/${dispatch3.jobWorkOrder.id}/direct-dispatch`,{lineIndex:0, qty:5, customerId:'CUST-1'});
  record('APOB','Direct dispatch from a REGISTERED job worker needs no APOB — succeeds immediately', directDispatchRegistered.ok, JSON.stringify(directDispatchRegistered));

  // ============================================================
  // Job Work Aging
  // ============================================================
  const dispatch4 = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jwRegR.jobWorker.id, warehouseId:'WH-1', lines:[{materialId:'MAT-3', qty:5}],
    expectedReturnDate:'2020-01-01', purpose:'aging test'});
  const agingR = await api('finance1','GET','/api/job-work-aging');
  const agingRow = agingR.rows.find(r=>r.jwoId===dispatch4.jobWorkOrder.id);
  record('Job Work Aging','A job work order past its expected return date with NO extension shows EXTENSION APPROVAL REQUIRED (never silently OVERDUE)', agingRow && agingRow.status==='EXTENSION APPROVAL REQUIRED', JSON.stringify(agingRow));
  const extReqR = await api('purchase1','POST',`/api/job-work-orders/${dispatch4.jobWorkOrder.id}/request-extension`,{newDueDate:'2020-06-01', reason:'Processing delay'});
  record('Job Work Aging','Extension request recorded', extReqR.ok, JSON.stringify(extReqR));
  const extApproveR = await api('finance1','POST',`/api/job-work-extensions/${extReqR.extension.id}/approve`,{});
  record('Job Work Aging','Extension approved by Finance', extApproveR.ok, JSON.stringify(extApproveR));
  const agingR2 = await api('finance1','GET','/api/job-work-aging');
  const agingRow2 = agingR2.rows.find(r=>r.jwoId===dispatch4.jobWorkOrder.id);
  record('Job Work Aging','With an APPROVED extension still in the past, status is OVERDUE (not silently cleared)', agingRow2 && agingRow2.status==='OVERDUE', JSON.stringify(agingRow2));

  // ============================================================
  // E-way Bill
  // ============================================================
  const ewbSmall = await api('purchase1','POST','/api/eway-bills',{documentType:'DeliveryChallan', documentId:dispatch3.deliveryChallan.id, value:30000, sourceLocation:'WH-1', destinationLocation:'Job Worker'});
  record('E-way Bill','Value under ₹50,000 correctly flagged NOT REQUIRED', ewbSmall.ok && ewbSmall.ewayBill.required===false, JSON.stringify(ewbSmall));
  const ewbLarge = await api('purchase1','POST','/api/eway-bills',{documentType:'DeliveryChallan', documentId:dispatch1_docId(dispatchR), value:75000, sourceLocation:'WH-1', destinationLocation:'Job Worker', transporterName:'Kochi Carriers', vehicleNo:'KL-40-9999'});
  record('E-way Bill','Value over ₹50,000 correctly flagged E-WAY BILL REQUIRED — NOT YET GENERATED', ewbLarge.ok && ewbLarge.ewayBill.required===true && ewbLarge.ewayBill.status.includes('REQUIRED'), JSON.stringify(ewbLarge));
  const ewbNumberR = await api('purchase1','POST',`/api/eway-bills/${ewbLarge.ewayBill.id}/record-number`,{number:'271000000123', validity:'2026-09-05'});
  record('E-way Bill','Recording a real e-way bill number updates status to GENERATED (manually recorded)', ewbNumberR.ok && ewbNumberR.ewayBill.status.includes('manually recorded'), JSON.stringify(ewbNumberR));
  function dispatch1_docId(d){ return d.deliveryChallan.id; }

  // ============================================================
  // ITC reversal on Damage Report
  // ============================================================
  const po3 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:10, rate:2800}]});
  await api('purchase1','POST',`/api/purchase-orders/${po3.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po3.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po3.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:10}]});
  const billR = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po3.po.id, grnId:(await api('purchase1','GET','/api/grns')).grns.find(g=>g.poId===po3.po.id).id, invoiceLines:[{qty:10, rate:2800}], taxCode:'GST18', date:today});
  record('ITC Control','Bill posted with GST18 tax code (Input Tax claimed)', billR.ok, JSON.stringify(billR));
  const tb0 = await api('accountant1','GET','/api/trial-balance');
  const itcBefore = (tb0.byAccount['1300']?.debit||0)-(tb0.byAccount['1300']?.credit||0);
  const damageR = await api('finance1','POST','/api/damage-reports',{materialId:'MAT-1', qty:4, warehouseId:'WH-1', reasonCategory:'Transit/Handling Damage'});
  record('ITC Control','Damage Report created, ITC reversal amount computed and returned', damageR.ok && damageR.damageReport.itcReversed>0, JSON.stringify(damageR));
  const tb1 = await api('accountant1','GET','/api/trial-balance');
  const itcAfter = (tb1.byAccount['1300']?.debit||0)-(tb1.byAccount['1300']?.credit||0);
  record('ITC Control','1300 Input Tax Recoverable balance reduced by exactly the reversed ITC amount', Math.abs((itcBefore-itcAfter)-damageR.damageReport.itcReversed)<0.02, `before=${itcBefore} after=${itcAfter} reversed=${damageR.damageReport.itcReversed}`);
  const itcReportR = await api('accountant1','GET','/api/itc-reversal-report');
  record('ITC Control','ITC reversal report shows the reversal entry', itcReportR.ok && itcReportR.totalReversed>=damageR.damageReport.itcReversed, JSON.stringify(itcReportR));
  const dTB = Object.values(tb1.byAccount).reduce((s,a)=>s+a.debit,0), cTB = Object.values(tb1.byAccount).reduce((s,a)=>s+a.credit,0);
  record('ITC Control','Trial Balance still balances after the ITC reversal posting', Math.abs(dTB-cTB)<0.02, `Dr=${dTB} Cr=${cTB}`);

  // ============================================================
  // BOQ Variance Report (wraps existing materialBomQuota, no new object)
  // ============================================================
  const boqR = await api('finance1','GET','/api/boq-variance?projectId=PRJ-1');
  record('BOQ Variance','BOQ variance report returns without error for a project (even with no approved BOM — empty lines is a valid, honest result)', boqR.ok, JSON.stringify(boqR).slice(0,300));

  // ============================================================
  // Three-way-match payment-category policy
  // ============================================================
  const policyGoods = await api('finance1','GET','/api/payment-category-policy?category=goods');
  record('Payment Policy','Goods category is pre-confirmed TECHNICALLY COMPLIANT (has a real GRN concept)', policyGoods.ok && policyGoods.status==='TECHNICALLY COMPLIANT', JSON.stringify(policyGoods));
  const policyRent = await api('finance1','GET','/api/payment-category-policy?category=rent');
  record('Payment Policy','Rent category correctly shows PAYMENT CONTROL POLICY REQUIRED (no GRN concept) until Finance confirms', policyRent.ok && policyRent.status==='PAYMENT CONTROL POLICY REQUIRED', JSON.stringify(policyRent));
  const confirmDenied = await api('purchase1','POST','/api/payment-category-policy/confirm',{category:'rent', confirmed:true});
  record('Payment Policy','Non-Finance role cannot confirm payment-category policy', confirmDenied.ok===false, JSON.stringify(confirmDenied));
  const confirmR = await api('finance1','POST','/api/payment-category-policy/confirm',{category:'rent', confirmed:true});
  record('Payment Policy','Finance CAN confirm the policy for a category', confirmR.ok, JSON.stringify(confirmR));
  const policyRentAfter = await api('finance1','GET','/api/payment-category-policy?category=rent');
  record('Payment Policy','After confirmation, rent category now shows TECHNICALLY COMPLIANT', policyRentAfter.status==='TECHNICALLY COMPLIANT', JSON.stringify(policyRentAfter));

  // ============================================================
  // PO approval policy config extension
  // ============================================================
  const poConfigR = await api('finance1','GET','/api/purchase-approval-config');
  record('PO Policy','PO approval config now exposes approving/escalation roles + POLICY NOT FINALISED status', poConfigR.ok && poConfigR.config.status==='POLICY NOT FINALISED' && poConfigR.config.escalationRole==='FinanceManager', JSON.stringify(poConfigR));

  // ============================================================
  // Dashboard status-category breakdown (§36 — never a single collapsed 100% figure)
  // ============================================================
  const dashR = await api('finance1','GET','/api/sop-compliance-dashboard');
  record('Dashboard','Dashboard exposes a statusBreakdown with configurationRequired/managementDecisions/taxLegalReview/realWorldUATRequired/futureEnhancement, all non-empty', dashR.ok &&
    dashR.dashboard.statusBreakdown.configurationRequired.length>0 && dashR.dashboard.statusBreakdown.managementDecisions.length>0 &&
    dashR.dashboard.statusBreakdown.taxLegalReview.length>0 && dashR.dashboard.statusBreakdown.realWorldUATRequired.length>0 && dashR.dashboard.statusBreakdown.futureEnhancement.length>0,
    JSON.stringify(dashR.dashboard.statusBreakdown));
  record('Dashboard','Dashboard now tracks Job Work/E-way Bill figures (not placeholders)', dashR.dashboard.activeJobWorkers>=2 && dashR.dashboard.openJobWorkOrders>=1, JSON.stringify({activeJobWorkers:dashR.dashboard.activeJobWorkers, openJobWorkOrders:dashR.dashboard.openJobWorkOrders}));

  // ============================================================
  // Central engine + regression sanity
  // ============================================================
  const finalRecon = await api('accountant1','GET','/api/reconciliation');
  record('Regression Sanity','AR/AP reconciliation still MATCH after every Phase 34 transaction above', finalRecon.ok && finalRecon.ar.matches && finalRecon.ap.matches, JSON.stringify(finalRecon));
  const legacyPOR = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:2, rate:2800}]});
  record('Regression Sanity','Legacy-style PO creation still works exactly as before Phase 34', legacyPOR.ok, JSON.stringify(legacyPOR));
  const po5 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-5', qty:20, rate:180}]});
  await api('purchase1','POST',`/api/purchase-orders/${po5.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po5.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po5.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:20}]});
  const legacyDamageR = await api('finance1','POST','/api/damage-reports',{materialId:'MAT-5', qty:1, warehouseId:'WH-1', reasonCategory:'Other', explanation:'test — confirms the new ITC-reversal code path never breaks an ordinary Damage Report'});
  record('Regression Sanity','Damage Report still works on a fresh material after the Phase 34 ITC-reversal wiring was added', legacyDamageR.ok, JSON.stringify(legacyDamageR));

  // ============================================================ report ============================================================
  console.log('\n================ PHASE 34 SOP GAP CLOSURE — LIVE TEST RESULTS ================\n');
  let pass=0, fail=0, lastSection=null;
  for(const r of results){
    if(r.section!==lastSection){ console.log('\n--- '+r.section+' ---'); lastSection=r.section; }
    console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}`);
    if(!r.pass) console.log('    detail: '+r.detail);
    r.pass ? pass++ : fail++;
  }
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL ================\n`);
  process.exit(fail>0?1:0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
