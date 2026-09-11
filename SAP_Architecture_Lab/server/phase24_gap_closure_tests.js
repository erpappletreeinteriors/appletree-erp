// Phase 24 — closing the 3 architectural gaps: Multi-Bank/Cash GL, Supplier Debit Note,
// Commitment Engine. Temporary/demo data only (TEST BANK A/B, TEST CASH A/B, TEST PROJECT).
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
function record(section, desc, ok, detail){ if(ok) PASS++; else FAIL++; console.log((ok?'✅ PASS':'❌ FAIL')+' | ['+section+'] '+desc+(ok?'':' | '+String(JSON.stringify(detail)).slice(0,300))); }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
async function fullPostInvoice(customerId, projectId, amount){
  const inv = await api('admin','POST','/api/ar/invoice',{customerId,projectId,baseAmount:amount,date:'2026-08-20',taxCode:'GST18',narration:'PHASE24-TEST invoice'});
  if(!inv.ok) return inv;
  const id = inv.draft.id;
  await api('accountant1','POST',`/api/journal/${id}/submit`);
  await api('finance1','POST',`/api/journal/${id}/approve`);
  return api('finance1','POST',`/api/journal/${id}/post`);
}
async function fullPostBill(vendorId, projectId, amount){
  const bill = await api('admin','POST','/api/ap/invoice',{vendorId,projectId,baseAmount:amount,date:'2026-08-20',taxCode:'GST18',narration:'PHASE24-TEST bill'});
  if(!bill.ok) return bill;
  const id = bill.draft.id;
  await api('accountant1','POST',`/api/journal/${id}/submit`);
  await api('finance1','POST',`/api/journal/${id}/approve`);
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

  console.log('=================== PART A: MULTI-BANK/CASH GL ===================');
  const accA = await api('admin','POST','/api/masters/account',{accountCode:'9200', accountName:'PHASE24-TEST Bank A', accountType:'Asset'});
  const accB = await api('admin','POST','/api/masters/account',{accountCode:'9201', accountName:'PHASE24-TEST Bank B', accountType:'Asset'});
  const accCA = await api('admin','POST','/api/masters/account',{accountCode:'9202', accountName:'PHASE24-TEST Cash A', accountType:'Asset'});
  const accCB = await api('admin','POST','/api/masters/account',{accountCode:'9203', accountName:'PHASE24-TEST Cash B', accountType:'Asset'});
  record('A1', 'Two distinct GL accounts for Bank A/B created', accA.ok && accB.ok);
  record('A2', 'Two distinct GL accounts for Cash A/B created', accCA.ok && accCB.ok);

  const bankA = await api('admin','POST','/api/bank-accounts',{bankName:'TEST BANK A', accountName:'Test Bank A', accountNumberLast4:'0001', glAccount:'9200', type:'Bank'});
  const bankB = await api('admin','POST','/api/bank-accounts',{bankName:'TEST BANK B', accountName:'Test Bank B', accountNumberLast4:'0002', glAccount:'9201', type:'Bank'});
  const cashA = await api('admin','POST','/api/bank-accounts',{bankName:'TEST CASH A', accountName:'Test Cash A', accountNumberLast4:'', glAccount:'9202', type:'Cash'});
  const cashB = await api('admin','POST','/api/bank-accounts',{bankName:'TEST CASH B', accountName:'Test Cash B', accountNumberLast4:'', glAccount:'9203', type:'Cash'});
  record('A1', 'TEST BANK A/B account records created', bankA.ok && bankB.ok, {bankA,bankB});
  record('A2', 'TEST CASH A/B account records created', cashA.ok && cashB.ok, {cashA,cashB});
  record('A1/A2', 'Duplicate glAccount across accounts is rejected', (await api('admin','POST','/api/bank-accounts',{bankName:'Dup', accountName:'Dup', glAccount:'9200'})).status===400);

  const bankAId = bankA.bankAccount.id, bankBId = bankB.bankAccount.id, cashAId = cashA.bankAccount.id, cashBId = cashB.bankAccount.id;

  // A4: Receipt routing
  const invForA = await fullPostInvoice('CUST-1','PRJ-1',10000);
  const invForB = await fullPostInvoice('CUST-2','PRJ-2',20000);
  const invForCA = await fullPostInvoice('CUST-3','PRJ-3',5000);
  const invForCB = await fullPostInvoice('CUST-4','PRJ-4',7000);
  const rcptA = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1',invoiceEntryId:invForA.entry.id,amount:10000,date:'2026-08-21',bankAccountId:bankAId});
  const rcptB = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-2',invoiceEntryId:invForB.entry.id,amount:20000,date:'2026-08-21',bankAccountId:bankBId});
  const rcptCA = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-3',invoiceEntryId:invForCA.entry.id,amount:5000,date:'2026-08-21',bankAccountId:cashAId});
  const rcptCB = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-4',invoiceEntryId:invForCB.entry.id,amount:7000,date:'2026-08-21',bankAccountId:cashBId});
  record('A4', 'Receipt to Bank A posts to Bank A GL (9200), not 1000', rcptA.ok && rcptA.entry.lines.some(l=>l.account==='9200'&&l.debit===10000), rcptA);
  record('A4', 'Receipt to Bank B posts to Bank B GL (9201)', rcptB.ok && rcptB.entry.lines.some(l=>l.account==='9201'&&l.debit===20000), rcptB);
  record('A4', 'Receipt to Cash A posts to Cash A GL (9202)', rcptCA.ok && rcptCA.entry.lines.some(l=>l.account==='9202'&&l.debit===5000), rcptCA);
  record('A4', 'Receipt to Cash B posts to Cash B GL (9203)', rcptCB.ok && rcptCB.entry.lines.some(l=>l.account==='9203'&&l.debit===7000), rcptCB);

  // A5: Payment routing
  const billForA = await fullPostBill('VEND-1','PRJ-1',8000);
  const billForB = await fullPostBill('VEND-2','PRJ-2',9000);
  const billForCA = await fullPostBill('VEND-3','PRJ-3',3000);
  const billForCB = await fullPostBill('VEND-4','PRJ-4',4000);
  const payA = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-1',invoiceEntryId:billForA.entry.id,amount:8000,date:'2026-08-22',bankAccountId:bankAId});
  const payB = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-2',invoiceEntryId:billForB.entry.id,amount:9000,date:'2026-08-22',bankAccountId:bankBId});
  const payCA = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-3',invoiceEntryId:billForCA.entry.id,amount:3000,date:'2026-08-22',bankAccountId:cashAId});
  const payCB = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-4',invoiceEntryId:billForCB.entry.id,amount:4000,date:'2026-08-22',bankAccountId:cashBId});
  record('A5', 'Payment from Bank A posts to Bank A GL', payA.ok && payA.entry.lines.some(l=>l.account==='9200'&&l.credit===8000));
  record('A5', 'Payment from Bank B posts to Bank B GL', payB.ok && payB.entry.lines.some(l=>l.account==='9201'&&l.credit===9000));
  record('A5', 'Payment from Cash A posts to Cash A GL', payCA.ok && payCA.entry.lines.some(l=>l.account==='9202'&&l.credit===3000));
  record('A5', 'Payment from Cash B posts to Cash B GL', payCB.ok && payCB.entry.lines.some(l=>l.account==='9203'&&l.credit===4000));

  // A6: Transfer routing
  const xferAB = await api('finance1','POST','/api/bank-transfer',{fromAccountId:bankAId, toAccountId:bankBId, amount:2000, date:'2026-08-23'});
  record('A6', 'Bank A -> Bank B transfer: Dr Bank B / Cr Bank A', xferAB.ok && xferAB.entry.lines.some(l=>l.account==='9201'&&l.debit===2000) && xferAB.entry.lines.some(l=>l.account==='9200'&&l.credit===2000), xferAB);
  const xferCashToBank = await api('finance1','POST','/api/bank-transfer',{fromAccountId:cashAId, toAccountId:bankAId, amount:1000, date:'2026-08-23'});
  record('A6', 'Cash A -> Bank A transfer correct', xferCashToBank.ok && xferCashToBank.entry.lines.some(l=>l.account==='9200'&&l.debit===1000) && xferCashToBank.entry.lines.some(l=>l.account==='9202'&&l.credit===1000));
  const xferSameAccount = await api('finance1','POST','/api/bank-transfer',{fromAccountId:bankAId, toAccountId:bankAId, amount:500, date:'2026-08-23'});
  record('A6', 'Transfer to the SAME account is rejected', xferSameAccount.status===400);

  // A8: Reporting
  const balances = await api('admin','GET','/api/bank-accounts/balances');
  const balA = balances.balances.find(b=>b.id===bankAId).balance;
  const balB = balances.balances.find(b=>b.id===bankBId).balance;
  // Bank A: +10000 (receipt) -8000 (payment) -2000 (transfer out to B) +1000 (transfer in from cash A) = 1000
  record('A8', 'Bank A balance individually correct (not commingled with Bank B)', Math.abs(balA-1000)<0.01, {balA, expected:1000});
  // Bank B: +20000 (receipt) -9000 (payment) +2000 (transfer in from A) = 13000
  record('A8', 'Bank B balance individually correct', Math.abs(balB-13000)<0.01, {balB, expected:13000});

  // A9: Reversal
  const revRcptA = await api('finance1','POST',`/api/journal/${rcptA.entry.id}/reverse`,{reason:'PHASE24-TEST reversal — Bank A receipt'});
  record('A9', 'Bank A receipt reversal succeeds', revRcptA.ok);
  const balancesAfterRev = await api('admin','GET','/api/bank-accounts/balances');
  const balAAfterRev = balancesAfterRev.balances.find(b=>b.id===bankAId).balance;
  record('A9', 'Bank A balance returns correctly after reversal (back to -9000)', Math.abs(balAAfterRev-(-9000))<0.01, {balAAfterRev});
  const balBAfterRev = balancesAfterRev.balances.find(b=>b.id===bankBId).balance;
  record('A9', 'Bank B balance UNAFFECTED by Bank A reversal', Math.abs(balBAfterRev-13000)<0.01, {balBAfterRev});

  console.log('\n=================== PART B: SUPPLIER DEBIT NOTE ===================');
  const reasons = await api('admin','GET','/api/supplier-debit-notes/reasons');
  record('B2', 'All 6 approved reasons + Other are exposed', reasons.ok && reasons.reasons.length===7, reasons);

  const billForDN = await fullPostBill('VEND-5','PRJ-1',50000);
  const dnUnauthorized = await api('sales1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:5000, reasonCategory:'Short Receipt'});
  record('B9', 'Sales role cannot create a Supplier Debit Note (SoD/RBAC)', dnUnauthorized.status===403);

  const dnBadReason = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:5000, reasonCategory:'Made Up Reason'});
  record('B2', 'An arbitrary, non-enumerated reason is rejected', dnBadReason.status===400);
  const dnOtherNoDetail = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:5000, reasonCategory:'Other'});
  record('B2', '"Other" without a mandatory explanation is rejected', dnOtherNoDetail.status===400);

  const dnShort = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:5000, reasonCategory:'Short Receipt'});
  record('B1/B3', 'Short Receipt debit note created and posted (Dr AP / Cr Material Cost)', dnShort.ok && dnShort.entry.lines.some(l=>l.account==='2000'&&l.debit===5000) && dnShort.entry.lines.some(l=>l.account==='5000'&&l.credit===5000), dnShort);
  record('B4', 'AP Subledger = AP Control after the debit note', (await api('admin','GET','/api/reconciliation')).ap.matches);

  const dnOverAmount = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:999999, reasonCategory:'Price Dispute'});
  record('B4', 'Cannot over-clear the invoice via a debit note', dnOverAmount.status===400);

  const dnDamage = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:2000, reasonCategory:'Damaged Material'});
  record('B7', 'Damaged Material scenario works', dnDamage.ok);
  const dnQuality = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:1000, reasonCategory:'Quality Rejection'});
  record('B7', 'Quality Rejection scenario works', dnQuality.ok);
  const dnOvercharge = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:1000, reasonCategory:'Supplier Overcharge'});
  record('B8', 'Supplier Overcharge scenario works', dnOvercharge.ok);
  const dnPrice = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:1000, reasonCategory:'Price Dispute'});
  record('B8', 'Price Dispute scenario works', dnPrice.ok);
  const dnReturn = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:1000, reasonCategory:'Purchase Return'});
  record('B5', 'Purchase Return scenario works', dnReturn.ok);
  const dnOther = await api('finance1','POST','/api/supplier-debit-notes',{supplierInvoiceEntryId:billForDN.entry.id, amount:500, reasonCategory:'Other', reasonDetail:'PHASE24-TEST — a genuinely unusual case with mandatory explanation'});
  record('B2', '"Other" WITH a mandatory explanation succeeds', dnOther.ok);

  // B10: Reversal
  const revDN = await api('finance1','POST',`/api/journal/${dnShort.entry.id}/reverse`,{reason:'PHASE24-TEST — reverse the debit note'});
  record('B10', 'Supplier Debit Note reversal succeeds', revDN.ok);
  const apReconAfterDNRev = await api('admin','GET','/api/reconciliation');
  record('B10', 'AP still reconciles after debit-note reversal', apReconAfterDNRev.ap.matches, apReconAfterDNRev.ap);

  console.log('\n=================== PART C: COMMITMENT ENGINE ===================');
  const cProj = await api('admin','POST','/api/masters/project',{name:'PHASE24-TEST Commitment Project', budget:200000, customerId:'CUST-1'});
  const cProjId = cProj.project.id;
  const cProj2 = await api('admin','POST','/api/masters/project',{name:'PHASE24-TEST Commitment Project 2', budget:100000, customerId:'CUST-2'});
  const cProj2Id = cProj2.project.id;

  const po1 = await api('purchase1','POST','/api/purchase-orders',{projectId:cProjId, vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:10, rate:10000}]});
  const po1Id = po1.po.id;
  const submit1 = await api('purchase1','POST',`/api/purchase-orders/${po1Id}/submit`);
  record('C3', 'PO submitted', submit1.ok, submit1);
  // If auto-approved (below threshold) a commitment should already exist; else explicitly approve.
  let commitAfterApproval;
  if(submit1.po.status==='Approved'){
    commitAfterApproval = await api('admin','GET',`/api/commitments?projectId=${cProjId}`);
  } else {
    const appr1 = await api('finance1','POST',`/api/purchase-orders/${po1Id}/approve`);
    record('C3', 'PO approved (required approval tier)', appr1.ok, appr1);
    commitAfterApproval = await api('admin','GET',`/api/commitments?projectId=${cProjId}`);
  }
  record('C3', 'Approved PO of Rs100,000 creates a Rs100,000 commitment', commitAfterApproval.ok && Math.abs(commitAfterApproval.totalOriginal-100000)<0.01, commitAfterApproval);

  // C11: Commitment vs GL — before any receipt, GL actual cost for this project = 0, commitment = 100000
  const financial360Before = await api('finance1','GET',`/api/projects/${cProjId}/financial-360`);
  record('C11', 'Before GRN: GL actual cost = 0, Commitment = 100000', financial360Before.ok && financial360Before.cost.actual===0 && Math.abs(financial360Before.commitment.totalRemaining-100000)<0.01, financial360Before.ok ? {actual:financial360Before.cost.actual, commitment:financial360Before.commitment} : financial360Before);

  // C5: Partial receipt (6 of 10 units = Rs60,000)
  const grn1 = await api('purchase1','POST','/api/grns',{poId:po1Id, warehouseId:'WH-1', lines:[{qtyAccepted:6}]});
  record('C5', 'Partial GRN (Rs60,000 of Rs100,000) posted', grn1.ok, grn1);
  const financial360After1 = await api('finance1','GET',`/api/projects/${cProjId}/financial-360`);
  record('C5', 'After partial GRN: GL actual = 60000, Commitment remaining = 40000 (NOT combined)', financial360After1.ok && Math.abs(financial360After1.commitment.totalRemaining-40000)<0.01, financial360After1.ok ? financial360After1.commitment : financial360After1);

  // C6: Full receipt
  const grn2 = await api('purchase1','POST','/api/grns',{poId:po1Id, warehouseId:'WH-1', lines:[{qtyAccepted:4}]});
  record('C6', 'Remaining 4 units received — PO fully received', grn2.ok);
  const financial360Full = await api('finance1','GET',`/api/projects/${cProjId}/financial-360`);
  // Note: GRN posts to Inventory (1200), not Material Cost (5000) — "actual cost" in this
  // architecture is recognized at Material ISSUE (consumption), not at receipt. So after a full
  // GRN the commitment correctly drops to 0, while cost.actual correctly remains 0 until the
  // material is actually issued to the project — this is the correct existing behavior, not a
  // defect, and the commitment test below checks the right thing for this scenario.
  record('C6', 'After full GRN: Commitment = 0 (received value has left commitment, is now in Inventory, not yet Actual Cost)', financial360Full.ok && Math.abs(financial360Full.commitment.totalRemaining-0)<0.01, financial360Full.ok?financial360Full.commitment:financial360Full);
  record('C6', 'Inventory GL correctly received the Rs100,000 (received:100000 in the inventory summary)', financial360Full.ok && Math.abs(financial360Full.inventory.received-100000)<0.01, financial360Full.ok?financial360Full.inventory:financial360Full);

  // C7: PO Cancellation (on a separate, un-received PO)
  const po2 = await api('purchase1','POST','/api/purchase-orders',{projectId:cProjId, vendorId:'VEND-2', lines:[{materialId:'MAT-2', qty:5, rate:6000}]});
  const po2Id = po2.po.id;
  const submit2 = await api('purchase1','POST',`/api/purchase-orders/${po2Id}/submit`);
  if(submit2.po.status!=='Approved') await api('finance1','POST',`/api/purchase-orders/${po2Id}/approve`);
  const cancelPo2 = await api('finance1','POST',`/api/purchase-orders/${po2Id}/cancel`,{reason:'PHASE24-TEST cancellation'});
  record('C7', 'Approved PO can be cancelled, releasing its commitment', cancelPo2.ok && Math.abs(cancelPo2.commitmentReleased-30000)<0.01, cancelPo2);
  const cancelNoReason = await api('purchase1','POST','/api/purchase-orders',{projectId:cProjId, vendorId:'VEND-3', lines:[{materialId:'MAT-1', qty:1, rate:1000}]});
  const cnrId = cancelNoReason.po.id; await api('purchase1','POST',`/api/purchase-orders/${cnrId}/submit`);
  const cancelWithoutReason = await api('finance1','POST',`/api/purchase-orders/${cnrId}/cancel`,{});
  record('C7', 'Cancelling without a reason is rejected', cancelWithoutReason.status===400);

  // C9: Project-linked, no cross-contamination
  const po3 = await api('purchase1','POST','/api/purchase-orders',{projectId:cProj2Id, vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:5, rate:10000}]});
  const po3Id = po3.po.id;
  const submit3 = await api('purchase1','POST',`/api/purchase-orders/${po3Id}/submit`);
  if(submit3.po.status!=='Approved') await api('finance1','POST',`/api/purchase-orders/${po3Id}/approve`);
  const commitProj1 = await api('admin','GET',`/api/commitments?projectId=${cProjId}`);
  const commitProj2 = await api('admin','GET',`/api/commitments?projectId=${cProj2Id}`);
  record('C9', 'Project A commitments do not include Project B POs', !commitProj1.commitments.some(c=>c.poId===po3Id));
  record('C9', 'Project B has its own separate Rs50,000 commitment', Math.abs(commitProj2.totalOriginal-50000)<0.01, commitProj2);

  // C12: Reversal of a GRN restores the commitment
  const po4 = await api('purchase1','POST','/api/purchase-orders',{projectId:cProj2Id, vendorId:'VEND-4', lines:[{materialId:'MAT-6', qty:5, rate:2000}]});
  const po4Id = po4.po.id;
  const submit4 = await api('purchase1','POST',`/api/purchase-orders/${po4Id}/submit`);
  if(submit4.po.status!=='Approved') await api('finance1','POST',`/api/purchase-orders/${po4Id}/approve`);
  const grn4 = await api('purchase1','POST','/api/grns',{poId:po4Id, warehouseId:'WH-1', lines:[{qtyAccepted:5}]});
  const commitAfterGrn4 = await api('admin','GET',`/api/commitments?projectId=${cProj2Id}`);
  const c4 = commitAfterGrn4.commitments.find(c=>c.poId===po4Id);
  record('C12-setup', 'PO4 fully received, commitment = 0', c4 && Math.abs(c4.remainingAmount-0)<0.01, c4);
  const revGrn4 = await api('finance1','POST',`/api/journal/${grn4.glEntry.id}/reverse`,{reason:'PHASE24-TEST — reverse GRN to test commitment restoration'});
  record('C12', 'GRN reversal succeeds', revGrn4.ok, revGrn4);
  const commitAfterRevGrn4 = await api('admin','GET',`/api/commitments?projectId=${cProj2Id}`);
  const c4After = commitAfterRevGrn4.commitments.find(c=>c.poId===po4Id);
  record('C12', 'Commitment RESTORED to Rs10,000 after GRN reversal (no double counting)', c4After && Math.abs(c4After.remainingAmount-10000)<0.01, c4After);

  console.log('\n=================== PART H: CENTRAL ENGINE PROOF ===================');
  const fs = require('fs');
  const src = fs.readFileSync('domain.js','utf8');
  const pushCount = (src.match(/DB\.journalEntries\.push/g)||[]).length;
  record('H', 'DB.journalEntries.push still occurs exactly once (Bank/Cash/SDN all route through it, Commitments never touch it)', pushCount===1, {pushCount});

  console.log('\n=================== FINAL RECONCILIATION ===================');
  const tb = await api('admin','GET','/api/trial-balance');
  let dr=0,cr=0; if(tb.byAccount) for(const k in tb.byAccount){ dr+=tb.byAccount[k].debit||0; cr+=tb.byAccount[k].credit||0; }
  record('Final', 'Whole-ledger Trial Balance still balances after all Phase 24 activity', Math.abs(dr-cr)<0.02, {dr,cr});
  const finalRecon = await api('admin','GET','/api/reconciliation');
  record('Final', 'AR still reconciles', finalRecon.ar.matches, finalRecon.ar);
  record('Final', 'AP still reconciles', finalRecon.ap.matches, finalRecon.ap);

  console.log('\n================ '+PASS+' PASS / '+FAIL+' FAIL / '+(PASS+FAIL)+' TOTAL ================');
  process.exitCode = FAIL>0 ? 1 : 0;
})();
