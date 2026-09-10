'use strict';
// Phase 16 §15 — Complete Project Trace Test (mandatory). Creates a realistic project and traces
// the FORWARD chain (Project -> PO -> GRN -> Supplier Invoice -> AP -> Payment -> Clearing ->
// Material Consumption -> Project Actual Cost -> Project Financial 360 -> Project P&L) and then
// the REVERSE chain (Project P&L -> Actual Cost -> Material Consumption -> Source Document -> Journal).
const BASE = 'http://localhost:4001';
const results = [];
function record(direction, step, pass, detail){ results.push({direction, step, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345');
  await Promise.all(['purchase1','accountant1','finance1','pm1'].map(u=>login(u, {purchase1:'Pur@12345',accountant1:'Acc@12345',finance1:'Fin@12345',pm1:'Pm@123456'}[u])));

  // ===== Build a realistic, traceable chain end-to-end on PRJ-3 (also PM-assigned to pm1) =====
  await api('admin','POST','/api/projects/PRJ-3/branch',{branchId:'BR-ULLIYERI'});

  // PROJECT -> PO
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-3', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:20, rate:2800, uom:'sheet'}]});
  record('FORWARD', 'Project -> Purchase Order', po.ok, po.ok?po.po.id:po);
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  const poApproved = await api('admin','POST',`/api/purchase-orders/${po.po.id}/approve`);

  // PO -> GRN
  const grn = await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:20,qtyRejected:0,uom:'sheet'}]});
  record('FORWARD', 'PO -> GRN', grn.ok && grn.grn.poId===po.po.id, grn.ok?grn.grn.id:grn);
  record('FORWARD', 'GRN -> Accounting (Dr Inventory / Cr GR/IR, automatic)', grn.ok && grn.glEntry && grn.glEntry.totalDebit===56000, grn.glEntry);

  // GRN -> Supplier Invoice
  const bill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po.id, grnId:grn.grn.id, invoiceLines:[{qty:20,rate:2800}], date:'2026-08-25'});
  record('FORWARD', 'GRN -> Supplier Invoice (3-way matched)', bill.ok, bill.ok?bill.draft.id:bill);
  await api('accountant1','POST',`/api/journal/${bill.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${bill.draft.id}/approve`);
  const postedBill = await api('finance1','POST',`/api/journal/${bill.draft.id}/post`);
  record('FORWARD', 'Supplier Invoice -> AP (posted to control account 2000)', postedBill.ok && postedBill.entry.lines.some(l=>l.account==='2000'), postedBill.entry?.id);

  // AP -> Payment -> Clearing
  const pay = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-1', invoiceEntryId:postedBill.entry.id, amount:56000, date:'2026-08-25'});
  record('FORWARD', 'AP -> Payment', pay.ok, pay.ok?pay.entry.id:pay);
  record('FORWARD', 'Payment -> Clearing (Original/Cleared/Remaining tracked)', pay.ok && pay.clearing && pay.clearing.amount===56000, pay.clearing);
  const apOpenAfter = await api('accountant1','GET','/api/ap/open-items?vendorId=VEND-1');
  const clearedItem = apOpenAfter.items.find(i=>i.entryId===postedBill.entry.id);
  record('FORWARD', 'Clearing correctly reduces the AP open item to ₹0', clearedItem && clearedItem.open===0, clearedItem);

  // Material Consumption -> Project Actual Cost
  const issue = await api('pm1','POST','/api/material-issues',{projectId:'PRJ-3', materialId:'MAT-1', qty:8, warehouseId:'WH-1', purpose:'Trace test consumption'});
  record('FORWARD', 'Material Consumption (Material Issue)', issue.ok, issue.ok?issue.movement.id:issue);
  const costBreakdown = await api('finance1','GET','/api/projects/PRJ-3/cost-breakdown');
  record('FORWARD', 'Material Consumption -> Project Actual Cost (costBreakdown.consumed reflects the issue)', costBreakdown.ok && costBreakdown.breakdown.consumed>0, costBreakdown.breakdown);

  // Project Actual Cost -> Project Financial 360
  const f360 = await api('finance1','GET','/api/projects/PRJ-3/financial-360');
  record('FORWARD', 'Project Actual Cost -> Project Financial 360 (cost.actual reflects material consumed)', f360.ok && f360.cost.actual>0, f360.cost);
  // PRJ-3 already carries prior volume-test transactions, so absolute figures won't equal this
  // test's single new PO in isolation — check internal consistency instead (Outstanding = Gross -
  // Invoiced exactly, and each figure is at least as large as this test's own contribution).
  const pr = f360.procurement;
  record('FORWARD', 'Financial 360 Procurement shows PO Gross/GRN/Invoiced/Paid/Outstanding all distinctly and internally consistent (POL-11)',
    f360.ok && Math.abs(pr.poOutstanding - (pr.poGrossValue - pr.poInvoicedValue)) < 0.02 && pr.poGrossValue>=56000 && pr.grnValue>=56000 && pr.poInvoicedValue>=56000 && pr.poPaidValue>=56000, pr);

  // Project Financial 360 -> Project P&L
  const pl = await api('finance1','GET','/api/project-pl?projectId=PRJ-3');
  record('FORWARD', 'Project Financial 360 -> Project P&L (cost figure is consistent between the two views)', pl.ok && Math.abs(pl.pl.cost - f360.profitability.originalProjectMargin.cost) < 0.02, {plCost:pl.pl?.cost, f360Cost:f360.profitability?.originalProjectMargin.cost});

  // ===== REVERSE: Project P&L -> Actual Cost -> Material Consumption -> Source Document -> Journal =====
  record('REVERSE', 'Project P&L cost figure traces back to Project Actual Cost (same underlying source)', Math.abs(pl.pl.cost - f360.cost.actual) < 500, {plCost:pl.pl?.cost, actualCost:f360.cost.actual});
  const movements = await api('accountant1','GET',`/api/inventory/movements?projectId=PRJ-3`);
  const issueMovement = movements.ok ? movements.movements.find(m=>m.id===issue.movement.id) : null;
  record('REVERSE', 'Actual Cost -> Material Consumption (the specific Material Issue movement is findable)', !!issueMovement, issueMovement);
  record('REVERSE', 'Material Consumption -> Source Document (the movement carries its own posting reference)', issueMovement && issue.glEntry && issue.glEntry.id, issue.glEntry?.id);
  const traceDoc = await api('accountant1','GET',`/api/document?id=${issue.glEntry.id}`);
  record('REVERSE', 'Source Document -> Journal (Document Viewer resolves the exact posted entry, showing Dr Material Cost / Cr Inventory)', traceDoc.ok && traceDoc.entry.lines.some(l=>l.account==='5000') && traceDoc.entry.lines.some(l=>l.account==='1200'), traceDoc.entry?.lines.map(l=>l.account));
  record('REVERSE', 'The Journal entry itself traces back to the Project (projectId present on the line)', traceDoc.ok && traceDoc.entry.lines.some(l=>l.projectId==='PRJ-3'), traceDoc.entry?.lines.map(l=>l.projectId));

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 16 COMPLETE PROJECT TRACE TEST (PRJ-3) ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.direction}] ${r.step}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TRACE TEST ERROR:', e); process.exit(2); });
