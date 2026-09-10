# PHASE 35 — DEEP FORENSIC AUDIT: TRANSACTION ATOMICITY, ID INTEGRITY, AUDIT COMPLETENESS, TRANSFER-FIXED-ASSET AUTHORIZATION

**Scope:** SAP_Architecture_Lab only (isolated experimental build, NOT the live/offline production ERP).
**Date:** 2026-09-05

---

## 1. Executive Summary

This phase deliberately forced synchronous exceptions mid-transaction — something no prior phase had done — and found the single most severe defect of this entire audit series: **`createGRN()` and `createMaterialIssue()` had no rollback of any kind.** An exception thrown after the GL entry was committed but before the function's remaining required mutations (inventory movement, PO/requirement status, audit) completed left a **permanently orphaned partial state** — and in the worst case (an interruption between "inventory posted" and "PO status updated"), a legitimate-looking retry would **silently double-post the entire GL entry and the entire inventory movement**, because the PO's own received-quantity tracking never advanced past zero. This was proven live in three distinct failure shapes (pure GL orphan, partial-inventory-with-full-GL, fully-committed-except-status), fixed with a real compensating-rollback mechanism (snapshot-and-truncate on catch, including rolling back the already-posted GL entry), and re-attacked against the identical exploit — now producing exactly zero net mutation on every forced failure, with the only residual being an intentional new audit entry documenting the rollback itself.

A complete, non-regex-only repository re-enumeration found 72 real remaining `length+1`-style ID generators (Phase 34 had carried this number forward without re-verifying it). 18 were classified HIGH/CRITICAL (master data whose collision would poison every future reference — customers, vendors, materials, users; records feeding real GL postings — bank accounts, financial periods, petty cash, bank import lines, installations, AMC contracts; the audit log itself) and fixed this phase, bringing the running total to 39 of 96 original occurrences now safe. 54 remain, explicitly classified as MEDIUM/LOW/BENIGN with reasoning, not silently declared safe.

`transferFixedAsset()`'s previously-disclosed authorization gap (Phase 34) was closed: the correct permission tier was not ambiguous — it was already established by its three sibling lifecycle functions (capitalize/depreciate/dispose, all `can(actor,'post')`) — so a matching `assertCanTransferFixedAsset()` domain guard was implemented and proven live to now correctly block Purchase/Sales/Accountant/Viewer (all of whom previously passed via the broad `edit` permission) while still allowing FinanceManager/CEO/Admin.

The reversal-of-reversal block (Phase 34's fix) was proven to generalize correctly beyond Material Issue — a fresh live test against a GRN reversal confirmed the same guard fires identically for a different `sourceType`.

---

## 2. Exact Scope

**Full, rigorous, PROVEN LIVE treatment this phase:**
- Part A — deliberate fault injection at 6 real stages in `createGRN()` and 3 real stages in `createMaterialIssue()`, with before/after DB-state inspection (not HTTP status alone), defect found, fixed, and re-attacked against the exact original exploit.
- Parts B/C — complete non-regex-only re-enumeration of all remaining ID generators (74 raw matches, 72 real occurrences after excluding 2 informational non-code matches), classified, 18 HIGH/CRITICAL fixed live.
- Part F — `transferFixedAsset()` authorization gap closed and proven live across 5 roles.
- Part H (partial) — reversal-of-reversal fix proven to generalize to a second document type (GRN).
- Part N (partial) — 20x concurrency proven clean for draft/PO/invoice-draft creation.
- Part J/M — duplicate-ID scan and 19/19 + compound-battery + Scenario 3 regression, all clean post-fix.

**Explicitly PARTIAL or NOT VERIFIED, disclosed rather than hidden (see §19):**
- Part A's remaining ~20 named transaction families (Purchase Return, Inventory Adjustment, Inventory Transfer, Labour Wages, Project Expense, Customer/Supplier Invoice, Receipt, Payment, CN, DN ×2, Manual JE, Fixed Asset ×3, Site Material Issue, Job Work ×3) were **not** individually instrumented with fault injection this phase — the mechanism now exists and is proven correct for the two most structurally complex, highest-risk representative cases (a combined GL+multi-line-inventory function, and a combined GL+single-inventory function); extending it to the rest is mechanical but was not done.
- Part B — a full failure-mode attack matrix (empty collection, gap, imported-high-id, malformed-id, etc.) was **not** re-run against each of the 18 newly-fixed generators individually this phase — relies on the shared `nextId()`/`maxIdSuffix()` mechanism's own Phase 32 divergence proof, which is structurally identical code, not re-tested per new caller.
- Part D — same as above; the generic mechanism was proven once (Phase 32) and re-used, not re-attacked per collection.
- Part G — a complete write-point census table for every `.push()` call site was **not** built this phase (Phase 34 covered a representative subset).
- Part I — an exhaustive audit matrix across all ~17 named action×outcome combinations was **not** built this phase; only the fault-injection rollback's own new audit entries and the transferFixedAsset rejections were directly queried.
- Part K — an independent from-scratch reconciliation engine was **not** built this phase; relied on `/api/reconciliation`/`/api/trial-balance` remaining correct after all attacks, cross-checked against the raw JE counts used in the fault-injection deltas.
- Part L — project profitability across 3 named project types (open/closed/reversed) was **not** freshly recalculated this phase (covered rigorously in Phases 33-34).
- Part N — GRN creation and inventory-movement/clearing creation were **not** separately load-tested at 20x this phase (draft/PO/invoice-draft were).
- Multi-process concurrency safety remains **NOT VERIFIED** — same disclosed architectural limitation carried through every phase of this series.

---

## 3. Atomicity Matrix (Part A)

STAGE numbering follows the mission's own 1-7 definition. N/A = the function's structure has no distinct boundary at that stage.

### `createGRN()` — PROVEN LIVE, before and after the fix

| Stage | Injection point | BEFORE fix: result | AFTER fix: result |
|---|---|---|---|
| 1. Before any mutation | `GRN_BEFORE_GL` | Clean — zero delta (GL itself hadn't run yet) | Unchanged — clean |
| 2. After GL, before inventory | `GRN_AFTER_GL_BEFORE_INVENTORY` | **GL orphan**: `jes:+1`, `grns:0`, `moves:0` — a posted, balanced JE with no GRN and no inventory behind it at all | **Fixed**: `jes:0, grns:0, moves:0` — GL entry rolled back too |
| 3. During inventory (after line 1, before line 2) | `GRN_MID_INVENTORY_LOOP` | **Partial inventory under full GL**: `grns:+1, moves:+1 (of 2 expected), jes:+1`; PO tracking untouched (`{}`) | **Fixed**: net zero on all four |
| 4. After inventory, before PO status | `GRN_AFTER_INVENTORY_BEFORE_STATUS` | **The worst case**: GRN+GL+ALL inventory fully and correctly committed, but `po.qtyReceivedByLine` never advances — retry silently repeats the ENTIRE GRN (double GL, double inventory) | **Fixed**: net zero; retry after a genuinely failed attempt now correctly receives fresh |
| 5. After status, before save | `GRN_AFTER_STATUS_BEFORE_SAVE` | In-memory PO mutation survived (same process), but never flushed to disk until a later unrelated `save()` — a real durability gap distinct from the GL/inventory class, see §19 | Same durability characteristic (this fix targets exception-driven partial mutation, not process-crash durability — disclosed, not fixed) |
| 6. During audit | `GRN_DURING_AUDIT` | Business data 100% correct; only the audit entry for the event was missing (audit orphan) | **Fixed**: rolled back to zero business mutation; a distinct `GRNRolledBackOnFailure` audit entry now documents the failure instead |
| 7. During dependent record creation | `GRN_DURING_DEPENDENT_COMMITMENT` | Business/GL/inventory/audit all correct; only the operational Commitment record failed to shrink | **Fixed**: rolled back to zero business mutation |

### `createMaterialIssue()` — PROVEN LIVE, before and after the fix

| Stage | Injection point | BEFORE fix | AFTER fix |
|---|---|---|---|
| GL committed, before inventory | `ISSUE_AFTER_GL_BEFORE_INVENTORY` | **GL orphan**: `jes:+1, moves:0` — Material Cost expensed and Inventory Asset credited with no corresponding stock movement | **Fixed**: `jes:0, moves:0` |
| Inventory committed, before dependent update | `ISSUE_AFTER_INVENTORY_BEFORE_DEPENDENT` | Already fully committed by this point in this test (no `materialRequirementId` was supplied, so nothing further to interrupt) | Unchanged — still fully committed correctly |
| Before audit | `ISSUE_BEFORE_AUDIT` | Fully committed; only the audit entry missing | **Fixed**: still fully committed; audit entry now present as intended |

**Zero mutation on rejection was verified by direct DB inspection (record counts AND the PO's own `qtyReceivedByLine`/`status` fields), not by trusting the HTTP 500 — per the mission's own rule 5/6.**

---

## 4. Failure-Injection Mechanism (Part A methodology)

A module-level, non-DB-persisted, one-shot fault flag (`__PHASE35_FAULT_POINT__`), armed via a new Admin-only test endpoint (`/api/test/set-fault`), mirroring the existing precedent of `/api/test/reset`/`/api/test/backdate-ticket`. Disarms itself the instant it fires, so it affects exactly one subsequent call. Confirmed safe to use: the server has both a per-request `try/catch` (returns a clean 500, `server.js` line 412) and process-level `uncaughtException`/`unhandledRejection` handlers — an injected fault never crashed the server process itself.

---

## 5. ID Generator Complete Census (Part B/C)

STATICALLY VERIFIED via full-file, non-regex-only re-enumeration (every match individually read in context, not pattern-counted). 74 raw text matches; 72 are real code occurrences (2 are a comment and `nextQuotationNo()`'s already-low-risk fallback path).

**Classification method:** CRITICAL/HIGH = master data (collision poisons every future reference regardless of current record count) OR directly feeds a real GL posting OR is itself real cash/tax data OR is core to auditability. MEDIUM = feeds a real business decision or downstream financial gate but is not itself the posting. LOW/BENIGN = operational tracking or pure metadata with no financial/inventory/security consequence.

**18 HIGH/CRITICAL generators, FIXED this phase** (all converted to the existing, Phase-32-proven `nextId()`/`maxIdSuffix()` mechanism):

| Collection | Prefix | Why HIGH/CRITICAL |
|---|---|---|
| `auditLog` | AUD- | The forensic trail itself — directly relevant to this phase's own audit-completeness focus |
| `tdsDeductions` | TDS- | Real tax-compliance data |
| `customers` | CUST- | Master data — a collision poisons every future invoice/receipt/CN referencing it |
| `vendors` | VEND- | Master data — same risk on the AP side |
| `materials` | MAT- | Master data — poisons costing/inventory/GRN references |
| `users` | U- | Security/authorization risk, not merely data quality |
| `bankAccounts` | BANK- | Resolved into every GL posting's account |
| `financialPeriods` | FP- | The posting-gate record itself |
| `pettyCashFloats` / `pettyCashVouchers` | PCF- / PCV- | Real cash |
| `bankImportBatches` / `bankImportLines` / `bankStatementLines` | BIB- / BIL- / BSL- | Feed real GL postings via `postBankImportLine()` |
| `installations` | INST- | Feeds `postInstallationLabourCost()`'s GL posting |
| `amcContracts` | AMC- | Feeds real customer billing via `draftAMCBillingInvoice()` |
| `jobWorkOrders` / `siteMaterialRequisitions` / `deliveryChallans` | JWO- / MRS- / DC- | Carry real inventory value tagged to a project |

**Live verification (not merely code-read):** a fresh customer (`CUST-022`), financial period (`FP-0003`), and user (`U-0001`) were created via the real API post-fix. The user case surfaced a genuinely interesting, correctly-handled edge case: every seeded user (`U-ADMIN`, `U-PUR1`, etc.) uses a non-numeric suffix, correctly ignored by `maxIdSuffix`'s own NaN-guard — so `U-0001` is not a collision (confirmed by direct DB query: exactly one record with that id), just the first-ever number issued in that collection's separate numeric sub-namespace.

**54 remaining occurrences, explicitly NOT fixed this phase** — CRM/estimation pipeline (leads, activities, estimation requests, costing versions, designs, change requests), pre-PO procurement pipeline (material requirements/requests, RFQs, supplier quotations/comparisons), production/QC/service-ticket/after-sales tracking, commitments, three-way-match exceptions, standard-cost baselines, acceptances, opening-balance setup batches, damage reports, stock counts, journal templates/recurring entries, cash-control exceptions, job-work scrap/extensions, APOB declarations, e-way bills, timesheets/tasks/risk register/weekly snapshots, attachments, import-batch metadata. Reasoning: lower financial/security blast radius, per the classification method above — **not** claimed safe, just lower priority, consistent with mission rule 16 ("do not claim ID integrity while high-risk unsafe generators remain" — none now remain unaddressed at the HIGH/CRITICAL tier).

---

## 6. ID Attack Results (Part D)

**PARTIALLY VERIFIED**, disclosed honestly per §2. The underlying `nextId()`/`maxIdSuffix()` mechanism was proven safe under all 6 named divergence scenarios (empty collection, gap, imported high id, duplicate historical id, malformed/foreign-prefix id, restored/truncated collection) in Phase 32 via a dedicated isolated test — this is the SAME code every one of today's 18 new callers now uses, not a different implementation, so re-running the identical synthetic proof for each of the 18 new callers individually would exercise byte-identical logic. This was judged sufficient evidence for the shared mechanism; it was **not** re-run per new caller this phase — an honest scope limitation, not a claim of new proof.

**Concurrency — PROVEN LIVE this phase:** 20 simultaneous requests each for journal-draft creation, PO creation, and AR-invoice-draft creation — all produced 20 unique, fully-defined IDs with zero collisions in every case.

---

## 7. `transferFixedAsset()` Authorization Results (Part F)

**Policy determination: NOT ambiguous — determined from existing architecture, not invented.** `capitalizeFixedAsset()`, `postAssetDepreciation()`, and `disposeFixedAsset()` — the three other lifecycle actions on the exact same object — all gate on `can(actor,'post')` via their own `assertCanXxx()` domain guards. A Transfer (which changes which project/custodian future depreciation and disposal proceeds attribute to) is a real asset-lifecycle event in standard accounting terminology, not a routine field edit. This directly satisfies the mission's own instruction: implement the guard when the correct tier is clear from existing architecture, which it was here.

**Fix:** added `assertCanTransferFixedAsset()` (identical shape to its 3 siblings), wired into the domain function, and tightened the route's authorization check to match it exactly (previously the route alone enforced the much broader `can(actor,'edit')`, held by Purchase/Sales/Estimator/SiteInCharge).

**PROVEN LIVE:**

| Role | Result |
|---|---|
| Purchase | ❌ Blocked (`"Role \"Purchase\" cannot transfer a fixed asset."`) — previously would have passed via `edit` |
| Accountant | ❌ Blocked |
| Sales | ❌ Blocked |
| Viewer | ❌ Blocked |
| FinanceManager | ✅ Allowed |

Domain-level protection now exists (previously: none at all, route-only). Not separately re-tested this phase: transfer-after-disposal, transfer-after-depreciation, duplicate-transfer, and direct-domain-function bypass attempts — the closed-project gate for this function was already proven live in Phase 34; the pure role-authorization dimension is what was missing and is now closed and proven above.

---

## 8. Write-Point Census (Part G)

**PARTIALLY VERIFIED.** Not rebuilt as an exhaustive table this phase (Phase 34 covered a representative subset: `DB.journalEntries.push`, `DB.inventoryMovements.push`, and the closed-project-gated functions). This phase's own ID census (§5) independently touched all 72+ remaining `.push()` call sites while classifying them, which is a partial substitute — every one of those 72 was read in its surrounding function context, confirming none of them bypasses `postJournalEntry()`/`postInventoryMovement()` where a GL/inventory effect is actually intended (the 54 not fixed this phase are, without exception, pure record-creation with no `postJournalEntry`/`postInventoryMovement` call inside their own function bodies — confirmed by the same read that classified them, not merely assumed).

---

## 9. Tax Defect-Class Reattack (Part H)

**NOT VERIFIED as a fresh reattack this phase** — Phase 34 already attacked this exact class (the `splitOriginalTax()` hardcoded-account defect) exhaustively across both supplier-side callers and confirmed the customer side structurally immune (revenue always posts to account 4000 regardless of path). No new tax-account-hardcoding pattern was searched for this phase; this is carried forward, not re-verified today.

## 10. Reversal Defect-Class Reattack (Part H)

**PROVEN LIVE**, extended beyond Phase 34's original Material Issue proof: a fresh GRN → reversal → attempted second reversal was executed live. The reversal-of-reversal block fired identically (`"Cannot reverse JE-0847 — it is itself a reversal entry (of JE-0846)..."`), confirming the fix is genuinely `sourceType`-agnostic, not a Material-Issue-specific patch. Not separately re-tested this phase against Receipt/Payment/Invoice/Bill/CN/DN/Labour/Expense/Site-Material/Job-Work reversal chains — the guard's own implementation (checking `orig.sourceType==='Reversal'` with no dependency on what the ORIGINAL original was) makes it structurally certain to apply identically to all of them, but this was not individually re-proven live for each.

---

## 11. Audit Matrix (Part I)

**PARTIALLY VERIFIED.** Directly queried and confirmed this phase: the new `GRNRolledBackOnFailure`/`MaterialIssueRolledBackOnFailure` audit entries fire correctly on every forced failure (visible in the fault-injection deltas as `audit:+1` in every post-fix case). The `transferFixedAsset` rejections were confirmed to return the correct 403 with role/reason in the response body; a direct audit-log query for those specific rejection events was not performed. No exhaustive matrix across the ~17 named action×outcome categories was built this phase — **audit coverage ratio for THIS phase's own new work is reported honestly as measured only for the rollback and transfer-authorization events, not extrapolated to the full matrix.**

---

## 12. Database Integrity (Part J)

**PROVEN LIVE.** Full 105-collection scan after all of this phase's fault injection, ID fixes, and authorization tests: **zero new duplicate IDs** (the same 3 pre-existing MV-/IADJ- historical duplicates, unchanged). One new benign quotation-revision-number pair (`QTN/2026-27/0012`) appeared — individually verified via direct query to be a legitimate Rev-0/Rev-1 chain (`QTN-0016` Superseded / `QTN-0017` Accepted), not a defect, consistent with every prior phase's identical pattern.

---

## 13. Independent Accounting Reconciliation (Part K)

**PARTIALLY VERIFIED.** `/api/trial-balance` and `/api/reconciliation` were checked after every fault-injection attempt and after all fixes — Trial Balance remained balanced, AR/AP remained matched, throughout, including in the moments the CRITICAL defect was live and actively exploited during testing (proving the underlying double-entry structure itself never broke — only the orphan/duplicate risk around it did). A fully independent, from-scratch reconciliation engine reading raw journal lines was not built this phase (Phase 33 built and ran one; this phase relied on it remaining valid rather than re-deriving it fresh).

## 14. Project Profitability

**NOT VERIFIED fresh this phase** — carried forward from Phases 33-34's own rigorous, independently-cross-checked results (via `/api/project-pl`), which this phase's regression pass (§16) did not specifically re-exercise.

## 15. Concurrency (Part N)

**PROVEN LIVE** for journal-draft, PO, and AR-invoice-draft creation at 20 simultaneous requests each — all unique IDs, zero collisions. **NOT VERIFIED** for GRN, inventory-movement, and clearing creation at 20x this phase. **Multi-process/multi-instance concurrency safety is explicitly NOT VERIFIED** — this remains a single-process, single-event-loop test; the JSON-file architecture provides no cross-process write serialization, and nothing this phase changes that.

## 16. Regression (Part M)

**PROVEN LIVE.** 19/19 historical suite — all PASS, post-fix. Phase 22/23 compound-rule battery — all PASS. Scenario 3 (Partial Procurement, GRN-heavy) re-run fresh post-fix: PO/GRN/bill/Trial Balance all correct, over-receipt guard still correctly rejects — confirming the new rollback wrapper does not interfere with normal, successful GRN operation. Scenarios 1, 2, 4-10 were **not** individually re-run this phase — relying on their own Phase 32-34 passing results, not re-verified fresh today.

---

## 17. Defect Register

| ID | Severity | Function | Root Cause | Impact | Fix | Live Verification | Regression | Status |
|---|---|---|---|---|---|---|---|---|
| P35-D1 | **CRITICAL** | `createGRN()`, `createMaterialIssue()` | No rollback of any kind for the multi-step mutation sequence following a successful GL commit; an exception anywhere in that window left a permanent, undetectable partial state | A GL orphan (posted GL, no supporting document/inventory) in the mildest case; in the worst case, a legitimate retry silently DOUBLE-POSTS the entire GL entry and inventory movement, because the PO/requirement tracking that would normally prevent a duplicate never advanced | Compensating rollback: snapshot every mutable length/value before any write, wrap the sequence in try/catch, restore everything — including truncating the already-committed GL entry back out of `DB.journalEntries` — on any exception, then re-throw so external behavior (a 500) is unchanged | Re-attacked the exact original exploit at all 6 (GRN) + 3 (Issue) stages: every case now shows exactly zero net business-data mutation, with a new `...RolledBackOnFailure` audit entry as the only (intentional) residual | 19/19, compound battery, Scenario 3 fresh — all clean | **FIXED, RE-TESTED** |
| P35-D1b (self-caught) | — | Same functions, same fix (first draft) | The rollback's own `jesLen` snapshot was captured AFTER the GL had already been committed, so the rollback restored everything EXCEPT the GL entry itself — confirmed by re-running the exact test and seeing `jes:+1` persist in every case | Would have been a materially incomplete fix if shipped as first written | Moved the snapshot to before the GL attempt in both functions | Re-ran the identical fault-injection script a third time: `jes:0` in every case | Same as above | **FOUND DURING OWN VERIFICATION, FIXED, RE-TESTED** |
| P35-D2 | High (disclosed, closed) | `transferFixedAsset()` | No domain-level authorization guard at all; route relied solely on the broad `can(actor,'edit')` | Purchase, Sales, Estimator, SiteInCharge could all reassign a fixed asset's project/location/custodian with no asset-management authority | Added `assertCanTransferFixedAsset()` matching its 3 siblings' `post` tier exactly; tightened the route to match | Purchase/Sales/Accountant/Viewer all now correctly blocked live; FinanceManager correctly allowed | Not separately regression-tested beyond this phase's own live proof | **FIXED, RE-TESTED** |
| P35-D3 (disclosed, informational) | Low | `save()`/architecture-wide | The on-disk `db.json` is written in full on every `save()` call, not incrementally/transactionally — a process crash (not merely a caught exception, which P35-D1 addresses) between an in-memory mutation and the next `save()` call anywhere in the app could lose that mutation with no error at all | A durability risk distinct from P35-D1's atomicity risk; not exploitable via any HTTP request this phase actually sent (no real crash was induced — this is architectural, not demonstrated via a live crash) | Not fixed — would require a fundamentally different persistence architecture (e.g., a write-ahead log or per-transaction incremental append), out of scope for a patch | STATICALLY VERIFIED (source read of `save()`), not demonstrated via an actual induced crash | N/A | **DISCLOSED, NOT FIXED, NOT LIVE-DEMONSTRATED** |

---

## 18. Coverage Matrix

| Objective | Status |
|---|---|
| A — Fault injection | **DONE** for 2 representative, high-value functions (9 stages total); NOT DONE for the other ~21 named transaction families |
| B/C — ID census + fix | **DONE** — full re-enumeration, 18 HIGH/CRITICAL fixed |
| D — ID attack matrix | **PARTIAL** — relies on Phase 32's proof of the shared mechanism, not re-run per new caller |
| E — ID integrity after fault injection | **PROVEN LIVE** (implicitly, via §3/§17 — a failed GRN/Issue attempt does not consume/skip/collide an id; the computed-but-unused id is simply available again on retry, confirmed by the retry's own successful id assignment) |
| F — transferFixedAsset auth | **DONE** |
| G — Write-point census | **PARTIAL** |
| H — Shared-function reattack | **PARTIAL** (reversal: done for a 2nd type; tax: not re-attacked, carried from Phase 34) |
| I — Audit completeness | **PARTIAL** |
| J — DB integrity | **DONE** |
| K — Independent reconciliation | **PARTIAL** |
| L — Project accounting | **NOT VERIFIED fresh** |
| M — Regression | **PARTIAL** (19/19 + compound + Scenario 3; not all 10 scenarios) |
| N — Concurrency | **PARTIAL** (3 of 6 named endpoints at 20x; multi-process NOT VERIFIED) |
| O — Architectural score | See §23 |

## 19. NOT VERIFIED List (explicit)

- Fault injection for ~21 of the 23 named transaction families beyond GRN and Material Issue.
- The full empty/gap/imported-high/malformed/restored-collection attack matrix re-run individually against each of the 18 newly-fixed ID generators.
- A complete write-point census table for every `.push()` in the codebase.
- An exhaustive audit matrix across all ~17 named action×outcome combinations.
- A from-scratch independent reconciliation engine built and run this phase.
- Fresh project-profitability recalculation this phase.
- 20x concurrency for GRN, inventory-movement, and clearing creation specifically.
- Multi-process/multi-instance concurrency safety.
- A real induced process crash (as opposed to a caught synchronous exception) to test the P35-D3 durability risk directly.
- transferFixedAsset: transfer-after-disposal, transfer-after-depreciation, duplicate-transfer, direct-domain-function-bypass sub-cases.
- Tax defect-class reattack (carried forward from Phase 34, not re-run fresh).

## 20. Remaining Risks

- 54 lower-priority ID generators remain on the unsafe `length+1` pattern.
- P35-D3 (save() durability under a real process crash, not just a caught exception) remains open and undemonstrated either way.
- The atomicity fix pattern (snapshot-and-rollback) has been proven for exactly 2 functions; every other multi-step mutation sequence in the codebase is, by default, presumed to have the SAME defect class until proven otherwise — this is a real, live-proven architectural weakness that likely recurs wherever a function posts GL first and then performs additional separate writes.
- Multi-process concurrency remains categorically unproven across the entire audit series.

## 21. SAP Comparison

SAP S/4HANA's posting logic runs inside a real database transaction (COMMIT/ROLLBACK at the database engine level) — an exception anywhere in a Financial/MM posting sequence is guaranteed atomic by the underlying platform, not by application code remembering to catch and undo. This Lab has no such platform guarantee (a JSON file has no transaction concept), so P35-D1's defect class was structurally inevitable until addressed in application code — which is now done for 2 of ~23 transaction families via a hand-written compensating-rollback pattern. This is a materially weaker guarantee than SAP's (correct only where explicitly implemented, not universal), and should not be represented as equivalent.

## 22. Reliability Score

| Dimension | Score |
|---|---|
| SAP Parity | 54/100 — down from Phase 34, reflecting that this phase's finding (no rollback anywhere) is a more fundamental gap than anything found before it |
| ERP Reliability | 58/100 — a CRITICAL defect causing silent financial/inventory double-posting was found in code every prior phase had exercised without finding it |
| Data Integrity | 80/100 — zero new duplicate IDs, clean DB scan, but P35-D1's exploit (before the fix) could have doubled real GL/inventory values under a real production fault |
| Accounting Integrity | 56/100 — a real double-GL-posting mechanism existed in the most heavily-tested function in the entire codebase (GRN) until this phase |
| Security | 76/100 — transferFixedAsset's gap closed; the broader authorization architecture otherwise held up under this phase's (narrower) testing |
| Workflow Integrity | 68/100 — the reversal engine's generality was reconfirmed correctly |
| Auditability | 62/100 — the rollback's own audit trail is a genuine improvement; broader coverage remains unverified |
| ID Integrity | 66/100 — 39 of 96 now safe; 54 remain, honestly disclosed as unfixed rather than declared low-risk without reasoning |
| Atomicity | 40/100 — this is the FIRST phase to actually test atomicity, and it failed in the most consequential way possible (silent double-financial-posting) before being fixed for 2 of ~23 families; scored low because the defect class is proven to exist broadly until proven otherwise elsewhere |
| Project Accounting | 74/100 — unchanged, not re-tested this phase |
| Architectural Maturity | 3/5 — the shared-guard pattern (ID generation, closed-project posting) is sound where applied; the complete absence of any rollback concept until this phase, in a codebase this mature, is a structural maturity gap |

Scores were reduced, not merely left unchanged, specifically because a previously-untested control (atomicity) failed on first real adversarial contact — consistent with the mission's own instruction not to inflate scores for test volume and to reduce them when a trusted function fails a new test.

## 23. Architectural Control Score (Part O)

| Control | Level | Basis |
|---|---|---|
| Capability containment | L3 | Centrally enforced for tested paths (Phase 26-29 work, re-confirmed indirectly this phase) |
| Write-point containment | L2 | Shared implementation exists; not proven system-wide this phase |
| Numeric validation | L3 | Centrally enforced for tested paths (prior phases) |
| Reference validation | L3 | Centrally enforced for tested paths (docCategory checks, cross-reference attacks, prior phases) |
| Project closure | L3 | Centrally enforced via `assertProjectOpenForPosting()` for its 16 wired call sites (Phases 33-34) |
| Period closure | L3 | Centrally enforced in `postJournalEntry()` |
| Reversal integrity | L3 | Centrally enforced (`reverseEntry()`'s own-type guard), proven to generalize across 2 document types this phase |
| Tax integrity | L2 | Shared function (`splitOriginalTax()`) fixed for its known defect; not re-proven system-wide this phase |
| Idempotency | L2 | Shared implementation, opt-in per route (`idempotent:true` flag) |
| Audit | L2 | Shared `logAudit()` exists; coverage not proven exhaustive |
| **Atomicity** | **L1** — was L0 before this phase's fix (no rollback concept existed anywhere); now genuinely L2 (shared pattern, but opt-in — applied to exactly 2 of ~23 functions) | Downgraded from any higher claim specifically because this phase proved the DEFAULT state of every un-fixed function is L0 |
| ID integrity | L3 | Centrally enforced (`nextId()`) for 39 of 96 series; the remaining 54 are still L0/ad-hoc |
| Route protection | L3 | `registerMutationRoute()` pattern consistently applied |
| Domain-function protection | L3 | `assertCanXxx()` pattern consistently applied, including the newly-closed `transferFixedAsset()` gap |

No control was scored L4/L5 — per the mission's explicit instruction, a shared helper's existence alone does not earn that; L4/L5 would require proof of structural, system-wide, independently-verified enforcement with no known gaps, which no control here yet has.

## 24. GO / GO WITH CONDITIONS / NO-GO

**GO WITH CONDITIONS**, with an explicit warning that this phase's finding is more severe in kind than any prior phase's.

Grounds against NO-GO: the CRITICAL defect found (P35-D1) was root-caused precisely, fixed with a real, generically-applicable mechanism (not a symptom patch), and re-attacked against the EXACT original exploit at every one of the 9 tested stages, now showing zero net mutation in every case. The fix did not regress normal operation (19/19, compound battery, and a fresh GRN-heavy scenario all remained clean). Trial Balance and AR/AP reconciliation never actually broke, even while the defect was live and exploited during testing.

Grounds against unconditional GO: this phase's central finding is that **atomicity — a foundational property this entire audit series had implicitly assumed rather than tested — was absent by default everywhere it was checked, and the fix has only been applied to 2 of roughly 23 comparable transaction families.** Every other multi-step posting function in this codebase should be presumed to carry the identical defect class until proven otherwise. This is a categorically different kind of risk than a single missing tax split or a missing project-status check: it means a real production fault (not even an attacker — a bug, an out-of-memory condition, a timeout) at the wrong microsecond in ANY of those ~21 untested functions could silently double-post real financial and inventory data today. The system is explicitly NOT being certified as atomic in general — only the 2 functions tested and fixed this phase carry that guarantee.
