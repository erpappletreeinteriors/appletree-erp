# ARCH-2026-002 — Wave 4 Sub-wave Plan

**Date:** 2026-09-26. Deliverable per this CR's own §17 — review (not automatic adoption) of the proposed
4A-4E structure from `ARCH-2026-002-WAVE-4-DESIGN.md`.

## Review of each proposed sub-wave

### Sub-wave 4A — Hygiene closures
- **Purpose (as proposed):** CAPA source-ID validation, 6 missing audit-log calls, duplicate-billing
  guard.
- **Included requirements:** 3 items.
- **Dependencies:** none.
- **Management decisions required:** the Design doc originally bundled duplicate-billing here as
  "no business-policy content" — **this gate's own Gap Disposition disagrees** and reclassifies
  duplicate-billing as POLICY DEPENDENT (the exact rule/granularity, W4-7, is a real choice this CR's own
  text requires be picked from source-document options, not defaulted). CAPA source-ID validation and the
  6 audit-log calls remain zero-policy-content.
- **Security impact:** low, closes disclosed gaps.
- **Accounting impact:** none.
- **Inventory impact:** none.
- **Project-cost impact:** none.
- **Migration impact:** none.
- **Testing scope:** small, additive, per `ARCH-2026-002-WAVE-4-ACCEPTANCE-CRITERIA.md`.
- **Classification: MODIFY.** Remove duplicate-billing from this sub-wave (it is POLICY DEPENDENT, not
  hygiene); retain CAPA source-ID validation and the 6 audit-log calls, matching this gate's own
  Implementation Scope document exactly.

### Sub-wave 4B — Reporting-depth additions (technician persistence + Cost Centre tag)
- **Purpose (as proposed):** close Data-Model Gap Register items 1-2.
- **Included requirements:** `technicianId` persistence, `CC-SERVICE` Cost Centre tagging.
- **Dependencies:** none technically, but per this gate's own Gap Disposition, BOTH require an actual
  management decision first (W4-11) — the Design doc's original framing ("low business-policy content,
  mirrors W3-9 precedent") is not adopted here, because this CR's own §9 GAP 3/GAP 4 text explicitly
  cautions against defaulting toward implementation for exactly these two items ("Do not assume payroll
  integration"; "Do not automatically propagate Cost Centre merely because the architecture supports Cost
  Centres elsewhere").
- **Security/Accounting/Inventory/Project-cost impact:** none under either decision outcome.
- **Migration impact:** none for new records; historical entries cannot be retrofitted either way.
- **Testing scope:** would be small if authorized.
- **Classification: DEFER** (pending W4-11's management decision — not rejected, simply not yet
  actionable).

### Sub-wave 4C — SoD expansion (Complaint/Ticket/AMC, contingent on W4-8/W4-9)
- **Purpose:** new `checkSoD()` rules mirroring SOD-7 through SOD-11.
- **Included requirements:** 3 new rule candidates (Complaint, Ticket, AMC) plus the diagnosis-threshold
  question.
- **Dependencies:** W4-8 (exemption policy) and W4-9 (threshold-sufficiency question), both OPEN.
- **Management decisions required:** yes — both.
- **Security impact:** would close real, disclosed, non-CRITICAL gaps if authorized.
- **Accounting/Inventory/Project-cost impact:** none.
- **Migration impact:** none — reuses a fully-proven pattern.
- **Testing scope:** would mirror Wave 2's own proven SOD-7..11 test pattern exactly, including the
  established actor-substitution fix for any pre-existing fixture that becomes a maker≠checker pair.
- **Classification: DEFER** (pending W4-8/W4-9's management decisions).

### Sub-wave 4D — Warranty accounting treatment (contingent on W4-6)
- **Purpose:** provision/reserve accounting for warranty material, if authorized.
- **Included requirements:** 1 item, explicitly the most architecturally significant in this register.
- **Dependencies:** W4-6, a genuine accounting-policy decision requiring its own dedicated design pass —
  not detailed further even at the design level until decided.
- **Management decisions required:** yes.
- **Security impact:** none.
- **Accounting impact:** significant if authorized (new GL account, timing-of-recognition change).
- **Inventory/Project-cost impact:** would change WHEN warranty cost hits project P&L.
- **Migration impact:** significant if authorized — unassessable until the decision itself is made.
- **Testing scope:** cannot be scoped until decided.
- **Classification: DEFER** (pending W4-6, and pending its own follow-up design pass even after a decision
  is made).

### Sub-wave 4E — Convenience automation (contingent on W4-1/W4-2/W4-3/W4-4/W4-5)
- **Purpose:** warranty template/master, diagnosis-to-eligibility automation, AMC schedule
  auto-generation, Resolution SLA + Warning threshold, rate-card-to-posting linkage.
- **Included requirements:** 5 independent items, each gated on its own product/policy decision.
- **Dependencies:** W4-1, W4-2, W4-3, W4-4, W4-5 — all OPEN.
- **Management decisions required:** yes, 5 separate ones.
- **Security/Accounting/Inventory/Project-cost impact:** varies by item, none assessable until each
  decision is made (see `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md` for each item's own impact
  fields).
- **Migration impact:** none for W4-1/2/3/4 under any option explored; W4-5 is additive regardless.
- **Testing scope:** cannot be scoped until each decision is made.
- **Classification: DEFER** (pending 5 separate management decisions; lowest urgency, matches the Design
  doc's own sequencing rationale).

## Adopted structure

| Sub-wave | Original proposal | This gate's review | Final classification |
|---|---|---|---|
| 4A | Hygiene closures (3 items) | Duplicate-billing removed (reclassified POLICY DEPENDENT) | **MODIFY** — 2 items remain (CAPA validation, 6 audit-log calls) |
| 4B | Reporting-depth additions | Both items reclassified POLICY DEPENDENT per explicit CR caution | **DEFER** |
| 4C | SoD expansion | Unchanged — already correctly framed as contingent | **DEFER** |
| 4D | Warranty accounting | Unchanged — already correctly framed as contingent | **DEFER** |
| 4E | Convenience automation | Unchanged — already correctly framed as contingent | **DEFER** |

**No sub-wave is REJECTED** — every proposed item remains a legitimate candidate for a future CR once its
gating decision is made. **No sub-wave is ADOPTED outright** — even the modified 4A (2 items) requires its
own separate implementation-authorization CR, per this gate's own §24/§28 rule that this document does not
itself authorize anything.

**Management must approve this final structure (or a revised one) before any sub-wave proceeds**, per this
CR's own §17 closing instruction.
