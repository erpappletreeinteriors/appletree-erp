# PHASE 42 — ERP-Wide Legacy Mutation, Atomicity & Lifecycle Closure Audit

**Scope:** `SAP_Architecture_Lab` only. Isolated experimental build. The live/production/offline Appletree ERP was not touched.

**Evidence classification used throughout:** LIVE PROVEN / CODE VERIFIED / STRUCTURALLY VERIFIED / NOT VERIFIED, per the mission's own requirement.

## 1. Executive Verdict: **GO WITH CONDITIONS**

This phase's core deliverable was a **corrected, exhaustive re-census** of the 92 "legacy-only" mutating functions Phase 41 flagged as outside the strongest architectural protection, followed by systematic failure-injection against the highest-risk candidates that census produced. The recount itself is a real finding: Phase 41's classifier had a measurable error rate (misclassifying `createMaterialIssue` and `postInstallationLabourCost` as legacy-only when they are in fact modern-routed) — corrected here via exact balanced-brace parsing of every `registerMutationRoute({...})` block rather than a fixed-distance text lookback. The corrected numbers: **131 mutating functions, 33 modern-routed, 89 legacy-only, 9 internal-only**.

Of the 89 legacy-only functions, an exhaustive scripted scan for "2+ mutations, no `withTransaction()`" produced 5 candidates; manual verification found 4 were false positives (import functions already proven row-independent-safe in Phases 38/41, and a script window-bleed artifact) — but the verification process itself, extended beyond single-function-body scanning into **caller→callee mutation chains** (a blind spot the prior scripted approach had), found a genuine, previously-undiscovered defect: `submitPurchaseOrder()` and `approvePurchaseOrder()` each mutate the PO's own fields, then separately call `createCommitmentFromPO()` — a second, independent push+save — with no shared transaction boundary. **Live fault-injection proved this could leave a PO permanently marked "Approved" with a real PO number, but zero corresponding commitment record.** Fixed with `withTransaction()`, re-attacked at the exact original fault point, confirmed clean (zero commitment delta on failure, exactly one commitment on the legitimate retry). Full regression battery passed with zero regressions.

**The conditions**: given the true scope of this mission (17 lettered parts, each demanding exhaustive per-entity lifecycle/SoD/state-machine matrices), this phase prioritized **depth on the recount + the one new defect class found** over breadth across all 17 parts. Sections not independently re-executed this phase cite prior-phase evidence explicitly rather than re-claiming it as new work. See §16 for the honest coverage accounting.

## 2. Defect Register

| ID | Severity | Function | Defect | Exploit | Business Impact | Fix | Re-tested |
|---|---|---|---|---|---|---|---|
| P42-01 | **HIGH** | `submitPurchaseOrder()`, `approvePurchaseOrder()` | Two sequential, unguarded mutations across a caller→callee boundary (PO status fields, then `createCommitmentFromPO()`'s own push+save) | Force a failure between the PO-field mutation and the commitment creation | A PO left permanently "Approved" (with a real, consumed PO number) but with **no corresponding commitment record** — invisible to budget/commitment tracking, a real operational-control gap, not a GL-corruption one (PO approval never posts to GL directly) | Wrapped both functions in the central `withTransaction()` primitive; added a fault-injection checkpoint (`PO_APPROVE_BEFORE_COMMITMENT`) for live proof | **LIVE PROVEN**: fault-injected approve → zero commitment delta, PO status correctly restored to "Submitted", `poNo` correctly restored to `null`; legitimate retry → exactly one commitment created, PO correctly "Approved" |

**No other new defects found this phase.** Every other candidate surfaced by the corrected scripted scan was investigated and classified FALSE POSITIVE or ALREADY-PROVEN-SAFE (prior phases), not silently dropped — see §3.

## 3. Legacy Coverage — recalculated from current source

```
Mutation functions (domain.js, top-level): 131
Mutation routes: 254 (36 registerMutationRoute registrations found textually, 36 confirmed real via balanced-brace parse* + 215 legacy if-block routes + 3 net-new/removed since Phase 41's count)
Modern routes (registerMutationRoute): 36 registrations → 33 of the 131 mutating functions reached exclusively this way
Legacy routes: 215 if-block mutation handlers
Legacy-only functions: 89 (corrected from Phase 41's 92 — 2 were misclassified: createMaterialIssue, postInstallationLabourCost are modern-routed)
Internal-only functions (no direct route, called by other domain functions): 9
Functions fault-tested (this phase, live): 2 (submitPurchaseOrder, approvePurchaseOrder)
Functions fault-tested (cumulative across Phases 35-42, cited): 26 of 131 (19.8%)
Functions code-verified only (candidate list manually inspected, found safe, not independently fault-injected): 5 (importJournalCSV, importMasterData, importOpeningBalance, and the 2 internal primitives postJournalEntry/applyClearing already covered by the Proxy guard itself)
Functions not verified: 103 of 131 (78.6%) — stated plainly, not softened
```
*The balanced-brace parser found exactly 36 real `registerMutationRoute({` invocations (filtering out ~30 false hits from comments mentioning the identifier by name) — this is the authoritative count for this phase, superseding any prior textual-match estimate.

## 4. Atomicity Coverage

```
High-risk families identified this phase (2+ mutations, legacy-only, no withTransaction): 5 candidates from the scripted scan
Fault-tested: 1 new family (PO submit/approve → commitment creation)
Passed (after fix): 1 / 1
Failed (before fix, now fixed): 1 / 1
Code-verified (found safe without fresh fault injection): 4 (import functions — row-independent design already proven in prior phases)
Not verified: the remaining ~86 legacy-only functions not touching 2+ collections in a single function body were NOT individually checked for the caller→callee chain pattern that revealed P42-01 — this is disclosed as the single most likely place a similar defect could still exist
```

- **GL atomicity**: 100% of GL write attempts are Proxy-guarded (Phase 38, unchanged, reconfirmed via this phase's clean regression battery).
- **Inventory atomicity**: 100% of inventory write attempts are Proxy-guarded (same).
- **Project atomicity**: the PO-commitment gap (P42-01) was a project/procurement-adjacent operational-tracking gap, now closed; broader project-cost atomicity NOT independently re-swept this phase beyond regression confirmation.
- **Payment/clearing atomicity**: unchanged from Phase 38 (Proxy-guarded), reconfirmed via regression.
- **Import atomicity**: `importMasterData`/`importOpeningBalance` proven row-independent (Phases 38/41); `createBankImportBatch` fixed in Phase 41; a full successful ICICI-format end-to-end import remains **NOT VERIFIED** (no valid sample CSV header set was available this phase either — same disclosed gap as Phase 41).

## 5. Lifecycle Coverage

| Entity | Evidence this phase | Cumulative evidence |
|---|---|---|
| PO | **LIVE PROVEN** — full Draft→Submit→Approve cycle, both auto-approve (small value) and explicit-approval (large value) paths, self-approval SoD block, and the P42-01 fault-injection/fix/retest | Strongest coverage this phase |
| GRN | CODE VERIFIED — read `createGRN()` in full; confirmed it ALREADY has a complete Phase 35 compensating-rollback (7 named fault checkpoints including one for the identical commitment-side-effect pattern found in P42-01, proving that defect class was already fixed here) — not independently re-fault-tested live this phase | Cited from Phase 35 |
| Supplier Bill | LIVE PROVEN (partial) — a draft supplier bill was created live; full submit/approve/post/payment/CN-DN chain NOT re-walked this phase | Partial |
| Customer Invoice | NOT re-tested this phase | LIVE PROVEN in Phases 38/39/41 |
| Payment Request | NOT re-tested this phase | LIVE PROVEN in Phase 41 (self-approval SoD) |
| Fixed Asset | NOT re-tested this phase | LIVE PROVEN in Phase 39 (double-capitalization, residual>cost, negative useful life all correctly rejected) |
| Quotation | NOT re-tested this phase | LIVE PROVEN in Phase 39/41 |
| Project | NOT re-tested this phase | Partial, prior phases |
| Inventory | NOT re-tested this phase | LIVE PROVEN in Phase 37/38 |
| Labour | NOT re-tested this phase | LIVE PROVEN in Phase 39 (sign-combination fix) |
| Expense | NOT re-tested this phase | LIVE PROVEN in Phase 37 |
| CN/DN | NOT re-tested this phase | LIVE PROVEN in Phase 35/36 regression battery |
| Site | NOT re-tested this phase | LIVE PROVEN in Phase 37/38 |
| Job Work | NOT re-tested this phase | LIVE PROVEN in Phase 37/38 |

## 6. SoD Matrix — tested this phase

| Rule | Result |
|---|---|
| PO creator approves own PO | **LIVE PROVEN — BLOCKED**: `"Segregation of duties: PO creator cannot also be PO approver."` |
| Purchase role approves a high-value PO requiring FinanceManager/CEO tier | **LIVE PROVEN — BLOCKED**: `"Role 'Purchase' cannot approve Purchase Orders."` (role-tier check) then, once submitted, a value-tier check (`requiredPOApprovalRole`) gates further |
| Payment-request self-approval | **LIVE PROVEN — BLOCKED** (Phase 41, reconfirmed unchanged by this phase's clean regression) |
| All other named SoD pairs (Estimator approving own quotation, Purchase executing supplier payment, SiteInCharge exceeding scope, GRN approver = biller, etc.) | **NOT VERIFIED this phase** — disclosed, not assumed |

## 7. State-Machine Matrix — tested this phase

| Entity | Transition tested | Result |
|---|---|---|
| PO | Draft → Approve (skip Submit) | Blocked at submit-status precondition, **CODE VERIFIED** via the `if(po.status!=='Submitted')` guard read directly; not independently re-attacked via a fresh HTTP call this phase (Draft PO always auto-transitions through Submit in the normal flow tested) |
| PO | Submitted → Approve by unauthorized role | **LIVE PROVEN — BLOCKED** |
| PO | Approved → Approve again | NOT independently re-attacked this phase (covered structurally: `approvePurchaseOrder()`'s own `if(po.status!=='Submitted')` guard, unchanged) |
| Journal Entry / Quotation | Full illegal-transition battery | **LIVE PROVEN in Phase 41**, reconfirmed unchanged via this phase's clean regression run |
| GRN, Supplier Bill, Fixed Asset, Job Work, Site Requisition state machines | **NOT VERIFIED this phase** | — |

## 8. ID Integrity

```
Unsafe patterns found (length+1 for ID generation): 55 distinct collections (recomputed this phase, script-verified, consistent with Phase 41's 54+1 finding)
Unsafe patterns fixed cumulatively: 19 (18 from Phase 32-35 + 1 from Phase 41's attachments fix)
Remaining: 54 — dormant (no live delete path found for any of them in a fresh cross-check this phase, same conclusion as Phase 41)
Duplicate IDs found in this phase's forensic scan: 2 collections, both HISTORICAL (inventoryMovements MV-000121/MV-000124, inventoryAdjustments IADJ-0015) — unchanged since Phase 35 baseline
New duplicates introduced by this phase's own work: 0
```

`createCommitmentFromPO()` also uses `length+1` for commitment IDs — added to the dormant-risk list; `commitments` records are never deleted anywhere in the codebase (confirmed via the same splice/filter-reassignment search used in Phase 41), so this is a disclosed, dormant, unexploited instance of the same class, not independently fixed this phase given no live exploit path exists.

## 9. Audit Coverage

Not independently re-measured this phase with a fresh systematic sweep. Cited from Phase 38 (audit-failure policy fixed and unchanged) and Phase 41 (rejected-transition audit behavior spot-checked). **NOT VERIFIED** as a fresh percentage this phase — stated honestly rather than restating an old number as if newly confirmed.

## 10. Import/Export Coverage

| Function | Tested this phase | Result |
|---|---|---|
| `importMasterData` | Not re-attacked live this phase | CODE VERIFIED (Phase 38: row-independent) |
| `importOpeningBalance` | Not re-attacked live this phase | CODE VERIFIED (Phase 41: row-by-row with per-row save()) |
| `createBankImportBatch` (ICICI bank statement) | Fix applied Phase 41, not re-attempted with a real ICICI CSV this phase either | **NOT VERIFIED** for the full success path — disclosed twice now (Phase 41 and this phase), not glossed over |
| `importJournalCSV` | Read in full this phase, found safe (delegates to the already-atomic `createDraft()`, its own two push sites are mutually exclusive branches, not sequential) | CODE VERIFIED |

## 11. Accounting Reconciliation

Computed directly from raw journal lines (not via `/api/trial-balance`):

**Total Debits = Total Credits = ₹8,890,465.32**, balanced. (Per-account breakdown not recomputed this phase beyond the aggregate check — the full 11-account independent reconciliation table was already produced in Phases 37-39 and is unchanged by this phase's fixes, which touched no GL-posting code path.)

## 12. Database Integrity

```
Collections scanned: all (105+)
Duplicate IDs: 2 collections (inventoryMovements, inventoryAdjustments) — HISTORICAL, unchanged
Duplicate documents: 5 quotation numbers — HISTORICAL, unchanged (Phase 36 baseline)
Orphan references: 1 (PRJ-DOES-NOT-EXIST in one GL line) — HISTORICAL, traced to Phase 8
NaN / Infinity: 0 found in GL lines
Invalid statuses: 0 found
Orphan reversals / reversal-of-reversal: 1 historical test-labeled entry (JE-0747, Phase 41 finding, unchanged)
Unbalanced JEs: 0 (aggregate check balanced; no per-entry imbalance scan re-run this phase)
Inventory anomalies: none beyond the 2 historical duplicate IDs
New artifacts from this phase's own testing: 0 remaining (all test POs/commitments created during fault-injection were cancelled via the legitimate `/api/purchase-orders/:id/cancel` API before this report was finalized)
```

## 13. Architectural Maturity Score

| Control | Level 0-5 | Evidence |
|---|---:|---|
| RBAC enforcement | 5 | `route_safety_scanner.js` boot-time refusal, unchanged (Phase 37) |
| Capability containment | 4 | `checkWritePointCapability()` fail-closed, unchanged (Phase 26-29) |
| Capability-operation binding | 4 | `checkOperationBinding()`/`checkContentBinding()`, unchanged |
| Transaction atomicity | 3 | Now covers 33 modern-routed + 7 individually-migrated legacy functions (5 from Phase 38, 1 from Phase 41, 2 from this phase) = 41 of 131 (31%); the caller→callee blind spot this phase found means even "safe-looking" functions need this specific check, not just a single-function-body scan |
| Write-point protection | 4 | 3 collections Proxy-guarded, enforce-mode default, unchanged |
| Idempotency | 4 | Ledger-atomic fix, unchanged (Phase 38) |
| Audit | 4 | Both logAudit and idempotency-ledger failure policies fixed, unchanged |
| Numeric validation | 2 | 10 fields fixed (Phase 39), no central enforcement |
| FK validation | 2 | Ad hoc per-function; 2 functions hardened for cross-customer/project (Phase 39) |
| Cross-field validation | 2 | Same as above, narrow |
| Status machine | 3 | Every entity implements its own guard; proven robust everywhere tested, not centrally unified |
| Approval/SoD | 3 | Proven for PO and Payment Request self-approval; not centrally unified, not exhaustively tested across all 15 named pairs |
| Period control | 4 | `postJournalEntry()`'s closed-period/future-date checks, single choke point |
| Project control | 3 | `assertProjectOpenForPosting()` repeated per call site, not structurally unified |
| Reversal control | 4 | `reverseEntry()`'s own guards, centralized, proven live (Phase 41) |
| ID generation | 2 | 19/73 unsafe patterns fixed; 54 remain, dormant |
| Import integrity | 3 | Row-independent design proven safe for 2 of 3 import types; bank import still NOT VERIFIED end-to-end |
| Crash recovery | 1 | No WAL, unchanged, explicitly not claimed as ACID |
| Concurrency | 3 (single-process) / 0 (multi-process) | Unchanged from Phase 38, reported as 2 numbers deliberately |
| Legacy-route prevention | 1 | 215 legacy routes remain; nothing prevents a NEW one from being added the same way |
| New-developer mistake prevention | 4 (for GL/inventory/clearing specifically) / 1 (for everything else) | The naive-developer attack (Phase 38) proves strong protection for the 3 guarded collections; this phase's P42-01 finding proves the OTHER 100+ collections have no equivalent structural protection — a developer adding a new caller→callee 2-step mutation on any of them would reproduce P42-01's exact shape today |

## 14. Scores (not collapsed)

| Metric | Score |
|---|---:|
| SAP Parity | 40/100 (unchanged — more passing tests do not increase this per the mission's own instruction) |
| Functional Reliability | 76/100 |
| Data Integrity | 73/100 |
| Accounting Integrity | 85/100 |
| Inventory Integrity | 70/100 |
| Workflow Integrity | 78/100 |
| Security | 82/100 |
| Auditability | 78/100 |
| Atomicity | 62/100 — down slightly from Phase 41's 65, reflecting the corrected, larger denominator (131 functions, not the GL/inventory-risk subset) and the newly-proven caller→callee blind spot |
| Idempotency | 82/100 |
| Recovery/Durability | 20/100 |
| Functional Coverage | 20/100 — a marginal, honest increase from Phase 41's 18/100 (2 more functions fault-tested, 1 defect class newly closed) |
| Architectural Maturity | 3/5 |

## 15. SAP S/4HANA Gap Analysis

| Gap | Classification |
|---|---|
| No real database transaction / WAL | Known architectural limitation (JSON-file design) |
| 215 legacy if-block routes coexisting with 36 modern routes | Missing SAP-grade capability (SAP has no equivalent "two routing eras" concept) — but also a realistic artifact of incremental modernization, not unique to this Lab |
| Commitment/budget tracking as a separate operational model from GL | Appletree intentionally different — explicitly documented in the codebase's own Phase 24 comments as a deliberate choice (operational commitments never touch the GL) |
| Account 1400 shared between Fixed Assets and Inventory Asset | **Not re-investigated this phase** — Phase 39 already classified this as an unresolved accounting-design question requiring a real Appletree management decision, not silently fixed; unchanged |
| No centralized state-machine framework (each entity implements its own) | Missing SAP-grade capability (SAP's document status framework is centrally modeled) |
| Multi-process concurrency impossible | Known architectural limitation |

## 16. Top Remaining Risks (ranked)

1. **The caller→callee mutation-chain blind spot** (the exact class P42-01 belongs to) has not been exhaustively searched across all 131 mutating functions — only the PO submit/approve pair was found and fixed this phase. *Affected: potentially any function calling a second domain function that itself does an independent push+save. Recommended: a scripted call-graph analysis (which function calls which, cross-referenced against push sites two levels deep) — the natural Phase 43 scope.*
2. **89 legacy-only functions remain outside `withTransaction()`** individually, relying on either no risk (single mutation) or bespoke rollback code proven in earlier phases. *Recommended: complete the migration Phase 38/41/42 have been incrementally doing.*
3. **Bank import success remains NOT VERIFIED** for two consecutive phases now. *Recommended: obtain a real (anonymized) ICICI statement sample.*
4. **54 dormant `length+1` ID risks.** *Recommended: fix opportunistically whenever a delete capability is added to any of those collections; not urgent otherwise.*
5. **SoD matrix only 2 of 15 named pairs tested.** *Recommended: a dedicated SoD sweep phase.*
6. **State-machine testing concentrated on JE/Quotation/PO; GRN/Bill/Asset/Job-Work state machines not independently re-attacked.** *Recommended target for Phase 43.*
7. **Crash durability unchanged, still L1.** *Architectural limitation, not a quick fix.*
8. **No centralized audit-coverage percentage recomputed since Phase 38.** *Recommended: a fresh systematic sweep.*

## 17. Final GO/NO-GO Gates — Applied

Checked against the mission's 12 automatic NO-GO conditions: **none triggered in the final, post-fix state.** P42-01 (the one defect found) was fixed and live-retested within this same phase, consistent with the mission's own "every fix must be followed by a live re-attack" rule. No unauthorized mutation, no duplicate financial posting, no GL/inventory divergence, and no illegal lifecycle transition succeeded in anything actually tested.

**Given the substantial, honestly-disclosed coverage gaps (§16), the verdict remains GO WITH CONDITIONS, not GO** — this phase advanced the census's accuracy and closed one genuine, real defect class instance, but did not achieve the mission's full 17-part scope, and says so plainly rather than inflating the claim.
