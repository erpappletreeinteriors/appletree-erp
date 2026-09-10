# 06 — Security

## Authentication
- Passwords are hashed with scrypt (Node's built-in, industry-standard) — never stored or logged in plain text.
- Sessions use a 256-bit random token in an HttpOnly cookie (JavaScript in the browser cannot read it), expiring after 2 hours of inactivity.
- 5 failed login attempts locks the account for 15 minutes.
- Strong password policy enforced on creation/reset: 8+ characters, upper, lower, digit, special character.

## Authorization
Every single action is checked server-side against the role table in `05_USER_ROLES.md` — confirmed by direct testing that bypasses the UI entirely and calls the API directly with every role, for every sensitive action (over 1,000 role×action combinations tested, all passing).

## ID tampering
A user cannot access another user's or another project's data by guessing or editing an ID in a request — every lookup re-checks the actor's own scope, not just whether the record exists. 47 dedicated tests confirm this.

## What was specifically re-verified in Phase 20 (final security audit)
- No client-supplied value can ever set a user's own role, ID, or approval authority — these are always derived from the server-side session, never from the request body.
- No hardcoded secrets, API keys, or credentials exist anywhere in the codebase (only the disclosed, intentional demo/test account passwords listed in `31_ADMIN_GUIDE.md`).
- No debug or backdoor endpoint exists — every `/api/test/*` endpoint is Admin-only and clearly labeled as test infrastructure.
- **A real defect was found and fixed**: the server had no top-level error handler — a single malformed request could, in principle, hang or crash the whole process for every user. Fixed by wrapping every request in a safety net that returns a clean error and keeps the server running (see `29_TROUBLESHOOTING.md`).

## Field-level security
Some fields are not just hidden in the UI — they are genuinely absent from the API response for roles that shouldn't see them (e.g., a customer's outstanding balance is never sent to the Purchase role at all, not merely hidden by CSS).

## What this security model does NOT cover
This is a single-machine, offline system with no network exposure by design. It has not been penetration-tested against network-level attacks, since it is never meant to be exposed to a network. If this system is ever connected to a network, a fresh security review specific to that deployment is required — that is out of scope for this offline handover.
