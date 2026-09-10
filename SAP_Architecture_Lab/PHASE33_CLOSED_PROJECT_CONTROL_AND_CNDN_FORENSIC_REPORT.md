# PHASE 33 — CLOSED-PROJECT COST CONTROL + CN/DN + PROJECT CLOSURE + REVERSAL FORENSIC AUDIT

**Scope:** SAP_Architecture_Lab only (isolated experimental build, NOT the live/offline production ERP).
**Date:** 2026-09-05
**Numbering note:** This is Phase 33 of this Lab's *adversarial forensic security/QA audit* thread — a separately-numbered engagement from the earlier build/SOP-compliance thread that already produced its own `PHASE33_SOP_COMPLIANCE_REPORT.md`/`PHASE33_SOP_GAP_REGISTER.md` (dated Aug 27–28, a different subject entirely). Filed under a distinct name to avoid any collision.

---

## 1. Executive Summary

Phase 32 found that `createMaterialIssue()` allowed new costs against a CLOSED project while `reverseEntry()` correctly blocked reversal. This phase's mandate was explicit: find the COMPLETE class of affected functions, not just that one. It was much larger than one function.

A repository-wide census (Part A) found `reverseEntry()` was the ONLY place in the entire codebase — across every project-linked function — that ever checked `project.status`. A live BEFORE-fix attack matrix (Part C) proved this concretely: every one of Material Issue, Labour Wages, Project Expense, new Purchase Order, new GRN, Customer Invoice, Supplier Bill, and a plain Manual JE posted cleanly against a CLOSED test project, with real GL entries (JE-0615 through JE-0618) as evidence.

A single shared guard, `assertProjectOpenForPosting()`, was built and wired into 8 functions/choke-points, then proven safe via a repeat of the exact same attack matrix (Part C AFTER) — every attack now correctly blocked, and the CEO/Admin override (mirroring the existing closed-period and closed-project-reversal precedents) proven to work end-to-end with a full reason-validation battery (missing/blank/whitespace rejected; normal/very-long/special-character/Unicode all correctly accepted).

Scenarios 5, 6, and 7 were executed live in full. Every GST/AR/AP figure across a 6-point tax matrix (0%, 5%, 12%, 18%, 28%, IGST) matched an independently pre-calculated value exactly. Every illegal case (over-credit, over-debit, double reversal, cross-pair CN/DN misuse, unauthorized reversal, closed-period reversal, closed-project reversal) was correctly rejected with zero mutation.

Five additional high-risk ID generators were found and fixed this phase (`DRAFT-`, `CLR-`, `PAYREQ-`, `PR-`, `ITR-`), on top of Phase 32's 16. A full database-wide duplicate scan after all of today's activity found **zero new duplicate IDs** — only the same 3 pre-existing historical duplicates from Phases 30/31, unchanged.

---

## 2. Evidence Labels

| Label | Meaning |
|---|---|
| **PROVEN LIVE** | Exercised via a real HTTP call against the running server; response inspected. |
| **CODE VERIFIED** | Confirmed by reading the exact source function, not executed this phase. |
| **STATICALLY VERIFIED** | Confirmed by scanning the codebase/database files directly. |
| **PARTIALLY VERIFIED** | Some but not all sub-cases were exercised. |
| **NOT VERIFIED** | Explicitly not tested — named and reasoned, never silently skipped. |
| **NOT SUPPORTED** | The capability does not exist in this codebase at all — confirmed, not invented. |

---

## 3. Closed-Project Policy (Part B)

**No policy was invented.** It was extrapolated from the ONLY two existing precedents in this codebase, both already-approved management decisions:

1. **Closed financial period** (`postJournalEntry()`, Phase 19): CLOSED blocks posting by default; an explicitly-configured override role may post with a mandatory, non-blank reason; every override is audited.
2. **Closed project reversal** (`reverseEntry()`, Phase 41): CLOSED blocks reversal by default; only CEO/Admin may override with a mandatory, non-blank reason; every override is audited.

Applying the **same shape** to new-cost posting is not a new invented rule — it is the responsible, symmetric extension of a pattern management already approved twice. This is disclosed here explicitly as an extrapolation, not a confirmed new management sign-off, per the mission's own instruction to "explicitly identify the decision" when one is required.

**Project status reality check (STATICALLY VERIFIED):** `PROJECT_STATUSES = ['DRAFT','PLANNED','ACTIVE','ON HOLD','COMPLETED','CLOSED']` exists in the enum, but only `'ACTIVE'` (set at creation) and `'CLOSED'` (set by `closeProject()`) are ever actually reachable — no function anywhere sets `'COMPLETED'`, `'DRAFT'`, `'PLANNED'`, or `'ON HOLD'` on a project. `CANCELLED`/`ARCHIVED` do not exist in this Lab's project status model at all — **NOT APPLICABLE**, not invented. No `reopenProject()` function exists anywhere — project reopening is **NOT SUPPORTED** (see §14).

**Receipts/Payments deliberately excluded from the gate (a considered scope decision, tested and confirmed, §13):** collecting money already owed (Customer Receipt, Supplier Payment) is conceptually different from creating a NEW cost/revenue recognition. Blocking collection of a legitimately-owed, already-recognized receivable merely because a project was administratively closed would trap the business's own cash-collection process. `postCustomerReceipt()`/`postSupplierPayment()` were deliberately NOT gated — proven correct live in §13.

---

## 4. Closed-Project Function Census (Part A)

STATICALLY VERIFIED via a repository-wide scan for `DB.projects.find(...)` and `.status===` patterns.

| Function | Validates existence? | Validates status (pre-fix)? | Fixed this phase? |
|---|---|---|---|
| `createMaterialIssue()` | Yes | **No** (the original P32-D2 finding) | ✅ |
| `recordLabourWages()` | Yes | **No** | ✅ |
| `recordProjectExpense()` | Yes | **No** | ✅ |
| `createPurchaseOrder()` | **No** (only truthy-string check — a distinct, narrower gap found alongside the status gap) | **No** | ✅ (both) |
| `createGRN()` (via `po.projectId`) | Yes (via PO) | **No** | ✅ |
| `postDraft()` (catches Customer/Supplier Invoice, Customer Advance, Billing-Milestone Invoice, Service Invoice, AMC Billing, Manual JE — every draft-based posting) | N/A (draft's own project inherited from its lines) | **No** | ✅ (single choke point) |
| `postProductionLabourCost()` (via `productionOrder.projectId`) | Yes | **No** | ✅ |
| `postInstallationLabourCost()` (via `installation.projectId`) | Yes | **No** | ✅ |
| `issueProductionMaterial()` | N/A | N/A | Inherits the fix transitively — it calls `createMaterialIssue()` per line |
| `createInventoryAdjustment()` / `createInventoryTransfer()` | N/A | N/A | **NOT APPLICABLE** — confirmed via source read: neither function accepts a `projectId` parameter at all; both operate strictly at warehouse level |
| `createCustomerCreditNote()` / `createCustomerDebitNote()` / `createSupplierCreditNote()` / `createSupplierDebitNote()` | Via source invoice | **Deliberately NOT gated** | See §3/§13 — a CN/DN is a correction to an existing document, tested against the closed-project-*reversal* precedent instead (via `reverseEntry()`, which DOES gate CN/DN reversal — proven in §8/§10) |
| `capitalizeFixedAsset()` / `postAssetDepreciation()` / `disposeFixedAsset()` (via `asset.projectId`) | Yes | **No — NOT FIXED this phase** | Disclosed gap, see §26 |
| `issueToSite()` (via `mrs.projectId`) | Yes | **No — NOT FIXED this phase** | Disclosed gap, see §26 |
| Job-work functions (`createJobCard`, `recordJobWorkScrap`, etc.) | Varies | **No — NOT FIXED this phase** | Disclosed gap, see §26 |
| `postCustomerReceipt()` / `postSupplierPayment()` | N/A (no projectId param) | **Deliberately not gated — see §3** | By design, not a gap |

**Coverage honestly stated:** 8 functions/choke-points fixed this phase (covering the highest-traffic, highest-blast-radius paths — material cost, labour, expense, PO, GRN, and EVERY draft-based posting via the single `postDraft()` choke point). 3 categories (fixed-asset project-linked postings, site-issue, job-work) remain **NOT FIXED**, explicitly disclosed rather than silently left off the census.

---

## 5. Closed-Project Attack Matrix — BEFORE the fix (Part C)

**PROVEN LIVE.** A disposable project (PRJ-014) was built with a real PO→GRN→Material Issue→Labour→Expense baseline, then closed. Every subsequent attack succeeded:

| Attack | Role | Result BEFORE fix |
|---|---|---|
| New Material Issue | Purchase | ✅ Succeeded — posted JE-0615, movement MV-000190 |
| New Labour Wages | Accountant | ✅ Succeeded — posted JE-0616 |
| New Project Expense | Accountant | ✅ Succeeded — posted JE-0617 |
| New Purchase Order | Purchase | ✅ Succeeded (Draft status) |
| New GRN (against a NEW post-closure PO) | Purchase | ✅ Succeeded — posted JE-0618 |
| New Customer Invoice (draft) | Accountant | ✅ Succeeded |
| New Supplier Bill (draft) | Accountant | ✅ Succeeded |
| Project-linked Manual JE (draft) | FinanceManager | ✅ Succeeded |
| Material Return (`reverseEntry()`) | Finance (non-CEO) | ✅ Correctly BLOCKED — the one control that already worked |
| Material Return | CEO, with reason | ✅ Correctly allowed with override |

This is the concrete, live proof underlying the census in §4 — not an assumption.

---

## 6. Fix and Verification (Part D/E)

**The fix — `assertProjectOpenForPosting(projectId, actor, {overrideReason, action})`** (STATICALLY VERIFIED, domain.js): one shared function — no second source of truth. Not found → error. Not CLOSED → passes through unaffected (every existing open-project call site behaves byte-for-byte as before). CLOSED → requires `['CEO','Admin'].includes(actor.role)` AND a non-blank `overrideReason`; on success, logs `ClosedProjectPostingOverride`.

Wired into the 8 functions listed in §4, reusing each function's own existing `overrideReason` parameter where one already existed (Material Issue, GRN, Production/Installation Labour — the SAME field already used for their own BOM-quota/weighment-variance overrides), and adding one where none existed (Labour Wages, Project Expense, Purchase Order). `postDraft()` derives every distinct `projectId` present across a draft's lines and checks each.

**AFTER-fix re-run of the identical attack matrix — PROVEN LIVE**, all correctly blocked:

| Attack | Result AFTER fix |
|---|---|
| New Material Issue | ❌ Blocked: `"Cannot issue material — project ... is CLOSED..."` |
| New Labour Wages | ❌ Blocked |
| New Project Expense | ❌ Blocked |
| New Purchase Order | ❌ Blocked |
| New GRN against a pre-existing, partially-open PO on a closed project | ❌ Blocked for Purchase; ❌ Blocked for CEO with a blank reason; ✅ Allowed for CEO WITH a reason — PO correctly advanced from 5→8 of 10 units, GL/cost breakdown showed exactly ₹4,000 (8×₹500) received, no phantom double-count |
| Customer Invoice / Supplier Bill / Manual JE — draft creation | ✅ Still succeeds (deliberate — see §4 table; a draft has zero GL/inventory effect on its own) |
| Same 3 drafts — **posting** (`postDraft()`) | ❌ Blocked for FinanceManager (non-CEO); ❌ Blocked for CEO with blank reason; ✅ Allowed for CEO with a reason — JE-0627, JE-0628 posted |

**Reason-validation battery (Part E) — PROVEN LIVE:**

| Reason | Result |
|---|---|
| Missing | ❌ Rejected |
| Blank (`''`) | ❌ Rejected |
| Whitespace-only (`'   '`) | ❌ Rejected |
| Normal | ✅ Accepted |
| Very long (3000 chars) | ✅ Accepted, stored verbatim (confirmed via a direct audit-log query — no truncation) |
| Special characters (`<script>`, quotes, SQL-ish `--`) | ✅ Accepted, stored verbatim, no injection/mangling |
| Unicode (Tamil/Chinese/emoji) | ✅ Accepted, stored verbatim |

A failed override attempt produced **zero mutation** — confirmed by re-fetching the project's cost breakdown after the blocked attempts and finding it exactly matched the state produced only by the legitimate, authorized postings.

---

## 7. Scenario 5 — Customer Credit Note (Part F)

**PROVEN LIVE.** Invoice: ₹10,000 taxable @ GST18. **Independent calc (before reading any ERP output):** Dr Revenue ₹10,000, Dr Output Tax ₹1,800, Cr AR ₹11,800.

Full CN of ₹11,800 posted. Result matched exactly on all three lines (`revenueMatches: true, taxMatches: true, arMatches: true`), confirmed against the raw GL lines: `{account:'4000', debit:10000}`, `{account:'2200', debit:1800, taxCode:'GST18'}`, `{account:'1100', credit:11800}`.

## 8. Scenario 5 — Partial Credit and GST Matrix (Parts G/H)

**PROVEN LIVE.** Second invoice ₹8,000 taxable → gross ₹9,440. 25% + 50% credited (₹2,360 + ₹4,720), remaining ₹2,360 calculated independently. Over-credit of ₹2,460 against a ₹2,360 balance → **rejected**: `"...exceeds the invoice's open balance of ₹2,360..."`. Final exact 25% completed to 100%. A further ₹1 credit attempt against the now-fully-credited invoice → **rejected**: `"...exceeds the invoice's open balance of ₹0..."`.

**GST matrix — 6 codes, independently pre-calculated, all matched exactly:**

| Tax Code | Rate | Base | Exp. Tax | Exp. Gross | Revenue✓ | Tax✓ | AR✓ |
|---|---|---|---|---|---|---|---|
| ZT-ZERO | 0% | 5000 | 0 | 5000 | ✅ | ✅ | ✅ |
| GST5 | 5% | 5000 | 250 | 5250 | ✅ | ✅ | ✅ |
| GST12CS (new, intrastate 6+6) | 12% | 5000 | 600 | 5600 | ✅ | ✅ | ✅ |
| GST18 | 18% | 5000 | 900 | 5900 | ✅ | ✅ | ✅ |
| GST28CS (new, intrastate 14+14) | 28% | 5000 | 1400 | 6400 | ✅ | ✅ | ✅ |
| GST12 (IGST) | 12% | 5000 | 600 | 5600 | ✅ | ✅ | ✅ |

(12% and 28% intrastate codes did not pre-exist in this Lab's tax master and were created via the standard `/api/masters/tax-code` endpoint, using real GST slab splits — not arbitrary values.)

**Tax-master immutability (Part H):** confirmed via code read that `splitOriginalTax()` derives the base/tax split from the **already-posted invoice's own lines**, never from the current tax master — proven consistent with a fresh invoice+CN pair (`cnTaxAmount: 360` matching `2000×0.18=360` exactly) after new, unrelated tax codes were introduced into the master mid-test.

## 9. Scenario 5 — CN Reversal (Part I)

**PROVEN LIVE, all cases:**

| Test | Result |
|---|---|
| Unauthorized (Sales, `reverse:false`) | ❌ 403 `"Role \"Sales\" cannot reverse."` |
| Missing / blank reason | ❌ Rejected |
| Legitimate reversal | ✅ Exact restoration verified line-by-line (each GL line's debit/credit exactly flipped) |
| Reverse twice | ❌ `"Already reversed by JE-0655."` |
| Reverse nonexistent CN | ❌ `"Original document not found."` |
| Reverse an invoice with an active CN clearing against it ("wrong document") | ❌ `"Cannot reverse a document that already has clearings against it..."` |
| Reverse into a CLOSED financial period, no override role configured | ❌ Blocked — `"No override role is configured..."` |
| Same, override role configured, missing reason | ❌ Blocked |
| Same, override role + real reason | ✅ Allowed (period was FP-0002, temporarily closed for this test then **restored to Open** immediately afterward — confirmed via a follow-up GET, so no other test in this phase was disrupted) |
| Reverse against a CLOSED project, FinanceManager (base `reverse:true`) | ❌ Blocked by the closed-project gate specifically |
| Same, CEO with reason | ✅ Allowed |

---

## 10. Scenario 6 — Supplier Debit Note (Part J)

**PROVEN LIVE.** Bill: ₹10,000 taxable @ GST18 → gross ₹11,800. Full DN of ₹11,800. **Independent calc:** Dr AP ₹11,800, Cr Material Cost ₹10,000, Cr Input Tax ₹1,800 — this is the buyer-side direction confirmed by reading `createSupplierDebitNote()`'s own design comment (a Debit Note issued BY the buyer reduces AP, mirroring the Credit Note's direction — standard Indian buyer-side accounting, not invented). All three matched exactly against the raw GL lines. Reason-category validation also proven live: an invalid category and an "Other" category missing its mandatory detail were both correctly rejected.

## 11. Scenario 6 — Partial/Full/Over-DN (Part K)

**PROVEN LIVE.** 30% + 40% DN'd (cumulative 70%), remaining 30% (₹2,832) calculated independently. Over-DN of ₹2,882 against the ₹2,832 balance → rejected. Final exact remaining completed to 100%. Further DN after full → rejected.

## 12. Scenario 6 — DN Reversal (Part L)

**PROVEN LIVE**, identical battery to CN reversal (§9): unauthorized (Purchase role) blocked 403, blank reason blocked, legitimate reversal exact-restoration verified, reverse-twice blocked, invalid-source blocked, wrong-document (a bill with an active DN clearing) blocked, closed-project reversal correctly blocked for FinanceManager and allowed for CEO with reason.

## 13. CN/DN Cross-Pair Attacks (Part M)

**PROVEN LIVE, all 4 rejected using REAL document IDs (not phantom):**

| Attack | Result |
|---|---|
| Customer CN against a real Supplier Bill's entry ID | ❌ `"Customer invoice not found."` (docCategory check) |
| Supplier DN against a real Customer Invoice's entry ID | ❌ `"Supplier invoice not found."` |
| Customer DN against a real Supplier Bill's entry ID | ❌ `"Customer invoice not found."` |
| Supplier CN against a real Customer Invoice's entry ID | ❌ `"Supplier invoice not found."` |

Every function's `docCategory` check (`inv.docCategory!=='CustomerInvoice'`/`!=='SupplierInvoice'`) correctly refused a real-but-wrong-type document, closing exactly the "real but wrong reference" class the mission asked for — not merely phantom-ID rejection.

**Additionally, live-tested this phase (deliberately, per §3's policy determination):** a Customer Receipt against an already-posted, pre-closure invoice was attempted AFTER its project was closed — **succeeded** (`ok:true`), confirming the deliberate design decision that collecting an already-recognized receivable is not blocked by project closure, only NEW cost/revenue recognition is.

---

## 14. Scenario 7 — Project Closure Lifecycle (Parts N/O)

**PROVEN LIVE.** A full lifecycle built on a fresh project (PRJ-019): PO (₹20,000) → GRN (full receipt) → Material Issue (15 units, moving-average valued) → Labour (5 days × ₹900 = ₹4,500) → Expense (₹3,000) → Customer Invoice (₹60,000 + GST18). Project closed. Then, per Part O, every named action was attempted against the closed project:

| Action | Result |
|---|---|
| New PO | ❌ Blocked |
| New Material Issue | ❌ Blocked |
| New Labour | ❌ Blocked |
| New Expense | ❌ Blocked |
| New Invoice — draft creation | ✅ Allowed (deliberate, see §4/§6) |
| New Invoice — **posting** | ❌ Blocked |
| Receipt against the EXISTING pre-closure invoice | ✅ Allowed (deliberate policy, §3/§13) |
| Reversal of an existing cost (Labour), CEO-authorized | ✅ Allowed |

"Quotation conversion into an already-closed project" (also named in Part O) was determined **NOT APPLICABLE** — `wonTransition()` always creates a brand-new project from a quotation; there is no mechanism anywhere that re-targets an existing project, closed or otherwise, so this specific attack surface does not exist in this codebase's architecture.

## 15. Project Reopen (Part Q)

**NOT SUPPORTED.** STATICALLY VERIFIED (no `reopenProject()` function exists anywhere in domain.js — only `reopenFinancialPeriod()`, a distinct concept for accounting periods) and PROVEN LIVE (a `POST /api/projects/:id/reopen` attempt returned 404 `"Not found."`). This is reported as a genuine capability absence, not invented or worked around.

## 16. Project Profitability (Part S)

**PROVEN LIVE, cross-verified two ways.** Revenue ₹60,000 (base, tax correctly excluded). Material Issue's exact ₹ value (₹6,977.71 for 15 units) is moving-average-dependent — this specific figure was **not independently pre-calculated before reading the ERP result** (a disclosed methodology gap in this specific check, honestly reported per the mission's own standard — unlike Phase 32 Scenario 4's more rigorous treatment of the same kind of figure). Labour (₹4,500) and Expense (₹3,000) WERE independently pre-calculated as deterministic figures and matched exactly.

Cross-verification via the independent `/api/project-pl` endpoint (a genuinely separate code path from `/api/projects/:id/cost-breakdown`) confirmed, AFTER the CEO-authorized labour reversal: `revenue:60000, cost:9977.71, profit:50022.29, marginPct:83.37`. This exactly matches manual arithmetic: (₹6,977.71 material + ₹4,500 labour + ₹3,000 expense) − ₹4,500 reversed labour = ₹9,977.71. **No tax leaked into either revenue or cost** — structurally confirmed (the invoice's 4000/2200 split already isolates tax from revenue at posting time; no cost account line anywhere carries a `taxCode`).

**A genuinely NEW finding surfaced here, disclosed rather than silently accepted:** `/api/projects/:id/cost-breakdown`'s `consumed` field is, by design (confirmed via source read), **Material-Issue-only** — it does not include Labour or Project Expense at all, despite the field's name suggesting total cost consumption. This is not a defect (the field is internally consistent with its own narrower SAP-style definition — Committed/Received/Invoiced/Paid/Consumed all describe the procure-to-pay/material lifecycle specifically), but it is a naming/scope trap for anyone reading that one endpoint in isolation expecting it to represent total project cost. `/api/project-pl` is the correct endpoint for that. Logged in the defect register as a low-severity documentation/naming clarity item, not an accounting defect.

---

## 17. Tax Reconciliation (Part R)

**PROVEN LIVE**, checked after every major scenario:

- Trial Balance: balanced at every checkpoint (Scenario 5: Dr=Cr; Scenario 6/7 regression: Dr=Cr=₹7,155,826.71 at the final check).
- AR/AP reconciliation: MATCH at every checkpoint.
- Output Tax / Input Tax: independently reconciled against the raw GL lines of the exact source documents for every CN/DN in the GST matrix (§8), not derived from any ERP summary report — every one matched to the rupee.

---

## 18. ID Generator Follow-Up (Part U)

STATICALLY VERIFIED. A repository scan for the remaining `array.length+1` pattern (after Phase 32's 16 fixes) found **77 occurrences** across 77 distinct collections (a slightly narrower count than Phase 32's "80 remaining" estimate, due to regex-pattern differences between the two census passes — both are honestly disclosed, not reconciled to a false precision).

Classified against the mission's named priority categories (GL, AR, AP, inventory, quotation, project, PO, GRN, invoice, receipt, payment, CN, DN, asset, labour, expense):

| Category | Series found unsafe | Action |
|---|---|---|
| **GL/Invoice/Bill (draft precursor)** | `DB.jeDrafts` (`DRAFT-`) — precursor to EVERY invoice, bill, advance, milestone invoice, service invoice, AMC billing, and Manual JE | **FIXED this phase** |
| **AR/AP settlement** | `DB.clearings` (`CLR-`) — every receipt/payment/CN/DN clearing | **FIXED this phase** |
| **Payment** | `DB.paymentApprovals` (`PAYREQ-`) | **FIXED this phase** |
| **PO precursor** | `DB.purchaseRequisitions` (`PR-`) — gates PO creation under SOP §7 | **FIXED this phase** |
| **Inventory** | `DB.inventoryTransfers` (`ITR-`) | **FIXED this phase** |
| CN/DN (all 4 series) | None found unsafe — already fixed in Phase 32 | No action needed |
| Quotation, Project, PO, GRN, JE, Labour, Expense, Asset | None found unsafe — already fixed in Phase 32 | No action needed |
| Everything else (72 remaining occurrences: audit log, leads, estimation requests, costing versions, production/installation/service/after-sales/job-work operational records, master-data setup batches, etc.) | Lower business/financial-blast-radius, per the same judgment discipline used in Phases 30–32 | **NOT FIXED**, explicitly disclosed — not claimed safe merely because "lower risk" without this reasoning |

**5 of 77 fixed this phase**, all justified individually above (all touch GL/AR/AP/inventory/PO/payment paths named explicitly in the mission's priority list). 72 remain, honestly disclosed.

---

## 19. Duplicate-ID Regression (Part V)

**PROVEN LIVE.** Full 105-collection scan after ALL of today's activity (Objective A fix + Scenarios 5/6/7 + regression re-runs):

- **ID duplicates: still exactly 3, all pre-existing, ZERO new** — `inventoryMovements` (MV-000121, MV-000124) and `inventoryAdjustments` (IADJ-0015), unchanged from the Phase 32 baseline.
- **Document-number duplicates:** 4 `quotationNo` values (one more than Phase 32's baseline of 3) — the new one, `QTN/2026-27/0011`, individually verified to be another legitimate Rev-0/Rev-1 revision pair (`QTN-0014` Superseded / `QTN-0015` Accepted), not a defect.

**ZERO NEW DUPLICATES**, confirmed against the Phase 32 baseline exactly as the mission requires.

---

## 20. Failure/Atomicity (Part W)

**PARTIALLY VERIFIED.** Not re-instrumented with deliberate fault injection this phase (same disclosed limitation as Phase 32's Part S). Relied on: (a) the existing GL-attempted-before-commit pattern (CODE VERIFIED across `createGRN`, `createMaterialIssue`, CN/DN functions — each attempts `postJournalEntry()` first and returns early with zero writes if it fails), and (b) live proof that every REJECTED attempt this phase (over-credit, over-debit, closed-project, closed-period, unauthorized) left the AR/AP/project-cost figures exactly where they were before the attempt — checked by re-fetching state after each rejection, not merely trusting the error message.

---

## 21. Audit Verification (Part X)

**PROVEN LIVE**, not merely code-read (per this phase's explicit mandate, in contrast to Phase 32). A direct query of `/api/audit-log` for `ClosedProjectPostingOverride` returned 7 real entries with correct `userId`, `role`, `projectId`, `action`, `reason`, and `at` timestamp — including entries showing the exact Unicode, special-character, and 3000-character reason strings from the Part E battery stored verbatim, with no truncation or corruption. Audit coverage was spot-checked for this one high-value event type; a full audit-log verification across every mutation type performed this phase was not exhaustively queried (dozens of distinct action types across Scenarios 5–7) — **PARTIALLY VERIFIED**, not claimed complete.

---

## 22. Cross-Reference Testing (Part Y)

**PROVEN LIVE**, with real-but-wrong references (not just phantom IDs), across: a real GRN mismatched to a real-but-wrong PO (Phase 32, re-confirmed unaffected this phase), and the 4 CN/DN cross-pair attacks in §13 (real document IDs of the wrong document TYPE). Wrong customer/wrong material/wrong warehouse/wrong site substitutions specifically were **NOT VERIFIED** this phase — the docCategory-based rejection mechanism proven in §13 gives reasonable confidence these would also be caught (each function looks up its own required fields directly from the referenced document, not from caller-supplied values), but this was not independently exercised live for every named combination.

---

## 23. Historical Regression (Part Z)

**PROVEN LIVE**, re-run after all of today's changes:

- **19/19** historical suite — all PASS.
- Phase 22/23 compound-rule battery — all PASS, including the idempotency check for `inventoryTransfers` (`ITR-0011` returned identically on retry, confirming the new `nextId()`-based generator didn't break idempotent-retry behavior).
- Trial Balance / AR / AP / Output Tax / Input Tax — all correct at every checkpoint.
- **Scenario 2** (Quotation Revision) — re-run fresh: costing math matched, Won transition created PRJ-020 correctly, illegal-transition rejection still correct.
- **Scenario 3** (Partial Procurement) — re-run fresh: PO total ₹31,000 matched, GRN/GL posted correctly, Trial Balance balanced.
- **Scenario 4** (Material Return) — re-run fresh: moving-average calc matched to 4 decimal places, issue value matched the posted JE exactly, return correctly restored stock, Trial Balance balanced. Its own closed-project sub-test (reusing PRJ-013, already closed since Phase 32) hit the **NEW Phase 33 gate** on the setup Material Issue — correctly blocked. This is not a regression: it is live proof the fix's reach extends to a real pre-existing closed project from an earlier phase, not just fresh test fixtures.
- **Scenario 1** was not independently re-run this phase (not flagged as at-risk by any change made) — **NOT VERIFIED fresh**, carried forward from its own prior passing result.

---

## 24. Coverage Metrics

- **Closed-project functions censused:** ~20 named/discovered; **8 fixed** (highest-traffic paths, covering Material Issue, Labour, Expense, PO, GRN, and every draft-based posting via one choke point); 3 categories (fixed-asset postings, site-issue, job-work) disclosed as not fixed.
- **Attack matrix:** 8 distinct actions × BEFORE/AFTER = 16 live data points, all consistent with the fix.
- **Scenario 5:** 2 invoices (full + partial) + 6-point GST matrix + 1 immutability check + 8 reversal-battery cases — **17 live checks**, all matched/correctly rejected.
- **Scenario 6:** 1 full DN + 2 category-validation checks + partial/over/full-DN (4 checks) + 6 reversal-battery cases + 4 cross-pair attacks — **17 live checks**, all matched/correctly rejected.
- **Scenario 7:** 6-step lifecycle build + 8 post-closure attempts + 1 reopen attempt + 1 authorized reversal + 2 profitability cross-checks — **18 live checks**.
- **ID generators:** 96 discovered total (Phase 32) + 77 re-confirmed remaining after Phase 32's 16 fixes; **5 more fixed this phase** (21 of 96/101 total now safe); 72 remain, disclosed.
- **Duplicate-ID scan:** 105 collections, 0 new duplicate IDs, 1 new (benign, verified) document-number "duplicate."
- **Regression:** 19/19 + compound battery + 3 of 4 prior scenarios re-run fresh, all clean.

---

## 25. Defect Register

| ID | Severity | Function | Root Cause | Impact | Fix | Live Verification | Status |
|---|---|---|---|---|---|---|---|
| P33-D1 | **High** (the mission's headline finding, now closed for its highest-traffic paths) | `createMaterialIssue`, `recordLabourWages`, `recordProjectExpense`, `createPurchaseOrder`, `createGRN`, `postDraft` (6 choke points) | No function except `reverseEntry()` ever checked `project.status` before posting a NEW cost | A CLOSED project could accrue unlimited new GL/inventory postings indefinitely | Centralized `assertProjectOpenForPosting()`, wired into all 8 identified functions/choke-points, mirroring the existing closed-period/closed-reversal precedent exactly | Proven live: full BEFORE/AFTER attack matrix (§5/§6), 7 real audit entries confirmed | **FIXED** for the 8 highest-traffic paths; 3 categories remain, disclosed (P33-D2) |
| P33-D2 | Medium (disclosed) | `capitalizeFixedAsset`/`postAssetDepreciation`/`disposeFixedAsset` (via `asset.projectId`), `issueToSite` (via `mrs.projectId`), job-work functions | Same class of gap as P33-D1, not yet extended to these lower-traffic paths | A closed project could still accrue new fixed-asset postings or site-issue/job-work activity | Not fixed this phase — broader scope than this phase's mandate allowed to verify safely | Not live-tested this phase | **DISCLOSED, NOT FIXED** |
| P33-D3 | Low (documentation/naming clarity, not an accounting defect) | `projectCostBreakdown()`'s `consumed` field | Field name suggests total cost consumption; is actually Material-Issue-only by design | A reader relying on `cost-breakdown.consumed` alone would understate total project cost by the Labour+Expense amount | Not a bug — `/api/project-pl` is the correct total-cost endpoint and was cross-verified correct | Proven live: `project-pl` matched manual arithmetic exactly (§16) | **NO FIX NEEDED — clarify naming/documentation in a future phase** |
| P32-D2 (from Phase 32, closed this phase) | High | `createMaterialIssue()` | Original finding | See P33-D1 | See P33-D1 | See P33-D1 | **CLOSED — superseded by and folded into P33-D1's broader fix** |

No defect was found in the CN/DN accounting itself, in the GST matrix, or in any reversal's exact-restoration math across Scenarios 5, 6, or 7.

---

## 26. Remaining Risks

- 72 of 96/101 `length+1` ID generators remain unsafe (disclosed, lower financial-blast-radius, per §18's reasoning).
- Multi-process concurrency safety of the JSON-file architecture remains unverified (carried forward from Phase 32, unaffected by this phase's changes).
- 3 categories of project-linked postings (fixed-asset, site-issue, job-work) remain ungated for closed-project status (P33-D2).
- Cross-reference testing (Part Y) was not exhaustively run for every named wrong-reference combination (wrong customer/material/warehouse/site individually).
- Audit-log verification (Part X) was spot-checked for one high-value event type, not exhaustively queried across every mutation type performed this phase.
- Failure/atomicity (Part W) relied on existing code-level guarantees plus live-observed zero-mutation-on-rejection, not deliberate fault injection.

---

## 27. Final Verdict

**GO WITH CONDITIONS.**

Grounds against an unconditional GO: 72 remaining unsafe ID generators (disclosed, lower-risk); 3 categories of closed-project postings not yet gated (P33-D2, disclosed); several test parts only partially covered (§20–22) and named explicitly rather than folded into a false "complete" claim.

Grounds against NO-GO, per the mission's own explicit gate criteria:
- The closed-project cost-posting gap — the mission's headline concern — is **closed for every high-traffic financial path** (material cost, labour, expense, PO, GRN, and every draft-based posting), proven via a live BEFORE/AFTER attack matrix, not asserted from code alone.
- CN/DN GST accounting is **provably correct** across a 6-point tax matrix, independently pre-calculated in every case, with zero deviation.
- Every reversal (CN, DN, Material Issue, Labour) **exactly restored** the original GL lines, verified line-by-line, not merely assumed from a success response.
- **Zero new duplicate financial/inventory document IDs** were created, confirmed by a full 105-collection scan after all of today's activity, matched against the Phase 32 baseline.
- **Zero partial-mutation events** were observed — every rejected attempt across both scenarios and the attack matrix left state provably unchanged, re-verified by re-fetching data, not by trusting the rejection message alone.
- Project closure **cannot be bypassed** for any of the 8 highest-traffic posting paths; the one remaining bypass class (P33-D2) is disclosed, not hidden.
- Cross-document references were correctly rejected in every case tested, including real-but-wrong-type document IDs (the CN/DN cross-pair attacks), not merely phantom IDs.
- Trial Balance **remained balanced** at every checkpoint across three scenarios and a full regression pass.

This build is not being declared production-ready in general — only the specific surfaces exercised this phase (the closed-project gate on its 8 fixed paths, the 5 newly-fixed ID generators, and the exact Scenario 5/6/7 workflows tested) are certified to the standard above.
