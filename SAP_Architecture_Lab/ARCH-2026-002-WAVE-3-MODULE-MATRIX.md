# ARCH-2026-002 — Wave 3 Module Matrix

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §4/§32. Domains per the current
`ARCH-2026-002-WAVE-PLAN.md` Wave 3 grouping (unchanged): Finance & Accounting, Controlling/Management
Accounting, Treasury & Cash Management, Asset Management.

## 1. Finance & Accounting

| Capability | Status | Evidence |
|---|---|---|
| GL / draft lifecycle (Journal Voucher, Templates, Recurring Entries, Import) | EXISTING | Single `postJournalEntry()` writer re-confirmed; recurring entries confirmed to require the same SoD chain, no scheduler bypass |
| AR (Customer Invoice, Receipt, Credit/Debit Note, Advance) | EXISTING | Single writer, tax via shared `calcTax()` |
| AP (Supplier Bill, Payment, Debit Note, Payment Request) | EXISTING | SOD-1/2/5/6 all re-confirmed active |
| Bank Reconciliation | EXISTING, CONSOLIDATED | Wave 1's single-engine consolidation re-verified intact after 2 subsequent Wave 2 passes |
| Financial Periods | EXISTING | Real posting-restriction mechanism; one disclosed boundary (docDate not itself gated) |
| Fixed Assets | EXISTING | See Asset Audit — 1 re-confirmed open SoD item, 1 discrepancy resolved-by-evidence |
| Tax (GST/TDS) | EXISTING | Single shared `calcTax()`/`computeTDS()` mechanism, re-confirmed |
| Compliance Dashboard, ITC/BOQ/TDS reporting | EXISTING | Read-only, sources from the single GL |
| Opening Balances | EXISTING | Unchanged since original Phase 0 |
| Financial Statements (Balance Sheet, P&L, Trial Balance) | EXISTING | All compute directly from `allLines()`, no second source of truth |

## 2. Controlling / Management Accounting

| Capability | Status | Evidence |
|---|---|---|
| Cost Centre (master) | EXISTING | Full CRUD |
| Cost Centre (transaction/posting dimension) | **PARTIAL** | Only 2 of ~13 posting paths tag it (Production/Installation labour) |
| Cost Centre (reporting dimension) | **PARTIAL** | Generic `generalLedger()` filter only, no purpose-built report |
| Profit Centre (master) | EXISTING | Full CRUD, deliberately seeded empty |
| Profit Centre (transaction/posting/reporting) | **ABSENT** | Zero business function tags it; not derivable from Branch; no report exposure |
| Project Profitability | EXISTING | One real, well-composed engine; 1 disclosed reporting-clarity gap (depreciation/job-work costs not separately labeled) |
| Customer Profitability | EXISTING | Composes AR subledger + project sweep; scope re-confirmed correctly narrower than `customerVisible` |
| Budget/Commitment/Actual | EXISTING | Unchanged since original Phase 0 |
| Cost allocation | **ABSENT** | No allocation-rule mechanism exists (unchanged from original Phase 0 finding) |

## 3. Treasury & Cash Management

| Capability | Status | Evidence |
|---|---|---|
| Bank/Cash Accounts (master) | EXISTING | — |
| Bank/Cash Transfer | EXISTING | GL-backed |
| Bank Reconciliation (consolidated engine) | EXISTING | Re-verified intact |
| Petty Cash | **PARTIAL — operational register, not a true GL subledger** | No dedicated GL control account; replenishment-only GL effect |
| Payment control chain | EXISTING | SOD-1/2/5 re-confirmed |
| Cash limits | **PARTIAL — enforced per-transaction, not daily aggregate** | Real, disclosed gap in `checkCashLimit()` |
| Payment Approval Matrix | **PARTIAL — still `finalised:false`/Draft** | Pre-existing, unresolved OPEN item, re-confirmed |

## 4. Asset Management

| Capability | Status | Evidence |
|---|---|---|
| Asset lifecycle (acquire→capitalize→depreciate→transfer→dispose) | EXISTING | Single engine, all posts through `postJournalEntry()` |
| Asset Register | EXISTING | Correct, includes historical Disposed assets by design |
| Asset Register ↔ GL reconciliation | EXISTING | Correctly excludes Disposed/Purchased from "on books" sum |
| Fixed Asset SoD (creator≠capitalizer/disposer) | **ABSENT — re-confirmed, unchanged open item** | No identity check anywhere in the lifecycle |
| Account 1400 dedicated to Fixed Assets (not shared with Inventory) | EXISTING — **corrects a discrepancy in the prior audit document** | See Asset Audit §2 |

## Summary

| Status | Domains |
|---|---|
| EXISTING (fully) | Finance & Accounting |
| PARTIAL | Controlling, Treasury, Asset Management (each for specific, named reasons above) |
| ABSENT (within a PARTIAL domain) | Profit Centre transaction usage, Cost allocation |
| DUPLICATE / CONFLICTING | **None found** — re-confirmed across all 4 domains this pass |

No domain classified from menu presence alone — every row cites a real function, test, or documented
code comment.
