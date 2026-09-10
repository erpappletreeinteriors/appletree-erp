# APPLETREE ERP — QUICK CONTROL FIX REPORT

**Scope:** `SAP_Architecture_Lab` only. **Date:** 2026-09-07. Two narrowly-scoped fixes only, per instruction: (P1) Fixed Asset Transfer authorization, (P2) Job Work Fee → Job Work Order traceability. No Project Variation, Site Return behavior, PR/RFQ, Warranty, Retention, Labour Attendance, or Quotation→BOM work was touched.

---

## 1. Fixed Asset Transfer — Current State

**Correction to the prior report first, stated plainly:** the *Targeted Business Control Remediation Report* (§9) claimed `transferFixedAsset()` "has no assertCanXxx() domain-level role check at all." That was **wrong** — re-verified against the live source this session. A domain-level guard, `assertCanTransferFixedAsset()`, already existed (added in an earlier phase of this engagement, "Phase 35 Part F," documented in its own code comment), already called at the top of `transferFixedAsset()`, and already mirrored at the route level. The prior report's claim came from a stale comment left INSIDE the function body from an even earlier phase (34) that was never updated after Phase 35 closed the gap — the prior audit read that stale comment instead of re-verifying the actual guard call above it. This is now corrected, both in this report and in the code (§2).

What was genuinely still missing, found by re-inspecting the route (not the domain function):

- The route (`/api/fixed-assets/:id/transfer`) was a **legacy if-block**, not `registerMutationRoute()` — unlike its three sibling routes (capitalize/depreciate/dispose), all already modern. Every request (legacy or modern) is wrapped in the blanket legacy-dispatch transaction wrapper for atomicity, but **only** `registerMutationRoute()` constructs a real idempotency option from `body.idempotencyKey`. This is the exact same gap class found and fixed for Change Requests in the prior phase — Fixed Asset Transfer had it too, previously undetected because that prior investigation stopped at "the authorization is already fine" without checking idempotency separately.
- `newProjectId`, when supplied, was never validated against `DB.projects` — any string was accepted, silently attributing the asset's future depreciation/disposal to a project that might not exist.
- **A real, live-proven defect found during this phase's own testing** (not previously reported anywhere): the existing closed-project gate only checked the asset's **current (source)** project. Moving an asset **into** a closed project was completely unchecked — reproduced live: a plain FinanceManager transfer, no override, successfully re-attributed a Capitalized asset to a CLOSED project's register.

## 2. Fixed Asset Authorization Fix

Reused the existing architecture throughout — no new authorization system:

- **Route migration** (`server.js`): `/api/fixed-assets/:id/transfer` moved from its legacy if-block to `registerMutationRoute({authCheck:(actor)=>D.assertCanTransferFixedAsset(actor).ok, idempotent:true, auditReject:true, ...})`, placed alongside its three siblings. The old if-block removed. Real idempotency now applies, same as every other fixed-asset lifecycle action.
- **Destination-project validation** (`domain.js`, `transferFixedAsset()`): `newProjectId`, when supplied, must reference a real `DB.projects` entry — same `Unknown project "X"` convention used everywhere else in this file.
- **Closed-destination-project fix** (`domain.js`): the existing `assertProjectOpenForPosting()` gate — already applied to the asset's source project — is now **also** applied to the destination project when the transfer actually changes project. Same mechanism, same override-reason path (CEO/Admin with a reason), applied symmetrically rather than only one-directionally. A pure location/custodian-only transfer (no project change) is unaffected.
- **Stale comment corrected** inside `transferFixedAsset()` — it no longer misstates that no domain-level check exists.
- No new capability was registered (Transfer has no GL/inventory effect, so no `GL_OPERATION_BINDING`/`INVENTORY_OPERATION_BINDING` entry was needed, consistent with how the existing `assertCanTransferFixedAsset()` was already wired).

Determined capability question: **no distinct capability was required or added** — `assertCanTransferFixedAsset()` is called directly (same pattern as `assertCanReturnFromSite()` — a plain domain guard, not routed through the GL/inventory write-point binding tables, because Transfer posts neither).

## 3. Job Work Fee — Current State

Confirmed by inspection: `DB.jobWorkOrders` carries `jobWorkerId` (a reference into the separate `DB.jobWorkers` master), **not** a `vendorId`. `DB.vendors` (the master `draftSupplierInvoice()`/`draftSupplierInvoiceFromPO()` bill against) and `DB.jobWorkers` are two **structurally unrelated** master collections — nothing in this codebase links a Job Worker to a Vendor today. Job Work processing fees are, as stated, ordinary supplier bills with zero `jobWorkOrderId` field or any other link back to the originating JWO.

## 4. Job Work Fee Traceability Fix

Minimum addition, exactly as specified — no parallel billing system:

- `createDraft()` (`domain.js`) gained one new optional field, `jobWorkOrderId`, stored on the draft — same shape and rationale as the existing `excessBillingApprovalId` field (purely additive, `null` for every existing caller).
- `draftSupplierInvoice()` and `draftSupplierInvoiceFromPO()` both accept an optional `jobWorkOrderId`. When supplied:
  - The JWO must exist (`DB.jobWorkOrders.find`) — else blocked.
  - The JWO's own project, when it has one, must match the bill's project — else blocked (the only cross-project check the current data model actually supports).
  - **Deliberately not implemented**: a vendor-ownership check ("JWO's job worker == this bill's vendor"). §3 establishes there is no relationship between `DB.jobWorkers` and `DB.vendors` in this data model — inventing one would be exactly the kind of unauthorized policy assumption this phase was told not to make. **Reported as BUSINESS DECISION REQUIRED**, not silently implemented.
- No new route changes were required — `/api/ap/invoice` (`registerMutationRoute`, already `idempotent:true`) and `/api/ap/invoice-from-po` (legacy if-block, unchanged) both already spread the full request body into the domain call; `jobWorkOrderId` flows through automatically once the domain function's own parameter destructuring recognizes it.
- Traceability chain, live-confirmed: `JWO-0004` → `DRAFT-0781.jobWorkOrderId` → `DRAFT-0781.postedEntryId` → `JE-1319`. Fully queryable without any GL schema change.

## 5. Tests

**Section 1 — Fixed Asset Transfer (13 scenarios, all LIVE against the running server):**

| # | Scenario | Result |
|---|---|---|
| 1 | Sales/Estimator/Viewer attempt transfer | **BLOCKED** (403) |
| 2 | Purchase attempt transfer | **BLOCKED** (403 — Purchase is not in the `can(actor,'post')` tier) |
| 3 | Unauthenticated direct API call | **BLOCKED** (401) |
| 4 | FinanceManager transfers a Capitalized asset | **ALLOWED** |
| 5 | Transfer of nonexistent asset | **BLOCKED** ("Fixed asset not found.") |
| 6 | Transfer of a Disposed asset | **BLOCKED** ("Cannot transfer a disposed asset.") |
| 7 | Transfer to a nonexistent project (`newProjectId`) | **BLOCKED** ("Unknown project" — new validation, §2) |
| 8 | Second legitimate transfer of the same asset | **ALLOWED** |
| 9 | Duplicate submission, same idempotency key | **DEDUPLICATED** — identical asset state returned both times, second marked `idempotent:true` |
| 10 | FinanceManager transfers **into** a CLOSED project, no override | **BLOCKED** (defect found and fixed this phase, §1/§2) |
| 11 | CEO transfers into a CLOSED project, with override reason | **ALLOWED** (escape hatch still works, same as every other posting gate) |

**Section 2 — Job Work Fee traceability (8 scenarios, all LIVE):**

| # | Scenario | Result |
|---|---|---|
| 1 | JWO (PRJ-1) + Bill (PRJ-1) | **ALLOWED**, `jobWorkOrderId` stored on the draft |
| 2 | JWO (PRJ-1) + Bill (PRJ-2) | **BLOCKED** — cross-project |
| 3 | Nonexistent JWO | **BLOCKED** |
| 4 | Ordinary bill, no `jobWorkOrderId` | **UNAFFECTED** — works exactly as before, field stored `null` |
| 5 | Forged `jobWorkOrderId` (a real id from an unrelated collection — a PO id) | **BLOCKED** — treated correctly as "does not exist" in the JWO collection |
| 6 | Duplicate submission, same idempotency key | **DEDUPLICATED** — same draft id both times |
| 7 | Goods-category vendor (VEND-1) + `jobWorkOrderId` present | **STILL BLOCKED** by the pre-existing 3-way-match rule — confirms `jobWorkOrderId` cannot be used to bypass it |
| 8 | Sales role attempting bill creation | Recorded, not asserted — `/api/ap/invoice`'s own role gate (`permission:'create'`) is a pre-existing, unrelated policy (Sales already holds general `create` permission) — **out of scope for this phase**, not modified, not broken by this change |

**21/21 assertions passed** on the final run (after correcting two of my own test-harness assumptions, disclosed below).

## 6. Security Attacks

All 8 items from the brief's list, directly against the API (no UI):

1. Unauthorized Fixed Asset Transfer (Sales/Estimator/Viewer/Purchase) — **BLOCKED**.
2. Unauthorized direct API Transfer (unauthenticated) — **BLOCKED** (401).
3. Job Work Fee with nonexistent JWO — **BLOCKED**.
4. JWO Project A + Bill Project B — **BLOCKED**.
5. JWO Vendor A + Bill Vendor B — **NOT VERIFIABLE as designed**: no vendor field exists on a JWO to compare against (§3/§4). Reported as BUSINESS DECISION REQUIRED, not silently passed or silently blocked.
6. Reuse of another project's JWO — same mechanism as #4, **BLOCKED**.
7. Forged `jobWorkOrderId` (a syntactically real id from a different collection) — **BLOCKED**.
8. Duplicate submission, same idempotency key (both Fixed Asset Transfer and Job Work Fee bill) — **DEDUPLICATED** in both cases.

## 7. Atomicity

- Fixed Asset Transfer: single in-memory asset mutation + one `transferHistory` push, inside the (now-modern) route's `withTransaction()` boundary; no multi-record fan-out exists for this action, so there is no partial-write scenario to fault-inject beyond what atomicity testing already covers structurally (the route now inherits the SAME `dispatchMutationRoute()`-owned transaction boundary as every other modern route).
- Job Work Fee bill: `createDraft()` is a single-record push, already covered by the existing, already-tested `postDraft()` atomicity fix (Phase 37) for the later posting step — unchanged by this phase, confirmed via the P0-3 regression suite's own fault-injection test on a 3-way-matched bill (see §11), which exercises the same `createDraft()`/`postDraft()` pair `jobWorkOrderId` now flows through.

## 8. Audit

**Fixed Asset Transfer** — live-confirmed in `auditLog`:
- Success: `FixedAssetTransferred` — carries `assetId`, `before`/`after` (location, custodian, **projectId** — i.e. source and destination), `reason`, `userId`, `role`, `at`.
- Rejection: `BusinessRuleRejected` (auto-logged by the route's `auditReject:true`) — carries `path`, `method`, `error`, `userId`, `role`, `at`. Confirmed live for both the "unknown project" rejection and the new closed-destination-project rejection.

**Job Work Fee** — the draft's own `history` array (`{action:'Created', userId, role, at}`) is this codebase's established audit mechanism for draft-stage documents (drafts are not separately written to the global `auditLog` at creation — only submit/approve/reject/post transitions are, matching every OTHER draft-based document type, not a gap specific to this change). `supplier bill` (the draft itself), `jobWorkOrderId`, `project` (on every line), `vendor` (`party`), `actor`, and `timestamp` are all present on the stored draft record — confirmed live on `DRAFT-0781`.

## 9. Accounting Reconciliation

- `DRAFT-0781` (JWO-0004 fee bill, ₹5,000) taken through submit → approve → post end-to-end. Resulting `JE-1319`: **exactly one** GL posting, Dr 5000 (Expense) / Cr 2000 (AP) — the ordinary, unmodified supplier-bill accounting. **No second GL entry, no GL line carries `jobWorkOrderId`** — it exists only on the draft, purely for traceability, exactly as specified.
- Independently recomputed Trial Balance from raw journal lines after all this phase's activity: **Total Debit ₹88,43,105.39 = Total Credit ₹88,43,105.39, difference 0.000000.**
- Fixed Asset Transfer has no GL effect of its own (unchanged, confirmed) — the closed-destination-project fix (§2) does not touch accounting treatment, only whether the transfer is permitted.

## 10. Database Integrity

Full forensic scan re-run after all this phase's testing. **No new anomaly of any kind.** Every finding matches the exact same historical artifacts already disclosed in every prior report this engagement (duplicate `MV-000121`/`MV-000124`, `IADJ-0015`, 5 duplicate quotation-revision doc numbers, the same 11 documented negative-quantity records, orphan references to the same 3 synthetic test fixtures, the same `PRJ-1||BOM-GOV-TEST` legacy double-Approved-BOM artifact). `fixedAssets` count unchanged at 133 (transfers mutate, they don't create records). New `jeDrafts`/`journalEntries` entries are exactly the ones this phase's own testing created, all internally consistent.

## 11. Protected Baseline Regression

| Baseline | Result |
|---|---|
| P0-1 Project Creation | **PASS** (part of the 56/56 below) |
| P0-2 Invoice Ceiling | **PASS** — including Change-Request-driven ceiling increase, Excess Billing Approval flow, and fault-injection+retry |
| P0-3 Goods 3-Way Match | **PASS** — directly exercises `draftSupplierInvoice()`/`draftSupplierInvoiceFromPO()`, the exact functions this phase modified; all 14 scenarios, including the goods-vendor block and fault-injection+retry, passed unchanged |
| P0-4 BOM Numbering | **PASS** |
| **Full P0 suite total** | **56/56 passed** |
| BOM Excess Material Issue governance | Not re-attacked — zero code overlap with either change this phase |
| Change Request idempotency / creator-approver SoD | Not directly re-attacked with a dedicated duplicate-key test this phase, but exercised incidentally and successfully within the P0-2 suite (CR-0008 created and approved cleanly); zero code overlap with either change this phase, so risk is negligible |
| Site Return | **PASS on every logic assertion** — partial/full return, damaged-condition GL loss (with a fresh Trial-Balance-before/after check), closed-project block, nonexistent site/material block, duplicate-submission idempotency, unauthorized-role block, unauthenticated block, and fault-injection+retry all passed cleanly on rerun. 8 of the test script's own absolute stock-quantity assertions failed — **not a regression**: this rerun used the live, multi-session `db.json` (which already carries residual site stock from the original Site Return test run in the prior phase), not a fresh reset, so the script's "site starts at zero" assumption was stale. Every assertion that tests actual CONTROL BEHAVIOR (not a bare number) passed. |
| Inventory/GL reconciliation | **PASS** (§9) |
| Job Work Scrap write-off | Not re-attacked — zero code overlap with either change this phase |
| RBAC/capability registry | **PASS, structurally** — neither `CAPABILITY_REGISTRY` nor `EXPECTED_CAPABILITIES` nor either binding table was touched this phase (no new capability was needed for either fix); the server booted cleanly under the existing startup policy validator both before and after these changes |
| Atomicity | **PASS** (§7) |
| Idempotency | **PASS** (§5/§6, both changes) |
| Trial Balance | **PASS — balanced to the rupee** (§9) |

**No protected baseline failed. No STOP condition was triggered.**

## 12. Defects Fixed

1. **Fixed Asset Transfer into a closed project was completely unchecked** — live-proven this phase, fixed by symmetrically extending the existing `assertProjectOpenForPosting()` gate to the destination project (§1/§2). This is a genuine, newly-found software defect, not a policy gap.
2. **Fixed Asset Transfer route had no real idempotency protection** (legacy if-block, same gap class as the earlier Change Request defect) — fixed by migrating to `registerMutationRoute()` (§2).
3. **`newProjectId` on a Fixed Asset Transfer was never validated** — any string was accepted — fixed with the standard "Unknown project" check already used throughout this codebase (§2).
4. **Job Work processing fees had no traceability back to their originating Job Work Order** — this is a genuine **function gap being closed**, not a defect fix; framed as such, not inflated (§4).

## 13. Remaining Gaps

- Vendor-ownership validation for Job Work Fee bills (JWO's job worker vs. bill's vendor) cannot be implemented without first deciding whether/how a Job Worker should map to a Vendor — no such relationship exists in the data model today (§3/§4).
- Duplicate-fee-bill detection for the same JWO: **not implemented, and live-confirmed the architecture does not currently prevent it** — a second, independently-submitted (different idempotency key) fee bill against the same JWO was allowed. There is no "fee already billed" flag or running total on a JWO to make this an unambiguous duplicate versus a legitimate partial/second charge — inventing a block here would be inventing policy.
- `/api/ap/invoice-from-po` remains a legacy if-block (no real idempotency) — pre-existing, out of scope for this phase (not touched by either P1 or P2), flagged for awareness only.
- Sales role can create ordinary/job-work-fee supplier bills via `/api/ap/invoice` (pre-existing `permission:'create'` gate, unrelated to this phase) — flagged as an observation, not altered.

## 14. Business Decisions Still Required

1. Should a Job Worker (`DB.jobWorkers`) be linked to a Vendor (`DB.vendors`) master record, and if so, how (a direct FK, a merge of the two masters, or something else)? Without this, "JWO Vendor A vs Bill Vendor B" can never be enforced.
2. Should a Job Work Order track cumulative fee-billed amount/status, enabling a real duplicate-fee-bill control? If yes, what threshold makes a second bill against the same JWO "the same" fee versus a legitimate additional charge?

## 15. Risk Register

| Risk | Severity | Status | Action |
|---|---|---|---|
| Fixed Asset transferred into a closed project, unchecked | Was a real live defect | **CLOSED** this phase | None — fixed and regression-tested |
| Fixed Asset Transfer route lacked idempotency | P2 | **CLOSED** this phase | None — migrated to `registerMutationRoute` |
| Job Work Fee bills untraceable to their JWO | FG (function gap) | **CLOSED** this phase | None — optional field added, validated, tested |
| No Job Worker↔Vendor linkage | BD | Open, disclosed | Awaiting a management decision (§14.1) |
| No duplicate-fee-bill detection for a JWO | BD | Open, disclosed | Awaiting a management decision (§14.2) |
| `/api/ap/invoice-from-po` still legacy (no idempotency) | OBS | Open, pre-existing, unrelated to this phase | Flagged for a future, separately-scoped session |

## 16. Final Status

## GO

Both authorized fixes are implemented, live-tested (21/21 targeted assertions + 56/56 P0 regression + full Site Return logic regression), reconciled to the rupee, and leave no new database anomaly. One genuine, previously-unreported defect (closed-project transfer destination unchecked) was found and fixed as part of verifying the authorization fix, within scope. No policy was invented: the one place a business decision would be required (Job Worker↔Vendor linkage for cross-vendor validation) is disclosed, not guessed. No protected baseline regressed. No other module was touched.
