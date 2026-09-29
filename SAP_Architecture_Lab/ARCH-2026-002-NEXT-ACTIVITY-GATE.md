# ARCH-2026-002 — Next Activity Gate

**Date:** 2026-09-26. Deliverable per this CR's own §27-§28. **Selected next activity: RC-1 — Test
Infrastructure Determinism Investigation.** This document defines that activity's own gate — it does not
perform the activity itself.

## Why RC-1, not RC-2 (per this CR's own §27 evidence-based criteria, not "best")

- **No unresolved management dependency**: zero — RC-1 carries no business-policy content whatsoever.
- **No production risk**: zero — the entire activity is scoped to test tooling/scratch-server behavior,
  never `server/db.json`.
- **No unauthorized implementation**: this gate authorizes AUDIT/DESIGN only (further investigation and,
  if a fix is warranted, a design for one), consistent with this CR's own §9/§32.
- **No conflict with frozen architecture**: none — this activity touches no engine, no route, no schema.
- **Useful architectural value**: closes a genuine, 3-CRs-running open finding that affects confidence in
  this engagement's own regression evidence going forward.
- **Clear scope**: bounded to one test file's one conditional branch and the isolated-server startup
  mechanism it depends on.

RC-2 (Controlling deepening design) remains equally independent and valid but has a larger, less tightly
bounded scope (a full design pass for a genuinely large capability) — queued next, not rejected.

## Purpose

Determine, with actual instrumentation (not just static code reading, which this and the prior CR already
exhausted), why `tests/erp_arch_2026_002_wave3_tests.js`'s [C1] section observes `DB.installations`
non-empty in some fresh-isolated-server runs (1 of 3 to date) and empty in others (2 of 3), despite every
static code path pointing to it always being empty on a genuinely fresh server.

## Scope

- Add temporary, narrowly-targeted instrumentation (e.g., a debug log at server boot recording
  `DB.installations.length` and the exact `DB_PATH`/scratch-directory used) to a DISPOSABLE COPY of the
  test-server/domain code — never the tracked `server/domain.js` itself — OR use Node's own
  `--inspect`/logging without modifying tracked source at all, per this CR's own "no application code
  modification" rule.
- Run the isolated-test-server + wave3-suite sequence enough additional times (a batch of, e.g., 10
  consecutive fresh invocations) to get a statistically meaningful hit-rate rather than 3 anecdotal data
  points.
- Inspect whether the OS temp directory (`os.tmpdir()`) is being fully cleaned between runs, or whether a
  prior run's scratch directory could theoretically still exist and be reused if the timestamp+random-hex
  naming ever collided (near-impossible per the math, but worth an explicit directory-listing check as
  cheap due diligence).
- Check whether the SPECIFIC combination of "port randomly chosen in the 45000-49999 range" ever collides
  with an already-listening leftover process from an EARLIER, improperly-shut-down session in this SAME
  engagement (i.e., not this activity's own runs, but a genuinely orphaned process from days/weeks earlier
  that happens to still be listening on a reused port, silently serving OLD state to a "new" invocation
  that thinks it started a fresh server on that port but is actually talking to a stale one). This is a
  plausible, previously-unconsidered hypothesis worth checking directly (list all node processes and their
  listening ports before each of the batch runs).

## Non-scope

- Does NOT modify `server/domain.js`, `server/server.js`, or `client_secure/index.html`.
- Does NOT change the test file's own assertions, pass/fail logic, or the [C1] section's branching logic.
- Does NOT touch `server/db.json` or any production data.
- Does NOT resolve any Wave 4 or Wave 5 decision.
- Does NOT implement a "fix" — if a root cause is found, the fix itself (if any code change is warranted)
  requires its own separately authorized CR, per this CR's own §9/§34 "audit/design only" rule.

## Dependencies

None on Wave 4 or Wave 5. Depends only on `server/scripts/start-isolated-test-server.js` and
`tests/erp_arch_2026_002_wave3_tests.js`, both already fully readable/runnable today.

## Inputs

`server/scripts/start-isolated-test-server.js`, `tests/erp_arch_2026_002_wave3_tests.js`, this
engagement's own 3 prior data points (71, 70, 70).

## Expected findings (one of)

1. A genuine, previously-unconsidered environmental cause (e.g., a stale orphaned process on a reused
   port from an earlier, improperly-cleaned-up session) — in which case the fix is process-hygiene
   discipline, not a code change.
2. A real, narrow code-level cause not yet identified by static reading alone (e.g., an async timing
   issue in `freshDB()`'s own construction, or in how the server begins accepting requests before its own
   DB initialization fully completes) — in which case a small, well-understood code fix would need its own
   authorization CR.
3. Confirmation that it remains genuinely unexplained even after live instrumentation — in which case the
   finding is downgraded from "investigate further" to "accepted, permanently disclosed test-infrastructure
   quirk," matching this engagement's own established precedent for `erp_059b`'s B6/B7 filesystem-path
   gaps (never fixed, never hidden, permanently documented).

## Deliverables (of the future activity itself, once separately authorized to proceed beyond design)

A short findings report (not yet written — this document is the GATE for that future work, not the work
itself) stating which of the 3 outcomes above occurred, with the batch-run hit-rate data and, if
applicable, a proposed fix for a FUTURE separately-authorized CR to implement.

## Security controls

None required — this activity touches no security-relevant code (RBAC/Scope/SoD/Approval/Audit are
unaffected; the activity is entirely about test-server determinism).

## Production safety

Absolute — every run in this activity uses `server/scripts/start-isolated-test-server.js` exclusively,
never `server/db.json`. Hash must be verified before/after, per this engagement's standing discipline.

## Acceptance criteria (for the future activity, once it proceeds)

- At least 10 consecutive fresh-server runs logged with `DB.installations.length` at boot and the
  [C1]-branch outcome for each.
- A clear statement of which of the 3 "expected findings" outcomes occurred, with evidence.
- If outcome 1 or 2: a specific, named root cause with reproduction steps.
- If outcome 3: an explicit, disclosed "accepted quirk" classification, matching the `erp_059b` precedent.
- Production hash unchanged before/after every run in the batch.
- Zero orphaned processes at completion.

## Stop conditions

- If any run in the batch is found to be silently reading or writing `server/db.json` — STOP immediately,
  this would indicate a serious isolation-boundary defect far beyond this activity's own scope.
- If the investigation reveals ANY application-code change is needed to close the finding — STOP at the
  design/proposal stage; do not implement, per this CR's own absolute rule.

## This gate itself does not authorize the activity's execution beyond design-level investigation

Consistent with this CR's own §28 ("Do not implement") and §34 ("THIS CR DOES NOT BUILD ANYTHING") — this
document defines what the activity WOULD look like; running the actual 10-run instrumentation batch is
the next, still-separate step, explicitly small and low-risk enough that it is offered here as
immediately actionable without requiring yet another formal CR gate, should management wish to proceed —
but nothing above authorizes it to have already started.
