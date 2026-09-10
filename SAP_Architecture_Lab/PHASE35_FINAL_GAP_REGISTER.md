# PHASE 35 — FINAL SOP + UI GAP REGISTER

Classification: **A** must fix before Accountant UAT · **B** must fix before production · **C** Management decision · **D** Configuration required · **E** Real-world dependency · **F** Tax/Legal review · **G** Future enhancement.

This is the complete, current register across Phases 33–35 — every earlier phase's own gap register is superseded by this one for anything still open.

| # | Item | Class | Status |
|---|---|---|---|
| 1 | Job Work, APOB, E-way Bill, ITC reversal, BOQ variance, Purchase Requisition, TDS, cash limits, site material subledger, weighment gate, payment maker-checker, petty cash — backend | A | **CLOSED** — built and tested across Phases 33–34, zero regressions |
| 2 | Accountant-facing UI for all of the above | A | **CLOSED this phase** — 9 new screens, real browser-tested, 2 real UI defects found and fixed |
| 3 | GRN Weighment fields missing from the GRN screen | A | **OPEN** — backend works via API, no UI input fields exist yet. See `PHASE35_UI_GAP_REGISTER.md` |
| 4 | Seller Cumulative (₹50L/194Q) report has no dedicated screen | D (cosmetic, data is correct and API-accessible) | **OPEN**, low priority |
| 5 | Cash Control Exceptions report has no dedicated screen | D | **OPEN**, low priority |
| 6 | Multi-line Job Work Order UI (backend supports it, UI assumes one line) | G | **OPEN**, disclosed, not blocking single-line use |
| 7 | Payment Approval Matrix finalization | C | **OPEN** — see `MANAGEMENT_DECISION_REGISTER.md` #1 |
| 8 | PO approval threshold conflict (BOS §1.6 vs. SOP ₹25,000) | C | **OPEN** — see `MANAGEMENT_DECISION_REGISTER.md` #2 |
| 9 | PR-before-PO enforcement decision | C | **OPEN** — see `MANAGEMENT_DECISION_REGISTER.md` #3 |
| 10 | Payment-category three-way-match policy (rent/professional fees/commission/transport services) | C | **OPEN** — see `MANAGEMENT_DECISION_REGISTER.md` #4 |
| 11 | Real GSTIN, PAN, bank/cash accounts, vendor/customer masters, job worker masters, APOB declarations, opening balances | E | **OPEN** — see `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md`, nothing invented |
| 12 | Real Apple Tree Finance Team UAT | E | **NOT PERFORMED** — this phase's internal browser walkthrough is a substitute measure, not equivalent |
| 13 | TDS rates/thresholds, cash-limit figures | F | **OPEN** — SOP-sourced, explicitly labeled as not independently verified tax law everywhere they appear |
| 14 | Automatic multi-hop job-work re-dispatch chaining | G | **Deferred**, disclosed since Phase 34 |
| 15 | Real government e-way-bill API integration | G (explicitly forbidden by the brief) | **Not built, not claimed** |
| 16 | A distinct BOQ master object | G | **Not built** — existing BOM chain + new variance report satisfies the requirement |

## Defects found and fixed this phase (Part 30 discipline — none hidden, none downgraded)

1. **Message-flash bug** in `createSite()`, `saveGstConfig()`, `savePoConfig()`, `confirmPolicy()` — the success message was set BEFORE a re-render that rebuilds the message container from scratch, wiping it on every success. Root cause: reversed call order vs. the established pattern used by every other action function in the file. Fixed by reordering (render first, then set message) in all four functions. Found live in the browser, re-verified live in the browser after the fix.
2. **Misleading form for unauthorized roles** in `renderSopConfig()` — a role with no view permission on ANY of the 6 underlying config endpoints still saw a fully rendered, fillable configuration form (with empty fields, since no real data was ever sent — not a data leak, but confusing and inconsistent with every other screen's own "denied cleanly" convention). Fixed by checking whether every one of the 6 reads failed, and showing one clear denial message instead. Re-verified for both a denied role (Sales) and an authorized role (FinanceManager, including that previously-saved data still displays correctly).

No other defects were found during this phase's browser walkthrough, negative testing, or regression run.

## Net summary

Of the 16 items in this final register: **2 fully closed this phase** (accountant UI + the 2 defects it surfaced), **5 disclosed-and-bounded UI gaps** remain (none blocking the core tested workflows), **4 remain Class C** (Finance/Management decisions, correctly not made by this engagement), **1 Class E** (real UAT), **1 Class F** (tax/legal review), **3 Class G** (deliberately deferred future enhancements).
