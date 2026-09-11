'use strict';
// Phase 16 §12 — Final controlled volume top-up. Reuses the existing real projects/customers/
// vendors already created by after_sales_volume.js + procurement_volume.js + site_volume.js
// (no new fake projects/customers invented) and adds more TRANSACTIONS against them to close the
// gap toward the 200/100 targets for the transaction-heavy categories that fell short.
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
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345');
  await login('purchase1','Pur@12345');
  await login('finance1','Fin@12345');
  await login('accountant1','Acc@12345');

  const projs = await api('admin','GET','/api/projects');
  const custs = await api('admin','GET','/api/customers');
  const vends = await api('admin','GET','/api/vendors');
  const mats = await api('admin','GET','/api/materials');
  const realProjects = projs.projects.filter(p=>p.id.startsWith('PRJ-0')).slice(0,120); // the 100+ real generated projects
  const realCustomers = custs.customers.filter(c=>c.id.startsWith('CUST-0')).slice(0,120);

  let poCount=0, grnCount=0, billCount=0, payCount=0, custInvCount=0, rcptCount=0, issueCount=0, amcCount=0, errors=0;

  // Supplier side: PO -> GRN -> Bill -> Payment, targeting +150 to close the SupplierInvoice/Payment gap
  for(let i=0;i<150;i++){
    const proj = realProjects[i % realProjects.length];
    const vend = vends.vendors[i % vends.vendors.length];
    const mat = mats.materials[i % mats.materials.length];
    const qty = 2 + (i%5);
    const rate = 500 + (i%20)*37;
    const po = await api('purchase1','POST','/api/purchase-orders',{projectId:proj.id, vendorId:vend.id, lines:[{materialId:mat.id, qty, rate, uom:mat.uom||'pc'}]});
    if(!po.ok){ errors++; continue; } poCount++;
    await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
    const approved = await api('admin','POST',`/api/purchase-orders/${po.po.id}/approve`);
    const grn = await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId: i%2===0?'WH-1':'WH-2', lines:[{qtyAccepted:qty, qtyRejected:0, uom:mat.uom||'pc'}]});
    if(!grn.ok){ errors++; continue; } grnCount++;
    const bill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po.id, grnId:grn.grn.id, invoiceLines:[{qty, rate}], date:'2026-08-25'});
    if(!bill.ok){ errors++; continue; }
    await api('accountant1','POST',`/api/journal/${bill.draft.id}/submit`);
    await api('finance1','POST',`/api/journal/${bill.draft.id}/approve`);
    const posted = await api('finance1','POST',`/api/journal/${bill.draft.id}/post`);
    if(!posted.ok){ errors++; continue; } billCount++;
    if(i%3!==0){ // pay ~2/3 of them, leaving some genuinely open (realistic AP ageing)
      const pay = await api('finance1','POST','/api/ap/payment',{vendorId:vend.id, invoiceEntryId:posted.entry.id, amount:qty*rate, date:'2026-08-25'});
      if(pay.ok) payCount++; else errors++;
    }
    if(i%10===0){ // material issue against a subset, to close the Material Issue gap
      const issue = await api('admin','POST','/api/material-issues',{projectId:proj.id, materialId:mat.id, qty:1, warehouseId: i%2===0?'WH-1':'WH-2', purpose:'Volume top-up'});
      if(issue.ok) issueCount++;
    }
  }

  // Customer side: Invoice -> Receipt, targeting +100 to close the CustomerInvoice/Receipt gap
  for(let i=0;i<100;i++){
    const proj = realProjects[i % realProjects.length];
    const cust = realCustomers[i % realCustomers.length];
    const amount = 3000 + (i%15)*211;
    const inv = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', docCategory:'CustomerInvoice', party:cust.id, projectId:proj.id, narration:'Volume top-up invoice',
      lines:[{account:'1100',debit:amount,credit:0,customerId:cust.id,projectId:proj.id},{account:'4000',debit:0,credit:amount,customerId:cust.id,projectId:proj.id}]});
    if(!inv.ok){ errors++; continue; }
    await api('accountant1','POST',`/api/journal/${inv.draft.id}/submit`);
    await api('finance1','POST',`/api/journal/${inv.draft.id}/approve`);
    const posted = await api('finance1','POST',`/api/journal/${inv.draft.id}/post`);
    if(!posted.ok){ errors++; continue; } custInvCount++;
    if(i%3!==0){
      const rcpt = await api('finance1','POST','/api/ar/receipt',{customerId:cust.id, invoiceEntryId:posted.entry.id, amount, date:'2026-08-25'});
      if(rcpt.ok) rcptCount++; else errors++;
    }
  }

  // AMC: +50 to close the gap toward 100
  for(let i=0;i<50;i++){
    const proj = realProjects[i % realProjects.length];
    const cust = realCustomers[i % realCustomers.length];
    const amc = await api('finance1','POST','/api/amc-contracts',{customerId:cust.id, projectId:proj.id, startDate:'2026-01-01', endDate:'2026-12-31', contractValue:60000+(i%10)*5000, serviceFrequencyMonths:3});
    if(amc.ok) amcCount++; else errors++;
  }

  const recon = await api('admin','GET','/api/reconciliation');
  const tb = await api('admin','GET','/api/trial-balance');
  let totD=0, totC=0; Object.values(tb.byAccount).forEach(a=>{totD+=a.debit;totC+=a.credit;});

  console.log(JSON.stringify({
    poCreated:poCount, grnCreated:grnCount, supplierBillsPosted:billCount, supplierPaymentsPosted:payCount,
    customerInvoicesPosted:custInvCount, customerReceiptsPosted:rcptCount, materialIssues:issueCount, amcContractsCreated:amcCount,
    errors, arReconciles:recon.ar.matches, apReconciles:recon.ap.matches, trialBalanceDebit:totD, trialBalanceCredit:totC, glBalanced: Math.abs(totD-totC)<0.02
  }, null, 2));
}
main().catch(e=>{ console.error('TOPUP ERROR:', e); process.exit(2); });
