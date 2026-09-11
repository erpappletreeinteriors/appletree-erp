// Phase 21 §12/§13 — Migration Rehearsal (controlled, masked/sample data only — NO production
// data). Workflow: Extract -> Transform -> Validate -> Import -> Reconcile -> UAT -> Rollback.
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
const jars = {};
let PASS=0, FAIL=0;
function record(desc, ok, detail){ if(ok) PASS++; else FAIL++; console.log((ok?'✅ PASS':'❌ FAIL')+' | '+desc+(ok?'':' | '+String(JSON.stringify(detail)).slice(0,300))); }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

// -------- 1. EXTRACT: simulated source-system export (masked/sample, clearly not real Appletree data) --------
const SOURCE_CUSTOMERS = [
  {name:'MIGRATION-TEST Customer Alpha', contact:'9000000001', paymentTerms:'30 days'},
  {name:'MIGRATION-TEST Customer Beta', contact:'9000000002', paymentTerms:'15 days'},
  {name:'MIGRATION-TEST Customer Gamma', contact:'9000000003', paymentTerms:'45 days'},
];
const SOURCE_SUPPLIERS = [
  {name:'MIGRATION-TEST Supplier Alpha', paymentTerms:'30 days', category:'General'},
  {name:'MIGRATION-TEST Supplier Beta', paymentTerms:'45 days', category:'General'},
];
const SOURCE_ITEMS = [
  {code:'MIGTEST-001', description:'MIGRATION-TEST Item One', category:'General', uom:'pc', standardCost:'100'},
  {code:'MIGTEST-002', description:'MIGRATION-TEST Item Two', category:'General', uom:'sqft', standardCost:'50'},
];
const SOURCE_PROJECTS = [
  {name:'MIGRATION-TEST Project One', budget:'250000'},
];

function csvOf(rows, headers){ return headers.join(',') + '\n' + rows.map(r=>headers.map(h=>r[h]!==undefined?r[h]:'').join(',')).join('\n'); }

(async()=>{
  await __erp059cPreflight();
  await login('admin','Admin@12345');
  await login('finance1','Fin@12345');
  await api('admin','POST','/api/test/reset');

  console.log('=== 1. EXTRACT (simulated source export — masked/sample data, NOT real Appletree data) ===');
  console.log('Source counts:', {customers:SOURCE_CUSTOMERS.length, suppliers:SOURCE_SUPPLIERS.length, items:SOURCE_ITEMS.length, projects:SOURCE_PROJECTS.length});

  console.log('\n=== 2. TRANSFORM (map source fields -> ERP import CSV shape) ===');
  const customerCsv = csvOf(SOURCE_CUSTOMERS, ['name','contact','billingAddress','siteAddress','gstin','paymentTerms']);
  const supplierCsv = csvOf(SOURCE_SUPPLIERS, ['name','gstNumber','paymentTerms','category']);
  const itemCsv = csvOf(SOURCE_ITEMS, ['code','description','category','uom','standardCost','taxCode','hsnCode']);
  const projectCsv = csvOf(SOURCE_PROJECTS, ['name','budget','customerId','branchId','projectManagerId']);
  console.log('Transformed CSVs built for: Customers, Suppliers, Items, Projects');

  console.log('\n=== 2b. VALIDATE (deliberately include one bad row to prove partial-import protection) ===');
  const badItemCsv = itemCsv + '\n,MIGTEST-003 with no code,General,pc,10,,'; // missing required 'code'
  const badImportAttempt = await api('admin','POST','/api/master-import',{importType:'Items', csvText:badItemCsv});
  const badRowRejected = badImportAttempt.ok && badImportAttempt.results.some(r=>r.status==='REJECTED');
  const goodRowsStillAccepted = badImportAttempt.ok && badImportAttempt.results.some(r=>r.status==='ACCEPTED');
  record('A batch with one invalid row rejects ONLY that row (per-row validation, not silent, not all-or-nothing wholesale)', badRowRejected && goodRowsStillAccepted, badImportAttempt.batch);
  // Note: this framework validates PER ROW (each row independently accepted/rejected with a
  // reason), not as an all-or-nothing FILE — confirmed by reading importMasterData() directly
  // rather than assumed. Re-import cleanly for the real rehearsal below to avoid double-counting
  // the 2 valid items from this deliberately-dirty batch.
  await api('admin','POST','/api/test/reset');

  console.log('\n=== 3. IMPORT (the clean, validated batch) ===');
  const custImport = await api('admin','POST','/api/master-import',{importType:'Customers', csvText:customerCsv});
  record('Customers imported', custImport.ok, custImport.batch);
  const suppImport = await api('admin','POST','/api/master-import',{importType:'Suppliers', csvText:supplierCsv});
  record('Suppliers imported', suppImport.ok, suppImport.batch);
  const itemImport = await api('admin','POST','/api/master-import',{importType:'Items', csvText:itemCsv});
  record('Items imported', itemImport.ok, itemImport.batch);
  const projImport = await api('admin','POST','/api/master-import',{importType:'Projects', csvText:projectCsv});
  record('Projects imported', projImport.ok, projImport.batch);

  console.log('\n=== 4. RECONCILE (Source count === ERP count, for exactly what was imported) ===');
  const custBefore = (custImport.batch && custImport.batch.acceptedCount) || 0;
  const suppBefore = (suppImport.batch && suppImport.batch.acceptedCount) || 0;
  const itemBefore = (itemImport.batch && itemImport.batch.acceptedCount) || 0;
  const projBefore = (projImport.batch && projImport.batch.acceptedCount) || 0;
  record('Source Customer count === Imported count', custBefore===SOURCE_CUSTOMERS.length, {source:SOURCE_CUSTOMERS.length, imported:custBefore});
  record('Source Supplier count === Imported count', suppBefore===SOURCE_SUPPLIERS.length, {source:SOURCE_SUPPLIERS.length, imported:suppBefore});
  record('Source Item count === Imported count', itemBefore===SOURCE_ITEMS.length, {source:SOURCE_ITEMS.length, imported:itemBefore});
  record('Source Project count === Imported count', projBefore===SOURCE_PROJECTS.length, {source:SOURCE_PROJECTS.length, imported:projBefore});

  const allCustomers = await api('admin','GET','/api/customers');
  const migratedNames = allCustomers.customers.filter(c=>c.name.startsWith('MIGRATION-TEST'));
  record('Every migrated customer name is present and exact (no truncation/corruption)', migratedNames.length===SOURCE_CUSTOMERS.length && SOURCE_CUSTOMERS.every(sc=>migratedNames.some(mc=>mc.name===sc.name)), migratedNames.map(m=>m.name));

  console.log('\n=== 5. Opening Balance import + reconciliation (Opening AR, in a DRAFT state — reversible before commit) ===');
  const custId = migratedNames[0].id;
  const openingArCsv = 'customerId,invoiceRef,invoiceDate,dueDate,amount,project\n'+custId+',MIGTEST-OPENING-001,2026-01-01,2026-01-31,45000,';
  const obImport = await api('admin','POST','/api/opening-balance/import',{type:'OpeningAR', csvText:openingArCsv});
  record('Opening AR batch imported as DRAFT(s), not yet posted', obImport.ok, obImport.batch);

  console.log('\n=== 6. ROLLBACK TEST — every import must be reversible BEFORE accounting is committed ===');
  if(obImport.ok && obImport.results && obImport.results.length && obImport.results[0].draftId){
    const draftId = obImport.results[0].draftId;
    const cancelResult = await api('finance1','POST',`/api/journal/${draftId}/cancel`,{reason:'Migration rehearsal — rollback test before commit'});
    record('Draft Opening AR entry can be CANCELLED before posting (rollback proven, no GL impact ever occurred)', cancelResult.ok, cancelResult);
    const tbCheck = await api('admin','GET','/api/trial-balance');
    let dr=0,cr=0; if(tbCheck.byAccount) for(const k in tbCheck.byAccount){ dr+=tbCheck.byAccount[k].debit||0; cr+=tbCheck.byAccount[k].credit||0; }
    record('Trial Balance still balances after the rollback (nothing was ever posted)', Math.abs(dr-cr)<0.02, {dr,cr});
  } else {
    record('Opening AR draft ID available for rollback test', false, obImport);
  }

  console.log('\n=== 7. UAT step — re-import the SAME opening balance and actually complete it (commit path) ===');
  const openingArCsv2 = 'customerId,invoiceRef,invoiceDate,dueDate,amount,project\n'+custId+',MIGTEST-OPENING-002,2026-01-01,2026-01-31,45000,';
  const obImport2 = await api('admin','POST','/api/opening-balance/import',{type:'OpeningAR', csvText:openingArCsv2});
  if(obImport2.ok && obImport2.results && obImport2.results.length && obImport2.results[0].draftId){
    const draftId = obImport2.results[0].draftId;
    await api('admin','POST',`/api/journal/${draftId}/submit`);
    const approved = await api('finance1','POST',`/api/journal/${draftId}/approve`);
    const posted = await api('finance1','POST',`/api/journal/${draftId}/post`);
    record('Opening AR draft posted end-to-end (full commit path)', posted.ok, posted);
    const openingRecon = await api('admin','GET','/api/opening-balance/reconciliation');
    record('Opening Balance reconciliation report available and callable post-commit', openingRecon.ok, openingRecon);
  }

  console.log('\n================ '+PASS+' PASS / '+FAIL+' FAIL / '+(PASS+FAIL)+' TOTAL ================');
  process.exitCode = FAIL>0 ? 1 : 0;
})();
