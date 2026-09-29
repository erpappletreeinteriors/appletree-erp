# WAVE3_CONTROLLING-RESULTS.md

**Date:** 2026-09-22. Cost Centre / Profit Centre verification results for ARCH-2026-002 Wave 3.

## Headline statement

**No new Controlling capability was built this pass.** W3-7 (Cost allocation mechanism) and W3-8 (Profit
Centre transaction propagation) are both classified IMPLEMENTATION BLOCKER by
`WAVE3_IMPLEMENTATION_SCOPE.md` — neither was implemented. Everything below is live re-confirmation of
EXISTING behavior.

## Cost Centre — real, unchanged, re-confirmed live this pass

Two posting paths tag `costCentreId`, exactly as Wave 3 Phase 0 found and unchanged since:

- `postProductionLabourCost()` — Dr 5100 / Cr 1000, both lines tagged `costCentreId:'CC-FACTORY'`.
- `postInstallationLabourCost()` — Dr 5100 / Cr 1000, both lines tagged `costCentreId:'CC-INSTALLATION'`.

**Live re-confirmation this pass** (`tests/erp_arch_2026_002_wave3_tests.js`, section C1): a real
Production Order was created and `postProductionLabourCost()` called for ₹3,333; `GET
/api/general-ledger?account=5100&costCentreId=CC-FACTORY` returned exactly one new row for that posting
(row count went from N to N+1) and no untagged 5100 activity leaked into the filtered view. Both
`CC-FACTORY` and `CC-INSTALLATION` cost centre masters were confirmed present in
`GET /api/cost-centres`, unchanged.

`generalLedger({account, costCentreId, ...})`'s filter (`server/domain.js`, `if(costCentreId) lines =
lines.filter(l=>l.costCentreId===costCentreId)`) was read and is unchanged — a straight equality filter
over the same central journal every other report already reads (`allLines()`), not a second engine.

## Profit Centre — still confirmed master-data-only

Re-confirmed by direct source read this pass (matching Wave 3 Phase 0's own explicit disclosure at
`domain.js` around the Profit Centre master definition): **zero** posting function anywhere in
`server/domain.js` sets a `profitCentreId` on a GL line. `postJournalEntry()`'s line schema carries the
field (`profitCentreId: l.profitCentreId || null`) purely as a pass-through — nothing populates it. This
is unchanged from Wave 3 Phase 0's finding, W3-8 remains an open, unresolved business-process question
(what should determine a transaction's Profit Centre — a Branch mapping, a Project mapping, or manual
entry), and this pass did not choose an answer.

## Cost allocation mechanism — still confirmed absent

Re-confirmed: no `allocat*`-named function exists anywhere in `server/domain.js` that distributes a cost
across cost objects by a rule. Controlling reporting is still served entirely by
`generalLedger()`'s Cost-Centre filter and `projectPL()`'s generic account-type sweep — exactly as Wave 3
Phase 0 found. W3-7 remains open (a genuine design-scope question — does Appletree need a formal
allocation-rules engine, or is the existing reporting sufficient — that this pass correctly did not
answer on management's behalf).

## Regression confirmation

`tests/erp_arch_2026_002_wave2_tests.js` (26/26, exercises `completeProductionOrder()`/labour-cost
posting paths indirectly) and the full Fixed Asset/Manufacturing/Job Work baseline suites (see
`WAVE3_REGRESSION.md`) all re-run clean — no Controlling-adjacent posting path regressed.

## Conclusion

**PASS (VERIFICATION ONLY — no new Controlling capability built; Cost Centre tagging/filtering confirmed
working exactly as before; Profit Centre confirmed still master-data-only; Cost Allocation confirmed
still absent; see `WAVE3_IMPLEMENTATION_SCOPE.md` for why W3-7/W3-8 remain blocked).**
