# AEMS — Functional Requirements Document

Status: skeleton, empty of real requirements until [BRD.md](BRD.md) is filled in.
Functional requirements are derived from business requirements — do not write
these ahead of BRD confirmation, or they'll encode guessed business rules as if
decided.

## 1. Format for each requirement (template)

```
FR-<context>-<number>: <short title>
  Actor:        who triggers this
  Preconditions: state required before this can happen
  Trigger:       the action that starts it
  Main flow:     numbered steps
  Alternate/error flows: numbered
  Postconditions: resulting state
  Related business rule: link to BRD.md section
```

## 2. Expense context

TBD — e.g. FR-EXP-001 Submit Expense Request, FR-EXP-002 Attach Receipt,
FR-EXP-003 Edit Draft Expense, FR-EXP-004 Withdraw Submitted Expense.

## 3. Approval context

TBD — e.g. FR-APR-001 Approve Step, FR-APR-002 Reject, FR-APR-003 Send Back for
Clarification, FR-APR-004 Escalate on Timeout, FR-APR-005 View Approval History.

## 4. Payment context

TBD — e.g. FR-PAY-001 Mark Paid, FR-PAY-002 Record Payment Reference,
FR-PAY-003 Payment Reversal/Correction.

## 5. Cross-cutting

TBD — audit trail requirements, notification triggers, reporting/export needs.
