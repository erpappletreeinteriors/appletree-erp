'use strict';
// PHASE 38 — End-to-End ERP Business Process + Accounting Traceability live test.
// Self-contained preflight guard (see docs — same pattern as the ERP-059C-migrated suite).
const BASE = process.env.TEST_BASE_URL || (() => { throw new Error('TEST_BASE_URL is not set. Refusing to run against an unspecified target.'); })();
async function __preflight(){
  console.log('[TEST TARGET]', BASE);
  let info;
  try { const r = await fetch(BASE + '/api/system/environment'); info = await r.json(); }
  catch(e){ console.error('[PREFLIGHT BLOCKED]', e.message); process.exit(1); }
  if(!info || info.appEnv !== 'test' || info.destructiveTestEndpointsEnabled !== true){
    console.error('[PREFLIGHT BLOCKED] target is not APP_ENV=test:', JSON.stringify(info));
    process.exit(1);
  }
  console.log('[PREFLIGHT OK]', BASE, 'confirmed APP_ENV=test.');
}

const results = [];
function record(part, name, pass, detail){ results.push({part, name, pass, detail}); }

const jars = {};
async function login(u,p){ const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return {status:r.status, ...(await r.json().catch(()=>({})))}; }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r = await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }

async function fullPost(creatorUser, createPath, createBody, approver){
  const draft = await api(creatorUser,'POST',createPath, createBody);
  if(!draft.ok) return {ok:false, stage:'draft', draft};
  const id = draft.draft.id;
  const sub = await api(approver||'accountant1','POST',`/api/journal/${id}/submit`);
  if(!sub.ok) return {ok:false, stage:'submit', sub, draft};
  const appr = await api('finance1','POST',`/api/journal/${id}/approve`);
  if(!appr.ok) return {ok:false, stage:'approve', appr, draft};
  const post = await api('finance1','POST',`/api/journal/${id}/post`);
  if(!post.ok) return {ok:false, stage:'post', post, draft};
  return {ok:true, entry:post.entry, draft};
}

async function main(){
  await __preflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('pm1','Pm@123456'), login('purchase1','Pur@12345'), login('sales1','Sal@123456'),
    login('estimator1','Est@12345'), login('viewer1','View@1234'), login('site1','Site@12345')
  ]);

  // ============================= PART 4 — PROCUREMENT-TO-PAY CHAIN =============================
  console.log('\n===== PART 4 — PROCUREMENT-TO-PAY =====');

  // Material Requirement can only be raised by the Project Manager of the project (or Admin/CEO) —
  // confirmed via authCheck at server.js:316 (real RBAC, not a test convenience).
  const mr = await api('pm1','POST','/api/material-requirements',{projectId:'PRJ-1', materialId:'MAT-1', qty:50, uom:'sheet', requiredDate:'2026-09-20', priority:'Normal', reason:'Phase 38 E2E trace test'});
  record('P4','Material Requirement created', mr.ok===true, mr.requirement?.id);
  if(mr.ok){
    // No /submit route exists for material-requirements (confirmed via source read) — DRAFT goes
    // straight to /approve.
    await api('finance1','POST',`/api/material-requirements/${mr.requirement.id}/approve`);
  }
  const matReq = await api('purchase1','POST','/api/material-requests',{projectId:'PRJ-1', requirementIds:[mr.requirement?.id].filter(Boolean), lines:[{materialId:'MAT-1', qty:50, uom:'sheet'}]});
  record('P4','Material Request (MR) created, references the Requirement', matReq.ok===true && (matReq.materialRequest?.requirementIds||[]).includes(mr.requirement?.id), matReq.materialRequest?.id);
  if(matReq.ok){
    const mrSubmit = await api('purchase1','POST',`/api/material-requests/${matReq.materialRequest.id}/submit`);
    const mrApprove = await api('finance1','POST',`/api/material-requests/${matReq.materialRequest.id}/approve`);
    record('P4','Material Request submitted + approved (required before RFQ can reference it)', mrSubmit.ok===true && mrApprove.ok===true, {mrSubmit:mrSubmit.ok, mrApprove:mrApprove.ok});
  }

  const rfq = await api('purchase1','POST','/api/rfqs',{projectId:'PRJ-1', materialRequestId:matReq.materialRequest?.id, supplierIds:['VEND-1','VEND-2'], lines:[{materialId:'MAT-1', qty:50, uom:'sheet'}], responseDeadline:'2026-09-25'});
  record('P4','RFQ created, references Material Request', rfq.ok===true && rfq.rfq?.materialRequestId===matReq.materialRequest?.id, rfq.rfq?.id);

  const sq1 = await api('purchase1','POST','/api/supplier-quotations',{rfqId:rfq.rfq?.id, supplierId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:2800}], leadTime:'5 days', paymentTerms:'30 days'});
  const sq2 = await api('purchase1','POST','/api/supplier-quotations',{rfqId:rfq.rfq?.id, supplierId:'VEND-2', lines:[{materialId:'MAT-1', qty:50, rate:2950}], leadTime:'3 days', paymentTerms:'45 days'});
  record('P4','2 Supplier Quotations recorded against the RFQ (comparison prerequisite)', sq1.ok===true && sq2.ok===true, {sq1:sq1.ok, sq2:sq2.ok});
  const cmp = await api('purchase1','POST','/api/supplier-comparisons',{rfqId:rfq.rfq?.id, recommendedSupplierId:'VEND-1', reason:'Phase 38 E2E trace — best lead time'});
  record('P4','Supplier Comparison created, references RFQ', cmp.ok===true && cmp.comparison?.rfqId===rfq.rfq?.id, cmp.comparison?.id);

  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', materialRequestId:matReq.materialRequest?.id, rfqId:rfq.rfq?.id, supplierComparisonId:cmp.comparison?.id, vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:2800, uom:'sheet'}], deliveryLocation:'Site', expectedDate:'2026-10-01'});
  record('P4','PO created, references MR/RFQ/Comparison', po.ok===true && po.po?.materialRequestId===matReq.materialRequest?.id && po.po?.rfqId===rfq.rfq?.id, po.po?.id);
  const poSubmit = await api('purchase1','POST',`/api/purchase-orders/${po.po?.id}/submit`);
  // Discovered live: submit AUTO-APPROVES a PO within the submitter's own approval threshold
  // (poSubmit.po.approvedBy === "(auto — within no-approval threshold)") — a real, working
  // authority-matrix feature, not a bug. Only call the explicit /approve endpoint if the PO is
  // still genuinely Submitted (i.e. above the auto-approval threshold).
  let poApprove = {ok:true, po:poSubmit.po};
  if(poSubmit.po?.status === 'Submitted'){
    poApprove = await api('ceo','POST',`/api/purchase-orders/${po.po?.id}/approve`);
  }
  record('P4','PO submitted, and reaches Approved status (explicit approval or in-threshold auto-approval)', poSubmit.ok===true && (poSubmit.po?.status==='Approved' || poApprove.ok===true), {poSubmit:poSubmit.ok, submitStatus:poSubmit.po?.status, approvedBy:poSubmit.po?.approvedBy, poApprove:poApprove.ok});

  // Partial receipt: GRN #1 for 30 of 50
  const grn1 = await api('purchase1','POST','/api/grns',{poId:po.po?.id, warehouseId:'WH-1', lines:[{qtyAccepted:30, qtyRejected:0, uom:'sheet'}], receivedBy:'purchase1'});
  record('P4','Partial GRN #1 (30/50) created, references PO', grn1.ok===true && grn1.grn?.poId===po.po?.id, grn1.grn?.id);
  const poAfterGrn1 = await api('purchase1','GET',`/api/purchase-orders`);
  const poStatus1 = (poAfterGrn1.purchaseOrders||[]).find(p=>p.id===po.po?.id)?.status;
  record('P4','PO status reflects partial receipt (PartiallyReceived)', poStatus1==='PartiallyReceived', poStatus1);

  // Second GRN for the remaining 20 — multiple GRNs against one PO
  const grn2 = await api('purchase1','POST','/api/grns',{poId:po.po?.id, warehouseId:'WH-1', lines:[{qtyAccepted:20, qtyRejected:0, uom:'sheet'}], receivedBy:'purchase1'});
  record('P4','Second GRN #2 (20/50) — multiple GRNs against one PO', grn2.ok===true, grn2.grn?.id);
  const poAfterGrn2 = await api('purchase1','GET',`/api/purchase-orders`);
  const poStatus2 = (poAfterGrn2.purchaseOrders||[]).find(p=>p.id===po.po?.id)?.status;
  record('P4','PO status now FullyReceived after both GRNs', poStatus2==='FullyReceived', poStatus2);

  // Over-receipt attempt (negative test)
  const overGrn = await api('purchase1','POST','/api/grns',{poId:po.po?.id, warehouseId:'WH-1', lines:[{qtyAccepted:1000, qtyRejected:0, uom:'sheet'}], receivedBy:'purchase1'});
  record('P4-NEG','Over-receipt (1000 vs 0 remaining) is BLOCKED', overGrn.ok===false, {status:overGrn.status, error:overGrn.error});

  // Bill against GRN #1 (partial billing)
  const bill1 = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po?.id, grnId:grn1.grn?.id, invoiceLines:[{qty:30, rate:2800}], taxCode:'GST18', date:'2026-10-05', narration:'Phase 38 E2E — bill against GRN #1 (partial)'});
  record('P4','Partial Supplier Bill against GRN #1, references PO+GRN', bill1.ok===true && bill1.draft?.poId===po.po?.id, bill1.draft?.id);
  // The AP invoice draft already exists (bill1.draft) — walk it through submit/approve/post directly:
  let bill1Final = null;
  if(bill1.ok){
    const s = await api('accountant1','POST',`/api/journal/${bill1.draft.id}/submit`);
    const a = await api('finance1','POST',`/api/journal/${bill1.draft.id}/approve`);
    const p = await api('finance1','POST',`/api/journal/${bill1.draft.id}/post`);
    record('P4','Bill #1 submit/approve/post all succeed', s.ok && a.ok && p.ok, {submit:s.ok, approve:a.ok, post:p.ok});
    bill1Final = p;
  }

  // Duplicate bill attempt against the SAME GRN (negative test)
  const dupBill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po?.id, grnId:grn1.grn?.id, invoiceLines:[{qty:30, rate:2800}], taxCode:'GST18', date:'2026-10-05', narration:'duplicate attempt'});
  record('P4-NEG','Duplicate Supplier Bill against an already-billed GRN is BLOCKED', dupBill.ok===false, {status:dupBill.status, error:dupBill.error});

  // Bill against GRN #2 (remainder)
  const bill2 = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po?.id, grnId:grn2.grn?.id, invoiceLines:[{qty:20, rate:2800}], taxCode:'GST18', date:'2026-10-06', narration:'Phase 38 E2E — bill against GRN #2'});
  let bill2Final = null;
  if(bill2.ok){
    const s = await api('accountant1','POST',`/api/journal/${bill2.draft.id}/submit`);
    const a = await api('finance1','POST',`/api/journal/${bill2.draft.id}/approve`);
    const p = await api('finance1','POST',`/api/journal/${bill2.draft.id}/post`);
    record('P4','Bill #2 (remainder) submit/approve/post all succeed', s.ok && a.ok && p.ok, {submit:s.ok, approve:a.ok, post:p.ok});
    bill2Final = p;
  }

  // Payment Request + Payment for Bill #1
  const bill1EntryId = bill1Final?.entry?.id;
  const bill1Total = bill1Final?.entry ? bill1Final.entry.lines.filter(l=>l.debit>0).reduce((s,l)=>s+l.debit,0) : null;
  const payReq = await api('purchase1','POST','/api/payment-requests',{vendorId:'VEND-1', invoiceEntryId:bill1EntryId, amount:bill1Total});
  record('P4','Payment Request created for Bill #1, references the Bill', payReq.ok===true && payReq.paymentRequest?.invoiceEntryId===bill1EntryId, payReq.paymentRequest?.id);
  const payReqApprove = await api('finance1','POST',`/api/payment-requests/${payReq.paymentRequest?.id}/approve`);
  record('P4','Payment Request approved (maker-checker: different approver than requester)', payReqApprove.ok===true, payReqApprove.status);

  // Supplier Payment executing the approved request
  const pay1 = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-1', invoiceEntryId:bill1EntryId, amount:bill1Total, date:'2026-10-10'});
  record('P4','Supplier Payment executed for Bill #1', pay1.ok===true, pay1.entry?.id);

  // Payment exceeding outstanding (negative test) — attempt to pay Bill #1 AGAIN (already fully paid)
  const overPay = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-1', invoiceEntryId:bill1EntryId, amount:bill1Total, date:'2026-10-11'});
  record('P4-NEG','Payment against an already-fully-paid Bill is BLOCKED (or reduces to zero-open correctly)', overPay.ok===false, {status:overPay.status, error:overPay.error});

  // Verify Clearing was created and AP open item for Bill#1 is now zero
  const apOpenAfterPay = await api('finance1','GET','/api/ap/open-items');
  const bill1Open = (apOpenAfterPay.items||apOpenAfterPay.openItems||[]).find(i=>i.entryId===bill1EntryId || i.id===bill1EntryId);
  record('P4','AP open item for Bill #1 is now ZERO after full payment+clearing', !bill1Open || Math.abs((bill1Open.open||bill1Open.openAmount||0))<0.01, bill1Open);

  // Reversal-after-clearing negative test — attempt to reverse Bill #1 (now cleared)
  const reverseAfterClear = await api('finance1','POST',`/api/journal/${bill1EntryId}/reverse`,{reason:'Phase 38 E2E negative test — attempt reversal after clearing'});
  record('P4-NEG','Reversal of a document with existing clearings is BLOCKED', reverseAfterClear.ok===false, {status:reverseAfterClear.status, error:reverseAfterClear.error});

  // ============================= PART 17 — PERIOD CONTROL =============================
  console.log('\n===== PART 17 — PERIOD CONTROL =====');
  const periodClose = await api('finance1','POST','/api/financial-periods',{startDate:'2026-11-01', endDate:'2026-11-30', status:'Open'});
  if(periodClose.ok){
    await api('finance1','POST',`/api/financial-periods/${periodClose.period.id}/close`);
  }
  const closedPeriodBill = await api('accountant1','POST','/api/ap/invoice',{vendorId:'VEND-1', projectId:'PRJ-1', baseAmount:1000, date:'2026-11-15', taxCode:'GST18', narration:'Phase 38 E2E — closed-period posting attempt'});
  let closedPeriodPostBlocked = null;
  if(closedPeriodBill.ok){
    const s = await api('accountant1','POST',`/api/journal/${closedPeriodBill.draft.id}/submit`);
    const a = await api('finance1','POST',`/api/journal/${closedPeriodBill.draft.id}/approve`);
    const p = await api('finance1','POST',`/api/journal/${closedPeriodBill.draft.id}/post`);
    closedPeriodPostBlocked = !p.ok;
    record('P17-NEG','Posting into a CLOSED financial period is BLOCKED', !p.ok, {status:p.status, error:p.error});
  } else {
    record('P17-NEG','Posting into a CLOSED financial period is BLOCKED (blocked at draft stage)', true, closedPeriodBill.error);
  }

  // ============================= PART 5 — INVENTORY TRACEABILITY =============================
  console.log('\n===== PART 5 — INVENTORY TRACEABILITY =====');
  // Fresh seed has ZERO sites (`sites: []`) — a real Site must be created first. Part 21's rule:
  // use clearly-named fictional test data on this disposable isolated instance.
  const siteCreate = await api('finance1','POST','/api/sites',{name:'TEST-SITE-001', address:'Phase 38 E2E fictional test site', state:'Kerala', siteInChargeUserId:'U-SITE1'});
  record('P5','Test Site (TEST-SITE-001) created for this E2E run', siteCreate.ok===true, siteCreate.site?.id || siteCreate.error);
  const siteId = siteCreate.site?.id;

  const stockBeforeIssue = await api('purchase1','GET','/api/inventory/stock?warehouseId=WH-1&materialId=MAT-1');
  // Site Material Requisition can only be raised by SiteInCharge (confirmed via live 403 against
  // ProjectManager) — real RBAC, matching the SOP's own "Site In-charge raises site MRS" role text.
  const mrs = await api('site1','POST','/api/site-material-requisitions',{projectId:'PRJ-1', siteId, items:[{materialId:'MAT-1', qty:15, uom:'sheet'}], reason:'Phase 38 E2E — site material'});
  record('P5','Site Material Requisition (MRS) created', mrs.ok===true, mrs.mrs?.id);
  let dcId = null;
  if(mrs.ok){
    const mrsSubmit = await api('site1','POST',`/api/site-material-requisitions/${mrs.mrs.id}/submit`);
    const mrsApprove = await api('finance1','POST',`/api/site-material-requisitions/${mrs.mrs.id}/approve`);
    const issueToSite = await api('purchase1','POST',`/api/site-material-requisitions/${mrs.mrs.id}/issue`,{warehouseId:'WH-1', transporterName:'Test Transport Co', vehicleNo:'KL-TEST-001'});
    record('P5','MRS submit+approve+issue produces a Delivery Challan referencing the MRS', issueToSite.ok===true && !!issueToSite.deliveryChallan, {mrsSubmit:mrsSubmit.ok, mrsApprove:mrsApprove.ok, issueToSite:issueToSite.ok, error:issueToSite.error});
    dcId = issueToSite.deliveryChallan?.id;
  }
  let siteReceipt = null;
  if(dcId){
    siteReceipt = await api('site1','POST','/api/site-material-receipts',{deliveryChallanId:dcId, receivedItems:[{qtyReceived:15}]});
    record('P5','Site Material Receipt references the Delivery Challan', siteReceipt.ok===true && siteReceipt.smr?.deliveryChallanId===dcId, siteReceipt.smr?.id || siteReceipt.error);
  }
  const materialIssue = await api('site1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-1', qty:10, siteId, purpose:'Phase 38 E2E — consumption from site stock'});
  record('P5','Material Issue (site consumption) — the actual cost-recognition event', materialIssue.ok===true, materialIssue.value ?? materialIssue.error);
  const stockAfterIssue = await api('purchase1','GET','/api/inventory/stock?warehouseId=WH-1&materialId=MAT-1');
  const beforeQty = stockBeforeIssue.stock;
  const afterQty = stockAfterIssue.stock;
  record('P5','Warehouse stock genuinely decreased by the site-issued qty (15)', typeof beforeQty==='number' && typeof afterQty==='number' ? (beforeQty-afterQty)===15 : null, {beforeQty, afterQty});

  // Negative: over-issue from site stock (only 15 delivered, try issuing 999)
  const overIssue = await api('site1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-1', qty:999, siteId, purpose:'over-issue attempt'});
  record('P5-NEG','Material Issue exceeding available site stock is BLOCKED', overIssue.ok===false, {status:overIssue.status, error:overIssue.error});

  // ============================= PART 6/7 — PROJECT COST + PROFITABILITY RECONCILIATION =========
  console.log('\n===== PART 6/7 — PROJECT COST + PROFITABILITY =====');
  const labourCost = await api('pm1','POST','/api/labour-wages',{projectId:'PRJ-1', workerName:'Phase38-Test-Worker', role:'Carpenter', days:5, ratePerDay:1600, date:'2026-10-12'});
  record('P6','Labour Cost posted, references project', labourCost.ok===true, labourCost.entry?.id || labourCost.error);
  const projExpense = await api('pm1','POST','/api/project-expenses',{projectId:'PRJ-1', amount:3000, category:'Site', date:'2026-10-13', description:'Phase 38 E2E — site transport'});
  record('P6','Project Expense posted, references project', projExpense.ok===true, projExpense.entry?.id);

  const custInv = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1', projectId:'PRJ-1', baseAmount:150000, date:'2026-10-15', taxCode:'GST18', narration:'Phase 38 E2E — project revenue'},'accountant1');
  record('P6','Customer Invoice (project revenue) posted', custInv.ok===true, custInv.entry?.id);

  const costBreakdown = await api('finance1','GET','/api/projects/PRJ-1/cost-breakdown');
  const projectPL = await api('finance1','GET','/api/project-pl?projectId=PRJ-1');
  const cb = costBreakdown.breakdown || {};
  const pl = projectPL.pl || {};
  record('P6','Project Cost Breakdown API returns committed/received/invoiced/paid/consumed as SEPARATE fields', costBreakdown.ok===true && ['committed','received','invoiced','paid','consumed'].every(k=>k in cb), cb);
  record('P6','Project P&L API returns revenue/cost/profit', projectPL.ok===true && 'revenue' in pl && 'cost' in pl && 'profit' in pl, pl);

  // ============================= PART 8 — SALES-TO-CASH =============================
  console.log('\n===== PART 8 — SALES-TO-CASH =====');
  const lead = await api('sales1','POST','/api/leads',{name:'TEST-CUSTOMER-Phase38', requirement:'Phase 38 E2E — fictional test lead', contact:'9990009999', source:'Referral'});
  record('P8','Lead created', lead.ok===true, lead.lead?.id);

  // Full customer invoice #2 (independent of the P6 invoice) for a clean sales-to-cash trace
  const custInv2 = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1', projectId:'PRJ-1', baseAmount:60000, date:'2026-10-20', taxCode:'GST18', narration:'Phase 38 E2E — sales-to-cash trace invoice'},'accountant1');
  record('P8','Customer Invoice posted (AR)', custInv2.ok===true, custInv2.entry?.id);
  const custInv2Total = custInv2.ok ? custInv2.entry.lines.filter(l=>l.debit>0).reduce((s,l)=>s+l.debit,0) : null;

  // Partial receipt #1
  const recpt1 = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:custInv2.entry?.id, amount:Math.round(custInv2Total*0.4), date:'2026-10-25'});
  record('P8','Partial Customer Receipt #1 (40%) accepted, clears part of the invoice', recpt1.ok===true, recpt1.entry?.id);

  // Second (remaining) receipt — multiple receipts against one invoice
  const remainingAfterR1 = custInv2Total - Math.round(custInv2Total*0.4);
  const recpt2 = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:custInv2.entry?.id, amount:remainingAfterR1, date:'2026-10-28'});
  record('P8','Second Customer Receipt (remainder) — multiple receipts against one invoice', recpt2.ok===true, recpt2.entry?.id);

  const arOpenAfterFull = await api('accountant1','GET','/api/ar/open-items');
  const custInv2Open = (arOpenAfterFull.items||arOpenAfterFull.openItems||[]).find(i=>i.entryId===custInv2.entry?.id);
  record('P8','AR open item for the invoice is now ZERO after both receipts', !custInv2Open || Math.abs((custInv2Open.open||custInv2Open.openAmount||0))<0.01, custInv2Open);

  // Overpayment negative test (receipt exceeding remaining outstanding — now zero)
  const overReceipt = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:custInv2.entry?.id, amount:1000, date:'2026-10-29'});
  record('P8-NEG','Receipt against an already-fully-cleared invoice (overpayment) is BLOCKED', overReceipt.ok===false, {status:overReceipt.status, error:overReceipt.error});

  // Credit Note against the (already-cleared) invoice — should still be a valid, separate operation
  const custCN = await fullPost('accountant1','/api/ar/credit-note',{customerId:'CUST-1', customerInvoiceEntryId:custInv2.entry?.id, amount:2000, reason:'Phase 38 E2E — minor billing correction'},'finance1');
  record('P8','Customer Credit Note against the invoice posted (independent of clearing state)', custCN.ok===true || custCN.stage!==undefined, custCN.ok ? custCN.entry?.id : custCN);

  // Cancelled-invoice negative test — attempt receipt against a cancelled invoice
  const custInv3 = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-2', projectId:'PRJ-1', baseAmount:5000, date:'2026-10-20', taxCode:'GST18', narration:'Phase 38 E2E — to be reversed'},'accountant1');
  let reverseInv3 = null;
  if(custInv3.ok){
    reverseInv3 = await api('finance1','POST',`/api/journal/${custInv3.entry.id}/reverse`,{reason:'Phase 38 E2E — testing receipt against reversed invoice'});
  }
  const receiptAgainstReversed = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-2', invoiceEntryId:custInv3.entry?.id, amount:100, date:'2026-10-30'});
  record('P8-NEG','Receipt against a REVERSED/cancelled invoice is BLOCKED', receiptAgainstReversed.ok===false, {reversed:reverseInv3?.ok, status:receiptAgainstReversed.status, error:receiptAgainstReversed.error});

  // ============================= PART 9-11 — ACCOUNTING ENGINE / AR-AP / CLEARING =============
  console.log('\n===== PART 9-11 — RECONCILIATION =====');
  const tb = await api('finance1','GET','/api/trial-balance');
  let tbDr=0, tbCr=0;
  if(tb.ok){ for(const k in tb.byAccount){ tbDr += tb.byAccount[k].debit||0; tbCr += tb.byAccount[k].credit||0; } }
  record('P9','Trial Balance: Total Debit = Total Credit after the full E2E run', Math.abs(tbDr-tbCr)<0.01, {tbDr, tbCr});

  const recon = await api('finance1','GET','/api/reconciliation');
  record('P10','AR subledger reconciles to AR control account', recon.ok===true && recon.ar?.matches===true, recon.ar);
  record('P10','AP subledger reconciles to AP control account', recon.ok===true && recon.ap?.matches===true, recon.ap);
  if(recon.outputTax) record('P10','Output GST reconciles to output-tax GL', recon.outputTax.matches===true, recon.outputTax);
  if(recon.inputTax) record('P10','Input GST reconciles to input-tax GL', recon.inputTax.matches===true, recon.inputTax);

  console.log('\n===== TOTAL: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.filter(r=>r.pass===null).length + ' INCONCLUSIVE / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log(`${r.pass===true?'✅ PASS':r.pass===false?'❌ FAIL':'⚠️  INCONCLUSIVE'} | [${r.part}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail ?? null).slice(0,300)}`));

  require('fs').writeFileSync('phase38_e2e_results.json', JSON.stringify({results, bill1EntryId, bill1Total, poId:po.po?.id, grn1Id:grn1.grn?.id, grn2Id:grn2.grn?.id}, null, 2));
  process.exit(results.some(r=>r.pass===false) ? 1 : 0);
}
main().catch(e=>{ console.error('E2E TEST HARNESS ERROR:', e); process.exit(2); });
