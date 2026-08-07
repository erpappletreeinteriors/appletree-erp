# AEMS / ABP — Testing Strategy

No module ships as "complete" without the applicable test types below passing.

## 1. Test types and what they cover here

| Type | Covers | Tooling |
|---|---|---|
| Unit | Domain model rules in isolation (e.g. "an ExpenseRequest cannot move to Approved from Draft") | Rubberduck (VBA unit testing add-in) |
| Integration | Repository implementation against real Excel Tables (save/load round-trip, GUID FK integrity) | Rubberduck + a disposable test workbook |
| Workflow | Full approval chain end-to-end (submit → route → approve/reject/send-back/escalate → payment) | Rubberduck scripted scenarios, or a manual scripted test checklist if the chain isn't automatable yet |
| Regression | Re-run unit+integration+workflow suites before every merge to `main` | same as above |
| Security | Authorization gates — a user without the right role/DOA tier cannot perform an approval/payment action; audit trail is written for every mutation | manual scripted test checklist per role, following the pattern already used in the sibling ERP's non-CEO-role validation passes |
| Performance | Only relevant once real data volumes exist — not applicable to an empty scaffold | deferred |

## 2. Why Rubberduck

VBA has no built-in test runner. Rubberduck (free, open-source VBE add-in) gives
`@TestMethod` attributes, assertions, and a test explorer — closest available
equivalent to xUnit for this stack. If it turns out to be unworkable in practice,
document why here and switch approach; don't silently skip testing instead.

## 3. Layout

```
tests/
  unit/         one test module per domain class, named <ClassName>Tests
  integration/  one test module per repository implementation
  workflow/     one test module per end-to-end business scenario
```

## 4. What "done" means for a feature

A feature (e.g. "submit expense request") is not complete until:
1. Its domain rules have unit tests covering the happy path and each documented
   rejection/edge case from FRD.md.
2. Its repository round-trip has an integration test.
3. If it changes the approval chain's behavior, a workflow test exercises it
   end-to-end.
4. A role without the required permission is proven unable to perform it
   (security test) — matching the "validate every non-CEO role" discipline
   already established in the sibling ERP project.
5. Regression suite still passes.

## 5. Not yet applicable

Performance testing and load testing are deferred until there's real data volume
and a real client (Excel workbook shared among actual users) to measure. Don't
fabricate benchmarks against an empty scaffold.
