# WAVE2_CHANGELOG.md

**Date:** 2026-09-22. Every subsystem changed in this Wave 2 implementation pass.

## `server/domain.js`

- `RBAC_SOD_RULES_SEED` — 5 new entries: SOD-7 (Production Order creator vs completer), SOD-8 (Job Work
  Order creator vs linked Supplier Bill creator), SOD-9 (Job Work Order creator vs settlement actor),
  SOD-10 (QC checklist creator vs result submitter), SOD-11 (CAPA effectiveness-checker vs closer).
- `completeProductionOrder()` — SOD-7 guard added.
- `draftSupplierInvoice()` and `draftSupplierInvoiceFromPO()` — SOD-8 guard added to each function's
  existing `jobWorkOrderId` branch.
- `returnFromJobWorker()`, `recordJobWorkScrap()`, `directDispatchFromJobWorker()` — SOD-9 guard added
  to each.
- `createQCChecklist()` — W2-2 fix: now calls `logAudit({type:'QCChecklistCreated', ...})`.
- `submitQCResult()` — SOD-10 guard added.
- `closeCAPACase()` — SOD-11 guard added.

**No new function, no new collection, no new central engine.** Every change is an additive guard clause
or a single audit call inside an existing function, using the existing `checkSoD()`/`DB.sodRules`
engine and the existing `logAudit()`/`durableFailureAudit` mechanisms exclusively.

## `server/server.js`

**No changes.** Every route these 5 rules protect already existed with its own, unchanged role gate —
this pass adds no new route and narrows no existing route's authorization.

## `client_secure/index.html`

**No changes.**

## Tests

- `tests/erp_arch_2026_002_wave2_tests.js` — new, 26/26 PASS.

## Why this is additive-only

Every new SoD rule sits INSIDE an already-existing, already-tested function, gating an action that was
previously ungated by identity — the function's own existing validation, accounting, inventory, and
audit-on-success behavior is completely unchanged for the case where the new rule does not fire (a
legitimate, different-user call proceeds exactly as before). This is why the full regression battery
(`WAVE2_REGRESSION.md`) shows zero new failures: nothing about the EXISTING passing scenarios changed,
only a previously-open self-dealing path was closed.
