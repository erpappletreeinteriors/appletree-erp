'use strict';
// DEF-2026-001 — permanent regression coverage for the QC Dashboard field-mismatch defect.
// qcDashboard() (server/domain.js) used to read a `c.result` field ('Pass'/'Fail') that was never
// written anywhere; the real, canonical field is `c.status` (QC_STATUSES: 'Pending'/'InProgress'/
// 'Passed'/'Failed', see createQCChecklist()/submitQCResult()). Because c.result was always
// undefined, every QC checklist unconditionally fell into the "pending" bucket regardless of its
// true status. This file asserts actual numeric counts, not just response shape — the pre-existing
// phase28_modules_tests.js §7 assertion (`typeof qc.totals.total==='number'`) only checked shape and
// is exactly why this defect survived undetected. ERP-059C preflight guard, same pattern as every
// other file in this directory — no hardcoded target, no silent fallback to a production port.
const BASE = process.env.TEST_BASE_URL || (() => { throw new Error('TEST_BASE_URL is not set. Refusing to run against an unspecified target. Example: TEST_BASE_URL=http://127.0.0.1:4100 node ' + __filename); })();
async function __preflight(){
  console.log('[TEST TARGET]', BASE);
  let info;
  try { const r = await fetch(BASE + '/api/system/environment'); info = await r.json(); }
  catch(e){ console.error(`[PREFLIGHT BLOCKED] Could not reach ${BASE} (${e.message}).`); process.exit(1); }
  if(!info || info.ok !== true || info.appEnv !== 'test' || info.destructiveTestEndpointsEnabled !== true){
    console.error(`[PREFLIGHT BLOCKED] ${BASE} is APP_ENV="${info && info.appEnv}" — refusing to run a destructive test against it.`);
    process.exit(1);
  }
  console.log(`[PREFLIGHT OK] ${BASE} confirmed APP_ENV=test.`);
}
const results = [];
function record(name, pass, detail){ results.push({name, pass, detail}); }
const jars = {};
async function login(u,p){ const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return {status:r.status, ...(await r.json().catch(()=>({})))}; }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r = await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }

// ARCH-2026-002 Wave 2 note: SOD-10 (QC checklist creator != result submitter) is now enforced —
// every submitQC() call below deliberately uses a DIFFERENT user ('admin') than the corresponding
// createQC() call ('ceo'), reflecting this newly-authorized control, not a weakened test.
async function createQC(user, projectId, items){
  const qc = await api(user,'POST','/api/qc-checklists',{projectId, items});
  return qc;
}
async function submitQC(user, id, items){
  return api(user,'POST',`/api/qc-checklists/${id}/result`,{items});
}

async function main(){
  await __preflight();
  await login('admin','Admin@12345');
  await api('admin','POST','/api/test/reset');
  await login('ceo','Ceo@12345');

  const invBefore = await api('ceo','GET','/api/inventory/movements');
  const invCountBefore = invBefore.ok ? (invBefore.movements||[]).length : null;
  const tbBefore = await api('ceo','GET','/api/trial-balance');

  // ============================= CASE 5: ZERO-RECORD (before creating anything) =============================
  const zeroCheck = await api('ceo','GET','/api/qc-dashboard');
  const prj2Row = (zeroCheck.byProject||[]).find(r=>r.projectId==='PRJ-2');
  record('[CASE5] Zero-record project produces no phantom row and overall totals are zero', zeroCheck.ok && !prj2Row && zeroCheck.totals.total===0, zeroCheck.totals);

  // ============================= CASE 1: PENDING (created, never submitted) =============================
  const qc1 = await createQC('ceo','PRJ-1',[{description:'Item A', critical:false}]);
  record('[CASE1] Pending QC checklist created with status Pending', qc1.ok && qc1.qc.status==='Pending', qc1.qc?.status);

  // ============================= CASE 2: PASSED (all items Pass) =============================
  const qc2 = await createQC('ceo','PRJ-1',[{description:'Item B', critical:false}]);
  const qc2r = await submitQC('admin', qc2.qc.id, [{description:'Item B', critical:false, passFail:'Pass'}]);
  record('[CASE2] QC checklist submitted all-Pass persists status Passed', qc2r.ok && qc2r.qc.status==='Passed', qc2r.qc?.status);

  // ============================= CASE 3: FAILED (a critical item Fails) =============================
  const qc3 = await createQC('ceo','PRJ-1',[{description:'Item C', critical:true}]);
  const qc3r = await submitQC('admin', qc3.qc.id, [{description:'Item C', critical:true, passFail:'Fail'}]);
  record('[CASE3] QC checklist submitted with a critical Fail persists status Failed', qc3r.ok && qc3r.qc.status==='Failed', qc3r.qc?.status);

  // ============================= CASE 4: MIXED DATASET — dashboard must classify each correctly ============
  const mixed = await api('ceo','GET','/api/qc-dashboard');
  const row = (mixed.byProject||[]).find(r=>r.projectId==='PRJ-1');
  record('[CASE4] Dashboard passed=1 for the mixed 3-record dataset (was 0 before the fix)', row && row.passed===1, row);
  record('[CASE4] Dashboard failed=1 for the mixed 3-record dataset (was 0 before the fix)', row && row.failed===1, row);
  record('[CASE4] Dashboard pending=1 for the mixed 3-record dataset (was 3 before the fix)', row && row.pending===1, row);
  record('[CASE8] Dashboard aggregation is internally consistent: pending+passed+failed === total', row && (row.pending+row.passed+row.failed)===row.total, row);
  record('[CASE8] Pass rate is computed from the CORRECTED passed count (33.33%, not 0%)', row && Math.abs(row.passRatePct-33.33)<0.01, row.passRatePct);
  record('[CASE8] Company-wide totals match the single-project row (only one project has QC records)', mixed.totals.passed===1 && mixed.totals.failed===1 && mixed.totals.pending===1 && mixed.totals.total===3, mixed.totals);

  // ============================= CASE 6: InProgress (partial submission) groups with Pending =============
  const qc4 = await createQC('ceo','PRJ-1',[{description:'Item D1', critical:false},{description:'Item D2', critical:false}]);
  const qc4r = await submitQC('admin', qc4.qc.id, [{description:'Item D1', critical:false, passFail:'Pass'},{description:'Item D2', critical:false, passFail:'Pending'}]);
  record('[CASE6] Partially-submitted checklist persists status InProgress', qc4r.ok && qc4r.qc.status==='InProgress', qc4r.qc?.status);
  const afterInProgress = await api('ceo','GET','/api/qc-dashboard');
  const rowAfter = (afterInProgress.byProject||[]).find(r=>r.projectId==='PRJ-1');
  record('[CASE6] InProgress checklist is grouped into the pending bucket, not silently dropped or double-counted', rowAfter && rowAfter.pending===2 && rowAfter.total===4 && rowAfter.passed===1 && rowAfter.failed===1, rowAfter);

  // ============================= CASE 7: multiple QC records across the SAME project already covered above
  // (4 records now exist on PRJ-1 — CASE 7's "multiple QC records" requirement is satisfied by CASE 4+6
  // together, avoiding a redundant near-duplicate scenario per this change's minimum-scope discipline.)

  // ============================= NEGATIVE/SAFETY (Phase G) — the fix must be READ-ONLY ========================
  const rawList = await api('ceo','GET','/api/qc-checklists');
  const rawCount = (rawList.qcChecklists||[]).length;
  record('[SAFETY] Dashboard call created zero new QC records (raw list count matches the 4 created above)', rawCount===4, rawCount);

  const tb = await api('ceo','GET','/api/trial-balance');
  let tbDebit=0, tbCredit=0;
  if(tb.ok){ for(const k in tb.byAccount){ tbDebit += tb.byAccount[k].debit||0; tbCredit += tb.byAccount[k].credit||0; } }
  record('[SAFETY] Trial Balance still balanced — QC dashboard fix touched no accounting posting path', Math.abs(tbDebit-tbCredit)<0.02, {tbDebit, tbCredit});
  let tbDebitBefore=0, tbCreditBefore=0;
  if(tbBefore.ok){ for(const k in tbBefore.byAccount){ tbDebitBefore += tbBefore.byAccount[k].debit||0; tbCreditBefore += tbBefore.byAccount[k].credit||0; } }
  record('[SAFETY] Trial Balance totals are byte-identical before and after all QC activity — proves zero GL side effects', Math.abs(tbDebit-tbDebitBefore)<0.001 && Math.abs(tbCredit-tbCreditBefore)<0.001, {before:{tbDebitBefore,tbCreditBefore}, after:{tbDebit,tbCredit}});

  const invAfter = await api('ceo','GET','/api/inventory/movements');
  const invCountAfter = invAfter.ok ? (invAfter.movements||[]).length : null;
  record('[SAFETY] Inventory movement count unchanged by 4 QC checklists + repeated dashboard reads', invCountBefore!==null && invCountAfter===invCountBefore, {before:invCountBefore, after:invCountAfter});

  // Re-fetch each raw QC record and confirm its status is EXACTLY what was set at submission time —
  // proves the read-only dashboard aggregation never mutated the underlying records.
  const finalList = await api('ceo','GET','/api/qc-checklists');
  const byId = Object.fromEntries((finalList.qcChecklists||[]).map(q=>[q.id,q]));
  record('[SAFETY] QC1 status unchanged by repeated dashboard reads (still Pending)', byId[qc1.qc.id]?.status==='Pending', byId[qc1.qc.id]?.status);
  record('[SAFETY] QC2 status unchanged by repeated dashboard reads (still Passed)', byId[qc2.qc.id]?.status==='Passed', byId[qc2.qc.id]?.status);
  record('[SAFETY] QC3 status unchanged by repeated dashboard reads (still Failed)', byId[qc3.qc.id]?.status==='Failed', byId[qc3.qc.id]?.status);

  console.log('\n===== DEF-2026-001 QC DASHBOARD: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log((r.pass?'✅ PASS':'❌ FAIL')+' | '+r.name+(r.pass?'':' -- '+JSON.stringify(r.detail))));
  if(results.some(r=>r.pass===false)) process.exitCode = 1;
}
main().catch(e=>{ console.error('TEST RUNNER CRASHED:', e); process.exitCode = 1; });
