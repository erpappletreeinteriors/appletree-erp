# Phase ERP-059A — Baseline

**Date:** 2026-09-10. Part 1 of the ERP-059A Security Remediation phase.

## Git state before any code change

- **HEAD:** `e066c2d73b47006ecd098f175568a6ef4051c5e1` — "Phase 1 Final Cleanup + ERP-059 Forensic
  Gate (documentation only, no code changed)"
- **Parent commits:** `dd78a9e` (Phase 1 Closure Gate), `86c6947` (baseline)
- **Working tree:** clean (`git status --short SAP_Architecture_Lab` returns no output)
- **ERP-059 forensic commit/report on record:** `e066c2d` — full evidence in
  `docs/erp-remediation/phases/PHASE-01-CLOSURE-ERP059-GATE-REPORT.md`,
  `ERP-059-TRANSACTION-ROLLBACK-BLAST-RADIUS.md`

## Source checksums (SHA-256), before any change

| File | Checksum |
|---|---|
| `server/domain.js` | `41fa67f96afb75af9a4a73cb06f492684095f400469e48ec37fd8f4df673efa2` |
| `server/server.js` | `788a38bfad5c261b519ec0e35da5d843eaac91362f242f6b9c34b4d1977bb4ed` |
| `server/auth.js` | `a3da361344728d6cbfaa8aa8ba80975fdd6a7c85d01f61f72731ed06acc89a92` |

## Production database verification

- **Path:** `D:\APPLETREE INTERIORS\Claude\SAP_Architecture_Lab\server\db.json`
- **Current checksum:** `0cf464843ba3e791a3bd405eab59648e776052abdd25f6ef1c9a4a4c4820be9e`
- **Differs from the last-recorded checksum** (`58c8bae7…`, from the prior gate) — verified this
  is fully and only explained by that prior gate's own documented, legitimate action (disposing of
  `DRAFT-0981` via the real Submit→Reject workflow): `journalEntries` count still 1,547, `projects`
  count still 246, and `DRAFT-0981` confirmed `status: "Rejected"`, `postedEntryId: null` — exactly
  matching that gate's final disposition. No unexplained change.
- **Confirmed excluded from git**: `git check-ignore -v server/db.json` →
  `.gitignore:9:**/db.json*` — still in force.

## Disposable test environment

- **Location:** a scratch directory outside the repository (`…/scratchpad/erp059a/server/`),
  containing copies of `domain.js`, `server.js` (port changed to `4093`), `auth.js`,
  `route_safety_scanner.js` — never the real `server/db.json`.
- **Port:** `4093` (confirmed free before starting; confirmed, via `netstat`, that this is the
  *only* process this phase's testing runs against — port `4001`, the real server's port, was
  confirmed to have nothing listening on it throughout).
- **Seed data:** fresh, via the existing `resetToFreshSeed()` mechanism (`/api/test/reset`) —
  never production data.
- **No destructive/security testing will be run against production** — every wrong-password
  attempt, lockout test, and fault-injection test in this phase runs exclusively against this
  disposable server.

## Current ERP-059 behavior (before-state reproduction, Part 2)

Reproduced live against the disposable server:

```
Attempt 1 (wrong password): status=401 ok=false
Attempt 2 (wrong password): status=401 ok=false
Attempt 3 (wrong password): status=401 ok=false
Attempt 4 (wrong password): status=401 ok=false
Attempt 5 (wrong password): status=401 ok=false
Correct password after 5 failures: status=200 ok=true   <- EXPECTED 423, ACTUAL 200 (defect confirmed, unchanged from the forensic gate)
```

Direct database inspection immediately after:

```
user.failedLoginCount: 0     (expected 0 after the 6th, successful, login — but was ALSO 0
                               after each of the 5 failures, never having reached even 1)
user.lockedUntil:      null  (never set)
loginHistory (sales1): 1 entry total — only the final "PASS" record; zero "DENY" records for
                        any of the 5 failed attempts
```

## Current account-lockout behavior (summary)

Identical to the forensic gate's findings — **completely non-functional**. The root cause
(`withTransaction()`'s rollback-on-`ok:false` rule silently erasing the login route's intentional
security bookkeeping) is unchanged since the last gate; no code has been touched between that gate
and this baseline. This document is the formal "before" record this phase's fix will be measured
against.
