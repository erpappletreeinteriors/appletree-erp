# PHASE 39 — Final Traceability Matrix

**Date:** 2026-09-12. This matrix documents the document-to-document and document-to-GL linkage
verified live this phase for the 4 domains Phase 38 could not reach. For Procurement-to-Pay and
Sales-to-Cash, see Phase 38's own `PHASE38_END_TO_END_TRACEABILITY_MATRIX.md` — unchanged this
phase, not re-derived.

## Manufacturing chain

| Step | Document | Links to | Live-verified |
|---|---|---|---|
| 1 | BOM (`BOM-0001`) | `projectId` | ✅ real FK, confirmed via `GET /api/boms` |
| 2 | Production Order | `bomId` (must be `Approved`, same `projectId`) | ✅ blocked when BOM unapproved, live-reproduced |
| 3 | Material Issue (inventory movement) | `sourceType:'ProductionOrder'`, `sourceId`, `bomId`, `bomVersion` | ✅ `MV-000003`/`MV-000004` both carry the real `bomId`/`bomVersion` |
| 4 | Material Issue JE | `sourceType:'MaterialIssue'`, `sourceId` = the movement's own ID | ✅ `JE-0003`/`JE-0004` reference `MV-000003`/`MV-000004` exactly |
| 5 | Labour Cost JE | `sourceType:'ProductionLabour'`, `sourceId` = Production Order ID | ✅ `JE-0005` → `PROD-0001` |
| 6 | Job Card | `productionOrderId` | ✅ confirmed equal to the real Production Order ID |
| 7 | Job Cost Sheet | reads material JEs + labour JE by `productionOrderId` | ✅ its own reported `materialCost`/`labourCost` matched the GL sum exactly |

## Job Work chain

| Step | Document | Links to | Live-verified |
|---|---|---|---|
| 1 | Job Work Order (dispatch) | `projectId`, `jobWorkerId`, `warehouseId` | ✅ real FK; nonexistent job worker/material both correctly rejected |
| 2 | Delivery Challan | produced by the same dispatch call | ✅ `dispatch.deliveryChallan` present and non-null |
| 3 | Return | `jwoId`, `returnedLines` | ✅ status transition `Dispatched→PartiallyReturned` confirmed |
| 4 | Scrap | `jwoId`, `lineIndex` | ✅ scrap JE `JE-0006` references `JWO-0001` as `sourceId` |
| 5 | Direct Dispatch | `jwoId`, `lineIndex`, `customerId`; gated on `apobDeclarations` when job worker unregistered | ✅ blocked with no APOB, succeeded once one existed — both live-reproduced |

## Fixed Assets chain

| Step | Document | Links to | Live-verified |
|---|---|---|---|
| 1 | Fixed Asset (`FA-0001`) | `projectId`, `sourceInvoiceEntryId` (optional) | ✅ real FK |
| 2 | Capitalization JE | `sourceType:'FixedAssetCapitalization'`, `sourceId` = asset ID | ✅ `entry.id` recorded back onto `asset.capitalizationEntryId` |
| 3 | Depreciation JE (×3 periods) | `sourceType:'Depreciation'`, `sourceId` = asset ID | ✅ each period's JE amount independently recomputed and matched |
| 4 | Transfer | `transferHistory[]` entries on the asset itself | ✅ each transfer recorded with `from`/`to`/`reason`/`by`/`at` |
| 5 | Disposal JE | `sourceType:'FixedAssetDisposal'`, `sourceId` = asset ID | ✅ `entry.id` recorded onto `asset.disposalEntryId`; gain/loss independently recomputed and matched |

## Banking chain

| Step | Document | Links to | Live-verified |
|---|---|---|---|
| 1 | Bank Account | `glAccount` (must be unique among active accounts) | ✅ duplicate-GL-account creation correctly blocked |
| 2 | Customer Receipt / Supplier Payment | `bankAccountId` → resolves to that account's own `glAccount` for the GL posting | ✅ live-proven both directions (balance moves on the correct account only) |
| 3 | Bank Transfer | `fromAccountId`/`toAccountId` → both accounts' own `glAccount`s | ✅ balanced JE, both balances moved by the exact transfer amount |
| 4 | Bank Import Batch | `bankAccountId` | ✅ duplicate detection by `bankTxnId` across batches, confirmed live |
| 5 | Bank Import Line Allocation | `sourceType:'BankImportAllocation'`, `sourceId` = line ID; bank side resolves to the line's own `bankAccountId`'s `glAccount` | ✅ **this exact link was the site of DEF-P39-02** — found broken (hardcoded to account `1000`), fixed, and re-verified live |

## Orphan detection — company-wide, all document types, this phase's peak volume

`GET /api/reports/orphan-reconciliation` against the 525-document stress-test state:
**525/525 linked, 0 orphans of any category** (genuine, no-source-by-design, known historical test
artifact, unmapped-type, inventory-movement, clearing). See `PHASE39_DOCUMENT_TRACEABILITY_REPORT.md`
for the full detail and the honest disclosure of what this does and does not prove (company-wide
orphan-freedom at volume, not a re-verification of the trace function's own deeper, already-disclosed
scope gaps).

## Summary

Every document chain tested this phase carries real, live-verified foreign-key linkage through to
its GL posting — including the one place (Bank Import Allocation) where that linkage was
demonstrably NOT resolving to the correct account before this phase's fix.
