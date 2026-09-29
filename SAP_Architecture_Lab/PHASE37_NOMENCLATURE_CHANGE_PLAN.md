# PHASE 37 — Nomenclature Change Plan

**Date:** 2026-09-11. Part 29 deliverable. Per the brief's explicit instruction: **nothing in this
plan has been implemented.** This groups every finding from the crosswalk into MUST CHANGE / SHOULD
CHANGE / OPTIONAL / DO NOT CHANGE / MANAGEMENT DECISION. Only MUST CHANGE items (and any SHOULD
CHANGE items the user explicitly approves) should be implemented, and only after this plan is
reviewed — per Part 29's own rule, this document does not authorize itself.

## MUST CHANGE

Real, confirmed inconsistencies where two different labels exist for the identical thing. Low risk,
display-layer only, no data-model or accounting-logic change.

1. **`server/domain.js:274`** — `{code:'PAY', label:'Vendor Payment', ...}` → change `label` to
   `'Supplier Payment'`. Confirmed sole occurrence of "Vendor Payment" anywhere in the 3 primary
   files; every other surface (sourceType, UI heading, menu label, report name) already says
   "Supplier Payment." Zero functional risk — `label` is a display string only, `code`/`prefix`
   (`PAY`) are unchanged, so no document numbering, GL posting, or existing voucher number is
   affected.
2. **`client_secure/index.html:3569`** — the JE print-template's `<td class="l">Business Partner</td>`
   cell → change to `Party` (or `Customer/Vendor`, whichever reads better in context — a genuine,
   small UX judgment call, not a data decision). This is a static label string; the underlying
   `${e.party}` value/field is completely unchanged.

## SHOULD CHANGE

Real inconsistencies, but lower stakes or requiring a small judgment call rather than a pure factual
fix. Recommended, but the user should confirm before implementation (these are display-only,
low-risk, but touch more locations than the 2 MUST CHANGE items).

3. **Journal Entry vs Journal Voucher** — standardize on "Journal Voucher" (already dominant in the
   live UI). Locations to align: the JE-draft's default narration string ("Imported Journal Entry"
   at `domain.js:8954`), the user-visible prompt at `index.html:4257` ("Journal Entry ID to match
   against"), and a small number of code comments (cosmetic, developer-facing only, lowest
   priority within this item).
4. **MRS spelled-out form** — standardize on ONE full expansion. Currently "Material Requisition
   Slip (Site)" (registry, `domain.js:318`/`849`) vs. "Material Requisition — Site (MRS)" (UI,
   `index.html:5908`). Recommend keeping the UI's shorter, already-live form ("Material
   Requisition — Site") and updating the registry label to match, OR vice versa — a genuine small
   decision for the user, not a fact this audit can resolve unilaterally.
5. **APOB never expanded in the UI** — add a one-time inline expansion ("Additional Place of
   Business") the first time "APOB" appears on the APOB & E-way Bill screen (`index.html:332`/
   `6166`), matching the expansion already written (but not surfaced to users) in
   `APPLETREE_ERP_SOP.md:448`.
6. **Bare "Receipt" ambiguity** — 2 confirmed isolated strings: "Receipt Recorded"
   (`index.html:903`) and "Record Receipt" (`index.html:5924`, `5961`) → qualify as "Site Receipt
   Recorded" / "Record Site Receipt" respectively, matching their actual (inventory, not cash)
   meaning.
7. **Bare "Payment" ambiguity** — the "Payment Requests" tab heading (`index.html:329`) and the
   Clearings table's bare "Payment" column header (`index.html:3530`) — minor label clarification
   only (e.g. confirm the intended scope in the heading's own subtext); does not require a
   structural rename.
8. **"Material Requirements" (MRQ) vs "Material Requests" (MR)** — the two ARE genuinely different
   documents (confirmed via code-level function analysis), but their near-identical names create
   real risk of user confusion. Recommend renaming "Material Requirements" (the MRQ, per-line
   demand document) to something visually distinct, e.g. "Material Demand" or "BOM Material Need" —
   **this is a MANAGEMENT DECISION about which alternate name to use (see below), not a
   self-evident fix**, so it is listed here as "should investigate/decide," not "should
   implement a specific new label" yet.

## OPTIONAL

Real observations, genuinely low-priority, cosmetic-only.

9. Split the one hybrid heading "Inventory Stock (Moving Average)" (`index.html:227`) into
   separate, cleaner wording if ever touching that screen for other reasons.
10. Consider renaming the `recon` tab's bare "Reconciliation" label to something more explicit
    about its scope (e.g. "AR/AP & Tax Reconciliation"), distinguishing it more clearly from the
    sibling "Bank Reconciliation" tab — already low-ambiguity today since both exist as separate,
    correctly-scoped tabs.
11. Delete the dead `NAV_GROUPS` array (`client_secure/index.html:357-372`, inside a comment
    already marked "unused, safe to delete once this shell is verified in UAT") — a documentation-
    hygiene cleanup, zero functional impact since it's unused.
12. Verify/resolve the `SRET` ("Site Return") registry-vs-seed divergence (`domain.js:850` guard
    list references it; the base seed array has no such entry) — needs a direct code check to
    confirm whether this is a harmless stale comment/reference or an actual latent gap before
    deciding any action.

## DO NOT CHANGE

Terms that are already correct, or where adopting literal SAP wording would make the product WORSE
for its actual India-SME audience. Explicitly protected from any future "looks more like SAP"
temptation.

- GRN (keep — do not rename to "Goods Receipt")
- Material Issue (keep — do not rename to "Goods Issue")
- Stock Count (keep — do not rename to "Physical Inventory")
- Warehouse, Location, Site (keep as-is)
- Snag (keep — India/UK construction-standard term, do not rename to "Punch List")
- Job Worker (keep — India GST-specific term, do not rename to "Subcontractor")
- Delivery Challan (keep — Indian statutory term)
- Cost Centre / Profit Centre spelling (keep British spelling, already 100% consistent)
- Clearing (keep — "Settlement" is informal prose in one comment only, not a competing mechanism)
- Customer/Supplier Credit Note, Debit Note (keep — already symmetric and correctly named)
- BOM, Production Order (keep — already SAP-aligned)
- "Save" vs "Post"/"Submit"/"Approve" (keep — already cleanly separated by context)
- Do NOT introduce "Release" as a new UI verb merely to match SAP — "Approve" already covers this
- Do NOT introduce "Business Partner" as a real unified-master concept anywhere beyond fixing the
  one mislabeled cell above — this app's architecture (separate Customer/Vendor masters) does not
  support it, and building that architecture is out of this audit's scope entirely
- Status-value internal CASE inconsistency — DO NOT normalize without first confirming (see
  MANAGEMENT DECISION #2 below) whether this is user-visible at all; changing 26 internal enum
  arrays is real code-touch for a possibly-zero user-facing benefit

## MANAGEMENT DECISIONS REQUIRED (not implemented without explicit sign-off)

1. **"Material Requirements" (MRQ) rename** — pick the actual replacement label (options include
   "Material Demand," "BOM Material Need," or simply leaving both as-is with better on-screen
   explanatory text instead of a rename). This is a genuine product-naming choice affecting how
   Purchase/Project staff talk about the document day-to-day — not something this audit should
   decide unilaterally.
2. **Status-value internal casing** — confirm with engineering whether any of the 26 `*_STATUSES`
   constants' raw string values are ever displayed to a user unmodified (vs. always passed through
   a display-label mapping). If always mapped, no change is needed at all. If sometimes shown raw,
   decide whether a full normalization pass (touching internal code, not just display labels) is
   worth the risk for this specific engagement's remaining scope.
3. **SAC (Services Accounting Code)** — confirm with Finance/Compliance whether Appletree's billable
   services (installation labour, AMC) require SAC-coded tax treatment distinct from HSN-coded
   goods. If yes, this becomes a real (non-nomenclature) feature gap for a future phase, not a
   naming fix. If no, no action needed and this closes as "confirmed not applicable to this
   business."
4. **Whether to adopt "Business Partner" as a real architectural concept** — explicitly flagged
   as out of scope for this audit (would require unifying the Customer and Vendor masters, a real
   architecture change, not a terminology change) — raised here only so the user is aware the
   question exists, not as a recommendation either way.

## Implementation sequencing (once approved)

If the user approves proceeding:
1. Implement the 2 MUST CHANGE items first (trivial, isolated, zero risk) — verify via `node -c`
   syntax check + a browser check of the 2 affected screens.
2. Implement approved SHOULD CHANGE items one at a time, each followed by a targeted browser
   verification of the specific screen touched (per Part 36).
3. Run the full existing test suite after ANY change (per Part 37) — expect 100% of what was
   passing before to still pass, since these are label-only changes with zero accounting-logic
   impact.
4. Do not touch OPTIONAL or MANAGEMENT DECISION items without a separate, explicit go-ahead.

No implementation has occurred as part of producing this plan.
