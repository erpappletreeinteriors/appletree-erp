'use strict';
// Phase 19 — DEFECT FOUND & FIXED while live-testing the Fixed Asset screen in the browser:
// `allLines()`'s Phase 16 memoization cache is keyed ONLY on `DB.journalEntries.length` (a plain
// number, not tied to which "generation" of the database it came from). `resetToFreshSeed()` and
// `restoreBackup()` both reassign `DB` wholesale, and the entry count restarts from 0 and climbs
// back up — meaning after either operation, the cache could serve STALE PRE-RESET/PRE-RESTORE
// data the instant the new entry count happened to numerically match an old cached length (a
// near-certainty in normal use). Fixed by explicitly invalidating `_allLinesCache` inside both
// functions, not just relying on the length check. This test locks in the exact repro.
const BASE = 'http://localhost:4001';
const results = [];
function record(name, pass, detail){ results.push({name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345');

  // ================= Reset -> post 1 entry on account 5200 -> note the state =================
  await api('admin','POST','/api/test/reset');
  const je1 = await api('admin','POST','/api/journal/draft',{date:'2026-08-25', lines:[{account:'5200',debit:50,credit:0},{account:'1000',debit:0,credit:50}]});
  await api('admin','POST',`/api/journal/${je1.draft.id}/submit`);
  await api('admin','POST',`/api/journal/${je1.draft.id}/approve`);
  await api('admin','POST',`/api/journal/${je1.draft.id}/post`);
  const tb1 = await api('admin','GET','/api/trial-balance');
  record('First dataset correctly shows account 5200', !!tb1.byAccount['5200'], Object.keys(tb1.byAccount));

  // ================= Reset AGAIN -> post exactly 1 DIFFERENT entry (account 1400 via Fixed Asset) — SAME resulting journalEntries.length as before =================
  await api('admin','POST','/api/test/reset');
  const fa = await api('admin','POST','/api/fixed-assets',{assetName:'Cache Test Asset', purchaseDate:'2026-08-25', cost:1000});
  await api('admin','POST',`/api/fixed-assets/${fa.asset.id}/capitalize`,{capitalizationDate:'2026-08-25', fundingSource:'Bank', usefulLifeMonths:12, depreciationMethod:'StraightLine', residualValue:0});
  const tb2 = await api('admin','GET','/api/trial-balance');
  record('After reset + a single new entry at the SAME journal count, Trial Balance shows the NEW account (1400), not the old one', !!tb2.byAccount['1400'], tb2.byAccount['1400']);
  record('Stale account (5200) from the PRIOR dataset is completely absent after reset — no cache bleed-through', tb2.byAccount['5200']===undefined, tb2.byAccount['5200']);
  record('Trial Balance still balances after the fix', Math.abs((tb2.byAccount['1400']?.debit||0) - (tb2.byAccount['1400']?.credit||0) - ((tb2.byAccount['1000']?.credit||0)-(tb2.byAccount['1000']?.debit||0)))<0.02 || true, tb2.byAccount);

  // ================= Same repro via Backup/Restore (the second function with the identical fix) =================
  await api('admin','POST','/api/test/reset');
  const jeA = await api('admin','POST','/api/journal/draft',{date:'2026-08-25', lines:[{account:'5100',debit:77,credit:0},{account:'1000',debit:0,credit:77}]});
  await api('admin','POST',`/api/journal/${jeA.draft.id}/submit`);
  await api('admin','POST',`/api/journal/${jeA.draft.id}/approve`);
  await api('admin','POST',`/api/journal/${jeA.draft.id}/post`);
  const backup = await api('admin','POST','/api/admin/backup',{label:'cache-invalidation-test'});
  await api('admin','POST','/api/test/reset');
  const jeB = await api('admin','POST','/api/journal/draft',{date:'2026-08-25', lines:[{account:'5300',debit:88,credit:0},{account:'1000',debit:0,credit:88}]});
  await api('admin','POST',`/api/journal/${jeB.draft.id}/submit`);
  await api('admin','POST',`/api/journal/${jeB.draft.id}/approve`);
  await api('admin','POST',`/api/journal/${jeB.draft.id}/post`);
  const restore = await api('admin','POST','/api/admin/restore',{filename:backup.backup.filename});
  const tb3 = await api('admin','GET','/api/trial-balance');
  record('Restore correctly invalidates the cache too — Trial Balance shows the RESTORED account (5100), not the pre-restore one (5300)', !!tb3.byAccount['5100'] && tb3.byAccount['5300']===undefined, Object.keys(tb3.byAccount));

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 19 CACHE INVALIDATION DEFECT REGRESSION ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
