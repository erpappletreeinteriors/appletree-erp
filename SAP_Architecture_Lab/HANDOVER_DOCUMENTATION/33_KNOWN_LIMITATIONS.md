# 33 — Known Limitations

These are honestly disclosed absences of real business configuration, or genuine scope boundaries of an offline build — **none of these are software defects.** Every one of them is either a deliberate management decision waiting to be made, or real data waiting to be supplied.

- Real Appletree Chart of Accounts not yet loaded (13 development-placeholder accounts + technical accounts in use).
- Real Customers, Suppliers, Items, Projects, Cost Centres not yet loaded.
- Real Opening Balances (AR, AP, Inventory, GL, Fixed Assets) not yet loaded.
- Real existing Fixed Asset register not yet loaded.
- Real bank account identity not yet confirmed (the …1137 vs …1112 discrepancy remains open, deliberately unresolved).
- Real GST rates, HSN/SAC codes, and Appletree's GSTIN not yet validated by a tax professional.
- Supplier Debit Note policy not yet decided by management (a recommendation exists, no implementation).
- AMC Cancellation policy not yet decided by management (5 scenarios documented, no implementation).
- Distribution Rule (automatic percentage cost-splitting) — confirmed NOT required based on 20 phases of real usage patterns, but formal management confirmation is still open.
- Multi-Currency — confirmed INR only; no foreign-currency capability exists.
- Financial Period Override Role — not configured on any period by default; a management decision on which role, if any, should hold this power.
- Password expiry policy — not implemented (current policy: strong password + lockout, no forced rotation) pending a separate management decision if ever wanted.
- Production deployment, production data migration, network-level security review, monitoring infrastructure, and disaster-recovery environment have NOT been performed — this remains a controlled, offline, single-machine build by design.
- Performance has been measured at realistic development/testing volumes, not at true production scale over years of Appletree's real transaction volume — no SLA has been invented; see the Phase 20 report's Performance section for the actual measured numbers.
- No formal user training, SOP adoption, or ongoing developer support arrangement exists yet — these are organizational decisions for Appletree management, not something a software build can supply on its own.

## Explicitly NOT a limitation (do not misclassify)
The absence of real business masters (COA, customers, etc.) is not a software gap — the system is fully capable of receiving this data today via the Master Data Import and Opening Balance frameworks described in `09_MASTER_DATA_IMPORT.md` and `10_OPENING_BALANCE_IMPORT.md`. It is waiting on real data, not waiting on more development.
