# ARCH-2026-001 — Current-State Architecture Map

**Date:** 2026-09-21. Section 1 deliverable ("read before changing anything") for the enterprise
architecture / 26-domain / RBAC-upgrade request. **No code changed to produce this document** — it is
a grounded reading of the live repository, cross-checked against evidence from this session's own
direct testing plus the parallel work-stream's own dated reports (see §6).

## 1. Central engines — confirmed singular, fresh this session

| Engine | Writer(s) | Evidence |
|---|---|---|
| GL posting | `postJournalEntry()` — the ONLY real `DB.journalEntries.push()` in `domain.js` | Grepped fresh: 4 textual hits, 3 are comments *describing* this invariant (including one documenting a Phase-38-era architectural-violation test), 1 is the real writer |
| Inventory movement | 1 real writer (`DB.inventoryMovements.push()`) | Grepped fresh: 1 hit |
| Clearing | `applyClearing()` | Unchanged since Phase 6/7, re-confirmed via traceability work this session (`PHASE_41_TRACEABILITY_REPORT.md`) |
| Transaction boundary | `withTransaction()` (Phase 38) | Confirmed live-tested by the parallel work-stream's Phase 42/43 reports (see §6) — propagates correctly through nested calls via `_txDepth` |

**This remains a genuinely single-engine architecture.** No second GL, inventory, or clearing
mechanism was found anywhere in the codebase.

## 2. Current authorization model — role-only, no duty/privilege/scope layer

Confirmed by direct source read this session:

- `const ROLES = ['Admin','CEO','Accountant','FinanceManager','ProjectManager','Purchase','Sales','Estimator','SiteInCharge','Viewer'];` (`domain.js:378`) — 10 flat roles.
- `ROLE_MODULES` (`index.html:422`) — a client-side menu-visibility filter only, explicitly commented as non-authoritative ("Discoverability filter only... does NOT restrict what a role CAN do").
- Server-side authorization is implemented as direct `actor.role===X` / `['A','B'].includes(actor.role)` checks scattered across `server.js`'s route handlers — confirmed by grep (8+ distinct inline patterns sampled).
- **No duty, privilege, data-scope, approval-authority, or SoD-rule data model exists.** Grepped for `DB.duties`, `DB.privileges`, `DB.roleDuties`, `DB.dataScopes`, `DB.sodRules` — zero hits.
- Approval THRESHOLDS (e.g., PO tiers, discount tiers) exist as real, tested, hardcoded-in-domain-logic business rules (BOS §1.6-sourced) — real and correct, but not modeled as a configurable "Approval Authority" entity as the new brief specifies (Section 14 of the request).
- Maker-checker/3-person separation (Payment Requests) is real and live-tested but implemented as bespoke logic inside `executePaymentRequest()`/`approvePaymentRequest()`, not a generic SoD engine.

**Conclusion:** the request's Sections 3-20 (duty/privilege/scope/SoD architecture) describe a
genuinely new authorization layer — this is not an upgrade of an existing partial implementation,
it would be new infrastructure sitting underneath the entire application's route layer.

## 3. Two independent, concurrently-run phase-numbering tracks exist on this codebase

This is a process finding, not a technical one, but it materially affects how this request should be
sequenced.

**Track A (this session):** Phase 39 → 40 → 41 (verdict A, architecture frozen) → the Phase 41
change-management baseline → DEF-2026-001 → CR-2026-001 (nomenclature, its own "Phase 42") → the UAT
readiness pack.

**Track B (a separate, parallel session on the same repository):** its own Phase 35...38...41...42...43,
reaching, by its own Phase 43, a real call-graph atomicity audit. Confirmed via direct file reads this
session:
- `PHASE42_LEGACY_MUTATION_CLOSURE_REPORT.md` — Track B's own "Phase 42": found and fixed **P42-01**
  (`submitPurchaseOrder()`/`approvePurchaseOrder()` → `createCommitmentFromPO()`, an unguarded
  caller→callee mutation pair; a real PO/commitment-tracking gap, LIVE PROVEN and fixed with
  `withTransaction()`).
- `PHASE43_CALLGRAPH_ATOMICITY_REPORT.md` — Track B's own "Phase 43": a real function call-graph
  analysis (456 functions, 131 mutating, 26 mutation-to-mutation edges) that found and fixed **4
  CRITICAL, currently-live production outages** — `executePaymentRequest()`, `issueProductionMaterial()`,
  `issueServiceMaterial()`, `submitStockCount()` were each silently broken by the Phase 38 transaction
  guard blocking their own unguarded internal GL/inventory writes. All 4 fixed, 2 LIVE PROVEN with
  fault injection, 1 CODE VERIFIED (no live fixture available, disclosed not fabricated), 1 structurally
  identical to a proven pattern.

**Both tracks used the same evidence discipline this engagement has followed throughout** (LIVE
PROVEN / CODE VERIFIED / STRUCTURALLY VERIFIED / NOT VERIFIED classification, real fault injection,
honest disclosure of what wasn't tested) — this reads as genuinely the same house style, just two
independent sessions that never synchronized their own phase counters.

**Consequence for this request:** Track B's own Phase 42/43 work already touches `domain.js` inside
several of the exact function families the new 26-domain brief's Sections 22-25 (central engine
integration, end-to-end process chains including Source-to-Pay and Plan-to-Produce) would also need
to touch. Any implementation work on this request should re-pull the current `domain.js`/`server.js`
state immediately before starting, not rely on either track's own prior snapshot.

## 4. 26-domain scope — see `ARCH-2026-001-26-DOMAIN-MATRIX.md` for the full breakdown

Headline: of the 26 domains named in the request, roughly **18-20 already exist in real, tested form**
(confirmed this session via `UAT-SCOPE-MATRIX.csv`'s 42-domain evaluation, which is a finer-grained
superset of the same functional ground). **6 are confirmed absent** by direct code search this session
and in Track B's own prior work: HR/Workforce, Payroll, Maintenance/EAM, PLM, Advanced Planning/MRP,
Transportation/Logistics, Advanced Warehouse — these were previously classified (this session's own
`UAT-KNOWN-LIMITATIONS.md`) as NOT APPLICABLE or FUTURE ROADMAP, explicitly not authorized to build.

## 5. Known, already-disclosed open items relevant to this request

- `DEF-2026-002` — OPEN/UNAUTHORIZED, a test-harness defect, unrelated to this request, not to be
  fixed under this initiative without its own separate authorization (per `CONTROLLED_CHANGE_REGISTER.md`).
- MRQ/MR naming confusability, status-enum casing split (10 UPPERCASE_SNAKE / 16 PascalCase), SAC
  scope, Business Partner architecture question — all still open Business Decisions, unaffected by
  this session's own CR-2026-001 (which deliberately left them untouched).
- The historical `server/db.json` / ERP-059B incident — its documented status is unchanged; this
  document does not reopen it (see the governance exchange immediately preceding this document for
  the user's own confirmation that the file's Sep 19 timestamp change is benign/expected).

## 6. What this document does NOT do

This is a reading of current state only. It does not propose the target architecture (see
`ARCH-2026-001-ROLE-SECURITY-DESIGN.md` for that, explicitly marked as a design proposal, not an
implementation) and no code was changed to produce it.
