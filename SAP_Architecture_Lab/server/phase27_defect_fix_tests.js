'use strict';
// Phase 27 — Controlled Defect Fix: PO/GRN-aware Supplier Billing + Project Cost Integrity.
// Permanent regression coverage for the Phase 26 finding (Supplier Bill double-counted Material
// Cost for any PO/GRN-backed purchase) and the fix (draftSupplierInvoiceFromPO is now the correct,
// UI-reachable path, with a real "already invoiced" balance guard that did not exist before).
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
async function postThroughLifecycle(user, approver, draftId){
  await api(user,'POST',`/api/journal/${draftId}/submit`);
  await api(approver,'POST',`/api/journal/${draftId}/approve`);
  return api(approver,'POST',`/api/journal/${draftId}/post`);
}

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345');
  await api('admin','POST','/api/test/reset');
  await Promise.all(['purchase1','accountant1','finance1','pm1'].map(u=>login(u, {purchase1:'Pur@12345',accountant1:'Acc@12345',finance1:'Fin@12345',pm1:'Pm@123456'}[u])));

  // ============================================================
  // §1 — REPRODUCE PHASE 26'S EXACT SCENARIO AGAINST THE FIX
  // Project PRJ-5, VEND-2, MAT-2. PO 100,000 / GRN 60,000 / Bill 60,000 (via the corrected
  // PO-aware path) / Payment 60,000 / Material Issue 60,000 / Customer Invoice 250,000 / Receipt.
  // Independent expected P&L calculated BEFORE checking the ERP: Revenue 250,000, Cost 60,000,
  // Profit 190,000, Margin 76% — exactly Phase 26's own worked numbers.
  // ============================================================
  await api('admin','POST','/api/projects/PRJ-5/branch',{branchId:'BR-ULLIYERI'});
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-5', vendorId:'VEND-2', lines:[{materialId:'MAT-2', qty:100, rate:1000, uom:'sheet'}]});
  record('§1 Trace','PO created for ₹100,000 (100 x ₹1000)', po.ok && po.po.total===100000, po.po?.total);
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('admin','POST',`/api/purchase-orders/${po.po.id}/approve`);

  const grn = await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:60,qtyRejected:0,uom:'sheet'}]});
  record('§1 Trace','GRN for 60 units = ₹60,000 accepted', grn.ok && grn.glEntry.totalDebit===60000, grn.glEntry);

  const invoiceable = await api('accountant1','GET',`/api/ap/invoiceable-grns?vendorId=VEND-2`);
  const line0 = invoiceable.grns?.find(g=>g.grnId===grn.grn.id)?.lines[0];
  record('§1 UI-data','Invoiceable-GRNs endpoint shows GRN with balance=60, alreadyInvoiced=0 BEFORE billing', invoiceable.ok && line0 && line0.balance===60 && line0.alreadyInvoiced===0, line0);

  const bill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po.id, grnId:grn.grn.id, invoiceLines:[{qty:60,rate:1000}], date:'2026-08-27'});
  record('§1 Trace','Supplier Bill entered via the PO-aware (correct) path for ₹60,000', bill.ok, bill.ok?bill.draft.id:bill);
  const postedBill = await postThroughLifecycle('accountant1','finance1', bill.draft.id);
  record('§1 Trace','Supplier Bill posted — clears GR/IR (2050), NOT Material Cost (5000)', postedBill.ok && postedBill.entry.lines.some(l=>l.account==='2050') && !postedBill.entry.lines.some(l=>l.account==='5000'), postedBill.entry?.lines.map(l=>l.account));

  const pay = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-2', invoiceEntryId:postedBill.entry.id, amount:60000, date:'2026-08-27'});
  record('§1 Trace','Supplier Payment ₹60,000 + Clearing', pay.ok && pay.clearing.amount===60000, pay.clearing);

  const issue = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-5', materialId:'MAT-2', qty:60, warehouseId:'WH-1', purpose:'Phase 27 trace consumption'});
  record('§1 Trace','Material Issue of 60 units — the ONLY event that should hit Material Cost', issue.ok && issue.value===60000, issue.value);

  const custInv = await api('admin','POST','/api/ar/invoice',{customerId:'CUST-8', projectId:'PRJ-5', baseAmount:250000, date:'2026-08-27'});
  record('§1 Trace','Customer Invoice ₹250,000', custInv.ok, custInv.ok?custInv.draft.id:custInv);
  const postedInv = await postThroughLifecycle('admin','admin', custInv.draft.id);
  const receipt = await api('finance1','POST','/api/ar/receipt',{customerId:'CUST-8', invoiceEntryId:postedInv.entry.id, amount:250000, date:'2026-08-27'});
  record('§1 Trace','Customer Receipt ₹250,000 + Clearing', receipt.ok && receipt.clearing.amount===250000, receipt.clearing);

  const pl = await api('finance1','GET','/api/project-pl?projectId=PRJ-5');
  record('§1 DEFECT CLOSED','Project P&L Revenue = ₹250,000 (independent expectation)', pl.ok && pl.pl.revenue===250000, pl.pl?.revenue);
  record('§1 DEFECT CLOSED','Project P&L Cost = ₹60,000 — NOT ₹120,000 (this was the exact Phase 26 defect)', pl.ok && pl.pl.cost===60000, pl.pl?.cost);
  record('§1 DEFECT CLOSED','Project P&L Profit = ₹190,000 (independent expectation)', pl.ok && pl.pl.profit===190000, pl.pl?.profit);

  // ============================================================
  // §2 — STANDALONE SUPPLIER BILL STILL WORKS (Part 6/28 — must not break the legitimate case)
  // ============================================================
  const standalone = await api('accountant1','POST','/api/ap/invoice',{vendorId:'VEND-3', projectId:'PRJ-5', baseAmount:15000, date:'2026-08-27', narration:'Standalone freight bill, no PO'});
  record('§2 Standalone','Standalone Supplier Bill (no PO) still succeeds via the generic path', standalone.ok, standalone.ok?standalone.draft.id:standalone);
  const postedStandalone = await postThroughLifecycle('accountant1','finance1', standalone.draft.id);
  record('§2 Standalone','Standalone bill still posts Dr Material Cost (5000) directly — correct for a non-PO bill', postedStandalone.ok && postedStandalone.entry.lines.some(l=>l.account==='5000'), postedStandalone.entry?.lines.map(l=>l.account));

  // ============================================================
  // §3 — PARTIAL BILLING (Part 11)
  // ============================================================
  const po2 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-5', vendorId:'VEND-2', lines:[{materialId:'MAT-2', qty:100, rate:1000, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po2.po.id}/submit`);
  await api('admin','POST',`/api/purchase-orders/${po2.po.id}/approve`);
  const grn2 = await api('purchase1','POST','/api/grns',{poId:po2.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:60,qtyRejected:0,uom:'sheet'}]});
  const partial1 = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po2.po.id, grnId:grn2.grn.id, invoiceLines:[{qty:40,rate:1000}], date:'2026-08-27'});
  record('§3 Partial','First partial bill of 40/60 succeeds', partial1.ok, partial1.ok?partial1.draft.id:partial1);
  const balAfterPartial = await api('accountant1','GET',`/api/ap/invoiceable-grns?vendorId=VEND-2`);
  const gLine = balAfterPartial.grns?.find(g=>g.grnId===grn2.grn.id)?.lines[0];
  record('§3 Partial','Remaining balance correctly shows 20 (60-40) after the first partial bill', gLine && gLine.balance===20 && gLine.alreadyInvoiced===40, gLine);
  const partial2 = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po2.po.id, grnId:grn2.grn.id, invoiceLines:[{qty:20,rate:1000}], date:'2026-08-27'});
  record('§3 Partial','Second bill for the exact remaining 20 succeeds', partial2.ok, partial2.ok?partial2.draft.id:partial2);
  const balAfterFull = await api('accountant1','GET',`/api/ap/invoiceable-grns?vendorId=VEND-2`);
  const goneLine = balAfterFull.grns?.find(g=>g.grnId===grn2.grn.id);
  record('§3 Partial','GRN no longer appears in invoiceable list once fully billed (balance=0)', !goneLine, goneLine);

  // ============================================================
  // §4 — OVERBILLING BLOCKED (Part 12)
  // ============================================================
  const po3 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-5', vendorId:'VEND-2', lines:[{materialId:'MAT-2', qty:100, rate:1000, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po3.po.id}/submit`);
  await api('admin','POST',`/api/purchase-orders/${po3.po.id}/approve`);
  const grn3 = await api('purchase1','POST','/api/grns',{poId:po3.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:60,qtyRejected:0,uom:'sheet'}]});
  const overbill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po3.po.id, grnId:grn3.grn.id, invoiceLines:[{qty:70,rate:1000}], date:'2026-08-27'});
  record('§4 Overbilling','Billing 70 against a GRN that only received 60 is BLOCKED', overbill.status===400 && !overbill.ok, overbill.error);

  // ============================================================
  // §5 — DUPLICATE BILLING BLOCKED (Part 13)
  // ============================================================
  const dup1 = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po3.po.id, grnId:grn3.grn.id, invoiceLines:[{qty:60,rate:1000}], date:'2026-08-27'});
  record('§5 Duplicate','First full bill of GRN3 (60) succeeds', dup1.ok, dup1.ok?dup1.draft.id:dup1);
  const dup2 = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po3.po.id, grnId:grn3.grn.id, invoiceLines:[{qty:60,rate:1000}], date:'2026-08-27'});
  record('§5 Duplicate','Attempting to bill the SAME already-fully-billed GRN again is BLOCKED — this is the exact Phase 26 double-count mechanism, now closed at the source', dup2.status===400 && !dup2.ok, dup2.error);

  // ============================================================
  // §6 — REVERSAL RELEASES THE BALANCE (Part 14)
  // ============================================================
  const postedDup1 = await postThroughLifecycle('accountant1','finance1', dup1.draft.id);
  const reversed = await api('finance1','POST',`/api/journal/${postedDup1.entry.id}/reverse`,{reason:'Phase 27 test — verify balance release'});
  record('§6 Reversal','Posted PO-aware bill can be reversed', reversed.ok, reversed.ok?reversed.entry.id:reversed);
  const balAfterReversal = await api('accountant1','GET',`/api/ap/invoiceable-grns?vendorId=VEND-2`);
  const reopenedLine = balAfterReversal.grns?.find(g=>g.grnId===grn3.grn.id)?.lines[0];
  record('§6 Reversal','Reversing the bill correctly REOPENS the GRN balance (60 available again) so it can be rebilled', reopenedLine && reopenedLine.balance===60, reopenedLine);
  const rebill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po3.po.id, grnId:grn3.grn.id, invoiceLines:[{qty:60,rate:1000}], date:'2026-08-27'});
  record('§6 Reversal','Rebilling the same GRN after reversal succeeds cleanly (no permanent lock)', rebill.ok, rebill.ok?rebill.draft.id:rebill);

  // ============================================================
  // §7 — REJECTED/CANCELLED DRAFT RELEASES THE BALANCE (Parts 3/11 side-effect correctness)
  // ============================================================
  const po4 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-5', vendorId:'VEND-2', lines:[{materialId:'MAT-2', qty:50, rate:1000, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po4.po.id}/submit`);
  await api('admin','POST',`/api/purchase-orders/${po4.po.id}/approve`);
  const grn4 = await api('purchase1','POST','/api/grns',{poId:po4.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:50,qtyRejected:0,uom:'sheet'}]});
  const badBill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po4.po.id, grnId:grn4.grn.id, invoiceLines:[{qty:50,rate:1000}], date:'2026-08-27'});
  await api('accountant1','POST',`/api/journal/${badBill.draft.id}/submit`);
  const rejected = await api('finance1','POST',`/api/journal/${badBill.draft.id}/reject`,{reason:'Phase 27 test — wrong rate, reject and redo'});
  record('§7 Reject-Release','Draft rejected', rejected.ok, rejected.ok?rejected.draft.status:rejected);
  const balAfterReject = await api('accountant1','GET',`/api/ap/invoiceable-grns?vendorId=VEND-2`);
  const releasedLine = balAfterReject.grns?.find(g=>g.grnId===grn4.grn.id)?.lines[0];
  record('§7 Reject-Release','Rejecting the draft correctly releases the reserved balance (50 available again, not stuck)', releasedLine && releasedLine.balance===50, releasedLine);
  const redoBill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po4.po.id, grnId:grn4.grn.id, invoiceLines:[{qty:50,rate:1000}], date:'2026-08-27'});
  record('§7 Reject-Release','Re-entering the bill after rejection succeeds cleanly', redoBill.ok, redoBill.ok?redoBill.draft.id:redoBill);

  // ============================================================
  // §8 — WRONG-PO/GRN PAIRING BLOCKED (defensive check added this phase)
  // ============================================================
  const mismatchTry = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po.id, grnId:grn2.grn.id, invoiceLines:[{qty:1,rate:1000}], date:'2026-08-27'});
  record('§8 Mismatch','A GRN that does not belong to the given PO is rejected, not silently accepted', mismatchTry.status===400 && !mismatchTry.ok, mismatchTry.error);

  // ============================================================
  // §9 — WHOLE-LEDGER ACCOUNTING INTEGRITY AFTER ALL OF THE ABOVE
  // ============================================================
  const recon = await api('finance1','GET','/api/reconciliation');
  record('§9 Reconciliation','AP reconciles (subledger = control account) after all Phase 27 activity', recon.ok && recon.ap.matches, recon.ap);
  record('§9 Reconciliation','AR reconciles after all Phase 27 activity', recon.ok && recon.ar.matches, recon.ar);
  const tb = await api('finance1','GET','/api/trial-balance');
  const tbDebit = tb.ok ? Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0) : NaN;
  const tbCredit = tb.ok ? Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0) : NaN;
  record('§9 Reconciliation','Trial Balance Debit = Credit after all Phase 27 activity', tb.ok && Math.abs(tbDebit-tbCredit)<0.01, {debit:tbDebit, credit:tbCredit});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 27 CONTROLLED DEFECT FIX — REGRESSION SUITE ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('PHASE 27 TEST ERROR:', e); process.exit(2); });
