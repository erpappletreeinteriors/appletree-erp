# ARCH-2026-002 — Resequenced Roadmap

**Date:** 2026-09-26. Deliverable per this CR's own §26. Historical Waves are NOT renumbered. This document
adds an Independent Architecture Track alongside the existing Wave sequence — it does not replace it.

```
Wave 1
CLOSED — 2 items shipped, 2 deferred items remain OPEN (independent, low priority — see RC-3)

Wave 2
CLOSED — 5 SoD rules + 1 audit fix shipped, 6 items remain OPEN (independent, low priority — see RC-4)

Wave 3
CLOSED WITH DOCUMENTED DEFERMENTS — 2 real defects fixed + hardening tests added,
7 items (W3-2..W3-8) + W3-9 remain OPEN, none authorized for coding

Wave 4
PARKED (per this CR's own §2) — Phase 0 complete, Management Decision Gate returned
0/12 answered ("MANAGEMENT DECISIONS OPEN — NOT READY"), Questionnaire awaiting real answers
NO IMPLEMENTATION AUTHORIZED

Wave 5
PARKED / DEFERRED (per this CR's own §2/§5) — blocked entirely on 3 pre-existing decisions
(CEO/Admin split, Integration & Platform scope, Payroll statutory config), none resolved
NO IMPLEMENTATION AUTHORIZED

Independent Architecture Track
RC-1: Test Infrastructure Hardening (the 70/71/70 non-determinism investigation)
AUDIT / DESIGN ONLY — see ARCH-2026-002-NEXT-ACTIVITY-GATE.md
STATUS: SELECTED AS NEXT ACTIVITY, NOT YET STARTED (this CR authorizes design only, not
even this activity's own implementation — see that gate document's own scope)

Independent Architecture Track (queued, not started)
RC-2: Controlling Deepening Design (Cost Allocation / Profit Centre propagation)
AUDIT / DESIGN ONLY — queued behind RC-1, available whenever prioritized

Future Wave 5
DEFERRED — unchanged, no new information this pass

Future Wave 6
PENDING AUTHORITATIVE DEPENDENCY REVIEW — no Phase 0 has been run; depends on Wave 1 (BOM)
and Wave 2 (Inventory) singularity remaining intact, both re-confirmed intact this pass
```

## What this roadmap does NOT do

It does not renumber Wave 4 or Wave 5. It does not imply the Independent Architecture Track is a
replacement wave — it is explicitly a parallel, lower-stakes track that exists only because Waves 4-5 are
currently blocked/parked and the engagement's own architecture-quality goals (test integrity, Controlling
depth) can still be served without touching either. It does not authorize implementation of anything,
including RC-1 itself — see `ARCH-2026-002-NEXT-ACTIVITY-GATE.md`'s own explicit scope boundary.

## Resequencing rationale (per this CR's own §11 objective criteria)

| Candidate | Dependency | Risk | Effort |
|---|---|---|---|
| RC-1 (Test Infrastructure) | LOW | LOW | LOW-MEDIUM |
| RC-2 (Controlling Design) | LOW | LOW | MEDIUM |
| RC-3 (Sales/CRM cleanup) | LOW | LOW | LOW-MEDIUM |
| RC-4 (Manufacturing Plan-to-Produce design) | LOW-MEDIUM (soft Wave-6 relationship) | LOW | MEDIUM |

RC-1 is sequenced first because it has the lowest effort AND the most consecutive, already-accumulated
evidence of being worth resolving (flagged in 3 CRs running). RC-2 is queued directly behind it as the
highest-value remaining item. RC-3/RC-4 remain valid, undiminished candidates for whenever their own
priority rises — neither is rejected, both are simply not selected as the immediate next step.
