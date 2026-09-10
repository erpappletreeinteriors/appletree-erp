# PHASE 25 GAP REGISTER

Verified against the live current codebase today (not assumed from prior reports): central posting engine confirmed still singular (`DB.journalEntries.push` = 1 occurrence), zero UI code found for Bank Transfer/Supplier Debit Note/Commitment (grep against `client_secure/index.html` returns no matches), no PO Amendment function exists anywhere, `maxFuturePostingDaysApproved` remains `false`.

| ID | Issue | Source Phase | Current Status (verified today) | Severity | Type | Before UAT? | Before Production? | Action |
|---|---|---|---|---|---|---|---|---|
| G1 | No accountant UI for Bank/Cash Transfer | 24 | Confirmed absent — API only | High | UI gap | **YES** | Yes | **BUILD (this phase)** |
| G2 | No accountant UI for Supplier Debit Note | 24 | Confirmed absent — API only | High | UI gap | **YES** | Yes | **BUILD (this phase)** |
| G3 | No Commitment visibility in Project Financial 360 UI | 24 | Confirmed absent — API only | High | UI gap | **YES** | Yes | **BUILD (this phase)** |
| G4 | PO Amendment unbuilt | 24 | Confirmed absent, no function exists | Low | Missing capability | No | No (no confirmed requirement) | **C — Management Decision** |
| G5 | Future-dated posting limit (550 days) unapproved | 21 | Confirmed still `maxFuturePostingDaysApproved:false` | Medium | Policy gap | No (control works; number is a placeholder) | Yes | **C — Management Decision, documented not guessed** |
| G6 | Real Appletree master data not loaded | 22 | Confirmed — only demo/seed data exists | — | Real-world gap | No | Yes | **E — cannot be built by this engagement; documented in OPEN_ITEMS.md** |
| G7 | Real Appletree users have not completed UAT | 22 | Confirmed — all testing to date is agent-simulated | — | Real-world gap | N/A (this IS the gap) | Yes | **E — prepare the package, cannot perform it** |
| G8 | Real production environment not validated | — | No production environment exists to validate | — | Real-world gap | No | Yes | **E — checklist only** |
| G9 | Real data migration not performed | 21 | Only a masked/synthetic rehearsal exists | — | Real-world gap | No | Yes | **E — readiness checklist only** |
| G10 | Real production DR not tested | 21 | Only a disposable-copy drill exists | — | Real-world gap | No | Yes | **E — checklist only** |
| G11 | Business owner sign-off has not occurred | — | Nothing yet exists for management to sign off on | — | Management gap | No | Yes | **C — Management Decision** |
| G12 | Final handover documentation | 20/24 | Exists for Phase 20 baseline; not yet updated for Phases 21–24's additions | Medium | Documentation gap | No | Yes | **B — update this phase where practical** |

## Classification Summary

- **A. MUST FIX BEFORE ACCOUNTANT UAT:** G1, G2, G3 (the three missing UI screens — an accountant cannot meaningfully test a capability with no screen).
- **B. MUST FIX BEFORE PRODUCTION:** G12 (handover documentation currency).
- **C. MANAGEMENT DECISION:** G4 (PO Amendment), G5 (future-date number), G11 (sign-off).
- **D. FUTURE ENHANCEMENT:** none newly identified this phase beyond what Phase 22's backlog already holds.
- **E. NOT APPLICABLE / ALREADY CLOSED (to this engagement, not to Appletree):** G6–G10 — these are real-world gaps no further code work can close; they require Appletree's own participation, and are tracked in `OPEN_ITEMS.md`, not silently built around.

**This phase's actual scope, per the brief's own "do not blindly build everything" instruction: G1, G2, G3 (build), G12 (update), plus the verification/testing/documentation work Parts 6–30 require.**
