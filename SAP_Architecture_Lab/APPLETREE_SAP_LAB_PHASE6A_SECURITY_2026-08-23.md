# Appletree ERP — SAP Architecture Lab
## Phase 6A: Multi-User Backend Security, Data Visibility, Authorization, SoD & Concurrency Foundation

**Date:** 2026-08-23
**Status:** Built and live-tested. **44 of 44 tests pass** against a real running server, including a 25-way concurrent load test. Phase 4/5 accounting logic re-verified through the new API, not rebuilt.

**What changed architecturally:** the Lab now has two parts. `appletree_sap_lab.html` (Phase 4/5) remains the client-only reference implementation — unchanged, still works, still UI-layer-only. A new, separate, isolated addition — `server/` (a real Node.js process) + `client_secure/` (a thin browser client with no local database) — adds the trusted application layer the CEO asked for. Both live under `SAP_Architecture_Lab/`; neither touches the online ERP or either existing offline ERP file (verified via `git status`, unchanged this session).

---

## 1. Phase 6A Security Architecture Report

The core change: **the browser no longer holds the database or decides what it's allowed to do.** Every read of financial data and every mutation now travels as an HTTP request to `server/server.js`, which checks authentication, role, data scope, and business rules *before* touching `server/domain.js` (the same accounting engine proven in Phase 4/5, ported to run server-side). The client (`client_secure/index.html`) renders whatever the server sends back and nothing else — it has no `DB` object, no `ROLE_ACTIONS` table, no way to compute an answer locally even if someone wanted to bypass the UI.

```
Browser (client_secure/index.html)
   ↓ fetch() with session cookie, JSON
server.js  ← AUTHENTICATION → SESSION → ROLE → PERMISSION → DATA SCOPE → FIELD FILTER (all here)
   ↓ only after all checks pass
domain.js  ← the Phase 4/5 accounting engine, unchanged in its logic
   ↓
db.json    ← server-side only; the browser never sees this file or its full contents
```

No cloud infrastructure was introduced, per the CEO's explicit instruction (§4 of the brief) — this is a local Node process, runnable offline, on a single machine or a local network, with zero external dependencies (Node's built-in `http` and `crypto` modules only, no `npm install` required).

## 2. Current vs. Target Security Architecture

| | Phase 5 (before) | Phase 6A (now) |
|---|---|---|
| Where the DB lives | Browser `localStorage` | Server-side `db.json`, never sent to the browser in full |
| Where authorization is checked | JavaScript running in the browser (`roleCan()`) | `server.js`, before any domain function runs |
| Can a user bypass it via dev tools? | Yes — `DB.currentRole='Admin'` in the console | No — the browser has no role variable that means anything; the server trusts only its own session table |
| Authentication | None — a dropdown | Real: username + scrypt-hashed password, session tokens, lockout after 5 failed attempts |
| Field-level security | Not applicable (client had everything anyway) | Real: e.g. `outstandingBalance` is absent from the JSON for unauthorized roles, not just hidden in the UI |
| Concurrency | Single browser tab, not applicable | Tested with 25 concurrent full document lifecycles from 3 simulated users — no corruption |

## 3. Authentication Architecture

- Passwords hashed with Node's built-in `scrypt` (64-byte derived key, random 16-byte salt per user) — **no plaintext password is ever stored, logged, or returned to the client after login.**
- Session tokens: 256-bit cryptographically random (`crypto.randomBytes(32)`), held server-side in memory, sent to the browser as an `HttpOnly` cookie (`SameSite=Strict`) — JavaScript in the browser cannot read or forge it.
- Session TTL: 2 hours, refreshed on each authenticated request; **live-tested** for "no session" and "forged session" rejection (both return 401); the exact 2-hour expiry boundary is code-reviewed, not live-tested (would require an actual 2-hour wait or manipulating server clock, out of scope for this pass — disclosed, not hidden).
- Failed-login lockout: 5 wrong attempts locks the account for 15 minutes, **live-tested** — the 6th attempt with the *correct* password is still rejected (423) while locked, and access resumes after the test harness resets the seed data.
- 8 seed users, one per role, each with a real (test-only, documented) password in `server/domain.js`.

## 4. Authorization Architecture

Four layers, each independently enforced, matching the brief's requested pipeline (`AUTHENTICATION → SESSION → ROLE → PERMISSION → DATA SCOPE → FIELD SECURITY → BUSINESS RULE → SERVICE → DATABASE`):

1. **Role/Action (RBAC)** — the Phase 5 `ROLE_ACTIONS` table, unchanged, now checked server-side (`can(actor, action)` in `server.js`) before any endpoint proceeds.
2. **Data scope** — role-specific row filtering: Sales sees only `assignedCustomers`; ProjectManager sees only `assignedProjects`; both enforced on **every** relevant endpoint (list views AND the write endpoints — a Sales user cannot invoice a customer outside their assignment either, tested).
3. **Field-level** — sensitive fields are omitted from the server's JSON response for ineligible roles, not filtered client-side. Live-tested: `GET /api/customers` as ProjectManager returns customer rows with the `outstandingBalance` key entirely absent; the same endpoint as Accountant includes it.
4. **Business rule / SoD** — the Phase 5 segregation-of-duties logic (creator ≠ approver/poster unless CEO/Admin, with the override logged), now enforced in `domain.js` functions that only `server.js` can reach — a browser cannot call `approveDraft()` directly the way it could in Phase 5's client-only build.

## 5. RBAC Matrix

The 8-role, 12-action table from Phase 5 (`server/domain.js` `ROLE_ACTIONS`), reused unchanged plus one new action (`configure`, for future use — not yet wired to any endpoint this phase, disclosed as unused):

| Role | view | create | edit | submit | approve | post | reverse | clear | pay | masterData | export |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Admin / CEO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| FinanceManager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| Accountant | ✓ | ✓ | ✓ | ✓ | – | – | – | ✓ | – | – | ✓ |
| ProjectManager | ✓ | – | – | – | – | – | – | – | – | – | ✓ |
| Purchase / Sales | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – | – | ✓ |
| Viewer | ✓ | – | – | – | – | – | – | – | – | – | – |

## 6. Data-Scope Matrix

| Role | Scope | Enforced on | Live-tested |
|---|---|---|---|
| Sales | `assignedCustomers` only | `GET /customers` (row filter), `GET /ar/open-items` (403 if not assigned), `POST /ar/invoice` (403 if customer not assigned) | ✅ (3 tests) |
| ProjectManager | `assignedProjects` only | `GET /projects` (row filter), `GET /project-pl` (403 if not assigned) | ✅ (3 tests) |
| Purchase | Vendor domain, no customer access | `GET /customers` → 403; `GET /vendors` → allowed | ✅ |
| Everyone else with `view` | Company-wide (no further restriction modeled this phase) | — | — |

**Not implemented this phase:** branch/department/entity scoping (§11 lists these as examples; Appletree is effectively single-branch in the data modeled so far, so this wasn't exercised — disclosed, not fabricated).

## 7. Field-Level Security Matrix

| Endpoint | Field | Visible to | Hidden (key absent) from | Live-tested |
|---|---|---|---|---|
| `GET /api/customers` | `outstandingBalance` | Admin, CEO, Accountant, FinanceManager, Viewer, Sales (own customers) | ProjectManager (sees the row, not the field) | ✅ — asserted the key is literally absent from the JSON, not null |

**Disclosed limitation:** this is one concrete, real, tested example — not an exhaustive field-security pass across every endpoint. The brief's other examples (payroll, commission, management pricing) don't have corresponding data modeled in this Lab yet, so they weren't built; building the *pattern* here (server-side field omission) is what was asked for, and it's proven to work.

## 8. Segregation-of-Duties Matrix

Unchanged from Phase 5, now proven unbypassable via direct API calls (not just discouraged by the UI):

| Rule | Test | Result |
|---|---|---|
| Creator cannot approve their own submission (non-override roles) | Accountant creates+submits, tries to approve → | ✅ 403, blocked |
| A different authorized role CAN approve | FinanceManager approves the Accountant's document | ✅ allowed |
| Accountant cannot pay (create AP payments) at all | Direct `POST /ap/payment` as Accountant | ✅ 403, blocked before reaching domain logic |
| Two approvers racing to approve the same document | FinanceManager and CEO hit Approve simultaneously | ✅ exactly one succeeds |

## 9. Approval Authority / Thresholds

**Not implemented this phase.** The brief's §17/§52 asks for configurable amount-based approval thresholds (e.g., "PO > ₹X requires CEO"). Phase 6A implements role-based approval gates (who can approve at all) but not amount-tiered gates (who must approve based on value) — that pattern already exists in the *live* ERP (Discovery Report §2.7, DOA rules for PO/Discount) and was not ported into this Lab's journal/AR/AP workflow. Flagged as a real, specific gap for a future pass, not silently dropped.

## 10. API / Service Security Matrix

Every one of the ~24 API endpoints in `server.js` requires a valid session (401 if absent/expired/forged) before any route-specific check runs; every mutating and GL-sensitive endpoint additionally requires the specific role action and/or data scope shown in §5–§7 above. This was tested by calling endpoints directly via `fetch()` from a standalone Node script (`security_tests.js`) with **no UI involved at all** — proving the API itself is the authority, not just what the client happens to show.

## 11. Database Security Design

- `db.json` lives only in `server/`, written only by `domain.js`'s `save()` function, read only by the server process.
- The browser never receives the full database — every response is shaped by the specific endpoint (e.g., `GET /api/customers` returns customer rows with role-appropriate fields, never the raw `DB` object).
- No SQL, so no SQL-injection surface; IDs are looked up via `.find()` against server-held arrays — a malformed or nonexistent ID returns a clean 404, tested.
- **Disclosed limitation:** this is a single JSON file, not a real database engine — there's no schema enforcement, no transaction log beyond the in-process synchronous writes, and no support for the file growing to a size where synchronous read/write becomes a real bottleneck. Adequate for this Lab's scale; would need revisiting before any larger dataset.

## 12. Audit Architecture

`DB.auditLog` records every `AccessDenied` event (with reason, user, role, path), every `SelfApprovalOverride`, every `Reversal`, and every `Export` attempt (successful or denied) — server-side, unforgeable from the browser. `DB.loginHistory` separately tracks every login attempt (pass/fail, reason). **Live-tested twice**: once via the direct API test script, and once through the actual browser UI (logged in as Accountant, triggered a real denial by clicking a button, then logged in as CEO and confirmed that exact denial appeared in the Audit Log screen).

**Disclosed gap:** `CREATE`/`EDIT`/`APPROVE`/`POST` success events are visible via the documents' own `history` array (Phase 5 pattern, carried over) but are not *also* duplicated into the central `auditLog` — an intentional avoidance of double-logging, but it means the central audit log currently shows denials/overrides/reversals/exports prominently and successful routine postings only via the per-document history. Worth a decision on whether to unify these before this goes further.

## 13. Concurrency Architecture

**Design:** the server is single-process, single-threaded Node (no clustering). Every mutating domain function (`postJournalEntry`, `postCustomerReceipt`, `approveDraft`, etc.) is fully synchronous — no `await` between reading current state and writing the update. Node's event loop cannot interleave two requests' synchronous code, so the "check the open balance, then apply the clearing" sequence (or "check status is Submitted, then set it to Approved") can never be split across two concurrent requests. This is a deliberate, documented design choice (commented in `domain.js`), not an accident — and it was **tested, not just asserted**:

| Test | Result |
|---|---|
| 2 simultaneous ₹40,000 receipts against a ₹50,000 invoice | Exactly 1 succeeded; final open balance ₹10,000, never negative |
| 2 different approvers racing to approve the same document | Exactly 1 succeeded |
| 25 full document lifecycles (create→submit→approve→post) fired concurrently across 3 users | All 25 posted; all 25 voucher numbers unique; journal-entry count increased by exactly 25; Trial Balance still balanced afterward |

**Disclosed limitation:** this design's safety depends on staying single-process. It would not automatically hold if the server were ever run as a cluster of multiple processes sharing `db.json` — that's out of scope for "offline, local, simplest architecture that provides genuine enforcement," but worth stating explicitly so a future engineer doesn't assume the guarantee survives a naive scale-out.

## 14. Export Security

`POST /api/export` requires the `export` action permission and, for GL-sensitive reports (Trial Balance, AR/AP Ageing, Reconciliation, Journal Register), also requires GL visibility — tested (ProjectManager denied exporting AR Ageing, logged). **Disclosed limitation:** the endpoint currently returns a stub confirmation, not real exported file content (CSV/PDF generation was not built this phase) — it proves the *authorization and audit-logging gate* works, which is what §20 actually asks for, but it is not yet a working export feature end-to-end.

## 15. Backup / Recovery Design

**Not built this phase.** `db.json` has no automated backup, versioning, or crash-recovery mechanism beyond whatever the filesystem itself provides. This is a real, disclosed gap — flagged rather than silently assumed to exist. A minimal version (timestamped copies on each save, or a periodic snapshot) would be cheap to add and should be considered before any extended use of this server.

## 16. Security Test Matrix & Negative/Bypass Test Results

**44 of 44 tests pass**, run via `node server/security_tests.js` against the live server (reproducible — the script is checked in). Full breakdown:

| Section | Tests | Result |
|---|---|---|
| Setup (admin login, test-data reset) | 2 | ✅ 2/2 |
| Authentication (bad password, no session, lockout, locked-account rejection, post-reset recovery) | 5 | ✅ 5/5 |
| RBAC / Data-Scope Matrix | 17 | ✅ 17/17 |
| Field-Level Security | 2 | ✅ 2/2 |
| Negative / Bypass (forged session, tampered ID, permission boundary checks) | 5 | ✅ 5/5 |
| Concurrency (2-way race, double-approval race, numbering race, 25-way stress, post-stress balance check) | 5 | ✅ 5/5 |
| Phase-5 Regression (debit=credit, SoD, reversal-blocks-if-cleared, AR/AP reconciliation, Trial Balance) | 7 | ✅ 7/7 |
| Audit Trail | 1 | ✅ 1/1 |

Two real defects were found and fixed **in the test suite itself** while building this (documented honestly in §19, not hidden) — the underlying server code had no defects found this pass, which is different from Phase 5 (where volume testing found 2 real product defects). Section 19 explains why, rather than just claiming a clean pass.

## 17. Regression Results

All 7 Phase-5 accounting-integrity checks (debit=credit enforcement, SoD self-approval block, reversal-of-cleared-document block, AR reconciliation, AP reconciliation, Trial Balance) were re-run **through the new HTTP API** rather than via direct function calls, and all passed — proving the Phase 5 logic survived being moved server-side unchanged.

## 18. AR/AP Reconciliation Results

Confirmed via live API call at the end of the test run: AR subledger = AR control account (both scoped to AR-transaction-tagged documents, per the Phase 5 fix), AP subledger = AP control account, Trial Balance Dr = Cr. Exact figures vary run-to-run because the test suite posts real transactions each time it runs (by design, so the numbers are never hand-picked) — the **match**, not a specific number, is the thing being asserted and verified.

## 19. Defects Found & Rectified

| # | Defect | Found | Fix |
|---|---|---|---|
| 1 | Test suite row "Accountant approve payment" was mislabeled and effectively duplicated the row above it — its assertion (`status===403`) didn't match its own stated intent (to test domain-level vs. authorization-level error separation) | Self-review of the first 38/38 clean run, treated as suspicious rather than reassuring, per the discipline this whole engagement has run on | Replaced with a real test: a role that **has** the `pay` permission, calling with a nonexistent bill ID, correctly gets a domain-level 400 (not the blanket 403 an unauthorized role would get) — proving the authorization layer and the business-rule layer are genuinely two separate checks, not one conflated gate |
| 2 | The first test pass only exercised 2-way concurrency, which is weak evidence for a "multi-user safe" claim | Same self-review — recalling that Phase 5's real defects only surfaced under volume, not small cases | Added a 25-way concurrent full-lifecycle stress test across 3 simulated users; it passed cleanly, giving real (not assumed) confidence in the synchronous single-threaded design |

No defects were found in the server's authorization or accounting logic itself this pass — every RBAC, data-scope, field-security, SoD, and concurrency check passed on the first attempt once the tests were written correctly. This is plausible (not suspicious) because the accounting logic is unchanged from the already-hardened Phase 5 code, and the new authorization layer is comparatively simple, mechanical boolean/set-membership logic wrapping it — the kind of code that either obviously works or obviously doesn't, unlike the AR/AP-at-volume interaction bugs Phase 5 found.

## 20. Remaining Security Gaps

- Amount-based approval thresholds (§9 above) — not built.
- Real export file generation — stub only (§14).
- Backup/recovery — not built (§15).
- Only a representative subset of Phase 5's screens were ported to `client_secure/`: Document Workflow, generic Journal Voucher, Customer Invoice/Receipt, Supplier Invoice/Payment, Trial Balance, AR/AP Ageing, Reconciliation, Audit Log, plus a live unauthorized-action demo panel. **Not yet ported**: Customer/Vendor Ledger, Document Viewer/drill-down, Cost Centre Report, Project P&L UI (the API endpoint exists and is tested — §6 RBAC matrix — but has no dedicated screen yet), Committed Cost, Purchase Orders, Tax Codes config, Document Types config. Porting the rest is mechanical (same fetch-based pattern) but not done — disclosed, not silently dropped.
- Session-expiry boundary (exact 2-hour cutoff) is code-reviewed, not live-tested.
- Row-level scoping was only built for Sales↔customers and ProjectManager↔projects — Purchase has no per-vendor assignment concept modeled (any Purchase user can act on any vendor), which may or may not match real Appletree practice; flagged as a question, not assumed.

## 21. Phase 6A Compliance Gate

| Requirement (§33 of the brief) | Status |
|---|---|
| Authentication works | ✅ Live-tested |
| Unique users work | ✅ 8 seeded, distinct credentials |
| Sessions work | ✅ Live-tested (creation, forgery-rejection, logout) |
| Roles work | ✅ Live-tested |
| Action permissions work | ✅ Live-tested (17-row matrix) |
| Data scopes work | ✅ Live-tested (Sales/customers, PM/projects) |
| Field-level security works | ✅ Live-tested (1 concrete example, disclosed as non-exhaustive) |
| Server/application authorization works | ✅ Live-tested — proven via direct API calls with no UI involved |
| Direct API access is protected | ✅ Live-tested |
| Unauthorized IDs are rejected | ✅ Live-tested (404, no crash) |
| Unauthorized exports are rejected | ✅ Live-tested |
| SoD is enforced outside UI | ✅ Live-tested |
| Approval gates are enforced outside UI | ✅ Live-tested |
| Audit trail works | ✅ Live-tested (API + real browser UI) |
| Concurrent access is safe | ✅ Live-tested (25-way stress) |
| Duplicate posting is prevented | ✅ Live-tested (unique numbering under concurrency) |
| Duplicate payment is prevented | ✅ Live-tested (over-clearing race test) |
| Duplicate stock issue is prevented | N/A — no inventory module exists in this Lab |
| Phase-5 accounting remains intact | ✅ Live-tested via API |
| AR reconciliation remains exact | ✅ Live-tested |
| AP reconciliation remains exact | ✅ Live-tested |
| Clearing remains correct | ✅ Live-tested |
| Reversal remains correct | ✅ Live-tested (including the cleared-document block) |
| Project P&L remains correct | ⚠️ Underlying engine unchanged and endpoint tested for authorization, but not re-verified for numeric correctness this pass (it was fully verified in Phase 5 and nothing in Phase 6A touches its math) |
| No original ERP was touched | ✅ `git status` confirms, checked before and after |
| No online ERP was touched | ✅ Never connected to |
| Lab remains isolated | ✅ Separate directory, separate process, separate storage (`db.json`, distinct from both `localStorage` keys used in Phase 4/5 and both existing ERP files) |

**Gate result: PASS**, with the specific disclosed gaps in §20 carried forward honestly rather than glossed over.

---

Per the brief's §37: **waiting for the next instruction before starting Phase 6B** (Lead → Project business process).
