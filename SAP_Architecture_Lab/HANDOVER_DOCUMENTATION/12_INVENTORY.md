# 12 — Inventory

## Valuation method: Moving Average (approved policy — do not change without a management decision)
Every receipt (GRN, opening balance, transfer-in) updates a running weighted-average cost per item per warehouse. Every issue (material issue, transfer-out, return) consumes stock at the CURRENT average rate at that moment — replaying every movement in true chronological order, not a simplified "total value ÷ total received" shortcut (that shortcut was found to be mathematically wrong in Phase 16 and fixed).

## Movements tracked
Receipt, Issue, TransferIn, TransferOut, Return, Adjustment, and Opening Balance (which reuses the Receipt logic). Every movement is visible in **Inventory → Movement Ledger**, filterable by material and searchable by source document.

## Adjustments
**Inventory → Adjustment** requires a reason for every entry (no silent adjustments) and posts a real GL entry (Dr/Cr account 5300 "Inventory Adjustment") — this is the only account used for shrinkage/found-stock corrections.

## Reconciliation guarantee
Computed inventory value (stock quantity × moving average rate, summed across every item/warehouse) always equals the GL Inventory account (1200) balance — proven on every regression run.

## Zero real inventory today
No real Appletree stock quantities or costs have been loaded. Use **Opening Inventory** (`10_OPENING_BALANCE_IMPORT.md`) to load your real starting stock before going live.
