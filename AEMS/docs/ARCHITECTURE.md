# AEMS / ABP — Architecture

Status: scaffold. No code exists yet. This document defines the shape future code
must fit, not a description of an existing system.

## 1. Layering

Clean Architecture, dependency direction always points inward (Presentation and
Infrastructure depend on Business; Business depends on nothing outside itself).

| Layer | Responsibility | Lives in | May reference |
|---|---|---|---|
| Presentation | Excel UserForms, ribbon commands, cell-level display | `ui/excel-client` | Application |
| Application | Use-case orchestration (commands/queries), transaction boundaries | `modules/<context>/application` | Business |
| Business | Domain models, business rules, workflow/state-machine logic | `modules/<context>/domain` | nothing (pure) |
| Infrastructure | Logging, notification, file I/O, audit trail | `modules/core` | Business (via interfaces) |
| Persistence | Repository implementations | `modules/<context>/persistence` | Business (implements its repo interfaces) |
| Integration | Outbound calls to other systems (future: ERP, REST) | `modules/core/integration` | Business (via interfaces) |

Rule of thumb: if a piece of logic would give a different answer when you swap
Excel for a web form, it does not belong in Presentation. If it would give a
different answer when you swap Excel Tables for SQL Server, it does not belong in
Persistence.

## 2. Bounded contexts (this module)

AEMS owns three bounded contexts, each with its own domain model — do not let one
context reach into another's internals; they talk through defined interfaces/events.

- **Expense** — expense request lifecycle, categories, line items, attachments.
- **Approval** — the approval chain/workflow engine, routing, escalation, history.
- **Payment** — marking an approved expense paid, payment method/reference.

`modules/core` holds platform services usable by *any* future ABP module, not just
AEMS: Authentication, Authorization, User Management, Audit Engine, Notification
Engine, Master Data Engine, Settings Engine, File Management, Logging. Build these
generically from day one — do not hardcode "expense" concepts into `core`.

## 3. Persistence abstraction

Every bounded context defines repository *interfaces* in its domain layer
(e.g. `IExpenseRepository`). The Excel-client build ships one implementation
backed by Excel Tables (ListObjects). No business or application code may
reference a worksheet, Range, or ListObject directly — only the repository
implementation may.

See [DATABASE.md](DATABASE.md) for the persistence contract and the Excel Tables
schema conventions.

## 4. Relationship to the existing web ERP

The CEO's direction (2026-08-07): AEMS should be built so it *can eventually merge*
with the existing Supabase/Postgres ERP (`appletree_erp_v2_1.html`,
`schema.sql`, `supabase_migration_*.sql` at the repo root), but the two are not
integrated today and no merge work should begin without an explicit task for it.

Practical implication for design decisions made now:
- Domain models should be expressible as normalized relational tables (the ERP
  already uses Postgres) — avoid Excel-specific data shapes leaking into the
  domain layer (e.g. no "row number as identity").
- Entity IDs should be stable, globally-unique values (GUID/UUID), not
  worksheet-row-dependent, so records could later be migrated into the ERP's
  Postgres tables without a remapping step.
- Where the ERP already has an equivalent concept (it has Bill Builder / Pay Bill
  / Accounts flows per its commit history), name AEMS's domain concepts so a
  future mapping is obvious rather than colliding (e.g. don't reuse "Bill" for a
  different meaning than the ERP uses it).
- Do not attempt schema alignment, shared auth, or data sync now — that is future
  work, tracked as a TBD module in [PRODUCT.md](PRODUCT.md).

## 5. Client independence

Business and Application layers must compile/run logically without any Excel
object model reference. In VBA this is enforced by convention (no `Worksheet`,
`Range`, `ListObject`, `UserForm` types in `modules/*/domain` or
`modules/*/application` — only in `ui/excel-client` and the persistence
implementation). A future Web/Desktop/Mobile/API client re-implements only the
Presentation layer and a new Persistence implementation; Business/Application
carry over.

## 6. Open questions (not yet decided)

- Concrete workflow engine design (generic state machine vs. hardcoded chain) —
  depends on real approval requirements, see [WORKFLOW.md](WORKFLOW.md).
- Multi-user concurrency model for a shared Excel workbook (file locking? one
  workbook per user with a merge step? SharePoint co-authoring?) — needs a
  decision before `ui/excel-client` implementation starts.
