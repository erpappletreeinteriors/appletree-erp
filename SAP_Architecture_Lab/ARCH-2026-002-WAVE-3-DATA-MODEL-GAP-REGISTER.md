# ARCH-2026-002 — Wave 3 Data-Model Gap Register

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §25. Every field below has a documented business
purpose; none is proposed merely because enterprise systems commonly have it.

| Entity/Change | Fields (if authorized) | Relationships | Lifecycle | Ownership | Accounting Relationship | Project Relationship | Controlling Relationship | Treasury Relationship | Security | Migration Risk | Reporting Impact |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Fixed Asset SoD (creator≠capitalizer/disposer) | No new fields — reuses existing `asset.createdBy`, adds identity-comparison guard clauses (mirrors the `checkSoD()` pattern already used for SOD-5/6/7-11) | N/A | N/A | Asset Management | None — pure authorization addition | None | None | None | Closes a real, disclosed SoD gap | LOW — additive guard clauses only, same pattern as 5 prior Wave 2 rules | None |
| Bank Import → Reconciliation SoD | No new fields — reuses `batch.importedBy`, adds identity-comparison guard(s) to `matchBankImportLine`/`reconcileBankImportLine` | N/A | N/A | Treasury | None | None | None | Closes a real, disclosed SoD gap | LOW — same pattern | None | None |
| Bank Account creation → payment execution SoD | No new fields — reuses `bankAccount.createdBy`, mirrors SOD-5's exact shape | N/A | N/A | Treasury | None | None | None | Closes a real, disclosed SoD gap | LOW — same pattern | None |
| Petty Cash GL control account | A new dedicated GL account (e.g. `1150 — Petty Cash on Hand`), Dr on float creation, adjusted on replenishment | Links `DB.pettyCashFloats` to a real GL balance | Would change float creation from operational-only to GL-backed | Treasury | **Real accounting-policy decision required** — currently no such account exists; adding one changes what floats "are" in accounting terms | None directly | None | Would give Petty Cash a true, GL-reconcilable balance | MEDIUM — changes float-creation's current zero-GL-effect behavior, must be proven not to double-count against existing replenishment postings | New Petty Cash GL reconciliation report would become meaningful |
| True daily-aggregate cash limit | A new per-person/per-day running-total check inside `checkCashLimit()` | N/A | N/A | Treasury | None | None | None | Closes a real, disclosed enforcement gap (currently per-transaction only) | LOW — additive to an existing function, must not change the ALREADY-correct float-ceiling check | None |
| Cost allocation rules | A new `DB.costAllocationRules` entity (source cost centre/account → target dimension → % or formula) | References `DB.costCentres`/`DB.profitCentres` | Rule definition → periodic run → allocation JEs | Controlling | Would need to post through the EXISTING single `postJournalEntry()`, never a second engine | Could feed `projectPL` if allocations are project-tagged | This IS the Controlling capability itself | None | MEDIUM-HIGH — a genuinely new capability, real risk of becoming "a second cost calculation" if not built carefully against the single sweep `projectPL()` already performs | New allocation report; must reconcile to GL |
| Profit Centre transaction propagation | Would require adding `profitCentreId` to the line-shape of every GL-posting function currently missing it (a large, cross-cutting change) | N/A | N/A | Controlling (dimension owner), but touches every posting function | Pass-through validation already exists in `postJournalEntry()` — only the SOURCE functions would need to start supplying a value | Would enable Profit-Centre-level project reporting | This IS the capability | None | HIGH — touches essentially every GL-posting function in the codebase; the value must come from somewhere real (a project→Profit-Centre mapping does not currently exist either) | Would need `generalLedger()` to gain a Profit-Centre filter, currently absent |
| Depreciation/Job-Work cost — separate labeling in `projectFinancial360` | New named fields (`depreciationCost`, `jobWorkInventoryAdjustment`) surfaced alongside the existing `cost.actual` total — no calculation change, purely a response-shape addition | N/A | N/A | Controlling | None — the underlying `debit-credit` sweep is already correct; this only re-labels a slice of an existing total, exactly like `manufacturing`/`execution` already do | Direct — clarifies what's already inside `cost.actual` | This IS the fix | None | LOW — additive field, no change to any existing total | Improves report readability, no reconciliation change |

## Notes

- **No field above is proposed unless a future, explicitly-authorized Wave 3 implementation CR decides
  to build it** — this register documents what WOULD be needed if authorized, per this CR's own §25
  instruction; nothing here is built or migrated in this Phase 0 pass.
- The Account 1400/Inventory-sharing question is NOT included here as a gap, since the Asset Audit found
  the current code does NOT exhibit the sharing the prior document described — see
  `ARCH-2026-002-WAVE-3-DECISIONS.md` item W3-1 for the resolution-by-evidence.
- Per this CR's own §7 instruction, no Department/Warehouse/Segment/Business Area dimension is proposed
  anywhere in this register — only Cost Centre and Profit Centre (dimensions already present in the
  data model) are addressed.
