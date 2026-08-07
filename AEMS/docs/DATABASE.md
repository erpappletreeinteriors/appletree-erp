# AEMS / ABP — Database & Persistence Design

Status: scaffold. Defines the contract, not an existing implementation.

## 1. Principle

Business logic must not change when the persistence technology changes. All data
access goes through repository interfaces defined in each bounded context's domain
layer (see [ARCHITECTURE.md](ARCHITECTURE.md)). Swapping Excel Tables for SQLite,
SQL Server, PostgreSQL, or Dataverse later means writing a new implementation of
those interfaces — zero changes to Business or Application code.

## 2. Repository contract (initial pattern)

Each aggregate root gets one repository interface, defined in VBA as a class module
with method signatures only meaningful in domain terms — no worksheet/range
vocabulary:

```
IExpenseRepository
  GetById(id As String) As ExpenseRequest
  GetByStatus(status As ExpenseStatus) As Collection
  Save(expense As ExpenseRequest)
  Delete(id As String)
```

Concrete implementation (`ExcelExpenseRepository`) is the only code allowed to
touch a `ListObject`.

## 3. Initial implementation: Excel Tables

- Each aggregate root maps to one Excel Table (`ListObject`), one row per entity.
- Every table has a stable, generated primary key column (GUID, not row number —
  see [ARCHITECTURE.md](ARCHITECTURE.md) §4 on why row-number-as-identity is
  disallowed).
- Foreign keys are GUID columns referencing another table's primary key — no
  positional/row-index references between tables.
- One hidden "system" worksheet per bounded context holds its tables, separate
  from any user-facing dashboard/report worksheets.
- Audit columns on every table: `CreatedAt`, `CreatedBy`, `ModifiedAt`,
  `ModifiedBy` — populated by the repository layer, never by the UI.
- No soft-delete-by-formatting or hidden-row tricks — deletion is an explicit
  status/flag column or a real row removal via the repository, matching the
  hard lesson already learned in the sibling ERP project (deleted records must
  not silently reappear).

## 4. Concurrency

Open question — not yet decided (tracked in ARCHITECTURE.md §6). A single shared
`.xlsm` has no row-level locking; options to evaluate when `ui/excel-client`
implementation starts:
- Workbook-level file lock (simplest, blocks concurrent writers entirely).
- Optimistic concurrency via a `RowVersion`/timestamp column checked on Save,
  reject with a conflict error if stale.
- SharePoint/OneDrive co-authoring (has VBA limitations, needs evaluation).

Do not pick one silently inside an unrelated feature task — this needs its own
decision.

## 5. Future persistence targets

| Target | When | Notes |
|---|---|---|
| SQLite | If AEMS needs true multi-user without a server | Repository swap only |
| SQL Server | If deployed on-prem with existing infra | Repository swap only |
| PostgreSQL | If merged into the existing ERP (see ARCHITECTURE.md §4) | Reuse ERP's existing Supabase/Postgres instance; requires schema mapping exercise, not started |
| Dataverse | If a Power Apps client is built | Repository swap only |

## 6. Schema

No tables are defined yet — they follow from the real expense workflow (BRD/FRD),
which is pending CEO input. Do not invent categories, approval tiers, or field
lists here; add them once BRD.md/FRD.md have real content.
