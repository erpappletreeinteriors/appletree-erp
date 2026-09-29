# ARCH-2026-002 — Dependency Map

**Date:** 2026-09-21. Phase 0 deliverable. Produced by a dedicated read-only reconnaissance pass over
`server/domain.js` (12,734 lines) and `server/server.js` (3,464 lines), grepped and traced function-
by-function (not assumed from documentation). All line numbers below are from actual tool output.
Where a list is representative rather than exhaustive, that is stated explicitly.

## 1. Central engine call sites, by domain

### `postJournalEntry()` — `domain.js:2297` — the single GL writer
The only real `DB.journalEntries.push()` in the codebase is at line 2448, inside this function. 26 real
call sites found, grouped by domain:

| Domain | Calling functions |
|---|---|
| Finance core (the funnel most domains post through) | `postDraft` (2658), `reverseEntry` (2870) |
| Finance & Accounting — AR/AP | `postCustomerReceipt` (3413), `postSupplierPayment` (3491), `createCustomerCreditNote` (8530), `createCustomerDebitNote` (8573), `createSupplierCreditNote` (5638), `createSupplierDebitNote` (5703) |
| Procurement | `createGRN` (5195), `createPurchaseReturn` (5454) |
| Inventory | `createMaterialIssue` (6039), `createInventoryAdjustment` (8697) |
| Project & Contract / Site Execution | `recordLabourWages` (6119), `recordProjectExpense` (6165), `postInstallationLabourCost` (6994) |
| Manufacturing | `postProductionLabourCost` (6691) |
| Service & After-Sales | `postServiceLabourCost` (7490), `recognizeAMCRevenue` (7677) |
| Asset Management | `capitalizeFixedAsset` (9693), `postAssetDepreciation` (9750), `disposeFixedAsset` (9837) |
| Treasury | `postBankImportLine` (10139), `createBankTransfer` (10943), `replenishPettyCashFloat` (11741) |
| Site Execution (site material subledger) | `returnFromSite` (11474) |
| Controlling / Tax | `reverseITCForWriteOff` (12072) |

### Inventory-movement writer — `postInventoryMovement()` (`domain.js:4976`)
The only `DB.inventoryMovements.push(mv)` is at line 5009, inside this function. 20 real call sites:

| Domain | Calling functions |
|---|---|
| Finance core | `postDraft` (2720), `reverseEntry` (2931, 2952 — compensating reversal) |
| Procurement | `createGRN` (5237), `createPurchaseReturn` (5470) |
| Inventory | `createMaterialIssue` (6052), `createInventoryTransfer` (8630, 8632), `createInventoryAdjustment` (8719) |
| Master Data | `importMasterData` (10794, opening-balance receipts) |
| Site Execution | `issueToSite` (11401, 11402), `returnFromSite` (11492, 11495) |
| Job Work | `dispatchToJobWorker` (11826, 11827), `returnFromJobWorker` (11866, 11867), `recordJobWorkScrap` (11924), `directDispatchFromJobWorker` (11967) |

### `applyClearing()` — `domain.js:3366`
6 call sites, all Finance & Accounting: `postCustomerReceipt` (3418), `postSupplierPayment` (3496),
`createSupplierCreditNote` (5652), `createSupplierDebitNote` (5715), `createCustomerCreditNote` (8541).

### `withTransaction()` — `domain.js:1839`
Only **2 real call sites, both in `server.js`**, confirming it wraps every mutating HTTP request at the
single point every request already passes through, rather than being sprinkled per domain function:
`server.js:530` (`dispatchMutationRoute`, every declaratively registered route) and `server.js:685`
(the legacy imperative dispatch block, every older inline route handler). No domain function calls
`withTransaction()` directly — domain functions stay transaction-agnostic by design.

## 2. Document-numbering mechanism

Two centralized mechanisms, serving different purposes — no local/ad-hoc counter was found for any
GL-facing or audit-facing document type:

- **`nextDocNumber(typeCode, dateStr)`** (`domain.js:1958`) — FY-scoped, human-readable business
  document numbers (`PREFIX/FY/0001`), backed by `DB.glDocumentTypes[...].yearlySeq`. Confirmed in use
  by ~50 document types (JE, RCPT, PAY, PO, GRN, BOM, DSP, DLV, INST, QCK, SNG, HO, WAR, CMP, TKT, VIS,
  AMC, CAPA, CN, DN, FA, PR, and more).
- **`nextId(collection, prefix, padLength)`** (`domain.js:4950`) — collision-safe internal record IDs
  via `maxIdSuffix()`, not simple array length. ~49 call sites across master data, financial, and
  inventory collections.

**Ad-hoc-counter risk found — concentrated in Wave 1's own domain.** A sweep for
`id:'PREFIX-'+String(DB.collection.length+1)` found 50 occurrences of this pattern still in use.
Critically, the core Lead→Estimation→Costing chain uses it for internal record IDs, not `nextId()`:
`createLead` (3607, `'LEAD-'+...length+1`), `addLeadActivity` (3624), `createEstimationRequest` (3644),
`createCostingVersion` (3713), `recordAcceptance` (3852), `freezeStandardCostBaseline` (3906),
`submitDesign` (3990). By contrast `createQuotation`, `wonTransition`'s Project/Customer creation, and
`createBOM` already use `nextId()` (3762, 3894, 3938, 6367 — the last explicitly commented as a past
"P0-4 FIX"). None of the ad-hoc-id records currently have a `DB.glDocumentTypes` entry — i.e. they are
internal working documents, not GL/audit-facing numbered documents, which is a plausible reason they
were never migrated. This is flagged as an open item for Wave 1 (`ARCH-2026-002-OPEN-DECISIONS.md`
item 4), not silently fixed or silently ignored.

## 3. RBAC / Data-Scope / SoD / Approval-Authority hooks

| Function | Defined at | Call sites in `domain.js` | Call sites in `server.js` |
|---|---|---|---|
| `can(actor, action)` | 725 | ~28 | ~100 |
| `hasScopeAccess(actor, scopeType, scopeId)` | 780 | 2 (656, 836) | ~67 |
| `checkSoD(ruleId, {makerId, checkerId})` | 538 | 2 (5339 — SOD-6 inside `draftSupplierInvoiceFromPO`; 11683 — SOD-5 inside `executePaymentRequest`) | 0 |
| `resolveApprovalAuthority(transactionType, actor, record)` | 617 | 0 | 1 (`server.js:1034`, `GET /api/approval-authority/check`) |

**Findings relevant to wave planning:**
- `can()`/`hasScopeAccess()` are broadly wired but concentrated at the **route-dispatch layer**
  (`server.js`) rather than inside domain functions. Inside `domain.js`, `can()`'s calls are
  concentrated in a family of `assertCanXxx(actor)` gates already built for Finance, Asset Management,
  Treasury, Manufacturing/Service, Master Data, Inventory, and Procurement. **Sales & CRM and
  Estimation & Costing (Wave 1) have no `assertCanXxx`-style function at all** — their approval logic
  (`approveQuotationDiscount`, `canSeeLead`) is hand-rolled with inline `actor.role===X` checks.
- `checkSoD()` is narrow and Procurement/Finance-only (SOD-5, SOD-6) — no SoD rule currently fires
  inside any Wave-1 function.
- `resolveApprovalAuthority()` is a **read-only mirror/diagnostic**, not itself an enforcement gate —
  its own header comment states it mirrors logic that lives inline inside each real approve-style
  function. A future wave must not assume calling it is sufficient enforcement; the real gate is each
  domain function's own inline check.
- **Legacy inline `actor.role===X` checks remain**: 30 in `domain.js`, 73 in `server.js`. Notably still
  present inside Wave-1's own `canSeeLead` (3618) and `approveQuotationDiscount` (3795) — the latter
  duplicates a SoD-style self-check (`q.createdBy===actor.id && !['CEO','Admin']`) inline instead of
  calling `checkSoD()`.
- A fifth, separate authorization layer exists and is directly relevant to future wave design even
  though this CR didn't name it: a **capability/operation-binding system**
  (`checkOperationBinding()`, `CAPABILITY_REGISTRY`) gates `postJournalEntry`/`postInventoryMovement`
  themselves. Any future module wiring new writers into the central engines must register through this
  existing mechanism, not build a sixth authorization layer.

## 4. Wave 1 chain trace (Lead → Estimation Request → Costing Version → BOM → Quotation → Approval → Project)

Traced by reading each function body directly:

1. **`createLead`** (3604) — pure Sales & CRM, no cross-domain writes.
2. **`createEstimationRequest`** (3640) — reads `DB.leads`, calls `changeLeadStatus` (3649).
3. **`createCostingVersion`** (3663) — reads `DB.estimationRequests` only; immutable-versioned by
   design.
4. **`createBOM`** (6347) — **structural finding**: requires an existing `DB.projects` record (6348),
   i.e. BOM in this codebase is created against an already-Won project, not during pre-Quotation
   Estimation. This does not match the CR's own stated chain order ("BOM" listed between Costing
   Version and Quotation in §9/§17) — any future wave-1 design must not assume BOM can be created
   pre-Quotation without a schema change, and this discrepancy is carried into
   `ARCH-2026-002-OPEN-DECISIONS.md` item 5 for an explicit decision rather than silently resequenced.
   - `approveBOM` (6400) supersedes prior approved BOMs of the same project/site/description and reads
     `DB.inventoryMovements` (6418) — a direct Inventory-domain touch from an Estimation & Costing
     function.
   - `activeBomsFor`/`materialBomQuota` (6446) are the entitlement mechanism `createMaterialIssue()`
     (Inventory, Wave 2) already validates against — **the clearest Wave-1→Wave-2 seam**: a future
     Inventory-wave change must keep calling into this existing mechanism, not build a second one.
5. **`createQuotation`** (3725) — reads `DB.costingVersions`, cross-validates
   `estimationRequestId`/`leadId` consistency (a past Phase 41 fix), calls `changeLeadStatus` (3770).
   Uses `nextId()` + `nextDocNumber('QTN')` correctly.
6. **`submitQuotation`/`approveQuotationDiscount`** (3779, 3790) — role-gated inline, not via
   `can()`/RBAC (see §3).
7. **`wonTransition`** (3917) — the widest cross-domain reach in the chain:
   - Requires prior `Accepted` status + a valid `DB.acceptances` record + prior discount approval.
   - Calls `findOrCreateCustomer` (3934, **Master Data** — dedup by GSTIN-then-name) — **the sole
     Customer-dedup entry point**; any future customer-creation path must call this same function, not
     reimplement dedup.
   - Creates a Project record directly (3938) — this IS the Project & Contract domain (also Wave 1),
     so this is an in-wave write, not a leak.
   - Calls `freezeStandardCostBaseline` (3947) — **the sole baseline-creation function**; future
     Controlling/Costing work should extend it, not add a parallel baseline writer.
   - Does **not** touch Inventory, Procurement, or Manufacturing directly — the Wave-1/Wave-2 boundary
     holds at this specific function.
8. Downstream of Won: `submitDesign`/`reviewDesign` (3986, 3996) are Project & Contract, gated by an
   inline role list plus `hasScopeAccess(actor,'Project',...)` — one of only 2 real `domain.js` call
   sites of `hasScopeAccess`.

## 5. Shadow-engine risk — re-confirmed after today's uncommitted ARCH-2026-001D/E changes

- **GL**: exactly one real `DB.journalEntries.push()`, inside `postJournalEntry()` itself. All other
  textual matches are comments describing historical, already-fixed defects. **Single GL writer
  confirmed still holds.**
- **Inventory**: zero raw stock mutations found (`.stock[...]=`, bare `+=`/`-=` outside the known
  writer). The only `currentStock`-named usage is a local `const` computed via `getStockLevel()` inside
  a read-only report function — stock is fully derived from `DB.inventoryMovements`, never stored as a
  mutable balance anywhere. **Single inventory-movement writer confirmed still holds.**
- The uncommitted ARCH-2026-001D/E changes only added `checkSoD()`/`resolveApprovalAuthority()` calls
  layered on top of existing single-writer functions — they introduced no new write path.

## 6. Bottom line for wave planning

All four singular engines (GL, inventory movement, clearing, transaction wrapper) remain genuinely
singular. **The real risk this map surfaces is not engine duplication — it is inconsistent RBAC/SoD
wiring and ad-hoc-ID usage inside Wave 1's own domain**, both scoped as open decisions for Wave 1's
detailed design (see `ARCH-2026-002-WAVE-PLAN.md` §Wave 1 and `ARCH-2026-002-OPEN-DECISIONS.md`), not
as blockers to authorizing Wave 1 itself.
