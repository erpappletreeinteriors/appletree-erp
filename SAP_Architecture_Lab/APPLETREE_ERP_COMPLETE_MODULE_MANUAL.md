# APPLETREE ERP — COMPLETE MODULE-BY-MODULE USER MANUAL

**Updated 2026-09-19.** This is the detailed, structural reference manual — organized exactly the way
the system's own left-hand menu is organized, module by module, screen by screen, with the full
navigation hierarchy, who can see what, what every screen actually does, its key fields, the
step-by-step procedure, and the business rules behind it.

**How this relates to the other manuals in this folder:**
- `APPLETREE_ERP_USER_MANUAL.md` — a short, plain-English "how do I do X" guide for everyday staff.
- `APPLETREE_ERP_SOP.md` — the official Standard Operating Procedure, organized by business PROCESS
  (60 parts) rather than by screen, with the formally approved rules (approval tiers, cash limits,
  etc.) and end-to-end worked examples.
- **This document** — the complete structural reference: every module, every screen, in the order
  they appear on screen, with real depth per screen. Use this one when you want to understand exactly
  what a specific screen does, or to see the whole system's shape at a glance.

Nothing in this document is invented — every screen, field, rule, and status named here was verified
directly against the live system's own code and, where noted, against real test evidence from this
engagement's testing history.

---

## PART 1 — THE FULL NAVIGATION HIERARCHY

The system organizes every screen into 15 module groups, shown down the left side of the screen.
This is the complete, current tree:

```
HOME
└── Dashboard

SALES & CRM
├── Leads
└── Quotations

ESTIMATION & COSTING
├── Estimation & Costing
├── BOM
└── BOM Consumption Report

PROJECTS
├── Projects
├── Project 360
├── Budget vs Commitment vs Actual
└── Change Requests (Variations)

PROCUREMENT
├── Material Requirements
├── Material Requests
├── RFQs
├── Supplier Quotations
├── Comparisons
├── Purchase Orders
├── GRNs
├── Procurement Intelligence
├── Replenishment Recommendation
├── Vendor Rating
├── Vendor-wise Purchase Report
├── Purchase Requisitions
├── Payment Requests
└── Site Material

INVENTORY
├── Stock
├── Movement Ledger
├── Transfer
├── Adjustment
├── Material Issues
├── Material Return (Site)
├── Purchase Returns
├── Damage Reports
├── Stock Report
├── Locations
├── Stock by Location
├── Stock Counts
└── Material Analysis

SITE OPERATIONS
├── Labour & Wages
├── Labour Cost Analysis
├── Project Expenses
├── QC Dashboard
├── Project Timesheet
├── Tasks
├── Risk Register
├── Weekly Scorecard
└── Site Material  (shared with PROCUREMENT)

PRODUCTION & JOB WORK
├── Production Orders
├── Factory Dashboard
├── Machines
├── Job Cards
├── Production Schedule
├── Job Analysis
├── Job Cost Sheet
├── Product Costing
├── Labour Performance
└── Job Work

EXECUTION & DELIVERY
├── Dispatch
├── Delivery
├── Installation
├── QC
├── Snags
├── Handover
└── Billing Milestones

FINANCE
├── Document Workflow
├── New Journal Voucher
├── Customer Invoice
├── Customer Receipt
├── Customer Credit/Debit Note
├── Supplier Bill
├── Supplier Payment
├── Customer Advance
├── Journal Templates
├── Recurring Entries
├── Import (CSV)
├── Journal Register
├── Document Viewer
├── Bank Reconciliation
├── Reconciliation
├── Financial Periods
├── Fixed Assets
├── Bank / Cash Transfer
├── Supplier Debit Note
├── ICICI Bank Import
├── Master Data Import
├── Opening Balances
├── Compliance Dashboard
├── SOP Configuration
├── Payment Requests  (shared with PROCUREMENT)
├── Petty Cash
├── APOB & E-way Bill
├── ITC / BOQ Reports
└── TDS Reporting

FINANCIAL STATEMENTS
├── Balance Sheet
├── Company Profit & Loss
├── General Ledger
├── Customer Ledger
├── Supplier Ledger
├── Trial Balance
├── AR Ageing
└── AP Ageing

SERVICE & AFTER-SALES
├── Customer 360
├── Customer Profitability
├── Warranty
├── Complaints
├── Service Tickets
├── Service Visits
├── AMC
├── AMC Schedule
├── Service Billing
└── CAPA

REPORTS & ANALYTICS
├── Accounting & MIS Quick Reports
├── Accountant MIS
├── Management MIS
├── Cross-Dimensional Reports
├── Company Profitability
├── HSN Data Quality
├── Exports
└── Audit Log

MASTER DATA
├── Branches
├── Profit Centres
├── Bank Accounts
├── Chart of Accounts
└── Cost Centres

ADMINISTRATION
├── Policy Configuration
├── Users & Roles
└── Try Unauthorized Action

(Backup / Restore exists but has NO screen — see Part 15.)
```

---

## PART 2 — ROLES AND WHAT THEY SEE

There are 10 roles. Two (Admin, CEO) see every module. The other 8 each see a curated subset — this
is a *convenience filter only*, not the real security boundary; the real security check happens on
the server every time, regardless of what your menu shows.

| Role | Modules visible in the menu |
|---|---|
| **Admin** | Everything |
| **CEO** | Everything |
| **Accountant** | Home, Finance, Financial Statements, Reports & Analytics |
| **Finance Manager** | Home, Finance, Financial Statements, Reports & Analytics, Master Data, Procurement, Projects |
| **Project Manager** | Home, Sales & CRM, Estimation & Costing, Projects, Procurement, Site Operations, Execution & Delivery, Inventory, Service & After-Sales, Reports & Analytics |
| **Purchase** | Home, Procurement, Inventory, Production & Job Work, Reports & Analytics |
| **Sales** | Home, Sales & CRM, Projects, Service & After-Sales, Reports & Analytics |
| **Estimator** | Home, Sales & CRM, Estimation & Costing, Projects |
| **Site In-charge** | Home, Projects, Site Operations, Execution & Delivery, Inventory, Service & After-Sales |
| **Viewer** | Home, Projects, Financial Statements, Reports & Analytics (read-only everywhere) |

If a screen you need isn't on your menu, that's usually intentional for your role — check with
whoever manages the system rather than assuming it's missing.

---

## PART 3 — HOME

### Dashboard
**Purpose:** Your landing page after login — a role-aware summary (e.g., open items relevant to you).
**Who:** Everyone.
**How to use it:** Nothing to fill in — just read it. It's your starting point every day.

---

## PART 4 — SALES & CRM

*This is where every job begins — turning an enquiry into a priced, approved offer.*

### Leads
**Purpose:** The very first record of a potential customer/job.
**Who:** Sales, Estimator (view), Admin, CEO.
**Key fields:** Name, contact details, site address, what they want (requirement), expected value,
next follow-up date.
**Steps:**
1. Click to add a new Lead. Fill in the fields above.
2. The Lead starts at status **NEW**.
3. When you're ready to size the job, click the one-click **Create Estimation Request** action on the
   Lead's own row — this automatically moves the Lead's status to **ESTIMATION** and hands it to
   Estimation & Costing.
**Rules:** A Lead's status moves forward automatically as the deal progresses (NEW → ESTIMATION →
QUOTATION → WON, or LOST at any point) — you don't set this manually.

### Quotations
**Purpose:** The customer-facing priced offer, built from an Estimator's Costing Version.
**Who:** Sales creates/submits; Finance Manager or CEO approves discounts above the free tier;
Estimator/Accountant/FinanceManager/CEO/Viewer can view.
**Key fields:** Which Costing Version to price from, prospect/customer name, discount %, validity
days, payment terms.
**Steps:**
1. Pick the Costing Version prepared for this Lead's Estimation Request.
2. Enter a discount % if applicable. The system calculates the final price automatically
   (`sellingPrice × (1 − discount%)`).
3. Click **Submit**.
4. If the discount is **5% or less**, it auto-approves immediately. Above 5% and up to 10%, a
   **Finance Manager** must approve. Above 10%, the **CEO** must approve. You cannot approve your own
   quotation's discount, regardless of your role.
5. Once approved, record the customer's **Acceptance** (currently a manual record — there is no
   e-signature integration yet, this is a disclosed, known gap, not a bug).
6. Click **Mark Won**. This is the single most important button in this screen: it creates a real
   Project, finds-or-creates the real Customer record, assigns a Project Manager, and freezes a Cost
   Baseline — all in one atomic step. It cannot be clicked twice for the same Quotation (a duplicate
   attempt is correctly rejected, live-proven in this engagement's own testing).
**Rules:** A Quotation cannot mix a Lead, Estimation Request, and Costing Version from unrelated
chains — the system checks the three references genuinely belong together before allowing creation
(this exact check was added after a real defect, DEF-P41-01, was found and fixed in this engagement).
Until a Quotation is Won, **zero accounting entries exist anywhere** for that deal — creating a Lead,
an Estimation Request, a Costing Version, or even a Submitted/Approved Quotation never touches the
General Ledger. Only a posted Customer Invoice, much later, does.

---

## PART 5 — ESTIMATION & COSTING

### Estimation & Costing
**Purpose:** Where an Estimator works out the real cost of a job and the price it should sell for.
**Who:** Estimator creates; Sales/Accountant/FinanceManager/CEO can view (Sales only ever sees the
final selling price, never the internal cost breakdown — a deliberate field-level security rule).
**Key fields:** Material lines (each with quantity and rate), Labour cost, Transport cost,
Installation cost, Other cost, Overhead %, Profit %.
**Steps:**
1. Open the Estimation Request that Sales sent you.
2. Add your material lines — the system totals them into a Material Cost automatically.
3. Enter Labour/Transport/Installation/Other costs — these are job-level, charged once per costing,
   not multiplied per line item.
4. Enter your Overhead % (added on top of the base cost) and Profit % (applied after overhead) — the
   system computes the final Selling Price for you: `((baseCost) × (1+overhead%)) × (1+profit%)`.
5. Save — this becomes a **Costing Version**. You can create more than one version for the same
   Estimation Request if you want to compare different approaches; each is numbered and kept.
**Rules:** Quantity and rate must both be greater than zero on every line; overhead % cannot be
negative; profit must be a real, finite number.

### BOM (Bill of Materials)
**Purpose:** Defines exactly what materials (and how much of each) go into making something.
**Who:** Purchase/Admin typically create; the workflow requires a second person to approve.
**Key fields:** Project, description, lines (material, quantity, unit, scrap %).
**Steps:**
1. Create the BOM with at least one line — an empty BOM cannot be created (this closes an old defect
   where a zero-item BOM could be waved through as complete).
2. **Submit** it.
3. A different, authorized person clicks **Approve** — only a Submitted BOM can be approved; you
   cannot approve straight from Draft (this exact Draft→Submitted→Approved discipline was added as a
   fix in this engagement, closing a real UI navigation gap).
**Rules:** Only an Approved BOM can be referenced by a real Production Order.

### BOM Consumption Report
**Purpose:** Read-only comparison of what a BOM said should be used vs. what was actually consumed.
**Who:** Anyone with Manufacturing/Production visibility.
**How to use it:** Pick a project, read the variance.

---

## PART 6 — PROJECTS

### Projects
**Purpose:** The master list of every real, Won project.
**Who:** Everyone with Projects visibility (scope varies — a Project Manager sees only projects
they're assigned to; CEO/Admin/FinanceManager see all).
**How to use it:** Click any row to open its detail.

### Project 360
**Purpose:** The single richest screen in the whole system for understanding one project — budget,
committed value, actual spend, customer, QC status, and a **Document Flow** panel that assembles
every connected document for that project into one chain, in both directions:
- **Forward (sales origin):** Lead → Estimation Request → Costing Version → Quotation → this Project.
- **Forward (execution/settlement):** Purchase Requisition → Purchase Order → GRN → Supplier Bill →
  Payment Request → Supplier Payment → Clearing; and Customer Invoice → Customer Receipt → Clearing.
- Also covers Site Material Requisition → Delivery Challan → Site Material Receipt, and Job Work
  Orders.
**Who:** Project Manager (own projects), FinanceManager, CEO, Admin, Sales (own leads' projects).
**How to use it:** Pick a project from the dropdown/list; everything renders automatically. You never
need to remember or type a document number — click through the chain instead.

### Budget vs Commitment vs Actual
**Purpose:** Read-only report — budget, what's been ordered/committed, and what's actually been
spent, side by side for a chosen project.

### Change Requests (Variations)
**Purpose:** Tracks scope changes a customer asks for mid-project, separately from the original
Quotation, with their own cost impact.
**Steps:** Create a Change Request describing what changed and its value; it's tracked against the
project without altering the original baseline numbers.

---

## PART 7 — PROCUREMENT

### Purchase Requisitions
**Purpose:** An internal "we need to buy this" request, raised before a Purchase Order, for planned
or larger needs.
**Steps:** Create it describing what's needed and why; it goes through its own approval before it can
be referenced on a real PO. Optional for small/urgent buys, recommended for anything significant.

### Material Requirements (MRQ)
**Purpose:** Shows the calculated material demand that comes out of an approved BOM — how much of
what material is needed, for which project. Read-only/computed, not something you create by hand.
**Note:** "Material Requirements" (MRQ) and "Material Requests" (MR) are two DIFFERENT, real
documents with deliberately similar names — MRQ is the calculated need; MR is the actual bundled
request you raise to go buy it. This naming similarity is a known, disclosed point of confusion
(tracked as an open item pending a business decision on renaming), but the two documents themselves
work correctly and are not the same thing.

### Material Requests (MR)
**Purpose:** Bundles approved Material Requirements into concrete lines that an RFQ or PO can be
raised against.
**Steps:** Create it referencing the Requirements it covers; this becomes the actual procurement
trigger document.

### RFQs → Supplier Quotations → Comparisons
**Purpose:** The formal sourcing chain.
**Steps:**
1. Create an **RFQ** (Request for Quotation) for the material/service you need.
2. Send it to one or more suppliers; record what each quotes back under **Supplier Quotations**.
3. Open **Comparisons** to see all the quotes side by side (price, lead time, terms) before deciding.

### Purchase Orders
**Purpose:** The formal, legally-binding order to a supplier.
**Key fields:** Supplier, project, lines (material, quantity, rate, UOM).
**Steps:**
1. Create the PO.
2. **Submit** it.
3. Approval tier depends on value: **up to ₹5,00,000** it auto-approves; **₹5,00,000 to
   ₹20,00,000** requires a **Finance Manager**; **above ₹20,00,000** requires the **CEO** (thresholds
   are Appletree's own approved SOP values, not invented here).
**Rules:** A negative-quantity line is rejected outright, with zero PO record created.

### GRNs (Goods Receipt Note)
**Purpose:** Records what actually physically arrived against a PO.
**Steps:** Open the PO, enter the quantity actually received per line (accepted and rejected
separately if there's a quality issue) and the warehouse it went into. You can record a partial
delivery and come back later for the rest — the system tracks cumulative received quantity against
the PO's own ordered quantity, so it never over-receives past what was ordered.
**Rules:** A negative-quantity GRN line is rejected, leaving the PO's received-quantity totals
completely unchanged.

### Payment Requests
**Purpose:** For a Supplier Payment that needs an extra layer of control beyond the everyday
Supplier Payment screen — a real, enforced three-person separation.
**Steps:**
1. **Maker** (typically Purchase) raises the request against a real, existing Supplier Bill.
2. **Checker** (typically Finance Manager) approves it. The maker cannot also be the checker.
3. **Executor** actually releases the payment. A non-CEO/Admin checker cannot also execute the SAME
   request they just approved — a genuinely different third person is required. CEO and Admin are the
   only roles exempted from needing a distinct third person, by explicit design.

### Site Material
See **PART 8 — SITE OPERATIONS** below (this screen is shared between the Procurement and Site
Operations menus because Purchase is the role that actually issues material from the warehouse).

### Procurement Intelligence, Replenishment Recommendation, Vendor Rating, Vendor-wise Purchase Report
**Purpose:** Read-only analytics — spend by vendor, suggested reorder points, a 0-100 vendor
performance score, and a filterable purchase-history report by vendor.
**How to use them:** Open, pick filters if offered, read the numbers. Nothing to submit.

---

## PART 8 — INVENTORY

### Stock
**Purpose:** Current on-hand quantity and Moving-Average cost, per warehouse. Read-only.

### Movement Ledger
**Purpose:** Every single stock movement (in or out) in chronological order — the audit trail for
"what happened to this material."

### Transfer
**Purpose:** Move stock between two of your own warehouses.
**Steps:** Pick source and destination warehouse, material, and quantity.

### Adjustment
**Purpose:** Correct a stock quantity that's simply wrong (e.g., a physical count found a
discrepancy).
**Steps:** Enter the material, warehouse, and the correction — a reason is required, this is not a
silent override.

### Material Issues
**Purpose:** Record material actually consumed on a project. **This is the one and only event that
turns purchased/held material into a real project cost** — buying material or receiving a GRN does
NOT cost the project anything by itself.
**Steps:** Pick project, material, warehouse, quantity — post it.

### Material Return (Site)
**Purpose:** Material coming back from a site to a warehouse — an internal custody transfer, NOT a
return to a vendor. A "Damaged"/"Lost" line writes off value instead of returning it to stock.
**When NOT to use:** For returning something to a supplier, use Purchase Returns instead.

### Purchase Returns
**Purpose:** A vendor-facing return against a specific GRN line — reduces what you owe that supplier.

### Damage Reports
**Purpose:** Record damaged material with a reason and the value being written off.

### Stock Report, Locations, Stock by Location, Material Analysis
**Purpose:** Read-only reports slicing stock quantity/value by different dimensions (location,
material, etc.).

### Stock Counts
**Purpose:** Record a physical count and let the system show you the variance against book quantity.
**Steps:** Enter what you physically counted; the variance shown can then be turned into an
Adjustment (above) to correct the books.

---

## PART 9 — SITE OPERATIONS

### Labour & Wages
**Purpose:** Record labour cost for a project — this posts a real accounting entry (Dr Labour Cost /
Cr Bank or Payable, account 5100), it's not just a log.
**Key fields:** Project, worker name, role, days, rate per day, date.

### Labour Cost Analysis
**Purpose:** Read-only summary report of labour cost.

### Project Expenses
**Purpose:** Record any other direct project cost that isn't labour or material.

### QC Dashboard
**Purpose:** A per-project count of how many Quality Checklists are Passed, Failed, or still
Pending/In-Progress — a fast health check across every project. Read-only.
**Note:** This screen previously had a real bug (it read a field that was never actually being
written, so it always showed every checklist as "Pending" regardless of its true result) — this was
found, fixed, and re-verified as **DEF-2026-001**, closed. It now correctly reads each checklist's
real status.

### Project Timesheet
**Purpose:** Log hours worked per worker per day — pure time-tracking, separate from Labour & Wages
and with no accounting effect of its own.

### Tasks
**Purpose:** A simple project to-do list. Create, assign, mark Done.

### Risk Register
**Purpose:** Log a project risk with likelihood and impact — severity is calculated automatically
(likelihood × impact), not typed in by hand. Close it once it's no longer a concern.

### Weekly Scorecard
**Purpose:** Capture a weekly snapshot of key project numbers for trend tracking.

### Site Material
**Purpose:** The full chain of getting material from a warehouse to a project site.
**Steps:**
1. **Create the Site** once (name, address, state).
2. **Raise an MRS** (Material Requisition — Site) — the site, project, material, and quantity needed.
3. **Submit** the MRS.
4. Purchase (or FinanceManager/CEO/Admin) **Approves** it — the server-side rejection message names
   exactly who's authorized, per Appletree's own SOP §8.
5. Purchase **Issues** it from a warehouse — this automatically creates a **Delivery Challan** (the
   transporter/vehicle document) and a real inventory movement.
6. When it physically arrives at site, **Record the Site Receipt** against that Delivery Challan.
7. When it's actually used on the job, **Record Site Consumption** — exactly like Material Issues
   above, this is the moment it becomes a real project cost.
**Rules:** An MRS references a specific site and project — you cannot confuse it with a Purchase
Requisition (a different, procurement-facing document) or with the calculated Material Requirement/
Request pair above.

---

## PART 10 — PRODUCTION & JOB WORK

### Production Orders
**Purpose:** Tracks actually manufacturing something against an Approved BOM.
**Steps:** Create it referencing the BOM and how many units you're making; it moves through its own
lifecycle (Draft → Released → In Progress → Partially Completed → Completed/Closed, or Hold/Cancel).

### Factory Dashboard
**Purpose:** Read-only overview of what's currently in production.

### Machines
**Purpose:** Register the machines you use; each shows Available or In Use, updated automatically
when a Job Card against it is started.

### Job Cards
**Purpose:** Tracks one production step (e.g., "Cutting") against a Production Order.
**Steps:** Create it — pick the Production Order, the operation, the machine, and the assigned
worker. **Start** it — this also marks the machine In Use.

### Production Schedule, Job Analysis, Job Cost Sheet, Product Costing, Labour Performance
**Purpose:** Read-only reports on scheduling, per-job cost (material + labour + total actual cost),
product-level costing, and labour performance.

### Job Work
**Purpose:** Sending material to an outside processor (a "Job Worker") for work you don't do
in-house, and getting it back.
**Steps:**
1. Add the processor as a **Job Worker** — mark whether they're GST-registered (this genuinely
   changes what's legally required next).
2. **Dispatch** material to them. You can add several different materials to one dispatch with
   "+ Add Material" — each line is then tracked and can be returned/scrapped independently of the
   other lines on the same dispatch.
3. When material comes back, record the **Return** — partial returns are fine, come back for the
   rest later; an over-return beyond what was actually dispatched is rejected.
4. If material became scrap at the job worker's site, record it separately with a reason — scrapped
   material never re-enters your warehouse stock (it's correctly excluded, not silently re-added).
5. If finished goods go straight to your customer from the job worker's premises (**Direct
   Dispatch**), and the job worker is **unregistered**, you must first have an active **APOB**
   declaration on file (see Finance below) — the system will refuse the dispatch otherwise.

---

## PART 11 — EXECUTION & DELIVERY

### Dispatch
**Purpose:** Marks a completed Production Order ready for release to the customer. Posts zero
inventory/GL value by itself — it's a tracking/readiness event, not a financial transaction.

### Delivery
**Purpose:** Records the customer actually receiving what was dispatched. Supports partial
deliveries against one Dispatch — the system tracks cumulative delivered quantity, so it correctly
blocks over-delivery and blocks marking something "fully delivered" twice.

### Installation
**Purpose:** Tracks on-site fit-out labour/installation execution. Posts labour cost to a dedicated
Cost Centre (CC-INSTALLATION).

### QC (Quality Control)
**Purpose:** The formal inspection record for a project.
**Steps:**
1. Create a checklist with at least one item — an empty checklist cannot be created (closes a real
   defect where a zero-item checklist could be waved through as "Passed" with nothing actually
   inspected).
2. Mark each item **Pass** or **Fail**; flag any item **Critical** if a failure there should fail the
   whole checklist regardless of the other items.
3. **Submit.** The checklist becomes: **Passed** (every item passed), **Failed** (any critical item
   failed), or stays **In Progress** (some items still unmarked). A checklist starts as **Pending**
   before its first submission.
**Rules:** QC status directly gates whether Handover can succeed (see below) — there is no way to
skip this step for a project that needs it.

### Snags
**Purpose:** Log a defect found during QC or installation.
**Steps:** Create it with a severity (Critical/Major/Minor), **Assign** it to someone, they
**Resolve** it, then a genuinely **different** person **Verifies** it before it can be **Closed** —
the person who fixed it cannot also sign off that it's fixed (except CEO/Admin, who are exempted from
this specific check).

### Handover
**Purpose:** The final customer sign-off event.
**Rules (all enforced server-side, not just suggested):**
- Installation must be marked **Completed**.
- At least one QC checklist must exist and be **Passed** (having zero QC records is NOT treated as
  "passed" — this exact fail-closed behavior was a real fix made during this engagement's own testing,
  after finding the original logic incorrectly treated "no QC yet" as equivalent to "QC passed").
- Zero **open Critical Snags** may remain.
If any condition isn't met, the screen states exactly which one is missing. A project can only be
successfully handed over **once** — a second attempt on an already-handed-over project is correctly
rejected, with no duplicate record and no duplicate audit entry created (live-proven in this
engagement's own testing, `erp_audit_p0_tests.js` ERP-034).

### Billing Milestones
**Purpose:** A manually-reviewed trigger point (Advance / Production / Dispatch / Delivery /
Installation / Handover / Final Billing) that unlocks the ABILITY to raise an invoice — it never
creates one automatically.
**Steps:** Mark the milestone **Ready** (requires finance-tier permission); Finance can then go raise
the actual Customer Invoice from the Finance module.

---

## PART 12 — FINANCE

### Document Workflow
**Purpose:** Your personal queue of draft accounting documents waiting for the next step (Submit,
Approve, or Post).

### New Journal Voucher
**Purpose:** A manual accounting entry for anything that doesn't fit one of the dedicated screens
below.
**Steps:** Enter your debit and credit lines — they must balance exactly (total debit = total
credit) or the system rejects it outright, with zero entries created. Submit → a different person
Approves → Post.

### Customer Invoice
**Purpose:** Bill a customer for real, posted revenue.
**Steps:** Pick project and customer, enter the amount and tax code, Submit → Approve → Post. This is
the step that actually moves the Trial Balance — nothing before it (Lead, Estimation, Quotation, even
a Won Project) touches the General Ledger at all.

### Customer Receipt
**Purpose:** Record a customer's payment against a posted Invoice — this "clears" it, fully or
partially, and creates a real Clearing record you can trace in the Document Viewer.

### Customer Credit/Debit Note
**Purpose:** Adjust a customer's balance without raising a full new invoice.

### Supplier Bill
**Purpose:** Enter what a vendor billed you. For material purchases, this is checked against the PO
and the GRN — a genuine 3-way match — before it's allowed to post.

### Supplier Payment
**Purpose:** Pay a vendor directly, clearing their bill fully or partially. For larger amounts, use
Payment Requests (Procurement) instead, for the extra 3-person control.

### Customer Advance
**Purpose:** Record money received from a customer before any invoice exists — sits as a liability
until applied against a real, later invoice.

### Journal Templates / Recurring Entries
**Purpose:** Save a Journal Voucher pattern you use often, or schedule one to post automatically on a
repeating basis.

### Import (CSV)
**Purpose:** Bulk-load Journal Vouchers from a spreadsheet.
**Rules:** The whole file is validated FIRST. If even one row is invalid, **nothing** in the file
gets posted — true all-or-nothing atomicity, not a partial commit. A "dry run" option lets you check
a file without posting anything at all.

### Journal Register
**Purpose:** The full, searchable list of every posted accounting entry.

### Document Viewer
**Purpose:** Type in any document ID (e.g., a Journal Voucher number) and see its complete detail —
every line, every amount, its project/cost-centre/tax tags, and — if it was cleared — the exact
Payment or Receipt entry that cleared it.

### Bank Reconciliation / ICICI Bank Import
**Purpose:** Bring in a bank statement, match each line against the books, mark it reconciled.
**Rules:** Re-importing the exact same statement is detected and flagged as duplicate, not silently
re-imported a second time. A statement account number that doesn't match the configured bank account
is flagged (not silently accepted or silently blocked).

### Reconciliation
**Purpose:** Checks that customer/vendor running subledger balances genuinely match the General
Ledger control accounts — open it and read the result.

### Financial Periods
**Purpose:** Open and close accounting periods. Once closed, new entries can't be dated into that
period.

### Fixed Assets
**Purpose:** Register a company asset, track its depreciation, and record its eventual disposal.
**Steps:** Capitalize the asset (its cost and date) — posts a real GL entry (Dr Fixed Asset / Cr Bank
or Payable). Run **Depreciate** periodically. When it's sold or scrapped, **Dispose** it — the
gain-or-loss vs. its Net Book Value is calculated for you automatically, not typed in by hand.
**Rules:** An already-Disposed asset cannot be disposed again; only Admin/CEO/FinanceManager-tier
roles can dispose an asset (Purchase, for example, is correctly blocked).

### Bank / Cash Transfer
**Purpose:** Move money between two of your own bank/cash accounts.

### Supplier Debit Note
**Purpose:** The vendor-facing equivalent of Customer Credit/Debit Note.

### Master Data Import
**Purpose:** Bulk-load master records (customers, vendors, materials, etc.) — same all-or-nothing
safety as the Journal Voucher import above.

### Opening Balances
**Purpose:** One-time entry of starting account balances when first moving onto this system.

### Compliance Dashboard
**Purpose:** A single, honest screen showing everything still outstanding for full SOP compliance —
configuration items still needed, decisions still pending. It never shows a false "100% done."

### SOP Configuration
**Purpose:** Where an Admin sets the actual numeric rules behind the system (cash limits, discount
approval tiers, etc.).

### Payment Requests
See **PART 7 — PROCUREMENT** above (shared screen).

### Petty Cash
**Purpose:** Manage a small cash float per site.
**Rules:** Every expense from the float requires an original bill attached — no exceptions. Can be
reconciled any time (checks cash-on-hand matches what the books say should be left) and replenished
once vouchers accumulate.

### APOB & E-way Bill
**Purpose:** **APOB (Additional Place of Business)** — the GST declaration required before an
unregistered Job Worker can dispatch material straight to your customer from their own premises.
**E-way Bill Tracking** is manual entry only — there is no live connection to the government e-way
bill portal.

### ITC / BOQ Reports
**Purpose:** Tax-credit adjustment tracking, estimated-vs-actual BOQ material use per project, which
suppliers are approaching the annual statutory reporting threshold, and any cash payments that
required a manager's override.

### TDS Reporting
**Purpose:** Every TDS deduction that's happened automatically at Supplier Payment time (when a
category is active and its threshold crossed), plus the running TDS-payable GL balance.
**Rules:** the rates/thresholds shown are Appletree's own SOP configuration — always independently
verify against current tax law before relying on this for actual filing; this is stated on-screen,
not hidden.

---

## PART 13 — FINANCIAL STATEMENTS

**Balance Sheet, Company Profit & Loss, General Ledger, Customer Ledger, Supplier Ledger, Trial
Balance, AR Ageing, AP Ageing.** All read-only. **Trial Balance is the one to check first** whenever
you want a sanity check that the books are in order — it confirms every debit has a matching credit,
company-wide, at any point in time.

---

## PART 14 — SERVICE & AFTER-SALES

### Customer 360 / Customer Profitability
**Purpose:** Everything about one customer, and how profitable they've been across every project,
in one place.

### Warranty
**Purpose:** Record a warranty claim against a handed-over project — the system knows whether the
claim falls inside the warranty period.

### Complaints → Service Tickets → Service Visits
**Purpose:** A customer complaint becomes a Ticket, which gets one or more Visits logged against it
until resolved.

### AMC (Annual Maintenance Contract) → AMC Schedule → Service Billing
**Purpose:** Set up a maintenance contract, schedule the visits it covers, and bill it — billing goes
through the exact same Customer Invoice mechanism as everything else, simply tagged with the AMC
contract's ID for traceability. No separate/second billing engine exists.

### CAPA
**Purpose:** A formal root-cause investigation for a repeat problem — what happened, why, the
corrective action taken, and a required follow-up check confirming the fix actually worked (a
genuine effectiveness-check gate, not just a closed checkbox).

---

## PART 15 — REPORTS & ANALYTICS

**Accounting & MIS Quick Reports, Accountant MIS, Management MIS, Cross-Dimensional Reports, Company
Profitability, HSN Data Quality.** All read-only reports — open, filter if offered, read.

**Exports.** Download data out of the system.

**Audit Log.** A record of every significant action, who did it, and when. Never shows a password,
password hash, session token, or other secret — confirmed by direct testing.

**Backup / Restore — no screen, API only.** A real, fully working, SHA-256-checksummed, Admin/CEO-
only backup and restore mechanism exists and has been live-proven (create → alter data → restore →
exact original state returned). It deliberately has **no dedicated screen** — this mirrors how most
real ERP systems treat backup/restore as an administrative/Basis-layer function, not a regular
end-user screen, and is not considered a gap.

---

## PART 16 — MASTER DATA

**Branches, Profit Centres, Cost Centres, Bank Accounts, Chart of Accounts.** The underlying setup
data everything else references.
**Rule worth knowing:** every bank/cash account needs its OWN distinct GL account code — this is how
one account's balance is kept genuinely separate from every other account's, rather than everything
blending into one number.

---

## PART 17 — ADMINISTRATION

### Policy Configuration
**Purpose:** Where approval thresholds and similar system-wide rules are actually set.

### Users & Roles
**Purpose:** Create staff accounts, assign roles. Also hosts two special actions:
- **Create Demo Scenario** — builds one complete, real, connected 15-step example chain (Project →
  Purchase Requisition → PO → GRN → Bill → Payment Request → Approval → Payment → Clearing → Site
  Material → Consumption → Project Cost) so there's something real to look at before you build your
  own test data.
- **Reset UAT Data** — wipes everything back to a clean starting state.

### Try Unauthorized Action
**Purpose:** A deliberate, safe testing screen — shows you exactly what an "access denied" message
looks like, without anything actually going wrong.

---

## PART 18 — THE RULES THAT APPLY EVERYWHERE

1. **You can never approve your own work.** Whoever created or raised something is never the one who
   approves it — enforced by the server, not just the UI, and verified by direct attempts to bypass it
   throughout this engagement's testing (e.g., a real click on a supposedly-hidden button, blocked
   anyway).
2. **Nothing posts to the accounts automatically.** Every real accounting entry needs an explicit
   Submit → Approve → Post by real, distinct people. Work happening (a dispatch, an installation, a
   handover) never silently creates an invoice or a journal entry by itself.
3. **Material only becomes a project cost when it's actually used**, not when it's bought. Buying,
   receiving (GRN), and even holding material in a warehouse cost the PROJECT nothing — only Material
   Issue / Site Consumption does.
4. **A "no" from the system is not a malfunction.** Every rejection message explains exactly why
   (e.g., "you can't approve your own request," "this checklist isn't Passed yet," "a BOM must be
   Submitted before it can be Approved") — and nothing is ever left half-done by a rejected action; a
   failed attempt always leaves zero partial records behind.
5. **Numbering never collides**, even under heavy simultaneous use — every document gets a genuinely
   unique number, proven under a 525-document same-session stress test with zero duplicates.

## PART 19 — IF SOMETHING GOES WRONG

Read the on-screen message first — it almost always tells you exactly what's wrong and why. If it
still seems incorrect, write down precisely what you did (which screen, which values, what happened)
and report it to whoever manages the system, rather than repeating the attempt with different numbers
hoping it works differently.
