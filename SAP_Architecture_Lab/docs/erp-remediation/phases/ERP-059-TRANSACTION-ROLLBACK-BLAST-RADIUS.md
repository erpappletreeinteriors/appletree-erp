# ERP-059 — Transaction-Rollback Blast Radius Analysis

**Date:** 2026-09-10. Part D of the Phase 1 Final Cleanup + ERP-059 Security Gate.
**Method:** codebase-wide search for the specific pattern `withTransaction()`'s own rollback rule
exposes — a handler that deliberately mutates persisted state and THEN returns `{ok:false}` —
followed by live reproduction of the two highest-value candidates found, on a disposable isolated
server. No production code was changed to produce this document.

## The rule being searched for

`withTransaction()` (`domain.js`) restores `DB` to its pre-call snapshot and re-`save()`s
whenever the wrapped handler's result has `result.ok === false` — **not just on a thrown
exception**. This is correct and safe for the overwhelming majority of this codebase's handlers,
which validate every precondition BEFORE their first mutation — an empty rollback of nothing is a
harmless no-op for them. It is only a defect where a handler's design INTENDS a mutation to survive
specifically BECAUSE the operation failed (a security counter, an audit trail describing the
refusal itself). Two call-site shapes were searched for:

1. **Legacy-dispatched routes** (`server.js` if-blocks not on `registerMutationRoute`) that mutate
   `DB` before returning `{ok:false}` — wrapped by the legacy-dispatch `withTransaction()` shown in
   `server.js` around line 583.
2. **`domain.js` functions matching `logAudit({type:'...Rejected'...}); return {ok:false, ...}`** —
   a documented, deliberate idiom (see `reverseEntry()`'s own Phase 41 comment) for recording WHY a
   business action was refused. Whether called via a legacy route or a modern
   `registerMutationRoute()`, this call sits **inside** the handler `withTransaction()` wraps.

## Confirmed live (2 of the pattern's instances actually reproduced against a disposable server)

### 1. `/api/login` — ERP-059 itself
Already fully documented in `PHASE-01-CLOSURE-ERP059-GATE-REPORT.md`. **Category B, currently
broken.** All three `DENY` branches (`loginHistory.push` for unknown/inactive user, account
locked, and bad password) are affected identically — not only the "bad password" one most visibly
tested.

### 2. `reverseEntry()` — `ReversalRejected` audit entries (Critical)
`domain.js:2218` defines a `rejectReversal(error, extra)` helper explicitly built, per its own
Phase 41 comment, to fix **"a rejected (400) reversal attempt left no audit trace at all"** — every
refusal path in `reverseEntry()` (unauthorized role, missing reason, and others further in the
function) calls it. **Live-reproduced**: posted a real JE, attempted to reverse it with a blank
`reason` (`POST /api/journal/JE-0001/reverse {reason:""}`) → correctly rejected
(`400, "A reason is required to reverse a posting."`) — but `GET /api/audit-log` immediately after
shows **zero** `ReversalRejected` entries. The route (`/api/journal/:id/reverse`, modern,
`auditReject:true`) DOES produce one generic `BusinessRuleRejected` entry (path/method/error only,
no `entryId`/`reason` detail) — that one survives because `dispatchMutationRoute()` logs it AFTER
`withTransaction()` has already returned, outside the rolled-back boundary (see "The one part of
this codebase that already does it correctly," below). **The Phase 41 fix has never actually
worked, for any of its rejection paths, since it was written** — a genuinely serious finding
independent of login/lockout, since accounting-reversal audit trails are exactly the kind of
evidence a real investigation would need.

## The one part of this codebase that already does it correctly

`registerMutationRoute()`'s `auditReject:true` flag (`server.js` `dispatchMutationRoute()`, around
line 465-468) logs a **generic** `BusinessRuleRejected` entry (`path`, `method`, `error` only)
**after** `D.withTransaction()` has returned — i.e., genuinely outside the rolled-back boundary, so
it reliably survives. This is the existing, working precedent for "Option B" style persist-on-
failure semantics (see the Gate Report's remediation options) — it already ships for ~40+ modern
routes. It is not itself broken; it simply cannot carry the rich, domain-specific detail (`entryId`,
`poId`, `materialId`, etc.) the INNER `logAudit({type:'XRejected'...})` calls were written to
capture, because it fires from outside the handler and has no visibility into the handler's own
locals.

## Full inventory of the "logAudit(...Rejected); return {ok:false}" pattern

Every occurrence found by codebase search (`grep -n "type:'[A-Za-z]*Rejected'"` across
`domain.js`). The two above are **CONFIRMED** by live reproduction. The remainder share the
identical code shape (a `logAudit()` call immediately preceding a `return {ok:false, ...}`, inside
a function that is itself the direct `handler` of either a legacy `server.js` if-block or a
`registerMutationRoute()` registration) and are classified **PRESUMED AFFECTED** by structural
analysis — **not individually live-tested this gate**, per the "forensic, not broad-fix" scope of
this closure gate. Systematically live-verifying all ~23 remaining ones is recommended as the first
step of the actual remediation work, not assumed here.

| # | Audit type | Function | Domain area | Status |
|---|---|---|---|---|
| 1 | (none — direct `loginHistory.push`) | `/api/login` route (3 DENY branches) | Authentication | **CONFIRMED** (= ERP-059) |
| 2 | `ReversalRejected` | `reverseEntry()` | Accounting — GL reversal | **CONFIRMED** |
| 3 | `ExcessBillingRejected` | `rejectExcessBillingApprovalRequest()` | Sales/Billing control | Presumed affected |
| 4 | `SupplierBillThreeWayMatchBypassRejected` | (inline, supplier bill posting) | Procurement control | Presumed affected |
| 5 | `ChangeRequestRejected` | Change Request rejection | Project Variation | Presumed affected |
| 6 | `GRNRejected` | `createGRN()` | Procurement/Inventory | Presumed affected |
| 7 | `PurchaseReturnRejected` | `createPurchaseReturn()` | Inventory | Presumed affected |
| 8 | `MaterialIssueRejected` | `createMaterialIssue()` | Inventory | Presumed affected |
| 9 | `BOMRejected` | `rejectBOM()` | Manufacturing/BOM | Presumed affected |
| 10 | `ExcessMaterialIssueRejected` | Excess Material Issue rejection | Inventory control | Presumed affected |
| 11 | `InventoryAdjustmentRejected` | `createInventoryAdjustment()` | Inventory | Presumed affected |
| 12 | `UserCreationRejected` (×3 reasons) | `createUser()` | **Security — user provisioning** | Presumed affected |
| 13 | `VendorCreationRejected` (×2 reasons) | `createVendorMaster()` | Master data | Presumed affected |
| 14 | `MaterialCreationRejected` (×2 reasons) | `createMaterialMaster()` | Master data | Presumed affected |
| 15 | `MasterDataImportBatchRejected` | `importMasterData()` | Import (this session's own ERP-017 fix) | Presumed affected |
| 16 | `PurchaseRequisitionRejected` | `rejectPurchaseRequisition()` | Procurement | Presumed affected |
| 17 | `SiteMaterialRequisitionRejected` | `rejectSiteMaterialRequisition()` | Site operations | Presumed affected |
| 18 | `SiteReturnRejected` | `returnFromSite()` | Inventory | Presumed affected |
| 19 | `PaymentRequestRejected` | `rejectPaymentRequest()` | **Finance — payment control** | Presumed affected |
| 20 | `JobWorkScrapRejected` | Job Work scrap disposition rejection | Manufacturing | Presumed affected |
| 21 | `RestoreRejectedValidationFailed` | `restoreBackup()` (this session's ERP-040 fix) | **Backup/DR** | Presumed affected |
| 22 | `RestoreRejectedChecksumMismatch` | `restoreBackup()` (this session's ERP-040 fix) | **Backup/DR** | Presumed affected |

Row 12 (`UserCreationRejected`) and rows 21-22 (`RestoreRejected*`) are flagged in **bold** above
because they are themselves security-relevant audit trails (who tried to create what user account;
who attempted a restore with a tampered/mismatched backup) — exactly the category the user's own
gate instructions named as highest priority to check ("authentication... audit logging... security
counters"). Rows 21-22 are especially notable: **they are this session's own ERP-040 fix**,
meaning the rejection-audit trail added earlier in this same engagement inherits the identical,
pre-existing architectural gap.

## Classification summary (per the gate's own A/B/C schema)

- **A — failure must roll back all mutations**: the overwhelming majority of this codebase's ~215
  legacy routes and all other `registerMutationRoute()` handlers. Confirmed safe by design (they
  validate before mutating, so there is nothing to roll back) — not enumerated individually here,
  as doing so would be the "broad sweep" this gate is explicitly scoped not to attempt.
- **B — failure intentionally persists security/audit/bookkeeping state**: all 22 rows in the table
  above, PLUS `/api/login`. Two are live-confirmed broken; the rest are presumed broken by
  structural analysis. **None of them are currently working as designed.**
- **C — ambiguous, requires a business decision**: none found. Every instance located has an
  unambiguous author intent (the code comments at each site state plainly why the audit entry
  exists), so this gate did not surface a genuinely ambiguous case.

## Why this matters beyond ERP-059 itself

The original ERP-059 finding read, in isolation, as a narrow authentication bug. This blast-radius
search shows it is actually **one instance of a systemic architectural gap**: this codebase has, in
at least 4 separate historical phases (the login lockout mechanism's own original author, Phase 41's
`reverseEntry()` fix, and this session's own ERP-017/ERP-040 fixes), independently arrived at the
same idiom — "log why this was rejected, so the attempt is not invisible" — and in every single
case, that idiom is silently defeated by `withTransaction()`'s blanket rollback rule. This is
strong evidence the fix belongs at the **transaction-framework level** (Options A/B/C in the Gate
Report), not as another one-off patch at each of these ~23 call sites individually — patching each
site separately would be the eleventh reappearance of the exact idiom the framework itself doesn't
support yet, not real remediation.
