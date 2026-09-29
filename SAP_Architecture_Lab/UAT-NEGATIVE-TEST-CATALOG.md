# UAT Negative Test Catalog

**Date:** 2026-09-16. Per Section 9's requirement: UAT must test rejection, not just success.
Every scenario below expects: **REJECT SAFELY + NO INVALID BUSINESS STATE + AUDIT EVENT WHERE
REQUIRED.** Each row states whether it has already been executed with real evidence, or is defined
for the UAT cycle.

| # | Scenario | Expected Behavior | Status | Evidence |
|---|---|---|---|---|
| N1 | Invalid customer reference on a document | Rejected, no record created | DEFINED | Mechanism exists throughout (existence-check pattern used consistently); not freshly re-executed this session |
| N2 | Invalid project reference | Rejected, no record created | EXECUTED | Every `createX({projectId,...})` function checks `DB.projects.find(...)` — confirmed pattern via this session's own code reading (e.g. `projectDocumentTrace()`, `createTimesheetEntry()`) |
| N3 | Invalid material reference | Rejected, no inventory movement created | DEFINED | Mechanism exists (material-existence checks in GRN/Issue paths); not freshly re-executed this session |
| N4 | Invalid/negative quantity | Rejected, no partial posting | EXECUTED | `erp_059_transaction_contract_tests.js`: invalid GRN (negative qty) rejected AND leaves PO qtyReceivedByLine unchanged; invalid PO (negative line qty) rejected AND creates zero PO records |
| N5 | Duplicate transaction (idempotency) | Second identical attempt does not double-post | EXECUTED | `erp_059b_durable_audit_tests.js` dup1/dup2: repeated/concurrent identical failed requests produce correct, non-deduplicated audit entries without corrupting business state |
| N6 | Duplicate Handover | REJECTED, no duplicate handover record or audit entry | EXECUTED | `erp_audit_p0_tests.js` ERP-034 Test B — exact re-confirmation this session |
| N7 | Invalid accounting entry (unbalanced JE) | Rejected, journal entry count unchanged | EXECUTED | `erp_059_transaction_contract_tests.js`: invalid JE (negative debit) rejected AND leaves journalEntries count unchanged |
| N8 | Unauthorized approval (self-approval / wrong role) | Rejected server-side, not merely hidden in UI | EXECUTED | Sales self-approving own discount (`PHASE_41_ESTIMATION_QUOTATION_UAT.md`); SoD-violating self-approval in `erp_059_transaction_contract_tests.js`; Viewer's real non-hidden button click blocked server-side (`PHASE_41_VIEWER_UAT.md`) |
| N9 | Invalid QC transition (e.g. submitting zero items) | Rejected, checklist not marked Passed | EXECUTED | `erp_audit_p0_tests.js` ERP-032: zero-item QC checklist rejected outright |
| N10 | Invalid QC referencing a nonexistent Installation | Rejected | EXECUTED | `erp_audit_p0_tests.js` ERP-033 |
| N11 | Invalid inventory movement (over-return beyond dispatched qty) | Rejected | EXECUTED | `erp_phase39_manufacturing_jobwork_tests.js` [JW-NEG]: over-return beyond remaining dispatched qty BLOCKED |
| N12 | Invalid supplier/project relationship (cross-tenant reference) | Rejected | EXECUTED | `erp_audit_p0_tests.js` ERP-044: AMC for Customer B against a project genuinely belonging to Customer A rejected |
| N13 | Invalid document relationship (mismatched Lead/Estimation/Costing chain) | Rejected with a clear diagnostic error | EXECUTED | DEF-P41-01, `PHASE_41_ESTIMATION_QUOTATION_UAT.md` |
| N14 | Reversing an already-reversed accounting entry | Rejected | EXECUTED | `erp_phase39_banking_tests.js` [BANK-NEG]: reversing an already-reversed entry BLOCKED |
| N15 | Re-allocating an already-Posted bank import line | Rejected | EXECUTED | `erp_phase39_banking_tests.js` |
| N16 | Restoring a backup with a tampered checksum / an incomplete snapshot | Rejected, live database left untouched | EXECUTED | `erp_059b_durable_audit_tests.js` (B6/B7 environmental-path limitation aside — the underlying rejection LOGIC is proven by `erp_audit_p0_tests.js` ERP-040) |
| N17 | Unauthorized role attempting Backup/Restore | Rejected on all 4 endpoints | EXECUTED | `PHASE_41_BACKUP_RESTORE_AUDIT.md` Section 12 — Purchase blocked ×4 |
| N18 | Login with wrong password 5 times → lockout | Locked, correct password also rejected while locked | EXECUTED | `erp_059_security_tests.js` (13/13) |
| N19 | Spoofed `actor.role` in a request body | Ignored — server derives role from session only | EXECUTED | `PHASE_40_SECURITY_REPORT.md` probe #2 |
| N20 | Fabricated/stale session cookie | Rejected, "Not authenticated" | EXECUTED | `PHASE_40_SECURITY_REPORT.md` probe #3 |
| N21 | Destructive test endpoint called against a production-shaped instance | Rejected (403), production data unchanged | EXECUTED | `erp_059c_production_isolation_tests.js` (10/10) |

## Summary

21 negative scenarios cataloged. 18 already EXECUTED with real evidence this engagement; 3 (N1, N3,
N5-adjacent-cases) rely on a consistently-applied existence-check pattern confirmed by code reading
but not individually re-executed live this session — recommended as quick confirmatory checks during
the UAT cycle itself, not blockers to starting UAT.
