# 29 — Troubleshooting

## The server won't start
- Check nothing else is already using port 4001 (`netstat -ano | findstr :4001` on Windows).
- Check `server/db.json` is not corrupted (valid JSON) — if it is, restore from the latest backup (`28_BACKUP_RESTORE.md`) or delete it to start from a fresh seed (⚠️ this discards all data — only do this deliberately).

## "An unexpected error occurred" message
As of Phase 20, every request is wrapped in a safety net — if something genuinely unexpected happens, you'll see this generic message instead of a technical error or a broken page, and the server keeps running normally for everyone else. The real technical detail is written to the server's own log file (`server/server.log`) for a developer to investigate — it is deliberately never shown to the user, since a stack trace or internal file path is meaningless (and a minor security risk) to show a business user.

## A screen shows stale-looking numbers
Every report is computed live from the database on each request — if a number looks wrong, refresh the page first. If it's still wrong after refresh, check the Document Viewer for the specific transaction in question before assuming it's a bug — most "wrong number" reports during development turned out to be a real transaction the user hadn't accounted for, not a calculation error.

## Login is locked
5 failed attempts locks an account for 15 minutes. An Admin can reset this immediately via Admin → Reset Password.

## Performance at scale
This system stores everything in one JSON file and recomputes reports by scanning it — this is fast enough for the data volumes tested (hundreds of transactions) but was NOT designed or tested for tens of thousands of transactions. If real usage grows far beyond what was tested, a real database migration (not just a bigger file) would eventually be the right fix — that is explicitly out of scope for this offline build.

## Something seems genuinely broken
Check `server/server.log` for the real error. If it's a genuine software defect (not a data-entry mistake), it needs a developer to investigate the `domain.js`/`server.js` source — this handover does not include ongoing development support (see `32_HANDOVER_CHECKLIST.md` for what support arrangement, if any, Appletree management decides to put in place).
