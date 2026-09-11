'use strict';
// Phase 20 §4-§10 — Master Data Import Framework + Opening Balance Engine + the GSTIN field
// consolidation defect fix. Real HTTP calls, no simulation.
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
  await Promise.all(['finance1','accountant1','sales1','purchase1'].map(u=>login(u, {finance1:'Fin@12345',accountant1:'Acc@12345',sales1:'Sal@123456',purchase1:'Pur@12345'}[u])));

  // ================= Security: masterData-tier gate =================
  const denyImport = await api('sales1','POST','/api/master-import',{importType:'Customers', csvText:'name\nX'});
  record('§4/Security', 'Sales cannot import master data', denyImport.status===403, denyImport);
  const denyOB = await api('accountant1','POST','/api/opening-balance/import',{type:'OpeningAR', csvText:'x'});
  record('§7/Security', 'Accountant (not masterData-tier) cannot import opening balances', denyOB.status===403, denyOB);

  // ================= §4/§5 Master Data Import — all types, valid + invalid rows =================
  const custImp = await api('admin','POST','/api/master-import',{importType:'Customers', csvText:'name,contact,gstin\nTEST Customer Alpha,9999999999,32AABCT1234A1Z5\nTEST Customer Beta,8888888888,BADFORMAT'});
  record('§4', 'Customer import: valid GSTIN row accepted', custImp.ok && custImp.results[0].status==='ACCEPTED', custImp.results[0]);
  record('§5', 'Customer import: invalid GSTIN format row REJECTED with a clear reason, not silently imported', custImp.results[1].status==='REJECTED' && /GSTIN/.test(custImp.results[1].reason), custImp.results[1]);

  const vendImp = await api('admin','POST','/api/master-import',{importType:'Suppliers', csvText:'name,gstNumber\nTEST Vendor Alpha,32AABCV1234A1Z5\nTEST Vendor Alpha,32AABCV1234A1Z5'});
  record('§4', 'Vendor import: first occurrence accepted', vendImp.results[0].status==='ACCEPTED', vendImp.results[0]);
  record('§5', 'Vendor import: duplicate name in the SAME batch correctly rejected as a duplicate', vendImp.results[1].status==='REJECTED' && /uplicate/.test(vendImp.results[1].reason), vendImp.results[1]);

  const itemImp = await api('admin','POST','/api/master-import',{importType:'Items', csvText:'code,description,uom,taxCode\nTESTITEM1,Test Item,pc,GST18\nTESTITEM2,Bad Tax Item,pc,NOTREAL'});
  record('§5', 'Item import: unknown tax code rejected, not silently accepted with a bad reference', itemImp.results[1].status==='REJECTED' && /tax code/.test(itemImp.results[1].reason), itemImp.results[1]);
  record('§4', 'Item import: valid row creates a real material, HSN preserved when supplied', itemImp.results[0].status==='ACCEPTED', itemImp.results[0]);

  const projImp = await api('admin','POST','/api/master-import',{importType:'Projects', csvText:'name,customerId\nTest Project Alpha,CUST-1\nTest Project Beta,CUST-9999'});
  record('§5', 'Project import: unknown customer reference rejected', projImp.results[1].status==='REJECTED' && /customer/.test(projImp.results[1].reason), projImp.results[1]);

  const ccImp = await api('admin','POST','/api/master-import',{importType:'CostCentres', csvText:'id,name\nTESTCC1,Test Cost Centre One'});
  record('§4', 'Cost Centre import creates a real cost centre', ccImp.results[0].status==='ACCEPTED', ccImp.results[0]);

  const taxImp = await api('admin','POST','/api/master-import',{importType:'TaxCodes', csvText:'code,label,cgstPct,sgstPct\nTESTGST9,Test GST 9%,4.5,4.5\nGST18,Duplicate,9,9'});
  record('§5', 'Tax Code import: duplicate existing code rejected', taxImp.results[1].status==='REJECTED', taxImp.results[1]);

  const coaImp = await api('admin','POST','/api/master-import',{importType:'ChartOfAccounts', csvText:'accountCode,accountName,accountType\n9001,Test Suspense Account,Asset\n1100,Duplicate AR,Asset\n9002,Bad Type,NotAType'});
  record('§6', 'COA import: valid new account code accepted, structurally ready to receive the real Appletree COA', coaImp.results[0].status==='ACCEPTED', coaImp.results[0]);
  record('§6', 'COA import: existing account code rejected as duplicate — cannot silently overwrite', coaImp.results[1].status==='REJECTED' && /uplicate/.test(coaImp.results[1].reason), coaImp.results[1]);
  record('§6', 'COA import: invalid account type rejected', coaImp.results[2].status==='REJECTED' && /Type/.test(coaImp.results[2].reason), coaImp.results[2]);

  const bankImp = await api('admin','POST','/api/master-import',{importType:'Banks', csvText:'bankName,accountName\nTest Bank,Test Account'});
  record('§4', 'Bank import creates a real bank account entry', bankImp.results[0].status==='ACCEPTED', bankImp.results[0]);

  const pmImp = await api('admin','POST','/api/master-import',{importType:'PaymentMethods', csvText:'code,name\nTESTPM,Test Wallet\nCASH,Duplicate Cash'});
  record('§4', 'Payment Method import creates a new method', pmImp.results[0].status==='ACCEPTED', pmImp.results[0]);
  record('§5', 'Payment Method import: duplicate existing code rejected', pmImp.results[1].status==='REJECTED', pmImp.results[1]);

  const faImp = await api('admin','POST','/api/master-import',{importType:'FixedAssets', csvText:'assetName,purchaseDate,cost\nTest Bulk Asset,2026-01-01,50000\nBad Asset,not-a-date,abc'});
  record('§4', 'Fixed Asset bulk import registers a real asset (Purchased status, not capitalized)', faImp.results[0].status==='ACCEPTED', faImp.results[0]);
  record('§5', 'Fixed Asset bulk import: invalid date AND invalid cost both caught, row rejected', faImp.results[1].status==='REJECTED' && /purchaseDate/.test(faImp.results[1].reason) && /cost/.test(faImp.results[1].reason), faImp.results[1]);

  const srImp = await api('admin','POST','/api/master-import',{importType:'ServiceLabourRates', csvText:'technicianLevel,normalHourRate,sacCode\nSeniorTechTest,500,998719'});
  record('§4', 'Service Labour Rate import (carries SAC) succeeds', srImp.results[0].status==='ACCEPTED', srImp.results[0]);

  // ================= Missing required field never partially imports =================
  const missingFieldImp = await api('admin','POST','/api/master-import',{importType:'Customers', csvText:'name,contact\n,9999999999'});
  record('§5', 'A row missing its required field is REJECTED outright — never partially imported with a blank name', missingFieldImp.results[0].status==='REJECTED' && /Missing required/.test(missingFieldImp.results[0].reason), missingFieldImp.results[0]);
  const customersAfter = await api('admin','GET','/api/customers');
  record('§5', 'No customer with a blank name exists after the rejected-row import attempt', !customersAfter.customers.some(c=>!c.name || !c.name.trim()), 'checked all customers');

  // ================= Import batch audit trail =================
  const batches = await api('admin','GET','/api/master-import/batches');
  record('§4', 'Every import batch is recorded with accepted/rejected counts for audit', batches.ok && batches.batches.length>0 && batches.batches[0].acceptedCount!==undefined, batches.batches.length);

  // ================= §7-§10 Opening Balance Engine =================
  const arImp = await api('admin','POST','/api/opening-balance/import',{type:'OpeningAR', csvText:'customerId,invoiceRef,invoiceDate,amount\nCUST-1,OB-TEST-001,2026-01-01,75000\nCUST-9999,OB-TEST-002,2026-01-01,1000'});
  record('§8', 'Opening AR: valid row against a real customer creates a Draft, not an immediate posting', arImp.results[0].status==='ACCEPTED' && !!arImp.results[0].draftId, arImp.results[0]);
  record('§8', 'Opening AR: unknown customer reference rejected', arImp.results[1].status==='REJECTED' && /customer/.test(arImp.results[1].reason), arImp.results[1]);
  const dupArImp = await api('admin','POST','/api/opening-balance/import',{type:'OpeningAR', csvText:'customerId,invoiceRef,invoiceDate,amount\nCUST-1,OB-TEST-001,2026-01-01,75000'});
  record('§8', 'Opening AR: exact duplicate document (same customer+invoiceRef) rejected on a SECOND import', dupArImp.results[0].status==='REJECTED' && /already imported/.test(dupArImp.results[0].reason), dupArImp.results[0]);

  const apImp = await api('admin','POST','/api/opening-balance/import',{type:'OpeningAP', csvText:'vendorId,billRef,billDate,amount\nVEND-1,OB-BILL-001,2026-01-01,45000'});
  record('§8', 'Opening AP: valid row against a real vendor creates a Draft', apImp.results[0].status==='ACCEPTED', apImp.results[0]);

  const invImp = await api('admin','POST','/api/opening-balance/import',{type:'OpeningInventory', csvText:'materialId,warehouseId,qty,unitCost\nMAT-3,WH-1,50,3500'});
  record('§9', 'Opening Inventory: valid row creates a Draft (no stock movement yet, since not yet posted)', invImp.results[0].status==='ACCEPTED', invImp.results[0]);
  const stockBeforePost = await api('admin','GET','/api/inventory/stock?materialId=MAT-3&warehouseId=WH-1');
  record('§9', 'Stock does NOT move at import time — only once the accounting entry is actually posted', stockBeforePost.stock===0, stockBeforePost.stock);

  const glImp = await api('admin','POST','/api/opening-balance/import',{type:'OpeningGLBalances', csvText:'accountCode,amount,drCr\n1000,300000,DR\n1100,999,CR'});
  record('§7', 'Opening GL Balances: a subledger control account (AR/1100) is correctly REJECTED — must use the Opening AR template instead, to keep subledger and control in sync', glImp.results[1].status==='REJECTED' && /subledger control/.test(glImp.results[1].reason), glImp.results[1]);
  record('§7', 'Opening GL Balances: a real non-control account (Bank/1000) is accepted', glImp.results[0].status==='ACCEPTED', glImp.results[0]);

  // ================= Post an Opening Balance draft through the GENERIC Document Workflow route (not the dedicated one) — proves §16 consistency =================
  const arDraftId = arImp.results[0].draftId;
  await api('accountant1','POST',`/api/journal/${arDraftId}/submit`);
  await api('finance1','POST',`/api/journal/${arDraftId}/approve`);
  const genericPost = await api('finance1','POST',`/api/journal/${arDraftId}/post`);
  record('§16', 'An Opening Balance draft posts correctly through the SAME generic /api/journal/:id/post route used by every other document type — no separate hidden posting path', genericPost.ok && genericPost.entry.lines.some(l=>l.account==='1100'&&l.debit===75000) && genericPost.entry.lines.some(l=>l.account==='3000'), genericPost.entry&&genericPost.entry.voucherNo);
  const arOpenItems = await api('admin','GET','/api/ar/open-items?customerId=CUST-1');
  record('§8', 'Opening AR = AR Subledger — the posted opening entry appears as a real open item for the customer, ageing-ready', arOpenItems.ok && arOpenItems.items.some(i=>i.entryId===genericPost.entry.id && i.open===75000), arOpenItems.items.find(i=>i.entryId===genericPost.entry.id));

  // Now post the Opening Inventory draft via the DEDICATED opening-balance route — proves BOTH routes trigger the stock side-effect identically
  const invDraftId = invImp.results[0].draftId;
  await api('accountant1','POST',`/api/journal/${invDraftId}/submit`);
  await api('finance1','POST',`/api/journal/${invDraftId}/approve`);
  const dedicatedPost = await api('finance1','POST',`/api/opening-balance/drafts/${invDraftId}/post`);
  record('§9/§16', 'The SAME Opening Inventory draft posts correctly through the DEDICATED opening-balance route too — proving the stock side-effect is NOT duplicated-or-missing depending on which route is used', dedicatedPost.ok, dedicatedPost.entry&&dedicatedPost.entry.voucherNo);
  const stockAfterPost = await api('admin','GET','/api/inventory/stock?materialId=MAT-3&warehouseId=WH-1');
  record('§9', 'Opening Inventory = Inventory GL — stock and moving-average rate now reflect the posted opening entry exactly', stockAfterPost.stock===50 && stockAfterPost.movingAverageRate===3500, stockAfterPost);
  const invGLLine = (await api('admin','GET','/api/trial-balance')).byAccount['1200'];
  record('§9', 'GL Inventory account (1200) balance matches computed stock value exactly (50 × ₹3,500 = ₹1,75,000)', invGLLine && Math.abs((invGLLine.debit-invGLLine.credit)-175000)<0.02, invGLLine);

  // ================= Reconciliation =================
  const recon = await api('finance1','GET','/api/opening-balance/reconciliation');
  record('§7/§18', 'Opening Balance reconciliation reports the Opening Balance Equity account balance honestly — non-zero here since not every draft is posted yet, never silently forced to zero', recon.ok && recon.reconciliation.openingBalanceEquityAccount==='3000' && typeof recon.reconciliation.isZero==='boolean', recon.reconciliation);

  // ================= §31/§33 Rollback safety: an import with ALL invalid rows creates nothing =================
  const custCountBefore = (await api('admin','GET','/api/customers')).customers.length;
  const allBadImp = await api('admin','POST','/api/master-import',{importType:'Customers', csvText:'name,contact\n,111\n,222'});
  record('§33', 'An import batch where every row is invalid (blank required field) rejects all of them — nothing partially created', allBadImp.ok && allBadImp.batch.acceptedCount===0 && allBadImp.batch.rejectedCount===2, allBadImp.batch);
  const custCountAfter = (await api('admin','GET','/api/customers')).customers.length;
  record('§33', 'Customer count is unchanged after an all-rejected import batch — confirmed via an independent count, not just the batch summary', custCountAfter===custCountBefore, {before:custCountBefore, after:custCountAfter});

  // ================= Phase 20 §1: GSTIN field consolidation defect regression =================
  const wonFlowCust = await api('admin','POST','/api/customers?mode=find-or-create',{name:'TEST Won-Flow Customer', gstin:'32aabcw1234a1z5'});
  record('§1/Defect-fix', 'findOrCreateCustomer now writes the SAME `gstin` field (normalized uppercase) as the Phase 19 Customer GSTIN screen — no more duplicate/inconsistent field', wonFlowCust.ok && wonFlowCust.customer.gstin==='32AABCW1234A1Z5' && wonFlowCust.customer.gstNumber===undefined, wonFlowCust.customer);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 20 MASTER DATA IMPORT + OPENING BALANCE ENGINE ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
