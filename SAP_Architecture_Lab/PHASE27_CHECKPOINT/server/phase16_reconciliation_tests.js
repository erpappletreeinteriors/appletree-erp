'use strict';
// Phase 16 §13 — Reconciliation Gate + the Moving Average valuation defect found & fixed while
// building it. Real HTTP calls.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['purchase1','pm1','finance1','accountant1'].map(u=>login(u, {purchase1:'Pur@12345',pm1:'Pm@123456',finance1:'Fin@12345',accountant1:'Acc@12345'}[u])));

  // ================= DEFECT REGRESSION: Moving Average must equal true perpetual average =================
  const po1 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:100, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po1.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po1.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:100,qtyRejected:0,uom:'sheet'}]});
  await api('pm1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-1', qty:50, warehouseId:'WH-1', purpose:'test'});
  const po2 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:100, rate:200, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po2.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po2.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:100,qtyRejected:0,uom:'sheet'}]});
  const finalStock = await api('purchase1','GET','/api/inventory/stock?materialId=MAT-1&warehouseId=WH-1');
  record('§13/Defect-fix', 'Moving average rate reflects a TRUE perpetual average (166.67, not the old flawed 150) after an issue interleaved between two differently-priced receipts',
    Math.abs(finalStock.movingAverageRate - 166.6666666666) < 0.01, finalStock.movingAverageRate);
  const tb = await api('admin','GET','/api/trial-balance');
  const glInv = tb.byAccount['1200'] ? r2(tb.byAccount['1200'].debit - tb.byAccount['1200'].credit) : 0;
  const computedValue = r2(finalStock.stock * finalStock.movingAverageRate);
  record('§13/Defect-fix', 'Computed inventory value (stock × moving average rate) now EXACTLY matches the real GL Inventory (1200) balance', Math.abs(computedValue - glInv) < 0.02, {computed:computedValue, gl:glInv});

  // ================= Broader reversal-blindness defect class — 4 more instances found & fixed =================
  const po3 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-2', vendorId:'VEND-1', lines:[{materialId:'MAT-2', qty:10, rate:1200, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po3.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po3.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:10,qtyRejected:0,uom:'sheet'}]});
  const issue = await api('admin','POST','/api/material-issues',{projectId:'PRJ-2', materialId:'MAT-2', qty:5, warehouseId:'WH-1', purpose:'reversal test'});
  const beforeRev = await api('admin','GET','/api/projects/PRJ-2/financial-360');
  await api('admin','POST',`/api/journal/${issue.glEntry.id}/reverse`,{reason:'test'});
  const afterRev = await api('admin','GET','/api/projects/PRJ-2/financial-360');
  record('§13/Defect-fix', 'Material Cost correctly returns to ₹0 after a Material Issue is reversed (was previously stuck at full value forever)',
    beforeRev.manufacturing.materialCost===6000 && afterRev.manufacturing.materialCost===0, {before:beforeRev.manufacturing.materialCost, after:afterRev.manufacturing.materialCost});

  const amc = await api('finance1','POST','/api/amc-contracts',{customerId:'CUST-1', projectId:'PRJ-2', startDate:'2026-01-01', endDate:'2026-12-31', contractValue:60000, serviceFrequencyMonths:3});
  await api('finance1','POST',`/api/amc-contracts/${amc.amc.id}/activate`);
  const amcInv = await api('accountant1','POST','/api/amc-billing-invoice',{amcId:amc.amc.id, date:'2026-08-25'});
  await api('accountant1','POST',`/api/journal/${amcInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${amcInv.draft.id}/approve`);
  const postedAmc = await api('finance1','POST',`/api/journal/${amcInv.draft.id}/post`);
  const billedBefore = await api('finance1','GET',`/api/amc-contracts/${amc.amc.id}/revenue-schedule`);
  await api('admin','POST',`/api/journal/${postedAmc.entry.id}/reverse`,{reason:'test'});
  const billedAfter = await api('finance1','GET',`/api/amc-contracts/${amc.amc.id}/revenue-schedule`);
  record('§13/Defect-fix', 'AMC Billed Total correctly returns to ₹0 after the billing entry is reversed (was previously stuck at full value forever)',
    billedBefore.schedule.billed===60000 && billedAfter.schedule.billed===0, {before:billedBefore.schedule.billed, after:billedAfter.schedule.billed});

  // ================= §13 Reconciliation Gate — formal check across all metrics =================
  const recon = await api('admin','GET','/api/reconciliation');
  record('§13/Gate', 'AR Subledger = AR Control Account', recon.ar.matches, recon.ar);
  record('§13/Gate', 'AP Subledger = AP Control Account', recon.ap.matches, recon.ap);
  const tb2 = await api('admin','GET','/api/trial-balance');
  let totD=0, totC=0; Object.values(tb2.byAccount).forEach(a=>{totD+=a.debit;totC+=a.credit;});
  record('§13/Gate', 'Total Debit = Total Credit', Math.abs(totD-totC)<0.02, {debit:totD, credit:totC});

  // ================= §10 Installation Cost final validation =================
  await api('admin','POST','/api/projects/PRJ-1/branch',{branchId:'BR-ULLIYERI'});
  const inst = await api('pm1','POST','/api/installations',{projectId:'PRJ-1', site:'Final validation'});
  const labour = await api('pm1','POST',`/api/installations/${inst.installation.id}/labour-cost`,{amount:30000});
  const f360 = await api('admin','GET','/api/projects/PRJ-1/financial-360');
  record('§10', 'Installation Cost flows correctly to Project Financial 360', f360.ok && f360.execution.installationCost===30000, f360.execution.installationCost);
  const reversed = await api('admin','POST',`/api/journal/${labour.entry.id}/reverse`,{reason:'Final validation reversal test'});
  record('§10', 'Installation labour cost CAN be reversed like any posted entry', reversed.ok, reversed.ok?reversed.entry.id:reversed);
  const f360After = await api('admin','GET','/api/projects/PRJ-1/financial-360');
  record('§10', 'After reversal, Financial 360 installationCost correctly returns to ₹0 (reversal is a real, traceable GL event, not a delete)', f360After.ok && f360After.execution.installationCost===0, f360After.execution.installationCost);
  const idTamperInst = await api('purchase1','POST','/api/installations/INST-9999/labour-cost',{amount:100});
  record('§10/Security', 'ID-tampering against a fabricated Installation ID for labour cost is still denied (re-confirmed)', idTamperInst.status===403 || idTamperInst.ok===false, idTamperInst);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 16 RECONCILIATION GATE + DEFECT REGRESSION ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
function r2(n){ return Math.round((+n||0)*100)/100; }
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
