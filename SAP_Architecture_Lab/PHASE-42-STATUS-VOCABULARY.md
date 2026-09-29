# PHASE 42 — Status Vocabulary Audit

**Date:** 2026-09-14. Source: every `*_STATUSES` constant in `server/domain.js` (26 distinct
enumerations, extracted verbatim by Phase 37, unchanged since — confirmed no new status enum was
added by Phases 38-41, which touched `createQuotation()` and `projectDocumentTrace()` only, neither
of which defines a new status enum).

## The 26 status enumerations, verbatim

```
LEAD_STATUSES            = ['NEW','CONTACTED','QUALIFIED','ESTIMATION','QUOTATION','NEGOTIATION','WON','LOST','ON HOLD']
ESTIMATION_STATUSES      = ['DRAFT','SUBMITTED','IN PROGRESS','COMPLETED','CANCELLED']
QUOTATION_STATUSES       = ['Draft','Submitted','PendingApproval','Approved','Sent','Accepted','Rejected','Superseded']
PROJECT_STATUSES         = ['DRAFT','PLANNED','ACTIVE','ON HOLD','COMPLETED','CLOSED']
DESIGN_STATUSES          = ['Submitted','UnderReview','Approved','RevisionRequested']
MR_STATUSES              = ['DRAFT','SUBMITTED','APPROVED','REJECTED','CONVERTED']
PO_STATUSES              = ['Draft','Submitted','Approved','PartiallyReceived','FullyReceived','Closed','Cancelled']
PROD_STATUSES             = ['Draft','Released','InProgress','PartiallyCompleted','Completed','Closed','OnHold','Cancelled']
DISPATCH_STATUSES        = ['Draft','Ready','Approved','Dispatched','Delivered','Cancelled']
INSTALLATION_STATUSES    = ['Planned','InProgress','Completed','OnHold']
QC_STATUSES               = ['Pending','InProgress','Passed','Failed']
SNAG_STATUSES             = ['Open','Assigned','InProgress','Resolved','Verified','Closed']
CHANGE_REQUEST_STATUSES  = ['Draft','Submitted','Approved','Rejected','Cancelled']
TASK_STATUSES             = ['Open','InProgress','Done','Cancelled']
BOM_STATUSES              = ['Draft','Submitted','Approved','Rejected','Superseded']
MACHINE_STATUSES          = ['Available','InUse','Maintenance','Down']
JOB_CARD_STATUSES        = ['Planned','InProgress','Completed','Cancelled']
WARRANTY_STATUSES_MANUAL = ['VOID','CANCELLED']  (time-computed: NOT_STARTED/ACTIVE/EXPIRED, never stored)
COMPLAINT_STATUSES  = ['NEW','TRIAGED','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER','WAITING_PARTS','RESOLVED','CLOSED','REJECTED']
TICKET_STATUSES     = ['NEW','ASSIGNED','IN_PROGRESS','WAITING_PARTS','RESOLVED','CLOSED','REJECTED']
VISIT_STATUSES      = ['PLANNED','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED']
AMC_STATUSES        = ['DRAFT','ACTIVE','EXPIRED','CANCELLED','RENEWED']
CAPA_STATUSES       = ['OPEN','ANALYSIS','ACTION','VERIFICATION','EFFECTIVENESS','CLOSED']
PR_STATUSES         = ['Draft','Submitted','Approved','Rejected','Converted','Cancelled']
MRS_STATUSES        = ['Draft','Submitted','Approved','Rejected','Issued','Cancelled']
JOB_WORK_ORDER_STATUSES = ['Dispatched','PartiallyReturned','Returned','DirectDispatched']
```

## Standard lifecycle vocabulary (canonical, going forward)

Consolidating the above into one coherent set of stage names, since most enums are really the same
generic lifecycle spelled differently:

| Standard stage | Appears as (verbatim variants found) | Meaning |
|---|---|---|
| **Draft** | `Draft`, `DRAFT` | Created, not yet submitted for approval |
| **Submitted** | `Submitted`, `SUBMITTED` | In the approval queue |
| **Pending Approval** | `PendingApproval`, `Pending` | Explicitly awaiting a specific approver (a stricter sub-state of Submitted, used where a discount/threshold gate exists) |
| **Approved** | `Approved`, `APPROVED` | Authorized to proceed |
| **Rejected** | `Rejected`, `REJECTED` | Explicitly declined |
| **Posted** | (Finance-only; not a status enum but the terminal state after `postJournalEntry()`) | Committed to the GL, generally irreversible without a reversal |
| **Released** | `Released` (Production Order only) | Equivalent in meaning to "Approved" for a Production Order — see AT-036, Appletree's "Approve" covers SAP's "Release" everywhere else |
| **In Progress** | `IN PROGRESS`, `InProgress`, `IN_PROGRESS` | Actively being worked |
| **Completed** | `COMPLETED`, `Completed` | Finished, successful terminal state |
| **Closed** | `CLOSED`, `Closed` | Administratively finalized (may follow Completed, or be its own terminal state e.g. for Snags/CAPA/Tickets) |
| **Cancelled** | `CANCELLED`, `Cancelled` | Voided before or after approval — distinct from Rejected (a decision not to approve) and Reversed (undoing a posting) |
| **On Hold** | `ON HOLD`, `OnHold` | Paused, not cancelled |
| **Converted / Issued / Dispatched / Delivered / Verified / Resolved / Renewed / Superseded** | (each is a genuine, distinct terminal or transitional state specific to its own document type — e.g. only a Material Request can be "Converted" into a PO, only a Snag can be "Verified" after "Resolved") | Document-specific stages that correctly do NOT collapse into the generic set above |

## Casing inconsistency (real, internal-representation only)

**10 of 26 enums use `UPPERCASE_WITH_UNDERSCORES`; 16 use `PascalCase`.** This is a genuine internal
naming-convention split — confirmed by Phase 37 and unchanged since. Most screens render a styled
status "pill" with its own display label rather than the raw enum string, so this may carry zero
user-facing impact — **not verified either way in this phase**, consistent with Phase 37's own
disclosure. See `PHASE-42-SAP-MAPPING-DECISIONS.md` for the formal Business Decision entry.

**Recommendation: do NOT normalize the 26 arrays without first confirming, screen by screen, that no
raw enum value is ever displayed unmodified to a user.** The risk of a 26-array internal change is
disproportionate to a currently-unverified (and possibly zero) display benefit.

## Status-vocabulary consistency verdict

Genuinely consistent in MEANING across all 26 enums (Draft→Submitted→Approved as the universal
maker-checker spine, with document-specific extensions layered on top correctly). The only real issue
is internal casing, not conceptual drift — no two enums use different words for the same concept in a
way that would confuse a user.
