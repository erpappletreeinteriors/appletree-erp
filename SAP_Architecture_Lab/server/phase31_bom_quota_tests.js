'use strict';
// Phase 31 (follow-up to Phase 28/30) — permanent regression coverage for:
// (1) BOM-quota checking on Material Issue, mirroring the real offline Appletree ERP's own
//     established policy (over-quota requires manager authorization, not a silent pass/block);
// (2) Material Requirement -> Material Issue linkage ("issues are created through requests");
// (3) Production Order material issue remains exempt from its own BOM-derived quota (it IS the
//     quota, checking it against itself would be circular).
//
// Financial Reconciliation phase — §1's three self-service-overrideReason assertions were rewritten
// to test the CURRENT, correct BOM Governance behavior (project-level /api/bom-entitlement + a
// genuine, audited Excess Material Issue Approval with unconditional no-self-approval) instead of
// the self-service override bypass that phase deliberately removed. §2/§3 (Production Order
// exemption, Material Requirement linkage) are untouched and still test real, current behavior.
const BASE = 'http://localhost:4001';
const results = [];
function record(section, name, pass, detail){ results.push({section, name, pass, detail}); }
const jars = {};
async function login(u,p){ const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const sc=r.headers.get('set-cookie'); if(sc) jars[u]=sc.split(';')[0]; return r.json(); }
async function api(u,m,p,b){ const h={'Content-Type':'application/json'}; if(jars[u])h.Cookie=jars[u]; const r=await fetch(BASE+p,{method:m,headers:h,body:b?JSON.stringify(b):undefined}); return {status:r.status,...(await r.json().catch(()=>({})))}; }

async function main(){
  await login('admin','Admin@12345');
  await api('admin','POST','/api/test/reset');
  await Promise.all(['purchase1','pm1','finance1'].map(u=>login(u, {purchase1:'Pur@12345',pm1:'Pm@123456',finance1:'Fin@12345'}[u])));

  // ---- Setup: BOM budgeting 10 units of MAT-1 on PRJ-1 (2/unit x 5 planned) ----
  const bom = await api('admin','POST','/api/boms',{projectId:'PRJ-1', description:'Phase31 Quota BOM', lines:[{materialId:'MAT-1', qty:2, uom:'sheet', scrapPct:0}]});
  // BOM Governance phase added a real Submitted step between Draft and Approved (creator cannot
  // approve their own submitted BOM either, except CEO/Admin) — this script predates that and used
  // to call approve directly from Draft, which the new lifecycle correctly rejects. One-line fix,
  // per the BOM Governance implementation report's own disclosed follow-up item.
  await api('admin','POST',`/api/boms/${bom.bom.id}/submit`);
  await api('admin','POST',`/api/boms/${bom.bom.id}/approve`);
  const prod = await api('admin','POST','/api/production-orders',{projectId:'PRJ-1', bomId:bom.bom.id, plannedQty:5});
  const po = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-1', qty:30, rate:2800, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po.po.id}/submit`); await api('admin','POST',`/api/purchase-orders/${po.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:30,qtyRejected:0,uom:'sheet'}]});

  // ============================================================
  // §1 — BOM QUOTA
  // ============================================================
  const quota0 = await api('admin','GET','/api/bom-quota?projectId=PRJ-1&materialId=MAT-1');
  record('§1 BomQuota', 'Budget correctly computed as 10 (2 x 5 planned), zero used so far', quota0.ok && quota0.quota.budgetQty===10 && quota0.quota.usedQty===0, quota0.quota);

  // BOM Governance phase FIX (per the P0 Remediation report's disclosed follow-up item) — ordinary
  // (non-Production-Order) Material Issue is no longer gated by this Production-Order-derived
  // /api/bom-quota budget at all; it is gated by the SEPARATE, project-level /api/bom-entitlement
  // (projectBomEntitlement(), reading the BOM line's OWN approved qty directly), and the old
  // self-service overrideReason bypass for exceeding it is GONE — replaced by a genuine, audited
  // Excess Material Issue Approval (creator cannot approve their own request, no exceptions). These
  // three assertions used to test the OLD, since-removed behavior; they now test the CURRENT,
  // correct one, on a dedicated BOM+material combo (MAT-5 on PRJ-1) so they don't interfere with
  // this script's existing Production-Order-quota setup above (MAT-1, tested unchanged in §2 below).
  const bomEnt = await api('admin','POST','/api/boms',{projectId:'PRJ-1', description:'Phase31 Entitlement BOM', lines:[{materialId:'MAT-5', qty:2, uom:'pc', scrapPct:0}]});
  await api('admin','POST',`/api/boms/${bomEnt.bom.id}/submit`);
  await api('admin','POST',`/api/boms/${bomEnt.bom.id}/approve`);
  // Stock MAT-5 first (a fresh-seed DB has zero on-hand) — real PO+GRN, same pattern as MAT-1/MAT-2 above.
  const poMat5 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-5', qty:20, rate:150, uom:'pc'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poMat5.po.id}/submit`); await api('admin','POST',`/api/purchase-orders/${poMat5.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:poMat5.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:20,qtyRejected:0,uom:'pc'}]});
  const entitlement0 = await api('purchase1','GET','/api/bom-entitlement?projectId=PRJ-1&materialId=MAT-5');
  record('§1 BomQuota', 'Entitlement correctly computed from the BOM line itself (approvedQty=2, no Production Order involved)', entitlement0.ok && entitlement0.entitlement.totalAllowed===2 && entitlement0.entitlement.usedQty===0, entitlement0.entitlement);

  const withinQuota = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-5', qty:1, warehouseId:'WH-1', purpose:'within entitlement'});
  record('§1 BomQuota', 'Issuing 1 of 2 approved units succeeds with no approval needed', withinQuota.ok, withinQuota.value);

  const overNoApproval = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-5', qty:5, warehouseId:'WH-1', purpose:'over entitlement, no approval'});
  record('§1 BomQuota', 'Issuing past the remaining entitlement (1+5=6 > 2) with NO Excess Approval is BLOCKED', overNoApproval.status===400 && !overNoApproval.ok && overNoApproval.requiresExcessApproval===true, overNoApproval.error);

  const overWithOverrideReasonOnly = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-5', qty:5, warehouseId:'WH-1', purpose:'over entitlement, override only', overrideReason:'Rework required extra material'});
  record('§1 BomQuota', 'A bare overrideReason (no genuine Excess Approval) no longer bypasses the block — this is the exact control the BOM Governance phase closed', !overWithOverrideReasonOnly.ok, overWithOverrideReasonOnly.error);

  const xmiReq = await api('purchase1','POST','/api/excess-material-issue-requests',{projectId:'PRJ-1', materialId:'MAT-5', requestedQty:5, reason:'Phase31 regression — genuine excess approval flow'});
  record('§1 BomQuota', 'A genuine Excess Material Issue request can be raised for the same excess quantity', xmiReq.ok && xmiReq.excessRequest?.status==='Pending', xmiReq.excessRequest);
  const xmiId = xmiReq.excessRequest?.id;

  const selfApprove = await api('purchase1','POST',`/api/excess-material-issue-requests/${xmiId}/approve`);
  record('§1 BomQuota', 'The requester (Purchase) cannot approve their own Excess Material Issue request', !selfApprove.ok, selfApprove.error);

  // finance1 (FinanceManager) is not in PROC_CREATE_ROLES and cannot issue material AT ALL —
  // that's the existing, unrelated route-level RBAC (only Admin/CEO/Purchase/assigned-PM may) — but
  // FinanceManager DOES hold the 'approve' capability, so it is used here as the genuine second
  // approver, exactly matching the manager-tier/non-requester distinction the control requires.
  const genuineApprove = await api('finance1','POST',`/api/excess-material-issue-requests/${xmiId}/approve`);
  record('§1 BomQuota', 'A genuinely different, authorized approver (FinanceManager) can approve the request', genuineApprove.ok && genuineApprove.excessRequest?.status==='Approved', genuineApprove.excessRequest);

  const overQuotaWithOverride = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-5', qty:5, warehouseId:'WH-1', purpose:'over entitlement, approved', excessRequestId:xmiId});
  record('§1 BomQuota', 'Posting against the genuinely approved Excess Material Issue request succeeds', overQuotaWithOverride.ok, overQuotaWithOverride.value);

  const duplicateUse = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-5', qty:1, warehouseId:'WH-1', purpose:'duplicate use of consumed approval', excessRequestId:xmiId});
  record('§1 BomQuota', 'A second attempt to post against the SAME (now-Consumed) approval is BLOCKED', !duplicateUse.ok, duplicateUse.error);

  // Manager-tier (Admin) issuing past a DIFFERENT material's entitlement — confirms the SAME
  // unconditional no-self-approval rule applies even to Admin: raising AND approving your own
  // request is blocked regardless of role, exactly as the BOM Governance report specifies.
  const bomEnt2 = await api('admin','POST','/api/boms',{projectId:'PRJ-1', description:'Phase31 Entitlement BOM Admin', lines:[{materialId:'MAT-7', qty:1, uom:'sqft', scrapPct:0}]});
  await api('admin','POST',`/api/boms/${bomEnt2.bom.id}/submit`);
  await api('admin','POST',`/api/boms/${bomEnt2.bom.id}/approve`);
  const poMat7 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-7', qty:20, rate:80, uom:'sqft'}]});
  await api('purchase1','POST',`/api/purchase-orders/${poMat7.po.id}/submit`); await api('admin','POST',`/api/purchase-orders/${poMat7.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:poMat7.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:20,qtyRejected:0,uom:'sqft'}]});
  const xmiAdmin = await api('admin','POST','/api/excess-material-issue-requests',{projectId:'PRJ-1', materialId:'MAT-7', requestedQty:5, reason:'Admin self-approval regression check'});
  const adminSelfApprove = await api('admin','POST',`/api/excess-material-issue-requests/${xmiAdmin.excessRequest?.id}/approve`);
  record('§1 BomQuota', 'A manager-tier role (Admin) STILL cannot approve their own Excess Material Issue request — no role is exempt from this rule', !adminSelfApprove.ok, adminSelfApprove.error);

  const po1b = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-1', vendorId:'VEND-1', lines:[{materialId:'MAT-2', qty:20, rate:1000, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po1b.po.id}/submit`); await api('admin','POST',`/api/purchase-orders/${po1b.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po1b.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:20,qtyRejected:0,uom:'sheet'}]});
  const notInBom = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-2', qty:5, warehouseId:'WH-1', purpose:'not in bom'});
  record('§1 BomQuota', 'A material with no BOM line at all (MAT-2, never added to the test BOM) issues freely — no quota to check against, matching the real ERP\'s own "not in BOM, check with supervisor" WARNING-not-BLOCK behavior', notInBom.ok, notInBom.value);

  // ============================================================
  // §2 — PRODUCTION ORDER ISSUE IS EXEMPT FROM ITS OWN QUOTA
  // ============================================================
  const prodIssue = await api('admin','POST',`/api/production-orders/${prod.productionOrder.id}/issue-material`,{warehouseId:'WH-1'});
  record('§2 ProductionExempt', 'Production Order material issue (exactly the BOM-derived qty) succeeds without needing manager tier or an override — it IS the quota, not a request against it', prodIssue.ok, prodIssue.issues?.[0]?.movement);

  // ============================================================
  // §3 — MATERIAL REQUIREMENT -> MATERIAL ISSUE LINKAGE
  // ============================================================
  const mrq = await api('admin','POST','/api/material-requirements',{projectId:'PRJ-3', materialId:'MAT-3', qty:4, uom:'sheet'});
  await api('admin','POST',`/api/material-requirements/${mrq.requirement.id}/submit`);
  await api('admin','POST',`/api/material-requirements/${mrq.requirement.id}/approve`);
  const po3 = await api('purchase1','POST','/api/purchase-orders',{projectId:'PRJ-3', vendorId:'VEND-4', lines:[{materialId:'MAT-3', qty:10, rate:3500, uom:'sheet'}]});
  await api('purchase1','POST',`/api/purchase-orders/${po3.po.id}/submit`); await api('admin','POST',`/api/purchase-orders/${po3.po.id}/approve`);
  await api('purchase1','POST','/api/grns',{poId:po3.po.id, warehouseId:'WH-1', lines:[{qtyAccepted:10,qtyRejected:0,uom:'sheet'}]});

  const wrongProject = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-1', materialId:'MAT-3', qty:4, warehouseId:'WH-1', materialRequirementId:mrq.requirement.id});
  record('§3 RequirementLink', 'Issuing against a requirement from a DIFFERENT project is rejected', !wrongProject.ok, wrongProject.error);

  const notApproved = await api('admin','POST','/api/material-requirements',{projectId:'PRJ-3', materialId:'MAT-3', qty:2, uom:'sheet'});
  const draftAttempt = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-3', materialId:'MAT-3', qty:2, warehouseId:'WH-1', materialRequirementId:notApproved.requirement.id});
  record('§3 RequirementLink', 'Issuing against a Requirement that is not yet APPROVED (still DRAFT) is rejected', !draftAttempt.ok, draftAttempt.error);

  const fulfil = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-3', materialId:'MAT-3', qty:4, warehouseId:'WH-1', materialRequirementId:mrq.requirement.id});
  record('§3 RequirementLink', 'Issuing against the correct, APPROVED requirement succeeds', fulfil.ok, fulfil.value);
  record('§3 RequirementLink', 'The requirement is automatically marked CONVERTED (existing MR_STATUSES value, not invented) with the movement traceable', fulfil.ok && fulfil.fulfilledRequirement?.status==='CONVERTED' && fulfil.fulfilledRequirement?.issuedMovementId===fulfil.movement.id, fulfil.fulfilledRequirement);

  const doubleFulfil = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-3', materialId:'MAT-3', qty:1, warehouseId:'WH-1', materialRequirementId:mrq.requirement.id});
  record('§3 RequirementLink', 'A SECOND issue against the now-CONVERTED requirement is rejected — cannot double-fulfil the same request', !doubleFulfil.ok, doubleFulfil.error);

  const noRequirement = await api('purchase1','POST','/api/material-issues',{projectId:'PRJ-3', materialId:'MAT-3', qty:1, warehouseId:'WH-1'});
  record('§3 RequirementLink', 'An issue with NO requirement reference still works exactly as before (optional, not force-required)', noRequirement.ok, noRequirement.value);

  // ============================================================
  // §4 — WHOLE-LEDGER INTEGRITY AFTER ALL OF THE ABOVE
  // ============================================================
  const recon = await api('finance1','GET','/api/reconciliation');
  record('§4 Reconciliation', 'AP still reconciles after all Phase 31 activity', recon.ok && recon.ap.matches, recon.ap);
  const tb = await api('finance1','GET','/api/trial-balance');
  const tbDebit = Object.values(tb.byAccount).reduce((s,a)=>s+a.debit,0), tbCredit = Object.values(tb.byAccount).reduce((s,a)=>s+a.credit,0);
  record('§4 Reconciliation', 'Trial Balance Debit = Credit', Math.abs(tbDebit-tbCredit)<0.01, {debit:tbDebit, credit:tbCredit});

  const pass = results.filter(r=>r.pass).length, fail = results.length-pass;
  console.log('\n================ PHASE 31 — BOM QUOTA + MATERIAL REQUIREMENT LINKAGE ================\n');
  results.forEach(r=>console.log(`${r.pass?'✅ PASS':'❌ FAIL'} | [${r.section}] ${r.name}${r.pass?'':' | '+JSON.stringify(r.detail)}`));
  console.log(`\n================ ${pass} PASS / ${fail} FAIL / ${results.length} TOTAL ================\n`);
  if(fail>0) process.exit(1);
}
main().catch(e=>{ console.error('PHASE 31 TEST ERROR:', e); process.exit(2); });
