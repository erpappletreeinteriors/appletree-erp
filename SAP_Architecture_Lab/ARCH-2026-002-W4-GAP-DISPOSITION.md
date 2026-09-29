# ARCH-2026-002 — W4 Gap Disposition

**Date:** 2026-09-26. Deliverable per this CR's own §8-§9. **A gap is not automatically a requirement.**
Every finding below is classified IMPLEMENT / DEFER / POLICY DEPENDENT / NO CHANGE / NOT APPLICABLE.
"IMPLEMENT" here means *recommended as in-scope for a future, separately-authorized implementation CR* —
it is never itself an authorization to write code; this CR (§4) forbids all application-code changes
regardless of classification.

**General rule applied:** an item is classified IMPLEMENT only when it carries **zero business-policy
content** (a pure hygiene/consistency/tagging fix with no tradeoff a reasonable manager could dispute) AND
this CR's own text does not itself instruct deferring to a management decision for that specific item. All
7 gaps this CR names include at least one explicit "do not assume/do not invent/record the management
decision" caution in their own text — this was taken literally, not softened because the underlying fix
looks small. Only 2 sub-items across all 7 gaps clear this bar.

## GAP 1 — Uneven SoD coverage (Complaint / Ticket / AMC)

**Finding:** Complaint/Ticket/AMC closure and AMC billing are role-tier-gated only — narrower than CAPA
(formal `checkSoD('SOD-11')`) and Service Visit (POL-07, threshold-conditional).
**Classification: POLICY DEPENDENT.** Whether to add new SoD rules, and with what exemption policy, is a
genuine risk-appetite choice (W4-8) explicitly not decided by any source document.
**If IMPLEMENT is later selected, ready-to-go specification** (per this CR's own §9 GAP 1 instruction to
define this much, without designing the rule itself):
| Field | Complaint | Ticket | AMC |
|---|---|---|---|
| Exact transaction | Complaint status change to CLOSED/REJECTED | Service Ticket closure | AMC Billing Invoice draft |
| Maker | `createComplaint()`'s `createdBy` | `createServiceTicket()`'s `createdBy` | `createAMCContract()`'s `createdBy` |
| Checker | `changeComplaintStatus()`'s acting user | `closeServiceTicket()`'s acting user | `draftAMCBillingInvoice()`'s acting user |
| Forbidden combination | maker === checker | maker === checker | maker === checker |
| Exemption requirement | Per W4-8 Option A/B — undecided | Per W4-8 Option A/B — undecided | Per W4-8 Option A/B — undecided |
| Affected roles | AS_SUPERVISE_ROLES | AS_SUPERVISE_ROLES | AMC-capable roles |
| Required tests | maker-blocked / different-authorized-user-succeeds / audit-trail-present / forged-role-bypass-blocked / full-regression-zero-net-new-failures (mirrors SOD-7..11 exactly) | same pattern | same pattern |

Actual implementation belongs to a future authorized CR, per this CR's own §9 GAP 1 instruction.

## GAP 2 — Service Labour Rate Card not wired into posting

**Finding:** `DB.serviceLabourRates` (POL-06) exists and is admin-configurable but
`postServiceLabourCost()` never reads it — posted amounts are caller-supplied.
**Classification: POLICY DEPENDENT.** This CR's own §9 GAP 2 text: "Determine management policy... Do not
invent a rate policy. If no policy exists: POLICY DEPENDENT." No policy has been supplied (W4-5's three
options — leave disconnected / advisory / mandatory — are exactly this choice, undecided).

## GAP 3 — Technician ID persistence

**Finding:** `technicianId` is accepted by `postServiceLabourCost()` but never persisted.
**Classification: POLICY DEPENDENT.** This CR's own §9 GAP 3 text explicitly conditions any change on
determining WHY it's needed (operational tracking/profitability/technician performance/payroll/audit/
customer history) and explicitly says "Do not assume payroll integration" — the purpose determines the
minimum data-model change, which is not decided (W4-11 part a).
**Note:** the narrow "operational-tracking-only, explicitly no payroll linkage" version carries very
little policy content in isolation, but this CR's own §9 GAP 3 text ("if approved for implementation")
makes clear that even the narrow version awaits an actual decision — not defaulted to IMPLEMENT here.

## GAP 4 — Service Labour Cost Centre tagging

**Finding:** `postServiceLabourCost()` does not tag `costCentreId`, unlike its 2 sibling labour-posting
functions.
**Classification: POLICY DEPENDENT.** This CR's own §9 GAP 4 text is unusually explicit: "Do not
automatically propagate Cost Centre merely because the architecture supports Cost Centres elsewhere.
Record the management decision." This instruction is followed literally — the technical ease of the
change (a 1-line addition, proven pattern) is not treated as grounds for a default IMPLEMENT
classification (W4-11 part b).

## GAP 5 — Duplicate-billing protection

**Finding:** Neither Service Invoice nor AMC Billing drafting is guarded against a second draft against
the same ticket/period.
**Classification: POLICY DEPENDENT** (for the exact rule/granularity) **— with a disclosed low-controversy
sub-finding.** This CR's own §9 GAP 5 text requires choosing among source-document-supported options only
("Do not invent a billing policy") — Options A/B/C in W4-7 (one bill per completion / one bill per visit /
explicit rebilling with authorization) are genuinely different rules with different operational
consequences, so the SPECIFIC choice is not decided here. The general direction ("should SOME guard
exist") has very low controversy (`ARCH-2026-002-WAVE-4-DECISIONS.md`'s own W4-7 entry: "the open question
is really priority/sequencing, not whether") but this document does not upgrade that observation into an
IMPLEMENT classification, because this CR's own §8 instruction is that management/business policy — not
the developer's assessment of "self-evidently yes" — controls scope. The architectural constraint (Service
must not become a second AR engine) is preserved as a hard boundary under every option — see
`ARCH-2026-002-W4-ACCOUNTING-IMPACT.md`.

## GAP 6 — Missing audit events (6 functions)

**Finding:** `rejectServiceTicket()`, `startServiceVisit()`, `cancelServiceVisit()`,
`recordCAPAAnalysis()`, `createAMCScheduleEntry()`, `linkAMCScheduleToTicket()` lack `logAudit()` calls.
**Classification: IMPLEMENT** (recommended for the next authorized implementation CR — not built now).
**Reasoning:** unlike Gaps 1-5, this CR's own §9 GAP 6 text carries **no "do not assume/do not invent"
caution** — it only asks "Determine whether all six should become mandatory durable audit events. If yes,
identify: event/actor/object/action/timestamp/before-after/transaction context/failure durability
requirement." Adding an audit-log call to an existing state-change function has zero business-policy
content (nothing about WHO can do WHAT changes; purely whether the action is independently logged) and
directly matches the established, already-executed precedent in this exact engagement (Wave 2's W2-2 QC-
checklist-creation audit-log fix, approved without a separate management decision because it "carries no
business-policy content"). This is a disclosed judgment call, consistent with — not overriding — this
document's own general rule above, because GAP 6 is the one gap whose own CR text does not attach a
caution against defaulting toward closure.
**Ready-to-go specification** (per the CR's own request, "if yes, identify..."):
| Function | Event | Actor | Object | Action | Failure-durability requirement |
|---|---|---|---|---|---|
| `rejectServiceTicket()` | `ServiceTicketRejected` | acting user | Service Ticket | reject | Standard `logAudit()` — this is a success-path event, not a rejection audit, so `durableFailureAudit` does not apply |
| `startServiceVisit()` | `ServiceVisitStarted` | acting user | Service Visit | start | Standard `logAudit()` |
| `cancelServiceVisit()` | `ServiceVisitCancelled` | acting user | Service Visit | cancel | Standard `logAudit()` |
| `recordCAPAAnalysis()` | `CAPAAnalysisRecorded` | acting user | CAPA Case | record analysis | Standard `logAudit()` |
| `createAMCScheduleEntry()` | `AMCScheduleEntryCreated` | acting user | AMC Schedule Entry | create | Standard `logAudit()` |
| `linkAMCScheduleToTicket()` | `AMCScheduleLinkedToTicket` | acting user | AMC Schedule Entry | link | Standard `logAudit()` |

None of these six is a rejection/failure path reached through `withTransaction()`'s rollback branch, so
the `durableFailureAudit` survival mechanism (per this CR's own §29-equivalent reminder from Wave 3) does
not apply here — a bare `logAudit()` call is the correct pattern for all six, consistent with how every
OTHER already-logged create/state-change function in this exact Phase 10 block already does it. Reuses the
existing audit framework exactly — no new framework, per this CR's own §9 GAP 6 instruction.

## GAP 7 — Remaining Service control gap(s)

Per this CR's own instruction not to rely on its own prompt's enumeration, the complete list was extracted
directly from `ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md` and `ARCH-2026-002-WAVE-4-DATA-MODEL-GAP-
REGISTER.md`. Beyond Gaps 1-6 above (which map to Data-Model Gap Register items 1/2/3/4/7 and Security
Baseline §5), the following additional items exist and are dispositioned here:

- **CAPA source-ID existence validation** (`createCAPACase()` accepts `sourceComplaintId`/
  `sourceTicketId` with no existence check — Data-Model Gap Register item 6, part of W4-10).
  **Classification: IMPLEMENT** (recommended, not built now). Zero policy content — the identical class of
  fix already applied elsewhere in this same file for Warranty/Ticket/AMC (ERP-042/043/044), just not yet
  extended to this one function. No caution against closure exists in this CR's text for this specific
  sub-item.
- **"Site issue" CAPA origin** (no dedicated field exists today — part of W4-10).
  **Classification: POLICY DEPENDENT.** A new field/origin type is new scope, not a bug fix — W4-10's own
  options (reuse an existing optional field vs. add a new field vs. defer) are undecided.
- **AMC Schedule auto-generation** (Data-Model Gap Register item 5, maps to W4-3).
  **Classification: POLICY DEPENDENT** — an operational-convenience question, undecided (W4-3).
- **Warranty Provision/Reserve accounting treatment** (Data-Model Gap Register item 9, maps to W4-6).
  **Classification: POLICY DEPENDENT** — a real accounting-policy decision, undecided (W4-6), requiring
  its own dedicated design pass if authorized.
- **Site/Branch scope dimension for Service Visit** (Data-Model Gap Register item 8) — **this is the one
  finding that had no corresponding W4-decision entry at all**, now added as **W4-12** (see
  `ARCH-2026-002-WAVE-4-DECISIONS.md` §D and `ARCH-2026-002-W4-MANAGEMENT-DECISION-REGISTER.md`).
  **Classification: POLICY DEPENDENT** — a real scoping/migration decision, not a security hole (Project/
  Customer scope already govern actual access).
- **Warranty duration/coverage/exclusion policy, classification automation, SLA completion** (W4-1, W4-2,
  W4-4) — each **POLICY DEPENDENT**, each with an explicit "no recommendation given"/config-value-missing
  status in the source Decisions document.

## Disposition summary table

| Gap | Item | Classification |
|---|---|---|
| 1 | SoD expansion (Complaint/Ticket/AMC) | POLICY DEPENDENT |
| 2 | Service Labour Rate Card enforcement | POLICY DEPENDENT |
| 3 | Technician ID persistence | POLICY DEPENDENT |
| 4 | Service Labour Cost Centre tagging | POLICY DEPENDENT |
| 5 | Duplicate-billing rule (exact granularity) | POLICY DEPENDENT |
| 6 | Missing audit events (6 functions) | **IMPLEMENT** (recommended, future CR) |
| 7a | CAPA source-ID existence validation | **IMPLEMENT** (recommended, future CR) |
| 7b | "Site issue" CAPA origin | POLICY DEPENDENT |
| 7c | AMC Schedule auto-generation | POLICY DEPENDENT |
| 7d | Warranty Provision accounting treatment | POLICY DEPENDENT |
| 7e | Site/Branch scope for Service Visit (W4-12) | POLICY DEPENDENT |
| 7f | Warranty policy / classification automation / SLA completion (W4-1/2/4) | POLICY DEPENDENT |

**2 of 12 dispositioned items are IMPLEMENT-recommended for a future CR; 10 are POLICY DEPENDENT. Zero are
DEFER, NO CHANGE, or NOT APPLICABLE** — every finding in this register reflects a real, currently-true
gap, not a stale or non-reproducible one. **No item is authorized for implementation by this document.**
