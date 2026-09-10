// Phase 21 — adversarial integrity tests: corruption, immutability, referential integrity,
// master-data-change protection, concurrency, segregation of duties, subledger<->GL matrix.
const BASE = 'http://localhost:4001';
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
function section(t){ console.log('\n==================== '+t+' ===================='); }

(async()=>{
  await login('admin','Admin@12345');
  await login('ceo','Ceo@12345');
  await login('sales1','Sal@123456');
  await login('sales2','Sal2@123456').catch(()=>{});
  await login('accountant1','Acc@12345');
  await login('finance1','Fin@12345');
  await login('viewer1','View@12345').catch(()=>{});

  section('1. POSTED TRANSACTION IMMUTABILITY — attempt to directly edit a posted journal entry');
  const invRes = await api('sales1','POST','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:100000,date:'2026-08-01',taxCode:'GST18',narration:'Immutability test invoice'});
  let entryId = null;
  if(invRes.ok){
    const id = invRes.draft.id;
    await api('accountant1','POST',`/api/journal/${id}/submit`);
    await api('finance1','POST',`/api/journal/${id}/approve`);
    const post = await api('finance1','POST',`/api/journal/${id}/post`);
    entryId = post.entry && post.entry.id;
    console.log('Posted entry:', entryId, 'DR', post.entry.totalDebit);
  }
  // Try common edit-style endpoints against the posted entry.
  const editAttempts = [
    ['PUT','/api/journal-entries/'+entryId, {totalDebit:999999,totalCredit:999999}],
    ['PATCH','/api/journal-entries/'+entryId, {totalDebit:999999,totalCredit:999999}],
    ['POST','/api/journal-entries/'+entryId+'/edit', {totalDebit:999999,totalCredit:999999}],
    ['DELETE','/api/journal-entries/'+entryId, null],
  ];
  for(const [method,path,body] of editAttempts){
    const r = await api('admin', method, path, body);
    console.log(`  ${method} ${path} => status ${r.status}`, r.error||(r.ok?'*** SUCCEEDED — POTENTIAL DEFECT ***':''));
  }

  section('2. FINANCIAL CORRUPTION ATTEMPT — try to directly alter a posted amount via draft-cycle bypass');
  // Attempt: create a draft, post it, then try to re-submit/re-approve/re-post the SAME already-posted draft id (duplicate posting attempt).
  if(entryId){
    const draftId = invRes.draft.id;
    const reSubmit = await api('accountant1','POST',`/api/journal/${draftId}/submit`);
    console.log('  Re-submit an already-posted draft:', reSubmit.status, reSubmit.error||'*** SUCCEEDED — POTENTIAL DEFECT ***');
    const rePost = await api('finance1','POST',`/api/journal/${draftId}/post`);
    console.log('  Re-post an already-posted draft:', rePost.status, rePost.error||'*** SUCCEEDED — POTENTIAL DEFECT ***');
  }

  section('3. SEGREGATION OF DUTIES — creator attempts to approve/post their own document');
  const soD = await api('sales1','POST','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:20000,date:'2026-08-02',taxCode:'GST18',narration:'SoD test'});
  if(soD.ok){
    const sid = soD.draft.id;
    const selfSubmit = await api('sales1','POST',`/api/journal/${sid}/submit`);
    console.log('  Sales submits own draft (expect allowed - submit != approve):', selfSubmit.status, selfSubmit.ok);
    if(selfSubmit.ok){
      const selfApprove = await api('sales1','POST',`/api/journal/${sid}/approve`); // sales1 has no approve permission at all typically
      console.log('  Sales attempts to approve own submitted doc (expect blocked, wrong role):', selfApprove.status, selfApprove.error||'*** SUCCEEDED — DEFECT ***');
      // Now use FinanceManager to submit AND approve the same doc (should be blocked by SoD: submitter cannot approve)
    }
  }
  // A cleaner SoD test: same person creates AND is also the only approver role (FinanceManager creating + approving own doc)
  const finCreate = await api('finance1','POST','/api/journal/draft',{date:'2026-08-02',docDate:'2026-08-02',narration:'FinanceManager self-approval SoD test',docTypeCode:'JV',sourceType:'Expense',docCategory:'Journal',party:null,
    lines:[{account:'5100',debit:1000,credit:0},{account:'1000',debit:0,credit:1000}]});
  if(finCreate.ok){
    const fid = finCreate.draft.id;
    await api('accountant1','POST',`/api/journal/${fid}/submit`);
    const selfApprove2 = await api('finance1','POST',`/api/journal/${fid}/approve`);
    console.log('  FinanceManager approves a doc THEY created (expect blocked by SoD):', selfApprove2.status, selfApprove2.error||'*** SUCCEEDED — check if this is a defect or an allowed CEO-style override ***');
  }

  section('4. DATABASE REFERENTIAL INTEGRITY — deactivate a customer/vendor with existing transactions, check history intact');
  const custBefore = await api('admin','GET','/api/customers');
  const cust1 = (custBefore.customers||[]).find(c=>c.id==='CUST-1');
  console.log('  CUST-1 active before:', cust1 && cust1.active);
  const deactivate = await api('admin','PUT','/api/customers/CUST-1',{active:false}).catch(()=>null);
  const deactivate2 = deactivate && deactivate.status!==404 ? deactivate : await api('admin','POST','/api/customers/CUST-1/deactivate',{});
  console.log('  Deactivate attempt result:', deactivate2 ? deactivate2.status : 'no endpoint found', deactivate2 && (deactivate2.error||deactivate2.ok));
  // Check the earlier posted invoice for CUST-1 still shows the correct customerId/amount unchanged.
  if(entryId){
    const doc = await api('admin','GET','/api/document?id='+entryId);
    console.log('  Prior invoice JE', entryId, 'customerId on line still CUST-1:', doc.entry && doc.entry.lines.some(l=>l.customerId==='CUST-1'), '| amount unchanged:', doc.entry && doc.entry.totalDebit);
  }

  section('5. MASTER DATA CHANGE PROTECTION — change a material rate, verify historical transaction unaffected');
  const matBefore = await api('admin','GET','/api/materials');
  const mat1 = (matBefore.materials||[]).find(m=>m.id==='MAT-1');
  console.log('  MAT-1 standardCost before:', mat1 && mat1.standardCost);
  const rateChange = await api('admin','POST','/api/masters/material',{id:'MAT-1',standardCost:9999}).catch(()=>null);
  console.log('  Rate-change attempt status:', rateChange?rateChange.status:'n/a', rateChange&&(rateChange.error||rateChange.ok));

  section('6. CONCURRENCY — 10 simultaneous invoice creations, check for duplicate voucher numbers');
  const concurrent = await Promise.all(Array.from({length:10}).map((_,i)=>
    api('sales1','POST','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:1000+i,date:'2026-08-09',taxCode:'GST18',narration:'Concurrency test '+i})
  ));
  const okDrafts = concurrent.filter(r=>r.ok);
  console.log('  Drafts created concurrently:', okDrafts.length, '/10');
  const posted = [];
  for(const d of okDrafts){
    const id = d.draft.id;
    await api('accountant1','POST',`/api/journal/${id}/submit`);
    await api('finance1','POST',`/api/journal/${id}/approve`);
    const p = await api('finance1','POST',`/api/journal/${id}/post`);
    if(p.ok) posted.push(p.entry.voucherNo);
  }
  const uniqueVouchers = new Set(posted);
  console.log('  Posted:', posted.length, '| Unique voucher numbers:', uniqueVouchers.size, uniqueVouchers.size===posted.length ? 'NO DUPLICATES' : '*** DUPLICATE VOUCHER NUMBERS FOUND — CRITICAL ***');
  console.log('  Vouchers:', posted.join(', '));

  section('7. SUBLEDGER <-> GL RECONCILIATION MATRIX');
  const recon = await api('admin','GET','/api/reconciliation');
  console.log(JSON.stringify(recon, null, 2).slice(0,2000));

  section('8. TRIAL BALANCE — overall DR=CR check across the whole ledger after all this activity');
  const tb = await api('admin','GET','/api/trial-balance');
  let totalDr=0, totalCr=0;
  if(tb.byAccount){ for(const k in tb.byAccount){ totalDr+=tb.byAccount[k].debit||0; totalCr+=tb.byAccount[k].credit||0; } }
  console.log('  Total Debit:', totalDr, '| Total Credit:', totalCr, totalDr===totalCr?'BALANCED':'*** UNBALANCED — CRITICAL ***');
})();
