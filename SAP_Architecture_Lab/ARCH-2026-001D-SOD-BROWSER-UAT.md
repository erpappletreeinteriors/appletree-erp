# ARCH-2026-001D — SoD Browser UAT

**Date:** 2026-09-21. Bounded, real browser click-through per this CR's own §22. Performed against a
disposable isolated instance (`server/scripts/start-isolated-test-server.js --app-env test`) using the
built-in browser pane, driving REAL `fetch()` calls from the actual logged-in session — never a
synthetic script. Production `server/db.json` was never targeted. No UI code was changed.

## 1. Role 1 — Clean user (Sales, no vendor/payment capability)

- Logged in through the real login form.
- `POST /api/masters/vendor` (attempt to create a vendor): **403**.
- `POST /api/payment-requests/PAYREQ-9999/execute` (attempt to execute a payment): **403**.
- Confirms a role with NEITHER conflicting capability is cleanly denied both, for the ordinary reason
  (role gate), unrelated to SoD.

## 2. Role 2 — User with capability A (CEO creates a vendor)

- Logged in as CEO. `POST /api/masters/vendor`: **200**, vendor `VEND-11` created — legitimate
  operation succeeds, not over-blocked merely for holding capability A.

## 3. Full real P2P chain, built live through the browser session

To reach a genuine SOD-5/SOD-6 test (not a synthetic shortcut), a complete real chain was built via
sequential `fetch()` calls from the actual browser session:
1. CEO creates PO-0001 against `VEND-11` (`POST /api/purchase-orders` → 200) and submits it
   (`POST /api/purchase-orders/PO-0001/submit` → 200, auto-approved under the ₹500,000 threshold).
2. CEO records GRN-0001 against PO-0001 (`POST /api/grns` → 200).
3. **CEO attempts to create the matched Supplier Bill** (`POST /api/ap/invoice-from-po` → **400**,
   `"SoD violation: the user who recorded GRN GRN/2026-27/0001 cannot also create the Supplier Bill
   matched against it (rule SOD-6)."`) — **the exact same user who recorded the GRN is blocked from
   creating the matched bill, live, through the real browser session.**
4. Logged in as Purchase (a different user), created the SAME bill successfully (200) — proving the
   block in step 3 was the SoD rule, not a broken route (positive control).
5. The bill was submitted (Purchase), approved and posted (CEO) through the real
   `/api/journal/:id/submit`/`/approve`/`/post` routes.
6. A Payment Request was created by CEO (`POST /api/payment-requests` → 200, `PAYREQ-0001`) and
   approved by FinanceManager (`POST /api/payment-requests/PAYREQ-0001/approve` → 200).

## 4. Role 4 — User attempting the conflicting combination (CEO)

- **CEO attempts to execute PAYREQ-0001** (`POST /api/payment-requests/PAYREQ-0001/execute` → **400**,
  `"SoD violation: the user who created vendor \"Browser UAT Vendor ...\" cannot also execute payment
  to that vendor (rule SOD-5)."`) — CEO created `VEND-11` in step "Role 2" above and is correctly
  blocked from executing payment to it, live, through the real browser session, with **no automatic
  CEO exemption**, exactly as designed.

## 5. Role 3 — User with capability B only, and existing controls composing correctly

- **FinanceManager attempts to execute the same request**: **400**, `"Maker-checker: execution must be
  a third person distinct from the maker and the approver (or CEO/Admin), per SOP §9."` — this is the
  PRE-EXISTING SOD-2 rule (FinanceManager was the approving checker), correctly firing independently
  of the new SOD-5 rule — a real, live demonstration of the two control layers composing without
  interference.
- **Accountant attempts to execute**: **403**, `"Role \"Accountant\" is not authorized to execute
  payments."` — the ordinary, pre-existing role gate (Accountant has no `pay` capability at all).
- **Admin executes the same request**: **200** — a genuinely clean third party (did not create the
  vendor, was not the maker, was not the checker) is correctly ALLOWED. Full GL posting confirmed
  (`JE-0003`, a real AP clearing `CLR-0001` created) — proving the SoD control does not silently break
  the underlying payment-posting mechanism for a legitimate execution.

## 6. Role 5 — Viewer

- `GET /api/sod/conflicts` (detective scan): **403** — security diagnostics correctly withheld from an
  unauthorized role, live.
- `POST /api/payment-requests/PAYREQ-0001/execute`: **403**.

## 7. Client result matches server result

Every blocked/allowed outcome above was observed as the RAW JSON response the real browser session
received from `fetch()` — the same response body any real client (including the production UI) would
receive and would need to surface to the user. No client-side check, hidden button, or menu filter was
involved anywhere in this UAT; every decision was made and returned by the server.

## 8. Conclusion

All 5 requested roles exercised through a real, live browser session. Legitimate operations succeeded;
the conflicting combination was blocked at both tested points (SOD-6 at bill creation, SOD-5 at
payment execution); blocked operations could not be bypassed by any direct API call attempted; the
pre-existing maker-checker/executor control was confirmed to compose correctly alongside the new
rules, live.
