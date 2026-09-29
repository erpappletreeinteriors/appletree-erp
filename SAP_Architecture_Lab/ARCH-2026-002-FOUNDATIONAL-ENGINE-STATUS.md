# ARCH-2026-002 — Foundational Engine Status

**Date:** 2026-09-26. Deliverable per this CR's own §12. **All 13 named engines re-confirmed singular. No
STOP condition triggered — none required repair, and none was repaired (audit only, per this CR's own
rule).**

| # | Engine | Owner (function) | Current state | Single engine? | Known gaps | Dependencies | Safe to defer further work? | Required future work |
|---|---|---|---|---|---|---|---|---|
| 1 | GL | `postJournalEntry()` (`domain.js:2297`) | EXISTING, mature | **YES** — re-confirmed via grep (`E1` assertions, every Wave 3+ regression) | None | Numbering, Authorization, Audit | Yes | None identified |
| 2 | AR/AP | `createDraft()`/`draftCustomerInvoice()`/`draftSupplierInvoiceFromPO()` chain, all funneling into GL | EXISTING, mature | **YES** — re-confirmed via Transaction Ownership passes across Waves 1-4; Service Billing's 2 sub-paths both converge here | None structural — AR/AP subledger reconciliation confirmed clean at every stress test | GL, Numbering, Approval | Yes | None identified |
| 3 | Inventory Movement | `postInventoryMovement()` (`domain.js:4976`) | EXISTING, mature | **YES** — re-confirmed; stock is fully derived, never a stored mutable balance (structurally prevents a shadow writer) | None | GL (valuation), Master Data (materials) | Yes | None identified |
| 4 | Project Cost | `projectPL()`/`projectFinancial360()` | EXISTING, mature | **YES** — `coreProjectPL()` (After-Sales) built BY SUBTRACTING from this same output, never a second calculation | Depreciation/Job-Work costs correctly summed but not separately labeled (W3-9, OPEN, cosmetic only) | GL, Project master | Yes | None structural — W3-9 is a labeling decision, not an engine gap |
| 5 | Numbering | `nextDocNumber()`/`nextId()` | EXISTING, mature | **YES** | Wave 1's own ad-hoc-ID pattern for Lead/EstimationRequest/CostingVersion/Design/standard-cost-baseline (item 4, OPEN) — internal IDs only, not GL/audit-facing document numbers | None | Yes | Item 4's migration to `nextId()` remains a candidate, independent, low-risk |
| 6 | Authorization | `can()` + `ROLE_ACTIONS` + `RBAC_PRIVILEGES`/`RBAC_DUTIES` bridge | EXISTING, mature | **YES** | Sales & CRM's legacy inline-role-check pattern (item 4) not yet migrated onto the newer dispatcher | Master Data (users/roles) | Yes | Item 4's migration remains a candidate |
| 7 | Data Scope | `hasScopeAccess()` | EXISTING, mature | **YES** | Branch/Site scope inconsistently wired across domains (a long-disclosed, accepted condition, not a fragmentation); Service Visit's `site` remains free text (W4-12, OPEN) | Master Data (Project/Customer/Branch) | Yes | W4-12 remains Wave-4-scoped, parked with Wave 4 |
| 8 | SoD | `checkSoD()` + `RBAC_SOD_RULES_SEED` (11 rules, SOD-1..11) | EXISTING, mature | **YES** | 5 open candidate rules across Treasury/Asset/Service (W3-2/3/4, W4-8/9) — all explicitly undecided, not silently unimplemented | Authorization, Audit | Yes | Each candidate rule remains independently gated on its own management decision |
| 9 | Approval | `resolveApprovalAuthority()` + 4 threshold/role-tier tables | EXISTING, mature | **YES** | Payment Approval Matrix finalization (W3-1, DEFERRED) — governance-only, not functional | Authorization | Yes | None urgent |
| 10 | Audit | `logAudit()` + `DB.auditLog` + `durableFailureAudit` (the Wave-2-discovered survival pattern) | EXISTING, mature | **YES** | 6 missing calls in Service & After-Sales (Gap-6, IMPLEMENT-recommended, unauthorized); a pre-existing SOD-6 instance of the same historical `durableFailureAudit` gap (disclosed, not fixed, out of every prior CR's scope) | Transaction Wrapper | Yes | Both remain independently actionable candidates once a future CR authorizes coding |
| 11 | Transaction Wrapper | `withTransaction()` | EXISTING, mature | **YES** | None currently open | GL/Inventory/Audit (snapshot/rollback) | Yes | None identified |
| 12 | Clearing | `applyClearing()` (`domain.js:3366`) | EXISTING, mature | **YES** | None currently open | GL, AR/AP | Yes | None identified |
| 13 | Document Workflow | Draft→Submit→Approve→Post→Reverse/Cancel/Close, shared across every document type | EXISTING, mature | **YES** | None structural | GL, Approval, Numbering | Yes | None identified |

## Summary

**13 of 13 engines confirmed singular. Zero STOP conditions.** Every "known gap" listed above is a
POLICY DEPENDENT decision or a low-risk, independently-schedulable hygiene item — none is a structural
defect in the engine itself, and none was touched by this audit.
