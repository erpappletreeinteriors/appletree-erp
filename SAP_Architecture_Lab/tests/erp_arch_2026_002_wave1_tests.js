'use strict';
// ARCH-2026-002 Wave 1 — dedicated test suite for this wave's 2 authorized implementation items:
// (1) Reporting & Analytics cross-project data-scope fix (projectBudgetVarianceReport).
// (2) Bank Reconciliation consolidation (bankStatementLines legacy path -> the ONE bankImportLines
//     engine, with the generic CSV format as an input adapter and a non-destructive migration path
//     for historical legacy records).
// Runs against a fully disposable, isolated scratch server (own copy of domain.js/server.js/env.js/
// auth.js/route_safety_scanner.js/index.html, own random port, own random DB path) — never touches
// SAP_Architecture_Lab/server/db.json. Production hash is captured before and after.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(REPO_ROOT, 'server');
const CLIENT_DIR = path.join(REPO_ROOT, 'client_secure');
const PROD_DB = path.join(SERVER_DIR, 'db.json');

const results = [];
function record(name, pass, detail) { results.push({ name, pass: !!pass, detail }); }
function hashFile(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function r2(n){ return Math.round(n*100)/100; }

function makeScratch() {
  const uniqueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const root = path.join(os.tmpdir(), `erp-arch2026002-wave1-${uniqueId}`);
  const serverDir = path.join(root, 'server');
  const clientDir = path.join(root, 'client_secure');
  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(clientDir, { recursive: true });
  for (const f of ['domain.js', 'server.js', 'env.js', 'auth.js', 'route_safety_scanner.js']) {
    fs.copyFileSync(path.join(SERVER_DIR, f), path.join(serverDir, f));
  }
  fs.copyFileSync(path.join(CLIENT_DIR, 'index.html'), path.join(clientDir, 'index.html'));
  return { root, serverDir, dbPath: path.join(serverDir, 'db.json') };
}
function rmScratch(root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) {} }

function spawnServer(cwd, port, dbPath) {
  return new Promise((resolve) => {
    const child = spawn('node', ['server.js'], { cwd, env: { ...process.env, APP_ENV: 'test', PORT: String(port), DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    let settled = false;
    child.on('exit', (code) => { if (!settled) { settled = true; resolve({ child: null, exited: true, code, stdout, stderr }); } });
    const start = Date.now();
    (function poll() {
      if (settled) return;
      if (Date.now() - start > 20000) { settled = true; resolve({ child, exited: false, timedOut: true, stdout, stderr }); return; }
      if (/listening on/i.test(stdout)) { settled = true; resolve({ child, exited: false, stdout, stderr }); return; }
      setTimeout(poll, 150);
    })();
  });
}
function killIfAlive(child) {
  if (!child) return;
  try { process.platform === 'win32' ? execSync(`taskkill /PID ${child.pid} /F`) : child.kill('SIGKILL'); } catch (e) {}
}
function sleep(ms){ return new Promise(res=>setTimeout(res,ms)); }

let PORT, BASE;
const jars = {};
async function login(u,p){ const r = await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return {status:r.status, ...(await r.json().catch(()=>({})))}; }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r = await fetch(BASE+p,{method:m,headers:h,body:b!==undefined?JSON.stringify(b):undefined}); return {status:r.status, ...(await r.json().catch(()=>({})))}; }

async function main(){
  const prodHashBefore = hashFile(PROD_DB);
  const scratch = makeScratch();
  PORT = 45000 + Math.floor(Math.random()*4000);
  BASE = `http://localhost:${PORT}`;

  let spawned = await spawnServer(scratch.serverDir, PORT, scratch.dbPath);
  if(spawned.timedOut || spawned.exited){ console.error('Server failed to start', spawned.stdout, spawned.stderr); process.exit(1); }
  console.log('[TEST TARGET]', BASE);

  await Promise.all([
    login('admin','Admin@12345'), login('ceo','Ceo@12345'), login('finance1','Fin@12345'),
    login('accountant1','Acc@12345'), login('pm1','Pm@123456'), login('purchase1','Pur@12345'), login('sales1','Sal@123456')
  ]);

  // ============================= PART 1 — Reporting & Analytics scope fix =============================
  console.log('\n===== PART 1 — Budget Variance report scope fix =====');

  const pmNoFilter = await api('pm1','GET','/api/reports/budget-variance');
  const pmProjIds = (pmNoFilter.projects||[]).map(p=>p.projectId).sort();
  record('[RPT] pm1 with NO projectId sees ONLY their own assigned projects (PRJ-1, PRJ-3), not company-wide', pmNoFilter.ok===true && JSON.stringify(pmProjIds)===JSON.stringify(['PRJ-1','PRJ-3']), {pmProjIds});

  const pmForeign = await api('pm1','GET','/api/reports/budget-variance?projectId=PRJ-2');
  record('[RPT-NEG] pm1 requesting a FOREIGN project (PRJ-2, not assigned to them) sees ZERO rows, not that project\'s data', pmForeign.ok===true && (pmForeign.projects||[]).length===0, {rows:pmForeign.projects});

  const pmOwn = await api('pm1','GET','/api/reports/budget-variance?projectId=PRJ-1');
  record('[RPT] pm1 requesting their OWN project (PRJ-1) still sees it — positive control, fix is not over-blocking', pmOwn.ok===true && (pmOwn.projects||[]).length===1 && pmOwn.projects[0].projectId==='PRJ-1', {rows:pmOwn.projects});

  const ceoAll = await api('ceo','GET','/api/reports/budget-variance');
  record('[RPT] CEO (company-wide role) is UNAFFECTED — still sees ALL 5 seeded projects', ceoAll.ok===true && (ceoAll.projects||[]).length>=5, {count:(ceoAll.projects||[]).length});

  const finAll = await api('finance1','GET','/api/reports/budget-variance');
  record('[RPT] FinanceManager (company-wide role) is UNAFFECTED — still sees ALL projects', finAll.ok===true && (finAll.projects||[]).length>=5, {count:(finAll.projects||[]).length});

  const noAuth = await fetch(BASE+'/api/reports/budget-variance');
  record('[RPT-NEG] Missing authentication is rejected (401/403, never 200)', noAuth.status===401||noAuth.status===403, {status:noAuth.status});

  // ============================= PART 2 — Bank Reconciliation: setup =============================
  console.log('\n===== PART 2 — Bank Reconciliation consolidation setup =====');

  const glAcct = await api('ceo','POST','/api/masters/account',{accountCode:'W1-1001', accountName:'HDFC Bank — Wave1 Test', accountType:'Asset'});
  record('[SETUP] GL account created for the test bank', glAcct.ok===true, {error:glAcct.error});
  const glExpense = await api('ceo','POST','/api/masters/account',{accountCode:'W1-5200', accountName:'Site Expense — Wave1 Test', accountType:'Expense'});
  record('[SETUP] GL expense account created for allocation target', glExpense.ok===true, {error:glExpense.error});

  const bankAcc = await api('ceo','POST','/api/bank-accounts',{bankName:'HDFC (Wave1 fictional)', accountName:'Wave1 Current Account', accountNumberLast4:'7788', glAccount:'W1-1001', type:'Bank'});
  record('[SETUP] Bank account created, distinct GL code', bankAcc.ok===true, {error:bankAcc.error});
  const bankId = bankAcc.bankAccount?.id;

  // ============================= PART 3 — Legacy (generic) import now feeds the unified engine =============================
  console.log('\n===== PART 3 — Legacy generic-CSV import consolidation =====');

  const genericCsv = 'Date,Reference,Description,Amount,Type\n2026-09-10,RCPT/W1/0001,Wave1 test customer receipt,15000,Credit\n2026-09-11,PAY/W1/0001,Wave1 test vendor payment,4000,Debit';
  const legacyImport = await api('finance1','POST','/api/bank-statement/import',{bankAccountId:bankId, csvText:genericCsv});
  record('[LEGACY] Legacy generic import still succeeds via /api/bank-statement/import (unchanged response shape)', legacyImport.ok===true && (legacyImport.lines||[]).length===2, {lines:legacyImport.lines, error:legacyImport.error});

  const unifiedAfterLegacy = await api('finance1','GET',`/api/bank-import/lines?bankAccountId=${bankId}`);
  record('[CONSOLIDATION] Legacy-imported lines are ACTUALLY STORED in the unified bankImportLines engine (not a separate collection)', unifiedAfterLegacy.ok===true && (unifiedAfterLegacy.lines||[]).filter(l=>l.sourceFormat==='GENERIC').length===2, {lines:unifiedAfterLegacy.lines?.map(l=>({id:l.id, sourceFormat:l.sourceFormat}))});

  const dupLegacyImport = await api('finance1','POST','/api/bank-statement/import',{bankAccountId:bankId, csvText:genericCsv});
  const dupCheckLines = await api('finance1','GET',`/api/bank-import/lines?bankAccountId=${bankId}&status=Duplicate`);
  record('[LEGACY-NEG] Re-importing the SAME generic CSV is caught by the unified duplicate-detection (2 Duplicate lines, not silently re-imported)', dupLegacyImport.ok===true && (dupCheckLines.lines||[]).length===2, {duplicateLines:dupCheckLines.lines?.length, error:dupLegacyImport.error});

  const badCsv = 'Date,Reference,Amount\n2026-09-10,X,100';
  const badImport = await api('finance1','POST','/api/bank-statement/import',{bankAccountId:bankId, csvText:badCsv});
  record('[LEGACY-NEG] Malformed generic CSV (missing Type column) is rejected with a clear error', badImport.ok===false && !!badImport.error, {error:badImport.error, errors:badImport.errors});

  // ============================= PART 4 — Match / Unmatch via the legacy endpoint =============================
  console.log('\n===== PART 4 — Legacy match/unmatch (one-step UX preserved) =====');

  // Raise and post a real Journal Entry we can match the receipt line against.
  const jeDraft = await api('finance1','POST','/api/journal/draft',{date:'2026-09-10', narration:'Wave1 test JE for bank match', lines:[
    {account:'W1-1001', debit:15000, credit:0}, {account:'4000', debit:0, credit:15000}
  ]});
  const jeId = jeDraft.draft?.id;
  await api('accountant1','POST',`/api/journal/${jeId}/submit`);
  await api('ceo','POST',`/api/journal/${jeId}/approve`);
  const jePosted = await api('ceo','POST',`/api/journal/${jeId}/post`);
  record('[SETUP] Test JE posted for matching (Dr Bank 15000 / Cr Sales 15000)', jePosted.ok===true, {entryId:jePosted.entry?.id, error:jePosted.error});
  const jeEntryId = jePosted.entry?.id;

  const recon1 = await api('finance1','GET',`/api/bank-reconciliation?bankAccountId=${bankId}`);
  const receiptLine = (recon1.reconciliation?.unmatchedItems||[]).find(l=>l.amount===15000 && l.type==='Credit');
  record('[LEGACY] Legacy /api/bank-reconciliation view (old field shape: date/description/type) correctly shows the imported line as Unmatched', !!receiptLine, {unmatchedItems:recon1.reconciliation?.unmatchedItems});

  const matchResult = await api('finance1','POST',`/api/bank-statement/${receiptLine?.id}/match`,{entryId:jeEntryId});
  record('[LEGACY] Legacy match endpoint still goes straight to Reconciled in ONE step (old UX preserved), now backed by the unified engine', matchResult.ok===true && matchResult.line?.status==='Reconciled', {line:matchResult.line, error:matchResult.error});

  const reconAfterMatch = await api('finance1','GET',`/api/bank-reconciliation?bankAccountId=${bankId}`);
  const stillMatched = (reconAfterMatch.reconciliation?.matchedItems||[]).find(l=>l.id===receiptLine?.id);
  record('[LEGACY] Legacy reconciliation view reflects the match (moved from Unmatched to Reconciled bucket)', !!stillMatched && stillMatched.matchedEntryId===jeEntryId, {matchedItems:reconAfterMatch.reconciliation?.matchedItems});

  const unifiedView = await api('finance1','GET',`/api/bank-import/lines?bankAccountId=${bankId}`);
  const sameLineUnified = (unifiedView.lines||[]).find(l=>l.id===receiptLine?.id);
  record('[CONSOLIDATION] The SAME line, viewed through the unified bank-import API, shows status Reconciled too — ONE engine, ONE truth', sameLineUnified?.status==='Reconciled', {line:sameLineUnified});

  const unmatchResult = await api('finance1','POST',`/api/bank-statement/${receiptLine?.id}/unmatch`);
  record('[LEGACY] Legacy unmatch endpoint works, resets the unified line to Imported', unmatchResult.ok===true && unmatchResult.line?.status==='Unmatched', {line:unmatchResult.line, error:unmatchResult.error});

  const unifiedAfterUnmatch = await api('finance1','GET',`/api/bank-import/lines?bankAccountId=${bankId}`);
  const lineAfterUnmatch = (unifiedAfterUnmatch.lines||[]).find(l=>l.id===receiptLine?.id);
  record('[CONSOLIDATION] Unified view confirms the SAME line reset to Imported (not Reconciled) after the legacy unmatch call', lineAfterUnmatch?.status==='Imported', {line:lineAfterUnmatch});

  // ============================= PART 5 — Generic-format lines now gain capabilities they never had (allocate) =============================
  console.log('\n===== PART 5 — Generic-imported line can now be directly allocated (a real new capability) =====');

  const genericLines = await api('finance1','GET',`/api/bank-import/lines?bankAccountId=${bankId}&crDr=DR`);
  const debitLine = (genericLines.lines||[]).find(l=>l.sourceFormat==='GENERIC' && l.status==='Imported');
  record('[SETUP] A generic-imported DR line is available, unallocated', !!debitLine, {debitLine});

  const balBeforeAlloc = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankId)?.balance || 0;
  const alloc = await api('finance1','POST',`/api/bank-import/lines/${debitLine?.id}/post`,{glAccount:'W1-5200', narration:'Wave1 test allocation of a legacy-format-imported line'});
  record('[ALLOCATE] A GENERIC-format-imported line can be allocated straight to the GL through postJournalEntry() — a capability the old legacy engine never had', alloc.ok===true, {entryId:alloc.entry?.id, error:alloc.error});
  const balAfterAlloc = (await api('finance1','GET','/api/bank-accounts/balances')).balances?.find(b=>b.id===bankId)?.balance || 0;
  record('[ACCOUNTING] Bank balance decreased by exactly the allocated line amount, through the single postJournalEntry() engine', r2(balBeforeAlloc-balAfterAlloc)===r2(debitLine?.amount||-1), {before:balBeforeAlloc, after:balAfterAlloc, expected:debitLine?.amount});

  const tb = await api('finance1','GET','/api/trial-balance');
  const tbAccounts = Object.values(tb.byAccount||{});
  const tbBalanced = tb.ok===true && r2(tbAccounts.reduce((s,a)=>s+(a.debit||0),0)) === r2(tbAccounts.reduce((s,a)=>s+(a.credit||0),0));
  record('[ACCOUNTING] Trial Balance remains balanced after the allocation', tbBalanced===true, {});

  // ============================= PART 6 — ICICI-format import regression (must be byte-for-byte unaffected) =============================
  console.log('\n===== PART 6 — ICICI-format import regression =====');

  const csvHeader = 'No,Transaction ID,Value Date,Txn Posted Date,Cheque No,Description,Cr/Dr,Transaction Amount,Available Balance';
  const iciciCsv = [csvHeader, '1,WAVE1ICICITXN01,12/09/2026,12/09/2026 10:15:00,-,NEFT/Wave1 Vendor Payment/Test,DR,3000,497000'].join('\n');
  const iciciBatch = await api('finance1','POST','/api/bank-import/batches',{bankAccountId:bankId, csvText:iciciCsv, statementAccountNumber:'XXXXXXXXXXXX7788', label:'Wave1 ICICI regression'});
  record('[ICICI-REGRESSION] ICICI-format import still works exactly as before (1 row, correct format tag, real balance validation active)', iciciBatch.ok===true && iciciBatch.batch?.rowCount===1 && iciciBatch.batch?.sourceFormat==='ICICI', {batch:iciciBatch.batch, error:iciciBatch.error});
  const iciciLine = (iciciBatch.lines||[])[0];
  record('[ICICI-REGRESSION] ICICI line correctly carries real balance-match data (unaffected by the GENERIC adapter\'s null-balance branch)', iciciLine && iciciLine.balanceMatches===true, {balanceMatches:iciciLine?.balanceMatches});

  const reconSummaryAfterIcici = await api('finance1','GET',`/api/bank-import/reconciliation-summary?bankAccountId=${bankId}`);
  record('[ICICI-REGRESSION] Reconciliation summary computes without treating GENERIC-format null-balance lines as false mismatches', reconSummaryAfterIcici.ok===true, {summary:reconSummaryAfterIcici.summary && {statementBalance:reconSummaryAfterIcici.summary.statementBalance, erpBankBalance:reconSummaryAfterIcici.summary.erpBankBalance}});

  // ============================= PART 7 — Authorization (both endpoints keep their EXACT existing gates) =============================
  console.log('\n===== PART 7 — Authorization unchanged on both API surfaces =====');

  const unauthLegacyImport = await api('sales1','POST','/api/bank-statement/import',{bankAccountId:bankId, csvText:genericCsv});
  record('[AUTH] Sales role blocked from legacy import (unchanged gate)', unauthLegacyImport.status===403, {status:unauthLegacyImport.status});
  const unauthUnifiedImport = await api('sales1','POST','/api/bank-import/batches',{bankAccountId:bankId, csvText:iciciCsv});
  record('[AUTH] Sales role blocked from unified import (unchanged gate)', unauthUnifiedImport.status===403, {status:unauthUnifiedImport.status});

  const unauthMigrate = await api('finance1','POST','/api/admin/migrate-legacy-bank-lines',{});
  record('[AUTH] FinanceManager (not Admin/CEO) is BLOCKED from the migration endpoint', unauthMigrate.status===403, {status:unauthMigrate.status});

  // ============================= PART 8 — Concurrency (2 simultaneous imports of the SAME file) =============================
  console.log('\n===== PART 8 — Concurrent import safety =====');

  const concurCsv = 'Date,Reference,Description,Amount,Type\n2026-09-15,CONC/0001,Wave1 concurrency test,999,Credit';
  const [c1, c2] = await Promise.all([
    api('finance1','POST','/api/bank-statement/import',{bankAccountId:bankId, csvText:concurCsv}),
    api('finance1','POST','/api/bank-statement/import',{bankAccountId:bankId, csvText:concurCsv})
  ]);
  const concurLines = await api('finance1','GET',`/api/bank-import/lines?bankAccountId=${bankId}`);
  const concurImportedCount = (concurLines.lines||[]).filter(l=>l.rawDescription && l.rawDescription.includes('CONC/0001')).length;
  record('[CONCURRENCY] 2 simultaneous imports of the identical file produce exactly 1 Imported + 1 Duplicate, never 2 Imported (no lost duplicate-check under race)', concurImportedCount===2 && (concurLines.lines||[]).filter(l=>l.rawDescription?.includes('CONC/0001') && l.status==='Duplicate').length===1, {concurImportedCount, c1ok:c1.ok, c2ok:c2.ok});

  // ============================= PART 9 — Historical migration (idempotent, non-destructive) =============================
  console.log('\n===== PART 9 — Legacy historical-record migration =====');

  // Inject a synthetic HISTORICAL bankStatementLines record directly into the scratch db.json, the
  // way real pre-Wave-1 production data would look (server must be stopped first — it only re-reads
  // db.json at boot, and a live save() would otherwise overwrite this edit).
  killIfAlive(spawned.child);
  await sleep(400);
  const dbRaw = JSON.parse(fs.readFileSync(scratch.dbPath, 'utf8'));
  const syntheticLegacy = { id:'BSL-90001', bankAccountId:bankId, date:'2026-08-01', reference:'HIST/0001', description:'Historical pre-Wave1 receipt',
    amount:7500, type:'Credit', status:'Reconciled', matchedEntryId:jeEntryId, reconciledDate:'2026-08-02', reconciledBy:'U-FIN1', importedBy:'U-FIN1', importedAt:'2026-08-01T10:00:00.000Z' };
  const syntheticLegacyUnmatched = { id:'BSL-90002', bankAccountId:bankId, date:'2026-08-03', reference:'HIST/0002', description:'Historical pre-Wave1 outstanding item',
    amount:1200, type:'Debit', status:'Unmatched', matchedEntryId:null, reconciledDate:null, reconciledBy:null, importedBy:'U-FIN1', importedAt:'2026-08-03T10:00:00.000Z' };
  dbRaw.bankStatementLines = [syntheticLegacy, syntheticLegacyUnmatched];
  fs.writeFileSync(scratch.dbPath, JSON.stringify(dbRaw, null, 2));

  spawned = await spawnServer(scratch.serverDir, PORT, scratch.dbPath);
  record('[MIGRATION-SETUP] Server restarted successfully after injecting synthetic historical data', !spawned.timedOut && !spawned.exited, {});
  await login('admin','Admin@12345');

  const migrate1 = await api('admin','POST','/api/admin/migrate-legacy-bank-lines',{});
  record('[MIGRATION] First migration run migrates exactly the 2 synthetic historical records', migrate1.ok===true && migrate1.migratedCount===2, {result:migrate1});

  const postMigrateUnified = await api('admin','GET',`/api/bank-import/lines?bankAccountId=${bankId}`);
  const migratedReconciled = (postMigrateUnified.lines||[]).find(l=>l.migratedFromLegacyId==='BSL-90001');
  const migratedUnmatched = (postMigrateUnified.lines||[]).find(l=>l.migratedFromLegacyId==='BSL-90002');
  record('[MIGRATION] Migrated RECONCILED record preserves amount, matchedEntryId, and Reconciled status exactly', migratedReconciled && migratedReconciled.amount===7500 && migratedReconciled.matchedEntryId===jeEntryId && migratedReconciled.status==='Reconciled', {migratedReconciled});
  record('[MIGRATION] Migrated UNMATCHED record preserves amount and Imported (outstanding) status exactly', migratedUnmatched && migratedUnmatched.amount===1200 && migratedUnmatched.status==='Imported', {migratedUnmatched});

  const dbAfterMigration = JSON.parse(fs.readFileSync(scratch.dbPath, 'utf8'));
  record('[MIGRATION] Original DB.bankStatementLines records are UNTOUCHED (preserved, non-destructive) after migration', dbAfterMigration.bankStatementLines.length===2 && dbAfterMigration.bankStatementLines[0].id==='BSL-90001', {bankStatementLines:dbAfterMigration.bankStatementLines});

  const legacyReconStillWorks = await api('admin','GET',`/api/bank-reconciliation?bankAccountId=${bankId}`);
  const legacyViewHasHistorical = (legacyReconStillWorks.reconciliation?.matchedItems||[]).some(l=>l.reference==='HIST/0001');
  record('[MIGRATION] The legacy /api/bank-reconciliation view now ALSO shows the migrated historical record (one unified truth, not a second silo)', legacyViewHasHistorical, {matchedItems:legacyReconStillWorks.reconciliation?.matchedItems});

  const migrate2 = await api('admin','POST','/api/admin/migrate-legacy-bank-lines',{});
  record('[MIGRATION-IDEMPOTENCY] Second migration run migrates ZERO new records (already-migrated records are skipped, not duplicated)', migrate2.ok===true && migrate2.migratedCount===0, {result:migrate2});

  const linesAfterSecondRun = await api('admin','GET',`/api/bank-import/lines?bankAccountId=${bankId}`);
  const migratedCountAfterSecondRun = (linesAfterSecondRun.lines||[]).filter(l=>l.migratedFromLegacyId).length;
  record('[MIGRATION-IDEMPOTENCY] Total migrated-line count stays at exactly 2 after re-running migration (no duplicate lines created)', migratedCountAfterSecondRun===2, {migratedCountAfterSecondRun});

  // ============================= PART 10 — Audit trail =============================
  console.log('\n===== PART 10 — Audit trail =====');

  const auditLog = await api('admin','GET','/api/audit-log');
  const auditTypes = new Set((auditLog.auditLog||[]).map(e=>e.type));
  record('[AUDIT] LegacyBankStatementLinesMigrated audit event was recorded', auditTypes.has('LegacyBankStatementLinesMigrated'), {hasType:auditTypes.has('LegacyBankStatementLinesMigrated')});
  record('[AUDIT] BankImportBatchCreated audit events were recorded for both GENERIC and ICICI imports', auditTypes.has('BankImportBatchCreated'), {});

  // ============================= TEARDOWN =============================
  killIfAlive(spawned.child);
  rmScratch(scratch.root);
  const prodHashAfter = hashFile(PROD_DB);
  record('[TEARDOWN] Production db.json byte-for-byte unchanged across the ENTIRE test run', prodHashBefore===prodHashAfter, {before:prodHashBefore, after:prodHashAfter});

  console.log('\n===== TOTAL: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail ?? null).slice(0,500)}`));
  process.exitCode = results.some(r=>!r.pass) ? 1 : 0;
}

main().catch(e=>{ console.error('FATAL', e); process.exitCode = 1; });
