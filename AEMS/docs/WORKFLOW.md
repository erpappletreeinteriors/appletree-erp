# AEMS — Approval Workflow

Status: **TBD — not confirmed.** The master specification that kicked off this
project included a generic example chain:

```
Expense Request → Supervisor → Store → Accounts → Director → Accounts Head → Payment
```

with support for Reject / Send Back / Escalation / Reassignment / Approval
History. This is a **template placeholder**, not a confirmed Appletree business
process — it has not been validated against real roles, real ₹ thresholds, or
real escalation timing. Do not implement a workflow engine against this chain
until the CEO confirms:

1. Are "Supervisor", "Store", "Accounts", "Director", "Accounts Head" real,
   distinct roles/people at Appletree, or should some steps collapse/be
   renamed?
2. Does every expense go through every step, or does the chain branch by
   category or ₹ amount (the existing ERP already has a ₹-tiered DOA pattern
   for PO/quotation approval — worth reusing that shape if it fits)?
3. What triggers Escalation (a fixed timeout? manual?) and who does an
   escalated request go to?
4. What does Reassignment mean here (delegate while on leave? permanent
   handover?) and who can trigger it?
5. Is Send Back a return-to-submitter step that re-enters at Draft, or a
   parallel "needs clarification" state?

## Once confirmed

Update this document with the real chain, then the workflow state machine goes
into [SDD.md](SDD.md) and drives the `Approval` bounded context's domain model
per [ARCHITECTURE.md](ARCHITECTURE.md) §2.
