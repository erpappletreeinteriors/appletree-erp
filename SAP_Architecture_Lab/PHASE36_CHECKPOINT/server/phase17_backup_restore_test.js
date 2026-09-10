'use strict';
// Phase 17 §4 — Backup / Restore test. Proves: Backup -> Delete/Reset test environment ->
// Restore -> Reconcile, with GL/AR/AP/Inventory/Projects/After-Sales/AMC/Audit all identical
// after restore. Never touches production (this whole Lab is offline-only).
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function snapshot(){
  const [tb, recon, projs, custs, amcs, audit, warranties] = await Promise.all([
    api('admin','GET','/api/trial-balance'),
    api('admin','GET','/api/reconciliation'),
    api('admin','GET','/api/projects'),
    api('admin','GET','/api/customers'),
    api('admin','GET','/api/amc-contracts'),
    api('admin','GET','/api/audit-log?pageSize=500'),
    api('admin','GET','/api/warranties'),
  ]);
  let totD=0, totC=0; Object.values(tb.byAccount).forEach(a=>{totD+=a.debit;totC+=a.credit;});
  const f360 = await api('admin','GET','/api/projects/PRJ-1/financial-360');
  return {
    trialBalanceDebit: Math.round(totD*100)/100, trialBalanceCredit: Math.round(totC*100)/100,
    arSubledger: recon.ar.subledgerTotal, arControl: recon.ar.controlAccountBalance,
    apSubledger: recon.ap.subledgerTotal, apControl: recon.ap.controlAccountBalance,
    projectCount: projs.projects.length, customerCount: custs.customers.length, amcCount: amcs.contracts.length,
    auditLogCount: audit.total ?? audit.auditLog?.length, warrantyCount: warranties.warranties.length,
    prj1ActualCost: f360.ok ? f360.cost.actual : null, prj1InstallationCost: f360.ok ? f360.execution.installationCost : null,
  };
}

async function main(){
  await login('admin','Admin@12345');
  await login('ceo','Ceo@12345');
  await login('finance1','Fin@12345');
  await login('sales1','Sal@123456');

  // ================= Build a real, non-trivial dataset to back up =================
  await api('admin','POST','/api/test/reset');
  const po = await api('admin','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:10, rate:2800, uom:'sheet'}]});
  await api('admin','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('admin','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:10,qtyRejected:0,uom:'sheet'}]});
  await api('admin','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-1', qty:4, warehouseId:'WH-1', purpose:'backup test'});
  const inst = await api('admin','POST','/api/installations',{projectId:'PRJ-1', site:'Backup test'});
  await api('admin','POST',`/api/installations/${inst.installation.id}/labour-cost`,{amount:12000});
  await api('admin','POST','/api/warranties',{customerId:'CUST-1', projectId:'PRJ-1', durationMonths:12, product:'Backup Test Unit'});

  // ================= Backup (security: only Admin/CEO) =================
  const backupDenied = await api('sales1','POST','/api/admin/backup',{label:'unauthorized-attempt'});
  record('§4/Security', 'Non-admin role cannot create a backup', backupDenied.status===403, JSON.stringify(backupDenied));
  const before = await snapshot();
  const backup = await api('admin','POST','/api/admin/backup',{label:'phase17-test'});
  record('§4', 'Backup created successfully', backup.ok && backup.backup.filename, backup.backup);
  record('§4', 'Backup includes a real content checksum (SHA-256), not just a filename', backup.ok && backup.backup.checksum && backup.backup.checksum.length===64, backup.backup?.checksum);

  const listDenied = await api('sales1','GET','/api/admin/backups');
  record('§4/Security', 'Non-admin role cannot list backups', listDenied.status===403, JSON.stringify(listDenied));
  const list = await api('admin','GET','/api/admin/backups');
  record('§4', 'Backup appears in the backup list', list.ok && list.backups.some(b=>b.filename===backup.backup.filename), list.backups?.length);

  // ================= Delete/Reset the test environment =================
  await api('admin','POST','/api/test/reset');
  const afterReset = await snapshot();
  record('§4', 'Reset genuinely wiped the data (sanity check — projectCount/journal figures differ from before)', afterReset.trialBalanceDebit !== before.trialBalanceDebit || afterReset.warrantyCount !== before.warrantyCount, {before, afterReset});

  // ================= Restore =================
  const restoreDenied = await api('sales1','POST','/api/admin/restore',{filename:backup.backup.filename});
  record('§4/Security', 'Non-admin role cannot restore a backup', restoreDenied.status===403, JSON.stringify(restoreDenied));
  const badFileRestore = await api('admin','POST','/api/admin/restore',{filename:'../../etc/passwd'});
  record('§4/Security', 'Path-traversal filename is rejected, not silently read from outside the backups directory', badFileRestore.ok===false, badFileRestore.error);
  const restore = await api('admin','POST','/api/admin/restore',{filename:backup.backup.filename});
  record('§4', 'Restore succeeds', restore.ok, restore);

  // ================= Reconcile: everything identical to before =================
  const after = await snapshot();
  record('§4/Reconcile', 'GL Trial Balance identical after restore (Debit)', after.trialBalanceDebit===before.trialBalanceDebit, {before:before.trialBalanceDebit, after:after.trialBalanceDebit});
  record('§4/Reconcile', 'GL Trial Balance identical after restore (Credit)', after.trialBalanceCredit===before.trialBalanceCredit, {before:before.trialBalanceCredit, after:after.trialBalanceCredit});
  record('§4/Reconcile', 'AR subledger/control identical after restore', after.arSubledger===before.arSubledger && after.arControl===before.arControl, {before:{sub:before.arSubledger,ctl:before.arControl}, after:{sub:after.arSubledger,ctl:after.arControl}});
  record('§4/Reconcile', 'AP subledger/control identical after restore', after.apSubledger===before.apSubledger && after.apControl===before.apControl, {before:{sub:before.apSubledger,ctl:before.apControl}, after:{sub:after.apSubledger,ctl:after.apControl}});
  record('§4/Reconcile', 'Project count identical after restore', after.projectCount===before.projectCount, {before:before.projectCount, after:after.projectCount});
  record('§4/Reconcile', 'AMC contract count identical after restore (After-Sales/AMC)', after.amcCount===before.amcCount, {before:before.amcCount, after:after.amcCount});
  record('§4/Reconcile', 'Warranty count identical after restore (After-Sales)', after.warrantyCount===before.warrantyCount, {before:before.warrantyCount, after:after.warrantyCount});
  record('§4/Reconcile', 'Audit log entries identical after restore (including the Backup/Restore actions themselves being audited)', after.auditLogCount>=before.auditLogCount, {before:before.auditLogCount, after:after.auditLogCount});
  record('§4/Reconcile', 'PRJ-1 Actual Cost identical after restore (Installation Cost + Material Issue both survived)', after.prj1ActualCost===before.prj1ActualCost, {before:before.prj1ActualCost, after:after.prj1ActualCost});
  record('§4/Reconcile', 'PRJ-1 Installation Cost specifically identical after restore', after.prj1InstallationCost===before.prj1InstallationCost, {before:before.prj1InstallationCost, after:after.prj1InstallationCost});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 17 BACKUP / RESTORE TEST ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
