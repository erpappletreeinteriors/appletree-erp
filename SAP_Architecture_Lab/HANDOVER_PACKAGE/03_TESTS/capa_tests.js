'use strict';
// Phase 10 §26-§28,§48 — CAPA: not auto-created, real SoD (owner != verifier != effectiveness-
// approver), and "action done" != "proven effective".
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
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([login('ceo','Ceo@12345'), login('finance1','Fin@12345'), login('sales1','Sal@123456'), login('pm1','Pm@123456')]);

  // §26 — invalid/missing trigger must be rejected, CAPA is never auto-created.
  const badTrigger = await api('finance1','POST','/api/capa',{trigger:'JustBecause', problem:'x'});
  record('Policy', 'Invalid trigger rejected — CAPA is not created automatically for every complaint', badTrigger.ok===false, badTrigger.error);
  const salesCreate = await api('sales1','POST','/api/capa',{trigger:'RepeatedFailure', problem:'Hinges failing across multiple projects'});
  record('Security', 'Sales (customer-facing, no quality authority) cannot create a CAPA case', salesCreate.ok===false, JSON.stringify(salesCreate));

  const capa = await api('finance1','POST','/api/capa',{trigger:'RepeatedFailure', problem:'Cabinet hinges repeatedly failing across 3+ projects'});
  record('Create', 'CAPA case created OPEN with an explicit trigger', capa.ok && capa.capa.status==='OPEN' && capa.capa.trigger==='RepeatedFailure', capa.capa?.status);

  const actionBeforeAnalysis = await api('finance1','POST',`/api/capa/${capa.capa.id}/action`,{correctiveAction:'x', preventiveAction:'y', owner:'U-PM1', dueDate:'2026-10-01'});
  record('Sequence', 'Cannot define corrective/preventive action before root cause is recorded', actionBeforeAnalysis.ok===false, actionBeforeAnalysis.error);

  const analysis = await api('finance1','POST',`/api/capa/${capa.capa.id}/analysis`,{rootCause:'Substandard hinge batch from a specific supplier lot'});
  record('Analysis', 'Root cause recorded, status ANALYSIS', analysis.ok && analysis.capa.status==='ANALYSIS', analysis.capa?.status);

  const action = await api('finance1','POST',`/api/capa/${capa.capa.id}/action`,{correction:'Replace affected hinges', correctiveAction:'Return bad batch to supplier', preventiveAction:'Add incoming QC check for hinge batches', owner:'U-PM1', dueDate:'2026-10-15'});
  record('Action', 'Corrective/preventive action defined with owner + due date, status ACTION', action.ok && action.capa.status==='ACTION' && action.capa.owner==='U-PM1', JSON.stringify(action.capa));

  // §27 — SoD: the owner (U-PM1 = pm1) cannot verify their own action.
  const selfVerify = await api('pm1','POST',`/api/capa/${capa.capa.id}/verify`,{evidence:'Photos of new hinges installed'});
  record('SoD', 'CAPA owner (pm1) cannot verify their own action — self-verification blocked', selfVerify.ok===false, JSON.stringify(selfVerify));
  const salesVerify = await api('sales1','POST',`/api/capa/${capa.capa.id}/verify`,{evidence:'x'});
  record('Security', 'Sales cannot verify a CAPA action (not supervisory tier)', salesVerify.ok===false, JSON.stringify(salesVerify));
  const verify = await api('finance1','POST',`/api/capa/${capa.capa.id}/verify`,{evidence:'Photos of new hinges installed, incoming QC checklist updated'});
  record('Verify', 'Independent verifier (FinanceManager) verifies the action, status VERIFICATION', verify.ok && verify.capa.status==='VERIFICATION' && verify.capa.verifiedBy!=='U-PM1', verify.capa?.status);

  // §28 — effectiveness is a SEPARATE check; "done" != "proven effective". Also SoD: verifier != effectiveness approver.
  const selfEffectiveness = await api('finance1','POST',`/api/capa/${capa.capa.id}/effectiveness`,{effectivenessCheck:'No repeat failures in 60 days', effectivenessResult:'Effective'});
  record('SoD', 'The SAME person who verified completion cannot also confirm effectiveness', selfEffectiveness.ok===false, JSON.stringify(selfEffectiveness));
  const closeBeforeEffectiveness = await api('ceo','POST',`/api/capa/${capa.capa.id}/close`);
  record('Sequence', 'Cannot close before an effectiveness check exists', closeBeforeEffectiveness.ok===false, closeBeforeEffectiveness.error);
  const effectiveness = await api('ceo','POST',`/api/capa/${capa.capa.id}/effectiveness`,{effectivenessCheck:'No repeat hinge failures observed across affected projects after 60 days', effectivenessResult:'Effective'});
  record('Effectiveness', 'Independent approver (CEO, not the verifier) records Effective, status EFFECTIVENESS', effectiveness.ok && effectiveness.capa.status==='EFFECTIVENESS' && effectiveness.capa.effectivenessResult==='Effective', effectiveness.capa?.status);

  const close = await api('ceo','POST',`/api/capa/${capa.capa.id}/close`);
  record('Closure', 'CAPA closes cleanly once genuinely Effective', close.ok && close.capa.status==='CLOSED', close.capa?.status);

  // Negative path: a CAPA whose effectiveness check comes back NotEffective must NOT be closable.
  const capa2 = await api('finance1','POST','/api/capa',{trigger:'MajorComplaint', problem:'Repeated leak under kitchen sink installation'});
  await api('finance1','POST',`/api/capa/${capa2.capa.id}/analysis`,{rootCause:'Incorrect sealant used'});
  await api('finance1','POST',`/api/capa/${capa2.capa.id}/action`,{correctiveAction:'Reseal', preventiveAction:'Update SOP', owner:'U-PM1', dueDate:'2026-10-20'});
  await api('finance1','POST',`/api/capa/${capa2.capa.id}/verify`,{evidence:'Resealed, photos attached'});
  const notEffective = await api('ceo','POST',`/api/capa/${capa2.capa.id}/effectiveness`,{effectivenessCheck:'Leak recurred after 30 days', effectivenessResult:'NotEffective'});
  record('Effectiveness', 'NotEffective result recorded honestly', notEffective.ok && notEffective.capa.effectivenessResult==='NotEffective', notEffective.capa?.effectivenessResult);
  const closeNotEffective = await api('ceo','POST',`/api/capa/${capa2.capa.id}/close`);
  record('Closure', 'A CAPA that was NOT proven effective CANNOT be closed (§28 — done != effective)', closeNotEffective.ok===false, closeNotEffective.error);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 10 CAPA TESTS ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
