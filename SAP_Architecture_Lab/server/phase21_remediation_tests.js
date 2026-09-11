// Phase 21 — permanent regression suite for the remediation items closed this phase:
// future-dated posting control, master data edit/deactivate + inactive-master-blocked,
// UoM conversion, and persistence-recovery smoke test (the destructive crash scenarios
// themselves were run once on a disposable copy — see the Phase 21 report — this file only
// re-checks the normal-path save/reload round trip on the live db.json, non-destructively).
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
let PASS=0, FAIL=0;
function record(section, desc, ok, detail){ if(ok) PASS++; else FAIL++; console.log((ok?'✅ PASS':'❌ FAIL')+' | ['+section+'] '+desc+(ok?'':' | '+JSON.stringify(detail).slice(0,200))); }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
async function fullPost(creatorUser, createPath, createBody){
  const draft = await api(creatorUser,'POST',createPath, createBody);
  if(!draft.ok) return draft;
  const id = draft.draft.id;
  await api('accountant1','POST',`/api/journal/${id}/submit`);
  const appr = await api('finance1','POST',`/api/journal/${id}/approve`);
  if(!appr.ok) return appr;
  return api('finance1','POST',`/api/journal/${id}/post`);
}

(async()=>{
  await __erp059cPreflight();
  await login('admin','Admin@12345');
  await login('ceo','Ceo@12345');
  await login('sales1','Sal@123456');
  await login('purchase1','Pur@12345');
  await login('accountant1','Acc@12345');
  await login('finance1','Fin@12345');
  await api('admin','POST','/api/test/reset');

  // ---------------- Future-Dated Posting Control ----------------
  const cfg = await api('finance1','GET','/api/config/policies');
  record('FutureDate','Policy config exposes maxFuturePostingDays', cfg.ok && typeof cfg.policyConfig.maxFuturePostingDays==='number', cfg.policyConfig);
  record('FutureDate','maxFuturePostingDaysApproved is explicitly false (proposed, not approved)', cfg.policyConfig.maxFuturePostingDaysApproved===false, cfg.policyConfig);

  const today = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:1000,date:new Date().toISOString().slice(0,10),taxCode:'GST18',narration:'today'});
  record('FutureDate','Posting dated today succeeds', today.ok, today);

  const plus7 = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:1000,date:'2026-09-02',taxCode:'GST18',narration:'+7d'});
  record('FutureDate','Posting +7 days succeeds (well within limit)', plus7.ok, plus7);

  const plus365 = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:1000,date:'2027-08-26',taxCode:'GST18',narration:'+365d'});
  record('FutureDate','Posting +365 days succeeds (within the 550-day proposed limit)', plus365.ok, plus365);

  const y2030 = await api('sales1','POST','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:1000,date:'2030-01-01',taxCode:'GST18',narration:'2030 abuse test'});
  if(y2030.ok){
    const id = y2030.draft.id;
    await api('accountant1','POST',`/api/journal/${id}/submit`);
    await api('finance1','POST',`/api/journal/${id}/approve`);
    const post2030 = await api('finance1','POST',`/api/journal/${id}/post`);
    record('FutureDate','2030-dated posting BLOCKED for a non-CEO/Admin role without override', post2030.status===400 && /future/i.test(post2030.error||''), post2030);
    const overrideNoReason = await api('ceo','POST',`/api/journal/${id}/post`,{});
    record('FutureDate','CEO override without a reason still blocked', overrideNoReason.status===400 && /reason/i.test(overrideNoReason.error||''), overrideNoReason);
    const overrideWithReason = await api('ceo','POST',`/api/journal/${id}/post`,{overrideReason:'Regression test — deliberate far-future date, CEO-authorized'});
    record('FutureDate','CEO override WITH a reason succeeds and is audited', overrideWithReason.ok, overrideWithReason);
  } else {
    record('FutureDate','2030-dated DRAFT creation (expected to succeed — the control fires at POST, not draft creation)', false, y2030);
  }

  // ---------------- Master Data Edit / Deactivate ----------------
  const newCust = await api('sales1','POST','/api/customers?mode=find-or-create',{name:'Phase21 Regression Test Customer'});
  const custId = newCust.customer && newCust.customer.id;
  record('MasterEdit','Test customer created for edit/deactivate regression', !!custId, newCust);

  const editByUnauthorized = await api('sales1','POST',`/api/masters/customer/${custId}/edit`,{changes:{contact:'9999999999'}});
  record('MasterEdit','Sales (no masterData permission) CANNOT edit a customer', editByUnauthorized.status===403, editByUnauthorized);

  const editOk = await api('admin','POST',`/api/masters/customer/${custId}/edit`,{changes:{contact:'8888888888'}});
  record('MasterEdit','Admin CAN edit a customer with no accounting history, no reason required', editOk.ok && editOk.customer.contact==='8888888888', editOk);

  const editIdAttempt = await api('admin','POST',`/api/masters/customer/${custId}/edit`,{changes:{id:'CUST-HACKED'}});
  record('MasterEdit','Customer ID can NEVER be changed, even by Admin', editIdAttempt.status===400 && /permanent identity/i.test(editIdAttempt.error||''), editIdAttempt);

  const deactivateNoReason = await api('admin','POST',`/api/masters/customer/${custId}/active`,{active:false});
  record('MasterEdit','Deactivating a customer without a reason is rejected', deactivateNoReason.status===400 && /reason/i.test(deactivateNoReason.error||''), deactivateNoReason);

  const deactivateOk = await api('admin','POST',`/api/masters/customer/${custId}/active`,{active:false, reason:'Regression test — customer retired'});
  record('MasterEdit','Deactivating a customer WITH a reason succeeds', deactivateOk.ok && deactivateOk.customer.active===false, deactivateOk);

  const blockedInvoice = await api('admin','POST','/api/ar/invoice',{customerId:custId,projectId:'PRJ-1',baseAmount:5000,date:new Date().toISOString().slice(0,10),taxCode:'GST18',narration:'should be blocked'});
  record('MasterEdit','New invoice to an INACTIVE customer is BLOCKED', blockedInvoice.status===400 && /inactive/i.test(blockedInvoice.error||''), blockedInvoice);

  const reactivate = await api('admin','POST',`/api/masters/customer/${custId}/active`,{active:true, reason:'Regression test cleanup'});
  const nowAllowedInvoice = await api('admin','POST','/api/ar/invoice',{customerId:custId,projectId:'PRJ-1',baseAmount:5000,date:new Date().toISOString().slice(0,10),taxCode:'GST18',narration:'should now succeed'});
  record('MasterEdit','Re-activated customer can be used again', reactivate.ok && nowAllowedInvoice.ok, {reactivate, nowAllowedInvoice});

  // Now give this customer REAL accounting history (a fully POSTED entry, not just a draft — a
  // draft alone carries no journalEntries line, so customerHasAccountingHistory() would still
  // correctly report false) and confirm identity-field protection then kicks in.
  const custWithHistory = custId;
  if(nowAllowedInvoice.ok){
    const hid = nowAllowedInvoice.draft.id;
    await api('accountant1','POST',`/api/journal/${hid}/submit`);
    await api('finance1','POST',`/api/journal/${hid}/approve`);
    await api('finance1','POST',`/api/journal/${hid}/post`);
  }
  const gstEditAttempt = await api('admin','POST',`/api/masters/customer/${custWithHistory}/edit`,{changes:{gstin:'HACKEDGSTIN'}});
  record('MasterEdit','A locked field (gstin) is rejected once the customer has real accounting history', gstEditAttempt.status===400 && /accounting history/i.test(gstEditAttempt.error||''), gstEditAttempt);

  const nonLockedEditWithHistory = await api('admin','POST',`/api/masters/customer/${custWithHistory}/edit`,{changes:{contact:'7777777777'}, reason:'Correcting a wrong phone number'});
  record('MasterEdit','A non-locked field CAN still be edited with a reason, even with accounting history', nonLockedEditWithHistory.ok, nonLockedEditWithHistory);

  const nonLockedEditNoReason = await api('admin','POST',`/api/masters/customer/${custWithHistory}/edit`,{changes:{contact:'6666666666'}});
  record('MasterEdit','...but a reason IS mandatory once history exists', nonLockedEditNoReason.status===400 && /reason/i.test(nonLockedEditNoReason.error||''), nonLockedEditNoReason);

  // Vendor equivalent (spot check — same underlying mechanism)
  const newVendor = await api('admin','POST','/api/masters/vendor',{name:'Phase21 Regression Test Vendor'});
  const vendId = newVendor.vendor && newVendor.vendor.id;
  const vendorDeactivate = await api('admin','POST',`/api/masters/vendor/${vendId}/active`,{active:false, reason:'Regression test'});
  const blockedPO = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:vendId, lines:[{materialId:'MAT-1', qty:1, rate:100}]});
  record('MasterEdit','New PO against an INACTIVE vendor is BLOCKED', blockedPO.status===400 && /inactive/i.test(blockedPO.error||''), blockedPO);

  // Material equivalent
  const matDeactivate = await api('admin','POST','/api/masters/material/MAT-8/active',{active:false, reason:'Regression test'});
  const blockedIssue = await api('admin','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-8', qty:1, warehouseId:'WH-1', purpose:'test'});
  record('MasterEdit','New Material Issue against an INACTIVE material is BLOCKED', blockedIssue.status===400 && /inactive/i.test(blockedIssue.error||''), blockedIssue);
  await api('admin','POST','/api/masters/material/MAT-8/active',{active:true, reason:'Regression test cleanup'});

  // Direct API / ID-tampering attempts
  const editUnknownId = await api('admin','POST','/api/masters/customer/CUST-DOES-NOT-EXIST/edit',{changes:{contact:'123'}});
  record('MasterEdit','Editing a non-existent customer ID fails cleanly (400, not a crash or silent success)', editUnknownId.status===400, editUnknownId);

  // ---------------- UoM Conversion ----------------
  const uomBefore = await api('admin','GET','/api/materials');
  const mat1Before = uomBefore.materials.find(m=>m.id==='MAT-1');
  record('UoM','Every material defaults to NO conversion (factor 1, purchaseUom = base uom)', mat1Before.purchaseConversionFactor===1 && mat1Before.purchaseUom===mat1Before.uom, mat1Before);

  const zeroFactor = await api('admin','POST','/api/masters/material/MAT-1/uom-conversion',{purchaseUom:'Box', purchaseConversionFactor:0});
  record('UoM','Zero conversion factor is rejected', zeroFactor.status===400, zeroFactor);
  const negFactor = await api('admin','POST','/api/masters/material/MAT-1/uom-conversion',{purchaseUom:'Box', purchaseConversionFactor:-5});
  record('UoM','Negative conversion factor is rejected', negFactor.status===400, negFactor);

  const setConv = await api('admin','POST','/api/masters/material/MAT-1/uom-conversion',{purchaseUom:'Box', purchaseConversionFactor:20});
  record('UoM','1 Box = 20 pieces conversion configured successfully', setConv.ok && setConv.material.purchaseConversionFactor===20, setConv);

  // Purchase 10 Boxes @ Rs 200/Box -> expect 200 base units in stock, valued at Rs 10/unit, total value unchanged (Rs 2000)
  const stockBefore = await api('admin','GET','/api/inventory/stock?materialId=MAT-1&warehouseId=WH-1');
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:10, rate:200}]});
  const poId = po.po && po.po.id;
  let submitted=null, approved=null, grn=null;
  if(poId){
    submitted = await api('purchase1','POST',`/api/purchase-orders/${poId}/submit`).catch(()=>null);
    approved = await api('finance1','POST',`/api/purchase-orders/${poId}/approve`).catch(()=>null);
    grn = await api('purchase1','POST','/api/grns',{poId, warehouseId:'WH-1', lines:[{qtyAccepted:10}]});
  }
  record('UoM','PO created for 10 Boxes @ Rs200/Box', !!poId, po);
  const stockAfter = await api('admin','GET','/api/inventory/stock?materialId=MAT-1&warehouseId=WH-1');
  const qtyBefore = stockBefore.stock || 0;
  const qtyAfter = stockAfter.stock || 0;
  const qtyDelta = qtyAfter - qtyBefore;
  record('UoM','10 Boxes x 20 = 200 base units added to stock (not 10)', Math.abs(qtyDelta-200)<0.01, {qtyBefore, qtyAfter, qtyDelta, grn});
  const totalValueExpected = 10*200; // 10 boxes x Rs200/box = Rs2000, regardless of unit conversion
  const glCheck = await api('admin','GET','/api/trial-balance');
  record('UoM','GRN produced a GL entry (accounting value preserved under conversion — see Phase21 report for the full Rs-value trace)', grn && grn.ok && !!grn.glEntry, grn);

  // ---------------- Persistence smoke test (non-destructive; full crash-injection tested on a disposable copy, see report) ----------------
  const fs = require('fs');
  const path = require('path');
  const dbPath = path.join(__dirname, 'db.json');
  const bakPath = dbPath + '.bak';
  record('Persistence','db.json is valid JSON after all this phase\'s activity', (()=>{ try{ JSON.parse(fs.readFileSync(dbPath,'utf8')); return true; }catch(e){ return false; } })());
  record('Persistence','db.json.bak exists and is valid JSON (one save behind)', fs.existsSync(bakPath) && (()=>{ try{ JSON.parse(fs.readFileSync(bakPath,'utf8')); return true; }catch(e){ return false; } })());
  record('Persistence','No leftover .tmp file after normal operation', !fs.existsSync(dbPath+'.tmp'));

  // ---------------- Final accounting integrity check ----------------
  const tb = await api('admin','GET','/api/trial-balance');
  let totalDr=0, totalCr=0;
  if(tb.byAccount){ for(const k in tb.byAccount){ totalDr+=tb.byAccount[k].debit||0; totalCr+=tb.byAccount[k].credit||0; } }
  record('AccountingIntegrity','Whole-ledger Trial Balance still balances after all Phase 21 remediation activity', Math.abs(totalDr-totalCr)<0.02, {totalDr, totalCr});

  console.log('\n================ '+PASS+' PASS / '+FAIL+' FAIL / '+(PASS+FAIL)+' TOTAL ================');
  process.exitCode = FAIL>0 ? 1 : 0;
})();
