# AEMS / ABP — Coding Standards

Applies to all VBA code under `ui/excel-client` and `modules/`. Future clients
(web/desktop/mobile) will need a language-appropriate equivalent of this document;
don't assume these VBA-specific rules translate literally.

## 1. Layer discipline (enforced by review, not by the compiler)

- `modules/*/domain` and `modules/*/application`: **no** `Worksheet`, `Range`,
  `ListObject`, `UserForm`, or `Application` (Excel) object references. If a
  domain/application module needs current date/time or a new ID, it goes through
  an injected abstraction (e.g. `IClock`, `IIdGenerator`), not `Now()`/ad hoc.
- `ui/excel-client` (UserForm code-behind): may only read controls, call one
  Application-layer use case, and render the result/error. No business rule
  (validation beyond "is this field non-empty", calculation, status transition)
  may live in a UserForm module.
- Persistence implementations are the only place `ListObject`/`Range` may appear
  outside the UI layer.

## 1a. A class's own identifiers must not collide with its Property names

VBA is case-insensitive, and in this codebase, *any* identifier inside a
class module that case-insensitively matches one of that class's own
`Property` names — a `Dim`, a type keyword used elsewhere, or (the common
case) a `Sub`/`Function` **parameter** name — silently breaks that class's
members from being resolvable when called *from another module*. The
symptom is a VBE "Compile error: Method or data member not found" pointing
at the *first* cross-module call into the class, which may be nowhere near
the actual colliding identifier. The declaration itself shows no error and
looks completely normal.

Two confirmed variants, both hit for real in this codebase:

1. **Type collision**: `ExpenseRequest` had a `Currency` property *and*
   used the VBA `Currency` type for `TotalAmount`'s return type. Renamed
   the property to `CurrencyCode`; separately, the `Currency` VBA type
   itself was dropped project-wide in favor of `Double` (see
   `ExpenseLineItem.Amount`) once it became clear that merely *using* the
   `Currency` type anywhere in a class was enough to trigger this, not
   just naming a member `Currency`.
2. **Parameter collision**: every `Init`/`Hydrate` method in this codebase
   originally named its parameters after the properties they populate
   (`Sub Hydrate(id As String, ...)` inside a class with an `Id` property).
   That reads naturally but is exactly this same collision. Fixed by
   prefixing every such parameter with `in` (`inId`, `inCreatedAt`, ...) —
   see `ExpenseRequest.Hydrate`, `ApprovalStep.Hydrate`,
   `ApprovalHistoryEntry.Init`, `PaymentRecord.Hydrate`/`Init`/`MarkPaid`,
   `ApprovalChain.Init` for the applied fix.

Rule going forward: when a `Sub`/`Function` parameter's natural name would
match one of its own class's Property names, prefix it (`in` for
constructor/hydration-style inputs) rather than let it collide. This is not
a style preference — the collision breaks real functionality.

## 1b. Repository hydration pattern

A repository reconstructing an aggregate from storage is not performing a
business transition (e.g. loading a `Paid` expense doesn't mean someone just
paid it) — so it must bypass the aggregate's normal rule-enforcing methods.
Each aggregate exposes `Public Sub Hydrate...` methods for exactly this,
documented inline as "repository-only". These are `Public`, not `Friend`:
`Friend` procedures did not resolve as callable members across modules in
this VBA project in practice (a real, reproduced compile error, "Method or
data member not found" on an otherwise-correctly-declared Friend member) —
so `Public` is the only access level confirmed to work reliably here.
Treat "only call `Hydrate*` from `modules/*/persistence`" as an
enforced-by-review convention, same as the layer rules in §1.

## 2. Naming

- Classes: `PascalCase` nouns (`ExpenseRequest`, `ApprovalStep`).
- Interfaces: `I`-prefixed (`IExpenseRepository`) — VBA convention, since VBA has
  no formal `interface` keyword; an interface is a class module with only
  method stubs (`Err.Raise` "not implemented" bodies) that concrete classes
  implement via `Implements`.
- Procedures: `PascalCase` verbs (`SubmitExpense`, `ApproveStep`).
- Local variables: `camelCase`. Module-level private fields: `m` + PascalCase
  (`mExpenseId`).
- Enums for anything with a fixed, named set of values (status, category) —
  never magic strings or numbers for state.

## 3. SOLID / DRY / KISS, applied

- **Single Responsibility**: one class module = one concept. A "manager" class
  that does five unrelated things is a signal to split it.
- **Open/Closed**: new expense categories or approval steps should be
  data/config changes where possible, not new `Select Case` branches scattered
  across the codebase. If a `Select Case` on status/category appears in more
  than one place, that's a sign the logic belongs in one place (the domain
  model) and callers should ask the object, not branch on its type themselves.
- **Dependency Inversion**: Application layer depends on repository/service
  *interfaces*, constructed and injected by a small composition-root module —
  not on concrete Excel-backed classes directly.
- **DRY**: shared validation/formatting logic goes in `modules/shared`, not
  copy-pasted between UserForms.
- **KISS**: don't build a generic workflow engine before there's a second
  workflow to generalize from. Right now there's one (Expense→Approval→Payment)
  — build that well; generalize when a second module needs it.

## 4. Error handling

- Domain/application code raises typed errors (custom `Err.Raise` number ranges
  documented per bounded context) — never `On Error Resume Next` to silently
  swallow a failure.
- Presentation layer is the only place that catches an error and turns it into
  a user-facing message.
- No validation for states that can't occur (e.g. don't defensively re-check a
  precondition the caller already guarantees) — validate at real boundaries:
  user input and any future external integration.

## 5. Comments & documentation

- Code should be self-explanatory via naming; comment only the non-obvious WHY
  (a constraint from BRD/FRD, a workaround, an invariant that isn't visible
  from the code itself).
- No commented-out code committed.
- Every public class/interface gets a one-line header comment stating its
  responsibility — not a multi-paragraph doc block.

## 6. Version control

- One feature = one branch = one logical commit sequence (per repo's existing
  convention — see root `.git` history for style: short imperative summary
  line, optional detail).
- Don't mix a docs-only change with a code change in the same commit unless
  the code change is what the doc describes.
