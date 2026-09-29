# ARCH-2026-002 — W4 Decision Impact Matrix

**Date:** 2026-09-26. Deliverable per this CR's own §16. **Zero of 12 decisions have been supplied** (see
`ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`'s 2026-09-26 update and its Questionnaire). This matrix
therefore cannot show an "Approved Behavior" — there is none yet. Each row instead shows the impact
magnitude of the CANDIDATE change (i.e., "if this option were chosen"), using NONE/LOW/MEDIUM/HIGH/
CRITICAL strictly as a magnitude label, never as a ranking of which option management should prefer, per
this CR's own explicit instruction.

| Decision | Approved Behavior | Modules | Accounting | Inventory | Project Cost | Security | SoD | Data Model | Reporting | Migration |
|---|---|---|---|---|---|---|---|---|---|---|
| W4-1 | **NOT YET DECIDED** | Service (Warranty) | NONE | NONE | NONE | NONE | NONE | LOW (Option B/C only) | LOW | NONE |
| W4-2 | **NOT YET DECIDED** | Service (Complaint/Ticket/Visit) | LOW (indirect, misclassification risk) | NONE | LOW | NONE | NONE | NONE | NONE | NONE |
| W4-3 | **NOT YET DECIDED** | Service (AMC) | NONE | NONE | NONE | NONE | NONE | NONE | LOW | NONE (optional backfill only) |
| W4-4 | **NOT YET DECIDED** | Service (Ticket) | NONE | NONE | NONE | NONE | NONE | NONE | LOW | NONE |
| W4-5 | **NOT YET DECIDED** | Service (Labour) | NONE | NONE | LOW | NONE | NONE | NONE | LOW | NONE |
| W4-6 | **NOT YET DECIDED** | Service (Warranty), Central Accounting | **HIGH (Option B only)** / NONE (Option A) | NONE | MEDIUM (Option B only — timing of recognition) | NONE | NONE | MEDIUM (Option B only — new GL account) | MEDIUM (Option B only) | **HIGH (Option B only)** |
| W4-7 | **NOT YET DECIDED** | Service (Billing), Central Accounting (AR) | LOW (preventive only) | NONE | NONE | LOW | NONE | LOW | NONE | NONE |
| W4-8 | **NOT YET DECIDED** | Service (Complaint/Ticket/AMC) | NONE | NONE | NONE | LOW | **MEDIUM (this IS the SoD change)** | NONE | NONE | NONE |
| W4-9 | **NOT YET DECIDED** | Service (Visit) | NONE | NONE | NONE | LOW | LOW-MEDIUM | NONE | NONE | NONE |
| W4-10a | **NOT YET DECIDED** (though zero policy content) | Service (CAPA) | NONE | NONE | NONE | LOW | NONE | NONE | NONE | LOW (pre-flight phantom-ID check) |
| W4-10b | **NOT YET DECIDED** | Service (CAPA) | NONE | NONE | NONE | NONE | NONE | LOW | LOW | NONE |
| W4-11a | **NOT YET DECIDED** | Service (Labour) | NONE | NONE | NONE | NONE | NONE | LOW | LOW | NONE (no historical retrofit possible either way) |
| W4-11b | **NOT YET DECIDED** | Service (Labour), Controlling | NONE | NONE | NONE | NONE | NONE | LOW | LOW | NONE (no historical retrofit possible either way) |
| W4-12 | **NOT YET DECIDED** | Service (Visit), Security/Data-Scope architecture | NONE | NONE | NONE | NONE | NONE | LOW-MEDIUM | LOW | **MEDIUM (Option B only — existing free-text values)** |

## Reading this matrix

**Only W4-6 (Option B) carries any HIGH-magnitude impact anywhere in this register**, and only across 3
dimensions (Accounting, Reporting-relevant Migration, Project Cost is MEDIUM not HIGH) — consistent with
it being independently flagged, in every prior document in this engagement, as "the most architecturally
significant item in this register." Every other item tops out at MEDIUM, and the large majority are
LOW/NONE. This is a magnitude reading only — it does not imply W4-6 is more or less likely to be approved,
only that its Option B specifically carries more downstream weight to plan for if chosen.

No row shows CRITICAL anywhere. No row proposes touching a shared engine (see
`ARCH-2026-002-W4-DEPENDENCY-IMPACT.md` for the full architecture-preservation re-confirmation) — this
matrix's "Modules" column never lists more than the Service domain plus, where genuinely touched, Central
Accounting or Controlling as read/post targets of the EXISTING single engines, never a new one.
