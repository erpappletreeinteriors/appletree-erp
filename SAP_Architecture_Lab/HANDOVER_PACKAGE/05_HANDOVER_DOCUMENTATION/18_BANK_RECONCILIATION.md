# 18 — Bank Reconciliation

Screen: **Finance → ICICI Bank Import**.

## Status lifecycle of every imported bank line
Imported → Matched (linked to an existing accounting entry) / Excluded (with a required reason) / Returned (identified as a bounced/reversed payment) → Reconciled. A line can also be Posted directly (Allocated to a GL account) if no existing entry matches it, or Duplicate (safely ignored if the exact same transaction is imported twice).

## Importing is never the same as posting
Importing a statement never creates an accounting entry by itself. An accountant must explicitly **Match** a line to an existing document, or **Allocate** it (choose a GL account and post a new entry), before it affects the books.

## Suggested classifications are suggestions, not decisions
The importer reads each transaction's description and suggests a likely category ("Salary/Wage Payment," "Supplier/Material Payment," etc.) — this is always a hint for you to confirm, never an automatic accounting decision. A description mentioning a project or supplier name does not, by itself, prove which project or supplier it really belongs to.

## Returned transactions
The importer automatically detects returned/bounced payments (NEFT returns, "Incorrect Account Number," etc.) and, where the bank's own reference number allows it, links the return back to the original transaction. If a link can't be confidently made from the data (a different reference format), the return is still flagged, just not auto-linked — an accountant should confirm manually.

## Duplicate protection
The same bank transaction (identified by its unique Transaction ID, not by matching the description) can never be imported and accounted for twice, even if the same statement file is imported again by accident.

## Reconciliation summary
Shows Statement Balance, ERP Bank Balance, the exact Reconciling Difference (never hidden), Outstanding Deposits/Payments with amounts, and counts of unmatched/returned lines.

See `19_ICICI_IMPORT.md` for the exact file format this importer expects.
