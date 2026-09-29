# ARCH-2026-002 — W4 Security Impact

**Date:** 2026-09-26. Deliverable per this CR's own §14 requirement to reconfirm the central security
architecture and specify scope (read/create/update/approve/close/export/print) for any proposed change.

## Central security architecture — reconfirmed intact, nothing altered by this gate

Server-side RBAC + Data Scope + SoD + Approval + Audit, all reused exactly as `ARCH-2026-002-WAVE-4-
SECURITY-BASELINE.md` documented. **No new scope dimension is proposed by anything in this gate.** Service
access continues to respect Project/Site/Customer/Branch exactly where those dimensions already apply
(Branch/Site remain inconsistently wired codebase-wide, a pre-existing, disclosed condition, not a Wave-4-
specific regression).

## Scope-by-action for each IN-SCOPE item (per this CR's own §14 requirement)

### Item 1 — Missing audit-log calls (6 functions)
| Scope | Requirement |
|---|---|
| Read | Unchanged — same roles that can already view the audit log. |
| Create | N/A — no new create action, only new logging of an existing one. |
| Update | N/A. |
| Approve | N/A. |
| Close | N/A. |
| Export | Unchanged — audit-log export (if any) inherits new entries automatically. |
| Print | N/A. |

### Item 2 — CAPA source-ID existence validation
| Scope | Requirement |
|---|---|
| Read | Unchanged. |
| Create | Unchanged actor set; tighter validation on the SAME action, not a new one. |
| Update | N/A. |
| Approve | N/A. |
| Close | N/A. |
| Export | N/A. |
| Print | N/A. |

## Scope-by-action for POLICY DEPENDENT items — specified in advance so a future decision can move directly to implementation

### W4-8/9 (SoD expansion, Complaint/Ticket/AMC/Visit)
| Scope | Requirement (once authorized) |
|---|---|
| Read | Unchanged. |
| Create | Unchanged. |
| Update | Unchanged. |
| Close/Bill | Would require checker≠maker (identity separation), exact exemption policy TBD by W4-8. |
| Export | Unchanged. |
| Print | Unchanged. |

### W4-12 (Site/Branch scope for Service Visit)
| Scope | Requirement (once authorized) |
|---|---|
| Read | Would need `hasScopeAccess()` extended to a new `siteId`/`branchId` dimension if Option B is chosen. |
| Create | Would require capturing the new scoped field at Visit creation. |
| Update/Approve/Close | Unaffected beyond the read-scope change. |
| Export/Print | Would inherit the same new scope filter as read, once wired. |

## Direct-access resistance — re-confirmed, not re-tested (no code changed)

`ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md` §6's live test (Sales user denied `CUST-4`'s data, correctly
allowed `CUST-1`'s) remains the authoritative evidence — not re-run here since no code was touched by this
gate. Re-running it is listed as a Wave 4 Design test-requirement item for any future implementation pass
that touches these routes.

## No CRITICAL finding, no STOP condition

Consistent with `ARCH-2026-002-WAVE-4-SECURITY-BASELINE.md`'s own summary: every finding is MODERATE or
below (uneven SoD coverage, missing audit calls, no CAPA source-ID validation) — none involves
unauthenticated access, a client-side identity override, or a second engine of any kind. This gate
introduces zero new security surface (no code was written), so the security posture is byte-identical to
the end of Wave 4 Phase 0.
