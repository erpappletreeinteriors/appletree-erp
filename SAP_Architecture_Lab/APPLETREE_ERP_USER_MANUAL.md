# APPLETREE ERP — USER MANUAL (Everything, Step by Step, Plain English)

**Updated 2026-09-19.** Covers every screen in the system as it actually exists today, organized in
the same order as the menu on the left of your screen. This is a test/demo system — nothing you do
here touches real company data or money. Written for someone who has never used an ERP before — no
technical words, no jargon.

---

## Getting started

**Log in.** Open the app in your browser. You'll see a red "UAT / DEMO ENVIRONMENT" banner at the
top — that's a reminder that nothing here is real. Type your username and password, click **Log In**.
Click **Log Out** (top-right) when you're done. Your menu on the left only shows the sections your
role is allowed to use — that's normal, not a mistake.

**First time? See a working example.** An Admin user can go to **Administration → Users & Roles** and
click **Create Demo Scenario** — this builds one complete, real, connected example (a project, all
the way through a purchase, a payment, and site material use) so there's something real to open
before you start creating your own. **Reset UAT Data** on the same screen wipes everything back to a
clean start whenever you want.

**Who can do what.** Every action is tied to your role (Admin, CEO, Accountant, Finance Manager,
Project Manager, Purchase, Sales, Estimator, Site In-charge, or Viewer). If a button doesn't appear,
or an action is refused, it's because your role isn't allowed to do that specific thing — the message
on screen will say exactly why.

---

## HOME

**Dashboard** — your starting page after login. Shows a quick summary relevant to your role. Nothing
to configure here; just look.

---

## SALES & CRM — turning an enquiry into a customer

**Leads.** When someone enquires about a job, open **Leads** and click to add a new one — name,
contact details, what they want, and roughly how much it might be worth. This is Step 1 of every
sale.

**Turn a Lead into a costed offer.** From the Lead, create an **Estimation Request** (one click) —
this sends the job to an Estimator to work out the real cost (see **Estimation & Costing** below).
Once a cost exists, come back here and go to **Quotations** to build the actual price you'll show the
customer:
1. Pick the Costing Version the Estimator prepared.
2. Set a discount if you're giving one. Discounts up to 5% go through automatically. Above that, a
   Finance Manager (or the CEO for very large discounts) has to approve it before it can be sent —
   you cannot approve your own discount.
3. Click **Submit**. If approval is needed, wait for it; you'll see the status change.
4. Once approved, record the customer's acceptance when they say yes.
5. Click **Mark Won** — this is the moment a real Project and a real Customer record are created, and
   a Project Manager gets assigned.

---

## ESTIMATION & COSTING — working out what a job will actually cost

**Estimation & Costing.** An Estimator opens this screen, picks the Estimation Request Sales sent
over, and builds a Costing Version: list out material lines (quantity × rate), labour, and any
transport/installation cost, add an overhead percentage and a profit percentage. The screen works out
the final selling price for you. You can create more than one version if you want to try different
numbers — each is saved separately.

**BOM (Bill of Materials).** For anything that gets manufactured, define what materials and
quantities go into making it here. Start as Draft, then Submit it, then someone else Approves it
before it can be used on a real Production Order.

**BOM Consumption Report.** A read-only report comparing what a BOM said should be used against what
was actually consumed — open it, pick a project, and read the numbers. Nothing to fill in.

---

## PROJECTS

**Projects.** The list of every real, Won project. Click one to see its basic details.

**Project 360.** The single most useful screen for anyone managing a job — pick a project and see
everything about it in one place: budget, what's been committed, what's actually been spent, QC
status, and a **Document Flow** section that shows every connected paper trail (Purchase Order → GRN
→ Bill → Payment, or Material Requisition → Delivery Challan → Site Receipt → Consumption, and now
also the sales side — Lead → Estimation → Costing → Quotation) as one chain, without you needing to
remember any document numbers.

**Budget vs Commitment vs Actual.** A report — pick a project and see budget, what's been ordered/
committed, and what's actually been spent, side by side.

**Change Requests (Variations).** When a customer asks for something extra or different mid-project,
raise a Change Request here describing what changed and its cost impact, so it's tracked separately
from the original scope.

---

## PROCUREMENT — buying material and services

**Purchase Requisitions.** Before ordering anything, raise a requisition here describing what's
needed. Someone else (not you) approves it. This is optional groundwork — it isn't required before
every purchase, but it's good practice for larger or planned needs.

**Material Requirements.** For material a BOM says a job needs, this screen shows the calculated
demand — how much of what material, for which project.

**Material Requests.** Once you know what to actually buy, bundle the approved material needs into a
request here — this is the document an RFQ/Purchase Order gets raised against.

**RFQs → Supplier Quotations → Comparisons.** Send a Request for Quotation to one or more suppliers,
record what each one quotes back under **Supplier Quotations**, then use **Comparisons** to see them
side by side before deciding who to buy from.

**Purchase Orders.**
1. Create the PO — pick the supplier, project, and material lines with quantity and rate.
2. Submit it.
3. Depending on the value, it either approves itself (small amounts) or needs a Finance Manager or
   the CEO to approve it (larger amounts) before it can be sent.

**GRNs (Goods Receipt Note).** When material physically arrives, record what actually came in here —
you can record less than what was ordered (a partial delivery) and come back to record the rest
later when it arrives.

**Payment Requests.** For a Supplier Payment above the everyday amount, raise a Payment Request here
instead of paying directly — one person raises it, a different person approves it, and (for larger
ones) a third person actually executes the payment. This is a deliberate three-person check, not a
bug — you genuinely cannot do all three steps yourself.

**Site Material.** See the "Getting Material to Site" section below — this screen lives in both
Procurement and Site Operations because Purchase is the one who issues material from the warehouse.

**Procurement Intelligence, Replenishment Recommendation, Vendor Rating, Vendor-wise Purchase
Report.** All read-only reports — open, pick your filters, and read. Vendor Rating shows each
supplier scored out of 100 based on real order history.

---

## INVENTORY — what's on hand and where

**Stock.** Shows what's on hand, warehouse by warehouse, and its current average cost. Read-only.

**Movement Ledger.** Every single stock movement (in or out), in order — useful for tracing exactly
what happened to a material.

**Transfer.** Move stock from one warehouse to another.

**Adjustment.** Correct a stock quantity that's wrong (e.g., after a physical count finds a
discrepancy) — always requires a reason.

**Material Issues.** Record material actually being used on a project. This is the one and only event
that turns purchased material into a real project cost — buying it doesn't cost the project anything
until it's actually issued/consumed.

**Material Return (Site).** Material coming back from a site to a warehouse (not to a supplier) — use
this for leftover or unused site material, not for returning something to a vendor.

**Purchase Returns.** Returning material TO a supplier against a specific GRN — reduces what you owe
them.

**Damage Reports.** Record material that's been damaged, with the reason and value written off.

**Stock Report, Locations, Stock by Location, Material Analysis.** Read-only reports on quantities
and value, sliced different ways.

**Stock Counts.** Record a physical count of what's actually on the shelf; the system compares it to
what the books say and lets you create an Adjustment for any difference.

---

## SITE OPERATIONS

**Labour & Wages.** Record labour cost for a project — worker, role, days worked, rate per day. This
posts a real cost against the project.

**Labour Cost Analysis.** A read-only report summarizing labour cost.

**Project Expenses.** Record any other direct project expense (not labour, not material).

**QC Dashboard.** Shows, per project, how many Quality Checklists are Passed, Failed, or still
Pending — a quick health check across every project's quality status. Read-only; the actual checking
happens on the QC screen (see Execution & Delivery below).

**Project Timesheet.** Log hours worked per worker per day — separate from Labour & Wages, this is
pure time-tracking with no cost impact of its own.

**Tasks.** A simple to-do list per project — create a task, assign it, mark it Done when finished.

**Risk Register.** Log a project risk with how likely it is and how bad it would be — the system
works out its severity automatically. Close it once it's no longer a concern.

**Weekly Scorecard.** Capture a weekly snapshot of key project numbers.

**Site Material.** Getting material from a warehouse to a project site:
1. Create the Site once (name, address).
2. Raise an MRS (Material Requisition — Site) — what's needed, for which project.
3. Get it approved.
4. Purchase issues it from a warehouse — this creates a Delivery Challan (the transport document).
5. When it arrives, record the **Site Receipt**.
6. When it's actually used, record **Site Consumption** — that's the moment it becomes a real project
   cost, same principle as Material Issues above.

---

## PRODUCTION & JOB WORK

**Production Orders.** Once a BOM is approved, create a Production Order to track actually making
something — link it to the BOM and set how many units you're making.

**Factory Dashboard.** A read-only overview of what's currently in production.

**Machines.** Add the machines you use; each shows whether it's Available or In Use.

**Job Cards.** For a step of production (e.g., "Cutting"), create a Job Card against a Production
Order, assign a machine and a worker, and Start it — this is how labour and machine time get tracked
per production step.

**Production Schedule, Job Analysis, Job Cost Sheet, Product Costing, Labour Performance.** Read-only
reports on scheduling, cost, and performance.

**Job Work.** Sending material to an outside processor and getting it back:
1. Add the outside processor as a **Job Worker** — say whether they're GST-registered, this matters.
2. **Dispatch** material to them — you can add several different materials to one dispatch with
   "+ Add Material," and each material line can later be returned or scrapped independently of the
   others on the same dispatch.
3. When it comes back, record the **Return** (can be partial — return some now, the rest later).
4. If some material became scrap at the job worker's site, record that separately with a reason.
5. If the finished goods go straight to a customer from the job worker's premises, use **Direct
   Dispatch** — but if the job worker is unregistered, you need an APOB declaration first (see
   **APOB & E-way Bill** under Finance below).

---

## EXECUTION & DELIVERY

**Dispatch.** Once a Production Order is complete, mark it ready for dispatch and release it.

**Delivery.** Record the customer actually receiving what was dispatched — partial deliveries against
one dispatch are tracked cumulatively (deliver some now, the rest later, the system remembers how
much is still outstanding).

**Installation.** Track on-site fit-out labour/installation work for a project.

**QC (Quality Control).**
1. Create a checklist — list out what's being inspected, mark any item Critical if a failure there
   should block the whole job.
2. Go through each item and mark it Pass or Fail.
3. Submit — the checklist becomes Passed (if everything passed), Failed (if anything critical
   failed), or stays In Progress if some items are still unmarked.
QC status directly controls whether a project can move to Installation-complete or Handover — you
cannot skip this step.

**Snags.** Log a defect found during QC or installation — assign it to someone, they resolve it, then
a DIFFERENT person verifies it's actually fixed before it can be closed (the person who fixed it
cannot also be the one who signs off that it's fixed).

**Handover.** The final customer sign-off. The system will only let this succeed once: Installation
is marked Completed, QC is Passed, and there are zero open Critical Snags. If any of those isn't true
yet, the screen tells you exactly which one is missing. A project can only be handed over once — a
second attempt is correctly refused.

**Billing Milestones.** Mark a milestone (e.g., "Installation Complete") as Ready to invoice — this
does NOT automatically create an invoice, it just unlocks the ability for Finance to raise one (see
Customer Invoice below). Nothing gets billed automatically just because work happened.

---

## FINANCE

**Document Workflow.** Shows every draft accounting document waiting for the next step (Submit,
Approve, or Post) — your personal to-do list for anything you've created or need to action.

**New Journal Voucher.** For a manual accounting entry that doesn't fit any of the specific screens
below — enter your debit and credit lines (they must balance), submit, then someone else approves and
posts it.

**Customer Invoice.** Bill a customer. Pick the project and customer, enter the amount, submit,
approve, and post — this is what actually moves the books.

**Customer Receipt.** Record a customer's payment against an invoice — this "clears" the invoice as
paid, fully or partially.

**Customer Credit/Debit Note.** Adjust a customer's balance up or down without a full new invoice.

**Supplier Bill.** Enter what a vendor has billed you — for material, this checks against the PO and
GRN (a 3-way match) before it can be posted.

**Supplier Payment.** Pay a vendor — clears their bill, fully or partially. For larger amounts, use
Payment Requests (under Procurement) instead, which adds the three-person check.

**Customer Advance.** Record money received from a customer before an invoice exists — it sits as a
liability until you later apply it against a real invoice.

**Journal Templates, Recurring Entries.** Save a Journal Voucher pattern you use often, or set one up
to repeat automatically on a schedule.

**Import (CSV).** Bring in Journal Vouchers from a spreadsheet — the whole file is checked first; if
even one row is wrong, NOTHING in the file gets posted (no half-imported batches).

**Journal Register.** The full list of every posted accounting entry, searchable.

**Document Viewer.** Type in any document number (e.g., a Journal Voucher ID) and see its full detail
— every line, every amount, and (if it was cleared by a payment or receipt) which document cleared it.

**Bank Reconciliation, ICICI Bank Import.** Bring in a bank statement, match it line-by-line against
what's in the books, and mark each line as reconciled once it matches. Re-importing the same
statement twice is caught automatically, not silently duplicated.

**Reconciliation.** Checks that customer/vendor running balances match what the general ledger says —
open it and read the result, it tells you if anything's out of balance.

**Financial Periods.** Open and close accounting periods — once a period is closed, new entries can't
be back-dated into it.

**Fixed Assets.** Register a company asset (its cost, date), record depreciation over time, and when
it's eventually disposed of, record the sale/write-off — the gain or loss is worked out for you.

**Bank / Cash Transfer.** Move money between two of your own bank/cash accounts.

**Supplier Debit Note.** The vendor-facing equivalent of a Credit/Debit Note.

**Master Data Import.** Bulk-load master records (customers, vendors, materials, etc.) from a
spreadsheet, with the same all-or-nothing safety as the Journal Voucher import above.

**Opening Balances.** One-time setup: enter your starting account balances when first moving onto
this system.

**Compliance Dashboard.** One screen showing everything still outstanding for SOP compliance —
configuration needed, decisions needed, and so on. It's deliberately honest: it never shows a plain
"100% done," it always shows exactly what's left.

**SOP Configuration.** Where an Admin sets the actual numbers behind the rules (cash limits, discount
tiers, etc.) — most staff won't need this screen.

**Petty Cash.** Each site can have a small cash float. Every expense from it needs an original bill
attached — no exceptions. Reconcile it any time to check the cash on hand matches what should be
left; replenish it once vouchers pile up.

**APOB & E-way Bill.** APOB (Additional Place of Business) — a GST declaration needed before an
unregistered Job Worker can dispatch straight to your customer from their own premises. E-way Bill
Tracking is manual entry only (there's no live government-portal connection).

**ITC / BOQ Reports.** Tax-credit adjustments, estimated-vs-actual material use on a project, which
suppliers are approaching the annual reporting threshold, and any cash payments that needed a
manager's override.

**TDS Reporting.** Shows every TDS deduction that's happened automatically on Supplier Payments, plus
the running TDS-payable balance. The rates/thresholds shown come from Appletree's own SOP — always
double-check current tax law separately before relying on this for actual filing.

---

## FINANCIAL STATEMENTS

**Balance Sheet, Company Profit & Loss, General Ledger, Customer Ledger, Supplier Ledger, Trial
Balance, AR Ageing, AP Ageing.** All read-only. **Trial Balance** is the one to trust most as a
sanity check — it confirms every debit has a matching credit, company-wide.

---

## SERVICE & AFTER-SALES

**Customer 360, Customer Profitability.** Everything about one customer, and how profitable they've
been, in one place.

**Warranty.** Record a warranty claim against a handed-over project — the system knows whether the
work is still under warranty.

**Complaints → Service Tickets → Service Visits.** A customer complaint becomes a Ticket, which gets
one or more Visits recorded against it until it's resolved.

**AMC (Annual Maintenance Contract) → AMC Schedule → Service Billing.** Set up a maintenance
contract, schedule the visits it covers, and bill for it — billing goes through the exact same
invoice screen as everything else, just tagged to the AMC.

**CAPA.** A formal root-cause investigation for a repeat problem — what happened, why, what's being
done about it, and a required follow-up check that it actually worked.

---

## REPORTS & ANALYTICS

**Accounting & MIS Quick Reports, Accountant MIS, Management MIS, Cross-Dimensional Reports, Company
Profitability, HSN Data Quality.** All read-only reports — open, filter, read.

**Exports.** Download data out of the system.

**Audit Log.** A record of every significant action taken in the system, who did it, and when — never
shows a password.

---

## MASTER DATA

**Branches, Profit Centres, Cost Centres, Bank Accounts, Chart of Accounts.** The underlying setup
data everything else references. Each bank account needs its own separate GL account code so its
balance is tracked distinctly from every other account.

---

## ADMINISTRATION

**Policy Configuration.** Where approval thresholds and similar rules are set.

**Users & Roles.** Create staff accounts and assign each one a role. Also where **Create Demo
Scenario** and **Reset UAT Data** live (see "Getting started" above).

**Try Unauthorized Action.** A deliberate testing screen — lets you see exactly what a "you're not
allowed to do that" message looks like, safely, without it meaning anything went wrong.

---

## The golden rules, wherever you are

- **You can't approve your own work.** If you created or raised something, someone else has to
  approve it — the system enforces this, it's not optional.
- **Nothing bills or posts automatically just because work happened.** Every accounting entry needs
  an explicit Submit → Approve → Post by real people.
- **Material only becomes a real project cost when it's actually used**, not when it's bought — that
  happens at Material Issue / Site Consumption, not at GRN.
- **A rejected action is not a bug.** If a screen refuses something, read the message — it explains
  exactly why (e.g., "you can't approve your own request," or "this checklist isn't Passed yet"), and
  nothing gets left half-done when a rejection happens.

## If something goes wrong

If a screen shows an error, read the message — it usually explains exactly why. If it still seems
wrong, note down exactly what you did (which screen, what you typed, what happened) and tell whoever
manages this system — don't just try again with different numbers hoping it works.
