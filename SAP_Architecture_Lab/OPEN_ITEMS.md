# OPEN ITEMS

Consolidated from Phases 21–25. Each item is classified precisely — a technical issue is never called a business-policy issue, a missing feature is never called a defect, and an untested production item is never called PASS.

## Real-World Gaps (cannot be closed by further code work — require Appletree's own participation)

1. **Real Appletree master data** has not been loaded (see `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md`).
2. **Real users / real UAT** has not been performed (package ready: `ACCOUNTANT_UAT_PACKAGE/`).
3. **Real production environment** has not been validated (no such environment exists yet).
4. **Real data migration** has not been performed (only a synthetic-data rehearsal exists: `MIGRATION_READINESS_CHECKLIST.md`).
5. **Real production disaster recovery** has not been tested (only a disposable-copy drill exists).
6. **Management sign-off** has not occurred (nothing yet exists for management to sign off on).

## Business/Management Decisions Required (not technical issues)

7. **Future-dated posting configuration.** The current `maxFuturePostingDays` (550) is a functioning technical placeholder, not an approved Appletree or SAP-standard policy. This engagement does not have access to authoritative SAP configuration-standard reference material to state a definitive "SAP standard" number, and will not guess one. **Requires:** Appletree/Accounts to state the real acceptable future-posting window, or confirm 550 as acceptable.
8. **PO Amendment.** No confirmed business requirement exists for this capability today (see `PHASE25_GAP_REGISTER.md` G4). **Requires:** a decision on whether Appletree's real procurement process ever needs to amend an approved PO's value, or whether cancel-and-recreate is acceptable.
9. Every item already listed in `PHASE_22_MANAGEMENT_DECISIONS.md` (bank account identity, Supplier Debit Note accounting nuances beyond the built mechanism, AMC cancellation policy, master retirement criteria, Drawing→BOQ, Hardware Master, Customer Credit Limit).

## Genuine Technical/Missing-Feature Items (not policy questions)

10. No dedicated UI exists yet for a small number of administrative functions beyond what Phase 25 added (the three highest-priority accountant-facing screens — Bank/Cash Transfer, Supplier Debit Note, Commitment view — are now built and live-tested).
11. Multi-bank/cash reconciliation exists at the GL level (Phase 24) but the ICICI-specific bank-statement-matching workflow has not been re-validated against a second bank account's real statement (only ever tested against the single real 121-transaction ICICI fixture).

## Enhancement Backlog

See `PHASE_23_BACKLOG.md` — empty by design until real UAT surfaces genuine requests.
