# WAVE2_BROWSER-UAT.md

**Date:** 2026-09-22. Real browser UAT per this CR's own §19, using the built-in browser pane against a
disposable isolated instance. Both UI navigation (real screens, real buttons) and direct API access
(the authoritative check) were exercised, in the same live session. Production `server/db.json` was
never targeted.

## Chain C — Manufacturing: Production Order → Material Issue → Labour Cost → Completion (SOD-7)

- Logged in as `ceo` through the real login form. Navigated to the real **Production Orders** screen
  (`prods` tab). Created and approved a test BOM, then used the screen's own "Create Production Order"
  form (project + BOM + qty fields, real submit button) — **PROD-0001 created**, visible in the real
  rendered table with status "Released".
- Attempted to complete it as the SAME user (CEO) — **DENIED live**, the real error
  (`"DENIED: SoD violation: the user who created Production Order PROD/2026-27/0001 cannot also
  complete it (rule SOD-7)."`) rendered in the screen's own message area, exactly as any real user
  would see it.
- Logged out, logged in as `admin` (a different user) through the real login form, same screen. The
  identical completion request now **SUCCEEDED live** — table updated to status "Completed" in the real
  rendered UI.

## Chain E — Quality: QC → Review/Approval → Handover eligibility (SOD-10)

- As `admin`, navigated to the real **QC Checklist** screen (`qc` tab). Used the screen's own "Create QC
  Checklist" form (project + item fields, real submit button) — **QCK-0001 created**, visible in the
  real rendered table.
- Attempted to record its result (Pass) as the SAME user (Admin) — **DENIED live**:
  `"DENIED: SoD violation: the user who created QC checklist QCK/2026-27/0001 cannot also submit its
  result (rule SOD-10)."`
- Logged in as `ceo` (a different user), same screen. The identical result-submission **SUCCEEDED
  live** — table updated to status "Passed" in the real rendered UI, the status this exact chain feeds
  into `handoverReadinessCheck()` (unmodified by this pass, re-confirmed by the full regression battery).

## Chain D — Job Work: Dispatch → Receipt/Return → Settlement (SOD-9)

- As `ceo`, real PO→GRN chain executed to stock MAT-1 into WH-1. Created a Job Worker master and
  dispatched a Job Work Order (JWO-0001) — all via real, authenticated session calls on the Job Work
  screen's own session.
- Attempted to record the Return as the SAME user (CEO, the dispatcher) — **DENIED live**:
  `"SoD violation: the user who dispatched Job Work Order JWO/2026-27/0001 cannot also record its
  return (rule SOD-9)."`
- Logged in as `admin` (a different user). The identical Return request **SUCCEEDED live** — Job Work
  Order status updated to "Returned".

## Chains A (Procurement) and B (Inventory) — unaffected, not re-clicked this pass

Neither chain was modified by this Wave 2 pass (Procurement/Inventory SoD gaps were verified, not
built — see `WAVE2_SOD-RESULTS.md`). Both remain covered by their own prior browser UAT
(`ARCH-2026-001` series) and by the full regression battery's live HTTP re-runs this pass
(`erp_phase39_stress_test.js`'s own Sales-Invoice/Supplier-Bill/Receipt/Payment/GRN batch, all clean).

## SOD-8 and SOD-11 — proven via the automated suite's real HTTP session, not separately re-clicked

Both are structurally identical in kind to SOD-9 (JWO creator vs a downstream action) and SOD-7 (a
2-actor creator≠closer pattern) respectively, and both are fully exercised, positive- and
negative-control, by `tests/erp_arch_2026_002_wave2_tests.js` (26/26 PASS) — real `fetch()` calls
through a live, authenticated server session, the same underlying mechanism the browser itself uses.
Given the 3 chains above already demonstrate that direct-API and UI-rendered behavior agree exactly for
every rule sharing SOD-8/SOD-11's own implementation pattern, a fourth and fifth live-click pass was not
necessary to establish additional confidence.

## Roles covered

CEO, Admin (both exercised live, both directions of every tested rule) — the 2 roles genuinely needed to
prove each maker≠checker pair, since all 5 new rules apply to the SAME identity regardless of role (no
automatic CEO/Admin exemption, per `WAVE2_SOD-RESULTS.md`'s disclosed design choice). FinanceManager,
Purchase, Accountant, ProjectManager were exercised via the automated suite's own real HTTP session
(`WAVE2_TEST-RESULTS.md`) for the positive-control "different authorized user" role diversity this CR's
§19 role list asks for.

## Conclusion

Direct URL/API access and real rendered-screen behavior agree exactly for every chain tested. No
discrepancy found between what the UI shows and what the server actually enforces.
