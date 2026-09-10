# APPLETREE ERP — SOP-TO-ERP BUSINESS PROCESS GAP REPORT

**Scope:** `SAP_Architecture_Lab` only. **Nature:** discovery/assessment — no code was modified during this audit. Evidence labels used throughout: **LIVE PROVEN** (executed against the running server, result observed), **CODE VERIFIED** (confirmed by reading current source, function/file:line cited), **PARTIALLY IMPLEMENTED**, **NOT AVAILABLE** (searched, confirmed absent), **NOT VERIFIED**, **BUSINESS DECISION REQUIRED**.

**Method:** the SOP handbook (`appletree_sop.html`) and the full `server/domain.js` (9,360 lines) / `server/server.js` (2,841 lines) were read and cross-referenced area-by-area (5 parallel research passes, each independently citing file:line for every claim), plus direct live testing against the running server for the highest-risk cross-module and attack scenarios, plus a full database-wide forensic scan and an independent recomputation of the Trial Balance from raw journal lines.

---

## A. Executive Summary

**What the ERP supports well:** The sales pipeline (Lead→Estimation Request→Costing→Quotation→Acceptance→Won→Project) is a genuinely well-built, ID-linked chain with real segregation-of-duties on discount approval and immutable quotation revisions. The BOM governance implemented in the prior phase is confirmed solid. Procurement's core quantity-integrity controls (PO vs GRN over-receipt, GRN vs Bill over-billing, duplicate billing) are strictly and correctly enforced — 0% GRN tolerance is a hard constant, not UI-only, and the 3-way-match/invoiceable-balance engine is real and audited. Job Work has the strongest quantity-reconciliation invariant in the whole system (dispatched = returned + scrap + outstanding, enforced at every disposition, not just reported after the fact). Fixed Asset lifecycle guards (no double-capitalize, no double-dispose, no post-disposal depreciation) are solid. After-sales SLA is a genuine live-computed clock, not a stored date, and AMC revenue recognition correctly implements deferred-revenue accounting. The GL Trial Balance independently re-verified as perfectly balanced (₹99,48,396.59 = ₹99,48,396.59, difference 0.000000).

**Important business controls that are missing or weak (highest priority first):**
1. **A project can be created with no customer, no accepted quotation, no approved scope, and no Project Manager** — live-proven (`PRJ-030` created with only `{name}`). The quotation-driven path (`wonTransition`) is properly gated; a second, fully live, UI-reachable path (`createProjectMaster`/Master Data Import) bypasses it entirely.
2. **Customer invoicing has no cap against the accepted quotation value** — live-proven (a ₹99,99,999 invoice posted against a project whose quotation was worth a fraction of that, no validation at all).
3. **Goods-vendor bills can bypass 3-way match entirely** — live-proven (a ₹5,00,000 supplier bill posted with zero PO/GRN reference, via the generic, unrestricted bill endpoint that exists alongside the properly-matched one).
4. **Quotation → BOM traceability is broken** — `createBOM()` has no `quotationId`/`costingVersionId` parameter at all; BOM material lines are independently re-typed by a human with no system cross-check against what was actually quoted and sold.
5. **Project Variation / Change Order is a shallow status flag** — confirmed by the code's own comment that it deliberately does not reprice, rebuild BOM, or affect billing.
6. **Site Return does not exist** and a confirmed short-delivery at site is logged but never corrects the site inventory ledger.
7. **No maker-checker on Fixed Asset capitalization/depreciation/disposal** — one FinanceManager can run the entire lifecycle alone; asset Transfer has no domain-level role gate at all.
8. **Purchase Requisition and RFQ/Supplier-Comparison governance exist as real code but are not load-bearing** — the PR gate defaults OFF, and RFQ/comparison data is purely informational, never checked by PO creation.
9. **Complaint closure has no readiness gate** (unlike the properly-gated Service Ticket one level down) — a brand-new complaint can be closed with no ticket, visit, diagnosis, or resolution ever having existed.
10. **Duplicate GRN creation is not blocked** at the point of entry — only a downstream reversal path exists to fix it after the fact.

None of these are code bugs in the sense of "produces a wrong number" — the accounting itself reconciles. They are **missing or unenforced business controls**: the software will let an authorized user do something the real business almost certainly does not want done, with nothing in the system stopping it or even flagging it prominently.

---

## B. Complete Business Process Map (as actually implemented, not as aspirational)

```
Lead → Estimation Request → Costing Version → Quotation → [Revision]* → Discount Approval →
  Customer Acceptance → Won → Project (customer+quotation+PM optionally linked)
                                    │
                    ⚠ ALSO REACHABLE DIRECTLY: createProjectMaster() — name only, no gates
                                    │
                        ┌───────────┴────────────┐
                        │                         │
                Design (internal, no file/photo)  BOM (Draft→Submitted→Approved, no link to Quotation)
                        │                         │
                        │              Material Requirement (MRQ) ──┐  Material Request (MR, procurement-only)
                        │                         │                  │            │
                        │                Material Issue ←────────────┘   RFQ→Comparison (informational only)
                        │                    (BOM-gated, excess-approval-gated)   │
                        │                         │                    Purchase Requisition (gate OFF by default)
                        │                Site Issue → Site Receipt → Site Consumption          │
                        │                    (no Site Return; short-delivery not corrected)     │
                        │                                                          Purchase Order
                        │                                                                │
                        │                                                    GRN (0% over-receipt, strict)
                        │                                                                │
                        │                                              Supplier Bill — TWO paths:
                        │                                              (a) 3-way-matched (PO+GRN, strict)
                        │                                              (b) ⚠ generic, unrestricted, no PO needed
                        │                                                                │
                        │                                                       Supplier Payment
                        │
              Labour Cost (little/no worker traceability for Production/Installation)
              Job Work (dispatch↔return↔scrap fully reconciled, service fee NOT linked to JWO)
              Fixed Assets (solid state machine, ⚠ no maker-checker)
                        │
        Change Request (status flag only — no reprice/BOM/billing effect) ⚠
                        │
       Billing Milestone → Customer Invoice (⚠ no cap vs quotation value) → Receipt
                        │
        Snag → QC → Handover (⚠ warranty not required) → Project Closure
                    (real 7-condition gate: installation/QC/snags/handover/billing/receivables)
                        │
        Complaint (⚠ no closure gate) → Service Ticket (real gate) → Visit → Material/Labour →
        Chargeable Invoice → SLA (live clock) → repeat-detection (manual query only) → CAPA (manual trigger)
        AMC (deep, deferred-revenue-correct)
```

---

## C. SOP Requirement Matrix (condensed — full detail in each section below)

| # | SOP Requirement | ERP Status | Evidence class |
|---|---|---|---|
| 1 | Lead→Customer→Quotation→Project chain | IMPLEMENTED, real FK chain | CODE VERIFIED |
| 2 | Quotation immutability post-acceptance | IMPLEMENTED | CODE VERIFIED |
| 3 | Quotation discount approval SoD | IMPLEMENTED | CODE VERIFIED |
| 4 | Quotation validity/expiry enforcement | NOT AVAILABLE (field stored, never checked) | CODE VERIFIED |
| 5 | Quotation GST breakup | NOT AVAILABLE | CODE VERIFIED |
| 6 | Quotation → BOM traceability | NOT AVAILABLE (no FK) | CODE VERIFIED |
| 7 | Project creation requires customer/quotation/PM | NOT ENFORCED (bypass path live) | LIVE PROVEN |
| 8 | Site Visit / Measurement / Client Selections in-ERP | NOT AVAILABLE, matches SOP's own silence | CODE VERIFIED |
| 9 | BOM governance (entitlement, excess approval, revision) | IMPLEMENTED (prior phase) | LIVE PROVEN |
| 10 | Material Requirement vs Material Request separation | PARTIALLY IMPLEMENTED (2 non-reconciling collections) | CODE VERIFIED |
| 11 | Purchase Requisition gates PO | NOT ENFORCED by default | CODE VERIFIED |
| 12 | RFQ/Supplier Comparison gates PO | NOT ENFORCED (informational only) | CODE VERIFIED |
| 13 | GRN over-receipt control | IMPLEMENTED, strict 0% | CODE VERIFIED |
| 14 | GRN vs Bill over-billing / duplicate billing | IMPLEMENTED, strict | CODE VERIFIED |
| 15 | Duplicate GRN creation | NOT AVAILABLE (no guard) | CODE VERIFIED |
| 16 | Goods-vendor bill must go through 3-way match | NOT ENFORCED (generic path bypasses) | LIVE PROVEN |
| 17 | Site Material chain (issue/receive/consume/return) | PARTIALLY IMPLEMENTED (no Return, discrepancy not corrected) | CODE VERIFIED |
| 18 | Labour cost worker traceability | PARTIALLY IMPLEMENTED (2 of 4 functions have no identity) | CODE VERIFIED |
| 19 | Job Work material reconciliation | IMPLEMENTED, strong invariant | CODE VERIFIED |
| 20 | Fixed Asset lifecycle guards | IMPLEMENTED | CODE VERIFIED |
| 21 | Fixed Asset maker-checker | NOT AVAILABLE | CODE VERIFIED |
| 22 | Customer invoice capped at quotation/contract value | NOT AVAILABLE | LIVE PROVEN |
| 23 | Project Variation / Change Order full workflow | PARTIALLY IMPLEMENTED (status flag only) | CODE VERIFIED |
| 24 | Project Closure gate | IMPLEMENTED, real 7-condition gate | CODE VERIFIED |
| 25 | Warranty required at handover/closure | NOT ENFORCED | CODE VERIFIED |
| 26 | Complaint closure gate | NOT AVAILABLE | CODE VERIFIED |
| 27 | Service Ticket closure gate | IMPLEMENTED | CODE VERIFIED |
| 28 | SLA enforcement | IMPLEMENTED, live clock | CODE VERIFIED |
| 29 | Repeat-complaint / CAPA auto-trigger | NOT AVAILABLE (manual query/trigger only) | CODE VERIFIED |
| 30 | AMC deferred revenue | IMPLEMENTED, correct | CODE VERIFIED |
| 31 | Document numbering integrity | IMPLEMENTED (with one intentional exception — quotation revisions keep the same number by design) | CODE VERIFIED |
| 32 | Audit trail coverage | Pending final confirmation — see §L | (agent pending at time of writing) |
| 33 | GL Trial Balance | BALANCED | LIVE PROVEN (independently recomputed) |
| 34 | Wrong-but-valid-reference protection (customer/project) | BLOCKED, correctly | LIVE PROVEN |
| 35 | Wrong-but-valid-reference protection (GRN vendor/project) | Structurally impossible (no independent field to mismatch) | CODE VERIFIED |
| 36 | BOM state-machine integrity (no regression from terminal states) | IMPLEMENTED | LIVE PROVEN |

---

## D. Missing Function Register

| ID | Missing Function | Area | Risk | Evidence |
|---|---|---|---|---|
| MF-1 | Site Return (material sent back from site to warehouse) | Site Material Control | HIGH | CODE VERIFIED — `SiteReturn` type is handled defensively in `getSiteStockLevel`'s formula but no function ever posts it |
| MF-2 | Site-held stock damage/write-off | Site Material Control | MEDIUM | CODE VERIFIED — `createDamageReport`/`createInventoryAdjustment` both require `warehouseId`, have no `siteId` parameter |
| MF-3 | Quotation/CostingVersion → BOM direct link (FK field) | Sales↔BOM traceability | CRITICAL | CODE VERIFIED — `createBOM()` signature has no `quotationId`/`costingVersionId` param |
| MF-4 | Full Project Variation workflow (reprice → new quotation/BOM → billing) | Variation/Change Order | CRITICAL | CODE VERIFIED — `DB.changeRequests` is a status flag only, per the code's own comment |
| MF-5 | Site Visit / Measurement / Design file-attachment / client selection capture | Pre-sales | LOW (SOP itself doesn't require it) | CODE VERIFIED — confirmed absent both in code and in SOP's own process map |
| MF-6 | Supplier Advance Payment (distinct from Customer Advance, which does exist) | Procurement/Payment | MEDIUM | CODE VERIFIED — `postSupplierPayment` always requires a real posted bill to apply against |
| MF-7 | Labour Requirement/attendance/subcontract-type distinction | Labour | MEDIUM | CODE VERIFIED — no planning/attendance entity feeds any of the 4 labour-cost functions |
| MF-8 | Job-work processing-fee ↔ Job Work Order linkage | Job Work | LOW-MEDIUM | CODE VERIFIED — `jwoId` never appears on any vendor bill/invoice structure |
| MF-9 | Assign/reassign Project Manager on an existing project | Project Control | MEDIUM | NOT VERIFIED — no update endpoint found in this pass; needs a second, targeted route grep before treating as confirmed absent |
| MF-10 | Automatic repeat-complaint flagging / CAPA auto-trigger | After-Sales | MEDIUM | CODE VERIFIED — detection logic exists (`repeatComplaintHistory`) but is never called from `createComplaint`; CAPA is always a manual invocation |

## E. Missing Control Register (function exists, but lacks a required control)

| ID | Function | Missing Control | Risk | Evidence |
|---|---|---|---|---|
| MC-1 | `createProjectMaster` | No requirement for customer/quotation/PM/status stage | CRITICAL | LIVE PROVEN (`PRJ-030`) |
| MC-2 | `draftCustomerInvoice` / generic invoice path | No cap vs accepted quotation/contract value | CRITICAL | LIVE PROVEN (₹99,99,999 against a project whose quotation was far smaller) |
| MC-3 | `draftSupplierInvoice` (generic, non-PO path) | Fully open for ANY vendor including goods vendors — no category restriction forcing 3-way-matched billing for goods purchases | CRITICAL | LIVE PROVEN (₹5,00,000 bill, zero PO/GRN, real goods vendor VEND-1) |
| MC-4 | `createGRN` | No dedup/delivery-note-number check — same physical delivery can be keyed twice while PO balance remains open | HIGH | CODE VERIFIED |
| MC-5 | `capitalizeFixedAsset`/`postAssetDepreciation`/`disposeFixedAsset` | No maker-checker (creator≠approver) anywhere in the lifecycle | HIGH | CODE VERIFIED |
| MC-6 | `transferFixedAsset` | No domain-level role gate at all (relies solely on generic `edit` permission) — self-flagged inconsistency in the code's own comment | HIGH | CODE VERIFIED |
| MC-7 | `createPurchaseOrder` | PR-gate (`requirePRForPO`) defaults OFF; RFQ/Comparison data never checked | HIGH | CODE VERIFIED |
| MC-8 | `createSiteMaterialReceipt` | Discrepancy detected and logged but never corrects the site ledger — site stock can be silently overstated | MEDIUM-HIGH | CODE VERIFIED |
| MC-9 | `changeComplaintStatus` | No readiness gate at all (contrast with properly-gated `closeServiceTicket`) | MEDIUM | CODE VERIFIED |
| MC-10 | `closeProject`/`projectClosureReadiness` | Warranty registration not one of the 7 gating conditions | MEDIUM | CODE VERIFIED |
| MC-11 | `submitStockCount` | No enforced maker≠checker (same person can count and approve the correcting adjustment); a failed adjustment line still lets the count complete | MEDIUM | CODE VERIFIED |
| MC-12 | `recordLabourWages`/`postProductionLabourCost`/`postInstallationLabourCost`/`postServiceLabourCost` | No duplicate-submission guard on any of the 4; `postServiceLabourCost` additionally has no crash-safety rollback at all | MEDIUM | CODE VERIFIED |
| MC-13 | `createHandover` | Does not require or auto-create a Warranty record | MEDIUM | CODE VERIFIED |

## F. Incorrect Implementation Register (behaves incorrectly, not merely absent)

| ID | Function | Defect | Status |
|---|---|---|---|
| IF-1 | SOP handbook text (Part 23/27) | Tells staff GL account 1400 (Fixed Assets) is shared with 1200 (Inventory) — direct code trace shows this is **false** in the current build; zero cross-posting found between the two accounts | Documentation/code mismatch — flagged, not a code defect |
| IF-2 | Two `inventoryMovements` IDs, three `inventoryAdjustments` IDs | Real ID collisions found in the database-wide scan (`MV-000121`×2, `MV-000124`×2, `IADJ-0015`×3) | Confirmed **historical** — timestamps match a documented Phase 15/17 concurrency-probe test; the current `nextId()`/`nextInventoryMovementId()` max-based logic does not reproduce this in fresh testing (verified — my own BOM governance test run created MV-000446 onward with zero collisions) — data hygiene issue, not a live code defect |
| IF-3 | Opening-balance Receipt postings (2 call sites) | Always stamp `uom:''` instead of the material's real unit | LOW severity, CODE VERIFIED |

## G. Approval / SoD Matrix

| Business Function | Creator | Submitter | Approver | Self-Approve? | Override | Audited |
|---|---|---|---|---|---|---|
| Quotation discount | Sales/Estimator | same | FinanceManager/CEO (tiered by %) | No (CEO/Admin exempted) | N/A | Yes |
| BOM | Estimator/Admin/CEO | same | Admin/CEO/FinanceManager | No (CEO/Admin exempted) | N/A | Yes |
| Excess Material Issue | Any authorized issuer | N/A | Admin/CEO/FinanceManager | **No — unconditional, no exemption** | Closed-project: CEO/Admin+reason | Yes |
| Material Requirement (MRQ) | ProjectManager/Admin/CEO | same | (approval function exists) | No (CEO/Admin exempted) | N/A | Yes |
| Material Request (MR) | Admin/CEO/Purchase | same | (approval function exists) | No (CEO/Admin exempted) | N/A | Yes |
| Purchase Requisition | Any | same | Purchase/FinanceManager/CEO/Admin (site tiered) | No (CEO/Admin exempted) | Site-petty limit | Yes |
| Purchase Order | Purchase | same | tiered by value | No (CEO/Admin exempted) | N/A | Yes |
| GRN | Purchase | N/A (single-step) | N/A — no separate approval, only role-gated create | N/A | Weighment-variance override (Finance/Purchase/CEO/Admin) | Yes |
| Supplier Bill (3-way matched) | Accountant/Purchase | N/A | 3-way-match is the control, not a person | Exception-based, audited | FinanceManager/CEO/Admin exception | Yes |
| Supplier Bill (generic, non-PO) | Accountant/Purchase/CEO/Admin | N/A | **No approval step at all beyond generic `create`** | N/A — no check | N/A | Only at draft/reject, not at the missing-PO gap itself |
| Customer Invoice | Sales/Accountant | N/A | **No approval step, no value cap** | N/A | N/A | Yes (creation only) |
| Customer Receipt / Supplier Payment | Accountant/FinanceManager | N/A | can(actor,'clear'/'pay') | N/A | N/A | Yes |
| CN/DN (customer & supplier) | Accountant/FinanceManager | N/A | capped at invoice open balance | N/A | N/A | Yes |
| Material Issue (ordinary) | PM/Purchase/SiteInCharge | N/A | role-gated create only; excess portion needs separate approval (see above) | N/A | N/A | Yes |
| Labour cost (all 4 paths) | PM/Finance-tier role | N/A | role-gated create only, **no second-person approval on any of the 4** | N/A — not applicable, no approval step exists | N/A | Yes (creation only) |
| Project Expense | PM/Finance-tier role | N/A | **BUSINESS DECISION REQUIRED** — not independently re-verified this pass whether a second-approval step exists | — | — | NOT VERIFIED |
| Fixed Asset capitalize/depreciate/dispose | Admin/CEO/FinanceManager | N/A | Same tier as creator, **no creator≠approver check** | **Yes — no SoD at all** | N/A | Yes |
| Fixed Asset transfer | Any with generic `edit` | N/A | No domain-level check at all | **Yes** | N/A | Only generic |
| Project Closure | Admin/CEO/FinanceManager | N/A | 7-condition automated readiness gate | N/A | CEO/Admin + reason, all unmet conditions logged | Yes |
| Complaint closure | Multiple roles | N/A | **None — no readiness gate** | N/A | N/A | Status-change only |
| Service Ticket closure | Multiple roles | N/A | Real multi-condition gate (visit complete, ack+diagnosis, invoice if chargeable) | N/A | N/A | Yes |
| Change Request | Any | N/A | Approval flips status only — **no financial/scope effect gated by it** | **BUSINESS DECISION REQUIRED** | N/A | Yes |

## H. Cross-Module Traceability

| Chain | Status | Evidence |
|---|---|---|
| Lead → Customer → Quotation → Project | **Fully linked, real FKs** (`leadId`, `estimationRequestId`, `costingVersionId`, `quotationId`) | CODE VERIFIED |
| Quotation/BOQ → BOM | **BROKEN** — no direct FK; BOM lines independently re-entered | CODE VERIFIED, HIGH priority |
| BOM → MRQ → Purchase (MR/RFQ/PR) → PO → GRN → Stock → Issue → Consumption | **Mostly linked**, but MRQ and MR are two non-reconciling parallel "requested" collections; PR/RFQ/Comparison are informational, not enforced gates | CODE VERIFIED |
| Supplier: PO → GRN → Bill → Payment | **Fully linked when the 3-way-matched path is used**; **structurally bypassable** via the generic bill path | LIVE PROVEN (bypass) + CODE VERIFIED (matched path integrity) |
| Customer: Quotation → Milestone → Invoice → Receipt | Milestone→Invoice→Receipt linked; **Quotation value is never checked against cumulative invoicing** | LIVE PROVEN (bypass) |
| Project: Quotation → Budget → Cost → Revenue → Profit | **Real, single-authoritative-formula chain** (`coreProjectPL`/`projectFinancial360`), confirmed a prior "two competing profit formulas" defect was found and fixed | CODE VERIFIED |
| After-sales: Project → Handover → Complaint → Service → Closure | **Mostly linked and enforced** at the Ticket/Visit level; **broken at the Complaint level** (no readiness gate) | CODE VERIFIED |
| Wrong-but-valid-reference: Customer A invoice on Customer B's project | **BLOCKED** | LIVE PROVEN |
| Wrong-but-valid-reference: GRN against wrong PO's vendor/project | **Structurally impossible** — GRN derives vendor/project from the PO itself, no independent field to mismatch | CODE VERIFIED |
| Wrong-but-valid-reference: Bill against wrong GRN for the selected PO | **BLOCKED** (`grn.poId!==poId` check) | CODE VERIFIED |
| Wrong-but-valid-reference: BOM excess-request material/project/site mismatch | **BLOCKED** | LIVE PROVEN (from prior BOM governance phase) |

## I. Accounting Findings — Independent Reconciliation

- **Trial Balance**, recomputed directly from all 1,298 raw journal entries' lines (not the report endpoint): **Total Debit ₹99,48,396.59 = Total Credit ₹99,48,396.59, difference 0.000000.** LIVE PROVEN, balanced.
- **AR (account 1100):** ₹7,69,848.92. **AP (account 2000):** ₹5,93,478.00. Both independently recomputed from raw lines.
- **Inventory GL (account 1200) vs. independently recomputed physical stock value:** GL net ₹4,94,329.34 vs. a from-scratch recomputation across all 12 movement types (Receipt/Issue/Transfer/Return/Adjustment/Site/JobWork) showing ₹5,12,540.23 — a **₹18,210.89 variance that could NOT be resolved with confidence in this pass**. **NOT VERIFIED, disclosed honestly** — my simplified script's assumption that every movement type has a uniform GL effect on account 1200 is very likely wrong for Site/JobWork movement types, which may post to a different account or represent pure custody transfers with no valuation change; resolving this properly requires mapping each of the 12 movement types 1:1 against its actual GL-posting code, which was beyond this pass's time budget. **This must not be read as a confirmed defect — it is an open reconciliation question requiring a dedicated follow-up script.**
- **BOM approval / Excess Request approval create zero GL/inventory impact** (confirmed by design and empirically, from the prior BOM governance phase).
- **Fixed Asset accounts 1200/1400 are NOT shared** — confirmed by tracing every posting site of both accounts; this refutes what the SOP currently tells staff (see IF-1).

## J. Inventory Findings — Independent Reconciliation

- 12 distinct movement types confirmed in live data (Receipt, Issue, TransferOut/In, Return, Adjustment, SiteReceipt, SiteConsumption, JobWorkReceipt/Return/Scrap/DirectDispatch).
- Negative-stock prevention confirmed enforced at 6 independent guard sites, covering every decrease-type movement found.
- Moving-average valuation confirmed applied consistently via one shared function, reused by every valuation-consuming caller.
- Physical Stock Count is a real system-vs-counted reconciliation with auto-generated correcting adjustments — but no enforced maker≠checker, and a failed correction can still let the count complete.
- Site Material chain: only 3 of the 5 numbers the business needs (issued/reached-site/consumed/remaining/returned) are available from one report; "issued" and "returned" require manual cross-referencing, and "returned" is currently always zero because Site Return doesn't exist.
- Job Work: the strongest reconciliation invariant in the system — dispatched = returned + scrap + outstanding is enforced at every disposition point, not merely reportable.

## K. Data Integrity Findings (database-wide scan, 107 collections)

| Check | Result |
|---|---|
| Duplicate record IDs | 2 in `inventoryMovements`, 1 (×3 records) in `inventoryAdjustments` — all traced to a documented historical Phase 15/17 concurrency-probe test; current ID-generation logic does not reproduce this in fresh testing |
| Duplicate document numbers | 5 quotation-number pairs — **investigated and found to be intentional design**: `reviseQuotation()` deliberately keeps the same `quotationNo` across revisions (disambiguated by a separate `revision` field), matching common real-world quotation practice. Not a defect. |
| NaN / Infinity values | **Zero found** |
| Negative quantities | 11 found in `inventoryMovements` — all legitimate negative-direction Adjustment entries (including one large, deliberate stress-test correction of ~155,554 units, clearly a lab test artifact, not live business data) |
| Duplicate GSTINs | **None found** |
| Duplicate usernames | **None found** |
| Orphan project/customer/material references in GL/movements | 3 found, all with deliberately synthetic names (`PRJ-DOES-NOT-EXIST`, `CUST-PHANTOM-999`, `MAT-PHANTOM-999`) — confirmed historical test fixtures from prior audit phases, not live corruption |
| BOMs with unrecognized status | **None** |
| Legacy double-Approved BOM for the same scope | 1 found (`BOM-0002`/`BOM-0003` on `PRJ-1`), confirmed as my own pre-supersession-fix test artifact from the earlier BOM investigation — exactly the class of risk that phase's fix now prevents going forward |
| Excess requests over-consumed vs. their own requested qty | **None** |
| Stray test-scaffolding collections | **None remaining** |

## L. Audit Findings

- `logAudit()` cannot itself throw and fail a caller's transaction (hardened, CODE VERIFIED). `deny()` (403s) unconditionally logs — **100% coverage confirmed for every authorization denial in the system**, structurally guaranteed by construction.
- **Modern routes** (`registerMutationRoute`, ~36 routes): every rejection is audited by construction — the registration function itself refuses to boot a route that doesn't declare `auditReject`.
- **Legacy routes, blanket transaction wrapper**: CODE VERIFIED gap. The wrapper's own header comment claims rejected legacy mutations are audited "exactly like" modern ones — this is **not accurate** for the ordinary `{ok:false}` business-rejection path: `withTransaction()`'s own rollback branch for a resolved (non-thrown) rejection contains **no `logAudit` call at all**. A rejected legacy mutation is therefore only audited if the underlying domain function remembers to log its own failure. **Five concrete functions confirmed to never call `logAudit`, on success or failure**: `submitMaterialRequirement`, `rejectPurchaseOrder`, `createBillingMilestone`, `markMilestoneReady`, `cancelDraft`, plus three Production Order status functions (`holdProductionOrder`/`resumeProductionOrder`/`closeProductionOrder`, contrasted with siblings `cancelProductionOrder`/`completeProductionOrder` which both do log).
- Approvals, overrides, reversals, cancellations, and master-data changes are broadly well-audited **specifically wherever GL/inventory is touched** — the gap is concentrated in pure workflow-status legacy functions with no financial side-effect of their own.
- **Document numbering integrity — one live, current-code regression found**: every major document type (Quotation, PO, GRN, Bill, Invoice, Receipt, Payment, CN/DN, Material Issue, PR, Excess Material Issue Request) uses the hardened `nextId()`/`maxIdSuffix()` max-based ID scheme. **`createBOM()` is the sole exception** — it still uses the deprecated `'BOM-'+String(DB.boms.length+1).padStart(4,'0')` pattern (domain.js:4346), the exact unsafe idiom the multi-phase hardening campaign was built to eliminate elsewhere. **This was carried over, not newly introduced, by the recent BOM Governance implementation phase** — `createBOM()` was rewritten in that phase (adding `siteId`, line validation, the new lifecycle fields) but the ID-generation line itself was left unchanged from the original pre-governance code. Additionally, **`BOM` was never registered as a `glDocumentTypes` code**, so unlike every other document type, a BOM has no human-readable, FY-scoped voucher number series (`BOM/2026-27/0004`-style) — only its raw internal ID. Both are disclosed here as genuine, currently-live gaps requiring a follow-up fix, not merely historical findings.
- **Import/Export**: row-level validation confirmed for malformed rows, missing mandatory fields, duplicates (business-key-based for opening balances, transaction-ID-based for bank import — both real, not filename-based), wrong ID references, wrong data types, negative quantities, invalid dates. Rollback behavior differs by design between importers (master-data/opening-balance imports are row-partial; bank statement import is all-or-nothing via a real transaction wrapper, hardened in a documented prior phase). Exports are a fully real feature (8 report types, permission-gated, fully audited), not a stub.

## M. Recommended ERP Enhancements

**P0 — Critical**
1. Enforce a hard requirement (or an explicit, audited override) that `createProjectMaster`/Master Data Import project creation cannot silently bypass customer/quotation/PM linkage for a live operational project — at minimum, gate the direct-creation route more tightly than "generic masterData permission," or require an explicit `isDataMigration` flag that is itself audited and restricted.
2. Add a customer-invoice cap: cumulative invoiced amount for a project must not exceed the accepted quotation value + any approved variation, with an explicit, audited override path for the cases where it genuinely should (retainage true-up, etc.).
3. Restrict the generic, non-PO supplier-bill path so that a "goods" category vendor cannot be billed through it — either route goods-category bills exclusively through `draftSupplierInvoiceFromPO`, or add the same 3-way-match requirement to the generic path when the vendor's category requires it (per the existing `threeWayMatchPolicyConfig` categories, which already distinguish goods from services).
4. Migrate `createBOM()`'s ID generation from `DB.boms.length+1` to `nextId()`, and register a `BOM` code in `glDocumentTypes` for a real voucher-number series — closing the one live regression this audit found in the ID-hardening campaign.

**P1 — High**
5. Add a direct `quotationId`/`costingVersionId` field to BOM, and (at minimum) a warning/reconciliation report comparing BOM material lines against the CostingVersion's line items.
6. Build out Project Variation / Change Order to actually connect to a re-baseline, additional BOM lines, and additional billing — or explicitly declare (as a management decision) that variations are handled manually outside the ERP and remove the misleading appearance of a workflow.
7. Add maker-checker (creator≠approver) to Fixed Asset capitalization, depreciation, and disposal; give `transferFixedAsset` a real domain-level role gate.
8. Add a guard preventing duplicate GRN creation for the same PO+delivery (e.g. an optional delivery-note/challan-number field with a uniqueness check per PO).
9. Implement Site Return, and make `createSiteMaterialReceipt` actually correct the site ledger (post a compensating movement) when a discrepancy is confirmed, not just log it.
10. Add a readiness gate to `changeComplaintStatus` mirroring `closeServiceTicket`'s pattern, or at minimum block `NEW`→`CLOSED` in a single step.
11. Fix the five-plus legacy functions confirmed to never call `logAudit` (§L).

**P2 — Medium**
12. Add worker/contractor identity fields to Production and Installation labour cost postings.
13. Link job-work processing-fee vendor bills back to their originating Job Work Order via a real `jwoId` field.
14. Decide and implement whether warranty registration should be a Project Closure gating condition.
15. Add maker≠checker enforcement to Stock Count submission, and block completion when a correcting adjustment fails rather than silently recording `failedLines`.
16. Add a duplicate-submission guard to the four labour-cost posting functions; give `postServiceLabourCost` the same crash-safety rollback its three siblings have.
17. Wire the Purchase Requisition gate ON by default for goods purchases above a real threshold, and make RFQ/Supplier Comparison approval an actual precondition for PO creation above a configurable value (both currently exist as real code but are not load-bearing).

**P3 — Low**
18. Auto-surface `repeatComplaintHistory()` results at complaint creation time instead of requiring a manual query.
19. Correct the SOP handbook's Part 23/27 text, which currently tells staff GL accounts 1200/1400 are shared — confirmed false against current code.
20. Fix the `uom:''` gap on the two opening-balance Receipt posting paths.
21. Investigate and resolve the ₹18,210.89 Inventory-GL-vs-physical-stock variance found in this audit's independent reconciliation attempt (§I) — needs a dedicated, movement-type-by-movement-type mapping pass, not addressed here.

## N. SOP Changes Required

- **Part 23/27 (Fixed Assets)**: remove or correct the statement that GL account 1400 is shared with general Inventory (1200) — confirmed false against current code; the accounts are fully separate with zero cross-posting.
- **Part 10 (Procurement)**: the handbook's process description (`Requirement → PO → Approval → GRN → Bill → Payment`) omits Material Requirement/Material Request, RFQ, Supplier Comparison, and Purchase Requisition as distinct steps, even though all four are real, implemented workflows in the ERP. Staff following only the handbook would not know these tools exist.
- **New section needed**: Project Variation / Change Order — currently undocumented in the SOP at all (zero mentions of "Change Request"/"Variation"), even though the ERP has a (shallow but real, audited) `Change Request` entity and two working endpoints for it.
- **Part 36 (Quick Reference)**: does not mention that project creation can occur outside the quotation-driven flow (via Master Data Import) — if that path is meant only for data migration, the SOP should say so explicitly and staff should be told never to use it for a live project.
- Confirm whether Site Visit/Measurement/Design/client-selection tracking is genuinely intended to stay outside the ERP (matches the SOP's own current silence) — if so, no SOP change is needed there; if not, both the SOP and the ERP need it added together.

## O. Management Decisions Required

1. **Invoicing cap policy** — should the ERP hard-block invoicing beyond the accepted quotation + approved variation, or is exceeding it sometimes legitimate (and if so, under what recorded justification)?
2. **Purchase Requisition / RFQ enforcement threshold** — at what value should the PR gate and RFQ/Comparison requirement actually become mandatory, rather than optional as they are today?
3. **Retention** — does Appletree's real business model use retention/holdback on customer billing? Confirmed entirely absent from both the ERP and the SOP; needs a business decision before it can be designed.
4. **Warranty-at-closure policy** — should a project be blockable from closing without a registered warranty record?
5. **Project Variation scope** — is a full reprice→BOM→billing variation workflow wanted in-ERP, or is variation handled manually by design (in which case the existing shallow `Change Request` should be relabeled as a simple log, not an approval workflow implying more than it does)?
6. **Fixed Asset maker-checker** — is single-person capitalize/depreciate/dispose acceptable for Appletree's scale, or does management want a second-person check added?
7. **Data-migration project creation** — should the Master Data Import project-creation path remain available to Admin/CEO for live (non-migration) use, or should it be restricted/flagged?

## P. Final Coverage

| Dimension | Verified coverage | Basis |
|---|---|---|
| SOP coverage (SOP topics actually checked against code) | ~80% | 5 research areas + this session's own live testing covered Sales, Costing, Quotation, BOM, MRS, Procurement, Inventory, Site, Labour, Job Work, Fixed Assets, Billing, Variation, Project Control/Closure, After-Sales, Document Control, Audit, Import/Export. Not independently re-verified this pass: Project Expense's full approval chain, exhaustive per-master-data-type import duplicate checks, and a handful of low-traffic report screens. |
| Business-process coverage (end-to-end chains traced) | ~85% | Lead→Project, BOM→Issue, Procure→Pay, Bill→Receipt, After-sales chains all traced live or in code; Variation/Change Order chain traced and confirmed shallow. |
| Functional coverage (individual functions read/tested) | Estimated ~70% of domain.js's ~9,360 lines were directly read or grep-confirmed across the 5 research passes plus this session's own reading; the remainder (reports, minor CSV templates, some Phase-13-era policy functions) was not individually inspected. |
| Lifecycle coverage (create→approve→post→reverse/cancel per document type) | ~90% for the ~15 major document types enumerated in §L's numbering table | Each type's full state machine was traced; BOM's numbering gap is the one confirmed live exception found. |
| Approval coverage (SoD matrix) | ~90% | Full matrix in §G built from direct code reads; one item (Project Expense's full chain) marked NOT VERIFIED rather than guessed. |
| Cross-reference coverage (wrong-but-valid-reference attacks) | Targeted, not exhaustive — ~8 of the ~15 combinations named in the brief were actually tested (live or by code trace); the rest (e.g. Labour/Expense cross-project, which are structurally single-projectId-param functions and largely N/A) were reasoned about rather than live-attacked. |
| Accounting coverage (independent reconciliation) | Trial Balance: 100%, LIVE PROVEN balanced. AR/AP: 100%, independently recomputed. Inventory-vs-GL: **incomplete — a variance was found and honestly could not be resolved with confidence in this pass** (§I). |
| Inventory coverage | ~85% — all movement types enumerated and traced to their posting functions; the one open item is the same GL-reconciliation gap above. |
| Audit coverage | ~75% — spot-checked broadly, with a real, reproducible gap found (5+ legacy functions never call `logAudit`) rather than a full line-by-line census of all ~9,360 lines' mutation points. |
| Import/export coverage | ~80% — all 4 importer families traced in full; not every one of `MASTER_IMPORT_SPECS`'s individual import types was individually re-verified for duplicate-detection completeness. |

**Estimated vs. verified**: every percentage above reflects what was actually read, tested, or traced in this pass — none are aspirational. Where confidence was insufficient to make a claim, the item is marked NOT VERIFIED rather than folded into a coverage percentage as either a pass or a fail.

---

## Q. Final Verdict

## GO WITH CONDITIONS

The ERP's accounting core is genuinely sound — the Trial Balance independently reconciles to the rupee, the core sales pipeline and BOM governance are real, ID-linked, and correctly gated, and the procurement quantity-integrity controls (over-receipt, over-billing, duplicate billing) are strict and well-engineered. This is not a NO-GO on the software's correctness.

It is **GO WITH CONDITIONS, not GO,** because at least three findings meet the brief's own bar for a control gap serious enough to matter regardless of whether existing software "works": **(1)** a project can be created and operated with zero commercial control (no customer, no quotation, no PM) via a live, reachable path; **(2)** customer invoicing has no ceiling against what was ever actually sold — live-proven with a ₹99,99,999 test invoice against a small accepted quotation; **(3)** a real goods-category vendor can be billed for a large amount through a path that completely bypasses the otherwise-robust 3-way-match engine — live-proven with a ₹5,00,000 test bill with zero PO/GRN reference. Each of these is a genuine, exploitable financial-control gap, not a hypothetical or a missing "nice to have" feature, and each was demonstrated live against the running system, not merely inferred from reading code.

**Conditions for this to become an unconditional GO:**
1. Close the three CRITICAL gaps above (P0 #1-3 in §M) before this build is used for anything beyond controlled testing.
2. Fix the BOM ID-numbering regression (P0 #4) — a small, mechanical fix, but a genuine live gap in a control this engagement has otherwise treated as load-bearing.
3. Obtain management decisions on the seven items in §O — several of the HIGH/MEDIUM findings (retention, warranty-at-closure, Variation scope, PR/RFQ enforcement threshold) are legitimately policy questions, not code defects, and cannot be closed without Appletree's own answer.
4. Resolve the §I inventory-vs-GL reconciliation variance (or confirm it's a reconciliation-script artifact, not a real one) before treating the accounting as unconditionally clean at the sub-ledger level.

No code was modified during this audit, per instruction. This report is the discovery/assessment deliverable; implementation of any of the above requires separate, explicit authorization.

