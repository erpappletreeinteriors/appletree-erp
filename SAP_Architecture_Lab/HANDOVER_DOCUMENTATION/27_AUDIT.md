# 27 — Audit

## Coverage
Roughly 120 distinct logged event types across the system, covering: Login/Logout, every Create/Edit/Submit/Approve/Post/Reverse/Clear/Export action, every master-data change (including specifically-named events like `CustomerGSTINChanged`, `MaterialHSNChanged`), Financial Period Close/Reopen/Override, Bank Reconciliation actions, Fixed Asset lifecycle events, Backup/Restore, and every denied/unauthorized access attempt.

## What each entry records
User identity, timestamp, the action type, the affected document/record, and — where relevant — the old value, new value, and stated reason (e.g., a Reversal always records why; a Financial Period Override always records the reason and the exact document it enabled).

## Where to view it
**Reports → Audit Log** (Admin/CEO only), searchable and paginated.

## Immutability
Nothing in the audit log can be edited or deleted through any screen or API endpoint — it is strictly append-only.
