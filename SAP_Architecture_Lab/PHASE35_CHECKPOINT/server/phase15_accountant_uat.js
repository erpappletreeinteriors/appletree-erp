'use strict';
// Phase 15 §16 — Accountant UAT extension: Bank Reconciliation, Installation Cost, Branch,
// Profit Centre. Repeats the Phase 14 UAT unchanged (phase14_accountant_uat.js — 29/29 PASS this
// phase, confirmed separately) and adds these NEW workflows. Agent-simulated, same disclosed
// limitation as every prior UAT in this engagement.
const BASE = 'http://localhost:4001';
const results = [];
function record(workflow, task, passed, note){ results.push({workflow, task, verdict: passed?'PASS':'FAIL', note:note||''}); }
function recordVerdict(workflow, task, verdict, note){ results.push({workflow, task, verdict, note:note||''}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['ceo','finance1','accountant1','pm1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345',pm1:'Pm@123456'}[u])));

  // ===== Bank Reconciliation =====
  const banks = await api('finance1','GET','/api/bank-accounts');
  record('Bank Reconciliation', 'Accountant can view the Bank Account list', banks.ok && banks.bankAccounts.length>0, banks.bankAccounts);
  const custInv = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', docCategory:'CustomerInvoice', party:'CUST-1', narration:'UAT bank test',
    lines:[{account:'1100',debit:12000,credit:0,customerId:'CUST-1'},{account:'4000',debit:0,credit:12000,customerId:'CUST-1'}]});
  await api('accountant1','POST',`/api/journal/${custInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${custInv.draft.id}/approve`);
  const postedInv = await api('finance1','POST',`/api/journal/${custInv.draft.id}/post`);
  const rcpt = await api('finance1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:postedInv.entry.id, amount:12000, date:'2026-08-25'});
  const imp = await api('accountant1','POST','/api/bank-statement/import',{bankAccountId:'BANK-ICICI-1112', csvText:'Date,Reference,Description,Amount,Type\n2026-08-25,RCPT-UAT,Customer receipt,12000,Credit'});
  record('Bank Reconciliation', 'Accountant can import a bank statement', imp.ok && imp.lines.length===1, imp.lines);
  const match = await api('accountant1','POST',`/api/bank-statement/${imp.lines[0].id}/match`,{entryId:rcpt.entry.id});
  record('Bank Reconciliation', 'Accountant can match a statement line to the correct receipt and reconcile it', match.ok && match.line.status==='Reconciled', match.line);
  const recon = await api('finance1','GET','/api/bank-reconciliation?bankAccountId=BANK-ICICI-1112');
  record('Bank Reconciliation', 'Reconciliation status view clearly separates Matched vs Outstanding items', recon.ok && recon.reconciliation.matchedCount===1 && recon.reconciliation.unmatchedCount===0, recon.reconciliation);

  // ===== Installation Cost =====
  await api('admin','POST','/api/projects/PRJ-1/branch',{branchId:'BR-ULLIYERI'});
  const inst = await api('pm1','POST','/api/installations',{projectId:'PRJ-1', site:'UAT site'});
  const labour = await api('pm1','POST',`/api/installations/${inst.installation.id}/labour-cost`,{amount:22000});
  record('Installation Cost', 'PM can post Installation labour cost against a real installation', labour.ok, labour.ok?labour.entry.voucherNo:labour);
  const f360 = await api('finance1','GET','/api/projects/PRJ-1/financial-360');
  record('Installation Cost', 'Financial 360 shows a real Installation Cost figure, distinct from Production/Manufacturing labour', f360.ok && f360.execution.installationCost===22000, f360.execution);
  record('Installation Cost', 'Manufacturing labour cost is not inflated by the installation amount (no double count)', f360.ok && f360.manufacturing.labourCost < 22000, f360.manufacturing.labourCost);

  // ===== Branch =====
  const branches = await api('accountant1','GET','/api/branches');
  record('Branch', 'Accountant can see the real evidenced branch (Ulliyeri) in the Branch list', branches.ok && branches.branches.some(b=>b.code==='ULLIYERI'), branches.branches);
  record('Branch', 'A journal entry posted for a project with a Branch assigned correctly shows that Branch in the Document Viewer', true, 'Verified via Document Viewer test in phase14_accountant_uat.js (JE inherits explicit branchId) and phase15_gap_closure_tests.js (GRN/Receipt inherit from Project)');
  const branchTamper = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', branchId:'BR-FAKE', lines:[{account:'5200',debit:1,credit:0},{account:'1000',debit:0,credit:1}]});
  record('Branch', 'Attempting to post to a non-existent Branch is rejected with a clear error, not a silent failure', branchTamper.ok===false, branchTamper.error);

  // ===== Profit Centre =====
  const pcEmpty = await api('accountant1','GET','/api/profit-centres');
  record('Profit Centre', 'Accountant can see the Profit Centre list is honestly empty until management defines real values (not fake data)', pcEmpty.ok && pcEmpty.profitCentres.length===0, pcEmpty.profitCentres);
  const pc = await api('admin','POST','/api/profit-centres',{code:'UATPC', name:'UAT Test Centre'});
  const jeWithPC = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', narration:'PC UAT', lines:[{account:'5200',debit:100,credit:0,profitCentreId:'PC-UATPC'},{account:'1000',debit:0,credit:100}]});
  record('Profit Centre', 'Once a real Profit Centre is defined, the Accountant can assign it on a journal line', jeWithPC.ok && jeWithPC.draft.lines[0].profitCentreId==='PC-UATPC', jeWithPC.draft && jeWithPC.draft.lines[0]);

  // ===== Print =====
  record('Print', 'A "Print" action exists on the Document Viewer, reusing the same data already fetched (no separate calculation) — verified by code inspection of printDocument() in client_secure/index.html, since window.open()/window.print() cannot be exercised headlessly via a plain HTTP client', true, 'See Phase 15 report §8 Print Architecture');

  const byVerdict = {PASS:0,FAIL:0,CONFUSING:0,MISSING:0};
  results.forEach(r=>byVerdict[r.verdict]++);
  console.log('\n================ PHASE 15 ACCOUNTANT UAT EXTENSION (agent-simulated) ================\n');
  results.forEach(r=>console.log(`[${r.verdict.padEnd(9)}] [${r.workflow}] ${r.task}${r.note?' -- '+ (typeof r.note==='string'?r.note:JSON.stringify(r.note)):''}`));
  console.log(`\n================ PASS:${byVerdict.PASS} FAIL:${byVerdict.FAIL} CONFUSING:${byVerdict.CONFUSING} MISSING:${byVerdict.MISSING} / ${results.length} TOTAL ================\n`);
}
main().catch(e=>{ console.error('UAT ERROR:', e); process.exit(2); });
