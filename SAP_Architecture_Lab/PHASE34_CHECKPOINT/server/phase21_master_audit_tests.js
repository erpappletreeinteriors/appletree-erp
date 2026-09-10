// Phase 21 — Master SAP-Class Audit v2: fresh live evidence gathering (one-shot, not permanent regression).
const BASE = 'http://localhost:4001';
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }
const fs = require('fs');
function readDb(){ return JSON.parse(fs.readFileSync('db.json','utf8')); }
function section(t){ console.log('\n==================== '+t+' ===================='); }
const results = [];
function log(label, entry, extra){
  if(!entry){ console.log(label.padEnd(30), '-> NO ENTRY'); results.push({label, ok:false}); return; }
  const bal = entry.totalDebit === entry.totalCredit;
  console.log(label.padEnd(30), '-> JE', entry.id, 'voucher', entry.voucherNo, 'DR', entry.totalDebit, 'CR', entry.totalCredit, bal?'BALANCED':'*** UNBALANCED ***', extra||'');
  results.push({label, ok:bal, entryId:entry.id, voucherNo:entry.voucherNo, dr:entry.totalDebit, cr:entry.totalCredit});
}

async function fullPost(creatorUser, createPath, createBody, label){
  const draft = await api(creatorUser,'POST',createPath, createBody);
  if(!draft.ok){ console.log(label,'DRAFT FAILED:', JSON.stringify(draft).slice(0,300)); results.push({label,ok:false,stage:'draft',error:draft.error}); return null; }
  const id = draft.draft.id;
  const sub = await api('accountant1','POST',`/api/journal/${id}/submit`);
  if(!sub.ok){ console.log(label,'SUBMIT FAILED:', JSON.stringify(sub).slice(0,300)); results.push({label,ok:false,stage:'submit',error:sub.error}); return null; }
  const appr = await api('finance1','POST',`/api/journal/${id}/approve`);
  if(!appr.ok){ console.log(label,'APPROVE FAILED:', JSON.stringify(appr).slice(0,300)); results.push({label,ok:false,stage:'approve',error:appr.error}); return null; }
  const post = await api('finance1','POST',`/api/journal/${id}/post`);
  if(!post.ok){ console.log(label,'POST FAILED:', JSON.stringify(post).slice(0,300)); results.push({label,ok:false,stage:'post',error:post.error}); return null; }
  log(label, post.entry);
  return post.entry;
}

(async()=>{
  await login('admin','Admin@12345');
  await login('ceo','Ceo@12345');
  await login('sales1','Sal@123456');
  await login('accountant1','Acc@12345');
  await login('finance1','Fin@12345');

  section('RESET TO CLEAN SEED');
  console.log('reset:', (await api('admin','POST','/api/test/reset')).ok);

  section('20 GOLDEN RECONCILIATION TESTS — transaction type sweep (each independently DR=CR checked)');

  const inv1 = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-1',projectId:'PRJ-1',baseAmount:100000,date:'2026-08-01',taxCode:'GST18',narration:'GRT Sales Invoice'},'1. Sales Invoice');
  const bill1 = await fullPost('admin','/api/ap/invoice',{vendorId:'VEND-1',projectId:'PRJ-1',baseAmount:50000,date:'2026-08-01',taxCode:'GST18',narration:'GRT Purchase Invoice'},'2. Purchase Invoice');

  if(inv1){
    const receipt = await api('accountant1','POST','/api/ar/receipt',{customerId:'CUST-1',invoiceEntryId:inv1.id,amount:40000,date:'2026-08-05',narration:'GRT Customer Receipt',paymentMethodId:'PM-BANKTRANSFER'});
    log('3. Customer Receipt', receipt.entry, receipt.ok?'':JSON.stringify(receipt).slice(0,200));
  }
  if(bill1){
    const payment = await api('finance1','POST','/api/ap/payment',{vendorId:'VEND-1',invoiceEntryId:bill1.id,amount:30000,date:'2026-08-05',narration:'GRT Vendor Payment',paymentMethodId:'PM-BANKTRANSFER'});
    log('4. Vendor Payment', payment.entry, payment.ok?'':JSON.stringify(payment).slice(0,200));
  }

  const expense = await fullPost('accountant1','/api/journal/draft',{date:'2026-08-02',docDate:'2026-08-02',narration:'GRT Office Expense',docTypeCode:'JV',sourceType:'Expense',docCategory:'Journal',party:null,
    lines:[{account:'5100',debit:5000,credit:0,projectId:'PRJ-1'},{account:'1000',debit:0,credit:5000}]},'5. Generic Expense (JV)');

  if(inv1){
    const cn = await api('finance1','POST','/api/customer-credit-notes',{customerInvoiceEntryId:inv1.id,amount:10000,reason:'GRT Credit Note — pricing correction'});
    log('6. Customer Credit Note', cn.entry, cn.ok?'':JSON.stringify(cn).slice(0,200));
    const dn = await api('finance1','POST','/api/customer-debit-notes',{customerInvoiceEntryId:inv1.id,amount:2000,reason:'GRT Debit Note — additional charge'});
    log('7. Customer Debit Note', dn.entry, dn.ok?'':JSON.stringify(dn).slice(0,200));
  }

  const advance = await fullPost('sales1','/api/advances',{customerId:'CUST-2',projectId:'PRJ-2',amount:75000,date:'2026-08-01',narration:'GRT Customer Advance'},'8. Customer Advance');

  const iadj = await api('finance1','POST','/api/inventory-adjustments',{materialId:'MAT-1',qty:-5,uom:'sheet',warehouseId:'WH-1',reason:'GRT Stock shrinkage test'});
  log('9. Inventory Adjustment (shrinkage)', iadj.glEntry, iadj.ok?'':JSON.stringify(iadj).slice(0,200));

  const iadjUp = await api('finance1','POST','/api/inventory-adjustments',{materialId:'MAT-1',qty:3,uom:'sheet',warehouseId:'WH-1',reason:'GRT Stock found test'});
  log('10. Inventory Adjustment (found)', iadjUp.glEntry, iadjUp.ok?'':JSON.stringify(iadjUp).slice(0,200));

  const asset = await api('finance1','POST','/api/fixed-assets',{assetCode:'GRT-AST-1',assetName:'GRT Test Machine',assetClass:'Equipment',purchaseDate:'2026-08-01',cost:200000,location:'Workshop',custodian:'U-FIN1',projectId:null});
  if(asset.ok){
    console.log('11. Fixed Asset Created (not yet posted, correctly pre-capitalization):', asset.asset.id);
    const cap = await api('finance1','POST',`/api/fixed-assets/${asset.asset.id}/capitalize`,{capitalizationDate:'2026-08-01',fundingSource:'Bank',usefulLifeMonths:60,depreciationMethod:'StraightLine',residualValue:20000});
    log('11. Fixed Asset Capitalization', cap.entry, cap.ok?'':JSON.stringify(cap).slice(0,200));
    const dep = await api('finance1','POST',`/api/fixed-assets/${asset.asset.id}/depreciate`,{periodDate:'2026-08-31',amount:3000});
    log('12. Asset Depreciation', dep.entry, dep.ok?'':JSON.stringify(dep).slice(0,200));
  } else {
    console.log('11. Fixed Asset Created FAILED:', JSON.stringify(asset).slice(0,300));
  }

  const bankTransfer = await fullPost('accountant1','/api/journal/draft',{date:'2026-08-03',docDate:'2026-08-03',narration:'GRT Bank to Cash contra transfer',docTypeCode:'JV',sourceType:'Contra',docCategory:'Journal',party:null,
    lines:[{account:'1000',debit:0,credit:15000},{account:'1010',debit:15000,credit:0}]},'13. Bank/Cash Contra');

  const projLabour = await fullPost('accountant1','/api/journal/draft',{date:'2026-08-04',docDate:'2026-08-04',narration:'GRT Site Labour cost',docTypeCode:'JV',sourceType:'LabourCost',docCategory:'Journal',party:null,
    lines:[{account:'5200',debit:18000,credit:0,projectId:'PRJ-1',costCentreId:'CC-1'},{account:'1000',debit:0,credit:18000}]},'14. Project Labour Cost');

  const openingBalTest = await api('finance1','GET','/api/opening-balance/types');
  console.log('15. Opening Balance types available:', openingBalTest.ok, JSON.stringify(openingBalTest).slice(0,150));

  const inv2 = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-3',projectId:'PRJ-3',baseAmount:60000,date:'2026-08-06',taxCode:'GST18',narration:'GRT Invoice for reversal test'},'16. Sales Invoice (for reversal test)');
  let reversalEntry = null;
  if(inv2){
    const rev = await api('finance1','POST',`/api/journal/${inv2.id}/reverse`,{reason:'GRT reversal test — issued in error'}).catch(()=>null);
    if(rev) log('17. Reversal of Invoice 16', rev.entry, rev.ok?'':JSON.stringify(rev).slice(0,200));
  }

  const bill2 = await fullPost('admin','/api/ap/invoice',{vendorId:'VEND-2',projectId:'PRJ-2',baseAmount:35000,date:'2026-08-07',taxCode:'GST18',narration:'GRT Purchase Invoice 2'},'18. Purchase Invoice 2');
  if(bill2){
    const scn = await api('finance1','POST','/api/supplier-credit-notes',{supplierInvoiceEntryId:bill2.id,amount:5000,reason:'GRT Supplier Credit Note'}).catch(()=>null);
    if(scn) log('19. Supplier Credit Note', scn.entry, scn.ok?'':JSON.stringify(scn).slice(0,200));
  }

  const inv3 = await fullPost('sales1','/api/ar/invoice',{customerId:'CUST-4',projectId:'PRJ-4',baseAmount:200000,date:'2026-08-08',taxCode:'GST18',narration:'GRT Invoice 20'},'20. Sales Invoice (final sweep)');

  fs.writeFileSync('phase21_grt_results.json', JSON.stringify(results, null, 2));
  console.log('\nTotal transactions attempted:', results.length, '| Balanced/OK:', results.filter(r=>r.ok).length, '| Failed/Unbalanced:', results.filter(r=>!r.ok).length);
})();
