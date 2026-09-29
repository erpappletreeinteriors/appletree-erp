# PHASE 38 — Tax Traceability Report

**Date:** 2026-09-11. Live-verified plus forensic code trace, drawing on Phase 37's own tax
terminology audit (which already catalogued GST/CGST/SGST/IGST/HSN/SAC/TDS/ITC usage in detail —
not re-duplicated here) and this phase's own live postings.

## Source document → tax determination → GL → report, live-traced

Every Customer Invoice and Supplier Bill posted during this phase's E2E run used `taxCode:'GST18'`
(9% CGST + 9% SGST intra-state split, per the seeded tax-code table — `domain.js:251`:
`{code:'GST18', label:'GST 18% (9% CGST + 9% SGST)', cgstPct:9, sgstPct:9, igstPct:0}`). Live
verified:

- **Output tax** (customer-side): subledger total ₹41,759.10 reconciles exactly to the Output Tax
  control account (2200) — see `PHASE38_AR_AP_RECONCILIATION.md`.
- **Input tax** (supplier-side): subledger total ₹25,200.00 reconciles exactly to the Input Tax
  control account (1300).
- Both figures were independently cross-checked against the known base amounts posted this phase
  (e.g. Bill #1's ₹84,000 base × 18% = ₹15,120 input tax, consistent with the accumulated total once
  every bill/invoice this phase's activity posted is summed) — not merely accepted from the API.

## Tax configuration — not silently duplicated

The tax-code table (`domain.js:249-253`, `GST5`/`GST12`/`GST18` etc.) is a single seeded array,
referenced by `taxCode` on every invoice/bill creation call — confirmed via the forensic
accounting-engine trace that `postJournalEntry()` and its callers derive the tax line amount from
this one table, not a re-implemented rate calculation per caller. No report was found (in this
phase's scope) that independently recalculates a tax rate rather than reading the posted tax GL
line — the reconciliation checks above specifically exist to catch that class of defect and found
none.

## India-specific terms — statutory distinction preserved, not conflated with SAP terminology

Per Phase 37's own audit (not re-litigated here): GSTIN, PAN, HSN, SAC, TDS, E-way Bill, APOB are
all genuine Indian statutory concepts, correctly modeled as such (e.g. Job Worker's `gstin`/`pan`/
`registered` fields feed real compliance gates — `directDispatchFromJobWorker` blocks a direct
customer dispatch from an unregistered job worker with no active APOB declaration on file).

## What was NOT live-tested this phase

- **TDS** — no TDS-bearing transaction (e.g. a professional-fee Supplier Bill crossing the TDS
  threshold) was posted this phase; the TDS Payable account (2300) and its reconciliation were not
  exercised. Confirmed to exist as a real, GL-connected mechanism via Phase 37's own trace
  (`domain.js:185-189` TDS-at-source comment, account 2300), not re-verified live here.
- **ITC Reversal** — `reverseITCForWriteOff()` is a real `postJournalEntry()` call site (confirmed
  in the accounting-engine trace) but was not live-exercised this phase (no damage/write-off
  transaction was posted).
- **E-way Bill** — the `EWB` document type and `createEwayBillRecord()` function are confirmed real
  via code trace; not live-created this phase.
- **SAC (Services Accounting Code)** — per Phase 37's finding, this remains a business-scope
  question (does Appletree's billable service work require SAC coding distinct from HSN?), not a
  code defect — carried forward unchanged, not re-litigated this phase.

## Conclusion

For the tax activity actually generated this phase (18% GST, both intra-state split components, on
both AR and AP sides), the full source→determination→GL→reconciliation chain was live-proven to
balance exactly, with no evidence of a duplicated or independently-calculated tax figure anywhere in
the reporting layer. TDS, ITC Reversal, and E-way Bill were not live-exercised this phase — disclosed
as NOT TESTED rather than assumed clean.

**This report does not, and cannot, independently certify statutory tax-law correctness** — it
certifies that the SOP-configured tax logic flows through the system consistently and reconciles,
which is a different and narrower claim.
