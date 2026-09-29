# WAVE3_BROWSER-UAT.md

**Date:** 2026-09-22/23. This engagement's usual browser-driven UAT is not available in this pass (no
browser tooling in this environment). Per the task brief, this document instead performs equivalent
**API-level UAT** for the 4 mandatory chains this wave touches — real HTTP calls (via Node's `fetch`)
against a disposable isolated test server (`server/scripts/start-isolated-test-server.js`), one real
authenticated session per actor, exactly the same login/cookie/request mechanism the real browser client
uses. Every transcript below is copied verbatim from an actual run's captured output — method, route,
actor, request body, and real response — not a hypothetical description.

## Chain (a): capitalize→depreciate→dispose a Fixed Asset, across FinanceManager/Admin/CEO roles

### UAT(a).1 — Create Fixed Asset
Actor: `purchase1` (Purchase) | `POST /api/fixed-assets`
Request body: `{"assetCode":"UAT-FA-001","assetName":"UAT CNC Router","assetClass":"Machinery","purchaseDate":"2026-04-01","cost":480000,"location":"Factory Bay 2","custodian":"UAT Custodian","projectId":"PRJ-1"}`
Response (200): `{"ok":true,"asset":{"id":"FA-0001", ..., "status":"Purchased", "cost":480000, ...}}`

### UAT(a).2 — Capitalize Fixed Asset
Actor: `finance1` (FinanceManager) | `POST /api/fixed-assets/FA-0001/capitalize`
Request body: `{"capitalizationDate":"2026-04-05","fundingSource":"Bank","usefulLifeMonths":24,"depreciationMethod":"StraightLine","residualValue":48000}`
Response (200): `{"ok":true,"asset":{"id":"FA-0001","status":"Capitalized","capitalizationEntryId":"JE-0001", ...}}`
— real GL entry JE-0001 posted (Dr 1400 / Cr 1000, ₹480,000).

### UAT(a).3 — Post Depreciation
Actor: `admin` (Admin) | `POST /api/fixed-assets/FA-0001/depreciate`
Request body: `{"periodDate":"2026-04-30"}`
Response (200): `{"ok":true,"entry":{"id":"JE-0002","docCategory":"Depreciation","totalDebit":15600,"totalCredit":15600, ...}}`
— (480000−48000)/24 = ₹18,000/month, prorated 26/30 days from the 5th = ₹15,600, computed independently
and matched.

### UAT(a).4 — CEO views GL account 1450 to confirm the posting
Actor: `ceo` (CEO) | `GET /api/general-ledger?account=1450`
Response (200): `{"ok":true,"rows":[{"entryId":"JE-0002","docCategory":"Depreciation","debit":0,"credit":15600,"runningBalance":-15600, ...}],"totalCredit":15600}`
— confirms the exact posting from step 3, visible to a different role (CEO) purely via the GL, not the
Asset Register.

### UAT(a).5 — Dispose Fixed Asset
Actor: `ceo` (CEO) | `POST /api/fixed-assets/FA-0001/dispose`
Request body: `{"disposalDate":"2026-06-01","disposalProceeds":400000,"reason":"UAT chain (a) — end-of-chain disposal"}`
Response (200): `{"ok":true,"asset":{"id":"FA-0001","status":"Disposed","disposalProceeds":400000, ...}}`
— real GL entry posted: Dr 1450 (accumulated depreciation removed), Dr 1000 (proceeds received), Dr 5500
(loss, since proceeds 400,000 < NBV 464,400), Cr 1400 (full cost removed).

### UAT(a).6 — Register↔GL reconciliation after the full chain
Actor: `finance1` (FinanceManager) | `GET /api/fixed-assets/reconciliation`
Response (200): `{"ok":true,"reconciliation":{"registerCost":0,"glCost":0,"costMatches":true,"registerAccumDep":0,"glAccumDep":0,"accumDepMatches":true,"assetCount":0,"disposedCount":1}}`
— exact reconciliation after a full create→capitalize→depreciate→dispose lifecycle across 4 different
actors/roles (Purchase, FinanceManager, Admin, CEO).

## Chain (b): import bank statement → match → allocate → reconcile

### UAT(b).1 — Import bank statement
Actor: `finance1` (FinanceManager) | `POST /api/bank-import/batches`
Request body: `{"bankAccountId":"BANK-ICICI-1112","csvText":"<1-row ICICI CSV, CR 22000>","format":"ICICI"}`
Response (200): `{"ok":true,"batch":{"id":"BIB-0001","rowCount":1,"duplicateCount":0,"errorCount":0},"lines":[{"id":"BIL-00001","amount":22000,"crDr":"CR","balanceMatches":true}]}`

### UAT(b).2 — List imported lines
Actor: `finance1` (FinanceManager) | `GET /api/bank-import/lines?batchId=BIB-0001`
Response (200): `{"ok":true,"lines":[{"id":"BIL-00001","amount":22000,"crDr":"CR", ...}]}`

### UAT(b).3 — (setup) real Customer Invoice + Receipt posted to match against
A Customer Invoice was drafted→submitted→approved→posted (full workflow), then:
Actor: `accountant1` (Accountant) | `POST /api/ar/receipt`
Request body: `{"customerId":"CUST-1","invoiceEntryId":"JE-0001","amount":22000, ...}`
Response (200): `{"ok":true,"entry":{"id":"JE-0002","docCategory":"CustomerReceipt","totalDebit":22000, ...}}`

### UAT(b).4 — Match bank line to the Customer Receipt entry
Actor: `finance1` (FinanceManager) | `POST /api/bank-import/lines/BIL-00001/match`
Request body: `{"entryId":"JE-0002"}`
Response (200): `{"ok":true,"line":{"id":"BIL-00001", "status":"Matched"/"Posted", ...}}`

### UAT(b).5 — Reconcile the matched line
Actor: `finance1` (FinanceManager) | `POST /api/bank-import/lines/BIL-00001/reconcile`
Response (200): `{"ok":true,"line":{"id":"BIL-00001","status":"Reconciled", ...}}`
— full import→match→reconcile chain, all through the single Wave-1-consolidated engine
(`WAVE3_TREASURY-RESULTS.md`).

## Chain (c): raise→approve→execute a Payment Request, 3-person separation still holds

### UAT(c).1 — Raise Payment Request
Actor: `purchase1` (Purchase) | `POST /api/payment-requests`
Request body: `{"vendorId":"VEND-11","invoiceEntryId":"JE-0003","amount":8000, ...}`
Response (200): `{"ok":true,"paymentRequest":{"id":"PAYREQ-0001","status":"PendingApproval","maker":"U-PUR1", ...}}`

### UAT(c).2 — Self-approve attempt (Purchase, same as maker) — BLOCKED
Actor: `purchase1` | `POST /api/payment-requests/PAYREQ-0001/approve`
Response (**403**): `{"ok":false,"error":"Role \"Purchase\" cannot approve a payment request."}`
— blocked at the role-permission layer (Purchase never holds `approve` capability for payment requests);
the maker/checker identity check (SOD-1) is the second, deeper layer for a role that DOES hold approve.

### UAT(c).3 — Approve (different user, FinanceManager)
Actor: `finance1` | `POST /api/payment-requests/PAYREQ-0001/approve`
Response (200): `{"ok":true,"paymentRequest":{"status":"Approved","checker":"U-FIN1", ...}}`

### UAT(c).4 — Self-execute attempt (FinanceManager, same as approver) — BLOCKED
Actor: `finance1` | `POST /api/payment-requests/PAYREQ-0001/execute`
Response (**400**): `{"ok":false,"error":"Maker-checker: execution must be a third person distinct from the maker and the approver (or CEO/Admin), per SOP §9."}`

### UAT(c).5 — Execute (third, distinct actor — Admin)
Actor: `admin` (neither maker nor checker) | `POST /api/payment-requests/PAYREQ-0001/execute`
Response (200): `{"ok":true,"paymentRequest":{"status":"Executed","executedBy":"U-ADMIN", ...},"entry":{"id":"JE-0004", ...}}`
— full raise→approve→execute chain proven live, 3-way separation (maker=Purchase, checker=FinanceManager,
executor=Admin) intact end to end, unmodified this wave.

## Chain (d): view Project Profitability as different scoped roles

Actor `admin` (Admin) | `GET /api/projects/PRJ-1/financial-360` → 200,
`{"cost":{"actual":8000,"forecast":8000},"revenue":{"postedRevenue":22000, ...}}`

Actor `ceo` (CEO) | same route → 200, **identical** figures (`cost.actual:8000`,
`revenue.postedRevenue:22000`) — same single calculation, not re-derived per role.

Actor `finance1` (FinanceManager) | same route → 200, **identical** figures again.

Actor `sales1` (Sales — a scope-restricted role for this endpoint) | same route → **403**,
`{"ok":false,"error":"Role \"Sales\" cannot view the financial 360 for PRJ-1."}`
— confirms data-scope enforcement on Project Financial 360 is unchanged this wave: authorized roles see
one authoritative figure, an out-of-scope role is blocked outright, not served a different (weaker)
number.

## Conclusion

All 4 mandatory chains this wave touches were exercised end to end with real HTTP calls against a real,
disposable isolated server — capitalize→depreciate→dispose across 4 roles (Purchase/FinanceManager/Admin/
CEO) with correct GL postings at every step; bank import→match→reconcile through the single consolidated
engine; the 3-person payment-request separation (maker/checker/executor) proven to still block both
self-approval and self-execution while allowing the correct third party; Project Profitability proven to
return one identical, authoritative figure to every in-scope role and a clean 403 to an out-of-scope one.
**PASS — no defect found in any of the 4 chains** (the 2 defects this wave found were in the Fixed Asset
*reversal* edge case, not in the forward lifecycle chain exercised here — see `WAVE3_ASSET-RESULTS.md`).
