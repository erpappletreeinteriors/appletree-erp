# ARCH-2026-001D — SoD Security Report

**Date:** 2026-09-21. Explicit security testing per this CR's own §15/§23.

## 1. Negative tests (§15)

| Attack | Result |
|---|---|
| Direct API call (bypassing any UI) | Every assertion in the new suite is a direct `fetch()`/in-process domain call — never through `client_secure/index.html` |
| Manipulated route (`/api/sod/exceptions/:id/revoke` with a forged exception ID) | Returns `{ok:false, error:'Exception not found.'}` — no crash, no bypass |
| Forged role | `/api/sod/rules`, `/api/sod/conflicts`, `/api/sod/exceptions` all re-derive `actor.role` from the session exclusively (same `getActor()` mechanism as every other route in this codebase) — a Viewer session cannot present itself as Admin |
| Forged user ID | `grantSoDException()` looks up the TARGET user from `DB.users`, never trusts a client-supplied name/role alongside the ID |
| Forged capability | SOD-5/SOD-6 resolve `vendor.createdBy`/`grn.createdBy` from the AUTHORITATIVE database record, never from any client-supplied field — proven by the live HTTP test where the SAME vendor/GRN IDs were used and the block/allow outcome depended only on server-side data |
| Forged scope | N/A to these 2 rules specifically (they are not scope-dimensioned) — the interaction with the existing 001C/001C-F scope engine is structurally independent (see Implementation §7) and unaffected, confirmed by the full 001C/001C-F regression re-run |
| Repeated login / session refresh | Not separately re-tested — this CR added no new session-handling logic; the existing session mechanism (unchanged) is exercised by the full `erp_059_security_tests.js` re-run (PASS) |
| Restart persistence | Not applicable to an in-memory session concern here — `DB.sodRules`/`DB.sodExceptions` persist to disk exactly like every other collection (same `save()` call), covered by the existing persistence tests, unaffected |
| Alternate endpoint | The ONLY two enforcement points for SOD-5/SOD-6 are `executePaymentRequest()` and `draftSupplierInvoiceFromPO()` — both are SINGLE, authoritative functions (no second code path posts a payment or creates a PO-matched bill), confirmed by this codebase's own "one authoritative posting gate" architecture, unchanged by this CR |

## 2. Positive tests — not over-blocking (§16)

- A user with ONLY capability A (vendor creation) but who never attempts payment execution: unaffected
  — confirmed via the clean-chain test (Admin/CEO creates vendors routinely elsewhere in the existing
  regression suite with zero new rejection).
- A user with ONLY capability B (payment execution) who never created the vendor in question:
  **ALLOWED** — proven live, twice: FinanceManager executing payment to a vendor Admin created (engine
  test), and Admin executing payment to a vendor CEO created after CEO/FinanceManager were both
  correctly blocked by OTHER, unrelated controls first (browser UAT).
- Unrelated roles (Sales, Estimator, SiteInCharge, Accountant, ProjectManager, Viewer): completely
  unaffected — none of these roles can reach either enforcement point at all (pre-existing role gates,
  unchanged), confirmed by the full regression battery's zero new failures across every unrelated
  suite (accounting, inventory, projects, manufacturing, job work, fixed assets, banking).
- The FULL, real, legitimate P2P chain (different people at each step) completed successfully
  end-to-end in both the engine test and the browser UAT — SoD did not break normal business
  operation for the case it is not supposed to block.

## 3. Existing payment controls — preserved (§18)

`erp_phase39_payment_approval_matrix_tests.js` re-run clean: the pre-existing maker-checker (SOD-1),
maker/checker/executor 3-person separation with its approved CEO/Admin exemption (SOD-2), and the
3-way match / closed-period / clearing mechanisms are all UNTOUCHED and independently re-verified. The
browser UAT incidentally proved these existing controls and the 2 new SoD rules compose correctly:
FinanceManager was blocked from executing a payment they had ALREADY approved (SOD-2, pre-existing,
unrelated to this CR) in the SAME test sequence where CEO was blocked by the NEW SOD-5 rule — two
independent, correctly-layered controls, neither interfering with the other.

## 4. Auditability (§19/§9)

Every SoD block (`SoDViolationBlocked`), every detective scan (`SoDDetectiveScanRun`), every exception
grant/revoke (`SoDExceptionGranted`/`SoDExceptionRevoked`) is recorded via the existing, unmodified
`logAudit()`/`DB.auditLog` path — confirmed in the test suite (`[Audit]` assertion) and via inspection
(no new audit collection exists). Security diagnostics (`detectSoDConflicts`) are Admin/CEO-only,
confirmed live (Viewer denied 403).

## 5. Performance (§27)

`checkSoD()` performs a single array `.find()` against `DB.sodRules` (a small, fixed-size, in-memory
array — 6 rows) plus, when relevant, a single `.find()` against `DB.sodExceptions`. Both preventive
call sites (`executePaymentRequest()`, `draftSupplierInvoiceFromPO()`) already perform an equivalent
`.find()` against `DB.vendors`/`DB.grns` for their own pre-existing logic, so no new lookup pattern or
N+1 risk was introduced — the SoD check reuses data already being loaded for the surrounding function.
`detectSoDConflicts()` is a full-collection scan, but it is Admin/CEO-only, on-demand, not called from
any hot transactional path, and operates on collections (`DB.paymentApprovals`, `DB.jeDrafts`) already
of bounded, moderate size in this test-lab dataset.

## 6. Conclusion

No SoD bypass found on either protected workflow. No over-blocking of legitimate combinations found.
Existing payment controls (SOD-1/SOD-2/3-way-match/clearing) confirmed intact and correctly composing
with the 2 new rules.
