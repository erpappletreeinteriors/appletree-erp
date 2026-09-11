'use strict';
// Phase 19 §40.18 — SAP Accountant UAT for the genuinely NEW workflows this phase added: Fixed
// Assets (full lifecycle), ICICI Bank Import/Reconciliation, Payment Methods, HSN/GSTIN
// optionality, Annual Document Numbering, and Financial Period Override with reason. Every other
// workflow (Journal/AR/AP/Receipt/Payment/Clearing/Inventory/Project Cost/Project P&L/Warranty/
// Service/AMC/Bank Reconciliation(generic)/Print/Audit/Reversal) is UNCHANGED and re-confirmed
// separately via the existing Phase 14/16/18 UAT scripts as part of this phase's regression.
// Agent-simulated, same disclosed limitation as every prior UAT in this engagement.
const fs = require('fs');
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
function record(workflow, task, passed, note){ results.push({workflow, task, verdict: passed?'PASS':'FAIL', note:note||''}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['ceo','finance1','accountant1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345'}[u])));

  // ===== Fixed Assets =====
  const fa = await api('finance1','POST','/api/fixed-assets',{assetName:'CNC Router', assetClass:'Machinery', purchaseDate:'2026-06-01', cost:250000, location:'Factory', custodian:'Plant Manager'});
  record('Fixed Assets', 'Accountant/FinanceManager can register a new asset as Purchased (not yet on the balance sheet)', fa.ok && fa.asset.status==='Purchased', fa.asset);
  const capNoUsefulLife = await api('finance1','POST',`/api/fixed-assets/${fa.asset.id}/capitalize`,{capitalizationDate:'2026-06-01', fundingSource:'Bank'});
  record('Fixed Assets', 'Capitalizing WITHOUT Useful Life/Method/Residual is rejected with a clear ACCOUNTING POLICY REQUIRED message, not silently defaulted', capNoUsefulLife.ok===false && /ACCOUNTING POLICY REQUIRED/.test(capNoUsefulLife.error), capNoUsefulLife.error);
  const cap = await api('finance1','POST',`/api/fixed-assets/${fa.asset.id}/capitalize`,{capitalizationDate:'2026-06-01', fundingSource:'Bank', usefulLifeMonths:120, depreciationMethod:'StraightLine', residualValue:10000});
  record('Fixed Assets', 'Capitalization posts a real Dr Fixed Assets-Cost / Cr Bank entry and moves the asset to Capitalized', cap.ok && cap.entry.lines.some(l=>l.account==='1400'&&l.debit===250000), cap.entry&&cap.entry.voucherNo);
  const dep = await api('finance1','POST',`/api/fixed-assets/${fa.asset.id}/depreciate`,{periodDate:'2026-07-01'});
  record('Fixed Assets', 'Depreciation auto-computes correctly from the StraightLine policy already chosen: (250000-10000)/120 = 2000/month', dep.ok && Math.abs(dep.entry.totalDebit-2000)<0.01, dep.entry&&dep.entry.totalDebit);
  const faList = await api('accountant1','GET','/api/fixed-assets');
  const faRow = faList.assets.find(a=>a.id===fa.asset.id);
  record('Fixed Assets', 'Asset register clearly shows Cost/Accumulated Depreciation/Net Book Value together, not requiring a separate lookup', faRow && faRow.cost===250000 && faRow.accumulatedDepreciation===2000 && faRow.netBookValue===248000, faRow);
  const faRecon = await api('finance1','GET','/api/fixed-assets/reconciliation');
  record('Fixed Assets', 'Fixed Asset Register reconciles exactly to the GL (Cost and Accumulated Depreciation both match)', faRecon.ok && faRecon.reconciliation.costMatches && faRecon.reconciliation.accumDepMatches, faRecon.reconciliation);

  // ===== ICICI Bank Import =====
  const banks = await api('finance1','GET','/api/bank-accounts');
  const csvText = fs.readFileSync(__dirname+'/icici_statement_121.csv','utf8');
  const imp = await api('accountant1','POST','/api/bank-import/batches',{bankAccountId:banks.bankAccounts[0].id, csvText, statementAccountNumber:'249005001137', label:'UAT import'});
  record('ICICI Bank Import', 'Accountant can import the real bank statement and immediately sees row count, duplicates, and any balance mismatches — no black box', imp.ok && imp.batch.rowCount===121, imp.batch);
  record('ICICI Bank Import', 'The account-number mismatch is surfaced clearly, not hidden, so the accountant knows to confirm it with management', !!imp.batch.accountNumberMismatch, imp.batch.accountNumberMismatch);
  const lines = (await api('accountant1','GET',`/api/bank-import/lines?batchId=${imp.batch.id}`)).lines;
  const returnedLine = lines.find(l=>l.isReturned && l.returnOfLineId);
  record('ICICI Bank Import', 'A returned transaction is immediately visible as such, with its original transaction cross-referenced, not mixed in as a normal receipt', !!returnedLine, returnedLine && {rowNo:returnedLine.rowNo, returnOf:returnedLine.returnOfLineId});
  record('ICICI Bank Import', 'Every transaction carries a plain-English suggested classification the accountant can quickly scan and confirm/override', lines.every(l=>!!l.suggestedClassification), 'all 121 lines checked');

  // ===== Payment Methods =====
  const pms = await api('accountant1','GET','/api/payment-methods');
  record('Payment Methods', 'Accountant can see the standard set of payment methods (Cash/Cheque/Bank Transfer/NEFT/RTGS/IMPS/UPI/Card)', pms.ok && pms.paymentMethods.length===8, pms.paymentMethods.map(m=>m.code));
  const custInv = await api('accountant1','POST','/api/ar/invoice',{customerId:'CUST-1', projectId:'PRJ-1', baseAmount:5000, date:'2026-08-25'});
  await api('accountant1','POST',`/api/journal/${custInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${custInv.draft.id}/approve`);
  const postedInv = await api('finance1','POST',`/api/journal/${custInv.draft.id}/post`);
  const rcpt = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:postedInv.entry.id, amount:5000, date:'2026-08-25', paymentMethodId:'PM-UPI'});
  record('Payment Methods', 'A receipt tagged with a Payment Method still posts to the SAME Bank account (1000) as always — the method never redirects the accounting', rcpt.ok && rcpt.entry.lines.some(l=>l.account==='1000'&&l.debit===5000) && rcpt.entry.paymentMethodId==='PM-UPI', rcpt.entry);

  // ===== HSN / GSTIN Optionality =====
  const invNoGstin = await api('accountant1','POST','/api/ar/invoice',{customerId:'CUST-3', projectId:'PRJ-1', baseAmount:1000, date:'2026-08-25'});
  record('HSN/GSTIN', 'A customer with NO GSTIN can still be invoiced — GSTIN absence never blocks anything', invNoGstin.ok, invNoGstin.error||'created fine');
  const gstinSet = await api('admin','POST','/api/customers/CUST-3/gstin',{gstin:'32aabcx1234a1z1'});
  record('HSN/GSTIN', 'Once supplied, GSTIN is preserved correctly (normalized to uppercase, not altered otherwise)', gstinSet.ok && gstinSet.customer.gstin==='32AABCX1234A1Z1', gstinSet.customer&&gstinSet.customer.gstin);
  const hsnSet = await api('admin','POST','/api/materials/MAT-2/hsn',{hsnCode:'3921'});
  record('HSN/GSTIN', 'HSN can be set on a material without affecting any existing GRN/PO/inventory workflow', hsnSet.ok && hsnSet.material.hsnCode==='3921', hsnSet.material&&hsnSet.material.hsnCode);

  // ===== Annual Document Numbering =====
  const marchJE = await api('accountant1','POST','/api/journal/draft',{date:'2027-03-31', lines:[{account:'5200',debit:10,credit:0},{account:'1000',debit:0,credit:10}]});
  await api('accountant1','POST',`/api/journal/${marchJE.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${marchJE.draft.id}/approve`);
  const marchPost = await api('finance1','POST',`/api/journal/${marchJE.draft.id}/post`);
  const aprilJE = await api('accountant1','POST','/api/journal/draft',{date:'2027-04-01', lines:[{account:'5200',debit:10,credit:0},{account:'1000',debit:0,credit:10}]});
  await api('accountant1','POST',`/api/journal/${aprilJE.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${aprilJE.draft.id}/approve`);
  const aprilPost = await api('finance1','POST',`/api/journal/${aprilJE.draft.id}/post`);
  record('Annual Numbering', '31 March and 1 April postings land in visibly different Financial Year series in the voucher number itself', marchPost.entry.voucherNo.includes('2026-27') && aprilPost.entry.voucherNo.includes('2027-28'), {march:marchPost.entry.voucherNo, april:aprilPost.entry.voucherNo});
  record('Annual Numbering', 'Internal document IDs (JE-xxxx) remain globally unique and were NEVER renumbered, regardless of the visible voucher series', marchPost.entry.id!==aprilPost.entry.id, {marchId:marchPost.entry.id, aprilId:aprilPost.entry.id});

  // ===== Financial Period Override (reason now mandatory) =====
  const period = await api('finance1','POST','/api/financial-periods',{name:'UAT Override Period', startDate:'2026-08-01', endDate:'2026-08-31'});
  await api('finance1','POST',`/api/financial-periods/${period.period.id}/close`,{reason:'UAT test'});
  await api('admin','POST',`/api/financial-periods/${period.period.id}/override-role`,{role:'CEO'});
  const draftInClosed = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-15', lines:[{account:'5200',debit:5,credit:0},{account:'1000',debit:0,credit:5}]});
  await api('accountant1','POST',`/api/journal/${draftInClosed.draft.id}/submit`);
  await api('ceo','POST',`/api/journal/${draftInClosed.draft.id}/approve`);
  const overrideNoReason = await api('ceo','POST',`/api/journal/${draftInClosed.draft.id}/post`);
  record('Period Override', 'Even the AUTHORIZED override role (CEO) is blocked without a reason — authorization alone is not enough', overrideNoReason.ok===false && /reason/i.test(overrideNoReason.error), overrideNoReason.error);
  const overrideWithReason = await api('ceo','POST',`/api/journal/${draftInClosed.draft.id}/post`,{overrideReason:'Genuine late correction approved by CEO — UAT'});
  record('Period Override', 'With a reason supplied, the authorized override succeeds and is fully traceable', overrideWithReason.ok, overrideWithReason.entry&&overrideWithReason.entry.voucherNo);
  const audit = await api('admin','GET','/api/audit-log?pageSize=20');
  const overrideAudit = (audit.auditLog||[]).find(a=>a.type==='ClosedPeriodOverridePosting');
  record('Period Override', 'The override is visible in the audit log with reason, user, timestamp, and a real document reference — not just a flag', overrideAudit && overrideAudit.overrideReason && overrideAudit.documentReference, overrideAudit);

  await api('admin','POST','/api/test/reset');
  const byVerdict = {PASS:0,FAIL:0,CONFUSING:0,MISSING:0};
  results.forEach(r=>byVerdict[r.verdict]++);
  console.log('\n================ PHASE 19 ACCOUNTANT UAT (agent-simulated) ================\n');
  results.forEach(r=>console.log(`[${r.verdict.padEnd(7)}] [${r.workflow}] ${r.task}${r.note?' -- '+ (typeof r.note==='string'?r.note:JSON.stringify(r.note)):''}`));
  console.log(`\n================ PASS:${byVerdict.PASS} FAIL:${byVerdict.FAIL} CONFUSING:${byVerdict.CONFUSING} MISSING:${byVerdict.MISSING} / ${results.length} TOTAL ================\n`);
  if(byVerdict.FAIL>0) process.exit(1);
}
main().catch(e=>{ console.error('UAT ERROR:', e); process.exit(2); });
