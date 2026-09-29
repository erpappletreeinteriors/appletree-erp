# ARCH-2026-002 — W4 Management Decision Register

**Date:** 2026-09-26. Deliverable of "ARCH-2026-002 Wave 4 Management Decision + Implementation Scope
Gate," per its own §5-§7. This document does **not** decide any item on management's behalf. Every
"MANAGEMENT DECISION" field below is left `[OPEN — management input required]` because no management
input on any W4 item has been supplied anywhere in this engagement to date. Options presented are only
those actually named in `ARCH-2026-002-WAVE-4-DECISIONS.md` and its companion Phase 0 documents — none
invented here.

**Note on scope:** `ARCH-2026-002-WAVE-4-DECISIONS.md` records 11 items (W4-1 through W4-11). While
producing this register, one genuine gap-register finding — Data-Model Gap Register item 8 (Site/Branch
scope dimension for Service Visit) — was found to have **no corresponding W4-decision entry**, an
omission this CR's own §9 GAP 7 instruction ("ensure no Phase 0 finding is accidentally omitted") requires
surfacing. It is recorded below as **W4-12**, newly added to `ARCH-2026-002-WAVE-4-DECISIONS.md` as an
addendum (history preserved, not overwritten — see that file's own new §D).

---

## W4-1 — Warranty duration/coverage/exclusion policy

**Decision ID:** W4-1
**Decision title:** Warranty duration/coverage/exclusion policy standardization
**Current system behavior:** `createWarranty()` (`domain.js:7331`) explicitly REFUSES to create a
warranty without an operator-supplied `durationMonths` — no default exists anywhere. `coverage`/
`exclusions`/`terms` are free text, never validated against a master list.
**Why the decision exists:** Appletree has never supplied a standard warranty duration-by-product-type,
standard coverage/exclusion language, or indicated whether free-text entry is sufficient long-term.
**Affected module:** Service & After-Sales (Warranty).
**Affected transaction:** Warranty creation.
**Affected roles:** FinanceManager (creation-gated), Admin, CEO.
**Operational impact:** Full manual entry today gives maximum flexibility but zero standardization; a
template mechanism would reduce data-entry variance.
**Accounting impact:** None under any option.
**Inventory impact:** None directly (Warranty itself carries no inventory effect; only downstream Service
Material issue does).
**Project-cost impact:** None directly.
**Security impact:** None.
**SoD impact:** None.
**Reporting impact:** A template/config mechanism would allow reporting on "standard vs. non-standard"
warranty terms; free text does not support this today.
**Data-model impact:** None for Option A; a new warranty-template master for Option B; new
duration-by-product-type configuration for Option C.
**Migration impact:** None for Option A; Options B/C would not need to retrofit existing warranty
records (their free-text fields remain valid either way).
**Development impact:** None for Option A; Options B/C require their own design pass.

**Option A:** Leave as-is (full manual entry, maximum flexibility, zero standardization).
**Option B:** Add an optional warranty-template master Appletree could pre-fill from, without removing
manual override.
**Option C:** Define company-standard duration-by-product-type as configuration (mirroring the existing
POL-06/07/08 pattern already used elsewhere in this same code block).

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-2 — Chargeable-vs-Warranty-vs-Courtesy-vs-AMC classification automation

**Decision ID:** W4-2
**Decision title:** Ticket classification automation policy
**Current system behavior:** `setTicketClassification()`/`recordDiagnosis()`'s `warrantyDecision`/
`chargeableDecision` fields are 100% human-judgment with zero automated eligibility linkage. Although
`warrantyEligibility()` (`domain.js:7376`) exists as a dedicated, server-authoritative adjudication
function, nothing in the ticket/visit code path calls it automatically — it is a separate, manually
invoked check.
**Why the decision exists:** it is unclear how much automation Appletree trusts in this specific
determination, which has direct billing consequences.
**Affected module:** Service & After-Sales (Complaint/Ticket/Visit).
**Affected transaction:** Ticket classification, Visit diagnosis.
**Affected roles:** Supervisory-tier staff who classify tickets and record diagnoses (AS_SUPERVISE_ROLES).
**Operational impact:** Automation would speed classification but removes a human check on a
billing-consequential decision if made binding.
**Accounting impact:** Indirect — misclassification currently could result in an unbilled chargeable
service or an incorrectly billed warranty service; automation could reduce this risk if wired in.
**Inventory impact:** None directly.
**Project-cost impact:** Indirect — classification determines whether cost is billed or absorbed.
**Security impact:** None.
**SoD impact:** None.
**Reporting impact:** None directly.
**Data-model impact:** None for Option A; none for Option B (advisory display only); a new binding-check
gate for Option C.
**Migration impact:** None under any option.
**Development impact:** None for Option A; a small advisory-display addition for Option B; a genuine
workflow change for Option C.

**Option A:** Leave fully manual (current state).
**Option B:** Wire `warrantyEligibility()`'s result into `recordDiagnosis()`/`setTicketClassification()`
as an advisory (not binding) input.
**Option C:** Make it binding (a warranty-ineligible claim cannot be classified Warranty) — the most
invasive option, a genuine workflow change.

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-3 — AMC renewal/scheduling automation policy

**Decision ID:** W4-3
**Decision title:** AMC Schedule auto-generation and renewal-reminder automation
**Current system behavior:** Both are 100% manual today — `renewAMCContract()` must be explicitly called;
`createAMCScheduleEntry()` (`domain.js:7673`) must be explicitly called once per visit. No auto-generation
exists at the contract's `serviceFrequencyMonths` cadence, and no reminder mechanism exists before
`endDate`.
**Why the decision exists:** an operational-convenience question — the underlying capability already
works correctly without automation; whether it's worth automating is Appletree's call.
**Affected module:** Service & After-Sales (AMC, AMC Schedule).
**Affected transaction:** AMC Schedule entry creation, AMC renewal.
**Affected roles:** Staff who currently manually create schedule entries and track renewals (AMC-capable
roles).
**Operational impact:** Manual today (works, but requires diligence); automation would reduce missed
visits/renewals.
**Accounting impact:** None.
**Inventory impact:** None.
**Project-cost impact:** None directly.
**Security impact:** None.
**SoD impact:** None.
**Reporting impact:** None directly (would not change AMC Billing, which remains separately gated).
**Data-model impact:** None — would reuse the existing `createAMCScheduleEntry()` in a loop, not a new
mechanism (per `ARCH-2026-002-WAVE-4-DATA-MODEL-GAP-REGISTER.md` item 5).
**Migration impact:** None for new contracts; existing ACTIVE contracts with no schedule entries could
optionally be backfilled — itself a genuine operational decision, not assumed here.
**Development impact:** Small if authorized (a scheduling loop over an existing function, no new engine).

**Option A:** Leave fully manual (current state).
**Option B:** Auto-generate AMC Schedule entries at contract cadence only (no renewal reminder).
**Option C:** Auto-generate schedule entries AND add a renewal reminder (e.g. N days before `endDate`).

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-4 — Resolution SLA clock and Warning threshold

**Decision ID:** W4-4
**Decision title:** Complete the 3rd SLA clock (Resolution) and configure a Warning threshold
**Current system behavior:** `ticketSlaStatus()` (`domain.js:~7966`) explicitly returns
`resolution: {configured:false, status:'RESOLUTION SLA — NOT CONFIGURED'}` rather than fabricating one;
`slaWarningThresholdHours` defaults to `null` and WARNING status is only ever emitted once a value is
configured. Response (4h) and Site Visit (72h) SLAs are already approved and enforced (POL-08); Resolution
is explicitly, deliberately not — the code's own comment states "Resolution explicitly NOT approved yet
and must never be fabricated."
**Why the decision exists:** the same POL-08 policy-approval process that set Response/Site-Visit SLAs has
never set a Resolution SLA or Warning threshold value.
**Affected module:** Service & After-Sales (Service Ticket).
**Affected transaction:** Ticket SLA monitoring/reporting.
**Affected roles:** All roles viewing ticket SLA status.
**Operational impact:** Leaving unconfigured means Ticket Aging reports cannot show a Resolution-breach
indicator; configuring it would close that reporting gap.
**Accounting impact:** None.
**Inventory impact:** None.
**Project-cost impact:** None.
**Security impact:** None.
**SoD impact:** None.
**Reporting impact:** Direct — Resolution SLA breach/warning would become reportable once configured.
**Data-model impact:** None — the field/mechanism already exists, only the VALUE is missing (same as
`DB.cashLimits.approvedByFinance:false` pattern in Wave 3's W3-6).
**Migration impact:** None.
**Development impact:** None — a configuration value, not a code change, once supplied.

**Option A:** Leave Resolution SLA unconfigured indefinitely (current state).
**Option B:** Configure a Resolution SLA hour value (management to supply the number) with no Warning
threshold.
**Option C:** Configure both a Resolution SLA hour value and a Warning threshold percentage/hours.

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-5 — Service Labour rate-card enforcement mode

**Decision ID:** W4-5
**Decision title:** Whether `postServiceLabourCost()` must derive its amount from the rate card
**Current system behavior:** `DB.serviceLabourRates` (POL-06) exists, is admin-configurable (keyed by
`technicianLevel|skill|location`, with `normalHourRate`/`overtimeRate`/`emergencyRate`/
`weekendHolidayRate`/`travelRate`), and is entirely disconnected from the posting function —
`postServiceLabourCost()` (`domain.js:7565`) accepts a caller-supplied `rate`/`hours` or flat `amount`
directly; it never looks up the rate card.
**Why the decision exists:** a genuine controls-strictness policy choice — how much consistency Appletree
wants enforced on posted labour amounts.
**Affected module:** Service & After-Sales (Service Labour).
**Affected transaction:** Service Labour cost posting.
**Affected roles:** Whoever holds `assertCanPostServiceLabourCost()` authorization.
**Operational impact:** Mandatory enforcement could block posting if a rate isn't configured for a given
technician level/skill/location combination — a real operational friction risk if the rate card isn't
fully populated.
**Accounting impact:** Same accounts (5100/1000) under every option — only the AMOUNT's derivation
changes.
**Inventory impact:** None.
**Project-cost impact:** Direct — inconsistent manual rates today mean labour cost consistency across
technicians/visits is not currently enforced; a rate-card link would close that.
**Security impact:** None.
**SoD impact:** None.
**Reporting impact:** More consistent labour-cost reporting if wired in.
**Data-model impact:** None new — `DB.serviceLabourRates` already exists (Data-Model Gap Register item 3).
**Migration impact:** None — purely additive; existing caller-supplied-amount behavior could remain as a
fallback/override path under Option B.
**Development impact:** None for Option A; a lookup addition (not a new function) for Options B/C.

**Option A:** Leave disconnected (current state, maximum flexibility, zero consistency enforcement).
**Option B:** Advisory — pre-fill from the rate card, allow manual override.
**Option C:** Mandatory — block posting if no rate is configured for the technician's level/skill/
location.

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-6 — Warranty material accounting treatment

**Decision ID:** W4-6
**Decision title:** Provision/reserve vs. expense-at-issue accounting for warranty material
**Current system behavior:** Warranty material issue posts to account 5000 (Material Expense/
Consumption) — the SAME account every non-warranty project material issue uses. It is company-cost,
expensed at the moment of actual issue. No "Warranty Reserve"/"Warranty Provision" account or GL treatment
exists anywhere in the codebase (`ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md` §1).
**Why the decision exists:** a real, non-trivial accounting-policy decision — WHEN warranty cost is
recognized, not just how it's tagged — explicitly not invented by any prior pass in this engagement,
matching the discipline already applied to Wave 3's W3-5 (Petty Cash GL account).
**Affected module:** Central Accounting, Service & After-Sales (Warranty).
**Affected transaction:** Warranty material issue.
**Affected roles:** FinanceManager, Accountant (accounting-policy owners).
**Operational impact:** None directly — the operational issue mechanism is unchanged either way.
**Accounting impact:** SIGNIFICANT if Option B is chosen — a genuine timing-of-recognition change (expense
at contract/handover time vs. at actual issue time), requiring a new GL account and a real provisioning
methodology decision.
**Inventory impact:** None — inventory consumption accounting is identical under either option.
**Project-cost impact:** Would change WHEN warranty cost hits project P&L if Option B is chosen.
**Security impact:** None.
**SoD impact:** None.
**Reporting impact:** A provision/reserve treatment (Option B) would show warranty liability on the
balance sheet ahead of actual claims — a materially different financial statement presentation.
**Data-model impact:** A new GL account under Option B; none under Option A.
**Migration impact:** SIGNIFICANT if Option B is chosen — would require its own dedicated design pass
(explicitly not detailed further here, matching how Wave 3 left W3-5/W3-7 for their own passes).
**Development impact:** None for Option A; a full new accounting-policy design pass for Option B.

**Option A:** Leave as expense-at-actual-issue (current, confirmed behavior).
**Option B:** Recognize warranty material cost as a provision/reserve at contract/handover time (requires
a new GL account and a dedicated accounting-policy design pass).

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-7 — Duplicate-billing guard rule (Service Invoice / AMC Billing)

**Decision ID:** W4-7
**Decision title:** Which duplicate-billing prevention rule to apply
**Current system behavior:** Neither `draftServiceInvoice()` nor `draftAMCBillingInvoice()` is guarded;
only manual operator discipline (plus the separate Draft maker-checker-poster chain, a partial mitigation)
prevents double-billing. `serviceTicketClosureReadiness()` only checks that AT LEAST ONE invoice draft
exists, never that exactly one does (`ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md` §3).
**Why the decision exists:** while "should duplicates be prevented at all" is close to self-evident, the
EXACT rule/granularity is a real choice this CR's own text requires be picked only from source-document
options, not invented.
**Affected module:** Service & After-Sales (Service Billing), Central Accounting (AR).
**Affected transaction:** Service Invoice draft, AMC Billing Invoice draft.
**Affected roles:** Whoever drafts Service/AMC billing invoices.
**Operational impact:** A guard could block a legitimate re-bill scenario (e.g. correcting a cancelled
draft) unless an explicit override/re-bill-with-authorization path is also included.
**Accounting impact:** Would prevent a real (not yet observed) double-AR-posting risk from operator error.
**Inventory impact:** None.
**Project-cost impact:** None directly.
**Security impact:** Low — closes a preventive-control gap, not an active exploit.
**SoD impact:** None.
**Reporting impact:** None directly.
**Data-model impact:** A uniqueness constraint (one OPEN/Posted draft per `serviceTicketId`) or a
period-key on AMC billing drafts (mirroring `recognizeAMCRevenue()`'s own existing `recognizedPeriods`
array pattern) — per `ARCH-2026-002-WAVE-4-DATA-MODEL-GAP-REGISTER.md` item 4.
**Migration impact:** None — a new guard clause on future calls; would not retroactively affect existing
posted data.
**Development impact:** Low if authorized — reuses an existing precedent (`recognizedPeriods`).

**Option A:** One bill per service completion (ticket-level uniqueness).
**Option B:** One bill per visit.
**Option C:** Explicit rebilling permitted with authorization (a guard that can be overridden by a named
role, rather than an absolute block).

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-8 — Complaint/Ticket/AMC SoD-rule expansion

**Decision ID:** W4-8
**Decision title:** Whether to add new formal `checkSoD()` rules for Complaint/Ticket/AMC creator≠closer/
biller
**Current system behavior:** Complaint (`changeComplaintStatus()`), Ticket (`closeServiceTicket()`/
`setTicketClassification()`), and AMC (`createAMCContract()`/`draftAMCBillingInvoice()`) are all
role-tier-gated only — no identity check exists comparing creator to closer/biller. This is narrower than
CAPA (3-link chained separation, one formal `checkSoD('SOD-11')` rule) and Service Visit (POL-07,
threshold-conditional) — an uneven pattern across the same domain (`ARCH-2026-002-WAVE-4-SECURITY-
BASELINE.md` §5).
**Why the decision exists:** a genuine risk-appetite/scope question — should Complaint/Ticket/AMC be
brought up to CAPA/Service-Visit's level of identity separation.
**Affected module:** Service & After-Sales (Complaint, Ticket, AMC).
**Affected transaction:** Complaint closure, Ticket closure, AMC billing.
**Affected roles:** Any role holding AS_SUPERVISE_ROLES/creation authority for these entities.
**Operational impact:** Would require a second, different authorized user at closure/billing time — real
friction for a small service team.
**Accounting impact:** None directly (AMC billing itself is unaffected in amount/timing, only WHO may
trigger it).
**Inventory impact:** None.
**Project-cost impact:** None.
**Security impact:** Would close a real, disclosed, non-CRITICAL gap.
**SoD impact:** Direct — this IS the SoD change.
**Reporting impact:** None.
**Data-model impact:** None — reuses `checkSoD()`/`RBAC_SOD_RULES_SEED` exactly, mirroring SOD-7 through
SOD-11 (per `ARCH-2026-002-WAVE-4-DESIGN.md` Sub-wave 4C).
**Migration impact:** None.
**Development impact:** Low if authorized — a fully proven pattern with zero new mechanism.

**Option A:** Add the rules with no CEO/Admin exemption (matches the SOD-7..11 precedent, the newer,
formal-engine convention).
**Option B:** Add the rules with a CEO/Admin exemption (matches the older inline-check convention used
elsewhere, e.g. Warranty void/cancel, AMC activate/cancel).
**Option C:** Defer — accept as a disclosed small-service-team risk, the same class of judgment already
accepted for the CEO/Admin combined-role reality generally.

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-9 — Below-threshold Service Visit diagnosis identity control

**Decision ID:** W4-9
**Decision title:** Whether the ₹10,000/disputed POL-07 threshold is the sole intended identity control
**Current system behavior:** Above-threshold or disputed diagnoses require diagnoser≠approver (POL-07,
inline check, `domain.js:~7921`). Below-threshold and not disputed, the SAME technician can diagnose AND
complete a visit with zero independent check.
**Why the decision exists:** the existence of the ₹10,000 threshold itself implies someone already decided
SOME cases don't need independent review — this item asks whether that line is still correctly drawn, a
genuine risk-appetite question, not whether a line should exist at all.
**Affected module:** Service & After-Sales (Service Visit).
**Affected transaction:** Visit diagnosis, Visit completion.
**Affected roles:** Technicians performing below-threshold diagnoses.
**Operational impact:** Any change to require independent review below threshold adds friction to the
majority (presumably lower-value) service visits.
**Accounting impact:** None directly.
**Inventory impact:** None directly.
**Project-cost impact:** None directly.
**Security impact:** Would close a disclosed, low-severity gap if changed.
**SoD impact:** Direct.
**Reporting impact:** None.
**Data-model impact:** None if the threshold value itself is simply revisited; none if a new identity
check is added (reuses existing patterns).
**Migration impact:** None.
**Development impact:** None if the threshold value alone changes (config); low if a new identity check
is added regardless of amount.

**Option A:** Leave as-is — the ₹10,000/disputed threshold is confirmed as the intended, sufficient
control (no code change).
**Option B:** Lower or raise the threshold value (a configuration change, not a structural one).
**Option C:** Apply identity separation regardless of amount (a structural change beyond what POL-07
currently does).

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-10 — CAPA source-ID validation and "Site issue" origin

**Decision ID:** W4-10
**Decision title:** (a) CAPA source-ID existence validation; (b) new "Site issue" CAPA origin
**Current system behavior:** `createCAPACase()` (`domain.js:7771`) accepts `sourceComplaintId`/
`sourceTicketId` with **no existence check** on either — the same class of gap already fixed elsewhere in
this exact file (ERP-042/043/044) for Warranty/Ticket/AMC, but not applied to this function. Separately,
CAPA today supports Quality-origin and Customer-Complaint-origin (`sourceComplaintId`) and Service-Ticket-
origin (`sourceTicketId`); a distinct "Site issue" origin has no dedicated field.
**Why the decision exists:** part (a) is a pure hygiene/consistency gap (see this document's own
disposition in `ARCH-2026-002-W4-GAP-DISPOSITION.md` — classified IN SCOPE, zero policy content, same
class as the already-applied ERP-042/043/044 fixes); part (b) is a genuine new-scope question (a new
field/origin type is new capability, not a bug fix).
**Affected module:** Service & After-Sales / Quality (CAPA).
**Affected transaction:** CAPA case creation.
**Affected roles:** AS_SUPERVISE_ROLES / scoped-PM authority (whoever may create a CAPA case today).
**Operational impact:** Part (a): none — purely rejects invalid input that should never occur in normal
use. Part (b): a new origin option for CAPA triage.
**Accounting impact:** None under either part.
**Inventory impact:** None.
**Project-cost impact:** None.
**Security impact:** Part (a) closes a data-integrity gap (a CAPA could reference a nonexistent
complaint/ticket today).
**SoD impact:** None.
**Reporting impact:** Part (b) would add a new CAPA-origin reporting dimension.
**Data-model impact:** Part (a): none new. Part (b): a new field or a documented convention reusing an
existing optional field.
**Migration impact:** Part (a): none — a validation tightening on new calls only (existing records should
be spot-checked for phantom IDs before enabling in enforce mode, standard practice already established
elsewhere in this codebase for this exact class of fix). Part (b): none if additive.
**Development impact:** Part (a): trivial. Part (b): requires its own scope decision first.

**Option A (part a):** Add the existence check (recommended in the Gap Disposition as IN SCOPE, zero
policy content).
**Option B (part a):** Leave as-is.
**Option A (part b):** Represent "Site issue" via one of the two existing optional source-ID fields (a
reasonable but currently-undocumented convention).
**Option B (part b):** Add a new dedicated field/origin type (new scope, requires its own authorization).
**Option C (part b):** Defer — do not add a "Site issue" origin at this time.

**MANAGEMENT DECISION:** [OPEN — management input required for part (b); part (a) recommended IN SCOPE
per Gap Disposition, still requires implementation authorization via a future CR — this CR does not grant
it]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-11 — Technician cost tracking and Cost Centre tagging for Service Labour

**Decision ID:** W4-11
**Decision title:** (a) Persist `technicianId`; (b) tag Service Labour with a Cost Centre
**Current system behavior:** Neither happens today. `postServiceLabourCost()`'s JE lines carry only
`projectId`/`customerId` — `technicianId` is accepted by the function signature but never stored or read
back. No `costCentreId` is tagged on either JE line, unlike its 2 sibling labour-posting functions
(`postProductionLabourCost()`→`CC-FACTORY`, `postInstallationLabourCost()`→`CC-INSTALLATION`).
**Why the decision exists:** this CR's own text explicitly cautions against defaulting into either change
— part (a): "Do not assume payroll integration"; part (b): "Do not automatically propagate Cost Centre
merely because the architecture supports Cost Centres elsewhere. Record the management decision." Both
are treated here as requiring an actual management decision, not assumed low-stakes-therefore-automatic,
despite carrying relatively little business-policy content in the abstract.
**Affected module:** Service & After-Sales (Service Labour), Controlling.
**Affected transaction:** Service Labour cost posting.
**Affected roles:** Whoever holds `assertCanPostServiceLabourCost()` authorization; FinanceManager/CEO as
Controlling-report consumers.
**Operational impact:** None — purely additive tagging, no workflow change either way.
**Accounting impact:** None — no account or calculation change under either option.
**Inventory impact:** None.
**Project-cost impact:** None additional (already linked via `projectId`).
**Security impact:** None.
**SoD impact:** None.
**Reporting impact:** Part (a) would enable per-technician cost/productivity reporting, currently
impossible from posted data. Part (b) would extend `generalLedger()`'s existing, already-proven
Cost-Centre filter to cover Service Labour.
**Data-model impact:** Part (a): additive field only (technician is already a `DB.users` record). Part
(b): a new `CC-SERVICE` cost-centre master record (one line, same shape as `CC-FACTORY`/
`CC-INSTALLATION`) or reuse of an existing one — an open naming/mapping question in itself.
**Migration impact:** NONE for new records under either part; historical entries CANNOT be retrofitted
(the value was never captured — a real, permanent gap for pre-decision data, not a blocker to deciding
going forward).
**Development impact:** Low if authorized under either part (pure tagging additions, no new engine).

**Option A (part a):** Persist `technicianId`, narrow scope — operational tracking/audit/customer-history
only, explicitly NOT linked to payroll.
**Option B (part a):** Do not persist (current state).
**Option A (part b):** Add `costCentreId:'CC-SERVICE'` tagging to `postServiceLabourCost()`.
**Option B (part b):** Do not tag (current state).

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## W4-12 — Site/Branch scope dimension for Service Visit (NEW — surfaced by this gate's own GAP 7 review)

**Decision ID:** W4-12
**Decision title:** Whether Service Visit needs a real, scope-checked Site/Branch dimension
**Current system behavior:** Service Visit currently carries `site` as a free-text string, not a scoped
master-data reference — unlike Project/Customer, which ARE real, scope-checked references
(`ARCH-2026-002-WAVE-4-DATA-MODEL-GAP-REGISTER.md` item 8, re-confirmed by
`ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md` §6). This is consistent with the original ARCH-2026-002
Phase 0's own finding that Branch/Site scope is inconsistently wired across the whole codebase (not a
Wave-4-specific gap in isolation).
**Why the decision exists:** this item did not receive its own entry in the original
`ARCH-2026-002-WAVE-4-DECISIONS.md` despite being a distinctly-registered Data-Model Gap Register item —
an omission this gate's own §9 GAP 7 review is required to catch and correct without silently dropping or
inventing a resolution.
**Affected module:** Service & After-Sales (Service Visit), Data Scope architecture.
**Affected transaction:** Service Visit creation/listing.
**Affected roles:** Any role whose access should be site/branch-scoped for Service Visits specifically.
**Operational impact:** None today (free text works operationally); a real scope field would enable
territory-based access control and reporting.
**Accounting impact:** None.
**Inventory impact:** None directly.
**Project-cost impact:** None.
**Security impact:** None currently exploitable — Project/Customer scope already govern access; this is a
reporting/territory-management gap, not an access-control hole.
**SoD impact:** None.
**Reporting impact:** Would enable multi-branch service-territory reporting, currently impossible from
free text.
**Data-model impact:** Would need a `siteId`/`branchId` FK if authorized.
**Migration impact:** LOW-MEDIUM — existing free-text `site` values would need either a one-time mapping
to a new master or would need to coexist (both fields present, old data unmapped) — a genuine,
non-trivial migration decision, not designed further here.
**Development impact:** Requires its own scoping/design pass if authorized — not detailed further,
matching this engagement's "do not over-design a possibly-declined feature" discipline.

**Option A:** Leave as free text (current state).
**Option B:** Add a real `siteId`/`branchId` scoped reference, migrating or coexisting with the free-text
field.

**MANAGEMENT DECISION:** [OPEN — management input required]
**DECISION OWNER:** [Management]
**EFFECTIVE DATE:** [To be supplied]
**IMPLEMENTATION STATUS:** [Not yet authorized]

---

## Summary

All 12 items (W4-1 through W4-12) remain **OPEN**. No management decision has been supplied for any item
in this engagement to date. This register exists to make each decision management-ready — not to make the
decisions itself.

---

# 2026-09-26 Update — "Wave 4 Management Decision Collection + Scope Authorization Gate"

This update does not delete or alter anything above (the full narrative decision records, options, and
per-item impact analysis stand unchanged as the authoritative detail). It restructures each item into the
exact per-option-consequence format the follow-up CR's own §4 requires, and — per that CR's own §6 — since
**no management decision has been supplied anywhere in this environment for any of the 12 items**, this
update does not invent one for any of them. Instead it produces the required **management decision
questionnaire** (§6) as the actionable artifact for management to actually answer.

## Restructured decision records (§4 format — condensed; full narrative remains in the original entries above)

Every record below ends identically because zero decisions have been supplied:
**Management decision: [OPEN unless explicitly supplied] · Decision authority: Management · Decision
date: [Required when supplied] · Effective date: [Required when supplied] · Implementation
authorization: [NOT GRANTED unless separately authorized]**

| ID | Decision title | Option A | Option B | Option C | Implementation classification |
|---|---|---|---|---|---|
| W4-1 | Warranty duration/coverage/exclusion policy | Leave as-is (full manual entry) | Optional warranty-template master | Company-standard duration-by-product-type config | POLICY DEPENDENT |
| W4-2 | Classification automation | Leave fully manual | Advisory eligibility linkage | Binding eligibility linkage | POLICY DEPENDENT |
| W4-3 | AMC scheduling/renewal automation | Leave fully manual | Auto-generate schedule only | Auto-generate + renewal reminder | POLICY DEPENDENT |
| W4-4 | Resolution SLA + Warning threshold | Leave unconfigured | Configure Resolution SLA only | Configure Resolution SLA + Warning threshold | POLICY DEPENDENT |
| W4-5 | Service Labour rate-card enforcement | Leave disconnected | Advisory pre-fill | Mandatory enforcement | POLICY DEPENDENT |
| W4-6 | Warranty material accounting treatment | Expense-at-issue (current) | Provision/reserve at contract/handover (new GL account + dedicated design pass) | — | POLICY DEPENDENT |
| W4-7 | Duplicate-billing guard rule | One bill per completion | One bill per visit | Explicit rebilling with authorization | POLICY DEPENDENT |
| W4-8 | Complaint/Ticket/AMC SoD-rule expansion | Add, no CEO/Admin exemption | Add, with CEO/Admin exemption | Defer, accept as disclosed risk | POLICY DEPENDENT |
| W4-9 | Below-threshold diagnosis identity control | Confirm ₹10,000 threshold as sufficient (no change) | Change the threshold value (config only) | Apply identity separation regardless of amount | POLICY DEPENDENT |
| W4-10a | CAPA source-ID existence validation | Add the check | Leave as-is | — | **IMPLEMENT (recommended for a future CR — not authorized by any CR to date)** |
| W4-10b | "Site issue" CAPA origin | Reuse an existing optional field | Add a new dedicated field | Defer — do not add | POLICY DEPENDENT |
| W4-11a | Technician ID persistence | Persist, narrow scope, no payroll linkage | Do not persist (current state) | — | POLICY DEPENDENT |
| W4-11b | Service Labour Cost Centre tagging | Add `CC-SERVICE` tagging | Do not tag (current state) | — | POLICY DEPENDENT |
| W4-12 | Site/Branch scope for Service Visit | Leave as free text (current state) | Add a real scoped `siteId`/`branchId` FK | — | POLICY DEPENDENT |

(The standalone, non-numbered Gap 6 item — 6 missing `logAudit()` calls — remains **IMPLEMENT**-recommended
too, per `ARCH-2026-002-W4-GAP-DISPOSITION.md`; it is not one of the 12 numbered decisions because it
carries no business question to put to management, only a yes/no on audit-completeness hygiene, itself
still awaiting a separate implementation authorization.)

**11 of 12 numbered items are wholly POLICY DEPENDENT. W4-10 is split: part (a) is IMPLEMENT-recommended
(zero policy content), part (b) is POLICY DEPENDENT.** No item is DEFER, NO CHANGE, or NOT APPLICABLE — all
12 represent live, currently-unresolved, genuinely-open questions or a genuinely-open sub-question.

## Management Decision Questionnaire (§6 format — the actionable artifact)

Below is the concise, business-language version of all 12 items for management to answer directly. No
technical language is substituted for the business question. Each is answerable with a letter (or "N" for
none of the above / defer) plus optional notes.

---

**W4-1 — QUESTION:** What is Appletree's standard warranty period and coverage/exclusion wording, and do
you want a reusable template instead of typing it fresh every time?
**A / B / C:** A) Keep typing it manually each time. B) Give us a reusable template we can start from
(still editable per warranty). C) Set fixed standard durations by product type.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-2 — QUESTION:** When a technician decides "is this covered by warranty or should we bill the
customer," should the system ever help make that call, or should it always be 100% the technician's
judgment?
**A / B / C:** A) Always 100% human judgment (current). B) System shows a suggestion, technician can
override. C) System can block a warranty claim it determines isn't eligible.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-3 — QUESTION:** For Annual Maintenance Contracts, do you want scheduled visits to appear
automatically based on the contract's visit frequency, and/or a reminder before a contract expires?
**A / B / C:** A) Keep creating each scheduled visit by hand (current). B) Auto-create the scheduled
visits only. C) Auto-create scheduled visits AND remind us before renewal is due.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-4 — QUESTION:** Right now we track "must respond within 4 hours" and "must visit within 72 hours,"
but there is no "must resolve the ticket by X hours" target. Do you want one, and a warning before it's
breached?
**A / B / C:** A) No resolution-time target for now. B) Yes, set a resolution-time target (please supply
the number of hours). C) Yes, a resolution-time target AND a warning before breach.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-5 — QUESTION:** We have a technician pay-rate table set up, but the system currently does not check
against it when posting a service labour cost — a staff member types the amount directly. Should the
rate table be used, and if so, should it be mandatory?
**A / B / C:** A) Keep as-is, no connection to the rate table. B) Use the rate table as a suggestion,
allow override. C) Require the rate table — block posting if no rate exists for that technician.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-6 — QUESTION:** Warranty replacement material cost is currently booked as an expense the moment it's
issued (same as ordinary project material). Do you want it booked earlier, as a set-aside reserve at the
time we hand over the project/sign the warranty?
**A / B:** A) Keep booking it as an expense at the time of actual issue (current — no change). B) Book it
as a reserve at handover/contract time instead (this is a real accounting-policy change requiring its own
follow-up design).
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-7 — QUESTION:** Nothing currently stops staff from accidentally creating a second invoice for the
same completed service job, or a second AMC bill for the same period. What rule should we enforce?
**A / B / C:** A) One invoice per completed service ticket. B) One invoice per service visit. C) Allow a
second bill only if a manager explicitly authorizes it (re-billing with approval).
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-8 — QUESTION:** Today, the same person who opens a Complaint/Ticket/AMC contract could also be the
one who closes it or bills it — nobody double-checks. Should a second person be required, like we already
require elsewhere (e.g. payments)?
**A / B / C:** A) Yes, require a second person, no exceptions even for CEO/Admin. B) Yes, require a second
person, but CEO/Admin may still do both. C) No change — accept this as a small-team risk, same as
elsewhere in the system.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-9 — QUESTION:** For service jobs under ₹10,000 that aren't disputed, the same technician can both
diagnose the problem and close out the job with no second check — this was a deliberate earlier decision.
Should that stay as-is, should the ₹10,000 line move, or should a second person always be required
regardless of amount?
**A / B / C:** A) Keep the ₹10,000 line as the only check — confirmed sufficient, no change. B) Change the
₹10,000 amount (please supply the new number). C) Require a second person on every job, regardless of
amount.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-10 — QUESTION (part a):** A corrective-action (CAPA) case can currently reference a complaint or
ticket ID that doesn't actually exist, with no error. We recommend simply blocking that — is that fine to
include in the next update?
**A / B:** A) Yes, block it (recommended — no downside, no policy question). B) No, leave as-is.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

**QUESTION (part b):** Should CAPA cases support a distinct "Site issue" origin (separate from Complaint/
Ticket/Quality), or is that not needed?
**A / B / C:** A) Reuse one of the existing fields as a workaround. B) Add a proper new field for this.
C) Not needed — don't add it.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-11 — QUESTION (part a):** Should we record WHICH technician performed a service labour job (for our
own tracking/reporting), with the explicit understanding this would NOT connect to payroll?
**A / B:** A) Yes, record it (tracking/reporting only, not payroll). B) No, don't record it.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

**QUESTION (part b):** Should Service Labour cost show up in our Cost-Centre reports the same way factory
and installation labour already do?
**A / B:** A) Yes, add it to Cost-Centre reporting. B) No, leave it out for now.
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

**W4-12 — QUESTION:** Service visit locations are currently free text (just typed in). Do you need them
tied to a real branch/site list so we can report by territory, or is free text fine?
**A / B:** A) Free text is fine, no change. B) Yes, connect it to a real branch/site list (this needs its
own migration plan for old records).
**Management answer:** _______
**Notes:** _______
**Decision date:** _______

---

## Decision consistency check (§8)

**Not yet applicable — zero decisions have been supplied, so there is nothing yet to conflict-check.**
Per this CR's own §8, once management answers begin arriving, the following cross-decision relationships
must be checked before any is separately finalized, since they touch the same downstream systems:

- **W4-6 (Warranty accounting) × W4-2 (Classification automation) × W4-7 (Duplicate-billing rule):** all
  three touch the Service Billing → Customer Invoice → AR chain. A decision on W4-6 Option B (provision
  accounting) would need to remain consistent with whatever W4-7 rule is chosen for warranty-classified
  tickets (which cannot be billed at all today — `ARCH-2026-002-WAVE-4-TRANSACTION-OWNERSHIP.md` row 8b —
  a fact any W4-6/W4-7 answer must not contradict).
- **W4-11a (Technician ID) × W4-11b (Cost Centre) × W4-5 (Rate-card enforcement):** all three touch
  `postServiceLabourCost()`. If W4-5 Option C (mandatory rate-card) is chosen, the rate card is keyed by
  `technicianLevel|skill|location` — a decision to NOT persist `technicianId` (W4-11a Option B) would not
  block this (the rate card doesn't require persisting identity, only looking up the technician's level at
  posting time), but management should be aware both touch the same function before finalizing either.
- **W4-8 (SoD expansion) × W4-9 (diagnosis threshold):** both are identity-separation questions on
  adjacent parts of the same Service Visit/Ticket chain — a management preference on exemption policy
  (W4-8 Option A vs. B) would reasonably be expected to apply consistently to any W4-9 Option C outcome,
  though this is not assumed here.

No conflict currently exists because no decision has been made on any item. This section exists so the
consistency check can be performed immediately once answers arrive, rather than discovered later.
