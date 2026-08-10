# AEMS — Appletree Expense Management System
## Module 01 of the Appletree Business Platform (ABP)

Scope of this file: everything under `AEMS/`. This is a fresh module — do not touch
the sibling ERP files at the repo root (`appletree_erp_v2_1.html`,
`appletree_erp_offline.html`, `schema.sql`, `supabase_migration_*.sql`, etc.) unless
a task explicitly asks for the merge/integration work described in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Relationship to the existing ERP:** standalone. AEMS does not integrate with or
design toward the existing Supabase/Postgres web ERP — build it as its own
complete system.

## What this is

ABP is an enterprise platform. AEMS (expense management) is its first module.
Excel 365 is the first **client**, not the application. Business logic must never
depend on Excel — it must be portable to a future web/desktop/mobile/API client
without rewrite.

Never think in worksheets. Think in domain models, services, business rules,
workflows, and layers.

## Layering (Clean Architecture)

```
Presentation   → Excel UserForms / ribbon (MVVM-ish: display, validate input, trigger commands)
Application    → use-case orchestration (command/query handlers)
Business       → domain models, business rules, workflow engine — no Excel/VBA-object-model references
Infrastructure → cross-cutting: logging, notifications, file I/O
Persistence    → repository interfaces + Excel Table implementation today; swappable later
Integration    → anything talking to the outside world (future: REST API, Dataverse, ERP)
```

Business rules live in `modules/`, never in Excel worksheet code-behind or UserForm
event handlers. A UserForm event handler may only: read input, call a use case, render
the result.

## Repo map

```
AEMS/
  CLAUDE.md              this file
  docs/                  FRD, BRD, SDD, ARCHITECTURE, WORKFLOW, CODING_STANDARDS,
                          DATABASE, UI_GUIDELINES, TESTING, PRODUCT
  modules/
    core/                platform services shared by all future ABP modules
                          (domain/ interfaces like IClock/IIdGenerator; infrastructure/
                          concrete impls; persistence/ generic Excel Table helpers)
    expense/             Expense bounded context: domain/ application/ persistence/
    approval/             Approval bounded context: domain/ (owned by Expense
                          aggregate at runtime, see docs/SDD.md #1)
    payment/               Payment bounded context: domain/ application/ persistence/
    shared/               kernel types shared across contexts (Enums.bas) — no business rules
  ui/
    excel-client/         VBA project, UserForms, ribbon XML, workbook
  tests/
    unit/ integration/ workflow/
  scripts/                build/release/packaging scripts
  assets/branding/        logo, colors, fonts sourced from Apple Tree_Brand Guideline.pdf
```

Modules not yet started (Purchase, Inventory, Manufacturing, CRM, Payroll, HR,
Projects, Accounting) are listed in `docs/PRODUCT.md` as future work — do not
scaffold them until there is an actual task for them.

## Required process per task

1. Read the relevant doc(s) in `docs/` first — update them if the task changes
   a decision.
2. Identify what module/bounded context owns the change.
3. Implement in the business layer first, then wire presentation to it.
4. Add/update tests (unit at minimum; workflow tests for anything touching the
   approval chain).
5. Update the relevant doc(s) to match what was actually built.
6. Report: files created/modified, business rules added, tests added, doc updates,
   next planned step. Do not skip this report.

Never invent business specifics (approval currency tiers, real employee roles,
expense categories, escalation timeouts) — those come from the CEO. Where the
master spec used a generic placeholder workflow, it is marked TBD in
`docs/WORKFLOW.md` until confirmed.

## Golden rules

- Excel is a client, not the application.
- Business rules must never depend on Excel or VBA's object model.
- Extend existing modules; never recreate functionality that already exists.
- Preserve backward compatibility once a module has real users/data.
- Optimize for maintainability over speed of delivery.
- No module is "done" until its tests pass.
