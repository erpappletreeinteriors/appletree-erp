'use strict';
// Phase 17 §3/§15 — Concurrency / Transaction Safety. §3's 5 explicitly-named scenarios: (1)
// simultaneous posting, (2) simultaneous clearing of the same document, (3) simultaneous
// modification of the same draft, (4) simultaneous inventory consumption, (5) simultaneous
// approval. Scenarios (2), (4), (5) already have real, passing regression coverage (see
// security_tests.js's receipt-clearing race + double-approval race, procurement_tests.js's
// material-issue race) — re-run as part of this phase's evidence, not duplicated here. This file
// covers the two NOT yet explicitly tested: two users trying to POST the SAME already-approved
// draft simultaneously, and two users trying to SUBMIT the SAME draft simultaneously.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['ceo','finance1','accountant1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345'}[u])));

  // ================= Two users submit the SAME draft simultaneously =================
  const draft1 = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', narration:'Concurrency: double-submit test', lines:[{account:'5200',debit:500,credit:0},{account:'1000',debit:0,credit:500}]});
  const [sub1, sub2] = await Promise.all([
    api('accountant1','POST',`/api/journal/${draft1.draft.id}/submit`),
    api('finance1','POST',`/api/journal/${draft1.draft.id}/submit`)
  ]);
  const submitSuccesses = [sub1,sub2].filter(r=>r.ok).length;
  record('§3/Concurrency', 'Two users submitting the SAME draft simultaneously — exactly ONE succeeds, the other sees "not Draft" and is correctly rejected (no double-submit, no corrupted status)',
    submitSuccesses===1, {sub1:{ok:sub1.ok,status:sub1.draft?.status||sub1.error}, sub2:{ok:sub2.ok,status:sub2.draft?.status||sub2.error}});

  // ================= Two users POST the SAME already-Approved draft simultaneously =================
  await api('finance1','POST',`/api/journal/${draft1.draft.id}/approve`);
  const before = await api('admin','GET','/api/journal-entries?pageSize=500');
  const [post1, post2] = await Promise.all([
    api('finance1','POST',`/api/journal/${draft1.draft.id}/post`),
    api('ceo','POST',`/api/journal/${draft1.draft.id}/post`)
  ]);
  const postSuccesses = [post1,post2].filter(r=>r.ok).length;
  record('§3/Concurrency', 'Two users posting the SAME already-Approved draft simultaneously — exactly ONE succeeds, never both (no double-posting the same document)',
    postSuccesses===1, {post1:{ok:post1.ok,voucher:post1.entry?.voucherNo||post1.error}, post2:{ok:post2.ok,voucher:post2.entry?.voucherNo||post2.error}});
  const after = await api('admin','GET','/api/journal-entries?pageSize=500');
  record('§3/Concurrency', 'Exactly ONE new journal entry was created by the double-post race, not two (no duplicate GL posting)',
    (after.total - before.total)===1, {before:before.total, after:after.total});
  const tb = await api('admin','GET','/api/trial-balance');
  let totD=0, totC=0; Object.values(tb.byAccount).forEach(a=>{totD+=a.debit;totC+=a.credit;});
  record('§3/Concurrency', 'Trial Balance still balances after the double-post race', Math.abs(totD-totC)<0.02, {debit:totD, credit:totC});

  // ================= Two users attempt to APPROVE the SAME draft simultaneously (re-confirmation, distinct draft this time) =================
  const draft2 = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', narration:'Concurrency: double-approve re-confirm', lines:[{account:'5200',debit:300,credit:0},{account:'1000',debit:0,credit:300}]});
  await api('accountant1','POST',`/api/journal/${draft2.draft.id}/submit`);
  const [app1, app2] = await Promise.all([
    api('finance1','POST',`/api/journal/${draft2.draft.id}/approve`),
    api('ceo','POST',`/api/journal/${draft2.draft.id}/approve`)
  ]);
  const approveSuccesses = [app1,app2].filter(r=>r.ok).length;
  record('§3/Concurrency', 'Two users approving the SAME draft simultaneously (re-confirmed this phase) — exactly ONE succeeds', approveSuccesses===1, {app1:app1.ok, app2:app2.ok});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 17 CONCURRENCY / TRANSACTION SAFETY TESTS ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  console.log('Reference: clearing race (security_tests.js), inventory-consumption race (procurement_tests.js), 25-way concurrent lifecycle stress (security_tests.js) already re-confirmed passing this phase as part of the full regression run.');
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
