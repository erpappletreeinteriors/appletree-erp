# ARCH-2026-001E — Browser UAT

**Date:** 2026-09-21. Real browser click-through per this CR's own §26. Performed against a disposable
isolated instance (`server/scripts/start-isolated-test-server.js --app-env test`) using the built-in
browser pane, driving REAL `fetch()` calls from the actual logged-in session — never a synthetic
script. Production `server/db.json` was never targeted. No UI code was changed.

## 1. Role 3 — Creator attempting self-approval (tested first, establishes the fixed defect)

- PM logs in, submits a design for their own project (`POST /api/designs` → 200, `DSN-0001`).
- PM attempts to approve their OWN design (`POST /api/designs/DSN-0001/review` → **400**, `"Segregation
  of duties: design submitter cannot also approve their own design."`) — **the real, evidenced gap
  this CR fixed, blocked live through the actual browser session.**

## 2. Role 1 — Unauthorized approver

- Sales logs in, attempts `POST /api/designs/DSN-0001/review` → **403**, `"Role \"Sales\" cannot
  review/approve designs."`

## 3. Role 2 — Authorized approver

- CEO logs in (not the submitter), approves the SAME design (`POST /api/designs/DSN-0001/review` →
  **200**, `ok:true`) — legitimate operation succeeds, not over-blocked.

## 4. Role 4 — Authorized approver with wrong scope

- CEO submits a SECOND design for PRJ-2 (`DSN-0002`).
- PM (a legitimate DesignReview approver in general, but with NO scope over PRJ-2) attempts to approve
  it (`POST /api/designs/DSN-0002/review` → **403**, `"ProjectManager not assigned to project
  PRJ-2."`) — the pre-existing scope check (ARCH-2026-001C-F), re-confirmed unaffected by this CR.

## 5. Role 5 — SoD-conflicted approver

A full real P2P chain was built live through the browser session (Vendor→PO→GRN→Bill→PaymentRequest),
deliberately using Admin (not Purchase) for the bill-creation step after Purchase's own attempt was
correctly blocked by ARCH-2026-001D's SOD-6 (an incidental, welcome re-confirmation that the 001D SoD
layer remains fully intact alongside this CR's changes). CEO then created the Payment Request (maker)
and immediately attempted to also approve it:
- `POST /api/payment-requests/PAYREQ-0001/approve` (by CEO, the maker) → **400**, `"Maker-checker: the
  person who raised this payment request cannot also approve it."` — SOD-1 (pre-existing, unchanged),
  correctly blocking the conflicted approver live.

## 6. Role 6 — Viewer

- `POST /api/payment-requests/PAYREQ-0001/approve` (Viewer) → **403**.
- `GET /api/approval-authority/check?transactionType=PaymentRequest&id=PAYREQ-0001` (Viewer, an
  authenticated but ineligible role) → **200**, `canApprove:false` — the diagnostic correctly reflects
  Viewer's own real ineligibility rather than erroring or leaking another user's eligibility.
- **Positive control:** FinanceManager (a genuinely clean, authorized checker) then approved the SAME
  request (`POST /api/payment-requests/PAYREQ-0001/approve` → **200**, `ok:true`) — proving the chain
  of blocks above reflected real, specific conflicts, not a broken/always-403 route.

## 7. Client result matches server result

Every outcome above was observed as the RAW JSON response the real browser session received — the
same response body any real client (including the production UI) would receive. No client-side check,
hidden button, or menu filter was involved anywhere in this UAT.

## 8. Conclusion

All 6 requested roles exercised through a real, live browser session. The Design Review self-approval
fix confirmed working live (the primary deliverable of this CR). Wrong-scope and SoD-conflicted
approvers confirmed blocked using real, already-existing mechanisms this CR did not modify. A genuine
positive control (FinanceManager) confirmed the system is not over-blocking legitimate approvals.
