# ARCH-2026-001 — db.json Forensic Reconciliation & 26-Domain Correction

**Date:** 2026-09-21. AUDIT-ONLY. No application code, database content, security model, role,
permission, or production data was altered to produce this document. `server/db.json` was read but
never written.

---

## A. `db.json` forensic finding

**Method:** `server/db.json` is `.gitignore`d (`**/db.json*`, confirmed via `git check-ignore -v`) —
there is no git history to diff against. Instead, `server/db.json.bak` — written by the same atomic
save operation that produced the current `server/db.json` (both timestamped 2026-09-19 14:54:59,
alongside `server/db.json.lock`) — is the exact pre-change snapshot. A full structural diff (all 121
top-level collections, both directions) was run between `db.json.bak` (pre-change) and `db.json`
(current).

**Result: exactly one difference, in one collection.**

| Collection | Pre-change (bak) | Current | Delta |
|---|---|---|---|
| `loginHistory` | 8 entries | 9 entries | +1 entry appended |
| All other 120 collections | — | — | **byte-for-byte identical** (journal entries, inventory movements, projects, customers, vendors, users, roles, security config, numbering counters, everything) |

The single new record:

```json
{"username":"ceo","at":"2026-09-19T09:24:59.832Z","reqId":3,"result":"PASS","userId":"U-CEO","role":"CEO"}
```

**Classification:** a **security/audit-trail record** (a successful login event). Not metadata, not
test data, not a business transaction, not accounting, not inventory, not numbering, not
configuration. It is not itself ERP-059B-related (see §C), but it touches the same file ERP-059B
touched.

**Corroborating evidence, same event:**
- `server/db.json.lock` content: `{"pid":4300,"startedAt":"2026-09-19T09:24:49.614Z"}` — a server
  process (PID 4300) started 10.2 seconds before the login timestamp above.
- The login's `reqId:3` is anomalously low (matching the `reqId` of the very FIRST login attempts
  ever recorded in `loginHistory`, back on 2026-09-10) — consistent with `reqId` being a
  per-process-lifetime counter that resets on restart, i.e. this was request #3 of a freshly started
  process, not request #(several thousand) of a long-running one.
- `09:24:59.832Z` UTC = `14:54:59.832` IST, matching the file's own local modify timestamp
  (`14:54:59.947`) to within normal processing latency.

**Also newly discovered (context, not the primary ask, kept brief):** the "known Sep 10 state" this
engagement has cited for 9 days as the unchanged baseline (52,411 bytes, `db.json.bak`'s content) is
itself NOT a pristine original — `server/backups/db.json.CORRUPTED_by_accidental_test_reset_20260910_1645.json`
(51,690 bytes, Sep 10 16:47) is a preserved snapshot of a real, named incident ("accidental test
reset"). Diffing that corrupted snapshot against the Sep-10-18:14:36 baseline shows a real recovery
step occurred in between: `glDocumentTypes` grew from 51→57 entries (6 registry entries restored) and
`loginHistory` grew from 6→8 entries, with `projects` unchanged. This is consistent with a genuine,
deliberate repair (matching this engagement's own documented history of finding and fixing missing
`glDocumentTypes` registry entries), not further corruption. **This does not change any of this
engagement's prior "unchanged since Sep 10" claims** — they were accurate statements about that
specific file's content from 18:14:36 onward; it does mean that content was itself the output of an
earlier same-day incident-and-recovery, a fact not previously surfaced in this session's own prior
reports. Flagged for completeness, not re-litigated further here — it is 9 days old and outside this
task's Sep 10→Sep 19 scope.

## B. Cause confidence: **PROBABLE**

Not CONFIRMED (no session log, IP address, or external corroboration ties the login to a specific
person or Claude session — `loginHistory` records username/role/result only). Not UNCONFIRMED either
— the architectural evidence is specific and internally consistent, not merely an absence of
contrary evidence:

- `server.js`'s `DB_FILE` resolution (read fresh, `domain.js:85-93`): defaults to exactly
  `path.join(__dirname, 'db.json')` — i.e. this exact file — **whenever `DB_PATH` is not set AND
  `APP_ENV` is not `'test'`**.
- The standard `sap-lab-secure` launch configuration (`.claude/launch.json`, read fresh) is
  `node SAP_Architecture_Lab/server/server.js`, port 4001, **with no `env` block at all** — meaning
  running it via its own documented, standard launch path produces exactly this DB_FILE resolution.
- **This means the write did not come from an isolated/disposable test instance** in the sense this
  engagement has used that term throughout (a scratch-directory copy with an explicit `DB_PATH`
  override) — isolation requires deliberately copying files elsewhere, precisely because running the
  original files in place, even for "just a quick check," resolves to this exact production-path file.
- What IS established: a real server process was started using (or consistent with) the standard,
  un-parameterized launch configuration, and a real, successful CEO login occurred against it.
- What is NOT established: WHO started it or WHY, whether it was a deliberate demo/verification
  action, an accidental launch, or something else, and whether `APP_ENV` was truly left at its
  production default or was set to something not otherwise evidenced (no `server.log` entry exists
  for this exact startup — the most recent real `server/server.log` content predates this event).

**PROBABLE, not CONFIRMED, in the direction that this was NOT isolated test activity** — the opposite
conclusion from what a quick, size/validity-only read would suggest. This report does not assert the
login was unauthorized or malicious; it asserts only that the mechanical evidence does not support
calling it "isolated test activity," which is the specific claim the task asked to be tested rather
than assumed.

## C. ERP-059B impact: **NONE**

The historical ERP-059B incident's own signature (the corrupted-reset event, §A above) is a distinct,
already-documented, 9-day-old event with its own preserved snapshot. This Sep 19 event:
- Added zero business records, zero accounting entries, zero inventory movements — confirmed by the
  full 121-collection structural diff finding only `loginHistory` changed.
- Did not touch any collection ERP-059B affected (`glDocumentTypes`, `projects` per §A's Sep-10
  sub-finding).
- Was a read-mostly operation (login) that appends one audit record — not a reset, restore, import,
  or destructive action of any kind.

No evidence connects this event to ERP-059B beyond sharing the same file path.

## D. Corrected 26-domain mapping

See `ARCH-2026-001-26-DOMAIN-MATRIX.md`, corrected in place this session. Summary of the fix:

**Root cause of the 29-vs-26 discrepancy:** the prior summary table's "EXISTING (fully)" row listed
13 domain numbers, omitting domain #16 (Reporting & Analytics) — which the matrix's own main table,
one row above, had always correctly classified EXISTING. The closing prose then stated "17 of 26
domains are real" (silently merging 13+4 as an unlabeled combination) rather than referencing the
table's own category counts. Read literally against the table's separately-listed "4 narrower" and
"1 clarification" rows, 17+4+1+7 = 29. This was a transcription/arithmetic bug in how the summary was
written, not a change to which domains exist or how they were individually classified — every
individual domain row (1-26) in the main table was correct throughout; only the roll-up summary was
wrong.

**Corrected, verified one-to-one mapping (each of the 26 domains appears exactly once):**

| Status | Count | Domains |
|---|---|---|
| EXISTING (fully) | 14 | 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 14, 15, 16, 17 |
| EXISTING, PARTIAL | 4 | 7, 12, 13, 18 |
| REQUIRES CLARIFICATION | 1 | 19 |
| NOT APPLICABLE / FUTURE ROADMAP | 7 | 20, 21, 22, 23, 24, 25, 26 |
| **Total** | **26** | **verified: 14+4+1+7 = 26, no domain repeated, none omitted** |

The approved 26-domain scope itself is unchanged — this is a correction to the classification
bookkeeping only, per the task's own instruction not to silently change scope.

## E. Files changed during this audit

- `ARCH-2026-001-26-DOMAIN-MATRIX.md` — **Summary section only**, corrected (documentation fix, not a
  scope change) — see §D.
- `ARCH-2026-001-DB-FORENSIC-AND-DOMAIN-RECONCILIATION.md` — this document, newly created.

No other file was modified. No application code, no `server/domain.js`, no `server/server.js`, no
`client_secure/index.html`, no database content.

## F. Files explicitly confirmed untouched

- `server/db.json` — read via Node's `fs.readFileSync` (read-only) for the structural diff; never
  written. Its modify/access timestamps as observed reflect only this investigation's own read
  access where applicable, not a write (no write call was made by this task).
- `server/db.json.bak`, `server/db.json.lock` — read-only, both confirmed unmodified.
- `server/backups/db.json.CORRUPTED_by_accidental_test_reset_20260910_1645.json` — read-only.
- `server/domain.js`, `server/server.js` — read-only (confirmed the `DB_FILE` resolution logic;
  no edits).
- `ARCH-2026-001-CURRENT-STATE-MAP.md`, `ARCH-2026-001-ROLE-SECURITY-DESIGN.md` — unchanged from the
  prior turn; remain design/audit documents only, per the task's explicit instruction.
- `CONTROLLED_CHANGE_REGISTER.md` — unchanged this task (see §H for the recommended next entry).

## G. Remaining management decisions

1. **Who/what started the `sap-lab-secure` production-path server on 2026-09-19, and was the CEO
   login expected?** This report establishes the mechanical facts (§A, §B) but cannot establish
   authorship or intent from `db.json` content alone. If this was a deliberate demo or verification
   run, no further action is needed beyond noting it; if it was unexpected, the standing
   recommendation (already true architecture, not new) is that anyone running this server should use
   an explicit `APP_ENV`/`DB_PATH` pair, never the bare, unparameterized `sap-lab-secure` launch entry,
   to avoid exactly this ambiguity in the future.
2. **CEO-vs-technical-administrator split** (carried over from `ARCH-2026-001-ROLE-SECURITY-DESIGN.md`
   §4) — remains an **OPEN MANAGEMENT DECISION**, not decided here, not decided autonomously.
3. **"Integration & Platform" domain #19 scope** — still REQUIRES CLARIFICATION from the requester
   before it can be classified in the 26-domain matrix (per `ARCH-2026-001-26-DOMAIN-MATRIX.md`).
4. **Sequencing of the 7 `ARCH-2026-001a`-through-`g` sub-items and the 7 net-new-domain CRs**
   (`ARCH-2026-001-ROLE-SECURITY-DESIGN.md` §6) — still unauthorized, still unsequenced.
5. **Coordination with the parallel session's own Phase 42/43 track** — still no established
   communication channel between the two; this remains a standing risk for any future implementation
   work touching the same files (`ARCH-2026-001-CURRENT-STATE-MAP.md` §3).

## H. Recommendation for the next separately authorized change

Given this task's own findings, the recommended next step is narrower than "begin implementation" —
it is a **verification step, not a build step**:

**Recommended: confirm the Sep 19 CEO login's provenance** (management decision #1 above) before any
`ARCH-2026-001` implementation sub-item is authorized. This costs nothing to defer, but leaving it
open means any future session working on this codebase inherits an unexplained access event on the
production-path file without knowing whether it was benign. A single direct answer from whoever was
running sessions against this repository on 2026-09-19 (or a check of that session's own transcript,
if retrievable) would fully resolve it — this task's own tools (read-only file/DB inspection) have
been exhausted; further certainty is not obtainable from `server/db.json`'s content alone.

**No ARCH-2026-001 implementation sub-item is recommended to start yet.** The design deliverables
(`ARCH-2026-001-CURRENT-STATE-MAP.md`, `ARCH-2026-001-26-DOMAIN-MATRIX.md`,
`ARCH-2026-001-ROLE-SECURITY-DESIGN.md`) remain accurate and ready for review; this task's own
corrections (domain-count fix) do not change their conclusions. The next authorized action should be
either (a) closing management decision #1, or (b) if the CEO/user prefers to proceed regardless,
explicit authorization naming exactly one of the `ARCH-2026-001a`-through-`g` sub-items to begin,
which would then follow this engagement's standard investigate→design→implement→test→regress→document
cycle on its own.
