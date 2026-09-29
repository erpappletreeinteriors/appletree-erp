'use strict';
// ============================================================
// Phase 6A — Application/API Server (the trusted authorization layer)
// ============================================================
// Every sensitive read and every mutation is authorized HERE, server-side,
// before the domain layer (domain.js) is ever called. The client (client_secure/
// index.html) is a thin presentation layer — it holds no DB, filters nothing
// itself, and cannot bypass any check below by editing its own JavaScript,
// because none of the enforcement logic runs in the browser.
//
// No framework (Express etc.) — Node's built-in http module only, per §4's
// "simplest architecture that provides genuine enforcement" instruction, and
// to keep this dependency-free / fully offline-capable (no npm install needed).
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const D = require('./domain');
const A = require('./auth');

// ERP-059C — explicit environment identity (see docs/erp-remediation/phases/
// ERP-059C-TEST-ISOLATION-REPORT.md for the full incident this responds to). No environment
// variable existed anywhere in this codebase before this phase — PORT was a bare literal and every
// destructive test-only endpoint below was gated ONLY by the Admin role, which is an ordinary
// production role, not a test/production distinction. APP_ENV is the new, single source of truth
// for that distinction. FAILS CLOSED BY DESIGN: destructive test endpoints require the literal
// string 'test' — an absent APP_ENV, an unrecognized value, or 'development'/'production' all
// disable them identically. This is deliberate, not an oversight: a bypass for "localhost" or for
// "development" would recreate exactly the failure class this phase exists to close (the incident
// server was itself a normal, unflagged, localhost-bound Node process — indistinguishable from a
// disposable test server by port or address alone).
const APP_ENV = process.env.APP_ENV || 'production';
const IS_TEST_ENV = APP_ENV === 'test';
// PORT may still be overridden (needed so isolated test servers can be started without editing this
// file), but the default is unchanged from before this phase — existing production deployments that
// never set PORT keep listening on 4001 exactly as before.
const PORT = process.env.PORT ? Number(process.env.PORT) : 4001;
const CLIENT_DIR = path.join(__dirname, '..', 'client_secure');

// ---------- helpers ----------
function readBody(req){
  return new Promise((resolve,reject)=>{
    let data='';
    req.on('data', c=>{ data+=c; if(data.length>2_000_000) req.destroy(); });
    req.on('end', ()=>{ try{ resolve(data?JSON.parse(data):{}); }catch(e){ resolve({}); } });
    req.on('error', reject);
  });
}
function sendJson(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Content-Length':Buffer.byteLength(body)});
  res.end(body);
}
function parseCookies(req){
  const h = req.headers.cookie || '';
  const out = {};
  h.split(';').forEach(p=>{ const i=p.indexOf('='); if(i>-1) out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim()); });
  return out;
}
function getActor(req){
  const token = parseCookies(req).sid;
  const s = A.getSession(token);
  if(!s) return null;
  A.touchSession(token);
  const user = D.DB.users.find(u=>u.id===s.userId && u.active);
  if(!user) return null;
  // Phase 15 §8 DEFECT FOUND & FIXED: `assignedBranches` was never included here, so
  // `D.branchAllowed(actor, branchId)` would always see `undefined` and silently permit every
  // branch regardless of what was actually set on the user record — the restriction was
  // structurally unreachable, not merely unused.
  return { id:user.id, username:user.username, role:user.role, name:user.name, assignedProjects:user.assignedProjects, assignedCustomers:user.assignedCustomers, assignedBranches:user.assignedBranches, token };
}
// Phase 24 §5/§6 — moved to domain.js (D.can) so postDraft()/reverseEntry() can enforce this same
// rule internally. This alias keeps all 99 existing call sites below unchanged.
const can = D.can;
function isGLVisible(actor){ return D.GL_VISIBLE_ROLES.has(actor.role) || actor.role==='Viewer'; }
// Phase 24 §1/§5 — moved to domain.js (D.isProjectManagerOf) so there is exactly ONE authoritative
// definition callable from both the route layer AND the domain layer (createMaterialIssue() now
// enforces its own authorization internally and needs this same check). This alias keeps all 54
// existing call sites below unchanged.
const isProjectManagerOf = D.isProjectManagerOf;
function deny(res, code, reason, ctx){
  D.logAudit({type:'AccessDenied', reason, ...ctx});
  sendJson(res, code, {ok:false, error:reason});
}
// ERP-059C — the environment guard for every destructive test-only endpoint. Deliberately NOT
// implemented as a plain deny() call: deny() writes its audit entry via a direct D.logAudit() BEFORE
// the response is sent, and every one of these endpoints is a legacy-dispatched mutating route
// reached from inside the outer D.withTransaction() wrapper in the server's request handler — so a
// direct logAudit() here would itself be silently rolled back on rejection, the exact defect class
// ERP-059B closed for the 12 business-rule sites (see ERP-059B-TRANSACTION-DESIGN.md). Reusing that
// same durableFailureAudit mechanism here means this rejection's audit record survives the rollback
// by the same, already-proven construction: the field rides on the JSON response body itself, which
// the legacy-dispatch wrapper now forwards verbatim as the transaction result (see the
// ERP-059B res.end capture fix a few hundred lines below). No new mechanism, no secrets in the
// payload (path + configured APP_ENV only — matches the security contract every other
// durableFailureAudit site already follows).
function denyDestructiveTestEndpoint(res, actor, pathname){
  const reason = `Destructive test endpoint "${pathname}" is disabled outside APP_ENV=test (current APP_ENV: "${APP_ENV}").`;
  sendJson(res, 403, {
    ok:false,
    error:reason,
    durableFailureAudit:{ type:'DestructiveTestEndpointBlocked', path:pathname, appEnv:APP_ENV }
  });
}
// ============================================================
// Phase 21 — Mutation Route Registry. A route registered THROUGH this function cannot omit
// permission, an explicit idempotency decision, or an explicit audit-on-rejection decision — the
// registration call itself throws at server startup if any is missing, turning a missing
// declaration into a crash-on-boot rather than a silent gap an audit finds later. This does NOT
// retrofit the ~250 pre-existing routes handled directly in handleRequest() below (that migration
// is a separate, much larger undertaking, not attempted this phase) — it is proven here against
// exactly one new route, added for this proof and then removed, mirroring how Phase 20's
// naive-developer route was built and removed.
//
// HONEST SCOPE: this closes RBAC, idempotency, and audit-on-rejection for anything registered
// through it. It does NOT — and structurally cannot — force the handler function itself to
// validate its numeric inputs, check referenced IDs, respect period control, or manage status
// correctly. Those remain the handler author's responsibility, same as before. See the Phase 21
// report for the control-by-control breakdown of what this does and does not solve.
const _mutationRoutes = [];
// Phase 22 EXTENSION — real migration surfaced a second, equally real authorization idiom
// already used by several existing routes: an explicit role allow-list (e.g. only
// Admin/CEO/FinanceManager/Accountant may create a Credit Note) rather than the generic
// can(actor,'action') permission-tag check. Both are legitimate, explicit, mandatory
// declarations — the wrapper now requires EXACTLY ONE of them, not a new third abstraction that
// would risk silently changing which roles are actually authorized for these routes.
// Phase 23 EXTENSION — real migration of the routes Phase 22 deliberately deferred surfaced a
// THIRD authorization idiom: a fully custom compound condition with no single base permission at
// all (e.g. /api/material-issues: ProjectManager-of-THIS-project OR a procurement role — an OR of
// two different rule types, not a role list and not a can() tag). `authCheck` covers that case.
// Separately, some routes have a real base permission PLUS an additional business-scoping rule
// layered on top (e.g. /api/ar/invoice: can(actor,'create') AND, only for Sales, the customer
// must be in their assigned list). `extraCheck` covers that case — it runs only after the base
// check already passed, and is never a substitute for it. This is the explicit mechanism Part 4
// requires: "A AND B AND C" must not collapse into "A" — every clause is now its own declared,
// mandatory, centrally-enforced function, not folded away for convenience.
// Phase 24 §8 — parameterized path support. A route path segment written as ":name" becomes a
// capturing group; every other segment is matched LITERALLY (regex-escaped, so a segment like
// "opening-balance" cannot accidentally behave as a pattern). The whole path is anchored with
// ^...$ so neither a missing trailing segment nor an extra one can match, and each segment
// requires at least one non-"/" character so an empty parameter ("//post") is never accepted.
// This intentionally does NOT support wildcards, optional segments, or regex-in-path — only exact
// literal segments and single ":name" parameters — precisely so a "similar-looking" route
// ("/api/journal-drafts/:id/post" vs "/api/journal/:id/post") cannot cross-match: literal segments
// must match character-for-character, not merely share a prefix.
function compileRoutePattern(routePath){
  const paramNames = [];
  const segments = routePath.split('/').map(seg=>{
    if(seg.startsWith(':')){
      if(seg.length<2) throw new Error(`registerMutationRoute: path "${routePath}" has an empty parameter name.`);
      paramNames.push(seg.slice(1));
      return '([^/]+)';
    }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { regex: new RegExp('^'+segments.join('/')+'$'), paramNames };
}
function registerMutationRoute({method, path: routePath, permission, roles, authCheck, extraCheck, idempotent, auditReject, handler}){
  if(!method || !routePath) throw new Error('registerMutationRoute: method and path are required.');
  const baseCount = [permission, roles, authCheck].filter(x=>x!==undefined).length;
  if(baseCount===0) throw new Error(`registerMutationRoute: route "${method} ${routePath}" declares no permission, roles, or authCheck — registration refused.`);
  if(baseCount>1) throw new Error(`registerMutationRoute: route "${method} ${routePath}" declares more than one of permission/roles/authCheck — ambiguous, registration refused.`);
  if(roles && (!Array.isArray(roles) || !roles.length)) throw new Error(`registerMutationRoute: route "${method} ${routePath}" roles must be a non-empty array — registration refused.`);
  if(authCheck && typeof authCheck!=='function') throw new Error(`registerMutationRoute: route "${method} ${routePath}" authCheck must be a function — registration refused.`);
  if(extraCheck && typeof extraCheck!=='function') throw new Error(`registerMutationRoute: route "${method} ${routePath}" extraCheck must be a function — registration refused.`);
  if(idempotent===undefined) throw new Error(`registerMutationRoute: route "${method} ${routePath}" must explicitly set idempotent:true or idempotent:false — registration refused.`);
  if(auditReject===undefined) throw new Error(`registerMutationRoute: route "${method} ${routePath}" must explicitly set auditReject:true or auditReject:false — registration refused.`);
  if(typeof handler!=='function') throw new Error(`registerMutationRoute: route "${method} ${routePath}" has no handler function — registration refused.`);
  const isParameterized = routePath.includes('/:');
  const compiled = isParameterized ? compileRoutePattern(routePath) : null;
  _mutationRoutes.push({method, path:routePath, permission, roles, authCheck, extraCheck, idempotent, auditReject, handler,
    _regex: compiled && compiled.regex, _paramNames: compiled && compiled.paramNames});
}
// Returns {route, params} on match, or null. Exact-path routes (the common case) are matched with
// a plain string comparison, same cost as before Phase 24; only routes declared with a ":name"
// segment pay for a regex test. Captured segments are decodeURIComponent'd defensively (an
// already-decoded plain ID like "JE-0391" round-trips through this as a no-op) — a malformed
// percent-encoding throws inside decodeURIComponent, which is caught and treated as NO match
// rather than a 500, so a broken encoded parameter is rejected the same as any other bad path.
function matchMutationRoute(method, pathname){
  for(const r of _mutationRoutes){
    if(r.method!==method) continue;
    if(r._regex){
      const m = pathname.match(r._regex);
      if(!m) continue;
      const params = {};
      try{ r._paramNames.forEach((name,i)=>{ params[name] = decodeURIComponent(m[i+1]); }); }
      catch(e){ continue; }
      return {route:r, params};
    } else if(r.path===pathname){
      return {route:r, params:{}};
    }
  }
  return null;
}

// ============================================================
// Phase 22 — REAL MIGRATION LEDGER. Every route below was previously a direct if-block in the
// legacy pattern (removed from below, each marked with a "Phase 22: migrated" comment at its old
// location) and is now dispatched exclusively through registerMutationRoute(). This is a real,
// live, financially-significant subset — not a demo route. 9 of ~247 real mutation routes.
// Selection criterion: migrated first were routes whose OLD authorization check was a single,
// simple can()-tag or role-allow-list with no additional business-rule condition mixed in —
// routes with compound conditions (e.g. /api/ar/invoice's extra Sales-customer-assignment check,
// /api/material-issues' ProjectManager-OR-procurement-role check, /api/journal/draft's branch
// check) were deliberately NOT migrated this phase, to avoid silently dropping a real
// authorization rule while mechanically transforming it — see the Phase 22 report for the full
// route-by-route rationale and the routes still pending migration.
registerMutationRoute({ method:'POST', path:'/api/ap/invoice', permission:'create', idempotent:true, auditReject:true,
  handler:(actor, body) => D.draftSupplierInvoice({...body, createdByUserId:actor.id, createdByRole:actor.role}) });
// Phase 25 §5 — these 7 routes now delegate to the SAME assertCanXxx() function that is also
// embedded inside their domain function, instead of restating roles/permission independently.
// Behavior is byte-for-byte identical to before (each assertCanXxx() was copied verbatim from what
// used to be declared right here) — only the source of truth changed, from two copies to one.
registerMutationRoute({ method:'POST', path:'/api/ar/receipt', authCheck:(actor)=>D.assertCanClearReceipt(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.postCustomerReceipt({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/ap/payment', authCheck:(actor)=>D.assertCanPaySupplier(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.postSupplierPayment({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/supplier-credit-notes', authCheck:(actor)=>D.assertCanCreateSupplierCreditNote(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.createSupplierCreditNote({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/supplier-debit-notes', authCheck:(actor)=>D.assertCanCreateSupplierDebitNote(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.createSupplierDebitNote({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/customer-credit-notes', authCheck:(actor)=>D.assertCanCreateCustomerCreditNote(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.createCustomerCreditNote({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/customer-debit-notes', authCheck:(actor)=>D.assertCanCreateCustomerDebitNote(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.createCustomerDebitNote({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/inventory-adjustments', authCheck:(actor)=>D.assertCanCreateInventoryAdjustment(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.createInventoryAdjustment({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/payment-requests', permission:'create', idempotent:true, auditReject:true,
  handler:(actor, body) => D.createPaymentRequest({...body, actor}) });
// Phase 7 — Report Variants. No role restriction (authCheck:()=>true) — this is deliberate, not an
// oversight: a variant is per-user private state with no financial/RBAC-sensitive content of its
// own (it stores only filter/grouping CONFIGURATION, never report data), so every role from Viewer
// up may save their own. The REAL authorization boundary is ownership, enforced inside each domain
// function (`v.ownerId===actor.id`) — verified by the route safety scanner requiring a declared
// check here, and by this phase's own cross-user security test (see the Phase 7 report).
registerMutationRoute({ method:'POST', path:'/api/report-variants', authCheck:()=>true, idempotent:false, auditReject:true,
  handler:(actor, body) => D.createReportVariant({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/report-variants/:id/rename', authCheck:()=>true, idempotent:false, auditReject:true,
  handler:(actor, body) => D.renameReportVariant({id:body.id, name:body.name, actor}) });
registerMutationRoute({ method:'POST', path:'/api/report-variants/:id/favorite', authCheck:()=>true, idempotent:false, auditReject:true,
  handler:(actor, body) => D.toggleFavoriteReportVariant({id:body.id, actor}) });
registerMutationRoute({ method:'DELETE', path:'/api/report-variants/:id', authCheck:()=>true, idempotent:false, auditReject:true,
  handler:(actor, body) => D.deleteReportVariant({id:body.id, actor}) });

// ============================================================
// Phase 23 — COMPOUND-AUTHORIZATION MIGRATION. These 3 routes were deliberately left on the
// legacy pattern in Phase 22 specifically because their authorization is more than a single
// permission tag or role list. Each compound clause is preserved EXACTLY as it existed before —
// none of "A AND B AND C" was collapsed into "A" to fit a simpler declaration.
// ============================================================
registerMutationRoute({ method:'POST', path:'/api/ar/invoice', permission:'create',
  extraCheck: (actor, body) => (actor.role==='Sales' && body.customerId && !(actor.assignedCustomers||[]).includes(body.customerId))
    ? {ok:false, error:`Sales user is not assigned to customer ${body.customerId}.`} : {ok:true},
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.draftCustomerInvoice({...body, createdByUserId:actor.id, createdByRole:actor.role}) });
registerMutationRoute({ method:'POST', path:'/api/journal/draft', permission:'create',
  extraCheck: (actor, body) => (body.branchId && !D.branchAllowed(actor, body.branchId))
    ? {ok:false, error:`Role "${actor.role}" is not authorized to post to branch "${body.branchId}".`} : {ok:true},
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.createDraft({...body, createdByUserId:actor.id, createdByRole:actor.role}) });
registerMutationRoute({ method:'POST', path:'/api/material-issues',
  // Phase 24 §1/§5 — delegates to the SAME D.assertCanCreateMaterialIssue() that is now also
  // enforced INSIDE createMaterialIssue() itself, instead of re-stating the rule here as a second,
  // independently-maintained copy that could drift from it (exactly what happened to the sibling
  // /api/site-material-consumption route before this phase).
  authCheck: (actor, body) => D.assertCanCreateMaterialIssue(actor, body).ok,
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.createMaterialIssue({...body, actor}) });

// ============================================================
// Phase 23 — remaining batch: verified EXACTLY against the old code before removal, not assumed
// from route naming. Two corrections caught here during that verification, both before any old
// code was deleted: purchase-returns/inventory-transfers/damage-reports use the SAME
// PROC_CREATE_ROLES-equivalent role list as the old code (['Admin','CEO','Purchase'] /
// ['Admin','CEO','FinanceManager']) — NOT the broader can(actor,'create') tag, which would have
// silently granted Accountant/Sales/Estimator/SiteInCharge rights they never had. labour-wages
// shares Project Expense's exact compound rule (own-project PM OR finance-tier role), not a flat
// role list — a ProjectManager for a DIFFERENT project must still be rejected.
// Also disclosed, not hidden: inventory-transfers, damage-reports, and labour-wages had NO
// idempotency wrapper at all in the old code (direct calls, no D.withIdempotency) — adding
// idempotent:true here is a genuine new protection, exactly like Payment Request in Phase 22.
// ============================================================
registerMutationRoute({ method:'POST', path:'/api/purchase-returns', authCheck:(actor)=>D.assertCanCreatePurchaseReturn(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.createPurchaseReturn({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/inventory-transfers', roles:['Admin','CEO','Purchase'], idempotent:true, auditReject:true,
  handler:(actor, body) => D.createInventoryTransfer({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/damage-reports', roles:['Admin','CEO','FinanceManager'], idempotent:true, auditReject:true,
  handler:(actor, body) => D.createDamageReport({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/labour-wages',
  authCheck: (actor, body) => D.assertCanRecordLabourWages(actor, body.projectId).ok,
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.recordLabourWages({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/project-expenses',
  authCheck: (actor, body) => D.assertCanRecordProjectExpense(actor, body.projectId).ok,
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.recordProjectExpense({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/grns', authCheck:(actor)=>D.assertCanCreateGRN(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.createGRN({...body, actor}) });
// Project Variation Phase 5 — DEFECT FOUND & FIXED, live-proven during this phase's own idempotency
// testing (§19): /api/boms was a legacy if-block, reached only through the blanket legacy-dispatch
// wrapper — which gives atomicity but NEVER constructs a real idempotency option from
// body.idempotencyKey. Two identical BOM-creation requests, same idempotencyKey, produced TWO
// distinct BOM records (BOM-0044, BOM-0045) — the exact same gap class already found and fixed for
// Change Request create/approve and Fixed Asset Transfer earlier in this engagement, now closed for
// BOM creation too. Role list preserved EXACTLY as the removed if-block had it.
registerMutationRoute({ method:'POST', path:'/api/boms', roles:['Admin','CEO','Estimator'], idempotent:true, auditReject:true,
  handler:(actor, body) => D.createBOM({...body, actor}) });
// Project Variation Phase 6 — DEFECT FOUND & FIXED, same class as BOM in Phase 5: /api/material-
// requirements was a legacy if-block (atomicity only, no real idempotency). Now that
// createMaterialRequirement() carries the new bomId-linkage logic, it is squarely a "newly modified
// mutation route" under this phase's own instruction to use registerMutationRoute() for those.
// Same authCheck condition the removed if-block had, preserved exactly.
registerMutationRoute({ method:'POST', path:'/api/material-requirements',
  authCheck: (actor, body) => (actor.role==='ProjectManager' && isProjectManagerOf(actor, body.projectId)) || ['Admin','CEO'].includes(actor.role),
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.createMaterialRequirement({...body, actor}) });
// Project Variation Phase 7 — DEFECT FOUND & FIXED, same class already closed for BOM (Phase 5) and
// Material Requirement (Phase 6): /api/purchase-requisitions, /api/rfqs and /api/supplier-comparisons
// were all legacy if-blocks — atomicity via the blanket wrapper, but no real idempotency. Role sets
// preserved EXACTLY as each removed if-block had them (SOP_SITE_ROLES for PR, PROC_CREATE_ROLES for
// RFQ/Comparison).
registerMutationRoute({ method:'POST', path:'/api/purchase-requisitions', roles:['Admin','CEO','FinanceManager','Purchase','SiteInCharge'], idempotent:true, auditReject:true,
  handler:(actor, body) => D.createPurchaseRequisition({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/rfqs', roles:['Admin','CEO','Purchase'], idempotent:true, auditReject:true,
  handler:(actor, body) => D.createRFQ({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/supplier-comparisons', roles:['Admin','CEO','Purchase'], idempotent:true, auditReject:true,
  handler:(actor, body) => D.createSupplierComparison({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/purchase-orders', roles:['Admin','CEO','Purchase'], idempotent:true, auditReject:true,
  handler:(actor, body) => D.createPurchaseOrder({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/fixed-assets', permission:'create', idempotent:true, auditReject:true,
  handler:(actor, body) => D.createFixedAsset({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/quotations',
  authCheck: (actor, body) => new Set(['Admin','CEO','Sales']).has(actor.role) && can(actor,'create'),
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.createQuotation({...body, actor}) });

// ============================================================
// Phase 24 §1 — /api/site-material-consumption. Investigated before touching anything: this route
// and /api/material-issues both call D.createMaterialIssue(), which as of Phase 24 supports two
// genuinely different, deliberately-scoped business operations selected by which of siteId/
// warehouseId is supplied (see the domain function's own Phase-33 comment and the shared
// D.assertCanCreateMaterialIssue() guard for the full rule). Before this phase, THIS route accepted
// EITHER mode with only a flat SOP_SITE_ROLES check and no scope check at all — the exact hole the
// Phase 23 duplicate-door finding exploited (a SiteInCharge, blocked by /api/material-issues,
// walked straight through here into the warehouse-issue branch for a project they do not manage).
// The extraCheck below closes that at the ROUTE level by making this endpoint's business purpose
// exact and non-negotiable — it is Site Consumption ONLY, never a back door into a plain warehouse
// issue — while the shared authCheck closes it again at the DOMAIN level (defense in depth: even a
// future route that forgets this extraCheck still cannot get past createMaterialIssue() itself).
registerMutationRoute({ method:'POST', path:'/api/site-material-consumption',
  authCheck: (actor, body) => D.assertCanCreateMaterialIssue(actor, body).ok,
  extraCheck: (actor, body) => body.siteId ? {ok:true} : {ok:false, error:'Site Material Consumption requires siteId — this endpoint only records consumption of material already delivered to a site, never a direct warehouse issue (use /api/material-issues for that).'},
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.createMaterialIssue({...body, actor}) });

// ============================================================
// Phase 24 §6/§7 — the central posting gate and its reversal counterpart. These are the two
// highest-risk functions in the entire ERP (every GL entry in the system passes through
// D.postDraft() -> D.postJournalEntry(); every reversal through D.reverseEntry()), so this phase
// prioritized migrating them over any number of ordinary CRUD routes, per the mission brief.
// Both routes below use the plain `permission` idiom (a single can(actor,'post'/'reverse') tag —
// the exact same check the old code used, now also duplicated INSIDE postDraft()/reverseEntry()
// themselves as a domain-level guard, see domain.js). Two URLs reach the SAME D.postDraft() by
// design (§16's "one central posting architecture," documented at the route above) — both are
// registered here with IDENTICAL permission so neither can silently drift from the other.
registerMutationRoute({ method:'POST', path:'/api/journal/:id/post', permission:'post', idempotent:true, auditReject:true,
  handler:(actor, body) => D.postDraft(body.id, actor, body.overrideReason) });
registerMutationRoute({ method:'POST', path:'/api/opening-balance/drafts/:id/post', permission:'post', idempotent:true, auditReject:true,
  handler:(actor, body) => D.postDraft(body.id, actor, body.overrideReason) });
registerMutationRoute({ method:'POST', path:'/api/journal/:id/reverse', permission:'reverse', idempotent:true, auditReject:true,
  handler:(actor, body) => D.reverseEntry(body.id, body.reason, actor) });

// ============================================================
// Phase 25 §2/§3 — the 10 remaining legacy GL-posting routes, migrated onto registerMutationRoute()
// now that parameterized paths are supported (Phase 24 §8). Every authCheck below is a direct
// delegation to the SAME assertCanXxx() function embedded inside the domain function (domain.js,
// Phase 25 §2) — read fresh from each route's CURRENT if-block before this migration, not assumed.
// Two are asymmetric siblings, preserved exactly rather than harmonized: postProductionLabourCost
// and postServiceLabourCost use the broad can(actor,'create') tag; postInstallationLabourCost alone
// is scoped to EXEC_CREATE_ROLES-or-owning-PM, because that is what its old route actually enforced.
// ============================================================
registerMutationRoute({ method:'POST', path:'/api/bank-transfer', authCheck:(actor)=>D.assertCanTransferBankFunds(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.createBankTransfer({...body, actor}) });
registerMutationRoute({ method:'POST', path:'/api/fixed-assets/:id/capitalize', authCheck:(actor)=>D.assertCanCapitalizeFixedAsset(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.capitalizeFixedAsset({...body, assetId:body.id, actor}) });
// Quick Control Fixes phase — migrated from the legacy if-block at what was
// /^\/api\/fixed-assets\/[^/]+\/transfer$/ (Phase 35 Part F had already added the domain-level
// assertCanTransferFixedAsset() guard, both here and inside transferFixedAsset() itself, but the
// route remained a raw if-block reached only through the blanket legacy-dispatch wrapper — which
// gives atomicity but, per the Change Request precedent found earlier this engagement, NEVER
// constructs a real idempotency option from body.idempotencyKey. A duplicate Transfer submission
// (e.g. a retried click) would previously append two transferHistory entries for one real event.
// Now matches every sibling fixed-asset route's own already-modern registration exactly.
registerMutationRoute({ method:'POST', path:'/api/fixed-assets/:id/transfer', authCheck:(actor)=>D.assertCanTransferFixedAsset(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.transferFixedAsset({...body, assetId:body.id, actor}) });
registerMutationRoute({ method:'POST', path:'/api/fixed-assets/:id/depreciate', authCheck:(actor)=>D.assertCanPostAssetDepreciation(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.postAssetDepreciation({...body, assetId:body.id, actor}) });
registerMutationRoute({ method:'POST', path:'/api/fixed-assets/:id/dispose', authCheck:(actor)=>D.assertCanDisposeFixedAsset(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.disposeFixedAsset({...body, assetId:body.id, actor}) });
registerMutationRoute({ method:'POST', path:'/api/bank-import/lines/:id/post', authCheck:(actor)=>D.assertCanPostBankImportLine(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.postBankImportLine({...body, lineId:body.id, actor}) });
registerMutationRoute({ method:'POST', path:'/api/production-orders/:id/labour-cost', authCheck:(actor)=>D.assertCanPostProductionLabourCost(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.postProductionLabourCost({productionOrderId:body.id, amount:body.amount, actor, overrideReason:body.overrideReason}) });
registerMutationRoute({ method:'POST', path:'/api/installations/:id/labour-cost',
  authCheck: (actor, body) => { const inst = D.DB.installations.find(x=>x.id===body.id); return inst ? D.assertCanPostInstallationLabourCost(actor, inst.projectId).ok : true; },
  idempotent:true, auditReject:true,
  handler:(actor, body) => D.postInstallationLabourCost({installationId:body.id, amount:body.amount, actor, overrideReason:body.overrideReason}) });
registerMutationRoute({ method:'POST', path:'/api/service-visits/:id/labour-cost', authCheck:(actor)=>D.assertCanPostServiceLabourCost(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.postServiceLabourCost({visitId:body.id, technicianId:body.technicianId, hours:body.hours, rate:body.rate, amount:body.amount, actor, overrideReason:body.overrideReason}) });
registerMutationRoute({ method:'POST', path:'/api/amc-contracts/:id/recognize-revenue', authCheck:(actor)=>D.assertCanRecognizeAMCRevenue(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.recognizeAMCRevenue({amcId:body.id, periodDate:body.periodDate, actor, overrideReason:body.overrideReason}) });
// Targeted P1 Remediation phase — real Site Return, registered as a modern route from day one (real
// idempotency, matching this phase's own Change Request fix rather than repeating the same
// legacy-route gap this session already found and fixed elsewhere).
registerMutationRoute({ method:'POST', path:'/api/site-returns', authCheck:(actor)=>D.assertCanReturnFromSite(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.returnFromSite({...body, actor}) });
// Business Process Control Closure phase — migrated from a legacy if-block route (the OLD version
// stood at what is now the "approve" block below, verbatim: `if(!can(actor,'create')) deny(...)`).
// Real defect LIVE PROVEN in this phase: identical POST bodies (including the SAME client-supplied
// idempotencyKey) each created a SEPARATE Change Request record — the legacy-dispatch blanket
// wrapper (server.js, near matchMutationRoute) gives every legacy route atomicity but NEVER
// constructs an `idempotency` option from body.idempotencyKey, so no legacy route gets real
// duplicate-submission protection no matter what the client sends. This matters more than most
// because an approved Change Request's revenueImpact directly inflates a project's customer-
// invoice billing ceiling (projectBillingCeiling()) — a duplicate, later-also-approved Change
// Request would silently double that inflation. Same fix shape as every other Phase 22/23
// migration in this file: no new idempotency mechanism invented, just wired onto the existing one.
registerMutationRoute({ method:'POST', path:'/api/change-requests', permission:'create', idempotent:true, auditReject:true,
  handler:(actor, body) => D.createChangeRequest({...body, actor}) });
// Project Variation Phase 2 — the real Draft->Submitted->Approved/Rejected->(revise)->Draft,
// Approved->Cancelled lifecycle. All 4 new transitions registered as modern routes from day one
// (real idempotency immediately — not repeating the exact legacy-if-block gap this engagement
// already found and fixed for both Change-Request-create and Fixed-Asset-Transfer).
registerMutationRoute({ method:'POST', path:'/api/change-requests/:id/submit', permission:'submit', idempotent:true, auditReject:true,
  handler:(actor, body) => D.submitChangeRequest({id:body.id, actor}) });
registerMutationRoute({ method:'POST', path:'/api/change-requests/:id/reject', authCheck:(actor)=>['Admin','CEO','FinanceManager'].includes(actor.role), idempotent:true, auditReject:true,
  handler:(actor, body) => D.rejectChangeRequest({id:body.id, reason:body.reason, actor}) });
registerMutationRoute({ method:'POST', path:'/api/change-requests/:id/revise', permission:'edit', idempotent:true, auditReject:true,
  handler:(actor, body) => D.reviseChangeRequest({id:body.id, changes:body.changes, actor}) });
registerMutationRoute({ method:'POST', path:'/api/change-requests/:id/cancel', authCheck:(actor)=>['Admin','CEO','FinanceManager'].includes(actor.role), idempotent:true, auditReject:true,
  handler:(actor, body) => D.cancelChangeRequest({id:body.id, reason:body.reason, actor}) });
registerMutationRoute({ method:'POST', path:'/api/change-requests/:id/approve', authCheck:(actor)=>['Admin','CEO','FinanceManager'].includes(actor.role), idempotent:true, auditReject:true,
  handler:(actor, body) => D.approveChangeRequest({id:body.id, actor}) });
registerMutationRoute({ method:'POST', path:'/api/petty-cash-floats/:id/replenish', authCheck:(actor)=>D.assertCanReplenishPettyCash(actor).ok, idempotent:true, auditReject:true,
  handler:(actor, body) => D.replenishPettyCashFloat({pettyCashFloatId:body.id, ...body, actor}) });
// Phase 45 FIX — this was declared `async` despite containing zero `await`, which was harmless
// when it was only ever reached via the top-level `await handleRequest(req, res)` (an async throw
// with nothing awaiting it downstream still surfaced, because the request/response cycle for THAT
// call was itself awaited by the server's own request listener). It stopped being harmless the
// moment this phase's outer legacy-dispatch transaction wrapper started calling `handleRequest`
// SYNCHRONOUSLY (required — see the wrapper's own comment on why `withTransaction()`'s handler
// must be synchronous) without awaiting its result: a synchronous throw inside an `async` function
// does not propagate as a normal exception — it silently rejects the Promise the function returns,
// and since nothing here ever attached a `.catch()` or `await` to that Promise, the rejection was
// lost as an "unhandled rejection" and the HTTP request hung forever (no response ever sent,
// proven live: a fault-injection test that used to complete in milliseconds never returned).
// Removing `async` restores a genuine synchronous throw, which the surrounding `withTransaction()`
// boundaries (both the new outer one and the existing inner one) are built to catch correctly.
function dispatchMutationRoute(route, req, res, actor, body, pathname, params){
  // Phase 24 §8 — path parameters (e.g. :id) are merged into body BEFORE any check runs, so
  // authCheck/extraCheck/handler can all read them the same way regardless of whether they came
  // from the URL or the request body. Params come from the URL structure itself (not client-
  // controlled JSON), so they intentionally take precedence over any same-named body field — a
  // client cannot spoof the :id a route resolved by also sending a conflicting `id` in the body.
  if(params) body = {...body, ...params};
  let authorized, reason;
  if(route.authCheck){
    authorized = route.authCheck(actor, body);
    reason = `Role "${actor.role}" is not authorized to perform this action.`;
  } else if(route.roles){
    authorized = route.roles.includes(actor.role);
    reason = `Role "${actor.role}" cannot perform this action (requires one of: ${route.roles.join(', ')}).`;
  } else {
    authorized = can(actor, route.permission);
    reason = `Role "${actor.role}" cannot ${route.permission}.`;
  }
  if(!authorized) return deny(res, 403, reason, {userId:actor.id, role:actor.role, path:pathname});
  if(route.extraCheck){
    const extra = route.extraCheck(actor, body);
    if(extra && extra.ok===false) return deny(res, 403, extra.error, {userId:actor.id, role:actor.role, path:pathname});
  }
  // Phase 38 — every route dispatched through here now runs inside D.withTransaction(), which
  // owns a full DB snapshot/rollback boundary around the handler call. This is what elevates
  // atomicity from "the handler must remember to roll back" to "the dispatcher guarantees it
  // regardless of what the handler does" for every route registered via registerMutationRoute() —
  // including a brand-new handler that itself contains zero rollback code (see the Phase 38 naive-
  // developer re-test). Legacy if-block routes that call a domain function directly, bypassing
  // this dispatcher entirely, do NOT get this protection from here — see the Phase 38 report's
  // write-point census for the (now short) list of functions still reached only that way.
  //
  // Idempotency is now passed INTO the transaction (options.idempotency) instead of D.withIdempotency()
  // wrapping it from the outside — folding the dedupe-record write into the SAME commit/save() as
  // the business mutation, so a failure recording the dedupe key rolls back the whole transaction
  // instead of leaving a committed transaction with no working duplicate-retry protection (see the
  // withTransaction() header comment and the Phase 38 report, Part G/H).
  const idempotency = (route.idempotent && body.idempotencyKey)
    ? {key: body.idempotencyKey, endpoint: pathname, payloadHash: D.hashPayload(body)}
    : null;
  const r = D.withTransaction(actor, {name: route.path, idempotency}, () => route.handler(actor, body));
  if(!r.ok && route.auditReject){
    D.logAudit({type:'BusinessRuleRejected', path:pathname, method:route.method, error:r.error, userId:actor.id, role:actor.role});
  }
  return sendJson(res, r.ok?200:400, r);
}
// Phase 9B §7/§8 fix: mirrors the Material Requirement / Production Order CREATE gate
// (Admin/CEO or the project's assigned PM — deliberately NOT Purchase, since Purchase has no
// role in running production) so the same rule can be re-applied to lifecycle actions that
// take only a document ID (submit/issue-material/complete/hold/resume/cancel/close), which were
// found during Phase 9B security testing to have NO authorization gate at all.
function pmOrAdminCeo(actor, projectId){ return ['Admin','CEO'].includes(actor.role) || isProjectManagerOf(actor, projectId); }

// Phase 9B §17 — real server-side pagination for the highest-volume lists (Journal Register,
// Audit Log, Inventory Movements — the ones the brief names first). page/pageSize are OPTIONAL
// query params; omitting them returns everything unpaginated (unchanged behavior — no existing
// caller, test, or UI screen breaks). A safe page/limit design, not cursor pagination — the
// brief explicitly allows this ("if cursor pagination is not justified, use safe page/limit").
function paginate(rows, query){
  if(!query.page && !query.pageSize) return {rows, total: rows.length, paginated:false};
  const pageSize = Math.min(Math.max(parseInt(query.pageSize,10)||50, 1), 500);
  const page = Math.max(parseInt(query.page,10)||1, 1);
  const total = rows.length;
  const start = (page-1)*pageSize;
  return { rows: rows.slice(start, start+pageSize), total, page, pageSize, hasMore: start+pageSize<total, paginated:true };
}

// ---------- static client (thin — no business logic) ----------
function serveStatic(req, res, pathname){
  let file = pathname==='/' ? '/index.html' : pathname;
  const full = path.join(CLIENT_DIR, file);
  if(!full.startsWith(CLIENT_DIR)){ res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, data)=>{
    if(err){ res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(full);
    const ctype = ext==='.html'?'text/html':ext==='.js'?'application/javascript':ext==='.css'?'text/css':'application/octet-stream';
    res.writeHead(200, {'Content-Type':ctype});
    res.end(data);
  });
}

// ---------- request log (for concurrency evidence) ----------
let requestSeq = 0;

// DEFECT FOUND & FIXED (Phase 20 §34 Final Security Audit — found by code review, not a test):
// the entire route-dispatch if-chain ran directly inside this async request-listener callback
// with NO surrounding try/catch anywhere in the file, and no process-level
// uncaughtException/unhandledRejection handler either. Node's `http` module does not catch a
// rejected promise from a request listener — an unhandled exception from any single malformed
// request (e.g. a domain function throwing on unexpected input) would either leave that request
// hanging forever (no res.end() ever called) or, in newer Node versions that treat unhandled
// rejections as fatal, crash the ENTIRE process — taking the server down for every user over one
// bad request. Neither failure mode is acceptable for a handover-ready build. Fixed with two
// layers: (1) every request is now wrapped in try/catch, logging the REAL error server-side only
// (console.error — never sent to the client) and returning a generic, safe 500 JSON response with
// no stack trace, internal path, or exception message exposed; (2) process-level safety nets so a
// truly unexpected error anywhere else can never silently kill the whole server for other users.
process.on('uncaughtException', (err) => { console.error('[FATAL] Uncaught exception (server stays up):', err); });
process.on('unhandledRejection', (err) => { console.error('[FATAL] Unhandled rejection (server stays up):', err); });

// Phase 45 — structural closure of the legacy route layer. Phases 42/43 found and fixed, one
// function at a time, real caller/callee mutations reachable ONLY through the ~215 legacy
// if-block routes with no shared transaction boundary (submitPurchaseOrder, executePaymentRequest,
// issueProductionMaterial, issueServiceMaterial, submitStockCount — several of which were PROVEN
// LIVE to be completely broken under the write-point guard, not merely at risk). Phase 44 found
// the same shape of gap for AUDIT specifically (createUser/createVendorMaster/createMaterialMaster
// recorded zero trail on rejection). Both are instances of one root cause: only the 36 modern
// registerMutationRoute() routes get transaction + audit-on-rejection automatically; every legacy
// route gets neither unless its author remembered to add it by hand. Rather than continue
// migrating the remaining ~85 legacy-only mutating functions one at a time, this wraps EVERY
// mutating HTTP verb (POST/PUT/PATCH/DELETE) — legacy or modern — in the SAME central
// `withTransaction()` boundary at the single point every request already passes through. A route
// that already opens its own inner transaction (every modern route, and every individually-
// migrated legacy function) sees `_txDepth>0` and simply participates, per the nested-transaction
// safety already proven live in Phase 43 §5 — this is additive protection for those, not a
// behavior change. For the remaining, still-unmigrated legacy functions, this closes the
// atomicity gap AND the audit gap in one architectural change: any throw is now caught, rolled
// back, and logged as `TransactionRolledBack`; any handler that resolves its own response as
// `{ok:false,...}` (the normal business-rejection shape every route in this codebase already
// uses) is now defensively rolled back and logged as `TransactionCommitted`/an implicit rejection
// exactly the way a modern route's `auditReject` already behaves — with no per-route opt-in
// required. GET requests are left untouched (no mutation risk, avoids unnecessary snapshot cost).
const MUTATING_METHODS = new Set(['POST','PUT','PATCH','DELETE']);
const server = http.createServer(async (req, res) => {
  try {
    let body = {};
    if(req.method==='POST') body = await readBody(req);
    const pathnameForDispatch = url.parse(req.url).pathname;
    // Phase 45 PERFORMANCE FIX — found live: routing EVERY mutating request through this wrapper,
    // including ones already destined for a modern registerMutationRoute() (which opens its OWN
    // withTransaction() a few frames further in, at dispatchMutationRoute), took a full DB snapshot
    // TWICE for those requests — once here, then the inner call saw `_txDepth>0` and skipped its
    // own snapshot, but the outer one had already paid the full O(DB size) JSON.parse(JSON.
    // stringify(DB)) cost for nothing (proven live: the standard 14-function regression battery
    // went from a few seconds to 42 seconds). Modern routes already had complete protection before
    // this phase — they get zero benefit from an extra outer snapshot. Only requests NOT already
    // covered by a modern route (the genuinely legacy ~215) pay this wrapper's cost now.
    const isModernRoute = !!matchMutationRoute(req.method, pathnameForDispatch);
    // ERP-059 FIX (Phase ERP-059A, Option A from the forensic report) — /api/login is
    // authentication/security bookkeeping, not a GL/inventory business transaction, but it was
    // still being routed through this legacy-dispatch withTransaction() wrapper below like every
    // other mutating legacy route. withTransaction()'s own rollback-on-ok:false rule — correct for
    // ordinary business rejections, which validate before their first mutation — was silently
    // erasing failedLoginCount/lockedUntil/loginHistory on every failed login, because a failed
    // login INTENTIONALLY mutates that bookkeeping as the entire point of returning ok:false.
    // Live-reproduced and root-caused in the ERP-059 forensic gate (see
    // docs/erp-remediation/phases/PHASE-01-CLOSURE-ERP059-GATE-REPORT.md) — account lockout never
    // actually triggered, no matter how many wrong passwords were sent.
    //
    // Fix: exclude /api/login from this wrapper entirely, mirroring the EXISTING isModernRoute
    // bypass immediately below — not a new mechanism, just recognizing that login was never a fit
    // for this boundary's intended purpose to begin with. login's own handler
    // (handleRequest -> the /api/login if-block) already performs its own explicit D.save() calls
    // for every branch (success, unknown/inactive user, locked, bad password) — nothing about how
    // login persists its own state changes, and nothing about what it returns to the client, is
    // duplicated or changed by this fix. All other legacy routes (including the ~22 other
    // "logAudit(...Rejected); return {ok:false}" call sites the blast-radius report identified)
    // remain wrapped exactly as before — this fix is deliberately scoped to login only, per the
    // Phase ERP-059A brief's explicit "do not over-remediate" instruction.
    const isLoginRoute = pathnameForDispatch === '/api/login' && req.method === 'POST';
    if(!MUTATING_METHODS.has(req.method) || isModernRoute || isLoginRoute){
      handleRequest(req, res, body);
      return;
    }
    // Capture the eventual response's `ok` field without altering what is actually sent to the
    // client — res.end/writeHead are called exactly as they always were, just observed in transit.
    let capturedOk = true;
    // ERP-059B FIX — this used to capture ONLY the boolean `capturedOk` and hand withTransaction()
    // a freshly-synthesized `{ok: capturedOk}` object as its "result" — which meant a domain
    // function's real return value (including a `durableFailureAudit` payload, see
    // ERP-059B-TRANSACTION-DESIGN.md) was silently discarded for every LEGACY-dispatched route,
    // even after the durableFailureAudit mechanism itself was correctly implemented in
    // withTransaction(). Live-proven broken this phase: createUser()/importMasterData()/
    // restoreBackup() (all legacy if-block routes) still lost their rejection audit trail even
    // after being migrated to attach durableFailureAudit, because THIS wrapper never forwarded it.
    // Modern registerMutationRoute() handlers never had this problem — dispatchMutationRoute()
    // already passes the real handler return value straight into withTransaction() (see its own
    // code, `D.withTransaction(actor, {...}, () => route.handler(actor, body))`). Fixed the same
    // way here: capture the actual parsed response body and forward it in full.
    let capturedBody = null;
    const originalEnd = res.end.bind(res);
    res.end = function(chunk, ...args){
      if(chunk){
        try {
          const parsed = JSON.parse(chunk);
          if(parsed && typeof parsed === 'object'){
            capturedBody = parsed;
            if(parsed.ok === false) capturedOk = false;
          }
        } catch(e) { /* non-JSON response body (e.g. a CSV/binary export) — leave capturedOk true, capturedBody null */ }
      }
      return originalEnd(chunk, ...args);
    };
    let actorForAudit = null;
    try { actorForAudit = getActor(req); } catch(e) { /* unauthenticated requests are handled, and audited, inside handleRequest itself */ }
    D.withTransaction(actorForAudit, {name: 'legacy-dispatch:' + req.method + ':' + pathnameForDispatch}, () => {
      handleRequest(req, res, body);
      // Forward the REAL captured response body when one was actually sent (preserves
      // durableFailureAudit and any other field a legacy handler's result carried); fall back to
      // the plain {ok: capturedOk} shape only if no JSON body was ever captured (e.g. a thrown
      // error before any response, or a non-JSON response) — identical to this wrapper's
      // pre-existing behavior in that fallback case.
      return capturedBody && typeof capturedBody === 'object' ? capturedBody : {ok: capturedOk};
    });
  } catch (err) {
    console.error('[REQUEST ERROR]', req.method, req.url, err);
    if(!res.headersSent) sendJson(res, 500, {ok:false, error:'An unexpected error occurred while processing this request. Please try again; if the problem persists, contact your system administrator.'});
  }
});
function handleRequest(req, res, body){
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const reqId = ++requestSeq;

  if(req.method==='GET' && !pathname.startsWith('/api/')){ return serveStatic(req, res, pathname); }

  if(!pathname.startsWith('/api/')){ res.writeHead(404); return res.end(); }

  // ---------- AUTH endpoints (no session required) ----------
  if(pathname==='/api/login' && req.method==='POST'){
    const {username, password} = body;
    const user = D.DB.users.find(u=>u.username===username);
    const loginRecord = {username, at:new Date().toISOString(), reqId};
    if(!user || !user.active){
      D.DB.loginHistory.push({...loginRecord, result:'DENY', reason:'unknown or inactive user'}); D.save();
      return sendJson(res, 401, {ok:false, error:'Invalid username or password.'});
    }
    if(user.lockedUntil && Date.now() < user.lockedUntil){
      D.DB.loginHistory.push({...loginRecord, result:'DENY', reason:'account locked'}); D.save();
      return sendJson(res, 423, {ok:false, error:`Account locked until ${new Date(user.lockedUntil).toISOString()} after repeated failed logins.`});
    }
    if(!D.verifyPassword(password||'', user.passwordHash, user.passwordSalt)){
      user.failedLoginCount = (user.failedLoginCount||0)+1;
      if(user.failedLoginCount>=5){ user.lockedUntil = Date.now()+15*60*1000; user.failedLoginCount=0; }
      D.save();
      D.DB.loginHistory.push({...loginRecord, result:'DENY', reason:'bad password'}); D.save();
      return sendJson(res, 401, {ok:false, error:'Invalid username or password.'});
    }
    user.failedLoginCount = 0; user.lockedUntil = null; D.save();
    const token = A.createSession(user);
    D.DB.loginHistory.push({...loginRecord, result:'PASS', userId:user.id, role:user.role}); D.save();
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${A.SESSION_TTL_MS/1000}`);
    return sendJson(res, 200, {ok:true, user:{id:user.id, username:user.username, name:user.name, role:user.role, mustChangePassword:!!user.mustChangePassword}});
  }
  if(pathname==='/api/logout' && req.method==='POST'){
    const token = parseCookies(req).sid;
    // Phase 17 §12 DEFECT FOUND & FIXED: Login was already tracked via loginHistory, but Logout
    // had no audit coverage at all — resolve the user BEFORE destroying the session so who/when
    // is recorded, same as every other audited action.
    if(token){
      const s = A.getSession(token);
      if(s){ const u = D.DB.users.find(x=>x.id===s.userId); if(u) D.DB.loginHistory.push({at:new Date().toISOString(), userId:u.id, role:u.role, result:'LOGOUT'}); }
      A.destroySession(token);
      D.save();
    }
    res.setHeader('Set-Cookie', `sid=; Path=/; Max-Age=0`);
    return sendJson(res, 200, {ok:true});
  }
  // ERP-059C Step 5 — unauthenticated, read-only environment identity check. Exists so a test
  // harness's preflight guard (tests/preflight.js) can positively confirm "this target is a
  // disposable test server" BEFORE attempting anything destructive, without needing valid
  // credentials first (the incident this phase responds to happened before any login-gated check
  // could have run). Deliberately returns no secret, no user data, and nothing an attacker could not
  // already infer by probing any other endpoint's behavior — only the same APP_ENV/enabled flag
  // this phase already prints unconditionally to the server's own console at startup.
  if(pathname==='/api/system/environment' && req.method==='GET'){
    return sendJson(res, 200, {ok:true, appEnv: APP_ENV, destructiveTestEndpointsEnabled: IS_TEST_ENV});
  }

  // ---------- everything below requires a valid session ----------
  const actor = getActor(req);
  if(!actor){
    D.logAudit({type:'AccessDenied', reason:'no valid session', path:pathname, method:req.method, reqId});
    return sendJson(res, 401, {ok:false, error:'Not authenticated. Please log in.'});
  }

  if(pathname==='/api/me' && req.method==='GET') return sendJson(res, 200, {ok:true, actor});

  // Phase 21 — any route registered via registerMutationRoute() is intercepted here, before the
  // legacy per-route if-chain below, and gets RBAC + idempotency + audit-on-rejection applied
  // uniformly and unavoidably.
  { const _mr = matchMutationRoute(req.method, pathname); if(_mr) return dispatchMutationRoute(_mr.route, req, res, actor, body, pathname, _mr.params); }

  // ---------- Masters (RBAC + data-scope + field-level security) ----------
  if(pathname==='/api/customers' && req.method==='GET'){
    if(actor.role==='Purchase') return deny(res, 403, 'Purchase role cannot view customer master.', {userId:actor.id, role:actor.role, path:pathname});
    let rows = D.DB.customers;
    if(actor.role==='Sales') rows = rows.filter(c=>(actor.assignedCustomers||[]).includes(c.id));
    const financialEligible = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
    const out = rows.map(c=>{
      const base = {...c};
      if(financialEligible.has(actor.role) || actor.role==='Sales'){
        base.outstandingBalance = Math.round(D.customerOpenItems(c.id).reduce((s,i)=>s+i.open,0)*100)/100;
      } // else: field genuinely omitted from the JSON, not just hidden client-side
      return base;
    });
    return sendJson(res, 200, {ok:true, customers: out});
  }
  // Phase 19 §5 — Customer GSTIN is OPTIONAL master-data metadata, never mandatory; changes are
  // specifically audited (CustomerGSTINChanged), not just folded into a generic edit event.
  if(pathname.match(/^\/api\/customers\/[^/]+\/gstin$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot set a customer's GSTIN.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setCustomerGSTIN({customerId:pathname.split('/')[3], gstin:body.gstin, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/vendors' && req.method==='GET'){
    const allowed = new Set(['Admin','CEO','Accountant','FinanceManager','Purchase','Viewer']);
    if(!allowed.has(actor.role)) return deny(res, 403, `Role "${actor.role}" cannot view vendor master.`, {userId:actor.id, role:actor.role, path:pathname});
    const out = D.DB.vendors.map(v=>({...v, outstandingBalance: Math.round(D.supplierOpenItems(v.id).reduce((s,i)=>s+i.open,0)*100)/100}));
    return sendJson(res, 200, {ok:true, vendors: out});
  }
  if(pathname==='/api/projects' && req.method==='GET'){
    let rows = D.DB.projects;
    if(actor.role==='ProjectManager') rows = rows.filter(p=>isProjectManagerOf(actor,p.id));
    return sendJson(res, 200, {ok:true, projects: rows});
  }
  if(pathname==='/api/accounts' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the Chart of Accounts.`, {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, accounts: D.DB.accounts});
  }
  if(pathname==='/api/tax-codes' && req.method==='GET') return sendJson(res, 200, {ok:true, taxCodes: D.DB.taxCodes});
  // Phase 19 §24 — Payment Methods master (metadata-only, never redirects the GL account).
  if(pathname==='/api/payment-methods' && req.method==='GET') return sendJson(res, 200, {ok:true, paymentMethods: D.DB.paymentMethods});
  // §11 Project Accounting Dimensions — `costCentreId` has been a line-level dimension since
  // Phase 4/5, but DEFECT FOUND & FIXED this phase: no API route ever exposed the master list,
  // so no UI could ever let a user pick one. Real gap, now closed.
  if(pathname==='/api/cost-centres' && req.method==='GET') return sendJson(res, 200, {ok:true, costCentres: D.DB.costCentres});
  if(pathname==='/api/doc-types' && req.method==='GET') return sendJson(res, 200, {ok:true, docTypes: D.DB.glDocumentTypes});

  // ---------- GL / Financial statements ----------
  if(pathname==='/api/journal-entries' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the Journal Register / GL.`, {userId:actor.id, role:actor.role, path:pathname});
    let rows = D.DB.journalEntries;
    const q = parsed.query;
    if(q.search){ const s = q.search.toLowerCase(); rows = rows.filter(e=>(e.voucherNo||'').toLowerCase().includes(s) || (e.narration||'').toLowerCase().includes(s)); }
    if(q.docCategory) rows = rows.filter(e=>e.docCategory===q.docCategory);
    if(q.dateFrom) rows = rows.filter(e=>e.date>=q.dateFrom);
    if(q.dateTo) rows = rows.filter(e=>e.date<=q.dateTo);
    const p = paginate([...rows].reverse(), q);
    return sendJson(res, 200, {ok:true, journalEntries: p.rows, total:p.total, page:p.page, pageSize:p.pageSize, hasMore:p.hasMore, paginated:p.paginated});
  }
  if(pathname==='/api/document' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view accounting documents.`, {userId:actor.id, role:actor.role, path:pathname});
    const id = parsed.query.id;
    const je = D.DB.journalEntries.find(e=>e.id===id);
    if(!je) return sendJson(res, 404, {ok:false, error:'Document not found.'});
    const draft = D.DB.jeDrafts.find(d=>d.postedEntryId===id);
    const clearings = D.DB.clearings.filter(c=>c.invoiceEntryId===id || c.paymentEntryId===id);
    return sendJson(res, 200, {ok:true, entry:je, draft, clearings});
  }
  if(pathname==='/api/trial-balance' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the Trial Balance.`, {userId:actor.id, role:actor.role, path:pathname});
    const lines = D.allLines();
    const byAccount = {};
    lines.forEach(l=>{ byAccount[l.account]=byAccount[l.account]||{debit:0,credit:0}; byAccount[l.account].debit+=l.debit; byAccount[l.account].credit+=l.credit; });
    return sendJson(res, 200, {ok:true, byAccount, accounts:D.DB.accounts});
  }
  if(pathname==='/api/reconciliation' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view financial reconciliation.`, {userId:actor.id, role:actor.role, path:pathname});
    // Phase 21 §17 — Tax (Output/Input) and Customer Advance reconciliation added to the SAME
    // existing report, alongside AR/AP, rather than a new separate endpoint — closing the audit's
    // disclosed "no dedicated reconciliation tool for Tax/Advances" gap without fragmenting where
    // an accountant looks for reconciliation evidence.
    return sendJson(res, 200, {ok:true, ar:D.reconcileAR(), ap:D.reconcileAP(), outputTax:D.reconcileOutputTax(), inputTax:D.reconcileInputTax(), customerAdvances:D.reconcileCustomerAdvances()});
  }

  // ================== Phase 30 — Company-Wide Financial Statements ==================
  if(pathname==='/api/balance-sheet' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the Balance Sheet.`, {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, ...D.companyBalanceSheet(parsed.query.asOfDate||null)});
  }
  if(pathname==='/api/company-pl' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the Company Profit & Loss.`, {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, ...D.companyProfitAndLoss({fromDate:parsed.query.fromDate||null, toDate:parsed.query.toDate||null})});
  }
  if(pathname==='/api/general-ledger' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the General Ledger.`, {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, ...D.generalLedger({account:parsed.query.account||null, fromDate:parsed.query.fromDate||null, toDate:parsed.query.toDate||null,
      projectId:parsed.query.projectId||null, costCentreId:parsed.query.costCentreId||null, party:parsed.query.party||null, docCategory:parsed.query.docCategory||null})});
  }
  if(pathname==='/api/customer-ledger' && req.method==='GET'){
    const cid = parsed.query.customerId;
    if(!cid) return sendJson(res, 400, {ok:false, error:'customerId is required.'});
    if(!D.DB.customers.find(c=>c.id===cid)) return sendJson(res, 404, {ok:false, error:`Customer "${cid}" not found.`});
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the Customer Ledger.`, {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, ...D.customerLedger(cid)});
  }
  if(pathname==='/api/supplier-ledger' && req.method==='GET'){
    const vid = parsed.query.vendorId;
    if(!vid) return sendJson(res, 400, {ok:false, error:'vendorId is required.'});
    if(!D.DB.vendors.find(v=>v.id===vid)) return sendJson(res, 404, {ok:false, error:`Vendor "${vid}" not found.`});
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the Supplier Ledger.`, {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, ...D.supplierLedger(vid)});
  }

  // ---------- Project P&L / Committed Cost (margin-sensitive) ----------
  if(pathname==='/api/project-pl' && req.method==='GET'){
    const pid = parsed.query.projectId;
    // Phase 30 P29-3 FIX: used to compute projectPL() unconditionally and return 200 with an
    // all-zero result for a missing or nonexistent project — silently indistinguishable from "a
    // real project with genuinely zero activity." A missing/invalid project ID is now a real 400,
    // never a fabricated zero-profit project.
    if(!pid) return sendJson(res, 400, {ok:false, error:'projectId is required.'});
    if(!D.DB.projects.find(x=>x.id===pid)) return sendJson(res, 404, {ok:false, error:`Project "${pid}" not found.`});
    const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
    if(!fullAccess.has(actor.role)){
      if(isProjectManagerOf(actor, pid)){ /* allowed, own project only */ }
      else return deny(res, 403, `Role "${actor.role}" cannot view project profitability for ${pid}.`, {userId:actor.id, role:actor.role, path:pathname, projectId:pid});
    }
    return sendJson(res, 200, {ok:true, pl: D.projectPL(pid)});
  }

  // ---------- AR ----------
  if(pathname==='/api/ar/open-items' && req.method==='GET'){
    const cid = parsed.query.customerId;
    const scoped = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
    if(!scoped.has(actor.role)){
      if(actor.role==='Sales' && (actor.assignedCustomers||[]).includes(cid)){ /* ok */ }
      else return deny(res, 403, `Role "${actor.role}" cannot view AR open items for ${cid}.`, {userId:actor.id, role:actor.role, path:pathname, customerId:cid});
    }
    return sendJson(res, 200, {ok:true, items: D.customerOpenItems(cid)});
  }
  if(pathname==='/api/ar/ageing' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the full AR Ageing report (aggregate across all customers).`, {userId:actor.id, role:actor.role, path:pathname});
    // Reporting Implementation Phase — DEFECT FOUND & FIXED (forensic reporting audit): customerAgeing()
    // has always accepted an `asOf` date, but this route called it with zero arguments — the parameter
    // was unreachable even by a direct API call, not merely absent from the UI. `asOf` now echoed back
    // in the response so the UI can display exactly which date the buckets were computed against,
    // rather than silently defaulting.
    const asOf = parsed.query.asOf || undefined;
    return sendJson(res, 200, {ok:true, ageing: D.customerAgeing(asOf), buckets: D.AGE_BUCKETS, asOf: asOf || new Date().toISOString().slice(0,10)});
  }
  // Phase 23: /api/ar/invoice migrated to registerMutationRoute() — see the migration ledger.
  // Phase 22: /api/ar/receipt migrated to registerMutationRoute() — see the migration ledger.

  // ---------- AP ----------
  if(pathname==='/api/ap/open-items' && req.method==='GET'){
    const vid = parsed.query.vendorId;
    const scoped = new Set(['Admin','CEO','Accountant','FinanceManager','Purchase','Viewer']);
    if(!scoped.has(actor.role)) return deny(res, 403, `Role "${actor.role}" cannot view AP open items.`, {userId:actor.id, role:actor.role, path:pathname, vendorId:vid});
    return sendJson(res, 200, {ok:true, items: D.supplierOpenItems(vid)});
  }
  if(pathname==='/api/ap/ageing' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot view the full AP Ageing report.`, {userId:actor.id, role:actor.role, path:pathname});
    // Reporting Implementation Phase — same fix as /api/ar/ageing above: `asOf` was unreachable
    // even at the route layer.
    const asOf = parsed.query.asOf || undefined;
    return sendJson(res, 200, {ok:true, ageing: D.supplierAgeing(asOf), buckets: D.AGE_BUCKETS, asOf: asOf || new Date().toISOString().slice(0,10)});
  }
  // Phase 22: /api/ap/invoice and /api/ap/payment migrated to registerMutationRoute() — see the migration ledger.

  // ---------- Journal Voucher / Document Workflow ----------
  if(pathname==='/api/journal-drafts' && req.method==='GET'){
    return sendJson(res, 200, {ok:true, drafts: D.DB.jeDrafts});
  }
  // Phase 23: /api/journal/draft migrated to registerMutationRoute() — see the migration ledger.
  if(pathname.match(/^\/api\/journal\/[^/]+\/submit$/) && req.method==='POST'){
    if(!can(actor,'submit')) return deny(res, 403, `Role "${actor.role}" cannot submit documents.`, {userId:actor.id, role:actor.role, path:pathname});
    const id = pathname.split('/')[3];
    const r = D.submitDraft(id, actor);
    return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/journal\/[^/]+\/approve$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res, 403, `Role "${actor.role}" cannot approve documents.`, {userId:actor.id, role:actor.role, path:pathname});
    const id = pathname.split('/')[3];
    const r = D.approveDraft(id, actor);
    // Phase 9B fix: 403 is reserved for the can()/deny() authorization gate immediately above.
    // Once that gate passes, any failure returned by the domain function (wrong document status,
    // SoD self-approval, etc.) is a per-resource BUSINESS/STATE outcome, not a blanket
    // role-authorization denial — it belongs on 400, matching how ~30 other routes in this file
    // already treat the identical create/submit/reject pattern. Conflating the two under 403
    // made a retried "approve" on an already-approved document indistinguishable from "you can
    // never do this" — misleading to API consumers and to any security-matrix classification
    // that (correctly) treats 403 as the authorization signal.
    return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/journal\/[^/]+\/reject$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res, 403, `Role "${actor.role}" cannot reject documents.`, {userId:actor.id, role:actor.role, path:pathname});
    const id = pathname.split('/')[3];
    const r = D.rejectDraft(id, body.reason, actor);
    return sendJson(res, r.ok?200:400, r);
  }
  // Phase 24: /api/journal/:id/post migrated to registerMutationRoute() — see the migration ledger.
  if(pathname.match(/^\/api\/journal\/[^/]+\/cancel$/) && req.method==='POST'){
    if(!can(actor,'edit')) return deny(res, 403, `Role "${actor.role}" cannot cancel documents.`, {userId:actor.id, role:actor.role, path:pathname});
    const id = pathname.split('/')[3];
    const r = D.cancelDraft(id, actor);
    return sendJson(res, r.ok?200:400, r);
  }
  // Phase 24: /api/journal/:id/reverse migrated to registerMutationRoute() — see the migration ledger.

  // ---------- Audit / Export ----------
  if(pathname==='/api/audit-log' && req.method==='GET'){
    if(!(actor.role==='Admin' || actor.role==='CEO')) return deny(res, 403, `Role "${actor.role}" cannot view the audit log.`, {userId:actor.id, role:actor.role, path:pathname});
    let rows = D.DB.auditLog;
    const q = parsed.query;
    if(q.search){ const s = q.search.toLowerCase(); rows = rows.filter(a=>(a.type||'').toLowerCase().includes(s) || (a.reason||'').toLowerCase().includes(s) || (a.userId||'').toLowerCase().includes(s)); }
    const p = paginate([...rows].reverse(), q);
    // Phase 22 §22 — clarity fix (Phase 21's DR drill found this endpoint's name creates a false
    // impression of exhaustiveness). This log covers administrative/security/configuration/
    // exception events only (master data changes, period/future-date overrides, backups, self-
    // approval attempts, etc.). Every routine document's own Created/Submitted/Approved/Posted
    // lifecycle — the vast majority of daily activity — lives on that document's own `history[]`
    // array instead (see GET /api/journal-drafts, or the `history` field on any individual draft).
    // Both are real, both are complete for what they cover; this note exists so nobody has to
    // discover the distinction the hard way, as this engagement's own DR drill did.
    return sendJson(res, 200, {ok:true, auditLog: p.rows, total:p.total, page:p.page, pageSize:p.pageSize, hasMore:p.hasMore, paginated:p.paginated, loginHistory: D.DB.loginHistory,
      scopeNote: 'This log contains administrative/security/configuration/exception events only. For a routine transaction\'s own Created/Submitted/Approved/Posted history, see that document\'s own "history" field (GET /api/journal-drafts).'});
  }
  // Phase 13 POL-12: real export handling lives further down (after PROC_VIEW_ROLES/AS_VIEW_ROLES/
  // isProjectManagerOf/ticketAllowed have all actually executed in this request's top-to-bottom
  // pass — those are per-request `const`s, so a route check up here would hit a temporal-dead-
  // zone error even though the function containing them is hoisted). See the Phase 13 block
  // further down, placed alongside the other Phase 10/11/13 routes for the same reason.

  // ============================================================
  // Phase 6B — Lead → Estimation → Quotation → Won → Customer → Project → Baseline → Design
  // ============================================================
  const CRM_ROLES = new Set(['Admin','CEO','Sales']);

  if(pathname==='/api/leads' && req.method==='GET'){
    if(!(CRM_ROLES.has(actor.role) || actor.role==='Viewer')) return deny(res,403,`Role "${actor.role}" cannot view Leads.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.leads;
    if(actor.role==='Sales') rows = rows.filter(l=>l.salesOwnerId===actor.id);
    return sendJson(res,200,{ok:true, leads:rows, statuses:D.LEAD_STATUSES});
  }
  if(pathname==='/api/leads' && req.method==='POST'){
    if(!(CRM_ROLES.has(actor.role) && can(actor,'create'))) return deny(res,403,`Role "${actor.role}" cannot create Leads.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createLead({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/leads\/[^/]+\/activities$/) && req.method==='POST'){
    const leadId = pathname.split('/')[3];
    const lead = D.DB.leads.find(l=>l.id===leadId);
    if(!lead) return sendJson(res,404,{ok:false,error:'Lead not found.'});
    if(!D.canSeeLead(lead, actor)) return deny(res,403,`Role "${actor.role}" cannot access lead ${leadId} (not owner/not authorized scope).`,{userId:actor.id,role:actor.role,path:pathname,leadId});
    const r = D.addLeadActivity({leadId, ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/leads\/[^/]+\/status$/) && req.method==='POST'){
    const leadId = pathname.split('/')[3];
    const lead = D.DB.leads.find(l=>l.id===leadId);
    if(!lead) return sendJson(res,404,{ok:false,error:'Lead not found.'});
    if(!D.canSeeLead(lead, actor)) return deny(res,403,`Role "${actor.role}" cannot access lead ${leadId}.`,{userId:actor.id,role:actor.role,path:pathname,leadId});
    if(!can(actor,'edit')) return deny(res,403,`Role "${actor.role}" cannot change lead status.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.changeLeadStatus({leadId, newStatus:body.newStatus, actor}); return sendJson(res, r.ok?200:400, r);
  }

  const EST_VIEW_ROLES = new Set(['Admin','CEO','Estimator','Sales']);
  if(pathname==='/api/estimation-requests' && req.method==='GET'){
    if(!(EST_VIEW_ROLES.has(actor.role) || actor.role==='Viewer')) return deny(res,403,`Role "${actor.role}" cannot view Estimation Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.estimationRequests;
    if(actor.role==='Sales') rows = rows.filter(e=>{ const l=D.DB.leads.find(x=>x.id===e.leadId); return l && l.salesOwnerId===actor.id; });
    return sendJson(res,200,{ok:true, estimationRequests:rows, statuses:D.ESTIMATION_STATUSES});
  }
  if(pathname==='/api/estimation-requests' && req.method==='POST'){
    if(!(EST_VIEW_ROLES.has(actor.role) && can(actor,'create'))) return deny(res,403,`Role "${actor.role}" cannot create Estimation Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createEstimationRequest({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/estimation-requests\/[^/]+\/status$/) && req.method==='POST'){
    if(!can(actor,'edit')) return deny(res,403,`Role "${actor.role}" cannot change estimation status.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const r = D.setEstimationStatus({id, status:body.status, actor}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/costing-versions' && req.method==='GET'){
    if(!(EST_VIEW_ROLES.has(actor.role) || actor.role==='FinanceManager' || actor.role==='Viewer')) return deny(res,403,`Role "${actor.role}" cannot view Costing.`,{userId:actor.id,role:actor.role,path:pathname});
    const erId = parsed.query.estimationRequestId;
    let rows = D.DB.costingVersions.filter(c=>!erId || c.estimationRequestId===erId);
    // Field-level security (§11): Sales gets sellingPrice only, never the internal cost breakdown.
    if(actor.role==='Sales'){
      rows = rows.map(c=>({id:c.id, estimationRequestId:c.estimationRequestId, version:c.version, sellingPrice:c.sellingPrice, createdAt:c.createdAt}));
    }
    return sendJson(res,200,{ok:true, costingVersions:rows});
  }
  if(pathname==='/api/costing-versions' && req.method==='POST'){
    if(!(['Admin','CEO','Estimator'].includes(actor.role) && can(actor,'create'))) return deny(res,403,`Role "${actor.role}" cannot create costing.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createCostingVersion({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }

  const QTN_VIEW_ROLES = new Set(['Admin','CEO','FinanceManager','Accountant','Estimator','Sales']);
  if(pathname==='/api/quotations' && req.method==='GET'){
    if(!(QTN_VIEW_ROLES.has(actor.role) || actor.role==='Viewer')) return deny(res,403,`Role "${actor.role}" cannot view Quotations.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.quotations;
    if(actor.role==='Sales') rows = rows.filter(q=>{ const l=D.DB.leads.find(x=>x.id===q.leadId); return l && l.salesOwnerId===actor.id; });
    return sendJson(res,200,{ok:true, quotations:rows, statuses:D.QUOTATION_STATUSES});
  }
  // Phase 23: /api/quotations migrated to registerMutationRoute() — see the migration ledger.
  if(pathname.match(/^\/api\/quotations\/[^/]+\/submit$/) && req.method==='POST'){
    if(!can(actor,'submit')) return deny(res,403,`Role "${actor.role}" cannot submit quotations.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const r = D.submitQuotation({id, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/quotations\/[^/]+\/approve-discount$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot approve discounts.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const r = D.approveQuotationDiscount({id, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/quotations\/[^/]+\/revise$/) && req.method==='POST'){
    if(!can(actor,'edit')) return deny(res,403,`Role "${actor.role}" cannot revise quotations.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const r = D.reviseQuotation({id, changes:body.changes||{}, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/quotations\/[^/]+\/acceptance$/) && req.method==='POST'){
    if(!(CRM_ROLES.has(actor.role) && can(actor,'edit'))) return deny(res,403,`Role "${actor.role}" cannot record acceptance.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const r = D.recordAcceptance({quotationId:id, ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/quotations\/[^/]+\/won$/) && req.method==='POST'){
    if(!(['Admin','CEO','FinanceManager'].includes(actor.role))) return deny(res,403,`Role "${actor.role}" cannot execute the Won transition (requires commercial authority).`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const r = D.wonTransition({quotationId:id, ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/discount-approval-rules' && req.method==='GET'){
    return sendJson(res,200,{ok:true, rules: D.DB.discountApprovalRules});
  }

  if(pathname.match(/^\/api\/projects\/[^/]+\/advance-requirement$/) && req.method==='POST'){
    if(!(['Admin','CEO','FinanceManager'].includes(actor.role))) return deny(res,403,`Role "${actor.role}" cannot set advance requirements.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const r = D.setProjectAdvanceRequirement({projectId:id, amount:body.amount, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/projects\/[^/]+\/financial-readiness$/) && req.method==='GET'){
    const id = pathname.split('/')[3];
    const p = D.DB.projects.find(x=>x.id===id);
    if(!p) return sendJson(res,404,{ok:false,error:'Project not found.'});
    const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
    if(!fullAccess.has(actor.role) && !isProjectManagerOf(actor, id)){
      return deny(res,403,`Role "${actor.role}" cannot view financial readiness for ${id}.`,{userId:actor.id,role:actor.role,path:pathname,projectId:id});
    }
    return sendJson(res,200,{ok:true, readiness: D.projectFinancialReadiness(id)});
  }
  if(pathname==='/api/advances' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot record advances.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.draftCustomerAdvance({...body, createdByUserId:actor.id, createdByRole:actor.role}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/designs' && req.method==='POST'){
    // Design submission is a project/operational document, not a financial one — deliberately
    // NOT gated by the generic 'create' action (which correctly denies ProjectManager for
    // financial documents but would incorrectly deny them here too). Gated instead by project
    // assignment (business-rule authorization, per §28), same discipline as financial-readiness.
    if(!(['Admin','CEO'].includes(actor.role) || isProjectManagerOf(actor, body.projectId))){
      return deny(res,403,`Role "${actor.role}" cannot submit a design for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname,projectId:body.projectId});
    }
    const r = D.submitDesign({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/designs' && req.method==='GET'){
    const pid = parsed.query.projectId;
    let rows = D.DB.designs.filter(d=>!pid || d.projectId===pid);
    if(actor.role==='ProjectManager') rows = rows.filter(d=>isProjectManagerOf(actor,d.projectId));
    else if(!['Admin','CEO','Estimator','Viewer'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view designs.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, designs:rows, statuses:D.DESIGN_STATUSES});
  }
  if(pathname.match(/^\/api\/designs\/[^/]+\/review$/) && req.method==='POST'){
    if(!(['Admin','CEO','ProjectManager'].includes(actor.role))) return deny(res,403,`Role "${actor.role}" cannot review/approve designs.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const design = D.DB.designs.find(x=>x.id===id);
    if(design && actor.role==='ProjectManager' && !isProjectManagerOf(actor, design.projectId)){
      return deny(res,403,`ProjectManager not assigned to project ${design.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.reviewDesign({designId:id, status:body.status, remarks:body.remarks, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // POST /api/change-requests, submit/reject/revise/cancel all migrated to registerMutationRoute()
  // above. /approve migrated too (Project Variation Phase 2) — same legacy-if-block idempotency gap
  // this route always had (identical to the /create gap the Business Process Control Closure phase
  // already found and fixed), only now closed for approve as well. This if-block removed.

  if(pathname==='/api/customers' && req.method==='POST' && parsed.query.mode==='find-or-create'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot create customers.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.findOrCreateCustomer({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ============================================================
  // Phase 7 — Procurement → Inventory → Supplier Bill → AP → Payment → Manufacturing
  // ============================================================
  const PROC_CREATE_ROLES = new Set(['Admin','CEO','Purchase']);
  const PROC_VIEW_ROLES = new Set(['Admin','CEO','Purchase','FinanceManager','Accountant','Viewer']);

  // ---- Materials / Warehouses (master data, field-security on cost fields for unauthorized roles) ----
  if(pathname==='/api/materials' && req.method==='GET'){
    const costEligible = new Set(['Admin','CEO','Purchase','FinanceManager','Accountant','Estimator','Viewer']);
    const rows = D.DB.materials.map(m => costEligible.has(actor.role) ? m : {id:m.id, code:m.code, description:m.description, category:m.category, uom:m.uom, active:m.active});
    return sendJson(res,200,{ok:true, materials:rows});
  }
  // Phase 19 §4 — HSN is OPTIONAL master-data metadata on a material, never mandatory.
  if(pathname.match(/^\/api\/materials\/[^/]+\/hsn$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot set a material's HSN code.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setMaterialHSN({materialId:pathname.split('/')[3], hsnCode:body.hsnCode, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/warehouses' && req.method==='GET'){ return sendJson(res,200,{ok:true, warehouses:D.DB.warehouses}); }
  if(pathname==='/api/vendors/detail' && req.method==='GET'){
    // Bank details — a distinct, more sensitive field-security tier than the general vendor list (§38).
    const bankEligible = new Set(['Admin','CEO','FinanceManager','Accountant','Purchase','Viewer']);
    const rows = D.DB.vendors.map(v => bankEligible.has(actor.role) ? v : {id:v.id, name:v.name, category:v.category});
    return sendJson(res,200,{ok:true, vendors:rows});
  }

  // ---- Material Requirement ----
  if(pathname==='/api/material-requirements' && req.method==='GET'){
    let rows = D.DB.materialRequirements;
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    else if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Material Requirements.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, requirements:rows});
  }
  // POST /api/material-requirements migrated to registerMutationRoute() above (Project Variation
  // Phase 6) — this if-block removed.
  if(pathname.match(/^\/api\/material-requirements\/[^/]+\/submit$/) && req.method==='POST'){
    const target = D.DB.materialRequirements.find(x=>x.id===pathname.split('/')[3]);
    const authorized = target ? pmOrAdminCeo(actor, target.projectId) : ['Admin','CEO','ProjectManager'].includes(actor.role);
    if(!authorized) return deny(res,403,`Role "${actor.role}" cannot submit this Material Requirement.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitMaterialRequirement({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/material-requirements\/[^/]+\/approve$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot approve Material Requirements.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveMaterialRequirement({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---- Material Request ----
  if(pathname==='/api/material-requests' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view Material Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.materialRequests;
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, materialRequests:rows, statuses:D.MR_STATUSES});
  }
  if(pathname==='/api/material-requests' && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create Material Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createMaterialRequest({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/material-requests\/[^/]+\/submit$/) && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot submit Material Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitMaterialRequest({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/material-requests\/[^/]+\/approve$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot approve Material Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveMaterialRequest({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/material-requests\/[^/]+\/reject$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot reject Material Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectMaterialRequest({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---- RFQ / Supplier Quotation / Comparison ----
  if(pathname==='/api/rfqs' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view RFQs.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rfqs:D.DB.rfqs});
  }
  // POST /api/rfqs migrated to registerMutationRoute() above (Project Variation Phase 7) — this
  // if-block removed.
  if(pathname==='/api/supplier-quotations' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Supplier Quotations.`,{userId:actor.id,role:actor.role,path:pathname});
    const rfqId = parsed.query.rfqId;
    return sendJson(res,200,{ok:true, supplierQuotations:D.DB.supplierQuotations.filter(q=>!rfqId||q.rfqId===rfqId)});
  }
  if(pathname==='/api/supplier-quotations' && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot record Supplier Quotations.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordSupplierQuotation({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/supplier-comparisons' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Supplier Comparisons.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, comparisons:D.DB.supplierComparisons});
  }
  // POST /api/supplier-comparisons migrated to registerMutationRoute() above (Project Variation
  // Phase 7) — this if-block removed.
  if(pathname.match(/^\/api\/supplier-comparisons\/[^/]+\/approve$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot approve Supplier Comparisons.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveSupplierComparison({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---- Purchase Order ----
  if(pathname==='/api/purchase-orders' && req.method==='GET'){
    let rows = D.DB.purchaseOrders;
    if(actor.role==='ProjectManager') rows = rows.filter(p=>isProjectManagerOf(actor,p.projectId));
    else if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Purchase Orders.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, purchaseOrders:rows, statuses:D.PO_STATUSES});
  }
  // Phase 23: /api/purchase-orders migrated to registerMutationRoute() — see the migration ledger.
  if(pathname.match(/^\/api\/purchase-orders\/[^/]+\/submit$/) && req.method==='POST'){
    if(!can(actor,'submit')) return deny(res,403,`Role "${actor.role}" cannot submit Purchase Orders.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitPurchaseOrder({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/purchase-orders\/[^/]+\/approve$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot approve Purchase Orders.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approvePurchaseOrder({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/purchase-orders\/[^/]+\/reject$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot reject Purchase Orders.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectPurchaseOrder({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 24 Part C7 — cancel an ALREADY-APPROVED PO (releases its commitment). Same 'approve'
  // permission tier as reject/approve above — no new security concept.
  if(pathname.match(/^\/api\/purchase-orders\/[^/]+\/cancel$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot cancel an approved Purchase Order.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.cancelApprovedPurchaseOrder({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 24 Part C — Commitment view, project-linked, read-only (operational, not accounting).
  if(pathname==='/api/commitments' && req.method==='GET'){
    if(!isGLVisible(actor) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view commitments.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, ...D.projectCommitments(parsed.query.projectId||null)});
  }

  // ---- GRN ----
  if(pathname==='/api/grns' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view GRNs.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.grns;
    if(actor.role==='ProjectManager') rows = rows.filter(g=>isProjectManagerOf(actor,g.projectId));
    return sendJson(res,200,{ok:true, grns:rows});
  }
  // Phase 23: /api/grns migrated to registerMutationRoute() — see the migration ledger.

  // ---- Inventory ----
  if(pathname==='/api/inventory/stock' && req.method==='GET'){
    const materialId = parsed.query.materialId, warehouseId = parsed.query.warehouseId;
    return sendJson(res,200,{ok:true, stock: D.getStockLevel(materialId, warehouseId), movingAverageRate: D.getMovingAverageRate(materialId, warehouseId)});
  }
  if(pathname==='/api/inventory/movements' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view inventory movements.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.inventoryMovements;
    if(actor.role==='ProjectManager') rows = rows.filter(m=>m.projectId && isProjectManagerOf(actor,m.projectId));
    const materialId = parsed.query.materialId;
    if(materialId) rows = rows.filter(m=>m.materialId===materialId);
    if(parsed.query.warehouseId) rows = rows.filter(m=>m.warehouseId===parsed.query.warehouseId);
    if(parsed.query.projectId) rows = rows.filter(m=>m.projectId===parsed.query.projectId);
    if(parsed.query.search){ const s = parsed.query.search.toLowerCase(); rows = rows.filter(m=>(m.sourceId||'').toLowerCase().includes(s) || (m.sourceType||'').toLowerCase().includes(s)); }
    const p = paginate([...rows].reverse(), parsed.query);
    return sendJson(res,200,{ok:true, movements:p.rows, total:p.total, page:p.page, pageSize:p.pageSize, hasMore:p.hasMore, paginated:p.paginated});
  }

  // ---- Supplier Invoice (3-way matched) ----
  // Phase 27 — read-only projection powering the PO-aware Supplier Bill screen (Part 3): given a
  // supplier, list every GRN line that still has an invoiceable balance. Same 'create' gate as
  // actually creating the bill — if a role can't bill, it doesn't need to see what's billable.
  if(pathname==='/api/ap/invoiceable-grns' && req.method==='GET'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot view invoiceable GRNs.`,{userId:actor.id,role:actor.role,path:pathname});
    const vendorId = parsed.query.vendorId;
    if(!vendorId) return sendJson(res,400,{ok:false, error:'vendorId is required.'});
    return sendJson(res,200,{ok:true, grns: D.invoiceableGRNsForVendor(vendorId)});
  }
  if(pathname==='/api/ap/invoice-from-po' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot create supplier invoices.`,{userId:actor.id,role:actor.role,path:pathname});
    if(body.authorizedException && !['Admin','CEO','FinanceManager'].includes(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot authorize a three-way-match exception.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.draftSupplierInvoiceFromPO({...body, createdByUserId:actor.id, createdByRole:actor.role});
    return sendJson(res, r.ok?200:400, r);
  }
  // Phase 23: /api/purchase-returns migrated to registerMutationRoute() — see the migration ledger.
  // Phase 22: /api/supplier-credit-notes migrated to registerMutationRoute() — see the migration ledger.
  // Phase 24 Part B — Supplier Debit Note. SAME permission gate as Supplier Credit Note above —
  // no new security framework, per instruction.
  if(pathname==='/api/supplier-debit-notes/reasons' && req.method==='GET'){
    return sendJson(res,200,{ok:true, reasons:D.SUPPLIER_DEBIT_NOTE_REASONS});
  }
  // Phase 22: /api/supplier-debit-notes migrated to registerMutationRoute() — see the migration ledger.

  // ---- Material Issue ----
  // Phase 30 — read-only lookup powering the Material Issue screen's live BOM-quota display
  // (used/budget/remaining/% for a project+material), same permission tier as viewing the
  // project's own cost breakdown/material issues.
  if(pathname==='/api/bom-quota' && req.method==='GET'){
    const projectId = parsed.query.projectId, materialId = parsed.query.materialId;
    if(!projectId || !materialId) return sendJson(res,400,{ok:false, error:'projectId and materialId are both required.'});
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor, projectId)) && !PROC_VIEW_ROLES.has(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot view BOM quota for project ${projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    return sendJson(res,200,{ok:true, quota: D.materialBomQuota({projectId, materialId})});
  }
  // Phase 23: /api/material-issues migrated to registerMutationRoute() — see the migration ledger.

  // ---- Project Cost Breakdown (Committed/Received/Invoiced/Paid/Consumed) ----
  if(pathname.match(/^\/api\/projects\/[^/]+\/cost-breakdown$/) && req.method==='GET'){
    const id = pathname.split('/')[3];
    const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
    if(!fullAccess.has(actor.role) && !isProjectManagerOf(actor, id)) return deny(res,403,`Role "${actor.role}" cannot view cost breakdown for ${id}.`,{userId:actor.id,role:actor.role,path:pathname,projectId:id});
    return sendJson(res,200,{ok:true, breakdown: D.projectCostBreakdown(id)});
  }
  // Phase 11 §4 — Project Financial 360, same access tier as cost-breakdown (it's a superset).
  if(pathname.match(/^\/api\/projects\/[^/]+\/financial-360$/) && req.method==='GET'){
    const id = pathname.split('/')[3];
    const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
    if(!fullAccess.has(actor.role) && !isProjectManagerOf(actor, id)) return deny(res,403,`Role "${actor.role}" cannot view the financial 360 for ${id}.`,{userId:actor.id,role:actor.role,path:pathname,projectId:id});
    const r = D.projectFinancial360(id);
    return sendJson(res, r.ok?200:404, r);
  }

  // ---- Change Request / Project Variation ----
  // Project Variation Phase 2 — genuinely never had a GET route at all before this phase (confirmed
  // by inspection). Same broad `view` gate as most other read routes in this file.
  if(pathname==='/api/change-requests' && req.method==='GET'){
    if(!can(actor,'view')) return deny(res,403,`Role "${actor.role}" cannot view Change Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.changeRequests;
    if(parsed.query.projectId) rows = rows.filter(c=>c.projectId===parsed.query.projectId);
    return sendJson(res,200,{ok:true, changeRequests:rows});
  }
  // Project Variation Phase 4 — bidirectional traceability: given a CR, which invoices consumed it.
  if(pathname.match(/^\/api\/change-requests\/[^/]+\/consumption$/) && req.method==='GET'){
    if(!can(actor,'view')) return deny(res,403,`Role "${actor.role}" cannot view Change Request consumption.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const cr = D.DB.changeRequests.find(c=>c.id===id);
    if(!cr) return sendJson(res,404,{ok:false, error:'Change Request not found.'});
    return sendJson(res,200,{ok:true, changeRequestId:id, revenueImpact:cr.revenueImpact, consumedRevenue:cr.consumedRevenue,
      availableRevenue: Math.round((cr.revenueImpact - cr.consumedRevenue)*100)/100, invoices: D.invoicesConsumingChangeRequest(id)});
  }
  // Project Variation Phase 5 — bidirectional traceability, forward: given a CR, which BOMs and
  // POs (with their GRNs) it authorized. Consumption (billing) stays on the Phase 4 route above;
  // this is the execution/procurement side of the same CR.
  if(pathname.match(/^\/api\/change-requests\/[^/]+\/execution$/) && req.method==='GET'){
    if(!can(actor,'view')) return deny(res,403,`Role "${actor.role}" cannot view Change Request execution.`,{userId:actor.id,role:actor.role,path:pathname});
    const id = pathname.split('/')[3];
    const cr = D.DB.changeRequests.find(c=>c.id===id);
    if(!cr) return sendJson(res,404,{ok:false, error:'Change Request not found.'});
    return sendJson(res,200,{ok:true, changeRequestId:id, boms: D.bomsForChangeRequest(id), purchaseOrders: D.posForChangeRequest(id),
      materialRequirements: D.materialRequirementsForChangeRequest(id)});
  }
  // Project Variation Phase 7 §14 — five independent value figures (never summed as if interchangeable).
  if(pathname.match(/^\/api\/change-requests\/[^/]+\/procurement-value$/) && req.method==='GET'){
    if(!can(actor,'view')) return deny(res,403,`Role "${actor.role}" cannot view Change Request procurement value.`,{userId:actor.id,role:actor.role,path:pathname});
    const summary = D.changeRequestProcurementValueSummary(pathname.split('/')[3]);
    if(!summary) return sendJson(res,404,{ok:false, error:'Change Request not found.'});
    return sendJson(res,200,{ok:true, ...summary});
  }
  // Project Variation Phase 7 §15 — only reliably-traceable cost categories included; labour/other
  // direct cost explicitly reported NOT TRACEABLE, never allocated or defaulted to zero.
  if(pathname.match(/^\/api\/change-requests\/[^/]+\/profitability$/) && req.method==='GET'){
    if(!can(actor,'view')) return deny(res,403,`Role "${actor.role}" cannot view Change Request profitability.`,{userId:actor.id,role:actor.role,path:pathname});
    const prof = D.changeRequestVariationProfitability(pathname.split('/')[3]);
    if(!prof) return sendJson(res,404,{ok:false, error:'Change Request not found.'});
    return sendJson(res,200,{ok:true, ...prof});
  }
  // Project Variation Phase 7 §5/§10 — the single authoritative BASELINE/VARIATION/UNKNOWN classifier.
  if(pathname==='/api/procurement-scope' && req.method==='GET'){
    if(!can(actor,'view')) return deny(res,403,`Role "${actor.role}" cannot view procurement scope.`,{userId:actor.id,role:actor.role,path:pathname});
    if(!parsed.query.docType || !parsed.query.docId) return sendJson(res,400,{ok:false, error:'docType and docId query params are required.'});
    return sendJson(res,200,{ok:true, ...D.resolveProcurementScope({docType:parsed.query.docType, docId:parsed.query.docId})});
  }

  // ---- BOM / Production Order ----
  if(pathname==='/api/boms' && req.method==='GET'){ return sendJson(res,200,{ok:true, boms:D.DB.boms}); }
  // POST /api/boms migrated to registerMutationRoute() above (Project Variation Phase 5) — this
  // if-block removed.
  if(pathname.match(/^\/api\/boms\/[^/]+\/approve$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot approve BOMs.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveBOM({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  // BOM Governance phase — Submit/Reject complete the Draft->Submitted->Approved/Rejected lifecycle.
  if(pathname.match(/^\/api\/boms\/[^/]+\/submit$/) && req.method==='POST'){
    if(!['Admin','CEO','Estimator'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot submit BOMs.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitBOM({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/boms\/[^/]+\/reject$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot reject BOMs.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectBOM({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // BOM Governance phase — project-level BOM entitlement (NOT Production-Order-derived; see
  // D.projectBomEntitlement()'s own header comment for why this replaced /api/bom-quota's basis for
  // ordinary Material Issue). /api/bom-quota is kept unchanged for the Production Order module.
  if(pathname==='/api/bom-entitlement' && req.method==='GET'){
    const projectId = parsed.query.projectId, materialId = parsed.query.materialId, siteId = parsed.query.siteId||null;
    if(!projectId || !materialId) return sendJson(res,400,{ok:false, error:'projectId and materialId are both required.'});
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor, projectId)) && !PROC_VIEW_ROLES.has(actor.role) && actor.role!=='SiteInCharge'){
      return deny(res,403,`Role "${actor.role}" cannot view BOM entitlement for project ${projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    return sendJson(res,200,{ok:true, entitlement: D.projectBomEntitlement({projectId, materialId, siteId})});
  }
  // BOM Governance phase — Excess Material Issue Approval (genuine second-person maker-checker,
  // replacing the old self-service overrideReason bypass for BOM-entitlement excess specifically).
  if(pathname==='/api/excess-material-issue-requests' && req.method==='GET'){
    let list = D.DB.excessMaterialIssueRequests;
    if(parsed.query.status) list = list.filter(x=>x.status===parsed.query.status);
    if(parsed.query.projectId) list = list.filter(x=>x.projectId===parsed.query.projectId);
    if(actor.role==='ProjectManager') list = list.filter(x=>isProjectManagerOf(actor, x.projectId) || x.requestedBy===actor.id);
    return sendJson(res,200,{ok:true, excessRequests:list});
  }
  if(pathname==='/api/excess-material-issue-requests' && req.method==='POST'){
    if(!D.assertCanCreateMaterialIssue(actor, body).ok) return deny(res,403,`Role "${actor.role}" is not authorized to raise an Excess Material Issue request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createExcessMaterialIssueRequest({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/excess-material-issue-requests\/[^/]+\/approve$/) && req.method==='POST'){
    if(!D.assertCanApproveExcessMaterialIssue(actor).ok) return deny(res,403,`Role "${actor.role}" cannot approve an Excess Material Issue request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveExcessMaterialIssueRequest({id:pathname.split('/')[3], overrideReason:body.overrideReason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/excess-material-issue-requests\/[^/]+\/reject$/) && req.method==='POST'){
    if(!D.assertCanApproveExcessMaterialIssue(actor).ok) return deny(res,403,`Role "${actor.role}" cannot reject an Excess Material Issue request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectExcessMaterialIssueRequest({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/excess-material-issue-requests\/[^/]+\/cancel$/) && req.method==='POST'){
    // Deliberately NOT gated on can(actor,'create') — ProjectManager, the role most likely to be
    // cancelling their OWN request, has create:false in ROLE_ACTIONS (their material-issue rights
    // come from the separate isProjectManagerOf() special-case, not the generic 'create' tag) and
    // would be wrongly blocked by that check. Only a genuine non-business role (Viewer) is denied
    // here at the route layer; D.cancelExcessMaterialIssueRequest() is the real authority for
    // everyone else — only the original requester, or Admin/CEO, may actually cancel.
    if(actor.role==='Viewer') return deny(res,403,`Role "${actor.role}" cannot cancel an Excess Material Issue request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.cancelExcessMaterialIssueRequest({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  // P0-2 FIX — Excess Billing Approval (genuine second-person maker-checker for invoicing beyond
  // the project's approved commercial ceiling), same shape as Excess Material Issue Approval above.
  if(pathname.match(/^\/api\/projects\/[^/]+\/billing-ceiling$/) && req.method==='GET'){
    const projectId = pathname.split('/')[3];
    const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer','Sales']);
    if(!fullAccess.has(actor.role) && !isProjectManagerOf(actor, projectId)) return deny(res,403,`Role "${actor.role}" cannot view the billing ceiling for ${projectId}.`,{userId:actor.id,role:actor.role,path:pathname,projectId});
    const ceiling = D.projectBillingCeiling(projectId);
    if(!ceiling) return sendJson(res,404,{ok:false, error:'Project not found.'});
    return sendJson(res,200,{ok:true, ceiling});
  }
  if(pathname==='/api/excess-billing-approvals' && req.method==='GET'){
    let list = D.DB.excessBillingApprovals;
    if(parsed.query.status) list = list.filter(x=>x.status===parsed.query.status);
    if(parsed.query.projectId) list = list.filter(x=>x.projectId===parsed.query.projectId);
    if(actor.role==='ProjectManager') list = list.filter(x=>isProjectManagerOf(actor, x.projectId) || x.requestedBy===actor.id);
    return sendJson(res,200,{ok:true, excessBillingApprovals:list});
  }
  if(pathname==='/api/excess-billing-approvals' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" is not authorized to raise an Excess Billing Approval request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createExcessBillingApprovalRequest({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/excess-billing-approvals\/[^/]+\/approve$/) && req.method==='POST'){
    if(!D.assertCanApproveExcessBilling(actor).ok) return deny(res,403,`Role "${actor.role}" cannot approve an Excess Billing Approval request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveExcessBillingApprovalRequest({id:pathname.split('/')[3], overrideReason:body.overrideReason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/excess-billing-approvals\/[^/]+\/reject$/) && req.method==='POST'){
    if(!D.assertCanApproveExcessBilling(actor).ok) return deny(res,403,`Role "${actor.role}" cannot reject an Excess Billing Approval request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectExcessBillingApprovalRequest({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/excess-billing-approvals\/[^/]+\/cancel$/) && req.method==='POST'){
    if(actor.role==='Viewer') return deny(res,403,`Role "${actor.role}" cannot cancel an Excess Billing Approval request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.cancelExcessBillingApprovalRequest({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  // BOM Governance phase — real BOM consumption report (entitlement-based, not Production-Order-
  // derived — see D.bomConsumptionReport()'s header comment).
  if(pathname==='/api/reports/bom-consumption' && req.method==='GET'){
    const projectId = parsed.query.projectId;
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor, projectId)) && !PROC_VIEW_ROLES.has(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot view the BOM Consumption report for project ${projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.bomConsumptionReport(projectId); return sendJson(res, r.ok?200:400, r);
  }

  // ---- Phase 5 — Material Analytics & Cross-Dimensional Reporting (all read-only) ----
  // Same view-role convention as every other analytics route in this file (PROC_VIEW_ROLES =
  // Admin/CEO/Purchase/FinanceManager/Accountant/Viewer), extended with SiteInCharge for the two
  // material-level reports (a site store user's real day-to-day question — "what's on my site
  // right now") and with ProjectManager, restricted to their own project, for the three
  // project-scoped reports (same pattern as /api/bom-entitlement above).
  const MATERIAL_ANALYTICS_ROLES = new Set([...PROC_VIEW_ROLES, 'SiteInCharge']);
  if(pathname==='/api/reports/material-flow' && req.method==='GET'){
    if(!MATERIAL_ANALYTICS_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Material Analysis.`,{userId:actor.id,role:actor.role,path:pathname});
    const {materialId, warehouseId, siteId, dateFrom, dateTo} = parsed.query;
    const r = D.materialMovementFlow({materialId, warehouseId:warehouseId||undefined, siteId:siteId||undefined, dateFrom, dateTo});
    return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/reports/material-rate-history' && req.method==='GET'){
    if(!MATERIAL_ANALYTICS_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Material Rate History.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.materialRateHistory({materialId:parsed.query.materialId, vendorId:parsed.query.vendorId||undefined});
    return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/reports/material-by-vendor' && req.method==='GET'){
    if(!MATERIAL_ANALYTICS_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Material x Vendor.`,{userId:actor.id,role:actor.role,path:pathname});
    const {materialId, vendorId, dateFrom, dateTo} = parsed.query;
    return sendJson(res,200, D.materialByVendor({materialId:materialId||undefined, vendorId:vendorId||undefined, dateFrom, dateTo}));
  }
  if(pathname==='/api/reports/material-warehouse-vs-site' && req.method==='GET'){
    if(!MATERIAL_ANALYTICS_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Warehouse vs Site Analysis.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.warehouseVsSiteAnalysis(parsed.query.materialId); return sendJson(res, r.ok?200:400, r);
  }
  // material-by-project and material-by-project-vendor carry a real project dimension — a
  // ProjectManager may view them for their OWN project only, same rule as material-by-project's
  // sibling reports elsewhere in this file; every other view role sees any project.
  if(pathname==='/api/reports/material-by-project' && req.method==='GET'){
    const {materialId, projectId, dateFrom, dateTo} = parsed.query;
    if(!(actor.role==='ProjectManager' && projectId && isProjectManagerOf(actor, projectId)) && !MATERIAL_ANALYTICS_ROLES.has(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot view Material x Project.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    return sendJson(res,200, D.materialByProject({materialId:materialId||undefined, projectId:projectId||undefined, dateFrom, dateTo}));
  }
  if(pathname==='/api/reports/material-by-project-vendor' && req.method==='GET'){
    const {materialId, projectId, vendorId, dateFrom, dateTo} = parsed.query;
    if(!(actor.role==='ProjectManager' && projectId && isProjectManagerOf(actor, projectId)) && !MATERIAL_ANALYTICS_ROLES.has(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot view Material x Project x Vendor.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    return sendJson(res,200, D.materialByProjectVendor({materialId:materialId||undefined, projectId:projectId||undefined, vendorId:vendorId||undefined, dateFrom, dateTo}));
  }
  if(pathname==='/api/reports/vendor-project-matrix' && req.method==='GET'){
    const {vendorId, projectId, dateFrom, dateTo, status} = parsed.query;
    if(!(actor.role==='ProjectManager' && projectId && isProjectManagerOf(actor, projectId)) && !PROC_VIEW_ROLES.has(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot view Vendor x Project.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    return sendJson(res,200, D.vendorProjectMatrix({vendorId:vendorId||undefined, projectId:projectId||undefined, dateFrom, dateTo, status}));
  }
  if(pathname==='/api/reports/project-material-plan-vs-actual' && req.method==='GET'){
    const projectId = parsed.query.projectId;
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor, projectId)) && !PROC_VIEW_ROLES.has(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot view Project x Material for ${projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.projectMaterialPlanVsActual(projectId); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/reports/project-variation-summary' && req.method==='GET'){
    const projectId = parsed.query.projectId;
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor, projectId)) && !can(actor,'view')){
      return deny(res,403,`Role "${actor.role}" cannot view Project x Variation for ${projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    if(!projectId || !D.DB.projects.find(p=>p.id===projectId)) return sendJson(res,400,{ok:false, error:'A valid project is required.'});
    return sendJson(res,200, D.projectVariationSummary(projectId));
  }

  if(pathname==='/api/production-orders' && req.method==='GET'){ return sendJson(res,200,{ok:true, productionOrders:D.DB.productionOrders}); }
  if(pathname==='/api/production-orders' && req.method==='POST'){
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor, body.projectId)) && !['Admin','CEO'].includes(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot create a Production Order for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.createProductionOrder({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 9B fix: issue-material/complete/hold/resume/cancel/close had NO authorization gate at
  // all — any authenticated role could call them on any real production order (issue-material
  // in particular posts a real GL entry and consumes real inventory). Each now requires the
  // same Admin/CEO-or-assigned-PM rule the order's own creation already required.
  function prodOrderAllowed(actor, id){ const prod = D.DB.productionOrders.find(x=>x.id===id); return prod ? pmOrAdminCeo(actor, prod.projectId) : ['Admin','CEO','ProjectManager'].includes(actor.role); }
  if(pathname.match(/^\/api\/production-orders\/[^/]+\/issue-material$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!prodOrderAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot issue material for this production order.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.issueProductionMaterial({productionOrderId:id, warehouseId:body.warehouseId, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 25: /api/production-orders/:id/labour-cost migrated to registerMutationRoute().
  if(pathname.match(/^\/api\/production-orders\/[^/]+\/complete$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!prodOrderAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot complete this production order.`,{userId:actor.id,role:actor.role,path:pathname});
    // ERP AUDIT FIX (ERP-028) — this route never forwarded body.rejectedQty to the domain function
    // at all, so a rejected quantity could never be recorded through the API even though
    // completeProductionOrder() has always accepted the parameter — found while adding this
    // audit's rejectedQty validation, which could never have been exercised through this route.
    const r = D.completeProductionOrder({id, actualQty:body.actualQty, rejectedQty:body.rejectedQty, actor}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/po-approval-rules' && req.method==='GET'){ return sendJson(res,200,{ok:true, rules:D.DB.poApprovalRules}); }

  // ---- Production Order lifecycle extensions ----
  if(pathname.match(/^\/api\/production-orders\/[^/]+\/hold$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!prodOrderAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot hold this production order.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.holdProductionOrder({id, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/production-orders\/[^/]+\/resume$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!prodOrderAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot resume this production order.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.resumeProductionOrder({id, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/production-orders\/[^/]+\/cancel$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!prodOrderAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot cancel this production order.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.cancelProductionOrder({id, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/production-orders\/[^/]+\/close$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!prodOrderAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot close this production order.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.closeProductionOrder({id, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ============================================================
  // Phase 8 — Dispatch → Delivery → Installation → QC → Snag → Handover → Billing → AR
  // ============================================================
  const EXEC_CREATE_ROLES = new Set(['Admin','CEO','Purchase']);
  function execAllowed(actor, projectId){ return EXEC_CREATE_ROLES.has(actor.role) || (actor.role==='ProjectManager' && isProjectManagerOf(actor, projectId)); }

  if(pathname==='/api/dispatches' && req.method==='GET'){
    let rows = D.DB.dispatches;
    if(actor.role==='ProjectManager') rows = rows.filter(d=>isProjectManagerOf(actor,d.projectId));
    else if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Dispatches.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, dispatches:rows, statuses:D.DISPATCH_STATUSES});
  }
  if(pathname==='/api/dispatches' && req.method==='POST'){
    if(!execAllowed(actor, body.projectId)) return deny(res,403,`Role "${actor.role}" cannot create a dispatch for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createDispatch({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 9B fix: /ready and /dispatch had NO authorization gate at all — any authenticated
  // role could mark any dispatch Ready or Dispatched. /approve was already correctly gated
  // (finance-tier sign-off, intentionally not project-scoped) and is unchanged.
  function dispatchAllowed(actor, id){ const dsp = D.DB.dispatches.find(x=>x.id===id); return dsp ? execAllowed(actor, dsp.projectId) : (EXEC_CREATE_ROLES.has(actor.role) || actor.role==='ProjectManager'); }
  if(pathname.match(/^\/api\/dispatches\/[^/]+\/ready$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!dispatchAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot mark this dispatch ready.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.markDispatchReady({id, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/dispatches\/[^/]+\/approve$/) && req.method==='POST'){
    if(!can(actor,'approve')) return deny(res,403,`Role "${actor.role}" cannot approve dispatches.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveDispatch({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/dispatches\/[^/]+\/dispatch$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!dispatchAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot mark this dispatch Dispatched.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.markDispatched({id, actor}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/deliveries' && req.method==='GET'){
    let rows = D.DB.deliveries;
    if(actor.role==='ProjectManager') rows = rows.filter(d=>isProjectManagerOf(actor,d.projectId));
    return sendJson(res,200,{ok:true, deliveries:rows});
  }
  if(pathname==='/api/deliveries' && req.method==='POST'){
    const dsp = D.DB.dispatches.find(x=>x.id===body.dispatchId);
    if(!dsp || !execAllowed(actor, dsp.projectId)) return deny(res,403,`Role "${actor.role}" cannot confirm this delivery.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createDelivery({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/installations' && req.method==='GET'){
    let rows = D.DB.installations;
    if(actor.role==='ProjectManager') rows = rows.filter(i=>isProjectManagerOf(actor,i.projectId));
    return sendJson(res,200,{ok:true, installations:rows, statuses:D.INSTALLATION_STATUSES});
  }
  if(pathname==='/api/installations' && req.method==='POST'){
    if(!execAllowed(actor, body.projectId)) return deny(res,403,`Role "${actor.role}" cannot create an installation for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createInstallation({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/installations\/[^/]+\/progress$/) && req.method==='POST'){
    const inst = D.DB.installations.find(x=>x.id===pathname.split('/')[3]);
    if(!inst || !execAllowed(actor, inst.projectId)) return deny(res,403,`Role "${actor.role}" cannot update this installation.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.updateInstallationProgress({id:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 25: /api/installations/:id/labour-cost migrated to registerMutationRoute().

  if(pathname==='/api/qc-checklists' && req.method==='GET'){
    let rows = D.DB.qcChecklists;
    if(actor.role==='ProjectManager') rows = rows.filter(q=>isProjectManagerOf(actor,q.projectId));
    return sendJson(res,200,{ok:true, qcChecklists:rows});
  }
  if(pathname==='/api/qc-checklists' && req.method==='POST'){
    if(!execAllowed(actor, body.projectId)) return deny(res,403,`Role "${actor.role}" cannot create a QC checklist for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createQCChecklist({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/qc-checklists\/[^/]+\/result$/) && req.method==='POST'){
    const qc = D.DB.qcChecklists.find(x=>x.id===pathname.split('/')[3]);
    if(!qc || !execAllowed(actor, qc.projectId)) return deny(res,403,`Role "${actor.role}" cannot submit this QC result.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitQCResult({id:pathname.split('/')[3], items:body.items, actor}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/snags' && req.method==='GET'){
    let rows = D.DB.snags;
    if(actor.role==='ProjectManager') rows = rows.filter(s=>isProjectManagerOf(actor,s.projectId));
    return sendJson(res,200,{ok:true, snags:rows, statuses:D.SNAG_STATUSES, severities:D.SNAG_SEVERITIES});
  }
  if(pathname==='/api/snags' && req.method==='POST'){
    if(!execAllowed(actor, body.projectId)) return deny(res,403,`Role "${actor.role}" cannot create a snag for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createSnag({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 9B fix: assign/resolve/verify/close had NO authorization gate at all — any
  // authenticated role could manipulate any project's snag lifecycle. verifySnag's own
  // internal self-verification SoD check is unrelated and untouched; this adds the missing
  // baseline "do you have execution authority on this project at all" check underneath it.
  // Snag governance also allows any role with organizational approval authority (Admin/CEO/
  // FinanceManager, via can(actor,'approve')) in addition to execAllowed — this preserves the
  // Phase 8 design intent that snag VERIFICATION is meant to be done by someone independent of
  // the execution chain (Phase 8's own tests use FinanceManager as that independent verifier,
  // deliberately outside Purchase/PM). Narrowing this to execAllowed-only would have silently
  // broken that already-tested, already-correct behavior while fixing the real gap (any role
  // at all, with zero relationship to the project, could act) — found via regression after the
  // initial fix, not shipped without re-testing.
  function snagAllowed(actor, id){ const s = D.DB.snags.find(x=>x.id===id); const pid = s ? s.projectId : null; return s ? (execAllowed(actor, pid) || can(actor,'approve')) : (EXEC_CREATE_ROLES.has(actor.role) || actor.role==='ProjectManager' || can(actor,'approve')); }
  if(pathname.match(/^\/api\/snags\/[^/]+\/assign$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!snagAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot assign this snag.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.assignSnag({id, assignedTo:body.assignedTo, dueDate:body.dueDate, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/snags\/[^/]+\/resolve$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!snagAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot resolve this snag.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.resolveSnag({id, resolution:body.resolution, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/snags\/[^/]+\/verify$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!snagAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot verify this snag.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.verifySnag({id, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/snags\/[^/]+\/close$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!snagAllowed(actor, id)) return deny(res,403,`Role "${actor.role}" cannot close this snag.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.closeSnag({id, actor}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/handovers' && req.method==='GET'){
    let rows = D.DB.handovers;
    if(actor.role==='ProjectManager') rows = rows.filter(h=>isProjectManagerOf(actor,h.projectId));
    return sendJson(res,200,{ok:true, handovers:rows});
  }
  if(pathname==='/api/handovers' && req.method==='POST'){
    if(!execAllowed(actor, body.projectId)) return deny(res,403,`Role "${actor.role}" cannot create a handover for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createHandover({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname==='/api/billing-milestones' && req.method==='GET'){
    let rows = D.DB.billingMilestones;
    if(actor.role==='ProjectManager') rows = rows.filter(m=>isProjectManagerOf(actor,m.projectId));
    else if(!['Admin','CEO','FinanceManager','Accountant','Sales','Viewer'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view billing milestones.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, milestones:rows, types:D.MILESTONE_TYPES});
  }
  if(pathname==='/api/billing-milestones' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager','Accountant','Sales'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create billing milestones.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createBillingMilestone({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/billing-milestones\/[^/]+\/ready$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot confirm a milestone is ready to bill.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.markMilestoneReady({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/ar/invoice-from-milestone' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot create invoices.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.draftCustomerInvoiceFromMilestone({...body, createdByUserId:actor.id, createdByRole:actor.role}); return sendJson(res, r.ok?200:400, r);
  }

  if(pathname.match(/^\/api\/projects\/[^/]+\/closure-readiness$/) && req.method==='GET'){
    const id = pathname.split('/')[3];
    const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
    if(!fullAccess.has(actor.role) && !isProjectManagerOf(actor, id)) return deny(res,403,`Role "${actor.role}" cannot view closure readiness for ${id}.`,{userId:actor.id,role:actor.role,path:pathname,projectId:id});
    return sendJson(res,200,{ok:true, readiness: D.projectClosureReadiness(id)});
  }
  if(pathname.match(/^\/api\/projects\/[^/]+\/close$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot close a project.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.closeProject({projectId:pathname.split('/')[3], actor, override:body.override, overrideReason:body.overrideReason}); return sendJson(res, r.ok?200:400, r);
  }

  // ============================================================
  // Phase 10 — After-Sales: Warranty → Complaint → Ticket → Visit → Diagnosis →
  // Material/Labour → Chargeable Billing / AMC → CAPA
  // ============================================================
  // Reuses EVERY existing security primitive above (can/deny/isProjectManagerOf/execAllowed) —
  // no new role, no new numbering, no new posting path. Per the Phase 9B lesson (14 lifecycle
  // endpoints were found completely ungated), EVERY mutating action below — not just creation —
  // has its own explicit gate from the start.
  const AS_VIEW_ROLES = new Set(['Admin','CEO','FinanceManager','Accountant','Sales','Viewer']);
  const AS_SUPERVISE_ROLES = new Set(['Admin','CEO','FinanceManager']); // triage/classification/CAPA judgment tier
  // Operational execution tier for after-sales (visit/material/ticket work) — deliberately
  // Admin/CEO/PM-assigned only (no Purchase): unlike procurement/dispatch, after-sales service
  // work belongs to the project's own team, not the procurement function. Named distinctly from
  // execAllowed (Phase 8) since the eligible role SET is genuinely different, not a duplicate.
  function afterSalesAllowed(actor, projectId){ return ['Admin','CEO'].includes(actor.role) || (actor.role==='ProjectManager' && isProjectManagerOf(actor, projectId)); }
  function customerVisible(actor, customerId){
    if(AS_VIEW_ROLES.has(actor.role)){
      if(actor.role==='Sales') return (actor.assignedCustomers||[]).includes(customerId);
      return true;
    }
    if(actor.role==='ProjectManager'){ const p = D.DB.projects.find(x=>x.customerId===customerId); return p && isProjectManagerOf(actor, p.id); }
    return false;
  }

  // ---- Warranty ----
  if(pathname==='/api/warranties' && req.method==='GET'){
    let rows = D.DB.warranties;
    if(actor.role==='ProjectManager') rows = rows.filter(w=>isProjectManagerOf(actor,w.projectId));
    else if(actor.role==='Sales') rows = rows.filter(w=>(actor.assignedCustomers||[]).includes(w.customerId));
    else if(!AS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view warranties.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, warranties: rows.map(w=>({...w, effectiveStatus:D.warrantyEffectiveStatus(w)}))});
  }
  if(pathname==='/api/warranties' && req.method==='POST'){
    if(!afterSalesAllowed(actor, body.projectId) && !['FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create a warranty for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createWarranty({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 25 §8/§23 — the static route-safety scanner flagged these two: they had NO route-level
  // check at all. Live-tested before touching anything: Viewer was already correctly rejected,
  // because voidWarranty()/cancelWarranty() enforce ['Admin','CEO','FinanceManager'] internally —
  // not a real vulnerability, but a real architectural risk (single point of protection, invisible
  // to route-level static analysis, and a 400 instead of a 403 for an authorization failure). The
  // check below is added for defense-in-depth and correct status-code semantics, mirroring the
  // EXACT role list the domain function already enforces — not a new, second, independently
  // maintained rule.
  if(pathname.match(/^\/api\/warranties\/[^/]+\/void$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot void a warranty.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.voidWarranty({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/warranties\/[^/]+\/cancel$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot cancel a warranty.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.cancelWarranty({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/warranties/eligibility' && req.method==='POST'){
    if(!AS_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot check warranty eligibility.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.warrantyEligibility({...body}); return sendJson(res,200,{ok:true, ...r});
  }

  // ---- Complaint ----
  if(pathname==='/api/complaints' && req.method==='GET'){
    let rows = D.DB.complaints;
    if(actor.role==='ProjectManager') rows = rows.filter(c=>c.projectId && isProjectManagerOf(actor,c.projectId));
    else if(actor.role==='Sales') rows = rows.filter(c=>(actor.assignedCustomers||[]).includes(c.customerId));
    else if(!AS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view complaints.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, complaints:rows, statuses:D.COMPLAINT_STATUSES});
  }
  if(pathname==='/api/complaints' && req.method==='POST'){
    const allowed = ['Admin','CEO','Sales'].includes(actor.role) || (actor.role==='ProjectManager' && isProjectManagerOf(actor, body.projectId));
    if(!allowed) return deny(res,403,`Role "${actor.role}" cannot create a complaint.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createComplaint({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/complaints\/[^/]+\/triage$/) && req.method==='POST'){
    if(!AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot triage complaints — a classification decision requires supervisory authority.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.triageComplaint({id:pathname.split('/')[3], classification:body.classification, notes:body.notes, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/complaints\/[^/]+\/status$/) && req.method==='POST'){
    const cmp = D.DB.complaints.find(c=>c.id===pathname.split('/')[3]);
    const allowed = cmp && (['Admin','CEO','FinanceManager','Sales'].includes(actor.role) || (actor.role==='ProjectManager' && isProjectManagerOf(actor, cmp.projectId)));
    if(!allowed) return deny(res,403,`Role "${actor.role}" cannot change this complaint's status.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.changeComplaintStatus({id:pathname.split('/')[3], newStatus:body.newStatus, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---- Service Ticket ----
  if(pathname==='/api/service-tickets' && req.method==='GET'){
    let rows = D.DB.serviceTickets;
    if(actor.role==='ProjectManager') rows = rows.filter(t=>t.projectId && isProjectManagerOf(actor,t.projectId));
    else if(actor.role==='Sales') rows = rows.filter(t=>(actor.assignedCustomers||[]).includes(t.customerId));
    else if(!AS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view service tickets.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, tickets:rows, classifications:D.TICKET_CLASSIFICATIONS, statuses:D.TICKET_STATUSES});
  }
  if(pathname==='/api/service-tickets' && req.method==='POST'){
    if(!afterSalesAllowed(actor, body.projectId) && !AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create a service ticket for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createServiceTicket({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  function ticketAllowed(actor, id){ const t = D.DB.serviceTickets.find(x=>x.id===id); return t ? (afterSalesAllowed(actor, t.projectId) || AS_SUPERVISE_ROLES.has(actor.role)) : (AS_SUPERVISE_ROLES.has(actor.role) || actor.role==='ProjectManager'); }
  if(pathname.match(/^\/api\/service-tickets\/[^/]+\/assign$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!ticketAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot assign this ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.assignServiceTicket({id, assignedTo:body.assignedTo, dueDate:body.dueDate, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-tickets\/[^/]+\/escalate$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!ticketAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot escalate this ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.escalateServiceTicket({id, escalateTo:body.escalateTo, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-tickets\/[^/]+\/classification$/) && req.method==='POST'){
    if(!AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot classify a service ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setTicketClassification({id:pathname.split('/')[3], classification:body.classification, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-tickets\/[^/]+\/close$/) && req.method==='POST'){
    if(!AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot close a service ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.closeServiceTicket({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-tickets\/[^/]+\/reject$/) && req.method==='POST'){
    if(!AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot reject a service ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectServiceTicket({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-tickets\/[^/]+\/closure-readiness$/) && req.method==='GET'){
    const id = pathname.split('/')[3];
    if(!ticketAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot view closure readiness for this ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, readiness: D.serviceTicketClosureReadiness(id)});
  }
  if(pathname.match(/^\/api\/service-tickets\/[^/]+\/cost-breakdown$/) && req.method==='GET'){
    const id = pathname.split('/')[3];
    if(!AS_VIEW_ROLES.has(actor.role) && !ticketAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot view cost breakdown for this ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, breakdown: D.serviceTicketCostBreakdown(id)});
  }

  // ---- Service Visit ----
  // §40: Service Visits carry internal diagnosis/technician detail — deliberately narrower than
  // AS_VIEW_ROLES (excludes Sales, unlike Warranty/Complaint/Ticket/AMC which are customer-facing
  // status Sales legitimately needs); Sales still sees the parent ticket's status/classification.
  if(pathname==='/api/service-visits' && req.method==='GET'){
    let rows = D.DB.serviceVisits;
    if(actor.role==='ProjectManager') rows = rows.filter(v=>v.projectId && isProjectManagerOf(actor,v.projectId));
    else if(!['Admin','CEO','FinanceManager','Accountant','Viewer'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view service visits.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, visits:rows, statuses:D.VISIT_STATUSES});
  }
  if(pathname==='/api/service-visits' && req.method==='POST'){
    if(!ticketAllowed(actor, body.ticketId)) return deny(res,403,`Role "${actor.role}" cannot create a visit for this ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createServiceVisit({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  function visitAllowed(actor, id){ const v = D.DB.serviceVisits.find(x=>x.id===id); return v ? afterSalesAllowed(actor, v.projectId) : (['Admin','CEO'].includes(actor.role) || actor.role==='ProjectManager'); }
  if(pathname.match(/^\/api\/service-visits\/[^/]+\/start$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!visitAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot start this visit.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.startServiceVisit({id, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-visits\/[^/]+\/diagnosis$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!visitAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot record diagnosis for this visit.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordDiagnosis({id, ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-visits\/[^/]+\/complete$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!visitAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot complete this visit.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.completeServiceVisit({id, ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-visits\/[^/]+\/cancel$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!visitAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot cancel this visit.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.cancelServiceVisit({id, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/service-visits\/[^/]+\/material-issue$/) && req.method==='POST'){
    const id = pathname.split('/')[3];
    if(!(visitAllowed(actor,id) || PROC_CREATE_ROLES.has(actor.role))) return deny(res,403,`Role "${actor.role}" cannot issue material for this visit.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.issueServiceMaterial({visitId:id, materialId:body.materialId, qty:body.qty, warehouseId:body.warehouseId, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 25: /api/service-visits/:id/labour-cost migrated to registerMutationRoute().

  // ---- Chargeable Service Billing ----
  if(pathname==='/api/service-invoice' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot create service invoices.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.draftServiceInvoice({...body, createdByUserId:actor.id, createdByRole:actor.role}); return sendJson(res, r.ok?200:400, r);
  }

  // ---- AMC ----
  if(pathname==='/api/amc-contracts' && req.method==='GET'){
    let rows = D.DB.amcContracts;
    if(actor.role==='ProjectManager') rows = rows.filter(a=>a.projectId && isProjectManagerOf(actor,a.projectId));
    else if(actor.role==='Sales') rows = rows.filter(a=>(actor.assignedCustomers||[]).includes(a.customerId));
    else if(!AS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view AMC contracts.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, contracts:rows, statuses:D.AMC_STATUSES});
  }
  if(pathname==='/api/amc-contracts' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager','Sales'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create an AMC contract.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createAMCContract({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 25 §8/§23 — same finding class as the warranty routes above: no route-level check,
  // domain-level check already correct (verified live). Added for defense-in-depth/status-code
  // correctness, mirroring the existing internal rule exactly.
  if(pathname.match(/^\/api\/amc-contracts\/[^/]+\/activate$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot activate an AMC contract.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.activateAMCContract({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/amc-contracts\/[^/]+\/cancel$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot cancel an AMC contract.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.cancelAMCContract({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/amc-contracts\/[^/]+\/renew$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager','Sales'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot renew an AMC contract.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.renewAMCContract({id:pathname.split('/')[3], startDate:body.startDate, endDate:body.endDate, contractValue:body.contractValue, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/amc-schedules' && req.method==='GET'){
    if(!AS_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view AMC schedules.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, schedules:D.DB.amcSchedules});
  }
  if(pathname==='/api/amc-schedules' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create an AMC schedule entry.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createAMCScheduleEntry({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/amc-schedules\/[^/]+\/link-ticket$/) && req.method==='POST'){
    if(!afterSalesAllowed(actor, null) && !AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot link an AMC schedule entry to a ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.linkAMCScheduleToTicket({scheduleId:pathname.split('/')[3], ticketId:body.ticketId, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/amc-billing-invoice' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot create AMC billing invoices.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.draftAMCBillingInvoice({...body, createdByUserId:actor.id, createdByRole:actor.role}); return sendJson(res, r.ok?200:400, r);
  }

  // ---- CAPA ----
  // §40: CAPA root-cause/corrective-action detail is internal quality investigation material —
  // deliberately excludes Sales (and Purchase/Estimator), unlike the customer-facing AS_VIEW_ROLES set.
  if(pathname==='/api/capa' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager','Accountant','Viewer'].includes(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view CAPA cases.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, cases:D.DB.capaCases, statuses:D.CAPA_STATUSES, triggers:D.CAPA_TRIGGERS});
  }
  if(pathname==='/api/capa' && req.method==='POST'){
    if(!AS_SUPERVISE_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot create a CAPA case.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createCAPACase({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  function capaAllowed(actor){ return AS_SUPERVISE_ROLES.has(actor.role) || actor.role==='ProjectManager'; }
  if(pathname.match(/^\/api\/capa\/[^/]+\/analysis$/) && req.method==='POST'){
    if(!capaAllowed(actor)) return deny(res,403,`Role "${actor.role}" cannot record CAPA root-cause analysis.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordCAPAAnalysis({id:pathname.split('/')[3], rootCause:body.rootCause, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/capa\/[^/]+\/action$/) && req.method==='POST'){
    if(!capaAllowed(actor)) return deny(res,403,`Role "${actor.role}" cannot define CAPA corrective/preventive action.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordCAPAAction({id:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/capa\/[^/]+\/verify$/) && req.method==='POST'){
    if(!AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot verify a CAPA action.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordCAPAVerification({id:pathname.split('/')[3], evidence:body.evidence, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/capa\/[^/]+\/effectiveness$/) && req.method==='POST'){
    if(!AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot record a CAPA effectiveness check.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordCAPAEffectivenessCheck({id:pathname.split('/')[3], effectivenessCheck:body.effectivenessCheck, effectivenessResult:body.effectivenessResult, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/capa\/[^/]+\/close$/) && req.method==='POST'){
    if(!AS_SUPERVISE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot close a CAPA case.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.closeCAPACase({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---- Repeat Complaint History / Customer 360 (§25/§4) ----
  if(pathname==='/api/repeat-complaint-history' && req.method==='GET'){
    if(!AS_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view repeat-complaint history.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, ...D.repeatComplaintHistory({customerId:parsed.query.customerId, projectId:parsed.query.projectId, product:parsed.query.product})});
  }
  if(pathname.match(/^\/api\/customers\/[^/]+\/after-sales-summary$/) && req.method==='GET'){
    const customerId = pathname.split('/')[3];
    if(!customerVisible(actor, customerId)) return deny(res,403,`Role "${actor.role}" cannot view after-sales summary for ${customerId}.`,{userId:actor.id,role:actor.role,path:pathname,customerId});
    return sendJson(res,200,{ok:true, summary: D.customerAfterSalesSummary(customerId)});
  }
  // Phase 11 §8/§9 — company-wide After-Sales summary for Management/Finance dashboards.
  if(pathname==='/api/after-sales-summary' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager','Accountant','Viewer'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the company-wide after-sales summary.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, summary: D.companyAfterSalesSummary()});
  }
  // Phase 11 §7 — Customer Profitability carries cost/margin figures (internal financial data,
  // §40) — deliberately NARROWER than customerVisible (which includes Sales for status-only data).
  if(pathname.match(/^\/api\/customers\/[^/]+\/profitability$/) && req.method==='GET'){
    const customerId = pathname.split('/')[3];
    const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
    const pmOwnsAny = actor.role==='ProjectManager' && D.DB.projects.some(p=>p.customerId===customerId && isProjectManagerOf(actor, p.id));
    if(!fullAccess.has(actor.role) && !pmOwnsAny) return deny(res,403,`Role "${actor.role}" cannot view profitability for ${customerId}.`,{userId:actor.id,role:actor.role,path:pathname,customerId});
    return sendJson(res,200,{ok:true, profitability: D.customerProfitability(customerId)});
  }

  // ============================================================
  // Phase 13 — Approved Policy Implementation
  // ============================================================
  // Placed here (after PROC_VIEW_ROLES/AS_VIEW_ROLES/isProjectManagerOf/ticketAllowed have all
  // actually executed earlier in this request's pass) so every reference below is safe.

  // POL-12 (approved: all 8 reports, CSV). Every export re-checks the SAME data-scope gate its
  // live screen already uses — no export bypasses what the equivalent screen would deny. Every
  // attempt (allowed or denied) is audited with user/date/time/report/filters/record-count/type.
  if(pathname==='/api/export' && req.method==='POST'){
    if(!can(actor,'export')) return deny(res, 403, `Role "${actor.role}" does not have export permission.`, {userId:actor.id, role:actor.role, path:pathname});
    const report = body.report, filters = body.filters||{};
    const glTierReports = new Set(['gl','ar','ap','project-pl']);
    if(glTierReports.has(report) && !isGLVisible(actor)) return deny(res, 403, `Role "${actor.role}" cannot export "${report}" — GL-tier visibility required.`, {userId:actor.id, role:actor.role, path:pathname, report});
    if(report==='inventory' && !PROC_VIEW_ROLES.has(actor.role)) return deny(res, 403, `Role "${actor.role}" cannot export inventory data.`, {userId:actor.id, role:actor.role, path:pathname, report});
    if(report==='financial-360'){
      const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
      if(!fullAccess.has(actor.role) && !isProjectManagerOf(actor, filters.projectId)) return deny(res, 403, `Role "${actor.role}" cannot export the Financial 360 for ${filters.projectId}.`, {userId:actor.id, role:actor.role, path:pathname, report});
    }
    if(report==='customer-profitability'){
      const fullAccess = new Set(['Admin','CEO','Accountant','FinanceManager','Viewer']);
      const pmOwnsAny = actor.role==='ProjectManager' && D.DB.projects.some(p=>p.customerId===filters.customerId && isProjectManagerOf(actor, p.id));
      if(!fullAccess.has(actor.role) && !pmOwnsAny) return deny(res, 403, `Role "${actor.role}" cannot export profitability for ${filters.customerId}.`, {userId:actor.id, role:actor.role, path:pathname, report});
    }
    if(report==='after-sales' && !['Admin','CEO','FinanceManager','Accountant','Viewer'].includes(actor.role)) return deny(res, 403, `Role "${actor.role}" cannot export the after-sales summary.`, {userId:actor.id, role:actor.role, path:pathname, report});
    const r = D.generateExport(report, filters, actor);
    D.logAudit({type:'Export', report, filters, recordCount:r.recordCount||0, success:r.ok, userId:actor.id, role:actor.role});
    return sendJson(res, r.ok?200:400, r);
  }

  // POL-06: Service Labour Rate Card (§19 — admin/management change, technicians view-only)
  if(pathname==='/api/config/service-labour-rates' && req.method==='GET'){
    return sendJson(res,200,{ok:true, rates:D.DB.serviceLabourRates});
  }
  if(pathname==='/api/config/service-labour-rates' && req.method==='POST'){
    if(!['Admin','CEO'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot configure service labour rates — admin/management only.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setServiceLabourRate({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/service-labour-rate' && req.method==='GET'){
    return sendJson(res,200,{ok:true, ...D.getServiceLabourRate({technicianLevel:parsed.query.technicianLevel, skill:parsed.query.skill, location:parsed.query.location})});
  }

  // POL-07: Diagnosis Approval (₹10,000 threshold, approved)
  if(pathname.match(/^\/api\/service-visits\/[^/]+\/diagnosis-approval$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot approve a diagnosis — manager tier required.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveDiagnosis({visitId:pathname.split('/')[3], decision:body.decision, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // POL-08: Service SLA (Response=4h, Visit=72h, approved; Resolution NOT configured)
  if(pathname.match(/^\/api\/service-tickets\/[^/]+\/sla$/) && req.method==='GET'){
    const id = pathname.split('/')[3];
    if(!ticketAllowed(actor,id)) return deny(res,403,`Role "${actor.role}" cannot view SLA status for this ticket.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, sla: D.ticketSlaStatus(id)});
  }

  // §14: Policy Configuration (admin/CEO only to change; broad read for visibility)
  if(pathname==='/api/config/policies' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager','Accountant','Viewer'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view policy configuration.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, policyConfig: D.DB.policyConfig, fixed: { grnTolerancePct:0, inventoryValuationMethod:'MovingAverage', amcRecognitionMethod:'Deferred/Monthly (Option B — approved)', roleModel:D.ROLES }});
  }
  if(pathname==='/api/config/policies' && req.method==='POST'){
    if(!['Admin','CEO'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot change policy configuration — admin/management only.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setPolicyConfig({key:body.key, value:body.value, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // POL-01: Rebill after a milestone-sourced invoice was reversed (Option B, approved)
  if(pathname.match(/^\/api\/billing-milestones\/[^/]+\/rebill$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager','Accountant','Sales'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create a rebill milestone.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createRebillMilestone({originalMilestoneId:pathname.split('/')[3], amount:body.amount, triggerNote:body.triggerNote, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // POL-05: AMC Deferred Revenue Recognition (Option B, approved)
  if(pathname.match(/^\/api\/amc-contracts\/[^/]+\/revenue-schedule$/) && req.method==='GET'){
    if(!AS_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view AMC revenue schedule.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, schedule: D.amcRevenueSchedule(pathname.split('/')[3])});
  }
  // Phase 25: /api/amc-contracts/:id/recognize-revenue migrated to registerMutationRoute().

  // POL-10: Company-Wide Project Profitability (approved)
  if(pathname==='/api/company-project-profitability' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager','Accountant','Viewer'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view company-wide project profitability.`,{userId:actor.id,role:actor.role,path:pathname});
    const q = parsed.query;
    return sendJson(res,200,{ok:true, profitability: D.companyProjectProfitability({dateFrom:q.dateFrom, dateTo:q.dateTo, projectId:q.projectId, customerId:q.customerId, projectManagerId:q.projectManagerId, status:q.status})});
  }

  // ============================================================
  // Phase 14 — SAP-Style Accounting Entry Architecture
  // ============================================================
  // §18 Branches
  if(pathname==='/api/branches' && req.method==='GET'){
    return sendJson(res,200,{ok:true, branches:D.DB.branches});
  }
  if(pathname==='/api/branches' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot manage branches.`,{userId:actor.id,role:actor.role,path:pathname});
    if(!body.code || !body.name) return sendJson(res,400,{ok:false, error:'code and name are required.'});
    const b = {id:'BR-'+body.code.toUpperCase(), code:body.code.toUpperCase(), name:body.name, active:true};
    if(D.DB.branches.find(x=>x.id===b.id)) return sendJson(res,400,{ok:false, error:'Branch code already exists.'});
    D.DB.branches.push(b); D.save();
    D.logAudit({type:'BranchCreated', branchId:b.id, userId:actor.id, role:actor.role});
    return sendJson(res,200,{ok:true, branch:b});
  }

  // §4 Customer Credit Note / Debit Note
  // Phase 22: /api/customer-credit-notes and /api/customer-debit-notes migrated to registerMutationRoute() — see the migration ledger.

  // #17/#18 Inventory Transfer / Adjustment
  if(pathname==='/api/inventory-transfers' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view inventory transfers.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, transfers:D.DB.inventoryTransfers});
  }
  // Phase 23: /api/inventory-transfers migrated to registerMutationRoute() — see the migration ledger.
  if(pathname==='/api/inventory-adjustments' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view inventory adjustments.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, adjustments:D.DB.inventoryAdjustments});
  }
  // Phase 22: /api/inventory-adjustments migrated to registerMutationRoute() — see the migration ledger.

  // ================== Phase 28 — Inventory Operations ==================
  if(pathname==='/api/purchase-returns' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view purchase returns.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, returns:D.DB.purchaseReturns});
  }
  if(pathname==='/api/material-issues' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view material issues.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.inventoryMovements.filter(m=>m.type==='Issue');
    if(actor.role==='ProjectManager') rows = rows.filter(m=>m.projectId && isProjectManagerOf(actor,m.projectId));
    return sendJson(res,200,{ok:true, issues:rows});
  }
  if(pathname==='/api/locations' && req.method==='GET'){
    return sendJson(res,200,{ok:true, locations:D.DB.locations});
  }
  if(pathname==='/api/locations' && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create locations.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createLocation({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/stock-by-location' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view stock by location.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rows:D.stockByLocation()});
  }
  if(pathname==='/api/stock-report' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the stock report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rows:D.stockReport()});
  }
  if(pathname==='/api/damage-reports/reasons' && req.method==='GET'){
    return sendJson(res,200,{ok:true, reasons:D.DAMAGE_REPORT_REASONS});
  }
  if(pathname==='/api/damage-reports' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view damage reports.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, damageReports:D.DB.damageReports});
  }
  // Phase 23: /api/damage-reports migrated to registerMutationRoute() — see the migration ledger.
  if(pathname==='/api/stock-counts' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view stock counts.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, stockCounts:D.DB.stockCounts});
  }
  if(pathname==='/api/stock-counts' && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot start a stock count.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createStockCount({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/stock-counts\/[^/]+\/submit$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot post stock count variances — manager tier required (same gate as a manual Inventory Adjustment).`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitStockCount({id:pathname.split('/')[3], countedQtys:body.countedQtys, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ================== Phase 28 — Purchases Intelligence ==================
  if(pathname==='/api/procurement-intelligence' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Procurement Intelligence.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, ...D.procurementIntelligence()});
  }
  if(pathname==='/api/vendor-rating' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Vendor Rating.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, vendors:D.vendorRating()});
  }
  if(pathname==='/api/purchase-vendor-report' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Purchase & Vendor report.`,{userId:actor.id,role:actor.role,path:pathname});
    const q = parsed.query;
    return sendJson(res,200,{ok:true, rows:D.purchaseVendorReport({vendorId:q.vendorId||null, dateFrom:q.dateFrom||null, dateTo:q.dateTo||null, projectId:q.projectId||null, status:q.status||null})});
  }

  // ================== Phase 28 — Operations ==================
  const OPS_VIEW_ROLES = new Set(['Admin','CEO','Accountant','FinanceManager','ProjectManager','Purchase','Viewer']);
  if(pathname==='/api/labour-wages' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view labour wages.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.labourWages;
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, labour:rows});
  }
  // Phase 23: /api/labour-wages migrated to registerMutationRoute() — see the migration ledger.
  if(pathname==='/api/project-expenses' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view project expenses.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.projectExpenses;
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, expenses:rows});
  }
  // Phase 23: /api/project-expenses migrated to registerMutationRoute() — see the migration ledger.

  // ---- Phase 6 — Labour-wise Project Cost Analytics (read-only) ----
  // Same OPS_VIEW_ROLES gate + ProjectManager-own-project scoping as the existing /api/labour-wages
  // route above — no new authorization model invented for this report.
  if(pathname==='/api/reports/labour-entries' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Labour Cost Analysis.`,{userId:actor.id,role:actor.role,path:pathname});
    const {projectId, workerName, role, dateFrom, dateTo, amountFrom, amountTo} = parsed.query;
    if(actor.role==='ProjectManager' && projectId && !isProjectManagerOf(actor,projectId)) return deny(res,403,`Role "${actor.role}" cannot view labour for project ${projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.labourWageEntries({projectId, workerName, role, dateFrom, dateTo, amountFrom, amountTo});
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, rows});
  }
  if(pathname==='/api/reports/labour-by-project' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Labour x Project.`,{userId:actor.id,role:actor.role,path:pathname});
    const projectId = parsed.query.projectId;
    if(actor.role==='ProjectManager' && projectId && !isProjectManagerOf(actor,projectId)) return deny(res,403,`Role "${actor.role}" cannot view labour for project ${projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.labourCostByProject({projectId});
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, rows});
  }
  if(pathname==='/api/reports/labour-identity-quality' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager','Accountant'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Labour Identity Quality report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200, D.labourIdentityQualityReport());
  }

  // ---- Phase 6 — True Global Search (read-only) ----
  // §15 is explicit that this is CRITICAL: every category below is gated by the EXACT SAME
  // authorization condition as that entity's own dedicated GET route elsewhere in this file
  // (copied, not reinvented), so global search can never surface a row a direct API call to that
  // entity's own route would have denied. No new authorization model exists anywhere below.
  if(pathname==='/api/search' && req.method==='GET'){
    const q = (parsed.query.q||'').trim();
    if(q.length<2) return sendJson(res,200,{ok:true, query:q, results:{}});
    const ql = q.toLowerCase();
    // A small, explicit, disclosed synonym map — never silently invented at query time.
    const SYN = { vendor:['supplier'], supplier:['vendor'], customer:['client'], client:['customer'],
      labour:['worker'], worker:['labour'], purchase:['procurement'], procurement:['purchase'],
      stock:['inventory'], inventory:['stock'], variation:['change request'], 'change request':['variation'],
      outstanding:['due'], due:['outstanding'], consumption:['material usage','usage'] };
    const terms = [ql, ...(SYN[ql]||[])];
    const matchesAny = (s)=> s!=null && terms.some(t=>String(s).toLowerCase().includes(t));
    const rank = (...fields)=>{ const sl=fields.map(f=>String(f||'').toLowerCase()); if(sl.some(f=>f===ql)) return 0; if(sl.some(f=>f.startsWith(ql))) return 1; return 2; };
    const results = {};

    // Projects — same scoping as GET /api/projects
    let projRows = D.DB.projects;
    if(actor.role==='ProjectManager') projRows = projRows.filter(p=>isProjectManagerOf(actor,p.id));
    results.projects = projRows.filter(p=>matchesAny(p.id)||matchesAny(p.name)).sort((a,b)=>rank(a.id,a.name)-rank(b.id,b.name)).slice(0,8)
      .map(p=>({type:'PROJECT', id:p.id, title:p.id, subtitle:p.name, group:'PROJECTS', tab:'project360'}));

    // Customers — same scoping as GET /api/customers
    if(actor.role!=='Purchase'){
      let custRows = D.DB.customers;
      if(actor.role==='Sales') custRows = custRows.filter(c=>(actor.assignedCustomers||[]).includes(c.id));
      results.customers = custRows.filter(c=>matchesAny(c.id)||matchesAny(c.name)).sort((a,b)=>rank(a.id,a.name)-rank(b.id,b.name)).slice(0,8)
        .map(c=>({type:'CUSTOMER', id:c.id, title:c.name, subtitle:c.id, group:'SERVICE & AFTER-SALES', tab:'cust360'}));
    }

    // Vendors — same scoping as GET /api/vendors
    if(new Set(['Admin','CEO','Accountant','FinanceManager','Purchase','Viewer']).has(actor.role)){
      results.vendors = D.DB.vendors.filter(v=>matchesAny(v.id)||matchesAny(v.name)).sort((a,b)=>rank(a.id,a.name)-rank(b.id,b.name)).slice(0,8)
        .map(v=>({type:'VENDOR', id:v.id, title:v.name, subtitle:v.id, group:'PROCUREMENT', tab:'purchvendor'}));
    }

    // Materials — id/code/description are broadly visible per GET /api/materials (only cost
    // fields are role-restricted there, and this search never returns cost).
    results.materials = D.DB.materials.filter(m=>matchesAny(m.id)||matchesAny(m.code)||matchesAny(m.description)).sort((a,b)=>rank(a.code,a.description)-rank(b.code,b.description)).slice(0,8)
      .map(m=>({type:'MATERIAL', id:m.id, title:m.description, subtitle:m.code, group:'INVENTORY', tab:'materialanalysis'}));

    // Workers — derived free-text identity from DB.labourWages, same OPS_VIEW_ROLES + own-project
    // scoping as the existing /api/labour-wages route.
    if(OPS_VIEW_ROLES.has(actor.role)){
      let wRows = D.DB.labourWages;
      if(actor.role==='ProjectManager') wRows = wRows.filter(r=>isProjectManagerOf(actor,r.projectId));
      const names = [...new Set(wRows.map(r=>r.workerName))].filter(matchesAny).sort((a,b)=>rank(a)-rank(b));
      results.workers = names.slice(0,8).map(n=>({type:'WORKER', id:n, title:n, subtitle:'Worker — free-text identity, see Labour Identity Quality', group:'SITE OPERATIONS', tab:'labourcost'}));
    }

    // Documents — each type gated by ITS OWN pre-existing view convention, not a new one.
    const docs = [];
    if(PROC_VIEW_ROLES.has(actor.role) || actor.role==='SiteInCharge'){
      D.DB.purchaseOrders.filter(po=>matchesAny(po.id)||matchesAny(po.poNo)).slice(0,5).forEach(po=>
        docs.push({type:'DOCUMENT', id:po.id, title:po.poNo||po.id, subtitle:`Purchase Order — ${(D.DB.vendors.find(v=>v.id===po.vendorId)||{}).name||po.vendorId} — ₹${(po.total||0).toLocaleString('en-IN')}`, group:'PROCUREMENT', tab:'pos'}));
      D.DB.grns.filter(g=>matchesAny(g.id)||matchesAny(g.grnNo)).slice(0,5).forEach(g=>
        docs.push({type:'DOCUMENT', id:g.id, title:g.grnNo||g.id, subtitle:`GRN — against ${g.poId}`, group:'PROCUREMENT', tab:'grns'}));
    }
    D.DB.boms.filter(b=>matchesAny(b.id)||matchesAny(b.docNo)).slice(0,5).forEach(b=>
      docs.push({type:'DOCUMENT', id:b.id, title:b.docNo||b.id, subtitle:`BOM — ${b.projectId} — v${b.version} — ${b.status}`, group:'ESTIMATION & COSTING', tab:'boms'}));
    if(can(actor,'view')){
      D.DB.changeRequests.filter(c=>matchesAny(c.id)||matchesAny(c.documentNo)||matchesAny(c.description)).slice(0,5).forEach(c=>
        docs.push({type:'DOCUMENT', id:c.id, title:c.documentNo||c.id, subtitle:`Change Request — ${c.projectId} — ${c.status}`, group:'PROJECTS', tab:'changereq'}));
    }
    if(actor.role==='Purchase' || ['Admin','CEO','Sales','ProjectManager'].includes(actor.role) || actor.role==='Estimator'){
      let quoteRows = D.DB.quotations;
      if(actor.role==='Sales') quoteRows = quoteRows.filter(qt=>(actor.assignedCustomers||[]).includes(qt.customerId));
      else if(actor.role==='ProjectManager') quoteRows = [];
      docs.push(...quoteRows.filter(qt=>matchesAny(qt.id)||matchesAny(qt.quotationNo)).slice(0,5)
        .map(qt=>({type:'DOCUMENT', id:qt.id, title:qt.quotationNo||qt.id, subtitle:`Quotation — ${qt.prospectName||''} — ₹${(qt.finalPrice||0).toLocaleString('en-IN')} — ${qt.status}`, group:'SALES & CRM', tab:'quotations'})));
    }
    results.documents = docs.slice(0,20);

    // Reports — a small static catalog (navigation labels only; no data, so no authorization
    // concern) filtered to modules this role's own sidenav would show. Kept in sync manually with
    // the client's own ACCT_QUICK_REPORTS/CROSSDIM catalogs — see that file for the full list.
    return sendJson(res,200,{ok:true, query:q, results});
  }

  // ---- Phase 6 — Accountant MIS / Management MIS (pure composition, read-only) ----
  if(pathname==='/api/reports/accountant-mis' && req.method==='GET'){
    if(!['Admin','CEO','Accountant','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Accountant MIS.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, mis: D.accountantMisSummary({dateFrom:parsed.query.dateFrom||undefined, dateTo:parsed.query.dateTo||undefined})});
  }
  if(pathname==='/api/reports/management-mis' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Management MIS.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, mis: D.managementMisSummary({dateFrom:parsed.query.dateFrom||undefined, dateTo:parsed.query.dateTo||undefined})});
  }

  // ---- Phase 7 — Report Variants / Favorites (read route; mutations registered via
  // registerMutationRoute() near the top of this file, alongside the other modern routes) ----
  // No special role gate beyond "is a logged-in user" — a variant is per-user private state
  // (never shared), and every mutation below already enforces ownerId===actor.id for anything
  // beyond create/list-own. Loading a variant never returns data directly; the client re-applies
  // its stored filters through the SAME report route, which re-authorizes from scratch.
  if(pathname==='/api/report-variants' && req.method==='GET'){
    return sendJson(res,200,{ok:true, variants: D.listReportVariants({reportId:parsed.query.reportId||undefined, actor})});
  }

  // ---- Phase 9 — Orphan Reconciliation Report (strictly read-only; never auto-repairs) ----
  // Same tier as other forensic/reconciliation tooling — Admin/CEO/FinanceManager/Accountant, the
  // roles that already see GL-level detail elsewhere in this app (reconcileAR/AP, Trial Balance).
  if(pathname==='/api/reports/orphan-reconciliation' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager','Accountant'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Orphan Reconciliation report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200, D.orphanReconciliationReport());
  }
  // ---- Phase 10 — Material Replenishment Recommendation (strictly read-only, never auto-purchases) ----
  if(pathname==='/api/reports/replenishment' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager','Purchase','ProjectManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Replenishment report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200, D.materialReplenishmentReport());
  }
  // ---- Phase 10 — Project Budget/Commitment/Actual/Variance (strictly read-only) ----
  if(pathname==='/api/reports/budget-variance' && req.method==='GET'){
    if(!['Admin','CEO','FinanceManager','Accountant','ProjectManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Budget Variance report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200, D.projectBudgetVarianceReport(parsed.query.projectId||null));
  }

  if(pathname==='/api/qc-dashboard' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the QC Dashboard.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, ...D.qcDashboard()});
  }
  if(pathname==='/api/timesheet' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view timesheets.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.timesheetEntries;
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, entries:rows});
  }
  if(pathname==='/api/timesheet' && req.method==='POST'){
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor,body.projectId)) && !['Admin','CEO'].includes(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot log a timesheet entry for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.createTimesheetEntry({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/tasks' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view tasks.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.tasks;
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, tasks:rows});
  }
  if(pathname==='/api/tasks' && req.method==='POST'){
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor,body.projectId)) && !['Admin','CEO'].includes(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot create a task for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.createTask({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/tasks\/[^/]+\/status$/) && req.method==='POST'){
    const t = D.DB.tasks.find(x=>x.id===pathname.split('/')[3]);
    if(!t) return sendJson(res,404,{ok:false, error:'Task not found.'});
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor,t.projectId)) && !['Admin','CEO'].includes(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot change this task's status.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.updateTaskStatus({id:t.id, status:body.status, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/risk-register' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Risk Register.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.riskRegister;
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, risks:rows});
  }
  if(pathname==='/api/risk-register' && req.method==='POST'){
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor,body.projectId)) && !['Admin','CEO'].includes(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot create a risk entry for project ${body.projectId}.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.createRiskEntry({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/risk-register\/[^/]+\/close$/) && req.method==='POST'){
    const rk = D.DB.riskRegister.find(x=>x.id===pathname.split('/')[3]);
    if(!rk) return sendJson(res,404,{ok:false, error:'Risk entry not found.'});
    if(!(actor.role==='ProjectManager' && isProjectManagerOf(actor,rk.projectId)) && !['Admin','CEO'].includes(actor.role)){
      return deny(res,403,`Role "${actor.role}" cannot close this risk entry.`,{userId:actor.id,role:actor.role,path:pathname});
    }
    const r = D.closeRiskEntry({id:rk.id, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/weekly-scorecard' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Weekly Scorecard.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, snapshots:D.DB.weeklySnapshots});
  }
  if(pathname==='/api/weekly-scorecard/capture' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot capture a Weekly Scorecard snapshot.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.captureWeeklySnapshot({actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ================== Phase 28 — Factory / MES ==================
  if(pathname==='/api/machines' && req.method==='GET'){
    return sendJson(res,200,{ok:true, machines:D.DB.machines});
  }
  if(pathname==='/api/machines' && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create machines.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createMachine({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/machines\/[^/]+\/status$/) && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot change machine status.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setMachineStatus({id:pathname.split('/')[3], status:body.status, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/job-cards' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view job cards.`,{userId:actor.id,role:actor.role,path:pathname});
    let rows = D.DB.jobCards;
    if(actor.role==='ProjectManager') rows = rows.filter(r=>isProjectManagerOf(actor,r.projectId));
    return sendJson(res,200,{ok:true, jobCards:rows});
  }
  if(pathname==='/api/job-cards' && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create job cards.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createJobCard({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/job-cards\/[^/]+\/start$/) && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot start a job card.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.startJobCard({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/job-cards\/[^/]+\/complete$/) && req.method==='POST'){
    if(!PROC_CREATE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot complete a job card.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.completeJobCard({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/production-schedule' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view the production schedule.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rows:D.productionSchedule()});
  }
  if(pathname==='/api/factory-dashboard' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Factory Dashboard.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, ...D.factoryDashboard()});
  }
  if(pathname==='/api/job-analysis' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Job Analysis.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rows:D.jobAnalysis()});
  }
  if(pathname==='/api/job-cost-sheet' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view the Job Cost Sheet.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.jobCostSheet(parsed.query.productionOrderId); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/product-costing' && req.method==='GET'){
    if(!PROC_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Product Costing.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.productCosting(parsed.query.bomId); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/labour-performance' && req.method==='GET'){
    if(!OPS_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Labour Performance.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rows:D.labourPerformance()});
  }

  // §13 Attachments — generic, usable against any entityType/entityId
  if(pathname==='/api/attachments' && req.method==='GET'){
    if(!parsed.query.entityType || !parsed.query.entityId) return sendJson(res,400,{ok:false, error:'entityType and entityId query params are required.'});
    return sendJson(res,200,{ok:true, attachments:D.listAttachments(parsed.query.entityType, parsed.query.entityId)});
  }
  if(pathname==='/api/attachments' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot upload attachments.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.attachFile({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/attachments\/[^/]+\/download$/) && req.method==='GET'){
    const att = D.getAttachment(pathname.split('/')[3]);
    if(!att) return sendJson(res,404,{ok:false, error:'Attachment not found.'});
    return sendJson(res,200,{ok:true, filename:att.filename, mimeType:att.mimeType, base64Data:att.base64Data});
  }
  if(pathname.match(/^\/api\/attachments\/[^/]+$/) && req.method==='DELETE'){
    if(!can(actor,'edit')) return deny(res,403,`Role "${actor.role}" cannot delete attachments.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.deleteAttachment(pathname.split('/')[3], actor); return sendJson(res, r.ok?200:400, r);
  }

  // §14/§15 Journal Templates & Recurring Entries — creating a template/recurring rule needs
  // masterData-tier authorization; INSTANTIATING one still goes through the normal 'create' gate,
  // since it only ever produces a Draft, identical in authority to a hand-typed journal.
  if(pathname==='/api/journal-templates' && req.method==='GET'){
    return sendJson(res,200,{ok:true, templates:D.listJournalTemplates()});
  }
  if(pathname==='/api/journal-templates' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create journal templates.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createJournalTemplate({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/journal-templates/instantiate' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot create journal entries.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createDraftFromTemplate({...body, createdByUserId:actor.id, createdByRole:actor.role}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/recurring-entries' && req.method==='GET'){
    return sendJson(res,200,{ok:true, recurring:D.listRecurringEntries()});
  }
  if(pathname==='/api/recurring-entries' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create recurring entries.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createRecurringEntry({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/recurring-entries/generate-due' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot generate recurring entries.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.generateDueRecurringDrafts({asOfDate:body.asOfDate, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // §16 Controlled CSV Import — validates and produces a Draft only, never a direct post.
  if(pathname==='/api/import/journal-csv' && req.method==='POST'){
    if(!can(actor,'create')) return deny(res,403,`Role "${actor.role}" cannot import journal entries.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.importJournalCSV({...body, createdByUserId:actor.id, createdByRole:actor.role}); return sendJson(res, r.ok?200:400, r);
  }

  // §36 Entry-Type Catalogue — live, code-derived matrix of every accounting-relevant transaction
  // type actually observed in posted data (not hand-maintained prose that could drift).
  if(pathname==='/api/accounting/entry-types' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view the entry-type catalogue.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, entryTypes:D.entryTypeCatalogue()});
  }

  // ============================================================
  // Phase 15 — Gap Closure
  // ============================================================
  // §3 Profit Centre
  if(pathname==='/api/profit-centres' && req.method==='GET'){
    return sendJson(res,200,{ok:true, profitCentres:D.listProfitCentres()});
  }
  if(pathname==='/api/profit-centres' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot manage profit centres.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createProfitCentre({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // §5 Bank Reconciliation
  if(pathname==='/api/bank-accounts' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view bank accounts.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, bankAccounts:D.listBankAccounts()});
  }
  if(pathname==='/api/bank-accounts' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot manage bank accounts.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createBankAccount({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 24 Part A8 — per-account GL balances (Bank A/B, Cash A/B individually, not commingled).
  if(pathname==='/api/bank-accounts/balances' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view bank/cash account balances.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, balances:D.bankAccountBalances()});
  }
  // Phase 25: /api/bank-transfer migrated to registerMutationRoute().
  if(pathname==='/api/bank-statement/import' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager','Accountant'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot import bank statements.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.importBankStatement({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/bank-statement\/[^/]+\/match$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager','Accountant'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot match bank statement lines.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.matchBankStatementLine({lineId:pathname.split('/')[3], entryId:body.entryId, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/bank-statement\/[^/]+\/unmatch$/) && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot unmatch bank statement lines.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.unmatchBankStatementLine({lineId:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/bank-reconciliation' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view bank reconciliation.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, reconciliation:D.bankReconciliationStatus(parsed.query.bankAccountId)});
  }
  // §8 Branch — set a project's default branch (masterData-tier, mirrors other master-data gates)
  if(pathname.match(/^\/api\/projects\/[^/]+\/branch$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot set a project's branch.`,{userId:actor.id,role:actor.role,path:pathname});
    if(body.branchId && !D.branchAllowed(actor, body.branchId)) return deny(res,403,`Role "${actor.role}" is not authorized to assign branch "${body.branchId}".`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setProjectBranch({projectId:pathname.split('/')[3], branchId:body.branchId, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ============================================================
  // Phase 17 §4 — Backup / Restore. Admin/CEO only; restore is the single most destructive
  // action in this Lab, gated identically to `masterData` but checked explicitly here (not just
  // via `can(actor,'masterData')`) so the intent is unambiguous in the route table itself.
  // ============================================================
  if(pathname==='/api/admin/backup' && req.method==='POST'){
    if(!['Admin','CEO'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create a backup.`,{userId:actor.id,role:actor.role,path:pathname});
    const meta = D.createBackup({label:body.label, actor});
    return sendJson(res,200,{ok:true, backup:meta});
  }
  if(pathname==='/api/admin/backups' && req.method==='GET'){
    if(!['Admin','CEO'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view backups.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, backups:D.listBackups()});
  }
  if(pathname==='/api/admin/restore' && req.method==='POST'){
    if(!['Admin','CEO'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot restore a backup.`,{userId:actor.id,role:actor.role,path:pathname});
    if(!body.filename) return sendJson(res,400,{ok:false, error:'filename is required.'});
    const r = D.restoreBackup({filename:body.filename, actor});
    return sendJson(res, r.ok?200:400, r);
  }
  // ERP AUDIT FIX (ERP-040) — dry-run structural validation of an arbitrary snapshot, same gate as
  // the real restore. Never touches the live database (D.validateRestoreCandidate() only parses
  // and checks the supplied JSON text — see its own header comment in domain.js).
  if(pathname==='/api/admin/restore-validate' && req.method==='POST'){
    if(!['Admin','CEO'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot validate a restore candidate.`,{userId:actor.id,role:actor.role,path:pathname});
    if(!body.snapshotJson) return sendJson(res,400,{ok:false, error:'snapshotJson is required.'});
    const r = D.validateRestoreCandidate({snapshotJson:body.snapshotJson});
    return sendJson(res, r.ok?200:400, r);
  }

  // ============================================================
  // ============================================================
  // Phase 19 §26/§27 — Fixed Assets. Create/Capitalize/Depreciate/Dispose need financial posting
  // authority (`post`, same tier as approving/posting any other document); Transfer is a lighter
  // register-only action gated at `edit`; View is masterData-adjacent but kept at GL-visible
  // since this is genuine financial detail (asset cost, depreciation), same tier as Trial Balance.
  // ============================================================
  if(pathname==='/api/fixed-assets' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view the Fixed Asset register.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, assets:D.listFixedAssets()});
  }
  // Phase 23: /api/fixed-assets migrated to registerMutationRoute() — see the migration ledger.
  // Phase 25: /api/fixed-assets/:id/capitalize migrated to registerMutationRoute().
  // Quick Control Fixes phase: /api/fixed-assets/:id/transfer migrated to registerMutationRoute()
  // (see its new registration above, alongside its siblings) — this if-block removed.
  // Phase 25: /api/fixed-assets/:id/depreciate and /api/fixed-assets/:id/dispose migrated to
  // registerMutationRoute().
  if(pathname==='/api/fixed-assets/reconciliation' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view the Fixed Asset reconciliation.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, reconciliation:D.reconcileFixedAssets()});
  }

  // ============================================================
  // Phase 20 §3/§4 — Master Data Import Framework. masterData-tier (Admin/CEO only), same gate
  // as every other master-data action in this Lab (Branches/Profit Centres/Bank Accounts).
  // ============================================================
  if(pathname==='/api/master-import' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot import master data.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.importMasterData({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/master-import/types' && req.method==='GET'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot view master import types.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, types:Object.keys(D.MASTER_IMPORT_SPECS)});
  }
  if(pathname==='/api/master-import/batches' && req.method==='GET'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot view master import history.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, batches:D.DB.masterImportBatches});
  }
  // Single-record master creators — same masterData gate, used by both a future single-entry UI
  // and internally by the import framework's per-row createRow().
  if(pathname==='/api/masters/vendor' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a vendor.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createVendorMaster({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/masters/material' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a material.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createMaterialMaster({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/masters/project' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a project.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createProjectMaster({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/masters/cost-centre' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a cost centre.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createCostCentreMaster({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/masters/tax-code' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a tax code.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createTaxCodeMaster({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/masters/payment-method' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a payment method.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createPaymentMethodMaster({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/masters/account' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a GL account.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createAccountMaster({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ============================================================
  // Phase 21 §5/§6 — Master Data Edit/Deactivate. Same 'masterData' gate (Admin/CEO only) as the
  // single-record creators immediately above — not a new permission concept. Direct API access
  // with a tampered/unknown ID is handled inside the domain functions themselves (record-not-found
  // is a 400, never a silent success), consistent with every other ID-tamper defense in this file.
  // ============================================================
  if(pathname.match(/^\/api\/masters\/customer\/[^/]+\/edit$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot edit a customer.`,{userId:actor.id,role:actor.role,path:pathname});
    const customerId = pathname.split('/')[4];
    const r = D.editCustomer({customerId, changes:body.changes, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/masters\/customer\/[^/]+\/active$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot activate/deactivate a customer.`,{userId:actor.id,role:actor.role,path:pathname});
    const customerId = pathname.split('/')[4];
    const r = D.setCustomerActive({customerId, active:body.active, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/masters\/vendor\/[^/]+\/edit$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot edit a vendor.`,{userId:actor.id,role:actor.role,path:pathname});
    const vendorId = pathname.split('/')[4];
    const r = D.editVendorMaster({vendorId, changes:body.changes, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/masters\/vendor\/[^/]+\/active$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot activate/deactivate a vendor.`,{userId:actor.id,role:actor.role,path:pathname});
    const vendorId = pathname.split('/')[4];
    const r = D.setVendorActive({vendorId, active:body.active, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/masters\/material\/[^/]+\/edit$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot edit a material.`,{userId:actor.id,role:actor.role,path:pathname});
    const materialId = pathname.split('/')[4];
    const r = D.editMaterialMaster({materialId, changes:body.changes, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/masters\/material\/[^/]+\/active$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot activate/deactivate a material.`,{userId:actor.id,role:actor.role,path:pathname});
    const materialId = pathname.split('/')[4];
    const r = D.setMaterialActive({materialId, active:body.active, reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 21 §7/§8 — UoM Conversion configuration.
  if(pathname.match(/^\/api\/masters\/material\/[^/]+\/uom-conversion$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot configure UoM conversion.`,{userId:actor.id,role:actor.role,path:pathname});
    const materialId = pathname.split('/')[4];
    const r = D.setMaterialUomConversion({materialId, purchaseUom:body.purchaseUom, purchaseConversionFactor:body.purchaseConversionFactor, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ============================================================
  // Phase 20 §7-§10 — Opening Balance Engine. Import is masterData-tier (creates DRAFTS only);
  // the resulting drafts then go through the EXISTING Document Workflow Submit/Approve/Post
  // gates (`submit`/`approve`/`post` permissions), unchanged, for real SoD.
  // ============================================================
  if(pathname==='/api/opening-balance/import' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot import opening balances.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.importOpeningBalance({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/opening-balance/types' && req.method==='GET'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot view opening balance types.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, types:Object.keys(D.OPENING_BALANCE_SPECS)});
  }
  if(pathname==='/api/opening-balance/batches' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view opening balance batches.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, batches:D.DB.openingBalanceBatches, lines:D.DB.openingBalanceLines});
  }
  // Phase 24: /api/opening-balance/drafts/:id/post migrated to registerMutationRoute() — see the
  // migration ledger. Deliberately registered with the SAME permission:'post' as the generic
  // /api/journal/:id/post route below, calling the SAME D.postDraft() — one central posting gate,
  // reached by two convenience URLs, never two independently-maintained rules.
  if(pathname==='/api/opening-balance/reconciliation' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view the opening balance reconciliation.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, reconciliation:D.reconcileOpeningBalances()});
  }

  // ============================================================
  // Phase 19 §7-19 — ICICI Bank Import. Bank data is financial data (§32) — every route here is
  // gated at least GL-visible; posting-adjacent actions (Match/Exclude/Return/Allocate/Reconcile)
  // require `clear` (the same tier already used for AR/AP clearing), matching the existing
  // reconciliation-authority model rather than inventing a new one.
  // ============================================================
  if(pathname==='/api/bank-import/batches' && req.method==='POST'){
    if(!can(actor,'clear')) return deny(res,403,`Role "${actor.role}" cannot import a bank statement.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createBankImportBatch({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/bank-import/lines' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view bank import lines.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, lines:D.listBankImportLines(parsed.query)});
  }
  if(pathname.match(/^\/api\/bank-import\/lines\/[^/]+\/match$/) && req.method==='POST'){
    if(!can(actor,'clear')) return deny(res,403,`Role "${actor.role}" cannot match a bank import line.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.matchBankImportLine({lineId:pathname.split('/')[4], entryId:body.entryId, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/bank-import\/lines\/[^/]+\/unmatch$/) && req.method==='POST'){
    if(!can(actor,'clear')) return deny(res,403,`Role "${actor.role}" cannot unmatch a bank import line.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.unmatchBankImportLine({lineId:pathname.split('/')[4], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/bank-import\/lines\/[^/]+\/exclude$/) && req.method==='POST'){
    if(!can(actor,'clear')) return deny(res,403,`Role "${actor.role}" cannot exclude a bank import line.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.excludeBankImportLine({lineId:pathname.split('/')[4], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/bank-import\/lines\/[^/]+\/mark-returned$/) && req.method==='POST'){
    if(!can(actor,'clear')) return deny(res,403,`Role "${actor.role}" cannot mark a bank import line as returned.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.markBankImportLineReturned({lineId:pathname.split('/')[4], returnOfLineId:body.returnOfLineId, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 25: /api/bank-import/lines/:id/post migrated to registerMutationRoute().
  if(pathname.match(/^\/api\/bank-import\/lines\/[^/]+\/reconcile$/) && req.method==='POST'){
    if(!can(actor,'clear')) return deny(res,403,`Role "${actor.role}" cannot reconcile a bank import line.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.reconcileBankImportLine({lineId:pathname.split('/')[4], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/bank-import/reconciliation-summary' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view the bank reconciliation summary.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, summary:D.bankImportReconciliationSummary(parsed.query.bankAccountId)});
  }
  if(pathname==='/api/bank-import/batches' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view bank import batches.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, batches:D.DB.bankImportBatches});
  }

  // Phase 18 §2/§3 — Financial Period Control. Create/Close/Reopen are gated inside
  // domain.js itself (PERIOD_MANAGEMENT_ROLES / PERIOD_OVERRIDE_CONFIG_ROLES) — checked again
  // here too, same belt-and-braces pattern as every other route, so a 403 is returned instead of
  // a generic 400 when the role itself is wrong.
  // ============================================================
  if(pathname==='/api/financial-periods' && req.method==='GET'){
    if(!can(actor,'view')) return deny(res,403,`Role "${actor.role}" cannot view financial periods.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, periods:D.listFinancialPeriods()});
  }
  if(pathname==='/api/financial-periods' && req.method==='POST'){
    if(!['FinanceManager','CEO','Admin'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create a financial period.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createFinancialPeriod({name:body.name, startDate:body.startDate, endDate:body.endDate, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/financial-periods\/[^/]+\/close$/) && req.method==='POST'){
    if(!['FinanceManager','CEO','Admin'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot close a financial period.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.closeFinancialPeriod({periodId:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/financial-periods\/[^/]+\/reopen$/) && req.method==='POST'){
    if(!['FinanceManager','CEO','Admin'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot reopen a financial period.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.reopenFinancialPeriod({periodId:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/financial-periods\/[^/]+\/override-role$/) && req.method==='POST'){
    if(!['CEO','Admin'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot configure a financial period's override role.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setPeriodOverrideRole({periodId:pathname.split('/')[3], role:body.role, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/financial-periods\/[^/]+\/reconciliation$/) && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view period-close reconciliation.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.periodCloseReconciliation(pathname.split('/')[3]); return sendJson(res, r.ok?200:400, r);
  }

  // ---------- Admin: user/session management ----------
  // Phase 30 §11 — added `roles:D.ROLES` to this EXISTING route (a pre-Phase-30 route this phase
  // initially missed and nearly duplicated) so the new Users & Roles UI can populate its role
  // dropdown without a second endpoint. Never exposes passwordHash/passwordSalt.
  if(pathname==='/api/admin/users' && req.method==='GET'){
    if(!can(actor,'masterData')) return deny(res, 403, `Role "${actor.role}" cannot view user administration.`, {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, users: D.DB.users.map(u=>({id:u.id, username:u.username, name:u.name, role:u.role, active:u.active, assignedProjects:u.assignedProjects, assignedCustomers:u.assignedCustomers, lockedUntil:u.lockedUntil})), roles:D.ROLES});
  }
  if(pathname==='/api/admin/sessions' && req.method==='GET'){
    if(!can(actor,'masterData')) return deny(res, 403, `Role "${actor.role}" cannot view session administration.`, {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, activeSessions: A.sessionCount()});
  }
  // Phase 19 §28 — Password Security. Create User / Authorized Recovery are masterData-tier
  // (Admin/CEO only, same gate as every other user-administration action); Change Password is
  // available to any authenticated user for their OWN account only (actor.id, never a body-
  // supplied userId — cannot be used to change someone else's password).
  if(pathname==='/api/admin/users' && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res, 403, `Role "${actor.role}" cannot create users.`, {userId:actor.id, role:actor.role, path:pathname});
    const r = D.createUser({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/admin\/users\/[^/]+\/reset-password$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res, 403, `Role "${actor.role}" cannot reset another user's password.`, {userId:actor.id, role:actor.role, path:pathname});
    const r = D.resetUserPassword({userId:pathname.split('/')[4], newPassword:body.newPassword, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/change-password' && req.method==='POST'){
    const r = D.changeOwnPassword({actor, currentPassword:body.currentPassword, newPassword:body.newPassword}); return sendJson(res, r.ok?200:400, r);
  }

  // ================== Phase 33 — Finance SOP Compliance & Control Implementation ==================
  const SOP_FINANCE_ROLES = new Set(['Admin','CEO','FinanceManager']);
  const SOP_PURCHASE_ROLES = new Set(['Admin','CEO','FinanceManager','Purchase']);
  const SOP_SITE_ROLES = new Set(['Admin','CEO','FinanceManager','Purchase','SiteInCharge']);
  const SOP_VIEW_ROLES = new Set(['Admin','CEO','FinanceManager','Accountant','Purchase','ProjectManager','SiteInCharge','Viewer']);

  // ---------- Sites master ----------
  if(pathname==='/api/sites' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Sites.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, sites:D.listSites()});
  }
  if(pathname==='/api/sites' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role) && !can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a Site.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createSite({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/sites\/[^/]+\/active$/) && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot activate/deactivate a Site.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setSiteActive({siteId:pathname.split('/')[3], active:body.active, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---------- Company GST configuration + Place of Supply ----------
  if(pathname==='/api/company-gst-config' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Company GST Configuration.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, config:D.DB.companyGSTConfig});
  }
  // Phase 25 §8/§23 — same finding class: no route-level check; FINANCE_CONFIG_ROLES
  // (Admin/CEO/FinanceManager) already enforced inside setCompanyGSTConfig() itself.
  if(pathname==='/api/company-gst-config' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot configure company GST settings.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setCompanyGSTConfig({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/customers\/[^/]+\/state$/) && req.method==='POST'){
    if(!can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot set a customer's state.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setCustomerState({customerId:pathname.split('/')[3], state:body.state, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/place-of-supply' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot use Place of Supply lookup.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.determinePlaceOfSupply({customerId:parsed.query.customerId, siteState:parsed.query.siteState}); return sendJson(res, r.ok?200:400, r);
  }

  // ---------- Purchase Requisition ----------
  if(pathname==='/api/purchase-requisitions' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Purchase Requisitions.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, purchaseRequisitions:D.DB.purchaseRequisitions});
  }
  // POST /api/purchase-requisitions migrated to registerMutationRoute() above (Project Variation
  // Phase 7) — this if-block removed.
  if(pathname.match(/^\/api\/purchase-requisitions\/[^/]+\/submit$/) && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot submit a Purchase Requisition.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitPurchaseRequisition({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/purchase-requisitions\/[^/]+\/approve$/) && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot approve a Purchase Requisition.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approvePurchaseRequisition({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/purchase-requisitions\/[^/]+\/reject$/) && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot reject a Purchase Requisition.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectPurchaseRequisition({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---------- Purchase Approval / Cash / TDS / Payment-matrix configuration ----------
  if(pathname==='/api/purchase-approval-config' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Purchase Approval Configuration.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, config:D.DB.purchaseApprovalConfig});
  }
  if(pathname==='/api/purchase-approval-config' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot configure Purchase Approval settings.`,{userId:actor.id,role:actor.role,path:pathname});
    Object.assign(D.DB.purchaseApprovalConfig, body); D.save();
    D.logAudit({type:'PurchaseApprovalConfigChanged', config:D.DB.purchaseApprovalConfig, userId:actor.id, role:actor.role});
    return sendJson(res,200,{ok:true, config:D.DB.purchaseApprovalConfig});
  }
  if(pathname==='/api/cash-limits' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Cash Limits configuration.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, cashLimits:D.DB.cashLimits});
  }
  if(pathname==='/api/cash-limits' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot configure Cash Limits.`,{userId:actor.id,role:actor.role,path:pathname});
    Object.assign(D.DB.cashLimits, body); D.save();
    D.logAudit({type:'CashLimitsConfigChanged', cashLimits:D.DB.cashLimits, userId:actor.id, role:actor.role});
    return sendJson(res,200,{ok:true, cashLimits:D.DB.cashLimits});
  }
  if(pathname==='/api/cash-control-exceptions' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Cash Control Exceptions.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, exceptions:D.cashControlExceptionsReport()});
  }
  if(pathname==='/api/tds-config' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view TDS Configuration.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, tdsConfig:D.DB.tdsConfig, disclaimer:'SOP-sourced values, not independently verified as current tax law. Tax/Legal review required.'});
  }
  if(pathname==='/api/tds-config' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot configure TDS settings.`,{userId:actor.id,role:actor.role,path:pathname});
    Object.assign(D.DB.tdsConfig, body); D.save();
    D.logAudit({type:'TDSConfigChanged', tdsConfig:D.DB.tdsConfig, userId:actor.id, role:actor.role});
    return sendJson(res,200,{ok:true, tdsConfig:D.DB.tdsConfig});
  }
  if(pathname==='/api/tds-compute' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot compute TDS.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.computeTDS(body); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/tds-deductions' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view TDS Deductions.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, deductions:D.DB.tdsDeductions, summary:D.tdsComplianceSummary()});
  }
  if(pathname==='/api/seller-cumulative-report' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Seller Cumulative Report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rows:D.sellerCumulativeReport()});
  }
  if(pathname==='/api/payment-approval-matrix' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Payment Approval Matrix.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, matrix:D.DB.paymentApprovalMatrix});
  }
  // Phase 25 §8/§23 — the static scanner flagged these 3 (no route-level check at all — the
  // strictest case, since the /approve route's OWN comment above documented a "CEO/Admin only"
  // restriction that existed only inside the domain function, never at the route the scanner
  // reads). Verified live: all 3 were already correctly rejecting unauthorized roles via
  // FINANCE_CONFIG_ROLES / CEO+Admin checks inside setPaymentApprovalTiers() /
  // submitPaymentApprovalMatrixForReview() / approvePaymentApprovalMatrix(). Added below for
  // defense-in-depth and so the documented restriction is visible at the route, not only the
  // domain function — mirroring each domain check's role list exactly.
  if(pathname==='/api/payment-approval-matrix' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot configure the Payment Approval Matrix.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setPaymentApprovalTiers({tiers:body.tiers, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 36 §2.4 — a real Draft->Review->Approved workflow. `finalised` only ever becomes true
  // through the /approve route below (CEO/Admin only, requires an approval reference) — never as
  // a side effect of editing tiers or of any Finance-level configuration call.
  if(pathname==='/api/payment-approval-matrix/submit-for-review' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot submit the Payment Approval Matrix for review.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitPaymentApprovalMatrixForReview({actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/payment-approval-matrix/approve' && req.method==='POST'){
    if(!['CEO','Admin'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot approve the Payment Approval Matrix — Board-level policy decision (CEO/Admin only).`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approvePaymentApprovalMatrix({approvalReference:body.approvalReference, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // ---------- Phase 12 — PO Approval Authority Matrix (identical governance shape to the Payment
  // Approval Matrix immediately above; see the domain.js seed comment for the full policy
  // rationale). Configuring/approving this is System Administration Authority — it never, by
  // itself, grants the configuring/approving user any Purchase Order financial approval
  // authority. ------------------------------------------------------------------------------
  if(pathname==='/api/po-approval-authority-matrix' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the PO Approval Authority Matrix.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, matrix:D.DB.poApprovalAuthorityMatrix, poApprovalRules:D.DB.poApprovalRules});
  }
  if(pathname==='/api/po-approval-authority-matrix' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot configure the PO Approval Authority Matrix.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setPOApprovalAuthorityMatrix({roles:body.roles, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/po-approval-authority-matrix/submit-for-review' && req.method==='POST'){
    if(!['Admin','CEO','FinanceManager'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot submit the PO Approval Authority Matrix for review.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitPOApprovalAuthorityMatrixForReview({actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/po-approval-authority-matrix/approve' && req.method==='POST'){
    if(!['CEO','Admin'].includes(actor.role)) return deny(res,403,`Role "${actor.role}" cannot approve the PO Approval Authority Matrix — Board-level policy decision (CEO/Admin only).`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approvePOApprovalAuthorityMatrix({approvalReference:body.approvalReference, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // ---------- Phase 12 §13 — HSN Data Quality (strictly read-only) ----------
  if(pathname==='/api/reports/hsn-data-quality' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the HSN Data Quality report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200, D.hsnDataQualityReport());
  }

  // ---------- Site Material Subledger ----------
  if(pathname==='/api/site-material-requisitions' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Site Material Requisitions.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, requisitions:D.DB.siteMaterialRequisitions});
  }
  if(pathname==='/api/site-material-requisitions' && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create a Site Material Requisition.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createSiteMaterialRequisition({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/site-material-requisitions\/[^/]+\/submit$/) && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot submit a Site Material Requisition.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.submitSiteMaterialRequisition({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/site-material-requisitions\/[^/]+\/approve$/) && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot approve a Site Material Requisition.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveSiteMaterialRequisition({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/site-material-requisitions\/[^/]+\/reject$/) && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot reject a Site Material Requisition.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectSiteMaterialRequisition({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/site-material-requisitions\/[^/]+\/issue$/) && req.method==='POST'){
    if(!SOP_PURCHASE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot issue material to a site.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.issueToSite({mrsId:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/delivery-challans' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Delivery Challans.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, deliveryChallans:D.DB.deliveryChallans});
  }
  if(pathname==='/api/site-material-receipts' && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot record a Site Material Receipt.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createSiteMaterialReceipt({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/site-material-receipts' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Site Material Receipts.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, receipts:D.DB.siteMaterialReceipts});
  }
  // Targeted P1 Remediation phase — real Site Return, list/view route.
  if(pathname==='/api/site-returns' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Site Returns.`,{userId:actor.id,role:actor.role,path:pathname});
    let list = D.DB.siteReturns;
    if(parsed.query.siteId) list = list.filter(x=>x.siteId===parsed.query.siteId);
    if(parsed.query.projectId) list = list.filter(x=>x.projectId===parsed.query.projectId);
    return sendJson(res,200,{ok:true, siteReturns:list});
  }
  // Phase 24: /api/site-material-consumption migrated to registerMutationRoute() — see the
  // migration ledger and the Phase 24 report §1 for the full duplicate-door investigation.
  if(pathname==='/api/site-stock' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Site Stock.`,{userId:actor.id,role:actor.role,path:pathname});
    if(!parsed.query.materialId || !parsed.query.siteId) return sendJson(res,400,{ok:false, error:'materialId and siteId query params are required.'});
    return sendJson(res,200,{ok:true, stock:D.getSiteStockLevel(parsed.query.materialId, parsed.query.siteId)});
  }
  if(pathname==='/api/site-material-reconciliation' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the Site Material Reconciliation report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rows:D.siteMaterialReconciliationReport(parsed.query.siteId||null)});
  }

  // ---------- Payment maker-checker ----------
  if(pathname==='/api/payment-requests' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Payment Requests.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, paymentRequests:D.DB.paymentApprovals});
  }
  // Phase 22: /api/payment-requests migrated to registerMutationRoute() — see the migration ledger.
  // (This also newly adds idempotency protection that the direct call never had before.)
  if(pathname.match(/^\/api\/payment-requests\/[^/]+\/approve$/) && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot approve a payment request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approvePaymentRequest({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/payment-requests\/[^/]+\/reject$/) && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot reject a payment request.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.rejectPaymentRequest({id:pathname.split('/')[3], reason:body.reason, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/payment-requests\/[^/]+\/execute$/) && req.method==='POST'){
    if(!can(actor,'pay')) return deny(res,403,`Role "${actor.role}" is not authorized to execute payments.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.executePaymentRequest({id:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---------- Petty Cash / Imprest ----------
  if(pathname==='/api/petty-cash-floats' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Petty Cash Floats.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, floats:D.DB.pettyCashFloats});
  }
  if(pathname==='/api/petty-cash-floats' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create a Petty Cash Float.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createPettyCashFloat({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/petty-cash-vouchers' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Petty Cash Vouchers.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, vouchers:D.DB.pettyCashVouchers});
  }
  if(pathname==='/api/petty-cash-vouchers' && req.method==='POST'){
    if(!SOP_SITE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot record a Petty Cash Voucher.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordPettyCashVoucher({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/petty-cash-floats\/[^/]+\/reconciliation$/) && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Petty Cash Reconciliation.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.pettyCashReconciliation(pathname.split('/')[3]); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 25: /api/petty-cash-floats/:id/replenish migrated to registerMutationRoute().

  // ---------- SOP Compliance Dashboard ----------
  if(pathname==='/api/sop-compliance-dashboard' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view the SOP Compliance Dashboard.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, dashboard:D.sopComplianceDashboard()});
  }
  // Phase 36 §2.1 — exposes the configured weighment tolerance so the GRN screen can show
  // "within tolerance" vs "variance — approval required" without duplicating the backend's own
  // variance calculation (createGRN() remains the single source of truth; this just lets the UI
  // render a live preview before submitting).
  if(pathname==='/api/weighment-tolerance' && req.method==='GET'){
    return sendJson(res,200,{ok:true, tolerancePct: D.DB.weighmentTolerancePct!=null?D.DB.weighmentTolerancePct:1});
  }

  // ================== Phase 34 — Job Work/APOB, Ship-to GSTIN, E-way Bill, ITC, BOQ, policy config ==================
  // ---------- Job Worker master ----------
  if(pathname==='/api/job-workers' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Job Workers.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, jobWorkers:D.DB.jobWorkers});
  }
  if(pathname==='/api/job-workers' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role) && !can(actor,'masterData')) return deny(res,403,`Role "${actor.role}" cannot create a Job Worker.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createJobWorker({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/job-workers\/[^/]+\/active$/) && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot activate/deactivate a Job Worker.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setJobWorkerActive({jobWorkerId:pathname.split('/')[3], active:body.active, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // ---------- Job Work Orders (dispatch / return / scrap / direct dispatch) ----------
  if(pathname==='/api/job-work-orders' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Job Work Orders.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, jobWorkOrders:D.DB.jobWorkOrders});
  }
  if(pathname==='/api/job-work-orders' && req.method==='POST'){
    if(!SOP_PURCHASE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot dispatch material to a Job Worker.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.dispatchToJobWorker({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/job-work-orders\/[^/]+\/return$/) && req.method==='POST'){
    if(!SOP_PURCHASE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot record a Job Work return.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.returnFromJobWorker({jwoId:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/job-work-orders\/[^/]+\/scrap$/) && req.method==='POST'){
    if(!SOP_PURCHASE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot record Job Work scrap.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordJobWorkScrap({jwoId:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/job-work-orders\/[^/]+\/direct-dispatch$/) && req.method==='POST'){
    if(!SOP_PURCHASE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot record a Job Work direct customer dispatch.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.directDispatchFromJobWorker({jwoId:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname==='/api/job-work-aging' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Job Work Aging.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, rows:D.jobWorkAgingReport()});
  }
  if(pathname.match(/^\/api\/job-work-orders\/[^/]+\/request-extension$/) && req.method==='POST'){
    if(!SOP_PURCHASE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot request a Job Work extension.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.requestJobWorkExtension({jwoId:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/job-work-extensions\/[^/]+\/approve$/) && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot approve a Job Work extension.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.approveJobWorkExtension({id:pathname.split('/')[3], actor}); return sendJson(res, r.ok?200:400, r);
  }
  // ---------- APOB declarations ----------
  if(pathname==='/api/apob-declarations' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view APOB Declarations.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, declarations:D.DB.apobDeclarations});
  }
  if(pathname==='/api/apob-declarations' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create an APOB Declaration.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createAPOBDeclaration({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/apob-declarations\/[^/]+\/active$/) && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot activate/deactivate an APOB Declaration.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setAPOBDeclarationActive({id:pathname.split('/')[3], active:body.active, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // ---------- E-way Bill (manual-entry tracking only) ----------
  if(pathname==='/api/eway-bills' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view E-way Bill records.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, ewayBills:D.DB.ewayBills});
  }
  if(pathname==='/api/eway-bills' && req.method==='POST'){
    if(!SOP_PURCHASE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot create an E-way Bill record.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.createEwayBillRecord({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  if(pathname.match(/^\/api\/eway-bills\/[^/]+\/record-number$/) && req.method==='POST'){
    if(!SOP_PURCHASE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot record an E-way Bill number.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.recordEwayBillNumber({id:pathname.split('/')[3], ...body, actor}); return sendJson(res, r.ok?200:400, r);
  }
  // ---------- ITC reversal report ----------
  if(pathname==='/api/itc-reversal-report' && req.method==='GET'){
    if(!isGLVisible(actor)) return deny(res,403,`Role "${actor.role}" cannot view the ITC Reversal report.`,{userId:actor.id,role:actor.role,path:pathname});
    return sendJson(res,200,{ok:true, ...D.itcReversalReport()});
  }
  // ---------- BOQ variance report ----------
  if(pathname==='/api/boq-variance' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role) && actor.role!=='ProjectManager') return deny(res,403,`Role "${actor.role}" cannot view the BOQ Variance report.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.projectBOQVarianceReport(parsed.query.projectId); return sendJson(res, r.ok?200:400, r);
  }
  // ---------- Three-way-match payment-category policy ----------
  if(pathname==='/api/payment-category-policy' && req.method==='GET'){
    if(!SOP_VIEW_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot view Payment Category Policy.`,{userId:actor.id,role:actor.role,path:pathname});
    if(parsed.query.category) return sendJson(res,200,{ok:true, ...D.paymentCategoryPolicyStatus(parsed.query.category)});
    return sendJson(res,200,{ok:true, config:D.DB.threeWayMatchPolicyConfig});
  }
  if(pathname==='/api/payment-category-policy/confirm' && req.method==='POST'){
    if(!SOP_FINANCE_ROLES.has(actor.role)) return deny(res,403,`Role "${actor.role}" cannot confirm Payment Category Policy.`,{userId:actor.id,role:actor.role,path:pathname});
    const r = D.setThreeWayMatchPolicyConfirmed({...body, actor}); return sendJson(res, r.ok?200:400, r);
  }

  // ---------- Test-only: reset DB to fresh seed (used by the test harness, never by real users) ----------
  if(pathname==='/api/test/reset' && req.method==='POST'){
    if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(res, actor, pathname);
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may reset test data.', {userId:actor.id, role:actor.role, path:pathname});
    D.resetToFreshSeed();
    return sendJson(res, 200, {ok:true});
  }
  // Phase 35 Part A — controlled fault-injection instrumentation, same tier as the reset/backdate
  // test endpoints above. Sets a module-level (never DB-persisted) one-shot flag that a small,
  // clearly-labeled set of real mutation sequences check at named boundaries. Never reachable by or
  // exposed to a real business user/role.
  if(pathname==='/api/test/set-fault' && req.method==='POST'){
    if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(res, actor, pathname);
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may set a test fault point.', {userId:actor.id, role:actor.role, path:pathname});
    D.setTestFaultPoint(body.point || null);
    return sendJson(res, 200, {ok:true, point: body.point || null});
  }
  // Phase 37 Part E — arms a REAL process-crash injection point (process.exit(), not a catchable
  // exception). Same tier as the other test-only endpoints. The response to THIS call completes
  // normally; the crash fires on whichever LATER request first reaches the armed point.
  if(pathname==='/api/test/set-crash' && req.method==='POST'){
    if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(res, actor, pathname);
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may arm a test crash point.', {userId:actor.id, role:actor.role, path:pathname});
    D.setTestCrashPoint(body.point || null);
    return sendJson(res, 200, {ok:true, point: body.point || null});
  }
  // Phase 38 — toggle the write-point guard between audit mode (default, logs only) and enforce
  // mode (hard-blocks any DB.journalEntries/inventoryMovements/clearings mutation attempted
  // outside an active withTransaction() boundary). Admin-only, same tier as the other test toggles.
  if(pathname==='/api/test/set-enforce-transaction-boundary' && req.method==='POST'){
    if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(res, actor, pathname);
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may toggle transaction-boundary enforcement.', {userId:actor.id, role:actor.role, path:pathname});
    D.setEnforceTransactionBoundary(!!body.enforce);
    return sendJson(res, 200, {ok:true, enforce: D.getEnforceTransactionBoundary()});
  }
  if(pathname==='/api/test/architectural-violations' && req.method==='GET'){
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may view architectural violation records.', {userId:actor.id, role:actor.role, path:pathname});
    return sendJson(res, 200, {ok:true, violations: D.DB.__architecturalViolations||[], count:(D.DB.__architecturalViolations||[]).length, enforce: D.getEnforceTransactionBoundary()});
  }
  // Phase 38 Part D naive-developer re-test routes (/api/test/naive-tx-modern,
  // /api/test/naive-tx-legacy) — removed after producing their evidence, see the Phase 38 report.
  // Phase 36 — temporary before/after proof toggle, same tier as the fault-point endpoint above.
  if(pathname==='/api/test/set-skip-rollback' && req.method==='POST'){
    if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(res, actor, pathname);
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may toggle rollback for a before/after test.', {userId:actor.id, role:actor.role, path:pathname});
    D.setSkipRollbackForBeforeTest(!!body.skip);
    return sendJson(res, 200, {ok:true, skip: !!body.skip});
  }
  // Phase 36 §7/§8 — One-Click Demo Scenario. Admin-only (same tier as the reset above, since it
  // creates a real chain of demo transactions an untrained UAT tester shouldn't trigger by accident).
  if(pathname==='/api/demo/seed-scenario' && req.method==='POST'){
    // ERP-059C — deliberately NOT placed behind the IS_TEST_ENV guard used for the /api/test/*
    // endpoints below. Unlike those (which the codebase's own comments describe as "never exposed
    // to or usable by a real user role"), this route's Phase 36 comment describes it as a real
    // UAT-facing feature ("One-Click Demo Scenario") that an authorized Admin may need to run
    // against a live pre-launch/UAT environment, not only inside an automated test run. Disabling it
    // outside APP_ENV=test would be a functional change beyond this phase's authorized scope
    // (production/test isolation) without the user's explicit sign-off. Left Admin-gated only, as
    // before; flagged as an open scope question in ERP-059C-TEST-ISOLATION-REPORT.md rather than
    // silently changed.
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may seed the demo scenario.', {userId:actor.id, role:actor.role, path:pathname});
    const r = D.seedDemoScenario(); return sendJson(res, r.ok?200:400, r);
  }
  // Phase 36 §9 — Document Flow / Traceability, read-only.
  if(pathname==='/api/projects/document-trace' && req.method==='GET'){
    const r = D.projectDocumentTrace(parsed.query.projectId); return sendJson(res, r.ok?200:400, r);
  }
  // Test-only: backdate a ticket's SLA-relevant timestamps so the SLA engine's exact hour
  // boundaries (4h/72h) can be verified without waiting real hours. Mirrors /api/test/reset —
  // Admin-only, clearly test-infrastructure, never exposed to or usable by a real user role. NO
  // ordinary endpoint anywhere accepts a caller-supplied SLA due date (POL-08's own requirement)
  // — this exists solely so automated tests can verify the boundary math, not to let anyone
  // manipulate a real ticket's SLA outcome.
  if(pathname==='/api/test/backdate-ticket' && req.method==='POST'){
    if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(res, actor, pathname);
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may backdate test data.', {userId:actor.id, role:actor.role, path:pathname});
    const tkt = D.DB.serviceTickets.find(t=>t.id===body.ticketId);
    if(!tkt) return sendJson(res,404,{ok:false, error:'Ticket not found.'});
    if(body.createdAt) tkt.createdAt = body.createdAt;
    if(body.firstRespondedAt!==undefined) tkt.firstRespondedAt = body.firstRespondedAt;
    D.save();
    return sendJson(res, 200, {ok:true, ticket:tkt});
  }
  if(pathname==='/api/test/backdate-visit' && req.method==='POST'){
    if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(res, actor, pathname);
    if(!(actor.role==='Admin')) return deny(res, 403, 'Only Admin may backdate test data.', {userId:actor.id, role:actor.role, path:pathname});
    const vis = D.DB.serviceVisits.find(v=>v.id===body.visitId);
    if(!vis) return sendJson(res,404,{ok:false, error:'Visit not found.'});
    if(body.startTime!==undefined) vis.startTime = body.startTime;
    D.save();
    return sendJson(res, 200, {ok:true, visit:vis});
  }

  D.logAudit({type:'AccessDenied', reason:'no matching route', path:pathname, method:req.method, userId:actor.id, role:actor.role});
  sendJson(res, 404, {ok:false, error:'Not found.'});
}

// Phase 25 §8/§9 — the structural legacy-route safety gate. Runs BEFORE listen(): if any legacy
// mutation branch in this very file has no recognizable authorization check, this throws and the
// process never binds to the port — exactly the same boot-crash property registerMutationRoute()
// already has for missing permission/roles/authCheck, now extended to the legacy dispatcher too.
require('./route_safety_scanner').runRouteSafetyAudit(__filename);

// ERP-059C — Step 6 startup diagnostics. Printed unconditionally (not just in test/dev) so a
// production operator can also SEE, at a glance, that destructive test endpoints are disabled —
// this is deliberately the same code path for every APP_ENV, not a test-only nicety, because the
// incident this phase responds to happened precisely because nothing distinguished the two servers
// at a glance. Never prints a secret: APP_ENV, port, DB path, and the enabled/disabled flag are not
// sensitive, and no credential or token is read here.
server.listen(PORT, ()=>{
  console.log(`[Phase 6A] Appletree SAP Lab secure server listening on http://localhost:${PORT}`);
  console.log(`[ERP-059C] APP_ENV=${APP_ENV}`);
  console.log(`[ERP-059C] Database path: ${D.DB_FILE}`);
  console.log(`[ERP-059C] Destructive test endpoints (${IS_TEST_ENV ? 'ENABLED' : 'DISABLED'}): /api/test/reset, /api/test/set-fault, /api/test/set-crash, /api/test/set-enforce-transaction-boundary, /api/test/set-skip-rollback, /api/test/backdate-ticket, /api/test/backdate-visit`);
  console.log(`[ERP-059C] Process PID: ${process.pid}`);
  if(APP_ENV === 'production'){
    console.log(`[ERP-059C] Running as PRODUCTION. Destructive test endpoints DISABLED regardless of port or role.`);
  } else if(!IS_TEST_ENV){
    console.log(`[ERP-059C] APP_ENV is not 'test' — destructive test endpoints DISABLED (fail-closed default). Set APP_ENV=test to enable them on a disposable server.`);
  }
});
