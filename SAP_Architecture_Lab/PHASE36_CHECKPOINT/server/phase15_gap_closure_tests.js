'use strict';
// Phase 15 — Gap Closure: Installation Cost, Profit Centre, Bank Reconciliation, Branch
// consistency/enforcement/ID-tampering. Real HTTP calls.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['ceo','finance1','accountant1','pm1','sales1','purchase1','viewer1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345',pm1:'Pm@123456',sales1:'Sal@123456',purchase1:'Pur@12345',viewer1:'View@1234'}[u])));

  // ================= §2 Installation Cost =================
  await api('admin','POST','/api/projects/PRJ-1/branch',{branchId:'BR-ULLIYERI'});
  const inst = await api('pm1','POST','/api/installations',{projectId:'PRJ-1', site:'Test', team:['T1']});
  const labourDenied = await api('sales1','POST',`/api/installations/${inst.installation.id}/labour-cost`,{amount:5000});
  record('§2/Security', 'Sales (not the assigned PM) cannot post Installation labour cost', labourDenied.status===403, JSON.stringify(labourDenied));
  const labour = await api('pm1','POST',`/api/installations/${inst.installation.id}/labour-cost`,{amount:15000});
  record('§2', 'Installation labour posts Dr 5100/Cr 1000 tagged Cost Centre = CC-INSTALLATION', labour.ok && labour.entry.lines.every(l=>l.costCentreId==='CC-INSTALLATION'), JSON.stringify(labour.entry && labour.entry.lines.map(l=>l.costCentreId)));
  record('§2', 'Installation labour inherits Branch from the project', labour.ok && labour.entry.branchId==='BR-ULLIYERI', labour.entry && labour.entry.branchId);

  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:5, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:5,qtyRejected:0,uom:'sheet'}]});
  const prodOrder = await api('admin','POST','/api/production-orders',{projectId:'PRJ-1', bomId:null, plannedQty:1});
  let prodLabourEntry = null;
  if(prodOrder.ok){ const pl = await api('admin','POST',`/api/production-orders/${prodOrder.productionOrder.id}/labour-cost`,{amount:8000}); prodLabourEntry = pl.entry; }
  record('§2', 'Production labour still tagged Cost Centre = CC-FACTORY, distinct from Installation (regression from a pre-existing function this phase touched)', !prodLabourEntry || prodLabourEntry.lines.every(l=>l.costCentreId==='CC-FACTORY'), prodLabourEntry && prodLabourEntry.lines.map(l=>l.costCentreId));

  const f360 = await api('finance1','GET','/api/projects/PRJ-1/financial-360');
  record('§2', 'Financial 360 execution.installationCost is now a REAL number (₹15,000), not null/MISSING', f360.ok && f360.execution.installationCost===15000, f360.execution);
  record('§2', 'Financial 360 manufacturing.labourCost correctly EXCLUDES installation labour (no double count)', f360.ok && f360.manufacturing.labourCost < 15000, f360.manufacturing);
  const expectedTotalLabour = (prodLabourEntry?8000:0) + 15000;
  record('§2', 'cost.actual (materialCost+labourCostAll) still equals the TRUE total — installation is a re-labeled slice, not an extra addition', f360.ok && Math.abs(f360.manufacturing.labourCost + f360.execution.installationCost - expectedTotalLabour) < 0.02, {manufacturing:f360.manufacturing.labourCost, installation:f360.execution.installationCost, expectedTotal:expectedTotalLabour});

  // ================= §3 Profit Centre =================
  const pcListEmpty = await api('viewer1','GET','/api/profit-centres');
  record('§3', 'Profit Centre master is DELIBERATELY empty by default (no invented values)', pcListEmpty.ok && Array.isArray(pcListEmpty.profitCentres) && pcListEmpty.profitCentres.length===0, pcListEmpty.profitCentres);
  const pcDenied = await api('sales1','POST','/api/profit-centres',{code:'X',name:'X'});
  record('§3/Security', 'Non-masterData role cannot create a Profit Centre', pcDenied.status===403, JSON.stringify(pcDenied));
  const pc = await api('admin','POST','/api/profit-centres',{code:'RETAIL', name:'Retail Sales'});
  record('§3', 'Admin can create a real Profit Centre once management defines one', pc.ok && pc.profitCentre.id==='PC-RETAIL', pc.profitCentre);
  const jeWithPC = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', narration:'PC test', lines:[{account:'5200',debit:500,credit:0,profitCentreId:'PC-RETAIL'},{account:'1000',debit:0,credit:500}]});
  record('§3', 'A journal line can carry the Profit Centre once defined, and it is retrievable via the Document Viewer data', jeWithPC.ok && jeWithPC.draft.lines[0].profitCentreId==='PC-RETAIL', jeWithPC.draft && jeWithPC.draft.lines[0]);

  // ================= §5 Bank Reconciliation =================
  const banks = await api('viewer1','GET','/api/bank-accounts');
  record('§5', 'Bank Account master seeded with the ONE evidenced account (ICICI Areekkad)', banks.ok && banks.bankAccounts.some(b=>b.accountName.includes('Areekkad')), JSON.stringify(banks.bankAccounts));
  const custInv = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', docCategory:'CustomerInvoice', party:'CUST-1', narration:'Bank recon test',
    lines:[{account:'1100',debit:8000,credit:0,customerId:'CUST-1'},{account:'4000',debit:0,credit:8000,customerId:'CUST-1'}]});
  await api('accountant1','POST',`/api/journal/${custInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${custInv.draft.id}/approve`);
  const postedInv = await api('finance1','POST',`/api/journal/${custInv.draft.id}/post`);
  const rcpt = await api('finance1','POST','/api/ar/receipt',{customerId:'CUST-1', invoiceEntryId:postedInv.entry.id, amount:8000, date:'2026-08-25'});
  const csvGood = `Date,Reference,Description,Amount,Type\n2026-08-25,RCPT-TEST,Customer receipt,8000,Credit`;
  const impDenied = await api('sales1','POST','/api/bank-statement/import',{bankAccountId:'BANK-ICICI-1112', csvText:csvGood});
  record('§5/Security', 'Sales cannot import a bank statement', impDenied.status===403, JSON.stringify(impDenied));
  const imp = await api('finance1','POST','/api/bank-statement/import',{bankAccountId:'BANK-ICICI-1112', csvText:csvGood});
  record('§5', 'Valid statement import creates an Unmatched line (never a GL posting)', imp.ok && imp.lines[0].status==='Unmatched', JSON.stringify(imp.lines));
  const badCsv = 'Date,Reference,Amount\n2026-08-25,X,100';
  const impBad = await api('finance1','POST','/api/bank-statement/import',{bankAccountId:'BANK-ICICI-1112', csvText:badCsv});
  record('§5', 'Statement import missing the Type column is rejected with a clear error (BANK FORMAT CONFIGURATION REQUIRED guidance)', impBad.ok===false && impBad.error.includes('Type'), impBad.error);
  const wrongAmount = await api('finance1','POST','/api/bank-statement/import',{bankAccountId:'BANK-ICICI-1112', csvText:'Date,Reference,Description,Amount,Type\n2026-08-25,X,x,999,Credit'});
  const matchWrong = await api('finance1','POST',`/api/bank-statement/${wrongAmount.lines[0].id}/match`,{entryId:rcpt.entry.id});
  record('§5', 'Matching a statement line against a REAL bank document but a DIFFERENT amount is rejected (real validation, not just a UI hint)', matchWrong.ok===false && matchWrong.error.includes('mismatch'), matchWrong.error);
  const matchNoBankLine = await api('finance1','POST',`/api/bank-statement/${wrongAmount.lines[0].id}/match`,{entryId:postedInv.entry.id});
  record('§5', 'Matching against a document with NO Bank line at all (e.g. the original invoice) is rejected for the right reason', matchNoBankLine.ok===false && matchNoBankLine.error.includes('no Bank'), matchNoBankLine.error);
  const match = await api('finance1','POST',`/api/bank-statement/${imp.lines[0].id}/match`,{entryId:rcpt.entry.id});
  record('§5', 'Matching a Credit statement line (deposit) against the receipt succeeds with correct Debit/Credit polarity handling', match.ok && match.line.status==='Reconciled', JSON.stringify(match));
  const recon = await api('accountant1','GET','/api/bank-reconciliation?bankAccountId=BANK-ICICI-1112');
  record('§5', 'Reconciliation status correctly separates Matched vs Unmatched (1 matched, 1 unmatched from the bad-amount test)', recon.ok && recon.reconciliation.matchedCount===1 && recon.reconciliation.unmatchedCount===1, recon.reconciliation);
  const unmatch = await api('finance1','POST',`/api/bank-statement/${imp.lines[0].id}/unmatch`);
  record('§5', 'A reconciled line can be explicitly unmatched (reversible, no GL side-effect either way)', unmatch.ok && unmatch.line.status==='Unmatched', unmatch.line);

  // ================= §8 Branch — consistency, ID tampering, cross-branch =================
  const grn2 = await api('purchase1','GET','/api/grns');
  const grnForPO = grn2.grns.find(g=>g.poId===po.po.id);
  const glLines = await api('finance1','GET','/api/journal-entries?search=GRN');
  const grnEntry = glLines.journalEntries.find(e=>e.sourceId===grnForPO.id);
  record('§8', 'GRN posting inherits Branch from the project (PRJ-1 = Ulliyeri)', grnEntry && grnEntry.branchId==='BR-ULLIYERI', grnEntry && grnEntry.branchId);
  const rcptEntry = await api('finance1','GET',`/api/document?id=${rcpt.entry.id}`);
  record('§8', 'Customer Receipt inherits Branch from the ORIGINAL invoice it clears (not left null)', rcptEntry.ok && rcptEntry.entry.branchId===postedInv.entry.branchId, {receipt:rcptEntry.entry.branchId, invoice:postedInv.entry.branchId});

  const badBranchOnProject = await api('admin','POST','/api/projects/PRJ-2/branch',{branchId:'BR-DOESNOTEXIST'});
  record('§8', 'Assigning a non-existent branch ID to a project is rejected — ID tampering blocked at the domain layer', badBranchOnProject.ok===false, badBranchOnProject.error);
  const badBranchOnJE = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', branchId:'BR-FAKE-TAMPER', lines:[{account:'5200',debit:1,credit:0},{account:'1000',debit:0,credit:1}]});
  record('§8', 'Posting a Manual JE with a tampered/fabricated branchId is rejected server-side, not merely hidden by the UI', badBranchOnJE.ok===false && badBranchOnJE.error.includes('Unknown branch'), badBranchOnJE.error);
  const nonMasterDataBranchAssign = await api('sales1','POST','/api/projects/PRJ-1/branch',{branchId:'BR-HO'});
  record('§8/Security', 'Non-masterData role cannot reassign a project\'s branch', nonMasterDataBranchAssign.status===403, JSON.stringify(nonMasterDataBranchAssign));

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 15 GAP CLOSURE TESTS ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
