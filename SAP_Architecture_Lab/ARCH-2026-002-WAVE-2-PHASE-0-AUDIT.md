# ARCH-2026-002 — Wave 2 Phase 0: Operations Domain Readiness, Dependency, Security, and Implementation Design Audit

**Date:** 2026-09-22. Master Wave 2 Phase 0 report, per this CR's own §27 (A-L). Synthesizes the 9
companion deliverables; each section cites the document carrying full detail. **Audit and design only.
No Wave 2 application code was written. No production data was modified.**

## A. Current-state matrix
15 EXISTING capabilities confirmed across the 6 Wave 2 domains' core chains; a small number of deliberate,
previously-disclosed ABSENT items re-confirmed (PO Amendment, Routing/Work Centre, Demand trigger,
Production Output→FG, Gate Pass, Transporter/Vehicle master, Inspection/NCR, CAPA auto-origination,
Warehouse scope dimension); zero DUPLICATE or CONFLICTING functionality found. One material
clarification this pass makes to the prior shorthand: the Machine model has 4 states (Available/InUse/
Maintenance/Down), not 2. Full detail: `ARCH-2026-002-WAVE-2-MODULE-MATRIX.md`.

## B. Transaction ownership matrix
Every Wave 2 transaction type named in this CR's §5 has exactly one authoritative owner (or is
confirmed genuinely absent, with nothing to have a second owner). **No transaction acquired a second
authoritative owner.** Full detail: `ARCH-2026-002-WAVE-2-TRANSACTION-OWNERSHIP.md`.

## C. Central-engine audit
All 11 named engines (GL, inventory, clearing, transaction wrapper, numbering, authorization, data-scope,
SoD, approval, audit, project-cost) re-confirmed singular and correctly reused across all 6 Wave 2
domains. **No shadow writer found — no STOP condition triggered.** The one real finding is a coverage
gap on the SoD engine (missing rules), not a duplicated or forked mechanism. Full detail:
`ARCH-2026-002-WAVE-2-CENTRAL-ENGINE-AUDIT.md`.

## D. Process traces
6 chains traced (Source-to-Pay, Stock-to-Site, Site-to-Handover, Plan-to-Produce, Job-Work-to-Settlement,
Quality-to-CAPA). 4 WORKING (with disclosed, non-blocking gaps), 2 PARTIAL (Plan-to-Produce: no Demand
trigger + zero inventory effect on Production Output; Quality-to-CAPA: state machine WORKING but no
auto-origination and a closure-identity gap). Zero chains BROKEN or fully ABSENT. Full detail:
`ARCH-2026-002-WAVE-2-PROCESS-TRACE.md`.

## E. Security baseline
**No CRITICAL vulnerability found — no stop required.** The substantive finding: 3 high-risk operational
chains (Manufacturing execution, Job Work dispatch-to-settlement, Quality/QC self-attestation) have zero
SoD coverage — a single authenticated, correctly role-gated user can complete each entire chain alone.
This is a genuine, disclosed coverage gap on the existing, correctly-singular SoD engine, not an
authentication or authorization-bypass failure, and does not meet this engagement's own CRITICAL/STOP
bar (established consistently across every prior Phase 0 pass: unauthenticated access or client-side
identity override). Reported in full, not fixed. Full detail:
`ARCH-2026-002-WAVE-2-SECURITY-BASELINE.md`.

## F. Data-model gap register
7 entities registered (PO Amendment excluded — already dispositioned as out of scope, not reopened):
Production Output→FG movement type, Production Scrap as a distinct type, Demand→Production-Order
linkage, Gate Pass, Transporter/Vehicle master, Inspection/NCR, Warehouse scope dimension. Every field
has a documented business purpose; none proposes a duplicate engine. Full detail:
`ARCH-2026-002-WAVE-2-DATA-MODEL-GAP-REGISTER.md`.

## G. Management decisions
2 items carried forward as Wave-2-affecting from the existing register (Demand trigger, QC audit gap,
now numbered W2-1/W2-2); 5 new items surfaced this pass (W2-3 Warehouse scope, W2-4 SoD coverage, W2-5
Production Output→FG, W2-6 Gate Pass/Transporter, W2-7 Inspection/NCR). None decided by this document.
Full detail: `ARCH-2026-002-WAVE-2-DECISIONS.md`.

## H. Dependency map
Wave 2's only HARD dependencies are on already-EXISTING Wave 1 domains (Master Data, Projects,
Estimation & Costing's BOM) — none on any not-yet-built Wave 3-6 domain. SOFT dependency on Finance &
Accounting (Wave 3) is already satisfied today (every Wave 2 domain already posts through the existing
single GL engine). Full detail: `ARCH-2026-002-WAVE-2-DEPENDENCY-MAP.md`.

## I. Detailed Wave 2 design
Full item-by-item design for every decision-contingent item (§4-23 of this CR's own structure), plus a
proposed (not mandated) sub-wave sequence (2A Security closure → 2B Procurement cross-document SoD →
2C Demand trigger → 2D Warehouse scope → 2E Production Output→FG → 2F Gate Pass/NCR), reasoned from risk
and decision-readiness rather than assumed order, per this CR's own explicit instruction not to assume
the example ordering is correct. Full detail: `ARCH-2026-002-WAVE-2-DESIGN.md`.

## J. Baseline test results

| Category | Result |
|---|---|
| Full regression (21 pre-existing suites) | **527 PASS / 2 FAIL / 529 total** — byte-identical to the expected baseline stated in this CR's own §22; the 2 FAIL are the same pre-existing, documented, unrelated `erp_059b` filesystem-path gaps |
| Wave 1's own suite | **42/42 PASS** (re-run as part of this pass's regression battery) |
| RBAC | **39/39** |
| Data Scope | **65/65** (32+33) |
| SoD | **30/30** |
| Approval | **37/37** |
| Security | **13/13** |
| Accounting invariants | **PASS** (525-document stress test, Trial Balance/AR/AP/GST all reconcile) |
| Inventory invariants | **PASS** (zero negative/NaN stock, single writer confirmed) |

**Baseline matched exactly — no investigation required.**

## K. Production safety evidence
`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` — confirmed
identical before this Wave 2 Phase 0 pass began and after it completed. Every test ran exclusively
against a disposable isolated scratch instance. Zero application code was modified to produce this
Phase 0 — only new `ARCH-2026-002-WAVE-2-*.md` documents were created.

## L. Final verdict

# PASS WITH DOCUMENTED DEFERMENTS

All 27 sections of this CR's own instructions were completed. The "documented deferments" qualifier
(rather than an unqualified PASS) reflects the genuinely open item count carried forward: **7 Wave-2-
affecting management decisions remain open** (W2-1 through W2-7), none silently resolved, none silently
implemented. **No STOP condition was triggered** — no production DB change, no duplicate GL/inventory
engine, no ambiguous transaction ownership, no CRITICAL security finding, no P0/P1/P2 defect discovered,
no forced management decision blocking the AUDIT itself (the 7 open decisions block future
*implementation* scoping, not this Phase 0's own completion), no documentation/code discrepancy
affecting architectural ownership, no unsafe-to-characterize migration risk, and no Wave 3-6 functionality
was required to complete this audit.

**Per this CR's own final rule: STOPPING HERE.** Wave 2 implementation is NOT authorized by this
document and will not begin automatically. It requires a separate authorization after this Phase 0/
design gate is reviewed.
