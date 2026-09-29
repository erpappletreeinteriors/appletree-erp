# ARCH-2026-002 — Wave 3 Transaction Ownership Matrix

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §24.

| Transaction | Authoritative Owner | GL Writer | Subledger Writer | Clearing Owner | Project-Cost Impact | Controlling Impact | Treasury Impact | Audit | SoD | Approval | Scope |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Customer Invoice | Finance & Accounting | `postJournalEntry` via `postDraft` | AR (`customerOpenItems`) | N/A (creates the open item) | Via `projectPL` sweep | None | None | Yes | creator≠approver/poster | Draft lifecycle | Customer scope on read |
| Customer Receipt | Finance & Accounting | `postJournalEntry` (`postCustomerReceipt`) | AR | `applyClearing` | Indirect (clears AR) | None | Bank balance moves | Yes | N/A (self-executing, role-gated) | N/A | — |
| Customer Advance | Finance & Accounting | `postJournalEntry` via draft lifecycle | AR (liability 2100) | N/A until recognized | Excluded until billed | None | None | Yes | Draft-lifecycle SoD | Draft lifecycle | — |
| Customer Credit/Debit Note | Finance & Accounting | `postJournalEntry` | AR | `applyClearing` (credit note) | Via `projectPL` sweep | None | None | Yes | Draft-lifecycle SoD | Draft lifecycle | — |
| Supplier Bill | Finance & Accounting | `postJournalEntry` (`draftSupplierInvoice[FromPO]`) | AP | N/A (creates the open item) | Via `projectPL` sweep | None | None | Yes | SOD-6 (GRN vs Bill), SOD-8 (Job Work vs Bill) | Draft lifecycle | Project-open gate |
| Supplier Payment | Finance & Accounting (AP) | `postJournalEntry` (`postSupplierPayment`) | AP | `applyClearing` | Indirect | None | Bank balance moves | Yes | Via Payment Request (SOD-1/2/5) if that path used; direct AP payment route has its own gate | N/A | — |
| Supplier Debit Note | Finance & Accounting | `postJournalEntry` | AP | `applyClearing` | Via `projectPL` sweep | None | None | Yes | Draft-lifecycle SoD | Draft lifecycle | — |
| Payment Request | Treasury (initiates) / Finance-AP (owns execution) | N/A (request only) | N/A | N/A | None directly | None | None | Yes | **SOD-1, SOD-2, SOD-5 — all re-confirmed active** | Tiered (Payment Approval Matrix, still Draft/unfinalised) | — |
| Journal Voucher | Finance & Accounting | `postJournalEntry` | N/A (generic) | N/A | Depends on tagged `projectId` | Depends on tagged Cost/Profit Centre | Depends | Yes | creator≠approver, creator≠poster (independently enforced) | Draft lifecycle | — |
| Bank Import (batch) | Treasury | N/A (metadata only until allocated) | N/A | N/A | None | None | None | Yes | **MISSING — no identity check between importer and reconciler** | N/A | — |
| Bank Reconciliation (match/allocate/reconcile) | Treasury | `postJournalEntry` only at `postBankImportLine` (allocate step) | N/A | Self (reconcile step) | None directly | None | Direct | Yes | Same as above — MISSING | N/A | — |
| Bank/Cash Transfer | Treasury | `postJournalEntry` (`createBankTransfer`) | N/A | N/A | None | None | Direct | Yes | None found | N/A | — |
| Petty Cash (float/voucher/replenish) | Treasury | Only replenishment posts (`postJournalEntry`) | N/A (operational register, not a true subledger) | N/A | None | None | Direct (float) | Yes | None found | Role-gated only | — |
| Tax transaction | Finance & Accounting (embedded in AR/AP) | `postJournalEntry` (as part of the parent document) | Tax accounts 1300/2200 | Via parent document's clearing | None directly | None | None | Yes | Inherits parent document's SoD | Inherits | — |
| Fixed Asset — Acquisition | Asset Management | N/A (status only, Purchased) | N/A | N/A | None yet | None | None | Yes | N/A | N/A | Project-open gate (via project, if tagged) |
| Fixed Asset — Capitalization | Asset Management | `postJournalEntry` (Dr 1400) | N/A | N/A | If project-tagged | None | None | Yes | **MISSING — no creator≠capitalizer check** | Role-only | — |
| Fixed Asset — Depreciation | Asset Management | `postJournalEntry` (Dr 5400/Cr 1450) | N/A | N/A | **YES — silently folds into `projectPL`'s generic Expense sweep, not separately labeled** | None | None | Yes | N/A | Role-only | — |
| Fixed Asset — Disposal | Asset Management | `postJournalEntry` (removes 1400/1450, books 5500) | N/A | N/A | If project-tagged | None | None | Yes | **MISSING — no identity check across the whole lifecycle** | Role-only | — |
| Budget | Project & Contract Management (Wave 1) | N/A | N/A | N/A | Direct (is the baseline) | None | None | Yes | N/A | N/A | Project scope |
| Commitment | Procurement (Wave 2) → consumed by Controlling's B/C/A model | N/A | N/A | N/A | Direct | None | None | Yes | N/A | N/A | Project scope |
| Cost Allocation | **ABSENT — no such transaction exists** | — | — | — | — | — | — | — | — | — | — |
| Profitability (Project/Customer/Company) | Controlling (read-only composition) | N/A (reads only) | N/A | N/A | Direct (is the output) | Direct | None | N/A (reads unaudited, existing convention) | N/A | N/A | Customer/Project scope on read |
| Financial Close (period close/reopen) | Finance & Accounting | N/A (gate, not a posting) | N/A | N/A | None | None | None | Yes | Role-gated (`PERIOD_MANAGEMENT_ROLES`) | N/A | — |

## Critical rule compliance

**No transaction in this table acquired a second authoritative owner.** Every GL-writing row traces to
exactly one function, re-confirmed via the Central Accounting Audit's exhaustive single-writer sweep.
Cost Allocation is genuinely absent (no transaction type exists to have an owner). The two rows marked
**MISSING** (Bank Import→Reconciliation identity check; Fixed Asset lifecycle identity check) are
SoD-coverage gaps on an otherwise-correctly-single-owned transaction, not ownership ambiguity — the
owner is unambiguous in both cases (Treasury; Asset Management respectively), only the identity
separation control is absent.
