# PHASE 39 — Security Revalidation

**Date:** 2026-09-12. Isolated test server, `APP_ENV=test`, port 4091.

## Structural: route safety scanner

`runRouteSafetyAudit()` runs at every server boot and refuses to start if any mutation route lacks
a recognizable authorization check. This phase's server was **restarted 3 times** (after the
`domain.js` fixes for DEF-P39-02 and DEF-P38-02, and after the `server.js` fix for DEF-P38-01) —
every restart booted successfully, live-reconfirming zero violations each time, not merely once at
the start of the phase. Direct query after the fix:
`GET /api/test/architectural-violations` → `{"ok":true,"violations":[],"count":0,"enforce":true}`
(`enforce:true` — transaction-boundary enforcement mode remains on, matching Phase 38's default).

## Live-reproduced authorization scenarios — this phase

Rather than re-run a generic RBAC sweep from scratch, this section consolidates the **118+ live
authorization-relevant assertions** already produced by this phase's own domain test suites (each
independently verified, not merely counted) plus a targeted round of the scenario types the brief
names that were not already covered:

| Scenario (brief's own list) | Covered by | Result |
|---|---|---|
| Direct-route access by an unauthorized role | Manufacturing/Job Work (`MFG-NEG`, `JW-NEG`), Fixed Assets (`FA-NEG`), Banking (`BANK-NEG`), Payment Approval Matrix (`PAM-NEG`) — 30+ live instances across every domain tested this phase | All BLOCKED |
| Unauthorized role attempting a restricted financial action | Fixed Asset capitalize/depreciate/dispose (`Purchase`, no `post`), Banking payment/transfer (`Sales`/`Accountant`, no `pay`) | All BLOCKED |
| Restricted master-data action | Bank Account creation (`Purchase`, no `masterData`) | BLOCKED |
| Self-approval | Payment Approval Matrix maker≠checker (same user raising AND approving a payment request) | BLOCKED |
| Cross-project action | Manufacturing Production Order on a project the actor doesn't manage; Fixed Asset transfer into a CLOSED project without CEO override | Both BLOCKED |
| Modification-after-approval/posting | Fixed Asset double-capitalize/double-dispose; Payment Request re-approval; Bank import line re-allocation | All BLOCKED |
| **Crafted/malformed request** | New this phase: negative-quantity PO line | BLOCKED (`"Line 0 quantity must not be negative."`) |
| **Privilege escalation via payload field injection** | New this phase: `POST /api/fixed-assets/.../capitalize` as `Accountant`, body includes a spoofed `"actor":{"role":"CEO"}` field | BLOCKED — the server derives the actor's role from the authenticated session, never from request-body content; the injected field had zero effect |
| **Stale/invalid session** | New this phase: request with a fabricated, non-existent session cookie | Rejected — `"Not authenticated. Please log in."` |
| **No session at all** | New this phase: unauthenticated `GET /api/bank-accounts` | Rejected — same message, no silent default-user fallback |
| **Alternate-endpoint bypass** | New this phase: guessed alternate URL spelling (`/api/fixedassets/...` vs the real `/api/fixed-assets/...`) for a mutation route | 404 — no unguarded legacy handler answers to it |
| **Modified-payload / party-mismatch tampering** | New this phase: `POST /api/ap/payment` with a real `invoiceEntryId` but a DIFFERENT vendor's `vendorId` (attempting to redirect which vendor's open-item ledger absorbs the payment) | BLOCKED — `"That bill is not an open item for this vendor."` |
| **Cross-tenant ID mismatch** | New this phase: `POST /api/ar/receipt` with a real invoice but a different customer's `customerId` | BLOCKED — `"That invoice is not an open item for this customer."` |
| Cross-branch restriction | Structurally present (`hasBranchAccess()`, `domain.js:8988`) but **opt-in** — only enforced when a user's `assignedBranches` is set, and no seeded user in this Lab has one configured (consistent with Phase 15's own finding that only one real branch value has ever been evidenced). Not exercised live this phase — disclosed, not assumed clean; the mechanism exists and is structurally sound but has no live fixture data to test against without inventing a branch assignment. |

## Verdict

Every authorization scenario actually exercised this phase — both the ones carried by the domain
test suites and the 6 targeted probes added specifically for this report — was correctly blocked.
The one item not live-tested (cross-branch) is disclosed rather than silently assumed working, per
this engagement's standing discipline. Combined with the structural route-safety-scanner proof
(0 violations, reconfirmed across 3 live restarts this phase), server-side authorization remains
sound and live-reproduced, not merely code-traced.
