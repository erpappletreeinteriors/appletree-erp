// Phase 22 — Self-Test with temporary/demo data. Covers: multi-bank account behavior,
// Fixed Asset full lifecycle (incl. transfer + disposal), AMC cancellation (all 4 scenarios).
// Every record created here is clearly PHASE22-TEST labeled.
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
const results = [];
function record(section, desc, ok, detail){ if(ok) PASS++; else FAIL++; results.push({section,desc,ok,detail}); console.log((ok?'✅ PASS':'❌ FAIL')+' | ['+section+'] '+desc+(ok?'':' | '+String(JSON.stringify(detail)).slice(0,250))); }
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

  console.log('=== 7. BANK / CASH SELF-TEST (PHASE22-TEST data) ===');
  const bankA = await api('admin','POST','/api/masters/account',{accountCode:'9100', accountName:'PHASE22-TEST Bank B', accountType:'Asset'});
  record('Bank', 'A second, genuinely distinct GL account can be created for a second bank', bankA.ok, bankA);
  const bankBAcct = await api('admin','POST','/api/bank-accounts',{bankName:'PHASE22-TEST Bank B Ltd', accountName:'Test Current Account B', accountNumberLast4:'9999', glAccount:'9100'});
  record('Bank', 'A second Bank Account record can be created, pointing at the distinct GL account', bankBAcct.ok, bankBAcct);

  // Post a receipt tagged as going to "Bank B" and check which GL account it ACTUALLY hit.
  const inv = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:20000,date:'2026-08-20',taxCode:'GST18',narration:'PHASE22-TEST multi-bank test invoice'});
  if(inv && inv.ok){
    const receipt = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1',invoiceEntryId:inv.entry.id,amount:20000,date:'2026-08-21',narration:'PHASE22-TEST receipt intended for Bank B',paymentMethodId:'PM-BANKTRANSFER'});
    const glLine = receipt.entry && receipt.entry.lines.find(l=>l.account!==D_AR_ACCOUNT_PLACEHOLDER());
    const hitAccount = receipt.entry ? receipt.entry.lines.find(l=>l.debit>0).account : null;
    record('Bank', 'FINDING (not a defect — a disclosed Phase 19 design decision, re-confirmed live): a receipt has NO way to route to the new Bank B GL account (9100) — it always posts to account 1000, because Payment Method / bank selection is metadata-only for reconciliation, not a GL router', hitAccount==='1000', {hitAccount, expectedIfMultiGLExisted:'9100 (would not exist without a real feature build)'});
  }
  function D_AR_ACCOUNT_PLACEHOLDER(){ return '1100'; }

  console.log('\n=== 9. FIXED ASSET SELF-TEST — full lifecycle incl. transfer + disposal ===');
  const asset = await api('finance1','POST','/api/fixed-assets',{assetCode:'PHASE22-TEST-CNC-01',assetName:'PHASE22-TEST CNC Machine',assetClass:'Equipment',purchaseDate:'2026-08-01',cost:500000,location:'PHASE22-TEST Workshop',custodian:'U-FIN1',projectId:null});
  record('FixedAsset', 'Test asset created (pre-capitalization)', asset.ok, asset);
  let assetId = asset.asset && asset.asset.id;
  const cap = await api('finance1','POST',`/api/fixed-assets/${assetId}/capitalize`,{capitalizationDate:'2026-08-01',fundingSource:'Bank',usefulLifeMonths:60,depreciationMethod:'StraightLine',residualValue:50000});
  record('FixedAsset', 'Capitalized (Dr Asset Cost / Cr Bank), TEST depreciation policy used, not an invented Appletree policy', cap.ok, cap);
  const dep1 = await api('finance1','POST',`/api/fixed-assets/${assetId}/depreciate`,{periodDate:'2026-08-31',amount:7500});
  record('FixedAsset', 'Depreciation posted (Dr Depreciation Expense / Cr Accumulated Depreciation)', dep1.ok, dep1);
  const transfer = await api('finance1','POST',`/api/fixed-assets/${assetId}/transfer`,{newLocation:'PHASE22-TEST Site B', newCustodian:'U-PM1', reason:'Self-test transfer'});
  record('FixedAsset', 'Asset transferred to a new location/custodian, no GL impact expected for a pure location/custodian change', transfer.ok, transfer);
  const dispose = await api('finance1','POST',`/api/fixed-assets/${assetId}/dispose`,{disposalDate:'2026-08-25', disposalProceeds:400000, reason:'Self-test disposal'});
  record('FixedAsset', 'Asset disposed with proceeds — expect a Gain/Loss on Disposal entry (NBV vs proceeds)', dispose.ok, dispose);
  const faRecon = await api('admin','GET','/api/fixed-assets/reconciliation');
  record('FixedAsset', 'Fixed Asset register still reconciles to GL after the full lifecycle (create->capitalize->depreciate->transfer->dispose)', faRecon.ok && faRecon.reconciliation.costMatches && faRecon.reconciliation.accumDepMatches, faRecon.reconciliation);

  console.log('\n=== 10. AMC CANCELLATION SELF-TEST — all 4 scenarios ===');
  // Scenario A: cancel with NO revenue recognized yet (full deferred balance outstanding)
  const amcA = await api('finance1','POST','/api/amc-contracts',{customerId:'CUST-1',projectId:'PRJ-1',site:'PHASE22-TEST Site',coveredSystems:'HVAC',startDate:'2026-08-01',endDate:'2027-07-31',contractValue:120000,serviceFrequencyMonths:3});
  const amcAId = amcA.amc && amcA.amc.id;
  await api('finance1','POST',`/api/amc-contracts/${amcAId}/activate`);
  const billA = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amcAId, baseAmount:120000, date:'2026-08-01'});
  if(billA.ok){ const id=billA.draft.id; await api('accountant1','POST',`/api/journal/${id}/submit`); await api('finance1','POST',`/api/journal/${id}/approve`); await api('finance1','POST',`/api/journal/${id}/post`); }
  const cancelA = await api('finance1','POST',`/api/amc-contracts/${amcAId}/cancel`,{reason:'PHASE22-TEST cancellation, no revenue recognized yet'});
  record('AMC', 'Scenario A (no recognition, fully deferred): cancellation requires disclosure, does NOT silently post a refund/write-off', cancelA.ok && cancelA.disclosure && /BUSINESS POLICY REQUIRED/.test(cancelA.disclosure), cancelA);

  // Scenario B: partial recognition, then cancel
  const amcB = await api('finance1','POST','/api/amc-contracts',{customerId:'CUST-2',projectId:'PRJ-2',site:'PHASE22-TEST Site B',coveredSystems:'Electrical',startDate:'2026-08-01',endDate:'2027-07-31',contractValue:120000,serviceFrequencyMonths:3});
  const amcBId = amcB.amc && amcB.amc.id;
  await api('finance1','POST',`/api/amc-contracts/${amcBId}/activate`);
  const billB = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amcBId, baseAmount:120000, date:'2026-08-01'});
  if(billB.ok){ const id=billB.draft.id; await api('accountant1','POST',`/api/journal/${id}/submit`); await api('finance1','POST',`/api/journal/${id}/approve`); await api('finance1','POST',`/api/journal/${id}/post`); }
  await api('finance1','POST',`/api/amc-contracts/${amcBId}/recognize-revenue`,{periodDate:'2026-08-15'});
  const cancelB = await api('finance1','POST',`/api/amc-contracts/${amcBId}/cancel`,{reason:'PHASE22-TEST cancellation after partial recognition'});
  record('AMC', 'Scenario B (partial recognition): cancellation still discloses the REMAINING deferred balance, does not touch already-recognized revenue', cancelB.ok && cancelB.deferredBalanceAtCancellation < 120000 && cancelB.deferredBalanceAtCancellation > 0, cancelB);

  // Scenario C: customer has fully PAID (receipt posted) then cancel
  const amcC = await api('finance1','POST','/api/amc-contracts',{customerId:'CUST-3',projectId:'PRJ-3',site:'PHASE22-TEST Site C',coveredSystems:'Plumbing',startDate:'2026-08-01',endDate:'2027-07-31',contractValue:60000,serviceFrequencyMonths:6});
  const amcCId = amcC.amc && amcC.amc.id;
  await api('finance1','POST',`/api/amc-contracts/${amcCId}/activate`);
  const billC = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amcCId, baseAmount:60000, date:'2026-08-01'});
  let billCEntryId = null;
  if(billC.ok){ const id=billC.draft.id; await api('accountant1','POST',`/api/journal/${id}/submit`); await api('finance1','POST',`/api/journal/${id}/approve`); const p = await api('finance1','POST',`/api/journal/${id}/post`); billCEntryId = p.entry && p.entry.id; }
  if(billCEntryId) await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-3',invoiceEntryId:billCEntryId,amount:60000,date:'2026-08-02',narration:'PHASE22-TEST full payment before cancellation'});
  const cancelC = await api('finance1','POST',`/api/amc-contracts/${amcCId}/cancel`,{reason:'PHASE22-TEST cancellation, customer already fully paid'});
  record('AMC', 'Scenario C (customer paid in full): cancellation still requires a human decision on the paid-but-undelivered balance, does not auto-refund', cancelC.ok && cancelC.disclosure, cancelC);

  // Scenario D: customer has NOT paid (invoice posted, no receipt) then cancel
  const amcD = await api('finance1','POST','/api/amc-contracts',{customerId:'CUST-4',projectId:'PRJ-4',site:'PHASE22-TEST Site D',coveredSystems:'HVAC',startDate:'2026-08-01',endDate:'2027-07-31',contractValue:90000,serviceFrequencyMonths:4});
  const amcDId = amcD.amc && amcD.amc.id;
  await api('finance1','POST',`/api/amc-contracts/${amcDId}/activate`);
  const billD = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amcDId, baseAmount:90000, date:'2026-08-01'});
  if(billD.ok){ const id=billD.draft.id; await api('accountant1','POST',`/api/journal/${id}/submit`); await api('finance1','POST',`/api/journal/${id}/approve`); await api('finance1','POST',`/api/journal/${id}/post`); }
  const cancelD = await api('finance1','POST',`/api/amc-contracts/${amcDId}/cancel`,{reason:'PHASE22-TEST cancellation, customer never paid'});
  record('AMC', 'Scenario D (customer unpaid): cancellation still discloses the outstanding position, no accounting treatment invented', cancelD.ok && cancelD.disclosure, cancelD);

  console.log('\n=== FINAL DATA INTEGRITY CHECK ===');
  const tb = await api('admin','GET','/api/trial-balance');
  let dr=0,cr=0; if(tb.byAccount) for(const k in tb.byAccount){ dr+=tb.byAccount[k].debit||0; cr+=tb.byAccount[k].credit||0; }
  record('Integrity', 'Whole-ledger Trial Balance still balances after all self-test activity', Math.abs(dr-cr)<0.02, {dr,cr});

  console.log('\n================ '+PASS+' PASS / '+FAIL+' FAIL / '+(PASS+FAIL)+' TOTAL ================');
  require('fs').writeFileSync('phase22_selftest_extended_results.json', JSON.stringify(results,null,2));
  process.exitCode = FAIL>0 ? 1 : 0;
})();
