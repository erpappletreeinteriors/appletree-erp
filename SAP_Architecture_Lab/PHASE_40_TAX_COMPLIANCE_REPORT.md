# PHASE 40 — Tax Compliance Report

**Date:** 2026-09-13. Temporary/demo tax data only — no real GSTIN, PAN, or company tax
identifiers were used anywhere this phase.

## Trace: source document → tax calculation → journal entry → tax report

Live, browser-driven (Matrix area B/C): Customer Invoice ₹25,000 + GST18 → tax calculated as
₹4,500 (18% split, embedded in the invoice's own GL lines) → journal entry `JE-0001` posted with
account `2200` (Output Tax Payable) credited ₹4,500 → Reconciliation screen showed `Output Tax
(source vs. control 2200): ₹4,500.00 / ₹4,500.00 ✅`. Same trace repeated for Input Tax on the
Supplier Bills (₹3,024 + ₹2,016 = ₹5,040, matched exactly at UAT-C11). **No tax amount was silently
lost at any step of either trace.**

## GSTIN / place of supply / tax classification

Not independently re-verified this phase (no new customer/vendor master data was created with a
GSTIN this phase — all transactions used existing seeded parties). The system's own Compliance
Dashboard (Matrix UAT-J2) explicitly and honestly discloses `"Real Company GSTIN not yet supplied"`
and `"Company registered state not yet supplied"` as open configuration items — this is the system
correctly disclosing a real gap, not this report inventing one.

## TDS

Live, browser-driven (Matrix UAT-J1): TDS Reporting screen renders correctly with an honest
zero-state (`₹0.00 total deducted`) — no payment made this phase crossed a TDS category threshold.
The screen's own text discloses `"Rates/thresholds are the Finance SOP's own stated values — not
independently verified as current tax law. Tax/Legal review required before relying on this for
filing"` — an appropriate, pre-existing disclaimer, not something this phase needs to re-litigate.

## E-way Bill / APOB

Not exercised this phase in a tax-filing sense; APOB itself was live-tested in the Job Work chain
(Matrix area G) for its real business-control purpose (gating Direct Dispatch from an unregistered
job worker) — that mechanism is unrelated to E-way Bill generation, which the Compliance Dashboard
shows at `0` (none generated, consistent with no qualifying dispatch this phase).

## Verdict

Every tax amount actually generated this phase (Output Tax on 1 invoice, Input Tax on 2 bills)
traced exactly from source document through to the reconciliation screen, with zero unexplained
variance. Real, disclosed configuration gaps (GSTIN, registered state) are pre-existing and honestly
surfaced by the system itself, not concealed.
