# ARCH-2026-002 — Wave 3 Security Baseline

**Date:** 2026-09-22. Wave 3 Phase 0 deliverable, §23. Per this CR's own instruction, SoD rules are
identified and classified, never invented or fixed here.

## 0. Critical-finding check — result: NO STOP TRIGGERED

No unauthenticated access, no client-side identity override, and no duplicate GL/subledger/reconciliation
writer was found anywhere in Wave 3 (re-confirmed exhaustively — see Central Accounting Audit). Two real,
disclosed SoD-coverage gaps were found, reported below, neither meeting this engagement's consistently-
applied CRITICAL/STOP bar.

## 1. The 8 named SoD pairs (this CR's own §23 list)

| # | Pair | Classification | Evidence |
|---|---|---|---|
| 1 | Vendor onboarding → first payment | **EXISTING** | SOD-5, `executePaymentRequest()` domain.js:11847-11854, no exemption, re-confirmed unmodified |
| 2 | Receipt/GRN → Supplier Bill | **EXISTING** | SOD-6, `draftSupplierInvoiceFromPO()` domain.js:5359-5365, re-confirmed unmodified, not weakened by Wave 2 |
| 3 | Payment Request create → approve → execute | **EXISTING** | SOD-1 (`approvePaymentRequest` 11797) + SOD-2 (`executePaymentRequest` 11837-11839), both re-confirmed unmodified |
| 4 | Bank import → reconciliation | **MISSING** | No `checkSoD()` call anywhere in the bank-import/reconciliation functions; `batch.importedBy` is recorded but never compared to the reconciling actor. Purely role-gated — the same individual can import, match, reconcile, unmatch, and exclude every line in a batch |
| 5 | Journal creation → approval/posting | **EXISTING** | `approveDraft()` (2560) and `postDraft()` (2594) both independently check creator≠actor, with a separately-audited CEO/Admin override. `submitDraft()` itself has no identity check — deliberate, since submit has zero financial effect |
| 5b | Recurring-entry journals | **EXISTING — same check applies, no bypass** | `generateDueRecurringDrafts()` produces a draft attributed to the triggering actor; it still must pass the identical `approveDraft()`/`postDraft()` checks — no scheduler, no shortcut path exists |
| 6 | Fixed asset acquisition → disposal (full chain) | **MISSING** | Zero identity checks across `createFixedAsset`/`capitalizeFixedAsset`/`transferFixedAsset`/`disposeFixedAsset` — every gate is role-only (`can(actor,'post')`) |
| 7 | Bank account creation → payment execution | **MISSING** | `createBankAccount()` sets `createdBy` but nothing downstream reads it; Admin/CEO hold both `masterData:true` and `pay:true` |
| 8 | Master data changes (vendor bank details) → financial execution | **N/A — the literal scenario does not exist in this data model** | `createVendorMaster()`'s schema has no bank-detail fields at all (no IFSC/account-number/beneficiary fields anywhere) — payments execute against the COMPANY's own `bankAccountId` (see pair 7), not a vendor-held bank record. A narrower, related gap exists (`editVendorMaster()` leaves `paymentTerms`/`category`/`name` freely editable with no SoD tie to a subsequent approver), but it does not match the bank-detail-swap scenario this pair describes |

## 2. Shadow-writer sweep — re-confirmed clean

`DB.journalEntries.push(` — exactly 1 real hit (`postJournalEntry`). No `.balance =`/`+=`/`-=` or
`.outstandingAmount =`-style subledger mutation found outside read-only derivation (the one `server.js`
hit is a discarded per-request response-shaping copy, never written back to `DB.customers`). Reversal
census: `reverseEntry()` is the sole GL-reversal engine; `reverseITCForWriteOff()` is a distinct domain
concept (ITC reversal) that posts through the same single `postJournalEntry()`, not a competing reversal
path. **No shadow writer found — no STOP condition triggered.**

## 3. Data scope re-confirmation (this CR's own §22)

`hasScopeAccess()` continues to support Project/Site/Customer/Branch only. **Cost Centre and Profit
Centre are confirmed NOT security-scope dimensions** — they exist only as accounting/reporting
dimensions (Cost Centre, partially) or pure master data (Profit Centre), never as an access-restriction
mechanism. This distinction (scope dimension vs. reporting dimension vs. accounting dimension) is
explicitly not conflated in this audit, per this CR's own §22 instruction.

## 4. Customer Profitability scope — re-confirmed

`GET /api/customers/:id/profitability`'s own authorization code (`server.js:2112-2119`) is genuinely
narrower than `customerVisible()` — `Sales` is excluded from the profitability route's `fullAccess` set
while being included in `customerVisible()`'s `AS_VIEW_ROLES`. **The export variant (`POST /api/export`
with `report==='customer-profitability'`) uses the IDENTICAL check — no bypass via export.**

## 5. Conclusion

**No CRITICAL vulnerability found or requiring a stop.** Two real, disclosed SoD-coverage gaps found
this pass (Bank Import→Reconciliation identity separation; Fixed Asset full-lifecycle identity
separation), both consistent in kind with gaps found and reported (not fixed) in prior Phase 0 passes of
this same engagement. Neither involves unauthenticated access or identity forgery. Not fixed here, per
this CR's own §34 rule — carried into `ARCH-2026-002-WAVE-3-DECISIONS.md`.
