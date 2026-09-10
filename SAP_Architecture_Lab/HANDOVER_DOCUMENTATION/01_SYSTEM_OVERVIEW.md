# 01 — System Overview

## What this is
An offline, SAP-architecture-inspired ERP built specifically for Appletree Interiors, covering the full business cycle: Lead → Estimation → Quotation → Project → Procurement → Manufacturing → Site Execution → Billing → After-Sales (Warranty/Service/AMC) → Fixed Assets → Bank Reconciliation, all on a single, real double-entry accounting engine.

## What this is NOT
- Not connected to the internet, any cloud service, or any external system.
- Not the Appletree production ERP — a completely separate, isolated build (`SAP_Architecture_Lab/`).
- Not pre-loaded with real Appletree business data. Every customer, supplier, account, and balance you see on a fresh install is either a development placeholder or genuinely empty, waiting for your real data (see `09_MASTER_DATA_IMPORT.md` and `10_OPENING_BALANCE_IMPORT.md`).

## How it is built
- **Backend**: Node.js, zero external npm dependencies (built-in `http` and `crypto` modules only). One process, one file-backed database (`server/db.json`).
- **Frontend**: a single HTML page (`client_secure/index.html`) that calls the backend's API — it holds no business logic and no local copy of the data.
- **Everything server-side is authoritative.** The browser cannot bypass a rule by editing the page — every check (who can post, who can see what, whether a period is closed) is enforced on the server, proven repeatedly by direct-API and ID-tampering tests throughout this project's development.

## How to run it
```
node SAP_Architecture_Lab/server/server.js
```
Then open `http://localhost:4001` in a browser. See `31_ADMIN_GUIDE.md` for user accounts and `32_HANDOVER_CHECKLIST.md` for what to configure before real use.

## Engineering history
This system was built across 20 phases of iterative development, testing, and hardening (see `11_RELEASE_NOTES` in the package for the phase-by-phase history). It is currently at **1,905/1,905 automated tests passing** with a 1,080+-cell role/action security matrix, real concurrency testing, and a real 121-transaction bank statement tested end-to-end.
