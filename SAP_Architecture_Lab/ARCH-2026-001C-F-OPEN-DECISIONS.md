# ARCH-2026-001C-F — Open Decisions

**Date:** 2026-09-21. Consolidates decisions this CR deliberately did not make silently, carrying
forward unresolved items from `ARCH-2026-001C-OPEN-DECISIONS.md` and adding any new ones.

## 1. Warehouse / Cost Centre / Profit Centre / Department scope — still OPEN (unchanged)

Re-confirmed absent from the data model during this CR's own re-verification (no new field was found).
No change to this item's status — see `ARCH-2026-001C-OPEN-DECISIONS.md` §1 for the full record.

## 2. Multi-role scope semantics — still N/A (unchanged)

Re-confirmed: `DB.users.role` remains a single string field; no multi-role assignment capability
exists. See `ARCH-2026-001C-OPEN-DECISIONS.md` §2.

## 3. The 3 Sales/Lead-ownership checks (Leads, Estimation Requests, Quotations) — NEW, this CR

**Finding:** these use `l.salesOwnerId===actor.id`, a genuinely different authoritative field from the
`assignedCustomers`-based Customer dimension `hasScopeAccess('Customer',...)` represents.

**Decision needed:** should a future CR extend `hasScopeAccess()` with a new `'Lead'` (or
`'Ownership'`) dimension type to centralize these too? This is a real, low-risk, well-understood
extension — NOT blocked by any missing data (the `salesOwnerId` field already exists and is
authoritative) — simply not done in this CR to keep scope bounded, consistent with ARCH-2026-001C's
own "not every safe item needs to ship in one CR" precedent.

**Recommendation (not a decision, since this CR does not decide for management):** low-risk candidate
for the very next residual-migration CR, if one is authorized.

## 4. The remaining ~35 non-A-classified items from the 68/70 population — status

Every one of these was independently re-verified in this CR (`ARCH-2026-001C-F-AUDIT.md` §3) and found
to be either already-migrated-safely (subsumed into the 32 MIGRATE NOW population) or the 3 B-class
Lead-ownership items (§3 above). **No open item remains unaccounted for from the original 68/70.**

## 5. Report/export scope — CLOSED this CR (was open after ARCH-2026-001C)

ARCH-2026-001C's own disclosed gap ("no report/export scope testing was performed") is now closed —
see `ARCH-2026-001C-F-REPORT-EXPORT-SECURITY.md`. No further action needed on this item.

## 6. Branch-scoped Browser UAT — disclosed gap, not blocking

No seeded user has a Branch scope assignment, so live Role-3 (Branch-scoped) browser UAT could not be
performed against real data. `branchAllowed()` itself remains unit-tested (ARCH-2026-001C) and exercised
unchanged by this CR's full regression. **Recommendation:** if a future CR or UAT effort wants live
Branch-scope browser coverage, it should either (a) get explicit authorization to create a dedicated
Branch-scoped test user as real, disclosed test data, or (b) accept the existing unit-level coverage as
sufficient — a management/QA judgment call, not a technical blocker.

## 7. Summary table

| # | Item | Status | Blocks |
|---|---|---|---|
| 1 | Warehouse/CC/PC/Department scope | OPEN (unchanged) | Any future CR proposing enforcement |
| 2 | Multi-role scope semantics | N/A (unchanged) | Only relevant once multi-role assignment exists |
| 3 | Lead-ownership dimension centralization | OPEN (new, low-risk) | A future residual-migration CR, if authorized |
| 4 | Remaining 68/70 population | CLOSED — fully accounted for this CR | Nothing |
| 5 | Report/export scope testing | CLOSED this CR | Nothing |
| 6 | Branch-scoped browser UAT | Disclosed gap, not blocking | A future UAT-authorization decision |

No implementation proceeds on any OPEN item until the corresponding decision is made.
