# WAVE2_IMPLEMENTATION_SCOPE.md

**Date:** 2026-09-22. First task per this Wave 2 implementation authorization's §2. Translates the
authorization's own text into concrete scope, resolving the tension between its STATUS section
("Seven management decisions W2-1 through W2-7 remain open") and its operative sections (§5-11, which
give specific, concrete direction for Manufacturing/Job Work/Quality). Per §2's own rule ("If an
implementation decision is not covered by the approved Wave 2 decision record: STOP and report it"),
each item below is either (a) concretely, specifically authorized by this CR's own operative text
(implemented), or (b) genuinely left open by both the decision record AND this CR's own text (deferred,
reported, not implemented).

## What this authorization concretely specifies (→ IMPLEMENTED)

Unlike W2-1/W2-3/W2-5/W2-6/W2-7 (which this CR's STATUS section correctly lists as still open, and
whose operative sections correspondingly say "if authorized" / "do NOT invent... unless explicitly
approved"), this CR's §5, §8, §9, §11 give concrete, actionable direction for closing the 3
zero-SoD-coverage chains W2-4 identified but did not itself resolve:

1. **§5A + §8**: "Prevent the same user from performing the complete execution chain" (Manufacturing).
   Implemented as: the Production Order's creator must differ from its completer (the chain's own
   start/end bookends) — the minimal, direct, literal reading of this instruction, using the exact
   guard-clause pattern already established (SOD-5/SOD-6), not a new approval hierarchy (which §5A
   explicitly forbids inventing).
2. **§5B + §9**, with explicit "particular attention to: Job Work transaction → Supplier Bill... The
   user who performs the operational transaction must not gain unauthorized ability to complete the
   financial settlement merely through linked-document navigation" — the single most concretely-named
   requirement in the entire authorization. Implemented as: the Job Work Order's creator (dispatcher)
   must differ from whoever books the linked Supplier Bill for its processing charges, mirroring SOD-6's
   own exact shape (GRN creator vs Bill creator → JWO creator vs linked-Bill creator).
3. **§9** "Protect against self-created/self-settled transactions": implemented as the JWO creator
   (dispatcher) must also differ from whoever records its Return, Scrap, or Direct Dispatch (the
   settlement actions) — completing the "dispatch/receipt/settlement responsibilities" separation §5B
   asks for in general terms.
4. **§5C + §11**: "Implement the approved QC review/approval separation. The creator of a QC
   inspection/result must not automatically be allowed to perform the protected review/approval
   action." Given the Phase 0 finding that no separate review/approval STEP exists in the QC workflow
   at all (only `submitQCResult()`, the terminal action), and §11's own "do not create a second Quality
   workflow engine" instruction, this is implemented as: the QC checklist's creator must differ from
   whoever submits its Pass/Fail result — the minimal interpretation that adds a genuine creator≠approver
   control without inventing a new workflow state, mirroring the exact pattern already used for
   BOM/PR/PO/MRS.
5. **§11** "Also address the approved CAPA identity/origination behavior" + this CR's own STATUS section
   naming "CAPA closure identity/origination" as a narrower gap: implemented as the CAPA's
   effectiveness-checker must differ from whoever closes the case — completing CAPA's own existing
   owner≠verifier, verifier≠effectiveness-checker chain with the one missing link, using the exact same
   state machine (no new CAPA functionality, per §11's explicit rule).
6. **Quality "audit" requirements (§11, §14)** + Wave 2 Phase 0's own W2-2 finding (a trivial,
   no-business-policy audit-completeness gap already flagged as "not a genuine open question"):
   `createQCChecklist()` gains the `logAudit()` call it was missing.

## What remains genuinely open (→ NOT IMPLEMENTED, deferred, reported)

Every item this CR's own text explicitly conditions on prior authorization that was never given:

- **W2-1 (Manufacturing Demand trigger)** — §8: "if authorized by W2 decisions" — not authorized.
- **W2-3 (Warehouse scope)** — §12: "Do NOT invent Warehouse scope unless explicitly approved by W2
  decisions" — not approved.
- **W2-5 (Production Output → FG inventory)** — §8: "If W2 authorization does not approve an FG
  inventory model: leave it deferred" — not approved.
- **W2-6 (Gate Pass / Transporter master)** — §10 lists these as things to "audit and implement only
  approved changes around" — no approval given for either.
- **W2-7 (Inspection/NCR)** — not mentioned as authorized anywhere in this CR's operative text.
- **Procurement cross-document SoD (PR raiser vs PO approver vs Payment)** — §6 says "at minimum
  VERIFY the approved separation," not "build a new one"; no PR→PO→Payment linking field exists in the
  data model to enforce this against even if authorized, and no such field is authorized to be added by
  this CR. Verified (see `WAVE2_SOD-RESULTS.md`), not built.
- **Inventory requester/issuer SoD** — same "verify" language in §7, not "build." Verified, not built.

## No conflict between the Wave 2 Design and this authorization

`ARCH-2026-002-WAVE-2-DESIGN.md`'s own sketch for W2-4 (SoD coverage) is fully consistent with what was
actually implemented — this authorization simply exercised the choice the Design document's own §3
(sub-wave 2A, "lowest risk... reuses a proven engine exactly") anticipated as the natural first
increment. No STOP condition was triggered by this translation step.
