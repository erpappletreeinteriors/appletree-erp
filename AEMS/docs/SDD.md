# AEMS — Software Design Document

Status: skeleton. Fleshes out once FRD.md has real content — a design document
for requirements that don't exist yet would just be invented detail.

## 1. Purpose

Bridges FRD (what the system must do) and actual code (how it does it): class
diagrams, sequence diagrams, state machines for the approval workflow, and
module-level design decisions that don't belong in the higher-level
ARCHITECTURE.md.

## 2. Contents (to be filled in as each part is designed)

- **Domain model** — class diagram for Expense, Approval, Payment aggregates
  and their relationships. TBD.
- **Approval workflow state machine** — states, transitions, guards. Depends on
  real approval chain from BRD.md. TBD.
- **Sequence diagrams** — key flows (submit → route → approve → pay). TBD.
- **Repository interfaces** — full method signatures per bounded context, once
  FRD is concrete enough to know what queries are needed. TBD.
- **Error/exception model** — custom error number ranges per bounded context
  (VBA `Err.Raise` conventions). TBD.

## 3. Design principles carried from ARCHITECTURE.md / CODING_STANDARDS.md

Referenced here rather than restated — see those documents for layering rules,
SOLID application, and the persistence abstraction contract.
