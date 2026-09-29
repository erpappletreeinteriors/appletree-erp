# WAVE1_SECURITY-RESULTS.md

**Date:** 2026-09-22. Security testing for this Wave 1 implementation pass, per §7/§16 of the
authorizing CR. Covers both implemented items; the 2 findings from `ARCH-2026-002-SECURITY-BASELINE.md`
are dispositioned explicitly (one fixed, one deferred with reason — neither silently dropped).

## 1. Finding disposition

| Finding | Phase 0 Severity | In Wave 1 scope? | Disposition |
|---|---|---|---|
| Reporting & Analytics cross-project budget-variance leak | MODERATE | **YES** — Reporting & Analytics is a Wave 1 domain | **FIXED**, live-tested (§2 below) |
| QC checklist audit-log gap | LOW | **NO** — Quality Management is a Wave 2 domain | **DEFERRED to Wave 2**, per this CR's own §20 ("DO NOT build full Wave 2–6 modules") — fixing it here would be exactly the scope creep that rule forbids, even though the fix itself is 1 line |

## 2. Reporting fix — live security verification

- `GET /api/reports/budget-variance` as ProjectManager `pm1` (assigned PRJ-1, PRJ-3 only), no
  `projectId` → returns exactly `[PRJ-1, PRJ-3]`, never the other 3 seeded projects. **PASS.**
- Same request with `projectId=PRJ-2` (a project NOT assigned to `pm1`) → returns **zero rows**, not
  PRJ-2's data. **PASS.**
- Same request with `projectId=PRJ-1` (pm1's own project) → still returns it — proves the fix is a real
  filter, not an over-broad block. **PASS.**
- Same request as CEO/FinanceManager (company-wide roles) → unaffected, still returns all 5 projects.
  **PASS — no access regression for any other role.**
- Missing authentication → 401/403, never 200. **PASS.**
- Forged role via client-supplied field: not applicable — `actor` is always session-derived
  (`getActor()`), never read from the request body, unchanged by this fix.

All 6 assertions live-tested twice: once via `tests/erp_arch_2026_002_wave1_tests.js` Part 1 (automated
HTTP), once via a real logged-in browser session (`WAVE1_BROWSER-UAT.md`).

## 3. Bank Reconciliation consolidation — security testing

- **Authorization unchanged on both API surfaces**: `/api/bank-statement/*` keeps its exact original
  role gate (`['Admin','CEO','FinanceManager','Accountant']` import/match, `['Admin','CEO',
  'FinanceManager']` unmatch — deliberately narrower than `/api/bank-import/*`'s `can(actor,'clear')`
  for unmatch, and NOT widened by this consolidation); `/api/bank-import/*` keeps its exact
  `can(actor,'clear')` gate. Live-tested: Sales role blocked on both surfaces (403).
- **Migration endpoint** (`POST /api/admin/migrate-legacy-bank-lines`) is Admin/CEO-only, matching the
  Backup/Restore tier. Live-tested: FinanceManager (a role with `clear:true` but not Admin/CEO) is
  blocked (403) — this is a DELIBERATELY narrower gate than the reconciliation actions themselves,
  since running a data migration is a higher-privilege action than day-to-day reconciliation.
- **Forged identity/role**: every mutating function (`createBankImportBatch`, `matchBankImportLine`,
  etc.) derives `actor` from the authenticated session only, unchanged by this consolidation — no
  client-supplied field can override it.
- **Concurrency**: 2 simultaneous imports of the identical CSV produce exactly 1 Imported + 1 Duplicate
  line, never 2 Imported — the existing `bankTxnId`-based duplicate-detection (unchanged logic, now also
  serving GENERIC-format imports via the synthesized deterministic `bankTxnId`) holds under a real race.
- **Migration is not destructive**: `DB.bankStatementLines` is never written to or deleted by the
  migration function — verified by reading the scratch server's `db.json` directly before and after a
  migration run (2 original records present, byte-identical, after migration).
- **Migration is idempotent**: running it twice produces 0 newly-migrated records on the second run,
  and the total migrated-line count in `bankImportLines` stays at exactly 2 — no duplicate migrated
  lines, no double-processing.
- **Migration never touched production**: `server/db.json` hash confirmed identical before and after
  this entire Wave 1 pass (see `WAVE1_ACCEPTANCE.md` §O) — the migration function was exercised only
  against a disposable isolated scratch instance, never against production, and remains a separate,
  explicitly-authorized action (not auto-run at boot) for management to invoke later if/when they choose.

## 4. No new CRITICAL or unresolved P0/P1/P2 defect found

Both implemented items were built additively against existing, tested central engines
(`postJournalEntry()`, the RBAC/scope dispatcher). No new authorization bypass, no new shadow engine, no
new duplicate transaction owner was introduced. One real, minor client-side defect was found and fixed
DURING this same pass's own browser UAT (a false-positive "balance mismatch" badge for GENERIC-format
lines, caused directly by this pass's own null-tolerant balance-validation change) — see
`WAVE1_BROWSER-UAT.md` and `WAVE1_CHANGELOG.md` §2. It was found, fixed, and re-verified live within
this same Wave 1 pass, not left open.

## 5. Conclusion

No CRITICAL vulnerability found or introduced. The one MODERATE finding this Wave 1 pass was authorized
to fix is fixed and live-tested. The one LOW finding is explicitly deferred (not silently dropped) to
the wave that owns its domain. Security posture across both implemented items is equal to or stronger
than before this pass — no existing access was widened, one real gap was closed, and one real capability
(GL allocation) was correctly extended to a class of records (generic-format imports) that previously
lacked it, under the exact same authorization gate as before.
