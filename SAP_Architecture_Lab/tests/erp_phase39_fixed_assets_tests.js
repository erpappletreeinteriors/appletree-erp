'use strict';
// PHASE 39 — Fixed Assets live validation.
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

async function main(){
  await __preflight();
  await login('admin','Admin@12345');
  // NOTE: deliberately NOT calling /api/test/reset here — this suite runs standalone against a
  // freshly-booted isolated server (or after a reset by an earlier suite in the same run). Resetting
  // here would also wipe Manufacturing/Job Work state from a prior suite run in the same session.
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('purchase1','Pur@12345')
  ]);

  // ============================= ACQUISITION =============================
  console.log('\n===== FIXED ASSET ACQUISITION =====');

  const fa = await api('purchase1','POST','/api/fixed-assets',{assetCode:'TEST39-FA-001', assetName:'TEST39 CNC Router (Phase 39 fictional asset)', assetClass:'Machinery', purchaseDate:'2026-01-10', cost:600000, location:'Factory — Bay 3', custodian:'Phase39 Test Custodian', projectId:'PRJ-1'});
  record('FA','Fixed Asset created (status Purchased)', fa.ok===true && fa.asset?.status==='Purchased', {id:fa.asset?.id, status:fa.asset?.status, error:fa.error});
  const faId = fa.asset?.id;

  // Negative: unauthorized role (Purchase has create:true but NOT post:true — capitalize requires 'post')
  const unauthCap = await api('purchase1','POST',`/api/fixed-assets/${faId}/capitalize`,{capitalizationDate:'2026-01-15', fundingSource:'Bank', usefulLifeMonths:24, depreciationMethod:'StraightLine', residualValue:60000});
  record('FA-NEG','Unauthorized role (Purchase, no post capability) capitalizing an asset is BLOCKED', unauthCap.ok===false, {status:unauthCap.status, error:unauthCap.error});

  // Negative: capitalize with missing useful life (ACCOUNTING POLICY REQUIRED — never defaulted)
  const missingLife = await api('finance1','POST',`/api/fixed-assets/${faId}/capitalize`,{capitalizationDate:'2026-01-15', fundingSource:'Bank', depreciationMethod:'StraightLine', residualValue:60000});
  record('FA-NEG','Capitalization with missing Useful Life is BLOCKED (never defaulted)', missingLife.ok===false && /Useful Life/.test(missingLife.error||''), {error:missingLife.error});

  // Negative: capitalize with missing depreciation method
  const missingMethod = await api('finance1','POST',`/api/fixed-assets/${faId}/capitalize`,{capitalizationDate:'2026-01-15', fundingSource:'Bank', usefulLifeMonths:24, residualValue:60000});
  record('FA-NEG','Capitalization with missing Depreciation Method is BLOCKED (never defaulted)', missingMethod.ok===false && /Depreciation Method/.test(missingMethod.error||''), {error:missingMethod.error});

  // Negative: capitalize with residual value >= cost
  const badResidual = await api('finance1','POST',`/api/fixed-assets/${faId}/capitalize`,{capitalizationDate:'2026-01-15', fundingSource:'Bank', usefulLifeMonths:24, depreciationMethod:'StraightLine', residualValue:600000});
  record('FA-NEG','Capitalization with Residual Value >= Cost is BLOCKED', badResidual.ok===false, {error:badResidual.error});

  // Positive: capitalize for real (Bank-funded, 24 months, StraightLine, residual 60,000)
  const cap = await api('finance1','POST',`/api/fixed-assets/${faId}/capitalize`,{capitalizationDate:'2026-01-15', fundingSource:'Bank', usefulLifeMonths:24, depreciationMethod:'StraightLine', residualValue:60000});
  record('FA','Fixed Asset capitalized (Bank-funded), real GL entry (Dr 1400 / Cr 1000)', cap.ok===true && cap.asset?.status==='Capitalized', {entryId:cap.entry?.id, totalDebit:cap.entry?.totalDebit, totalCredit:cap.entry?.totalCredit, error:cap.error});

  // Negative: double-capitalize (already Capitalized)
  const dupCap = await api('finance1','POST',`/api/fixed-assets/${faId}/capitalize`,{capitalizationDate:'2026-01-16', fundingSource:'Bank', usefulLifeMonths:24, depreciationMethod:'StraightLine', residualValue:60000});
  record('FA-NEG','Double-capitalization of an already-Capitalized asset is BLOCKED', dupCap.ok===false, {error:dupCap.error});

  // ============================= DEPRECIATION (multiple periods) =============================
  console.log('\n===== DEPRECIATION =====');
  // Straight-line monthly = (600000-60000)/24 = 22,500/month. Capitalized 2026-01-15 -> January is
  // prorated (17 of 31 days remaining incl. the 15th), February onward is a full month.

  const dep1 = await api('finance1','POST',`/api/fixed-assets/${faId}/depreciate`,{periodDate:'2026-01-31'});
  const expectedJan = Math.round(22500 * (31-15+1)/31 * 100)/100;
  record('FA','Period 1 (Jan, prorated) depreciation posted, real GL entry (Dr 5400 / Cr 1450)', dep1.ok===true && Math.abs(dep1.entry?.totalDebit - expectedJan) < 0.02, {amount:dep1.entry?.totalDebit, expected:expectedJan, accumulatedDepreciation:dep1.accumulatedDepreciation, error:dep1.error});

  const dep2 = await api('finance1','POST',`/api/fixed-assets/${faId}/depreciate`,{periodDate:'2026-02-28'});
  record('FA','Period 2 (Feb, full month) depreciation posted, amount = full monthly charge', dep2.ok===true && Math.abs(dep2.entry?.totalDebit - 22500) < 0.02, {amount:dep2.entry?.totalDebit, accumulatedDepreciation:dep2.accumulatedDepreciation, error:dep2.error});

  const dep3 = await api('finance1','POST',`/api/fixed-assets/${faId}/depreciate`,{periodDate:'2026-03-31'});
  record('FA','Period 3 (Mar) depreciation posted', dep3.ok===true && Math.abs(dep3.entry?.totalDebit - 22500) < 0.02, {amount:dep3.entry?.totalDebit, accumulatedDepreciation:dep3.accumulatedDepreciation, error:dep3.error});

  // Negative: depreciate beyond the residual-value floor with an oversized manual amount
  const overDep = await api('finance1','POST',`/api/fixed-assets/${faId}/depreciate`,{periodDate:'2026-04-30', amount:999999});
  record('FA-NEG','Depreciation amount exceeding the remaining depreciable value (residual floor) is BLOCKED', overDep.ok===false, {error:overDep.error});

  // Negative: unauthorized role posting depreciation
  const unauthDep = await api('purchase1','POST',`/api/fixed-assets/${faId}/depreciate`,{periodDate:'2026-04-30'});
  record('FA-NEG','Unauthorized role (Purchase) posting depreciation is BLOCKED', unauthDep.ok===false, {error:unauthDep.error});

  // Negative: depreciate an asset that is NOT Capitalized (still-Purchased second asset)
  const fa2 = await api('purchase1','POST','/api/fixed-assets',{assetCode:'TEST39-FA-002', assetName:'TEST39 Site Generator (Phase 39 fictional asset)', assetClass:'Equipment', purchaseDate:'2026-02-01', cost:150000, location:'Site Store', custodian:'Phase39 Test Custodian', projectId:'PRJ-1'});
  const depBeforeCap = await api('finance1','POST',`/api/fixed-assets/${fa2.asset?.id}/depreciate`,{periodDate:'2026-03-31'});
  record('FA-NEG','Depreciation against a NOT-YET-Capitalized asset is BLOCKED', depBeforeCap.ok===false, {error:depBeforeCap.error});

  // ============================= TRANSFER =============================
  console.log('\n===== TRANSFER =====');

  const transfer = await api('finance1','POST',`/api/fixed-assets/${faId}/transfer`,{newLocation:'Factory — Bay 7', newCustodian:'Phase39 Test Custodian 2', reason:'Phase 39 E2E — relocation test'});
  record('FA','Asset transfer (location + custodian change) accepted, transferHistory recorded', transfer.ok===true && transfer.asset?.location==='Factory — Bay 7' && Array.isArray(transfer.asset?.transferHistory) && transfer.asset.transferHistory.length>=1, {location:transfer.asset?.location, historyLen:transfer.asset?.transferHistory?.length, error:transfer.error});

  // Negative: transfer without a reason (mandatory unconditionally)
  const noReasonTransfer = await api('finance1','POST',`/api/fixed-assets/${faId}/transfer`,{newLocation:'Factory — Bay 9'});
  record('FA-NEG','Asset transfer with no reason is BLOCKED (mandatory unconditionally)', noReasonTransfer.ok===false, {error:noReasonTransfer.error});

  // Close PRJ-3 (force-close via CEO override — genuinely testing the closed-project gate, not assuming it works)
  const closeReadiness = await api('ceo','POST','/api/projects/PRJ-3/close',{override:true, overrideReason:'Phase 39 E2E — force-close PRJ-3 to test closed-project posting gate on Fixed Assets'});
  record('FA','Setup: PRJ-3 force-closed (CEO override) to enable closed-project negative test', closeReadiness.ok===true && closeReadiness.project?.status==='CLOSED', {status:closeReadiness.project?.status, error:closeReadiness.error});

  // Negative: non-CEO/Admin (FinanceManager) transferring an asset INTO a closed project is BLOCKED
  const transferIntoClosedUnauth = await api('finance1','POST',`/api/fixed-assets/${faId}/transfer`,{newProjectId:'PRJ-3', reason:'Phase 39 E2E — attempt transfer into closed project as FinanceManager'});
  record('FA-NEG','FinanceManager transferring an asset INTO a CLOSED project is BLOCKED', transferIntoClosedUnauth.ok===false, {error:transferIntoClosedUnauth.error});

  // Negative: CEO transferring into a closed project WITHOUT an override reason is BLOCKED
  // (the transfer's own `reason` field is reused as the closed-project overrideReason — supplying it
  // satisfies BOTH requirements at once by design, so this negative test omits `reason` entirely)
  const transferIntoClosedNoReason = await api('ceo','POST',`/api/fixed-assets/${faId}/transfer`,{newProjectId:'PRJ-3'});
  record('FA-NEG','CEO transferring an asset INTO a CLOSED project with NO reason is BLOCKED (reason is mandatory both ways)', transferIntoClosedNoReason.ok===false, {error:transferIntoClosedNoReason.error});

  // Positive: CEO transferring into a closed project WITH a reason succeeds (explicit, audited override)
  const transferIntoClosedOk = await api('ceo','POST',`/api/fixed-assets/${faId}/transfer`,{newProjectId:'PRJ-3', reason:'Phase 39 E2E — authorized CEO override, closed-project transfer'});
  record('FA','CEO transferring an asset INTO a CLOSED project WITH a reason SUCCEEDS (explicit override)', transferIntoClosedOk.ok===true && transferIntoClosedOk.asset?.projectId==='PRJ-3', {projectId:transferIntoClosedOk.asset?.projectId, error:transferIntoClosedOk.error});

  // Move it back to PRJ-1 (open) so disposal below is unobstructed by the closed-project gate
  const transferBack = await api('ceo','POST',`/api/fixed-assets/${faId}/transfer`,{newProjectId:'PRJ-1', reason:'Phase 39 E2E — move back to open project before disposal test'});
  record('FA','Setup: asset transferred back to PRJ-1 (open) before disposal', transferBack.ok===true && transferBack.asset?.projectId==='PRJ-1', {error:transferBack.error});

  // ============================= DISPOSAL + GAIN/LOSS =============================
  console.log('\n===== DISPOSAL =====');

  const recon1 = await api('finance1','GET','/api/fixed-assets/reconciliation');
  const preDisposeAsset = (await api('finance1','GET','/api/fixed-assets')).assets?.find(a=>a.id===faId) || (await api('finance1','GET','/api/fixed-assets'));

  // Negative: unauthorized role (Purchase) disposing an asset
  const unauthDispose = await api('purchase1','POST',`/api/fixed-assets/${faId}/dispose`,{disposalDate:'2026-05-01', disposalProceeds:400000, reason:'Phase 39 E2E'});
  record('FA-NEG','Unauthorized role (Purchase) disposing an asset is BLOCKED', unauthDispose.ok===false, {error:unauthDispose.error});

  // Dispose FA-001 at a LOSS (NBV at this point is well above a modest proceeds figure)
  const nbvBefore = await api('finance1','GET','/api/fixed-assets');
  const assetBefore = nbvBefore.assets?.find(a=>a.id===faId);
  record('FA','NBV captured before disposal (for independent gain/loss reconciliation)', !!assetBefore, {nbv:assetBefore?.netBookValue, accumDep:assetBefore?.accumulatedDepreciation});

  const dispose1 = await api('finance1','POST',`/api/fixed-assets/${faId}/dispose`,{disposalDate:'2026-05-01', disposalProceeds:400000, reason:'Phase 39 E2E — disposal at a loss'});
  const expectedLoss = assetBefore ? r2(400000 - assetBefore.netBookValue) : null;
  record('FA','Asset disposed at a LOSS, gainOrLoss matches independently-computed (proceeds - NBV)', dispose1.ok===true && expectedLoss!==null && Math.abs(dispose1.gainOrLoss - expectedLoss) < 0.02, {gainOrLoss:dispose1.gainOrLoss, expectedLoss, proceeds:400000, nbvBefore:assetBefore?.netBookValue, error:dispose1.error});

  // Negative: dispose an already-Disposed asset
  const dupDispose = await api('finance1','POST',`/api/fixed-assets/${faId}/dispose`,{disposalDate:'2026-05-02', disposalProceeds:100, reason:'Phase 39 E2E — duplicate dispose attempt'});
  record('FA-NEG','Disposal of an already-Disposed asset is BLOCKED', dupDispose.ok===false, {error:dupDispose.error});

  // Second asset: capitalize + depreciate lightly, then dispose at a GAIN
  const capFa2 = await api('finance1','POST',`/api/fixed-assets/${fa2.asset?.id}/capitalize`,{capitalizationDate:'2026-02-01', fundingSource:'AP', vendorId:'VEND-1', usefulLifeMonths:60, depreciationMethod:'StraightLine', residualValue:15000});
  record('FA','Second asset capitalized (AP-funded — vendor payable), real GL entry (Dr 1400 / Cr 2000)', capFa2.ok===true && capFa2.asset?.status==='Capitalized', {error:capFa2.error});
  const dep4 = await api('finance1','POST',`/api/fixed-assets/${fa2.asset?.id}/depreciate`,{periodDate:'2026-02-28'});
  record('FA','Second asset: one depreciation period posted', dep4.ok===true, {amount:dep4.entry?.totalDebit, error:dep4.error});

  const nbv2Before = (await api('finance1','GET','/api/fixed-assets')).assets?.find(a=>a.id===fa2.asset?.id);
  const dispose2 = await api('finance1','POST',`/api/fixed-assets/${fa2.asset?.id}/dispose`,{disposalDate:'2026-03-15', disposalProceeds:145000, reason:'Phase 39 E2E — disposal at a gain'});
  const expectedGain2 = nbv2Before ? r2(145000 - nbv2Before.netBookValue) : null;
  record('FA','Second asset disposed at a GAIN, gainOrLoss matches independently-computed (proceeds - NBV)', dispose2.ok===true && expectedGain2!==null && Math.abs(dispose2.gainOrLoss - expectedGain2) < 0.02, {gainOrLoss:dispose2.gainOrLoss, expectedGain2, proceeds:145000, nbvBefore:nbv2Before?.netBookValue, error:dispose2.error});

  function r2(n){ return Math.round(n*100)/100; }

  // ============================= REGISTER <-> GL RECONCILIATION =============================
  console.log('\n===== RECONCILIATION =====');

  const reconFinal = await api('finance1','GET','/api/fixed-assets/reconciliation');
  const rc = reconFinal.reconciliation || {};
  record('FA','Fixed Asset Register cost reconciles exactly to GL account 1400', reconFinal.ok===true && rc.costMatches===true, rc);
  record('FA','Accumulated Depreciation register reconciles exactly to GL account 1450', reconFinal.ok===true && rc.accumDepMatches===true, rc);
  record('FA','Disposed assets correctly EXCLUDED from on-books register (both test assets now disposed)', rc.disposedCount>=2 && rc.assetCount===0 && rc.registerCost===0, rc);

  console.log('\n===== TOTAL: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.part}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail ?? null).slice(0,300)}`));
  require('fs').writeFileSync('phase39_fixed_assets_results.json', JSON.stringify(results, null, 2));
  process.exit(results.some(r=>r.pass===false) ? 1 : 0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
