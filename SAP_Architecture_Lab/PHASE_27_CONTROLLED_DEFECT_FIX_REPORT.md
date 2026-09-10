# PHASE 27 — CONTROLLED ACCOUNTING DEFECT FIX

**Scope discipline:** work confined to `SAP_Architecture_Lab/server/domain.js`, `server/server.js`, `client_secure/index.html`, `server/security_matrix.js`, plus one new permanent test file. Real ERP, offline ERP, frozen SAP reference, and the Phase 26 audit report were never touched (checksums confirm this — see §17). A `PHASE27_CHECKPOINT/` snapshot of `server/` and `client_secure/` was taken before any change, per the brief's own safety instruction. Only temporary/demo data used throughout (VEND-1/2/3, PRJ-1/5, MAT-1/2, CUST-8 — all pre-existing seed fixtures).

---

## 1. Phase 26 Defect (as found)

Any Supplier Bill entered through the only UI-reachable endpoint (`draftSupplierInvoice()` via `/api/ap/invoice`) posted the full amount directly to Material Cost (5000) — correct for a standalone bill, but wrong for a PO/GRN-backed purchase, because the Material Issue that later consumes the same material *also* debits 5000. Result: material cost counted twice. Phase 26's own worked example: PO ₹100,000 / GRN ₹60,000 / Bill ₹60,000 / Issue ₹60,000 → expected Project Cost ₹60,000, actual ₹120,000; expected Profit ₹190,000, actual ₹130,000.

## 2. Reproduction (performed fresh, not assumed)

Reproduced against the CURRENT (pre-fix, at the start of this phase) code before touching anything: created PO-0001 (₹100,000, MAT-2/VEND-2/PRJ-5), GRN for 60 units, then billed the GRN using the only pre-existing UI path. Confirmed the double-count exactly as Phase 26 described. This reproduction is what `phase27_defect_fix_tests.js §1` now runs permanently — but against the FIXED code, where it proves the opposite result (see §7).

## 3. Root Cause

`draftSupplierInvoice()` (generic) has no concept of a PO/GRN and always debits 5000. `draftSupplierInvoiceFromPO()` (three-way-matched, correctly clears GR/IR account 2050 instead) already existed and was already correct — it simply had **zero UI path**, confirmed again this phase by an exhaustive grep of `client_secure/index.html` for `invoice-from-po` before any change: zero matches.

**A second, related root cause surfaced during this fix and had to be closed for the fix to be real, not cosmetic:** neither the GRN nor the PO tracked "quantity already invoiced" anywhere. `po.qtyInvoicedByLine` existed as a field (initialized at PO creation) but nothing ever wrote to it — it was always `{}`. `checkThreeWayMatch()` compared an invoice's qty against the GRN's *total* accepted qty, not the *remaining* balance, and required **exact equality** — which additionally made legitimate partial billing impossible (any partial bill was flagged as a "mismatch" requiring management override). Without fixing this, a UI could point at the correct backend function and still let an accountant bill the same GRN twice, or overbill it — reproducing the exact same class of double-counting the Phase 26 defect represents, just one step later. This is documented, not silently expanded scope: it was a necessary precondition for "the UI must prevent ambiguity" (Part 18) and "partial billing works" (Part 21 item 7) to be true statements rather than aspirational ones.

## 4. Fix

**Backend (`server/domain.js`):**
- `createGRN()` now initializes `grn.qtyInvoicedByLine = {}` per GRN, mirroring the PO's existing pattern.
- New `checkInvoiceableBalance()` — a separate, non-overridable hard check: an invoice line cannot exceed `grnLine.qtyAccepted − alreadyInvoiced`. This is what actually blocks overbilling and duplicate billing across multiple bills against the same GRN (Parts 12/13). It is deliberately kept separate from three-way match, which authorizes exceptions for legitimate mismatches — over-invoicing beyond what was ever received must never be exception-able.
- `checkThreeWayMatch()`'s qty rule changed from "invoice qty must exactly equal GRN accepted qty" to "invoice qty must not exceed GRN accepted qty" — this is what makes partial billing possible at all; the remaining-balance-aware over/duplicate-billing block above is what makes it safe.
- `draftSupplierInvoiceFromPO()` now runs the balance check first, and on a successful draft, reserves the billed qty against both the GRN and PO's `qtyInvoicedByLine` immediately (matching the existing precedent that Commitment is reserved at PO Approval, before GRN even exists — this engine already reserves at the point a document exists, not only once it posts).
- New `releaseInvoiceReservation()`, wired into `rejectDraft()`, `cancelDraft()`, and `reverseEntry()` (the last one via the same additive-hook pattern Phase 24 already used to restore Commitment on a GRN reversal) — so a rejected, cancelled, or reversed PO-aware bill never permanently locks the GRN line from being correctly rebilled.
- New read-only `invoiceableGRNsForVendor()` — server-computed balances for the new UI, so the client never has to re-derive them and can never show a number the server wouldn't also accept.
- `draftSupplierInvoice()` (the standalone/generic function) is **completely unchanged** — it remains correct for what it was always meant for.

**API (`server/server.js`):** one new endpoint, `GET /api/ap/invoiceable-grns?vendorId=`, gated by the same `can(actor,'create')` check as actually creating a bill. `/api/ap/invoice` and `/api/ap/invoice-from-po` are unchanged.

**UI (`client_secure/index.html`):** the Supplier Bill screen (`renderSI()`) is rebuilt into two clearly separated, distinctly labeled sections — Option A from the brief's own Part 7:
1. **"Bill Against a PO/GRN (Recommended for material purchases)"** — supplier picker at the top; every GRN with an outstanding invoiceable balance for that supplier renders as its own card showing PO/GRN/Project/Received date and a line table (Item, UoM, Received Qty, Already Invoiced, Balance, Rate, an editable Invoice Qty pre-filled with the balance), a date and tax-code field, a **Preview Accounting** button that shows the exact Dr/Cr lines before posting (explicitly stating "No Material Cost debit"), then **Post Supplier Bill**. This calls `/api/ap/invoice-from-po` — the accountant never sees or needs to know that name.
2. **"Standalone Supplier Bill — No PO"** — the original form, unchanged behavior, with an explicit on-screen warning steering the accountant to section 1 if the bill actually relates to a PO/GRN.

An accountant billing a PO/GRN purchase now has no way to reach the Material-Cost-double-count path — the correct screen is the first thing they see, pre-filled with the correct balance.

## 5. Accounting Treatment (before/after)

| | Before (defect) | After (fixed) |
|---|---|---|
| GRN | Dr Inventory (1200) / Cr GR-IR (2050) | unchanged |
| Supplier Bill (PO-backed) | Dr **Material Cost (5000)** / Cr AP (2000) | Dr **GR-IR (2050)** [+Dr Input Tax 1300 if applicable] / Cr AP (2000) |
| Material Issue | Dr Material Cost (5000) / Cr Inventory (1200) | unchanged |
| Net effect on Material Cost | **Debited twice** (Bill + Issue) | **Debited once** (Issue only) |
| Standalone Bill (no PO) | Dr Material Cost (5000) / Cr AP (2000) | unchanged — still correct |

## 6. Three-Way Match

Verified live: exact match (§7 below), partial billing (now allowed, was previously blocked entirely — see §3), overbilling (blocked), duplicate billing (blocked), already-fully-billed GRN (blocked), invalid PO/GRN (blocked, "PO or GRN not found"), mismatched PO/GRN pairing (new defensive check added — a GRN that doesn't belong to the given PO is rejected rather than silently accepted).

## 7. Project P&L Verification — Independent Calculation

Reran Phase 26's exact scenario against the fixed code (`phase27_defect_fix_tests.js §1`), independent expectation calculated first: Revenue ₹250,000, Cost ₹60,000, Profit ₹190,000.

**ERP's own output after the fix: Revenue ₹250,000, Cost ₹60,000, Profit ₹190,000.** Exact match — the defect is closed.

## 8. Inventory Verification

GRN receipt, Supplier Bill (no inventory movement — correct, GRN already recorded the receipt), and Material Issue all traced with no duplicate movement. Inventory movement count and valuation confirmed via `procurement_tests.js` and the Phase 27 trace — one Receipt, one Issue, values match exactly (60 × ₹1,000 = ₹60,000 both sides).

## 9. AP Verification

`supplierOpenItems()`/AP reconciliation re-confirmed matching after all Phase 27 activity (`/api/reconciliation` → `ap.matches: true`). The PO-aware bill posts to the same AP control account (2000) as the standalone path — no new subledger, no new reconciliation surface.

## 10. Payment / Clearing

Supplier Payment + Clearing re-tested against the corrected bill: ₹60,000 paid, clearing recorded, AP open item reduced to ₹0 — unchanged mechanism, now operating on a correctly-valued bill.

## 11. Reversal

Reversing a posted PO-aware bill correctly reverses the GL (2050/2000 flip) AND releases the reserved qty back onto the GRN's invoiceable balance (`phase27_defect_fix_tests.js §6`) — confirmed the same GRN can be cleanly rebilled afterward, with no orphaned reservation and no duplicate Material Issue risk.

## 12. Security

1,080 → **1,089/1,089 PASS** on the security matrix — the 9 new cells are the new `/api/ap/invoiceable-grns` endpoint tested across all 9 roles (same `create`-gated allowed set as every other AP creation endpoint; nothing weakened, nothing new added to any role's permissions). 47/47 ID-tampering tests still pass unchanged. RBAC/SoD on the existing endpoints is completely untouched by this fix.

## 13. Regression

**878/878 PASS, 0 FAIL** across the full existing suite (33 test files) plus the new Phase 27 suite, re-run fresh after the fix. No test was deleted, weakened, or had its expected value changed to force a pass — the one substantive test-suite-adjacent change was the three-way-match qty rule itself (§3/§6), which is the fix, not a workaround, and every pre-existing test that exercised that rule (`procurement_tests.js`, `phase16_project_trace_test.js`, `security_matrix.js`) still passes unchanged against it.

## 14. Permanent Regression Tests Added

`server/phase27_defect_fix_tests.js` — 31 tests, added permanently:
1. Full PO→GRN→PO-aware Bill→Payment→Issue→Customer Invoice→Receipt→P&L trace, independent P&L check (§1, 12 tests).
2. Standalone Supplier Bill still works and still posts to 5000 directly (§2, 2 tests).
3. Partial billing: first partial, balance updates correctly, remaining bill, GRN drops off the invoiceable list once fully billed (§3, 4 tests).
4. Overbilling blocked (§4, 1 test).
5. Duplicate billing blocked (§5, 2 tests).
6. Reversal releases the balance for clean rebilling (§6, 3 tests).
7. Rejected draft releases the balance for clean re-entry (§7, 3 tests).
8. Mismatched PO/GRN pairing rejected (§8, 1 test).
9. Whole-ledger AP/AR/Trial Balance integrity after all of the above (§9, 3 tests).

Plus 9 new permanent cells in `security_matrix.js` for the new endpoint.

## 15. Accountant Walkthrough (real browser, real login, real clicks/function calls — not API-only)

Performed as `accountant1` against a fresh PO/GRN fixture (PO-0001, 30 units ordered, 18 received): navigated to Supplier Bill, saw the GRN card immediately with Balance=18, Already Invoiced=0, pre-filled Invoice Qty=18; clicked Preview Accounting and saw the exact Dr GR/IR ₹50,400 / Cr AP ₹50,400 preview with the explicit "No Material Cost debit" note; posted; the card correctly disappeared from the list ("No GRN receipts... currently awaiting billing"); pushed the resulting draft through Submit→Approve→Post as `finance1`, confirmed the posted entry carries only accounts 2050/2000; issued the material as `admin` (₹50,400) and confirmed Project P&L cost showed exactly ₹50,400 — not ₹100,800. Separately confirmed the Standalone section still accepts and posts a non-PO bill correctly. The accountant never needed to know an endpoint name at any point.

## 16. Architecture Verification

`grep -c "DB.journalEntries.push"` = **1** (unchanged). `postJournalEntry(` call sites = **27** (unchanged from Phase 26's count — no new direct call sites were added; the new UI calls the existing `/api/ap/invoice-from-po` route, which calls the existing `draftSupplierInvoiceFromPO()`, which goes through the existing `createDraft → submitDraft → approveDraft → postDraft → postJournalEntry` chain, identically to every other document type). No new accounting engine, no duplicated posting logic — the fix is entirely: (a) a new balance guard before the existing function runs, and (b) exposing the existing function through the UI.

## 17. Before/After File Integrity

| File | Before (Phase 26 baseline) | After |
|---|---|---|
| `server/server.js` | `568c5bbc...` | `ee726cf9...` (new endpoint only) |
| `server/domain.js` | `b2db7a87...` | `67da52e7...` (fix described above) |
| `client_secure/index.html` | `5f6f58d8...` | `014c6175...` (Supplier Bill screen rebuilt) |
| `server/security_matrix.js` | unchanged | `9b701e40...` (9 new cells) |

No other file in `SAP_Architecture_Lab/` was touched. `PHASE27_CHECKPOINT/` holds the pre-fix snapshot.

## 18. Remaining Open Items (unchanged from Phase 25/26 — none newly introduced)

- Real Appletree master data, real UAT, real production environment, real migration, real DR, management sign-off — still MISSING REAL-WORLD INPUT (unchanged).
- PO Amendment, future-dated posting policy — still BUSINESS DECISION REQUIRED (unchanged, not touched this phase).
- The `po.qtyInvoicedByLine` fix (§3) is a genuine, disclosed improvement to `projectCostBreakdown()`'s "Committed" figure (previously always overstated, since it never shrank as bills came in) — not a new defect, but worth Appletree Accounts knowing the Committed number will now read lower/more accurately than it did before this phase for any project with PO-aware bills.

## 19. Not Done (per Part 28 — no feature creep)

No PO Amendment, no new reports, no new tax rules, no new master types. The three-way-match qty-rule change (§3) was the minimum necessary for the fix's own stated objective (Part 11's "partial billing works" requirement) — not an independent enhancement.

## 20. UAT Readiness Decision

## **READY FOR ACCOUNTANT UAT**

All conditions in Part 30 are met: the original defect is provably gone (§7), the standalone path is provably intact (§2/§15), the PO-aware path works end-to-end including partial/overbilling/duplicate/reversal edge cases (§6/§13/§14), security is intact and slightly better-covered (§12), the UI makes the old mistake structurally unreachable (§4/§15), and the central accounting engine remains singular (§16). Per the brief's Final Rule, freezing this build now — no further development phase auto-starts. Next step: real Appletree Accountant UAT, as already prepared for in `ACCOUNTANT_UAT_PACKAGE/`.

---

*Real ERP, offline ERP, and frozen SAP reference confirmed untouched throughout. This is a controlled, narrowly-scoped fix — not a new architecture phase.*
