# UAT Exit Criteria (PROPOSED)

**Date:** 2026-09-16. **All thresholds below are PROPOSED, not yet agreed by Appletree's business
owner.** No numerical threshold here has been business-approved — this document exists to give the
business owner a concrete starting point to accept, adjust, or replace before the UAT cycle begins.

| Category | Proposed Criterion | Status |
|---|---|---|
| **CRITICAL** | 0 open Critical/P0/P1 defects blocking the agreed UAT scope | PROPOSED |
| **HIGH** | Every High/P2 defect either CLOSED or formally accepted in writing by the business owner as a documented limitation | PROPOSED |
| **FUNCTIONAL** | 100% of the agreed UAT scenarios (from `UAT-SCENARIO-CATALOG.md` / `UAT-TEST-CASES.csv`) executed at least once | PROPOSED |
| **FINANCIAL** | 100% of the financial reconciliation tests in `UAT-TEST-CASES.csv` (L1-L4) pass — Trial Balance, AR/AP subledger, GST, document numbering | PROPOSED |
| **SECURITY** | 100% of the required role/SoD scenarios in `UAT-ROLE-MATRIX.csv` / `UAT-NEGATIVE-TEST-CATALOG.md` (N6, N8, N17-N20) pass | PROPOSED |
| **DATA** | No unexplained data corruption — every discrepancy is either explained (e.g., the one investigated, non-reproducible stress-test timing flake documented in `PHASE_41_REGRESSION_REPORT.md`) or logged as a new defect | PROPOSED |
| **REGRESSION** | No unexplained regression against the current engineering regression baseline (319/319 +2 documented, per `CR-2026-001`'s own closing count) | PROPOSED |
| **TRACEABILITY** | Every FAILED scenario is linked to a `DEF-YYYY-NNN` (or classified as a test-harness/documentation/business-policy item per `UAT-DEFECT-MANAGEMENT.md`) — no failure left unexplained | PROPOSED |
| **DOCUMENTATION** | UAT evidence (completed `UAT-TEST-CASES.csv`, screenshots/API logs where applicable) is complete for every scenario marked executed | PROPOSED |
| **BUSINESS** | The business owner signs `UAT-BUSINESS-SIGNOFF-TEMPLATE.md` with an explicit decision: Accepted / Accepted with documented limitations / Not accepted | PROPOSED (the decision itself is never proposed — it is always the business owner's own real decision) |

## How to use this document

The business owner (or whoever Appletree designates as UAT Lead) should review each row, and either:

1. **Accept as written** — mark the row APPROVED, or
2. **Adjust the threshold** — e.g., "we accept 2 open Medium defects if documented," or
3. **Replace entirely** — Appletree may have its own existing UAT exit-criteria template; this
   document is a starting point, not a mandate.

**No UAT cycle should be declared complete against thresholds that were never actually agreed.** This
document deliberately stops short of declaring any of the above criteria "met" — that determination
belongs in the UAT cycle's own closing report, once real UAT has actually been executed by real
Appletree business users, not by this engineering-side readiness phase.
