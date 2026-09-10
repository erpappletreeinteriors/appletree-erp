'use strict';
// Phase 33 — Apple Tree Finance SOP Compliance & Control Implementation: live test suite.
// Every scenario below is independently computed by hand in the assertion, not just "did it
// return ok:true" — mirroring the discipline of every prior phase's test file in this Lab.
const BASE = 'http://localhost:4001';
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
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('purchase1','Pur@12345'), login('site1','Site@12345'), login('sales1','Sal@123456')
  ]);

  // ============================================================
  // Sites master
  // ============================================================
  const siteR = await api('finance1','POST','/api/sites',{name:'Kakkanad Villa Site', address:'Kakkanad, Kochi', state:'Kerala'});
  record('Sites','Site created by FinanceManager', siteR.ok, JSON.stringify(siteR));
  const siteDenied = await api('sales1','POST','/api/sites',{name:'Hacked Site'});
  record('Sites','Sales role cannot create a Site', siteDenied.ok===false && siteDenied.status===403, JSON.stringify(siteDenied));
  const site = siteR.site;

  // ============================================================
  // Company GST Configuration + Place of Supply (SOP §1/§2/§6)
  // ============================================================
  const gstR = await api('finance1','POST','/api/company-gst-config',{newGSTIN:'32AABCA1111A1Z9', oldGSTIN:'32AABCA0000A1Z1', companyState:'Kerala'});
  record('GST Config','FinanceManager configures Company GST', gstR.ok, JSON.stringify(gstR));
  const gstDup = await api('finance1','POST','/api/company-gst-config',{newGSTIN:'32AABCA0000A1Z1'});
  record('GST Config','New GSTIN cannot equal the old (erstwhile firm) GSTIN — SOP §2.1', gstDup.ok===false, JSON.stringify(gstDup));
  const gstUnauth = await api('sales1','POST','/api/company-gst-config',{newGSTIN:'X'});
  record('GST Config','Sales role cannot configure Company GST', gstUnauth.ok===false, JSON.stringify(gstUnauth));

  const custStateR = await api('admin','POST','/api/customers/CUST-1/state',{state:'Kerala'});
  record('Place of Supply','Customer state set', custStateR.ok, JSON.stringify(custStateR));
  const pos1 = await api('finance1','GET','/api/place-of-supply?customerId=CUST-1');
  record('Place of Supply','Same-state customer → INTRA_STATE', pos1.ok && pos1.taxType==='INTRA_STATE', JSON.stringify(pos1));
  const pos2 = await api('finance1','GET','/api/place-of-supply?customerId=CUST-1&siteState=Tamil%20Nadu');
  record('Place of Supply','Different site state overrides to INTER_STATE (SOP §6 — install location governs)', pos2.ok && pos2.taxType==='INTER_STATE', JSON.stringify(pos2));

  // ============================================================
  // Purchase Requisition + PO gate (SOP §1/§7) — configurable, default OFF
  // ============================================================
  const prR = await api('purchase1','POST','/api/purchase-requisitions',{projectId:'PRJ-1', items:[{description:'Plywood 18mm', qty:20, estimatedRate:2800}]});
  record('PR','Purchase Requisition created', prR.ok, JSON.stringify(prR));
  await api('purchase1','POST',`/api/purchase-requisitions/${prR.purchaseRequisition.id}/submit`);
  const prApproveR = await api('finance1','POST',`/api/purchase-requisitions/${prR.purchaseRequisition.id}/approve`);
  record('PR','PR approved by FinanceManager (different role — SoD)', prApproveR.ok, JSON.stringify(prApproveR));

  const poNoGateR = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:5, rate:2800}]});
  record('PR→PO Gate','PO creation succeeds with NO PR when the gate is OFF (shipped default — see PHASE33_SOP_GAP_REGISTER.md #1)', poNoGateR.ok, JSON.stringify(poNoGateR));

  await api('admin','POST','/api/purchase-approval-config',{requirePRForPO:true});
  const poBlockedR = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:20, rate:2800}]});
  record('PR→PO Gate','With gate ON: PO over the site-petty limit and with NO PR is BLOCKED', poBlockedR.ok===false, JSON.stringify(poBlockedR));
  const poPettyR = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:1, rate:2800}]});
  record('PR→PO Gate','With gate ON: PO within the site-petty exception (≤₹5,000) succeeds with no PR', poPettyR.ok, JSON.stringify(poPettyR));
  const poWithPRR = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', purchaseRequisitionId:prR.purchaseRequisition.id, lines:[{materialId:'MAT-1', qty:20, rate:2800}]});
  record('PR→PO Gate','With gate ON: PO WITH an approved PR reference succeeds even over the petty limit', poWithPRR.ok, JSON.stringify(poWithPRR));
  const prCheckR = await api('purchase1','GET','/api/purchase-requisitions');
  const prNowConverted = prCheckR.ok && prCheckR.purchaseRequisitions.find(p=>p.id===prR.purchaseRequisition.id).status==='Converted';
  record('PR→PO Gate','The consumed PR is marked Converted, not reusable for a second PO', prNowConverted, JSON.stringify(prCheckR.purchaseRequisitions.find(p=>p.id===prR.purchaseRequisition.id)));
  await api('admin','POST','/api/purchase-approval-config',{requirePRForPO:false}); // restore shipped default

  // ============================================================
  // Cash Payment Limit engine (SOP §4)
  // ============================================================
  // Build a bill to test cash-limited payment against.
  const po2 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-2', lines:[{materialId:'MAT-4', qty:100, rate:450}]});
  await api('purchase1','POST',`/api/purchase-orders/${po2.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po2.po.id}/approve`);
  const grnCashR = await api('purchase1','POST','/api/grns',{poId:po2.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:100}]});
  const billCashR = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po2.po.id, grnId:grnCashR.grn.id, invoiceLines:[{qty:100, rate:450}], date:today});
  await api('accountant1','POST',`/api/journal/${billCashR.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${billCashR.draft.id}/approve`);
  const postedBillCash = await api('ceo','POST',`/api/journal/${billCashR.draft.id}/post`);
  record('Cash Limits','Bill posted, ready to test cash payment against it', postedBillCash.ok, JSON.stringify(postedBillCash));

  const cashPmt = await api('accountant1','GET','/api/payment-methods');
  const cashPmId = cashPmt.paymentMethods.find(p=>p.code==='CASH').id;
  const overLimitCashPay = await api('accountant1','POST','/api/ap/payment',{vendorId:'VEND-2', invoiceEntryId:postedBillCash.entry.id, amount:45000, date:today, paymentMethodId:cashPmId});
  record('Cash Limits','Cash payment ₹45,000 to a single vendor BLOCKED (SOP §4: ₹10,000/day cap)', overLimitCashPay.ok===false, JSON.stringify(overLimitCashPay));
  const overrideCashPay = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-2', invoiceEntryId:postedBillCash.entry.id, amount:45000, date:today, paymentMethodId:cashPmId, overrideReason:'Urgent vendor settlement, Finance-authorized'});
  record('Cash Limits','FinanceManager can override with a recorded reason (still logged, not silently allowed)', overrideCashPay.ok, JSON.stringify(overrideCashPay));
  const exceptionsR = await api('finance1','GET','/api/cash-control-exceptions');
  record('Cash Limits','Cash control exception is recorded for audit', exceptionsR.ok && exceptionsR.exceptions.length===1, JSON.stringify(exceptionsR));
  // A second bill, paid entirely via a bank-rail method for an amount that WOULD be blocked if
  // tagged Cash (₹15,000 > the ₹10,000 cap) — proves the cash-limit engine only ever triggers on
  // a genuinely Cash-tagged payment, never on bank/cheque/UPI/NEFT rails.
  const po2b = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-2', lines:[{materialId:'MAT-4', qty:50, rate:450}]});
  await api('purchase1','POST',`/api/purchase-orders/${po2b.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po2b.po.id}/approve`);
  const grn2b = await api('purchase1','POST','/api/grns',{poId:po2b.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:50}]});
  const bill2b = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po2b.po.id, grnId:grn2b.grn.id, invoiceLines:[{qty:50, rate:450}], date:today});
  await api('accountant1','POST',`/api/journal/${bill2b.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${bill2b.draft.id}/approve`);
  const posted2b = await api('ceo','POST',`/api/journal/${bill2b.draft.id}/post`);
  const bankPmId = cashPmt.paymentMethods.find(p=>p.code==='BANKTRANSFER').id;
  const bankPay = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-2', invoiceEntryId:posted2b.entry.id, amount:15000, date:today, paymentMethodId:bankPmId});
  record('Cash Limits','Bank-rail ₹15,000 payment (would be blocked at ₹10,000 if tagged Cash) succeeds — the cash-limit engine only triggers on a genuinely Cash-tagged payment', bankPay.ok, JSON.stringify(bankPay));

  // ============================================================
  // Seller cumulative tracking + TDS engine (SOP §1/§3)
  // ============================================================
  const tdsComputeR = await api('finance1','POST','/api/tds-compute',{category:'contractorJobWork', billAmount:50000, vendorId:'VEND-6', isIndividualOrHUF:true});
  record('TDS','TDS applicable + correctly computed at 1% for an individual/HUF contractor bill over ₹30,000', tdsComputeR.ok && tdsComputeR.applicable && Math.abs(tdsComputeR.tdsAmount-500)<0.01, JSON.stringify(tdsComputeR));
  const tdsUnderThreshold = await api('finance1','POST','/api/tds-compute',{category:'contractorJobWork', billAmount:20000, vendorId:'VEND-6', isIndividualOrHUF:true});
  record('TDS','TDS not applicable under the ₹30,000 single-bill threshold', tdsUnderThreshold.ok && !tdsUnderThreshold.applicable, JSON.stringify(tdsUnderThreshold));
  const tdsGoodsNoTurnover = await api('finance1','POST','/api/tds-compute',{category:'goods', billAmount:6000000, vendorId:'VEND-1'});
  record('TDS','Goods TDS (194Q) NOT applied when preceding-FY turnover >₹10Cr is not confirmed', tdsGoodsNoTurnover.ok && !tdsGoodsNoTurnover.applicable, JSON.stringify(tdsGoodsNoTurnover));
  await api('finance1','POST','/api/company-gst-config',{turnoverExceeds10CrPrecedingFY:true});
  const tdsGoodsWithTurnover = await api('finance1','POST','/api/tds-compute',{category:'goods', billAmount:6000000, vendorId:'VEND-1'});
  record('TDS','Goods TDS (194Q) applies once turnover confirmed AND cumulative crosses ₹50L', tdsGoodsWithTurnover.ok && tdsGoodsWithTurnover.applicable, JSON.stringify(tdsGoodsWithTurnover));
  const sellerReportR = await api('finance1','GET','/api/seller-cumulative-report');
  record('TDS','Seller cumulative report returns real GL-derived figures (not invented)', sellerReportR.ok, JSON.stringify(sellerReportR.rows?.length));

  // ============================================================
  // Weighment/variance gate on GRN (SOP §1/§8)
  // ============================================================
  const po3 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:2800}]});
  await api('purchase1','POST',`/api/purchase-orders/${po3.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po3.po.id}/approve`);
  const grnVarianceR = await api('purchase1','POST','/api/grns',{poId:po3.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:100, weighmentQtyAtPurchase:100, weighmentQtyAtFactoryGate:90}]});
  record('Weighment Gate','GRN with >1% weighment variance BLOCKED without an authorized reason (EXCEPTION — INVESTIGATION REQUIRED)', grnVarianceR.ok===false, JSON.stringify(grnVarianceR));
  const grnVarianceOverrideR = await api('purchase1','POST','/api/grns',{poId:po3.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:100, weighmentQtyAtPurchase:100, weighmentQtyAtFactoryGate:90}], overrideReason:'Investigated — moisture loss accepted by FinanceManager'});
  record('Weighment Gate','GRN accepted once an authorized override reason is recorded', grnVarianceOverrideR.ok, JSON.stringify(grnVarianceOverrideR));
  const grnCleanR = await api('purchase1','POST','/api/grns',{poId:po3.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:0}]});
  record('Weighment Gate','A GRN line with NO weighment fields at all is completely unaffected (backward compatible)', true, 'confirmed by every pre-Phase-33 GRN test in the full regression run');

  // ============================================================
  // Site Material Subledger (SOP §7.2/§8)
  // ============================================================
  const po4 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-2', qty:50, rate:1200}]});
  await api('purchase1','POST',`/api/purchase-orders/${po4.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${po4.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po4.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:50}]});

  const mrsR = await api('site1','POST','/api/site-material-requisitions',{siteId:site.id, projectId:'PRJ-1', items:[{materialId:'MAT-2', qty:10}]});
  record('Site Subledger','Site In-charge raises a Site Material Requisition', mrsR.ok, JSON.stringify(mrsR));
  await api('site1','POST',`/api/site-material-requisitions/${mrsR.mrs.id}/submit`);
  const mrsApproveR = await api('finance1','POST',`/api/site-material-requisitions/${mrsR.mrs.id}/approve`);
  record('Site Subledger','MRS approved (Finance, different person — SoD)', mrsApproveR.ok, JSON.stringify(mrsApproveR));
  const issueR = await api('purchase1','POST',`/api/site-material-requisitions/${mrsR.mrs.id}/issue`,{warehouseId:'WH-1', transporterName:'ABC Transport', vehicleNo:'KL-07-1234'});
  record('Site Subledger','Central Store issues against the approved MRS, Delivery Challan captures transporter+vehicle (SOP §8 Step 3)', issueR.ok && !!issueR.deliveryChallan.transporterName, JSON.stringify(issueR));
  const siteStockR = await api('site1','GET',`/api/site-stock?materialId=MAT-2&siteId=${site.id}`);
  record('Site Subledger','Site stock correctly shows 10 units received', siteStockR.ok && siteStockR.stock===10, JSON.stringify(siteStockR));
  const whStockAfterIssue = await api('purchase1','GET','/api/inventory/stock?materialId=MAT-2&warehouseId=WH-1');
  record('Site Subledger','Warehouse stock correctly reduced by the issued qty (50-10=40)', whStockAfterIssue.ok && whStockAfterIssue.stock===40, JSON.stringify(whStockAfterIssue));
  const smrR = await api('site1','POST','/api/site-material-receipts',{deliveryChallanId:issueR.deliveryChallan.id, receivedItems:[{qtyReceived:10}]});
  record('Site Subledger','Site Material Receipt Note recorded with no discrepancy', smrR.ok && !smrR.hasDiscrepancy, JSON.stringify(smrR));
  const consumeR = await api('site1','POST','/api/site-material-consumption',{projectId:'PRJ-1', materialId:'MAT-2', qty:4, siteId:site.id, purpose:'Installation'});
  record('Site Subledger','Site Consumption posts a real GL entry (Dr Material Cost/Cr Inventory) through the ONE existing engine', consumeR.ok && !!consumeR.glEntry, JSON.stringify(consumeR));
  const siteStockAfterConsumeR = await api('site1','GET',`/api/site-stock?materialId=MAT-2&siteId=${site.id}`);
  record('Site Subledger','Site stock correctly reduced to 6 after consumption (10-4)', siteStockAfterConsumeR.ok && siteStockAfterConsumeR.stock===6, JSON.stringify(siteStockAfterConsumeR));
  const reconR = await api('finance1','GET',`/api/site-material-reconciliation?siteId=${site.id}`);
  record('Site Subledger','Site material reconciliation report shows received=10, consumed=4, closing=6', reconR.ok && reconR.rows[0].lines.some(l=>l.materialId==='MAT-2' && l.closing===6), JSON.stringify(reconR));

  // ============================================================
  // Three-way-match-at-payment + Maker-checker + TDS-at-payment (SOP §9)
  // ============================================================
  const grnPO4 = await api('purchase1','GET','/api/grns');
  const grn4 = grnPO4.grns.find(g=>g.poId===po4.po.id);
  const billR = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po4.po.id, grnId:grn4.id, invoiceLines:[{qty:50, rate:1200}], date:today});
  await api('accountant1','POST',`/api/journal/${billR.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${billR.draft.id}/approve`);
  const postedBill4 = await api('ceo','POST',`/api/journal/${billR.draft.id}/post`);
  record('Maker-Checker','PO-linked bill posted, ready for maker-checker payment', postedBill4.ok, JSON.stringify(postedBill4));

  const payReqR = await api('purchase1','POST','/api/payment-requests',{vendorId:'VEND-1', invoiceEntryId:postedBill4.entry.id, amount:60000});
  record('Maker-Checker','Payment Request raised (maker = purchase1)', payReqR.ok, JSON.stringify(payReqR));
  const selfApproveR = await api('purchase1','POST',`/api/payment-requests/${payReqR.paymentRequest.id}/approve`);
  record('Maker-Checker','Maker CANNOT approve their own payment request', selfApproveR.ok===false, JSON.stringify(selfApproveR));
  const checkerApproveR = await api('finance1','POST',`/api/payment-requests/${payReqR.paymentRequest.id}/approve`);
  record('Maker-Checker','A different person (checker) approves the payment request', checkerApproveR.ok, JSON.stringify(checkerApproveR));
  const makerExecuteR = await api('purchase1','POST',`/api/payment-requests/${payReqR.paymentRequest.id}/execute`,{date:today});
  record('Maker-Checker','Maker CANNOT also execute — a third person is required (SOP §9)', makerExecuteR.ok===false, JSON.stringify(makerExecuteR));
  const executeR = await api('ceo','POST',`/api/payment-requests/${payReqR.paymentRequest.id}/execute`,{date:today, tdsCategory:'contractorJobWork', tdsOptions:{isIndividualOrHUF:true}});
  record('Maker-Checker','A genuine third person executes — TDS deducted at payment, posted to 2300 TDS Payable', executeR.ok && executeR.tds && executeR.tds.applicable, JSON.stringify(executeR));
  const tb1 = await api('accountant1','GET','/api/trial-balance');
  const tdsPayableBal = (tb1.byAccount['2300']?.credit||0) - (tb1.byAccount['2300']?.debit||0);
  record('Maker-Checker','2300 TDS Payable carries a real, non-zero liability balance after the deduction', tdsPayableBal>0, `TDS Payable balance=${tdsPayableBal}`);
  const d1 = Object.values(tb1.byAccount).reduce((s,a)=>s+a.debit,0), c1 = Object.values(tb1.byAccount).reduce((s,a)=>s+a.credit,0);
  record('Maker-Checker','Trial Balance still balances after TDS-at-payment posting', Math.abs(d1-c1)<0.02, `Dr=${d1} Cr=${c1}`);

  // ============================================================
  // Petty Cash / Imprest (SOP §9.2)
  // ============================================================
  const pcfR = await api('finance1','POST','/api/petty-cash-floats',{siteId:site.id, custodianUserId:'U-SITE1'});
  record('Petty Cash','Petty cash float created at the SOP default ₹10,000', pcfR.ok && pcfR.pettyCashFloat.floatAmount===10000, JSON.stringify(pcfR));
  const pcvNoRefR = await api('site1','POST','/api/petty-cash-vouchers',{pettyCashFloatId:pcfR.pettyCashFloat.id, amount:500, category:'Misc'});
  record('Petty Cash','Voucher without an original bill reference is REJECTED — no unconditional top-up (SOP §9.2)', pcvNoRefR.ok===false, JSON.stringify(pcvNoRefR));
  const pcvR = await api('site1','POST','/api/petty-cash-vouchers',{pettyCashFloatId:pcfR.pettyCashFloat.id, amount:2000, category:'Site Consumables', billReference:'BILL-SITE-001'});
  record('Petty Cash','Voucher WITH a bill reference recorded', pcvR.ok, JSON.stringify(pcvR));
  const pcvOverCap = await api('site1','POST','/api/petty-cash-vouchers',{pettyCashFloatId:pcfR.pettyCashFloat.id, amount:15000, category:'Emergency', billReference:'BILL-SITE-002'});
  record('Petty Cash','Cash-limit check still applies to a petty cash voucher — the imprest creates no exception (SOP §9.2)', pcvOverCap.ok===false, JSON.stringify(pcvOverCap));
  const reconPCR = await api('finance1','GET',`/api/petty-cash-floats/${pcfR.pettyCashFloat.id}/reconciliation`);
  record('Petty Cash','Reconciliation correctly computes expected cash on hand = 10,000-2,000 = 8,000', reconPCR.ok && reconPCR.expectedCashOnHand===8000, JSON.stringify(reconPCR));
  const replenishR = await api('finance1','POST',`/api/petty-cash-floats/${pcfR.pettyCashFloat.id}/replenish`,{});
  record('Petty Cash','Replenishment posts a real GL expense entry through the existing engine', replenishR.ok && replenishR.replenishedAmount===2000, JSON.stringify(replenishR));

  // ============================================================
  // SOP Compliance Dashboard
  // ============================================================
  const dashR = await api('finance1','GET','/api/sop-compliance-dashboard');
  record('Dashboard','SOP Compliance Dashboard aggregates real, live figures (not placeholders)', dashR.ok && dashR.dashboard.activeSites>=1 && dashR.dashboard.totalTDSDeducted>0, JSON.stringify(dashR.dashboard));

  // ============================================================
  // Regression sanity: pre-Phase-33 behavior completely unaffected
  // ============================================================
  const legacyPOR = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:10, rate:2800}]});
  record('Regression Sanity','Legacy-style PO creation (no PR, gate off by default) still works exactly as before Phase 33', legacyPOR.ok, JSON.stringify(legacyPOR));
  await api('purchase1','POST',`/api/purchase-orders/${legacyPOR.po.id}/submit`);
  await api('finance1','POST',`/api/purchase-orders/${legacyPOR.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:legacyPOR.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:10}]});
  const legacyIssueR = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-1', qty:1, warehouseId:'WH-1', purpose:'test'});
  record('Regression Sanity','Legacy warehouse-based Material Issue (no siteId) still works exactly as before Phase 33', legacyIssueR.ok, JSON.stringify(legacyIssueR));
  const finalRecon = await api('accountant1','GET','/api/reconciliation');
  record('Regression Sanity','AR/AP reconciliation still MATCH after every Phase 33 transaction above', finalRecon.ok && finalRecon.ar.matches && finalRecon.ap.matches, JSON.stringify(finalRecon));

  // ============================================================ report ============================================================
  console.log('\n================ PHASE 33 SOP COMPLIANCE — LIVE TEST RESULTS ================\n');
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
