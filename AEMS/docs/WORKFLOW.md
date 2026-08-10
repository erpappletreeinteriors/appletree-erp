# AEMS — Approval Workflow

Status: **confirmed (2026-08-07)**, flat chain, no ₹-tiered branching yet.

## Chain

```
Draft → Submitted → Supervisor → Store → Accounts → Director → Accounts Head → Paid
```

Every expense request goes through every step regardless of amount. ₹-tiered
branching (e.g. small expenses skipping a step) is deliberately deferred —
add it later as a routing rule change, not a redesign, if wanted.

## Supported actions at any pending step

- **Approve** — advances to the next step in the chain.
- **Reject** — terminal. Request is closed, not payable. Reason required.
- **Send Back** — returns the request to the submitter as `NeedsClarification`;
  submitter edits and re-submits, re-entering at the *same* step that sent it
  back (not restarting the whole chain).
- **Escalate** — TBD trigger condition (timeout not yet defined — see Open
  Questions below); moves the pending action to a designated escalation
  target for that step.
- **Reassign** — the current approver at a step hands their pending action to
  someone else (e.g. delegate while on leave). Does not change the chain
  itself, only who acts at the current step.

Every action (approve/reject/send back/escalate/reassign) is written to
Approval History with actor, timestamp, and comment — never overwritten.

## Roles

Supervisor, Store, Accounts, Director, Accounts Head — one designated approver
per step. Who actually holds each role is master data (see
[DATABASE.md](DATABASE.md)), not hardcoded — the workflow engine addresses
steps by role, and role→person assignment is configurable.

## Open questions (deferred, not blocking initial build)

- Escalation trigger: fixed timeout per step vs. manual-only. Defaulting to
  **manual-only escalation** for v1 (no automatic timeout) until a real SLA is
  specified — this avoids inventing a duration nobody confirmed.
- ₹-tiered routing (steps skipped below a threshold) — not built in v1.
- Who besides the current-step approver can trigger Reassign (self only, or
  can a manager reassign on someone's behalf) — defaulting to **self-only**
  for v1.

Update this section (and the domain model in
[SDD.md](SDD.md)) if any default above turns out wrong once real usage starts.

## Where this drives code

The state machine below is implemented as the `Approval` bounded context's
domain model — see [SDD.md](SDD.md) for the full state diagram and
[ARCHITECTURE.md](ARCHITECTURE.md) §2 for context boundaries.
