# ARCH-2026-001D — Open Decisions

**Date:** 2026-09-21. Consolidates decisions this CR deliberately did not make silently.

## 1. No CEO/Admin exemption on SOD-5/SOD-6 — the central open decision of this CR

**Finding:** unlike the pre-existing, approved SOD-2/SOD-4 exemptions (CEO/Admin explicitly bypass
the maker/checker/executor and Snag verifier/resolver rules), the 2 NEW rules this CR implements carry
**no automatic exemption for any role**. This was a deliberate choice, not an oversight — per the
task's own §17 ("Do not assume that Admin/CEO automatically bypasses SoD... any exemption must come
from approved policy"), and no approved policy exists yet for these 2 new rules.

**Real operational consequence:** in a small company, the CEO may legitimately be the person who
onboards a new vendor AND authorizes its first payment, especially early in a relationship or for a
low-value/low-risk vendor. As implemented, this CR's SOD-5 rule will BLOCK that combination for the
SAME vendor — confirmed live in the Browser UAT (§4).

**Decision needed:** should Appletree's management:
- (a) Accept the block as designed — a real CEO who needs to do both must ask a different Admin/CEO
  user to grant a documented, audited exception via `POST /api/sod/exceptions` (the mechanism already
  built and tested)?
- (b) Request a standing, pre-approved exemption for CEO/Admin on SOD-5/SOD-6, matching the existing
  SOD-2/SOD-4 pattern — which would require its own explicit authorization and a follow-on CR (this CR
  does not implement it, per §17's own instruction not to assume it)?
- (c) Some narrower policy (e.g. exempt only below a rupee threshold, mirroring the existing Approval
  Authority tiering pattern) — which would be new Approval-Authority-adjacent design, explicitly out
  of THIS CR's scope (§28: "Do NOT implement Approval Authority").

**Not decided by this CR.** The exception mechanism (`grantSoDException`/`revokeSoDException`) exists
and is fully tested either way — whatever management decides, no further code change is needed to
grant a SPECIFIC, documented exception; only a BLANKET role-level exemption would require new code.

## 2. Role-level vs user-level SoD evaluation — resolved for this codebase, not invented

Confirmed: this codebase has no multi-role capability, so "role-level" and "user-level" evaluation are
structurally identical here (§10 of the task brief's own escape valve: "if the architecture does not
specify... document as open decision rather than silently choosing" — this was NOT silently chosen;
it is the only level the data model supports). If a future CR introduces multi-role assignment, the
union/intersection/priority question for SoD purposes would need to be decided THEN, not now.

## 3. Additional P2P rules beyond SOD-5/SOD-6 — not proposed, not blocked

The audit (`ARCH-2026-001D-SOD-AUDIT.md` §3) found exactly 2 real, evidenced role-capability overlaps
in the current P2P chain. Other textbook SoD pairings (PO creator vs PO approver, RFQ/Comparison
creator vs PO approver) were checked and found to be either already covered by the existing Approval
Authority self-approval logic (not an SoD gap) or not evidenced as a real overlap in the current role
model. No further rule is proposed as pending — if a real gap is found later, it should go through the
same evidence-first process this CR used, not be assumed to exist.

## 4. Summary table

| # | Item | Status | Blocks |
|---|---|---|---|
| 1 | CEO/Admin exemption on SOD-5/SOD-6 | **OPEN** | A blanket exemption would need a follow-on CR; a per-user documented exception can be granted today via the existing mechanism |
| 2 | Role-level vs user-level SoD | Resolved (structurally identical in this codebase) | Only relevant if multi-role assignment is ever introduced |
| 3 | Additional P2P rules | Not proposed (no evidenced gap found) | A future audit, if a real overlap is found |

No implementation proceeds on item 1's blanket-exemption option until management decides.
