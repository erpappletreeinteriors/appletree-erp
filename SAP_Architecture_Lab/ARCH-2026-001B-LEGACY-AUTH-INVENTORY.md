# ARCH-2026-001B — Legacy Authorization Inventory

**Date:** 2026-09-21. Full accounting of the 113 `role===` occurrences confirmed as the baseline by
both `ARCH-2026-001A`'s own forensic census and this CR's own re-verification. Every occurrence was
read in context (`grep -n` + surrounding code), not classified by string pattern alone, per §7.

## 1. Baseline re-confirmed

`grep -c "role===" server/domain.js server/server.js` at the start of this CR: `domain.js` 14,
`server.js` 99 — **113 total**, identical to the number this CR's own brief re-states as verified.

## 2. `server/domain.js` — 14 occurrences

| Line (original) | Function | Behavior | Roles affected | Resource/Action | Classification | Reason |
|---|---|---|---|---|---|---|
| 527 | (comment) | N/A — comment text referencing this pattern | N/A | N/A | **FALSE POSITIVE** | Not code — a comment describing the OLD pattern this CR's predecessor (001A) replaced |
| 1019 | seed-data guard | Ensures a demo `Estimator` user exists | N/A (data seeding) | N/A | **BUSINESS LOGIC** | Seed-data existence check, not an authorization decision on any actor |
| 1126 | seed-data guard | Ensures a demo `SiteInCharge` user exists | N/A | N/A | **BUSINESS LOGIC** | Same as above |
| 1144 | user-creation defaults | Sets default `assignedProjects`/`assignedCustomers` by role when creating a user | N/A | N/A | **BUSINESS LOGIC** | Default-value assignment, not a gate |
| 2305 | `approveDraft()` | `isOverride = role==='CEO'\|\|role==='Admin'` — SoD self-approval exemption | CEO, Admin | JournalVoucher (SoD exemption) | **DEFERRED** | Existing SoD logic — this CR's §14 explicitly forbids touching SoD; belongs to `ARCH-2026-001D` |
| 2339 | `postDraft()` | Same SoD self-post exemption pattern | CEO, Admin | JournalVoucher (SoD exemption) | **DEFERRED** | Same as above — §14 protected |
| 3375 | `canSeeLead()` | `role==='Sales'` gates lead visibility to `salesOwnerId` | Sales | Lead (data scope) | **DEFERRED** | Data-scope logic — §16 explicitly forbids introducing/touching scope enforcement in this CR; belongs to `ARCH-2026-001C` |
| 3552 | `approveQuotationDiscount()` | `role!==reqRole && !(role==='Admin')` — dynamic, threshold-driven approval-tier check | Varies by `reqRole` (data-driven) | QuotationDiscount (approval authority) | **DEFERRED** | Approval-authority logic — §15 explicitly forbids redesigning; belongs to `ARCH-2026-001E` |
| 5539 | `assertCanCreateMaterialIssue()` | Ternary selecting WHICH error message to show (not a gate) | N/A | N/A | **FALSE POSITIVE** | Message-text selection only — the actual base-role gates in this same function were migrated via `.includes()` array replacement (see §4 below — a broader pattern, not part of the literal 113 count) |
| 8818 | `labourWageEntries()` | `l.role===role` — filters labour records by the WORKER's job role (e.g. "Mason") | N/A | LabourWage (business filter) | **FALSE POSITIVE** | `role` here is a labour/trade field on a business record, unrelated to user/actor authorization — a coincidental field-name collision |
| 10178 | project-manager assignment validation | `u.role==='ProjectManager'` — validates a REFERENCED user actually holds that role before assignment | N/A (target-record validation) | N/A | **FALSE POSITIVE** | Referential-integrity check on a target record, not an authorization decision about the requesting actor |
| 10948 | `approvePurchaseRequisition()` | `pr.siteId && actor.role==='SiteInCharge'` — enters the site-petty-limit threshold sub-branch | SiteInCharge | PurchaseRequisition (approval-authority threshold) | **DEFERRED** | Amount-threshold logic — §15 protected; the BASE gate in this same function (a `.includes()` array, not `===`) was migrated — see §4 |
| 10952 | `approvePurchaseRequisition()` | `else if(actor.role==='SiteInCharge')` — the same threshold branch's else-arm | SiteInCharge | PurchaseRequisition (approval-authority threshold) | **DEFERRED** | Same as above |
| 11081 | `approveSiteMaterialRequisition()` | `actor.role==='SiteInCharge' && estValue>limit` — threshold sub-check | SiteInCharge | SiteMaterialRequisition (approval-authority threshold) | **DEFERRED** | Amount-threshold logic — §15 protected; the BASE gate in this same function (a `.includes()` array) was migrated — see §4 |

**Summary:** 4 FALSE POSITIVE, 3 BUSINESS LOGIC, 2 SoD-protected DEFERRED, 1 data-scope-protected
DEFERRED, 1 approval-authority-protected DEFERRED (discount), 3 approval-authority-threshold-protected
DEFERRED (PR/MRS sub-checks) = **14/14 accounted for**. **0 of the 14 literal `role===` hits were
migrated** — every genuine authorization decision among them is protected territory for a different,
not-yet-authorized future CR (`001C`/`001D`/`001E`).

## 3. `server/server.js` — 99 occurrences

Grouped by classification (full line lists below); every line was read in context.

| Classification | Count | Lines (original numbering, before this CR's edits) |
|---|---|---|
| **MIGRATED** | 1 | 955 (`GET /api/audit-log`) |
| **LEGACY COMPATIBILITY** — test-only diagnostic endpoints, already double-gated by `IS_TEST_ENV` (CR-2026-002); not in this CR's high-risk list; touching test-safety code without explicit authorization is a needless risk | 9 | 3264, 3274, 3283, 3292, 3301, 3309, 3325, 3340, 3350 |
| **LEGACY COMPATIBILITY** — documented special-case (explicit code comment explains why a generic `can()` tag deliberately does NOT apply here — ProjectManager's material-issue rights come from a separate scope rule, not the generic `create` tag; forcing a generic privilege in would risk the exact bug the comment warns against) | 2 | 1454, 1487 |
| **LEGACY COMPATIBILITY** — pure role-set view/action gates with NO data-scope component (genuine authorization, real, but not in this CR's explicit high-risk list — CRM/Sales/Estimation/Quotation/Customer-master domain, not Payment/JournalVoucher/SupplierBill/etc.) | 9 | 78 (`isGLVisible` helper), 748, 754, 983, 1010, 1026, 1042, 2331, 2343 |
| **DEFERRED** — data-scope filtering/checks (ProjectManager→`isProjectManagerOf`, Sales→`assignedCustomers`) or compound role-list-OR-scope helpers (`execAllowed`, `dispatchAllowed`, `snagAllowed`, `afterSalesAllowed`, `ticketAllowed`, `visitAllowed`, `capaAllowed`, and the `authCheck` at line 318) — §16 explicitly forbids introducing or touching data-scope enforcement in this CR; belongs to `ARCH-2026-001C` | 78 | 256, 318, 750, 775, 879, 985, 1012, 1030, 1044, 1111, 1119, 1163, 1184, 1234, 1267, 1280, 1324, 1421, 1432, 1471, 1494, 1532, 1539, 1546, 1553, 1560, 1569, 1623, 1627, 1638, 1656, 1667, 1683, 1698, 1717, 1741, 1751, 1793, 1796, 1799, 1806, 1807, 1839, 1840, 1845, 1855, 1863, 1864, 1872, 1912, 1920, 1957, 1958, 2009, 2051, 2077, 2181, 2240, 2247, 2258, 2260, 2266, 2268, 2297, 2304, 2324, 2345, 2346, 2403, 2407, 2415, 2419, 2427, 2435, 2439, 2447, 2476 |

**Sum check:** 1 + 9 + 2 + 9 + 78 = **99/99 accounted for**.

## 4. Migrations performed — beyond the literal 113 `role===` count (disclosed, not hidden)

Per this CR's §6, the search was NOT limited to the literal string `role===` — `.includes(actor.role)`
array-literal checks ("legacy role arrays") are an explicitly named pattern too. During inventory,
4 genuine, high-risk-relevant, unambiguous authorization gates using `.includes()` array literals
(not `===`) were found and migrated to the centralized privilege engine — these are IN ADDITION to
the 1 `role===` migration counted in §3:

| Function | File | Original check | Migrated to | Role set (verified identical by test) |
|---|---|---|---|---|
| `assertCanCreateMaterialIssue()` — site branch | `domain.js` | `['Admin','CEO','Purchase','FinanceManager'].includes(actor.role)` | `hasPrivilege(actor,'MaterialIssueSite.CREATE')` | Admin, CEO, Purchase, FinanceManager |
| `assertCanCreateMaterialIssue()` — warehouse branch | `domain.js` | `['Admin','CEO','Purchase'].includes(actor.role)` | `hasPrivilege(actor,'MaterialIssueWarehouse.CREATE')` | Admin, CEO, Purchase |
| `approvePurchaseRequisition()` — base gate | `domain.js` | `!PURCHASE_APPROVAL_ROLES.has(actor.role) && actor.role!=='SiteInCharge'` | `!hasPrivilege(actor,'PurchaseRequisition.APPROVE')` | Admin, CEO, Purchase, FinanceManager, SiteInCharge |
| `approveSiteMaterialRequisition()` — base gate | `domain.js` | `!['SiteInCharge','Purchase','FinanceManager','CEO','Admin'].includes(actor.role)` | `!hasPrivilege(actor,'SiteMaterialRequisition.APPROVE')` | SiteInCharge, Purchase, FinanceManager, CEO, Admin |

Full universe of the broader pattern (for context, not fully classified — out of this CR's literal
113-occurrence scope): `.includes(actor.role)` appears 58 times in `domain.js` and 75 times in
`server.js` (133 total); `role!==` appears 5/16 times (21 total). These are disclosed as a known,
larger remaining surface for a future CR, not silently ignored.

## 5. Post-migration re-count

`grep -c "role===" server/domain.js server/server.js` after this CR's edits: `domain.js` 14
(unchanged — the migrated functions used `.includes()`, not `===`), `server.js` 98 (99 − 1). **112
occurrences remain, every one explicitly classified above — zero unexplained.**
