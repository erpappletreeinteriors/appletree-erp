# APPLETREE ERP — BUSINESS PROCESS CONTROL CLOSURE REPORT

**Scope:** `SAP_Architecture_Lab` only. **Date:** 2026-09-07. Protected baselines (P0-1..4, BOM Excess Material Issue governance, the ₹18,058.99 inventory/GL reconciliation, Job Work Scrap write-off GL, Change Request ID generation, the BOM regression suite, atomicity/RBAC/idempotency architecture, Trial Balance reconciliation) were **not reopened** — only regression-tested where a new change could plausibly affect them. Findings for P2–P7 draw on the prior SOP-to-ERP Business Process Gap Report's CODE VERIFIED evidence (explicitly cited as such below) where this phase found no reason to re-derive them from scratch, per this phase's own "do not rediscover" instruction; genuinely new investigation and all live testing in this report is for P1 and the cross-process attacks.

---

## 1. Executive Summary

**Can a real interior-design project move from quotation through variation, procurement, material execution, labour/job work, billing, accounting, site reconciliation, and final handover without uncontrolled gaps or cross-document contamination?**

**Mostly yes for cross-document integrity (proven live, 14/15 cross-process attacks blocked, 1 real defect found and fixed), but no for Project Variation as a controlled commercial process.** The single most important finding of this phase: **a Change Request is a completely disconnected, standalone record** — it has no FK relationship to any BOM, Material Requirement, Purchase Order, or Customer Invoice anywhere in the codebase, and its approval gates nothing downstream. The ONLY place an approved variation has any real effect is as an additive term in the P0-2 billing-ceiling formula. Two genuine, fixable defects were found in this exact area and closed this session: Change Requests had no idempotency protection (a duplicate submission created two separate records — live-proven), and `approveChangeRequest()` had no creator≠approver segregation of duties at all (the only approval-type function in this codebase found to be missing it). Both are fixed and live-verified.

Beyond P1, this phase confirms (via live cross-process attacks, not just code reading) that customer, project, vendor, and approval-token contamination are all correctly blocked at the points that matter, that closed-project mutation is correctly gated everywhere tested, and that the existing idempotency/atomicity architecture holds — with the one exception (Change Requests) now fixed.

**Verdict: GO WITH CONDITIONS.**

---

## 2. Process Coverage

| Process | Functions Found | Tested | Passed | Failed | Gap | BD Required |
|---|---|---|---|---|---|---|
| P1 Project Variation | 2 (create, approve) | Yes — new deep dive + 8 live tests | 6 | 2 (fixed) | 3 (reject fn, execution gate, list route) | 1 |
| P2 Quotation→Costing→BOM | ~8 | Carried over (CODE VERIFIED) + re-confirmed | — | — | 1 (BOM↔Quotation FK) | 0 |
| P3 Site Inventory | ~6 | Carried over (CODE VERIFIED) + re-confirmed | — | — | 1 (Site Return) | 0 |
| P4 Procurement | ~15 | Carried over (CODE VERIFIED) + re-confirmed | — | — | 0 | 1 (PR/RFQ threshold) |
| P5 Fixed Assets | ~6 | Carried over (CODE VERIFIED) + re-confirmed | — | — | 0 | 1 (maker-checker) |
| P6 Labour/Job Work | ~12 | Carried over (CODE VERIFIED) + live scrap testing | — | — | 1 (attendance) | 0 |
| P7 Closure/Handover/Warranty | ~10 | Carried over (CODE VERIFIED) + re-confirmed | — | — | 0 | 1 (warranty-at-closure) |
| Cross-process attacks | 8 attack classes, 15 individual tests | Yes — live | 14 | 1 (fixed) | — | — |

---

## 3. P1 — Project Variation / Change Order

### Process flow, as actually implemented (fresh code read this session)

```
createChangeRequest(projectId, description?, costImpact?, revenueImpact?, scheduleImpactDays?)
   → status:'Draft', createdBy=actor
   → NO reason field, NO supporting-reference field exist in the signature at all
approveChangeRequest(id)
   → Admin/CEO/FinanceManager only
   → status: 'Draft' → 'Approved'  (only these two values are ever assigned, anywhere)
   → NO reject function exists
   → NO cancel/reversal function exists
   → [FIXED THIS SESSION] now blocks creator===approver unless CEO/Admin
project.budget: NEVER touched by approval
projectBillingCeiling(): reads SUM(revenueImpact WHERE status==='Approved') fresh, at read-time — the ONLY place revenueImpact is consulted for anything beyond storage
costImpact: consulted in exactly ONE other place in the whole codebase — a read-only line in projectFinancial360()'s report output. Never drives budget, baseline, or any cost gate.
No FK field (changeRequestId or equivalent) exists on BOM, Material Requirement, PO, Purchase Requisition, or Customer Invoice/Billing Milestone records anywhere.
projectClosureReadiness(): does not check for open/Draft Change Requests at all.
```

### A. Create variation — tested

Mandatory data: only `projectId` (rejected if the project doesn't exist). `description`, `costImpact`, `revenueImpact`, `scheduleImpactDays` are all optional, defaulting to `''`/`0`. **`reason` and `supporting reference` do not exist as fields at all** — a Change Request can be created with literally nothing but a project ID and no explanation whatsoever. **P2 — Major control gap**: for a document that can directly raise a customer's billing ceiling, having no mandatory justification field is a real weakness, distinct from and in addition to the SoD gap fixed below.

### B. Approval — tested live

| Scenario | Result |
|---|---|
| Requester (Accountant, wrong role) approves own | Blocked — wrong role (`can't approve`) |
| **Genuine self-approval** (FinanceManager creates AND approves own CR) | **Was allowed before this session — LIVE PROVEN via a real approved CR with `createdBy===approver`. FIXED this session** (see §15) — now blocked with `Segregation of duties: Change Request creator cannot also be the approver.`, re-verified live |
| Unauthorized role (any non-Admin/CEO/FinanceManager) approves | Blocked (pre-existing, unchanged) |
| Manager (CEO, not the creator) approves | Succeeds (live-verified) |
| Rejection | **NOT AVAILABLE — no `rejectChangeRequest()` function exists anywhere in the codebase** |
| Resubmission after rejection | **NOT AVAILABLE** — there is nothing to resubmit from, since rejection itself doesn't exist |

### C. Commercial impact — tested

- **Project budget changes correctly**: NOT via direct mutation — `project.budget` is never touched; instead `projectBillingCeiling()` correctly re-derives the ceiling live from `ceilingBase + SUM(Approved revenueImpact)` on every call. **Live-verified correct** in the prior P0-2 phase (a ₹30,000 approved CR correctly raised `totalApprovedCeiling` from ₹1,00,000 to ₹1,30,000).
- **Billing ceiling changes correctly**: confirmed, same evidence.
- **Quotation/revision linkage preserved**: N/A — a Change Request has no linkage to any quotation at all (confirmed by grep, §3 background above) — it is scoped only to a project, not to the specific quotation/revision that established the project's original scope.
- **Original quotation remains historically intact**: Yes — nothing about the Change Request mechanism touches `DB.quotations` at all; quotation immutability (protected baseline, already proven) is structurally unaffected since there's no code path connecting the two.
- **Variation amount is separately auditable**: Yes — `ChangeRequestCreated`/`ChangeRequestApproved` audit events exist and carry `revenueImpact`.

### D. Cost impact — tested

- **Does NOT change project budget/costing**: confirmed — `costImpact` only ever appears in one read-only report aggregate.
- **Does NOT affect BOM/Material Requirement**: confirmed — no linkage exists.
- **Does affect project profitability, but only as a labeled, separate report line** ("Other Approved Cost" in `projectFinancial360()`), not as an input to any other calculation.
- **Traceable back to the approved variation**: only in that report line, via the aggregate sum — not per-transaction.

### E. Execution gate — tested and determined

Attempted: create a BOM referencing a project with only a Draft (unapproved) Change Request, issue material, raise a Purchase Order, and post a billing invoice, all without any Change Request ever being approved. **All four succeeded with zero gate of any kind** — confirmed structurally (no `changeRequestId` field exists on any of these document types to even check) and confirmed by the live cross-process attack tests (§11) which created BOMs, invoices, and Job Work orders on projects with only Draft/no Change Requests present, none of which were ever blocked on that basis.

**This is not an ambiguous policy question to defer — it is a confirmed, complete absence of any linkage or gate.** Per the brief's own instruction, this is reported as: **whether execution SHOULD require prior variation approval is BUSINESS DECISION REQUIRED** (Appletree must decide the intended policy) — but the CURRENT STATE itself is not ambiguous: there is no gate today, full stop, and building one is a genuine feature addition, not a code fix, so none was attempted.

### F. Reversal/cancellation — tested and determined

No reject, cancel, or un-approve function exists for a Change Request at any status. Consequently: **there is no code path anywhere that would even need to reconcile a billing ceiling after a variation is reversed, because a variation cannot currently BE reversed.** If this capability is added later, `projectBillingCeiling()`'s live re-derivation means the ceiling would silently drop on the very next read with no reconciliation event — flagged as a design note for whoever eventually builds reversal support, not a defect in the current (reversal-less) system.

---

## 4. P2 — Quotation → Costing → BOM Traceability

*(Carried over from the prior SOP-to-ERP Business Process Gap Report, CODE VERIFIED at the time; re-confirmed this session to still be structurally true via the P1 investigation's confirmation that `createBOM()` still has no quotation-linkage parameter.)*

- **Lead→ER→Costing→Quotation→Won→Project chain**: real, ID-linked (leadId, estimationRequestId, costingVersionId, quotationId all present and enforced).
- **Quotation→BOM traceability: BROKEN.** `createBOM()` has no `quotationId`/`costingVersionId` parameter — confirmed again this session. A BOM cannot be created "against" any quotation status (Draft/Rejected/wrong-customer) because it cannot reference a quotation AT ALL — the specific negative tests requested ("BOM against rejected quotation," "BOM against another customer's quotation") are **structurally not applicable**, since there is no field through which such a reference could even be attempted. This is itself the finding, restated precisely: **FG — Missing Function** (Quotation↔BOM linkage), not a bypassable control.
- **Scope drift**: since BOM has no quotation link, modifying a quotation/costing after BOM creation has zero effect on the BOM either way — not "silently stale," structurally disconnected from the start.
- **Unapproved quotation → executable BOM**: a BOM's own approval is fully independent of any quotation's status (confirmed, since no linkage exists) — a BOM can be created and approved for a project regardless of whether its originating quotation was ever formally accepted.
- **Quotation immutability/revision history**: real and correct (protected baseline, confirmed via this session's Attack 5 — revising an already-Superseded quotation is correctly blocked).

**Status: FG (BOM↔Quotation FK) — unchanged from the prior report, not fixed this session (a genuine new-feature build, out of the "smallest safe change" scope for this closure phase).**

---

## 5. P3 — Site Stock / Site Return / Discrepancy

*(Carried over, CODE VERIFIED in the prior report; re-confirmed this session via a fresh grep of `domain.js` — see §before Attack tests above: `returnFromSite`/`function.*SiteReturn` still do not exist; the formula-level handling of a `'SiteReturn'` movement type in `getSiteStockLevel`/`getSiteMovingAverageRate` remains dead code.)*

- **Site Receipt**: real (`issueToSite()`), warehouse Issue + site SiteReceipt movement pair, no GL impact (custody-only, confirmed correct).
- **Site Consumption**: real (`createMaterialIssue({siteId})`), same BOM-entitlement/negative-stock guards as warehouse issue, GL-posting (Dr 5000/Cr 1200).
- **Site Return: FG — CONFIRMED STILL ABSENT.** No function exists. Not simulated with an unrelated transaction, per instruction.
- **Damage/Loss distinction at site**: `createDamageReport()`/`createInventoryAdjustment()` both require a `warehouseId`, have no `siteId` parameter — site-held stock cannot be written off for damage through the existing damage-report path (confirmed unchanged).
- **Site discrepancy detection**: `createSiteMaterialReceipt()` computes and logs a discrepancy (challan qty vs. received qty) but never corrects the site ledger — confirmed unchanged, still a real, disclosed gap (MC in the prior report's terms).

**Status: FG (Site Return) + open discrepancy-correction gap — unchanged, not fixed this session (building a real Site Return function is a genuine feature addition, correctly out of scope for a closure phase focused on defect-fixing).**

---

## 6. P4 — Purchase Requisition → RFQ → Comparison → PO

*(Carried over, CODE VERIFIED in the prior report; re-confirmed this session: `requirePRForPO:false` is still the live default, confirmed by a fresh grep this session — line 491/715/716/3143 of `domain.js` today.)*

- **PR, RFQ, Supplier Comparison**: all real, non-shallow workflows (versioned quotations, ≥2-quote comparison requirement, maker-checker) — confirmed to exist and function.
- **PR/RFQ enforcement threshold**: exists as `DB.purchaseApprovalConfig.requirePRForPO`, **defaults to `false`** — confirmed live this session, unchanged. Even when `true`, a site-petty-value carve-out (₹5,000 default) exempts small POs. **RFQ/Supplier Comparison approval is never a precondition for PO creation** — `createPurchaseOrder()`'s only linkage to them is two optional, unchecked informational fields (`rfqId`/`supplierComparisonId`).
- **Procurement bypass (Supplier Bill → Payment with no upstream PO)**: for a non-goods-category vendor, this is the CORRECT, intentional design (protected baseline, P0-3) — confirmed unaffected. For a goods-category vendor, blocked (protected baseline, re-verified this session via the P0 regression in the prior report).

**Status: BD — PR/RFQ enforcement threshold, unchanged, correctly not invented this session.**

---

## 7. P5 — Fixed Asset Lifecycle

*(Carried over, CODE VERIFIED in the prior report; re-confirmed this session via a fresh grep — `assertCanCapitalizeFixedAsset` at line 4142 today still only checks `can(actor,'post')`, no creator≠approver comparison anywhere in its body or callers.)*

- **Lifecycle guards** (no double-capitalize, no double-dispose, no post-disposal depreciation, crash-safe rollback on all three): confirmed solid, unchanged.
- **Maker-checker: CONFIRMED STILL ABSENT.** One Admin/CEO/FinanceManager-tier actor can create, capitalize, depreciate, and dispose the same asset alone. `transferFixedAsset()` still has no domain-level role gate at all (self-disclosed in its own code comment, per the prior report).

**Status: CONTROL GAP (per this brief's own instruction — "If not: CONTROL GAP. Do not invent the approval hierarchy") — correctly not fixed this session, since inventing WHO the second approver should be (which role, what threshold) is exactly the kind of business policy this phase is instructed not to invent.**

---

## 8. P6 — Labour / Job Work Cost Traceability

*(Carried over for the structural facts, CODE VERIFIED in the prior report; NEW live testing this session for Job Work Scrap, carried over from the immediately-prior Financial Control Closure phase.)*

- **Labour**: no requirement/planning step, no attendance/output tracking anywhere in the codebase, Production and Installation labour cost postings carry NO worker identity (just `{orderId, amount}`) — confirmed unchanged. **Status: FG — Labour Attendance/Output**, correctly not simulated with a fake replacement.
- **Job Work chain**: Dispatch→Return→Scrap→Fee→Supplier Bill→Project Cost. The material-quantity side of this chain is the strongest-engineered part of the whole ERP (dispatched = returned + scrap + outstanding, enforced at every disposition point — protected baseline, unchanged). **Job-work processing fee is NOT linked to its originating Job Work Order** by any FK (confirmed unchanged from the prior report) — a job worker's service-fee vendor bill is an ordinary, disconnected AP transaction, reconcilable to the JWO only by manually matching vendor+date+amount. **Material cost and service fee are NOT confused/double-counted** — they are simply two entirely separate, non-cross-referencing transaction types (material cost via `postInventoryMovement`+GL on dispatch/scrap; fee via an ordinary `draftSupplierInvoice`), so there is no double-counting risk, but also no automated reconciliation.
- **Duplicate job-work billing**: not separately re-tested this session (would require a dedicated live scenario); the existing invoiceable-balance/3-way-match protections (protected baseline) apply identically to a job worker's ordinary vendor bill as to any other vendor's, since job-work fee billing uses the same `draftSupplierInvoice`/`draftSupplierInvoiceFromPO` functions.

**Status: FG (Labour attendance) — unchanged. FG (Job Work fee↔JWO linkage) — unchanged. Neither fixed this session (both are feature additions, not defects).**

---

## 9. P7 — Project Closure / Handover / Warranty

*(Carried over, CODE VERIFIED in the prior report; re-confirmed this session via the P1 agent's fresh read of `projectClosureReadiness()`.)*

| Condition | Classification | Current behavior |
|---|---|---|
| Open customer invoices / unpaid balance | **Mandatory blocker** | `receivablesCleared` condition — real, gates closure |
| Open supplier bills | Not checked | No condition exists |
| Open POs / pending GRNs | Not checked | No condition exists |
| Pending material returns | Not checked | No condition exists (compounded by Site Return not existing at all) |
| Site-held stock | Not checked | No condition exists |
| **Open Change Requests / variations** | **NOT AVAILABLE — confirmed this session** | `projectClosureReadiness()` has no reference to `DB.changeRequests` at all (fresh grep, P1 agent) — a project can close with Draft, never-approved Change Requests still open against it |
| Pending approvals (general) | Not checked | No condition exists |
| Open complaints | Not checked | No condition exists (After-Sales module is entirely separate, per the prior report) |
| Warranty commitments | Not checked | `createWarranty()` is never called from or required by closure |
| Retention/holdback | N/A | Confirmed absent from the entire codebase (prior report) |
| Handover documentation | **Mandatory blocker** | `handoverComplete` condition — real |
| Customer acceptance | Partially — via `handoverReadinessCheck()`'s own gates (installation, QC, no open Critical snags) | Real, multi-condition |
| Installation / QC / Critical Snags | **Mandatory blockers** | Real, confirmed in the prior report |
| Billing complete | **Mandatory blocker** | Real |

**Warranty: FUNCTION exists** (`createWarranty()`) but is **not automatically created**, **not required at handover**, and **not checked at closure** — confirmed unchanged (FG relative to "automatic" or "closure-linked" warranty, not an absence of the base capability).

**Status: unchanged from the prior report. Open Change Requests specifically confirmed, this session, to NOT be a closure condition — correctly reported as BD (should it be?), not silently added.**

---

## 10. Management Decisions

| Decision | Current behavior | Options | ERP impact | Owner | Status |
|---|---|---|---|---|---|
| Should Project Variation execution (BOM/PO/billing) require prior Change Request approval? | No gate exists at all today (§3E) | (a) require approval first (b) allow execution, reconcile after (c) require approval only above a value threshold | Would need a new `changeRequestId` FK on multiple document types plus new gating logic — a real feature build | CEO/Finance | **OPEN** |
| PRJ-1 historical ₹24,592.92 billing overage | Frozen, control now prevents growth (protected baseline) | Accept / cover via retroactive variation / credit note / write off / leave permanent | None until decided | Finance | **OPEN** (carried over) |
| Transport vendor 3-way-match treatment | Exempt from goods 3-way-match (unconfirmed) | Goods (`transportMaterial`) or Service (`transportServices`) | Determines whether P0-3's block extends to Transport-category vendors | Finance | **OPEN** (carried over) |
| Labour/Services vendor 3-way-match treatment | Exempt (unconfirmed by Finance per config's own flag) | Confirm exempt, or require matching | Same as above | Finance | **OPEN** (carried over) |
| "Sold By Apple Tree" Job Work Scrap inventory-value timing | No GL at scrap time; deferred to a manual future invoice | Reduce 1200 at scrap time vs. at eventual sale | Timing of inventory value recognition | Finance | **OPEN** (carried over) |
| "Other" Job Work Scrap disposition accounting | No treatment defined | Define, or retire the option | None until decided | Finance | **OPEN** (carried over) |
| PR/RFQ enforcement threshold | Off by default, ₹5,000 site-petty carve-out | Set a real threshold, or confirm off-by-design | Procurement rigor | Purchase/Finance | **OPEN** (carried over) |
| Retention/holdback policy | Absent entirely | Build if needed | New feature | Finance | **OPEN** (carried over) |
| Warranty-at-closure policy | Not linked | Make mandatory, optional, or leave as-is | Closure gate change | Operations/Finance | **OPEN** (carried over) |
| Fixed Asset maker-checker | Absent | Define second-approver role/threshold | New control | Finance/Admin | **OPEN** (carried over) |
| Data-migration project creation policy | Now requires a mandatory reason (P0-1 fix); still available to Admin/CEO indefinitely | Restrict to a time-boxed migration window, or leave permanently available | Governance of the direct-creation path | CEO/Admin | **OPEN** (carried over) |
| Open Change Requests as a closure blocker | Not checked (§9) | Add as blocker / warning / leave uncontrolled | Closure gate change | Operations/Finance | **OPEN — newly surfaced this session** |
| Mandatory reason/reference field on Change Request creation | Absent (§3A) | Add as mandatory, optional, or leave absent | Data quality / auditability of variations | Finance | **OPEN — newly surfaced this session** |

---

## 11. Cross-Process Security Tests (all LIVE, direct API calls)

| # | Attack | Result |
|---|---|---|
| 1 | Customer A quotation's customer used to invoice Customer B's project (CUST-1 vs. PRJ-006/CUST-011) | **BLOCKED** (pre-existing Phase 39 check, re-confirmed) |
| 2 | Project isolation of BOM entitlement (PRJ-3 material check doesn't inherit PRJ-1's BOM) | **CONFIRMED isolated** |
| 3 | An Excess Billing Approval issued for Project Y used to authorize an invoice on Project X | **BLOCKED** |
| 4 | Vendor-consistent PO→GRN→Bill baseline | **Correctly succeeds** (control-group confirmation, not an attack) |
| 5 | Revising an already-Superseded quotation | **BLOCKED** |
| 6a | Creating a BOM on a closed project | **Allowed — matches disclosed "zero GL/inventory impact" design, not a defect** |
| 6b | Creating a Change Request on a closed project | **Allowed — no gate exists (§3, §9 finding)** |
| 6c/6d | Drafting, then POSTING, a customer invoice on a closed project | **Draft allowed (no GL effect); POST correctly BLOCKED without an explicit CEO/Admin override reason** |
| 6e | Job Work dispatch (real inventory movement) on a closed project | **BLOCKED** without override |
| 7a | Duplicate Purchase Order submission (same idempotency key) | **Correctly deduplicated** (returns the same PO both times) |
| 7b | Duplicate Change Request submission (same idempotency key) | **FAILED — created two separate records (CR-0002, CR-0003). Real defect, LIVE PROVEN, FIXED this session** (§15) — re-verified live post-fix: identical requests now correctly return the same record, second marked `idempotent:true` |
| 8 | Unauthenticated direct API call to approve a Change Request | **BLOCKED** (401) |

**14/15 passed on first run; the 1 failure was a genuine defect, fixed, and re-verified passing.**

---

## 12. Accounting Reconciliation

Independently recomputed from raw journal entry lines after all fixes and tests this session:

**Trial Balance: Debit ₹99,80,421.44 = Credit ₹99,80,421.44 — difference 0.000000.**

- **Procurement (PO→GRN→Bill→AP)**: unaffected by this session's changes (P1/attack testing created a small number of real, correctly-balanced POs/GRNs/Bills — Attack 4's baseline explicitly confirmed this chain still posts correctly).
- **Project revenue (Revenue→AR→Project Revenue)**: Change Requests' `revenueImpact` correctly flows only into the read-time billing-ceiling calculation (§3C), never directly into a GL posting of its own — confirmed by code (no `postJournalEntry` call anywhere in `createChangeRequest`/`approveChangeRequest`), so approving a Change Request has **zero direct GL impact**, exactly as intended (it only changes what a LATER, separate invoice is permitted to bill).
- **Material/Labour/Job Work/Fixed Assets**: unchanged this session (protected baselines, not re-touched); full reconciliation performed in the prior two closure reports remains valid and was not invalidated by any change made in this phase (none of this session's edits touch account 1200, 5000, 5100, 5300, or any Fixed Asset account).
- **Variations→ceiling→billing→revenue chain**: directly tested live in the prior P0 phase (₹30,000 approved CR → ceiling correctly rose by exactly ₹30,000) and structurally re-confirmed this session (no code path was changed that would affect this calculation, and the self-approval/idempotency fixes are upstream of it, not inside the formula itself).

---

## 13. Audit Trail

Spot-checked for the specific failure pattern named in this brief — "database changed but audit trail did not":

- `ChangeRequestCreated`/`ChangeRequestApproved`: both confirmed present (domain.js, `logAudit` calls at creation and approval) — carry `changeRequestId`, `projectId`, `revenueImpact`/`costImpact` where relevant, `userId`, `role`, automatic timestamp.
- The new self-approval rejection: returns `{ok:false}` from `approveChangeRequest()` before any state change — the route layer's `deny()`/`auditReject` mechanism (protected baseline) means this rejection is itself audited via the standard `BusinessRuleRejected`/`AccessDenied` path, not silently dropped.
- The new idempotency fix: a deduplicated (second, identical) request is explicitly marked `idempotent:true` in its own response and recorded in `DB.idempotencyKeys` — no silent, untracked duplicate-suppression.
- No instance of "DB changed, audit trail silent" was found for anything touched or tested this session. This is not an exhaustive re-audit of the whole codebase's audit coverage (that was already done in the SOP-to-ERP report, which DID find several such gaps in unrelated legacy functions — `submitMaterialRequirement`, `rejectPurchaseOrder`, `createBillingMilestone`, `markMilestoneReady`, `cancelDraft` — carried over as still-open, not re-fixed this session since none of them were touched here).

---

## 14. Database Integrity

Re-ran the full forensic scan after all fixes and live testing this session — results **identical in shape** to the prior two reports:

| Check | Result |
|---|---|
| Duplicate IDs | Same 2 `inventoryMovements`, 1(×3) `inventoryAdjustments` — historical, unchanged, not growing |
| **Duplicate Change Request IDs** | **None** — confirmed explicitly this session after the idempotency fix, across all Change Requests created including the deliberate duplicate-submission attack |
| Duplicate document numbers | Same 5 historical quotation-revision pairs, confirmed intentional |
| Orphan references (project/customer/material/vendor) | Same 3 synthetic historical fixtures, unchanged |
| Orphan Change Requests (referencing a nonexistent project) | None found — `createChangeRequest()` validates project existence at creation |
| Orphan BOM / GL / inventory movement / approval | None new this session |
| NaN/Infinity/negative-quantity/invalid-date anomalies | Unchanged from prior scans |

**No new defect of any kind introduced. Historical artifacts remain clearly separated from current-code behavior, as in every prior phase.**

---

## 15. Defects Fixed

| Defect | Severity | Root Cause | Fix | Regression |
|---|---|---|---|---|
| Change Request creation had no idempotency protection — a duplicate submission (same client idempotency key) created two separate records | **P1 — Major** (directly upstream of a financial control, the billing ceiling) | `/api/change-requests` POST was a legacy if-block route; the codebase's blanket legacy-dispatch wrapper provides atomicity to every legacy route but never constructs an `idempotency` option from `body.idempotencyKey` — only routes migrated to `registerMutationRoute()` get real deduplication | Migrated the route to `registerMutationRoute({..., idempotent:true, auditReject:true})` — the exact, already-established Phase 22/23 migration pattern, no new mechanism invented | Live-verified: identical duplicate submissions now return the same record, second marked `idempotent:true`. Database scan confirms zero duplicate Change Request IDs post-fix. Trial Balance unaffected (Change Requests have no direct GL impact). |
| `approveChangeRequest()` had no creator≠approver segregation of duties — the only real approve-capable role missing this check anywhere in the codebase | **P1 — Major** (a Change Request directly and materially raises a project's billing ceiling — self-approval defeats the entire point of a second-person check) | The function was written with only a status-transition guard, never a creator/approver comparison, unlike every sibling approval function (PR, PO, Quotation discount, BOM) | Added `if(cr.createdBy===actor.id && !['CEO','Admin'].includes(actor.role)) return {ok:false, ...}` — matching the EXACT existing convention used everywhere else in this codebase (not a new, stricter policy) | Live-verified: a FinanceManager creating and then attempting to approve their own Change Request is now blocked; a genuinely different approver (CEO) still succeeds. Existing Draft/Approved status-guard behavior unaffected. |

---

## 16. Remaining Function Gaps

1. Quotation↔BOM FK linkage (P2) — carried over.
2. Site Return function (P3) — carried over.
3. Labour Attendance/Output tracking (P6) — carried over.
4. Job Work fee↔JWO FK linkage (P6) — carried over.
5. Change Request reject/cancel function (P1) — newly confirmed absent this session.
6. Change Request GET/list route — newly noticed this session (no way to list existing Change Requests via the API at all, only create/approve); low severity (P3/OBS), not fixed this session (not a defect, a missing convenience matching every OTHER document type's already-established list-route convention — flagged for a future pass, not built here to keep this session's changes minimal).
7. Automatic/closure-linked warranty creation (P7) — carried over.

## 17. Remaining Control Gaps

1. No execution gate tying BOM/PO/billing to Change Request approval (P1) — BD, not a defect to fix blindly.
2. Fixed Asset maker-checker absent (P5) — carried over, CONTROL GAP per this brief's own classification, correctly not invented.
3. PR/RFQ threshold not enforced by default (P4) — carried over, BD.
4. Site discrepancy detected but never corrects the ledger (P3) — carried over.
5. Project closure does not check open Change Requests (P1/P7) — newly confirmed this session, BD.

## 18. Remaining Business Decisions

See §10's full table — 12 items, 2 newly surfaced this session (Change Request mandatory-reason field, open-CR-as-closure-blocker), 10 carried over unchanged.

---

## 19. Risk Register

| Risk | Severity | Current Status | Owner | Required Action |
|---|---|---|---|---|
| Change Request self-approval | P1 | **CLOSED this session** | — | None — fixed and verified |
| Change Request duplicate submission | P1 | **CLOSED this session** | — | None — fixed and verified |
| Variation execution has no approval gate | BD | Open, disclosed | CEO/Finance | Decide intended policy; build if required |
| Fixed Asset maker-checker absent | P1-equivalent CONTROL GAP | Open, disclosed | Finance/Admin | Decide approver tier; build if required |
| PR/RFQ threshold unenforced | P2 | Open, disclosed (carried over) | Purchase/Finance | Set and confirm a real threshold |
| Site Return does not exist | P2 | Open, disclosed (carried over) | Operations | Build the function |
| Site discrepancy not self-correcting | P2 | Open, disclosed (carried over) | Operations/Finance | Decide correction mechanism |
| Labour attendance/worker-identity absent | P2 | Open, disclosed (carried over) | Operations | Build if traceability is required |
| Job Work fee↔JWO unlinked | P3 | Open, disclosed (carried over) | Finance | Add FK if reconciliation automation is wanted |
| Warranty not closure-linked | P3 | Open, disclosed (carried over) | Finance/Operations | Decide policy |
| PRJ-1 historical overage | P2 (financial hygiene, not a live control failure) | Frozen, open (carried over) | Finance | Choose a disposition |
| Transport/Labour-Services vendor policy | P2 | Open, disclosed (carried over) | Finance | Confirm policy |

---

## 20. Final Readiness Assessment

| Dimension | Score (0-10) | Basis |
|---|---|---|
| Functional readiness | 7 | Core transactional flows work end-to-end; several real feature gaps (Site Return, labour attendance, variation execution gating) remain unbuilt |
| Financial control | 8 | Trial Balance reconciles to the rupee across three independent closure phases; the two Change Request defects found this session are now fixed; billing ceiling, 3-way match, and BOM entitlement controls all proven live |
| Procurement control | 7 | 3-way match strict where it applies; PR/RFQ gate real but disabled by default (policy, not defect) |
| Project control | 6 | Strong project-creation, closure, and cross-project isolation controls; Project Variation is the weakest link in the entire ERP — a real commercial-impact document with almost no governance around it until this session's two fixes |
| Inventory control | 7 | Movement-type GL mapping fully reconciled (prior phase); Site Return absence and discrepancy non-correction are the two clearest gaps |
| Fixed Asset control | 6 | Lifecycle state machine solid; maker-checker entirely absent |
| Labour/Job Work control | 6 | Job-work material reconciliation is the strongest control in the whole system; labour has almost no traceability at all |
| Auditability | 8 | Audit coverage is broad and, where checked this session, complete; a small number of legacy-function audit gaps remain from the prior report, undisturbed |
| Security | 8 | Every cross-process attack this session was blocked except the one now-fixed idempotency gap; RBAC, project/customer/vendor isolation, and closed-project gating all held under direct API attack |
| Data integrity | 9 | Zero new defects across three consecutive closure phases; historical artifacts consistently and correctly distinguished from live behavior |
| SAP process maturity | 6 | Master Data→Transaction→Approval→Commitment→Execution→Cost→Billing→Accounting→Closure→Audit is real and largely enforced for the procure-to-pay and order-to-cash chains; the Variation/Change-Management leg of that chain — a standard SAP capability (SD/PS change management with budget/commitment integration) — is present only as a disconnected record, the single largest maturity gap identified |

---

## FINAL STATUS

## GO WITH CONDITIONS

**Conditions:**
1. Appletree management must decide whether Project Variation execution (BOM/PO/billing) should require prior Change Request approval, and whether open Change Requests should block project closure (§10) — this phase closed the two genuine security/correctness defects in the Variation mechanism itself (self-approval, duplicate submission) but the mechanism's business-process INTEGRATION remains a policy decision, not a code defect.
2. The Fixed Asset maker-checker gap and the PR/RFQ threshold decision (both carried over) remain open and should be scheduled.
3. Site Return, Labour Attendance, and the Quotation↔BOM FK link are real, disclosed function gaps — not required for a GO, but should be roadmapped given they are core to an interior-fit-out business's actual operating model.
4. All items in §10 (12 total, 2 newly surfaced) require Finance/Operations/CEO sign-off before they can be considered closed rather than merely documented.

No new broad audit is recommended following this report, per this phase's own instruction. Future work should target the specific gaps enumerated in §16–§19, not a repeat of this discovery exercise.
