# ARCH-2026-001 — Sep 19 CEO Login Provenance Investigation

**Date:** 2026-09-21. INVESTIGATION ONLY. No application code, `db.json`, backups, locks, roles,
permissions, or production data were modified to produce this document.

## Method — evidence sources checked, in order

1. **Live process table** — `Get-Process -Id 4300`: no result. PID 4300 is not running (expected,
   2 days elapsed; not informative either way).
2. **Windows Security event log (process creation, event ID 4688)** — queried for
   2026-09-19T08:00–11:00: no events returned. This is inconclusive, not a negative finding —
   process-creation auditing is not enabled by default on non-domain-joined Windows systems, and no
   evidence confirms it was enabled here. This source is unavailable, not exhausted-and-empty.
3. **PSReadLine PowerShell history** (`ConsoleHost_history.txt`, persists commands typed in an
   interactive PowerShell session across restarts): last write time **2026-08-31**, three weeks
   before the event. No command in this history file corresponds to the Sep 19 window.
4. **Bash history**: `~/.bash_history` does not exist on this system.
5. **`server/db.json.lock` content**: `{"pid":4300,"startedAt":"2026-09-19T09:24:49.614Z"}` —
   confirms a server process started 10.2 seconds before the login, but carries no user/session
   identity.
6. **`.claude/projects` directory-level scan** (all projects, all users of this machine's Claude
   Code installation): two unrelated project folders (`D--Dtale-Images`, `D--Customer-Drawings`)
   showed a directory-level modify time of Sep 19 14:56 (≈1 minute after the login). Investigated and
   **ruled out**: directory mtimes reflect new files being created inside a folder, not in-place edits
   to an existing session file, so this is consistent with unrelated session activity in unrelated
   projects at a similar time of day — not evidence connecting those projects to this event. Their
   contents were not opened (out of scope and unrelated by name).
7. **Session transcript `accec146-1650-4a3a-ac3b-790cd9ad8aaa.jsonl`** (created Sep 19 14:56, closest
   session-start time to the login): searched in full for `sap-lab-secure` and `server.js` —
   **zero matches**. This session never referenced the SAP_Architecture_Lab server at all. Ruled out.
8. **Session transcript `b19315b9-87c2-4e50-82f9-b7fd3c2bee15.jsonl`** (58,000+ lines, the session
   that authored the parallel Phase 42/43 call-graph work, and which does reference `sap-lab-secure`
   and port 4001 elsewhere in its history): every line's `timestamp` field was parsed and checked —
   **zero lines timestamped on 2026-09-19 anywhere in the entire transcript**. The `sap-lab-secure`
   references found in this file are dated **2026-08-23**, unrelated to this event. This session's
   own file-level modify time (Sep 20 08:58) reflects later, different-day activity. Ruled out as the
   source of the Sep 19 event specifically.
9. **This session's own transcript `142c9455-ba13-420b-a974-acb27c18f09f.jsonl`**: every line's
   `timestamp` checked for the `2026-09-19T09:2x` window. The earliest activity in that window is at
   **09:26:52 UTC** (a session-resumption sequence: `queue-operation`/`user`/`attachment`/`frame-link`
   entries, consistent with this long-running session waking up after being idle) — **nearly two
   minutes after** the login (09:24:59) and the process start (09:24:49). Nothing in this session's
   own history falls inside the 09:24:49–09:24:59 window itself. This session did not use the bare
   `sap-lab-secure` config at any point in its own history (every server start this session performed
   used an explicit scratch-directory copy with `APP_ENV=test`/`DB_PATH` set, per its own documented
   pattern) — ruled out as the direct cause.
10. **Machine-wide scan of every `.jsonl` session transcript under `~/.claude/projects`** (every
    project, not just this one) for the literal timestamp substring `2026-09-19T09:2[0-5]`: the only
    match is this session's own file, and that match is a **false positive caused by this very
    investigation** — my own tool calls embedded the string `"2026-09-19T09:24:59.832Z"` (the
    `loginHistory` record itself, quoted while investigating it) into my own transcript, which the
    scan then matched against itself. No independent session anywhere on this machine shows genuine
    activity in the 09:24:49–09:24:59 UTC window.

## A. Attribution: **UNIDENTIFIED**

No surviving Claude Code session transcript, process log, command history, or Windows security event
places any specific person, session, or process at the keyboard during the 09:24:49–09:24:59 UTC
window on 2026-09-19. The architectural fact established in the prior report (this file path is the
production-default `DB_FILE` resolution for an unparameterized `sap-lab-secure` launch) explains
*how* a plain, no-env-vars server start would write to this exact file — it does not, and cannot,
establish *who* ran that command. Per this task's own explicit instruction, this is reported as
UNIDENTIFIED rather than inferred from the `ceo` username or from architectural plausibility alone.

## B. Authorized activity: **UNKNOWN**

Follows directly from A — authorization cannot be assessed for an unidentified actor. This is not a
finding that the activity was unauthorized; it is a statement that the available evidence does not
support a determination either way.

## C. Data-integrity impact: **NONE**

Re-confirmed fresh this task: a full structural diff of `server/db.json` against `server/db.json.bak`
still shows **exactly one differing collection** (`loginHistory`, 8→9 entries) and **zero** differing
collections elsewhere — identical to the prior report's finding, confirming this investigation itself
introduced no further change. The single new record was not altered, deleted, or reset during this
task, per the task's own explicit instruction.

## D. ERP-059B impact: **NONE**

Unchanged from the prior report — no collection ERP-059B affected (`glDocumentTypes`, `projects`, or
any accounting/inventory data) differs between the pre- and post-event snapshots.

## E. Evidence used

Live process table (negative/inconclusive) · Windows Security event log 4688 query (unavailable) ·
PSReadLine history file (negative, 3 weeks stale) · bash history (does not exist) ·
`server/db.json.lock` (positive: PID + precise start timestamp, no identity) ·
`.claude/projects` directory-level timestamp scan (weak coincidence, investigated and ruled out) ·
full-text search of the temporally-closest session transcript (ruled out) · full-timestamp parse of
the parallel Phase-42/43-authoring session's entire transcript (ruled out — no Sep 19 activity at
all) · full-timestamp parse of this session's own transcript (ruled out — nearest activity is ~2
minutes after the event, in the wrong direction) · machine-wide timestamp-substring scan of every
session transcript on the system (no independent corroboration found; the only hit was this
investigation's own self-reference).

## F. Remaining uncertainty

- **No source establishes who or what started the server.** The two most plausible categories of
  explanation given the architectural evidence (§B of the prior report) — a person running the
  standard `sap-lab-secure` launch entry directly (e.g., from an IDE's own run button, a terminal
  outside Claude Code, or a scheduled/automated process) — would each leave no trace in any of the 10
  evidence sources checked above. This investigation has exhausted every readily-available forensic
  source on this machine; it has not proven no explanation exists, only that none is currently
  recoverable.
- **Windows process-creation auditing status is itself unconfirmed** — if it is or was enabled with a
  larger retention window than queried, a narrower or differently-scoped query might still surface
  something; this was not exhaustively tested (e.g., other event IDs, other logs, Sysmon if
  installed) since the initial 4688 query against the Security log returned nothing and no
  installed alternative logging tool was identified during this pass.
- **The event's low severity (a single successful login, zero data mutation) is established with
  confidence (§C, §D); the event's origin is not.** These are independent findings — do not read the
  low-severity finding as implying the origin question is resolved.
