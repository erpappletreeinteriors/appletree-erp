# PHASE 22 — MANAGEMENT DECISIONS REQUIRED

These are open policy questions this engagement has surfaced across Phases 20-22. None has been decided here — that is deliberate. Each needs a real answer from Appletree management, not an assumption.

---

### 1. Future Posting Limit
**Question:** How many days into the future should the ERP allow a transaction to be dated before requiring special authorization?
**Why it matters:** Phase 21 built a working control, but the number in it (550 days) is a functioning placeholder chosen only to avoid breaking a legitimate 12-month AMC test — it was never an Appletree business decision.
**Recommended options:** (a) 90 days — tight, catches most errors, may need frequent CEO override for legitimate multi-month service contracts; (b) 550 days (current) — permissive enough for existing AMC schedules, looser control; (c) a different number Appletree specifies.
**Management Decision:** _______________ **Date:** _______ **Approved By:** _______

### 2. Bank Account Identity
**Question:** Which real ICICI account does Appletree actually want configured — the one ending 1137 referenced in Phase 21's findings, or the ending-1112 account currently in this Lab's test data?
**Why it matters:** These must never be silently merged or assumed identical — a wrong bank account number in a live system is a real financial-control risk.
**Recommended options:** Accounts Team confirms, in writing: Bank name, Account Name, Account Number, IFSC, the GL ledger account it maps to, and its real opening balance.
**Management Decision:** _______________ **Date:** _______ **Approved By:** _______

### 3. Supplier Debit Note Policy
**Question:** What is Appletree's actual policy for issuing a Supplier Debit Note (e.g., short-receipt, quality rejection, price dispute)?
**Correction (found during the Phase 23 architecture audit):** the mechanism does NOT currently exist in the ERP — only Supplier Credit Note exists (Customer Credit Note AND Customer Debit Note both exist; on the supplier side, only the Credit Note half was ever built). This is a genuine, real gap, not just an unconfirmed policy.
**Why it matters:** Without it, a legitimate supplier-side adjustment (Appletree owes the supplier more, e.g., an agreed price increase or an under-billed correction) has no dedicated mechanism.
**Recommended options:** (a) build the missing Supplier Debit Note function, mirroring the existing Supplier Credit Note pattern; (b) confirm this scenario never actually arises in Appletree's real supplier relationships, so it can stay deferred.
**Management Decision:** _______________ **Date:** _______ **Approved By:** _______

### 4. AMC Cancellation Policy
**Question:** If an AMC contract is cancelled mid-term with a real deferred revenue balance still outstanding, what should happen to that balance?
**Why it matters:** Phase 13 deliberately left this undecided rather than inventing an accounting treatment — the current system will disclose "BUSINESS POLICY REQUIRED" rather than guess.
**Recommended options:** (a) recognize the remaining balance immediately on cancellation; (b) write it off to a specific expense/adjustment account; (c) refund proportionally; (d) something else specific to Appletree's contracts.
**Management Decision:** _______________ **Date:** _______ **Approved By:** _______

### 5. Master Retirement Policy
**Question:** When should a customer, supplier, or material actually be marked inactive?
**Why it matters:** Phase 21 built the deactivation *mechanism*; the *criteria* (no activity for N months? explicit closure? a specific approval step?) is a business call.
**Recommended options:** Accounts Team defines simple criteria per master type.
**Management Decision:** _______________ **Date:** _______ **Approved By:** _______

### 6. Drawing → BOQ Requirement
**Question:** Does Appletree's real estimation process need traceability from a specific drawing/dimension through to a specific BOQ line and then to BOM, or is direct BOM entry (the current, working state) sufficient?
**Why it matters:** Building the missing upstream link is real, non-trivial work that only pays off if the traceability gap is actually felt in daily estimation work.
**Recommended options:** (a) Not required — BOM-direct-entry is fine; (b) Required — commission it as a scoped, separate phase.
**Management Decision:** _______________ **Date:** _______ **Approved By:** _______

### 7. Hardware Master Requirement
**Question:** Is Appletree's real hardware catalogue (hinges, sliders, handles, etc.) large/varied enough to need a dedicated master (brand/spec/alternative-item fields), or does treating hardware as a generic Material category (current state) work fine?
**Recommended options:** (a) Generic Material category is fine; (b) Build a dedicated Hardware master.
**Management Decision:** _______________ **Date:** _______ **Approved By:** _______

### 8. Customer Credit Limit Requirement
**Question:** Does Appletree extend enough customer credit, broadly enough, that a system-enforced credit limit is worth building?
**Recommended options:** (a) Not needed at current scale; (b) Build it, with Appletree specifying the real limit-setting and override-approval rules.
**Management Decision:** _______________ **Date:** _______ **Approved By:** _______

### 9. Other Policy Questions Discovered During Real UAT
_(To be added as real UAT sessions surface them — none exist yet, since real UAT has not run.)_

---

*This list will be referenced, not duplicated, by the Phase 22 final report. Update it directly as real decisions come in.*
