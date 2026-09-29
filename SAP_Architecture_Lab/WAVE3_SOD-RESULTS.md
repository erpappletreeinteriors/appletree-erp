# WAVE3_SOD-RESULTS.md

**Date:** 2026-09-22. Segregation-of-Duties re-verification for ARCH-2026-002 Wave 3.

## Headline statement

**No new SoD rule was added this pass.** All 7 SoD-shaped candidates this wave's Phase 0 audit and
decision record identified (W3-2 through W3-8, i.e. every W3 item except the labeling-only W3-9) are
classified IMPLEMENTATION BLOCKER by `WAVE3_IMPLEMENTATION_SCOPE.md` §2, for the reason given there: this
CR's own operative text conditions each one on "where/if authorized" and the decision record's own
authoritative answer for every one of them is "No recommendation given." None was implemented.

## The 7 candidate rules NOT implemented, and why

| Candidate | Would-be rule | Why blocked |
|---|---|---|
| W3-2 | Bank Account creation vs. payment execution identity separation | Decision record: no recommendation; 3 mutually exclusive design options remain genuinely open (no exemption / CEO-Admin exemption / accept as disclosed risk) — a policy call |
| W3-3 | Fixed Asset full-lifecycle identity separation (creator≠capitalizer, or similar) | Decision record: no recommendation — the SAME item the original 46-phase forensic audit already declined to resolve unilaterally, explicitly calling it "a business judgment, not an engineering default" |
| W3-4 | Bank Import→Reconciliation identity separation | Decision record: no recommendation, AND notes a genuine risk-profile difference from SOD-5/6 (a bank statement is an externally-sourced document, not something the reconciling actor can forge) |
| W3-5 | Petty Cash GL control account (a prerequisite before any SoD question here is even well-formed) | Decision record: no recommendation; requires its own accounting-policy sub-decision first |
| W3-6 | True daily-aggregate cash limit | Decision record: no recommendation; an operational-control policy question, and the limit VALUE itself is still finance-unapproved |
| W3-7 | Cost allocation mechanism (not itself SoD-shaped, but gates any SoD question about who may allocate) | Decision record: no recommendation; the most architecturally significant open item, needs its own design pass |
| W3-8 | Profit Centre transaction propagation (same relationship to SoD as W3-7) | Decision record: no recommendation; requires its own derivation-mechanism decision first |

Full 7-point STOP detail for each is in `WAVE3_IMPLEMENTATION_SCOPE.md` §3 — not restated here.

## The 11 existing rules (SOD-1 through SOD-11) — unmodified, re-confirmed

`server/domain.js`'s `RBAC_SOD_RULES_SEED` array was read in full this pass and compared line-by-line
against the last-known-good state (Wave 2's own closing record) — **byte-identical, 0 additions, 0
removals, 0 edits**:

| Rule | Description | Enforced by | Status this pass |
|---|---|---|---|
| SOD-1 | Payment Request maker≠checker | `approvePaymentRequest()` | Unchanged — re-confirmed live, `WAVE3_TREASURY-RESULTS.md` |
| SOD-2 | Payment Request maker/checker≠executor (SOP §9) | `executePaymentRequest()` | Unchanged — re-confirmed live, `WAVE3_TREASURY-RESULTS.md`/`WAVE3_BROWSER-UAT.md` chain (c) |
| SOD-3 | Excess Billing/Material Issue second-person approval | `assertCanApproveExcessBilling()` etc. | Unchanged — covered by `erp_arch_2026_001d_sod_tests.js` regression |
| SOD-4 | Snag verifier≠resolver | Snag verification workflow | Unchanged — covered by regression |
| SOD-5 | Vendor Master creator≠Payment executor | `executePaymentRequest()` | Unchanged — covered by `erp_arch_2026_001d_sod_tests.js`, 30/30 PASS this pass |
| SOD-6 | GRN recorder≠matched Supplier Bill creator | `draftSupplierInvoiceFromPO()` | Unchanged — covered by same suite |
| SOD-7 | Production Order creator≠completer | `completeProductionOrder()` | Unchanged — covered by `erp_arch_2026_002_wave2_tests.js`, 26/26 PASS this pass |
| SOD-8 | Job Work Order creator≠linked Supplier Bill creator | `draftSupplierInvoice()`/`draftSupplierInvoiceFromPO()` | Unchanged — same suite |
| SOD-9 | Job Work Order creator≠settlement actor | `returnFromJobWorker()`/`recordJobWorkScrap()`/`directDispatchFromJobWorker()` | Unchanged — same suite |
| SOD-10 | QC checklist creator≠result submitter | `submitQCResult()` | Unchanged — same suite |
| SOD-11 | CAPA effectiveness-checker≠closer | `closeCAPACase()` | Unchanged — same suite |

`tests/erp_arch_2026_001d_sod_tests.js` (covers SOD-5/SOD-6 directly, confirms ≥6 rules present with all
IDs) — **30/30 PASS**. `tests/erp_arch_2026_002_wave2_tests.js` (covers SOD-7 through SOD-11 directly) —
**26/26 PASS**. Both re-run fresh this pass, zero modification to either file.

## Exception mechanism

`grantSoDException()`/`revokeSoDException()` (built by ARCH-2026-001D) are unchanged — not extended to
any of the 11 rules that didn't already use them, not extended to any of the 7 blocked candidates above.

## Conclusion

**PASS (VERIFICATION ONLY — no new SoD rule added; all 11 existing rules re-confirmed unmodified and
enforcing exactly as before; all 7 candidate items explicitly deferred per
`WAVE3_IMPLEMENTATION_SCOPE.md`).**
