'use strict';
// ERP-059A Part 6 — Transaction Contract Test (permanent regression).
// Proves the login fix did NOT weaken the withTransaction() rollback contract for anything else:
// (a) ordinary business-rejection mutations STILL roll back cleanly across Finance/Procurement/
// Inventory/Logistics/Workflow, and (b) login's security bookkeeping DOES now persist, in
// deliberate contrast. Run against a disposable isolated server ONLY — never production.
const BASE = process.argv[2] || 'http://localhost:4093';
const jars = {};
const results = [];
function record(name, pass, detail){ results.push({name, pass, detail}); }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r = await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
async function counts(){
  const [je, gc] = await Promise.all([api('admin','GET','/api/journal-entries'), api('admin','GET','/api/audit-log')]);
  return { journalEntries: (je.journalEntries||[]).length, auditLog: (gc.auditLog||[]).length };
}

async function main(){
  await login('admin','Admin@12345');
  await api('admin','POST','/api/test/reset');
  await login('admin','Admin@12345');
  await login('purchase1','Pur@12345');
  await login('finance1','Fin@12345');

  // ===== BUSINESS REJECTION #1 — invalid journal (ERP-023, negative debit) must still roll back =====
  const c1 = await counts();
  const d = await api('finance1','POST','/api/journal/draft',{date:'2026-09-10', narration:'contract test bad JE', lines:[{account:'1000',debit:-1,credit:0},{account:'1000',debit:0,credit:-1}]});
  await api('finance1','POST',`/api/journal/${d.draft.id}/submit`,{});
  await api('admin','POST',`/api/journal/${d.draft.id}/approve`,{});
  const badPost = await api('admin','POST',`/api/journal/${d.draft.id}/post`,{});
  const c2 = await counts();
  record('Invalid JE (negative debit) is rejected AND leaves journalEntries count unchanged', badPost.ok===false && c2.journalEntries===c1.journalEntries, {before:c1.journalEntries, after:c2.journalEntries, rejectResult:badPost.ok});

  // ===== BUSINESS REJECTION #2 — invalid GRN (ERP-026, negative qty) must still roll back =====
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:100, uom:'nos'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`,{});
  await api('admin','POST',`/api/purchase-orders/${po.po.id}/approve`,{});
  const listBefore = await api('purchase1','GET','/api/purchase-orders');
  const poBefore = (listBefore.purchaseOrders||[]).find(x=>x.id===po.po.id);
  const badGrn = await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:-5, qtyRejected:0, uom:'nos'}]});
  const listAfter = await api('purchase1','GET','/api/purchase-orders');
  const poAfter = (listAfter.purchaseOrders||[]).find(x=>x.id===po.po.id);
  record('Invalid GRN (negative qty) is rejected AND leaves PO qtyReceivedByLine unchanged', badGrn.ok===false && JSON.stringify(poBefore.qtyReceivedByLine)===JSON.stringify(poAfter.qtyReceivedByLine), {rejectResult:badGrn.ok, before:poBefore.qtyReceivedByLine, after:poAfter.qtyReceivedByLine});

  // ===== BUSINESS REJECTION #3 — invalid PO (ERP-029, negative line qty) must still roll back, zero POs created =====
  const posBefore = await api('purchase1','GET','/api/purchase-orders');
  const countBefore = (posBefore.purchaseOrders||[]).length;
  const badPo = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:-10, rate:100, uom:'nos'}]});
  const posAfter = await api('purchase1','GET','/api/purchase-orders');
  const countAfter = (posAfter.purchaseOrders||[]).length;
  record('Invalid PO (negative line qty) is rejected AND creates zero PO records', badPo.ok===false && countAfter===countBefore, {rejectResult:badPo.ok, before:countBefore, after:countAfter});

  // ===== BUSINESS REJECTION #4 — invalid inventory movement (fake material on dispatch) must roll back =====
  const dspBefore = await api('purchase1','GET','/api/dispatches');
  const dspCountBefore = (dspBefore.dispatches||[]).length;
  const badDispatch = await api('purchase1','POST','/api/dispatches',{projectId:'PRJ-1', customerId:'CUST-1', items:[{materialId:'MAT-DOES-NOT-EXIST', qty:5}]});
  const dspAfter = await api('purchase1','GET','/api/dispatches');
  const dspCountAfter = (dspAfter.dispatches||[]).length;
  record('Invalid dispatch (fake material) is rejected AND creates zero dispatch records', badDispatch.ok===false && dspCountAfter===dspCountBefore, {rejectResult:badDispatch.ok, before:dspCountBefore, after:dspCountAfter});

  // ===== BUSINESS REJECTION #5 — rejected workflow (SoD self-approval on a Manual JE) must roll back =====
  const d2 = await api('finance1','POST','/api/journal/draft',{date:'2026-09-10', narration:'contract test SoD', lines:[{account:'1000',debit:10,credit:0},{account:'2000',debit:0,credit:10}]});
  await api('finance1','POST',`/api/journal/${d2.draft.id}/submit`,{});
  const selfApprove = await api('finance1','POST',`/api/journal/${d2.draft.id}/approve`,{}); // finance1 approving their OWN draft -> SoD violation
  const draftAfterSelfApprove = await api('admin','GET','/api/journal-drafts');
  const stillSubmitted = (draftAfterSelfApprove.drafts||[]).find(x=>x.id===d2.draft.id)?.status === 'Submitted';
  record('SoD-violating self-approval is rejected AND the draft status is unchanged (still Submitted)', selfApprove.ok===false && stillSubmitted, {rejectResult:selfApprove.ok, draftStatus: (draftAfterSelfApprove.drafts||[]).find(x=>x.id===d2.draft.id)?.status});

  // ===== SECURITY EVENT — login DOES now persist (the fix itself, in deliberate contrast to #1-5) =====
  for(let i=0;i<5;i++) await login('sales1','wrongpw'+i);
  const auditFinal = await api('admin','GET','/api/audit-log');
  const sales1Deny = (auditFinal.loginHistory||[]).filter(h=>h.username==='sales1' && h.result==='DENY');
  record('Login failures DO persist (5 DENY entries recorded) -- the fix works, in contrast to #1-5 above which correctly still roll back', sales1Deny.length===5, {denyCount: sales1Deny.length});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log(`\n=== TRANSACTION CONTRACT TEST: ${pass}/${results.length} passed ===\n`);
  results.forEach(r=>console.log(`${r.pass?'PASS':'FAIL'} ${r.name}${r.pass?'':' -- '+JSON.stringify(r.detail)}`));
  if(fail>0) process.exitCode=1;
}
main().catch(e=>{ console.error('TEST RUNNER CRASHED:', e); process.exitCode=1; });
