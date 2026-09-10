# 05 — User Roles

Nine roles exist. Every permission below is enforced on the server — a role cannot see or do more by editing the browser.

| Role | Create | Edit | Submit | Approve | Post | Reverse | Clear | Pay | Master Data | Export | Configure |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CEO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| FinanceManager | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| Accountant | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ |
| ProjectManager | project-scoped only | project-scoped only | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Purchase | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Sales | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Estimator | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Viewer | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

## Segregation of Duties (SoD)
A user cannot Approve or Post a document they themselves created — the system blocks it — **unless** they are CEO or Admin, in which case an explicit "self-approval override" is logged. This mirrors how a small company genuinely operates (the CEO sometimes must approve their own entry) while still recording that it happened.

## Data scoping
- **Sales** only sees customers explicitly assigned to them.
- **ProjectManager** only sees/acts on projects explicitly assigned to them (either at user setup or set when the project was created).
- **Purchase, Sales, Estimator** cannot see the company's full General Ledger, Trial Balance, or Bank data — only Admin/CEO/Accountant/FinanceManager/Viewer can (see `06_SECURITY.md`).

## Creating real users
Use Admin → Create User (or `POST /api/admin/users`). Passwords must be at least 8 characters with an uppercase letter, lowercase letter, digit, and special character. There is no password expiry by policy (Phase 19 decision). Account lockout is 5 failed attempts → 15-minute lock, cleared by an Admin password reset.
