# PHASE 33 — SOP GAP REGISTER

Classification: **A** must fix before Accountant UAT · **B** must fix before production · **C** Management/Finance decision · **D** Configuration required · **E** Real-world dependency · **F** Tax/Legal review · **G** Future enhancement.

| # | Gap | Class | This Phase's Disposition |
|---|---|---|---|
| 1 | No Purchase Requisition (PR) layer before PO | A | **BUILT this phase** |
| 2 | No cash-payment limit controls (₹10k/₹35k/₹20k/₹2L) | A | **BUILT this phase** |
| 3 | No seller-wise cumulative ₹50L tracking / 194Q flag | A | **BUILT this phase** |
| 4 | No TDS engine | A | **BUILT this phase** (rates/thresholds are the SOP's own stated values — see Gap 24, F) |
| 5 | No company GSTIN concept; old-GSTIN reuse not preventable | A (structure) / E (real value) | **Structure BUILT this phase** (config field, starts empty); real GSTIN is Appletree's to supply |
| 6 | HSN code never populated on any material | D | Field already exists (Phase 19) — populating real HSN codes is Appletree's own data-entry task, not a code gap |
| 7 | No Place of Supply / same-state-vs-different-state auto CGST+SGST-vs-IGST logic | A | **BUILT this phase** |
| 8 | No weighment/dual-measurement/variance-tolerance gate on GRN | A | **BUILT this phase** |
| 9 | No site-level material subledger (material at site vs. consumed) | A | **BUILT this phase** — the single largest item: MRS → Delivery Challan → Site Receipt → Site Stock → Consumption |
| 10 | No Delivery Challan document type distinct from Dispatch | A | **BUILT this phase** (as part of Gap 9) |
| 11 | No Gate Pass / transporter-vehicle capture on central store issue | A | **BUILT this phase** (as part of Gap 9) |
| 12 | Three-way match not enforced at the PAYMENT step itself (only at bill-creation) | A | **BUILT this phase** — payment now checks the paid invoice's match status |
| 13 | No maker-checker for payment execution (separate from Draft SoD) | A | **BUILT this phase** |
| 14 | Payment approval matrix (₹5,000/₹1,00,000/Director) explicitly "To Be Finalised" in the SOP itself | C | **NOT hardcoded** — built as configurable rules, defaulting to the SOP's own illustrative tiers with an explicit "NOT FINALISED" flag, per the SOP's own instruction |
| 15 | Existing PO approval threshold (BOS §1.6-derived) conflicts with the SOP's ₹25,000 centralized-purchase threshold | C | **DOCUMENTED, not silently changed** — flagged for Appletree to reconcile which policy governs |
| 16 | No site-scoped Purchase role/daily-cap/weekly-report for the ₹5,000/day petty exception | A | **BUILT this phase** (as part of Gap 1/9) |
| 17 | No petty-cash/imprest module | A | **BUILT this phase** |
| 18 | No BOQ concept (distinct from BOM) for consumption-variance analysis | G | Deferred — BOM-vs-actual variance already exists from Phase 28/32; a distinct BOQ object is a materially separate build, deferred as a future enhancement |
| 19 | No job-work module (APOB, job-worker delivery challans, return aging, scrap handling) | G | **Deferred** — a genuinely large, separate subsystem (job-worker master, multi-hop challan chain, APOB declarations); not attempted this phase given the scope already committed to above |
| 20 | No e-way bill integration or manual-entry tracking | B | **Manual-entry tracking BUILT this phase** (flag + fields); no government API integration exists or is claimed |
| 21 | Ship-to GSTIN (mandatory from 1 Aug 2026, i.e. now) | G | Depends on Gap 19 (job-work module) being built first — deferred with it |
| 22 | Weekly/Monthly named reconciliation reports (7 reports) | A | **BUILT this phase** (the reports that don't depend on Gap 19) |
| 23 | SOP Compliance Dashboard | A | **BUILT this phase** |
| 24 | TDS/cash-limit exact rates and thresholds | F | Implemented exactly as the SOP states them, with an on-screen disclaimer per Part 50 — not independently verified as current tax law |
| 25 | Company turnover > ₹10Cr preceding FY (194Q eligibility trigger) | E | Configurable flag, defaults to NOT confirmed — Appletree must confirm |
| 26 | Real GSTIN, real PAN, real vendor classifications, real bank accounts, real opening balances | E | Never invented — checklist maintained in the final report |

**Net scope for this phase:** Gaps 1-13, 16, 17, 20 (manual-entry only), 22, 23 — a genuinely large build, but the largest and most speculative items (full job-work/APOB module, BOQ-as-a-distinct-object, government e-way-bill API integration) are explicitly deferred as G/B rather than attempted half-built.
