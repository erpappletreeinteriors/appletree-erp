'use strict';
// Phase 8 — Manufacturing→Dispatch→Delivery→Installation→QC→Snag→Handover→Billing→AR: live tests.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(username, password){
  const res = await fetch(BASE+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password})});
  const json = await res.json(); const setCookie = res.headers.get('set-cookie'); if(setCookie) jars[username] = setCookie.split(';')[0];
  return {status:res.status, ...json};
}
async function api(username, method, path, body){
  const headers = {'Content-Type':'application/json'}; if(jars[username]) headers['Cookie'] = jars[username];
  const res = await fetch(BASE+path, {method, headers, body: body?JSON.stringify(body):undefined});
  const json = await res.json().catch(()=>({})); return {status:res.status, ...json};
}

async function main(){
  await login('admin','Admin@12345'); await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('pm1','Pm@123456'), login('purchase1','Pur@12345'), login('sales1','Sal@123456'), login('estimator1','Est@12345')
  ]);

  // ============================================================
  // Set up a real project via the Phase 6B Lead→Won chain (reused, not rebuilt)
  // ============================================================
  const lead = await api('sales1','POST','/api/leads',{name:'Mrs. Sarah Jacob', requirement:'Full home interior'});
  const er = await api('sales1','POST','/api/estimation-requests',{leadId:lead.lead.id});
  const cost = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er.estimationRequest.id, overheadPct:10, profitPct:20, lines:[{category:'Material',qty:1,uom:'lot',rate:300000}]});
  const qtn = await api('sales1','POST','/api/quotations',{leadId:lead.lead.id, estimationRequestId:er.estimationRequest.id, costingVersionId:cost.costingVersion.id, prospectName:'Mrs. Sarah Jacob', discountPct:0});
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/submit`);
  await api('sales1','POST',`/api/quotations/${qtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'Mrs. Sarah Jacob'});
  const won = await api('finance1','POST',`/api/quotations/${qtn.quotation.id}/won`,{projectManagerId:'U-PM1'});
  const projectId = won.project.id, customerId = won.customer.id;
  record('Setup','Project created via existing Phase 6B Won chain, PM assigned dynamically', won.ok, JSON.stringify(won.project));

  // ============================================================
  // §38 FULL CHAIN — Production → Dispatch → Delivery → Installation → QC → Snag → Handover → Billing → AR → Receipt → Clearing
  // ============================================================
  const bom = await api('estimator1','POST','/api/boms',{projectId, description:'Wardrobe Unit', lines:[{materialId:'MAT-1', qty:2, uom:'sheet', scrapPct:5}]});
  await api('ceo','POST',`/api/boms/${bom.bom.id}/approve`);
  const prod = await api('pm1','POST','/api/production-orders',{projectId, bomId:bom.bom.id, plannedQty:5});
  record('Full Chain','1. Production Order created (status Released)', prod.ok && prod.productionOrder.status==='Released', JSON.stringify(prod.productionOrder));

  // Seed some stock via a real PO->GRN so the production material issue has something to draw from.
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId, vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:50, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:50, qtyRejected:0, uom:'sheet'}]});

  const issue = await api('pm1','POST',`/api/production-orders/${prod.productionOrder.id}/issue-material`,{warehouseId:'WH-1'});
  record('Full Chain','2. Production material issue succeeds (5 × 2 × 1.05 = 10.5 sheets)', issue.ok && Math.abs(issue.issues[0].movement.qty-10.5)<0.01, JSON.stringify(issue.issues?.[0]?.movement));
  const labour = await api('finance1','POST',`/api/production-orders/${prod.productionOrder.id}/labour-cost`,{amount:8000});
  record('Full Chain','3. Production labour cost posted', labour.ok, JSON.stringify(labour));
  const complete = await api('pm1','POST',`/api/production-orders/${prod.productionOrder.id}/complete`,{actualQty:5, rejectedQty:0});
  record('Full Chain','4. Production Order Completed (actualQty=plannedQty)', complete.ok && complete.productionOrder.status==='Completed', JSON.stringify(complete.productionOrder));

  const dsp = await api('pm1','POST','/api/dispatches',{projectId, customerId, productionOrderId:prod.productionOrder.id, items:[{materialId:'MAT-1', qty:5}], vehicle:'KL-07-1234', dispatchDate:'2026-09-20', destination:'Site'});
  record('Full Chain','5. Dispatch created', dsp.ok, JSON.stringify(dsp.dispatch));
  const dspReady = await api('pm1','POST',`/api/dispatches/${dsp.dispatch.id}/ready`);
  record('Full Chain','6. Dispatch marked Ready — passes readiness check (production is Completed)', dspReady.ok && dspReady.dispatch.status==='Ready', JSON.stringify(dspReady));
  const dspApprove = await api('finance1','POST',`/api/dispatches/${dsp.dispatch.id}/approve`);
  record('Full Chain','7. Dispatch approved by a different role', dspApprove.ok, JSON.stringify(dspApprove));
  const dspGo = await api('pm1','POST',`/api/dispatches/${dsp.dispatch.id}/dispatch`);
  record('Full Chain','8. Dispatch marked Dispatched', dspGo.ok && dspGo.dispatch.status==='Dispatched', JSON.stringify(dspGo));

  const dlv = await api('pm1','POST','/api/deliveries',{dispatchId:dsp.dispatch.id, deliveredItems:[{materialId:'MAT-1', qty:5}], receivedBy:'Site Supervisor', evidenceRef:'Signed delivery slip #4521'});
  record('Full Chain','9. Delivery confirmed — Full (5=5), linked to dispatch', dlv.ok && dlv.delivery.type==='Full', JSON.stringify(dlv.delivery));

  const inst = await api('pm1','POST','/api/installations',{projectId, site:'Kochi', team:['Team A'], startDate:'2026-09-21', scope:'Wardrobe installation'});
  record('Full Chain','10. Installation created (Planned)', inst.ok && inst.installation.status==='Planned', JSON.stringify(inst.installation));
  const instProgress = await api('pm1','POST',`/api/installations/${inst.installation.id}/progress`,{progressPct:100, status:'Completed'});
  record('Full Chain','11. Installation marked Completed', instProgress.ok && instProgress.installation.status==='Completed', JSON.stringify(instProgress.installation));

  const handoverBeforeQC = await api('pm1','POST','/api/handovers',{projectId, customerAcknowledgement:'Attempting early', evidenceRef:'x'});
  record('Full Chain','12. Handover BLOCKED before QC/snags addressed (real gate, not a UI-only check)', handoverBeforeQC.status===400 && !handoverBeforeQC.ok, JSON.stringify(handoverBeforeQC));

  const qc = await api('pm1','POST','/api/qc-checklists',{projectId, installationId:inst.installation.id, items:[{description:'Alignment', critical:true},{description:'Finish quality', critical:false}], inspector:'U-PM1'});
  record('Full Chain','13. QC Checklist created', qc.ok, JSON.stringify(qc.qc));
  const qcFail = await api('pm1','POST',`/api/qc-checklists/${qc.qc.id}/result`,{items:[{description:'Alignment', critical:true, passFail:'Fail'},{description:'Finish quality', critical:false, passFail:'Pass'}]});
  record('Full Chain','14. QC result submitted — Failed (critical item failed)', qcFail.ok && qcFail.qc.status==='Failed', JSON.stringify(qcFail.qc));
  const handoverAfterQCFail = await api('pm1','POST','/api/handovers',{projectId, customerAcknowledgement:'x', evidenceRef:'x'});
  record('Full Chain','15. Handover still BLOCKED — QC Failed', handoverAfterQCFail.status===400 && /Failed/.test(handoverAfterQCFail.error), JSON.stringify(handoverAfterQCFail));

  const qcPass = await api('pm1','POST',`/api/qc-checklists/${qc.qc.id}/result`,{items:[{description:'Alignment', critical:true, passFail:'Pass'},{description:'Finish quality', critical:false, passFail:'Pass'}]});
  record('Full Chain','16. QC re-submitted — Passed', qcPass.ok && qcPass.qc.status==='Passed', JSON.stringify(qcPass.qc));

  const snag = await api('pm1','POST','/api/snags',{projectId, site:'Kochi', description:'Hinge misaligned', severity:'Critical'});
  record('Full Chain','17. Critical snag created', snag.ok, JSON.stringify(snag.snag));
  const handoverWithOpenSnag = await api('pm1','POST','/api/handovers',{projectId, customerAcknowledgement:'x', evidenceRef:'x'});
  record('Full Chain','18. Handover still BLOCKED — open Critical snag', handoverWithOpenSnag.status===400 && /Critical/.test(handoverWithOpenSnag.error), JSON.stringify(handoverWithOpenSnag));

  const snagAssign = await api('pm1','POST',`/api/snags/${snag.snag.id}/assign`,{assignedTo:'U-PM1', dueDate:'2026-09-25'});
  const snagResolve = await api('pm1','POST',`/api/snags/${snag.snag.id}/resolve`,{resolution:'Hinge realigned and re-checked'});
  const snagSelfVerify = await api('pm1','POST',`/api/snags/${snag.snag.id}/verify`); // same user who resolved it — should be blocked
  // Phase 9B: verifySnag's business-outcome status was corrected from 403 to 400 (403 is now
  // reserved exclusively for the can()/deny() authorization gate; this is a per-resource SoD
  // business-rule outcome, same class as "wrong document status") — the actual block is unchanged.
  record('Full Chain','19. Same user cannot resolve AND verify their own snag (real QC control)', snagSelfVerify.status===400 && snagSelfVerify.ok===false, JSON.stringify(snagSelfVerify));
  const snagVerify = await api('finance1','POST',`/api/snags/${snag.snag.id}/verify`);
  record('Full Chain','20. Different user verifies the snag', snagVerify.ok && snagVerify.snag.status==='Verified', JSON.stringify(snagVerify.snag));
  const snagClose = await api('pm1','POST',`/api/snags/${snag.snag.id}/close`);
  record('Full Chain','21. Snag closed', snagClose.ok && snagClose.snag.status==='Closed', JSON.stringify(snagClose.snag));

  const handoverNow = await api('pm1','POST','/api/handovers',{projectId, customerAcknowledgement:'Mrs. Sarah Jacob — accepted in person', evidenceRef:'Signed handover certificate #HO-1'});
  record('Full Chain','22. Handover now succeeds — ALL real prerequisites genuinely met', handoverNow.ok && /PENDING/.test(handoverNow.handover.evidenceMethod), JSON.stringify(handoverNow.handover));

  const bm = await api('accountant1','POST','/api/billing-milestones',{projectId, milestoneType:'Handover', amount:354000, triggerNote:'Final billing on handover'});
  record('Full Chain','23. Billing milestone created — status Pending (NOT auto-invoiced just because handover happened)', bm.ok && bm.milestone.status==='Pending', JSON.stringify(bm.milestone));
  const bmSalesReady = await api('sales1','POST',`/api/billing-milestones/${bm.milestone.id}/ready`);
  record('Full Chain','24. Sales (wrong role) cannot mark a milestone Ready — only Finance-tier can confirm', bmSalesReady.status===403, JSON.stringify(bmSalesReady));
  const bmReady = await api('finance1','POST',`/api/billing-milestones/${bm.milestone.id}/ready`);
  record('Full Chain','25. FinanceManager marks milestone Ready', bmReady.ok && bmReady.milestone.status==='Ready', JSON.stringify(bmReady.milestone));

  const inv = await api('accountant1','POST','/api/ar/invoice-from-milestone',{milestoneId:bm.milestone.id, customerId, projectId, taxCode:'GST18', date:'2026-09-26'});
  record('Full Chain','26. Customer Invoice drafted from milestone — via the EXISTING Phase-5 draftCustomerInvoice, not a new engine', inv.ok, JSON.stringify(inv.draft?.lines));
  await api('accountant1','POST',`/api/journal/${inv.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${inv.draft.id}/approve`);
  const invPosted = await api('finance1','POST',`/api/journal/${inv.draft.id}/post`);
  record('Full Chain','27. Invoice posted, AR raised', invPosted.ok, JSON.stringify(invPosted.entry?.totalDebit));

  const receipt = await api('accountant1','POST','/api/ar/receipt',{customerId, invoiceEntryId:invPosted.entry.id, amount:invPosted.entry.totalDebit, date:'2026-10-01'});
  record('Full Chain','28. Full receipt posted, AR cleared', receipt.ok, JSON.stringify(receipt.clearing));

  const openItemsAfter = await api('accountant1','GET',`/api/ar/open-items?customerId=${customerId}`);
  const thisInvoiceCleared = openItemsAfter.items.find(i=>i.entryId===invPosted.entry.id)?.status==='Cleared';
  record('Full Chain','29. AR open item shows Cleared', thisInvoiceCleared, JSON.stringify(openItemsAfter.items.find(i=>i.entryId===invPosted.entry.id)));

  const readiness = await api('finance1','GET',`/api/projects/${projectId}/closure-readiness`);
  record('Full Chain','30. Project Closure Readiness — ALL conditions true (production/installation/QC/snags/handover/billing/receivables)', readiness.ok && readiness.readiness.allReady===true, JSON.stringify(readiness.readiness));
  const closeAttempt = await api('finance1','POST',`/api/projects/${projectId}/close`,{});
  record('Full Chain','31. Project closes cleanly — a real gated action, not a bare status flip', closeAttempt.ok && closeAttempt.project.status==='CLOSED', JSON.stringify(closeAttempt));

  // ============================================================
  // §29/§30 SECURITY & SoD
  // ============================================================
  const salesDispatch = await api('sales1','POST','/api/dispatches',{projectId:'PRJ-1', customerId:'CUST-1', items:[{materialId:'MAT-1',qty:1}]});
  record('Security','Sales cannot create a Dispatch (no dispatch role granted)', salesDispatch.status===403, JSON.stringify(salesDispatch));
  const pmUnrelatedDispatch = await api('pm1','POST','/api/dispatches',{projectId:'PRJ-2', customerId:'CUST-2', items:[{materialId:'MAT-1',qty:1}]});
  record('Security','ProjectManager cannot create a dispatch for an unassigned project', pmUnrelatedDispatch.status===403, JSON.stringify(pmUnrelatedDispatch));
  const accPay = await api('accountant1','POST','/api/ap/payment',{vendorId:'VEND-1', invoiceEntryId:'JE-0001', amount:1, date:'2026-09-01'});
  record('Security','Accountant still cannot pay (Phase 5 SoD unaffected by Phase 8)', accPay.status===403, JSON.stringify(accPay));
  const bmSelfInvoiceApprove = await api('sales1','GET',`/api/projects/${projectId}/closure-readiness`);
  record('Security','Sales cannot view project closure readiness (not GL/PM/Viewer-tier)', bmSelfInvoiceApprove.status===403, JSON.stringify(bmSelfInvoiceApprove));

  // ============================================================
  // §39 CONCURRENCY
  // ============================================================
  const raceDsp = await api('pm1','POST','/api/dispatches',{projectId, customerId, items:[{materialId:'MAT-1', qty:1}], dispatchDate:'2026-09-22'});
  const [dupReady1, dupReady2] = await Promise.all([
    api('pm1','POST',`/api/dispatches/${raceDsp.dispatch.id}/ready`), api('pm1','POST',`/api/dispatches/${raceDsp.dispatch.id}/ready`)
  ]);
  const readySuccesses = [dupReady1, dupReady2].filter(r=>r.ok).length;
  record('Concurrency','Two simultaneous "mark ready" calls on the same dispatch — only one succeeds (no double status transition)', readySuccesses===1, `1.ok=${dupReady1.ok} 2.ok=${dupReady2.ok}`);

  const raceHandoverProject = won.project.id; // already closed above — try 2 simultaneous handover creates on a fresh one instead
  const lead2 = await api('sales1','POST','/api/leads',{name:'Mr. Thomas Varghese', requirement:'Office cabin'});
  const er2 = await api('sales1','POST','/api/estimation-requests',{leadId:lead2.lead.id});
  const cost2 = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:er2.estimationRequest.id, overheadPct:10, profitPct:15, lines:[{category:'Material',qty:1,uom:'lot',rate:100000}]});
  const qtn2 = await api('sales1','POST','/api/quotations',{leadId:lead2.lead.id, estimationRequestId:er2.estimationRequest.id, costingVersionId:cost2.costingVersion.id, prospectName:'Mr. Thomas Varghese', discountPct:0});
  await api('sales1','POST',`/api/quotations/${qtn2.quotation.id}/submit`);
  await api('sales1','POST',`/api/quotations/${qtn2.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'Mr. Thomas Varghese'});
  const won2 = await api('finance1','POST',`/api/quotations/${qtn2.quotation.id}/won`,{projectManagerId:'U-PM1'});
  const [handoverRace1, handoverRace2] = await Promise.all([
    api('pm1','POST','/api/handovers',{projectId:won2.project.id, customerAcknowledgement:'race A', evidenceRef:'A'}),
    api('pm1','POST','/api/handovers',{projectId:won2.project.id, customerAcknowledgement:'race B', evidenceRef:'B'})
  ]);
  // Both may legitimately fail (no installation/QC done for this new project) OR both correctly blocked identically — the real test is that they do NOT produce inconsistent results (one blocked, one not, due to a race).
  const bothSameOutcome = handoverRace1.ok===handoverRace2.ok;
  record('Concurrency','Two simultaneous handover attempts on an unready project — both correctly blocked identically (no race-induced inconsistency)', bothSameOutcome && !handoverRace1.ok, `1.ok=${handoverRace1.ok} 2.ok=${handoverRace2.ok}`);

  // ============================================================
  // §22/§40 ACCOUNTING
  // ============================================================
  const recon = await api('accountant1','GET','/api/reconciliation');
  record('Accounting','AR reconciliation still MATCH', recon.ok && recon.ar.matches, JSON.stringify(recon.ar));
  record('Accounting','AP reconciliation still MATCH', recon.ok && recon.ap.matches, JSON.stringify(recon.ap));
  const tb = await api('accountant1','GET','/api/trial-balance');
  const d = Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0), c = Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0);
  record('Accounting','Trial Balance still balances', Math.abs(d-c)<0.01, `Dr=${d} Cr=${c}`);

  console.log('\n================ PHASE 8 LIVE TEST RESULTS ================\n');
  let pass=0, fail=0, lastSection=null;
  for(const r of results){
    if(r.section!==lastSection){ console.log('\n--- '+r.section+' ---'); lastSection=r.section; }
    console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | ${r.name}`);
    if(!r.pass) console.log('    detail: '+r.detail);
    r.pass ? pass++ : fail++;
  }
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${pass+fail} TOTAL ================\n`);
  process.exit(fail>0?1:0);
}
main().catch(e=>{ console.error('TEST HARNESS ERROR:', e); process.exit(2); });
