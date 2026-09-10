# PHASE 33 — APPLETREE FINANCE SOP COMPLIANCE & CONTROL IMPLEMENTATION
## Final Report

**Source of truth:** `Apple_Tree_SOP_Sent.docx` — Apple Tree Pvt Ltd's real Finance Team SOP (GST, TDS, Cash Compliance, Material Procurement, Material Issues, Payment Control, Goods Movement, Site Material Control, Vendor Payments, Petty Cash, Reconciliation, Approval/Segregation of Duties).

**Scope reminder:** SAP_Architecture_Lab only. Online ERP, offline ERP, and every prior phase's frozen checkpoint are untouched. Only temporary/demo data was used anywhere in this phase. The one central accounting engine (`postJournalEntry()`) is unchanged in identity — `grep -c "DB.journalEntries.push"` remains **1**.

---

## 1. What this phase found

The SOP describes real, specific controls that genuinely did not exist anywhere in the Lab before this phase: a Purchase Requisition layer, cash-payment ceilings, a TDS engine, a site-level material subledger (material physically at a site vs. consumed), weighment/variance controls, three-way-match enforcement *at payment* (not just at bill creation), payment maker-checker, and petty cash/imprest. Roughly a quarter of the SOP's requirements already had real, working equivalents in the Phase 32 build (GST tax codes with CGST/SGST/IGST splitting, three-way match at bill creation, GRN tolerance, bank reconciliation, financial period control). The rest were genuine gaps, not paperwork gaps — the compliance matrix and gap register (below) worked through all of it before any code was written.

## 2. Deliverables from this phase

| File | Status |
|---|---|
| `PHASE33_CHECKPOINT/` | Taken before any change; checksums confirmed to match the exact Phase 32 end-state |
| [PHASE33_SOP_COMPLIANCE_MATRIX.md](PHASE33_SOP_COMPLIANCE_MATRIX.md) | Complete — every SOP requirement classified PASS/PARTIAL/GAP/CONFLICT/CONFIGURATION REQUIRED/BUSINESS DECISION REQUIRED/REAL-WORLD DEPENDENCY/TAX-LEGAL REVIEW |
| [PHASE33_SOP_GAP_REGISTER.md](PHASE33_SOP_GAP_REGISTER.md) | Complete — 26 gaps, A–G classified, with an explicit build/defer disposition for each |
| `server/domain.js` | Extended — new functions, new account, new doc types, new roles, all additive |
| `server/server.js` | Extended — new API routes for every new capability |
| `server/phase33_sop_compliance_tests.js` | New permanent live test suite — 55/55 passing |
| This report | You are reading it |

## 3. What was built (mapped to the Gap Register)

All of these are real functions in `domain.js`, exercised by real HTTP calls through `server.js`, verified against independently hand-computed expected values — not "returns ok:true" checks.

- **Sites master** (`createSite`, `listSites`, `setSiteActive`) — the site-level dimension every other new control hangs off.
- **Company GST Configuration** (`setCompanyGSTConfig`) — new-GSTIN / old-GSTIN fields, rejects the new GSTIN being set equal to the old one (SOP §2.1), starts empty (CONFIGURATION REQUIRED until Appletree supplies the real value).
- **Place of Supply determination** (`determinePlaceOfSupply`, `setCustomerState`) — advisory INTRA_STATE/INTER_STATE determination comparing the configured company state against the customer's or installation site's state, closing the gap of nothing telling the user which of the existing CGST+SGST vs. IGST tax codes to pick.
- **Purchase Requisition** (`createPurchaseRequisition` → submit → approve/reject) + a **configurable** gate on `createPurchaseOrder()` requiring an approved PR reference unless the SOP's own site-petty exception applies. **Ships OFF by default** — see §6 below.
- **Cash Payment Limit engine** (`checkCashLimit`, wired into `postSupplierPayment`/`postCustomerReceipt`/petty cash vouchers) — the SOP's exact ₹10,000/₹35,000/₹20,000/₹2,00,000 figures, with an authorized-override-and-audit-trail escape hatch (`cashControlExceptions`), triggering **only** when a transaction is genuinely tagged Cash.
- **Seller-wise cumulative purchase tracking** (`sellerCumulativePurchases`, `sellerCumulativeReport`) — FY-scoped, GL-derived, feeding the Section 194Q flag.
- **TDS engine** (`computeTDS`, wired as an opt-in parameter on `postSupplierPayment`) — all six SOP categories (goods/contractor-job-work/transport/professional/rent/commission), posts the deduction to the new **2300 TDS Payable** liability account through the one existing posting engine, carries an explicit "SOP-sourced, not independently verified tax law, Tax/Legal review required" disclaimer on every response.
- **Weighment/variance gate on GRN** — additive optional fields on each GRN line; a variance beyond the configured tolerance produces an "EXCEPTION — INVESTIGATION REQUIRED" block until an authorized override reason is recorded.
- **Site Material Subledger** — the single largest build: `createSiteMaterialRequisition` → submit → approve (threshold-routed to Site In-charge vs. Purchase/Finance/CEO/Admin) → `issueToSite` (Central Store issue against the approved MRS, generates a Delivery Challan capturing transporter/vehicle) → `createSiteMaterialReceipt` (site-side confirmation, records discrepancy) → `createMaterialIssue({siteId})` (Site Consumption — the actual cost-recognition event, reusing the *identical* GL-posting block and BOM-quota logic as ordinary warehouse issues) → `siteMaterialReconciliationReport`. Modeled as an additive `siteId` dimension plus two new movement types (`SiteReceipt`/`SiteConsumption`) on the *existing* single inventory ledger — confirmed safe because the warehouse-scoped `getStockLevel()` silently ignores both.
- **Three-way-match re-verification at payment** — `postSupplierPayment()` now re-checks a PO-linked bill's match/exception status before releasing payment (defense-in-depth; see §7 for why this never fires against current data, and the disclosed limit of this fix).
- **Payment maker-checker** (`createPaymentRequest` → `approvePaymentRequest` → `executePaymentRequest`) — a genuinely separate third-person execution step, layered on top of (not replacing) the existing `postSupplierPayment()`.
- **Petty Cash / Imprest** (`createPettyCashFloat`, `recordPettyCashVoucher`, `pettyCashReconciliation`, `replenishPettyCashFloat`) — fixed float, mandatory original-bill reference on every voucher, still subject to the cash-limit engine (the SOP's own "the float creates no exception").
- **SOP Compliance Dashboard** (`sopComplianceDashboard`) — live aggregation, not static placeholders.
- **New role**: `SiteInCharge` — view/create/edit/submit only, no approve/post/pay/masterData, matching the SOP's own description of that authority.
- **New GL account**: `2300 TDS Payable`. **New doc types**: `PR`/`MRS`/`DC`/`SMR`/`PCV`/`PCF`. All added to both the base SEED and the runtime migration guard (the discipline this engagement had to establish the hard way once before, in Phase 28).

## 4. Test results

- **Phase 33 live suite** (`phase33_sop_compliance_tests.js`): **55/55 passing** — every scenario asserts an independently hand-computed expected value (e.g., ₹500 TDS = ₹50,000 × 1%; site stock 10 − 4 = 6; expected petty cash on hand ₹10,000 − ₹2,000 = ₹8,000), not just "the call returned ok."
- **Full existing regression suite**, run twice (once before the `server.js` route additions, once after): **all 52 pre-existing test files reported zero failures in their own internal PASS/FAIL assertions**, both times. One script (`phase16_volume_topup.js`) crashed on both runs — root-caused by reading its source: it depends on 100+ `PRJ-0xxx` projects that three OTHER volume-generator scripts create, and it must run strictly after them in the same unreset session. My batch ran files in alphabetical order, so that dependency chain wasn't honored — this is an artifact of *how I invoked the scripts this session*, not a Phase 33 code defect. Confirmed via source inspection, not assumed.
- **Backward compatibility**: every modification to an existing function (`createPurchaseOrder`, `createGRN`, `postSupplierPayment`, `postCustomerReceipt`, `createMaterialIssue`, `postInventoryMovement`) is either (a) gated behind a new optional parameter that every existing caller omits, or (b) gated behind a configuration flag that **defaults to the pre-Phase-33 behavior**. No existing call site's behavior changed.

## 5. The Architecture Rule — verified, not assumed

```
grep -c "DB.journalEntries.push" server/domain.js  →  1
```
Every new financial event in this phase — TDS deduction, petty cash replenishment, maker-checker payment execution — reaches the ledger exclusively through the one existing `postJournalEntry()` call inside `postSupplierPayment()` or a direct, single, unchanged pattern. No second GL, AP, AR, inventory, or tax engine was created. The site material subledger is not a second inventory system — it is two new movement *types* and one new dimension (`siteId`) on the single existing `inventoryMovements` ledger.

## 6. Deliberately NOT enforced by default — and why

Two of the largest new controls ship **configurable, defaulting to OFF/current-behavior**, rather than silently becoming mandatory the moment this code merges:

- **`purchaseApprovalConfig.requirePRForPO`** (default `false`). Making a Purchase Requisition mandatory before every PO is a genuine **business process change** for Appletree's purchasing operations, not just a code deployment — flipping it on is Appletree Finance's decision to make, with real operational lead time (staff need to know a PR now exists and is required). The gate is fully built and fully tested (see the Phase 33 suite's "PR→PO Gate" section) — it is simply not switched on unilaterally by this phase.
- **`paymentApprovalMatrix`** — built exactly as the SOP's own illustrative tiers (≤₹5,000 Accountant / ≤₹1,00,000 Purchase Head / above Director), with `finalised: false` **hardcoded to false** and un-settable to `true` through the API — because the SOP's own text calls this table "To Be Finalised... calibrate to Board-approved DOA." This phase does not pretend that decision has been made.

Both are visible on the SOP Compliance Dashboard as unfinalized, not hidden.

## 7. Disclosed tension — BUSINESS DECISION REQUIRED

The SOP states three-way match "is MANDATORY before ANY vendor payment." Read literally, this would block every non-goods vendor payment — rent, professional fees, transport, commission — because a service has no GRN concept to match against; there is nothing to three-way-match. This phase did **not** invent a resolution to that tension on its own authority (that would be independently deciding tax/business policy, which the brief explicitly forbids). Instead:
- `postSupplierPayment()` now re-verifies match status for a PO-linked bill (defense-in-depth; by construction this never blocks anything today, since a PO-linked bill can only reach "posted" already having passed match or having a recorded exception).
- A bill with no PO reference is **unaffected** — three-way match is structurally inapplicable to it.
- This is recorded in `PHASE33_SOP_COMPLIANCE_MATRIX.md` as **BUSINESS DECISION REQUIRED**, not silently resolved in either direction.

## 8. Explicitly deferred (Gap Register classes F/G, disclosed not built)

- **Full job-work/APOB module** — job-worker master, multi-hop delivery challan chains, APOB declarations (SOP §2.2/Section 143). A materially separate subsystem; not attempted this phase given everything else already committed to.
- **Ship-to GSTIN mandatory field** (effective 1 Aug 2026, i.e. now) — depends on the job-work module above; deferred with it.
- **A distinct BOQ object** — the existing BOM-vs-actual variance tooling from Phase 28/32 already covers consumption-variance analysis; a separate BOQ concept is additional scope, not requested elsewhere in this engagement.
- **Real government e-way-bill API integration** — out of scope for any Lab; manual-entry tracking fields exist, no API integration is claimed.
- **TDS/cash-limit exact rates** — implemented exactly as the SOP states them. Flagged, per the brief's own Part 50, as SOP-sourced values requiring independent Tax/Legal verification before being relied on for actual filing.
- **Real GSTIN, PAN, bank accounts, vendor/customer classifications, opening balances** — never invented; see the Real-World Configuration Checklist below.

## 9. Existing conflict — documented, not silently resolved

The Lab's pre-existing PO approval thresholds (from an earlier, unrelated BOS §1.6 policy) do not match this SOP's stated ₹25,000 centralized-purchase threshold. This phase does not silently override one with the other — it is recorded as a CONFLICT in the compliance matrix for Appletree to reconcile.

## 10. Real-World Configuration Checklist (nothing on this list was invented)

- [ ] Apple Tree Pvt Ltd's actual new GSTIN, and the erstwhile firm's old GSTIN (for the reuse-prevention check to mean anything)
- [ ] Company's registered state (for Place of Supply determination)
- [ ] Confirmation of whether preceding-FY turnover exceeded ₹10 crore (gates Section 194Q goods TDS)
- [ ] Real vendor PAN, individual/HUF-vs-other classification, transporter carriage-count declarations (feeds TDS rate selection)
- [ ] Real customer/site state values (feeds Place of Supply)
- [ ] Real bank/cash account list with a genuine Cash-category account created (none exists in the seed data — `isCashPayment()` is fully functional but has nothing to detect until one exists)
- [ ] Board-approved Payment Approval Matrix (the SOP's own tiers are illustrative only)
- [ ] Decision on `requirePRForPO` and on reconciling the PO-threshold conflict in §9
- [ ] Independent Tax/Legal sign-off on every TDS rate/threshold before real filing

## 11. Verdict

**B — SOP-compliant, ready for real Appletree Finance Team UAT, with clearly disclosed non-blocking items** (the deferred job-work/APOB module, the two business decisions in §6, the tension in §7, and the real-world configuration checklist in §10 — none of which are silent, none of which block a UAT pass on what was built).

This matches the brief's own three-way verdict scale and reflects that every genuinely built control is tested and working, while a bounded, disclosed set of the largest and most speculative items were deferred rather than half-built.

## 12. Stop condition

Per the brief: **this build is frozen here.** No Phase 34 is started automatically. The next step is real Apple Tree Finance Team UAT against this phase's build, using the checklist in §10 to supply real configuration values as they become available.
