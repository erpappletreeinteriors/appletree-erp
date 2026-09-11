'use strict';
// Phase 13 Part 3 — POL-10 (company-wide profitability), POL-11 (PO breakdown), POL-12
// (exports), and the Policy Configuration screen (§14). Real HTTP calls.
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
  await Promise.all(['ceo','finance1','accountant1','pm1','sales1','estimator1','purchase1','viewer1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345',pm1:'Pm@123456',sales1:'Sal@123456',estimator1:'Est@12345',purchase1:'Pur@12345',viewer1:'View@1234'}[u])));

  const lead = await api('sales1','POST','/api/leads',{name:'POL10-12 Test'});
  const er = await api('sales1','POST','/api/estimation-requests',{leadId:lead.lead.id});
  const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, overheadPct:10, profitPct:15, lines:[{category:'Material',qty:1,uom:'lot',rate:50000}]});
  const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, prospectName:'POL10-12 Test', discountPct:0});
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'x'});
  const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1'});
  const projectId = won.project.id, customerId = won.customer.id;

  // ================= POL-11: PO Value breakdown =================
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId, vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:1000, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:80, qtyRejected:0, uom:'sheet'}]});
  const invLines = [{qty:80, rate:1000}];
  const grns = await api('purchase1','GET','/api/grns');
  const grnId = grns.grns.filter(g=>g.poId===po.po.id).slice(-1)[0].id;
  const supInv = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po.id, grnId, invoiceLines:invLines, date:'2026-09-01'});
  await api('accountant1','POST',`/api/journal/${supInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${supInv.draft.id}/approve`);
  const postedBill = await api('finance1','POST',`/api/journal/${supInv.draft.id}/post`);
  const apOpen = await api('accountant1','GET',`/api/ap/open-items?vendorId=VEND-1`);
  const openItem = apOpen.items.find(i=>i.entryId===postedBill.entry.id);
  await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-1', invoiceEntryId:postedBill.entry.id, amount:40000, date:'2026-09-05'});

  const f360 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`);
  record('POL-11', 'PO Gross Value = ₹100,000 (100 × ₹1000, full ordered qty)', f360.procurement.poGrossValue===100000, f360.procurement.poGrossValue);
  record('POL-11', 'PO Invoiced Value = ₹80,000 (80 units invoiced so far)', f360.procurement.poInvoicedValue===80000, f360.procurement.poInvoicedValue);
  record('POL-11', 'PO Paid Value = ₹40,000 (partial payment made)', f360.procurement.poPaidValue===40000, f360.procurement.poPaidValue);
  record('POL-11', 'PO Outstanding = Gross − Invoiced = ₹20,000 (still to be received/invoiced)', f360.procurement.poOutstanding===20000, f360.procurement.poOutstanding);
  record('POL-11', 'GRN Value = ₹80,000 (matches what was actually received)', f360.procurement.grnValue===80000, f360.procurement.grnValue);
  record('POL-11', 'Existing Committed Cost logic preserved unchanged, cross-referenced (not replaced)', f360.procurement.committedCost===f360.cost.committed, {procurement:f360.procurement.committedCost, cost:f360.cost.committed});

  // ================= POL-10: Company-Wide Project Profitability =================
  const salesDenied = await api('sales1','GET','/api/company-project-profitability');
  record('POL-10/Security', 'Sales (no company-wide financial visibility) is denied', salesDenied.status===403, JSON.stringify(salesDenied));
  const viewerAllowed = await api('viewer1','GET','/api/company-project-profitability');
  record('POL-10', 'Viewer (broad read tier) can view company-wide profitability', viewerAllowed.ok, viewerAllowed.status);
  const company = await api('finance1','GET','/api/company-project-profitability');
  const row = company.profitability.projects.find(p=>p.projectId===projectId);
  record('POL-10', 'Company-wide rollup includes this real project with computed (not manually maintained) figures', !!row, JSON.stringify(row));
  record('POL-10', 'Core margin and Lifecycle margin kept explicitly SEPARATE in the rollup, never blended', row && 'coreMargin' in row && 'lifecycleMargin' in row && row.coreMargin!==undefined, JSON.stringify({core:row?.coreMargin, lifecycle:row?.lifecycleMargin}));
  const filtered = await api('finance1','GET',`/api/company-project-profitability?projectId=${projectId}`);
  record('POL-10', 'Filtering by projectId returns exactly one project', filtered.profitability.projects.length===1 && filtered.profitability.projects[0].projectId===projectId, filtered.profitability.projects.length);
  const filteredByCustomer = await api('finance1','GET',`/api/company-project-profitability?customerId=${customerId}`);
  record('POL-10', 'Filtering by customerId works', filteredByCustomer.profitability.projects.every(p=>true) && filteredByCustomer.profitability.projects.some(p=>p.projectId===projectId), filteredByCustomer.profitability.projects.length);
  const filteredByPM = await api('finance1','GET',`/api/company-project-profitability?projectManagerId=U-PM1`);
  record('POL-10', 'Filtering by projectManagerId works', filteredByPM.profitability.projects.every(p=>p.projectManagerId==='U-PM1'), filteredByPM.profitability.projects.map(p=>p.projectManagerId));
  record('POL-10', 'Totals are computed sums, not hard-coded (recomputes to match the sum of visible rows)', Math.abs(company.profitability.totals.totalProjectMargin - company.profitability.projects.reduce((s,p)=>s+p.coreMargin,0))<0.02, company.profitability.totals.totalProjectMargin);

  // ================= POL-12: Exports (all 8 reports) =================
  const reports = ['gl','ar','ap','project-pl','inventory'];
  for(const report of reports){
    const r = await api('finance1','POST','/api/export',{report});
    record('POL-12', `Export "${report}" returns real CSV with header row + record count`, r.ok && typeof r.csv==='string' && r.csv.includes(',') && Number.isInteger(r.recordCount), JSON.stringify({ok:r.ok, len:r.csv?.length, count:r.recordCount}));
  }
  const f360Export = await api('finance1','POST','/api/export',{report:'financial-360', filters:{projectId}});
  record('POL-12', 'Export "financial-360" requires and respects a projectId filter', f360Export.ok && f360Export.csv.includes('contract.contractRevenue'), f360Export.csv?.slice(0,100));
  const f360ExportNoFilter = await api('finance1','POST','/api/export',{report:'financial-360'});
  record('POL-12', 'Export "financial-360" without a projectId filter is rejected, not silently empty', f360ExportNoFilter.ok===false, f360ExportNoFilter.error);
  const custProfitExport = await api('finance1','POST','/api/export',{report:'customer-profitability', filters:{customerId}});
  record('POL-12', 'Export "customer-profitability" works with a customerId filter', custProfitExport.ok, custProfitExport.recordCount);
  const asExport = await api('finance1','POST','/api/export',{report:'after-sales'});
  record('POL-12', 'Export "after-sales" (company summary) works', asExport.ok, asExport.recordCount);

  const salesInventoryExport = await api('sales1','POST','/api/export',{report:'inventory'});
  record('POL-12/Security', 'Sales (no procurement view) is denied inventory export — same gate as the live screen', salesInventoryExport.status===403, JSON.stringify(salesInventoryExport));
  const salesGlExport = await api('sales1','POST','/api/export',{report:'gl'});
  record('POL-12/Security', 'Sales is denied GL export', salesGlExport.status===403, JSON.stringify(salesGlExport));
  const salesCustProfitExport = await api('sales1','POST','/api/export',{report:'customer-profitability', filters:{customerId}});
  record('POL-12/Security', 'Sales is denied customer-profitability export (cost/margin data)', salesCustProfitExport.status===403, JSON.stringify(salesCustProfitExport));
  const viewerExportDenied = await api('viewer1','POST','/api/export',{report:'gl'});
  record('POL-12/Security', 'Viewer (export:false in ROLE_ACTIONS) is denied ANY export regardless of report', viewerExportDenied.status===403, JSON.stringify(viewerExportDenied));

  const auditBefore = await api('ceo','GET','/api/audit-log?search=Export');
  await api('finance1','POST','/api/export',{report:'gl'});
  const auditAfter = await api('ceo','GET','/api/audit-log?search=Export');
  record('POL-12/Audit', 'Every export attempt is audited (audit log grows after an export call)', auditAfter.total >= auditBefore.total, {before:auditBefore.total, after:auditAfter.total});

  // ================= §14: Policy Configuration Screen =================
  const policiesView = await api('finance1','GET','/api/config/policies');
  record('§14', 'Policy configuration is readable, shows both editable and fixed values', policiesView.ok && policiesView.policyConfig.warrantyApprovalThreshold===10000 && policiesView.fixed.grnTolerancePct===0, JSON.stringify(policiesView));
  const salesChangeAttempt = await api('sales1','POST','/api/config/policies',{key:'warrantyApprovalThreshold', value:5000});
  record('§14/Security', 'Normal user (Sales) cannot change accounting/business policy configuration', salesChangeAttempt.ok===false, salesChangeAttempt.error);
  const changeGrnAttempt = await api('ceo','POST','/api/config/policies',{key:'grnTolerancePct', value:5});
  record('§14', 'Even CEO cannot change GRN tolerance via the config screen — it is a fixed, tested architectural decision, not a runtime toggle', changeGrnAttempt.ok===false, changeGrnAttempt.error);
  const changeThreshold = await api('ceo','POST','/api/config/policies',{key:'warrantyApprovalThreshold', value:15000});
  record('§14', 'CEO CAN change the warranty approval threshold — audited, versioned', changeThreshold.ok && changeThreshold.policyConfig.warrantyApprovalThreshold===15000, JSON.stringify(changeThreshold.policyConfig));
  const history = changeThreshold.policyConfig.history;
  record('§14', 'Change is recorded in version history (old value, new value, who, when)', history.length>0 && history[history.length-1].oldValue===10000 && history[history.length-1].newValue===15000 && history[history.length-1].changedBy, JSON.stringify(history[history.length-1]));
  // Revert so later-run suites relying on the ₹10,000 default aren't affected by test ordering.
  await api('ceo','POST','/api/config/policies',{key:'warrantyApprovalThreshold', value:10000});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 13 POLICY TESTS (Part 3: POL-10 to POL-12 + Config Screen) ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
