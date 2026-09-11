# ERP-059C — Safety Test Report

**Date:** 2026-09-10/11. Step 9 of Phase ERP-059C. Permanent test file:
`tests/erp_059c_production_isolation_tests.js`. This is a safety test, not a production-data test:
it spawns its own two disposable server instances against their own scratch `DB_PATH` files under
the OS temp directory — it never touches `server/db.json`. See
`ERP-059C-PRODUCTION-SAFETY-REPORT.md` for the full account of an early draft's methodology bug and
its resolution, before this final, corrected version was written.

## What this test proves

It directly reproduces the incident's own precondition — an authenticated Admin session on a
server nobody configured as anything in particular — and confirms the new mechanism blocks the
exact action that caused the incident, while leaving the legitimate test path fully functional.

Two real server instances are spawned by the test itself:
- **"Production-shaped" instance**: `APP_ENV` deliberately left UNSET (the fail-closed default),
  its own disposable `DB_PATH`, port 4098.
- **`APP_ENV=test` instance**: explicitly configured, its own disposable `DB_PATH`, port 4099.

## Results — 10/10 PASS

| # | Assertion | Result |
|---|---|---|
| 1 | Unset-`APP_ENV` instance reports `appEnv:"production"` via `/api/system/environment` (fail-closed default, not a guess) | **PASS** |
| 2 | `APP_ENV=test` instance reports `appEnv:"test"`, destructive endpoints enabled | **PASS** |
| 3 | Admin login SUCCEEDS on the production-shaped instance — proves the new guard is a SEPARATE, additional gate, not an authentication bypass | **PASS** |
| 4 | Setup: a real marker lead record is created on the production-shaped instance, to prove against | **PASS** |
| 5 | **Core assertion** — `/api/test/reset` is REJECTED (403) on the production-shaped instance despite the valid Admin session from step 3 | **PASS** |
| 6 | No production-shaped-instance mutation occurred: the marker record from step 4 still exists after the blocked reset attempt (not merely a cosmetic error — genuinely no reset happened) | **PASS** |
| 7 | A clear, durable diagnostic audit entry (`DestructiveTestEndpointBlocked`) explains why execution was blocked, correctly attributed to the real actor (`userId:"U-ADMIN"`, not anonymous) | **PASS** |
| 8 | Every OTHER destructive test-only endpoint (`set-fault`, `set-crash`, `set-enforce-transaction-boundary`, `set-skip-rollback`) is also rejected (403) on the production-shaped instance, not just `/api/test/reset` | **PASS** |
| 9 | The IDENTICAL `/api/test/reset` call SUCCEEDS on the real `APP_ENV=test` instance — proves this is a genuine environment gate, not a global kill-switch that would also silently break legitimate test infrastructure | **PASS** |
| 10 | Normal application endpoints (`/api/trial-balance`) remain unaffected on the production-shaped instance — no over-blocking | **PASS** |

```
================ ERP-059C PRODUCTION-TARGET REJECTION TEST ================

✅ PASS | 1. Unset-APP_ENV instance reports appEnv="production" (fail-closed default)
✅ PASS | 2. APP_ENV=test instance reports appEnv="test", destructive endpoints enabled
✅ PASS | 3. Admin login succeeds on the production-shaped instance (proves the guard is NOT an auth bypass — it is a separate, additional gate)
✅ PASS | 4. Setup: created a real marker record on the production-shaped instance to prove against
✅ PASS | 5. /api/test/reset is REJECTED (403) on the production-shaped instance despite a valid Admin session
✅ PASS | 6. No production DB mutation occurred: the marker record created in step 4 still exists after the blocked reset attempt
✅ PASS | 7. A clear diagnostic audit entry explains why execution was blocked, attributed to the real actor
✅ PASS | 8. Every other destructive test-only endpoint is also rejected (403) on the production-shaped instance
✅ PASS | 9. The identical /api/test/reset call SUCCEEDS on the real APP_ENV=test instance (the gate is a real environment check, not a broken/always-off switch)
✅ PASS | 10. Normal application endpoints remain unaffected (e.g. /api/trial-balance still works on the production-shaped instance)

================ 10 PASS / 0 FAIL / 10 TOTAL ================
```

## What this test does NOT claim

- It does not touch, and cannot touch, the real `server/db.json` — both spawned instances use
  disposable `DB_PATH` files under the OS temp directory, cleaned up automatically by the OS in the
  ordinary course (not explicitly deleted by the test, since they are ephemeral scratch data with no
  retention need).
- It does not test the 8 frozen `PHASE*_CHECKPOINT/` snapshots (out of scope, see the isolation
  report's residual risks).
- It does not test `/api/demo/seed-scenario`, which was deliberately left outside this phase's guard
  (see the isolation report's "Scope question left open").

## Diagnostic clarity confirmed

Step 9 required "a clear diagnostic explains why execution was blocked." The actual rejection
response body, captured live during this test:

```json
{
  "ok": false,
  "error": "Destructive test endpoint \"/api/test/reset\" is disabled outside APP_ENV=test (current APP_ENV: \"production\").",
  "durableFailureAudit": { "type": "DestructiveTestEndpointBlocked", "path": "/api/test/reset", "appEnv": "production" }
}
```

And the durable audit record it produced:
```json
{
  "id": "AUD-000001",
  "type": "DestructiveTestEndpointBlocked",
  "path": "/api/test/reset",
  "appEnv": "production",
  "userId": "U-ADMIN",
  "role": "Admin",
  "at": "2026-09-10T13:21:15.544Z"
}
```

Both the client-facing error and the durable audit trail name the exact endpoint, the exact reason,
and the exact configured environment — sufficient for an operator to immediately understand why a
request was refused, without needing to inspect server logs.
