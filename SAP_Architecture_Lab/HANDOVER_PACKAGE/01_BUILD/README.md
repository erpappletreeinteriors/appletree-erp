# Build

The actual source code lives at the repository root under `SAP_Architecture_Lab/`:
- `server/domain.js` — all business/accounting logic
- `server/server.js` — HTTP routes, authentication, authorization
- `server/auth.js` — password hashing, session management
- `client_secure/index.html` — the browser UI

This folder is a pointer, not a copy, to keep the handover package small — the actual build stays in place at `SAP_Architecture_Lab/`. See `RELEASE_MANIFEST.md` (one level up) for exact file checksums at the time of this release.

## To run
```
node SAP_Architecture_Lab/server/server.js
```
Then open `http://localhost:4001`.

## Zero external dependencies
This build uses only Node.js's built-in `http` and `crypto` modules — no `npm install` is required, no `package.json` dependencies to manage or go stale.
