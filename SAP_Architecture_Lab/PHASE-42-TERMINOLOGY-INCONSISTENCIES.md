# PHASE 42 — Terminology Inconsistencies

**Date:** 2026-09-14. Every genuine internal inconsistency found across Phase 37 + this phase's own
gap-fill research, consolidated in one place per Part 8. Examples the brief listed (Vendor vs
Supplier, Bill vs Invoice, etc.) were investigated for real evidence, not assumed to exist — several
listed candidates were checked and found NOT to be real inconsistencies (noted below).

## Confirmed real inconsistencies

| # | Inconsistency | Evidence | Status |
|---|---|---|---|
| 1 | Vendor (internal: `vendorId`, `DB.vendors`, 135 hits) vs Supplier (display: 44-57 hits) | `server/domain.js` throughout | **Open** — internal-only, zero user-facing impact; recommend keeping (API-compatibility precedent) |
| 2 | "Vendor Payment" GL-document label vs "Supplier Payment" everywhere else | Was `domain.js:274` (old line) | **CLOSED** — fixed in Phase 39, re-verified current this phase |
| 3 | "Business Partner" JE-print-template label vs. no such architecture existing | Was `index.html:3569` (old line) | **CLOSED** — fixed in Phase 39, re-verified current this phase |
| 4 | "Journal Voucher" (dominant, UI/menu/registry) vs "Journal Entry" (minority, comments/1 prompt/narration default) | `index.html`, `domain.js` comments | **Open** — SHOULD CHANGE per Phase 37, low risk |
| 5 | MRS registry label ("Material Requisition Slip (Site)") vs UI+SOP form ("Material Requisition — Site") | `domain.js` registry vs `index.html`/SOP | **Open** — SHOULD CHANGE per Phase 37, registry is the outlier |
| 6 | Material Requirement (MRQ) vs Material Request (MR) — near-identical labels for genuinely distinct documents | `domain.js` function names, both real | **Open** — Business Decision Required (rename target for MRQ) |
| 7 | Bare "Receipt" ("Receipt Recorded"/"Record Receipt") actually always means Site/Goods Receipt, never cash | `index.html:903,5924,5961` | **Open** — SHOULD CHANGE, 2 isolated strings |
| 8 | Bare "Payment" means 4 different things (Supplier Payment transaction, Payment Method master, Payment Approval Matrix, Payment Terms) | Across `index.html` | **Open** — SHOULD CHANGE, 2 clearest locations |
| 9 | Status-enum internal casing: 10 of 26 use `UPPERCASE_SNAKE`, 16 use `PascalCase` — including within the SAME Sales/CRM pipeline (`LEAD_STATUSES`/`ESTIMATION_STATUSES` vs `QUOTATION_STATUSES`/`DESIGN_STATUSES`, all defined within 5 lines of each other, `domain.js:399-403`) | `domain.js` | **Open** — Business Decision Required, verify display-layer impact before touching 26 arrays |
| 10 | "Delivery Confirmation" (DLV, customer-facing) vs "Delivery Challan" (DC, internal material movement) — both real, unrelated documents, both use the word "Delivery" | `domain.js:293` vs `domain.js:324` | **Open** — documentation-only disambiguation recommended, no code/ID change needed |
| 11 | 4 unrelated uses of Accept/Reject vocabulary (QC item Pass/Fail, QC checklist Passed/Failed, GRN qtyAccepted/qtyRejected, Production acceptedQty/rejectedQty, Quotation Acceptance) | `domain.js` across 4 modules | **Open** — documentation-only clarification recommended |
| 12 | QC item-level result (present-tense `Pass`/`Fail`) vs checklist-level status (past-tense `Passed`/`Failed`) | `domain.js:430,6535,6551` | **Open** — optional wording alignment, very low priority |
| 13 | Snag severity: client-side dead-code fallback `['Low','Medium','High','Critical']` (`index.html:2705`) vs real `SNAG_SEVERITIES = ['Critical','Major','Minor']` (`domain.js:432`) | Unreachable in practice (`server.js:1697` always supplies the real list) | **Open** — dead-code cleanup, cosmetic, not user-facing today |
| 14 | Dead `NAV_GROUPS` array labels the execution group "EXECUTION"; live `MODULE_TREE` labels it "EXECUTION & DELIVERY" | `index.html` (dead array already marked safe to delete) | **Open** — harmless since inert, cleanup recommended |
| 15 | SRET registry-vs-seed divergence — `domain.js:850`'s migration guard references `['SRET','Site Return']` but no such entry exists in the base `glDocumentTypes` seed | `domain.js` | **Open** — unresolved whether stale comment or real gap, needs direct verification |
| 16 | Inventory Stock (Moving Average) — one hybrid heading blending "Stock" and "Inventory" wording | `index.html:227` | **Open** — optional cosmetic split |

## Candidates checked and found NOT to be real inconsistencies

The brief's own example list (Part 8) named several pairs to investigate. Each was checked against
real code, not assumed:

| Candidate | Finding |
|---|---|
| GRN vs "Goods Receipt" | Not an inconsistency — "Goods Receipt" is confirmed absent; GRN is used 100% consistently, deliberately |
| Issue vs "Goods Issue" | Not an inconsistency — "Goods Issue" confirmed absent; "Material Issue" used consistently |
| Customer vs Client | Not investigated as a real pair — "Client" does not appear as a competing term for Customer anywhere found this phase or in Phase 37 |
| Project vs Job | Not a real inconsistency — "Job Card"/"Job Work"/"Job Worker" are distinct, correctly-scoped concepts, not synonyms for "Project" |
| Quotation vs Estimate | Not a real collision — "Costing Version" (internal cost buildup) and "Quotation" (customer-facing price) are correctly distinct; "Cost Estimate" appears only in unrelated prose/a differently-scoped field (`plannedCostEstimate` in Job-Work consumption), not as an alternate name for Costing Version |
| Return vs Purchase Return vs Site Return | Correctly, distinctly modeled — "Material Return (Site)" (internal, no vendor/GRN) vs "Purchase Return" (vendor-facing, requires GRN) are genuinely different documents, already disambiguated by the "(Site)" qualifier |
| Service Ticket vs Complaint | Not investigated as a collision this phase — both are real, distinct, correctly-named entities (`TICKET_STATUSES` vs `COMPLAINT_STATUSES`), not synonyms |
| AMC vs Service Contract | "Service Contract" not found as a competing term for AMC anywhere in the codebase |
| Handover vs Project Closure | Not a real collision — Handover (customer-facing, QC/snag-gated) is distinct from Project Closure (an unrelated project-status transition) |
| Material vs Item | Not an inconsistency — "Material" dominant (135/159 hits), "Item"/"Product" incidental, not competing terms (Phase 37 finding, unchanged) |
| Warehouse vs Store | "Store" not found as a competing term for Warehouse anywhere |
| Approval vs Authorization | Correctly distinct usages — "Approval" is the user-facing workflow-step verb everywhere; "Authorization" is an internal, code-only term (`looksLikeRealAuthorizationCheck()`), never surfaced to a user as a competing label |
| User vs Employee | "Employee" not found as a competing term for User anywhere |
| Costing vs Cost Estimate | See Quotation vs Estimate above — not a real collision |
| Variation vs Change Request | Confirmed genuinely, deliberately interchangeable — not an inconsistency (Phase 37 finding, unchanged) |

## Summary

**16 confirmed real inconsistencies** (2 already closed in Phase 39 before this phase began, 14 still
open at varying severity from cosmetic to Business-Decision-Required). **14 candidate pairs from the
brief's own example list were checked and found NOT to be real inconsistencies** — reported honestly
rather than manufactured to pad a finding count.
