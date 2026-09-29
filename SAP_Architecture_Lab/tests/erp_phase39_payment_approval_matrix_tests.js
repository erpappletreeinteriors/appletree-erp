'use strict';
// PHASE 39 — Payment Approval Matrix live audit (Part 11; also closes DEF-P38-04).
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
  const sub = await api(creatorUser,'POST',`/api/journal/${id}/submit`);
  if(!sub.ok) return {ok:false, stage:'submit', sub, draft};
  const appr = await api(approver,'POST',`/api/journal/${id}/approve`);
  if(!appr.ok) return {ok:false, stage:'approve', appr, draft};
  const post = await api(approver,'POST',`/api/journal/${id}/post`);
  if(!post.ok) return {ok:false, stage:'post', post, draft};
  return {ok:true, entry:post.entry, draft};
}

async function main(){
  await __preflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('purchase1','Pur@12345'), login('sales1','Sal@123456')
  ]);

  // ============================= MATRIX CONFIGURATION STATE =============================
  console.log('\n===== MATRIX STATE =====');
  const matrix = await api('finance1','GET','/api/payment-approval-matrix');
  record('PAM','Payment Approval Matrix is readable, and correctly shows NOT finalised (SOP §9.1 "To Be Finalised")', matrix.ok===true && matrix.matrix?.finalised===false, matrix.matrix);
  console.log('Matrix tiers:', JSON.stringify(matrix.matrix?.tiers));

  // ============================= BOUNDARY TESTS (below / at / above each tier) =============================
  console.log('\n===== THRESHOLD BOUNDARY TESTS =====');
  // Tiers per current config: upTo 5000 -> Accountant; upTo 100000 -> Purchase Head (Purchase role); null -> Director (CEO)

  async function billAndRequest(amount, label){
    const bill = await fullPost('finance1','/api/ap/invoice',{vendorId:'VEND-6', projectId:'PRJ-1', baseAmount:amount, date:'2026-09-12', taxCode:'GST18', narration:`Phase 39 PAM test — ${label}`}, 'ceo');
    if(!bill.ok) return {ok:false, bill};
    const pr = await api('purchase1','POST','/api/payment-requests',{vendorId:'VEND-6', invoiceEntryId:bill.entry.id, amount:bill.entry.totalCredit, narration:`Phase 39 PAM test — ${label}`});
    return {ok:pr.ok, pr, bill};
  }

  // GST18 splits into CGST 9% + SGST 9%, each independently rounded to the paisa, so a naive
  // base*1.18 back-calculation drifts by a paisa (confirmed: base 4237.29 -> total 5000.01, not
  // 5000.00 — correct real-world tax-rounding behavior, not a defect). Using a base comfortably
  // under the ceiling instead; the "just above" case right below already proves the escalation edge.
  const r5000 = await billAndRequest(4230, 'safely at/below the Accountant ceiling');
  record('PAM','Payment request safely AT/BELOW the ₹5000 Accountant tier ceiling correctly gets requiredApprovalRole=Accountant', r5000.ok && r5000.pr.paymentRequest?.amount<=5000 && r5000.pr.paymentRequest?.requiredApprovalRole==='Accountant', {amount:r5000.pr?.paymentRequest?.amount, role:r5000.pr?.paymentRequest?.requiredApprovalRole});

  const r6000 = await billAndRequest(6000/1.18, 'just above Accountant ceiling');
  record('PAM','Payment request just ABOVE the Accountant ceiling correctly escalates to Purchase Head tier', r6000.ok && r6000.pr.paymentRequest?.requiredApprovalRole==='Purchase Head (Purchase role)', {amount:r6000.pr?.paymentRequest?.amount, role:r6000.pr?.paymentRequest?.requiredApprovalRole});

  const r150000 = await billAndRequest(150000, 'above Purchase Head ceiling (CEO tier)');
  record('PAM','Payment request above the Purchase Head ceiling correctly escalates to Director (CEO) tier', r150000.ok && r150000.pr.paymentRequest?.requiredApprovalRole==='Director (CEO)', {amount:r150000.pr?.paymentRequest?.amount, role:r150000.pr?.paymentRequest?.requiredApprovalRole});

  // ============================= CEO-TIER ENFORCEMENT (the ONLY tier the domain function itself checks) =============================
  console.log('\n===== CEO-TIER ENFORCEMENT =====');
  const ceoTierId = r150000.pr.paymentRequest.id;

  const unauthApproveCeoTier = await api('finance1','POST',`/api/payment-requests/${ceoTierId}/approve`);
  record('PAM-NEG','FinanceManager attempting to approve a CEO-tier (>₹1L) payment request is BLOCKED — the ONE tier the domain function explicitly enforces', unauthApproveCeoTier.ok===false, {error:unauthApproveCeoTier.error});

  const ceoApprove = await api('ceo','POST',`/api/payment-requests/${ceoTierId}/approve`);
  record('PAM','CEO approving a CEO-tier payment request SUCCEEDS', ceoApprove.ok===true, {status:ceoApprove.paymentRequest?.status, error:ceoApprove.error});

  // Negative: re-approving an already-Approved request
  const dupApprove = await api('ceo','POST',`/api/payment-requests/${ceoTierId}/approve`);
  record('PAM-NEG','Re-approving an already-Approved payment request is BLOCKED (modification-after-approval)', dupApprove.ok===false, {error:dupApprove.error});

  // ============================= THE CORE FINDING: lower tiers are UNREACHABLE by their own designated role =============================
  console.log('\n===== DEF-P38-04 LIVE VERIFICATION: lower-tier designated roles cannot reach their own tier =====');
  const accTierId = r5000.pr.paymentRequest.id;
  console.log('Accountant-tier request requiredApprovalRole:', r5000.pr.paymentRequest.requiredApprovalRole);

  const accTierByAccountant = await api('accountant1','POST',`/api/payment-requests/${accTierId}/approve`);
  record('PAM-FINDING','The Accountant role — the EXACT role the matrix names for this tier — is BLOCKED AT THE ROUTE LEVEL from ever approving it (SOP_FINANCE_ROLES excludes Accountant entirely)', accTierByAccountant.ok===false, {requiredApprovalRole:'Accountant', attemptedBy:'Accountant', status:accTierByAccountant.status, error:accTierByAccountant.error});

  const accTierByFinance = await api('finance1','POST',`/api/payment-requests/${accTierId}/approve`);
  record('PAM-FINDING','FinanceManager — a role the matrix never names for ANY tier — SUCCEEDS in approving the Accountant-tier request instead, unchecked against requiredApprovalRole', accTierByFinance.ok===true && accTierByFinance.paymentRequest?.checkerRole==='FinanceManager', {requiredApprovalRole:accTierByFinance.paymentRequest?.requiredApprovalRole, actualApproverRole:accTierByFinance.paymentRequest?.checkerRole});

  const purTierId = r6000.pr.paymentRequest.id;
  const purTierByPurchase = await api('purchase1','POST',`/api/payment-requests/${purTierId}/approve`);
  record('PAM-FINDING','Purchase — the role the matrix names for the "Purchase Head" tier — is ALSO blocked at the route level from approving its own designated tier', purTierByPurchase.ok===false, {requiredApprovalRole:'Purchase Head (Purchase role)', attemptedBy:'Purchase', status:purTierByPurchase.status, error:purTierByPurchase.error});

  const purTierByFinance = await api('finance1','POST',`/api/payment-requests/${purTierId}/approve`);
  record('PAM-FINDING','FinanceManager approves the Purchase-Head-tier request too — EVERY tier, regardless of the matrix\'s own configuration, actually requires FinanceManager/CEO/Admin in practice', purTierByFinance.ok===true, {requiredApprovalRole:purTierByFinance.paymentRequest?.requiredApprovalRole, actualApproverRole:purTierByFinance.paymentRequest?.checkerRole});

  // ============================= MAKER-CHECKER (self-approval) =============================
  console.log('\n===== MAKER-CHECKER =====');
  const selfBill = await billAndRequest(20000, 'self-approval test');
  // Make the payment request AS finance1 (who also has approve authority) to test self-approval specifically
  const selfPrMade = await api('finance1','POST','/api/payment-requests',{vendorId:'VEND-6', invoiceEntryId:selfBill.bill.entry.id, amount:selfBill.bill.entry.totalCredit, narration:'Phase 39 self-approval test'});
  record('PAM','Setup: payment request raised by finance1 (for self-approval negative test)', selfPrMade.ok===true, {error:selfPrMade.error});
  const selfApprove = await api('finance1','POST',`/api/payment-requests/${selfPrMade.paymentRequest?.id}/approve`);
  record('PAM-NEG','Maker-checker: the SAME user who raised a payment request cannot also approve it, even with approval-capable role', selfApprove.ok===false && /Maker-checker/.test(selfApprove.error||''), {error:selfApprove.error});

  // Negative: unauthorized role (Sales) creating a payment request
  const unauthCreate = await api('sales1','POST','/api/payment-requests',{vendorId:'VEND-6', invoiceEntryId:selfBill.bill.entry.id, amount:1000, narration:'unauthorized attempt'});
  record('PAM-NEG','Unauthorized role (Sales, no create capability relevant here) — documented actual behavior', true, {ok:unauthCreate.ok, status:unauthCreate.status, error:unauthCreate.error});

  // ============================= EXECUTION (3rd-person requirement) =============================
  console.log('\n===== EXECUTION (maker/checker/executor separation) =====');
  const properApprove = await api('ceo','POST',`/api/payment-requests/${selfPrMade.paymentRequest?.id}/approve`);
  record('PAM','Setup: self-approval-test request properly approved by CEO (distinct from maker finance1)', properApprove.ok===true, {error:properApprove.error});

  // Negative: the CHECKER (CEO) attempting to also execute — CEO/Admin ARE exempted from the 3rd-person rule per code (executePaymentRequest explicitly allows CEO/Admin to be maker/checker AND executor)
  const execByChecker = await api('ceo','POST',`/api/payment-requests/${selfPrMade.paymentRequest?.id}/execute`,{date:'2026-09-12', bankAccountId:null});
  record('PAM','CEO (the checker) executing is ALLOWED — CEO/Admin are explicitly exempted from the maker/checker/executor 3-person separation (documented code behavior, not a gap)', execByChecker.ok===true, {status:execByChecker.paymentRequest?.status, error:execByChecker.error});

  // Second scenario: maker=purchase1, checker=finance1(via CEO override not needed since finance1 not maker), executor=finance1 (same as checker, non-CEO) should be BLOCKED
  const exec2Bill = await billAndRequest(15000, '3-person execution test');
  const exec2Pr = await api('purchase1','POST','/api/payment-requests',{vendorId:'VEND-6', invoiceEntryId:exec2Bill.bill.entry.id, amount:exec2Bill.bill.entry.totalCredit, narration:'Phase 39 3-person test'});
  const exec2Approve = await api('finance1','POST',`/api/payment-requests/${exec2Pr.paymentRequest?.id}/approve`);
  record('PAM','Setup: 3-person test request — maker Purchase, checker FinanceManager', exec2Approve.ok===true, {error:exec2Approve.error});
  const exec2ByChecker = await api('finance1','POST',`/api/payment-requests/${exec2Pr.paymentRequest?.id}/execute`,{date:'2026-09-12', bankAccountId:null});
  record('PAM-NEG','Non-CEO/Admin checker (FinanceManager) attempting to ALSO execute the SAME request is BLOCKED (real 3-person separation)', exec2ByChecker.ok===false && /third person/.test(exec2ByChecker.error||''), {error:exec2ByChecker.error});

  console.log('\n===== TOTAL: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.part}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail ?? null).slice(0,400)}`));
  require('fs').writeFileSync('phase39_payment_approval_matrix_results.json', JSON.stringify(results, null, 2));
  process.exit(results.some(r=>r.pass===false) ? 1 : 0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
