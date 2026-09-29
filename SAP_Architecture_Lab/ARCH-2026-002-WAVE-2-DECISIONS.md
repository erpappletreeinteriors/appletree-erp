# ARCH-2026-002 — Wave 2 Management Decisions

**Date:** 2026-09-22. Wave 2 Phase 0 deliverable, §19. Reviews `ARCH-2026-002-OPEN-DECISIONS.md` in
full and separates items affecting Wave 2 from items that do not. No decision is made on management's
behalf anywhere in this document.

## A. Decisions from the existing register that AFFECT Wave 2

### A1 (= original item 6). Bank Reconciliation duplicate — CLOSED, not reopened
Resolved in Wave 1 (consolidated to one engine). Recorded here only for continuity — no action needed.

### A2 (= original item 7). Plan-to-Produce Demand-trigger / Job-Card-decoupling scope — STILL OPEN, now Wave 2's own decision to make

- **Decision ID**: W2-1
- **Question**: should Wave 2 implement a minimal Demand→Production-Order linkage (using the existing
  `DB.materialRequirements` as the trigger, per `ARCH-2026-002-WAVE-2-DESIGN.md`'s minimum-viable
  design), or defer entirely to a later wave (Wave 6, Advanced Planning/MRP)?
- **Current system behavior**: Production Orders are created purely manually; `materialReplenishmentReport()`
  exists but is read-only and disconnected.
- **Options**: (a) build the thin Demand-linkage described in the Data-Model Gap Register; (b) defer
  entirely, leave Plan-to-Produce PARTIAL as today; (c) defer the linkage but separately decide whether
  Job Card completion should gate Production Order completion (an independent sub-question).
- **Architectural impact**: LOW if (a) — additive, no existing writer touched.
- **Security impact**: none directly.
- **Accounting impact**: none directly (the linkage itself creates no financial transaction).
- **Implementation impact**: (a) is a small, scoped addition; (b) is zero work; (c) is an independent,
  separately-sizable question about Job Card/Order coupling semantics.
- **No recommendation given.**

### A3 (= original item 8, Finding 2). QC checklist audit-log gap — STILL OPEN, now squarely Wave 2's own domain

- **Decision ID**: W2-2
- **Question**: should Wave 2 add the missing `logAudit()` call to `createQCChecklist()` (a 1-line,
  no-business-policy fix) as part of its implementation scope?
- **Current system behavior**: checklist creation is unaudited; only `submitQCResult()` is.
- **Options**: fix now as part of Wave 2; defer further.
- **Architectural/security/accounting impact**: none — pure audit-completeness fix, no policy content.
- **Implementation impact**: trivial.
- **No recommendation given** — though this carries no business-policy content (unlike most items in
  this register), so it is a low-stakes scheduling choice, not a genuine open question.

## B. Decisions carried forward that DO NOT affect Wave 2

- CEO/Admin technical split (original item 1) — affects only the final RBAC step, unrelated to
  Operations domains.
- Integration & Platform scope (original item 2) — domain #19, not in Wave 1-6's Operations grouping.
- Payroll statutory configuration (original item 3) — domain #21, HR/Payroll wave (Wave 5), unrelated.
- Wave 1 RBAC/ID-numbering cleanup (original item 4) — Sales & CRM, a Wave 1 domain, already dispositioned
  (deferred) in Wave 1's own closure.
- BOM pre-Won sequencing (original item 5) — Estimation & Costing, a Wave 1 domain, already dispositioned
  (deferred) in Wave 1's own closure.

## C. New decisions surfaced by this Wave 2 Phase 0 audit

### W2-3. Warehouse as a data-scope dimension

- **Question**: does Wave 2's actual design require Warehouse-level access restriction (e.g., a
  warehouse-specific role that should not see or act on another warehouse's stock), or is the existing
  Project/Site/Branch scope sufficient for Wave 2's real Appletree use case?
- **Current system behavior**: `hasScopeAccess()` has no Warehouse case; all warehouse-scoped operations
  are currently gated by role only (e.g., Purchase/Admin/CEO/FinanceManager), not by which specific
  warehouse.
- **Options**: (a) confirm Warehouse scope is NOT needed (Appletree's actual warehouse count/structure
  may not warrant it) — no data-model change; (b) authorize adding it as a new scope dimension (Data
  Model Gap Register entry) for a future implementation pass.
- **Architectural impact**: (b) extends, not replaces, the existing scope engine — LOW-MEDIUM, must be
  regression-proven against every existing scope check.
- **Security impact**: (a) leaves today's role-only warehouse gating unchanged (not a regression, since
  it was never claimed to be warehouse-scoped); (b) closes a real gap if Appletree operates multiple
  physically/organizationally separate warehouses that need mutual isolation.
- **Accounting impact**: none directly.
- **Implementation impact**: (b) is a genuinely new capability, not a bug fix — sized in the Data Model
  Gap Register.
- **No recommendation given** — this is explicitly a question about Appletree's real operational
  structure, which this audit cannot answer for them (per this CR's own §8 instruction: "First determine
  whether the Wave 2 design requires it... If required but unsupported: record it as a DATA-MODEL /
  GOVERNANCE GAP. Do not invent it.").

### W2-4. SoD coverage for the 3 high-risk operational chains

- **Question**: should Wave 2 add new SoD rules (mirroring the existing `checkSoD()` pattern and
  SOD-5/SOD-6 precedent) for (a) Manufacturing's plan-vs-execute chain, (b) Job Work's dispatch-vs-
  settlement chain, (c) Quality's QC-self-attestation gap — and if so, should any carry a CEO/Admin
  exemption (matching most existing rules) or none (matching the deliberately-unexempted excess-issue
  approval rule)?
- **Current system behavior**: see `ARCH-2026-002-WAVE-2-SECURITY-BASELINE.md` §0-1 in full — all 3
  chains currently allow a single authenticated, role-gated user to complete the entire chain alone.
- **Options**: (a) add new SoD rules for all 3 chains; (b) add for a subset (e.g., only Manufacturing,
  the highest-financial-impact chain); (c) defer all 3, accept the current risk as a disclosed,
  small-company operational reality (similar to how CEO/Admin's own combined role is an accepted,
  disclosed SoD gap at the top of the org).
- **Architectural impact**: LOW per rule — each would reuse the existing `checkSoD()` engine exactly as
  SOD-5/SOD-6 did, no new mechanism.
- **Security impact**: closes 3 real, currently-exploitable-by-an-insider gaps if implemented; each is a
  genuine risk-acceptance question if not.
- **Accounting impact**: none directly (SoD rules don't change what gets posted, only who may post it).
- **Implementation impact**: each rule is a small, scoped addition (1 guard clause per function, mirroring
  the SOD-5/SOD-6 pattern) — NOT a redesign.
- **No recommendation given** — per this CR's own explicit instruction not to invent SoD rules; this is
  presented as 3 separable decisions for whoever authorizes Wave 2's implementation scope.

### W2-5. Production Output → Finished-Goods inventory/accounting

- **Question**: should Wave 2 close the gap where Production Output/Scrap have zero inventory effect
  (no Finished-Goods stock is ever actually created), and if so, what GL account should receive the FG
  value (a new dedicated account, or reuse of an existing one)?
- **Current system behavior**: `completeProductionOrder` records `actualQty`/`rejectedQty` as status
  fields only — no `postInventoryMovement()` call, deliberately, per the code's own prior-phase comment.
- **Options**: (a) build a real FG receipt (Data Model Gap Register entry) with a genuine accounting
  policy decision on the GL account; (b) leave as-is, Production Output remains operational-tracking-only.
- **Architectural impact**: (a) is additive to the single inventory engine, not a new writer.
- **Security impact**: none directly.
- **Accounting impact**: (a) requires a real, new accounting-policy decision (which GL account values
  Finished Goods) — this is exactly the kind of business-policy question this engagement never invents.
- **Implementation impact**: (a) is a real, non-trivial addition (valuation method for FG, interaction
  with `productCosting()`'s existing standard-cost figure); (b) is zero work.
- **No recommendation given.**

### W2-6. Gate Pass / Transporter-Vehicle master

- **Question**: does Wave 2's actual scope require a structured Gate Pass workflow and/or a
  Transporter/Vehicle master (replacing today's free-text fields), or is the current free-text approach
  sufficient for Appletree's real logistics control needs?
- **Current system behavior**: confirmed absent (Gate Pass) / free-text-only (Transporter/Vehicle).
- **Options**: (a) build both (Data Model Gap Register entries); (b) build neither, confirmed sufficient
  as-is; (c) build one but not the other.
- **Architectural/security/accounting impact**: minimal either way — both are additive, non-financial,
  physical-control layers.
- **Implementation impact**: each is a small, scoped, low-risk addition if authorized.
- **No recommendation given** — a real operational-control question about Appletree's actual gate/
  logistics discipline, not a technical one.

### W2-7. Inspection / NCR as a distinct entity

- **Question**: does Wave 2 need a formal NCR/Inspection entity distinct from the QC Checklist, or does
  the existing QC Checklist adequately serve Appletree's real quality-management needs?
- **Current system behavior**: confirmed absent — QC Checklist is the only quality-record type.
- **Options**: (a) build NCR as a genuinely new entity (Data Model Gap Register entry); (b) confirm QC
  Checklist is sufficient, no new entity needed.
- **No recommendation given.**

## D. Summary table

| ID | Item | Affects Wave 2? | Status | Blocks |
|---|---|---|---|---|
| A1 | Bank Reconciliation duplicate | N/A | CLOSED (Wave 1) | Nothing |
| W2-1 | Plan-to-Produce Demand trigger | YES | OPEN | Whether Wave 2 (or a later wave) builds the minimal linkage |
| W2-2 | QC checklist audit-log gap | YES | OPEN | Trivial fix, scheduling only |
| W2-3 | Warehouse scope dimension | YES | OPEN | Whether the Data-Model Gap Register's Warehouse-scope entry is authorized |
| W2-4 | SoD coverage for 3 operational chains | YES | OPEN | Whether new SoD rules are added for Manufacturing/Job Work/Quality |
| W2-5 | Production Output → FG inventory/accounting | YES | OPEN | Whether the FG-receipt gap is closed, and its accounting policy |
| W2-6 | Gate Pass / Transporter-Vehicle master | YES | OPEN | Whether either is built |
| W2-7 | Inspection / NCR distinct entity | YES | OPEN | Whether a new quality entity is built |
| — | CEO/Admin split, Integration & Platform, Payroll, Wave-1 RBAC/BOM items | NO | Unchanged | Not Wave 2's concern |

No implementation proceeds on any Wave-2-affecting item until its corresponding decision is made.
