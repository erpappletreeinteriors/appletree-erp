# Appletree Business Platform (ABP) — Product Vision

Status: skeleton. Vision statement and priorities below are structural
placeholders — TBD items need CEO input before they're treated as decided.

## 1. What ABP is

An enterprise platform for Appletree Interiors, built module-by-module, starting
with expense management (AEMS). Excel 365 is the first client application;
architecture stays technology-agnostic so future Web/Desktop/Mobile/API clients
can be added without redesigning the business layer.

## 2. Relationship to the existing web ERP

Appletree already runs a Supabase/Postgres web ERP (`appletree_erp_v2_1.html` at
the repo root) covering Sales, Procurement, Accounts, HR, Manufacturing,
Site/Install, and more. Per the CEO's decision (2026-08-07), ABP is expected to
*eventually merge* with that system rather than remain a permanently separate
platform. See [ARCHITECTURE.md](ARCHITECTURE.md) §4 for the practical design
implications of that decision. **TBD**: timeline and trigger condition for
starting the merge work.

## 3. Module roadmap

| Module | Status |
|---|---|
| Expense Management (AEMS) | In progress — scaffold only |
| Purchase Management | Not started |
| Inventory | Not started |
| Manufacturing | Not started (may already be partly covered by the existing ERP) |
| CRM | Not started (may already be partly covered by the existing ERP) |
| Payroll | Not started |
| HR | Not started (may already be partly covered by the existing ERP) |
| Projects | Not started |
| Accounting | Not started (may already be partly covered by the existing ERP) |

**TBD**: for each "may already be covered" module, decide whether ABP builds a
new version or the merge plan simply absorbs the existing ERP's implementation.
Don't start any of these until there's an actual task and this table is updated.

## 4. Core platform services (shared by all future modules)

Authentication, Authorization, User Management, Workflow Engine, Notification
Engine, Audit Engine, Reporting Engine, Master Data Engine, Settings Engine,
File Management, Logging — live in `modules/core`, built generically as AEMS
needs them (not all up front).

## 5. TBD — needs CEO input before BRD/FRD can be written

- Real expense categories used at Appletree.
- Real approval chain: who are the actual roles/people at each stage, and are
  "Store", "Director", "Accounts Head" from the generic template real roles or
  placeholders?
- Real ₹ approval thresholds/DOA tiers for expense approval (the existing ERP
  already has a DOA/approval-tier pattern for PO/quotation approval — reuse
  that structure if it fits).
- Escalation timeout rules (how long before an unactioned request escalates).
- Who can submit expenses (all employees? specific roles?) and on whose behalf.
- Reimbursement vs. direct-pay expense handling — are both needed?
- Multi-currency? (Existing convention: Kerala-based, ₹ INR only — confirm this
  holds for AEMS too.)
