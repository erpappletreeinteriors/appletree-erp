# PHASE 39 — Fix Log

**Date:** 2026-09-12. This log is updated as the phase progresses; each entry states what changed,
why, and the regression evidence that nothing else broke.

## Application code fixes

### DEF-P38-02 (expanded — P2, functional): 6 document types get `docNo: null` after every test reset

**Found:** live, while investigating Phase 38's carried-forward finding DEF-P38-02 (originally scoped
narrowly: "a migration-guard reference lists `['SRET','Site Return']`... but no such entry exists in
the base seed array... not yet determined whether `returnFromSite()` actually depends on it").

**Root cause, confirmed live:** `resetToFreshSeed()` rebuilds `DB` directly from the `SEED` object
literal (`freshDB()`) — it does **not** re-run the file's many `if(!DB.glDocumentTypes.find(...))
DB.glDocumentTypes.push(...)` "migration guard" patches, which are bare top-level statements that
only ever execute once, at module load, against whatever `DB` already existed on disk at that
moment. A document type registered **only** via one of those guards — never added to the `SEED`
literal itself — silently vanishes every time `/api/test/reset` runs, and every `nextDocNumber()`
call for that type then returns `null`.

This is not a new defect class: the exact same failure mode was already found and fixed once, for a
different set of document types, documented in this very file (search `domain.js` for "P0-4 FIX" and
the Phase 14 comment above the `glDocumentTypes` literal explaining precisely this trap). Six later
additions — `BOM`, `XMI`, `XBA`, `CR`, `MRQ` (each carrying its own "P0-4 FIX"/"same gap class"
comment at its own migration-guard call site) and `SRET` (Phase 33/37, the original narrow DEF-P38-02
finding) — repeated the identical mistake, evidently without cross-referencing the literal Phase 14
had already fixed the same way.

**Live proof (before the fix):** `POST /api/test/reset` then `POST /api/boms` with a valid payload
returned `{"ok":true,"bom":{"id":"BOM-0001","docNo":null,...}}` — a real business document created
with no reference number. Direct enumeration via `GET /api/doc-types` after a reset showed `SRET`,
`BOM`, `XMI`, `XBA`, `CR`, `MRQ` all absent from the 51-entry registry (45 base-literal entries plus
6 that happened to already be duplicated into the literal by earlier phases).

**Impact:** functional (missing reference numbers on BOM/Excess Material Issue/Excess Billing
Approval/Change Request/Material Requirement/Site Return documents on any freshly-reset test
instance), not financial — none of these six document types post to the GL (confirmed via each of
their own "does not make this a GL-posting event" comments at the original migration-guard sites).
Severity **P2** (a real, reproducible functional gap, upgraded from DEF-P38-02's original P3 now that
"unknown pending verification" has been resolved to "confirmed, and broader than first scoped").

**Fix:** added all 6 missing entries directly to the `SEED.glDocumentTypes` literal
(`server/domain.js`), matching the exact `{code, label, prefix, nextSeq:1}` shape and label text
already used by their own migration-guard pushes. The migration-guard statements themselves are left
in place (now harmless no-ops for a fresh seed; still meaningful for a real, pre-existing `db.json`
saved before this fix).

**Regression:** full permanent suite re-run after this fix (on top of the DEF-P39-02 fix already in
place) — **173/173 assertions pass, zero regressions**, identical suite-by-suite breakdown to
DEF-P39-02's own regression table below, plus `erp_audit_concurrency_tests.js` (1/1) and
`erp_059_restart_persistence_tests.js` (5/5) independently re-confirmed.

### DEF-P38-01 (P3, closed): `/api/test/architectural-violations` inconsistent gating

**Found:** carried forward from Phase 38, re-verified live this phase — the route required only
`role==='Admin'`, unlike every sibling `/api/test/*` route (which all also require `APP_ENV=test`).

**Fix:** added the same `if(!IS_TEST_ENV) return denyDestructiveTestEndpoint(res, actor, pathname);`
guard used by every sibling route (`server/server.js`), before the existing Admin-role check —
closing the inconsistency rather than merely documenting it, since the fix is one line and exactly
matches an already-established pattern.

**Regression:** covered by the same full-suite re-run above (this route has no dedicated regression
test; its sibling `/api/test/*` routes' own tests, which exercise the identical gating pattern, all
still pass).

### DEF-P39-02 (P1 — critical, accounting-integrity): Bank Import Allocation misposted to the wrong GL account

**Found:** live, during Banking validation — see `PHASE39_BANKING_LIVE_TEST.md` for full detail.
`postBankImportLine()` (`server/domain.js`) hardcoded the bank side of its journal entry to account
`1000` unconditionally, ignoring the specific bank account (`line.bankAccountId`) the imported
statement line actually belonged to. This contradicted the real per-bank-account GL segregation that
`postCustomerReceipt()`, `postSupplierPayment()`, and `createBankTransfer()` already correctly
implement (Phase 24 Part A4) — this one sibling function was never updated to match, and would have
silently misposted every allocated bank-import line for any account other than the one coded `1000`.

**Fix:** resolve the bank side to `DB.bankAccounts.find(b=>b.id===line.bankAccountId).glAccount`,
mirroring the exact pattern the three sibling functions already use — not a new mechanism.

**Regression:** full permanent suite re-run after the fix — **173/173 assertions pass, zero
regressions**:

| Suite | Result |
|---|---|
| `erp_059_security_tests.js` | 13/13 |
| `erp_059_restart_persistence_tests.js` | 5/5 |
| `erp_059_transaction_contract_tests.js` | 6/6 |
| `erp_059b_durable_audit_tests.js` | 24/24 (+2 documented-not-tested, matches baseline) |
| `erp_059c_production_isolation_tests.js` | 10/10 |
| `erp_audit_concurrency_tests.js` | 1/1 |
| `erp_audit_p0_tests.js` | 65/65 |
| `erp_phase38_e2e_trace_tests.js` | 49/49 |
| `erp_phase39_banking_tests.js` (this phase's own suite, re-run after the fix) | 34/34 |

### DEF-P39-04 (P2, functional): Bank Accounts UI form could never successfully create a bank account

**Found:** live, during Browser Workflow Testing — see `PHASE39_BROWSER_WORKFLOW_TEST.md` for full
detail. `submitBankAccount()` (`client_secure/index.html`) never collected or sent a `glAccount`
field, which the backend has required unconditionally since Phase 24 Part A4 — every submission
through this screen failed for every role, meaning the real per-account GL segregation feature was
reachable only via direct API calls, never through the actual application UI.

**Fix:** added a "GL Account Code" input to the form, wired through `submitBankAccount()`'s API
call; corrected the accompanying hint text, which still described the pre-Phase-24 single-shared-
account architecture.

**Regression:** this is a client-side (`client_secure/index.html`) change only, outside the scope of
the server-side permanent regression suites. Live-verified directly instead: created a GL account
via the Chart of Accounts API, then submitted the Bank Accounts form through the actual rendered
page end-to-end — result `"Bank account added"`, new account correctly listed with its own distinct
GL code alongside the pre-existing ICICI/1000 account (unaffected, still listed correctly).

## Test-artifact fixes (not application code)

While building this phase's own live test suites, 4 test-script bugs were found and corrected —
each investigated to a definitive root cause (direct `curl`/code-reading) before being classified as
a test-authoring error rather than an application defect, per this engagement's standing discipline:

1. **Manufacturing/Job Work stock-setup PO value crossed the auto-approval ceiling.** Bumping the
   stock-setup GRN quantities to 500 units pushed the PO's value over the ₹500,000 auto-approval
   threshold (BOS §1.6 / `PAR-1`), leaving the PO `Submitted` (not `Approved`) and causing the GRN —
   and everything downstream — to fail with "only 0 available." Not an application defect: the
   approval-threshold control worked exactly as designed. Fixed by sizing the stock-setup POs to
   stay under the threshold (150×MAT-1 @ ₹2,800, 250×MAT-2 @ ₹1,200).
2. **Job Work stock-delta assertion captured "before" AFTER the dispatch had already run.** The
   original test captured a single `stockBefore` snapshot too late, then compared it against a
   figure captured after BOTH the dispatch and the partial return — attributing the return's
   legitimate +5 credit-back to a false "double-counting" failure. Fixed by adding real checkpoints
   at each event (pre-dispatch, post-dispatch, post-return, post-scrap), each with its own specific
   assertion.
3. **Fixed Asset reconciliation endpoint's response shape.** `GET /api/fixed-assets/reconciliation`
   returns `{ok:true, reconciliation:{...}}`; the first draft of the Fixed Assets test read fields
   directly off the top-level response instead of `response.reconciliation.*`, producing 3 false
   failures. Confirmed via direct inspection of the route handler before correcting the test.
4. **Banking test used a goods-category vendor for a direct (non-PO) bill.** `VEND-1` is correctly
   gated to require PO+GRN matching for goods purchases — a real, working control, not a defect.
   Switched the Banking suite's direct-bill scenario to `VEND-6` (a Labour/Services vendor, for
   which direct billing is the legitimate path).

None of these 4 required an application-code change — each was purely the test script's own
assumption being wrong about an API's exact contract or a business rule's real behavior.

## Nothing else changed

No other application code was touched this phase beyond the one fix above (DEF-P39-02). Phase 37's
nomenclature MUST-CHANGE items were already implemented in a prior session this phase (see
`git log`) and are unaffected by this log's scope.
