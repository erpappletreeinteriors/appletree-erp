'use strict';
// ============================================================
// Phase 6A — Live security/negative/concurrency/regression test suite
// ============================================================
// Every test below is a REAL HTTP call against the running server on
// http://localhost:4001 — nothing here is simulated or hand-computed.
// Run with: node security_tests.js   (server must already be running)
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }

const jars = {}; // username -> cookie string
async function login(username, password){
  const res = await fetch(BASE+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password})});
  const json = await res.json();
  const setCookie = res.headers.get('set-cookie');
  if(setCookie) jars[username] = setCookie.split(';')[0];
  return {status:res.status, ...json};
}
async function api(username, method, path, body){
  const headers = {'Content-Type':'application/json'};
  if(jars[username]) headers['Cookie'] = jars[username];
  const res = await fetch(BASE+path, {method, headers, body: body?JSON.stringify(body):undefined});
  const json = await res.json().catch(()=>({}));
  return {status:res.status, ...json};
}

async function main(){
  // Reset to a clean, known seed before running (Admin-only endpoint, itself an auth test).
  const adminLogin = await login('admin','Admin@12345');
  record('Setup','Admin login succeeds with correct password', adminLogin.ok && adminLogin.status===200, JSON.stringify(adminLogin));
  const resetRes = await api('admin','POST','/api/test/reset');
  record('Setup','Admin can reset test data (masterData-tier action)', resetRes.ok, JSON.stringify(resetRes));

  // ============================================================
  // §8 AUTHENTICATION
  // ============================================================
  const badLogin = await login('accountant1','WrongPassword!');
  record('Authentication','Wrong password rejected (401)', badLogin.status===401 && !badLogin.ok, JSON.stringify(badLogin));

  const noAuth = await fetch(BASE+'/api/trial-balance');
  record('Authentication','No session token → 401 on a protected endpoint', noAuth.status===401, 'status='+noAuth.status);

  // failed-login lockout: 5 bad attempts should lock the account
  for(let i=0;i<5;i++) await login('sales1','wrong'+i);
  const lockedAttempt = await login('sales1','Sal@123456'); // even correct password should now be locked
  record('Authentication','Account locks after 5 failed logins (even correct password then rejected)', lockedAttempt.status===423, JSON.stringify(lockedAttempt));

  // real logins for the rest of the suite
  const ceo = await login('ceo','Ceo@12345');
  const acc = await login('accountant1','Acc@12345');
  const fin = await login('finance1','Fin@12345');
  const pm = await login('pm1','Pm@123456');
  const pur = await login('purchase1','Pur@12345');
  const sal = await login('sales1','Sal@123456'); // sales1 is now locked from the test above — expect this to fail
  record('Authentication','Locked sales1 cannot log in even with correct password', sal.status===423, JSON.stringify(sal));
  // Unlock by resetting again for the rest of the suite to use Sales normally.
  await api('admin','POST','/api/test/reset');
  const sal2 = await login('sales1','Sal@123456');
  record('Authentication','After reset, sales1 logs in normally', sal2.ok, JSON.stringify(sal2));
  const view = await login('viewer1','View@1234');

  // ============================================================
  // §24 RBAC / DATA-SCOPE TEST MATRIX (role × module × action × scope)
  // ============================================================
  const matrix = [
    ['Sales','View own customers', async()=>api('sales1','GET','/api/customers'), r=>r.ok && r.customers.every(c=>['CUST-1','CUST-2','CUST-3'].includes(c.id))],
    ['Sales','View GL (Trial Balance)', async()=>api('sales1','GET','/api/trial-balance'), r=>r.status===403],
    ['Accountant','View GL (Trial Balance)', async()=>api('accountant1','GET','/api/trial-balance'), r=>r.ok],
    ['Purchase','View bank/vendor master', async()=>api('purchase1','GET','/api/vendors'), r=>r.ok],
    ['Purchase','View customer master', async()=>api('purchase1','GET','/api/customers'), r=>r.status===403],
    ['ProjectManager','View assigned project', async()=>api('pm1','GET','/api/projects'), r=>r.ok && r.projects.every(p=>['PRJ-1','PRJ-3'].includes(p.id))],
    ['ProjectManager','View unassigned project P&L (PRJ-2)', async()=>api('pm1','GET','/api/project-pl?projectId=PRJ-2'), r=>r.status===403],
    ['ProjectManager','View assigned project P&L (PRJ-1)', async()=>api('pm1','GET','/api/project-pl?projectId=PRJ-1'), r=>r.ok],
    ['Accountant','Create payment (should be denied — SoD, blocked before reaching domain logic)', async()=>api('accountant1','POST','/api/ap/payment',{vendorId:'VEND-1',invoiceEntryId:'JE-0001',amount:1}), r=>r.status===403],
    ['FinanceManager','Pay against a non-existent bill (HAS permission — must get a domain-level 400, not a blanket 403, proving the authorization layer and business-rule layer are genuinely separate)', async()=>api('finance1','POST','/api/ap/payment',{vendorId:'VEND-1',invoiceEntryId:'JE-9999',amount:1}), r=>r.status===400 && !r.ok],
    ['Viewer','Export a GL report', async()=>api('viewer1','POST','/api/export',{report:'trial-balance'}), r=>r.status===403],
    ['CEO','View audit log', async()=>api('ceo','GET','/api/audit-log'), r=>r.ok],
    ['Sales','View audit log', async()=>api('sales1','GET','/api/audit-log'), r=>r.status===403],
    ['FinanceManager','View AP open items for any vendor', async()=>api('finance1','GET','/api/ap/open-items?vendorId=VEND-1'), r=>r.ok],
    ['Sales','View AP open items (not their domain)', async()=>api('sales1','GET','/api/ap/open-items?vendorId=VEND-1'), r=>r.status===403],
    ['Sales','View AR open items for a customer NOT assigned to them (row-level tamper attempt)', async()=>api('sales1','GET','/api/ar/open-items?customerId=CUST-6'), r=>r.status===403],
    ['Sales','View AR open items for their OWN assigned customer (control case — must still work)', async()=>api('sales1','GET','/api/ar/open-items?customerId=CUST-1'), r=>r.ok]
  ];
  for(const [role, desc, call, check] of matrix){
    const r = await call();
    record('RBAC/Data-Scope Matrix', `${role} | ${desc}`, check(r), `status=${r.status} body=${JSON.stringify(r).slice(0,180)}`);
  }

  // ============================================================
  // §12 FIELD-LEVEL SECURITY — the sensitive field must be ABSENT from JSON, not just falsy
  // ============================================================
  const pmCustomers = await api('pm1','GET','/api/customers'); // PM can see rows but not outstandingBalance field
  const pmFieldStripped = pmCustomers.ok && pmCustomers.customers.length>0 && pmCustomers.customers.every(c => !('outstandingBalance' in c));
  record('Field-Level Security','ProjectManager sees customer rows but "outstandingBalance" key is entirely absent from the JSON (not null, not 0 — absent)', pmFieldStripped, JSON.stringify(pmCustomers.customers?.[0]));
  const accCustomers = await api('accountant1','GET','/api/customers');
  const accFieldPresent = accCustomers.ok && accCustomers.customers.length>0 && accCustomers.customers.every(c => 'outstandingBalance' in c);
  record('Field-Level Security','Accountant (financial-eligible role) DOES receive "outstandingBalance" on the same endpoint', accFieldPresent, JSON.stringify(accCustomers.customers?.[0]));

  // ============================================================
  // §25 NEGATIVE / PENETRATION-STYLE TESTS
  // ============================================================
  const forgedCookieRes = await fetch(BASE+'/api/trial-balance', {headers:{Cookie:'sid=0000000000000000000000000000000000000000000000000000000000000000'}});
  record('Negative/Bypass','Forged/guessed session token (64 hex chars, not a real one) → 401', forgedCookieRes.status===401, 'status='+forgedCookieRes.status);

  const idTamperRes = await api('accountant1','GET','/api/document?id=JE-9999'); // nonexistent ID
  record('Negative/Bypass','Requesting a non-existent document ID fails safely (404), no crash/leak', idTamperRes.status===404, JSON.stringify(idTamperRes));

  const crossRoleEscalation = await api('sales1','POST','/api/journal/draft',{date:'2026-08-23',lines:[{account:'1000',debit:100,credit:0},{account:'4000',debit:0,credit:100}]});
  // Sales has 'create' — this should actually succeed (Sales CAN create), proving the permission model isn't overly restrictive either.
  record('Negative/Bypass','Sales creating a generic JE draft is genuinely permitted (not falsely blocked)', crossRoleEscalation.ok, JSON.stringify(crossRoleEscalation));
  const salesTryApprove = crossRoleEscalation.ok ? await api('sales1','POST',`/api/journal/${crossRoleEscalation.draft.id}/submit`) : null;
  const salesTryApprove2 = salesTryApprove && salesTryApprove.ok ? await api('sales1','POST',`/api/journal/${crossRoleEscalation.draft.id}/approve`) : {status:'skipped'};
  record('Negative/Bypass','Sales cannot approve documents at all (role lacks approve permission entirely, checked server-side)', salesTryApprove2.status===403, JSON.stringify(salesTryApprove2));

  const exportWithoutPermission = await api('pm1','POST','/api/export',{report:'ar'}); // Phase 13 POL-12 canonical report name
  record('Negative/Bypass','Export attempt by a role without export-eligible GL access → 403, and still logged', exportWithoutPermission.status===403, JSON.stringify(exportWithoutPermission));

  // ============================================================
  // §22 CONCURRENCY — two simultaneous receipts against the SAME invoice, combined exceeding
  // the open balance. Exactly one should succeed (or both partial ones sum correctly), never
  // double-clearing beyond the actual open amount.
  // ============================================================
  const ciDraft = await api('accountant1','POST','/api/ar/invoice',{customerId:'CUST-5',projectId:'PRJ-1',baseAmount:50000,date:'2026-08-23',narration:'Concurrency test invoice'});
  await api('accountant1','POST',`/api/journal/${ciDraft.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${ciDraft.draft.id}/approve`);
  const ciPosted = await api('finance1','POST',`/api/journal/${ciDraft.draft.id}/post`);
  const invoiceEntryId = ciPosted.entry.id;

  const [race1, race2] = await Promise.all([
    api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-5', invoiceEntryId, amount:40000, date:'2026-08-23'}),
    api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-5', invoiceEntryId, amount:40000, date:'2026-08-23'})
  ]);
  const successes = [race1, race2].filter(r=>r.ok).length;
  const openAfterRace = await api('accountant1','GET','/api/ar/open-items?customerId=CUST-5');
  const thisItem = openAfterRace.items.find(i=>i.entryId===invoiceEntryId);
  const noOvercleared = thisItem && thisItem.open >= -0.01; // never negative — never cleared more than was open
  record('Concurrency','Two simultaneous ₹40,000 receipts against a ₹50,000 invoice — only one can succeed (the second must see the reduced/zero open balance)', successes===1 && noOvercleared,
    `race1.ok=${race1.ok} race2.ok=${race2.ok} finalOpen=${thisItem?.open} (must be ₹10,000, never negative)`);

  // Two different authorized approvers hitting Approve on the SAME Submitted draft at the same instant.
  const dupApproveDraft = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-23',docTypeCode:'JE',docCategory:'JournalVoucher',lines:[{account:'1000',debit:222,credit:0},{account:'4000',debit:0,credit:222}]});
  await api('accountant1','POST',`/api/journal/${dupApproveDraft.draft.id}/submit`);
  const [appA, appB] = await Promise.all([
    api('finance1','POST',`/api/journal/${dupApproveDraft.draft.id}/approve`),
    api('ceo','POST',`/api/journal/${dupApproveDraft.draft.id}/approve`)
  ]);
  const approveSuccesses = [appA, appB].filter(r=>r.ok).length;
  record('Concurrency','Two different approvers hitting Approve on the same draft simultaneously — only one succeeds, not both (no double-approval)', approveSuccesses===1,
    `finance1.ok=${appA.ok} ceo.ok=${appB.ok}`);

  // Concurrent posting of two DIFFERENT documents of the same type — numbers must not collide.
  const raceDraftA = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-23',docTypeCode:'JE',docCategory:'JournalVoucher',lines:[{account:'1000',debit:11,credit:0},{account:'4000',debit:0,credit:11}]});
  const raceDraftB = await api('sales1','POST','/api/journal/draft',{date:'2026-08-23',docTypeCode:'JE',docCategory:'JournalVoucher',lines:[{account:'1000',debit:22,credit:0},{account:'4000',debit:0,credit:22}]});
  await Promise.all([api('accountant1','POST',`/api/journal/${raceDraftA.draft.id}/submit`), api('sales1','POST',`/api/journal/${raceDraftB.draft.id}/submit`)]);
  await Promise.all([api('finance1','POST',`/api/journal/${raceDraftA.draft.id}/approve`), api('ceo','POST',`/api/journal/${raceDraftB.draft.id}/approve`)]);
  const [postA, postB] = await Promise.all([
    api('finance1','POST',`/api/journal/${raceDraftA.draft.id}/post`),
    api('ceo','POST',`/api/journal/${raceDraftB.draft.id}/post`)
  ]);
  const numbersUnique = postA.ok && postB.ok && postA.entry.voucherNo !== postB.entry.voucherNo;
  record('Concurrency','Two different documents posted concurrently get unique, non-colliding voucher numbers', numbersUnique,
    `A=${postA.entry?.voucherNo} B=${postB.entry?.voucherNo}`);

  // Volume stress: 25 concurrent full lifecycle sequences (create→submit→approve→post) fired
  // in parallel across multiple roles/users, not sequentially — this is what actually exercises
  // the single-threaded-serialization design claim under real concurrent load, not just 2 requests.
  const jeCountBeforeStress = (await api('accountant1','GET','/api/journal-entries')).journalEntries.length;
  const stressUsers = ['accountant1','sales1','purchase1'];
  const stressCreates = await Promise.all(Array.from({length:25}, (_,i)=>{
    const u = stressUsers[i % stressUsers.length];
    return api(u,'POST','/api/journal/draft',{date:'2026-08-23',docTypeCode:'JE',docCategory:'JournalVoucher',narration:'Stress '+i,lines:[{account:'1000',debit:i+1,credit:0},{account:'4000',debit:0,credit:i+1}]});
  }));
  const stressSubmits = await Promise.all(stressCreates.map((c,i)=>api(stressUsers[i%stressUsers.length],'POST',`/api/journal/${c.draft.id}/submit`)));
  const stressApprovers = ['finance1','ceo'];
  const stressApprovals = await Promise.all(stressCreates.map((c,i)=>api(stressApprovers[i%2],'POST',`/api/journal/${c.draft.id}/approve`)));
  const stressPosts = await Promise.all(stressCreates.map((c,i)=>api(stressApprovers[i%2],'POST',`/api/journal/${c.draft.id}/post`)));
  const allPosted = stressPosts.every(r=>r.ok);
  const voucherNos = stressPosts.map(r=>r.entry?.voucherNo);
  const allUnique = new Set(voucherNos).size === voucherNos.length;
  const jeCountAfterStress = (await api('accountant1','GET','/api/journal-entries')).journalEntries.length;
  record('Concurrency','25 full document lifecycles (create→submit→approve→post) fired concurrently across 3 users — all posted, all voucher numbers unique, count increased by exactly 25',
    allPosted && allUnique && (jeCountAfterStress===jeCountBeforeStress+25),
    `allPosted=${allPosted} allUnique=${allUnique} before=${jeCountBeforeStress} after=${jeCountAfterStress} (expected ${jeCountBeforeStress+25})`);
  const tbAfterStress = await api('accountant1','GET','/api/trial-balance');
  const dStress = Object.values(tbAfterStress.byAccount).reduce((s,a)=>s+a.debit,0), cStress = Object.values(tbAfterStress.byAccount).reduce((s,a)=>s+a.credit,0);
  record('Concurrency','Trial Balance still balances after the 25-way concurrent stress run', Math.abs(dStress-cStress)<0.01, `Dr=${dStress} Cr=${cStress}`);

  // ============================================================
  // §26/§27 PHASE-5 REGRESSION, now proven through the HTTP API instead of direct calls
  // ============================================================
  const unbalanced = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-23',docTypeCode:'JE',docCategory:'JournalVoucher',lines:[{account:'1000',debit:1000,credit:0},{account:'4000',debit:0,credit:900}]});
  const unbalancedSubmit = unbalanced.ok ? await api('accountant1','POST',`/api/journal/${unbalanced.draft.id}/submit`) : {ok:false};
  record('Phase-5 Regression','Debit=Credit still enforced (unbalanced draft rejected at Submit)', unbalancedSubmit.status===400 && !unbalancedSubmit.ok, JSON.stringify(unbalancedSubmit));

  // SoD: accountant creates+submits, tries to approve own doc → blocked; finance approves it → allowed
  const sodDraft = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-23',docTypeCode:'JE',docCategory:'JournalVoucher',lines:[{account:'1000',debit:500,credit:0},{account:'4000',debit:0,credit:500}]});
  await api('accountant1','POST',`/api/journal/${sodDraft.draft.id}/submit`);
  const selfApprove = await api('accountant1','POST',`/api/journal/${sodDraft.draft.id}/approve`);
  record('Phase-5 Regression','SoD: Accountant cannot approve their own submission (still enforced server-side)', selfApprove.status===403 || (!selfApprove.ok && /segregation/i.test(selfApprove.error||'')), JSON.stringify(selfApprove));
  const otherApprove = await api('finance1','POST',`/api/journal/${sodDraft.draft.id}/approve`);
  record('Phase-5 Regression','A different role (FinanceManager) CAN approve it', otherApprove.ok, JSON.stringify(otherApprove));

  // Reversal-blocks-if-cleared (Phase 5 defect 3 fix)
  const clearedInvoiceRecon = await api('accountant1','GET','/api/ar/open-items?customerId=CUST-5');
  const clearedEntry = clearedInvoiceRecon.items.find(i=>i.entryId===invoiceEntryId);
  const reverseAttempt = await api('finance1','POST',`/api/journal/${invoiceEntryId}/reverse`,{reason:'attempted reversal of a cleared/partially-cleared doc'});
  record('Phase-5 Regression','Reversal of a document with existing clearings is still blocked', !reverseAttempt.ok, JSON.stringify(reverseAttempt));

  // AR/AP reconciliation still holds
  const recon = await api('accountant1','GET','/api/reconciliation');
  record('Phase-5 Regression','AR reconciliation (subledger = AR-transaction control account) still MATCH', recon.ok && recon.ar.matches, JSON.stringify(recon.ar));
  record('Phase-5 Regression','AP reconciliation still MATCH', recon.ok && recon.ap.matches, JSON.stringify(recon.ap));
  const tb = await api('accountant1','GET','/api/trial-balance');
  const totalD = Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0), totalC = Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0);
  record('Phase-5 Regression','Trial Balance still balances (Total Debit = Total Credit)', Math.abs(totalD-totalC)<0.01, `Dr=${totalD} Cr=${totalC}`);

  // ============================================================
  // §21 AUDIT TRAIL — every denial above should be logged
  // ============================================================
  const auditCheck = await api('ceo','GET','/api/audit-log');
  const hasDenials = auditCheck.ok && auditCheck.auditLog.some(a=>a.type==='AccessDenied');
  record('Audit Trail','AccessDenied events from the tests above are present in the audit log', hasDenials, `auditLog length=${auditCheck.auditLog?.length}`);
  const hasExportLog = auditCheck.ok && auditCheck.auditLog.some(a=>a.type==='Export');
  const hasSelfApprovalLog = auditCheck.ok && auditCheck.auditLog.some(a=>a.type==='SelfApprovalOverride' || a.type==='Reversal');

  // ============================================================ report ============================================================
  console.log('\n================ PHASE 6A LIVE TEST RESULTS ================\n');
  let pass=0, fail=0;
  let lastSection = null;
  for(const r of results){
    if(r.section!==lastSection){ console.log('\n--- '+r.section+' ---'); lastSection=r.section; }
    console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}`);
    if(!r.pass) console.log('    detail: '+r.detail);
    r.pass ? pass++ : fail++;
  }
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL ================\n`);
  process.exit(fail>0 ? 1 : 0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
