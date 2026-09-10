# 28 — Backup / Restore

## How it works
Because the entire system's data (GL, subledgers, masters, attachments, audit log, policy configuration) lives in one file (`db.json`), a backup is genuinely complete by copying that one file — nothing is left out. Backups are timestamped, checksummed (SHA-256, to detect corruption), and stored in `server/backups/`.

## Who can do it
Admin/CEO only, both for creating and restoring a backup — restoring is the single most consequential action in the system (it replaces the entire live database), so it is gated and logged accordingly.

## Approved policy (not yet formally scheduled — a management decision)
Suggested starting point: **Daily backup, 30-day retention, monthly restore-drill verification.** This is a recommendation, not yet a formally adopted operating procedure — someone at Appletree needs to own actually running backups on this cadence (this system does not currently schedule them automatically; each backup is a manual action via **Admin → Create Backup** or the API).

## Tested and proven
A full Backup → Reset → Restore → Reconcile cycle has been tested and passes: after restoring, General Ledger, AR, AP, Inventory, Projects, Service, Warranty, AMC, Fixed Assets, Bank data, and the Audit Log are all byte-identical to their state at backup time.

## Restoring
**Admin → Backups → Restore**, or `POST /api/admin/restore` with the backup filename. A corrupted or invalid backup file is safely rejected before touching the live database — nothing is ever partially restored.
