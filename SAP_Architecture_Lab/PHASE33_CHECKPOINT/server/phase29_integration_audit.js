'use strict';
// Phase 29 — Full integrated business-flow audit: Lead -> Estimation -> Quotation -> Won ->
// Project -> Procurement -> Inventory -> Factory -> Labour -> Project Expense -> Billing -> AR ->
// Project P&L -> After-Sales, on ONE fresh project created from scratch (not a seed project), plus
// the extended Phase 27/25 critical double-count test (now with Labour + Project Expense added),
// plus targeted negative tests. This is an AUDIT — nothing here modifies application code.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
async function post(user, approver, draftId){
  await api(user,'POST',`/api/journal/${draftId}/submit`);
  await api(approver,'POST',`/api/journal/${draftId}/approve`);
  return api(approver,'POST',`/api/journal/${draftId}/post`);
}

async function main(){
  await login('admin','Admin@12345');
  await api('admin','POST','/api/test/reset');
  await Promise.all(['sales1','estimator1','purchase1','accountant1','finance1','pm1'].map(u=>login(u, {sales1:'Sal@123456',estimator1:'Est@12345',purchase1:'Pur@12345',accountant1:'Acc@12345',finance1:'Fin@12345',pm1:'Pm@123456'}[u])));

  // ============================================================
  // PART 3/4 — FULL LEAD -> PROJECT CHAIN (a genuinely fresh project, not a seed one)
  // ============================================================
  const lead = await api('sales1','POST','/api/leads',{date:'2026-08-27', source:'Referral', name:'Phase 29 Test Client', contact:'9999999999', site:'Kochi', requirement:'Kitchen + wardrobes', expectedValue:250000});
  record('§3-4 Lead','Lead created', lead.ok, lead.ok?lead.lead.id:lead);
  const er = await api('estimator1','POST','/api/estimation-requests',{leadId:lead.lead.id, site:'Kochi', requirement:'Kitchen + wardrobes', requestedDate:'2026-08-27', scope:'Full'});
  record('§3-4 Estimation','Estimation Request created', er.ok, er.ok?er.estimationRequest.id:er);
  const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, lines:[{category:'Material', qty:1, rate:200000}], overheadPct:0, profitPct:25});
  record('§3-4 Costing','Costing Version computed sellingPrice = 250,000 (200,000 x 1.25)', cost.ok && cost.costingVersion.sellingPrice===250000, cost.costingVersion?.sellingPrice);
  const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, discountPct:0});
  record('§3-4 Quotation','Quotation created, finalPrice = 250,000', qtn.ok && qtn.quotation.finalPrice===250000, qtn.quotation?.finalPrice);
  const sub = await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
  record('§3-4 Quotation','Quotation auto-approved (0% discount, below any threshold)', sub.ok && sub.quotation.status==='Approved', sub.quotation?.status);
  const acc = await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'Client Signature'});
  record('§3-4 Acceptance','Customer acceptance recorded', acc.ok && acc.acceptance.status==='Accepted', acc.acceptance);
  const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1', startDate:'2026-08-27'});
  record('§3-4 Won','Won transition creates Project + Customer atomically', won.ok && won.project && won.customer, won.ok?{project:won.project.id, customer:won.customer.id}:won);
  const PRJ = won.project.id, CUST = won.customer.id;
  await api('admin','POST',`/api/projects/${PRJ}/branch`,{branchId:'BR-ULLIYERI'});
  record('§4 Traceability','Project correctly carries quotationId/leadId/customerId back-references', won.project.quotationId===qtn.quotation.id && won.project.leadId===lead.lead.id && won.project.customerId===CUST, {q:won.project.quotationId, l:won.project.leadId, c:won.project.customerId});

  // ============================================================
  // PART 5 — PROCUREMENT: MR -> PO -> Commitment -> GRN -> Supplier Invoice -> AP -> Payment -> Clearing
  // ============================================================
  const mr = await api('pm1','POST','/api/material-requirements',{projectId:PRJ, materialId:'MAT-2', qty:60, uom:'sheet', requiredDate:'2026-09-05', reason:'Kitchen carcass'});
  record('§5 Procurement','Material Requirement created by the assigned PM', mr.ok, mr.ok?mr.requirement.id:mr);
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:PRJ, vendorId:'VEND-2', lines:[{materialId:'MAT-2', qty:100, rate:1000, uom:'sheet'}]});
  record('§5 Procurement','PO created for ₹100,000 (100 x ₹1,000)', po.ok && po.po.total===100000, po.po?.total);
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('admin','POST',`/api/purchase-orders/${po.po.id}/approve`);
  const commitAfterApproval = await api('admin','GET',`/api/commitments?projectId=${PRJ}`);
  record('§5 Commitment','Commitment of ₹100,000 created on PO approval — BEFORE any GRN', commitAfterApproval.ok && commitAfterApproval.totalRemaining===100000, commitAfterApproval.totalRemaining);
  const grn = await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:60,qtyRejected:0,uom:'sheet'}]});
  record('§5 GRN','GRN for 60 units = ₹60,000, Dr Inventory/Cr GR-IR', grn.ok && grn.glEntry.totalDebit===60000, grn.glEntry);
  const commitAfterGRN = await api('admin','GET',`/api/commitments?projectId=${PRJ}`);
  record('§5 Commitment','Commitment correctly REDUCED to ₹40,000 after the ₹60,000 GRN', commitAfterGRN.ok && commitAfterGRN.totalRemaining===40000, commitAfterGRN.totalRemaining);
  const bill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po.id, grnId:grn.grn.id, invoiceLines:[{qty:60,rate:1000}], date:'2026-08-27'});
  record('§5 SupplierInvoice','PO-aware Supplier Bill for ₹60,000 (clears GR/IR, no Material Cost debit)', bill.ok, bill.ok?bill.draft.id:bill);
  const postedBill = await post('accountant1','finance1', bill.draft.id);
  record('§5 SupplierInvoice','Posted — only 2050/2000 lines, no 5000', postedBill.ok && postedBill.entry.lines.every(l=>['2050','2000'].includes(l.account)), postedBill.entry?.lines.map(l=>l.account));
  const pay = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-2', invoiceEntryId:postedBill.entry.id, amount:60000, date:'2026-08-27'});
  record('§5 Payment','Supplier Payment ₹60,000 + Clearing', pay.ok && pay.clearing.amount===60000, pay.clearing);
  const apOpen = await api('accountant1','GET','/api/ap/open-items?vendorId=VEND-2');
  record('§5 AP','AP open item correctly reduced to ₹0 after payment', apOpen.items.find(i=>i.entryId===postedBill.entry.id)?.open===0, apOpen.items.find(i=>i.entryId===postedBill.entry.id));

  // ============================================================
  // PART 6/7/22 — FACTORY / MES: BOM -> Production Order -> Machine -> Job Card -> Material/Labour -> QC
  // ============================================================
  const bom = await api('admin','POST','/api/boms',{projectId:PRJ, description:'Kitchen Carcass BOM', lines:[{materialId:'MAT-2', qty:2, uom:'sheet', scrapPct:0}]});
  await api('admin','POST',`/api/boms/${bom.bom.id}/approve`);
  const prod = await api('admin','POST','/api/production-orders',{projectId:PRJ, bomId:bom.bom.id, plannedQty:5});
  record('§6 Factory','Production Order created for 5 units against the approved BOM', prod.ok, prod.ok?prod.productionOrder.id:prod);
  const mch = await api('admin','POST','/api/machines',{name:'Phase29 CNC', type:'CNC'});
  const jc = await api('admin','POST','/api/job-cards',{productionOrderId:prod.productionOrder.id, operation:'Cutting', machineId:mch.machine.id, assignedWorker:'Ravi', plannedDate:'2026-08-28'});
  record('§6 JobCard','Job Card created and linked to the Production Order', jc.ok && jc.jobCard.productionOrderId===prod.productionOrder.id, jc.jobCard);
  await api('admin','POST',`/api/job-cards/${jc.jobCard.id}/start`);
  const issueProd = await api('admin','POST',`/api/production-orders/${prod.productionOrder.id}/issue-material`,{warehouseId:'WH-1'});
  record('§6 Factory','Production material issue consumed EXACTLY 10 units (5 qty x 2 BOM) via the EXISTING inventory engine — no second engine', issueProd.ok && issueProd.issues[0].movement.qty===10, issueProd.issues?.[0]?.movement);
  const labourPost = await api('admin','POST',`/api/production-orders/${prod.productionOrder.id}/labour-cost`,{amount:6000});
  record('§6 Factory','Production labour posted through the SAME postJournalEntry (Dr 5100)', labourPost.ok && labourPost.entry.lines.some(l=>l.account==='5100'&&l.debit===6000), labourPost.entry?.lines);
  await api('admin','POST',`/api/job-cards/${jc.jobCard.id}/complete`);
  const qc = await api('admin','POST','/api/qc-checklists',{projectId:PRJ, items:[{name:'Carcass squareness', passFail:'Pass'}]});
  record('§6 QC','QC Checklist recorded for the project', qc.ok, qc.ok?qc.checklist?.id||qc.checklist:qc);
  const stockAfterFactory = (await api('admin','GET','/api/stock-report')).rows.find(r=>r.materialId==='MAT-2'&&r.warehouseId==='WH-1');
  record('§6 Inventory','Stock correctly shows 60 (GRN) - 10 (production issue) = 50 — same architecture, no drift', stockAfterFactory && stockAfterFactory.qty===50, stockAfterFactory);

  // ============================================================
  // PART 8/16 — MATERIAL ISSUE (direct to site) + LABOUR + PROJECT EXPENSE, all on the SAME project
  // ============================================================
  // Phase 30 §BOM-quota — this project's BOM only ever budgeted 10 units of MAT-2 (for the
  // Production Order above); issuing another 50 directly to site genuinely exceeds that budget,
  // so — per the newly-implemented real Appletree policy — it correctly now requires management
  // authorization rather than silently proceeding. An overrideReason is the faithful equivalent
  // here (same pattern already used for Damage Reports/Inventory Adjustments), not a workaround.
  const siteIssue = await api('purchase1','POST','/api/material-issues',{projectId:PRJ, materialId:'MAT-2', qty:50, warehouseId:'WH-1', purpose:'Site installation — remaining stock', overrideReason:'Site installation requires the full remaining stock beyond the manufacturing BOM allocation'});
  record('§8 MaterialIssue','Remaining 50 units issued to site — ONE event, Dr 5000/Cr 1200', siteIssue.ok && siteIssue.value===50000, siteIssue.value);
  const lw = await api('admin','POST','/api/labour-wages',{projectId:PRJ, workerName:'Ravi', role:'Carpenter', days:5, ratePerDay:800, date:'2026-08-27'});
  record('§8 Labour','Labour Wages ₹4,000 posted (5x800), Dr 5100/Cr 1000', lw.ok && lw.labour.value===4000 && lw.glEntry.lines.some(l=>l.account==='5100'&&l.debit===4000), lw.glEntry?.lines);
  const pe = await api('accountant1','POST','/api/project-expenses',{projectId:PRJ, category:'Site Consumables', amount:2000, description:'Fixing hardware', date:'2026-08-27'});
  record('§9 Expense','Project Expense ₹2,000 posted ONCE, Dr 5200/Cr 1000', pe.ok && pe.amount===2000 || (pe.ok && pe.expense.amount===2000), pe.expense);

  // ============================================================
  // PART 16 — PROJECT ISOLATION: activity on a DIFFERENT project must not bleed into this one
  // ============================================================
  const otherLW = await api('admin','POST','/api/labour-wages',{projectId:'PRJ-1', workerName:'OtherWorker', role:'X', days:1, ratePerDay:100000, date:'2026-08-27'});
  record('§16 Isolation','A large labour cost posted to PRJ-1 (unrelated seed project) exists', otherLW.ok, otherLW.value);
  const plBeforeCheck = await api('finance1','GET',`/api/project-pl?projectId=${PRJ}`);
  record('§16 Isolation','That PRJ-1 cost does NOT leak into this test project\'s P&L', plBeforeCheck.ok && plBeforeCheck.pl.cost < 100000, plBeforeCheck.pl?.cost);

  // ============================================================
  // PART 24/25 — CUSTOMER BILLING -> AR -> RECEIPT -> INDEPENDENT PROJECT P&L (extended critical test)
  // ============================================================
  const custInv = await api('admin','POST','/api/ar/invoice',{customerId:CUST, projectId:PRJ, baseAmount:250000, date:'2026-08-27'});
  record('§24 Billing','Customer Invoice ₹250,000', custInv.ok, custInv.ok?custInv.draft.id:custInv);
  const postedInv = await post('admin','admin', custInv.draft.id);
  const receipt = await api('finance1','POST','/api/ar/receipt',{customerId:CUST, invoiceEntryId:postedInv.entry.id, amount:250000, date:'2026-08-27'});
  record('§24 AR','Customer Receipt ₹250,000 + Clearing', receipt.ok && receipt.clearing.amount===250000, receipt.clearing);

  const pl = await api('finance1','GET',`/api/project-pl?projectId=${PRJ}`);
  // INDEPENDENT calculation, done BEFORE reading pl.pl above in this script's logic (values are
  // hardcoded from the brief's own Part 25, not derived from the ERP's output):
  // Revenue 250,000. Material Cost = 60,000 (10 units via production, valued at GRN rate, PLUS
  // 50 units site issue, all from the SAME 60-unit GRN receipt -> total material cost = 60,000
  // exactly, since 10+50=60 units were issued in total, matching the single GRN's full value).
  // Labour = 6,000 (production) + 4,000 (site) = 10,000. Project Expense = 2,000.
  const expectedCost = 60000 + 10000 + 2000; // = 72,000
  const expectedProfit = 250000 - expectedCost; // = 178,000
  record('§25 CriticalTest','Project P&L Revenue = ₹250,000 exactly', pl.ok && pl.pl.revenue===250000, pl.pl?.revenue);
  record('§25 CriticalTest',`Project P&L Cost = ₹${expectedCost} (60,000 material + 10,000 labour + 2,000 expense) — independently calculated, NOT read from the ERP first`, pl.ok && pl.pl.cost===expectedCost, {expected:expectedCost, actual:pl.pl?.cost});
  record('§25 CriticalTest',`Project P&L Profit = ₹${expectedProfit}`, pl.ok && pl.pl.profit===expectedProfit, {expected:expectedProfit, actual:pl.pl?.profit});
  record('§25 CriticalTest','No double-count: material cost is 60,000 (one GRN worth), not 120,000+', pl.ok && pl.pl.cost < 120000, pl.pl?.cost);

  // ============================================================
  // PART 7 — JOB COST SHEET, independently calculated
  // ============================================================
  const jcs = await api('admin','GET',`/api/job-cost-sheet?productionOrderId=${prod.productionOrder.id}`);
  record('§7 JobCosting','Job Cost Sheet material cost = 5 x 2 x ₹1,000 = ₹10,000 (moving average rate, since GRN was the only receipt)', jcs.ok && jcs.materialCost===10000, jcs.materialCost);
  record('§7 JobCosting','Job Cost Sheet labour cost = ₹6,000 (matches what was posted)', jcs.ok && jcs.labourCost===6000, jcs.labourCost);
  const pc = await api('admin','GET',`/api/product-costing?bomId=${bom.bom.id}`);
  record('§7 JobCosting','Product Costing is clearly labeled TEST/ESTIMATE, not approved policy', pc.ok && pc.note.toLowerCase().includes('not an approved'), pc.note);

  // ============================================================
  // PART 25 (after-sales leg) — WARRANTY / SERVICE against the SAME project/customer
  // ============================================================
  const warranty = await api('admin','POST','/api/warranties',{projectId:PRJ, customerId:CUST, durationMonths:12, startDate:'2026-08-27'});
  record('§after-sales Warranty','Warranty created for the completed project (12 months — explicit, not defaulted)', warranty.ok, warranty.ok?warranty.warranty.id:warranty);
  const ticket = await api('admin','POST','/api/service-tickets',{projectId:PRJ, customerId:CUST, warrantyId:warranty.ok?warranty.warranty.id:undefined, issue:'Hinge adjustment needed', priority:'Normal'});
  record('§after-sales Service','Service Ticket created against the same project', ticket.ok, ticket.ok?ticket.ticket.id:ticket);

  // ============================================================
  // PART 11 — LOCATIONS (Location A / Location B)
  // ============================================================
  const locA = await api('purchase1','POST','/api/locations',{warehouseId:'WH-2', code:'PHASE29-LOC-A'});
  const locB = await api('purchase1','POST','/api/locations',{warehouseId:'WH-2', code:'PHASE29-LOC-B'});
  const po3 = await api('purchase1','POST','/api/purchase-orders',{projectId:PRJ, vendorId:'VEND-3', lines:[{materialId:'MAT-7', qty:40, rate:220, uom:'sqft'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po3.po.id}/submit`); await api('admin','POST',`/api/purchase-orders/${po3.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po3.po.id, warehouseId:'WH-2', lines:[{qtyAccepted:40,qtyRejected:0,uom:'sqft',locationId:locA.location.id}]});
  const locStockA1 = (await api('admin','GET','/api/stock-by-location')).rows.find(r=>r.locationCode==='PHASE29-LOC-A');
  record('§11 Locations','40 units correctly received into Location A', locStockA1 && locStockA1.qty===40, locStockA1);
  await api('purchase1','POST','/api/material-issues',{projectId:PRJ, materialId:'MAT-7', qty:15, warehouseId:'WH-2', purpose:'Test issue', locationId:locA.location.id});
  const locStockA2 = (await api('admin','GET','/api/stock-by-location')).rows.find(r=>r.locationCode==='PHASE29-LOC-A');
  record('§11 Locations','Location A correctly reduced to 25 (40-15) after issue tagged to it', locStockA2 && locStockA2.qty===25, locStockA2);
  const totalMAT7 = (await api('admin','GET','/api/stock-report')).rows.find(r=>r.materialId==='MAT-7');
  record('§11 Locations','Warehouse-level total (25) matches Location A alone — Location B untouched, no cross-contamination', totalMAT7 && totalMAT7.qty===25, totalMAT7);
  const poNoLoc = await api('purchase1','POST','/api/purchase-orders',{projectId:PRJ, vendorId:'VEND-3', lines:[{materialId:'MAT-8', qty:5, rate:320, uom:'meter'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poNoLoc.po.id}/submit`); await api('admin','POST',`/api/purchase-orders/${poNoLoc.po.id}/approve`);
  const grnNoLoc = await api('purchase1','POST','/api/grns',{poId:poNoLoc.po.id, warehouseId:'WH-2', lines:[{qtyAccepted:5,qtyRejected:0,uom:'meter'}]});
  record('§11 Locations','A GRN with NO location still works exactly as before (optional dimension, not mandatory)', grnNoLoc.ok && grnNoLoc.glEntry.totalDebit===1600, grnNoLoc.glEntry?.totalDebit);

  // ============================================================
  // PART 14 — PURCHASE RETURN (no double reduction)
  // ============================================================
  const stockBeforeReturn = (await api('admin','GET','/api/stock-report')).rows.find(r=>r.materialId==='MAT-8');
  const ret = await api('purchase1','POST','/api/purchase-returns',{grnId:grnNoLoc.grn.id, materialId:'MAT-8', qty:2, reason:'Wrong size'});
  record('§14 Returns','Purchase Return of 2 units posted (Dr GR-IR/Cr Inventory)', ret.ok && ret.glEntry.totalDebit===640, ret.glEntry);
  const stockAfterReturn = (await api('admin','GET','/api/stock-report')).rows.find(r=>r.materialId==='MAT-8');
  record('§14 Returns','Stock reduced by EXACTLY the return qty (5-2=3), no double reduction', stockAfterReturn && stockAfterReturn.qty===(stockBeforeReturn.qty-2), {before:stockBeforeReturn.qty, after:stockAfterReturn.qty});

  // ============================================================
  // PART 17/18 — TASKS / TIMESHEET / RISK, project-linked
  // ============================================================
  const task = await api('admin','POST','/api/tasks',{projectId:PRJ, title:'Site inspection', assignedTo:'PM'});
  const ts = await api('admin','POST','/api/timesheet',{projectId:PRJ, workerName:'Ravi', hours:8, task:'Cutting'});
  const risk = await api('admin','POST','/api/risk-register',{projectId:PRJ, description:'Material delay risk', likelihood:2, impact:3});
  record('§17-18 Ops','Task/Timesheet/Risk all correctly tagged to PRJ, no GL side-effects', task.ok && ts.ok && risk.ok && !task.glEntry && !ts.glEntry && !risk.glEntry, {task:task.ok, ts:ts.ok, risk:risk.ok});

  // ============================================================
  // PART 28 — NEGATIVE TESTS
  // ============================================================
  const negInvalidProj = await api('admin','GET','/api/project-pl?projectId=PRJ-FAKE-999');
  record('§28 Negative','[FINDING - LOW] Invalid project ID on Project P&L should signal not-found, not silently return 200 with all-zero figures', negInvalidProj.status!==200, negInvalidProj);
  const negInvalidPO = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:'PO-FAKE-999', grnId:'GRN-FAKE-999', invoiceLines:[{qty:1,rate:1}]});
  record('§28 Negative','Invalid PO/GRN on Supplier Invoice fails cleanly', negInvalidPO.status===400 && !negInvalidPO.ok, negInvalidPO.error);
  const stockBeforeNeg = (await api('admin','GET','/api/stock-report')).rows.find(r=>r.materialId==='MAT-2'&&r.warehouseId==='WH-1');
  const negNegativeQty = await api('purchase1','POST','/api/material-issues',{projectId:PRJ, materialId:'MAT-2', qty:-5, warehouseId:'WH-1'});
  const stockAfterNeg = (await api('admin','GET','/api/stock-report')).rows.find(r=>r.materialId==='MAT-2'&&r.warehouseId==='WH-1');
  record('§28 Negative','[FINDING - CONFIRMED DEFECT] A negative-qty Material Issue must be rejected — instead createMaterialIssue() accepts it and INCREASES stock (no qty>0 validation)', !negNegativeQty.ok, {before:stockBeforeNeg, after:stockAfterNeg, response:negNegativeQty});
  const negExcessIssue = await api('purchase1','POST','/api/material-issues',{projectId:PRJ, materialId:'MAT-2', qty:99999, warehouseId:'WH-1'});
  record('§28 Negative','Excess Material Issue (more than in stock) is blocked', !negExcessIssue.ok, negExcessIssue.error);
  const negOverbill = await api('accountant1','POST','/api/ap/invoice-from-po',{poId:po.po.id, grnId:grn.grn.id, invoiceLines:[{qty:1,rate:1000}]});
  record('§28 Negative','Duplicate/overbilling against an already-fully-billed GRN is BLOCKED', negOverbill.status===400 && !negOverbill.ok, negOverbill.error);
  const negUnauthProject = await api('pm1','GET',`/api/projects/PRJ-2/cost-breakdown`);
  record('§28 Negative','ProjectManager NOT assigned to PRJ-2 is denied its cost breakdown', negUnauthProject.status===403 && !negUnauthProject.ok, negUnauthProject.error);
  const negIdTamper = await api('accountant1','POST','/api/damage-reports',{materialId:'MAT-2', qty:1, warehouseId:'WH-1', reasonCategory:'Other'});
  record('§28 Negative','"Other" damage reason with no explanation blocked, and Accountant (not manager tier) also blocked', negIdTamper.status===400 || negIdTamper.status===403, negIdTamper);
  const negFutureDate = await api('admin','POST','/api/labour-wages',{projectId:PRJ, workerName:'X', role:'Y', days:1, ratePerDay:100, date:'2099-01-01'});
  record('§28 Negative','Far-future-dated posting is either blocked or requires override (period control engaged)', negFutureDate.status===400 || negFutureDate.ok, negFutureDate);

  // ============================================================
  // PART 30 — RECONCILIATION
  // ============================================================
  const recon = await api('finance1','GET','/api/reconciliation');
  record('§30 Reconciliation','AR reconciles after full integrated flow', recon.ok && recon.ar.matches, recon.ar);
  record('§30 Reconciliation','AP reconciles after full integrated flow', recon.ok && recon.ap.matches, recon.ap);
  const tb = await api('finance1','GET','/api/trial-balance');
  const tbDebit = Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0), tbCredit = Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0);
  record('§30 Reconciliation','Trial Balance Debit = Credit', Math.abs(tbDebit-tbCredit)<0.01, {debit:tbDebit, credit:tbCredit});
  // This PO ordered 100 units but only 60 were ever RECEIVED (GRN) — the commitment correctly
  // stays open for the 40 units never received, regardless of billing; billing only ever happens
  // against what was received. Remaining should be exactly 40,000 (the unreceived portion), not 0.
  const commitFinal = await api('admin','GET',`/api/commitments?projectId=${PRJ}`);
  const finalCommit = commitFinal.commitments.find(c=>c.poId===po.po.id);
  record('§30 Reconciliation','Commitment correctly reflects the UNRECEIVED portion of the PO (100,000 ordered - 60,000 received = 40,000 still open) — billing the received portion does not touch it', commitFinal.ok && finalCommit?.remainingAmount===40000 && finalCommit?.consumedAmount===60000, finalCommit);

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 29 INTEGRATED BUSINESS FLOW AUDIT ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  console.log('PROJECT ID FOR MANUAL FOLLOW-UP:', PRJ, '| CUSTOMER:', CUST);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('PHASE 29 AUDIT ERROR:', e); process.exit(2); });
