# PHASE 37 — Current Nomenclature Inventory

**Date:** 2026-09-11. Part 2 deliverable. Built from direct extraction against the live codebase
(`server/domain.js`, `server/server.js`, `client_secure/index.html`) plus supporting documentation
(`APPLETREE_ERP_SOP.md`, `APPLETREE_ERP_USER_MANUAL.md`, `HANDOVER_PACKAGE/05_HANDOVER_DOCUMENTATION/`).
Every row cites real file:line evidence — see `PHASE37_NOMENCLATURE_BASELINE.md` for the full raw
extraction this table is built from.

**Scope note**: this inventory covers every module, document type, master data object, status value,
and structurally significant field/button/report label found in the codebase — the terminology that
determines whether an SAP-familiar user understands the system. It does not enumerate every one of
the thousands of individual tooltip/hint strings verbatim (a genuinely infeasible ask for a
~22,000-line, three-file application in one audit pass); domains were sampled exhaustively for
structure (every module, every document type, every status enum, every abbreviation) and
representatively for prose (hints, tooltips, error messages), with every example given cited to a
real line.

| Current Term | Location | Module | Object Type | Meaning | Current Usage | Potential SAP Equivalent | SAP Source | Problem | Recommended Term | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| GRN | domain.js:282, index.html:361 (64/147 live hits) | Procurement/Inventory | Document type | Records what actually arrived against a PO | Universal — menu, functions (`createGRN`), stats, messages | Goods Receipt / Goods Receipt PO | S/4HANA: "Goods Receipt" (MIGO); B1: "Goods Receipt PO" | None — GRN is already India-ERP-standard and the spelled-out label exists in the registry | Keep "GRN" | DO NOT CHANGE |
| Material Requirements (MRQ) | index.html:361, domain.js:3891 | Procurement | Document type | Per-line demand raised against a project/BOM | `createMaterialRequirement`, own status lifecycle | Purchase Requisition (partial) | S/4HANA: no exact per-line-demand equivalent; closer to a PR line | Confusable name vs "Material Requests" below | Keep, but see consistency note | REVIEW (rename candidate, see crosswalk) |
| Material Requests (MR) | index.html:361, domain.js:3954 | Procurement | Document type | Aggregates approved Requirements into procurement-facing lines | `createMaterialRequest`, feeds RFQ/PO | (no single SAP equivalent — this is Appletree's own 2-stage demand model) | N/A | Near-identical name to "Material Requirements" — real risk of user confusion despite genuinely different objects | Keep, but see consistency note | REVIEW (rename candidate, see crosswalk) |
| Purchase Requisition (PR) | index.html:361/370, domain.js:10644 | Procurement SOP | Document type | Formal, SOP-governed purchase requisition | `submitPurchaseRequisition`, own approval matrix | Purchase Requisition | S/4HANA & B1 both use this exact term | Coexists with MRQ/MR above — 3 different "request-shaped" documents in Procurement | Keep term; document the 3-way distinction | DO NOT CHANGE (documentation clarity needed, see Part 22) |
| Material Issue | index.html:362, domain.js:5364 | Inventory | Document type / transaction | Consumes material, the ONLY event hitting Project Actual Cost | 21 client hits, universal | Goods Issue | S/4HANA: "Goods Issue" (MIGO); B1: "Goods Issue" | "Goods Issue" never appears anywhere in this codebase — a real, consistent, deliberate departure from SAP wording | Keep "Material Issue" (see crosswalk reasoning) | DO NOT CHANGE |
| Material Return (Site) | index.html:381 | Inventory | Document type | Internal custody return, site→warehouse, no vendor/GRN | `returnFromSite`, zero GL for Usable condition | Goods Movement (Transfer Posting) | S/4HANA generic movement type | Distinct from "Purchase Returns" below — good, already disambiguated by "(Site)" qualifier | Keep | DO NOT CHANGE |
| Purchase Returns | index.html:381, domain.js:4889 | Inventory/Procurement | Document type | Vendor-facing return against a specific GRN, reduces vendor payable | `createPurchaseReturn` | Returns (Purchase Return / Return to Vendor) | S/4HANA & B1 both use "Purchase Return"/"Return" | None | Keep | DO NOT CHANGE |
| Stock | index.html:362 (tab `grnstock`), 30 hits | Inventory | Report/quantity figure | On-hand quantity report | Stock Report, Stock by Location, Stock Counts, Stock Movement Ledger | Stock (Available Stock) | Both S/4HANA and B1 use "Stock" for on-hand quantity | None — cleanly distinguished from "Inventory" (the module/valuation name) throughout | Keep | DO NOT CHANGE |
| Inventory | index.html:362 (module name), 23 hits | Inventory | Module name / valuation concept | The domain/module, and the GL valuation account name | "Inventory Adjustment," "Inventory Valuation Method," GL account 1200 "Inventory" | Inventory | Both SAP products use "Inventory" this way | One hybrid heading "Inventory Stock (Moving Average)" (index.html:227) mixes both words in one label | Keep both terms; consider splitting the one hybrid heading | OPTIONAL |
| Stock Count | index.html:362, domain.js:8794 | Inventory | Document type | Physical count/reconciliation cycle | `createStockCount`, `DB.stockCounts`, prefix SCT | Physical Inventory (S/4HANA) / Inventory Counting (B1) | S/4HANA: "Physical Inventory Document"; B1: "Inventory Counting Transaction" | "Physical Inventory" never appears in this codebase — deliberate, consistent departure | Keep "Stock Count" (India-SME-accessible term) | DO NOT CHANGE |
| Warehouse | domain.js: seed-only, no `createWarehouse` | Inventory | Master data | Central store, company-owned | `DB.warehouses` | Warehouse / Plant+Storage Location | S/4HANA: "Plant"/"Storage Location"; B1: "Warehouse" | None — B1's "Warehouse" is the closer, correct fit given this app's SME single-entity model | Keep "Warehouse" | DO NOT CHANGE |
| Site | domain.js:10570 | Site Operations | Master data | Project execution location, own pooled ledger | `createSite`, `DB.sites`, `getSiteStockLevel` | Plant (loosely) / no direct SAP equivalent for a construction-project site | Neither S/4HANA nor B1 has a native "project execution site with pooled inventory" concept matching this exactly | None — this is a genuine Appletree/industry-specific concept, not a terminology gap | Keep "Site" | APPLETREE BUSINESS TERM — DO NOT CHANGE |
| Location | domain.js:8184 | Inventory | Master data (optional) | Bin/shelf-level child of a Warehouse | `createLocation`, requires parent `warehouseId` | Storage Location (S/4HANA) / Bin Location (B1) | Both SAP products have a finer sub-warehouse location concept | "Storage Location" itself never appears in this codebase | Keep "Location" (already correctly scoped as optional) | DO NOT CHANGE |
| Vendor (master/field names) | domain.js: `vendorId`, `VENDOR_LOCKED_FIELDS...` | Master Data | Master data | The supplier master object | Internal field/variable names throughout | Vendor (B1) / Business Partner (S/4HANA/B1 10.0+) | See crosswalk — confirmed CONCRETE inconsistency with "Supplier" labels | See "Supplier" row and crosswalk | REVIEW — MUST DECIDE (canonical term) |
| Supplier (document/transaction labels) | domain.js:277, 284, 310 etc. | Finance/Procurement | Document labels | Supplier Bill, Supplier Credit Note, Supplier Debit Note | 57 domain.js / 44 client hits | Supplier (S/4HANA) | S/4HANA renamed "Vendor" to "Supplier" years ago; B1 still says "Vendor" | Master uses "Vendor" internally, documents/UI say "Supplier" — genuine split | Standardize on ONE term | MUST CHANGE (pick one, see crosswalk) |
| "Vendor Payment" (doc-type label) vs "Supplier Payment" (sourceType/UI) | domain.js:274 vs domain.js:2992 | Finance | Document-type label | The same real AP payment transaction | **CONFIRMED inconsistency**: `glDocumentTypes` seeds `{code:'PAY', label:'Vendor Payment'}` while the actual posting uses `sourceType:'Supplier Payment'` | N/A | N/A | Two different labels for the IDENTICAL document type — a real, concrete bug-adjacent finding | Pick one term, fix the seed | MUST CHANGE |
| Business Partner | index.html:3569 (1 occurrence) | Finance (JE print template) | UI label only | Display label for a JE's `party` field | One isolated print-template label; no underlying `businessPartner` field/master exists anywhere | Business Partner (S/4HANA) | S/4HANA's unified party concept | Misleading — implies a unified BP master that does not exist in this codebase (Customer/Vendor remain separate masters everywhere else) | Change this one label to match the rest of the app ("Party" or "Customer/Vendor") | MUST CHANGE — ARCHITECTURAL TERMINOLOGY DIFFERENCE (see Part 3) |
| Material | domain.js/index.html: 135/159 hits | Master Data | Master data | The single item/product master | Universal | Material (S/4HANA & B1 both use "Item Master"/"Material Master" depending on module) | S/4HANA MM: "Material"; B1: "Item" | None — "Material" is well-established and dominant; "Item"(5)/"Product"(6) are incidental, not competing terms | Keep "Material" | DO NOT CHANGE |
| Journal Voucher (menu) vs Journal Entry (everywhere else) | index.html:368/385 ("New Journal Voucher") vs pervasive "Journal Entry" elsewhere | Finance | Document type | The GL posting transaction | See full audit — one menu label says "Voucher," the underlying object/table/every other label says "Entry" | Journal Entry (S/4HANA) / Journal Entry or JV (B1, India localization uses "Journal Voucher") | Both real SAP terms depending on product/localization | Minor, single-location inconsistency | Standardize the one menu label | SHOULD CHANGE |
| Reconciliation (recon) vs Bank Reconciliation (bankrecon) | index.html:368 | Finance | Report/feature | Two DIFFERENT features sharing a root word | `reconcileAR`/`reconcileAP` (AR/AP subledger-to-GL matching) vs bank statement import/matching | Both are real, distinct SAP concepts (Account Reconciliation vs Bank Reconciliation) | S/4HANA/B1 both separate these | Both already have distinguishing labels ("Reconciliation" generic tab is AR/AP; "Bank Reconciliation" is separate) — low ambiguity risk if content is right | Confirm menu tooltips make the AR/AP scope explicit | REVIEW |
| Clearing | domain.js:2871, `DB.clearings`, account 2050 "GR/IR Clearing" | Finance | Concept/document | Settling an open item against a payment/receipt | Extensively and consistently used; "Settlement" never appears as a synonym | Clearing (both S/4HANA & B1 use this exact term) | Universal SAP term | None | Keep | DO NOT CHANGE |
| Post / Submit / Approve / Reverse / Cancel / Close / Clear | domain.js: `postXxx`/`submitXxx`/`approveXxx`/`reverseEntry`/`cancelXxx`/`closeXxx`/`clear*` | Workflow | Action verbs | See full status dictionary (Part 15) | Each verb is used with ONE consistent, non-overlapping meaning across ~250 routes (verified via representative function sampling) | Release/Post/Submit/Reverse/Cancel/Clear (S/4HANA workflow terms) | S/4HANA & B1 both distinguish these the same way | None found — genuinely well-disciplined verb usage | Keep all | DO NOT CHANGE |
| "Release" (bare, as a button) | — | — | — | Does not exist as a UI action | Confirmed zero button-label matches; only used internally for PO-commitment/production-order-status meanings | Release (S/4HANA MM/PP standard verb) | S/4HANA | Not a problem — Appletree's "Approve" already covers what SAP calls "Release" for POs; no user-facing gap | N/A | DO NOT CHANGE (do not introduce "Release" as a new button merely to match SAP) |
| APOB | index.html:332/370, domain.js:11423 | Job Work/Compliance | Indian GST term | "Additional Place of Business" declaration for an unregistered job worker | Real feature (`createAPOBDeclaration`), never expanded in the UI itself (only in APPLETREE_ERP_SOP.md:448) | N/A — Indian GST statutory term, no SAP equivalent | N/A | Abbreviation never defined on first UI appearance (Part 19's own rule) | Add a one-time inline expansion in the UI | SHOULD CHANGE |
| MRS | index.html:328/5908, domain.js:318 | Site Operations | Document type | Site Material Requisition | Registry spells out "Material Requisition Slip (Site)"; UI spells out "Material Requisition — Site (MRS)" once, then abbreviation-only | No direct SAP equivalent (India-SME/construction-specific) | N/A | Two DIFFERENT spelled-out forms exist ("Requisition Slip" vs "Requisition — Site") — minor inconsistency | Standardize on one spelled-out form | SHOULD CHANGE |
| Delivery Challan | domain.js:319, `DB.deliveryChallans` | Site/Job Work | Document type | Transporter/vehicle-carrying dispatch document | Real, extensively used (site material issue AND job-work dispatch) | Delivery Challan — a genuine Indian statutory/logistics term, not an SAP concept per se, though S/4HANA India localization also uses this exact term | India GST/logistics rule + SAP India localization | None | Keep | DO NOT CHANGE |
| Gate Pass | — | — | — | Does not exist in code (only referenced in 3 separate markdown gap-register docs, not opened this phase) | Confirmed absent from `server/domain.js` and `client_secure/index.html` | N/A | N/A | Not a live inconsistency (not implemented) — flag only if those markdown gap registers imply a planned feature | N/A | NOT APPLICABLE (verify markdown gap docs separately if pursued) |
| Change Request (Variations) | index.html:219/370, domain.js:3536 (prefix CR) | Projects | Document type | Formal project scope/cost/revenue change | Used 100% interchangeably with "Variation" throughout the codebase's own comments and reports (`projectVariationSummary`, "Project x Variation") | Change Request (generic) / no exact SAP CO equivalent for "Variation" in this sense | N/A | None — genuinely consistent synonym usage, not two competing concepts | Keep both, current UI parenthetical "(Variations)" is correct and sufficient | DO NOT CHANGE |
| Project Cost / Actual Cost / Project P&L / Project Profitability | domain.js: `projectPL` (3069), `projectCostBreakdown` (5730), `companyProjectProfitability` (7700) | Projects/Controlling | Reports | Three DIFFERENT real functions | `projectPL`=literal P&L (revenue−cost); `projectCostBreakdown`=5-stage committed→consumed; `companyProjectProfitability`=company rollup separating committed vs actualCost | Actual Cost (CO) / Project P&L (both real, distinct SAP CO concepts) | S/4HANA CO module distinguishes these the same way | The UI label "Project Cost" is not itself used for any of these three function names directly — worth confirming the UI never conflates them | Confirm/preserve the 3-way distinction in any UI copy | REVIEW |
| Cost Centre / Profit Centre | domain.js:233-238 seed, `DB.costCentres`/`DB.profitCentres` | Master Data/Controlling | Master data | Independent tagging dimensions on GL lines, not a hierarchy | Cost Centres real & used (CC-DESIGN/FACTORY/SITE/INSTALLATION); Profit Centres real but deliberately seeded empty pending real management data | Cost Center / Profit Center (both SAP products) | S/4HANA CO / B1 both use these exact terms (British "Centre" spelling is a deliberate India-localization choice, confirmed consistent throughout) | None — spelling and usage both consistent | Keep | DO NOT CHANGE |
| BOM / Bill of Materials | index.html:242 (spelled out once), domain.js:952 (registry) | Estimation/Manufacturing | Master data | Single, project-scoped, versioned "recipe" | One BOM concept used identically for both site-material budget-checking and Production Orders — no separate "Production BOM" | Bill of Material (BOM) — universal SAP term (both products) | Universal | None | Keep | DO NOT CHANGE |
| Production Order | domain.js:6052 ("not the full factory ERP" — code's own caveat) | Manufacturing | Document type | Real, with Job Cards/Schedule/Factory Dashboard | "Work Order," "Work Centre," and "Routing/Operation" as formal entities are all CONFIRMED ABSENT | Production Order (S/4HANA) / Production Order (B1) | Universal | None — SAP-aligned term already in use; absent sub-concepts (Routing, Work Centre) are real feature gaps, not naming issues | Keep | DO NOT CHANGE (feature-gap disclosure only, not a naming fix) |
| Snag | domain.js:291/6512 | Execution/Delivery | Document type | Post-installation defect/punch item | Real, consistent; "Punch List" confirmed absent | Punch List (construction-industry English term, not SAP-specific) / no exact SAP equivalent | N/A | None | Keep "Snag" (India/UK construction-industry standard term) | APPLETREE/INDIA BUSINESS TERM — DO NOT CHANGE |
| Job Worker | domain.js:11178 | Job Work | Master data | An outside-processing VENDOR/COMPANY (GSTIN/PAN/registered — entity fields, not a person) | `createJobWorker`, `DB.jobWorkers`, company-wide (not project-scoped) | Subcontractor (loosely) — SAP has no exact "Job Work" concept (this is an India-specific GST/manufacturing-outsourcing process) | N/A | None — correctly modeled as an entity, and the term itself is India-manufacturing-standard | Keep | APPLETREE/INDIA BUSINESS TERM — DO NOT CHANGE |
| WBS / Work Breakdown Structure | — | Projects | — | Confirmed absent entirely | Zero matches in domain.js or index.html | Work Breakdown Structure (S/4HANA PS) | S/4HANA Project System | Not a naming issue — a genuine unimplemented feature | N/A | NOT APPLICABLE — NO DIRECT SAP EQUIVALENT IMPLEMENTED |
| Batch / Serial Number / Bin (as trackable inventory attributes) | — | Inventory | — | Confirmed absent — stock is a single fungible moving-average pool per warehouse/site | No lot/batch or serial tracking anywhere in the domain model | Batch Management / Serial Number Profile (S/4HANA) | S/4HANA MM | Not a naming issue — a genuine unimplemented feature; must not claim these SAP terms apply | N/A | NOT APPLICABLE — NO DIRECT SAP EQUIVALENT IMPLEMENTED |
| "Save" button | index.html:3920/5741/5751/5765 | Admin/Config | UI action | Persist a CONFIGURATION value (policy/GST/cash-limit/PO config) | Cleanly separated — never used on a transactional document (those use Draft/Submit/Approve/Post) | Save (universal UI convention, not SAP-specific) | N/A | None | Keep | DO NOT CHANGE |
| Goods Receipt PO / A/P Invoice / A/R Invoice (SAP B1 exact terms) | — | — | — | Confirmed absent — this codebase never uses B1's literal document names | Zero matches for any of the three phrases | N/A | SAP Business One | Confirms the app is NOT modeled after B1's literal terminology, informs the SAP-source decision in the crosswalk | N/A | REFERENCE — informs SAP source-attribution decision |

## Additional confirmed findings (finance/tax/banking agent, full detail)

| Current Term | Location | Module | Object Type | Meaning | Current Usage | Potential SAP Equivalent | SAP Source | Problem | Recommended Term | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| "Vendor Payment" (fully confirmed) | domain.js:274 ONLY | Finance | Doc-type label | AP payment | This is the SOLE occurrence of "Vendor Payment" anywhere in the 3 files — 0 hits in server.js, 0 in index.html. Every other surface (`sourceType:'Supplier Payment'` domain.js:2992, UI heading index.html:288, menu label, report name "Supplier Payment Register") says "Supplier Payment." | Supplier Payment | S/4HANA (post-2015 Vendor→Supplier rename) | One orphaned label in a registry table nobody renders | Fix the one line to `label:'Supplier Payment'` | MUST CHANGE (trivial, 1-line fix, zero risk) |
| Journal Entry vs Journal Voucher | Both used ~7 times each | Finance | Document type | The GL posting document | UI/menu/heading dominant: "Journal Voucher" (index.html:283 `<h2>New Journal Voucher</h2>`, menu label, doc-type `label:'Journal Voucher'`). Internal/comment prose dominant: "Journal Entry" (used in ~3 code comments, 1 user-visible prompt at index.html:4257, `docCategory:'JournalVoucher'` as the actual data value). The FORM'S OWN visible field says "Remarks" where the underlying field/API is `narration` — a third small drift. | Journal Entry (S/4HANA) / Journal Voucher (India-localization term, also used by B1 India) | Both real, product/localization-dependent | Same object, two labels, no user confusion risk (only ONE screen, ONE doc type) but inconsistent | Standardize on "Journal Voucher" (already dominant in the live UI, and closer to the India-market audience) | SHOULD CHANGE (prompt string, comments, and the internal narration-default string) |
| `SRET` ("Site Return") registry gap | domain.js:850 (guard list) vs base seed 269-327 | Finance registry | Doc-type label | A migration-guard comment references `['SRET','Site Return']` as a Phase-33 addition, but NO such entry exists in the base `glDocumentTypes` seed array (only `PRET`="Purchase Return" exists there) | Confirmed divergence — likely a dead/unused label reference, not a live bug (the actual `returnFromSite()` function doesn't appear to consume a `glDocumentTypes` entry named SRET based on evidence gathered) | N/A | N/A | Registry/comment inconsistency — worth a direct code check before deciding whether this is cosmetic or a real latent numbering gap | Verify and either add the missing seed entry or remove the stale guard-list reference | REVIEW |
| Clearing vs Settlement | domain.js: 88 Clearing hits vs. 1 Settlement hit (in a comment) | Finance | Concept | Settling an AR/AP open item | "Settlement" is informal prose in exactly one comment (domain.js:2868); no `DB.settlements`, no `settleInvoice()` function, no UI screen uses the word | Clearing (S/4HANA & B1 both) | Universal | None — already fully confirmed as a non-issue | Keep "Clearing"; the one comment's word choice is harmless prose, not a competing mechanism | DO NOT CHANGE |
| Reconciliation (overloaded) | `recon` tab vs `bankrecon` tab vs others | Finance | Report/feature | AT LEAST 4 distinct real features share the word "Reconciliation": (1) `recon` tab = subledger-vs-GL-control-account proof for AR/AP/output-tax/input-tax/customer-advances (`reconcileAR`, `reconcileAP`, `reconcileOutputTax`, `reconcileInputTax`, `reconcileCustomerAdvances`); (2) `bankrecon` tab = bank-statement-line-vs-GL matching (separate ICICI import pipeline, `bankReconciliationStatus`); (3) period-close checklist (`periodCloseReconciliation`, bundles several of the above plus inventory/bank checks); (4) non-financial: `siteMaterialReconciliationReport` (site-level quantity, no GL at all) and `pettyCashReconciliation` (float reconciliation) | Both already correctly separated into 2 distinct menu tabs (`recon`/"Reconciliation" and `bankrecon`/"Bank Reconciliation") — low real-world ambiguity since users navigate by tab, not by the bare word | Account Reconciliation vs Bank Reconciliation (S/4HANA/B1 both distinguish these) | S/4HANA/B1 | The bare tab label "Reconciliation" (not "AR/AP Reconciliation") could be clearer about its own scope | Consider renaming the `recon` tab label to be explicit about scope (e.g. "AR/AP/Tax Reconciliation") | OPTIONAL |
| Customer Credit/Debit Note vs Supplier Credit/Debit Note | Both sides fully symmetric now | Finance | Document type | Both exist as real, distinct functions/collections | `createCustomerCreditNote`/`createCustomerDebitNote` (domain.js:7952/8000) and `createSupplierCreditNote`/`createSupplierDebitNote` (domain.js:5070/5138) — the code's own comment at 5123-5136 discloses this symmetry was ADDED in "Phase 24 Part B" specifically because an earlier audit found the Supplier side asymmetric (Credit Note only, no Debit Note) | Credit Memo / Debit Memo (S/4HANA) or Credit Note / Debit Note (B1, India-standard) | Both real | None — a genuinely resolved prior gap, now fully symmetric | Keep | DO NOT CHANGE |
| Trial Balance implementation location | server.js:810-815 (inline route handler) vs domain.js `periodTrialBalance()` (10515) | Finance | Report | Company-wide trial balance is computed inline in the ROUTE HANDLER, not as a `domain.js` function; a separately-named, period-scoped `periodTrialBalance()` DOES exist in domain.js | Both are genuine, correct debit/credit-by-account sums — verified NOT mislabeled | Trial Balance (universal) | Universal | Architectural inconsistency (one computed in the route layer, one in the domain layer) — not a naming problem, noted for engineering hygiene only | N/A (out of nomenclature scope) | NOT APPLICABLE (flag for a future engineering-hygiene pass, not this audit) |
| "Vendor" as internal parameter/collection name | `vendorId`, `DB.vendors`, `createVendorMaster` — pervasive in domain.js | Master Data | Internal implementation | Confirmed: even `postSupplierPayment({vendorId, ...})` — a function whose UI label and GL sourceType both say "Supplier" — still takes a parameter literally named `vendorId` | This is the clearest, most complete evidence of the Supplier/Vendor split: THREE layers (internal param/collection name = "Vendor"; GL sourceType/doc-type-label = mixed; UI label = "Supplier") | Supplier (S/4HANA) or Vendor (B1) | See crosswalk | Real, structural, multi-layer inconsistency | Pick ONE canonical term; per Part 31, the internal parameter/collection name can stay technically as-is if renaming risks breaking working code — but the DISPLAY layer must be made 100% consistent | MUST CHANGE (display layer); internal names OPTIONAL per Part 31 API-compatibility rule |

## Abbreviation frequency (client UI), raw counts

| Abbreviation | Client hits | Spelled out anywhere in UI/code? |
|---|---|---|
| PO | 66 | Yes — "Purchase Orders" menu label |
| GRN | 64 (+147 domain.js) | Once, parenthetically (index.html:226) |
| GL | 40 | Module context only ("General Ledger" spelled in menu) |
| BOM | 28 | Once (index.html:242) |
| AR | 25 | "AR Ageing" menu label spells "AR" not "Accounts Receivable" |
| AP | 19 | Same pattern as AR |
| TDS | 17 | Never expanded in UI (Indian statutory term, widely understood in context) |
| HSN | 12 | Never expanded in UI (Indian statutory term) |
| APOB | 8 | Never expanded in UI (only in SOP doc) |
| MRS | 7 | Once, partially ("Material Requisition — Site (MRS)") |
| ITC | 7 | Never expanded in UI |
| CAPA | 6 | Never expanded in UI |
| JE | 5 | "Journal Entry"/"New Journal Voucher" spelled in menus |
| UOM | 3 | Never expanded |
| PR | 2 | "Purchase Requisitions" menu label spells it |
| GST/CGST/SGST | 4/1/1 | Statutory term, universally understood, never expanded |
| IGST | 0 (bare); real feature exists (`GST12` tax code, "IGST (inter-state)") | Present as a tax-code concept, never surfaced as a bare "IGST" UI label |
| SAC, WIP, COGS | 0 | Confirmed absent — SAC (services tax code) may be a genuine scope gap if Appletree ever bills services separately from goods; WIP/COGS are simply not used as standalone UI/report terms |

Full abbreviation dictionary with SAP-usage comparison is in `APPLETREE_ERP_TERMINOLOGY_STANDARD.md`.

## Appendix — full `glDocumentTypes` dictionary (server/domain.js:269-327 base seed)

This is the authoritative document-type-label registry, extracted verbatim. It is distinct from
(but overlaps with) the 51-prefix table in the baseline — this table is specifically the labels
used for `docTypeCode`/voucher-number generation on GL-postable documents.

| code | label | prefix |
|---|---|---|
| JE | Journal Voucher | JV |
| INV | Sales Invoice | INV |
| PO | Purchase Order | PO |
| RCPT | Customer Receipt | RCPT |
| PAY | **Vendor Payment** *(confirmed inconsistent — see finding above)* | PAY |
| CN | Credit Note | CN |
| DN | Debit Note | DN |
| BILL | Supplier Bill | BILL |
| CLR | Clearing Document | CLR |
| QTN | Quotation | QTN |
| MR | Material Request | MR |
| RFQ | RFQ | RFQ |
| GRN | Goods Receipt Note | GRN |
| PRET | Purchase Return | PRET |
| SCN | Supplier Credit Note | SCN |
| PROD | Production Order | PROD |
| ISS | Material Issue | ISS |
| DSP | Dispatch | DSP |
| DLV | Delivery Confirmation | DLV |
| INST | Installation | INST |
| QCK | QC Checklist | QCK |
| SNG | Snag | SNG |
| HO | Handover | HO |
| WAR | Warranty | WAR |
| CMP | Complaint | CMP |
| TKT | Service Ticket | TKT |
| VIS | Service Visit | VIS |
| AMC | AMC Contract | AMC |
| CAPA | CAPA Case | CAPA |
| ITR | Inventory Transfer | ITR |
| IADJ | Inventory Adjustment | IADJ |
| JT | Journal Template | JT |
| REC | Recurring Entry | REC |
| FA | Fixed Asset | FA |
| OB | Opening Balance | OB |
| BXFR | Bank/Cash Transfer | BXFR |
| SDN | Supplier Debit Note | SDN |
| DMG | Damage Report | DMG |
| SCT | Stock Count | SCT |
| LBR | Labour Wages | LBR |
| PEXP | Project Expense | PEXP |
| JC | Job Card | JC |
| PR | Purchase Requisition | PR |
| MRS | Material Requisition Slip (Site) | MRS |
| DC | Delivery Challan | DC |
| SMR | Site Material Receipt | SMR |
| PCV | Petty Cash Voucher | PCV |
| PCF | Petty Cash Float | PCF |
| JWO | Job Work Order | JWO |
| EWB | E-way Bill Record | EWB |
| ITCR | ITC Reversal | ITCR |

Plus migration-guard-patched additions (pushed at runtime for any pre-existing DB): XMI (Excess
Material Issue Approval, domain.js:948), BOM (Bill of Materials, :952), XBA (Excess Billing
Approval, :954), CR (Change Request, :958), MRQ (Material Requirement, :961).

## Status dictionary and document-type dictionary

See `PHASE37_NOMENCLATURE_BASELINE.md` §3-4 for the complete raw 51-prefix document-type table and
26-constant status-value table this inventory is built from. The full analyzed dictionaries (with
SAP mapping, accounting/inventory effect, and decision per entry) are in
`PHASE37_FINAL_NOMENCLATURE_AUDIT.md` Parts 15-16.
