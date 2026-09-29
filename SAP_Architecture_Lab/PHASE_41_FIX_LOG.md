# PHASE 41 — Fix Log

**Date:** 2026-09-13 to 2026-09-14. Change-control record for the two code changes made this phase.

## Change 1 — DEF-P41-01 fix

**File:** `server/domain.js`, inside `createQuotation()` (~line 3252, immediately after the existing
`costing` lookup).

**Before:** no cross-reference validation existed between the three source-reference fields.

**After:**

```js
if(costing.estimationRequestId && estimationRequestId && costing.estimationRequestId!==estimationRequestId){
  return {ok:false, error:`Costing version "${costingVersionId}" belongs to Estimation Request "${costing.estimationRequestId}", not "${estimationRequestId}" — cannot create a quotation mixing costing from a different estimation.`};
}
if(estimationRequestId){
  const er = DB.estimationRequests.find(e=>e.id===estimationRequestId);
  if(er && leadId && er.leadId!==leadId){
    return {ok:false, error:`Estimation Request "${estimationRequestId}" belongs to Lead "${er.leadId}", not "${leadId}" — cannot create a quotation mixing an estimation from a different lead."`};
  }
}
```

**Rationale:** see `PHASE_41_DEFECT_REGISTER.md` (DEF-P41-01) for the full defect writeup. This
mirrors the existing project-vs-customer cross-check pattern already used in
`draftCustomerInvoice()` elsewhere in the same file — no new validation concept was introduced.

**Scope discipline:** this is the ONLY code change made in Phase 41. No new modules, no new UI
screens, no refactoring, and no policy changes were made — consistent with Section 0's constraint
and this baseline's own stated expectation that no code change was anticipated unless a genuine
defect was found.

**Verification:**
- Targeted test: mismatched references now correctly rejected (see Defect Register).
- Regression: legitimate references still succeed; full 300/300 (+2 documented) suite re-run clean —
  see `PHASE_41_REGRESSION_REPORT.md`.
- Browser re-verification: the full Lead→Won→Invoice chain still works end-to-end through the real
  UI after the fix — see `PHASE_41_ESTIMATION_QUOTATION_UAT.md`.

## Change 2 — DEF-P41-02 fix

**File:** `server/domain.js`, inside `projectDocumentTrace()` (~line 11651-11670).

**Before:** the function validated `projectId` inline (`if(!projectId || !DB.projects.find(...))`)
without keeping the found project record, then only ever forward-walked FROM the project through
documents that carry their own `projectId` field. It never read the project's own `leadId`/
`estimationRequestId`/`quotationId` fields.

**After:**

```js
function projectDocumentTrace(projectId){
  const proj = projectId ? DB.projects.find(p=>p.id===projectId) : null;
  if(!projectId || !proj) return {ok:false, error:'A valid project is required.'};
  const chain = [];
  if(proj.leadId){
    const lead = DB.leads.find(l=>l.id===proj.leadId);
    if(lead) chain.push({type:'Lead', doc:lead.id, date:lead.date||lead.createdAt?.slice(0,10), status:lead.status});
  }
  if(proj.estimationRequestId){
    const er = DB.estimationRequests.find(e=>e.id===proj.estimationRequestId);
    if(er) chain.push({type:'Estimation Request', doc:er.id, date:er.requestedDate||er.createdAt?.slice(0,10), status:er.status, previous: proj.leadId});
    DB.costingVersions.filter(c=>c.estimationRequestId===proj.estimationRequestId).forEach(c=>{
      chain.push({type:'Costing Version', doc:c.id, date:c.createdAt?.slice(0,10), status:`Version ${c.version}`, previous: er?er.id:undefined, amount:c.sellingPrice});
    });
  }
  if(proj.quotationId){
    const q = DB.quotations.find(x=>x.id===proj.quotationId);
    if(q) chain.push({type:'Quotation', doc:q.quotationNo||q.id, date:q.date, status:q.status, previous: proj.costingVersionId || (q.costingVersionId) || proj.estimationRequestId || proj.leadId, amount:q.finalPrice});
  }
  // ...existing forward-walk blocks (Purchase Requisition/PO/GRN/Bill, Payment Requests, AR/AP
  // settlement, Site Material, Site Consumption, Job Work Orders) unchanged below this point.
```

**Rationale:** see `PHASE_41_DEFECT_REGISTER.md` (DEF-P41-02) for the full defect writeup. This
mirrors the existing Phase 40 §18 AR/AP settlement block already present later in the SAME function —
purely additive, read-only trace-walking off fields that already existed on the Project record
(`wonTransition()` has stamped them there since before this engagement began).

**Scope discipline:** exactly one function touched, no new data structures, no schema change, no UI
change. Found only because Section 19's own instruction explicitly required checking quotation-side
tracing this time — not speculative feature work.

**Verification:**
- Targeted test: a real, live Lead→Estimation Request→Costing Version→Quotation→Won→Project→Invoice
  chain (`LEAD-0002`/`ER-0001`/`COST-0001`/`QTN-0001`/`PRJ-007`/`INV/2026-27/0001`) now traces in
  full, correct order — see Defect Register for the exact before/after API responses.
- Regression: full 300/300 (+2 documented) suite re-run clean after this fix, identical count to
  before — see `PHASE_41_REGRESSION_REPORT.md`. Confirmed via source search that zero existing test
  files reference `document-trace` or `projectDocumentTrace`, so no pre-existing assertion could have
  been (and none was) broken by the added chain entries.

## Scope discipline — both changes together

These are the ONLY two code changes made in Phase 41. No new modules, no new UI screens, no
refactoring, and no policy changes were made — consistent with Section 0's constraint and this
baseline's own stated expectation that no code change was anticipated unless a genuine defect was
found. Both changes were found through the phase's own mandated testing (Section 6 negative tests for
DEF-P41-01; Section 19's explicit quotation-side-tracing instruction for DEF-P41-02), not through
speculative searching for defects beyond the brief's scope.

## No other changes

No changes were made to `server.js` or `client_secure/index.html` in Phase 41. All other files
touched this phase (`PHASE_41_*.md` reports) are documentation only.
