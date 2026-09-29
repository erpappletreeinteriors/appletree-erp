# PHASE 38 — Accounting Engine Trace Report

**Date:** 2026-09-11. Built from a dedicated forensic code-tracing pass (read-only, real file:line
citations, not summarized) plus live confirmation via the E2E test suite.

## `postJournalEntry()` — the single legitimate posting path

**27 call sites found**, one per real business event, each inside its own named domain function:
`postDraft` (manual JE/Opening Balance), `reverseEntry` (reversal), `postCustomerReceipt`,
`postSupplierPayment`, `createGRN`, `createPurchaseReturn`, `createSupplierCreditNote`,
`createSupplierDebitNote`, `createMaterialIssue`, `recordLabourWages`, `recordProjectExpense`,
`postProductionLabourCost`, `postInstallationLabourCost`, `postServiceLabourCost`,
`recognizeAMCRevenue`, `createCustomerCreditNote`, `createCustomerDebitNote`,
`createInventoryAdjustment`, `capitalizeFixedAsset`, `postAssetDepreciation`, `disposeFixedAsset`,
`postBankImportLine`, `createBankTransfer`, `returnFromSite`, `replenishPettyCashFloat`,
`recordJobWorkScrap`, `reverseITCForWriteOff`.

**No bypass found.** A repository-wide search for direct `DB.journalEntries.push/pop/shift/unshift/
splice` outside `postJournalEntry()` returns exactly **one** hit — the one inside
`postJournalEntry()` itself (`domain.js:1949`). Every other reference to `DB.journalEntries.length`
is a read or a documented rollback-truncation restoring a length captured earlier in the SAME
function's own call. `server.js` only ever reads this collection.

**Historical note, disclosed for completeness**: the codebase's own comments (`domain.js:59-72`)
record that an earlier phase deliberately built and tested a naive handler that called
`DB.journalEntries.push()` directly, to prove the write-guard mechanism (below) would catch it — it
produced a real orphan GL entry (`JE-0990`) under audit mode, and was blocked outright once
enforcement was switched on. That test scaffolding was removed after producing its evidence; no
such handler exists in the live code today.

## `postInventoryMovement()` — the single legitimate inventory-mutation path

Same pattern: **one push site** (`domain.js:4480`), **24 call sites** across GRN, Material Issue,
Purchase/Site Returns, Inventory Transfer/Adjustment, Opening Balance import, Site Material
Requisition issue/receipt, and the full Job Work dispatch/return/scrap/direct-dispatch family. No
bypass found.

**Stock and account balances are never stored-and-incremented — always derived.** `getStockLevel`,
`getSiteStockLevel`, `getJobWorkerStockLevel`, `getMovingAverageRate`, `customerOpenItems`,
`supplierOpenItems`, `generalLedger`, `companyBalanceSheet`, `customerLedger`/`supplierLedger`, and
`bankAccountBalances` are all `reduce()`/`filter()` operations over `DB.journalEntries`/
`DB.inventoryMovements`/`DB.clearings` — confirmed by direct reading, not assumed. This structurally
rules out an entire class of double-counting/drift defect: there is no second, independently-
maintained "running balance" field that could desync from the transaction history.

## The `GUARDED_COLLECTIONS` write-guard — what it actually protects against

`journalEntries`, `inventoryMovements`, and `clearings` are wrapped in a real, throwing Proxy
(`installWriteGuards`, `domain.js:1274-1306`), enforced by default (`_ENFORCE_TRANSACTION_BOUNDARY =
true`). **This is a genuine runtime guard, not a comment or aspiration** — verified it throws, not
logs-and-continues.

**Important nuance, stated precisely rather than oversold**: the guard's trigger condition is
`_txDepth === 0` — it prevents a write from occurring **outside any open transaction boundary**
(the "orphaned write that a later rollback can't undo" defect class it was purpose-built for). It
does **not** function as an allow-list of "only these 3 functions may write here" — since virtually
every real request already runs inside an open transaction (every route is wrapped via
`D.withTransaction(...)`), a hypothetical rogue handler reached through normal dispatch would NOT be
stopped by this guard alone from writing directly, only from writing *outside* a transaction. The
property "only `postJournalEntry`/`postInventoryMovement`/`applyClearing` ever push to these
collections" currently holds because a direct manual code census found no other push site (above),
not because the guard structurally forbids one. This distinction matters for anyone extending the
codebase in future — a new handler that calls `DB.journalEntries.push()` directly, from inside an
already-open transaction, would NOT be caught by this guard.

## Chart of accounts — consistency

Only 2 of ~18 account codes are hoisted into named constants (`AR_ACCOUNT='1100'`,
`AP_ACCOUNT='2000'`, `CUSTOMER_ADVANCE_ACCOUNT='2100'`); the rest are bare string literals repeated
across 40+ call sites. **No live inconsistency found** — every concept checked (Inventory=1200,
GR/IR Clearing=2050, Material Cost=5000, Customer Advance=2100) posts to the same code everywhere it
appears. This is an architectural fragility (no compiler/lint tie between the literals), not a
current defect — see the Defect Register for the P3 recommendation.

## Segregation of duties — accounting-relevant approvals

Server-side (not merely UI) SoD enforcement, confirmed by direct quotation, in every approval
function checked: Journal Entry (`approveDraft`/`postDraft` — CEO/Admin may override, audited as
`SelfApprovalOverride`), Purchase Order (**no** blanket CEO/Admin exemption — self-approval requires
a finalised, board-approved self-approval limit), Payment Request (**unconditional**, no exemption
at all — maker≠checker, and execution requires a third distinct person unless CEO/Admin), BOM,
Excess Billing Approval, Excess Material Issue (both **unconditional**, deliberately no Admin/CEO
exemption per their own code comments). Live-reproduced for the PO/Payment Request/JE cases in this
phase's E2E run.

## Financial period control — the single choke point

The closed-period check lives inside `postJournalEntry()` itself (`domain.js:1844-1855`), keyed off
the transaction's own `date` parameter (not system/wall-clock time — confirmed via
`findPeriodForDate(date)`), and is explicitly documented as the ONE place every accounting posting
path funnels through, "rather than duplicated at every caller." Override requires a role explicitly
configured **per period** (not automatic for any role, including Admin) plus a mandatory reason,
itself audited. Live-reproduced this phase: posting into a closed period was blocked.

## Live reconciliation evidence (this phase's own E2E run + 110-document stress test)

| Check | Result |
|---|---|
| Trial Balance, post full E2E run | 779,620 Debit = 779,620 Credit |
| Trial Balance, post 110-document stress run | 799,674.1 Debit = 799,674.1 Credit |
| AR subledger vs. AR control account | Matches |
| AP subledger vs. AP control account | Matches |
| Output GST subledger vs. GL | Matches |
| Input GST subledger vs. GL | Matches |
| Concurrent document numbering (15 drafts, 10 full post cycles, 110-doc batch) | Zero duplicate IDs/voucher numbers at any scale tested |

## Residual findings (see Defect Register for severity)

- `GET /api/test/architectural-violations` is gated by `Admin` role only, unlike its sibling
  `/api/test/*` mutation endpoints which additionally require `APP_ENV=test` — inconsistent, but
  read-only (no mutation capability), so low severity.
- `CUSTOMER_ADVANCE_ACCOUNT` constant is defined but only used at 2 of 5 call sites for the same
  account code — no live drift found, but the constant doesn't structurally prevent future drift.
- `SRET` ("Site Return") is referenced in a migration-guard comment but absent from the base
  `glDocumentTypes` seed array — needs a direct check to confirm whether this is cosmetic or a
  latent gap (carried over from the Phase 37 nomenclature audit's own finding, not newly found this
  phase).

**No P0 (data/accounting corruption or security bypass) finding was produced by this trace.**
