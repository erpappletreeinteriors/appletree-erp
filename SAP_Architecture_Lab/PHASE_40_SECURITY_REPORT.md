# PHASE 40 — Security Report

**Date:** 2026-09-13.

## Structural

Route safety scanner: 0 violations, reconfirmed at this phase's own server boot (would have refused
to start otherwise) — `GET /api/test/architectural-violations` → `{violations:[], count:0}`.

## Targeted probes, fresh this phase

| # | Scenario | Result |
|---|---|---|
| 1 | Crafted payload — negative-quantity PO line, from a role that also isn't authorized to create POs | BLOCKED — `"Role \"FinanceManager\" cannot perform this action (requires one of: Admin, CEO, Purchase)."` (role gate reached before the quantity validation — still correctly blocked) |
| 2 | Privilege escalation — spoofed `"actor":{"role":"CEO"}` in the request body, real session is Accountant | BLOCKED — server derives role from session, payload field ignored entirely |
| 3 | Stale/fabricated session cookie | BLOCKED — `"Not authenticated. Please log in."` |
| 4 | No session at all | BLOCKED — same message |
| 5 | Alternate-endpoint bypass (`/api/fixedassets/...` vs. real `/api/fixed-assets/...`) | 404 — no unguarded legacy handler |
| 6 | Party-mismatch tampering — real invoice, wrong customerId | BLOCKED — `"That invoice is not an open item for this customer."` |

## Live RBAC evidence from the browser UAT pass itself (not simulated — every one a real click)

| Scenario | Result | Reference |
|---|---|---|
| Accountant self-approves own Customer Invoice | BLOCKED | Matrix UAT-A2/B3 |
| SiteInCharge self-approves own MRS above petty limit | BLOCKED, cites SOP §8 | Matrix UAT-A3/D5 |
| SiteInCharge attempts to create a Site | BLOCKED | Matrix UAT-D1 |
| Purchase attempts to create a Job Worker | BLOCKED | Matrix UAT-G1 |
| Purchase attempts to complete a Production Order | BLOCKED | Matrix UAT-F8 |
| Estimator self-approves own BOM | BLOCKED | Matrix UAT-F2 |
| Purchase raises, FinanceManager approves, CEO executes a Payment Request (3 distinct people) | Real maker-checker-executor separation enforced | Matrix UAT-C8-C10 |

**11 total live-blocked unauthorized business operations this phase (6 fresh probes + 5 browser-UAT
RBAC negatives), 0 unauthorized operations succeeded.**

## Verdict

Security holds under both direct API probing and real browser-driven role-switching. Target of
Section 23 ("0 unauthorized business operations") met.
