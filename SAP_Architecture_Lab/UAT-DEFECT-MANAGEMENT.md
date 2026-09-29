# UAT Defect Management Process

**Date:** 2026-09-16. Governs how defects and change requests found during UAT are identified,
logged, and dispositioned — extending the same controlled-change-management discipline already
established for engineering work (`CONTROLLED_CHANGE_REGISTER.md`) into the UAT cycle itself.

## ID scheme

- **`DEF-YYYY-NNN`** — a genuine functional defect (the system does something incorrect).
- **`CR-YYYY-NNN`** — an approved change (a scope addition, a display/label correction, a
  business-decision-driven update).
- **`ARCH-YYYY-NNN`** — an architecture-level matter (requires its own impact analysis before any
  code is touched, per the Phase 41 change-management workflow).

**`DEF-2026-002` is not reused.** It remains logged in `CONTROLLED_CHANGE_REGISTER.md` as **OPEN /
UNAUTHORIZED** — a pre-existing, unrelated, low-severity test-harness defect (a stale test script,
not a production defect) discovered during DEF-2026-001's own investigation. UAT testers do not need
to interact with it; it does not affect any UAT scenario in this pack.

## What UAT testers should do when something looks wrong

1. **Do not modify data to work around it.** UAT users must never directly edit `server/db.json` or
   any database record to "fix" an apparent problem — that would corrupt the very evidence a real
   defect report needs, and this system's own standing rule is that production data is never a test
   fixture.
2. **Record it on the test case.** Use the `Actual Result` / `Pass/Fail` / `Defect ID` columns in
   `UAT-TEST-CASES.csv` (or the equivalent fields in whatever tracking tool Appletree uses for the
   real UAT cycle).
3. **Classify severity** using the same scale this engagement has used throughout (P0 catastrophic/
   corruption/bypass, P1 critical financial/control/security, P2 material business/control defect, P3
   moderate, P4 minor/cosmetic) — or Appletree's own CRITICAL/HIGH/MEDIUM/LOW scale if preferred, kept
   consistent within one UAT cycle.
4. **Distinguish defect types honestly**, per Section 15 of the authorizing brief:
   - **Production defect** — the implemented system behaves incorrectly.
   - **Test-harness defect** — the TEST itself (script, fixture, expected value) is wrong, not the
     product (see `DEF-2026-002` as the working example of this category).
   - **Documentation defect** — the SOP/User Manual/Terminology Standard says something the system
     doesn't actually do.
   - **Architectural gap** — a genuinely absent capability (see `UAT-KNOWN-LIMITATIONS.md`), not a
     bug in something that exists.
   - **Business-policy decision** — the system does something consistently, but whether that's the
     RIGHT business behavior is Appletree's call, not a code defect (e.g., the MRQ rename question,
     or the billing-milestone-reversal Option A/B question).
   - **Operational/deployment issue** — something about how the UAT instance itself is configured or
     run, not the application code.
5. **Do not label a missing feature a defect** unless the approved business requirements actually
   require it — see `UAT-KNOWN-LIMITATIONS.md`'s own NOT APPLICABLE / FUTURE ROADMAP classifications.

## Disposition workflow (mirrors the engineering change-management workflow)

```
UAT scenario fails
        |
Tester logs it in the test case (Actual Result, Pass/Fail=FAIL)
        |
Classify: production defect | test-harness defect | documentation defect
          | architectural gap | business-policy decision | operational issue
        |
If production defect -> assign a new DEF-YYYY-NNN, log in CONTROLLED_CHANGE_REGISTER.md as OPEN
        |
Engineering follows the SAME controlled workflow already established:
  investigate -> reproduce in isolation -> root-cause -> minimal fix -> targeted test ->
  regression -> production-safety verification -> documentation -> close
        |
Defect re-verified by the ORIGINAL UAT scenario, not just the engineering test
        |
Status updated: OPEN -> INVESTIGATING -> FIXED -> VERIFIED -> CLOSED
```

## What this UAT cycle must NOT do

- Fix defects itself without going through the same authorized-change workflow every other change on
  this codebase has followed since the Phase 41 baseline.
- Treat a UAT tester's report as automatic authorization to modify code — a defect report is an
  INPUT to a change request, not the change request itself.
- Reopen or attempt to resolve the historical production database incident as a side effect of a UAT
  defect — that incident's status is tracked separately (see `UAT-READINESS-REPORT.md` Section 14)
  and requires its own explicit authorization.

## Evidence standard

Every defect closure must show the same evidence this engagement has required throughout: a real
reproduction (not assumed), a minimal fix, a targeted test proving the fix, a full regression run
showing zero new failures, and explicit confirmation that no production data was touched — exactly
the pattern `DEF-2026-001-INVESTIGATION.md` / `DEF-2026-001-FIX-LOG.md` / `DEF-2026-001-TEST-REPORT.md`
already demonstrate as the working template.
