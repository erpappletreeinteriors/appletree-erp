# PHASE 41 — Viewer Role UAT

**Date:** 2026-09-13. Isolated test server, `APP_ENV=test`, port 4100. Real browser session
(`viewer1`) plus direct API probes, per Section 4's explicit "test both A. browser UI controls B.
direct API/route authorization."

## Positive — what Viewer CAN do (all live-confirmed)

| Screen | Result |
|---|---|
| Login | Succeeded, real session established |
| Dashboard | Renders correctly: `"5 VISIBLE PROJECTS"` (all 5 seeded projects — a broad, intentional read-only visibility policy, not a bug — see Data-Scope section below) |
| Trial Balance | Renders correctly: `₹0.00 / ₹0.00`, `Balanced ✓` (accurate for the reset state at the time) |
| Project 360 | Renders correctly, full financial summary (Committed/Received/Invoiced/Paid/Consumed/Revenue/Cost/Margin), all real fields, all correctly ₹0.00 on the reset dataset |
| Sidebar scope | `allowedModules()` returns exactly 4 groups: HOME, PROJECTS, FINANCIAL STATEMENTS, REPORTS & ANALYTICS — no Procurement/Finance-transactional/Inventory/Master Data/Administration group is shown |

## Negative — what Viewer CANNOT do

### A. Direct API/route authorization (10 attempts, 10 blocked)

| # | Attempted action | Result |
|---|---|---|
| 1 | Create GRN | BLOCKED — `"Role \"Viewer\" is not authorized to perform this action."` |
| 2 | Issue material | BLOCKED — same message |
| 3 | Create Purchase Order | BLOCKED — `"...requires one of: Admin, CEO, Purchase."` |
| 4 | Create Customer Invoice | BLOCKED — `"Role \"Viewer\" cannot create."` |
| 5 | Create/find Customer master | BLOCKED — `"Role \"Viewer\" cannot create customers."` |
| 6 | Bank transfer | BLOCKED |
| 7 | Create backup | BLOCKED — `"Role \"Viewer\" cannot create a backup."` |
| 8 | Restore backup | BLOCKED — `"Role \"Viewer\" cannot restore a backup."` |
| 9 | Approve a payment request | BLOCKED — `"Role \"Viewer\" cannot approve a payment request."` |
| 10 | Create a user (admin action) | BLOCKED — `"Role \"Viewer\" cannot create users."` |

### B. Real browser UI control — not just a hidden button

The Purchase Orders screen was navigated to directly (via `selectTab()`, the same function a sidebar
click invokes) despite not being in Viewer's own sidebar. **The form rendered fully, including a
live "Create PO" button — the client does not hide it.** Fields were filled with real values and the
button was **actually clicked** (a real DOM click event, not a simulated API call):

Result: `"DENIED: Role \"Viewer\" cannot perform this action (requires one of: Admin, CEO,
Purchase)."` — the table remained empty afterward. **This proves the block is server-side
authorization, not merely a hidden button** — exactly what Section 4 requires ("Do not rely only on
hidden buttons").

## Data-scope policy (Section 9)

Viewer sees all 5 seeded projects (`"5 VISIBLE PROJECTS"`) and has read access to Financial
Statements (Trial Balance, Balance Sheet, P&L, AR/AP Ageing, General/Customer/Supplier Ledger) and
Reports & Analytics. This is confirmed to be the **intentional** design (Viewer's `ROLE_MODULES`
entry is a deliberate, curated, broad-but-read-only set — the same discoverability-filter pattern
documented for every other role) — not an oversight. Master Data, Administration, and every
transactional module (Procurement, Inventory, Finance-transactional, Production) are excluded from
Viewer's own navigation, and — per the 10 negative tests above — from Viewer's actual authority
regardless of navigation.

## Verdict

Viewer role fully tested: what it can see is real and correct; what it cannot do is blocked both
by omission from its own navigation AND by real server-side authorization when directly attempted
via a genuine, rendered, clicked UI control or a direct API call. 0 of 11 total prohibited attempts
(10 API + 1 real browser click) succeeded.
