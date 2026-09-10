'use strict';
// Phase 8 §40 — volume test: 50 projects, 100 production orders, 100 dispatches,
// 100 deliveries, 100 invoices, 100 receipts. Real HTTP calls against the running server.
const BASE = 'http://localhost:4001';
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); jars[u]=r.headers.get('set-cookie').split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
const NAMES = ['Habeeb','Priya','Rajeev','Sarah','Thomas','Anjali','Vinod','Meera','Arjun','Kavya','Sunil','Divya','Rahul','Nisha','Vishnu','Deepa','Manoj','Reshma','Ajay','Sona'];

async function main(){
  await login('admin','Admin@12345');
  await login('sales1','Sal@123456'); await login('estimator1','Est@12345'); await login('finance1','Fin@12345'); await login('ceo','Ceo@12345'); await login('pm1','Pm@123456'); await login('purchase1','Pur@12345'); await login('accountant1','Acc@12345');

  const log = {projects:0, prods:0, dispatches:0, deliveries:0, invoices:0, receipts:0, errors:[]};
  const t0 = Date.now();

  // Seed WH-1 with plenty of MAT-1 stock so all the production issues below have something to draw from.
  for(let i=0;i<3;i++){
    const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:500, rate:2800, uom:'sheet'}]});
    await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
    await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:500, qtyRejected:0, uom:'sheet'}]});
  }

  for(let i=0;i<50;i++){
    const name = pick(NAMES)+' '+i;
    const lead = await api('sales1','POST','/api/leads',{name, requirement:'Volume test project '+i});
    const er = await api('sales1','POST','/api/estimation-requests',{leadId:lead.lead.id});
    const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, overheadPct:10, profitPct:15, lines:[{category:'Material',qty:1,uom:'lot',rate:50000+Math.random()*100000}]});
    const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, prospectName:name, discountPct:0});
    if(!qtn.ok){ log.errors.push('Quotation for project '+i+': '+qtn.error); continue; }
    await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
    await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:name});
    const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1'});
    if(!won.ok){ log.errors.push('Won for project '+i+': '+won.error); continue; }
    log.projects++;
    const projectId = won.project.id, customerId = won.customer.id;

    const bom = await api('estimator1','POST','/api/boms',{projectId, description:'Unit '+i, lines:[{materialId:'MAT-1', qty:0.3, uom:'sheet', scrapPct:5}]});
    await api('ceo','POST',`/api/boms/${bom.bom.id}/approve`);

    // 2 production orders per project → 100 total across 50 projects.
    for(let j=0;j<2;j++){
      const prod = await api('pm1','POST','/api/production-orders',{projectId, bomId:bom.bom.id, plannedQty:2});
      if(!prod.ok){ log.errors.push('Prod for project '+i+': '+prod.error); continue; }
      await api('pm1','POST',`/api/production-orders/${prod.productionOrder.id}/issue-material`,{warehouseId:'WH-1'});
      await api('finance1','POST',`/api/production-orders/${prod.productionOrder.id}/labour-cost`,{amount:3000});
      const complete = await api('pm1','POST',`/api/production-orders/${prod.productionOrder.id}/complete`,{actualQty:2, rejectedQty:0});
      if(complete.ok) log.prods++; else log.errors.push('Complete for project '+i+': '+complete.error);

      // 1 dispatch + 1 delivery per production order → 100 dispatches, 100 deliveries total.
      const dsp = await api('pm1','POST','/api/dispatches',{projectId, customerId, productionOrderId:prod.productionOrder.id, items:[{materialId:'MAT-1', qty:2}], dispatchDate:'2026-09-20', destination:'Site'});
      if(!dsp.ok){ log.errors.push('Dispatch for project '+i+': '+dsp.error); continue; }
      await api('pm1','POST',`/api/dispatches/${dsp.dispatch.id}/ready`);
      await api('finance1','POST',`/api/dispatches/${dsp.dispatch.id}/approve`);
      const dspGo = await api('pm1','POST',`/api/dispatches/${dsp.dispatch.id}/dispatch`);
      if(dspGo.ok) log.dispatches++; else log.errors.push('DispatchGo for project '+i+': '+dspGo.error);
      const dlv = await api('pm1','POST','/api/deliveries',{dispatchId:dsp.dispatch.id, deliveredItems:[{materialId:'MAT-1', qty:2}], receivedBy:'Site'});
      if(dlv.ok) log.deliveries++; else log.errors.push('Delivery for project '+i+': '+dlv.error);
    }

    // 2 billing milestones -> 2 invoices -> 2 receipts per project → 100 invoices, 100 receipts total.
    for(let k=0;k<2;k++){
      const bm = await api('accountant1','POST','/api/billing-milestones',{projectId, milestoneType: k===0?'Advance':'FinalBilling', amount: 20000+Math.random()*40000});
      if(!bm.ok){ log.errors.push('Milestone for project '+i+': '+bm.error); continue; }
      await api('finance1','POST',`/api/billing-milestones/${bm.milestone.id}/ready`);
      const inv = await api('accountant1','POST','/api/ar/invoice-from-milestone',{milestoneId:bm.milestone.id, customerId, projectId, taxCode: Math.random()<0.5?'GST18':undefined, date:'2026-09-25'});
      if(!inv.ok){ log.errors.push('Invoice for project '+i+': '+inv.error); continue; }
      await api('accountant1','POST',`/api/journal/${inv.draft.id}/submit`);
      await api('finance1','POST',`/api/journal/${inv.draft.id}/approve`);
      const posted = await api('finance1','POST',`/api/journal/${inv.draft.id}/post`);
      if(!posted.ok){ log.errors.push('InvoicePost for project '+i+': '+posted.error); continue; }
      log.invoices++;
      // Receipt: full ~60%, partial ~40% (realistic mix, both count toward the 100 receipts target).
      const owed = posted.entry.lines.find(l=>l.account==='1100').debit;
      const amount = Math.random()<0.6 ? owed : Math.round(owed*0.5);
      const receipt = await api('accountant1','POST','/api/ar/receipt',{customerId, invoiceEntryId:posted.entry.id, amount, date:'2026-10-01'});
      if(receipt.ok) log.receipts++; else log.errors.push('Receipt for project '+i+': '+receipt.error);
    }
  }
  const t1 = Date.now();

  const recon = await api('accountant1','GET','/api/reconciliation');
  const tb = await api('accountant1','GET','/api/trial-balance');
  const d = Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0), c = Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0);

  console.log('\n================ PHASE 8 VOLUME TEST RESULTS ================\n');
  console.log(JSON.stringify({
    elapsedMs: t1-t0,
    projectsCreated: log.projects, productionOrdersCompleted: log.prods, dispatchesCompleted: log.dispatches,
    deliveriesConfirmed: log.deliveries, invoicesPosted: log.invoices, receiptsPosted: log.receipts,
    errorCount: log.errors.length, sampleErrors: log.errors.slice(0,8),
    arReconciles: recon.ar?.matches, apReconciles: recon.ap?.matches,
    trialBalanceDebit: d, trialBalanceCredit: c, glBalanced: Math.abs(d-c)<0.01
  }, null, 2));
  console.log('\n===============================================================\n');
}
main().catch(e=>{ console.error('VOLUME TEST ERROR:', e); process.exit(2); });
