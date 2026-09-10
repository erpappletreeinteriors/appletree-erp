'use strict';
// Phase 10 §51 — volume test: 100 projects/customers (via real Lead->Won cycles, same pattern as
// the Phase 7/8 volume tests), 100 warranties, 200 service tickets (~100 Warranty/~100
// Chargeable), 100 service visits, 100 chargeable invoices posted, 50 AMC contracts, 50 CAPA
// cases. Real HTTP calls against the running server.
const BASE = 'http://localhost:4001';
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); jars[u]=r.headers.get('set-cookie').split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }
const NAMES = ['Habeeb','Priya','Rajeev','Sarah','Thomas','Anjali','Vinod','Meera','Arjun','Kavya','Sunil','Divya','Rahul','Nisha','Vishnu','Deepa','Manoj','Reshma','Ajay','Sona'];
const CAPA_TRIGGERS = ['RepeatedFailure','SystemicIssue','QualityTrend','MajorComplaint','ManagementDecision','SafetyQualityEvent'];

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['sales1','estimator1','finance1','ceo','pm1','purchase1','accountant1'].map(u=>login(u, {sales1:'Sal@123456',estimator1:'Est@12345',finance1:'Fin@12345',ceo:'Ceo@12345',pm1:'Pm@123456',purchase1:'Pur@12345',accountant1:'Acc@12345'}[u])));

  const log = {projects:0, warranties:0, tickets:0, visits:0, chargeableInvoicesPosted:0, amcContracts:0, capaCases:0, errors:[]};
  const t0 = Date.now();

  for(let i=0;i<3;i++){
    const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:500, rate:2800, uom:'sheet'}]});
    await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
    await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:500, qtyRejected:0, uom:'sheet'}]});
  }

  const projects = [];
  for(let i=0;i<100;i++){
    const name = pick(NAMES)+' Vol10-'+i;
    const lead = await api('sales1','POST','/api/leads',{name, requirement:'After-sales volume test project '+i});
    const er = await api('sales1','POST','/api/estimation-requests',{leadId:lead.lead.id});
    const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, overheadPct:10, profitPct:15, lines:[{category:'Material',qty:1,uom:'lot',rate:50000+Math.random()*100000}]});
    const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, prospectName:name, discountPct:0});
    if(!qtn.ok){ log.errors.push('Quotation '+i+': '+qtn.error); continue; }
    await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
    await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:name});
    const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1'});
    if(!won.ok){ log.errors.push('Won '+i+': '+won.error); continue; }
    log.projects++;
    projects.push({projectId: won.project.id, customerId: won.customer.id});
  }

  for(let i=0;i<projects.length;i++){
    const {projectId, customerId} = projects[i];
    const war = await api('ceo','POST','/api/warranties',{customerId, projectId, product:'Interior Fit-out', durationMonths:24, startDate:'2026-01-01'});
    if(war.ok) log.warranties++; else log.errors.push('Warranty '+i+': '+war.error);

    // 2 tickets per project -> 200 total, alternating Warranty/Chargeable.
    for(let k=0;k<2;k++){
      const classification = k===0 ? 'Warranty' : 'Chargeable';
      const tkt = await api('ceo','POST','/api/service-tickets',{customerId, projectId, warrantyId: war.ok?war.warranty.id:null, issue:'Volume test issue '+i+'-'+k, priority:'Normal', severity:'Minor'});
      if(!tkt.ok){ log.errors.push('Ticket '+i+'-'+k+': '+tkt.error); continue; }
      await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/classification`,{classification});
      log.tickets++;

      // 1 visit per ticket for the FIRST ticket of each project -> ~100 visits total.
      if(k===0){
        await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/assign`,{assignedTo:'U-PM1'});
        const vis = await api('pm1','POST','/api/service-visits',{ticketId:tkt.ticket.id, site:'Site', technician:'U-PM1'});
        if(!vis.ok){ log.errors.push('Visit '+i+': '+vis.error); continue; }
        await api('pm1','POST',`/api/service-visits/${vis.visit.id}/start`);
        await api('pm1','POST',`/api/service-visits/${vis.visit.id}/diagnosis`,{problem:'Volume test', rootCause:'Wear', diagnosis:'Fix', warrantyDecision:true, chargeableDecision:false});
        await api('pm1','POST',`/api/service-visits/${vis.visit.id}/material-issue`,{materialId:'MAT-1', qty:0.2, warehouseId:'WH-1'});
        await api('finance1','POST',`/api/service-visits/${vis.visit.id}/labour-cost`,{amount:300+Math.random()*200});
        const comp = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/complete`,{workPerformed:'Fixed', customerAcknowledgement:'Customer'});
        if(comp.ok) log.visits++; else log.errors.push('VisitComplete '+i+': '+comp.error);
        await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/close`);
      } else {
        // Chargeable path -> real invoice, posted -> ~100 chargeable invoices.
        const vis2 = await api('pm1','POST','/api/service-visits',{ticketId:tkt.ticket.id, site:'Site', technician:'U-PM1'});
        await api('pm1','POST',`/api/service-visits/${vis2.visit.id}/start`);
        await api('pm1','POST',`/api/service-visits/${vis2.visit.id}/diagnosis`,{diagnosis:'Extra work', warrantyDecision:false, chargeableDecision:true});
        await api('pm1','POST',`/api/service-visits/${vis2.visit.id}/complete`,{workPerformed:'Done', customerAcknowledgement:'Customer'});
        const inv = await api('accountant1','POST','/api/service-invoice',{ticketId:tkt.ticket.id, customerId, projectId, baseAmount: 1000+Math.random()*4000, taxCode: Math.random()<0.5?'GST18':undefined, date:'2026-09-15'});
        if(!inv.ok){ log.errors.push('ServiceInvoice '+i+': '+inv.error); continue; }
        await api('accountant1','POST',`/api/journal/${inv.draft.id}/submit`);
        await api('finance1','POST',`/api/journal/${inv.draft.id}/approve`);
        const posted = await api('finance1','POST',`/api/journal/${inv.draft.id}/post`);
        if(posted.ok) log.chargeableInvoicesPosted++; else log.errors.push('ServiceInvoicePost '+i+': '+posted.error);
        await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/close`);
      }
    }

    // 50 AMC contracts, 50 CAPA cases -> only for the first 50 projects.
    if(i<50){
      const amc = await api('sales1','POST','/api/amc-contracts',{customerId, projectId, startDate:'2026-09-01', endDate:'2027-08-31', contractValue:15000+Math.random()*20000, serviceFrequencyMonths:3});
      if(amc.ok) log.amcContracts++; else log.errors.push('AMC '+i+': '+amc.error);
      const capa = await api('finance1','POST','/api/capa',{trigger:pick(CAPA_TRIGGERS), problem:'Volume test systemic issue '+i, sourceComplaintId:null});
      if(capa.ok) log.capaCases++; else log.errors.push('CAPA '+i+': '+capa.error);
    }
  }
  const t1 = Date.now();

  const recon = await api('accountant1','GET','/api/reconciliation');
  const tb = await api('accountant1','GET','/api/trial-balance');
  const d = Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0), c = Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0);

  console.log('\n================ PHASE 10 AFTER-SALES VOLUME TEST RESULTS ================\n');
  console.log(JSON.stringify({
    elapsedMs: t1-t0,
    projectsCustomersCreated: log.projects, warrantiesCreated: log.warranties, serviceTicketsCreated: log.tickets,
    serviceVisitsCompleted: log.visits, chargeableInvoicesPosted: log.chargeableInvoicesPosted, amcContractsCreated: log.amcContracts, capaCasesCreated: log.capaCases,
    errorCount: log.errors.length, sampleErrors: log.errors.slice(0,8),
    arReconciles: recon.ar?.matches, apReconciles: recon.ap?.matches,
    trialBalanceDebit: d, trialBalanceCredit: c, glBalanced: Math.abs(d-c)<0.01
  }, null, 2));
  console.log('\n===============================================================\n');
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
main().catch(e=>{ console.error('VOLUME TEST ERROR:', e); process.exit(2); });
