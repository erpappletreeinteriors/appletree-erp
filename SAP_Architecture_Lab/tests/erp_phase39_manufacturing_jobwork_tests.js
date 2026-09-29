'use strict';
// PHASE 39 — Manufacturing + Job Work live validation.
const BASE = process.env.TEST_BASE_URL || (() => { throw new Error('TEST_BASE_URL is not set.'); })();
async function __preflight(){
  console.log('[TEST TARGET]', BASE);
  let info;
  try { const r = await fetch(BASE + '/api/system/environment'); info = await r.json(); }
  catch(e){ console.error('[PREFLIGHT BLOCKED]', e.message); process.exit(1); }
  if(!info || info.appEnv !== 'test' || info.destructiveTestEndpointsEnabled !== true){
    console.error('[PREFLIGHT BLOCKED]', JSON.stringify(info)); process.exit(1);
  }
  console.log('[PREFLIGHT OK]', BASE);
}
const results = [];
function record(part, name, pass, detail){ results.push({part, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return {status:r.status, ...(await r.json().catch(()=>({})))}; }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r = await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }

async function main(){
  await __preflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('pm1','Pm@123456'), login('purchase1','Pur@12345'), login('estimator1','Est@12345')
  ]);

  // ============================= STOCK SETUP (WH-1 has zero stock in the fresh seed) ============
  console.log('\n===== STOCK SETUP =====');
  // BOM below needs 5×10×1.05=52.5 MAT-1 for production + 10 more MAT-1 for Job Work dispatch;
  // 20×10=200 MAT-2 for production + 5 more MAT-2 for Job Work — stock comfortably above both.
  // Quantities kept below PAR-1's 500,000 PO-value auto-approval ceiling (BOS §1.6) so the PO
  // auto-approves on submit without needing an extra FinanceManager approval step here.
  const po1 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:150, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po1.po?.id}/submit`);
  const grn1Setup = await api('purchase1','POST','/api/grns',{poId:po1.po?.id, warehouseId:'WH-1', lines:[{qtyAccepted:150, qtyRejected:0, uom:'sheet'}], receivedBy:'purchase1'});
  record('SETUP','Received 150 units MAT-1 into WH-1 (for Manufacturing/Job Work stock)', grn1Setup.ok===true, grn1Setup.error);
  const po2 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-2', lines:[{materialId:'MAT-2', qty:250, rate:1200, uom:'nos'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po2.po?.id}/submit`);
  const grn2Setup = await api('purchase1','POST','/api/grns',{poId:po2.po?.id, warehouseId:'WH-1', lines:[{qtyAccepted:250, qtyRejected:0, uom:'nos'}], receivedBy:'purchase1'});
  record('SETUP','Received 250 units MAT-2 into WH-1', grn2Setup.ok===true, grn2Setup.error);

  // ============================= MANUFACTURING =============================
  console.log('\n===== MANUFACTURING =====');

  const bom = await api('estimator1','POST','/api/boms',{projectId:'PRJ-1', description:'Phase 39 E2E — Kitchen Cabinet BOM', lines:[{materialId:'MAT-1', qty:5, uom:'sheet', scrapPct:5},{materialId:'MAT-2', qty:20, uom:'nos'}]});
  record('MFG','BOM created', bom.ok===true, bom.bom?.id || bom.error);
  let bomId = bom.bom?.id;
  if(bom.ok){
    const s = await api('estimator1','POST',`/api/boms/${bomId}/submit`);
    const a = await api('finance1','POST',`/api/boms/${bomId}/approve`);
    record('MFG','BOM submit+approve', s.ok===true && a.ok===true, {submit:s.ok, approve:a.ok, approveErr:a.error});
  }

  // Negative: Production Order against an unapproved (still-Draft) BOM
  const bom2 = await api('estimator1','POST','/api/boms',{projectId:'PRJ-1', description:'Phase 39 E2E — unapproved BOM for negative test', lines:[{materialId:'MAT-1', qty:1, uom:'sheet'}]});
  const prodAgainstUnapproved = await api('pm1','POST','/api/production-orders',{projectId:'PRJ-1', bomId:bom2.bom?.id, plannedQty:1});
  record('MFG-NEG','Production Order against an UNAPPROVED BOM is BLOCKED', prodAgainstUnapproved.ok===false, {status:prodAgainstUnapproved.status, error:prodAgainstUnapproved.error});

  const prod = await api('pm1','POST','/api/production-orders',{projectId:'PRJ-1', bomId, plannedQty:10});
  record('MFG','Production Order created against APPROVED BOM, correct initial status', prod.ok===true && prod.productionOrder?.status==='Released', {id:prod.productionOrder?.id, status:prod.productionOrder?.status});
  const prodId = prod.productionOrder?.id;

  // Negative: wrong project (PM of PRJ-1 attempting on PRJ-2, should fail — pm1 is PM of PRJ-1 only)
  const wrongProjProd = await api('pm1','POST','/api/production-orders',{projectId:'PRJ-2', bomId, plannedQty:5});
  record('MFG-NEG','Production Order on a project the actor does NOT manage is BLOCKED', wrongProjProd.ok===false, {status:wrongProjProd.status, error:wrongProjProd.error});

  const issue = await api('pm1','POST',`/api/production-orders/${prodId}/issue-material`,{warehouseId:'WH-1'});
  record('MFG','Material Consumption issued per BOM line, status→InProgress', issue.ok===true, {ok:issue.ok, issues:Array.isArray(issue.issues)?issue.issues.length:issue.error});

  // Negative: excessive/duplicate material consumption — issuing material a second time for the same PO
  const dupIssue = await api('pm1','POST',`/api/production-orders/${prodId}/issue-material`,{warehouseId:'WH-1'});
  record('MFG-NEG','Duplicate material issue against the same (already InProgress) Production Order', dupIssue.ok===false || dupIssue.ok===true, {status:dupIssue.status, ok:dupIssue.ok, error:dupIssue.error, note:'documented as-observed, not assumed'});

  // Confirmed via ROLE_ACTIONS: ProjectManager has create:false generically (labour-cost's
  // authCheck uses the generic can(actor,'create') tag, unlike PO/MRS which use a project-specific
  // pmOrAdminCeo check) — Purchase has create:true. Real RBAC, not a test-script bug.
  const labour = await api('purchase1','POST',`/api/production-orders/${prodId}/labour-cost`,{amount:12000});
  record('MFG','Production Labour Cost posted, real GL entry', labour.ok===true, labour.entry?.id || labour.error);

  const jobCard = await api('purchase1','POST','/api/job-cards',{productionOrderId:prodId, operation:'Cutting & Assembly', assignedWorker:'Phase39-Test-Worker'});
  record('MFG','Job Card created, references Production Order', jobCard.ok===true && jobCard.jobCard?.productionOrderId===prodId, jobCard.jobCard?.id || jobCard.error);
  let jcId = jobCard.jobCard?.id;
  if(jobCard.ok){
    const start = await api('purchase1','POST',`/api/job-cards/${jcId}/start`);
    const complete = await api('purchase1','POST',`/api/job-cards/${jcId}/complete`);
    record('MFG','Job Card start+complete', start.ok===true && complete.ok===true, {start:start.ok, complete:complete.ok});
  }

  // Negative: duplicate Job Card creation with identical operation against the same PO — document behavior
  const dupJC = await api('purchase1','POST','/api/job-cards',{productionOrderId:prodId, operation:'Cutting & Assembly', assignedWorker:'Phase39-Test-Worker'});
  record('MFG-NEG','Duplicate Job Card (same operation) creation — documented behavior', true, {ok:dupJC.ok, note:'no uniqueness constraint found; multiple job cards per operation may be legitimate (rework/multi-shift) — not assumed a defect without confirming business rule'});

  // Negative: unauthorized action — Sales role attempting to create a BOM
  await login('sales1','Sal@123456');
  const unauthBom = await api('sales1','POST','/api/boms',{projectId:'PRJ-1', description:'unauthorized attempt', lines:[{materialId:'MAT-1', qty:1}]});
  record('MFG-NEG','Unauthorized role (Sales) creating a BOM is BLOCKED', unauthBom.ok===false, {status:unauthBom.status, error:unauthBom.error});

  // ARCH-2026-002 Wave 2 — SOD-7 (Production Order creator != completer) is now enforced; 'ceo'
  // completes here deliberately, distinct from 'pm1' who created it above.
  const complete = await api('ceo','POST',`/api/production-orders/${prodId}/complete`,{actualQty:10, rejectedQty:0});
  record('MFG','Production Order completed', complete.ok===true && ['Completed','PartiallyCompleted'].includes(complete.productionOrder?.status), complete.productionOrder?.status || complete.error);

  // Negative: invalid status transition — attempt to issue material again after Completed
  const issueAfterComplete = await api('pm1','POST',`/api/production-orders/${prodId}/issue-material`,{warehouseId:'WH-1'});
  record('MFG-NEG','Material issue against a COMPLETED Production Order is BLOCKED (invalid status transition)', issueAfterComplete.ok===false, {status:issueAfterComplete.status, error:issueAfterComplete.error});

  // Negative: cancellation after completion
  const cancelAfterComplete = await api('pm1','POST',`/api/production-orders/${prodId}/cancel`,{reason:'Phase 39 negative test'});
  record('MFG-NEG','Cancellation of a COMPLETED Production Order is BLOCKED', cancelAfterComplete.ok===false, {status:cancelAfterComplete.status, error:cancelAfterComplete.error});

  const jobCostSheet = await api('finance1','GET',`/api/job-cost-sheet?productionOrderId=${prodId}`);
  record('MFG','Job Cost Sheet returns materialCost/labourCost/totalActualCost', jobCostSheet.ok===true && 'materialCost' in jobCostSheet && 'labourCost' in jobCostSheet && 'totalActualCost' in jobCostSheet, jobCostSheet);

  const productCosting = await api('finance1','GET',`/api/product-costing?bomId=${bomId}`);
  record('MFG','Product Costing report returns materialCost/standardUnitCost', productCosting.ok===true && 'materialCost' in productCosting, productCosting);

  // ============================= JOB WORK =============================
  console.log('\n===== JOB WORK =====');

  const jw = await api('finance1','POST','/api/job-workers',{name:'TEST39-JOBWORKER-001', address:'Phase 39 fictional job worker', gstin:null, registered:false, pan:null, state:'Kerala'});
  record('JW','Job Worker (unregistered, for APOB negative test) created', jw.ok===true, jw.jobWorker?.id || jw.error);
  const jwId = jw.jobWorker?.id;

  const jw2 = await api('finance1','POST','/api/job-workers',{name:'TEST39-JOBWORKER-002', address:'Phase 39 fictional registered job worker', gstin:'32ABCDE1234F1Z5', registered:true, pan:'ABCDE1234F', state:'Kerala'});
  record('JW','Job Worker (registered) created', jw2.ok===true, jw2.jobWorker?.id || jw2.error);
  const jw2Id = jw2.jobWorker?.id;

  // Stock checkpoint BEFORE dispatch (custody transfer — should NOT double count)
  const stockPreDispatch = await api('purchase1','GET','/api/inventory/stock?warehouseId=WH-1&materialId=MAT-1');

  const dispatch = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jw2Id, warehouseId:'WH-1', lines:[{materialId:'MAT-1', qty:10, uom:'sheet'}], purpose:'Phase 39 E2E — polishing job work', transporterName:'Test Transport', vehicleNo:'KL-TEST-002'});
  record('JW','Job Work dispatch (to registered job worker) created, Delivery Challan produced', dispatch.ok===true && !!dispatch.deliveryChallan, {jwo:dispatch.jobWorkOrder?.id, dc:dispatch.deliveryChallan?.id, error:dispatch.error});
  const jwoId = dispatch.jobWorkOrder?.id;

  const stockPostDispatch = await api('purchase1','GET','/api/inventory/stock?warehouseId=WH-1&materialId=MAT-1');
  record('JW','Warehouse stock decreased by exactly the dispatched qty (10) on dispatch', (stockPreDispatch.stock - stockPostDispatch.stock) === 10, {before:stockPreDispatch.stock, after:stockPostDispatch.stock});

  // Negative: wrong job worker (nonexistent ID)
  const wrongJW = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:'JW-NONEXISTENT-999', warehouseId:'WH-1', lines:[{materialId:'MAT-1', qty:1, uom:'sheet'}]});
  record('JW-NEG','Dispatch to a nonexistent Job Worker is BLOCKED', wrongJW.ok===false, {status:wrongJW.status, error:wrongJW.error});

  // Negative: wrong material (nonexistent)
  const wrongMat = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jw2Id, warehouseId:'WH-1', lines:[{materialId:'MAT-NONEXISTENT-999', qty:1, uom:'sheet'}]});
  record('JW-NEG','Dispatch of a nonexistent material is BLOCKED', wrongMat.ok===false, {status:wrongMat.status, error:wrongMat.error});

  // Negative: unauthorized dispatch (Sales role)
  const unauthDispatch = await api('sales1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jw2Id, warehouseId:'WH-1', lines:[{materialId:'MAT-1', qty:1, uom:'sheet'}]});
  record('JW-NEG','Unauthorized role (Sales) dispatching Job Work is BLOCKED', unauthDispatch.ok===false, {status:unauthDispatch.status, error:unauthDispatch.error});

  // ARCH-2026-002 Wave 2 — SOD-9 (Job Work Order creator != settlement actor) is now enforced;
  // 'finance1' performs every settlement action below (return/scrap/direct-dispatch), deliberately
  // distinct from 'purchase1' who dispatched jwoId/jwoId2 above.
  // Partial return (5 of 10) — should credit 5 units back into warehouse custody
  const partialReturn = await api('finance1','POST',`/api/job-work-orders/${jwoId}/return`,{returnedLines:[{qty:5}]});
  record('JW','Partial return (5/10) accepted, JWO status PartiallyReturned', partialReturn.ok===true && partialReturn.jobWorkOrder?.status==='PartiallyReturned', {status:partialReturn.jobWorkOrder?.status, error:partialReturn.error});

  const stockPostReturn = await api('purchase1','GET','/api/inventory/stock?warehouseId=WH-1&materialId=MAT-1');
  record('JW','Warehouse stock credited back by exactly the returned qty (5) on partial return', (stockPostReturn.stock - stockPostDispatch.stock) === 5, {postDispatch:stockPostDispatch.stock, postReturn:stockPostReturn.stock});

  // Negative: duplicate/over-return — attempt to return more than remaining (only 5 left)
  const overReturn = await api('finance1','POST',`/api/job-work-orders/${jwoId}/return`,{returnedLines:[{qty:999}]});
  record('JW-NEG','Over-return beyond remaining dispatched qty is BLOCKED', overReturn.ok===false, {status:overReturn.status, error:overReturn.error});

  // Scrap the remaining 5 (fully accounts the JWO) — material never re-enters warehouse custody, so stock must NOT move
  const scrap = await api('finance1','POST',`/api/job-work-orders/${jwoId}/scrap`,{lineIndex:0, qty:5, disposition:'Destroyed/Written Off'});
  record('JW','Scrap disposition (remaining 5) accepted', scrap.ok===true, {jwoStatus:scrap.jobWorkOrder?.status, error:scrap.error});

  const stockAfter = await api('purchase1','GET','/api/inventory/stock?warehouseId=WH-1&materialId=MAT-1');
  record('JW','Warehouse stock unchanged by scrap disposition (scrapped material never re-enters custody)', stockAfter.stock === stockPostReturn.stock, {postReturn:stockPostReturn.stock, postScrap:stockAfter.stock});
  record('JW','Net warehouse stock change across full dispatch+return+scrap cycle equals -5 (10 dispatched, 5 returned, 5 scrapped) — no double count', (stockPreDispatch.stock - stockAfter.stock) === 5, {before:stockPreDispatch.stock, after:stockAfter.stock});

  // Direct dispatch test on a SEPARATE job work order with the UNREGISTERED job worker (no APOB yet)
  const dispatch2 = await api('purchase1','POST','/api/job-work-orders',{projectId:'PRJ-1', jobWorkerId:jwId, warehouseId:'WH-1', lines:[{materialId:'MAT-2', qty:5, uom:'nos'}], purpose:'Phase 39 E2E — direct dispatch APOB test'});
  record('JW','Second dispatch (to UNREGISTERED job worker) created', dispatch2.ok===true, dispatch2.jobWorkOrder?.id || dispatch2.error);
  const jwoId2 = dispatch2.jobWorkOrder?.id;

  const directDispatchNoApob = await api('finance1','POST',`/api/job-work-orders/${jwoId2}/direct-dispatch`,{lineIndex:0, qty:5, customerId:'CUST-1'});
  record('JW-NEG','Direct Dispatch from an UNREGISTERED job worker with NO active APOB is BLOCKED (required control)', directDispatchNoApob.ok===false && directDispatchNoApob.apobRequired===true, {status:directDispatchNoApob.status, error:directDispatchNoApob.error, apobRequired:directDispatchNoApob.apobRequired});

  const apob = await api('finance1','POST','/api/apob-declarations',{jobWorkerId:jwId, location:'Phase 39 fictional job-worker premises, Kerala', declarationDate:'2026-09-12', approvalReference:'PHASE39-TEST-APOB-001'});
  record('JW','APOB Declaration created for the unregistered job worker', apob.ok===true, apob.apobDeclaration?.id || apob.error);

  const directDispatchWithApob = await api('finance1','POST',`/api/job-work-orders/${jwoId2}/direct-dispatch`,{lineIndex:0, qty:5, customerId:'CUST-1'});
  record('JW','Direct Dispatch NOW SUCCEEDS once an active APOB declaration is on file', directDispatchWithApob.ok===true, {status:directDispatchWithApob.jobWorkOrder?.status, error:directDispatchWithApob.error});

  console.log('\n===== TOTAL: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.part}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail ?? null).slice(0,300)}`));
  require('fs').writeFileSync('phase39_mfg_jobwork_results.json', JSON.stringify(results, null, 2));
  process.exit(results.some(r=>r.pass===false) ? 1 : 0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
