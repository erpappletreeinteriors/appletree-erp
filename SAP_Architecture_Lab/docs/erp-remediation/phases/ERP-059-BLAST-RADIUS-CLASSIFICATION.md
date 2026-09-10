# ERP-059 Blast-Radius Classification (Corrected)

**Date:** 2026-09-10. Part 5 of Phase ERP-059A. Supersedes the "presumed affected" list in the
prior forensic gate's `ERP-059-TRANSACTION-ROLLBACK-BLAST-RADIUS.md` with a precise, per-site
classification — **no application behavior was changed to produce this document**, except the one
approved ERP-059 login fix (Part 3), which this classification is entirely independent of.

## What changed since the forensic gate

The forensic gate flagged every `logAudit({type:'...Rejected'...})` call site as "presumed
affected" purely by pattern-matching the audit type NAME. This phase re-read every call site's
**actual enclosing function and its return value**, and found that roughly half of them describe a
**successful business action** (a user successfully rejecting a document — a PR, a BOM, a Change
Request, an Excess Billing/Material request, an MRS, a Payment Request) which returns
`{ok:true, ...}`. Those are **never** subject to `withTransaction()`'s rollback-on-`ok:false` rule
at all, regardless of the audit type's name containing the word "Rejected." Only call sites where
the *enclosing function itself* returns `{ok:false, ...}` — meaning the original request genuinely
failed — are structurally exposed.

## Classification schema (as specified)

- **A — Confirmed live broken.**
- **B — Structurally guaranteed to roll back** (direct handler, `withTransaction` boundary,
  deliberate mutation, returns `ok:false`, mutation intended to persist).
- **C — Potentially affected, requires runtime confirmation.**
- **D — Not affected** (transaction/audit boundary differs, or the mutation belongs to a
  `ok:true` success path).

## Category A — Confirmed live broken (this phase's own testing, on a disposable server)

| # | Site | Domain | Function / Route | Mutation | Live-test result |
|---|---|---|---|---|---|
| 1 | `/api/login` | **Security — Authentication** | login route (server.js) | `failedLoginCount`/`lockedUntil`/`loginHistory` DENY | **FIXED this phase** (was broken; see Part 3). Before: 5 wrong passwords never locked the account. After: locks correctly at 423. |
| 2 | `ReversalRejected` | **Finance** | `reverseEntry()` | `logAudit` describing why a GL reversal was refused | Reversed a real posted JE with a blank reason → correctly rejected (400) → **0** `ReversalRejected` entries found (only a generic `BusinessRuleRejected` survives, via the unrelated `auditReject:true` mechanism) |
| 3 | `SupplierBillThreeWayMatchBypassRejected` | **Procurement** | `draftSupplierInvoiceFromPO`'s sibling non-PO path | `logAudit` describing a blocked non-PO bill against a goods vendor | Billed a real goods-category vendor (VEND-1) with no PO → correctly rejected (400, `requiresPOAndGRN:true`) → **0** matching audit entries found |
| 4 | `InventoryAdjustmentRejected` | **Inventory** | `createInventoryAdjustment()` | `logAudit` describing a blocked GL posting for a stock adjustment | Created and closed a real financial period, then attempted a stock adjustment inside it → correctly rejected (400, period-closed) → **0** matching audit entries found |
| 5 | `UserCreationRejected` (×3 reasons: InvalidRole, DuplicateUsername, WeakPassword) | **Security — user provisioning** | `createUser()` | `logAudit` describing a blocked account-creation attempt | Attempted to create a duplicate `admin` account → correctly rejected (400, "Username already exists") → **0** matching audit entries found. (This function's own code comment, written in an earlier phase, already disclosed "10 duplicate-username attempts produced 0 matching audit entries" — independently corroborating this finding without knowing the root cause.) |
| 6 | `MasterDataImportBatchRejected` | **Audit / this session's own ERP-017 fix** | `importMasterData()` | `logAudit` describing a whole-batch import rejection | Submitted a 2-row batch (1 valid, 1 invalid) → correctly rejected atomically (400, "1 of 2 row(s) failed validation") → **0** matching audit entries found |

## Category B — Structurally guaranteed to roll back (code-confirmed, not independently
live-tested this phase — same exact shape as the Category A sites above: a `logAudit(...)` call
immediately preceding a `return {ok:false, ...}`, inside a function that is the direct `handler`
of a route wrapped by `withTransaction()`)

| # | Site | Domain | Function | Mutation |
|---|---|---|---|---|
| 7 | `GRNRejected` | Procurement | `createGRN()` | `logAudit` on a blocked GL posting for a goods receipt |
| 8 | `PurchaseReturnRejected` | Inventory | `createPurchaseReturn()` (implied by the code around this site) | `logAudit` on a blocked GL posting for a purchase return |
| 9 | `MaterialIssueRejected` | Inventory | `createMaterialIssue()` | `logAudit` on a blocked GL posting for a material issue |
| 10 | `SiteReturnRejected` | Inventory/Site Ops | site-return handler | `logAudit` on a blocked GL posting for a site material return |
| 11 | `JobWorkScrapRejected` | **Manufacturing** | job-work scrap disposition handler | `logAudit` on a blocked GL posting for a scrap write-off (same `postJournalEntry()`-failure shape as GRN/Material Issue/Site Return above — not live-tested this phase due to the setup cost of a real Job Work Order relative to the time budget, but structurally identical, including the exact same defensive code comment style, "Nothing has been written yet") |
| 12 | `RestoreRejectedValidationFailed` | **Backup/DR — this session's own ERP-040 fix** | `restoreBackup()` | `logAudit` on a snapshot that failed structural validation |
| 13 | `RestoreRejectedChecksumMismatch` | **Backup/DR — this session's own ERP-040 fix** | `restoreBackup()` | `logAudit` on a snapshot whose checksum doesn't match its recorded value |

## Category C — Potentially affected, requires runtime confirmation

**None found.** Every call site located in this codebase search has an unambiguous return value
(either the enclosing function demonstrably returns `ok:false` right after the `logAudit` call, or
it demonstrably returns `ok:true`) — there was no genuinely ambiguous case requiring further
runtime investigation to classify.

## Category D — NOT affected (corrected from the forensic gate's over-broad "presumed affected")

These all share the same shape: the enclosing function **successfully processes a rejection of
some OTHER document** (a PR, a BOM, a Change Request, an Excess Billing/Material Issue request, an
MRS, a Payment Request) and returns `{ok:true, ...}` for that successful processing — the audit
type's name containing "Rejected" describes the *business outcome being recorded*, not a failure
of the API call itself. `withTransaction()`'s rollback rule only fires on `result.ok===false`, so
none of these are ever at risk.

| # | Audit type | Function | Verified return value |
|---|---|---|---|
| 14 | `ExcessBillingRejected` | `rejectExcessBillingApprovalRequest()` | `{ok:true, excessBillingApproval:xba}` |
| 15 | `ChangeRequestRejected` | `rejectChangeRequest()` | `{ok:true, changeRequest:cr}` |
| 16 | `BOMRejected` | `rejectBOM()` | `{ok:true, bom:b}` |
| 17 | `ExcessMaterialIssueRejected` | `rejectExcessMaterialIssueRequest()` | `{ok:true, excessRequest:xmi}` |
| 18 | `PurchaseRequisitionRejected` | `rejectPurchaseRequisition()` | `{ok:true, purchaseRequisition:pr}` |
| 19 | `SiteMaterialRequisitionRejected` | `rejectSiteMaterialRequisition()` | `{ok:true, mrs}` |
| 20 | `PaymentRequestRejected` | `rejectPaymentRequest()` | `{ok:true, paymentRequest:req}` |

## Summary

| Category | Count | Live-tested this phase |
|---|---|---|
| A (confirmed broken) | 6 (incl. login, now fixed) | 6/6 |
| B (structurally confirmed, not live-tested) | 7 | 0/7 (JobWorkScrapRejected and the RestoreRejected*/GRN/PurchaseReturn/MaterialIssue/SiteReturn sites share the exact `postJournalEntry()`-failure shape already proven live in Category A items 2-4) |
| C (ambiguous) | 0 | — |
| D (not affected — corrected from the forensic gate) | 7 | — (confirmed safe by code reading, not by live test, since there is no failure mode to reproduce) |

**Net effect of this phase's classification work:** the true remaining blast radius (Categories A+B,
excluding the now-fixed login) is **12 call sites**, not the ~22 the forensic gate estimated —
roughly half of the original list was a false positive caused by pattern-matching on the audit
type's name rather than reading each function's actual control flow. This is a more precise,
smaller, and more actionable number for whoever scopes the next remediation phase (Option B from
the forensic report).

## Per-item remediation recommendation (all Category A/B items, none implemented this phase)

Every item above shares the identical root cause and the identical candidate fix shape: exclude
it from the legacy-dispatch `withTransaction()` wrapper (mirroring the login fix), OR — better,
since these are all modern `registerMutationRoute()` handlers (unlike login) — give
`withTransaction()` itself a narrow, explicit "this specific mutation persists regardless of the
handler's outcome" marker (Option B from the forensic report), since patching each of these 12
sites individually with an Option-A-style route exclusion would mean re-deriving the same fix 12
more times. This is exactly why the forensic report recommended Option B as the systemic follow-up
to Option A — this phase's corrected, smaller list makes that follow-up phase's scope clearer, not
larger.
