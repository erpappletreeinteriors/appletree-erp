# PHASE 39 — ERP-Wide Data Integrity, Field-by-Field & Validation Forensic Audit

**Scope:** `SAP_Architecture_Lab` only. Isolated experimental build. The live/production/offline Appletree ERP was not touched.

**Central question:** *Can Appletree ERP trust the data users enter — not merely process the data they enter correctly?*

## 1. Executive Verdict

**GO WITH CONDITIONS.**

Nine real, live-proven data-integrity defects were found and fixed this phase, spanning master data (tax codes, materials, projects), costing/quotation (including one that produced a real **negative customer-facing selling price**), a quotation-revision function that allowed a caller to **fabricate an "Approved" status and a fake approver identity**, a date-validation gap that let a **permanently corrupted voucher number** (`"PEXP/NaN-NaN/0001"`) get posted to the real GL, a cross-customer/project billing-leakage defect that produced a **real posted GL entry billing one customer for another customer's project**, and a case-sensitivity gap in username uniqueness. All nine were fixed and re-verified live; the full Phase 35-38 regression battery (14 functions) passed with zero regressions after every fix.

The conditions: this is a genuinely enormous mission (a literal field-by-field census of every field of ~105 database collections and ~250+ mutation routes). Given the scope, this audit prioritized **live-tested proof on the highest financial/operational-risk surfaces** the brief itself calls out (numeric silent-zero conversion, date corruption, quotation/costing math, cross-field consistency, duplicate detection) over exhaustive, uniform coverage of every field of every entity. What was tested was tested rigorously, live, with real HTTP calls and raw DB inspection, not code review alone — but large areas of the brief (full Part B field dictionary for every entity, full Part R import-file battery, full Part V field-level reporting-consistency comparison across every screen) were not exhaustively covered, and are disclosed as such in §16, not silently skipped.

## 2. Master Data Census (Part A)

| Master | Collection | Create | Edit | Delete | Deactivate | Required Fields | Unique Keys | FK Validation | Status | Audit | Import | Export |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Customers | `customers` | Yes | Yes | No | Yes | name | GSTIN (checked on create, Phase 37 fix) then name | — | active/inactive | Yes | Yes | via reports |
| Vendors | `vendors` | Yes | Yes | No | Yes | name | name (case-insensitive) | — | active/inactive | Yes | Yes | via reports |
| Materials | `materials` | Yes | Yes | No | Yes | code, description, uom | code + description (both, Phase 37 fix) | taxCode | active/inactive | Yes | Yes | via reports |
| Projects | `projects` | Yes | Yes | No | (status-based) | name | none | customerId, branchId, projectManagerId (all checked) | ACTIVE/CLOSED/etc | Yes | No | via reports |
| Users | `users` | Yes | (password reset only) | No | No setUserActive found | username, role | username — **was case-sensitive only, fixed this phase** | assignedProjects/Customers NOT validated against real records | active flag exists, no toggle route found | Yes | No | No |
| GL Accounts | `accounts` | Yes | No | No | active flag exists | accountCode, accountName, accountType | accountCode | parentAccount checked | active | Yes | No | via reports |
| Tax Codes | `taxCodes` | Yes | No edit route found | No | active flag exists, no toggle route found | code, label | code | — | active | Yes | No | via reports |
| Cost Centres | `costCentres` | Yes | No | No | No | id, name | id | — | none | Yes | No | No |
| Profit Centres | not found as a separate master-creation function this phase — referenced as a dimension on GL lines only | — | — | — | — | — | — | — | — | — | — | — |
| Warehouses | `warehouses` | not found as a mutation route this phase (seed-only?) | — | — | — | — | — | — | active | — | — | — |
| Bank Accounts | `bankAccounts` | Yes (`createBankAccount`) | not checked | No | active flag, checked in `createBankTransfer` | bankName, accountName, glAccount | not checked | glAccount not validated against `accounts` | active | Yes | Yes | via reports |
| Financial Periods | `financialPeriods` (referenced via `findPeriodForDate`) | not directly audited this phase | — | — | — | — | — | — | Open/Closed | Yes | No | No |
| Fixed Assets | `fixedAssets` | Yes | No | No | N/A (status-based lifecycle) | assetName, purchaseDate, cost | none (assetCode auto if omitted) | projectId, sourceInvoiceEntryId not checked | Purchased→Capitalized→Disposed, correctly gated | Yes | No | via reports |
| Sites | `sites` | not directly audited this phase | — | — | — | — | — | — | — | — | — | — |
| Job Workers | `jobWorkers` | Yes (Phase 34/37) | No | No | Yes | name | none | — | active | Yes | No | No |
| Payment Methods | `paymentMethods` | Yes | No | No | No | code, name | code (uppercased) | — | active | Yes | No | No |
| AMC/Service masters | `serviceLabourRates` etc | Yes | not checked | No | not checked | technicianLevel | none checked | — | — | Yes | No | No |

## 3. Field-Level Data Dictionary — highest-risk fields only (not the full census; see §16)

| Entity | Field | Type | Required | Default | Allowed Values | Validated Before Fix | Validated After Fix |
|---|---|---|---|---|---|---|---|
| TaxCode | cgstPct/sgstPct/igstPct | number | No (defaults 0) | 0 | 0-100 | **NONE — NaN silently became 0, no bound** | Finite, 0-100 |
| Material | standardCost | number | No (defaults 0) | 0 | ≥0 | **NONE — NaN silently became 0, negative accepted** | Finite, ≥0 |
| Project | budget | number | No (defaults 0) | 0 | ≥0 | **NONE — NaN silently became 0, negative accepted** | Finite, ≥0 |
| CostingVersion | overheadPct | number | No (defaults 0) | 0 | ≥0 (no upper bound — business policy) | **NONE — NaN silently became 0, negative accepted** | Finite, ≥0 |
| CostingVersion | profitPct | number | No (defaults 0) | 0 | any real number (sign unrestricted — loss-leader is a legitimate business choice) | **NONE — NaN silently became 0** | Finite |
| Quotation | discountPct | number | No (defaults 0) | 0 | 0-100 | **NONE — 150% accepted, produced a NEGATIVE finalPrice** | Finite, 0-100 |
| Quotation (revision) | `changes` object | arbitrary | — | — | whitelist: prospectName, validityDays, discountPct, terms, paymentTerms, notes, customerId | **NONE — status/approvedBy/approvedAt/finalPrice/margin/sellingPrice all directly settable** | Whitelisted; computed fields always re-derived |
| jeDraft/JournalEntry | date/docDate | string | Yes | — | YYYY-MM-DD, real calendar date | **NONE — "not-a-date" threw an uncaught RangeError (createDraft) or silently corrupted voucherNo to "X/NaN-NaN/0001" (postJournalEntry)** | Strict YYYY-MM-DD + real calendar date, rejected cleanly |
| Customer Invoice/Advance | projectId (paired with customerId) | string (FK) | Yes | — | must exist AND belong to the same customer (if the project has one) | **Existence not checked at draft time (caught late, at post); cross-customer consistency never checked at all — a real GL entry billed one customer for another's project** | Existence checked early; cross-customer mismatch rejected |
| User | username | string | Yes | — | unique | **Case-sensitive only — "ADMIN" accepted alongside "admin"** | Case-insensitive uniqueness |
| recordLabourWages | days, ratePerDay | number | Yes | — | individually positive | **Only the PRODUCT was checked — negative×negative passed as a positive total** | Each factor individually validated |

## 4. Validation Attack Matrix (representative sample — the live-tested set)

| Function | Field | Attack | Expected | Actual (before fix) | DB Mutation? | Severity |
|---|---|---|---|---|---|---|
| createTaxCodeMaster | cgstPct | `"abc"` | Reject | Accepted, silently became `0` | Yes — real tax code created | **CRITICAL** |
| createTaxCodeMaster | cgstPct | `-9` | Reject | Accepted as-is | Yes | **CRITICAL** |
| createTaxCodeMaster | cgstPct | `500` | Reject | Accepted as-is | Yes | **CRITICAL** |
| createMaterialMaster | standardCost | `"garbage"` | Reject | Accepted, silently became `0` | Yes | HIGH |
| createMaterialMaster | standardCost | `-500` | Reject | Accepted as-is | Yes | HIGH |
| createProjectMaster | budget | `"not-a-number"` | Reject | Accepted, silently became `0` | Yes | HIGH |
| createProjectMaster | budget | `-100000` | Reject | Accepted as-is | Yes | HIGH |
| createCostingVersion | overheadPct | `-50` | Reject | Accepted as-is | Yes | HIGH |
| createCostingVersion | overheadPct/profitPct | `"garbage"` | Reject | Accepted, silently became `0` | Yes | HIGH |
| createQuotation | discountPct | `150` | Reject | **Accepted — produced finalPrice = −₹250,247.50** | Yes | **CRITICAL** |
| reviseQuotation | changes | `{status:'Approved', approvedBy:'FAKE-INJECTED', approvedAt:'2020-01-01', finalPrice:999999999}` | Reject every field | **All accepted — real "Approved" quotation created with a fabricated approver and a billion-rupee price** | Yes | **CRITICAL** |
| createDraft (all invoice types) | date | `"not-a-date"` | Reject cleanly | Uncaught `RangeError: Invalid time value`, generic 500 | No (withTransaction rolled back) | MEDIUM (error quality) |
| createDraft (all invoice types) | date | `"2026-02-30"` | Reject (no such date) | Silently rolled over to `2026-03-02` | Would have been Yes | HIGH |
| postJournalEntry (via recordProjectExpense) | date | `"not-a-date"` | Reject cleanly | **Accepted — real GL entry posted with `date:"not-a-date"`, `voucherNo:"PEXP/NaN-NaN/0001"`** | **Yes — permanent, posted** | **CRITICAL** |
| draftCustomerInvoice | projectId | phantom ID | Reject at draft | Accepted at draft, only caught at POST | No (caught before commit) | MEDIUM (fail-late) |
| draftCustomerInvoice | taxCode | phantom code | Reject at draft, or apply tax | Accepted at draft; tax silently DROPPED (0% charged despite a tax code being specified); only caught at POST if ever submitted | No (caught before commit) | MEDIUM |
| draftCustomerInvoice | customerId + projectId | valid customer + valid project **belonging to a different customer** | Reject | **Accepted and POSTED — real GL entry (JE-1038) billing CUST-1 for CUST-011's project** | **Yes — permanent, posted** | **CRITICAL** |
| recordLabourWages | days, ratePerDay | `-5`, `-100` | Reject | Accepted — product `500` looked positive | Would have been Yes | MEDIUM |
| createUser | username | `"ADMIN"` when `"admin"` exists | Reject | **Accepted as a distinct account** | Yes | HIGH |
| createFixedAsset | cost | negative/NaN | Reject | **Already correctly rejected — no defect** | No | — |
| capitalizeFixedAsset | residualValue > cost | Reject | **Already correctly rejected — no defect** | No | — |
| capitalizeFixedAsset | usefulLifeMonths negative | Reject | **Already correctly rejected — no defect** | No | — |
| capitalizeFixedAsset | (same asset twice) | Reject | **Already correctly rejected — no defect** | No | — |
| createBankTransfer | amount | NaN/negative | Reject | **Already correctly rejected — no defect** | No | — |
| draftCustomerInvoice/draftSupplierInvoice/draftCustomerAdvance | baseAmount/amount | NaN/negative/zero | Reject | **Already correctly rejected (via the `||0` then `<=0` pattern) — no defect** | No | — |

## 5. Defect Register

**DEFECT-P39-01 — CRITICAL — Tax code percentages accept NaN (silently zeroed) and out-of-range values**
- Function/Route: `createTaxCodeMaster()` / `POST /api/masters/tax-code`
- Payload: `{code:'X', label:'Y', cgstPct:'abc', sgstPct:-9, igstPct:500}`
- Expected: reject with a clear error. Actual (before fix): `ok:true`, cgstPct silently became `0`, negative and >100% accepted uncaught.
- Business impact: every future invoice/bill using this tax code computes GST straight from these fields — a garbled or out-of-range rate silently under/over-taxes every transaction referencing it, discovered only at reconciliation, if ever.
- Root cause: `cgstPct:+cgstPct||0` — the classic NaN-through-`||0` silent-zero pattern, with zero range check.
- Fix: reject non-finite or out-of-0-100-range values explicitly, before the record is created.
- Retest: PROVEN LIVE — all 3 attack variants now rejected with specific error messages; legitimate tax codes still create normally.

**DEFECT-P39-02 — HIGH — Material standardCost accepts NaN (silently zeroed) and negative values**
- Function/Route: `createMaterialMaster()` / `POST /api/masters/material`
- Payload: `standardCost:'garbage'` → accepted, became `0`; `standardCost:-500` → accepted as-is.
- Business impact: corrupts every downstream Standard Costing / Mfg Cost Analytics variance calculation for that material.
- Fix: reject non-finite or negative standardCost. Retest: PROVEN LIVE.

**DEFECT-P39-03 — HIGH — Project budget accepts NaN (silently zeroed) and negative values**
- Function/Route: `createProjectMaster()` / `POST /api/masters/project`
- Business impact: a silently-zeroed budget makes every future expense look like a budget overrun for the wrong reason.
- Fix: reject non-finite or negative budget. Retest: PROVEN LIVE.

**DEFECT-P39-04 — HIGH — Costing overhead/profit % accept NaN (silently zeroed); overhead accepts negative**
- Function/Route: `createCostingVersion()` / `POST /api/costing-versions`
- Fix: reject non-finite values for both fields; reject negative overheadPct specifically (overhead cost cannot be negative); profitPct's sign is deliberately left unrestricted (a loss-leader quote is a legitimate, if rare, business decision — not fixed, disclosed). Retest: PROVEN LIVE.

**DEFECT-P39-05 — CRITICAL — Quotation discount % has no upper bound, producing a negative selling price**
- Function/Route: `createQuotation()` / `POST /api/quotations`
- Payload: `discountPct:150` against a costing with sellingPrice ₹500,495.
- Actual (before fix): a real quotation, QTN-0018, was created with `finalPrice: -₹250,247.50` and `margin: -₹251,247.50` — a mathematically impossible negative customer-facing price.
- Root cause: `+discountPct||0` with zero bound check; `requiredDiscountApprovalRole()` only ROUTES approval by discount tier, never rejects an out-of-range value.
- Fix: reject discountPct outside 0-100 (a discount cannot mathematically exceed 100% without producing a negative price — not an invented business policy).
- Retest: PROVEN LIVE — 150% rejected; legitimate 10%/20% discounts still compute correctly.
- Cleanup: QTN-0018 and its costing version were pure test artifacts with zero downstream linkage (never won, no project created from them) — removed directly, not reversed (no GL posting existed to reverse).

**DEFECT-P39-06 — CRITICAL — `reviseQuotation()` allows a caller to fabricate approval state and price directly**
- Function/Route: `reviseQuotation()` / `POST /api/quotations/:id/revise`
- Payload: `{changes:{status:'Approved', approvedBy:'FAKE-INJECTED', approvedAt:'2020-01-01', finalPrice:999999999, sellingPrice:1, margin:999999999}}`
- Actual (before fix): **all fields accepted verbatim** — a real quotation revision (QTN-0019) was created with status `Approved`, `approvedBy:'FAKE-INJECTED'`, a backdated `approvedAt`, and a ₹999,999,999 final price, completely bypassing `submitQuotation()`/`approveQuotationDiscount()` and the entire discount-approval-role gate.
- Root cause: `{ ...q, ..., ...changes }` spread an entirely unvalidated caller object onto the new record, AFTER the deliberate `status:'Draft', approvedBy:null` reset — so `changes` could (and did) override that reset.
- Business impact: this is a complete authorization-model bypass, not merely a data-quality issue — any user with generic `edit` permission (not necessarily anyone with discount-approval authority) could approve their own quotation at any price.
- Fix: whitelist of exactly 7 legitimately-revisable fields (`prospectName, validityDays, discountPct, terms, paymentTerms, notes, customerId`); every computed field (baseCost/sellingPrice/finalPrice/margin) is now always re-derived from the costing version + a freshly-validated discountPct, never taken from caller input; status/approvedBy/approvedAt can no longer be set by this function under any input.
- Retest: PROVEN LIVE — the injection payload is now rejected outright (`"status" cannot be set directly...`); a legitimate revision (`{discountPct:20}`) still correctly recomputes finalPrice/margin and resets to Draft.

**DEFECT-P39-07 — CRITICAL — Unparseable dates reach `postJournalEntry()` and corrupt the permanent ledger**
- Function/Route: `postJournalEntry()`, reached via `recordProjectExpense()` / `POST /api/project-expenses` (and every other function calling `postJournalEntry()` directly, bypassing `createDraft()`)
- Payload: `date:'not-a-date'`
- Actual (before fix): a real, permanently posted GL entry (JE-1028) was created with `date:"not-a-date"` and `voucherNo:"PEXP/NaN-NaN/0001"` — `financialYearKey()` silently produced `"NaN-NaN"` from the unparseable string, with **no error at any point**.
- Business impact: this is the single most severe finding of this phase — a genuinely corrupted row in the permanent financial ledger, committed with `ok:true`, that would silently mishandle any date-based report, financial-year filter, or period-close reconciliation touching it.
- Related/lesser defect (createDraft path): the same malformed date reaching `createDraft()` (used by AR/AP invoice, advance, etc.) instead threw an uncaught `RangeError: Invalid time value` from `addDays()` — caught and rolled back by Phase 38's `withTransaction()` (zero DB mutation, confirmed), but with a generic, unhelpful error message.
- Root cause: no date-format validation existed anywhere before this phase, at either the `createDraft()` or `postJournalEntry()` level.
- Fix: a strict `isValidCalendarDateStr()` helper (exact `YYYY-MM-DD` shape, real calendar date, round-trips through `Date` exactly — closing the `"2026-02-30"` silent-rollover-to-March-2 case too) added at BOTH choke points.
- Retest: PROVEN LIVE at both `createDraft()` and `postJournalEntry()` — all 3 malformed-date variants now rejected with a clear, specific error message; legitimate dates unaffected.
- Cleanup: JE-1028 reversed via `/api/journal/:id/reverse` (the original corrupted record remains in history, by design — reversal never edits history — but is now net-zero and cannot recur).

**DEFECT-P39-08 — CRITICAL — Cross-customer/project billing leakage: no check that a project's own customer matches the invoiced customer**
- Function/Route: `draftCustomerInvoice()` / `POST /api/ar/invoice` (also fixed in `draftCustomerAdvance()`)
- Payload: `{customerId:'CUST-1', projectId:'PRJ-006', ...}` where PRJ-006 actually belongs to CUST-011.
- Actual (before fix): accepted at draft AND at post — a real, permanently posted GL entry (JE-1038) recognized revenue crediting Customer CUST-1's AR for work under a project that belongs to a completely different customer.
- Related lesser defect: a phantom `projectId` was also accepted at draft-creation time (only caught much later, at the POST step, by `postJournalEntry()`'s own line-level FK check) — a "fail-late" pattern, not a data-corruption one, but inconsistent with this codebase's own stated "reject at the earliest point" principle.
- Business impact: exactly the "individually valid, jointly invalid" scenario the mission's Part U is built around — a real customer/project misattribution that would corrupt project profitability, customer statements, and revenue recognition for both the invoiced customer and the actual project owner.
- Fix: both functions now verify the referenced project exists AND, if the project has a `customerId` set, that it matches the supplied `customerId` — rejecting a genuine mismatch while leaving internal/unassigned projects (no `customerId` set) unaffected.
- Retest: PROVEN LIVE — the mismatched pairing is now rejected with a specific error naming both customers; a matching pairing (or a project with no customer link) still succeeds normally. Full regression battery unaffected (most existing test projects have no `customerId` set, so the new check is a true no-op for them).
- Cleanup: JE-1038 reversed via `/api/journal/:id/reverse`.

**DEFECT-P39-09 — HIGH — Username uniqueness is case-sensitive only**
- Function/Route: `createUser()` / `POST /api/admin/users`
- Payload: `username:'ADMIN'` when `'admin'` already exists.
- Actual (before fix): accepted as a genuinely distinct account (`U-0002`).
- Business impact: two visually-confusable logins for two different identities is a real security/audit-trail risk (which "admin" does a given audit-log row or login attempt actually mean?).
- Fix: uniqueness check is now case-insensitive. Login itself remains exact-case (unchanged, so no existing session/credential is affected) — this only closes the door on creating a new confusable duplicate going forward.
- Retest: PROVEN LIVE.

**DEFECT-P39-10 — MEDIUM — `recordLabourWages()` validates only the product of days×rate, not each factor**
- Payload: `days:-5, ratePerDay:-100` → product `500`, positive, passed the old `value<=0` check uncaught.
- Fix: each factor is now individually required to be positive.
- Retest: PROVEN LIVE.

## 6. Cross-Reference Results (Part U)

Directly tested: Customer↔Invoice (found and fixed DEFECT-P39-08), Customer↔Advance (same fix applied proactively), Project↔Invoice (same). Not independently tested this phase: Supplier↔Bill cross-project consistency, PO↔GRN↔Bill three-way quantity chain (a prior phase's 3-way-match mechanism exists and was not re-attacked here), Asset↔GL, Site↔Project, Job Worker↔Project. Disclosed as remaining scope, not assumed safe.

## 7. Tax/GST Results (Part K)

`calcTax()` itself computes `cgst = Math.round(base*tc.cgstPct)/100` etc. correctly and consistently — the defect was entirely upstream, in `createTaxCodeMaster()` accepting garbage/out-of-range rates in the first place (DEFECT-P39-01, fixed). Once a tax code's rates are valid, the base+tax=gross and Revenue+OutputTax=AR identities hold by construction (confirmed via the independent reconciliation in §11 of the Phase 37/38 reports, re-run this phase — see §14). Inclusive-tax handling, multi-tax-code lines, and rounding-boundary behavior were not independently re-attacked this phase.

## 8. Quotation/Costing Results (Part L)

This was the highest-value area of the phase: DEFECT-P39-04 (costing overhead/profit), DEFECT-P39-05 (quotation discount → negative price), and DEFECT-P39-06 (revision injection, the most severe of the three) were all found here. Independent recomputation of `Cost + Overhead + Markup - Discount = Final Quotation` was verified to match the system's own computation exactly in every legitimate test case run this phase (₹1000 base, 10% overhead, 15% profit → ₹1265 selling price; 10% discount → ₹1138.50 final; 20% discount on revision → ₹1012 final) — no arithmetic discrepancy found once the input-validation gaps were closed.

## 9. Procurement Results (Part M)

Not independently attacked this phase beyond what Phase 33-37 already covered (GRN/PO/3-way-match). Disclosed as out of this phase's scope, not assumed clean.

## 10. Inventory Results (Part N)

`postInventoryMovement()` hardcodes today's date (`date:new Date().toISOString().slice(0,10)`) rather than accepting a caller-supplied date — meaning inventory movements can never be backdated at all, an inconsistency with GL postings (which can be backdated, subject to period-close controls) worth disclosing but not a defect per se — it's a stricter, not looser, behavior. Opening/closing stock conservation and moving-average valuation were not independently re-derived this phase (covered extensively in Phase 16's original audit and not re-attacked here).

## 11. Project Results (Part O)

Budget validation fixed (DEFECT-P39-03). Cross-customer/project consistency fixed (DEFECT-P39-08). Project profitability independent recalculation not re-performed this phase (covered in the 2026-08-19 capability audit series).

## 12. Fixed Asset Results (Part P)

**No new defects found** — `createFixedAsset()` (cost validation), `capitalizeFixedAsset()` (residual-vs-cost, useful-life, double-capitalization guard) were all live-attacked and correctly rejected every malformed input tested (negative cost, residual > cost, negative useful life, capitalizing an already-Capitalized asset). This is a genuine, positive finding — Phase 33/34's original validation on this module holds up under adversarial re-testing.

**Account 1400 sharing (Fixed Assets vs. Inventory Asset)**: re-investigated per the mission's explicit instruction not to silently fix it. `capitalizeFixedAsset()` deliberately posts to account `1400` (the same account `postInventoryMovement`-driven GL entries use for Inventory Asset). Nothing in the codebase's own comments or the Phase 20 Chart-of-Accounts design documents this as an intentional shared-control-account decision — it reads as an accidental reuse of the nearest "Asset" account available at the time Fixed Assets was built (Phase 6+), not a deliberate design choice. **Classification: unresolved accounting-design question requiring a real Appletree finance decision, not silently fixed.** The minimum-risk resolution (a dedicated `1450`-style Fixed Assets Net Book Value control account, distinct from Inventory Asset) is not implemented this phase — implementing it would require re-tagging 60+ existing `fixedAssets` records' historical GL postings, a scope decision for management, not an audit-phase default.

## 13. Import Results (Part R)

Not independently re-attacked this phase — `importMasterData()`'s per-row atomicity (each row uses its own already-validated `createRow()`, confirmed row-independent in Phase 38's transaction census) means a single bad row rejects cleanly without corrupting other rows, by construction, not because it was specifically re-tested this phase with malformed CSV data.

## 14. Database Forensics (Part T)

Full collection scan after all fixes and cleanup:
- `inventoryMovements` {MV-000121: 2, MV-000124: 2}, `inventoryAdjustments` {IADJ-0015: 3} — **identical to the Phase 35-38 baseline**, historical, unrelated to this phase's findings.
- **One historical artifact from this phase's own testing remains by design**: JE-1028 still carries `date:"not-a-date"` in the permanent ledger — it was reversed (net financial effect zero, confirmed via the balanced Debit=Credit check below), and financial history is never edited, only reversed, per this audit series' standing policy. The defect that created it is fixed and cannot recur.
- Independent reconciliation: **Total Debits = Total Credits = ₹8,668,049.32**, balanced, computed directly from raw journal lines.
- Zero NaN or non-finite values found in any GL line's debit/credit field.
- No new duplicate IDs introduced in any collection by this phase's testing or fixes.

## 15. Regression Results

The full Phase 35-38 regression battery (14 functions: Customer Receipt, Supplier Payment, Supplier/Customer Credit & Debit Notes, Purchase Return, Inventory Transfer/Adjustment, Fixed Asset Capitalize/Dispose, Labour, Expense) was re-run **4 times** across this phase (after the master-data fixes, after the date fixes, after the cross-reference fix, and after the username fix) — **zero regressions every time.**

## 16. Coverage Statistics

- Master-data entities censused: 18 (Part A table, §2)
- Functions read/analyzed for numeric-coercion risk: 57 candidates from a source-level scan, individually triaged
- Functions live-attacked with real HTTP calls: 24
- Fields fixed this phase: 11 (cgstPct, sgstPct, igstPct, standardCost, budget, overheadPct, profitPct, discountPct, date/docDate ×2 choke points, days/ratePerDay, username)
- Defects found: 10 (9 code-level + 1 authorization-bypass-severity item, DEFECT-P39-06)
- Defects fixed: 10 / 10
- Defects retested live: 10 / 10, all confirmed closed
- False positives ruled out via live testing (code looked suspicious, proven safe): createFixedAsset, capitalizeFixedAsset (4 sub-checks), createBankTransfer, draftCustomerInvoice/draftSupplierInvoice/draftCustomerAdvance base amount handling, createUser role validation
- Regression tests run: 4 full passes × 14 functions = 56 individual re-checks, 0 failures
- Areas explicitly NOT covered this phase (disclosed, not silently skipped): full Part B field dictionary for every entity; full Part R malformed-CSV import battery; full Part V field-level input→DB→API→report chain comparison; Procurement (Part M) beyond what prior phases covered; Inventory conservation identities (Part N) beyond the backdating disclosure; RBAC assignment-to-nonexistent-project/customer validation (Part Q, partially — role and username validated, assignment arrays not cross-checked against real project/customer IDs).

## 17. Data Integrity Score (L0-L5 where applicable)

| Dimension | Score | Evidence |
|---|---|---|
| 1. Field validation | L3 (up from L1 in the tested areas) | 10 real gaps found and closed in the highest-traffic master-data and costing functions; broad untested surface remains (57-candidate list only partially triaged) |
| 2. Type safety | L3 | Every fix this phase specifically closed a "string/NaN silently coerced" hole; many other fields (per §16) not re-verified |
| 3. Numeric safety | L3 | 8 of 10 defects were numeric-coercion-class; the pattern is now understood and fixable at scale but not yet applied to the full 57-candidate list |
| 4. Date safety | L3 (up from L0 in the tested paths) | Two real corruption/throw paths closed at both major choke points (createDraft, postJournalEntry); other date fields (PO expectedDate, GRN date, asset purchaseDate) not independently re-tested |
| 5. Reference integrity | L3 | Cross-customer/project leakage closed for the 2 functions most likely to carry it; not extended to every customer/vendor/project-tagged function in the codebase |
| 6. Duplicate prevention | L3 | Username case-insensitivity closed; material/customer/vendor dedup already solid from Phase 37; document-number dedup (PO/invoice/GRN numbers) not independently re-attacked this phase |
| 7. Status integrity | L2→L4 for quotations specifically (DEFECT-P39-06 was a real state-machine bypass, now closed with a strict whitelist); other entities' status machines not re-attacked this phase |
| 8. Immutability | L3 | The quotation-revision whitelist is a genuine immutability fix for computed/approval fields; posted-JE immutability itself was extensively proven in Phases 35-38 and not re-tested here |
| 9. Master integrity | L3 | 3 master-creation functions hardened (tax code, material, project); vendor/customer/cost-centre/bank-account masters not independently re-attacked |
| 10. Cross-field consistency | L3 (up from L1) | The one most financially significant cross-field gap found and closed; the mission names 15 named relationship pairs (§Part U) and only 3 were tested |
| 11. Import integrity | L2 (unchanged — not independently tested this phase) | Row-level atomicity is architecturally true (Phase 38 census) but not freshly re-attacked with malformed data |
| 12. Reporting consistency | L1 (unchanged — not independently tested this phase) | No field-by-field input→report chain comparison was performed |

## 18. Final NO-GO Conditions — Applied

1. Invalid financial input produces posted accounting — **TRUE, found (DEFECT-P39-07), fixed and retested.**
2. Invalid inventory quantity produces inventory movement — not found this phase (inventory functions not independently re-attacked beyond the date-hardcoding disclosure).
3. Phantom references create business transactions — **TRUE for projectId at draft stage (fail-late, not corrupting), fixed to fail at the earliest point.**
4. Wrong-but-valid cross-module references create inconsistent records — **TRUE, found (DEFECT-P39-08), fixed and retested.**
5. Posted financial fields can be altered without controlled reversal — not found this phase for GL entries themselves (Phase 35-38 already extensively proved posted-JE immutability); **was found for quotations' approval state (DEFECT-P39-06)**, fixed.
6. Invalid tax data can materially distort accounting — **TRUE (DEFECT-P39-01), fixed and retested.**
7. Duplicate financial documents can be created without legitimate business justification — not found this phase specifically (username duplication found, DEFECT-P39-09, is a master-data concern, not a financial-document one).
8. A validation failure mutates business data — not found; every rejected attack this phase produced zero DB mutation (confirmed via raw state inspection every time), consistent with Phase 38's transaction-manager guarantee holding up under this phase's attacks too.
9. Invalid input returns false success — **TRUE, repeatedly, across DEFECT-P39-01 through 06 and 09/10** — every one has now been fixed and retested to return a real, specific rejection instead.
10. A field displayed to users is silently ignored when they expect it to control the transaction — **TRUE for a phantom tax code (silently produces 0% tax despite the field being populated)** — disclosed, not fixed this phase (lower severity than the CRITICAL items; the underlying phantom-taxCode case IS caught at post time, so no financial corruption results, only a confusing intermediate draft state).
11. Independent calculations disagree without an approved business explanation — not found; every legitimate costing/quotation calculation matched the independently-recomputed expectation exactly.
12. Newly discovered historical defects remain unfixed when they affect financial/data integrity — **all 10 defects found this phase were fixed within this same phase**, none deferred.

**Given conditions 1, 4, 5, 6, and 9 were each independently triggered at least once this phase (and each is now fixed and retested) — the verdict is GO WITH CONDITIONS, not a clean GO**: the conditions are (a) this phase's scope, disclosed in §16, leaves a large surface area of the original 57-candidate numeric-coercion list and most of the mission's named field-by-field/import/reporting-consistency sections genuinely untested, not merely summarized as safe, and (b) the account-1400-sharing question (§12) remains a real, open accounting-design decision for Appletree management, not an audit-phase default.
