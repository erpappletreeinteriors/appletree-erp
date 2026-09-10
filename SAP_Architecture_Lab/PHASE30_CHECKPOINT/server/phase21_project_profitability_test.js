// Phase 21 §9/§10 — Project Profitability Independent Verification.
// TEST PROJECT — NOT PRODUCTION DATA. Every cost/revenue figure below is independently summed
// BY THIS SCRIPT (not by calling projectPL/projectFinancial360) from the exact transactions it
// itself created, then compared against the ERP's own computed output. This is the mandatory
// audit item flagged as the most consistently open item across all of today's reports.
const BASE = 'http://localhost:4001';
const jars = {};
let PASS=0, FAIL=0;
function record(desc, ok, detail){ if(ok) PASS++; else FAIL++; console.log((ok?'✅ PASS':'❌ FAIL')+' | '+desc+(ok?'':' | '+JSON.stringify(detail).slice(0,300))); }
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
async function fullPost(creatorUser, createPath, createBody){
  const draft = await api(creatorUser,'POST',createPath, createBody);
  if(!draft.ok) return draft;
  const id = draft.draft.id;
  await api('accountant1','POST',`/api/journal/${id}/submit`);
  const appr = await api('finance1','POST',`/api/journal/${id}/approve`);
  if(!appr.ok) return appr;
  return api('finance1','POST',`/api/journal/${id}/post`);
}

(async()=>{
  await login('admin','Admin@12345');
  await login('sales1','Sal@123456');
  await login('accountant1','Acc@12345');
  await login('finance1','Fin@12345');

  console.log('=== TEST PROJECT — NOT PRODUCTION DATA ===');
  const proj = await api('admin','POST','/api/masters/project',{name:'PHASE21 TEST PROJECT — Independent Profitability Verification', budget:400000, customerId:'CUST-1'});
  const projectId = proj.project && proj.project.id;
  record('Test project created', !!projectId, proj);

  // Independently-tracked expected figures — each one a number THIS script chose, not derived
  // from the ERP.
  const EXPECTED = { revenue: 300000, materialCost: 90000, productionLabour: 40000, installationLabour: 25000, otherSiteCost: 8000 };

  // 1. Revenue: one customer invoice for the full contract value.
  const inv = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1',projectId,baseAmount:EXPECTED.revenue,date:'2026-08-10',taxCode:'GST18',narration:'Phase21 test project — final invoice'});
  record('Revenue invoice posted for the exact expected amount', inv && inv.ok, inv);

  // 2. Material cost: a direct project-tagged Expense journal (account 5000, the same account
  // projectFinancial360's materialCost sum reads) — equivalent in GL terms to a supplier bill's
  // material line, isolating the profitability calculation from procurement-workflow specifics.
  const matCost = await fullPost('accountant1','/api/journal/draft',{date:'2026-08-11',docDate:'2026-08-11',narration:'Phase21 test — material cost',docTypeCode:'JV',sourceType:'MaterialCost',docCategory:'Journal',party:null,
    lines:[{account:'5000',debit:EXPECTED.materialCost,credit:0,projectId},{account:'2000',debit:0,credit:EXPECTED.materialCost}]});
  record('Material cost posted (account 5000)', matCost && matCost.ok, matCost);

  // 3. Production labour cost (account 5100, no CC-INSTALLATION cost centre tag).
  const prodLabour = await fullPost('accountant1','/api/journal/draft',{date:'2026-08-12',docDate:'2026-08-12',narration:'Phase21 test — production labour',docTypeCode:'JV',sourceType:'LabourCost',docCategory:'Journal',party:null,
    lines:[{account:'5100',debit:EXPECTED.productionLabour,credit:0,projectId,costCentreId:'CC-PRODUCTION'},{account:'1000',debit:0,credit:EXPECTED.productionLabour}]});
  record('Production labour cost posted (account 5100)', prodLabour && prodLabour.ok, prodLabour);

  // 4. Installation labour cost (account 5100, CC-INSTALLATION tag — a slice of the same total).
  const instLabour = await fullPost('accountant1','/api/journal/draft',{date:'2026-08-13',docDate:'2026-08-13',narration:'Phase21 test — installation labour',docTypeCode:'JV',sourceType:'InstallationCost',docCategory:'Journal',party:null,
    lines:[{account:'5100',debit:EXPECTED.installationLabour,credit:0,projectId,costCentreId:'CC-INSTALLATION'},{account:'1000',debit:0,credit:EXPECTED.installationLabour}]});
  record('Installation labour cost posted (account 5100, CC-INSTALLATION)', instLabour && instLabour.ok, instLabour);

  // 5. Other site cost (account 5300 — generic other-cost, still an Expense-type account so it
  // flows into projectPL()'s revenue-minus-Expense-account calculation).
  const otherCost = await fullPost('accountant1','/api/journal/draft',{date:'2026-08-14',docDate:'2026-08-14',narration:'Phase21 test — other site cost',docTypeCode:'JV',sourceType:'SiteCost',docCategory:'Journal',party:null,
    lines:[{account:'5300',debit:EXPECTED.otherSiteCost,credit:0,projectId},{account:'1000',debit:0,credit:EXPECTED.otherSiteCost}]});
  record('Other site cost posted (account 5300)', otherCost && otherCost.ok, otherCost);

  // ---------------- INDEPENDENT CALCULATION (done here, by hand, NOT by calling the ERP) ----------------
  const independentTotalCost = EXPECTED.materialCost + EXPECTED.productionLabour + EXPECTED.installationLabour + EXPECTED.otherSiteCost;
  const independentProfit = EXPECTED.revenue - independentTotalCost;
  console.log('\n--- INDEPENDENT CALCULATION (by this script, before looking at the ERP) ---');
  console.log('Revenue:', EXPECTED.revenue);
  console.log('Material Cost:', EXPECTED.materialCost);
  console.log('Production Labour:', EXPECTED.productionLabour);
  console.log('Installation Labour:', EXPECTED.installationLabour);
  console.log('Other Site Cost:', EXPECTED.otherSiteCost);
  console.log('Total Cost:', independentTotalCost);
  console.log('Independent Profit:', independentProfit);
  console.log('Independent Margin %:', (independentProfit/EXPECTED.revenue*100).toFixed(2)+'%');

  // ---------------- ERP CALCULATION (Project P&L, GL-derived) ----------------
  const pl = await api('admin','GET',`/api/project-pl?projectId=${projectId}`);
  console.log('\n--- ERP Project P&L (projectPL(), GL-derived) ---');
  console.log(JSON.stringify(pl, null, 2));
  record('ERP Project P&L revenue matches independent calculation exactly', pl.pl && Math.abs(pl.pl.revenue-EXPECTED.revenue)<0.01, {erp:pl.pl&&pl.pl.revenue, expected:EXPECTED.revenue});
  record('ERP Project P&L cost matches independent calculation exactly', pl.pl && Math.abs(pl.pl.cost-independentTotalCost)<0.01, {erp:pl.pl&&pl.pl.cost, expected:independentTotalCost});
  record('ERP Project P&L profit matches independent calculation exactly', pl.pl && Math.abs(pl.pl.profit-independentProfit)<0.01, {erp:pl.pl&&pl.pl.profit, expected:independentProfit});

  // ---------------- ERP Financial 360 (materialCost/labourCost breakdown) ----------------
  const f360 = await api('finance1','GET',`/api/projects/${projectId}/financial-360`).catch(async()=>await api('finance1','GET',`/api/project-financial-360?projectId=${projectId}`));
  console.log('\n--- ERP Project Financial 360 ---');
  console.log(JSON.stringify(f360, null, 2).slice(0,1500));

  // ---------------- REVERSAL TEST: reverse the "other site cost" entry, profit must go back up by exactly that amount ----------------
  if(otherCost && otherCost.ok){
    const rev = await api('finance1','POST',`/api/journal/${otherCost.entry.id}/reverse`,{reason:'Phase21 profitability test — deliberate reversal to prove profit recalculates correctly'});
    record('Other site cost entry reversed successfully', rev.ok, rev);
    const plAfterReversal = await api('admin','GET',`/api/project-pl?projectId=${projectId}`);
    const expectedProfitAfterReversal = independentProfit + EXPECTED.otherSiteCost; // cost removed -> profit increases by that amount
    record('Project P&L profit correctly increases by exactly the reversed cost amount (reversal-safety proven live, not just by code inspection)',
      plAfterReversal.pl && Math.abs(plAfterReversal.pl.profit-expectedProfitAfterReversal)<0.01,
      {erpProfitAfterReversal: plAfterReversal.pl&&plAfterReversal.pl.profit, expectedProfitAfterReversal});
  }

  // ---------------- CREDIT NOTE TEST: issue a credit note against the revenue invoice, revenue must drop ----------------
  if(inv && inv.ok){
    const cn = await api('finance1','POST','/api/customer-credit-notes',{customerInvoiceEntryId:inv.entry.id, amount:15000, reason:'Phase21 profitability test — negotiated price reduction'});
    record('Credit note issued against the project revenue invoice', cn.ok, cn);
    const plAfterCN = await api('admin','GET',`/api/project-pl?projectId=${projectId}`);
    const expectedRevenueAfterCN = EXPECTED.revenue - 15000;
    record('Project P&L revenue correctly decreases by exactly the credit note amount', plAfterCN.pl && Math.abs(plAfterCN.pl.revenue-expectedRevenueAfterCN)<0.01,
      {erpRevenueAfterCN: plAfterCN.pl&&plAfterCN.pl.revenue, expectedRevenueAfterCN});
  }

  console.log('\n================ '+PASS+' PASS / '+FAIL+' FAIL / '+(PASS+FAIL)+' TOTAL ================');
  process.exitCode = FAIL>0 ? 1 : 0;
})();
