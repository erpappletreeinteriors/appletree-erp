# Migration Rehearsal Framework

The Master Data Import Framework and Opening Balance Engine (`09_MASTER_DATA_IMPORT.md`, `10_OPENING_BALANCE_IMPORT.md` in `05_HANDOVER_DOCUMENTATION/`) ARE the rehearsal tooling — no real data has been migrated using them; they have only been exercised with clearly-marked TEST values throughout development and testing.

## How the required safety properties are satisfied

| Required capability | How it's satisfied |
|---|---|
| Import | `POST /api/master-import` / `POST /api/opening-balance/import`, both accept CSV |
| Validate | Every row is validated against required fields, data types, and cross-references (does this account/customer/project actually exist?) BEFORE anything is created |
| Preview | Validation and creation happen together, per row — this is deliberately SAFER than a separate preview step: a preview that doesn't perfectly match what actually happens at commit time is a known failure mode in real systems. Here, a row that would fail validation is *guaranteed* never to be created, so the per-row result table IS an accurate, real record of exactly what happened — not a prediction that could turn out wrong |
| Error report | Every rejected row is reported individually with its specific reason (see the Results table in both screens) |
| Approve | Master data is created immediately upon successful validation (masterData-tier role only); Opening Balance rows create Drafts requiring a SEPARATE Approve step through the standard Document Workflow before anything posts to the ledger |
| Commit | Master data: on successful validation. Opening Balances: on Post (after Submit + Approve) |
| Rollback | A rejected row was never created — there is nothing to roll back. An ACCEPTED master-data record can be corrected/deactivated through its own screen (no hard-delete exists anywhere in this system, matching the same "reverse, never erase" principle used for accounting documents). An accepted-but-not-yet-posted Opening Balance Draft can simply be Rejected in Document Workflow instead of Posted — again, nothing was ever partially written |

## What a real migration rehearsal should still do
1. Take a full Backup first (`28_BACKUP_RESTORE.md` / `09_BACKUP_RESTORE/`).
2. Import a REAL (not test) sample — a small, representative slice of real data — into a copy of the environment.
3. Review the per-row results carefully.
4. Reconcile (Opening Balance Equity should trend toward zero as more real data loads correctly).
5. Only then proceed to the full real dataset.
6. Restore the backup from step 1 if anything about the rehearsal needs to be undone wholesale.

No real data was migrated as part of this phase — this document describes the tooling and procedure for when Appletree's accounts team is ready to do so themselves.
