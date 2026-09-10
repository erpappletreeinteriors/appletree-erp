# MANAGEMENT DECISION REGISTER

Every question below is a real Finance/Management decision this engagement has NOT made on Appletree's behalf. The system is built to support whichever option is chosen, without further code changes for most of these — they are configuration switches, not development work.

---

## 1. Payment Approval Matrix

**Question:** What are the real, Board-approved ₹-value tiers and approving roles for releasing a vendor payment?

**Current system state:** The SOP's own illustrative tiers are loaded as defaults (≤₹5,000 Accountant / ≤₹1,00,000 Purchase Head / above Director), explicitly flagged `finalised: false` everywhere it appears (dashboard, SOP Configuration screen, API responses). Phase 36 built a real Draft→Review→Approved workflow: a Finance user can submit the matrix for Board review, but only CEO/Admin can approve it, and only with a genuine reference (e.g. a Board Resolution number) — so the moment Appletree actually decides, the system is ready to record that decision properly, but nothing converts the illustrative tiers into binding policy on its own.

**Options:** (a) Adopt the SOP's illustrative tiers as-is; (b) set different ₹ thresholds/roles; (c) keep it unfinalized indefinitely and rely on the maker-checker control alone.

**Recommended option:** (a) as a starting point, revisited after the first quarter of real use.

**Decision:** _(pending)_ **Approved By:** _(pending)_ **Date:** _(pending)_

---

## 2. PO Approval Threshold Conflict

**Question:** The Lab's original PO-approval thresholds (from an earlier BOS §1.6 policy) conflict with the Finance SOP's stated ₹25,000 centralized-purchase threshold. Which governs?

**Current system state:** Both values are stored and visible; neither silently overrides the other. `purchaseApprovalConfig.status` reads `"POLICY NOT FINALISED"`.

**Options:** (a) Adopt the SOP's ₹25,000 threshold company-wide; (b) keep the original BOS thresholds; (c) a hybrid (e.g., SOP threshold for site purchases, BOS threshold for central).

**Recommended option:** (a), since the SOP is the more recent and more specific document — but this engagement is not positioned to make that call for Appletree.

**Decision:** _(pending)_ **Approved By:** _(pending)_ **Date:** _(pending)_

---

## 3. PR-Before-PO Enforcement

**Question:** Should every Purchase Order require an approved Purchase Requisition first (except the SOP's own site-petty exception)?

**Current system state:** Fully built and tested (`requirePRForPO`), defaulting to **OFF** — every existing PO-creation workflow behaves exactly as before until this is switched on.

**Options:** (a) Switch it on now; (b) pilot it on one project/site first; (c) leave it off indefinitely.

**Recommended option:** (b) — this is a real process change for purchasing staff, not just a settings flip; a short pilot surfaces friction before company-wide rollout.

**Decision:** _(pending)_ **Approved By:** _(pending)_ **Date:** _(pending)_

---

## 4. Payment-Category Match Rules

**Question:** For payments with no natural GRN (rent, professional fees, commission, transport services), what replaces the PO+GRN+Invoice three-way match the SOP otherwise requires?

**Current system state:** Goods/Job-Work/Transport-Material are pre-confirmed "Technically Compliant" (they have a real GRN). Rent/Professional Fees/Commission/Transport Services all start "Payment Control Policy Required" — a Finance user can confirm each individually once a model is agreed, but nothing was decided unilaterally.

**Options:** (a) PO + a manually-recorded Service Confirmation + Invoice, mirroring the goods flow; (b) accept these categories unmatched, relying on the payment maker-checker control alone; (c) category-by-category decision.

**Recommended option:** (c) — these four categories are different enough in practice (rent is recurring and predictable, transport services vary by shipment) that one rule may not fit all.

**Decision:** _(pending)_ **Approved By:** _(pending)_ **Date:** _(pending)_

---

## 5. Future Posting Period

**Question:** How far into the future should a document be postable before it requires override authorization?

**Current system state:** `maxFuturePostingDays` (set in an earlier phase) governs this; not touched by Phases 33–35. Carried here only because the brief asked for "any remaining policy questions" — this is not a new question raised by the Finance SOP itself.

**Options:** Unchanged from whatever was previously configured, unless Finance wants to revisit it.

**Recommended option:** No change recommended — out of scope for this SOP-compliance work specifically.

**Decision:** _(pending — not raised by this phase's own work)_ **Approved By:** _(n/a)_ **Date:** _(n/a)_

---

## 6. Ship-to GSTIN Effective Date

**Question:** Is 1 August 2026 (the SOP's own stated effective date) still correct, or has it changed?

**Current system state:** Configurable (`shipToGstinEffectiveDate`), defaults to `2026-08-01`.

**Options:** Confirm as-is, or update to a different date if the underlying GST rule has since changed.

**Recommended option:** Confirm as-is unless Appletree's GST advisor says otherwise.

**Decision:** _(pending)_ **Approved By:** _(pending)_ **Date:** _(pending)_
