'use strict';
// Phase 11 §4-§21 — Project Financial 360, Core vs Lifecycle P&L, Customer Profitability,
// posted-only revenue rules. Real HTTP calls against the running server.
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
  await Promise.all(['ceo','finance1','accountant1','pm1','sales1','estimator1','purchase1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345',pm1:'Pm@123456',sales1:'Sal@123456',estimator1:'Est@12345',purchase1:'Pur@12345'}[u])));

  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:50, qtyRejected:0, uom:'sheet'}]});

  // Real project via the Lead->Won chain (so it has a quotation and a real approvedRevenue).
  const lead = await api('sales1','POST','/api/leads',{name:'Financial Integration Test'});
  const er = await api('sales1','POST','/api/estimation-requests',{leadId:lead.lead.id});
  const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, overheadPct:10, profitPct:15, lines:[{category:'Material',qty:1,uom:'lot',rate:100000}]});
  const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, prospectName:'Financial Integration Test', discountPct:0});
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'x'});
  const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1'});
  const projectId = won.project.id, customerId = won.customer.id;

  // Before any after-sales activity: Core == Lifecycle (nothing to subtract yet).
  const f360_0 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('Invariant', 'With zero after-sales activity, Core margin equals Lifecycle margin', f360_0.ok && f360_0.profitability.originalProjectMargin.revenue===f360_0.profitability.lifecycleMargin.revenue, JSON.stringify(f360_0.profitability));

  // ---- Warranty path ----
  const war = await api('ceo','POST','/api/warranties',{customerId, projectId, product:'x', durationMonths:12});
  const cmp = await api('sales1','POST','/api/complaints',{customerId, projectId, warrantyId:war.warranty.id, description:'x'});
  await api('finance1','POST',`/api/complaints/${cmp.complaint.id}/triage`,{classification:'Warranty'});
  const tktW = await api('ceo','POST','/api/service-tickets',{complaintId:cmp.complaint.id});
  await api('ceo','POST',`/api/service-tickets/${tktW.ticket.id}/assign`,{assignedTo:'U-PM1'});
  const visW = await api('pm1','POST','/api/service-visits',{ticketId:tktW.ticket.id, technician:'U-PM1'});
  await api('pm1','POST',`/api/service-visits/${visW.visit.id}/start`);
  await api('pm1','POST',`/api/service-visits/${visW.visit.id}/diagnosis`,{diagnosis:'x', warrantyDecision:true, chargeableDecision:false});
  await api('pm1','POST',`/api/service-visits/${visW.visit.id}/material-issue`,{materialId:'MAT-1', qty:1, warehouseId:'WH-1'});
  await api('finance1','POST',`/api/service-visits/${visW.visit.id}/labour-cost`,{amount:500});
  await api('pm1','POST',`/api/service-visits/${visW.visit.id}/complete`,{workPerformed:'x', customerAcknowledgement:'x'});
  await api('ceo','POST',`/api/service-tickets/${tktW.ticket.id}/close`);

  const f360_1 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('Warranty', 'Warranty Cost > 0 after material+labour posted', f360_1.afterSales.warrantyCost>0, f360_1.afterSales.warrantyCost);
  record('Warranty', 'Warranty Cost is NEVER counted as revenue anywhere', f360_1.afterSales.warrantyCost>0 && f360_1.profitability.lifecycleMargin.revenue===f360_0.profitability.lifecycleMargin.revenue, {lifecycleRevBefore:f360_0.profitability.lifecycleMargin.revenue, lifecycleRevAfter:f360_1.profitability.lifecycleMargin.revenue});
  // Lifecycle already includes the warranty cost as an expense (Core excludes it), so Lifecycle
  // profit is LOWER than Core profit by exactly the warranty cost: core.profit - lifecycle.profit === warrantyCost.
  record('Invariant', 'Core margin exceeds Lifecycle margin by exactly the warranty cost (Lifecycle already includes it, Core excludes it)', Math.abs((f360_1.profitability.originalProjectMargin.profit - f360_1.profitability.lifecycleMargin.profit) - f360_1.afterSales.warrantyCost) < 0.02, {lifecycleProfit:f360_1.profitability.lifecycleMargin.profit, coreProfit:f360_1.profitability.originalProjectMargin.profit, warrantyCost:f360_1.afterSales.warrantyCost});

  // ---- Chargeable path: revenue must be ZERO until POSTED, not just drafted ----
  const cmp2 = await api('sales1','POST','/api/complaints',{customerId, projectId, description:'extra work'});
  await api('finance1','POST',`/api/complaints/${cmp2.complaint.id}/triage`,{classification:'Chargeable'});
  const tktC = await api('ceo','POST','/api/service-tickets',{complaintId:cmp2.complaint.id});
  await api('ceo','POST',`/api/service-tickets/${tktC.ticket.id}/assign`,{assignedTo:'U-PM1'});
  const visC = await api('pm1','POST','/api/service-visits',{ticketId:tktC.ticket.id, technician:'U-PM1'});
  await api('pm1','POST',`/api/service-visits/${visC.visit.id}/start`);
  await api('pm1','POST',`/api/service-visits/${visC.visit.id}/diagnosis`,{diagnosis:'x', warrantyDecision:false, chargeableDecision:true});
  await api('pm1','POST',`/api/service-visits/${visC.visit.id}/complete`,{workPerformed:'x', customerAcknowledgement:'x'});
  const svcInv = await api('accountant1','POST','/api/service-invoice',{ticketId:tktC.ticket.id, baseAmount:3000, date:'2026-09-01'});

  const f360_2 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('§13', 'A DRAFTED (not posted) service invoice contributes ZERO to Chargeable Service Revenue', f360_2.afterSales.chargeableServiceRevenue===0, f360_2.afterSales.chargeableServiceRevenue);

  await api('accountant1','POST',`/api/journal/${svcInv.draft.id}/submit`);
  const f360_3 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('§13', 'A SUBMITTED (not posted) service invoice still contributes ZERO', f360_3.afterSales.chargeableServiceRevenue===0, f360_3.afterSales.chargeableServiceRevenue);

  await api('finance1','POST',`/api/journal/${svcInv.draft.id}/approve`);
  const posted = await api('finance1','POST',`/api/journal/${svcInv.draft.id}/post`);
  const f360_4 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('§13', 'Only once POSTED does Chargeable Service Revenue reflect the invoice amount (₹3000)', Math.abs(f360_4.afterSales.chargeableServiceRevenue-3000)<0.01, f360_4.afterSales.chargeableServiceRevenue);

  // ---- AMC path: revenue must reflect POSTED billing, distinct from contract value ----
  const amc = await api('sales1','POST','/api/amc-contracts',{customerId, projectId, startDate:'2026-09-01', endDate:'2027-08-31', contractValue:20000, serviceFrequencyMonths:3});
  await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/activate`);
  const f360_5 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('§14', 'Contract Value (₹20,000) is tracked SEPARATELY from AMC Revenue (still ₹0, nothing billed yet)', f360_5.afterSales.amcContractValue===20000 && f360_5.afterSales.amcRevenue===0, {contractValue:f360_5.afterSales.amcContractValue, revenue:f360_5.afterSales.amcRevenue});
  const amcInv = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amc.amc.id, baseAmount:5000, date:'2026-09-15'});
  await api('accountant1','POST',`/api/journal/${amcInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${amcInv.draft.id}/approve`);
  await api('finance1','POST',`/api/journal/${amcInv.draft.id}/post`);
  // Phase 13 POL-05 (approved: Option B, deferred/monthly recognition): billing alone must NOT
  // move revenue — only an explicit recognition event does. Billed ≠ Revenue is now enforced,
  // not just distinguished from Contract Value.
  const f360_6 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('§14', 'After BILLING ₹5,000 (not yet recognized), AMC Revenue stays ₹0 — Billed ≠ Revenue under deferred recognition', f360_6.afterSales.amcRevenue===0 && f360_6.afterSales.amcBilled===5000, {revenue:f360_6.afterSales.amcRevenue, billed:f360_6.afterSales.amcBilled});
  const recognize = await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/recognize-revenue`,{periodDate:'2026-09-15'});
  record('§14', 'Explicit recognition event posts Dr Deferred Revenue / Cr Revenue', recognize.ok && recognize.entry.lines.some(l=>l.account==='2100' && l.debit>0) && recognize.entry.lines.some(l=>l.account==='4000' && l.credit>0), JSON.stringify(recognize.entry?.lines));
  // One recognizeAMCRevenue() call recognizes ONE month's slice (contractValue/totalMonths =
  // ₹20,000/12 = ₹1,666.67), not the full billed amount — that's the correct "monthly
  // recognition" behavior the brief's own example describes, not a partial/broken result.
  const f360_7 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('§14', 'AFTER one recognition call, AMC Revenue = ₹1,666.67 (one month of ₹20,000/12), NOT the full ₹5,000 billed and NOT the ₹20,000 contract value', Math.abs(f360_7.afterSales.amcRevenue-1666.67)<0.01 && f360_7.afterSales.amcContractValue===20000, {revenue:f360_7.afterSales.amcRevenue, contractValue:f360_7.afterSales.amcContractValue});

  // ---- Customer Profitability ----
  const profit = await api('finance1','GET',`/api/customers/${customerId}/profitability`);
  record('Customer-Profitability', 'Customer profitability aggregates this project with matching warranty/chargeable/AMC figures', profit.ok && profit.profitability.projects.some(p=>p.projectId===projectId && p.warrantyCost>0 && p.chargeableServiceRevenue>0 && p.amcRevenue>0), JSON.stringify(profit.profitability?.projects));

  // ---- Security ----
  const salesProfit = await api('sales1','GET',`/api/customers/${customerId}/profitability`);
  record('Security', 'Sales (customer-facing, no cost/margin visibility) is DENIED customer profitability', salesProfit.status===403, JSON.stringify(salesProfit));
  const pmForeignF360 = await api('pm1','GET','/api/projects/PRJ-2/financial-360');
  record('Security', 'PM not assigned to PRJ-2 is DENIED its financial-360', pmForeignF360.status===403, JSON.stringify(pmForeignF360));
  const fakeF360 = await api('finance1','GET','/api/projects/PRJ-9999/financial-360');
  record('Security', 'Fabricated project ID on financial-360 returns 404, not a crash/leak', fakeF360.status===404, JSON.stringify(fakeF360));

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 11 FINANCIAL INTEGRATION TESTS ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
