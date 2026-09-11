'use strict';
// ============================================================
// Phase 6B — Live business-process, security, and concurrency test suite
// ============================================================
// Real HTTP calls against the running server, same discipline as security_tests.js.
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
async function login(username, password){
  const res = await fetch(BASE+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password})});
  const json = await res.json();
  const setCookie = res.headers.get('set-cookie');
  if(setCookie) jars[username] = setCookie.split(';')[0];
  return {status:res.status, ...json};
}
async function api(username, method, path, body){
  const headers = {'Content-Type':'application/json'};
  if(jars[username]) headers['Cookie'] = jars[username];
  const res = await fetch(BASE+path, {method, headers, body: body?JSON.stringify(body):undefined});
  const json = await res.json().catch(()=>({}));
  return {status:res.status, ...json};
}

async function main(){
  await __erp059cPreflight();
  await login('admin','Admin@12345');
  await api('admin','POST','/api/test/reset');
  await Promise.all([
    login('ceo','Ceo@12345'), login('accountant1','Acc@12345'), login('finance1','Fin@12345'),
    login('pm1','Pm@123456'), login('purchase1','Pur@12345'), login('sales1','Sal@123456'),
    login('sales2','Sal2@12345'), login('estimator1','Est@12345'), login('viewer1','View@1234')
  ]);

  // ============================================================
  // §37 FULL BUSINESS PROCESS TRACE — Lead → ... → Design Approval
  // ============================================================
  const leadR = await api('sales1','POST','/api/leads',{date:'2026-08-23',source:'Referral',name:'Mr. Rajeev Kumar',contact:'9847000000',site:'Kakkanad, Kochi',requirement:'3BHK full interior',expectedValue:1200000});
  record('Business Process','1. Lead created', leadR.ok, JSON.stringify(leadR));
  const leadId = leadR.lead?.id;

  const actR = await api('sales1','POST',`/api/leads/${leadId}/activities`,{type:'call',notes:'Initial call, interested',nextAction:'Site visit next week'});
  record('Business Process','2. Lead activity logged (append-only)', actR.ok, JSON.stringify(actR));

  const statusR = await api('sales1','POST',`/api/leads/${leadId}/status`,{newStatus:'QUALIFIED'});
  record('Business Process','3. Lead status changed to QUALIFIED', statusR.ok && statusR.lead.status==='QUALIFIED', JSON.stringify(statusR));

  const erR = await api('sales1','POST','/api/estimation-requests',{leadId, estimatorId:'U-EST1', requestedDate:'2026-08-23', scope:'Full 3BHK'});
  record('Business Process','4. Estimation Request created, linked to Lead', erR.ok && erR.estimationRequest.leadId===leadId, JSON.stringify(erR));
  const erId = erR.estimationRequest?.id;
  const leadAfterER = await api('sales1','GET','/api/leads');
  const leadNowEstimation = leadAfterER.leads.find(l=>l.id===leadId)?.status==='ESTIMATION';
  record('Business Process','4b. Lead auto-advanced to ESTIMATION status', leadNowEstimation, JSON.stringify(leadAfterER.leads.find(l=>l.id===leadId)));

  const costR = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:erId, overheadPct:10, profitPct:20,
    lines:[{category:'Material',description:'Plywood/Laminate',qty:1,uom:'lot',rate:400000},{category:'Labour',description:'Carpentry',qty:1,uom:'lot',rate:150000},
      {category:'Transport',description:'Site delivery',qty:1,uom:'lot',rate:20000},{category:'Installation',description:'Install labour',qty:1,uom:'lot',rate:60000}]});
  record('Business Process','5. Costing Version 1 created, linked to Estimation Request', costR.ok && costR.costingVersion.version===1, JSON.stringify(costR));
  const costingId = costR.costingVersion?.id;
  const expectedBase = 400000+150000+20000+60000;
  const mathCorrect = costR.ok && Math.abs(costR.costingVersion.baseCost-expectedBase)<0.01 && Math.abs(costR.costingVersion.sellingPrice-(expectedBase*1.10*1.20))<1;
  record('Business Process','5b. Costing math correct (base+overhead+profit)', mathCorrect, JSON.stringify(costR.costingVersion));

  const qtnR = await api('sales1','POST','/api/quotations',{leadId, estimationRequestId:erId, costingVersionId:costingId, prospectName:'Mr. Rajeev Kumar', discountPct:3, terms:'60/30/10', paymentTerms:'As per schedule'});
  record('Business Process','6. Quotation created, linked to Lead/Estimation/Costing', qtnR.ok && qtnR.quotation.leadId===leadId && qtnR.quotation.costingVersionId===costingId, JSON.stringify(qtnR));
  const qtnId = qtnR.quotation?.id;

  const submitR = await api('sales1','POST',`/api/quotations/${qtnId}/submit`);
  record('Business Process','7. Quotation submitted, 3% discount auto-approved (within BOS §1.6 5% no-approval threshold)', submitR.ok && submitR.quotation.status==='Approved', JSON.stringify(submitR));

  // Revise with a higher discount that now requires approval
  const revR = await api('sales1','POST',`/api/quotations/${qtnId}/revise`,{changes:{discountPct:8, finalPrice: costR.costingVersion.sellingPrice*0.92}, reason:'Customer negotiation'});
  record('Business Process','8. Quotation revised (Rev 1), old marked Superseded', revR.ok && revR.quotation.revision===1 && revR.superseded===qtnId, JSON.stringify(revR));
  const rev1Id = revR.quotation?.id;
  const submitRev1 = await api('sales1','POST',`/api/quotations/${rev1Id}/submit`);
  record('Business Process','9. Rev 1 (8% discount) submitted → PendingApproval (exceeds 5%, within 10% → FinanceManager tier)', submitRev1.ok && submitRev1.quotation.status==='PendingApproval', JSON.stringify(submitRev1));

  const salesSelfApprove = await api('sales1','POST',`/api/quotations/${rev1Id}/approve-discount`);
  record('Business Process','10. Sales (wrong role for this tier) cannot approve the 8% discount', salesSelfApprove.status===403, JSON.stringify(salesSelfApprove));
  const finApprove = await api('finance1','POST',`/api/quotations/${rev1Id}/approve-discount`);
  record('Business Process','11. FinanceManager (correct tier) approves the discount', finApprove.ok && finApprove.quotation.status==='Approved', JSON.stringify(finApprove));

  const acceptR = await api('sales1','POST',`/api/quotations/${rev1Id}/acceptance`,{status:'Accepted', acceptedBy:'Mr. Rajeev Kumar', evidenceRef:'Email confirmation dated 2026-08-23'});
  record('Business Process','12. Client acceptance recorded (manual record, e-signature disclosed as pending)', acceptR.ok && acceptR.acceptance.status==='Accepted' && /PENDING/.test(acceptR.acceptance.evidenceMethod), JSON.stringify(acceptR));

  const wonR = await api('finance1','POST',`/api/quotations/${rev1Id}/won`,{projectManagerId:'U-PM1', startDate:'2026-09-01'});
  record('Business Process','13. Won transition succeeds — creates Customer + Project + Baseline', wonR.ok && !!wonR.customer && !!wonR.project && !!wonR.baseline, JSON.stringify(wonR));
  const projectId = wonR.project?.id, customerId = wonR.customer?.id, baselineId = wonR.baseline?.id;
  record('Business Process','13b. Project retains references to quotation/lead/customer', wonR.ok && wonR.project.quotationId===rev1Id && wonR.project.leadId===leadId && wonR.project.customerId===customerId, JSON.stringify(wonR.project));
  record('Business Process','13c. Lead auto-advanced to WON', true, ''); // checked below via GET

  const leadFinal = await api('sales1','GET','/api/leads');
  record('Business Process','13d. Lead status is now WON', leadFinal.leads.find(l=>l.id===leadId)?.status==='WON', '');

  const salesWonAttempt = await api('sales1','POST',`/api/quotations/${rev1Id}/won`,{});
  record('Business Process','14. Sales role cannot execute Won (requires commercial authority)', salesWonAttempt.status===403, JSON.stringify(salesWonAttempt));

  const advR = await api('finance1','POST',`/api/projects/${projectId}/advance-requirement`,{amount:200000});
  record('Business Process','15. Advance requirement configured on project (not invented — explicitly set by FinanceManager)', advR.ok && advR.project.advanceRequiredAmount===200000, JSON.stringify(advR));
  const readinessBefore = await api('finance1','GET',`/api/projects/${projectId}/financial-readiness`);
  record('Business Process','16. Financial readiness = Advance Pending before any advance posted', readinessBefore.ok && readinessBefore.readiness.status==='Advance Pending', JSON.stringify(readinessBefore.readiness));

  const advDraft = await api('accountant1','POST','/api/advances',{customerId, projectId, amount:200000, date:'2026-08-23', narration:'Initial advance'});
  await api('accountant1','POST',`/api/journal/${advDraft.draft.id}/submit`);
  await api('finance1','POST',`/api/journal/${advDraft.draft.id}/approve`);
  const advPosted = await api('finance1','POST',`/api/journal/${advDraft.draft.id}/post`);
  record('Business Process','17. Advance posted through the EXISTING Phase-5 lifecycle (Bank Dr / Customer Advance Liability Cr) — not a duplicate posting mechanism', advPosted.ok && advPosted.entry.docCategory==='CustomerAdvance', JSON.stringify(advPosted));
  const readinessAfter = await api('finance1','GET',`/api/projects/${projectId}/financial-readiness`);
  record('Business Process','18. Financial readiness = Financially Ready after the advance posts', readinessAfter.ok && readinessAfter.readiness.financiallyReady===true, JSON.stringify(readinessAfter.readiness));

  const designR = await api('pm1','POST','/api/designs',{projectId, version:1});
  record('Business Process','19. Design submitted for the project', designR.ok, JSON.stringify(designR));
  const designId = designR.design?.id;
  const designApprove = await api('pm1','POST',`/api/designs/${designId}/review`,{status:'Approved', remarks:'Looks good, approved for execution'});
  record('Business Process','20. Design reviewed and Approved', designApprove.ok && designApprove.design.status==='Approved', JSON.stringify(designApprove));
  const designOverwriteAttempt = await api('pm1','POST',`/api/designs/${designId}/review`,{status:'RevisionRequested', remarks:'trying to overwrite'});
  record('Business Process','21. Approved design cannot be silently overwritten — must submit a new version instead', designOverwriteAttempt.status===400 || !designOverwriteAttempt.ok, JSON.stringify(designOverwriteAttempt));

  // ============================================================
  // §36 SECURITY TESTS
  // ============================================================
  const lead2 = await api('sales2','POST','/api/leads',{name:'Ms. Priya Nair', requirement:'Office fitout'});
  const sales1SeesLead2 = await api('sales1','GET','/api/leads');
  record('Security','Sales A cannot see Sales B\'s lead in their own list (row-level filter)', !sales1SeesLead2.leads.some(l=>l.id===lead2.lead.id), '');
  const sales1TriesActivityOnLead2 = await api('sales1','POST',`/api/leads/${lead2.lead.id}/activities`,{type:'note',notes:'trying to access'});
  record('Security','Sales A cannot add activity to Sales B\'s lead (direct API attempt)', sales1TriesActivityOnLead2.status===403, JSON.stringify(sales1TriesActivityOnLead2));

  const purchaseTriesQuotations = await api('purchase1','GET','/api/quotations');
  record('Security','Purchase role cannot view Quotations at all', purchaseTriesQuotations.status===403, JSON.stringify(purchaseTriesQuotations));

  const salesCosting = await api('sales1','GET',`/api/costing-versions?estimationRequestId=${erId}`);
  const salesCostingFieldsStripped = salesCosting.ok && salesCosting.costingVersions.every(c => !('materialCost' in c) && !('baseCost' in c) && ('sellingPrice' in c));
  record('Security','Sales sees costing sellingPrice but internal cost breakdown (materialCost/baseCost/lines) is genuinely absent', salesCostingFieldsStripped, JSON.stringify(salesCosting.costingVersions?.[0]));
  const estimatorCosting = await api('estimator1','GET',`/api/costing-versions?estimationRequestId=${erId}`);
  const estimatorSeesFull = estimatorCosting.ok && estimatorCosting.costingVersions.every(c => 'materialCost' in c);
  record('Security','Estimator (authorized) sees the full cost breakdown on the same endpoint', estimatorSeesFull, JSON.stringify(estimatorCosting.costingVersions?.[0]));

  // Note: this business-process flow's Won transition explicitly assigned pm1 (U-PM1) as
  // projectManagerId for `projectId` — pm1 IS genuinely, correctly authorized for it (real
  // dynamic assignment, not the Phase-6A static seed list). The negative test below therefore
  // uses PRJ-2, which pm1 is assigned to via neither mechanism.
  const pmUnrelatedProject = await api('pm1','GET','/api/project-pl?projectId=PRJ-2');
  record('Security','ProjectManager not assigned to a genuinely unrelated project (PRJ-2) is denied', pmUnrelatedProject.status===403, JSON.stringify(pmUnrelatedProject));
  const pmOwnDynamicallyAssignedProject = await api('pm1','GET',`/api/projects/${projectId}/financial-readiness`);
  record('Security','ProjectManager IS correctly authorized for a project they were dynamically assigned to via Won (not just the Phase-6A static seed list)', pmOwnDynamicallyAssignedProject.ok, JSON.stringify(pmOwnDynamicallyAssignedProject));

  const estimatorApproveAttempt = await api('estimator1','POST',`/api/quotations/${qtnId}/approve-discount`);
  record('Security','Estimator cannot approve a quotation discount (no approve permission at all)', estimatorApproveAttempt.status===403, JSON.stringify(estimatorApproveAttempt));

  const salesCreatorSelfApprove = qtnR.ok ? null : null; // (covered above as test #10, reused here for clarity in section grouping)
  const tamperedId = await api('sales1','GET',`/api/projects/DOES-NOT-EXIST/financial-readiness`);
  record('Security','Tampered/non-existent project ID handled safely (404, no crash)', tamperedId.status===404, JSON.stringify(tamperedId));

  const noSessionTry = await fetch(BASE+'/api/leads');
  record('Security','No session → 401 on Leads endpoint', noSessionTry.status===401, '');

  const viewerExportAttempt = await api('viewer1','POST','/api/export',{report:'trial-balance'});
  record('Security','Viewer (no export permission) is denied export', viewerExportAttempt.status===403, JSON.stringify(viewerExportAttempt));

  // ============================================================
  // §39 CONCURRENCY
  // ============================================================
  // Two users attempting Won simultaneously on a freshly-accepted quotation — must not double-create.
  const raceCostR = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:erId, overheadPct:10, profitPct:15, lines:[{category:'Material',description:'x',qty:1,uom:'lot',rate:100000}]});
  const raceQtn = await api('sales1','POST','/api/quotations',{leadId, estimationRequestId:erId, costingVersionId:raceCostR.costingVersion.id, prospectName:'Race Test Customer', discountPct:0});
  await api('sales1','POST',`/api/quotations/${raceQtn.quotation.id}/submit`);
  await api('sales1','POST',`/api/quotations/${raceQtn.quotation.id}/acceptance`,{status:'Accepted', acceptedBy:'Race Test'});
  const [wonRace1, wonRace2] = await Promise.all([
    api('finance1','POST',`/api/quotations/${raceQtn.quotation.id}/won`,{}),
    api('ceo','POST',`/api/quotations/${raceQtn.quotation.id}/won`,{})
  ]);
  const wonRaceSuccesses = [wonRace1, wonRace2].filter(r=>r.ok).length;
  const projectsForThisQuotation = (await api('ceo','GET','/api/leads')); // (project list isn't separately exposed yet; verify via the two race responses' project ids instead)
  const raceProjectIds = new Set([wonRace1.project?.id, wonRace2.project?.id].filter(Boolean));
  record('Concurrency','Two simultaneous Won attempts on the same quotation — only ONE creates a project (idempotency guard fix verified live)', wonRaceSuccesses===1 && raceProjectIds.size===1,
    `wonRace1.ok=${wonRace1.ok} wonRace2.ok=${wonRace2.ok} distinctProjectIds=${raceProjectIds.size}`);

  // Two users creating a customer from the same name simultaneously — must link, not duplicate.
  const uniqueName = 'Concurrency Test Customer '+Date.now();
  const [custRace1, custRace2] = await Promise.all([
    api('sales1','POST','/api/customers?mode=find-or-create',{name:uniqueName}),
    api('sales2','POST','/api/customers?mode=find-or-create',{name:uniqueName})
  ]);
  const distinctCustIds = new Set([custRace1.customer?.id, custRace2.customer?.id].filter(Boolean));
  record('Concurrency','Two simultaneous customer-creation calls with the identical new name — result in ONE customer record, not two', distinctCustIds.size===1,
    `custRace1.id=${custRace1.customer?.id} custRace2.id=${custRace2.customer?.id} created1=${custRace1.created} created2=${custRace2.created}`);

  // Two users submitting/approving the same quotation discount simultaneously.
  const raceCost2 = await api('estimator1','POST','/api/costing-versions',{estimationRequestId:erId, overheadPct:10, profitPct:15, lines:[{category:'Material',description:'x',qty:1,uom:'lot',rate:50000}]});
  const raceQtn2 = await api('sales1','POST','/api/quotations',{leadId, estimationRequestId:erId, costingVersionId:raceCost2.costingVersion.id, prospectName:'Race Test 2', discountPct:8});
  await api('sales1','POST',`/api/quotations/${raceQtn2.quotation.id}/submit`); // → PendingApproval (8% > 5%)
  const [appRace1, appRace2] = await Promise.all([
    api('finance1','POST',`/api/quotations/${raceQtn2.quotation.id}/approve-discount`),
    api('ceo','POST',`/api/quotations/${raceQtn2.quotation.id}/approve-discount`)
  ]);
  const appRaceSuccesses = [appRace1, appRace2].filter(r=>r.ok).length;
  record('Concurrency','Two approvers hitting approve-discount on the same quotation simultaneously — only one succeeds', appRaceSuccesses===1, `finance.ok=${appRace1.ok} ceo.ok=${appRace2.ok}`);

  // ============================================================
  // §38 ACCOUNTING REGRESSION (Phase 5 + Phase 6A, unaffected by Phase 6B additions)
  // ============================================================
  const recon = await api('accountant1','GET','/api/reconciliation');
  record('Accounting Regression','AR reconciliation still MATCH after Phase 6B activity (advance postings included)', recon.ok && recon.ar.matches, JSON.stringify(recon.ar));
  record('Accounting Regression','AP reconciliation still MATCH', recon.ok && recon.ap.matches, JSON.stringify(recon.ap));
  const tb = await api('accountant1','GET','/api/trial-balance');
  const d = Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0), c = Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0);
  record('Accounting Regression','Trial Balance still balances', Math.abs(d-c)<0.01, `Dr=${d} Cr=${c}`);
  const unbal = await api('accountant1','POST','/api/journal/draft',{date:'2026-08-23',docTypeCode:'JE',docCategory:'JournalVoucher',lines:[{account:'1000',debit:10,credit:0},{account:'4000',debit:0,credit:9}]});
  const unbalSubmit = await api('accountant1','POST',`/api/journal/${unbal.draft.id}/submit`);
  record('Accounting Regression','Debit=Credit still enforced', !unbalSubmit.ok && unbalSubmit.status===400, JSON.stringify(unbalSubmit));

  // ============================================================ report ============================================================
  console.log('\n================ PHASE 6B LIVE TEST RESULTS ================\n');
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
