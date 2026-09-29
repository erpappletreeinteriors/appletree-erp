'use strict';
// PHASE 39 — Extended stress test: 100+ of multiple document types, multiple projects/vendors/
// customers, then full reconciliation (TB, AR, AP, GST) after the batch.
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
async function fullPost(creatorUser, createPath, createBody, approver){
  const draft = await api(creatorUser,'POST',createPath, createBody);
  if(!draft.ok) return {ok:false, stage:'draft', draft};
  const id = draft.draft.id;
  const sub = await api(creatorUser,'POST',`/api/journal/${id}/submit`);
  if(!sub.ok) return {ok:false, stage:'submit', sub, draft};
  const appr = await api(approver,'POST',`/api/journal/${id}/approve`);
  if(!appr.ok) return {ok:false, stage:'approve', appr, draft};
  const post = await api(approver,'POST',`/api/journal/${id}/post`);
  if(!post.ok) return {ok:false, stage:'post', post, draft};
  return {ok:true, entry:post.entry, draft};
}
function r2(n){ return Math.round(n*100)/100; }

async function main(){
  await __preflight();
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('purchase1','Pur@12345'), login('sales1','Sal@123456')
  ]);

  const CUSTOMERS = ['CUST-1','CUST-2'];
  const PROJECTS = ['PRJ-1','PRJ-2','PRJ-3','PRJ-4','PRJ-5'];
  const VENDORS_SERVICE = ['VEND-6','VEND-7']; // Labour/Services — no PO/GRN required, matches stress-test intent (volume, not procurement chain depth)
  const startTime = Date.now();

  // ============================= 100+ SALES INVOICES, ACROSS 5 PROJECTS / 2 CUSTOMERS =============================
  console.log('\n===== STRESS: 100+ Sales Invoices =====');
  // Kept deliberately small and roughly constant (~₹590 incl. GST18/invoice) — PRJ-2 has the
  // smallest approved ceiling of the 5 stress projects (₹3,00,000) and already carries real prior-
  // phase billing history; 105 invoices at this size across 5 projects (~21/project) stay
  // comfortably inside every project's own commercial ceiling for the whole run. A first attempt
  // at escalating amounts (₹10,000+) tripped the REAL Excess Billing ceiling control on ~30-45 of
  // 105 invoices once cumulative billing crossed each project's approved budget — a genuine,
  // correctly-firing business control, not a defect (see PHASE39_STRESS_TEST_REPORT.md), but not
  // what THIS test is trying to measure (raw volume/concurrency), so amounts were resized down.
  const invoiceEntries = [];
  let invFail = 0;
  const invFailures = [];
  for(let i=0;i<105;i++){
    const customerId = CUSTOMERS[i % CUSTOMERS.length];
    const projectId = PROJECTS[i % PROJECTS.length];
    const baseAmount = r2(500 + (i%7)*0.33);
    const inv = await fullPost('sales1','/api/ar/invoice',{customerId, projectId, baseAmount, date:'2026-09-12', taxCode:'GST18', narration:`Phase 39 stress — invoice ${i+1}`}, 'finance1');
    if(inv.ok) invoiceEntries.push({entry:inv.entry, customerId}); else { invFail++; invFailures.push({i, error: inv.draft?.error || inv.sub?.error || inv.appr?.error || inv.post?.error}); }
  }
  record('STRESS','105 Sales Invoices posted', invFail===0, {created:invoiceEntries.length, failed:invFail, sampleFailures:invFailures.slice(0,3)});

  // ============================= 100+ SUPPLIER BILLS, ACROSS 5 PROJECTS / 2 SERVICE VENDORS =============================
  console.log('\n===== STRESS: 100+ Supplier Bills =====');
  const billEntries = [];
  let billFail = 0;
  for(let i=0;i<105;i++){
    const vendorId = VENDORS_SERVICE[i % VENDORS_SERVICE.length];
    const projectId = PROJECTS[i % PROJECTS.length];
    const baseAmount = r2(5000 + (i*211 % 30000) + (i%5)*0.17);
    const bill = await fullPost('finance1','/api/ap/invoice',{vendorId, projectId, baseAmount, date:'2026-09-12', taxCode:'GST18', narration:`Phase 39 stress — bill ${i+1}`}, 'ceo');
    if(bill.ok) billEntries.push({entry:bill.entry, vendorId}); else billFail++;
  }
  record('STRESS','105 Supplier Bills posted', billFail===0, {created:billEntries.length, failed:billFail});

  // ============================= 100+ RECEIPTS (against the invoices just created) =============================
  console.log('\n===== STRESS: 100+ Customer Receipts =====');
  let rcptFail = 0, rcptOk = 0;
  for(let i=0;i<invoiceEntries.length;i++){
    const {entry, customerId} = invoiceEntries[i];
    const r = await api('accountant1','POST','/api/ar/receipt',{customerId, invoiceEntryId:entry.id, amount:entry.totalDebit, date:'2026-09-12', narration:`Phase 39 stress — receipt ${i+1}`});
    if(r.ok) rcptOk++; else rcptFail++;
  }
  record('STRESS', `${invoiceEntries.length} Customer Receipts posted (full clearing of every stress invoice)`, rcptFail===0, {ok:rcptOk, failed:rcptFail});

  // ============================= 100+ PAYMENTS (against the bills just created) =============================
  console.log('\n===== STRESS: 100+ Supplier Payments =====');
  let payFail = 0, payOk = 0;
  for(let i=0;i<billEntries.length;i++){
    const {entry, vendorId} = billEntries[i];
    const p = await api('finance1','POST','/api/ap/payment',{vendorId, invoiceEntryId:entry.id, amount:entry.totalCredit, date:'2026-09-12', narration:`Phase 39 stress — payment ${i+1}`});
    if(p.ok) payOk++; else payFail++;
  }
  record('STRESS', `${billEntries.length} Supplier Payments posted (full clearing of every stress bill)`, payFail===0, {ok:payOk, failed:payFail});

  // ============================= 100+ INVENTORY MOVEMENTS (GRN receipts across multiple materials/projects) =============================
  console.log('\n===== STRESS: 100+ Inventory Movements (GRN) =====');
  let grnFail = 0, grnOk = 0;
  const MATERIALS = ['MAT-1','MAT-2'];
  for(let i=0;i<105;i++){
    const projectId = PROJECTS[i % PROJECTS.length];
    const materialId = MATERIALS[i % MATERIALS.length];
    const po = await api('purchase1','POST','/api/purchase-orders',{projectId, vendorId:'VEND-1', lines:[{materialId, qty:5, rate:2800, uom:'sheet'}]});
    if(!po.ok){ grnFail++; continue; }
    await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
    const grn = await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:5, qtyRejected:0, uom:'sheet'}], receivedBy:'purchase1'});
    if(grn.ok) grnOk++; else grnFail++;
  }
  record('STRESS', '105 GRN inventory movements posted, across 5 projects / 2 materials', grnFail===0, {ok:grnOk, failed:grnFail});

  const elapsedSec = ((Date.now()-startTime)/1000).toFixed(1);
  console.log(`\nStress batch completed in ${elapsedSec}s.`);

  // ============================= POST-STRESS RECONCILIATION =============================
  console.log('\n===== POST-STRESS RECONCILIATION =====');

  const tb = await api('finance1','GET','/api/trial-balance');
  let tbDebit=0, tbCredit=0;
  if(tb.ok){ for(const k in tb.byAccount){ tbDebit += tb.byAccount[k].debit||0; tbCredit += tb.byAccount[k].credit||0; } }
  record('STRESS-RECON', 'Trial Balance: Total Debit = Total Credit after the full stress batch', Math.abs(r2(tbDebit)-r2(tbCredit))<0.02, {tbDebit:r2(tbDebit), tbCredit:r2(tbCredit)});

  const recon = await api('finance1','GET','/api/reconciliation');
  record('STRESS-RECON', 'AR subledger reconciles to AR control account after stress batch', recon.ok===true && recon.ar?.matches===true, recon.ar);
  record('STRESS-RECON', 'AP subledger reconciles to AP control account after stress batch', recon.ok===true && recon.ap?.matches===true, recon.ap);
  if(recon.outputTax) record('STRESS-RECON', 'Output GST reconciles to output-tax GL after stress batch', recon.outputTax.matches===true, recon.outputTax);
  if(recon.inputTax) record('STRESS-RECON', 'Input GST reconciles to input-tax GL after stress batch', recon.inputTax.matches===true, recon.inputTax);

  const docNoCheck = await api('finance1','GET','/api/journal-entries');
  const voucherNos = (docNoCheck.journalEntries||[]).map(e=>e.voucherNo).filter(Boolean);
  const uniqueVoucherNos = new Set(voucherNos);
  record('STRESS-RECON', `Document numbering remained unique under load — ${voucherNos.length} vouchers, zero duplicates`, voucherNos.length===uniqueVoucherNos.size, {total:voucherNos.length, unique:uniqueVoucherNos.size});

  console.log('\n===== TOTAL: ' + results.filter(r=>r.pass===true).length + ' PASS / ' + results.filter(r=>r.pass===false).length + ' FAIL / ' + results.length + ' TOTAL =====\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.part}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail ?? null).slice(0,300)}`));
  require('fs').writeFileSync('phase39_stress_test_results.json', JSON.stringify({elapsedSec, results}, null, 2));
  process.exit(results.some(r=>r.pass===false) ? 1 : 0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
