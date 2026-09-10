# 07 — Data Scope

Data scope answers: "given a user's role, exactly which records can they see or touch?" This is separate from and in addition to what ACTIONS their role can perform (see `05_USER_ROLES.md`).

| Dimension | Who is scoped | Rule |
|---|---|---|
| Customer | Sales | Only customers in that Sales user's `assignedCustomers` list |
| Project | ProjectManager | Only projects in `assignedProjects`, OR any project where they are set as `projectManagerId` (both checked — a PM assigned during a live "Won" transition is not locked out) |
| Branch | All roles (mechanism ready) | A user's `assignedBranches` restricts which branch's data they can act on, where branch scoping is applied — currently only one real branch ("Ulliyeri") exists |
| Financial data (GL, Bank, Trial Balance) | Purchase, Sales, Estimator, ProjectManager | Cannot view at all — restricted to Admin/CEO/Accountant/FinanceManager/Viewer |
| Bank/Fixed Asset/Opening Balance data | Same as above | Same GL-visible-roles gate |

## How scoping is enforced
Every list-returning endpoint filters its results server-side before sending anything back — an unauthorized record is never present in the response, not merely hidden by the browser. Every single-record endpoint re-checks the caller's scope against that specific record's owner/project/customer before returning or modifying it.

## What is not yet scoped
Cost Centre and Profit Centre visibility is currently not role-restricted (all GL-visible roles see the full list) — this has not been requested and no real need has surfaced.
