# ARCH-2026-002 — W4 Scope Gate (Master Synthesis)

**Date:** 2026-09-26. Final synthesis deliverable per this CR's own §22/§27. Ties together all 9 other
deliverables of this CR into the required §27 A-N report structure, plus this CR's own §16 change-boundary
classification and §25 verdict.

## §16 — Change boundary classification

Per this CR's own instruction: "For the nine existing Service capabilities, default classification must
remain EXISTING unless evidence and management decision justify otherwise. Do not rebuild existing Phase
10 functionality simply because Wave 4 is now formally organized."

| Classification | Items |
|---|---|
| **EXISTING — DO NOT CHANGE** | All 9 Module Matrix capabilities' core function (Customer 360, Warranty, Complaints, Service Tickets, Service Visits, AMC, AMC Schedule, Service Billing, CAPA) — every state machine, every existing route, every existing accounting posting. SOD-11. The single-engine architecture (GL/AR/Inventory/CAPA/Numbering/Authorization/Scope/SoD/Approval/Audit/Transaction-wrapper/Clearing). |
| **EXISTING — HARDEN** | The 2 IN-SCOPE items (audit-log completeness, CAPA source-ID validation) — both close a gap in an already-correct system without changing its behavior for any valid input. |
| **EXISTING — EXTEND** | Every POLICY DEPENDENT item that adds a dimension/field/rule to an already-existing function without changing its core behavior for existing valid inputs: W4-5 (rate-card lookup), W4-7 (duplicate-billing guard), W4-8/9 (SoD rules), W4-10b ("Site issue" origin), W4-11 (technician/Cost-Centre tagging), W4-12 (Site/Branch scope). |
| **NEW — BUILD** | None. Even W4-6's most invasive option (a Warranty Provision GL account) is a new ACCOUNT under the existing GL engine, not a new engine or module — classified EXISTING — EXTEND, not NEW — BUILD, consistent with this CR's own §12/§13 prohibition on new financial engines. |
| **DEFERRED** | All 12 W4 decision items pending management input; all 5 sub-waves (4A modified, 4B-4E) pending their gating decisions. |

**No existing Phase 10 functionality is scheduled for rebuild anywhere in this gate's scope.**

## A. Management Decision Register

12 items (W4-1 through W4-12), all **OPEN**. Full detail: `ARCH-2026-002-W4-MANAGEMENT-DECISION-
REGISTER.md`.

## B. W4 Gap Disposition

7 named gaps + 1 newly-surfaced omission, dispositioned: 2 IMPLEMENT (recommended, future CR), 10 POLICY
DEPENDENT, 0 DEFER/NO CHANGE/NOT APPLICABLE. Full detail: `ARCH-2026-002-W4-GAP-DISPOSITION.md`.

## C. Implementation Scope

2 items IN SCOPE (zero business-policy content, ready-to-implement specification provided); 10 items
POLICY DEPENDENT. This CR authorizes neither. Full detail: `ARCH-2026-002-WAVE-4-IMPLEMENTATION-SCOPE.md`.

## D. Existing vs Harden vs Extend vs New matrix

See §16 above.

## E. Sub-wave plan

4A MODIFIED (duplicate-billing removed, now POLICY DEPENDENT); 4B, 4C, 4D, 4E all DEFERRED pending their
respective management decisions. Zero sub-waves ADOPTED or REJECTED outright. Full detail:
`ARCH-2026-002-WAVE-4-SUBWAVE-PLAN.md`.

## F. Dependency impact

All 13 architecture-preservation engines re-confirmed intact; zero W4 item (at any classification) touches
a shared engine improperly. None of Wave 3's 9 open items blocks Wave 4. No Wave 5/6 functionality
required. Full detail: `ARCH-2026-002-W4-DEPENDENCY-IMPACT.md`.

## G. Security impact

No CRITICAL finding, no STOP condition. Scope-by-action specified for both IN-SCOPE items and for the
SoD-expansion/Site-scope POLICY DEPENDENT items, so a future decision can move directly to implementation
without re-deriving this analysis. Full detail: `ARCH-2026-002-W4-SECURITY-IMPACT.md`.

## H. Accounting impact

Only W4-6 (Warranty accounting treatment), and only under its Option B, carries a significant accounting
impact; every other item is zero-impact or purely preventive. No shadow financial model anywhere in scope.
Full detail: `ARCH-2026-002-W4-ACCOUNTING-IMPACT.md`.

## I. Data-model impact

Zero new collections/tables proposed anywhere. The largest changes on the table (a new GL account under
W4-6 Option B; a new FK under W4-12 Option B) are additive to existing structures. Full detail:
`ARCH-2026-002-W4-DATA-MODEL-IMPACT.md`.

## J. Acceptance criteria

Full testable criteria (Functional/Security/RBAC/Data Scope/SoD/Approval/Audit/Accounting/Inventory/
Project Cost/Reporting/Concurrency/Duplicate prevention/Regression/Browser UAT) defined for both IN-SCOPE
items. No criteria written for POLICY DEPENDENT items — cannot be, until each decision fixes the target
behavior. Full detail: `ARCH-2026-002-WAVE-4-ACCEPTANCE-CRITERIA.md`.

## K. Regression evidence

Targeted, disclosed spot-check (per this CR's own §19 allowance to use judgment on re-verification depth,
consistent with the immediately-prior Wave 4 Phase 0 gate's own precedent):

| Suite | Result | Notes |
|---|---|---|
| `erp_arch_2026_002_wave3_tests.js` (fresh isolated server, port 4540) | **71 PASS / 0 FAIL / 71 TOTAL** | **Investigated discrepancy** — see below. |
| `erp_audit_p0_tests.js` (same server) | **65/65 PASS** | Matches every prior recorded result exactly. |

**Investigated discrepancy, per this CR's own §19 "DO NOT silently normalize" instruction:** the
documented Wave 3 baseline (`WAVE3_TEST-RESULTS.md`) recorded 70/70 for this suite. This fresh run
produced 71/71. Root-caused by direct inspection of `tests/erp_arch_2026_002_wave3_tests.js` lines
277-287: the test's own [C1] section contains an `if(inst)` branch — IF a `DB.installations` record exists
in the server's seed data at test-run time, it executes 2 LIVE assertions confirming `CC-INSTALLATION`
tagging end-to-end; IF NOT, it falls back to a SINGLE "documented, not live-tested" assertion. The original
Wave 3 run's server evidently had no installation record in its seed state at that point; this run's fresh
isolated server did. **This is a data-dependent conditional test path, not a code regression** — the test
file itself is byte-identical (confirmed via `git status`/`git diff`, untracked/unchanged since creation),
no assertion was added, removed, or weakened, and the EXTRA result (71 vs. 70) is a STRICTLY STRONGER
verification (2 live assertions replacing 1 documented-skip assertion), not a new failure or a lowered bar.
**Zero net new failures either way.** This finding is disclosed here per this CR's own explicit
instruction, not silently normalized to "matches baseline."

Architecture/security suites not independently re-run this pass (no code changed since Wave 4 Phase 0's own
targeted spot-check, which already covered `erp_arch_2026_001d_sod_tests.js`/`erp_arch_2026_001c_data_scope_tests.js`
cleanly) — re-running them would prove nothing new, since zero application code has been touched between
that pass and this one.

## L. Production hash evidence

`25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` — confirmed identical before this gate's
own verification work began and after it completed. Independently re-verified by direct `certutil -hashfile`
check at the start of this gate (before any test server was started) and is unchanged because **no
application code or production data was written at any point in this CR** — every action taken was
read-only inspection, isolated-server testing, or new/updated `.md` document creation.

## M. Test-server cleanup evidence

One isolated test server was started for this gate's own regression spot-check (port 4540, PID 18004,
scratch DB at a disposable temp path). It was shut down (`taskkill /PID 18004 /F`) immediately after use.
`netstat`/`tasklist` re-checked after shutdown: zero listening ports in the isolated-server range, zero
`node.exe` processes running. **No orphan remains.**

(Separately, and disclosed for completeness: 2 orphaned servers left running by the immediately-prior Wave
4 Phase 0 pass, ports 4531/4532, were found and cleaned up by the human engineer reviewing that pass's
output before this CR began — already documented in that prior turn's own report, not a finding of this
gate's own work, but confirmed here as fully resolved with no recurrence.)

## N. Final scope-gate verdict

# READY WITH DOCUMENTED DEFERMENTS

**Rationale, per this CR's own §25 required explanation:**
- **W4 decisions resolved:** 0 of 12.
- **W4 decisions still open:** 12 of 12 (W4-1 through W4-12, including the newly-surfaced W4-12).
- **Gaps approved for implementation (by a future, separately-authorized CR):** 2 (audit-log completeness,
  CAPA source-ID validation) — both zero-policy-content, both fully specified with acceptance criteria
  ready to hand to that future CR.
- **Gaps deferred:** 0 (every gap is either the 2 IMPLEMENT-recommended items above or POLICY DEPENDENT —
  none was found to warrant simple postponement without a decision attached).
- **Gaps policy-dependent:** 10.
- **Dependencies:** all 13 architecture-preservation engines confirmed intact; zero Wave-3 blocker; zero
  Wave-5/6 requirement.
- **Security status:** no CRITICAL finding, no STOP condition, scope-by-action pre-specified for future
  decisions.
- **Accounting status:** zero shadow financial model; only 1 of 12 items (W4-6, Option B only) carries
  potential significant accounting impact.
- **Inventory status:** unaffected by any item in scope.
- **Project-cost status:** unaffected structurally by any item; W4-11 would only add reporting dimensions.
- **Regression status:** zero net new failures; one investigated, fully-explained, benign discrepancy
  (71 vs. 70, a data-dependent conditional test producing a STRONGER result, not a weaker one).
- **Production-safety status:** hash unchanged before/after, independently re-verified; zero orphaned test
  servers at completion.

**"READY WITH DOCUMENTED DEFERMENTS" (not "READY FOR IMPLEMENTATION AUTHORIZATION") because 10 of 12
decisions remain genuinely open** — this gate has done everything asked of it (decisions catalogued,
scope classified, acceptance criteria defined for what IS scoped, dependencies/security/accounting/data-
model impact fully mapped) but cannot itself close the gap between "we know what Wave 4 contains" and "we
are authorized to build it," per this CR's own §28 absolute final rule. **Not BLOCKED** — no technical
dependency prevents progress and no STOP condition was triggered; the remaining work is a management
decision process, not a technical blocker.

## Wave 4 implementation authorization: **NOT YET GRANTED.**

Per this CR's own §24: this status is not inferred from passing Phase 0, completing the design, or
producing this scope document. It requires a separate, explicit authorization after the 12 open decisions
in `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md` are resolved.
