# PHASE 36 — FINAL SOP + UI + UAT GAP REGISTER

Classification: **A** must fix before Accountant UAT · **B** must fix before production · **C** Management decision · **D** Configuration required · **E** Real-world dependency · **F** Tax/Legal review · **G** Future enhancement.

This supersedes `PHASE35_FINAL_GAP_REGISTER.md` for anything still open.

| # | Item | Class | Status |
|---|---|---|---|
| 1 | GRN Weighment UI (fields, live variance preview, override) | A | **CLOSED this phase** — built and live-tested (within/exact/outside tolerance, unauthorized/authorized override) |
| 2 | Seller Cumulative / 194Q report screen | A | **CLOSED this phase** — real screen with PAN (derived from GSTIN), utilization %, transaction count |
| 3 | Cash Control Exceptions report screen | A | **CLOSED this phase** — real screen with party/type/amount/limit/exceeded-by/status columns and search |
| 4 | Payment Approval Matrix Draft→Review→Approved workflow | C (the decision itself) / A (the workflow mechanism) | **Workflow CLOSED this phase** — CEO/Admin-only approval, requires a real reference, editing tiers resets to Draft. The DECISION to actually approve real company tiers remains open (correctly) |
| 5 | Multi-line Job Work UI | A | **CLOSED this phase** — add/remove lines on dispatch, per-line Return/Scrap/Direct-Dispatch, live-tested with a 2-line order |
| 6 | Dedicated UAT credential set | A | **CLOSED this phase** — 10 `uat_*` users, temporary passwords, 2 mapped to the closest existing role (Store/Factory) with the substitution disclosed, not hidden |
| 7 | UAT/Demo environment banner and indicators | A | **CLOSED this phase** — persistent red banner, "UAT MODE" badge, environment/dataset shown after login |
| 8 | Reset UAT Data exposure | A | **CLOSED this phase** — existing `resetToFreshSeed()` mechanism (verified safe: this environment has no separate production data it could ever touch) exposed as a real, confirmed, Admin-only button |
| 9 | One-Click Demo Scenario | A | **CLOSED this phase** — a real 15-step connected chain (Project→PR→PO→GRN→Bill→Payment maker-checker→Site Material→Consumption→P&L), live-tested end to end, ₹184,800 balanced |
| 10 | Document Flow / Traceability component | A | **CLOSED this phase**, scoped to Project 360 — walks the real reference chain (PR→PO→GRN→Bill→Payment/MRS→DC→SMR→Consumption→JobWork), live-tested |
| 11 | SAP-style Journal Entry screen completeness | A | **VERIFIED, not rebuilt** — the existing Document Workflow/Journal Register screens already carry Series/Number/Date/Remarks/Origin/Project/Branch/References/GL Account/Debit/Credit/Tax/Business Partner/Cost Centre, and Debit=Credit is enforced server-side on every posting |
| 12 | Central engine integrity | B | **VERIFIED, unchanged** — `DB.journalEntries.push` still occurs exactly once |
| 13 | Regression | B | 56 test files, all passing in isolation; see `PHASE36_SELF_TEST_REPORT.md` for the one batch-execution timing artifact investigated and ruled out as a false positive |
| 14 | Payment Approval Matrix real approval | C | **OPEN** — the mechanism exists; whether Appletree's Board actually approves these or different tiers is still Appletree's decision |
| 15 | PO approval threshold conflict | C | **OPEN** — unchanged, see `MANAGEMENT_DECISION_REGISTER.md` #2 |
| 16 | PR-before-PO enforcement | C | **OPEN** — unchanged, ships off by default |
| 17 | Payment-category three-way-match policy | C | **OPEN** — unchanged |
| 18 | Real GSTIN, PAN, bank/cash accounts, vendor/customer/job-worker masters, opening balances | E | **OPEN** — nothing invented, see `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md` |
| 19 | Real Apple Tree Finance Team UAT | E | **NOT PERFORMED** — this phase prepared the environment for it; `21_UAT_SIGNOFF.md` remains blank until real testers complete it |
| 20 | TDS rates/thresholds, cash-limit figures | F | **OPEN** — every occurrence (including the two new report screens) explicitly labeled "SOP CONFIGURATION — NOT INDEPENDENTLY VERIFIED AS CURRENT TAX LAW" |
| 21 | Multi-hop job-work re-dispatch chaining | G | **Deferred**, unchanged since Phase 34 |
| 22 | Real government e-way-bill API integration | G | **Not built, not claimed** — explicitly forbidden by this phase's own brief |
| 23 | Seller Cumulative report's no-PAN fallback ("name+address-wise" per SOP) | D | Derives PAN from GSTIN when present; a vendor with no GSTIN on file shows "Not on record" rather than a fabricated identifier — real name+address-based aggregation for the no-PAN case is a data-entry/reporting refinement, not attempted this phase |
| 24 | Store/Factory role substitution | D | Disclosed, not hidden — `uat_store`/`uat_factory` map to the Purchase role since no distinct Store/Factory role exists in this Lab's role model; a genuine new-role decision if Appletree wants them separated |

## Net summary

Of the 24 items: **10 fully closed this phase** (all genuine, real, browser-tested UI/UAT-environment gaps), 1 verified-not-rebuilt, 1 verified-unchanged, 1 regression status (clean), 4 remain Class C (Management decisions, correctly untouched), 1 Class E (real UAT — cannot be performed by this engagement), 1 Class F (tax/legal), 2 Class G (deliberately deferred), 2 Class D (disclosed configuration/data refinements).
