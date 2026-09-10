# ACCOUNTANT UAT DASHBOARD

This is a snapshot, not a live screen — the ERP has no backend infrastructure for tracking who-tested-what, and building one just to populate this dashboard would be new functionality invented for its own sake, not something the SOP or the brief asked for. Whoever coordinates the real UAT should update this file by hand as testers report back.

## Test Environment

| Field | Value |
|---|---|
| Test user pool | A dedicated `uat_*` credential set (10 users, see `19_TEST_CREDENTIALS.md`) plus the earlier phase-numbered test users — all clearly test-only, non-real |
| Test company | This SAP_Architecture_Lab instance only — never the real or offline Appletree ERP |
| Test period | Not yet scheduled — set when Appletree assigns testers |
| Test data status | Entirely fictional (see every Phase 33/34/35/36 report's own "no real data invented" confirmation). A one-click "Create Demo Scenario" (Admin → Users & Roles) seeds one real connected example; "Reset UAT Data" wipes back to a clean seed at any time |

## Scenario Count

| Package Section | Scenarios |
|---|---|
| 03–13 (pre-existing, Phase 25) | 67 |
| 15 — Purchase Requisition & Approval Policy | 8 |
| 16 — Site Material | 12 |
| 17 — Job Work & E-way Bill | 13 |
| 18 — Payment Controls & Petty Cash | 17 |
| **Total** | **117** |

Phase 36 added no new numbered scenario file (its own UI/UAT-environment work is exercised naturally while working through the existing 117 — e.g. GRN weighment now has real fields to fill in during `05_PURCHASE_TESTS.md`/`16_SITE_MATERIAL_TESTS.md`, and the Payment Approval Matrix workflow is testable from `15_PURCHASE_REQUISITION_AND_APPROVAL_TESTS.md`'s existing item 7).

## Status

| Status | Count | Notes |
|---|---|---|
| Passed | 0 | Not yet run by a real Appletree tester |
| Failed | 0 | — |
| Blocked | 0 | — |
| Needs Finance Decision | See `MANAGEMENT_DECISION_REGISTER.md` | Not scenario-specific — these are standing policy questions, not per-test blockers |
| Needs Configuration | See `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md` | Same |
| Tax/Legal Review | TDS rates, cash-limit figures | Flagged everywhere they appear in the UI itself, not just here |

**UAT has not been performed by a real Appletree employee. Nothing in this document should be read as a completed test result — it is a scenario inventory and environment description only, prepared so a real UAT can start without additional setup.**
