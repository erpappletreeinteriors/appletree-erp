# ARCH-2026-001 — Open Management Decisions

**Date:** 2026-09-21. Consolidates every open decision accumulated across the full ARCH-2026-001
effort (2026-09-21, all documents). None of these are decided by this document — each requires a
management decision before the dependent implementation work can be authorized.

## 1. CEO / technical-administrator split — OPEN

**Decision needed:** Option A (CEO retains combined business + technical-admin access) vs. Option B
(CEO splits into separate business + Business Administrator + System Administrator + Auditor
personas).

**Full detail:** `ARCH-2026-001-RBAC-TARGET-DESIGN.md` §3.

**Blocks:** `ARCH-2026-001f` (the final step of the RBAC implementation sequence, §3 of
`ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md`) cannot be sequenced until this is decided. Every other
RBAC step (`a` through `e`, and the new `g`) can proceed independently of this decision.

**No recommendation is made** — this is explicitly a business staffing/governance decision, not a
technical one.

## 2. Integration & Platform (Domain #19) scope — OPEN

**Decision needed:** which of the following, if any, Appletree actually wants classified as
"Integration & Platform" scope:
- A general-purpose external-system connector (GST portal API, e-invoicing API, accounting-software
  sync).
- An API/webhook framework for third-party integration.
- Authentication/SSO integration (Google/Microsoft login) — this one in particular carries its own
  security-posture question (a new external trust boundary) beyond just scope definition.

**Full detail:** `ARCH-2026-001-ARCHITECTURE-FREEZE.md` §3, `ARCH-2026-001-RBAC-TARGET-DESIGN.md` §4.

**Blocks:** `CR-2026-007` cannot be scoped, designed, or estimated until this is answered — it is
listed in the Wave Plan as BLOCKED, not merely sequenced later.

**No recommendation is made.**

## 3. Payroll (Domain #21) statutory configuration — OPEN, HIGHER STAKES THAN A SCOPE QUESTION

**Decision needed:** Appletree must supply the actual statutory configuration (PF/ESI/PT rates and
rules, TDS-on-salary slabs, filing cadence and formats) before any design work on Payroll can safely
begin — not just before implementation. This is flagged separately from the other two items because
building against assumed or generic defaults here carries real legal/compliance risk, not just a
rework cost.

**Full detail:** `ARCH-2026-001-IMPLEMENTATION-WAVE-PLAN.md`, CR-2026-009 row.

**Blocks:** `CR-2026-009` entirely — design, not just implementation.

## 4. Sep 19, 2026 login provenance — CLOSED (recorded here for continuity, not reopened)

**Status:** this is not an open decision requiring management input — it is a closed, evidence-
exhausted investigation. Recorded here only so a future reader of this consolidated list does not
mistake it for still-pending.

- **Attribution:** UNIDENTIFIED (10 evidence sources exhausted, none conclusive).
- **Authorized activity:** UNKNOWN.
- **Data-integrity impact:** NONE (single `loginHistory` record, no business/accounting/inventory
  data touched).
- **ERP-059B impact:** NONE.
- The CEO's own instruction closed this line of investigation explicitly: "No further local forensic
  investigation is required. Do not attempt to identify or infer the actor. Do not modify the
  historical login record."
- **Standing awareness item (not a forensic task):** whether the underlying access pattern this
  incident revealed (a bare server start silently defaulting to the production database with no loud
  signal) was itself an acceptable risk going forward has already been addressed structurally by
  CR-2026-002 (loud startup banner, explicit `development` environment state, formal isolated-launcher
  script) — that is a closed, implemented mitigation, not an open item.

**Full detail:** `ARCH-2026-001-LOGIN-PROVENANCE-INVESTIGATION.md`.

## 5. Domain-count reconciliation — CLOSED (recorded here for continuity, not reopened)

**Status:** closed. The 26-domain summary arithmetic bug (a mislabeled "17 existing" that should have
read 14, caused by omitting domain #16 from the closing-prose list while the per-domain table itself
was always correct) was found and corrected in place. No domain's individual classification changed —
only the summary count. Recorded here only for continuity; requires no further management input.

**Full detail:** `ARCH-2026-001-DB-FORENSIC-AND-DOMAIN-RECONCILIATION.md`.

## 6. Summary table

| # | Item | Status | Blocks | Recommendation given? |
|---|---|---|---|---|
| 1 | CEO / technical-admin split (Option A vs B) | **OPEN** | `ARCH-2026-001f` only | No |
| 2 | Integration & Platform scope | **OPEN** | `CR-2026-007` entirely | No |
| 3 | Payroll statutory configuration | **OPEN** | `CR-2026-009` design phase | No (cannot be — legal/statutory, not a design preference) |
| 4 | Sep 19 login provenance | CLOSED (UNIDENTIFIED/UNKNOWN) | Nothing — mitigated by CR-2026-002 | N/A |
| 5 | 26-domain count arithmetic | CLOSED (corrected) | Nothing | N/A |

Items 1-3 remain genuinely open. No implementation proceeds on any blocked item until the
corresponding decision is made and recorded as an update to this document.
