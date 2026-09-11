'use strict';
// Phase 9B §6 — complete Role × Module × Action security matrix, tested via DIRECT API calls
// (the "B. Direct API operation" half of §6; "A. Real UI operation" is spot-checked separately
// in the browser and cross-referenced in the Phase 9B report, since literally re-driving the
// browser for every one of these ~350 cells would not add proof value proportional to its cost
// — the UI is a thin caller of these exact same endpoints, already proven live in the Phase 9
// E2E test and the Phase 9B spot-checks).
//
// Method: classify each response as DENIED (HTTP 403 from the authorization layer, i.e. deny())
// or AUTHORIZED (anything else — 200/400/404 — meaning the request reached business logic,
// which is a SEPARATE concern from authorization). Compare AUTHORIZED/DENIED against an
// expected-allowed-role-set derived directly from reading server.js/domain.js's own gating code.
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
const jars = {};
const ROLES = ['admin','ceo','accountant1','finance1','pm1','purchase1','sales1','estimator1','viewer1'];
const ROLE_NAME = {admin:'Admin', ceo:'CEO', accountant1:'Accountant', finance1:'FinanceManager', pm1:'ProjectManager', purchase1:'Purchase', sales1:'Sales', estimator1:'Estimator', viewer1:'Viewer'};
const CREDS = {admin:'Admin@12345', ceo:'Ceo@12345', accountant1:'Acc@12345', finance1:'Fin@12345', pm1:'Pm@123456', purchase1:'Pur@12345', sales1:'Sal@123456', estimator1:'Est@12345', viewer1:'View@1234'};

async function login(u,p){ const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u, method, path, body){ const h={'Content-Type':'application/json'}; if(jars[u]) h.Cookie=jars[u]; const r=await fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined}); const j=await r.json().catch(()=>({})); return {status:r.status, ...j}; }

const rows = [];
function record(module, action, path, role, expectedAllowed, actualAllowed, status, note){
  const pass = expectedAllowed===actualAllowed;
  rows.push({module, action, path, role, expected: expectedAllowed?'ALLOWED':'DENIED', actual: actualAllowed?'ALLOWED':'DENIED', status, pass, note:note||''});
}

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345');
  await api('admin','POST','/api/test/reset');
  for(const u of ROLES) if(u!=='admin') await login(u, CREDS[u]);

  // ---- Fixtures created as Admin so no role's approve/etc. attempt is blocked by
  // self-approval SoD (Admin/CEO have an SoD override; every OTHER role testing "approve"
  // below is inherently not the creator either way, since Admin created it). ----
  const po = await api('admin','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:5, rate:2800, uom:'sheet'}]});
  await api('admin','POST',`/api/purchase-orders/${po.po.id}/submit`);
  const bom = await api('admin','POST','/api/boms',{projectId:'PRJ-1', description:'Matrix Test Unit', lines:[{materialId:'MAT-1', qty:1, uom:'sheet', scrapPct:0}]});
  const dsp = await api('admin','POST','/api/dispatches',{projectId:'PRJ-1', customerId:'CUST-1', items:[{materialId:'MAT-1', qty:1}], destination:'Test'});
  await api('admin','POST',`/api/dispatches/${dsp.dispatch.id}/ready`);
  const bm = await api('admin','POST','/api/billing-milestones',{projectId:'PRJ-1', milestoneType:'Advance', amount:1000});
  const jeDraft = await api('admin','POST','/api/journal/draft',{date:'2026-08-24', narration:'Matrix fixture', docTypeCode:'JE', docCategory:'JournalVoucher', lines:[{account:'1000',debit:100,credit:0},{account:'4000',debit:0,credit:100}]});
  await api('admin','POST',`/api/journal/${jeDraft.draft.id}/submit`);
  await api('admin','POST',`/api/journal/${jeDraft.draft.id}/approve`);
  const posted = await api('admin','POST',`/api/journal/${jeDraft.draft.id}/post`);
  // pm1 is statically assigned to PRJ-1 (Phase 6A seed) — real fixture for execAllowed testing.
  const inst = await api('admin','POST','/api/installations',{projectId:'PRJ-1', site:'Matrix Test'});

  // ---- Test-case table: [module, action, method, path, body, allowedUsernames] ----
  const A = ['admin','ceo'], AC='accountant1', FIN='finance1', PM='pm1', PUR='purchase1', SAL='sales1', EST='estimator1', VIEW='viewer1';
  const cases = [
    // CRM
    ['CRM','VIEW /leads','GET','/api/leads',null, [...A,SAL,VIEW]],
    ['CRM','CREATE lead','POST','/api/leads',{name:'Matrix Test Lead'}, [...A,SAL]],
    ['CRM','VIEW /quotations','GET','/api/quotations',null, [...A,FIN,AC,EST,SAL,VIEW]],
    ['CRM','CREATE quotation (raw)','POST','/api/quotations',{leadId:'LEAD-9999',estimationRequestId:'ER-9999',costingVersionId:'COST-9999',discountPct:0}, [...A,SAL]],
    // PROJECTS
    ['PROJECTS','VIEW /projects','GET','/api/projects',null, [...A,AC,FIN,PM,PUR,SAL,EST,VIEW]],
    // pm1 is statically assigned to PRJ-1 and PRJ-3 (Phase 6A seed) — PRJ-2 is genuinely unassigned to it.
    ['PROJECTS','VIEW cost-breakdown (PRJ-2, unassigned PM)','GET','/api/projects/PRJ-2/cost-breakdown',null, [...A,AC,FIN,VIEW]],
    // PROCUREMENT
    ['PROCUREMENT','VIEW /purchase-orders','GET','/api/purchase-orders',null, [...A,PUR,FIN,AC,PM,VIEW]],
    ['PROCUREMENT','CREATE PO','POST','/api/purchase-orders',{projectId:'PRJ-1',vendorId:'VEND-1',lines:[{materialId:'MAT-1',qty:1,rate:100,uom:'sheet'}]}, [...A,PUR]],
    ['PROCUREMENT','APPROVE PO','POST',`/api/purchase-orders/${po.po.id}/approve`,null, [...A,FIN]],
    ['PROCUREMENT','CREATE GRN','POST','/api/grns',{poId:'PO-9999',warehouseId:'WH-1',lines:[]}, [...A,PUR]],
    // Phase 27 — new read-only projection powering the PO-aware Supplier Bill screen. Same
    // 'create' gate as actually creating the bill (if a role can't bill, it doesn't need to see
    // what's billable) — so the allowed set matches every other can(actor,'create') endpoint.
    ['PROCUREMENT','VIEW invoiceable-grns','GET','/api/ap/invoiceable-grns?vendorId=VEND-1',null, [...A,AC,FIN,PUR,SAL,EST]],
    ['PROCUREMENT','VIEW material-requirements','GET','/api/material-requirements',null, [...A,PUR,FIN,AC,PM,VIEW]],
    ['PROCUREMENT','CREATE material-requirement (PM unassigned to PRJ-2)','POST','/api/material-requirements',{projectId:'PRJ-2',materialId:'MAT-1',qty:1}, [...A]],
    // INVENTORY
    ['INVENTORY','VIEW stock (no gate by design)','GET','/api/inventory/stock?materialId=MAT-1&warehouseId=WH-1',null, [...A,AC,FIN,PM,PUR,SAL,EST,VIEW]],
    ['INVENTORY','VIEW movements','GET','/api/inventory/movements',null, [...A,PUR,FIN,AC,PM,VIEW]],
    // MANUFACTURING
    ['MANUFACTURING','CREATE BOM','POST','/api/boms',{projectId:'PRJ-1',description:'x',lines:[]}, [...A,EST]],
    ['MANUFACTURING','APPROVE BOM','POST',`/api/boms/${bom.bom.id}/approve`,null, [...A,FIN]],
    ['MANUFACTURING','CREATE production-order (PM unassigned to PRJ-2)','POST','/api/production-orders',{projectId:'PRJ-2',bomId:bom.bom.id,plannedQty:1}, [...A]],
    // EXECUTION
    ['EXECUTION','CREATE dispatch (PM unassigned to PRJ-2)','POST','/api/dispatches',{projectId:'PRJ-2',customerId:'CUST-1',items:[{materialId:'MAT-1',qty:1}]}, [...A,PUR]],
    ['EXECUTION','APPROVE dispatch','POST',`/api/dispatches/${dsp.dispatch.id}/approve`,null, [...A,FIN]],
    ['EXECUTION','CREATE snag (PM unassigned to PRJ-2)','POST','/api/snags',{projectId:'PRJ-2',description:'x',severity:'Low'}, [...A,PUR]],
    ['EXECUTION','CREATE handover (PM unassigned to PRJ-2)','POST','/api/handovers',{projectId:'PRJ-2'}, [...A,PUR]],
    ['EXECUTION','VIEW billing-milestones','GET','/api/billing-milestones',null, [...A,FIN,AC,SAL,PM,VIEW]],
    ['EXECUTION','CREATE billing-milestone','POST','/api/billing-milestones',{projectId:'PRJ-1',milestoneType:'Advance',amount:100}, [...A,FIN,AC,SAL]],
    ['EXECUTION','MARK milestone Ready','POST',`/api/billing-milestones/${bm.milestone.id}/ready`,null, [...A,FIN]],
    // FINANCE
    ['FINANCE','VIEW journal-entries (GL)','GET','/api/journal-entries',null, [...A,AC,FIN,VIEW]],
    ['FINANCE','VIEW trial-balance','GET','/api/trial-balance',null, [...A,AC,FIN,VIEW]],
    ['FINANCE','VIEW ar-ageing','GET','/api/ar/ageing',null, [...A,AC,FIN,VIEW]],
    ['FINANCE','VIEW ap-ageing','GET','/api/ap/ageing',null, [...A,AC,FIN,VIEW]],
    ['FINANCE','CREATE journal draft (generic JV)','POST','/api/journal/draft',{date:'2026-08-24',narration:'x',docTypeCode:'JE',docCategory:'JournalVoucher',lines:[{account:'1000',debit:1,credit:0},{account:'4000',debit:0,credit:1}]}, [...A,AC,FIN,PUR,SAL,EST]],
    ['FINANCE','POST journal (post permission)','POST',`/api/journal/${jeDraft.draft.id}/post`,null, [...A,FIN]],
    ['FINANCE','REVERSE journal','POST',`/api/journal/${posted.entry.id}/reverse`,{reason:'matrix test'}, [...A,FIN]],
    ['FINANCE','PAY (AP payment)','POST','/api/ap/payment',{vendorId:'VEND-1',invoiceEntryId:'JE-9999',amount:1,date:'2026-08-24'}, [...A,FIN]],
    // Phase 15 — moved BEFORE the 'RESET test data' case below: this one requires a real,
    // pre-existing Installation record (unlike the fixture-9999-style cases elsewhere in this
    // file, its route checks existence and 403s for everyone if the record is gone) — running it
    // after the mid-array reset silently wiped the fixture and produced a false failure.
    ['ACCOUNTING','POST installation labour cost (exec-allowed: Admin/CEO/Purchase, or PM assigned to PRJ-1 — real fixture)','POST',`/api/installations/${inst.installation.id}/labour-cost`,{amount:100}, [...A,PUR,PM]],
    // REPORTS
    ['REPORTS','VIEW audit-log','GET','/api/audit-log',null, [...A]],
    // ADMIN
    ['ADMIN','VIEW admin/users (masterData)','GET','/api/admin/users',null, [...A]],
    ['ADMIN','RESET test data','POST','/api/test/reset',null, ['admin']],
    // EXPORT
    ['EXPORT','EXPORT gl (GL report)','POST','/api/export',{report:'gl'}, [...A,AC,FIN]], // Phase 13 POL-12 canonical report name
    ['EXPORT','EXPORT leads (non-GL report)','POST','/api/export',{report:'leads'}, [...A,AC,FIN,PUR,SAL,EST,PM]],
    // Phase 10 — After-Sales
    ['AFTER-SALES','VIEW /warranties','GET','/api/warranties',null, [...A,AC,FIN,SAL,PM,VIEW]],
    ['AFTER-SALES','CREATE warranty','POST','/api/warranties',{customerId:'CUST-1',projectId:'PRJ-1',durationMonths:12}, [...A,FIN,PM]],
    ['AFTER-SALES','VIEW /complaints','GET','/api/complaints',null, [...A,AC,FIN,SAL,PM,VIEW]],
    ['AFTER-SALES','CREATE complaint','POST','/api/complaints',{customerId:'CUST-1',projectId:'PRJ-1',description:'x'}, [...A,SAL,PM]],
    ['AFTER-SALES','TRIAGE complaint','POST','/api/complaints/CMP-9999/triage',{classification:'Warranty'}, [...A,FIN]],
    ['AFTER-SALES','VIEW /service-tickets','GET','/api/service-tickets',null, [...A,AC,FIN,SAL,PM,VIEW]],
    ['AFTER-SALES','CREATE service ticket','POST','/api/service-tickets',{customerId:'CUST-1',projectId:'PRJ-1',issue:'x'}, [...A,FIN,PM]],
    ['AFTER-SALES','VIEW /service-visits (internal detail — narrower than warranty/ticket)','GET','/api/service-visits',null, [...A,AC,FIN,VIEW,PM]],
    ['AFTER-SALES','VIEW /amc-contracts','GET','/api/amc-contracts',null, [...A,AC,FIN,SAL,PM,VIEW]],
    ['AFTER-SALES','CREATE AMC contract','POST','/api/amc-contracts',{customerId:'CUST-1',startDate:'2026-09-01',endDate:'2027-08-31',contractValue:1000,serviceFrequencyMonths:3}, [...A,FIN,SAL]],
    ['AFTER-SALES','VIEW /capa (internal quality investigation — narrower than warranty/ticket)','GET','/api/capa',null, [...A,AC,FIN,VIEW,PM]],
    ['AFTER-SALES','CREATE CAPA case','POST','/api/capa',{trigger:'RepeatedFailure',problem:'x'}, [...A,FIN,PM]],
    ['AFTER-SALES','CREATE service invoice (non-chargeable fixture, expect domain 400 not 403 for authorized roles)','POST','/api/service-invoice',{ticketId:'TKT-9999',baseAmount:1}, [...A,AC,FIN,PUR,SAL,EST]],
    // Phase 14 — SAP-Style Accounting Entry Architecture
    ['ACCOUNTING','VIEW /branches (no gate by design)','GET','/api/branches',null, [...A,AC,FIN,PM,PUR,SAL,EST,VIEW]],
    ['ACCOUNTING','CREATE branch (masterData)','POST','/api/branches',{code:'MTX',name:'Matrix Test Branch'}, [...A]],
    ['ACCOUNTING','CREATE customer credit note (fixture 9999, expect domain 400 not 403 for authorized roles)','POST','/api/customer-credit-notes',{customerInvoiceEntryId:'JE-9999',amount:1,reason:'x'}, [...A,FIN,AC]],
    ['ACCOUNTING','CREATE customer debit note (fixture 9999, expect domain 400 not 403 for authorized roles)','POST','/api/customer-debit-notes',{customerInvoiceEntryId:'JE-9999',amount:1,reason:'x'}, [...A,FIN,AC]],
    ['ACCOUNTING','VIEW inventory-transfers','GET','/api/inventory-transfers',null, [...A,PUR,FIN,AC,VIEW]],
    ['ACCOUNTING','CREATE inventory-transfer (fixture, expect domain 400 not 403 for authorized roles)','POST','/api/inventory-transfers',{materialId:'MAT-1',qty:1,fromWarehouseId:'WH-1',toWarehouseId:'WH-2',reason:'x'}, [...A,PUR]],
    ['ACCOUNTING','VIEW inventory-adjustments','GET','/api/inventory-adjustments',null, [...A,PUR,FIN,AC,VIEW]],
    ['ACCOUNTING','CREATE inventory-adjustment (manager tier)','POST','/api/inventory-adjustments',{materialId:'MAT-1',qty:-1,warehouseId:'WH-1',reason:'x'}, [...A,FIN]],
    ['ACCOUNTING','UPLOAD attachment (create permission)','POST','/api/attachments',{entityType:'JournalDraft',entityId:jeDraft.draft.id,filename:'x.txt',base64Data:'dGVzdA=='}, [...A,AC,FIN,PUR,SAL,EST]],
    ['ACCOUNTING','CREATE journal-template (masterData)','POST','/api/journal-templates',{name:'Matrix Tmpl',lines:[{account:'5200',debit:1,credit:0},{account:'1000',debit:0,credit:1}]}, [...A]],
    ['ACCOUNTING','CREATE recurring-entry (masterData, fixture JT-9999, expect domain 400 not 403 for authorized roles)','POST','/api/recurring-entries',{templateId:'JT-9999',frequency:'Monthly',startDate:'2026-01-01',amount:1}, [...A]],
    ['ACCOUNTING','GENERATE due recurring drafts (create permission)','POST','/api/recurring-entries/generate-due',{asOfDate:'2026-01-01'}, [...A,AC,FIN,PUR,SAL,EST]],
    ['ACCOUNTING','IMPORT journal CSV (create permission)','POST','/api/import/journal-csv',{csvText:'Account,Debit,Credit\n1000,1,0\n4000,0,1',date:'2026-08-24'}, [...A,AC,FIN,PUR,SAL,EST]],
    ['ACCOUNTING','VIEW entry-type catalogue (GL-visible)','GET','/api/accounting/entry-types',null, [...A,AC,FIN,VIEW]],
    // Phase 15 — Gap Closure
    ['ACCOUNTING','VIEW /profit-centres (no gate by design)','GET','/api/profit-centres',null, [...A,AC,FIN,PM,PUR,SAL,EST,VIEW]],
    ['ACCOUNTING','CREATE profit-centre (masterData)','POST','/api/profit-centres',{code:'MTX',name:'Matrix Test PC'}, [...A]],
    ['ACCOUNTING','VIEW /bank-accounts (GL-visible)','GET','/api/bank-accounts',null, [...A,AC,FIN,VIEW]],
    ['ACCOUNTING','CREATE bank-account (masterData)','POST','/api/bank-accounts',{bankName:'Test Bank',accountName:'Test Acct'}, [...A]],
    ['ACCOUNTING','IMPORT bank statement (finance-tier, fixture, expect domain 400 not 403 for authorized roles)','POST','/api/bank-statement/import',{bankAccountId:'BANK-9999',csvText:'Date,Reference,Description,Amount,Type\n2026-08-25,X,x,1,Credit'}, [...A,FIN,AC]],
    ['ACCOUNTING','MATCH bank statement line (finance-tier, fixture, expect domain 400 not 403 for authorized roles)','POST','/api/bank-statement/BSL-9999/match',{entryId:'JE-9999'}, [...A,FIN,AC]],
    ['ACCOUNTING','UNMATCH bank statement line (manager-tier, stricter than match — fixture, expect domain 400 not 403)','POST','/api/bank-statement/BSL-9999/unmatch',null, [...A,FIN]],
    ['ACCOUNTING','VIEW /bank-reconciliation (GL-visible)','GET','/api/bank-reconciliation?bankAccountId=BANK-ICICI-1112',null, [...A,AC,FIN,VIEW]],
    ['ACCOUNTING','SET project branch (masterData, fixture, expect domain 400 not 403 for authorized roles)','POST','/api/projects/PRJ-9999/branch',{branchId:'BR-HO'}, [...A]],
    // Phase 17 — Backup/Restore (Admin/CEO only, the most destructive action in this Lab)
    ['ADMIN','VIEW backups list','GET','/api/admin/backups',null, [...A]],
    ['ADMIN','CREATE backup','POST','/api/admin/backup',{label:'matrix-test'}, [...A]],
    ['ADMIN','RESTORE backup (fixture, expect domain 400 not 403 for authorized roles)','POST','/api/admin/restore',{filename:'db.backup.nonexistent.json'}, [...A]],
    // Phase 18 §2 — Financial Period Control
    ['ACCOUNTING','VIEW /financial-periods (view permission, all roles)','GET','/api/financial-periods',null, [...A,AC,FIN,PM,PUR,SAL,EST,VIEW]],
    ['ACCOUNTING','CREATE financial-period (post+approve tier only)','POST','/api/financial-periods',{name:'Matrix Test Period',startDate:'2099-01-01',endDate:'2099-01-31'}, [...A,FIN]],
    ['ACCOUNTING','CLOSE financial-period (post+approve tier, fixture, expect domain 400 not 403 for authorized roles)','POST','/api/financial-periods/FP-9999/close',{reason:'matrix test'}, [...A,FIN]],
    ['ACCOUNTING','REOPEN financial-period (post+approve tier, fixture, expect domain 400 not 403 for authorized roles)','POST','/api/financial-periods/FP-9999/reopen',{reason:'matrix test'}, [...A,FIN]],
    ['ACCOUNTING','SET period override-role (CEO/Admin only, fixture, expect domain 400 not 403 for authorized roles)','POST','/api/financial-periods/FP-9999/override-role',{role:'CEO'}, [...A]],
    ['ACCOUNTING','VIEW period-close reconciliation (GL-visible, fixture, expect domain 400 not 403 for authorized roles)','GET','/api/financial-periods/FP-9999/reconciliation',null, [...A,AC,FIN,VIEW]],
    // Phase 19 — Fixed Assets
    ['ACCOUNTING','VIEW /fixed-assets (GL-visible)','GET','/api/fixed-assets',null, [...A,AC,FIN,VIEW]],
    ['ACCOUNTING','CREATE fixed-asset (create permission)','POST','/api/fixed-assets',{assetName:'Matrix Test Asset',purchaseDate:'2026-08-25',cost:1000}, [...A,AC,FIN,PUR,SAL,EST]],
    ['ACCOUNTING','CAPITALIZE fixed-asset (post permission, fixture, expect domain 400 not 403)','POST','/api/fixed-assets/FA-9999/capitalize',{capitalizationDate:'2026-08-25',fundingSource:'Bank',usefulLifeMonths:12,depreciationMethod:'StraightLine',residualValue:0}, [...A,FIN]],
    ['ACCOUNTING','DEPRECIATE fixed-asset (post permission, fixture, expect domain 400 not 403)','POST','/api/fixed-assets/FA-9999/depreciate',{periodDate:'2026-08-25'}, [...A,FIN]],
    ['ACCOUNTING','TRANSFER fixed-asset (edit permission, fixture, expect domain 400 not 403)','POST','/api/fixed-assets/FA-9999/transfer',{newLocation:'X',reason:'x'}, [...A,AC,FIN,PUR,SAL,EST]],
    ['ACCOUNTING','DISPOSE fixed-asset (post permission, fixture, expect domain 400 not 403)','POST','/api/fixed-assets/FA-9999/dispose',{disposalDate:'2026-08-25'}, [...A,FIN]],
    ['ACCOUNTING','VIEW fixed-asset reconciliation (GL-visible)','GET','/api/fixed-assets/reconciliation',null, [...A,AC,FIN,VIEW]],
    // Phase 19 — ICICI Bank Import
    ['ACCOUNTING','IMPORT bank statement ICICI (clear permission, fixture, expect domain 400 not 403)','POST','/api/bank-import/batches',{bankAccountId:'BANK-9999',csvText:'No,Transaction ID\n1,X'}, [...A,FIN,AC]],
    ['ACCOUNTING','VIEW bank-import lines (GL-visible)','GET','/api/bank-import/lines',null, [...A,AC,FIN,VIEW]],
    ['ACCOUNTING','MATCH bank-import line (clear permission, fixture, expect domain 400 not 403)','POST','/api/bank-import/lines/BIL-9999/match',{entryId:'JE-9999'}, [...A,FIN,AC]],
    ['ACCOUNTING','UNMATCH bank-import line (clear permission, fixture, expect domain 400 not 403)','POST','/api/bank-import/lines/BIL-9999/unmatch',null, [...A,FIN,AC]],
    ['ACCOUNTING','EXCLUDE bank-import line (clear permission, fixture, expect domain 400 not 403)','POST','/api/bank-import/lines/BIL-9999/exclude',{reason:'x'}, [...A,FIN,AC]],
    ['ACCOUNTING','MARK RETURNED bank-import line (clear permission, fixture, expect domain 400 not 403)','POST','/api/bank-import/lines/BIL-9999/mark-returned',null, [...A,FIN,AC]],
    ['ACCOUNTING','POST/ALLOCATE bank-import line (post permission, fixture, expect domain 400 not 403)','POST','/api/bank-import/lines/BIL-9999/post',{glAccount:'5000'}, [...A,FIN]],
    ['ACCOUNTING','RECONCILE bank-import line (clear permission, fixture, expect domain 400 not 403)','POST','/api/bank-import/lines/BIL-9999/reconcile',null, [...A,FIN,AC]],
    ['ACCOUNTING','VIEW bank-import reconciliation summary (GL-visible)','GET','/api/bank-import/reconciliation-summary?bankAccountId=BANK-ICICI-1112',null, [...A,AC,FIN,VIEW]],
    ['ACCOUNTING','VIEW bank-import batches (GL-visible)','GET','/api/bank-import/batches',null, [...A,AC,FIN,VIEW]],
    // Phase 19 — HSN / GSTIN / Payment Methods / Password
    ['ACCOUNTING','SET material HSN (masterData, fixture, expect domain 400 not 403)','POST','/api/materials/MAT-9999/hsn',{hsnCode:'1234'}, [...A]],
    ['ACCOUNTING','SET customer GSTIN (masterData, fixture, expect domain 400 not 403)','POST','/api/customers/CUST-9999/gstin',{gstin:'X'}, [...A]],
    ['ACCOUNTING','VIEW payment-methods (no gate by design)','GET','/api/payment-methods',null, [...A,AC,FIN,PM,PUR,SAL,EST,VIEW]],
    ['ADMIN','CREATE user (masterData)','POST','/api/admin/users',{username:'matrixtestuser',role:'Viewer',password:'MatrixTest1!'}, [...A]],
    ['ADMIN','RESET user password (masterData, fixture, expect domain 400 not 403)','POST','/api/admin/users/U-9999/reset-password',{newPassword:'NewPass1!'}, [...A]],
    // Phase 20 — Master Data Import Framework
    ['ACCOUNTING','IMPORT master data (masterData, fixture, expect domain 400 not 403)','POST','/api/master-import',{importType:'Customers',csvText:'name\nMatrixTestCust'}, [...A]],
    ['ACCOUNTING','VIEW master-import types (masterData)','GET','/api/master-import/types',null, [...A]],
    ['ACCOUNTING','VIEW master-import batch history (masterData)','GET','/api/master-import/batches',null, [...A]],
    ['ACCOUNTING','CREATE vendor master (masterData, fixture, expect domain 400 not 403)','POST','/api/masters/vendor',{name:'Matrix Test Vendor Unique1'}, [...A]],
    ['ACCOUNTING','CREATE material master (masterData, fixture, expect domain 400 not 403)','POST','/api/masters/material',{code:'MTXITEM1',description:'x',uom:'pc'}, [...A]],
    ['ACCOUNTING','CREATE project master (masterData, fixture, expect domain 400 not 403)','POST','/api/masters/project',{name:'Matrix Test Project'}, [...A]],
    ['ACCOUNTING','CREATE cost centre master (masterData, fixture, expect domain 400 not 403)','POST','/api/masters/cost-centre',{id:'MTXCC1',name:'x'}, [...A]],
    ['ACCOUNTING','CREATE tax code master (masterData, fixture, expect domain 400 not 403)','POST','/api/masters/tax-code',{code:'MTXTAX1',label:'x'}, [...A]],
    ['ACCOUNTING','CREATE payment method master (masterData, fixture, expect domain 400 not 403)','POST','/api/masters/payment-method',{code:'MTXPM1',name:'x'}, [...A]],
    ['ACCOUNTING','CREATE GL account master (masterData, fixture, expect domain 400 not 403)','POST','/api/masters/account',{accountCode:'MTX9001',accountName:'x',accountType:'Asset'}, [...A]],
    // Phase 20 — Opening Balance Engine
    ['ACCOUNTING','IMPORT opening balance (masterData, fixture, expect domain 400 not 403)','POST','/api/opening-balance/import',{type:'OpeningAR',csvText:'customerId\nCUST-9999'}, [...A]],
    ['ACCOUNTING','VIEW opening-balance types (masterData)','GET','/api/opening-balance/types',null, [...A]],
    ['ACCOUNTING','VIEW opening-balance batches (GL-visible)','GET','/api/opening-balance/batches',null, [...A,AC,FIN,VIEW]],
    ['ACCOUNTING','POST opening-balance draft (post permission, fixture, expect domain 400 not 403)','POST','/api/opening-balance/drafts/DRAFT-9999/post',null, [...A,FIN]],
    ['ACCOUNTING','VIEW opening-balance reconciliation (GL-visible)','GET','/api/opening-balance/reconciliation',null, [...A,AC,FIN,VIEW]],
  ];

  for(const [module, action, method, path, body, allowedUsers] of cases){
    for(const u of ROLES){
      const r = await api(u, method, path, body);
      const actualAllowed = r.status !== 403;
      const expectedAllowed = allowedUsers.includes(u);
      record(module, action, path, ROLE_NAME[u], expectedAllowed, actualAllowed, r.status, expectedAllowed!==actualAllowed ? ('got '+r.status+': '+(r.error||'')) : '');
    }
  }

  const fails = rows.filter(r=>!r.pass);
  console.log('\n================ PHASE 9B SECURITY MATRIX ================\n');
  console.log(`Total cells: ${rows.length}  |  PASS: ${rows.length-fails.length}  |  FAIL: ${fails.length}\n`);
  if(fails.length){
    console.log('--- MISMATCHES (expected vs actual authorization) ---');
    fails.forEach(f=>console.log(`❌ [${f.module}] ${f.action} — role=${f.role} expected=${f.expected} actual=${f.actual} (${f.note})`));
  }
  require('fs').writeFileSync(require('path').join(__dirname,'security_matrix_results.json'), JSON.stringify(rows, null, 2));
  console.log('\nFull matrix written to security_matrix_results.json ('+rows.length+' rows)');
  console.log('\n============================================================\n');
  if(fails.length) process.exit(1);
}
main().catch(e=>{ console.error('MATRIX ERROR:', e); process.exit(2); });
