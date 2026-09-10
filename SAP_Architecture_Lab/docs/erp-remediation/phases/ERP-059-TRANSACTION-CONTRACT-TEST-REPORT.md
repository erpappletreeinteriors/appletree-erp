# ERP-059 Transaction Contract Test Report

**Date:** 2026-09-10. Part 6 of Phase ERP-059A. Proves the narrow login fix (Part 3) did not
weaken `withTransaction()`'s rollback protection for anything else — every ordinary business
rejection tested still rolls back cleanly, in direct contrast to login's security bookkeeping,
which now correctly persists. Permanent test file: `tests/erp_059_transaction_contract_tests.js`.

## The contract being tested

```
BUSINESS REJECTION:               mutation -> ok:false -> mutation SHOULD disappear (rollback)
PERSISTED SECURITY/AUDIT EVENT:   mutation -> ok:false -> mutation MUST survive (no rollback)
```

## Fault-injection results

| # | Scenario | Domain | Expected | Result |
|---|---|---|---|---|
| 1 | Invalid Manual JE (negative debit line, ERP-023) posted | Finance | Rejected; `journalEntries` count unchanged | **PASS** — rejected, count identical before/after |
| 2 | Invalid GRN (negative accepted quantity, ERP-026) against a real, approved PO | Procurement | Rejected; the PO's own `qtyReceivedByLine` tracking unchanged | **PASS** — rejected, `qtyReceivedByLine` byte-identical before/after |
| 3 | Invalid PO (negative line quantity, ERP-029) | Procurement | Rejected; zero PO records created | **PASS** — rejected, PO list count unchanged |
| 4 | Invalid inventory movement (dispatch referencing a nonexistent material, ERP-030) | Logistics/Inventory | Rejected; zero dispatch records created | **PASS** — rejected, dispatch list count unchanged |
| 5 | Rejected workflow (Segregation-of-Duties self-approval: `finance1` submits a Manual JE, then attempts to approve their own draft) | Workflow/Governance | Rejected; the draft's status remains `Submitted`, not advanced | **PASS** — rejected, draft status still `Submitted` |
| 6 | Login failures (5× wrong password against `sales1`, the fix under test) | **Security — the one case that SHOULD now persist** | 5 DENY entries recorded in `loginHistory` | **PASS** — exactly 5 DENY entries present |

**Result: 6/6 PASS.** Items 1-5 prove the rollback contract is completely undisturbed for ordinary
business transactions across finance, procurement, inventory/logistics, and workflow/governance —
the login fix's `isLoginRoute` exclusion is scoped to exactly one route
(`pathname === '/api/login' && method === 'POST'`) and provably touches nothing else. Item 6 proves
the fix itself works, in direct, deliberate contrast to items 1-5.

## Why this matters

This is the concrete proof the phase brief required: a narrow, surgical fix to one route does not
have to mean "hope nothing else broke" — it can be, and here was, directly demonstrated with
before/after state comparisons on the exact mechanisms (journal entries, PO line tracking, document
counts, workflow status, and the login fix's own persistence) that would reveal a regression if one
existed.

## Command to reproduce

```
node tests/erp_059_transaction_contract_tests.js <isolated-base-url>
```
