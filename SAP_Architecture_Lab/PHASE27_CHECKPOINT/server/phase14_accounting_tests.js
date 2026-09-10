'use strict';
// Phase 14 — SAP-Style Accounting Entry Architecture: Branches, Doc Date/Ref/Line-Remarks
// dimensions, Customer Credit/Debit Note, Inventory Transfer/Adjustment, Attachments, Journal
// Templates, Recurring Entries, Controlled CSV Import, Entry-Type Catalogue. Real HTTP calls.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all(['ceo','finance1','accountant1','pm1','sales1','purchase1','viewer1'].map(u=>login(u, {ceo:'Ceo@12345',finance1:'Fin@12345',accountant1:'Acc@12345',pm1:'Pm@123456',sales1:'Sal@123456',purchase1:'Pur@12345',viewer1:'View@1234'}[u])));

  // ================= §6/§7/§10 Standard header/line dimensions =================
  const draft = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', docDate:'2026-08-20', narration:'Rent JE', dueDate:'2026-09-25',
    lines:[{account:'5200',debit:15000,credit:0,remarks:'August rent'},{account:'1000',debit:0,credit:15000}], branchId:'BR-ULLIYERI', refNo1:'RENT-AUG', refNo2:'LEASE-2026'});
  record('§6/§7', 'Draft accepts Document Date distinct from Posting Date', draft.ok && draft.draft.docDate==='2026-08-20' && draft.draft.date==='2026-08-25', JSON.stringify(draft.draft && {date:draft.draft.date, docDate:draft.draft.docDate}));
  record('§6/§7', 'Draft accepts Branch + Ref 1/2 header fields', draft.ok && draft.draft.branchId==='BR-ULLIYERI' && draft.draft.refNo1==='RENT-AUG' && draft.draft.refNo2==='LEASE-2026', JSON.stringify(draft.draft));
  record('§6/§7', 'Line-level Remarks accepted', draft.ok && draft.draft.lines[0].remarks==='August rent', draft.draft && draft.draft.lines[0]);
  await api('accountant1','POST',`/api/journal/${draft.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${draft.draft.id}/approve`);
  const posted = await api('finance1','POST',`/api/journal/${draft.draft.id}/post`);
  record('§6/§7', 'Posted entry carries Document Date/Branch/Ref through the full lifecycle unchanged', posted.ok && posted.entry.docDate==='2026-08-20' && posted.entry.branchId==='BR-ULLIYERI' && posted.entry.refNo1==='RENT-AUG', JSON.stringify(posted.entry && {docDate:posted.entry.docDate, branchId:posted.entry.branchId, refNo1:posted.entry.refNo1}));
  record('§8', 'Posted entry is still balanced (Debit=Credit enforced unchanged by new fields)', posted.ok && posted.entry.totalDebit===posted.entry.totalCredit, posted.entry && {d:posted.entry.totalDebit, c:posted.entry.totalCredit});

  const draftUnbalanced = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', lines:[{account:'5200',debit:1000,credit:0},{account:'1000',debit:0,credit:999}]});
  const submitUnbalanced = await api('accountant1','POST',`/api/journal/${draftUnbalanced.draft.id}/submit`);
  record('§8', 'Unbalanced entry is rejected at submit (server-side, not just UI)', submitUnbalanced.ok===false, submitUnbalanced.error);

  const badBranch = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', branchId:'BR-NOTREAL', lines:[{account:'5200',debit:100,credit:0},{account:'1000',debit:0,credit:100}]});
  record('§18', 'Unknown branch is rejected, not silently accepted', badBranch.ok===false, badBranch.error);

  // ================= §18 Branches =================
  const branchList = await api('viewer1','GET','/api/branches');
  record('§18', 'Branches are listable (Ulliyeri evidenced from real CEO screenshot, seeded)', branchList.ok && branchList.branches.some(b=>b.code==='ULLIYERI'), JSON.stringify(branchList.branches));
  const branchCreateDenied = await api('sales1','POST','/api/branches',{code:'TEST','name':'Test Branch'});
  record('§18/Security', 'Non-masterData role cannot create a branch', branchCreateDenied.status===403, JSON.stringify(branchCreateDenied));
  const branchCreate = await api('admin','POST','/api/branches',{code:'KOCHI', name:'Kochi Showroom'});
  record('§18', 'Admin can create a new branch', branchCreate.ok && branchCreate.branch.id==='BR-KOCHI', JSON.stringify(branchCreate));

  // ================= #3/#4 Customer Credit Note / Debit Note =================
  const custInv = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', docCategory:'CustomerInvoice', party:'CUST-1', narration:'Test invoice',
    lines:[{account:'1100',debit:10000,credit:0,customerId:'CUST-1'},{account:'4000',debit:0,credit:10000,customerId:'CUST-1'}]});
  await api('accountant1','POST',`/api/journal/${custInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${custInv.draft.id}/approve`);
  const postedInv = await api('finance1','POST',`/api/journal/${custInv.draft.id}/post`);
  const openBefore = await api('accountant1','GET','/api/ar/open-items?customerId=CUST-1');
  const itemBefore = openBefore.items.find(i=>i.entryId===postedInv.entry.id);
  record('#3', 'AR open item is ₹10,000 before any credit note', itemBefore && itemBefore.open===10000, itemBefore);

  const ccnDenied = await api('sales1','POST','/api/customer-credit-notes',{customerInvoiceEntryId:postedInv.entry.id, amount:2000, reason:'test'});
  record('#3/Security', 'Sales cannot create a Customer Credit Note', ccnDenied.status===403, JSON.stringify(ccnDenied));
  const ccn = await api('finance1','POST','/api/customer-credit-notes',{customerInvoiceEntryId:postedInv.entry.id, amount:2000, reason:'Billing correction'});
  record('#3', 'Customer Credit Note posts Dr Revenue / Cr AR', ccn.ok && ccn.entry.lines.find(l=>l.account==='4000').debit===2000 && ccn.entry.lines.find(l=>l.account==='1100').credit===2000, JSON.stringify(ccn.entry && ccn.entry.lines));
  const openAfterCCN = await api('accountant1','GET','/api/ar/open-items?customerId=CUST-1');
  const itemAfterCCN = openAfterCCN.items.find(i=>i.entryId===postedInv.entry.id);
  record('#3', 'AR open item reduces to ₹8,000 after the ₹2,000 credit note clears against it', itemAfterCCN && itemAfterCCN.open===8000, itemAfterCCN);

  const cdn = await api('finance1','POST','/api/customer-debit-notes',{customerInvoiceEntryId:postedInv.entry.id, amount:500, reason:'Under-billed freight'});
  record('#4', 'Customer Debit Note posts Dr AR / Cr Revenue (a new open item, not a clearing)', cdn.ok && cdn.entry.lines.find(l=>l.account==='1100').debit===500 && cdn.entry.lines.find(l=>l.account==='4000').credit===500, JSON.stringify(cdn.entry && cdn.entry.lines));
  const ar1 = await api('accountant1','GET','/api/reconciliation');
  record('§42', 'AR subledger still reconciles to control account after credit+debit notes', ar1.ok && ar1.ar.matches, JSON.stringify(ar1.ar));

  // DEFECT FOUND & FIXED (Phase 14 Accountant UAT) — a credit note could over-clear an
  // already-fully-cleared invoice, driving its open balance negative. Permanent regression.
  const fullyClearedInv = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-25', docCategory:'CustomerInvoice', party:'CUST-2', narration:'Over-clear test',
    lines:[{account:'1100',debit:5000,credit:0,customerId:'CUST-2'},{account:'4000',debit:0,credit:5000,customerId:'CUST-2'}]});
  await api('accountant1','POST',`/api/journal/${fullyClearedInv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${fullyClearedInv.draft.id}/approve`);
  const postedFullInv = await api('finance1','POST',`/api/journal/${fullyClearedInv.draft.id}/post`);
  await api('finance1','POST','/api/ar/receipt',{customerId:'CUST-2', invoiceEntryId:postedFullInv.entry.id, amount:5000, date:'2026-08-25'});
  const overClearAttempt = await api('finance1','POST','/api/customer-credit-notes',{customerInvoiceEntryId:postedFullInv.entry.id, amount:1000, reason:'over-clear attempt'});
  record('§25/Defect-fix', 'Credit note against a FULLY CLEARED invoice is rejected — cannot over-clear (open balance would go negative)', overClearAttempt.ok===false && overClearAttempt.error.includes('exceeds'), JSON.stringify(overClearAttempt));
  const openAfterAttempt = await api('accountant1','GET','/api/ar/open-items?customerId=CUST-2');
  const itemAfterAttempt = openAfterAttempt.items.find(i=>i.entryId===postedFullInv.entry.id);
  record('§25/Defect-fix', 'Open balance stays exactly ₹0 after the rejected over-clear attempt — never goes negative', itemAfterAttempt && itemAfterAttempt.open===0, itemAfterAttempt);
  const partialClearOk = await api('finance1','POST','/api/customer-credit-notes',{customerInvoiceEntryId:postedInv.entry.id, amount:1000, reason:'valid partial credit'});
  record('§25/Defect-fix', 'A credit note within the actual open balance still succeeds normally (the fix only blocks over-clearing, not legitimate use)', partialClearOk.ok, JSON.stringify(partialClearOk.ok));

  // DEFECT FOUND & FIXED (Phase 14 Accountant UAT) — a draft with no date could pass Create/
  // Submit/Approve, only failing at Post several steps later. Permanent regression.
  const noDateDraft = await api('accountant1','POST','/api/journal/draft',{narration:'No date test', lines:[{account:'5200',debit:100,credit:0},{account:'1000',debit:0,credit:100}]});
  record('§25/Defect-fix', 'A draft with no Date is rejected immediately at creation, not several steps later at Post', noDateDraft.ok===false && noDateDraft.error.includes('Date'), JSON.stringify(noDateDraft));

  // ================= #17/#18 Inventory Transfer / Adjustment =================
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:20, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:20,qtyRejected:0,uom:'sheet'}]});

  const trTooMuch = await api('purchase1','POST','/api/inventory-transfers',{materialId:'MAT-1', qty:999, fromWarehouseId:'WH-1', toWarehouseId:'WH-2', reason:'test'});
  record('#17', 'Transfer exceeding available stock is rejected (never creates negative stock)', trTooMuch.ok===false, trTooMuch.error);
  const tr = await api('purchase1','POST','/api/inventory-transfers',{materialId:'MAT-1', qty:5, fromWarehouseId:'WH-1', toWarehouseId:'WH-2', reason:'site allocation'});
  const stockWH1 = await api('purchase1','GET','/api/inventory/stock?materialId=MAT-1&warehouseId=WH-1');
  const stockWH2 = await api('purchase1','GET','/api/inventory/stock?materialId=MAT-1&warehouseId=WH-2');
  record('#17', 'Inventory Transfer moves real stock between warehouses (15 remain at WH-1, 5 now at WH-2)', tr.ok && stockWH1.stock===15 && stockWH2.stock===5, {tr:tr.ok, wh1:stockWH1.stock, wh2:stockWH2.stock});
  record('#17', 'Inventory Transfer has NO GL impact (same-company movement, standard practice)', tr.ok && !tr.glEntry, JSON.stringify(tr));

  const adjNoReason = await api('finance1','POST','/api/inventory-adjustments',{materialId:'MAT-1', qty:-1, warehouseId:'WH-1'});
  record('#18', 'Inventory Adjustment without a reason is rejected — never silent', adjNoReason.ok===false, adjNoReason.error);
  const adjDenied = await api('purchase1','POST','/api/inventory-adjustments',{materialId:'MAT-1', qty:-1, warehouseId:'WH-1', reason:'shortage'});
  record('#18/Security', 'Purchase role (non-manager) cannot create an Inventory Adjustment', adjDenied.status===403, JSON.stringify(adjDenied));
  const adj = await api('finance1','POST','/api/inventory-adjustments',{materialId:'MAT-1', qty:-1, warehouseId:'WH-1', reason:'Physical count shortage'});
  const stockAfterAdj = await api('purchase1','GET','/api/inventory/stock?materialId=MAT-1&warehouseId=WH-1');
  record('#18', 'Inventory Adjustment reduces real stock (14 remain) and posts Dr 5300 / Cr 1200', adj.ok && stockAfterAdj.stock===14 && adj.glEntry.lines.find(l=>l.account==='5300').debit===2800 && adj.glEntry.lines.find(l=>l.account==='1200').credit===2800, {stock:stockAfterAdj.stock, glEntry:adj.glEntry});
  const adjIncrease = await api('finance1','POST','/api/inventory-adjustments',{materialId:'MAT-1', qty:3, warehouseId:'WH-1', reason:'Physical count — found stock'});
  record('#18', 'Positive Inventory Adjustment (found stock) posts the reverse direction: Dr 1200 / Cr 5300', adjIncrease.ok && adjIncrease.glEntry.lines.find(l=>l.account==='1200').debit>0 && adjIncrease.glEntry.lines.find(l=>l.account==='5300').credit>0, JSON.stringify(adjIncrease.glEntry && adjIncrease.glEntry.lines));

  // ================= §13 Attachments =================
  const smallFile = Buffer.from('Test PDF content for attachment').toString('base64');
  const attDenied = await api('viewer1','POST','/api/attachments',{entityType:'JournalDraft', entityId:draft.draft.id, filename:'test.pdf', mimeType:'application/pdf', base64Data:smallFile, docType:'Supporting Bill'});
  record('§13/Security', 'Viewer (no create permission) cannot upload an attachment', attDenied.status===403, JSON.stringify(attDenied));
  const att = await api('accountant1','POST','/api/attachments',{entityType:'JournalDraft', entityId:draft.draft.id, filename:'rent_receipt.pdf', mimeType:'application/pdf', base64Data:smallFile, docType:'Supporting Bill', reference:'Aug rent'});
  record('§13', 'Attachment uploads successfully with real metadata (filename/size/uploadedBy/timestamp/docType)', att.ok && att.attachment.filename==='rent_receipt.pdf' && att.attachment.uploadedBy==='U-ACC1' && att.attachment.sizeBytes>0, JSON.stringify(att.attachment));
  const attList = await api('accountant1','GET',`/api/attachments?entityType=JournalDraft&entityId=${draft.draft.id}`);
  record('§13', 'Attachment is listable against its entity', attList.ok && attList.attachments.length===1, JSON.stringify(attList));
  const attDownload = await api('accountant1','GET',`/api/attachments/${att.attachment.id}/download`);
  record('§13', 'Attachment downloads with the SAME base64 content that was uploaded (real storage, not a stub)', attDownload.ok && attDownload.base64Data===smallFile, attDownload.ok);
  const bigFile = Buffer.alloc(1200*1024, 'x').toString('base64');
  const attTooBig = await api('accountant1','POST','/api/attachments',{entityType:'JournalDraft', entityId:draft.draft.id, filename:'huge.bin', base64Data:bigFile});
  record('§13', 'Oversized attachment (>1MB) is rejected with a real, disclosed limit, not silently truncated', attTooBig.ok===false, attTooBig.error);

  // ================= §14 Journal Templates =================
  const tmplDenied = await api('sales1','POST','/api/journal-templates',{name:'Rent', lines:[{account:'5200',debit:1,credit:0},{account:'1000',debit:0,credit:1}]});
  record('§14/Security', 'Non-masterData role cannot create a Journal Template', tmplDenied.status===403, JSON.stringify(tmplDenied));
  const tmpl = await api('admin','POST','/api/journal-templates',{name:'Security Wage — Ulliyeri', category:'Security', branchId:'BR-ULLIYERI',
    lines:[{account:'5200',debit:1,credit:0,pctOfAmount:1},{account:'1000',debit:0,credit:1,pctOfAmount:1}], defaultNarration:'Being Ulliyeri Security wage (charge)'});
  record('§14', 'Journal Template created successfully', tmpl.ok, JSON.stringify(tmpl.template));
  const instAt37440 = await api('accountant1','POST','/api/journal-templates/instantiate',{templateId:tmpl.template.id, date:'2026-08-25', amount:37440});
  record('§14', 'Instantiating a template at ₹37,440 produces a correctly-scaled, BALANCED draft (not a fixed invented amount)', instAt37440.ok && instAt37440.draft.lines[0].debit===37440 && instAt37440.draft.lines[1].credit===37440 && instAt37440.draft.branchId==='BR-ULLIYERI', JSON.stringify(instAt37440.draft && instAt37440.draft.lines));
  const instAt5000 = await api('accountant1','POST','/api/journal-templates/instantiate',{templateId:tmpl.template.id, date:'2026-08-25', amount:5000});
  record('§14', 'The SAME template reused at a different amount (₹5,000) scales correctly — never a hardcoded recurring figure', instAt5000.ok && instAt5000.draft.lines[0].debit===5000, JSON.stringify(instAt5000.draft && instAt5000.draft.lines));
  record('§14', 'Template-instantiated draft still requires normal Submit/Approve/Post — status is Draft, not auto-posted', instAt37440.ok && instAt37440.draft.status==='Draft', instAt37440.draft && instAt37440.draft.status);

  // ================= §15 Recurring Entries =================
  const rec = await api('admin','POST','/api/recurring-entries',{templateId:tmpl.template.id, frequency:'Monthly', startDate:'2026-01-01', amount:37440, narration:'Being Ulliyeri Security wage (charge) — recurring'});
  record('§15', 'Recurring entry rule created (Frequency/Start/Next Run tracked)', rec.ok && rec.recurring.nextRunDate==='2026-01-01' && rec.recurring.status==='Active', JSON.stringify(rec.recurring));
  const draftsBefore = await api('accountant1','GET','/api/journal-drafts');
  const gen1 = await api('accountant1','POST','/api/recurring-entries/generate-due',{asOfDate:'2026-03-15'});
  const draftsAfter1 = await api('accountant1','GET','/api/journal-drafts');
  record('§15', 'Generate-due creates exactly the drafts due by the given date (Jan/Feb/Mar = 3), never auto-posts them', gen1.ok && gen1.generated.length===3 && gen1.generated.every(d=>d.status==='Draft'), JSON.stringify({count:gen1.generated.length, statuses:gen1.generated.map(d=>d.status)}));
  const gen2 = await api('accountant1','POST','/api/recurring-entries/generate-due',{asOfDate:'2026-03-15'});
  record('§15', 'Re-running generate-due for the SAME date produces zero new drafts (nextRunDate already advanced past it)', gen2.ok && gen2.generated.length===0, JSON.stringify(gen2));
  const recList = await api('accountant1','GET','/api/recurring-entries');
  const recRow = recList.recurring.find(r=>r.id===rec.recurring.id);
  record('§15', 'nextRunDate correctly advanced to April after 3 monthly runs', recRow && recRow.nextRunDate==='2026-04-01', recRow);

  // ================= §16 Controlled CSV Import =================
  const csvGood = 'Account,Debit,Credit,Project,Remarks\n5200,3000,0,,Office supplies\n1000,0,3000,,Office supplies';
  const impDenied = await api('viewer1','POST','/api/import/journal-csv',{csvText:csvGood, date:'2026-08-25'});
  record('§16/Security', 'Viewer cannot import journal entries', impDenied.status===403, JSON.stringify(impDenied));
  const imp = await api('accountant1','POST','/api/import/journal-csv',{csvText:csvGood, date:'2026-08-25', narration:'Import test'});
  record('§16', 'Valid CSV import produces a Draft (never a direct post) — status is Draft', imp.ok && imp.draft.status==='Draft' && imp.draft.sourceType==='CSV Import', JSON.stringify(imp.draft));
  const csvUnbalanced = 'Account,Debit,Credit\n5200,1000,0\n1000,0,999';
  const impBad = await api('accountant1','POST','/api/import/journal-csv',{csvText:csvUnbalanced, date:'2026-08-25'});
  record('§16', 'Unbalanced CSV import is rejected with the exact imbalance, not silently posted', impBad.ok===false && impBad.errors.some(e=>e.includes('not balanced')), JSON.stringify(impBad));
  const csvBadAccount = 'Account,Debit,Credit\n9999,1000,0\n1000,0,1000';
  const impBadAcct = await api('accountant1','POST','/api/import/journal-csv',{csvText:csvBadAccount, date:'2026-08-25'});
  record('§16', 'CSV import validates every account exists before creating any draft', impBadAcct.ok===false && impBadAcct.errors.some(e=>e.includes('unknown account')), JSON.stringify(impBadAcct));
  record('§16', 'Import authorization still requires the normal Submit/Approve/Post chain — imported draft is not fast-tracked', imp.ok && !imp.draft.postedEntryId, imp.draft && imp.draft.postedEntryId);

  // ================= §36 Entry-Type Catalogue =================
  const catDenied = await api('sales1','GET','/api/accounting/entry-types');
  record('§36/Security', 'Sales (not GL-visible) cannot view the entry-type catalogue', catDenied.status===403, JSON.stringify(catDenied));
  const cat = await api('finance1','GET','/api/accounting/entry-types');
  record('§36', 'Entry-type catalogue reflects real posted transaction types (GRN, CustomerInvoice, InventoryAdjustment all present)', cat.ok && cat.entryTypes.some(e=>e.docCategory==='GRN') && cat.entryTypes.some(e=>e.docCategory==='CustomerInvoice') && cat.entryTypes.some(e=>e.docCategory==='InventoryAdjustment'), JSON.stringify(cat.entryTypes.map(e=>e.docCategory)));

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 14 ACCOUNTING ARCHITECTURE TESTS ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('TEST ERROR:', e); process.exit(2); });
