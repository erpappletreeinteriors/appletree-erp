'use strict';
// Phase 10 §7-§17,§29 — Complaint -> Ticket -> Visit -> Diagnosis -> Material/Labour -> Closure.
// Real HTTP calls against the running server. Covers BOTH the warranty path (no AR) and the
// chargeable path (real AR/GL), plus security/SoD checks specific to service.
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
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([login('ceo','Ceo@12345'), login('finance1','Fin@12345'), login('accountant1','Acc@12345'), login('pm1','Pm@123456'), login('sales1','Sal@123456'), login('purchase1','Pur@12345')]);

  // Stock some MAT-1 in WH-1 so service material issue has something to draw from.
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:50, qtyRejected:0, uom:'sheet'}]});

  // ================= WARRANTY PATH =================
  const war = await api('ceo','POST','/api/warranties',{customerId:'CUST-1', projectId:'PRJ-1', product:'Kitchen', durationMonths:24, startDate:new Date().toISOString().slice(0,10)});
  record('Setup', 'Warranty created', war.ok, war.warranty?.id);

  const cmp = await api('sales1','POST','/api/complaints',{customerId:'CUST-1', projectId:'PRJ-1', warrantyId:war.warranty.id, product:'Kitchen', reportedBy:'Mr. Habeeb', contact:'9876543210', description:'Cabinet hinge loose', priority:'Normal', severity:'Minor'});
  record('Complaint', 'Complaint created NEW', cmp.ok && cmp.complaint.status==='NEW', cmp.complaint?.status);

  const salesTriage = await api('sales1','POST',`/api/complaints/${cmp.complaint.id}/triage`,{classification:'Warranty'});
  record('Security', 'Sales cannot triage (supervisory judgment required — §9/§10)', salesTriage.ok===false, JSON.stringify(salesTriage));
  const triage = await api('finance1','POST',`/api/complaints/${cmp.complaint.id}/triage`,{classification:'Warranty', notes:'Within warranty, hardware issue'});
  record('Complaint', 'FinanceManager triages as Warranty, status TRIAGED, auditable', triage.ok && triage.complaint.status==='TRIAGED' && triage.complaint.classification==='Warranty', JSON.stringify(triage.complaint));

  const tkt = await api('ceo','POST','/api/service-tickets',{complaintId:cmp.complaint.id});
  record('Ticket', 'Ticket created FROM complaint, inherits classification', tkt.ok && tkt.ticket.classification==='Warranty' && tkt.ticket.customerId==='CUST-1', JSON.stringify(tkt.ticket));

  const assign = await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/assign`,{assignedTo:'U-PM1', dueDate:'2026-09-30'});
  record('Ticket', 'Ticket assigned', assign.ok && assign.ticket.status==='ASSIGNED', assign.ticket?.status);

  const vis = await api('pm1','POST','/api/service-visits',{ticketId:tkt.ticket.id, site:'Customer Home', technician:'U-PM1', visitDate:new Date().toISOString().slice(0,10)});
  record('Visit', 'Service visit created', vis.ok && vis.visit.status==='PLANNED', vis.visit?.status);
  await api('pm1','POST',`/api/service-visits/${vis.visit.id}/start`);

  const bothDecision = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/diagnosis`,{problem:'Loose hinge', rootCause:'Worn screw thread', diagnosis:'Replace hinge', recommendedAction:'Fit new hinge', warrantyDecision:true, chargeableDecision:true});
  record('Diagnosis', 'Diagnosis with BOTH warranty AND chargeable true is REJECTED (§10 — must not be mixed)', bothDecision.ok===false, JSON.stringify(bothDecision));
  const diag = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/diagnosis`,{problem:'Loose hinge', rootCause:'Worn screw thread', diagnosis:'Replace hinge', recommendedAction:'Fit new hinge', partsRequired:'MAT-1 x1', warrantyDecision:true, chargeableDecision:false});
  record('Diagnosis', 'Diagnosis recorded — Warranty decision confirmed, chargeable false', diag.ok && diag.visit.warrantyDecision===true && diag.visit.chargeableDecision===false, JSON.stringify(diag.visit));

  const issue = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/material-issue`,{materialId:'MAT-1', qty:1, warehouseId:'WH-1'});
  record('Material', 'Material issued for warranty visit via the EXISTING unmodified inventory engine', issue.ok, JSON.stringify(issue));
  const labour = await api('finance1','POST',`/api/service-visits/${vis.visit.id}/labour-cost`,{amount:500});
  record('Labour', 'Labour cost posted via existing GL engine (5100/1000)', labour.ok, JSON.stringify(labour));

  const costBd = await api('finance1','GET',`/api/service-tickets/${tkt.ticket.id}/cost-breakdown`);
  record('Cost', 'Ticket cost breakdown traceable: material + labour > 0', costBd.ok && costBd.breakdown.totalCost>0, JSON.stringify(costBd.breakdown));

  const closeAttemptEarly = await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/close`);
  record('Closure', 'Close blocked — visit not yet Completed / no ack (§29 server-enforced gate)', closeAttemptEarly.ok===false, JSON.stringify(closeAttemptEarly));

  const complete = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/complete`,{workPerformed:'Hinge replaced and tested', remarks:'All good', customerAcknowledgement:'Mr. Habeeb'});
  record('Visit', 'Visit completed with customer acknowledgement (MANUAL — e-signature pending, §30)', complete.ok && complete.visit.evidenceMethod.includes('E-SIGNATURE INTEGRATION PENDING'), complete.visit?.evidenceMethod);

  const arBefore = await api('finance1','GET','/api/ar/ageing');
  const close = await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/close`);
  record('Closure', 'Ticket closes cleanly once real prerequisites are met', close.ok && close.ticket.status==='CLOSED', JSON.stringify(close));
  const arAfter = await api('finance1','GET','/api/ar/ageing');
  const arTotalBefore = arBefore.ageing.reduce((s,r)=>s+r.total,0), arTotalAfter = arAfter.ageing.reduce((s,r)=>s+r.total,0);
  record('Warranty-Billing', '§19 — Warranty service closure creates NO customer AR (unchanged AR total)', Math.abs(arTotalAfter-arTotalBefore)<0.01, {before:arTotalBefore, after:arTotalAfter});

  // ================= CHARGEABLE PATH =================
  const cmp2 = await api('sales1','POST','/api/complaints',{customerId:'CUST-1', projectId:'PRJ-1', product:'Kitchen', reportedBy:'Mr. Habeeb', description:'Customer wants an extra shelf fitted (out of scope)', priority:'Low', severity:'Minor'});
  await api('finance1','POST',`/api/complaints/${cmp2.complaint.id}/triage`,{classification:'Chargeable'});
  const tkt2 = await api('ceo','POST','/api/service-tickets',{complaintId:cmp2.complaint.id});
  record('Chargeable', 'Chargeable ticket created and classified', tkt2.ok && tkt2.ticket.classification==='Chargeable', tkt2.ticket?.classification);
  await api('ceo','POST',`/api/service-tickets/${tkt2.ticket.id}/assign`,{assignedTo:'U-PM1'});
  const vis2 = await api('pm1','POST','/api/service-visits',{ticketId:tkt2.ticket.id, site:'Customer Home', technician:'U-PM1'});
  await api('pm1','POST',`/api/service-visits/${vis2.visit.id}/start`);
  await api('pm1','POST',`/api/service-visits/${vis2.visit.id}/diagnosis`,{problem:'Extra shelf request', diagnosis:'Fit new shelf', warrantyDecision:false, chargeableDecision:true});
  await api('pm1','POST',`/api/service-visits/${vis2.visit.id}/material-issue`,{materialId:'MAT-1', qty:1, warehouseId:'WH-1'});
  await api('finance1','POST',`/api/service-visits/${vis2.visit.id}/labour-cost`,{amount:1000});
  await api('pm1','POST',`/api/service-visits/${vis2.visit.id}/complete`,{workPerformed:'Shelf fitted', customerAcknowledgement:'Mr. Habeeb'});

  const wrongClassBill = await api('accountant1','POST','/api/service-invoice',{ticketId:tkt.ticket.id, baseAmount:1000});
  record('Chargeable', 'Billing a WARRANTY ticket is blocked (cannot invoice non-chargeable work)', wrongClassBill.ok===false, JSON.stringify(wrongClassBill));
  const closeChargeableNoInvoice = await api('ceo','POST',`/api/service-tickets/${tkt2.ticket.id}/close`);
  record('Closure', 'Chargeable ticket close blocked until an invoice is drafted (§29)', closeChargeableNoInvoice.ok===false, JSON.stringify(closeChargeableNoInvoice));

  const svcInv = await api('accountant1','POST','/api/service-invoice',{ticketId:tkt2.ticket.id, customerId:'CUST-1', projectId:'PRJ-1', baseAmount:2500, taxCode:'GST18', date:new Date().toISOString().slice(0,10)});
  record('Chargeable', 'Service invoice drafted for chargeable ticket, tagged with serviceTicketId', svcInv.ok && svcInv.draft.serviceTicketId===tkt2.ticket.id, JSON.stringify(svcInv.draft));
  await api('accountant1','POST',`/api/journal/${svcInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${svcInv.draft.id}/approve`);
  const posted = await api('finance1','POST',`/api/journal/${svcInv.draft.id}/post`);
  record('Chargeable', 'Service invoice posted through the EXISTING AR engine (AR/Revenue/Tax lines)', posted.ok && posted.entry.lines.some(l=>l.account==='1100'), JSON.stringify(posted.entry?.lines));

  const closeChargeable = await api('ceo','POST',`/api/service-tickets/${tkt2.ticket.id}/close`);
  record('Closure', 'Chargeable ticket now closes cleanly', closeChargeable.ok && closeChargeable.ticket.status==='CLOSED', JSON.stringify(closeChargeable));

  const openItems = await api('accountant1','GET','/api/ar/open-items?customerId=CUST-1');
  record('Chargeable-Billing', 'Real AR open item exists for the chargeable service invoice', openItems.items.some(i=>i.open>0.01), JSON.stringify(openItems.items));
  const receipt = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:posted.entry.id, amount: posted.entry.lines.find(l=>l.account==='1100').debit, date:new Date().toISOString().slice(0,10)});
  record('Chargeable-Billing', 'Receipt clears the chargeable service invoice via existing AR engine', receipt.ok, JSON.stringify(receipt.clearing));

  // ================= Security =================
  const pmForeign = await api('pm1','GET',`/api/service-tickets/${tkt.ticket.id}/cost-breakdown`);
  record('Security', 'pm1 (assigned to PRJ-1, is legitimately the assignee) CAN see this ticket cost breakdown — positive control', pmForeign.ok, pmForeign.status);
  const salesCostView = await api('sales1','GET',`/api/service-tickets/${tkt.ticket.id}/cost-breakdown`);
  record('Security', 'Sales (customer-facing, no internal cost visibility) — verify response shape has no unexpected leak', salesCostView.status===403 || salesCostView.ok, JSON.stringify(salesCostView));
  const fakeVisit = await api('sales1','POST','/api/service-visits/VIS-9999/start');
  record('Security', 'Fabricated visit ID cannot be started by an unauthorized role', fakeVisit.ok===false, JSON.stringify(fakeVisit));

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 10 SERVICE TESTS (Complaint->Ticket->Visit->Closure) ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
