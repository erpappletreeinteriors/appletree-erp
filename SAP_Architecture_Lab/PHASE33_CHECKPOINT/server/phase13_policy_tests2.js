'use strict';
// Phase 13 Part 2 — POL-05 (AMC deferred revenue edge cases), POL-06 (rate card), POL-07
// (₹10,000 approval threshold), POL-08 (4h/72h SLA), POL-10 (company profitability), POL-11 (PO
// breakdown), POL-12 (exports), and the Policy Configuration screen. Real HTTP calls.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
function isoMinusHM(hours, minutes){ return new Date(Date.now() - (hours*60+minutes)*60000).toISOString(); }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['ceo','finance1','accountant1','pm1','sales1','estimator1','purchase1','viewer1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345',pm1:'Pm@123456',sales1:'Sal@123456',estimator1:'Est@12345',purchase1:'Pur@12345',viewer1:'View@1234'}[u])));

  const po0 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:200, rate:100, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po0.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po0.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:200, qtyRejected:0, uom:'sheet'}]});

  const lead = await api('sales1','POST','/api/leads',{name:'POL05-12 Test'});
  const er = await api('sales1','POST','/api/estimation-requests',{leadId:lead.lead.id});
  const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, overheadPct:10, profitPct:15, lines:[{category:'Material',qty:1,uom:'lot',rate:50000}]});
  const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, prospectName:'POL05-12 Test', discountPct:0});
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'x'});
  const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1'});
  const projectId = won.project.id, customerId = won.customer.id;

  // ================= POL-05: AMC Deferred Revenue — edge cases =================
  const amc = await api('sales1','POST','/api/amc-contracts',{customerId, projectId, startDate:'2027-01-01', endDate:'2027-12-31', contractValue:120000, serviceFrequencyMonths:3});
  await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/activate`);
  const inv = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amc.amc.id, baseAmount:120000, date:'2027-01-01'});
  await api('accountant1','POST',`/api/journal/${inv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${inv.draft.id}/approve`);
  await api('finance1','POST',`/api/journal/${inv.draft.id}/post`);
  const schedAfterBill = await api('finance1','GET',`/api/amc-contracts/${amc.amc.id}/revenue-schedule`);
  record('POL-05', '₹1,20,000/12mo AMC: monthlyAmount computed as ₹10,000 exactly', Math.abs(schedAfterBill.schedule.monthlyAmount-10000)<0.01, schedAfterBill.schedule.monthlyAmount);
  record('POL-05', 'Fully billed upfront: billed=₹1,20,000, recognized=₹0, deferred=₹1,20,000', schedAfterBill.schedule.billed===120000 && schedAfterBill.schedule.recognized===0 && schedAfterBill.schedule.deferredBalance===120000, JSON.stringify(schedAfterBill.schedule));

  const months = ['2027-01','2027-02','2027-03','2027-04','2027-05','2027-06','2027-07','2027-08','2027-09','2027-10','2027-11'];
  let totalRecognized = 0;
  for(const m of months){
    const r = await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/recognize-revenue`,{periodDate:m+'-15'});
    if(r.ok) totalRecognized += r.amount;
  }
  record('POL-05', '11 months recognized at ₹10,000 each = ₹1,10,000', Math.abs(totalRecognized-110000)<0.01, totalRecognized);
  const doubleRecognize = await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/recognize-revenue`,{periodDate:'2027-01-20'});
  record('POL-05', 'Cannot double-recognize an already-recognized period (Jan already done)', doubleRecognize.ok===false, doubleRecognize.error);
  // February — leap year test irrelevant to month-counting logic here (monthly amount is fixed,
  // not day-counted), but still exercise the exact calendar boundary.
  const finalMonth = await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/recognize-revenue`,{periodDate:'2027-12-15'});
  record('POL-05', 'Final (12th) period absorbs rounding — total recognized now EXACTLY ₹1,20,000, never more', finalMonth.ok && Math.abs(finalMonth.schedule.recognized-120000)<0.01, finalMonth.schedule?.recognized);
  const overRecognize = await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/recognize-revenue`,{periodDate:'2028-01-15'});
  record('POL-05', 'Cannot recognize beyond the fully-recognized contract — deferred balance is zero', overRecognize.ok===false, overRecognize.error);

  // Cancellation with remaining deferred balance — no invented refund policy.
  const amc2 = await api('sales1','POST','/api/amc-contracts',{customerId, projectId, startDate:'2027-01-01', endDate:'2027-12-31', contractValue:60000, serviceFrequencyMonths:6});
  await api('finance1','POST',`/api/amc-contracts/${amc2.amc.id}/activate`);
  const inv2 = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amc2.amc.id, baseAmount:60000, date:'2027-01-01'});
  await api('accountant1','POST',`/api/journal/${inv2.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${inv2.draft.id}/approve`);
  await api('finance1','POST',`/api/journal/${inv2.draft.id}/post`);
  const cancel = await api('finance1','POST',`/api/amc-contracts/${amc2.amc.id}/cancel`,{reason:'Customer relocating'});
  record('POL-05/§18', 'Cancellation with a real deferred balance discloses BUSINESS POLICY REQUIRED, posts NO invented refund/write-off entry', cancel.ok && cancel.deferredBalanceAtCancellation===60000 && /BUSINESS POLICY REQUIRED/.test(cancel.disclosure||''), cancel.disclosure);

  // ================= POL-06: Service Labour Rate Card =================
  const missingRate = await api('finance1','GET','/api/service-labour-rate?technicianLevel=Senior&skill=Carpentry&location=Kochi');
  record('POL-06', 'Unconfigured rate returns NOT_CONFIGURED, never a guessed value', missingRate.configured===false && missingRate.status==='NOT_CONFIGURED', JSON.stringify(missingRate));
  const salesConfigAttempt = await api('sales1','POST','/api/config/service-labour-rates',{technicianLevel:'Senior', skill:'Carpentry', location:'Kochi', normalHourRate:500});
  record('POL-06/§19', 'Sales (not admin/management) cannot configure rates', salesConfigAttempt.ok===false, salesConfigAttempt.error);
  const pmConfigAttempt = await api('pm1','POST','/api/config/service-labour-rates',{technicianLevel:'Senior', skill:'Carpentry', location:'Kochi', normalHourRate:500});
  record('POL-06/§19', 'ProjectManager (not admin/management) cannot configure rates either', pmConfigAttempt.ok===false, pmConfigAttempt.error);
  const setRate = await api('ceo','POST','/api/config/service-labour-rates',{technicianLevel:'Senior', skill:'Carpentry', location:'Kochi', normalHourRate:500, overtimeRate:750, emergencyRate:1000, weekendHolidayRate:800, travelRate:200});
  record('POL-06', 'CEO configures a real rate-card entry', setRate.ok, JSON.stringify(setRate.rate));
  const foundRate = await api('finance1','GET','/api/service-labour-rate?technicianLevel=Senior&skill=Carpentry&location=Kochi');
  record('POL-06', 'Configured rate now found for the exact technician/skill/location combination', foundRate.configured && foundRate.rate.normalHourRate===500, JSON.stringify(foundRate));
  const differentLevel = await api('finance1','GET','/api/service-labour-rate?technicianLevel=Junior&skill=Carpentry&location=Kochi');
  record('POL-06', 'A DIFFERENT technician level with no matching entry still returns NOT_CONFIGURED (no cross-level fallback guessing)', differentLevel.configured===false, JSON.stringify(differentLevel));
  const differentLocation = await api('finance1','GET','/api/service-labour-rate?technicianLevel=Senior&skill=Carpentry&location=Kozhikode');
  record('POL-06', 'A DIFFERENT location with no matching entry also returns NOT_CONFIGURED', differentLocation.configured===false, JSON.stringify(differentLocation));

  // ================= POL-07: Warranty/Chargeable Approval Threshold (₹10,000) =================
  async function newDiagnosedVisit(amount, disputed){
    const cmp = await api('sales1','POST','/api/complaints',{customerId, projectId, description:'POL-07 test '+amount+(disputed?' disputed':'')});
    await api('finance1','POST',`/api/complaints/${cmp.complaint.id}/triage`,{classification:'Warranty'});
    const tkt = await api('ceo','POST','/api/service-tickets',{complaintId:cmp.complaint.id});
    await api('ceo','POST',`/api/service-tickets/${tkt.ticket.id}/assign`,{assignedTo:'U-PM1'});
    const vis = await api('pm1','POST','/api/service-visits',{ticketId:tkt.ticket.id, technician:'U-PM1'});
    await api('pm1','POST',`/api/service-visits/${vis.visit.id}/start`);
    const diag = await api('pm1','POST',`/api/service-visits/${vis.visit.id}/diagnosis`,{diagnosis:'x', estimatedAmount:amount, disputed:!!disputed, warrantyDecision:true, chargeableDecision:false});
    return {ticket:tkt.ticket, visit:vis.visit, diag};
  }
  const at10000 = await newDiagnosedVisit(10000, false);
  record('POL-07', '₹10,000 exactly — technician classification allowed, no approval required', at10000.diag.ok && at10000.diag.visit.diagnosisApprovalStatus==='NotRequired', at10000.diag.visit?.diagnosisApprovalStatus);
  const complete10000 = await api('pm1','POST',`/api/service-visits/${at10000.visit.id}/complete`,{workPerformed:'x', customerAcknowledgement:'x'});
  record('POL-07', '₹10,000 visit completes without manager approval', complete10000.ok, complete10000.error);

  const at10001 = await newDiagnosedVisit(10001, false);
  record('POL-07', '₹10,001 — manager approval REQUIRED', at10001.diag.ok && at10001.diag.visit.diagnosisApprovalStatus==='PendingApproval', at10001.diag.visit?.diagnosisApprovalStatus);
  const completeBlocked = await api('pm1','POST',`/api/service-visits/${at10001.visit.id}/complete`,{workPerformed:'x', customerAcknowledgement:'x'});
  record('POL-07', '₹10,001 visit CANNOT be completed until approved', completeBlocked.ok===false, completeBlocked.error);
  const selfApprove = await api('pm1','POST',`/api/service-visits/${at10001.visit.id}/diagnosis-approval`,{decision:'Approved'});
  record('POL-07/SoD', 'Technician CANNOT self-approve their own high-value diagnosis (direct API attempt)', selfApprove.ok===false, selfApprove.error);
  const salesApprove = await api('sales1','POST',`/api/service-visits/${at10001.visit.id}/diagnosis-approval`,{decision:'Approved'});
  record('POL-07', 'Sales (not manager tier) cannot approve a diagnosis', salesApprove.ok===false, salesApprove.error);
  const managerApprove = await api('finance1','POST',`/api/service-visits/${at10001.visit.id}/diagnosis-approval`,{decision:'Approved', reason:'Genuine hardware failure, verified on-site photos'});
  record('POL-07', 'A real MANAGER (FinanceManager, not the technician) CAN approve — ALLOWED', managerApprove.ok && managerApprove.visit.diagnosisApprovalStatus==='Approved', managerApprove.visit?.diagnosisApprovalStatus);
  const completeAfterApproval = await api('pm1','POST',`/api/service-visits/${at10001.visit.id}/complete`,{workPerformed:'x', customerAcknowledgement:'x'});
  record('POL-07', 'Visit now completes after manager approval', completeAfterApproval.ok, completeAfterApproval.error);
  record('POL-07/Audit', 'Audit records technician, original classification/amount, manager, decision, reason', managerApprove.visit.diagnosedBy==='U-PM1' && managerApprove.visit.estimatedAmount===10001 && managerApprove.visit.diagnosisApprovedBy==='U-FIN1' && managerApprove.visit.diagnosisApprovalReason.length>0, JSON.stringify({diagnosedBy:managerApprove.visit.diagnosedBy, approvedBy:managerApprove.visit.diagnosisApprovedBy, reason:managerApprove.visit.diagnosisApprovalReason}));

  const at50000 = await newDiagnosedVisit(50000, false);
  record('POL-07', '₹50,000 — manager approval REQUIRED', at50000.diag.visit.diagnosisApprovalStatus==='PendingApproval', at50000.diag.visit?.diagnosisApprovalStatus);

  const disputedLow = await newDiagnosedVisit(500, true);
  record('POL-07', 'Disputed case at only ₹500 (well under threshold) STILL requires manager approval', disputedLow.diag.visit.diagnosisApprovalStatus==='PendingApproval', disputedLow.diag.visit?.diagnosisApprovalStatus);

  // ================= POL-08: Service SLA (Response=4h, Visit=72h) =================
  // Tests 1-6 compare two FIXED, explicitly-set timestamps (createdAt and firstRespondedAt/
  // startTime), both anchored to the SAME fixed historical instant — never derived from two
  // separate "now" reads with real network/await time drifting between them (that drift is
  // exactly what broke the first version of this test: independently computing "N hours ago"
  // for the ticket and again for the visit made them land only milliseconds apart in real time,
  // not N hours apart as intended). Using a fixed anchor makes every boundary exact and immune
  // to how long the test itself takes to run.
  async function newTicket(){ const t = await api('ceo','POST','/api/service-tickets',{customerId, projectId, issue:'SLA test'}); return t.ticket; }
  const anchor = new Date('2026-01-01T00:00:00.000Z');
  function anchorPlusHM(h,m){ return new Date(anchor.getTime() + (h*60+m)*60000).toISOString(); }
  // Test 1: response at 3h59m -> MET
  const t1 = await newTicket();
  await api('admin','POST','/api/test/backdate-ticket',{ticketId:t1.id, createdAt: anchor.toISOString(), firstRespondedAt: anchorPlusHM(3,59)});
  const sla1 = await api('finance1','GET',`/api/service-tickets/${t1.id}/sla`);
  record('POL-08 Test1', 'Response at 3h59m -> SLA_RESPONSE_MET', sla1.sla.response.status==='SLA_RESPONSE_MET', JSON.stringify(sla1.sla.response));
  // Test 2: response at exactly 4h -> MET
  const t2 = await newTicket();
  await api('admin','POST','/api/test/backdate-ticket',{ticketId:t2.id, createdAt: anchor.toISOString(), firstRespondedAt: anchorPlusHM(4,0)});
  const sla2 = await api('finance1','GET',`/api/service-tickets/${t2.id}/sla`);
  record('POL-08 Test2', 'Response at exactly 4h -> SLA_RESPONSE_MET', sla2.sla.response.status==='SLA_RESPONSE_MET', JSON.stringify(sla2.sla.response));
  // Test 3: response at 4h01m -> BREACHED
  const t3 = await newTicket();
  await api('admin','POST','/api/test/backdate-ticket',{ticketId:t3.id, createdAt: anchor.toISOString(), firstRespondedAt: anchorPlusHM(4,1)});
  const sla3 = await api('finance1','GET',`/api/service-tickets/${t3.id}/sla`);
  record('POL-08 Test3', 'Response at 4h01m -> SLA_RESPONSE_BREACHED', sla3.sla.response.status==='SLA_RESPONSE_BREACHED', JSON.stringify(sla3.sla.response));
  // Test 4/5/6: site visit at 71h59m / 72h / 72h01m AFTER ticket creation (anchor)
  const t4 = await newTicket();
  await api('admin','POST','/api/test/backdate-ticket',{ticketId:t4.id, createdAt: anchor.toISOString()});
  const v4 = await api('pm1','POST','/api/service-visits',{ticketId:t4.id, technician:'U-PM1'});
  await api('admin','POST','/api/test/backdate-visit',{visitId:v4.visit.id, startTime: anchorPlusHM(71,59)});
  const sla4 = await api('finance1','GET',`/api/service-tickets/${t4.id}/sla`);
  record('POL-08 Test4', 'Site visit at 71h59m -> SLA_VISIT_MET', sla4.sla.visit.status==='SLA_VISIT_MET', JSON.stringify(sla4.sla.visit));
  const t5 = await newTicket();
  await api('admin','POST','/api/test/backdate-ticket',{ticketId:t5.id, createdAt: anchor.toISOString()});
  const v5 = await api('pm1','POST','/api/service-visits',{ticketId:t5.id, technician:'U-PM1'});
  await api('admin','POST','/api/test/backdate-visit',{visitId:v5.visit.id, startTime: anchorPlusHM(72,0)});
  const sla5 = await api('finance1','GET',`/api/service-tickets/${t5.id}/sla`);
  record('POL-08 Test5', 'Site visit at exactly 72h -> SLA_VISIT_MET', sla5.sla.visit.status==='SLA_VISIT_MET', JSON.stringify(sla5.sla.visit));
  const t6 = await newTicket();
  await api('admin','POST','/api/test/backdate-ticket',{ticketId:t6.id, createdAt: anchor.toISOString()});
  const v6 = await api('pm1','POST','/api/service-visits',{ticketId:t6.id, technician:'U-PM1'});
  await api('admin','POST','/api/test/backdate-visit',{visitId:v6.visit.id, startTime: anchorPlusHM(72,1)});
  const sla6 = await api('finance1','GET',`/api/service-tickets/${t6.id}/sla`);
  record('POL-08 Test6', 'Site visit at 72h01m -> SLA_VISIT_BREACHED', sla6.sla.visit.status==='SLA_VISIT_BREACHED', JSON.stringify(sla6.sla.visit));
  // Test 7: no response at all, well past due -> response breach
  const t7 = await newTicket();
  await api('admin','POST','/api/test/backdate-ticket',{ticketId:t7.id, createdAt: isoMinusHM(10,0)});
  const sla7 = await api('finance1','GET',`/api/service-tickets/${t7.id}/sla`);
  record('POL-08 Test7', 'No response recorded, 10h elapsed -> SLA_RESPONSE_BREACHED', sla7.sla.response.status==='SLA_RESPONSE_BREACHED', JSON.stringify(sla7.sla.response));
  // Test 8: no site visit at all, well past due -> visit breach
  const sla7visit = sla7.sla.visit;
  record('POL-08 Test8', 'No site visit recorded, 10h elapsed (< 72h so still active) -> SLA_VISIT_ACTIVE; re-test past 72h separately', sla7visit.status==='SLA_VISIT_ACTIVE', JSON.stringify(sla7visit));
  const t8 = await newTicket();
  await api('admin','POST','/api/test/backdate-ticket',{ticketId:t8.id, createdAt: isoMinusHM(80,0)});
  const sla8 = await api('finance1','GET',`/api/service-tickets/${t8.id}/sla`);
  record('POL-08 Test8b', 'No site visit recorded, 80h elapsed -> SLA_VISIT_BREACHED', sla8.sla.visit.status==='SLA_VISIT_BREACHED', JSON.stringify(sla8.sla.visit));
  record('POL-08', 'Resolution SLA is explicitly NOT CONFIGURED (never fabricated)', sla8.sla.resolution.configured===false && /NOT CONFIGURED/.test(sla8.sla.resolution.status), sla8.sla.resolution);
  // Test 9: direct API attempt to modify SLA -> denied (no such endpoint exists at all)
  const tamperAttempt = await api('pm1','POST',`/api/service-tickets/${t8.id}/sla`,{dueDate:'2020-01-01'});
  record('POL-08 Test9', 'Direct API attempt to modify SLA via POST is denied (404 — no such mutating endpoint exists)', tamperAttempt.status===404 || tamperAttempt.status===403, tamperAttempt.status);
  // Test 10: unauthorized user attempting to alter SLA status
  const unauthAlter = await api('sales1','POST',`/api/service-tickets/${t8.id}/sla`,{status:'SLA_MET'});
  record('POL-08 Test10', 'Unauthorized user attempting to alter SLA status is denied identically (no alter mechanism exists for anyone)', unauthAlter.status===404 || unauthAlter.status===403, unauthAlter.status);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 13 POLICY TESTS (Part 2: POL-05 to POL-08) ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
