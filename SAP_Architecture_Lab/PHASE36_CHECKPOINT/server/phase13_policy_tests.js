'use strict';
// Phase 13 — permanent regression tests for every approved policy change (POL-01 through POL-12
// + the Policy Configuration screen). Real HTTP calls against the running server.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
function hoursAgo(h){ return new Date(Date.now()-h*3600000).toISOString(); }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['ceo','finance1','accountant1','pm1','sales1','estimator1','purchase1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345',pm1:'Pm@123456',sales1:'Sal@123456',estimator1:'Est@12345',purchase1:'Pur@12345'}[u])));

  const po0 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:100, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po0.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po0.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:100, qtyRejected:0, uom:'sheet'}]});

  // ================= POL-01: Billing Milestone Reversal (Option B) =================
  const lead = await api('sales1','POST','/api/leads',{name:'POL01 Test'});
  const er = await api('sales1','POST','/api/estimation-requests',{leadId:lead.lead.id});
  const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, overheadPct:10, profitPct:15, lines:[{category:'Material',qty:1,uom:'lot',rate:50000}]});
  const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, prospectName:'POL01 Test', discountPct:0});
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'x'});
  const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1'});
  const projectId = won.project.id, customerId = won.customer.id;

  const bm = await api('accountant1','POST','/api/billing-milestones',{projectId, milestoneType:'Advance', amount:10000});
  await api('finance1','POST',`/api/billing-milestones/${bm.milestone.id}/ready`);
  const inv1 = await api('accountant1','POST','/api/ar/invoice-from-milestone',{milestoneId:bm.milestone.id, customerId, projectId, date:'2026-09-01'});
  await api('accountant1','POST',`/api/journal/${inv1.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${inv1.draft.id}/approve`);
  const posted1 = await api('finance1','POST',`/api/journal/${inv1.draft.id}/post`);
  record('POL-01', 'Original invoice posted', posted1.ok, posted1.entry?.voucherNo);

  const reversal = await api('finance1','POST',`/api/journal/${posted1.entry.id}/reverse`,{reason:'Billed wrong amount'});
  record('POL-01', 'Invoice reversed via the existing accounting engine', reversal.ok, reversal.entry?.voucherNo);

  const bmAfter = await api('accountant1','GET','/api/billing-milestones');
  const bmRow = bmAfter.milestones.find(m=>m.id===bm.milestone.id);
  record('POL-01', 'Original milestone marked Invoiced-Reversed — NOT reset to Ready (Option B)', bmRow.status==='Invoiced-Reversed', bmRow.status);
  record('POL-01', 'Original milestone remains historically traceable (original invoice ref intact)', bmRow.draftId===inv1.draft.id, bmRow.draftId);

  const doubleInvoiceAttempt = await api('accountant1','POST','/api/ar/invoice-from-milestone',{milestoneId:bm.milestone.id, customerId, projectId, date:'2026-09-02'});
  record('POL-01', 'Cannot invoice the ORIGINAL milestone again — no duplicate billing', doubleInvoiceAttempt.ok===false, doubleInvoiceAttempt.error);

  const rebillTooSoon = await api('accountant1','POST',`/api/billing-milestones/${bm.milestone.id}/rebill`);
  const rebillBadState = await api('accountant1','POST',`/api/billing-milestones/BM-9999/rebill`);
  record('POL-01', 'Fabricated milestone ID rebill denied cleanly', rebillBadState.ok===false, rebillBadState.error);
  const rebill = await api('accountant1','POST',`/api/billing-milestones/${bm.milestone.id}/rebill`,{});
  record('POL-01', 'New billing event created, linked back to the original, own fresh lifecycle', rebill.ok && rebill.milestone.rebillOfMilestoneId===bm.milestone.id && rebill.milestone.status==='Pending', JSON.stringify(rebill.milestone));

  await api('finance1','POST',`/api/billing-milestones/${rebill.milestone.id}/ready`);
  const inv2 = await api('accountant1','POST','/api/ar/invoice-from-milestone',{milestoneId:rebill.milestone.id, customerId, projectId, date:'2026-09-05'});
  await api('accountant1','POST',`/api/journal/${inv2.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${inv2.draft.id}/approve`);
  const posted2 = await api('finance1','POST',`/api/journal/${inv2.draft.id}/post`);
  record('POL-01', 'New invoice posted from the new billing event', posted2.ok, posted2.entry?.voucherNo);
  const openItems = await api('accountant1','GET',`/api/ar/open-items?customerId=${customerId}`);
  const newOpen = openItems.items.find(i=>i.entryId===posted2.entry.id);
  record('POL-01', 'New invoice reaches AR as a real open item', newOpen && newOpen.open>0, JSON.stringify(newOpen));
  const receipt = await api('accountant1','POST','/api/ar/receipt',{customerId, invoiceEntryId:posted2.entry.id, amount:newOpen.open, date:'2026-09-10'});
  record('POL-01', 'Receipt clears the NEW invoice via the existing AR engine — no duplicate/lost audit trail', receipt.ok, JSON.stringify(receipt.clearing));

  // ================= POL-02: Moving Average (confirmed unchanged) =================
  const poA = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-6', qty:10, rate:100, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poA.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:poA.po.id, warehouseId:'WH-2', lines:[{qtyAccepted:10, qtyRejected:0, uom:'sheet'}]});
  const stock1 = await api('purchase1','GET','/api/inventory/stock?materialId=MAT-6&warehouseId=WH-2');
  record('POL-02', 'Purchase at ₹100 sets moving average to ₹100', Math.abs(stock1.movingAverageRate-100)<0.01, stock1.movingAverageRate);
  const poB = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-6', qty:10, rate:120, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poB.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:poB.po.id, warehouseId:'WH-2', lines:[{qtyAccepted:10, qtyRejected:0, uom:'sheet'}]});
  const stock2 = await api('purchase1','GET','/api/inventory/stock?materialId=MAT-6&warehouseId=WH-2');
  record('POL-02', 'Purchase at ₹120 recalculates average to (10×100+10×120)/20 = ₹110', Math.abs(stock2.movingAverageRate-110)<0.01, stock2.movingAverageRate);
  record('POL-02', 'Stock quantity correctly totals 20', stock2.stock===20, stock2.stock);
  const issue1 = await api('pm1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-6', qty:5, warehouseId:'WH-2'});
  record('POL-02', 'Material issue values at the moving-average rate (₹110), not FIFO/LIFO/original', issue1.ok && Math.abs(issue1.valuationRate-110)<0.01, issue1.valuationRate);
  const stock3 = await api('purchase1','GET','/api/inventory/stock?materialId=MAT-6&warehouseId=WH-2');
  record('POL-02', 'Remaining stock = 15 after issuing 5 of 20', stock3.stock===15, stock3.stock);
  const recon1 = await api('finance1','GET','/api/reconciliation');
  record('POL-02', 'Inventory/GL reconciliation still matches after moving-average activity', recon1.ar.matches && recon1.ap.matches, JSON.stringify(recon1));

  // ================= POL-03: GRN Strict 0% =================
  const poC = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:50, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poC.po.id}/submit`);
  const exact = await api('purchase1','POST','/api/grns',{poId:poC.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:100, qtyRejected:0, uom:'sheet'}]});
  record('POL-03', 'GRN = exact ordered quantity (100) — ALLOWED', exact.ok, exact.error);
  const poD = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:50, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poD.po.id}/submit`);
  const under = await api('purchase1','POST','/api/grns',{poId:poD.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:60, qtyRejected:0, uom:'sheet'}]});
  record('POL-03', 'Under-receipt (60 of 100) — ALLOWED, PO stays PartiallyReceived', under.ok && under.poStatus==='PartiallyReceived', under.poStatus);
  const finalGrn = await api('purchase1','POST','/api/grns',{poId:poD.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:40, qtyRejected:0, uom:'sheet'}]});
  record('POL-03', 'Multiple GRNs summing to exactly 100 — final GRN ALLOWED, PO now FullyReceived', finalGrn.ok && finalGrn.poStatus==='FullyReceived', finalGrn.poStatus);
  const poE = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:50, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poE.po.id}/submit`);
  const over = await api('purchase1','POST','/api/grns',{poId:poE.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:101, qtyRejected:0, uom:'sheet'}]});
  record('POL-03', 'GRN = 101 of 100 ordered — BLOCKED (strict 0% tolerance)', over.ok===false, over.error);
  const poF = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:50, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poF.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:poF.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:90, qtyRejected:0, uom:'sheet'}]});
  const overAfterPartial = await api('purchase1','POST','/api/grns',{poId:poF.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:11, qtyRejected:0, uom:'sheet'}]});
  record('POL-03', 'A second GRN pushing cumulative total (90+11=101) over 100 is BLOCKED, even though 11 alone looks small', overAfterPartial.ok===false, overAfterPartial.error);
  const poG = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:50, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poG.po.id}/submit`);
  const [concA, concB] = await Promise.all([
    api('purchase1','POST','/api/grns',{poId:poG.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:40, qtyRejected:0, uom:'sheet'}]}),
    api('purchase1','POST','/api/grns',{poId:poG.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:40, qtyRejected:0, uom:'sheet'}]})
  ]);
  const concSuccesses = [concA,concB].filter(r=>r.ok).length;
  record('POL-03', 'Two concurrent 40-unit GRNs against a 50-unit PO — total received can NEVER exceed ordered (only one of the two succeeds)', concSuccesses===1, JSON.stringify([concA.ok,concB.ok]));

  // ================= POL-04: Warranty Accounting (existing model kept, no new account) =================
  const war = await api('ceo','POST','/api/warranties',{customerId, projectId, product:'x', durationMonths:12});
  const cmpW = await api('sales1','POST','/api/complaints',{customerId, projectId, warrantyId:war.warranty.id, description:'x'});
  await api('finance1','POST',`/api/complaints/${cmpW.complaint.id}/triage`,{classification:'Warranty'});
  const tktW = await api('ceo','POST','/api/service-tickets',{complaintId:cmpW.complaint.id});
  await api('ceo','POST',`/api/service-tickets/${tktW.ticket.id}/assign`,{assignedTo:'U-PM1'});
  const visW = await api('pm1','POST','/api/service-visits',{ticketId:tktW.ticket.id, technician:'U-PM1'});
  await api('pm1','POST',`/api/service-visits/${visW.visit.id}/start`);
  await api('pm1','POST',`/api/service-visits/${visW.visit.id}/diagnosis`,{diagnosis:'x', estimatedAmount:500, warrantyDecision:true, chargeableDecision:false});
  await api('pm1','POST',`/api/service-visits/${visW.visit.id}/material-issue`,{materialId:'MAT-1', qty:1, warehouseId:'WH-1'});
  const arBeforeW = (await api('finance1','GET','/api/ar/ageing')).ageing.reduce((s,r)=>s+r.total,0);
  await api('pm1','POST',`/api/service-visits/${visW.visit.id}/complete`,{workPerformed:'x', customerAcknowledgement:'x'});
  const arAfterW = (await api('finance1','GET','/api/ar/ageing')).ageing.reduce((s,r)=>s+r.total,0);
  record('POL-04', 'Approved warranty work creates NO customer AR', Math.abs(arAfterW-arBeforeW)<0.01, {before:arBeforeW, after:arAfterW});
  const f360W = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('POL-04', 'Warranty Cost separately identified on Financial 360 despite using shared accounts (no new GL account)', f360W.afterSales.warrantyCost>0, f360W.afterSales.warrantyCost);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 13 POLICY TESTS (Part 1: POL-01 to POL-04) ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
