# PHASE 41 — Gap Register

**Date:** 2026-09-13. Classifies each of Phase 40's 3 named remaining coverage items per Section 3's
5-way scheme.

| # | Item | Classification | Disposition |
|---|---|---|---|
| 1 | Viewer role not exercised | **A. PROVEN AND CLOSED** | Full browser + API negative-test pass this phase — see `PHASE_41_VIEWER_UAT.md` |
| 2 | Lead→Estimation→Costing→Quotation not exercised through browser | **A. PROVEN AND CLOSED** (with 1 real defect found and fixed along the way) | Full real browser chain, Lead→Won→Project, see `PHASE_41_ESTIMATION_QUOTATION_UAT.md`; DEF-P41-01 fixed |
| 3 | Backup/Restore has no UI | **D. FEATURE NOT REQUIRED FOR A-GRADE** (mechanism itself: **A. PROVEN AND CLOSED** as an existing operational capability) | Full round-trip proven via API on the disposable instance — see `PHASE_41_BACKUP_RESTORE_AUDIT.md`. No UI built, per Section 10's explicit instruction not to build one merely to satisfy a checklist. |

## Detail

### Item 1 — Viewer role
Closed with real evidence: browser-rendered screens (Dashboard, Trial Balance, Project 360) confirmed
correct and complete; 10 prohibited actions attempted via direct API (all blocked); 1 prohibited
action attempted via a real, non-hidden, rendered UI button click (blocked server-side, not merely
hidden). See Section 4 requirements — all met.

### Item 2 — Lead→Estimation→Quotation
Closed with a complete, real, multi-role browser chain: Lead→Estimation Request→Costing Version
(cost independently verified exact)→Quotation (price independently verified exact)→Submit→
Approve Discount (with a real SoD negative test)→Record Acceptance→Won→Project+Customer created
with full source-reference FKs preserved→Customer Invoice raised against the new project→posted,
GL exact. Along the way, a genuine cross-reference integrity defect (DEF-P41-01) was found, fixed,
and re-verified — see `PHASE_41_ESTIMATION_QUOTATION_UAT.md` and `PHASE_41_DEFECT_REGISTER.md`.

### Item 3 — Backup/Restore
The mechanism itself (not "the UI for it") is what Section 13 asks to be classified. Inspection
(recorded in `PHASE_41_BASELINE.md`) found a mature, already-tested (rejection paths, since Phase 39)
mechanism: SHA-256 checksummed, schema-validated, Admin/CEO-only, fully audited. This phase performed
the one thing not yet tested — the successful backup→alter→restore round trip — and it worked
exactly as designed, live, with the original state returning exactly. Per Section 13's own decision
tree, this is case **A** for the mechanism ("fully works and is controlled: CLOSE GAP") combined with
case **B** for the UI question ("works but lacks UI: DO NOT automatically classify as defect... record
as architectural/admin-operational capability"). No code was written to build a UI, consistent with
Section 10's explicit instruction.

## No findings silently eliminated

All 3 items are individually disposed above with evidence, not assumed closed. One new defect
(DEF-P41-01) was found in the course of closing item 2 and is tracked separately in
`PHASE_41_DEFECT_REGISTER.md` — finding it does not reopen item 2's own classification, since it was
found, fixed, and re-verified within this same phase.
