# PHASE 26 — FINAL INDEPENDENT PRE-UAT AUDIT

**Nature of this audit:** pure verification. No code was modified. `SAP_Architecture_Lab` was inspected and exercised with temporary/demo data only; the Phase 25 baseline files remain exactly as delivered (checksums cross-checked below). Real ERP, offline ERP, and frozen SAP reference untouched.

---

## 1. Executive Summary

Phase 25's regression, security, and architecture claims are **independently re-verified and hold exactly as reported**: 844/844, 1,080/1,080, exactly one central posting engine. The three new UI screens were re-tested live and work correctly for the scenarios already covered in Phase 25.

**This audit found one genuine, previously-undiscovered defect that must be classified a UAT blocker**, found specifically by doing what Phase 25's own scope never attempted: a complete, realistic, PO-based procurement-to-project-cost trace. When a Purchase Order and GRN already exist for a purchase, the **only** UI screen available for entering the supplier's bill (the generic "Supplier Bill" screen) posts the full amount directly to Material Cost — the same account the later Material Issue *also* debits when that material is consumed. **The result is the material's cost being counted twice in Project P&L** for any project that goes through a normal PO→GRN→Bill→Issue cycle using only the UI that exists today. A correct, PO-aware billing function (`/api/ap/invoice-from-po`, which clears the GRN's GR/IR account instead of re-debiting Material Cost) already exists in the backend — but has no UI screen anywhere, and was never reachable except by calling the API directly.

**This is not a hypothetical edge case.** PO→GRN→Bill is presumably Appletree's normal procurement pattern for materials, not an unusual scenario — meaning a real accountant running the prepared UAT script's own purchase test (`05_PURCHASE_TESTS.md`) would very likely reproduce this exact double-count on their first real attempt.

## Verdict: **C — NOT READY FOR ACCOUNTANT UAT**

Not because the architecture is unsound (it isn't) — because sending a real accountant into UAT today would hand them a broken number on the very first realistic purchase-to-project-cost scenario they try, for a reason that has nothing to do with anything they did wrong.

---

## 2. Phase 25 Claim Verification

| Claim | Re-verified | Result |
|---|---|---|
| 844/844 regression | Yes, full re-run | **844/844, confirmed** |
| 1,080/1,080 security matrix | Yes, full re-run | **1,080/1,080, confirmed** |
| Exactly one `DB.journalEntries.push()` | Yes, direct grep | **1, confirmed** |
| All financial postings via `postJournalEntry()` | Yes | Confirmed, no bypass found |
| Checksums match the delivered Phase 25 state | Yes | `server.js` identical to the Phase 25 baseline (untouched during Phase 25's own build); `domain.js`/`index.html` differ from the *pre*-Phase-25 baseline exactly as expected (Phase 25's own real changes), with no further drift since |

## 3. UI Verification (through the actual browser, not API-only)

All three re-tested live this session:

- **Bank/Cash Transfer:** created fresh test accounts, posted real transfers, confirmed correct GL routing and balance updates on screen — including, new this session, **actual Cash-type accounts** (Phase 25 had only tested Bank-type accounts through the UI). Cash A→Bank transfer correctly posted Dr 1000 / Cr 9400.
- **Supplier Debit Note:** re-confirmed working correctly in isolation (create, "Other" validation, post).
- **Commitment view:** re-confirmed rendering correctly with a fresh PO.

**All three individually work exactly as designed.** The defect found in §4 is not in any of these three screens — it is in the pre-existing "Supplier Bill" screen, which none of Phase 24/25's own scope touched or re-tested.

## 4. Accounting Verification — Full Project Trace (the audit's central finding)

A complete temporary project was traced end-to-end: Project → PO (₹100,000) → Approval → Commitment created → Partial GRN (₹60,000) → Commitment reduced to ₹40,000 → **Supplier Bill entered via the only available UI-backed endpoint (`/api/ap/invoice`, generic)** → Payment → Clearing → Material Issue (₹60,000 consumed) → Customer Invoice (₹250,000) → Receipt → Clearing.

**Independent Project P&L, calculated by hand before checking the ERP:**
- Revenue: ₹250,000
- Material Cost: ₹60,000 (the value of material actually issued to the project)
- **Expected Profit: ₹190,000 (76% margin)**

**ERP's own reported Project P&L:**
- Revenue: ₹250,000 ✓ (matches exactly)
- Cost: **₹120,000** ✗
- Profit: **₹130,000** ✗
- Margin: **52%** ✗

**Root cause, confirmed by code inspection:** `draftSupplierInvoice()` (the function behind the generic "Supplier Bill" screen — `/api/ap/invoice`) posts the full bill amount directly to account 5000 (Material Cost): `{account:'5000', debit:base, ...}`. This is correct behavior for a bill with no PO/GRN (e.g., a standalone service invoice). But it is *also* the only screen available when a PO/GRN already exists — and in that case, the Material Issue that later consumes the same material from inventory *also* debits account 5000 for the same value. The material's cost is counted once at the bill stage and once again at the consumption stage.

**The correct function already exists and is correctly designed:** `draftSupplierInvoiceFromPO()` (`/api/ap/invoice-from-po`) instead debits the GRN's own GR/IR clearing account (2050) and credits AP — it does **not** touch Material Cost at all, because the GRN already recorded the inventory receipt correctly. This function has full three-way-match logic built in. **It has no UI screen anywhere in `client_secure/index.html`** — confirmed by an exhaustive grep for `invoice-from-po` across the entire file: zero matches.

**Classification: DEFECT / UAT BLOCKER.** Not a business policy question, not missing real-world input, not an enhancement — a real, reachable accounting-integrity risk in the only UI path a real accountant has for the single most common purchase pattern this business is expected to have.

## 5. AR/AP

Reconciliation re-confirmed live: `ar.matches: true`, `ap.matches: true` after the full trace (both nets correctly to zero once fully cleared — the double-counted cost in §4 is a P&L/cost-account issue, not an AR/AP subledger issue, and AR/AP integrity itself is unaffected by it).

## 6. Inventory

Material Issue correctly reduced inventory (Cr 1200, ₹60,000) and correctly recorded a real inventory movement (`MV-000002`, type Issue, valuation ₹60,000) — this half of the transaction is entirely correct. The defect is specifically that the SAME ₹60,000 also landed in Material Cost a second time via the bill, not that the inventory/issue side is wrong.

## 7. Banking/Cash

Re-confirmed via §3 — Bank and Cash accounts both route correctly, individually, to their own GL accounts, including transfers between them.

## 8. Supplier Debit Note

Re-confirmed working correctly (§3) — unaffected by the §4 finding, since it operates on a posted bill after the fact, not on the original bill-entry mechanism itself.

## 9. Commitments

Re-confirmed working exactly as designed: ₹100,000 commitment before receipt, correctly reduced to ₹40,000 after the ₹60,000 GRN, remaining fully separate from — and unaffected by — the Actual Cost double-count found in §4 (Commitment tracks against the PO/GRN value, not against whatever the bill or issue postings do afterward).

## 10. Project Accounting

The Commitment/Actual/Remaining separation itself is correct and proven (§9). The Actual Cost *number* is wrong for the specific reason in §4 — this is a data-input-path defect, not an architecture defect in how Project Accounting aggregates what it's given.

## 11. Fixed Assets

Full lifecycle re-tested (create→capitalize→depreciate→dispose) on a fresh test asset. Disposal reconciliation (the Phase 22 fix) re-confirmed holding: register and GL both correctly show zero for the disposed asset, `disposedCount:1` correctly excluded from the active count.

## 12. AMC

Not re-tested this session (no code touched AMC since Phase 22's own testing, which remains the current evidence — all 4 cancellation scenarios, correct non-invention of accounting treatment).

## 13. Security

1,080/1,080 re-confirmed. New spot-checks this session: unknown bank-account IDs on a transfer, an unknown project ID on a commitment query, and an unknown invoice ID on a Supplier Debit Note all failed cleanly (400 or empty result), no crash.

## 14. Audit

Not independently re-derived this session beyond what Phase 22/24 already established (the audit log vs. document-history split, now documented in the UI itself since Phase 22).

## 15. Reports

Project P&L specifically was independently recalculated and found wrong (§4) — this is the most important report-integrity finding of this audit. Trial Balance was not independently re-derived this session (regression suite already covers this exhaustively).

## 16. Negative Testing

ID-tampering spot-checks (§13) all passed. Broader negative testing (missing fields, negative amounts, overpayment) not re-run from scratch this session — Phase 21/24's evidence stands, since no code touched those validation paths.

## 17. Concurrency / 18. Persistence / 19. Backup-Restore

**Reviewed, not re-executed destructively**, per the brief's own instruction to prefer review where practical and never perform destructive tests outside a disposable copy. `save()`/`loadDbFromDisk()` were inspected directly: unchanged since Phase 21, atomic temp-file+rename pattern intact, `.bak` fallback intact. No code touched the posting engine or persistence layer since Phase 24, so the existing Phase 17/20/21 live evidence remains the current, valid proof for these three areas.

## 20. SAP Architecture Conformance

Re-confirmed directly: one central engine (§2), shared Customer/Supplier/Material/Project masters (unchanged), central GL/AR/AP/Inventory/Banking/Tax/Fixed-Asset integration (unchanged, and the §4 defect does not violate this — the bill correctly used the SAME central engine, it just used the wrong *business logic function* for its scenario), Commitments correctly kept operational and never touching the GL (§9).

## 21. Accountant Experience

The three new screens read clearly and match existing terminology (§3). **The "Supplier Bill" screen itself gives no indication that a different path should be used when a PO/GRN exists** — there is no warning, no PO-linkage field, nothing to suggest a real accountant is about to double-count. This is precisely the kind of usability gap that produces a CONFUSING-turned-FAIL result in real UAT, not just a technical defect.

---

## 22. Findings Summary

| # | Finding | Classification |
|---|---|---|
| 1 | Supplier Bill UI has no PO-aware path; posts a real double-count of Material Cost for any PO/GRN-backed purchase | **DEFECT / UAT BLOCKER** |
| 2 | `/api/ap/invoice-from-po` exists, is correctly designed, and is completely unreachable from the UI | **DEFECT / UAT BLOCKER** (same root cause as #1) |
| 3 | Bank/Cash Transfer, Supplier Debit Note, Commitment view all function correctly, including Cash-type accounts newly tested this session | **PASS** |
| 4 | Fixed Asset disposal reconciliation (Phase 22 fix) still holds | **PASS** |
| 5 | Closed-period posting control still correctly blocks | **PASS** |
| 6 | ID-tampering on all new endpoints fails cleanly | **PASS** |
| 7 | Real Appletree master data, real UAT, real migration, real production environment, real production DR, management sign-off | **MISSING REAL-WORLD INPUT** (unchanged from every prior phase today) |
| 8 | PO Amendment | **BUSINESS DECISION / ENHANCEMENT** (unchanged) |
| 9 | Future-dated posting "SAP standard" configuration | **BUSINESS DECISION** (unchanged — no authoritative reference material available, not guessed) |

## 23. UAT Blockers

**Finding #1/#2 (Supplier Bill double-counting) is the sole UAT blocker from this audit.** Everything else that could plausibly block UAT was checked and found working.

## 24. Non-Blockers

Findings #3–#6 — all PASS, confirmed live this session.

## 25. Business Decisions

Findings #8–#9, unchanged from prior phases, still pending Appletree management input.

## 26. Real-World Dependencies

Finding #7, unchanged — the standing, honest list from every phase today.

## 27. UAT Readiness Decision

## **C — NOT READY FOR ACCOUNTANT UAT**

Specifically and only because of Finding #1/#2. Per this audit's own absolute rule, **nothing was fixed** — this defect is documented, not silently patched. The brief's own guidance is followed exactly: *"If a fix is absolutely necessary: create a controlled defect-fix checkpoint, fix ONLY that defect, run full regression/security/reconciliation, then repeat the affected audit."* That is a recommendation for the next controlled phase, not an action taken here.

**Recommended minimal fix, for that future phase to consider (not performed now):** either (a) build a UI screen for `/api/ap/invoice-from-po` so a PO/GRN-linked bill can be entered correctly, or (b) add a PO-linkage field to the existing "Supplier Bill" screen that routes to the correct function when a PO is selected. Either way, this is a small, well-understood, already-designed-in-the-backend fix — not a redesign.

---

*No code was modified during this audit. All findings above are reproducible using the exact API calls documented in this report, against a freshly reset test database.*
