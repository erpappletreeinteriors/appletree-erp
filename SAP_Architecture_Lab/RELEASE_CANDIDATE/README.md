# OFFLINE HANDOVER RELEASE CANDIDATE — Phase 20

**This is a release candidate, not a production release.** No production deployment or real data migration has been performed.

## What this is
The complete, tested, documented, offline Appletree ERP build as of Phase 20's completion — see `../HANDOVER_PACKAGE/RELEASE_MANIFEST.md` for exact file checksums, test results, and package contents.

## How to reproduce this exact build from a clean environment
1. Copy `SAP_Architecture_Lab/server/` and `SAP_Architecture_Lab/client_secure/` to the target machine (no other files are required to run it).
2. Replace `server/db.json` with `HANDOVER_PACKAGE/02_DATABASE/HANDOVER_CLEAN_SEED.json` (or delete it — the server generates an equivalent fresh seed automatically on first run if no `db.json` exists).
3. Run `node server/server.js`.
4. Open `http://localhost:4001` and log in with one of the demo accounts listed in `HANDOVER_PACKAGE/05_HANDOVER_DOCUMENTATION/31_ADMIN_GUIDE.md`.
5. To verify the build matches this release exactly, compare SHA-256 checksums of `domain.js`, `server.js`, and `index.html` against `RELEASE_MANIFEST.md`.
6. To verify the build behaves correctly, run every file in `HANDOVER_PACKAGE/03_TESTS/` against a running server — all should report 100% pass, matching `RELEASE_MANIFEST.md`'s stated 1,905/1,905.

## Absolute stop
Per this phase's own instruction: no further feature development, no production deployment, no real data migration, and no online-ERP connection should follow from this release candidate without explicit Appletree management approval. See `HANDOVER_PACKAGE/13_MANAGEMENT_DECISIONS/` for what remains open.
