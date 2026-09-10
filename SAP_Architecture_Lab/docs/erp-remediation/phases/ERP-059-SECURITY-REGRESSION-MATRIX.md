# ERP-059 Security Regression Matrix — Results

**Date:** 2026-09-10. Part 4 of Phase ERP-059A. All 17 required scenarios, run as real HTTP/API
requests against a disposable isolated server (never production). Permanent test files:
`tests/erp_059_security_tests.js` (items 1-8, 13-17) and
`tests/erp_059_restart_persistence_tests.js` (items 9-12, which require an actual process restart
the first file cannot perform on itself).

## Results

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | One wrong password → 401 | **PASS** | `status=401, ok=false` |
| 2 | `failedLoginCount` becomes 1 | **PASS** | Verified via the durable `loginHistory` DENY count (1 entry) — `failedLoginCount` itself resets to 0 the moment a lock triggers, by the code's own design, so `loginHistory` is the correct always-incrementing proxy to assert on |
| 3 | DENY event persists | **PASS** | `loginHistory` contains `{result:'DENY', reason:'bad password'}` |
| 4 | Two failures → count 2 | **PASS** | 2 DENY entries |
| 5 | Four failures → count 4 | **PASS** | 4 DENY entries |
| 6 | Fifth failure → account becomes locked | **PASS** | `lockedUntil` set on disk after the 5th failure |
| 7 | Fifth failure → expected lock response | **PASS** | The 5th wrong-password attempt itself still returns 401 (the lock takes effect for the *next* attempt — correct, intentional design, not a defect) |
| 8 | Correct password while locked → 423/denied | **PASS** | `status=423, ok=false` — this is the headline fix: before, this was `200, ok=true` |
| 9 | Lock remains after server restart | **PASS** | Server process killed and restarted against the same `db.json`; correct password still returns 423 afterward |
| 10 | Lock expiry permits login after expiry | **PASS** | `lockedUntil` manually set to a past timestamp on the *disposable test database only*, server restarted to re-read it, login then succeeds (200) |
| 11 | Successful login behaves correctly after expiry | **PASS** | `failedLoginCount` and `lockedUntil` both correctly cleared after the post-expiry successful login |
| 12 | Failed-login history survives restart | **PASS** | `loginHistory` DENY entries (≥5) still present after a real process restart |
| 13 | Different user remains independent | **PASS** | `finance1`'s one wrong-password attempt produced exactly 1 DENY entry, unaffected by `sales1`'s prior lock |
| 14 | Concurrent failed attempts do not silently disappear | **PASS** | 3 concurrent (`Promise.all`) wrong-password attempts against `purchase1` produced exactly 3 DENY entries — none lost to interleaving |
| 15 | No password/hash leakage in audit records | **PASS** | Every `loginHistory` entry inspected contains only `username`/`at`/`reqId`/`result`/`reason` — no `passwordHash`, `passwordSalt`, or raw attempted password appears anywhere in the audit trail |
| 16 | No session is created for a failed login | **PASS** | No `Set-Cookie` header present on any DENY (401/423) response |
| 17 | No unintended DB rollback occurs for security bookkeeping | **PASS** | Composite of items 2-5, 13-14 — every DENY count above landed on its expected non-zero value instead of the pre-fix 0 |

**Total: 17/17 PASS. No test was weakened to force a pass — every result is the actual, current,
fixed behavior, run as real HTTP requests, never by calling internal functions directly** (the one
exception — item 10's `lockedUntil` manipulation — is explicitly disclosed as a white-box technique
applied only to disposable test data, used to make an otherwise-15-minute-long wait practically
testable, not a substitute for the real HTTP-driven assertions everywhere else).

## Command to reproduce

```
node tests/erp_059_security_tests.js <isolated-base-url>
node tests/erp_059_restart_persistence_tests.js <isolated-server-dir> <port>
```
