# WAVE2_SOD-RESULTS.md

**Date:** 2026-09-22. Full SoD design/implementation record per this CR's own §5 (maker/checker/
protected-transaction/conflict-condition/enforcement-point/audit-behavior/exception-mechanism for every
new rule) and §18's per-rule test requirement (1-9).

## New rules — all implemented through the existing `checkSoD()`/`DB.sodRules` engine (no second
## framework), mirroring the SOD-5/SOD-6 precedent exactly, including the "no automatic Admin/CEO
## exemption, exception-grantable via the existing `DB.sodExceptions` mechanism" pattern

| Rule | Maker | Checker | Protected Transaction | Conflict Condition | Enforcement Point | Audit Behavior | Exception Mechanism |
|---|---|---|---|---|---|---|---|
| **SOD-7** | Production Order creator | Production Order completer | `completeProductionOrder()` | `prod.createdBy === actor.id` | Inline guard, start of `completeProductionOrder()`, before any state mutation | `SoDViolationBlocked` via `durableFailureAudit` (see §Defect below) | `DB.sodExceptions` (Admin/CEO-only grant, non-self-grantable, existing mechanism) |
| **SOD-8** | Job Work Order creator (dispatcher) | Linked Supplier Bill creator | `draftSupplierInvoice()`/`draftSupplierInvoiceFromPO()`, only when `jobWorkOrderId` is supplied | `jwo.createdBy === createdByUserId` | Inline guard, immediately after JWO existence/project-consistency check, in BOTH functions | Same | Same |
| **SOD-9** | Job Work Order creator (dispatcher) | Return/Scrap/Direct-Dispatch actor | `returnFromJobWorker()`, `recordJobWorkScrap()`, `directDispatchFromJobWorker()` | `jwo.createdBy === actor.id` | Inline guard, immediately after the project-open gate, in all 3 functions | Same | Same |
| **SOD-10** | QC checklist creator | Result submitter | `submitQCResult()` | `qc.createdBy === actor.id` | Inline guard, start of `submitQCResult()`, before the empty-items guard | Same | Same |
| **SOD-11** | CAPA effectiveness-checker | CAPA closer | `closeCAPACase()` | `capa.effectivenessCheckedBy === actor.id` | Inline guard, after the status/result checks, before `capa.status='CLOSED'` | Same | Same |

## A real defect found and fixed during this implementation itself

**Finding:** a bare `logAudit()` call immediately before an `{ok:false}` return, inside a function
reached through the request-dispatch layer's `withTransaction()` wrapper, is silently rolled back — that
wrapper restores the **entire DB snapshot** (including `DB.auditLog`) on any `{ok:false}` result (see
`domain.js` `withTransaction()`, the `if(result && result.ok === false){ DB = installWriteGuards(_snapshot); ...}`
branch). The ONLY payload proven to survive that rollback is the `durableFailureAudit` field on the
returned result, logged by `withTransaction()` itself AFTER the snapshot restore (the ERP-059B "durable
failure audit" mechanism, existing since a prior phase).

**All 8 new call sites across SOD-7/8/9/10/11 were corrected to use `durableFailureAudit` instead of a
direct `logAudit()` call** — verified live: every `SoDViolationBlocked` audit entry now survives and is
queryable via `GET /api/audit-log` (`WAVE2_TEST-RESULTS.md` Parts 1-5).

**Disclosed, not fixed elsewhere**: a quick verification this pass found that the PRE-EXISTING SOD-6
check inside `draftSupplierInvoiceFromPO()` uses the SAME bare-`logAudit()`-before-`{ok:false}` pattern
this defect describes, and would very likely exhibit the identical audit-trail-survival gap (the block
itself still works correctly — only the forensic `SoDViolationBlocked` record for it is silently lost).
**This is NOT fixed in this Wave 2 pass** — SOD-5/SOD-6 are ARCH-2026-001D's own code, outside this CR's
authorized scope (§2: "do not implement unrelated... functionality"; only the 5 NEW Wave 2 rules were
authorized). Classified as a LOW-severity finding (the security control itself is intact; only its own
audit visibility is affected, comparable in severity to the already-accepted `erp_059b` filesystem-path
gaps) — not a P0/P1/P2 defect requiring a STOP under this CR's §24 item 6, and reported here for a
future, separately-scoped fix rather than silently left undiscovered or silently patched outside scope.

## Test requirement compliance (this CR's §18, 1-9, per rule)

For every one of the 5 new rules, `tests/erp_arch_2026_002_wave2_tests.js` proves: (1) maker creates →
(2) same maker attempts the protected action → (3) blocked → (4) a second authorized user performs it →
(5) succeeds → (6) audit shows the blocked attempt with the correct actor → (7) direct API call (not
UI-mediated) exercises every assertion above → (8) forged actor/role in the request body does not
bypass SOD-7 (explicitly tested) — session-derived identity is used throughout, unchanged by this pass →
(9) — scope is N/A for these 5 rules (none introduces a new scope dimension); existing scope checks on
the same routes are unaffected, confirmed by the full regression battery. Full results:
`WAVE2_TEST-RESULTS.md`.

## Pre-existing test fixtures updated to reflect the newly-authorized behavior (not weakened)

The full regression battery's FIRST run after these 5 rules landed showed 4 new failures (1 in
`erp_arch_2026_001d_sod_tests.js`, 3 in `erp_audit_p0_tests.js`, 11 in
`erp_def_2026_001_qc_dashboard_tests.js`, 8 in `erp_phase39_manufacturing_jobwork_tests.js`) — reported
here in full, not hidden. Root cause, in every case: a PRE-EXISTING test fixture used the SAME actor for
both halves of what is now a maker≠checker pair (e.g. `pm1` created AND completed a Production Order;
`purchase1` dispatched AND returned/scrapped a Job Work Order; `pm1`/`ceo` created AND submitted a QC
checklist's result) — behavior these new rules now correctly block.

**Fix applied, in every case: change the SECOND actor to a different, already-authorized user** (e.g.
`ceo` completes what `pm1` created; `finance1` settles what `purchase1` dispatched) — never changing
what is asserted, never loosening a pass/fail condition. This is the exact same precedent already
established earlier in this engagement when `RBAC_SOD_RULES_SEED` grew from 4 to 6 rules
(ARCH-2026-001D's own fix to `erp_arch_2026_001a_rbac_foundation_tests.js` TEST 11): a test written
before a new, deliberately-authorized SoD control existed must be updated to use two actors, and doing
so is disclosed here explicitly, not silently folded in. One assertion (`erp_arch_2026_001d_sod_tests.js`'s
own "6 rules present" check) was loosened to "at least the 6 SOD-1..SOD-6 rules present, all by ID" —
the identical `>=N` pattern already used for that exact same class of change previously.

**Re-run after the fix: all 4 files back to their exact pre-Wave-2 baseline counts** — `erp_arch_2026_001d_sod_tests.js`
30/30, `erp_audit_p0_tests.js` 65/65, `erp_def_2026_001_qc_dashboard_tests.js` 19/19,
`erp_phase39_manufacturing_jobwork_tests.js` 36/36. See `WAVE2_REGRESSION.md` for the final, clean
full-battery result.

## Procurement / Inventory — verified, not built (per `WAVE2_IMPLEMENTATION_SCOPE.md`)

- **Procurement** (§6): re-confirmed this pass that no field links a Payment Request back to the PO/PR
  that caused it — the "verify" instruction is satisfied by this re-confirmation; building a new rule
  was not authorized (no linking field exists to enforce against, and adding one was not approved).
- **Inventory** (§7): re-confirmed the Material Requirement requester/approver identity is never checked
  against the actual Issuer in `createMaterialIssue()` — same disposition.

Both remain accurately reported in `ARCH-2026-002-WAVE-2-SECURITY-BASELINE.md` as MISSING, unchanged by
this pass, carried forward for a future, explicitly-scoped decision.
