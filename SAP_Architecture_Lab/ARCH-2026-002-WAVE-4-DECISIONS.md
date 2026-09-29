# ARCH-2026-002 — Wave 4 Management Decisions

**Date:** 2026-09-23. Wave 4 Phase 0 (Part B) deliverable, per this CR's own §25. No decision is made on
management's behalf. Format follows `ARCH-2026-002-WAVE-3-DECISIONS.md`.

## A. Existing decisions reviewed — none block Wave 4 directly

All 8 items in `ARCH-2026-002-OPEN-DECISIONS.md` and all 9 W3 items in
`ARCH-2026-002-WAVE-3-DECISIONS.md` were re-checked this pass. Per
`ARCH-2026-002-W3-DECISION-RESOLUTION.md`'s own finding (re-confirmed independently here, not merely
cited) and `ARCH-2026-002-WAVE-4-DEPENDENCY-MAP.md` above: none is a hard blocker to Wave 4. One
non-blocking relationship is worth restating: if W3-7 (Cost Allocation) is later authorized, "Service
profitability" reporting could be deepened with allocated overhead — not required for it to exist today.

## B. New decisions surfaced by this Wave 4 Phase 0

### W4-1. Warranty duration/coverage/exclusion policy

- **Question**: what is Appletree's actual standard warranty duration (by product/project type), standard
  coverage/exclusion language, and does it want a template/master-list mechanism instead of fully
  free-text per-record entry?
- **Current behavior**: `createWarranty()` explicitly REFUSES to create a warranty without an operator-
  supplied `durationMonths` — no default exists anywhere (`domain.js:7334`). `coverage`/`exclusions`/`terms`
  are free text, never validated against a master list.
- **Options**: (a) leave as-is (full manual entry, maximum flexibility, zero standardization); (b) add an
  optional warranty-template master Appletree could pre-fill from, without removing manual override; (c)
  define company-standard duration-by-product-type as configuration (mirroring the POL-06/POL-07/POL-08
  pattern already used elsewhere in this exact block).
- **No recommendation given** — a genuine product/commercial-policy question, not a technical one.

### W4-2. Chargeable-vs-Warranty-vs-Courtesy-vs-AMC classification rules

- **Question**: should there be a documented, consistent business rule for WHEN a ticket is classified
  Chargeable vs. Warranty vs. Courtesy vs. RequiresInvestigation, beyond "a supervisory-tier human decides"?
- **Current behavior**: `setTicketClassification()`/`recordDiagnosis()`'s `warrantyDecision`/
  `chargeableDecision` are both 100% human-judgment fields with zero automated eligibility linkage — even
  though `warrantyEligibility()` exists as a dedicated adjudication function, nothing in the ticket/visit
  code path actually CALLS it automatically; it is a separate, manually-invoked check.
- **Options**: (a) leave fully manual (current state); (b) wire `warrantyEligibility()`'s result into
  `recordDiagnosis()`/`setTicketClassification()` as an advisory (not binding) input; (c) make it binding
  (a warranty-ineligible claim cannot be classified Warranty) — the most invasive option, a genuine
  workflow change.
- **No recommendation given** — a business-process question about how much automation Appletree trusts
  here, not a technical one.

### W4-3. AMC renewal/scheduling automation policy

- **Question**: should AMC Schedule entries auto-generate at the contract's own `serviceFrequencyMonths`
  cadence (Gap Register item 5), and should renewal itself ever be proposed/reminded automatically (e.g.
  N days before `endDate`)?
- **Current behavior**: both are 100% manual today — `renewAMCContract()` must be explicitly called;
  `createAMCScheduleEntry()` must be explicitly called once per visit.
- **No recommendation given** — an operational-convenience question, not a technical blocker (the
  underlying capability already works correctly without automation).

### W4-4. SLA — Resolution clock and Warning threshold

- **Question**: should a third SLA clock (Resolution — ticket CLOSED by X hours from creation) be defined,
  and should a Warning threshold (percentage/hours before breach) be configured?
- **Current behavior**: `ticketSlaStatus()` explicitly returns `resolution: {configured:false, status:
  'RESOLUTION SLA — NOT CONFIGURED'}` (`:7966`) rather than fabricating one; `slaWarningThresholdHours`
  defaults to `null` and WARNING status is only ever emitted once a value is configured (`:7948-7951`) —
  both are deliberate, disclosed non-inventions, matching the codebase's own explicit POL-08 comment
  ("Resolution explicitly NOT approved yet and must never be fabricated").
- **No recommendation given** — Response (4h) and Site Visit (72h) are already approved and enforced;
  Resolution/Warning are the two genuinely still-open pieces of the same policy.

### W4-5. Service Labour rate-card enforcement

- **Question**: should `postServiceLabourCost()` be required to derive its amount from
  `DB.serviceLabourRates` (POL-06) rather than accepting a caller-supplied `rate`/`amount`, and if so,
  should the rate card become mandatory (block posting if no rate is configured for the technician's
  level/skill/location) or advisory (pre-fill, allow override)?
- **Current behavior**: the rate card exists, is admin-configurable, and is entirely disconnected from the
  posting function today (Gap Register item 3).
- **Options**: (a) leave disconnected (current state, maximum flexibility, zero consistency enforcement);
  (b) advisory pre-fill; (c) mandatory enforcement.
- **No recommendation given** — a genuine controls-strictness policy choice.

### W4-6. Warranty material accounting treatment (provision vs. expense-at-issue)

- **Question**: should warranty material cost be recognized as a provision/reserve at
  contract/handover time (requiring a new GL account and a real accounting-policy decision on
  provisioning methodology) rather than the current, confirmed expense-at-actual-issue treatment?
- **Current behavior**: warranty material issue posts to account 5000, identically to ordinary project
  material issue, at the moment of actual issue — no provisioning mechanism exists (Security Baseline §1).
- **Accounting impact**: a real, non-trivial accounting-policy decision, explicitly not invented here — the
  SAME discipline this engagement applied to Wave 3's W3-5 Petty Cash GL account question.
- **No recommendation given.**

### W4-7. Duplicate-billing guard for Service Invoice / AMC Billing

- **Question**: should a uniqueness/idempotency guard be added preventing a second Service Invoice draft
  per ticket or a second AMC Billing draft per contract-period (Gap Register item 4)?
- **Current behavior**: neither is guarded; only manual operator discipline prevents double-billing (the
  Draft maker-checker-poster chain would still require a SEPARATE human to approve/post a duplicate, a
  partial mitigation, not a structural prevention).
- **Accounting/security impact**: LOW-risk to add (a pure guard clause, reuses existing patterns — e.g.
  `recognizeAMCRevenue()`'s own `recognizedPeriods` array precedent); MEDIUM-risk if left unaddressed
  indefinitely at higher transaction volume.
- **No recommendation given**, though this item, like W3-9 in the prior wave, carries relatively low
  business-policy content (the "should duplicates be prevented" answer is close to self-evidently yes;
  the open question is really priority/sequencing, not whether).

### W4-8. Complaint/Ticket/AMC SoD-rule expansion

- **Question**: should new formal `checkSoD()` rules (mirroring SOD-7 through SOD-11) be added for
  Complaint creator≠closer, Ticket creator≠closer, and AMC creator≠biller — currently role-tier-gated
  only, not identity-checked (Security Baseline §5)?
- **Current behavior**: an Admin/CEO/FinanceManager who creates a Complaint/Ticket/AMC can also close/bill
  it themselves; no identity separation.
- **Options**: (a) add the rules, no exemption (SOD-7..11 precedent); (b) add with a CEO/Admin exemption
  (older inline-check precedent, already used for Warranty void/cancel and AMC activate/cancel roles); (c)
  defer, treating this as an accepted small-scale-service-team risk (the same class of judgment this
  engagement already accepted for the CEO/Admin combined-role reality generally).
- **No recommendation given.**

### W4-9. Below-threshold Service Visit diagnosis — identity control

- **Question**: is the ₹10,000/disputed POL-07 threshold intended to be the SOLE identity control on
  diagnosis (i.e. below-threshold self-diagnosis-and-completion by the same technician is accepted,
  intentional design), or should ANY identity separation apply regardless of amount?
- **Current behavior**: below threshold and not disputed, the same technician can diagnose AND complete a
  visit with zero independent check.
- **No recommendation given** — a genuine risk-appetite question already implicitly answered by the
  existence of the ₹10,000 threshold itself (someone already decided SOME cases don't need independent
  review); this item asks whether that line is still correctly drawn, not whether a line should exist.

### W4-10. CAPA source-ID validation and "Site issue" origin

- **Question**: should `createCAPACase()` gain existence checks on `sourceComplaintId`/`sourceTicketId`
  (Gap Register item 6, a straightforward hygiene fix, same class as the already-fixed ERP-042/043/044),
  and should a distinct "Site issue" CAPA origin be added as a new field (Security Baseline §4, a genuine
  new-scope question)?
- **No recommendation given** — the existence-check half carries no business-policy content (low-stakes,
  like W3-9/W2-2); the "Site issue" origin half is a genuine scope question.

### W4-11. Technician cost tracking and Cost Centre tagging for Service Labour

- **Question**: should `technicianId` be persisted (Gap Register item 1) and should Service Labour gain a
  Cost Centre tag (Gap Register item 2, e.g. a new `CC-SERVICE` mirroring `CC-FACTORY`/`CC-INSTALLATION`)?
- **Current behavior**: neither happens today; both are purely additive tagging changes with no accounting
  or workflow-behavior change.
- **No recommendation given**, though — like W3-9 — this carries essentially no business-policy content
  and is more a scheduling/priority choice than a genuine open question, contingent only on whether a
  `CC-SERVICE` cost centre master record should be created (a one-line addition) or an existing one reused.

## C. Summary table

| ID | Item | Status | Blocks | New this Phase 0? |
|---|---|---|---|---|
| W4-1 | Warranty duration/coverage/exclusion policy | OPEN | Warranty-template design (if any) | Yes |
| W4-2 | Chargeable/Warranty/Courtesy/AMC classification rules | OPEN | Diagnosis-automation design (if any) | Yes |
| W4-3 | AMC renewal/scheduling automation policy | OPEN | Auto-schedule-generation design (if any) | Yes |
| W4-4 | Resolution SLA + Warning threshold | OPEN (pre-existing, disclosed by code itself) | Resolution-SLA feature | Re-confirmed |
| W4-5 | Service Labour rate-card enforcement | OPEN | Rate-card-to-posting linkage design | Yes |
| W4-6 | Warranty material accounting treatment | OPEN | Any provision/reserve accounting change | Yes |
| W4-7 | Duplicate-billing guard | OPEN (low policy content) | Guard-clause implementation | Yes |
| W4-8 | Complaint/Ticket/AMC SoD-rule expansion | OPEN | New SoD-rule implementation | Yes |
| W4-9 | Below-threshold diagnosis identity control | OPEN | Whether POL-07's threshold design changes | Yes |
| W4-10 | CAPA source-ID validation / Site-issue origin | OPEN (validation half low policy content) | Hygiene fix + any new-origin scope | Yes |
| W4-11 | Technician tracking + Service Cost Centre tag | OPEN (low policy content) | Reporting-depth features | Yes |

No implementation proceeds on any item until its corresponding decision is made and recorded as an update
to this document, consistent with every prior Phase 0 pass in this engagement.

## D. Addendum (2026-09-26) — W4-12, surfaced by the Management Decision + Scope Gate's own GAP 7 review

The follow-up "Wave 4 Management Decision + Implementation Scope Gate" CR's own §9 GAP 7 instruction
("Do NOT rely on this prompt to enumerate all gaps... Ensure no Phase 0 finding is accidentally omitted")
caught a real omission in this document: **Data-Model Gap Register item 8 (Site/Branch scope dimension for
Service Visit)** was registered as a gap but never given its own W4-decision entry above. It is recorded
here as **W4-12**, preserving this document's original 11 items unchanged. Full management-ready record:
`ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`.

| ID | Item | Status | Blocks | New this pass? |
|---|---|---|---|---|
| W4-12 | Site/Branch scope dimension for Service Visit | OPEN | Multi-branch service-territory reporting/scoping (not an access-control gap — Project/Customer scope already govern access) | Yes (previously an unlinked Data-Model Gap Register item) |

## E. Addendum (2026-09-26) — Management Decision Collection + Scope Authorization Gate

A follow-up CR attempted to collect actual management answers for all 12 items above via a formal
questionnaire. **Zero answers were supplied anywhere in this engagement to date** — all 12 items remain
exactly as classified in §C/§D above (OPEN). The questionnaire itself, plus the per-item implementation
classification (2 of 12 numbered decisions contain an IMPLEMENT-recommended sub-part with zero policy
content; the remainder are wholly POLICY DEPENDENT), lives in
`ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`'s 2026-09-26 update section — this document's own
content is unmodified and remains the authoritative narrative source for each item's background.
