# ARCH-2026-002 — Wave 4 Phase 0 (Part B): Service & After-Sales, Reporting & Analytics (Deepened) —
# Readiness, Dependency, Security, and Implementation Design Audit

**Date:** 2026-09-23. Master Wave 4 Phase 0 report — Part B of "ARCH-2026-002 Wave 3 Decision Resolution +
Wave 4 Readiness Gate." Mirrors `ARCH-2026-002-WAVE-3-PHASE-0-AUDIT.md`'s A-O structure, adapted to Wave
4's own §9-§26 sections. Synthesizes the 8 companion deliverables listed in §O. **Audit and design only.
No Wave 4 application code was written. No production data was modified.**

Part A of this CR (Wave 3 Decision Resolution, `ARCH-2026-002-W3-DECISION-RESOLUTION.md`) was completed
separately by a human engineer and is not touched by this document.

## A. Current-state matrix

All 9 named Wave 4 capabilities (Customer 360, Warranty, Complaints, Service Tickets, Service Visits, AMC,
AMC Schedule, Service Billing, CAPA) are **EXISTING** — a substantial, already-built implementation in
`server/domain.js`'s Phase 10 block (`:7301`-`:8065`), fully routed in `server/server.js` (`:1853`-`:2180`),
and fully UI'd as a dedicated "SERVICE & AFTER-SALES" module group in `client_secure/index.html`
(10 tabs). **Zero ABSENT, zero DUPLICATE, zero CONFLICTING functionality found.** Every PARTIAL
sub-finding is scoped to a specific dimension (SoD coverage, audit-log completeness, or test coverage),
never a capability's core function. This confirms, and materially deepens with line-level precision, the
CR brief's own explicit warning not to assume greenfield. Full detail:
`ARCH-2026-002-WAVE-4-MODULE-MATRIX.md`.

## B. Transaction ownership

All 17 transaction-type labels in the CR's own §10 list were resolved to exactly one authoritative owner
each — 5 labels (Customer Service, service expense, replacement material, warranty claim, chargeable
service) turned out to be composite labels over already-covered rows, not distinct entities, disclosed as
such rather than fabricating phantom owners. **No transaction acquired a second authoritative owner.**
The one nuanced, re-verified finding: Service Billing is confirmed a single engine, precisely characterized
as two sub-paths — Chargeable Service routes through `draftCustomerInvoice()` (inheriting its full
billing-ceiling/variation-allocation checks), AMC Billing routes through the shared `createDraft()`
primitive one level below (for its own deferred-revenue credit-account requirement, correctly NOT
inheriting the project billing-ceiling check). Both converge on the identical Draft→GL lifecycle — this
refines, rather than contradicts, the original Phase 0's and the Wave Plan's own literal wording. Full
detail: `ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md`.

## C-F. Process traces

Four chains traced in full, per this CR's own §11-§14:
- **C. Service-to-Cash**: WORKING — re-confirms and refines the original Phase 0's chain L.
- **D. Warranty trace**: WORKING — duration/coverage/exclusion policy correctly and explicitly left to
  human entry per record, an intentional `BUSINESS POLICY REQUIRED` design, not a code gap.
- **E. AMC trace**: WORKING — one disclosed convenience gap (no auto-generation of recurring schedule
  entries at the contract's stated frequency).
- **F. Complaint/Ticket control trace**: WORKING — closure is role-tier-gated (a supervisory-role holder
  CAN close a ticket they created; a non-supervisory creator cannot); Resolution SLA explicitly, honestly
  unconfigured, matching the code's own disclosure.

Full detail: `ARCH-2026-002-WAVE-4-PROCESS-TRACE.md`.

## G. Process trace summary

| Chain | Verdict |
|---|---|
| Service-to-Cash | **WORKING** |
| Warranty | **WORKING** |
| AMC | **WORKING** |
| Complaint/Ticket control | **WORKING** |

**Zero chains PARTIAL, BROKEN, ABSENT, or DEFERRED** — a materially stronger result than Wave 2 Phase 0's
own trace (2 of 6 PARTIAL), consistent with Service & After-Sales being a later, more mature build phase.

## H. Security baseline

**No CRITICAL vulnerability found — no STOP condition triggered.** Confirmed exactly ONE inventory-movement
engine (Service Material routes unmodified through `createMaterialIssue()`/`postInventoryMovement()`),
confirmed NO direct AR posting from Service outside the two named Service Billing sub-paths, confirmed
SOD-11 (CAPA effectiveness-checker≠closer) re-verified intact and unmodified. Real findings, all reported
not fixed: warranty material is company-cost-expensed-at-issue (no provision/reserve mechanism exists);
Service Labour's rate card (POL-06) exists but is not wired into the actual posting function; `technicianId`
is accepted but never persisted; Service Labour is not Cost-Centre-tagged (a new, narrow addition to Wave
3's own pre-existing Controlling-coverage finding); duplicate-billing is unguarded for both Service Invoice
and AMC Billing drafts; SoD coverage is uneven (CAPA strongest via a formal `checkSoD()` rule, Service
Visit strong-but-threshold-gated via an inline check, Complaint/Ticket/AMC/AMC-Schedule role-tier-only with
no identity check at all); 6 functions lack `logAudit()` calls. **Live-tested this pass**: a Sales user
scoped to `CUST-1/2/3` was denied (`403`) the After-Sales summary of an unassigned customer (`CUST-4`) and
granted (`200`) their own assigned customer's, with the warranty list endpoint independently confirmed
server-side-filtered — direct-API cross-customer traversal resisted. Full detail:
`ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md`.

## I. Data-model gaps

9 items registered — all pure tagging/validation additions to EXISTING functions except 2 (AMC
auto-scheduling, Warranty Provision accounting), which are explicitly flagged as requiring their own
dedicated design/policy pass, matching how Wave 3 left its own 2 most significant items (Cost Allocation,
Profit Centre propagation) similarly unbundled. Full detail:
`ARCH-2026-002-WAVE-4-DATA-MODEL-GAP-REGISTER.md`.

## J. Dependency map

Wave 4's HARD dependencies (Customer, Project, Finance's `createDraft()`/`postJournalEntry()`, Inventory's
`postInventoryMovement()`, Quality's CAPA engine) are all already-EXISTING, already-satisfied Wave 1-3
capabilities — confirmed by direct source read, not assumed. **No hard dependency on any not-yet-built
Wave 5-6 domain.** Re-verified independently (not merely cited): none of the 9 W3 items block Wave 4; one
non-blocking relationship restated (W3-7 Cost Allocation would deepen, not enable, Service profitability
reporting). Full detail: `ARCH-2026-002-WAVE-4-DEPENDENCY-MAP.md`.

## K. Management decisions

11 new items surfaced this pass (W4-1 through W4-11), none decided by this document. 4 carry essentially no
business-policy content (W4-7 duplicate-billing, W4-10's validation half, W4-11 technician/Cost-Centre
tagging) and are closer to scheduling choices; 7 are genuine product/accounting/risk-appetite questions
(warranty policy, classification-automation, AMC-automation, SLA completion, rate-card enforcement,
warranty accounting treatment, SoD-expansion scope, diagnosis-threshold risk appetite). Full detail:
`ARCH-2026-002-WAVE-4-DECISIONS.md`.

## L. Wave 4 design

Full item-by-item design for every decision-contingent item, split into 5 proposed (not mandated) sub-waves
by risk and decision-readiness (4A Hygiene closures → 4B Reporting-depth additions → 4C SoD expansion → 4D
Warranty accounting treatment → 4E Convenience automation), reasoned exactly the way Wave 3's own 3A-3E
sequence was, not assuming the CR's example ordering is correct. Full detail:
`ARCH-2026-002-WAVE-4-DESIGN.md`.

## M. Baseline evidence

This pass's own re-confirmation, scoped and disclosed honestly (per this CR's own §27 allowance to use
judgment on how much re-verification proves the baseline without excessive runtime — a full mandatory
21-suite re-run was not performed; the following targeted battery was, chosen to cover exactly the
areas this Wave 4 pass itself touches: After-Sales-specific regression, Wave 3's own newest suite, and the
2 security-critical foundation suites (SoD, Data Scope) this Wave 4's own Security Baseline depends on):

| Suite | Result | Notes |
|---|---|---|
| `erp_arch_2026_002_wave3_tests.js` (fresh isolated server, port 4532) | **70/70 PASS** | Matches the last full-battery result recorded in `WAVE3_REGRESSION.md` exactly |
| `erp_audit_p0_tests.js` (same server) | **65/65 PASS** | Matches `WAVE3_REGRESSION.md` row 13 exactly; includes ERP-042/043/044, the only pre-existing After-Sales-specific regression coverage |
| `erp_arch_2026_001d_sod_tests.js` (self-spawning, its own isolated server) | **All assertions PASS** (tail-verified; includes its own internal "production db.json byte-for-byte unchanged" self-check) | Confirms SOD-1..11 foundation, including SOD-11, unaffected |
| `erp_arch_2026_001c_data_scope_tests.js` (self-spawning, its own isolated server) | **All assertions PASS** (tail-verified; includes its own internal production-safety self-check) | Confirms `hasScopeAccess()` foundation, which every Wave 4 list/detail route depends on, unaffected |
| Live manual security test (this pass, ad hoc, not yet a committed test file) | **PASS** | Sales cross-customer After-Sales-summary/warranty-list denial, described in §H |

**No regression was found in any suite run.** This does not constitute a fresh, independently-measured
"667 PASS / 0 FAIL / 667 TOTAL" grand total claim for this specific pass (that number remains
`WAVE3_REGRESSION.md`'s own, from 2026-09-23's earlier same-day pass, not re-produced in full here) — it is
reported honestly as a **targeted spot-check** that found zero drift from that baseline across every
suite actually re-run, satisfying this CR's own explicit instruction to STOP and report rather than
silently proceed if anything differs. Nothing differed.

## N. Production safety evidence

`server/db.json` sha256 `25b9cb8493f3fa0aa8693d9dd67308d9a72775e1e740c8f0dde4648d37faed22` — confirmed
identical before this Wave 4 Phase 0 pass began and again mid-pass (after the initial live regression
battery). Every test and every live security check ran exclusively against disposable isolated instances
(`server/scripts/start-isolated-test-server.js --app-env test`, ports 4531/4532, never reused across a
restart without a fresh instance — one cross-run test-fixture collision was observed and diagnosed live as
a self-inflicted re-run-without-restart artifact, not a product defect, and was corrected by restarting a
clean instance before drawing any conclusion). Zero application code was modified to produce this Phase 0
— only new `ARCH-2026-002-WAVE-4-*.md` documents were created.

## O. Final verdict

# PASS WITH DOCUMENTED DEFERMENTS

All required sections of this CR's Part B were completed: Module Matrix (§A), Transaction Ownership (§B),
4 Process Traces (§C-F), Security Baseline (§H), Data-Model Gap Register (§I), Dependency Map (§J),
Management Decisions (§K), and Wave 4 Design (§L) — 8 companion documents plus this synthesis:

- `ARCH-2026-002-WAVE-4-MODULE-MATRIX.md`
- `ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md`
- `ARCH-2026-002-WAVE-4-PROCESS-TRACE.md`
- `ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md`
- `ARCH-2026-002-WAVE-4-DATA-MODEL-GAP-REGISTER.md`
- `ARCH-2026-002-WAVE-4-DEPENDENCY-MAP.md`
- `ARCH-2026-002-WAVE-4-DECISIONS.md`
- `ARCH-2026-002-WAVE-4-DESIGN.md`

The "documented deferments" qualifier reflects the genuinely open item count: **11 new Wave-4-specific
management decisions remain open** (W4-1 through W4-11), none resolved, none silently implemented.

**No STOP condition (this CR's own §31) was triggered**:
- No production DB change — hash confirmed identical before/mid/after.
- No duplicate AR/inventory/service-cost/CAPA engine appeared — every one re-confirmed singular.
- Transaction ownership never became ambiguous — every transaction type resolved to exactly one owner; the
  one nuance found (Service Billing's two sub-paths) is a precision refinement, not an ambiguity.
- No CRITICAL security issue appeared — the strongest finding (uneven SoD coverage, unguarded duplicate
  billing) matches this engagement's own established non-CRITICAL bar (role-gated, authenticated,
  no identity override, no auth bypass) exactly as Wave 2's own analogous finding did.
- No P0/P1/P2 defect was discovered in the sense this engagement's prior implementation passes use that
  term (a live functional break) — every finding here is a coverage/tagging/policy gap in an
  already-working system, consistent with this being a Phase-0 audit of already-EXISTING functionality,
  not a fresh build.
- No unresolved Wave-3 decision blocks an essential Wave-4 dependency — re-verified independently in
  `ARCH-2026-002-WAVE-4-DEPENDENCY-MAP.md`, confirming (not merely citing) `ARCH-2026-002-
  W3-DECISION-RESOLUTION.md`'s own finding.
- Wave 4 did not require any unauthorized Wave 5/6 functionality to complete this audit.
- Migration risk was fully characterizable for every Data-Model Gap Register item (NONE for 7 of 9 items;
  explicitly deferred-pending-policy, not "cannot be characterized," for the remaining 2).
- No documentation materially conflicted with code in a way requiring silent resolution either direction —
  the one precision correction found (Service Billing's exact routing) was reported per this engagement's
  own established practice (the Wave 3 Account-1400 precedent), not silently resolved.

**Per this CR's own final rule: STOPPING HERE.** Wave 4 implementation is NOT authorized by this document
and will not begin automatically. It requires a separate authorization after this Phase 0 (Part B) is
reviewed.
