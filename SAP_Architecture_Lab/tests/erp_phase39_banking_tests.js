'use strict';
// PHASE 39 — Banking live validation.
const BASE = process.env.TEST_BASE_URL || (() => { throw new Error('TEST_BASE_URL is not set.'); })();
async function __preflight(){
  console.log('[TEST TARGET]', BASE);
  let info;
  try { const r = await fetch(BASE + '/api/system/environment'); info = await r.json(); }
  catch(e){ console.error('[PREFLIGHT BLOCKED]', e.message); process.exit(1); }
  if(!info || info.appEnv !== 'test' || info.destructiveTestEndpointsEnabled !== true){
    console.error('[PREFLIGHT BLOCKED]', JSON.stringify(info)); process.exit(1);
  }
  console.log('[PREFLIGHT OK]', BASE);
}
const results = [];
function record(part, name, pass, detail){ results.push({part, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return {status:r.status, ...(await r.json().catch(()=>({})))}; }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r = await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }
async function fullPost(creatorUser, createPath, createBody, approver){
  const draft = await api(creatorUser,'POST',createPath, createBody);
  if(!draft.ok) return {ok:false, stage:'draft', draft};
  const id = draft.draft.id;
  const sub = await api(approver||'accountant1','POST',`/api/journal/${id}/submit`);
  if(!sub.ok) return {ok:false, stage:'submit', sub, draft};
  const appr = await api('finance1','POST',`/api/journal/${id}/approve`);
  if(!appr.ok) return {ok:false, stage:'approve', appr, draft};
  const post = await api('finance1','POST',`/api/journal/${id}/post`);
  if(!post.ok) return {ok:false, stage:'post', post, draft};
  return {ok:true, entry:post.entry, draft};
}
function r2(n){ return Math.round(n*100)/100; }

async function main(){
  await __preflight();
  // This suite is fully self-contained (creates its own GL accounts, bank accounts, invoice/bill) —
  // reset first so it is idempotent across reruns, matching the Manufacturing/Job Work suite's
  // pattern. Run this suite on its OWN isolated server instance if Manufacturing/Job Work/Fixed
  // Assets state from the same server needs to be preserved for inspection afterward.
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('purchase1','Pur@12345'), login('sales1','Sal@123456')
  ]);

  // ============================= BANK/CASH ACCOUNT SETUP =============================
  console.log('\n===== BANK/CASH ACCOUNT SETUP =====');

  const acc1 = await api('ceo','POST','/api/masters/account',{accountCode:'TEST39-1001', accountName:'HDFC Bank — Phase 39 Test', accountType:'Asset'});
  record('BANK','GL account created for fictional Bank A', acc1.ok===true, {id:acc1.account?.id, error:acc1.error});
  const acc2 = await api('ceo','POST','/api/masters/account',{accountCode:'TEST39-1002', accountName:'Petty Cash — Phase 39 Test', accountType:'Asset'});
  record('BANK','GL account created for fictional Bank B (cash)', acc2.ok===true, {id:acc2.account?.id, error:acc2.error});

  // Negative: unauthorized role (Purchase, no masterData) creating a bank account
  const unauthBankAcct = await api('purchase1','POST','/api/bank-accounts',{bankName:'Unauthorized Attempt Bank', accountName:'Should Fail', glAccount:'TEST39-1001', type:'Bank'});
  record('BANK-NEG','Unauthorized role (Purchase) creating a bank account is BLOCKED', unauthBankAcct.ok===false, {status:unauthBankAcct.status, error:unauthBankAcct.error});

  const bankA = await api('ceo','POST','/api/bank-accounts',{bankName:'HDFC Bank (Phase 39 fictional)', accountName:'TEST39 Current Account A', accountNumberLast4:'4491', glAccount:'TEST39-1001', type:'Bank'});
  record('BANK','Bank Account A created, distinct GL account, real segregation', bankA.ok===true, {id:bankA.bankAccount?.id, glAccount:bankA.bankAccount?.glAccount, error:bankA.error});
  const bankAId = bankA.bankAccount?.id;

  const bankB = await api('ceo','POST','/api/bank-accounts',{bankName:'Federal Bank (Phase 39 fictional)', accountName:'TEST39 Current Account B', accountNumberLast4:'7723', glAccount:'TEST39-1002', type:'Bank'});
  record('BANK','Bank Account B created, distinct GL account, real segregation', bankB.ok===true, {id:bankB.bankAccount?.id, glAccount:bankB.bankAccount?.glAccount, error:bankB.error});
  const bankBId = bankB.bankAccount?.id;

  // Negative: a second bank account reusing the SAME GL account as an existing active one
  const dupGlAcct = await api('ceo','POST','/api/bank-accounts',{bankName:'Duplicate GL Attempt', accountName:'Should Fail — reused GL', glAccount:'TEST39-1001', type:'Bank'});
  record('BANK-NEG','Bank account creation with a GL account already in active use is BLOCKED', dupGlAcct.ok===false, {error:dupGlAcct.error});

  // ============================= CUSTOMER RECEIPT (via Bank A) =============================
  console.log('\n===== CUSTOMER RECEIPT via BANK A =====');

  const custInv = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1', projectId:'PRJ-1', baseAmount:80000, date:'2026-09-12', taxCode:'GST18', narration:'Phase 39 E2E — Banking receipt test invoice'},'accountant1');
  record('BANK','Customer Invoice created + fully posted (for receipt test)', custInv.ok===true, {entryId:custInv.entry?.id, error:custInv.draft?.error});
  const custInvId = custInv.entry?.id;
  const custInvTotal = custInv.entry?.totalDebit;

  const bankABalBefore = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankAId)?.balance || 0;

  // Negative: wrong/nonexistent bank account on a receipt
  const wrongBankReceipt = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:custInvId, amount:20000, date:'2026-09-12', bankAccountId:'BANK-NONEXISTENT-999'});
  record('BANK-NEG','Customer Receipt against a nonexistent bank account is BLOCKED', wrongBankReceipt.ok===false, {error:wrongBankReceipt.error});

  const receipt1 = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:custInvId, amount:custInvTotal, date:'2026-09-12', bankAccountId:bankAId, narration:'Phase 39 E2E — full receipt via Bank A'});
  record('BANK','Customer Receipt posted via Bank A, invoice fully cleared', receipt1.ok===true, {entryId:receipt1.entry?.id, clearing:receipt1.clearing?.ok, error:receipt1.error});

  const bankABalAfterReceipt = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankAId)?.balance || 0;
  record('BANK','Bank Account A balance increased by exactly the receipt amount (real segregation, not the shared 1000 account)', r2(bankABalAfterReceipt - bankABalBefore) === r2(custInvTotal), {before:bankABalBefore, after:bankABalAfterReceipt, expectedDelta:custInvTotal});

  // Negative: "payment after clearing" — a further receipt against the now-fully-cleared invoice
  const receiptAfterClear = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:custInvId, amount:1000, date:'2026-09-12', bankAccountId:bankAId});
  record('BANK-NEG','Further receipt against an already-fully-CLEARED invoice is BLOCKED (payment-after-clearing)', receiptAfterClear.ok===false, {error:receiptAfterClear.error});

  // ============================= SUPPLIER PAYMENT (via Bank B) =============================
  console.log('\n===== SUPPLIER PAYMENT via BANK B =====');

  // VEND-6 is a Labour/Services vendor — a direct (non-PO/GRN) bill is the correct entry path for
  // services (goods-category vendors like VEND-1 correctly REQUIRE PO+GRN matching, confirmed live
  // on the first run of this test: a real, working control, not a defect — VEND-6 avoids that
  // control simply because service billing is legitimately out of its scope, not to route around it).
  const bill = await api('accountant1','POST','/api/ap/invoice',{vendorId:'VEND-6', projectId:'PRJ-1', baseAmount:50000, date:'2026-09-12', taxCode:'GST18', narration:'Phase 39 E2E — Banking payment test bill (service vendor)'});
  const billSub = await api('accountant1','POST',`/api/journal/${bill.draft?.id}/submit`);
  const billAppr = await api('finance1','POST',`/api/journal/${bill.draft?.id}/approve`);
  const billPost = await api('finance1','POST',`/api/journal/${bill.draft?.id}/post`);
  record('BANK','Supplier Bill created + fully posted (for payment test)', billPost.ok===true, {entryId:billPost.entry?.id, error:bill.error||billSub.error||billAppr.error||billPost.error});
  const billEntryId = billPost.entry?.id;
  const billTotal = billPost.entry?.totalCredit;

  const bankBBalBefore = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankBId)?.balance || 0;

  // Negative: unauthorized role (Sales — has neither 'pay' capability)
  const unauthPay = await api('sales1','POST','/api/ap/payment',{vendorId:'VEND-6', invoiceEntryId:billEntryId, amount:billTotal, date:'2026-09-12', bankAccountId:bankBId});
  record('BANK-NEG','Unauthorized role (Sales) making a supplier payment is BLOCKED', unauthPay.ok===false, {error:unauthPay.error});

  const pay1 = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-6', invoiceEntryId:billEntryId, amount:billTotal, date:'2026-09-12', bankAccountId:bankBId, narration:'Phase 39 E2E — full payment via Bank B'});
  record('BANK','Supplier Payment posted via Bank B, bill fully cleared', pay1.ok===true, {entryId:pay1.entry?.id, error:pay1.error});

  const bankBBalAfterPay = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankBId)?.balance || 0;
  record('BANK','Bank Account B balance decreased by exactly the payment amount', r2(bankBBalBefore - bankBBalAfterPay) === r2(billTotal), {before:bankBBalBefore, after:bankBBalAfterPay, expectedDelta:billTotal});

  // Negative: further payment against an already-fully-CLEARED bill
  const payAfterClear = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-6', invoiceEntryId:billEntryId, amount:1000, date:'2026-09-12', bankAccountId:bankBId});
  record('BANK-NEG','Further payment against an already-fully-CLEARED bill is BLOCKED (payment-after-clearing)', payAfterClear.ok===false, {error:payAfterClear.error});

  // ============================= BANK TRANSFER (A -> B) =============================
  console.log('\n===== BANK TRANSFER =====');

  const balABeforeXfr = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankAId)?.balance || 0;
  const balBBeforeXfr = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankBId)?.balance || 0;

  // Negative: unauthorized role (Accountant lacks 'pay')
  const unauthXfr = await api('accountant1','POST','/api/bank-transfer',{fromAccountId:bankAId, toAccountId:bankBId, amount:30000, date:'2026-09-12'});
  record('BANK-NEG','Unauthorized role (Accountant, no pay capability) initiating a bank transfer is BLOCKED', unauthXfr.ok===false, {error:unauthXfr.error});

  // Negative: same source and destination account
  const selfXfr = await api('finance1','POST','/api/bank-transfer',{fromAccountId:bankAId, toAccountId:bankAId, amount:1000, date:'2026-09-12'});
  record('BANK-NEG','Bank transfer with identical source and destination account is BLOCKED', selfXfr.ok===false, {error:selfXfr.error});

  const xfr = await api('finance1','POST','/api/bank-transfer',{fromAccountId:bankAId, toAccountId:bankBId, amount:30000, date:'2026-09-12', narration:'Phase 39 E2E — transfer A to B'});
  record('BANK','Bank Transfer A->B posted, real balanced GL entry', xfr.ok===true && xfr.entry?.totalDebit===30000 && xfr.entry?.totalCredit===30000, {entryId:xfr.entry?.id, error:xfr.error});
  const xfrEntryId = xfr.entry?.id;

  const balAAfterXfr = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankAId)?.balance || 0;
  const balBAfterXfr = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankBId)?.balance || 0;
  record('BANK','Bank A decreased by exactly the transfer amount', r2(balABeforeXfr - balAAfterXfr) === 30000, {before:balABeforeXfr, after:balAAfterXfr});
  record('BANK','Bank B increased by exactly the transfer amount', r2(balBAfterXfr - balBBeforeXfr) === 30000, {before:balBBeforeXfr, after:balBAfterXfr});

  // ============================= REVERSAL =============================
  console.log('\n===== REVERSAL =====');

  const reversal = await api('finance1','POST',`/api/journal/${xfrEntryId}/reverse`,{reason:'Phase 39 E2E — reversing the test transfer to confirm balances return to baseline'});
  record('BANK','Bank Transfer entry reversed, real reversing GL entry', reversal.ok===true, {reversalEntryId:reversal.entry?.id, error:reversal.error});

  const balAAfterRev = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankAId)?.balance || 0;
  const balBAfterRev = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankBId)?.balance || 0;
  record('BANK','After reversal, Bank A balance returns exactly to its pre-transfer figure', r2(balAAfterRev) === r2(balABeforeXfr), {expected:balABeforeXfr, actual:balAAfterRev});
  record('BANK','After reversal, Bank B balance returns exactly to its pre-transfer figure', r2(balBAfterRev) === r2(balBBeforeXfr), {expected:balBBeforeXfr, actual:balBAfterRev});

  // Negative: reverse an already-reversed entry
  const dupReversal = await api('finance1','POST',`/api/journal/${xfrEntryId}/reverse`,{reason:'Phase 39 E2E — duplicate reversal attempt'});
  record('BANK-NEG','Reversing an already-reversed entry is BLOCKED', dupReversal.ok===false, {error:dupReversal.error});

  // ============================= BANK STATEMENT IMPORT (duplicate detection) =============================
  console.log('\n===== BANK IMPORT — DUPLICATE DETECTION =====');

  const csvHeader = 'No,Transaction ID,Value Date,Txn Posted Date,Cheque No,Description,Cr/Dr,Transaction Amount,Available Balance';
  const csvRows = [
    '1,TEST39TXN0001,12/09/2026,12/09/2026 10:15:00,-,NEFT/Phase39 Vendor Payment/Test Transport,DR,5000,495000',
    '2,TEST39TXN0002,12/09/2026,12/09/2026 11:20:00,-,IMPS/Phase39 Customer Receipt/CUST-1,CR,12000,507000'
  ];
  const csvText = [csvHeader, ...csvRows].join('\n');

  const batch1 = await api('finance1','POST','/api/bank-import/batches',{bankAccountId:bankAId, csvText, statementAccountNumber:'XXXXXXXXXXXX4491', label:'Phase 39 E2E — first import'});
  record('BANK','Bank statement import batch #1 created, 2 lines imported', batch1.ok===true && batch1.batch?.rowCount===2 && batch1.batch?.duplicateCount===0, {rowCount:batch1.batch?.rowCount, duplicateCount:batch1.batch?.duplicateCount, error:batch1.error});

  // Negative: re-importing the SAME statement (same Transaction IDs) — duplicate detection
  const batch2 = await api('finance1','POST','/api/bank-import/batches',{bankAccountId:bankAId, csvText, statementAccountNumber:'XXXXXXXXXXXX4491', label:'Phase 39 E2E — duplicate re-import'});
  record('BANK','Duplicate re-import of the SAME statement correctly flags both lines as Duplicate (not silently re-imported)', batch2.ok===true && batch2.batch?.duplicateCount===2, {duplicateCount:batch2.batch?.duplicateCount, error:batch2.error});

  // Negative: statement account number mismatch against the configured bank account
  const csvMismatch = [csvHeader, '3,TEST39TXN0003,12/09/2026,12/09/2026 12:00:00,-,NEFT/Phase39 Misc/Other,CR,2000,509000'].join('\n');
  const batchMismatch = await api('finance1','POST','/api/bank-import/batches',{bankAccountId:bankAId, csvText:csvMismatch, statementAccountNumber:'XXXXXXXXXXXX9999', label:'Phase 39 E2E — wrong account number'});
  record('BANK','Import with a statement account number NOT matching the configured bank account is flagged (accountNumberMismatch), not silently accepted or blocked', batchMismatch.ok===true && !!batchMismatch.batch?.accountNumberMismatch, {accountNumberMismatch:batchMismatch.batch?.accountNumberMismatch, error:batchMismatch.error});

  // ============================= BANK IMPORT — ALLOCATE + RECONCILE =============================
  console.log('\n===== BANK IMPORT — ALLOCATE + RECONCILE =====');

  const linesResp = await api('finance1','GET',`/api/bank-import/lines?batchId=${batch1.batch?.id}`);
  const drLine = linesResp.lines?.find(l=>l.crDr==='DR');
  record('BANK','Imported DR line identified for allocation', !!drLine, {lineId:drLine?.id, amount:drLine?.amount});

  const bankABalBeforeAlloc = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankAId)?.balance || 0;

  const alloc = await api('finance1','POST',`/api/bank-import/lines/${drLine?.id}/post`,{glAccount:'5200', projectId:'PRJ-1', narration:'Phase 39 E2E — allocate DR line to Site Expense'});
  record('BANK','Bank import line allocated (posted) to a real GL entry through the shared postJournalEntry() engine', alloc.ok===true, {entryId:alloc.entry?.id, error:alloc.error});

  const bankABalAfterAlloc = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankAId)?.balance || 0;
  record('BANK','Bank A balance decreased by exactly the allocated DR line amount', r2(bankABalBeforeAlloc - bankABalAfterAlloc) === r2(drLine?.amount||-1), {before:bankABalBeforeAlloc, after:bankABalAfterAlloc, expectedDelta:drLine?.amount});

  // Negative: allocating (posting) an already-Posted line a second time
  const dupAlloc = await api('finance1','POST',`/api/bank-import/lines/${drLine?.id}/post`,{glAccount:'5200', projectId:'PRJ-1'});
  record('BANK-NEG','Re-allocating an already-Posted bank import line is BLOCKED', dupAlloc.ok===false, {error:dupAlloc.error});

  const reconcileLine = await api('finance1','POST',`/api/bank-import/lines/${drLine?.id}/reconcile`);
  record('BANK','Posted bank import line marked Reconciled', reconcileLine.ok===true && reconcileLine.line?.status==='Reconciled', {status:reconcileLine.line?.status, error:reconcileLine.error});

  // ============================= RECONCILIATION SUMMARY =============================
  console.log('\n===== RECONCILIATION SUMMARY =====');

  const reconSummary = await api('finance1','GET',`/api/bank-import/reconciliation-summary?bankAccountId=${bankAId}`);
  record('BANK','Bank reconciliation summary returned for Bank A', reconSummary.ok===true, reconSummary);

  console.log('\n===== TOTAL: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.part}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail ?? null).slice(0,300)}`));
  require('fs').writeFileSync('phase39_banking_results.json', JSON.stringify(results, null, 2));
  process.exit(results.some(r=>r.pass===false) ? 1 : 0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
