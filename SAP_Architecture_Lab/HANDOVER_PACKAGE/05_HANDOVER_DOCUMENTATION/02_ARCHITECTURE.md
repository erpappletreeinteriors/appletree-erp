# 02 — Architecture

## Layout
```
SAP_Architecture_Lab/
  server/
    domain.js       — all business/accounting logic (single source of truth)
    server.js       — HTTP routes, authentication, authorization
    auth.js         — password hashing (scrypt) and session management
    db.json         — the live database (one flat JSON file)
    backups/        — timestamped backup snapshots
    *_tests.js       — automated regression test suites (30+ files)
  client_secure/
    index.html      — the entire browser UI (thin client, no local logic)
```

## Why one file for the database
Every phase of this project deliberately kept the database as a single JSON file rather than introducing a real database server. This was a conscious choice, not a shortcut: it makes backup trivial (copy one file), makes the whole system reproducible from nothing (delete `db.json`, restart, a fresh seed is generated), and keeps the offline/no-external-dependency requirement genuinely true. See `29_TROUBLESHOOTING.md` for what this means for real-world scale.

## The one accounting engine
Every single accounting-relevant action in this system — a Manual Journal, a Customer Invoice, a Receipt, a GRN, a Fixed Asset capitalization, a Bank allocation — ultimately calls **one function**: `postJournalEntry()` in `domain.js`. This is not an implementation detail; it is the single most important architectural fact about this system. It means:
- Debit=Credit is enforced in exactly one place, so it can never be bypassed by a new feature.
- The Financial Period lock, the annual document numbering, and the audit trail all work automatically for every current and future transaction type, because they are built into this one function.
- There is no possibility of a "second, hidden" accounting system anywhere in this build.

## Request flow
Browser → HTTP request → `server.js` (checks: is this user logged in? does their role allow this action? does their project/customer/branch assignment allow this specific record?) → `domain.js` (does the business rule allow this? is it balanced? is the period open?) → `db.json` is updated → response sent back. Every step is logged if it matters (see `27_AUDIT.md`).

## Error handling
As of Phase 20, the entire request-handling path is wrapped in a safety net: if any single request causes an unexpected error, that one request fails safely (a generic, non-technical error message) and the server keeps running normally for every other user. See `29_TROUBLESHOOTING.md`.
