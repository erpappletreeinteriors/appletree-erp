# PHASE 33 — SOP COMPLIANCE MATRIX

Source: `Apple_Tree_SOP_Sent.docx` ("GST, TDS, Cash Compliance, Material Procurement, Issues and Payment Control Framework"), read in full from its own text. Compared against `SAP_Architecture_Lab` as it stood at the end of Phase 32 (before any Phase 33 change).

**Status key:** PASS / PARTIAL / GAP / CONFLICT / CONFIGURATION REQUIRED / BUSINESS DECISION REQUIRED / REAL-WORLD DEPENDENCY / OUT OF SCOPE.

---

## 1. General Compliance Principles / GST Basics

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| All outward billing must carry GST; invoice raised only from the new (Pvt Ltd) GSTIN; old GST never used | No company GSTIN field exists at all — no "which GSTIN is this company invoicing from" concept anywhere. Tax codes (CGST/SGST/IGST %) exist and ARE applied to Customer Invoices via `taxCode`. | **GAP** (company GSTIN concept) + **PARTIAL** (tax calculation exists, GSTIN display does not) |
| No cash payment > ₹10,000/person/day (₹35,000 for transporters) | No cash-payment limit logic anywhere. Bank/Cash transfers and Supplier Payments have no ceiling checks. | **GAP** |
| TDS on contractor/job-work/transport: 1%/2%, ₹30,000 single-bill or ₹1,00,000/FY aggregate trigger | No TDS concept anywhere in the Lab — no TDS account, no TDS calculation, no threshold tracking. | **GAP** |
| Cash loan/deposit/repayment ≥ ₹20,000/person/annum prohibited (incl. Director payments) | No such control exists. | **GAP** |
| Unregistered-seller purchase needs a Bill of Supply / self-generated voucher with name/address/PAN/Aadhaar-verified contact/qty/rate/village-of-felling | No seller-classification field exists on the Vendor master at all (registered/unregistered/own-cultivation/aggregator). No PAN/Aadhaar field. No "Bill of Supply" document type. | **GAP** |
| TDS @0.1% on goods purchase once a seller crosses ₹50L/FY cumulative (if company turnover > ₹10Cr preceding FY) | No cumulative seller-purchase tracking exists anywhere (PAN-wise or otherwise). | **GAP** |
| Company turnover > ₹10Cr preceding FY (the trigger condition itself) | Real Appletree financial data, never entered into this Lab. | **REAL-WORLD DEPENDENCY** |

## Purchase Documentation Control Points (Section 1 table)

| Control Point | Current ERP Capability | Status |
|---|---|---|
| Centralized purchase > ₹25,000 needs Plant Head/Purchase Manager sign-off | PO approval workflow exists (`requiredPOApprovalRole`) with real ₹-tiered thresholds — but the SPECIFIC ₹25,000/Plant-Head threshold from this SOP is not configured; existing thresholds are the BOS §1.6 ones from a much earlier phase, a DIFFERENT policy document. | **CONFLICT** — an approval threshold already exists, but it is NOT the SOP's threshold. Needs reconciling with Appletree, not silently overridden. |
| Site-level purchase capped ₹5,000/day, Site In-charge sign-off, reported centrally weekly | No "Site" concept exists as a distinct purchasing actor/location at all — Purchase role is company-wide, not site-scoped. No daily cap logic. No weekly site-purchase report. | **GAP** |
| Seller identification (name/address/PAN/Aadhaar/village/own-cultivation-vs-aggregator) on every purchase voucher | Vendor master has name + demo GSTIN only. | **GAP** |
| Weighment: CBM/weight at purchase + second measurement at factory gate, variance tolerance (e.g. 1%) investigated before payment | GRN captures qtyAccepted/qtyRejected only — no dual-measurement, no variance-tolerance gate blocking payment. | **GAP** |
| GRN created once material physically received, signed off by receiver | GRN exists, records `receivedBy`, posts Dr Inventory/Cr GR-IR — this part already works correctly. | **PASS** |
| Payment mode: bank/UPI mandatory beyond cash thresholds | Payment Method master exists (metadata only, per Phase 19's own documented decision) — it does not currently ENFORCE cash-vs-bank based on a threshold. | **PARTIAL** |
| Seller ₹50L threshold triggers Section 194Q automatically | No such tracking exists. | **GAP** |

---

## 2. GST Framework

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| Own distinct GSTIN for the Pvt Ltd, separate from the old partnership firm's | No company GSTIN concept exists. | **GAP** |
| Two-unit (plant + secondary) same-state, same-GSTIN structure | No multi-unit/branch-GSTIN model exists — Branches exist (Phase 14/15) but carry no GSTIN concept. | **GAP** |
| ITC not available on lost/destroyed/written-off/free-sample goods | No ITC-eligibility flag anywhere — Input Tax Recoverable (1300) is posted uniformly, with no exclusion logic for these scenarios. | **GAP** |
| ITC retained on job-worker-held goods within time limits | No job-work tracking exists at all in this Lab. | **GAP** |
| Job-work APOB rule (registered vs unregistered job worker) | No job-work module, no APOB concept. | **GAP** |
| Scrap/waste from job work — tax handled by registered job worker or by Apple Tree if unregistered | No job-work module. | **GAP** |
| Ship-to GSTIN mandatory on e-way bill for job-worker-site dispatches from 1 Aug 2026 | No e-way bill concept, no Ship-to GSTIN field anywhere. **Today's date is within this rule's effective window.** | **GAP** — and time-sensitive |

## 3. TDS Matrix

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| Goods >₹50L/seller/FY: 0.1% (5% capped, no PAN) | No TDS engine. | **GAP** |
| Contractor/job-work: >₹30,000 single or >₹1,00,000/FY: 1%/2% | No TDS engine. | **GAP** |
| Transport: same threshold; Nil with valid PAN + ≤10-carriage declaration | No TDS engine, no transporter-declaration tracking. | **GAP** |
| Professional fees >₹50,000/yr: 10% (2% technical) | No TDS engine. | **GAP** |
| Rent >₹6,00,000/yr: 10% land/building, 2% P&M | No TDS engine. | **GAP** |
| Commission >₹15,000/FY: 5% ("verify current threshold" — SOP's own words) | No TDS engine. | **GAP**, and the SOP itself flags this rate for **TAX REVIEW REQUIRED** |
| All rates/thresholds above | The SOP is explicit these are the Finance SOP's OWN stated values, not independently re-verified tax law by this engagement. | **TAX/LEGAL REVIEW** applies to the whole section per the SOP's own instruction |

## 4. Cash Transaction Limits

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| Cash expenditure >₹10,000/person/day (₹35,000 transporter) | No cash-limit control anywhere. | **GAP** |
| Cash loan/deposit received ≥₹20,000 | No such control. | **GAP** |
| Cash repayment ≥₹20,000 | No such control. | **GAP** |
| Cash receipt ≥₹2,00,000/day/person/event | Customer Receipt has no payment-mode-vs-amount ceiling check. | **GAP** |

## 5. Goods Movement & Documentation

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| Local log purchase → factory: Purchase Voucher/Bill of Supply + weighment + GRN, e-way bill if >₹50,000 | GRN exists; weighment and e-way-bill flag do not. | **PARTIAL** |
| Raw/semi-finished → job worker or client site: Delivery Challan (Rule 55(1)(c)) | Delivery Challan as a distinct document type does not exist. The Lab has "Delivery" (Phase 8, for finished-goods dispatch to customer) which is conceptually different. | **GAP** |
| Job-worker-to-job-worker / job-worker-to-principal movement with referencing challans | No job-work module. | **GAP** |
| Own-stock-point-to-own-stock-point Delivery Challan | No multi-location-with-challan concept — Stock Transfer exists (Phase 28) but is a plain inventory movement, not a GST-relevant challan document. | **PARTIAL** |
| Finished goods → customer from job-worker site, Ship-to GSTIN | No job-work module. | **GAP** |
| Finished goods → customer, Tax Invoice with HSN/GST-rate/place-of-supply | Customer Invoice exists and applies a tax code; HSN is a material-master field that exists but is never populated (`hsnCode:null` for every seeded material); Place of Supply does not exist as a concept anywhere. | **PARTIAL** |
| E-way bill required where movement value > ₹50,000 | No e-way bill concept anywhere. | **GAP** |

## 6. B2C — Client Site Work

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| Goods to client site for install: Delivery Challan, invoice on completion (or at dispatch if pre-invoiced) | The Lab's existing Installation/Handover/Billing-Milestone chain (Phase 8/9) already defers invoicing to a human-marked "Ready" milestone — conceptually similar, but there is no Delivery Challan document distinct from a Dispatch record, and no explicit "supply complete at dispatch vs at completion" toggle. | **PARTIAL** |
| Place of Supply = installation location, not company address; same-state CGST+SGST, different-state IGST | No Place-of-Supply concept; tax codes are manually selected per invoice with no state-comparison logic driving CGST+SGST vs IGST automatically. | **GAP** |
| Client site does NOT automatically become an APOB (distinct from job-work APOB) | No APOB concept exists at all — so also no risk of wrongly treating every install site as one; this is a moot point until job-work/APOB is built at all. | **OUT OF SCOPE until job-work module exists** |

## 7. Centralized Purchase and Issue System (PR → PO → MRS → Site)

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| Purchase Requisition (PR) raised before PO; no PO without a PR reference | **No Purchase Requisition object exists at all.** Material Requirement (Phase 7) is the closest concept but is NOT a PR — it doesn't gate PO creation, and a PO can be created today with zero reference to any prior requirement/requisition. | **GAP** — significant |
| PO is the single reference through GRN/Invoice/Payment | This part already works — PO id threads through GRN and the PO-aware Supplier Bill correctly (Phase 27 fix). | **PASS** |
| Site petty-purchase exception ≤₹5,000/day, reported weekly, retrospectively regularized | No site-scoped purchasing concept, no daily cap, no weekly report. | **GAP** |
| MRS (Material Requisition Slip) raised by Site, approved within threshold or escalated | Material Requirement (Phase 7) is project-scoped, not SITE-scoped, and has no daily-threshold-based auto-routing. | **PARTIAL/GAP** |
| Central store issues only against approved MRS, generates Gate Pass/Delivery Challan, logs transporter/vehicle | Material Issue exists but has no Gate Pass/Delivery Challan document and no transporter/vehicle capture. | **GAP** |
| Central perpetual stock reduces; a SITE-LEVEL SUBLEDGER opens for material issued-but-not-consumed | **This is the single biggest structural gap in the whole SOP.** The Lab has exactly one inventory layer (central, by warehouse) — there is no concept of "material physically at a site, not yet consumed" as a distinct balance from "material in the central warehouse." Material Issue today goes straight from Warehouse to Project Cost in one step. | **GAP** — significant |

## 8. Material Issue — Daily Process & Cross-Verification

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| Site Material Receipt Note (challan vs received quantity/discrepancy) | Does not exist (depends on Delivery Challan + Site Subledger, both gaps above). | **GAP** |
| Daily site register: opening+received-consumed=closing per site/job/material | Does not exist as a site-scoped ledger; Stock Report (Phase 28) is warehouse-scoped, not site-scoped. | **GAP** |
| Same-day exception logging (shortage/damage/return) with reason code + photo | Damage Reports (Phase 28) exist and require a reason (with mandatory explanation for "Other") — but they are warehouse-scoped, not site-scoped, and have no photo-evidence field. | **PARTIAL** |
| Weekly reconciliation: site register vs central dispatch register, >2% variance needs written explanation + Plant Manager sign-off | Stock Counts (Phase 28) exist for warehouse-level physical counts with variance→adjustment — conceptually the closest existing mechanism, but nothing compares a SITE register against a CENTRAL dispatch register specifically, and there is no variance-tolerance-triggers-approval-workflow. | **GAP** |
| Monthly physical stock count, independent counter, witnessed, reconciled, Plant Head/CFO review | Stock Counts exist (creator ≠ enforced-independent, no witness field, no Plant Head/CFO sign-off step). | **PARTIAL** |
| Consumption analysis vs BOQ, pilferage-risk flag | Not built — no BOQ concept exists in this Lab at all (BOM exists; the SOP's "BOQ/estimated consumption norms" is a related-but-distinct concept). | **GAP** |
| Month-end WIP/inventory valuation tied to GRN+Issue records, not a separate estimate | This is ALREADY true and independently verified across many prior phases — Moving Average valuation is derived purely from posted GRN/Issue movements, never a separate estimate. | **PASS** |

## 9. Payment Process — Internal Controls

| SOP Requirement | Current ERP Capability | Status |
|---|---|---|
| Three-way match (PO+GRN+Invoice) mandatory before ANY vendor payment; no two-way match | Three-way match EXISTS (`checkThreeWayMatch`) but only runs at Supplier-Bill-CREATION time via the PO-aware path — the STANDALONE Supplier Bill path (`draftSupplierInvoice`) has NO three-way match at all (by design, for genuinely PO-less bills) — and critically, `postSupplierPayment()` itself never re-checks whether the invoice it's paying was ever three-way-matched. A standalone (unmatched) bill can be paid exactly the same way as a matched one. | **PARTIAL / CONFLICT** — the SOP requires the match to gate PAYMENT specifically, which is not currently enforced at the payment step itself |
| Payment request raised by Accounts only; Factory/Site cannot initiate | `postSupplierPayment()` is gated by the `pay` role action (FinanceManager/CEO/Admin) — Factory/Site roles cannot call it. | **PASS** |
| SoD across MRS/PO creator, payment approver, bank-transfer executor (2-3 distinct people) | SoD exists for Draft→Submit→Approve→Post (creator cannot self-approve) — but Payment itself is a SINGLE function call (`postSupplierPayment`) with no separate "approve the payment" then "execute the transfer" as two distinct actors/steps. | **PARTIAL** |
| Bank maker-checker, no single signatory beyond petty-cash limit | Does not exist — no maker-checker concept for the payment/banking step specifically (only for journal drafts generally). | **GAP** |
| Approval matrix (₹5,000/₹1,00,000/Director tiers) | **The SOP itself marks this "To Be Finalised."** No implementation should treat it as final. | **BUSINESS DECISION REQUIRED** (per the SOP's own words) |
| Site petty cash ₹10,000 imprest, voucher-based replenishment, daily cash+vouchers=float reconciliation | No petty-cash/imprest concept exists in this Lab at all. | **GAP** |
| Petty cash still subject to the ₹10,000/₹35,000 cash ceilings | Depends on both the cash-limit engine (gap) and the petty-cash engine (gap) existing first. | **GAP** |
| Weekly/monthly cross-verification reports (7 named reports) | None of these specific reports exist as named, though some raw data exists to build several of them from. | **GAP** (as named reports) |

---

## Summary Counts

| Status | Count (approx., by distinct line item above) |
|---|---|
| PASS | 5 |
| PARTIAL | 9 |
| GAP | 34 |
| CONFLICT | 2 |
| BUSINESS DECISION REQUIRED | 1 (explicitly, per the SOP's own "To Be Finalised") |
| REAL-WORLD DEPENDENCY | 1 (explicitly) |
| TAX/LEGAL REVIEW | applies across the entire TDS section, per the SOP's own instruction |

**Headline finding:** the SOP describes a genuinely different, more elaborate operating model than what Phase 1-32 ever built — most importantly a **site-level material subledger** (material physically at a site vs. consumed) and a **Purchase Requisition layer before the PO**, neither of which has ever existed in this Lab, plus an entirely new **GST/TDS/cash-compliance control layer** that this Lab's tax handling (a flat, manually-selected CGST/SGST/IGST code) was never designed to carry. This is not a small gap-closure pass — see `PHASE33_SOP_GAP_REGISTER.md` for prioritization.
