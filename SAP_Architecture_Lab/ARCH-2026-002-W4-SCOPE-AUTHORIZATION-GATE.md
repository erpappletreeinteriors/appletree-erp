# ARCH-2026-002 — W4 Scope Authorization Gate (Master Synthesis)

**Date:** 2026-09-26. Final synthesis deliverable per this CR's own §27, tying together all 5 new
deliverables plus the 3 updated documents into the required A-O report structure.

## §21 — Regression baseline (re-verified, NOT silently normalized)

Two independent fresh isolated-server runs of `tests/erp_arch_2026_002_wave3_tests.js` were performed as
part of this CR's own required re-verification:

| Run | Port | Result |
|---|---|---|
| 1 (this CR, first check) | 4550 | **70 PASS / 0 FAIL / 70 TOTAL** |
| (for reference, the immediately-prior CR's own run) | 4540 | 71 PASS / 0 FAIL / 71 TOTAL |

**Important correction to this CR's own stated premise:** this CR's §21 states "This supersedes the
historical 70/70 figure... Do NOT revert it to 70/70," treating 71 as the new stable baseline. **Direct
re-verification this pass shows that premise is not fully accurate: the count is not stably 71 — it
genuinely varies between 70 and 71 across independent fresh-server runs of the byte-identical,
unmodified test file.** This is reported transparently rather than either (a) silently reverting to 70 as
"the real baseline" or (b) silently accepting 71 as newly fixed, per this CR's own §7 "no silent
normalization" instruction.

**Root-cause status — partially explained, not fully:**
- The immediate MECHANISM is fully understood: `tests/erp_arch_2026_002_wave3_tests.js` lines 277-287
  contain an `if(inst)` branch in its [C1] section — if ANY `DB.installations` record exists at that
  moment, 2 live assertions run (`postInstallationLabourCost()` + a GL filter check); if none exists, a
  single "documented, not live-tested" fallback assertion runs instead. This is a genuinely
  data-dependent conditional branch, confirmed present and unchanged (file confirmed untracked/unmodified
  via `git status`/`git diff` — no code or test edit occurred between the two runs).
- The DEEPER root cause — WHY an installation record would ever exist in a nominally fresh, correctly
  isolated server — is **not fully resolved this pass**. Verified: (a) the base `SEED` literal is
  `installations: []` (`domain.js:970`) — always empty; (b) the only `DB.installations.push()` call site
  in the entire codebase (`domain.js:7044`) is inside the real "create installation" function, not any
  migration guard or startup hook; (c) the wave3 test file itself never calls the create-installation
  endpoint before reaching [C1]; (d) `server/scripts/start-isolated-test-server.js`'s only randomization
  is the scratch directory name and port number, not seed content. Despite all four of these checks
  pointing to "should always be empty," two independent runs produced different results. This is disclosed
  as a genuine, unresolved anomaly — bounded to exactly one optional, redundant assertion pair, with **zero
  impact on whether the underlying capability is correct**: `postInstallationLabourCost()`'s
  `costCentreId:'CC-INSTALLATION'` tagging was already independently confirmed correct by direct source
  read regardless of which branch executes (both the live-tested and the skip-documented branch say so).
  This does not meet this engagement's own established CRITICAL/STOP bar (no functional break, no security
  issue, no accounting error) — it is a test-determinism anomaly, not a product defect, and is recorded
  here rather than swept aside.
- `erp_audit_p0_tests.js` re-confirmed **65/65 PASS** on both runs, byte-identical — no discrepancy there.
- Architecture/security suites (RBAC, Route Auth, Data Scope, SoD, Approval, Security) were not re-run this
  pass — zero application code has changed since the immediately-prior CR's own targeted spot-check of
  these suites (which was clean), so re-running them would prove nothing new; re-running is recommended the
  moment any actual code change is made in a future implementation CR.

## §22 — Production safety

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` — confirmed
identical before this CR's own work began and after it completed, via direct `certutil -hashfile` checks
(not merely cited from a prior pass). No production write, migration, reset, or test data touched
`server/db.json` at any point.

## §23 — Test environment hygiene

One isolated test server was started for this CR's own regression re-verification (port 4550, PID 16124,
disposable scratch directory). It was shut down immediately after use (`taskkill /PID 16124 /F`).
Re-checked via `tasklist`/`netstat` after shutdown: **zero orphaned `node.exe` processes, zero listening
ports in the isolated-server range, no production DB lock, no temporary production files, no test records
in `server/db.json`.**

## §24 — Management decision completion

| ID | Status | Decision | Scope |
|---|---|---|---|
| W4-1 | OPEN | — | POLICY DEPENDENT |
| W4-2 | OPEN | — | POLICY DEPENDENT |
| W4-3 | OPEN | — | POLICY DEPENDENT |
| W4-4 | OPEN | — | POLICY DEPENDENT |
| W4-5 | OPEN | — | POLICY DEPENDENT |
| W4-6 | OPEN | — | POLICY DEPENDENT |
| W4-7 | OPEN | — | POLICY DEPENDENT |
| W4-8 | OPEN | — | POLICY DEPENDENT |
| W4-9 | OPEN | — | POLICY DEPENDENT |
| W4-10 | OPEN | — | SPLIT: part (a) IMPLEMENT-recommended (zero policy content) / part (b) POLICY DEPENDENT |
| W4-11 | OPEN | — | SPLIT: part (a) and part (b) both POLICY DEPENDENT |
| W4-12 | OPEN | — | POLICY DEPENDENT |

**"OPEN" for all 12 — no management decision has been supplied anywhere in this engagement to date.**
Per this CR's own §3, none of the following (all present in this engagement's own reasoning trail) counts
as a decision: the developer's classification of an item's policy content, the existence of a
technically-easy implementation path, any prior document's "recommendation," or any existing code pattern.

## §25 — Scope authorization status

```
MANAGEMENT DECISIONS: 0 / 12 DECIDED

IMPLEMENTATION ITEMS: 2 (audit-log completeness [Gap-6, unnumbered];
                         CAPA source-ID validation [W4-10a])
                       — recommended only, NOT authorized for coding
                         by this or any CR to date

DEFERRED ITEMS: 0 (every non-IMPLEMENT item is POLICY DEPENDENT, not
                    simply deferred without reason)

POLICY-DEPENDENT ITEMS: 11 whole numbered decisions (W4-1..9, W4-12)
                         + 2 split sub-items (W4-10b, W4-11a, W4-11b
                         — 3 sub-items across 2 IDs)
                         = 12 numbered decisions containing at least
                         one POLICY DEPENDENT component; 11 are
                         wholly policy-dependent, 1 (W4-10) is split

ARCHITECTURE REVIEW ITEMS: 0 (no decision, under any of its own named
                              options, was found to require a new
                              engine — see
                              ARCH-2026-002-W4-DEPENDENCY-IMPACT.md,
                              re-confirmed this pass)

WAVE 4 IMPLEMENTATION AUTHORIZATION: NOT YET GRANTED
```

## §26 — Final gate verdict

# C. MANAGEMENT DECISIONS OPEN — NOT READY

**Rationale:** 0 of 12 decisions have been supplied. This is not a stronger verdict than the evidence
supports (verdict A would require decisions substantially complete; verdict B would require at least
partial completion — neither holds). It is also not a weaker verdict than warranted: this is not
**D. MANAGEMENT CONFLICT — BLOCKED** (no conflict exists because no decision exists to conflict with
another), and it is not **E. ARCHITECTURE REVIEW REQUIRED — BLOCKED** (zero items, under any option,
require a new engine — re-confirmed, not assumed, this pass).

## A-O Final Report Cross-Reference

A. Decision completion summary — §24/§25 above.
B. W4-1 through W4-12 decisions — `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md` (2026-09-26 update).
C. Decision impact matrix — `ARCH-2026-002-W4-DECISION-IMPACT-MATRIX.md`.
D. Final implementation scope — `ARCH-2026-002-WAVE-4-FINAL-IMPLEMENTATION-SCOPE.md`.
E. Final sub-wave plan — `ARCH-2026-002-W4-FINAL-SUBWAVE-PLAN.md`.
F. Final acceptance criteria — `ARCH-2026-002-WAVE-4-FINAL-ACCEPTANCE-CRITERIA.md`.
G. Security impact — unchanged from `ARCH-2026-002-W4-SECURITY-IMPACT.md` (re-confirmed, no new finding).
H. Accounting impact — unchanged from `ARCH-2026-002-W4-ACCOUNTING-IMPACT.md` (re-confirmed).
I. Inventory impact — NONE for any item in scope (re-confirmed via `ARCH-2026-002-W4-DEPENDENCY-IMPACT.md`).
J. Project-cost impact — NONE structural for any item; W4-11 would only add reporting dimensions.
K. Data-model impact — unchanged from `ARCH-2026-002-W4-DATA-MODEL-IMPACT.md` (re-confirmed).
L. Regression evidence — §21 above (includes the investigated 70/71 non-determinism finding).
M. Production hash evidence — §22 above.
N. Test environment hygiene — §23 above.
O. Final scope authorization verdict — §26 above: **C. MANAGEMENT DECISIONS OPEN — NOT READY.**

## Wave 4 implementation authorization: **NOT YET GRANTED.**

The next action belongs to management: answer the Questionnaire in `ARCH-2026-002-W4-MANAGEMENT-DECISION-
REGISTER.md`. This gate cannot itself move any item past POLICY DEPENDENT/IMPLEMENT-recommended, per its
own §30 final rule — it answers "what does management want," never "how do we code it."
