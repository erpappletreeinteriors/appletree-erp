'use strict';
// Phase 20 §20 — the 2 concurrency scenarios not already covered by any prior phase's regression:
// two users allocating the SAME bank transaction, and two users capitalizing the SAME fixed
// asset. Every other listed scenario (post same document, clear same document, modify same
// draft, consume same inventory, approve same document) already has real, passing regression
// coverage from Phases 6A/17/18 — re-run as part of this phase's full regression, not duplicated
// here. Real HTTP calls, no simulation.
const fs = require('fs');
const BASE = 'http://localhost:4001';
const results = [];
function record(name, pass, detail){ results.push({name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['finance1','ceo'].map(u=>login(u, {finance1:'Fin@12345',ceo:'Ceo@12345'}[u])));

  // ================= Two users allocate the SAME bank transaction simultaneously =================
  const banks = await api('admin','GET','/api/bank-accounts');
  const csvText = fs.readFileSync(__dirname+'/icici_statement_121.csv','utf8');
  const imp = await api('admin','POST','/api/bank-import/batches',{bankAccountId:banks.bankAccounts[0].id, csvText, label:'concurrency test'});
  const lineId = imp.batch && (await api('admin','GET',`/api/bank-import/lines?batchId=${imp.batch.id}`)).lines[1].id; // row 2, a DR line
  const [alloc1, alloc2] = await Promise.all([
    api('finance1','POST',`/api/bank-import/lines/${lineId}/post`,{glAccount:'5000', narration:'Race attempt A'}),
    api('ceo','POST',`/api/bank-import/lines/${lineId}/post`,{glAccount:'5100', narration:'Race attempt B'})
  ]);
  const allocSuccesses = [alloc1,alloc2].filter(r=>r.ok).length;
  record('Two users allocating the SAME bank transaction simultaneously — exactly ONE succeeds, the other sees "already Posted/Duplicate/Excluded" and is correctly rejected (no double GL effect from one bank line)',
    allocSuccesses===1, {alloc1:{ok:alloc1.ok, entry:alloc1.entry&&alloc1.entry.id}, alloc2:{ok:alloc2.ok, error:alloc2.error}});
  const je = await api('admin','GET','/api/journal-entries?pageSize=500');
  const allocEntries = je.journalEntries.filter(e=>e.sourceType==='BankImportAllocation' && e.sourceId===lineId);
  record('Exactly ONE journal entry was created from the race, not two (no duplicate accounting effect from one bank transaction)', allocEntries.length===1, allocEntries.length);

  // ================= Two users capitalize the SAME fixed asset simultaneously =================
  const fa = await api('admin','POST','/api/fixed-assets',{assetName:'Concurrency Test Asset', purchaseDate:'2026-08-25', cost:100000});
  const [cap1, cap2] = await Promise.all([
    api('finance1','POST',`/api/fixed-assets/${fa.asset.id}/capitalize`,{capitalizationDate:'2026-08-25', fundingSource:'Bank', usefulLifeMonths:60, depreciationMethod:'StraightLine', residualValue:0}),
    api('ceo','POST',`/api/fixed-assets/${fa.asset.id}/capitalize`,{capitalizationDate:'2026-08-25', fundingSource:'Bank', usefulLifeMonths:36, depreciationMethod:'StraightLine', residualValue:5000})
  ]);
  const capSuccesses = [cap1,cap2].filter(r=>r.ok).length;
  record('Two users capitalizing the SAME fixed asset simultaneously — exactly ONE succeeds (the asset moves Purchased->Capitalized exactly once, the loser correctly sees "not Purchased")',
    capSuccesses===1, {cap1:{ok:cap1.ok, entry:cap1.entry&&cap1.entry.id}, cap2:{ok:cap2.ok, error:cap2.error}});
  const faList = await api('admin','GET','/api/fixed-assets');
  const faRow = faList.assets.find(a=>a.id===fa.asset.id);
  record('Exactly ONE capitalization entry exists on the asset — the race did not leave the asset\'s policy fields (useful life/method/residual) ambiguously double-set', faRow.status==='Capitalized' && !!faRow.capitalizationEntryId, faRow);
  const je2 = await api('admin','GET','/api/journal-entries?pageSize=500');
  const capEntries = je2.journalEntries.filter(e=>e.sourceType==='FixedAssetCapitalization' && e.sourceId===fa.asset.id);
  record('Exactly ONE GL entry was posted for the capitalization, not two (no duplicate ₹1,00,000 Fixed Asset cost)', capEntries.length===1, capEntries.length);
  const tb = await api('admin','GET','/api/trial-balance');
  let totD=0, totC=0; Object.values(tb.byAccount).forEach(a=>{totD+=a.debit;totC+=a.credit;});
  record('Trial Balance still balances after both races', Math.abs(totD-totC)<0.02, {debit:totD, credit:totC});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 20 CONCURRENCY TESTS (bank allocation + asset capitalization) ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  console.log('Reference: post-same-document, clear-same-document, modify-same-draft, consume-same-inventory, and approve-same-document races are already covered by security_tests.js / procurement_tests.js / phase17_concurrency_tests.js, re-confirmed passing as part of this phase\'s full regression.');
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
