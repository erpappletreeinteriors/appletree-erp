# UAT Scenario Catalog

**Date:** 2026-09-16. Realistic Appletree Interiors business journeys, grouped per Section 5 of the
authorizing brief. Each scenario states whether it has ALREADY been executed with real evidence this
engagement (cited), or is DEFINED for business users to execute during the UAT cycle itself. Nothing
below is invented — every scenario traces to real, implemented functionality confirmed in
`UAT-SCOPE-MATRIX.csv`.

**Reading key:** `EXECUTED` = real evidence already exists (cited). `DEFINED` = a real, ready screen/
API exists; the scenario itself has not been run by a business user yet — that is what the UAT cycle
is for. This engagement's own standing discipline is to never claim `EXECUTED` without genuine
evidence — see `PHASE_41_FINAL_VERDICT.md`'s own terminology precedent.

---

## GROUP A — LEAD TO QUOTATION

**A1. Full Lead → Estimation → Costing → Quotation → Won → Project chain**
Sales creates a Lead → creates an Estimation Request → Estimator builds a Costing Version →
Sales creates a Quotation → submits (auto-approve if discount ≤5%) → FinanceManager approves if
above threshold → Sales records Acceptance → Won transition creates Project + Customer + Baseline.
**Status: EXECUTED** — `PHASE_41_ESTIMATION_QUOTATION_UAT.md`, full 11-step real browser chain,
cost/price independently verified exact.

**A2. Discount above 5% requires FinanceManager approval; Sales cannot self-approve**
**Status: EXECUTED** — same report, step 6 (blocked) / step 7 (FinanceManager approves).

**A3. Quotation citing a mismatched Lead/Estimation Request/Costing Version is rejected**
**Status: EXECUTED** — DEF-P41-01, found, fixed, re-verified same phase.

**A4. Traceability: a Project's document trace shows its full sales origin (Lead→ER→Costing→Quotation)**
**Status: EXECUTED** — DEF-P41-02, found, fixed, re-verified this session; see
`PHASE_41_TRACEABILITY_REPORT.md`.

---

## GROUP B — PROJECT SETUP

**B1. A Won Quotation creates a real Customer (not a duplicate) and links it to the Project**
**Status: EXECUTED** — `findOrCreateCustomer()` confirmed live, `PHASE_41_ESTIMATION_QUOTATION_UAT.md`.

**B2. Project 360 shows commercial information (budget, approved revenue) matching the Quotation's finalPrice**
**Status: EXECUTED** — same report: `budget` exactly matches `finalPrice`.

**B3. A Project Manager is assigned at Won time and gains scoped authority over that Project**
**Status: DEFINED** — mechanism exists (`isProjectManagerOf()`, Phase 6B/9B); not freshly re-executed
this session. Recommended for the UAT cycle.

---

## GROUP C — PROCUREMENT

**C1. Material Requirement → Purchase Requisition → PO → GRN → Supplier Bill (3-way match) → Payment**
**Status: EXECUTED (volume)** — `erp_phase39_stress_test.js`: 105 Purchase Orders → 105 GRNs → 105
Supplier Bills → 105 Supplier Payments, all clean, Trial Balance/AR/AP/GST reconciled.

**C2. GRN quantity/value reconciles to inventory and the PO's own ordered value**
**Status: EXECUTED** — same stress test's reconciliation block.

**C3. PO approval threshold: FinanceManager required above ₹5,00,000, CEO above ₹20,00,000**
**Status: DEFINED** — thresholds confirmed real (BOS §1.6, cited not invented) and code-enforced;
not freshly re-executed live this session — recommended for the UAT cycle.

---

## GROUP D — MATERIAL TO SITE

**D1. Warehouse → MRS (Material Requisition — Site) → Purchase approves/issues → Delivery Challan → Site Receipt**
**Status: EXECUTED** — live this session as part of CR-2026-001's own verification: real Site,
real MRS (`MRS-0001`), submitted, approved, issued, generating `DC-0001`, then a real Site Receipt
recorded against it.

**D2. Site Consumption is the ONLY event that hits Project Actual Cost**
**Status: DEFINED** — mechanism confirmed by code reading (`createMaterialIssue()`/site-consumption
path); not freshly re-executed this session.

---

## GROUP E — MANUFACTURING (only what actually exists)

**E1. BOM → Production Order → Job Card → Machine assignment**
**Status: EXECUTED** — `erp_phase39_manufacturing_jobwork_tests.js` (36/36), Job Cost Sheet correctly
returns materialCost/labourCost/totalActualCost.

**E2. Job Work dispatch/partial-return/scrap cycle, with warehouse stock net-change exactly correct**
**Status: EXECUTED** — same suite: net stock change across dispatch(10)+return(5)+scrap(5) = exactly
-5, re-confirmed this session with zero regressions from CR-2026-001/DEF-2026-001.

**E3. Direct Dispatch to an unregistered Job Worker requires an active APOB declaration**
**Status: EXECUTED** — same suite, negative control confirmed live.

**OUT OF SCOPE (confirmed absent, not a defect):** Routing, Work Centres, MRP, Sales Order, batch/
serial tracking. See `UAT-KNOWN-LIMITATIONS.md`. Do not test these — they do not exist.

---

## GROUP F — QC

**F1. QC checklist created Pending → submitted all-Pass → status Passed**
**Status: EXECUTED** — `DEF-2026-001-TEST-REPORT.md` Cases 1-3.

**F2. Partial submission (one item still Pending) → status InProgress, correctly grouped with Pending on the Dashboard**
**Status: EXECUTED** — same report, Case 6.

**F3. QC Dashboard shows correct Passed/Failed/Pending counts for a mixed dataset**
**Status: EXECUTED — this is DEF-2026-001's own regression coverage.** 19/19 assertions, including a
deliberate revert-and-rerun proving the test suite genuinely fails (6/19) against the original bug —
see `DEF-2026-001-TEST-REPORT.md` in full. **This scenario group directly satisfies Section 5's own
instruction to "include regression coverage for DEF-2026-001."**

**F4. QC status correctly gates Handover and Project Closure readiness**
**Status: EXECUTED** — `erp_audit_p0_tests.js` ERP-034; `handoverReadinessCheck()`/
`projectClosureReadiness()` both confirmed to read the same canonical `status` field DEF-2026-001
fixed the Dashboard to also read.

---

## GROUP G — INSTALLATION

**G1. Installation marked Completed after QC Passed**
**Status: EXECUTED** — `erp_audit_p0_tests.js` ERP-034 fixture (Installation → QC → Passed sequence).

**G2. Installation readiness correctly fails-closed when no QC record exists yet**
**Status: DEFINED** — the fail-closed fix itself was live-tested in Phase 8's own build; not freshly
re-executed this session. Recommended for the UAT cycle as a negative scenario (see
`UAT-NEGATIVE-TEST-CATALOG.md` N9).

---

## GROUP H — HANDOVER

**H1. Handover succeeds only when Installation Completed + QC Passed + zero open Critical Snags**
**Status: EXECUTED** — `erp_audit_p0_tests.js` ERP-034 Test A: first, legitimate handover on a fully-
ready project succeeds; database shows exactly 1 handover record; audit trail exact.

**H2. Duplicate handover on the same project is rejected — no duplicate record, no duplicate audit entry**
**Status: EXECUTED** — same test, Test B: second attempt rejected; database and audit trail both
confirmed to still show exactly 1 record after the rejected attempt. **This is the Phase 41-era
integrity control Section 5 asks to be re-verified — confirmed intact, unaffected by any change
since.**

---

## GROUP I — BILLING & COLLECTION

**I1. Milestone marked Ready by finance-tier user → Invoice drafted → approved → posted → Customer Receipt → AR Clearing**
**Status: EXECUTED** — `PHASE_41_ESTIMATION_QUOTATION_UAT.md` steps 10-11 (real posted invoice,
₹47,200 exact match); `PHASE_41_TRACEABILITY_REPORT.md` (full AR clearing chain traced).

**I2. Billing does NOT auto-trigger on a dispatch/installation/handover event**
**Status: EXECUTED** — confirmed by design and by the accounting-boundary test (`PHASE_41_
ESTIMATION_QUOTATION_UAT.md` Section 8: zero GL postings from Lead/Estimation/Quotation/Won alone).

---

## GROUP J — SUPPLIER PAYMENT

**J1. Supplier Bill → Payment Request raised → FinanceManager approves → CEO executes → Clearing**
**Status: EXECUTED** — `PHASE39_PAYMENT_APPROVAL_MATRIX_REPORT.md` (18/18), real 3-person
maker-checker-executor separation, CEO/Admin correctly exempted from the 3-person rule by design.

**J2. The same user who raised a Payment Request cannot also approve it (maker-checker SoD)**
**Status: EXECUTED** — same report, explicit negative test.

---

## GROUP K — SERVICE / WARRANTY / AMC

**K1. Handover → Warranty period active → Complaint raised → Service Ticket → Visit → resolution**
**Status: DEFINED** — full chain built and tested in Phase 10's own original build; not freshly
re-executed this session. Recommended for the UAT cycle.

**K2. AMC contract billing routes through the same invoice engine, tagged `amcContractId`**
**Status: DEFINED** — confirmed by code reading this session; not freshly re-executed live.

---

## GROUP L — REPORTING

**L1. Trial Balance: total debit = total credit after a real transaction batch**
**Status: EXECUTED (repeatedly)** — every regression run this engagement re-confirms this, most
recently the 525-document stress test (`erp_phase39_stress_test.js`, 11/11).

**L2. AR/AP subledger reconciles to its GL control account**
**Status: EXECUTED** — same stress test.

**L3. Output/Input GST reconciles to the output-tax/input-tax GL accounts**
**Status: EXECUTED** — same stress test.

**L4. Document numbering remains unique under 525-document load**
**Status: EXECUTED** — 525 vouchers, 525 unique, zero duplicates (`PHASE_41_NUMBERING_REPORT.md`).

**Known limitation:** the full 27+-report catalog is not individually re-verified term-by-term every
phase (disclosed honestly in Phase 42's own audit, finding #8) — see `UAT-KNOWN-LIMITATIONS.md`.

---

## Summary count

| Group | Scenarios | EXECUTED | DEFINED |
|---|---|---|---|
| A — Lead to Quotation | 4 | 4 | 0 |
| B — Project Setup | 3 | 2 | 1 |
| C — Procurement | 3 | 2 | 1 |
| D — Material to Site | 2 | 1 | 1 |
| E — Manufacturing | 3 | 3 | 0 |
| F — QC | 4 | 4 | 0 |
| G — Installation | 2 | 1 | 1 |
| H — Handover | 2 | 2 | 0 |
| I — Billing & Collection | 2 | 2 | 0 |
| J — Supplier Payment | 2 | 2 | 0 |
| K — Service/Warranty/AMC | 2 | 0 | 2 |
| L — Reporting | 4 | 4 | 0 |
| **Total** | **33** | **27** | **6** |

See `UAT-TEST-CASES.csv` for step-level detail and `UAT-TRACEABILITY-MATRIX.csv` for the full
Business Requirement → Module → Screen/API → Scenario → Result → Evidence → Defect/CR chain.
