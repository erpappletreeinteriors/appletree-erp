# ARCH-2026-002 — W4 Data-Model Impact

**Date:** 2026-09-26. Consolidates the data-model-change dimension across all 12 W4 decision items,
cross-referencing `ARCH-2026-002-WAVE-4-DATA-MODEL-GAP-REGISTER.md` (the Phase 0 source) through this
gate's own decision/scope lens. No schema change is made by this document — it is a mapping only.

| Item | Data-model change if implemented | New entity? | New field? | Migration needed? |
|---|---|---|---|---|
| Audit-log calls (IN SCOPE) | None — reuses `DB.auditLog`. | No | No | None |
| CAPA source-ID validation (IN SCOPE) | None — validation only, no new field. | No | No | Pre-flight check of existing `DB.capaCases` for phantom IDs recommended before enforce mode. |
| W4-1 (Warranty policy) | Option B: new warranty-template master. Option C: new duration-by-product-type config. | Possibly (Option B) | Possibly | None either way. |
| W4-2 (Classification automation) | None — reuses existing `warrantyEligibility()`. | No | No | None. |
| W4-3 (AMC scheduling automation) | None — loops the existing `createAMCScheduleEntry()`. | No | No | Optional backfill for existing ACTIVE contracts — a genuine operational choice, not required. |
| W4-4 (Resolution SLA) | None — the field/mechanism (`ticketSlaStatus()`) already exists; only a configuration VALUE is missing. | No | No | None. |
| W4-5 (Rate-card enforcement) | None new — `DB.serviceLabourRates` already exists; only the lookup-linkage is missing. | No | No | None. |
| W4-6 (Warranty accounting) | Option B: new GL account (e.g. Warranty Provision). | No (account, not entity) | New GL account | Significant if Option B — a real recognition-timing change; unassessed further pending the decision itself. |
| W4-7 (Duplicate-billing guard) | A uniqueness constraint or a period-key mirroring `recognizeAMCRevenue()`'s own `recognizedPeriods` pattern. | No | Possibly (a tracking array/field) | None — new calls only, no retroactive effect. |
| W4-8 (SoD expansion) | New `RBAC_SOD_RULES_SEED` entries (data, not schema). | No | New config rows | None. |
| W4-9 (Diagnosis threshold) | None if Option A/B (config value only); none if Option C either (reuses existing SoD/checkSoD mechanism). | No | No | None. |
| W4-10a (CAPA validation) | Same as "IN SCOPE" row above. | No | No | Same. |
| W4-10b ("Site issue" origin) | Option B: new field on `DB.complaints`/`DB.serviceTickets` or `DB.capaCases`. | No | Possibly | None if additive. |
| W4-11a (Technician persistence) | New field on the JE line / labour-entry cross-reference. | No | Yes (`technicianId` persisted) | None for new records; historical entries CANNOT be retrofitted (value never captured). |
| W4-11b (Cost Centre tagging) | New `CC-SERVICE` master record (or reuse existing) + `costCentreId` field on JE lines. | Possibly (1 master row) | Yes | None for new records; historical entries would need an invented value — explicitly not assumed. |
| W4-12 (Site/Branch scope) | New `siteId`/`branchId` FK on Service Visit if Option B. | No | Yes | LOW-MEDIUM — existing free-text `site` values would need mapping or coexistence; a genuine, non-trivial decision, not designed further. |

## Summary

**Zero items propose a new collection/table.** The largest data-model changes on the table (a Warranty
Provision GL account under W4-6 Option B, and a Service Visit site/branch FK under W4-12 Option B) are
both additive to existing structures (a new GL account row; a new FK column), not new entities. **No item
anywhere in this register risks the kind of historical-data unrecoverability that would itself constitute
a migration-risk STOP condition** — the two irrecoverable-history items (W4-11's `technicianId`/
`costCentreId` for PRE-DECISION postings) affect only reporting completeness for already-posted
transactions, not their correctness, and are explicitly disclosed rather than silently accepted.
