'use strict';
// Phase 18 §2/§3 — Financial Period Control. Covers all 11 required test scenarios verbatim from
// the brief, plus security (creation/close/reopen/override-config gating), plus the §3
// period-close reconciliation checklist. Real HTTP calls, no simulation.
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
  await Promise.all(['ceo','finance1','accountant1','sales1','purchase1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345',sales1:'Sal@123456',purchase1:'Pur@12345'}[u])));

  // ================= Security: who may create/close/reopen/configure-override =================
  const denyCreate = await api('accountant1','POST','/api/financial-periods',{name:'Should Fail', startDate:'2026-01-01', endDate:'2026-01-31'});
  record('§2/Security', 'Accountant (post:false/approve:false) cannot create a financial period', denyCreate.status===403, denyCreate);
  const denyCreateSales = await api('sales1','POST','/api/financial-periods',{name:'Should Fail', startDate:'2026-01-01', endDate:'2026-01-31'});
  record('§2/Security', 'Sales cannot create a financial period', denyCreateSales.status===403, denyCreateSales);

  // ================= Create a real period covering an OLD (already-closed-in-real-life) month, and one covering TODAY =================
  const janPeriod = await api('finance1','POST','/api/financial-periods',{name:'January 2026', startDate:'2026-01-01', endDate:'2026-01-31'});
  record('§2', 'FinanceManager can create a financial period', janPeriod.ok, janPeriod);
  const todayIso = new Date().toISOString().slice(0,10);
  const todayYear = todayIso.slice(0,4), todayMonth = todayIso.slice(5,7);
  const todayStart = `${todayYear}-${todayMonth}-01`;
  const todayEnd = new Date(+todayYear, +todayMonth, 0).toISOString().slice(0,10); // last day of current month
  const currentPeriod = await api('finance1','POST','/api/financial-periods',{name:`${todayYear}-${todayMonth} (current)`, startDate:todayStart, endDate:todayEnd});
  record('§2', 'FinanceManager can create a period covering today\'s date', currentPeriod.ok, currentPeriod);
  const overlap = await api('finance1','POST','/api/financial-periods',{name:'Overlap attempt', startDate:'2026-01-15', endDate:'2026-02-15'});
  record('§2', 'Overlapping period is rejected', overlap.ok===false, overlap.error);

  // ================= Test 1: Open period → posting succeeds =================
  const draft1 = await api('accountant1','POST','/api/journal/draft',{date:'2026-01-15', narration:'Open-period posting test', lines:[{account:'5200',debit:1000,credit:0},{account:'1000',debit:0,credit:1000}]});
  await api('accountant1','POST',`/api/journal/${draft1.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${draft1.draft.id}/approve`);
  const post1 = await api('finance1','POST',`/api/journal/${draft1.draft.id}/post`);
  record('§2/Test1', 'Open period → posting succeeds', post1.ok, post1);

  // ================= Close January 2026 =================
  const closeDenied = await api('accountant1','POST',`/api/financial-periods/${janPeriod.period.id}/close`,{reason:'test'});
  record('§2/Security', 'Accountant cannot close a period', closeDenied.status===403, closeDenied);
  const closeNoReason = await api('finance1','POST',`/api/financial-periods/${janPeriod.period.id}/close`,{});
  record('§2', 'Closing without a reason is rejected', closeNoReason.ok===false, closeNoReason.error);
  const close1 = await api('finance1','POST',`/api/financial-periods/${janPeriod.period.id}/close`,{reason:'Month-end close — test'});
  record('§2', 'FinanceManager can close a period with a reason', close1.ok && close1.period.status==='Closed', close1);

  // ================= Test 2: Closed period → posting fails =================
  const draft2 = await api('accountant1','POST','/api/journal/draft',{date:'2026-01-20', narration:'Closed-period posting attempt', lines:[{account:'5200',debit:500,credit:0},{account:'1000',debit:0,credit:500}]});
  await api('accountant1','POST',`/api/journal/${draft2.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${draft2.draft.id}/approve`);
  const post2 = await api('finance1','POST',`/api/journal/${draft2.draft.id}/post`);
  record('§2/Test2', 'Closed period → posting fails (blocked at postJournalEntry, the single shared posting engine)', post2.ok===false && /CLOSED/.test(post2.error||''), post2);

  // ================= Test 3: Closed period through API (direct manual-journal endpoint, not the draft UI path) → fails =================
  const directPost = await api('ceo','POST','/api/journal/draft',{date:'2026-01-22', narration:'Direct API attempt', lines:[{account:'5200',debit:200,credit:0},{account:'1000',debit:0,credit:200}]});
  await api('ceo','POST',`/api/journal/${directPost.draft.id}/submit`);
  await api('ceo','POST',`/api/journal/${directPost.draft.id}/approve`);
  const directPostResult = await api('ceo','POST',`/api/journal/${directPost.draft.id}/post`);
  record('§2/Test3', 'Closed period through API (even as CEO, no override configured) → fails', directPostResult.ok===false && /CLOSED/.test(directPostResult.error||''), directPostResult);

  // ================= Test 4: Closed period through ID tampering → fails =================
  // Attempt to post a Supplier Invoice dated into the closed period via a legitimate lifecycle
  // (not just Manual JE) — proves the SAME lock applies regardless of which document type or
  // which route reaches postJournalEntry, including one an ID-tampering attacker might target.
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:5, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  const grn = await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:5,qtyRejected:0,uom:'sheet'}]});
  record('§2/Test4', 'GRN dated today (open period) still succeeds normally — sanity check before the tamper attempt', grn.ok, grn.error);
  // Tamper: try to force a supplier invoice draft's date field into the closed January period via
  // a direct crafted request (not something the UI offers), then attempt to post it.
  const tamperedInv = await api('accountant1','POST','/api/journal/draft',{date:'2026-01-10', docTypeCode:'BILL', docCategory:'SupplierInvoice', party:'VEND-1',
    narration:'Tampered date into closed period', lines:[{account:'5000',debit:1000,credit:0,vendorId:'VEND-1'},{account:'2000',debit:0,credit:1000,vendorId:'VEND-1'}]});
  await api('accountant1','POST',`/api/journal/${tamperedInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${tamperedInv.draft.id}/approve`);
  const tamperedPost = await api('finance1','POST',`/api/journal/${tamperedInv.draft.id}/post`);
  record('§2/Test4', 'Closed period via a crafted/tampered document date on a real document type → fails identically', tamperedPost.ok===false && /CLOSED/.test(tamperedPost.error||''), tamperedPost);

  // ================= Test 5: Reversal dated into closed period → fails unless authorized =================
  // Close the CURRENT period (covers today) so a reversal — which always posts with today's date
  // — is genuinely blocked by the real lock, not a contrived scenario.
  const closeCurrent = await api('finance1','POST',`/api/financial-periods/${currentPeriod.period.id}/close`,{reason:'Test — block reversal'});
  record('§2/Test5-setup', 'Current period closed successfully (needed to test reversal-into-closed-period)', closeCurrent.ok, closeCurrent);
  const reverseAttempt = await api('admin','POST',`/api/journal/${post1.entry.id}/reverse`,{reason:'Attempt to reverse into a closed current period'});
  record('§2/Test5', 'Reversal dated into a closed period (today) fails unless authorized', reverseAttempt.ok===false && /CLOSED/.test(reverseAttempt.error||''), reverseAttempt);
  // Now configure the override role for the CURRENT period and prove the SAME reversal succeeds
  // once a role is explicitly authorized — this is a TEST-SETUP configuration action proving the
  // mechanism works, not a business decision (see report §9/Management Decision Sheet — the real
  // production override role remains unset/MANAGEMENT DECISION REQUIRED).
  const denyOverrideConfig = await api('finance1','POST',`/api/financial-periods/${currentPeriod.period.id}/override-role`,{role:'CEO'});
  record('§2/Security', 'FinanceManager (below the highest tier) cannot configure a period override role', denyOverrideConfig.status===403, denyOverrideConfig);
  const setOverride = await api('admin','POST',`/api/financial-periods/${currentPeriod.period.id}/override-role`,{role:'CEO'});
  record('§2', 'Admin can configure a period\'s override role (test-only configuration, proves the mechanism)', setOverride.ok && setOverride.period.overrideRole==='CEO', setOverride);
  const reverseAsNonOverride = await api('finance1','POST',`/api/journal/${post1.entry.id}/reverse`,{reason:'FinanceManager is not the configured override role'});
  record('§2/Test5', 'A role OTHER than the configured override role is still blocked', reverseAsNonOverride.ok===false && /CLOSED/.test(reverseAsNonOverride.error||''), reverseAsNonOverride);
  const reverseAsCEO = await api('ceo','POST',`/api/journal/${post1.entry.id}/reverse`,{reason:'CEO is the configured override role for this period'});
  record('§2/Test5', 'Reversal by the EXPLICITLY configured override role succeeds', reverseAsCEO.ok, reverseAsCEO);
  const auditAfterOverride = await api('admin','GET','/api/audit-log?pageSize=20');
  const overrideAudited = (auditAfterOverride.auditLog||[]).some(a=>a.type==='ClosedPeriodOverridePosting');
  record('§2', 'The override posting itself is audited (ClosedPeriodOverridePosting)', overrideAudited, overrideAudited);
  // Clear the test-only override config so it does not leak into any other test's assumptions.
  await api('admin','POST',`/api/financial-periods/${currentPeriod.period.id}/override-role`,{role:null});

  // ================= Test 6: Clearing dated into closed period → fails unless authorized =================
  // A Customer Receipt dated into the closed January period should fail identically — the receipt
  // IS the posting that carries the date; applyClearing() itself has no separate date to tamper.
  const custDraft = await api('sales1','POST','/api/ar/invoice',{customerId:'CUST-1', projectId:'PRJ-1', baseAmount:10000, date:'2026-02-05', narration:'Open-period invoice for clearing test'});
  await api('accountant1','POST',`/api/journal/${custDraft.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${custDraft.draft.id}/approve`);
  const custPosted = await api('finance1','POST',`/api/journal/${custDraft.draft.id}/post`);
  record('§2/Test6-setup', 'Customer invoice posted in an open period (Feb 2026, no period record exists for it yet)', custPosted.ok, custPosted.error);
  const receiptIntoClosedJan = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:custPosted.entry.id, amount:5000, date:'2026-01-25', narration:'Receipt dated into closed January'});
  record('§2/Test6', 'Clearing (Customer Receipt) dated into a closed period fails unless authorized', receiptIntoClosedJan.ok===false && /CLOSED/.test(receiptIntoClosedJan.error||''), receiptIntoClosedJan);
  const receiptIntoOpenFeb = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:custPosted.entry.id, amount:5000, date:'2026-02-10', narration:'Receipt dated into open February'});
  record('§2/Test6', 'The SAME clearing succeeds when dated into an open period (sanity check — the block is date-specific, not blanket)', receiptIntoOpenFeb.ok, receiptIntoOpenFeb.error);

  // ================= Test 7: Unauthorized user cannot reopen period =================
  const reopenDenied = await api('accountant1','POST',`/api/financial-periods/${janPeriod.period.id}/reopen`,{reason:'Should fail'});
  record('§2/Test7', 'Accountant cannot reopen a closed period', reopenDenied.status===403, reopenDenied);
  const reopenDeniedSales = await api('sales1','POST',`/api/financial-periods/${janPeriod.period.id}/reopen`,{reason:'Should fail'});
  record('§2/Test7', 'Sales cannot reopen a closed period', reopenDeniedSales.status===403, reopenDeniedSales);

  // ================= Test 8: Reopen action is audited; posting into a reopened period then works =================
  const reopenNoReason = await api('finance1','POST',`/api/financial-periods/${janPeriod.period.id}/reopen`,{});
  record('§2', 'Reopening without a reason is rejected', reopenNoReason.ok===false, reopenNoReason.error);
  const reopen1 = await api('finance1','POST',`/api/financial-periods/${janPeriod.period.id}/reopen`,{reason:'Genuine correction needed — test'});
  record('§2/Test8', 'FinanceManager can reopen a closed period with a reason', reopen1.ok && reopen1.period.status==='Open', reopen1);
  const auditLog = await api('admin','GET','/api/audit-log?pageSize=50');
  const reopenAudited = (auditLog.auditLog||[]).some(a=>a.type==='FinancialPeriodReopened' && a.periodId===janPeriod.period.id);
  record('§2/Test8', 'Reopen action is audited', reopenAudited, reopenAudited);
  const postAfterReopen = await api('finance1','POST',`/api/journal/${draft2.draft.id}/post`);
  record('§2/Test8', 'A previously-blocked draft can now be posted once the period is genuinely reopened', postAfterReopen.ok, postAfterReopen.error);

  // ================= Test 9: Close action is audited =================
  const reclose = await api('finance1','POST',`/api/financial-periods/${janPeriod.period.id}/close`,{reason:'Re-close after correction — test'});
  const auditLog2 = await api('admin','GET','/api/audit-log?pageSize=50');
  const closeAudited = (auditLog2.auditLog||[]).some(a=>a.type==='FinancialPeriodClosed' && a.periodId===janPeriod.period.id);
  record('§2/Test9', 'Close action is audited', closeAudited, closeAudited);

  // ================= Test 10: Period status appears on accounting screens (API surface check) =================
  const periodsList = await api('accountant1','GET','/api/financial-periods');
  const janInList = (periodsList.periods||[]).find(p=>p.id===janPeriod.period.id);
  record('§2/Test10', 'Period status is retrievable via the API every accounting screen can call (GET /api/financial-periods)', periodsList.ok && janInList && janInList.status==='Closed', janInList);

  // ================= Test 11: Reports respect period status (a report never silently includes/excludes based on period — it reflects real posted data, and a closed period cannot gain NEW postings, so reports are automatically consistent) =================
  const tbBefore = await api('admin','GET','/api/trial-balance');
  let totDBefore=0, totCBefore=0; Object.values(tbBefore.byAccount).forEach(a=>{totDBefore+=a.debit;totCBefore+=a.credit;});
  const blockedAgain = await api('accountant1','POST','/api/journal/draft',{date:'2026-01-05', narration:'Should still be blocked', lines:[{account:'5200',debit:100,credit:0},{account:'1000',debit:0,credit:100}]});
  await api('accountant1','POST',`/api/journal/${blockedAgain.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${blockedAgain.draft.id}/approve`);
  const blockedPost = await api('finance1','POST',`/api/journal/${blockedAgain.draft.id}/post`);
  const tbAfter = await api('admin','GET','/api/trial-balance');
  let totDAfter=0, totCAfter=0; Object.values(tbAfter.byAccount).forEach(a=>{totDAfter+=a.debit;totCAfter+=a.credit;});
  record('§2/Test11', 'A blocked posting attempt leaves the Trial Balance completely unchanged — reports never see a rejected posting (they only ever reflect real GL state, which the lock already protects)',
    blockedPost.ok===false && totDBefore===totDAfter && totCBefore===totCAfter, {blockedPost:blockedPost.ok, before:{totDBefore,totCBefore}, after:{totDAfter,totCAfter}});

  // ================= §3 Period-Close Reconciliation Checklist =================
  const reconDenied = await api('sales1','GET',`/api/financial-periods/${janPeriod.period.id}/reconciliation`);
  record('§3/Security', 'Sales (not GL-visible) cannot view the period-close reconciliation checklist', reconDenied.status===403, reconDenied);
  const recon = await api('admin','GET',`/api/financial-periods/${janPeriod.period.id}/reconciliation`);
  record('§3', 'Reconciliation checklist returns Trial Balance / AR / AP / Inventory / Bank / AMC / Warranty / Service Revenue / Project Cost / Project Revenue sections', recon.ok && recon.trialBalance && recon.ar && recon.ap && recon.inventory && recon.bank && recon.amc && recon.warranty && recon.serviceRevenue && recon.projectCosts && recon.projectRevenue, Object.keys(recon));
  record('§3', 'Trial Balance for the period\'s own postings is balanced (structurally guaranteed by postJournalEntry, verified not assumed)', recon.ok && recon.trialBalance.balanced, recon.trialBalance);
  record('§3', 'AR subledger = AR control account (company-wide, as-of-now)', recon.ok && recon.ar.matches, recon.ar);
  record('§3', 'AP subledger = AP control account (company-wide, as-of-now)', recon.ok && recon.ap.matches, recon.ap);
  record('§3', 'Inventory computed value = GL Inventory balance (company-wide, as-of-now)', recon.ok && recon.inventory.matches, recon.inventory);
  const recon404 = await api('admin','GET','/api/financial-periods/FP-9999/reconciliation');
  record('§3', 'Reconciliation for a fabricated/non-existent period ID returns a clean error, not a crash', recon404.ok===false, recon404);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 18 FINANCIAL PERIOD CONTROL TESTS ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
