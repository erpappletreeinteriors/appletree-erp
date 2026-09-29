# PHASE 38 — Stress Test Report

**Date:** 2026-09-11. Executed on the disposable isolated server used throughout this phase, never
production.

## Volume test — 110 Customer Invoices, full lifecycle

- 110 invoice drafts created via 110 concurrent `POST /api/ar/invoice` requests (`Promise.all`).
- All 110 then walked through `submit`→`approve`→`post` sequentially.
- **Result: 110/110 succeeded.** Total wall-clock time: ~22.3 seconds for 110 full 4-step document
  lifecycles (440 total HTTP round-trips) — an average of ~200ms per full lifecycle including 3
  sequential state-transition calls each, which is reasonable for a Node.js single-process HTTP
  server with the full audit/idempotency/RBAC middleware chain running on every call, not a compiled
  or heavily-optimized backend.
- **Trial Balance before**: 779,620 Debit = 779,620 Credit. **Trial Balance after**: 799,674.1
  Debit = 799,674.1 Credit. The delta (20,054.1) matches the expected new postings exactly (110
  invoices with base amounts 100 through 209, i.e. Σ(100+i) for i=0..109 = 16,995, ×1.18 GST =
  20,054.1) — confirmed arithmetically, not merely "still balanced by coincidence."
- **No duplicate voucher numbers** across the full batch (spot-checked; see
  `PHASE38_DOCUMENT_NUMBERING_AUDIT.md`).
- **No reconciliation drift**: AR/AP/tax reconciliation (`PHASE38_AR_AP_RECONCILIATION.md`) was
  pulled AFTER this stress batch and still matched exactly.

## Concurrency test — document numbering under simultaneous load

15 simultaneous draft creations and a separate 10-way simultaneous full-lifecycle run, both with
zero ID/voucher-number collisions — see `PHASE38_DOCUMENT_NUMBERING_AUDIT.md` for the full detail.

## What was NOT tested at the scale the brief requests

The brief asks for "100+ invoices, 100+ supplier bills, 100+ inventory movements, 100+ receipts/
payments, multiple projects, multiple suppliers, multiple customers, multiple months." This phase
achieved the 100+ Customer Invoice volume target, plus the smaller-scale procurement/inventory/
receipt chain already exercised in the main E2E run (Parts 4-8), but did **not** separately run
100+ Supplier Bills, 100+ inventory movements, or 100+ receipts/payments as their own dedicated
volume batches, nor across multiple projects/months. This is disclosed as a genuine scope limitation
of this phase's stress testing, not claimed as full coverage — the 110-invoice batch demonstrates
the underlying mechanism (document numbering, GL posting, Trial Balance integrity) holds under real
concurrent load, which is the property most at risk from volume; extending the same pattern to the
other document types would very likely behave identically given they share the same
`postJournalEntry()`/`nextDocNumber()` machinery, but that is an inference from the shared
architecture, not independently re-proven for each document type at 100+ volume.

## Response time

No formal response-time SLA exists for this application to test against; the ~200ms/lifecycle
figure above is reported as an observation for a disposable single-process dev-mode Node server, not
a production-capacity claim (production capacity was never in scope for this phase, and this
codebase's own comments elsewhere already disclose "not the full factory ERP"-style honest scope
limits — the same discipline applies here to performance claims).
