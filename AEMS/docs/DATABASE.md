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

AEMS is standalone (see [ARCHITECTURE.md](ARCHITECTURE.md) §4) — no target below
assumes integration with the existing web ERP.

| Target | When | Notes |
|---|---|---|
| SQLite | If AEMS needs true multi-user without a server | Repository swap only |
| SQL Server | If deployed on-prem with existing infra | Repository swap only |
| PostgreSQL | If AEMS outgrows a single shared workbook | Own instance, own schema — not the existing ERP's database |
| Dataverse | If a Power Apps client is built | Repository swap only |

## 6. Schema (v1 — structural, not business content)

The tables below store the shape defined in [SDD.md](SDD.md) §1 — they do not
encode any invented business rule (no category list, no ₹ tiers). All on a
hidden "AEMS_System" worksheet, one `ListObject` per table.

**tblExpenses** (`ExpenseRequest`)
| Column | Type | Notes |
|---|---|---|
| Id | text (GUID) | PK |
| RequesterId | text | |
| Category | text | free text until BRD confirms a real list |
| Description | text | |
| Currency | text | fixed `"INR"` |
| Status | number | `ExpenseStatus` enum value |
| ChainCurrentStepIndex | number | 1-based; part of the owned ApprovalChain, stored here since it's 1:1 |
| ChainReturnToStepIndex | number | 0 = none awaiting resubmission |
| ChainIsComplete | boolean | |
| CreatedAt / CreatedBy / ModifiedAt / ModifiedBy | date/text | audit columns |

**tblExpenseLineItems** (`ExpenseLineItem`, child of an expense)
| Column | Type | Notes |
|---|---|---|
| Id | text (GUID) | PK |
| ExpenseId | text (GUID) | FK → tblExpenses.Id |
| Description | text | |
| Amount | currency | |

**tblExpenseAttachments** (file references, child of an expense)
| Column | Type | Notes |
|---|---|---|
| Id | text (GUID) | PK |
| ExpenseId | text (GUID) | FK → tblExpenses.Id |
| FileReference | text | path/link — attachment storage mechanism itself is TBD |

**tblApprovalSteps** (`ApprovalStep`, child of an expense's chain)
| Column | Type | Notes |
|---|---|---|
| Id | text (GUID) | PK |
| ExpenseId | text (GUID) | FK → tblExpenses.Id |
| StepOrder | number | 1–5, fixed chain order |
| Role | number | `ApprovalRole` enum value |
| AssignedUserId | text | |
| Status | number | `ApprovalStepStatus` enum value |
| ActedBy | text | |
| ActedAt | date | |
| Comment | text | |

**tblApprovalHistory** (`ApprovalHistoryEntry`, append-only)
| Column | Type | Notes |
|---|---|---|
| Id | text (GUID) | PK |
| ExpenseId | text (GUID) | FK → tblExpenses.Id |
| StepRole | number | `ApprovalRole` enum value |
| Action | number | `ApprovalAction` enum value |
| ActorId | text | |
| Timestamp | date | |
| Comment | text | |

**tblPayments** (`PaymentRecord`)
| Column | Type | Notes |
|---|---|---|
| Id | text (GUID) | PK |
| ExpenseId | text (GUID) | FK → tblExpenses.Id, 1:1 |
| Status | number | `PaymentStatus` enum value |
| Method | text | free text until BRD confirms real values |
| PaidAt | date | |
| PaidBy | text | |
| PaymentReference | text | |

Implemented by `ExcelExpenseRepository` (modules/expense/persistence) and
`ExcelPaymentRepository` (modules/payment/persistence) — the only code
permitted to reference these tables directly.
