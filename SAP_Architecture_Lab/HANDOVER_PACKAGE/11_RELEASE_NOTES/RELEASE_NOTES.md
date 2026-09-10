# Release Notes — Appletree ERP SAP Architecture Lab

## Phase summary (abbreviated — full detail in the individual phase reports at the repository root)

| Phase | Focus | Result |
|---|---|---|
| 1-5 | Discovery, design, core accounting engine, document lifecycle, AR/AP, roles | Foundational build |
| 6A | Real server-side security (auth, RBAC, SoD, concurrency) | 44/44 |
| 6B | CRM: Lead → Estimation → Quotation → Won | 88/88 |
| 7 | Procurement → Inventory → AP → Manufacturing cost foundation | 131/131 |
| 8 | Manufacturing → Dispatch → Delivery → Installation → QC → Handover → Billing → AR | 172/172 |
| 9 / 9B | Full secured UI integration + security hardening (found 14 unauthenticated endpoints, fixed) | 580/580 |
| 10 | After-Sales: Warranty, Complaints, Service, AMC, CAPA | 788/788 |
| 11 | Financial integration: Core vs Lifecycle Project P&L | 801/801 |
| 12 | Policy freeze & governance (zero code — pure decision documentation) | 801/801 |
| 13 | Implemented 12 approved policy decisions | 897/897 |
| 14 | SAP-style accounting document architecture (Branch, Attachments, Credit/Debit Notes, dynamic Journal Entry) | 1,071/1,071 |
| 15 | Gap closure: Installation Cost, Profit Centre, Bank Reconciliation | 1,191/1,191 |
| 16 | Final governance: found+fixed an 11-instance "reversal-blindness" defect class + a moving-average valuation bug; 4x'd a performance bottleneck | 1,211/1,211 |
| 17 | Production readiness planning + Backup/Restore built and tested | 1,262/1,262 |
| 18 | Financial Period Lock, built and live-verified | 1,368/1,368 |
| 19 | Fixed Assets, real 121-transaction ICICI import, Payment Methods, Annual Numbering, Period Override w/ reason, optional HSN/GSTIN; found+fixed a serious cache-invalidation defect | 1,718/1,718 |
| 20 | Master Data Import Framework, Opening Balance Engine, final security audit (found+fixed a missing global error handler), handover documentation and packaging | **1,905/1,905** |

## Notable defects found and fixed across the engagement
- Phase 8: rounding defect only visible at realistic transaction volume.
- Phase 9B: 14 lifecycle-mutation endpoints with no authorization gate at all.
- Phase 16: an 11-function-wide "reversal-blindness" class (reversed transactions kept counting forever) + a moving-average valuation formula error.
- Phase 19: a fund-transfer misclassification bug (found by the test suite itself); a cache-invalidation defect causing stale accounting data to be served after a database reset or restore (found via live browser testing).
- Phase 20: a duplicate/inconsistent GSTIN field on the Customer record; an Opening AR/AP docCategory mismatch that would have made opening balances invisible to AR/AP ageing; a UI bug where import results flashed and vanished; **a missing global error handler that could crash the entire server on one malformed request.**

## Current state
**1,905/1,905 automated tests passing.** Classification: **C — Handover Ready, Production Configuration May Begin** (see the Phase 20 Final Report for full reasoning on why not D).
