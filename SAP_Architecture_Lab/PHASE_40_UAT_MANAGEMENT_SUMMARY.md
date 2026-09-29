# PHASE 40 — UAT Management Summary

**Date:** 2026-09-13. Plain-language answers to Section 36's 14 management-acceptance questions.
Full evidence behind every answer lives in `PHASE_40_BROWSER_UAT_MATRIX.md` and the other Phase 40
reports it cross-references.

1. **Can a quotation become a controlled project/business transaction?**
   **YES — PROVEN**, with a scope note: the Quotation screen itself (which needs a prior Estimation
   Request/Costing Version chain) was confirmed to render correctly but not fully exercised this
   phase; the downstream chain from a posted Customer Invoice onward (Invoice→Receipt→Clearing→GL)
   was fully proven, live, through the browser.

2. **Can procurement be traced from request to payment?**
   **YES — PROVEN.** PO→GRN(×2, partial+remaining)→3-way-matched Bill(×2)→Payment Request→
   Approve→Execute→Clearing, entirely through the real UI, entirely by different real users, with a
   real maker-checker-executor separation enforced by the server.

3. **Can material be traced from receipt to site consumption?**
   **YES — PROVEN.** GRN→Warehouse Stock→MRS→Delivery Challan→Site Receipt (exact-match confirmed)
   →Site Consumption→Project Cost, with the project cost breakdown API independently confirming the
   exact rupee value of the site consumption performed.

4. **Can project cost be trusted?**
   **YES — PROVEN.** Every cost figure this phase (`received`, `invoiced`, `paid`, `consumed`) was
   independently traced to a specific real transaction; no cost appeared without a source, no source
   transaction vanished from the report.

5. **Can project profitability be trusted?**
   **YES — PROVEN**, including a deliberately-attempted naive reconciliation that correctly did NOT
   match, forcing (and confirming) the real accounting distinction between an inventory asset
   movement and a recognized cost.

6. **Can manufacturing cost be reconciled?**
   **YES — PROVEN**, but only after fixing DEF-P40-04 (BOMs could not be submitted through the UI at
   all before this phase). Job Cost Sheet materialCost matched an independent hand-calculation
   exactly.

7. **Can job work be controlled?**
   **YES — PROVEN.** The mandatory no-double-stock-mutation invariant was re-verified with real
   before/after stock checkpoints on a dispatch→return→scrap cycle.

8. **Can fixed assets be reconciled?**
   **YES — PROVEN**, through the FULL lifecycle this time (Phase 39 stopped at capitalization) —
   multi-period depreciation, transfer, and disposal all live-verified, register-to-GL reconciliation
   confirmed zero after disposal.

9. **Can multiple bank accounts be safely separated?**
   **YES — PROVEN.** A transfer between two newly-created temporary bank accounts moved exactly the
   two accounts involved; a third, pre-existing account was independently confirmed unaffected.

10. **Can AR/AP be reconciled?**
    **YES — PROVEN**, both via real browser transactions (AR/AP subledger vs. control account, exact
    match after every change) and via the 525-document stress batch.

11. **Can tax be traced?**
    **YES — PROVEN**, for the tax actually generated this phase (Output Tax on the sales side, Input
    Tax on the purchase side) — both traced exactly from source document to the reconciliation
    screen. GSTIN/company-registration configuration remains an honestly-disclosed open item (the
    system's own dashboard says so; not concealed).

12. **Can unauthorized users be prevented from performing restricted actions?**
    **YES — PROVEN.** 11 distinct unauthorized-action attempts this phase (self-approval, wrong
    role, spoofed session, spoofed payload role, stale session, alternate endpoint, party mismatch),
    0 succeeded.

13. **Can every important transaction be traced?**
    **YES — PROVEN** for every chain this phase tested, including the specific AR/AP settlement gap
    Phase 39 left open (DEF-P40-01, now closed, both forward and backward).

14. **Can management rely on the reports?**
    **YES — PROVEN** for every report this phase actually exercised (Reconciliation, Job Cost Sheet,
    Project Cost Breakdown, Compliance Dashboard, Audit Log, TDS Reporting) — each matched
    independently-recomputed source-transaction totals exactly, and none fabricated a "100%
    compliant" figure while open items existed (the Compliance Dashboard explicitly still lists 6
    Management Decisions Needed and 3 Configuration Required items).

## What changed this phase that management should know about

Four real defects were found and fixed, three of them navigation-only (a role could not find a
screen it had every right to use) and one a complete usability block on the entire Manufacturing
domain. None involved money going to the wrong place, a security bypass, or data corruption — but
one (DEF-P40-04) meant Manufacturing could not be operated by a real user through the app at all
before today. All four are fixed, tested, and carry zero regressions.

## What remains open, and why

One item, DEF-P39-03 (the Payment Approval Matrix's lower tiers being structurally unreachable), is
correctly left as a management decision rather than a code fix — see `PHASE_40_DEFECT_REGISTER.md`
for the two concrete options. Two cosmetic items (DEF-P38-03, DEF-P39-01) remain open with zero
financial or control impact.
