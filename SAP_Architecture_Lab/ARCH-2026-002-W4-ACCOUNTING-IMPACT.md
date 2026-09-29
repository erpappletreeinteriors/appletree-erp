# ARCH-2026-002 — W4 Accounting Impact

**Date:** 2026-09-26. Deliverable per this CR's own §11-§13 (Service Billing architecture, Inventory
architecture, Project Cost architecture) plus the accounting-impact analysis for every decision item.

## §11 — Service Billing architecture (documented, not re-designed)

```
Chargeable Service:
  Service → Service Billing → draftCustomerInvoice() → Customer Invoice/AR
          → Customer Receipt → Clearing/Bank Reconciliation

AMC Billing:
  AMC → Service Billing → createDraft() [shared primitive, one level below
        draftCustomerInvoice()] → Dr AR (1100) / Cr Deferred Revenue (2100)
        → recognizeAMCRevenue() [period-guarded] → Customer Receipt → Clearing
```

Both sub-paths converge on the identical Draft→GL lifecycle (`submitDraft`/`approveDraft`/`postDraft`,
shared maker-checker-poster chain). **This is confirmed a single AR/billing engine — not a second one —
per the precise refinement `ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md` rows 8a/8b already
established.** Neither sub-path posts to AR/GL independently of `postJournalEntry()`.

**No proposed W4 item (IN SCOPE or POLICY DEPENDENT) would create a second AR engine.** W4-7 (duplicate-
billing guard, whichever option is eventually chosen) adds a PRE-POSTING guard clause, never an
alternative posting path. This is verified explicitly, not assumed.

## §12 — Inventory architecture (documented, not re-designed)

Service Material issue (`issueServiceMaterial()`) delegates fully, unmodified, to `createMaterialIssue()`
→ `postInventoryMovement()` — the single confirmed inventory-movement engine. **No proposed W4 item
creates a service stock ledger, a service-only stock balance, or a service-specific movement engine.**
None of the 12 decision items touches inventory architecture at all — Service Material issue is not itself
a subject of any open W4 decision.

## §13 — Project Cost architecture (documented, not re-designed)

`coreProjectPL()` is built by SUBTRACTING after-sales amounts back out of `projectPL()`'s own,
byte-unchanged output — "by construction," per its own code comment — never a second, independently-
computed number that could drift. `afterSalesFinancials()`/`serviceTicketCostBreakdown()` are read-only
rollups over already-posted GL/inventory data, not a separate financial engine. **No proposed W4 item
creates a Service Profitability Engine, a Service Cost Engine, or a Service Margin Engine as a separate
financial engine** — W4-11 (technician/Cost-Centre tagging) would only ADD DIMENSIONS to reports that
already aggregate existing authoritative transactions, never a new calculation.

## Accounting impact of each decision item

| Item | Accounting impact if implemented |
|---|---|
| W4-1 (Warranty policy) | None. |
| W4-2 (Classification automation) | Indirect — could reduce misclassification risk (unbilled chargeable / incorrectly billed warranty), no direct GL change. |
| W4-3 (AMC scheduling automation) | None. |
| W4-4 (Resolution SLA) | None. |
| W4-5 (Rate-card enforcement) | None — same accounts (5100/1000) under every option; only the posted AMOUNT's derivation changes. |
| W4-6 (Warranty accounting treatment) | **SIGNIFICANT if Option B (provision) is chosen** — a new GL account and a genuine timing-of-recognition change; NONE if Option A (current expense-at-issue) is retained. |
| W4-7 (Duplicate-billing guard) | Preventive only — would avoid a real (not yet observed) double-AR-posting risk; no change to correct-case accounting. |
| W4-8/9 (SoD expansion) | None — identity controls, not financial calculations. |
| W4-10 (CAPA validation / Site-issue origin) | None. |
| W4-11 (Technician/Cost-Centre tagging) | None — pure tagging, same accounts, same amounts. |
| W4-12 (Site/Branch scope) | None. |

**Only W4-6 carries a potentially significant accounting impact, and only under its Option B** — every
other item is either zero-impact or a pure preventive-control addition with no effect on correctly-
processed transactions. This is consistent with `ARCH-2026-002-WAVE-4-DESIGN.md`'s own framing of Sub-wave
4D (Warranty accounting) as "the most architecturally significant item in this register."

## No shadow financial model

Re-confirmed: no item anywhere in this gate's scope proposes a calculation that duplicates, forks, or
could drift from `postJournalEntry()`'s single source of truth. This satisfies this CR's own §13
"Reports may aggregate existing authoritative transactions" boundary for every item reviewed.
