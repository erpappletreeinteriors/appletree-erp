# ARCH-2026-002 — W4 Dependency Impact

**Date:** 2026-09-26. Deliverable per this CR's own §10 architecture-preservation requirement, read
together with `ARCH-2026-002-WAVE-4-DEPENDENCY-MAP.md` (the Phase 0 source document, re-cited not
re-derived here).

## Existing architecture that must remain intact (re-confirmed, none touched by this gate)

| Engine | Status |
|---|---|
| ONE GL ENGINE (`postJournalEntry()`) | Re-confirmed singular, unmodified. |
| ONE AR ENGINE (`createDraft()`/`draftCustomerInvoice()` chain) | Re-confirmed singular — Service Billing's two sub-paths both converge here (see `ARCH-2026-002-W4-ACCOUNTING-IMPACT.md`). |
| ONE INVENTORY MOVEMENT ENGINE (`postInventoryMovement()`) | Re-confirmed singular — Service Material issue delegates fully via `createMaterialIssue()`. |
| ONE PROJECT-COST MODEL (`projectPL()`/`projectFinancial360()`) | Re-confirmed singular — `coreProjectPL()` is built BY SUBTRACTING after-sales amounts from `projectPL()`'s own output, never a second calculation. |
| ONE CAPA ENGINE | Re-confirmed singular — the After-Sales entry point and Quality Management's own entry point write into the SAME `DB.capaCases` collection through the SAME functions. |
| ONE NUMBERING ENGINE (`nextDocNumber()`/`nextId()`) | Re-confirmed — every Phase 10 document type (`WAR`,`CMP`,`TKT`,`VIS`,`AMC`,`CAPA`) uses it. |
| ONE AUTHORIZATION ENGINE (`can()`/role arrays) | Re-confirmed — no Service-specific authorization mechanism exists. |
| ONE DATA-SCOPE ENGINE (`hasScopeAccess()`) | Re-confirmed, live-tested (cross-customer denial proven). |
| ONE SoD ENGINE (`checkSoD()`/`RBAC_SOD_RULES_SEED`) | Re-confirmed — SOD-11 intact; any future Complaint/Ticket/AMC rule would reuse this exact engine, per the (deferred) Sub-wave 4C design. |
| ONE APPROVAL ENGINE | Re-confirmed — Service Billing inherits the standard Draft maker-checker-poster chain unmodified. |
| ONE AUDIT ENGINE (`logAudit()`/`durableFailureAudit`) | Re-confirmed — the 6 missing calls (IN SCOPE, future CR) would use this SAME engine, not a new one. |
| ONE TRANSACTION WRAPPER (`withTransaction()`) | Re-confirmed, unmodified. |
| ONE CENTRAL CLEARING MODEL (`applyClearing()`) | Re-confirmed — Customer Receipt against a Service Invoice clears through the same mechanism as any other invoice. |

**No item classified IN SCOPE or POLICY DEPENDENT in this gate's own Implementation Scope document
proposes touching, forking, or bypassing any engine above.** This was verified explicitly for each of the
12 decision items — none introduces a second GL/AR/inventory/CAPA/numbering/authorization/scope/SoD/
approval/audit/transaction/clearing mechanism, even under its most invasive named option (e.g. W4-6
Option B, a Warranty Provision account, is a NEW ACCOUNT under the EXISTING GL engine, not a new engine).

## Cross-wave dependency re-confirmation

Re-verified against `ARCH-2026-002-W3-DECISION-RESOLUTION.md` and `ARCH-2026-002-WAVE-4-DEPENDENCY-MAP.md`
(not merely cited): **none of the 9 W3 items (W3-1 through W3-9) blocks any of the 12 W4 items.** The one
non-blocking relationship worth restating: if W3-7 (Cost Allocation) is ever authorized, it would deepen
(not enable) any future "Service profitability" reporting — `afterSalesFinancials()`/`coreProjectPL()`
already produce a real, correct figure today without it.

**No Wave 5/6 functionality is required by anything in this gate.** All 12 W4 items are scoped entirely
within Service & After-Sales, Central Accounting, Controlling, and Security/Audit — domains already
established by Waves 1-3.

## Impact of NOT deciding (cost of continued deferral)

| Deferred item | Cost of continued OPEN status |
|---|---|
| W4-1/2/3/4 | Continued manual effort (warranty entry, classification, AMC scheduling, no Resolution-SLA visibility) — operational, not structural. |
| W4-5 | Labour-cost consistency across technicians remains unenforced — a real but non-critical Controlling-depth gap. |
| W4-6 | Warranty cost remains expensed-at-issue (a valid, already-correct accounting treatment) — no urgency to change absent a specific reporting need. |
| W4-7 | Duplicate-billing remains theoretically possible via operator error — mitigated, not eliminated, by the existing Draft maker-checker-poster chain. |
| W4-8/9 | Complaint/Ticket/AMC/below-threshold-Visit self-closure/self-billing remains possible for a single actor — a disclosed, non-CRITICAL risk, consistent with the CEO/Admin combined-role reality already accepted elsewhere. |
| W4-11 | Per-technician/Cost-Centre Service Labour reporting remains unavailable — a reporting-depth limitation, not a data-integrity risk. |
| W4-12 | Multi-branch service-territory reporting/scoping remains unavailable — Project/Customer scope already govern actual access, so this is not an access-control risk. |

None of the above rises to this CR's own §26 STOP-condition bar (no CRITICAL security issue, no
architectural violation, no ambiguous ownership).
