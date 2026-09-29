# ARCH-2026-002 — Security Baseline

**Date:** 2026-09-22. Phase 0 deliverable, §16/§26. Per this CR's own §16 instruction, findings below
are reported, NOT fixed, in Phase 0 — except that this CR also requires an immediate STOP if a CRITICAL
vulnerability is found. **No CRITICAL vulnerability was found.** See §3 (Critical Finding Check) before
anything else.

## 1. Critical finding check — result: NO STOP REQUIRED

No mutating route reachable by any logged-in user regardless of role was found without an
authentication/authorization check, and no route lets a client-supplied field override the
authenticated actor's identity or role. Every state-changing call passes through `getActor(req)` (401
if unauthenticated) before reaching a mutation route, and every sampled mutating function is gated by
`can()`, an explicit role allow-list, an `assertCanXxx()` helper, or `registerMutationRoute()`'s
mandatory `permission`/`roles`/`authCheck`. This was independently re-confirmed across all 18
EXISTING/PARTIAL domains sampled below — **the calling process does not need to stop.**

## 2. Domain-by-domain security-layer coverage

Sampled 2-4 real mutating functions per domain (18 domains — the 7 confirmed-ABSENT domains are
out of scope, nothing to audit). YES / PARTIAL / N/A (not applicable to this transaction type) /
**MISSING**.

| Domain | Sample function(s) checked | RBAC | Data Scope | SoD | Approval Authority | Audit | Notes |
|---|---|---|---|---|---|---|---|
| 1. Home & Workspace | `POST /api/login`, `getActor`/session | YES | N/A | N/A | N/A | YES | Lockout after 5 failures, HttpOnly+SameSite cookie, no plaintext password storage |
| 2. Sales & CRM | `createLead`, `createQuotation`, `approveQuotationDiscount` | YES | YES (`canSeeLead`, Sales filtered to own `salesOwnerId`) | YES (creator≠approver check) | YES (tiered discount-role check) | YES | Legacy inline role checks confirmed present (per Dependency Map), but correctly enforced at every sampled call site |
| 3. Estimation & Costing | `createCostingVersion`, `createBOM` | YES | **PARTIAL** (Sales gets field-stripped view; no per-project scope filter on costing GET) | N/A | YES (BOM submit/approve state machine) | YES | Not a security gap — costing is estimator-tier and revenue numbers are stripped for Sales |
| 4. Project & Contract Mgmt | `createProjectMaster`, `createChangeRequest`/`approveChangeRequest` | YES | YES (`hasScopeAccess`/PM ownership on CR approve) | YES (creator≠approver) | YES (tiered role) | YES | Well-designed; CR approval mirrors the quotation-discount pattern intentionally |
| 5. Procurement & Supplier Mgmt | `createPurchaseOrder`, `createGRN`, `executePaymentRequest` | YES | N/A (project-open gate, not identity-scope) | YES (SOD-5 + 3-party maker/checker/executor) | YES (tiered) | YES | The most defended module — 3-stage separation plus a dedicated SoD-5 rule |
| 6. Inventory/Warehouse/Logistics | `createMaterialIssue`, `createInventoryAdjustment`, `createInventoryTransfer` | YES | YES (`isProjectManagerOf`/`isSiteInChargeOf` for issue; role-list for adjustment/transfer) | N/A | N/A | YES | Clean |
| 7. Manufacturing | `createProductionOrder`, `createJobCard` | YES | YES (`hasScopeAccess`, project ownership) | N/A | N/A | YES | Issue/complete/hold/resume/cancel/close were historically ungated (Phase 9B), now consistently checked via `prodOrderAllowed()` |
| 8. Job Work/Subcontracting | `directDispatchFromJobWorker`, dispatch/return `assertCanXxx` | YES | N/A | N/A | N/A | YES | Consistent with Procurement's pattern |
| 9. Site Execution & Delivery | `createDispatch`, `createHandover` | YES | YES (`hasScopeAccess`/`execAllowed`) | N/A | YES (`approveDispatch` finance-tier) | YES | Ready/dispatch transitions were historically ungated (Phase 9B), now fixed |
| 10. Quality Management | `createQCChecklist`, `submitQCResult` | YES | YES | N/A | N/A | **PARTIAL** — `createQCChecklist` has no `logAudit()` call, only `submitQCResult` does | Minor genuine gap: checklist creation isn't separately audited. Low severity, not exploitable for privilege escalation, but a real traceability gap |
| 11. Finance & Accounting | `postJournalEntry`, `postCustomerReceipt`, `postSupplierPayment` | YES | N/A (company-wide GL by design) | N/A (SoD applied upstream at Payment Request/Supplier Invoice) | YES (financial-period-closed override requires configured role+reason) | YES | Single-choke-point design is genuinely strong — every posting path funnels through one capability-checked function |
| 12. Controlling | `createCostCentreMaster`, `createProfitCentre` | YES | N/A | N/A | N/A | YES | Straightforward, correctly gated master-data CRUD |
| 13. Treasury & Cash Mgmt | `createBankTransfer`, `importBankStatement` | YES | N/A | N/A | N/A | YES | Clean |
| 14. Asset Management | `capitalizeFixedAsset`, `disposeFixedAsset` | YES | N/A | N/A | N/A | YES | Transaction-rollback-safe on GL/status desync |
| 15. Service & After-Sales | `createServiceTicket`, `draftAMCBillingInvoice` | YES | YES (by Project/Customer depending on role) | N/A | N/A (threshold exists via `policyConfig.warrantyApprovalThreshold`) | YES | Clean |
| 16. Reporting & Analytics | `GET /api/reports/budget-variance`, management-mis/accountant-mis | YES (role allow-list) | **MISSING — genuine, real, currently-reproducible gap** | N/A | N/A | N/A (read-only) | `projectBudgetVarianceReport(projectId)` has no `hasScopeAccess` check; a ProjectManager can call it with no `projectId` (or any other project's) and receive budget/commitment/actual/margin data for every project company-wide, not just their own |
| 17. Master Data | `createVendorMaster`, `createMaterialMaster`, `findOrCreateCustomer` | YES | N/A | N/A | N/A | YES | Clean, single masterData gate reused everywhere |
| 18. Administration & Governance | `createUser`, `grantSoDException`, `setPolicyConfig` | YES | N/A | N/A (exception grant is itself Admin/CEO-only, appropriately not subject to a second maker-checker) | N/A | YES | Strong — password strength enforced, durable audit even on rejected user creation |

## 3. Findings requiring follow-up (not fixed in Phase 0)

### 3.1 Domain #16 Reporting & Analytics — cross-project budget/cost/margin data leak (MODERATE, not CRITICAL)

`GET /api/reports/budget-variance` → `projectBudgetVarianceReport(projectId)` (domain.js ~12488-12490)
passes `projectId` straight through with no `hasScopeAccess()` call: `projectId ?
DB.projects.filter(p=>p.id===projectId) : DB.projects`. A `ProjectManager` — allow-listed for this
route — can omit `projectId` or supply another project's ID and receive budget/commitment/actual-cost/
margin data for every project company-wide, not just their own assigned projects.

**Why this is not classified CRITICAL** (per this engagement's own bar: a mutating route with no
auth, or a route letting a client override its own identity/role): this is a read-only report route,
requires an authenticated, already-role-checked session, and does not let anyone assume another
identity. It is a genuine, exploitable-today **confidentiality/data-scope gap**, not an authentication
or authorization-bypass gap — hence MODERATE, reported and carried forward, not a stop condition.

**Disposition:** recorded in `ARCH-2026-002-OPEN-DECISIONS.md` item 8 as a fix candidate for whichever
wave next touches Reporting & Analytics (Wave 1) or Project & Contract Management reporting — not fixed
in this Phase 0, per this CR's own "audit only" rule.

### 3.2 Domain #10 Quality Management — QC checklist creation not separately audited (LOW)

`createQCChecklist` has no `logAudit()` call; only `submitQCResult` does. Low severity — not
exploitable for privilege escalation — but a real traceability gap (checklist *creation* time/actor is
not independently recorded). Recorded in `ARCH-2026-002-OPEN-DECISIONS.md` item 8 alongside 3.1.

## 4. Conclusion

Across 18 sampled domains and ~30 mutating functions/routes actually read (not just grepped), every
state-changing route required a valid authenticated session and an explicit RBAC gate, with no case of
a client supplying or overriding its own identity/role, and no mutating route reachable by an arbitrary
logged-in role with zero authorization check. **There is no single, currently-exploitable CRITICAL
vulnerability across the 18 domains sampled.** Two genuine, lower-severity findings (3.1, 3.2) are
reported for future remediation, not fixed here.
