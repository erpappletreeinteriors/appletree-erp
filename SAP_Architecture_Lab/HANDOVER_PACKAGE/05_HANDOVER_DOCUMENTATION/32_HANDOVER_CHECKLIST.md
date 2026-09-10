# 32 — Handover Checklist

## TECHNICAL
- [x] ERP build complete (1,905/1,905 automated tests passing)
- [x] Database architecture proven (single-file, backup-friendly, reproducible)
- [x] Backup tested (full Backup → Reset → Restore → Reconcile cycle passes)
- [x] Restore tested
- [x] Security tested (1,080-cell role/action matrix, 47 ID-tampering tests, final code-review audit)
- [x] Audit trail complete (~120 event types)
- [x] Logging present (server-side error log)
- [x] Error handling hardened (global safety net added Phase 20 — no single request can crash the server)
- [x] Performance measured (see `22_PERFORMANCE` in the Phase 20 report — not invented, actually measured)
- [x] Documentation complete (this folder)

## ACCOUNTING
- [ ] Chart of Accounts — **PENDING: real Appletree COA not yet supplied**
- [ ] Tax configuration — **PENDING: professional validation required**
- [ ] Customers — **PENDING: real customer list not yet imported**
- [ ] Suppliers — **PENDING: real supplier list not yet imported**
- [ ] Items — **PENDING: real item/material list not yet imported**
- [ ] Projects — **PENDING: real project list not yet imported**
- [ ] Cost Centres — **PENDING: real cost centre list not yet imported**
- [ ] Banks — **PENDING: real bank account(s) not yet confirmed (see the …1137 vs …1112 open item)**
- [ ] Fixed Assets — **PENDING: real existing asset register not yet imported**
- [ ] Opening AR — **PENDING**
- [ ] Opening AP — **PENDING**
- [ ] Opening Inventory — **PENDING**
- [ ] Opening GL — **PENDING**
- [ ] Opening Fixed Assets — **PENDING**

## OPERATIONAL
- [ ] Real user accounts created, demo accounts deactivated
- [ ] Roles assigned to real staff
- [ ] Staff trained (see `30_ACCOUNTANT_QUICK_START.md` as a starting point)
- [ ] SOPs formally adopted (month-end close, bank reconciliation, etc. — outlines exist, need management sign-off)
- [ ] A support arrangement decided (who fixes a genuine software defect after handover?)
- [ ] Real reporting cadence decided
- [ ] Bank reconciliation ownership assigned

## MANAGEMENT DECISIONS (see `34_OPEN_MANAGEMENT_DECISIONS.md` for full detail)
- [ ] Supplier Debit Note policy
- [ ] AMC cancellation policy
- [ ] Real bank account identity confirmation (…1137 vs …1112)
- [ ] Tax/GST professional sign-off
- [ ] Opening balance figures approved
- [ ] Chart of Accounts approved
- [ ] Financial Period override role (or explicit decision that none is needed)
- [ ] Password policy tier (current: strong password + lockout, no expiry)
- [ ] Backup frequency/retention formally adopted
