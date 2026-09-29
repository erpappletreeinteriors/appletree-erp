# PHASE 40 — Fixed Asset Report

**Date:** 2026-09-13. Full detail: `PHASE_40_BROWSER_UAT_MATRIX.md` area H. This phase extends
Phase 39's browser pass (which stopped at capitalization) to the complete lifecycle.

## What was proven, live, through the browser — full lifecycle

Asset registered (₹2,40,000) → Capitalized (Bank-funded, 24mo, StraightLine, residual ₹24,000) →
**Depreciation period 1** (Jan, prorated: capitalized the 15th of a 31-day month) → **Depreciation
period 2** (Feb, full month) → **Transfer** (location/custodian/reason) → **Disposal** (proceeds
₹2,00,000, a loss) → **Register/GL reconciliation**.

## Depreciation — independently recomputed, not assumed

Full monthly charge = (240,000 − 24,000) / 24 = ₹9,000.
- Period 1 (17 of 31 days remaining from the 15th): expected `9,000 × 17/31 = ₹4,935.48` —
  **live-confirmed exact match** (Accum. Depr. showed ₹4,935.48).
- Period 2 (full month): expected exactly ₹9,000 more — **live-confirmed** (₹13,935.48 total,
  +₹9,000 exactly).

## Transfer

Posted with no error; independently confirmed via the real Audit Log screen:
`FixedAssetTransferred ... "Phase 40 UAT — relocation test"` — the exact reason text typed into the
form, proving the audit trail captures real free-text input, not a generic placeholder.

## Disposal and register/GL reconciliation

NBV at disposal: ₹2,26,064.52 (₹2,40,000 − ₹13,935.48). Disposed for ₹2,00,000 proceeds (a loss).
Post-disposal, the Reconciliation panel on the same screen showed: `Register Cost / GL Cost (1400):
₹0.00 / ₹0.00 ✅`, `Register Accum. Depr. / GL (1450): ₹0.00 / ₹0.00 ✅` — both correctly zeroed
(the disposed asset removed its full cost and accumulated depreciation from the books and correctly
fell out of the "on books" register), live-verified through the real reconciliation button on the
real screen, not inferred from the API alone.

## Verdict

Net Book Value = Cost − Accumulated Depreciation held exactly at every checkpoint. Multi-period
depreciation and proration are both live-proven correct. The full lifecycle — the gap Phase 39's own
browser pass left open — is now closed.
