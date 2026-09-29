# ARCH-2026-001C — Open Decisions

**Date:** 2026-09-21. Consolidates every decision this CR deliberately did NOT make silently.

## 1. Warehouse / Cost Centre / Profit Centre / Department scope — OPEN

**Finding:** none of these 4 dimensions has any per-user assignment field or per-record owner field
anywhere in the current data model (confirmed by direct inspection — see
`ARCH-2026-001C-DATA-SCOPE-AUDIT.md` §2).

**Decision needed:** does Appletree want per-user restriction for these dimensions at all? If yes,
who should be assigned to which warehouse/cost centre/profit centre/department? This is a genuine
business-policy question (an org-design decision), not a technical one — this CR cannot answer it
without inventing a relationship the application does not have.

**Blocks:** any future CR proposing Warehouse/Cost-Centre/Profit-Centre/Department scope enforcement
needs this decision made first, plus (likely) new schema fields to carry the assignment.

## 2. Multi-role scope semantics — OPEN (currently N/A)

**Finding:** this codebase has no multi-role assignment capability today — `DB.users.role` is a single
string field, and ARCH-2026-001A's `DB.userRoles` collection is a 1:1 migration mirror of that same
field, not a multi-role grant mechanism.

**Decision needed:** IF a future CR introduces real multi-role assignment (part of the broader RBAC
wave plan), the effective-scope resolution rule (union / intersection / role-priority / explicit
per-assignment scope) must be decided then — not invented now for a capability that doesn't exist.

**Blocks:** nothing today (no multi-role assignment exists to need this rule). Relevant only if/when a
future CR adds multi-role assignment.

## 3. Global/unrestricted default — DECIDED (not open, documented for transparency)

**Decision:** preserve the existing `branchAllowed()` precedent — a user with no scope assignment for
a dimension, or whose role is not the one dimension-restricted role, remains unrestricted for that
dimension. This is NOT a new choice made by this CR; it is the codebase's own pre-existing, working
convention (`branchAllowed()`'s own code comment: "most roles have none set and are unrestricted, same
as today"), now centralized rather than reinvented. A stricter fail-closed default was considered and
explicitly rejected, because adopting it would newly restrict existing users with no assignment —
forbidden by this CR's own §9 absent an explicit frozen-architecture requirement (none exists).
Recorded here for visibility, not because it remains undecided.

## 4. Remaining 68 deferred checks — not blocked, just not completed this CR

**Finding:** the SAME centralized mechanism proven correct for the 10 migrated sites applies
mechanically to the remaining 68 checks (`ARCH-2026-001C-DATA-SCOPE-AUDIT.md` §3.C) — this is not an
unresolved design question, just unfinished migration work, deliberately bounded to keep this CR's own
blast radius reviewable (per this CR's own change-control discipline of proving each migration
individually rather than a blanket rewrite).

**Recommendation:** a future incremental CR (candidate: `ARCH-2026-001C-2` or folded into
`ARCH-2026-001D`'s own scope, management's choice) can migrate the remaining 68 in smaller batches,
each with its own before/after equivalence test, following the exact pattern this CR established.

## 5. Report/Export scope enforcement — disclosed gap, not decided

**Finding:** no report or export endpoint in this application currently applies scope filtering
independently of whatever the underlying list route already does; report endpoints are role-gated,
not scope-gated (`ARCH-2026-001C-DATA-SCOPE-TEST-REPORT.md` §6). This CR did not change any report/
export endpoint and did not build a test proving cross-scope report leakage is impossible.

**Decision needed:** should reports be scope-filtered identically to their underlying list routes? If
yes, this is real, additional migration work for a future CR (candidate: part of the same follow-on
CR as item 4), not something this CR silently assumed either way.

## 6. Summary table

| # | Item | Status | Blocks |
|---|---|---|---|
| 1 | Warehouse/CC/PC/Department scope | **OPEN** | Any future CR proposing enforcement for these dimensions |
| 2 | Multi-role scope semantics | **OPEN (currently N/A)** | Only relevant once multi-role assignment exists |
| 3 | Global/unrestricted default | DECIDED (preserves existing precedent) | Nothing |
| 4 | Remaining 68 deferred checks | Not blocked — incremental future work | A follow-on migration CR |
| 5 | Report/export scope enforcement | **OPEN** | A follow-on migration CR |

No implementation proceeds on any blocked item until the corresponding decision is made.
