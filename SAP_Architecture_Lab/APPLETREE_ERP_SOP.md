```
APPLE TREE ERP
STANDARD OPERATING PROCEDURE
Simple User Guide for All Departments

Version:        1.0
Date:           28 August 2026
Prepared For:   Apple Tree Pvt Ltd — all departments
Prepared By:    SAP Architecture Lab engineering pass
Approved By:    NOT YET APPROVED — pending Management review
Status:         UAT / DEMO VERSION — NOT a final production SOP
```

> **This is a UAT/Demo version.** It describes the ERP exactly as it exists today in the `SAP_Architecture_Lab` test environment. It has **not** been approved by Apple Tree Management as a final company procedure. Wherever this document says a rule or number is "Management decision required," "Configuration required," or "Tax/Legal review required," that means it is not yet final — do not treat it as approved company policy.

Every screen name, menu name, button, role, and rule in this document was checked against the actual running ERP before being written down — nothing here is guessed or copied from an old plan that the software doesn't actually do.

---

# PART 1 — WHAT IS APPLETREE ERP?

Appletree ERP is the one place where every department enters information about the work Apple Tree does — from a customer's first enquiry, all the way to getting paid, delivering the job, and handling any after-sales issue.

**Why do we use it?**
Because one customer order touches many departments — Sales, Estimation, Purchase, Store, Site, Accounts — and if each department kept its own notes, nobody would know the true picture. The ERP keeps ONE shared record that every department reads from and writes to, so numbers never disagree between departments.

**What work should be done in the ERP?**
Anything that affects money, stock, or a project's progress should be entered in the ERP, not just discussed on WhatsApp or written on paper. If it isn't in the ERP, officially it didn't happen.

**Why does entering information correctly matter?**
A wrong quantity, wrong project, or wrong supplier doesn't just look bad on one screen — it can throw off the project's cost, the company's accounts, and the stock count, because the same number feeds all three.

**How everything connects:**

```
Sales → Estimation → Quotation → Project → Procurement → Inventory
→ Site → Manufacturing → Billing → Collection → Finance → After-Sales
```

**One transaction can affect several areas at once.** Example: buying plywood is not just a "Purchase" event. The same one purchase can affect:

- Purchase (the Purchase Order itself)
- Inventory (stock goes up when it arrives)
- the Supplier's account (we now owe them money)
- Accounts Payable / AP (money we owe)
- Payment (money we eventually send out)
- Project Cost (once the plywood is actually used on a project)

Keep this in mind throughout this document: **one entry, many effects.**

---

# PART 2 — THE 10 GOLDEN RULES

1. **Enter correct information.** A wrong quantity or wrong project is not a small mistake — it moves into accounting and stock records.
2. **Never use another person's login.** The ERP records exactly who did what, when. Logging in as someone else destroys that record.
3. **Never approve your own transaction.** The system itself blocks this in many places (see Part 43 — Segregation of Duties) — don't try to work around it.
4. **Don't create duplicate documents.** Check whether a Purchase Order, bill, or payment already exists before creating a new one.
5. **Check the project before submitting anything.** Material, cost, and revenue all get tied to whichever project you pick — picking the wrong one moves real numbers to the wrong place.
6. **Check the supplier/customer before posting.** The ERP will let you pick an inactive supplier/customer only if it's still technically allowed — check you have the right one anyway.
7. **Don't try to bypass approval controls.** If a screen says approval is required, that's a real, server-enforced rule, not a suggestion.
8. **Never enter real Apple Tree data into the UAT/Demo environment**, and never treat UAT/Demo data as if it were real (see Part 57).
9. **Don't change accounting entries without authorization.** A wrong posted entry has a proper correction process (Part 44) — never try to "fix" it by entering an opposite manual entry on your own initiative.
10. **If something looks wrong, stop and report it** — to your supervisor or whoever manages the ERP. Don't guess and carry on.

---

# PART 3 — WHO DOES WHAT

The ERP currently has these roles. (There is no separate "Store" or "Factory" login role today — those functions are covered by the Purchase and Project Manager roles; if Apple Tree wants dedicated Store/Factory logins later, that is a Management decision, not yet built.)

| Role | What they normally do | What they can approve | What they cannot approve | What they should always check |
|---|---|---|---|---|
| **Admin** | System administration, user setup, master data, resets in UAT | Everything | — | Who has which role; that no one has more access than their job needs |
| **CEO** | Final-tier approvals, large payments, Board-level policy | Highest-value POs, unlimited discounts, Payment Approval Matrix sign-off | — | Big-ticket approvals aren't rubber-stamped |
| **Finance Manager** | Approves PRs/POs/MRS/payment requests, configures SOP settings | Mid-tier POs (up to ₹20,00,000), 6–10% discounts, PRs, MRS, payment requests | Company-wide GST/masterData changes (Admin/CEO only), the Payment Approval Matrix's final sign-off | Whether a request is genuinely within their approval tier |
| **Accountant** | Enters bills, receipts, journal vouchers, day-to-day bookkeeping | Nothing requiring "approve" — Accountant can create/submit/clear but not approve | Their own submitted journal vouchers, supplier payments, posting | Every entry balances (Debit = Credit) before submitting |
| **Purchase** | Raises PRs/POs, records GRNs, manages vendors, dispatches Job Work | Nothing (no approval-tier action) | Their own PRs/POs | Quantities received match what actually arrived, not what was ordered |
| **Sales** | Leads, quotations, customer records | Nothing (no approval-tier action) | Their own quotation discounts above the no-approval tier | They're only viewing/working with their own assigned customers |
| **Estimator** | Builds costing for a lead/project | Nothing | — | Costing lines are complete before handing to Sales for the quotation |
| **Project Manager** | Runs their own assigned projects — cost, material, labour, QC, handover | Material Requirements | Documents outside their assigned projects | Actual cost vs budget, regularly |
| **Site In-charge** | Raises site MRS, records site receipts and consumption, small site-petty purchases | MRS and petty purchases *within the configured site-petty daily limit only* | Anything above that limit (escalates to Purchase/Finance) | Discrepancies between what was sent and what was received at site |
| **Viewer** | Read-only access | Nothing | Everything | — |

---

# PART 4 — LOGIN AND BASIC USE

**Login:** open the ERP in your browser, type your username and password, click **Log In**.
**Logout:** click **Log Out**, top-right, whenever you're done — especially on a shared computer.

**Navigating:** the top bar has main groups (CRM, PROJECTS, PROCUREMENT, INVENTORY, MANUFACTURING, OPERATIONS, FACTORY/MES, EXECUTION, AFTER-SALES, FINANCE, FINANCIAL STATEMENTS, FINANCE SOP, REPORTS, ADMIN). Click a group, then click the specific screen underneath it.

**Searching/filtering:** most lists (Purchase Orders, GRNs, etc.) have a small search box above the table — type to filter the list instantly.

**Opening a document:** click its ID or number in any list to see full detail; many documents have clickable links (shown underlined) that jump straight to the related document (e.g. a GRN's PO number links to that PO).

**Understanding an error message:** the ERP tries to tell you exactly why something was refused (e.g. *"Segregation of duties: PR creator cannot also be PR approver"*) rather than a generic "Error." Read the message — it usually already tells you what to do.

**Document statuses you'll see, and what they mean:**

| Status | Plain meaning |
|---|---|
| **Draft** | Being prepared. Not yet sent anywhere. Can usually still be edited or cancelled. |
| **Submitted** | Sent for someone else to approve. |
| **Approved** | Approved and ready for the next step. |
| **Rejected** | Sent back — read the rejection reason. |
| **Posted** | For accounting entries: now permanently part of the company's books. |
| **Cancelled** | Stopped before it had any real effect. |
| **Reversed** | A posted entry has been formally undone by a NEW opposite entry — the original is never deleted or edited, both stay visible for audit. |
| **Cleared** | A payment/receipt has been matched against its invoice/bill — that amount is no longer "outstanding." |

(Different document types add a few of their own extra statuses — e.g. a Purchase Order also has *PartiallyReceived*/*FullyReceived*, a Job Work Order has *Dispatched*/*PartiallyReturned*/*Returned*/*DirectDispatched*. Each section below names the exact statuses for that document.)

---

# PART 5 — THE DASHBOARD

After login you land on **HOME → Dashboard**. What you see depends on your role — a Finance Manager sees financial widgets, a Project Manager sees their own projects, and so on.

**Important:** a dashboard that shows "no pending approvals" or "no alerts" does **not** mean all business work is finished — it only means nothing is *stuck waiting on you specifically*. Always check the actual module (Purchase Orders, Projects, etc.) for the full picture, not just the dashboard summary.

The **FINANCE SOP → Compliance Dashboard** is a special case worth knowing about: it is deliberately designed to **never show a single "100% compliant" number** while any Configuration/Management-Decision/Tax-Legal item is still open — see Part 32.

---

# PART 6 — THE CUSTOMER PROCESS (OVERVIEW)

```
Customer created → Lead → Estimation → Quotation → (Approval if discount is large)
→ Project → Billing → Customer Invoice → AR → Receipt → Clearing → After-Sales
```

Each step is explained in its own Part below (7, 8, 9, 23, 24, 40). This overview just shows how they connect.

---

# PART 7 — ESTIMATION

**Screen:** CRM → Estimation & Costing

**Purpose:** work out what a job will cost before quoting the customer a price.

**Who:** Estimator (and Admin/CEO).

**Steps:**
1. Open the estimation request linked to a Lead (a lead must exist first — CRM → Leads).
2. Add costing lines: Material, Labour, Transport, Installation, Other — each with a quantity and rate.
3. Set an Overhead % and a Profit % — the ERP calculates the Base Cost and a recommended Selling Price automatically from your lines.
4. Save the costing version.

**Important:** every time you save a new costing, it becomes a NEW version — the ERP never overwrites an old costing, so you (and anyone reviewing later) can always see how the numbers changed and why.

**What's the difference between Estimate, Quotation, and Project?**

- **Estimate/Costing** = your own internal working-out of cost and price. The customer never sees this directly.
- **Quotation** = the customer-facing document built FROM an approved costing, with your chosen discount applied.
- **Project** = created only once the customer has actually accepted (Won) a quotation — this is the real, tracked piece of work.

---

# PART 8 — QUOTATION

**Screen:** CRM → Quotations

-----------------------------------------
**PROCESS: Create and Send a Quotation**
-----------------------------------------

**Purpose:** turn an approved costing into a formal price for the customer.

**Who:** Sales (their own assigned customers only), CEO, Admin.

**When:** once a Costing Version exists for the Lead.

**Step 1:** Select the Lead, the Estimation Request, and the Costing Version to quote from.
**Step 2:** Enter Customer (or Prospect Name if not yet a customer), Validity Days, Discount %, Terms, Payment Terms.
**Step 3:** Submit.

**Check before submitting:**

- The discount % — a discount above the no-approval tier (currently >5%) will require Finance Manager or CEO sign-off before it can go out. Above 10% needs CEO specifically.
- The customer is the right one, especially if the Sales user has more than one assigned customer.

**Approval:** required only if the discount exceeds 5% (Finance Manager up to 10%, CEO above that). Under 5%, no approval step is needed.

**After submission:** once Approved, the quotation can be marked Sent, then Accepted by the customer.

**Accounting/Inventory effect:** none yet — a quotation is a commercial document, not an accounting one. Nothing posts to the books until a real Project and real billing exist.

**Common mistakes:** quoting the wrong costing version; forgetting that a revised quotation should be a proper **Revision** (the ERP keeps the old one as history, doesn't overwrite it).

**If something goes wrong:** a rejected discount request needs a Sales/CEO decision on whether to lower the discount or seek the higher-tier approval — it isn't a system error.

---

# PART 9 — PROJECT

**Screen:** PROJECTS → Projects, and PROJECTS → Project 360 (the detailed view)

A Project is created automatically once a Quotation is marked **Won** — this also creates the Customer record if one doesn't already exist. A Project Manager is assigned at this point.

**On Project 360 you can see, all on one screen:**

- Project Financial Summary — Committed (open POs), Received (GRN), Invoiced (AP), Paid, Consumed (actual material cost)
- Project Financial 360 — Contract value, Cost, Procurement, Inventory, Manufacturing, Revenue, After-Sales, Profitability, Commitments, all kept as **separate figures, never blended into one guess**
- Every linked document: Material Requirements, Purchase Orders, GRNs, Production Orders, Dispatches, Deliveries, Installations, QC, Snags, Handovers, Billing Milestones
- **Document Flow** — a visual chain of every connected document for this project (PR→PO→GRN→Bill→Payment, or MRS→Delivery Challan→Site Receipt→Consumption), so you never have to remember a document number to trace what happened.

**In simple language:**
> **Project Actual Cost = what the project has actually consumed / actually spent** — not what was ordered, not what's committed, but what really hit the books.
> **Project P&L = Project Revenue minus the costs recorded against that project.**

**Common mistake:** confusing "Committed" (an open Purchase Order not yet received) with "Actual Cost" (material that has genuinely been consumed). A ₹1,00,000 PO does not mean ₹1,00,000 of actual cost yet.

---

# PART 10 — PROCUREMENT (OVERVIEW)

```
Purchase Requisition (PR) → Approval → Purchase Order (PO) → Approval
→ GRN → Supplier Invoice → AP → Payment → Clearing
```

Each stage is its own Part below. One important current fact: **Purchase Requisition before Purchase Order is a configurable rule, and today it defaults to OFF.** That means, as configured right now, a Purchase Order can be created directly without a PR. If Apple Tree Finance wants to make a PR mandatory before every PO, that's a real switch that exists in **FINANCE SOP → SOP Configuration**, but it has **not been switched on** — do not describe it to staff as mandatory until Management actually turns it on.

---

# PART 11 — PURCHASE REQUISITION (PR)

**Screen:** FINANCE SOP → Purchase Requisitions

-----------------------------------------
**PROCESS: Raise a Purchase Requisition**
-----------------------------------------

**Purpose:** request approval to buy something, before actually placing the order.

**Who:** Purchase, Site In-charge, Finance Manager, CEO, Admin.

**When:** before raising a PO — optional today (see Part 10), but good practice regardless.

**Step 1:** Add one or more lines — Description, Quantity, Estimated Rate.
**Step 2:** Optionally link it to a Project and/or a Site.
**Step 3:** Submit.

**Check before submitting:** the estimated rate is realistic — it's used to check whether a Site In-charge can self-approve (see below).

**Approval:**

- A **centrally-raised** PR needs Finance Manager (or CEO/Admin) approval.
- A **site-raised** PR can be self-approved by the Site In-charge **only if** its estimated total is within the configured site-petty daily limit (currently ₹5,000). Above that, it escalates to Finance Manager/Purchase/CEO/Admin.
- The PR's own creator can never approve their own PR (Segregation of Duties), except CEO/Admin.

**After approval:** status becomes **Approved**. It can then be referenced when creating the actual Purchase Order (if the PR-before-PO switch is turned on) or simply kept as a record.

**Accounting effect:** none — a PR is a request, not a financial commitment yet.

**Common mistakes:** raising a PR for something already ordered (should be raised BEFORE); entering a wildly wrong estimated rate that then makes the site-petty check meaningless.

---

# PART 12 — PURCHASE ORDER (PO)

**Screen:** PROCUREMENT → Purchase Orders

-----------------------------------------
**PROCESS: Create and Approve a Purchase Order**
-----------------------------------------

**Purpose:** formally order material/services from a supplier.

**Who:** Purchase (creates), Finance Manager/CEO/Admin (approves, depending on value).

**Step 1:** Select Project, Vendor, and add lines (Material, Quantity, Rate, UoM).
**Step 2:** Optionally reference an approved PR.
**Step 3:** Submit.

**Approval tiers (currently configured):**

- Up to ₹5,00,000 — **no approval needed**, auto-approved on submit.
- ₹5,00,001 to ₹20,00,000 — Finance Manager approval.
- Above ₹20,00,000 — CEO approval.

The PO's own creator can never approve it themselves (except CEO/Admin).

**Check before submitting:** the vendor is active; materials selected are active; quantities and rates are correct; this isn't a duplicate of an existing PO.

**After approval:** the PO becomes ready to receive against (GRN). A real internal "Commitment" is also recorded at this point — this is an operational tracking figure (how much of this PO hasn't yet become a real cost), separate from the accounting books, visible on Project 360.

**Never create a duplicate PO.** Check the Purchase Orders list first.

**Never change a PO after approval, except:** the ERP does support formally *cancelling* an already-approved PO (with a reason) — this releases its Commitment. There is currently **no "PO Amendment" feature** (changing quantities/rates on an already-approved PO) — if you need to change an approved PO's terms, the current supported method is to cancel it and raise a new one; a true partial-amendment feature has not been built.

**Common mistakes:** wrong project selected (moves committed cost to the wrong project); ordering from an inactive vendor.

---

# PART 13 — GRN (GOODS RECEIPT NOTE)

**GRN means: recording what actually arrived**, not what was ordered.

**Screen:** PROCUREMENT → GRNs

-----------------------------------------
**PROCESS: Record a GRN**
-----------------------------------------

**Purpose:** confirm real, physical receipt of material against a Purchase Order.

**Who:** Purchase.

**Step 1:** Select the PO (only Approved / Partially Received POs are shown).
**Step 2:** For each line, enter **Qty Accepted** and **Qty Rejected** — the actual counted numbers, not the ordered numbers.

> **Example:** PO says 100 sheets. Only 95 actually arrived. Enter 95, not 100. Entering 100 because "that's what the PO says" creates a real, false stock and cost record.

**Step 3 (Weighment — optional, but use it for bulk/weighed material):** enter Weighment Qty at Purchase and Weighment Qty at Factory Gate. The screen shows you live whether the variance is **WITHIN TOLERANCE** or **VARIANCE — APPROVAL REQUIRED** (currently a 1% tolerance).

- If outside tolerance, the GRN is **blocked** until an authorized person (Finance Manager, Purchase, CEO, or Admin) enters a genuine investigation reason as an override.

**Approval:** GRN creation itself doesn't need a separate approval step, but an out-of-tolerance weighment variance does require an authorized override before the GRN can be accepted at all.

**After submission:** stock goes up by the accepted quantity; the PO's status moves to Partially Received or Fully Received; a real accounting entry posts (Dr Inventory / Cr GR/IR Clearing).

**Accounting effect (plain language):** receiving goods increases the company's Inventory (an asset) and increases what we technically owe against that goods-receipt, pending the actual supplier bill.

**Common mistakes:** entering the ordered quantity instead of the received quantity; skipping the weighment fields for genuinely weighed/bulk material when a real variance exists (which just defers a real discrepancy instead of catching it early).

---

# PART 14 — INVENTORY

**Screens:** INVENTORY → Stock, Movement Ledger, Transfer, Adjustment, Material Issues, Returns, Damage Reports, Stock Report, Locations, Stock by Location, Stock Counts

Everything that happens to stock is recorded as a "movement" in ONE single ledger — Receipts, Issues, Transfers, Adjustments, Returns, plus (for site and job-work material) Site Receipts/Site Consumption and Job-Work Receipt/Return/Scrap/Direct-Dispatch. There is only ever one true stock number per material per warehouse — it's always the sum of every real movement, never a separately-typed-in number.

**The main movement chains:**
```
Purchase → Warehouse                (GRN)
Warehouse → Site                    (Site Material — Part 17)
Warehouse → Job Worker               (Job Work — Part 19)
Site → Consumption                   (real project cost)
Job Worker → Return / Scrap / Customer  (Job Work — Part 19)
```

**Why record inventory correctly?** Because the same stock number drives: whether Purchase can order more, whether Site can be issued material, the company's Inventory asset value on the Balance Sheet, and Project Cost.

---

# PART 15 — MATERIAL REQUIREMENT

**Screen:** PROCUREMENT → Material Requirements

**Purpose:** a Project Manager formally requests material for their project, BEFORE Purchase acts on it.

**Who:** Project Manager (raises), Finance Manager (approves).

**Steps:** select Project, Material, Quantity, UoM, Required Date, Reason → submit → Finance Manager approves.

**Connection to Material Issue:** an APPROVED Material Requirement can be referenced when the material is actually issued (Part 16) — the requirement is then marked **Converted**, so it can't be reused for a second, separate issue.

---

# PART 16 — MATERIAL ISSUE

**Screen:** INVENTORY → Material Issues

**Purpose:** the actual moment material leaves the warehouse for real use — this is the ONE event that hits Project Actual Cost (for warehouse-direct issues; site consumption is the equivalent event for site-held material, Part 17).

**Who:** Purchase (or whoever the project process assigns).

**Steps:** select Project, Material, Quantity, Warehouse; optionally reference an approved Material Requirement.

**BOM Budget check:** if the material is part of the project's approved Bill of Materials, the ERP checks your issue against the budgeted quantity for that BOM line. Going over budget is not silently blocked OR silently allowed — it requires a manager-tier (Admin/CEO/FinanceManager) authorization, exactly like a real supervisor sign-off would.

**Do not issue material simply because someone asks verbally.** Always record the correct project and the correct, real quantity — this is what turns into the project's real cost figure.

---

# PART 17 — SITE MATERIAL

**Screen:** FINANCE SOP → Site Material

This is the complete chain for material physically sent to a job site (not consumed directly from the factory warehouse).

```
MRS (Material Requisition — Site) → Approval → Delivery Challan
(with transporter/vehicle details) → Site Receipt → Site Stock → Consumption
```

**The critical distinction, explained clearly:**

> **Material SENT to site is not the same as material CONSUMED at site.**
> Example: 10 sheets are sent to a site. Only 7 are actually used. The site's own stock correctly shows **3 sheets remaining** — do **NOT** record all 10 as project consumption. Only the 7 actually used should ever hit Project Actual Cost.

-----------------------------------------
**PROCESS: Site Material, step by step**
-----------------------------------------

1. **Site In-charge** raises an MRS (Material, Quantity, Project).
2. **Finance Manager** (or Site In-charge, within the site-petty limit) approves it.
3. **Purchase** issues it from a real warehouse — this generates a **Delivery Challan** capturing the transporter name and vehicle number.
4. **Site In-charge** records the **Site Receipt** — enter the quantity ACTUALLY received; if it doesn't match the Delivery Challan quantity, the ERP flags a discrepancy for investigation, rather than silently accepting it.
5. **Site In-charge** records **Consumption** as material is actually used — this is what finally hits Project Actual Cost.

**Approval:** MRS approval follows the same site-petty-limit logic as a PR (Part 11).

**Common mistakes:** recording the full sent quantity as consumed on day one; not recording a receipt discrepancy when the site physically received less than the challan said.

---

# PART 18 — SITE RECONCILIATION

**Screen:** FINANCE SOP → Site Material → Site Material Reconciliation

Checks, for every material at every site:

```
Received  −  Consumed  =  Closing (remaining at site)
```

If the numbers don't look right — closing stock seems too high or too low for what's actually left on-site — investigate before the next MRS for that site is approved, not after. Report a genuine mismatch to your Site In-charge/Finance Manager rather than silently adjusting a number.

---

# PART 19 — JOB WORK

**Screen:** FINANCE SOP → Job Work, and APOB & E-way Bill

Job Work means sending Apple Tree's own raw material to an outside processor, who does some work on it and either returns it, scraps part of it, or (in some cases) ships it straight to the customer from their own premises.

-----------------------------------------
**PROCESS: Job Work, step by step**
-----------------------------------------

1. **Add the Job Worker** as a master record — critically, mark whether they are **GST-Registered or not**. This single flag changes what's allowed later.
2. **Dispatch** material to them (you can add several different materials to one dispatch). This creates a Job Work Order and a Delivery Challan; warehouse stock reduces, and the material now shows as held "at the job worker."
3. Later, for each material line independently:

   - **Return** some or all of it — warehouse stock goes back up by exactly that amount.
   - **Scrap** some of it — you must state a disposition:
     - *"Sold By Job Worker (Registered, Tax-Paid)"* — only allowed for a registered job worker; Apple Tree needs no separate tax entry.
     - *"Sold By Apple Tree"* — flagged **APPLE TREE TAX HANDLING REQUIRED**; if this scrap is genuinely sold, a real Customer Invoice must be raised separately (never auto-created).
     - *"Destroyed/Written Off"* or *"Other."*
   - **Direct Dispatch to a customer**, straight from the job worker's premises.

**APOB, explained simply:** APOB means "Additional Place of Business" under GST law. If the job worker is **unregistered**, Apple Tree must formally declare that job worker's premises as its own APOB before dispatching straight to a customer from there — the ERP **blocks** a direct dispatch from an unregistered job worker with no active APOB declaration on file. A **registered** job worker needs no APOB declaration for this.

**Aging:** each Job Work Order tracks how long material has been out — normally 1 year for ordinary material, 3 years for capital goods, shown as NORMAL / DUE SOON / EXTENSION APPROVAL REQUIRED / OVERDUE. Extensions are never automatic — a Finance Manager/CEO/Admin must explicitly approve one.

**E-way Bill and Ship-to GSTIN:** the ERP tracks whether a movement is over the ₹50,000 e-way-bill threshold and lets you record the real e-way bill number once you've generated it on the government portal — **the ERP itself never generates a real e-way bill.** Ship-to GSTIN capture is required from 1 August 2026 onward for job-worker-site direct dispatches (a configurable date, currently set to match the SOP).

---

# PART 20 — MANUFACTURING

**Screens:** MANUFACTURING → BOM, Production Orders; FACTORY/MES → Factory Dashboard, Machines, Job Cards, Production Schedule, Job Analysis, Job Cost Sheet, Product Costing, Labour Performance

**BOM (Bill of Materials):** the approved "recipe" for a product — which materials, in what quantities, make one unit.

**Production Order:** created against an approved BOM with a Planned Quantity. Material is issued against it (using the BOM-derived quantity, not a manually guessed one), labour cost is posted, and the order can be marked Completed (recording actual quantity, and any rejected quantity).

**Job Cards / Machines:** track individual factory jobs and machine status/availability for scheduling.

**How this affects inventory and project cost:** exactly the same as any other Material Issue (Part 16) — issuing material into production reduces warehouse stock and posts to Project Material Cost; producing finished goods can capitalize their value as a Finished Goods asset once completed.

---

# PART 21 — LABOUR AND PROJECT EXPENSES

**Screens:** OPERATIONS → Labour & Wages, Project Expenses

**Labour Wages:** record a worker's name, role, days worked, and rate per day, against a Project — posts a real labour cost.

**Project Expenses:** any other real site/project cost that isn't material or labour (site consumables, travel, permits) — pick a category, enter the amount, select the Project.

**Accounting effect:** both post to the project's Actual Cost, through the same central accounting engine as everything else — there is no separate "labour ledger" or "expense ledger."

---

# PART 22 — SITE / PROJECT TIMESHEET

**Screen:** OPERATIONS → Project Timesheet

Record time entries against a Project and an activity. Used for tracking effort, feeding into the Weekly Scorecard and labour-performance reporting (FACTORY/MES → Labour Performance).

---

# PART 23 — SALES AND BILLING

**Screen:** EXECUTION → Billing Milestones

A Billing Milestone must be explicitly marked **Ready** by an authorized person before an invoice can even be drafted from it — the ERP does **not** automatically invoice just because a dispatch or handover happened. This is a deliberate control: billing is always a conscious, separate action.

Once Ready, a Customer Invoice can be drafted from the milestone (see Part 24).

---

# PART 24 — CUSTOMER RECEIPT AND CLEARING

**Screens:** FINANCE → Customer Invoice, Customer Receipt

```
Customer pays → Record Receipt → Select Customer → Match against the specific open Invoice → Clear
```

**AR** means: money customers still owe us. **Clearing** means: matching a payment/receipt against the specific invoice it settles, so the system knows that invoice is no longer outstanding.

**If a payment can't be matched to a specific invoice** (e.g. customer paid more than one invoice's worth, or it's an advance), do not force-match it against the wrong invoice — a **Customer Advance** exists as its own document type for money received ahead of a specific invoice.

---

# PART 25 — SUPPLIER BILL

**Screen:** FINANCE → Supplier Bill

**AP** means: money we owe suppliers.

**What Accounts should check before entering a supplier bill:**

- Correct Supplier
- Real invoice number and date (from the supplier's own paper/PDF invoice)
- Correct PO and GRN reference (a PO-linked bill is automatically checked against the PO's rate and the GRN's accepted quantity — this is called a **three-way match**: PO + GRN + Invoice must agree)
- Tax amount and code
- Correct Project
- **Not a duplicate** — the ERP blocks billing the same GRN line twice, but always check the Supplier Bill list yourself too

**If the three-way match fails** (invoice doesn't agree with the PO/GRN), the ERP will refuse the bill unless a Finance Manager/CEO/Admin records a genuine, authorized exception with a reason — never just override it yourself.

---

# PART 26 — SUPPLIER PAYMENT

**Screens:** FINANCE → Supplier Payment, and FINANCE SOP → Payment Requests (for the full 3-person process)

**Simple, direct payment** (FINANCE → Supplier Payment) is available for smaller/routine payments.

**For a properly controlled payment, use Payment Requests:**

```
Purchase raises the request → Finance Manager approves it → a THIRD person (e.g. CEO or Accountant) executes it
```

**This is the maker-checker rule, and the ERP genuinely enforces it:**

- The person who **raised** the request cannot also **approve** it.
- The person who **raised** or **approved** it cannot also **execute** it — a real, different third person must.
- CEO/Admin are the only roles exempt from the "third person" rule (since they sit above the normal chain).

**Cash payments have real limits, enforced by the system:** ₹10,000/day/person for an ordinary cash payment, ₹35,000/day for a transporter. Going over requires a Finance Manager/CEO/Admin to record an authorized override reason — it is never silently blocked forever, but it is never silently allowed either.

---

# PART 27 — BANK AND CASH

**Screens:** FINANCE → Bank / Cash Transfer, Bank Reconciliation, ADMIN → Bank Accounts

The ERP supports **multiple** bank/cash accounts, each with its own real GL account behind it — money in Bank A and Bank B are never mixed into one number.

**Bank Reconciliation:** import a real bank statement, and the ERP matches lines against existing receipts/payments, flagging anything unmatched or duplicated for review.

**Do not state that a specific bank account is "configured for Apple Tree" unless the real account details have actually been supplied by Finance** — today's bank account in the system is a placeholder pending real configuration (see Part 58).

---

# PART 28 — PETTY CASH

**Screen:** FINANCE SOP → Petty Cash

**Create a Float:** pick a Site, set the sanctioned amount (defaults to ₹10,000).
**Record an Expense (Voucher):** amount, category, and — **mandatory** — an original bill reference. The ERP refuses a voucher with no bill reference; there is no "unconditional top-up."
**Reconcile:** the ERP shows Expected Cash on Hand = Float − Vouchers Recorded. Physically count the cash and compare.
**Replenish:** once vouchers accumulate, replenishing posts a real expense entry and resets the float.

**Important distinction:**
> The ₹10,000/₹35,000 cash limits (Part 26) are a **SYSTEM CONFIGURATION**, taken directly from the Finance SOP document — they are **NOT yet an independently Tax/Legal-verified legal limit**. Petty cash is still subject to these same limits — the float creates no special exception.

---

# PART 29 — TAX (GST BASICS)

**GST** = Goods and Services Tax. **CGST/SGST** = the two halves of GST charged when both parties are in the **same state**. **IGST** = the single GST charged when the parties are in **different states**.

**Place of Supply** = the location that decides which of the above applies — normally the installation/delivery site, not just Apple Tree's own office address.

> **Example:** Same-state transaction → CGST + SGST. Different-state transaction → IGST. (This is how the ERP's own tax codes are structured today — GST18/GST5 = intra-state split, GST12 = inter-state IGST.)

**HSN/SAC** = the standard product/service classification code required on GST invoices — each material can have one recorded against it.

**TDS** = Tax Deducted at Source — money Apple Tree must withhold from certain supplier payments and pay directly to the government on the supplier's behalf, rather than paying the supplier the full amount.

**ITC** = Input Tax Credit — GST Apple Tree paid on its own purchases, which it can normally claim back/offset. **ITC reversal** = removing that claimed credit when it turns out it's not actually allowed (e.g. the goods were damaged and never used) — see Part 31.

---

# PART 30 — TDS (DEDUCTED AT PAYMENT)

**Where TDS is calculated:** at the moment a supplier payment is made (not at bill entry), if the payment is tagged with a TDS category.
**Who checks it:** Finance Manager/Accountant, using **FINANCE SOP → SOP Configuration** and **Compliance Reports** for the categories, rates, and running totals.
**How it affects the payment:** the TDS amount is deducted from what's actually paid to the supplier, and separately posted to a real **TDS Payable** account (money Apple Tree now owes the government instead of the supplier).
**Categories currently configured:** Goods, Contractor/Job Work, Transport, Professional Fees, Rent, Commission.

> **Important:** the configured TDS rates and thresholds are taken directly from the Finance SOP document. They are shown everywhere as **"SOP CONFIGURATION — NOT INDEPENDENTLY VERIFIED AS CURRENT TAX LAW."** Never describe them to anyone as legally certified rates — an actual Tax/Legal review of every rate is still required before relying on them for real filing.

---

# PART 31 — ITC REVERSAL

**Screen:** FINANCE SOP → ITC / BOQ Reports

When a **Damage Report** is recorded for material that had GST originally paid on it, the ERP **automatically reverses the proportional Input Tax Credit** — because GST law does not allow claiming ITC on goods that are lost, destroyed, written off, or given away as a free sample.

This posts a real accounting entry (a genuine expense, since that tax credit is now gone for good) and appears in the ITC Reversal report, with the total reversed amount and every underlying voucher listed.

---

# PART 32 — SOP COMPLIANCE

**Screen:** FINANCE SOP → Compliance Dashboard

This one screen brings together every Finance-SOP-related control: active Sites, active Job Workers, open Job Work Orders, aging flags, pending PR/MRS/Payment approvals, cash-limit overrides, suppliers crossing the ₹50-lakh/194Q threshold, total TDS deducted, total ITC reversed, and e-way bills not yet generated.

**Below the numbers, it always shows five separate lists** rather than one score:

| Category | Meaning |
|---|---|
| **Configuration Required** | A real value (GSTIN, bank account, etc.) hasn't been supplied yet. |
| **Management Decisions Needed** | A real business/policy choice hasn't been made yet (e.g. the Payment Approval Matrix isn't Board-approved). |
| **Tax / Legal Review Needed** | A rate/threshold is SOP-sourced but not independently verified as current law. |
| **Real-World UAT Required** | Real Apple Tree employees haven't tested this yet. |
| **Future Enhancements** | Deliberately not built yet, disclosed openly (e.g. real government e-way-bill API integration). |

**This dashboard deliberately never collapses to a single "100% compliant" figure** while any of the above lists is non-empty — that would misrepresent real, unresolved work as finished.

---

# PART 33 — FIXED ASSETS

**Screen:** FINANCE → Fixed Assets

```
Create Asset → Capitalize (start depreciation) → Depreciate each period → Transfer (if it moves) → Dispose (if sold/scrapped)
```

> **Example:** Buy a machine for ₹5,00,000. **Capitalize** it with a useful life (say 60 months) and a depreciation method. Each month, **Post Depreciation** reduces its book value a little. If it's later sold for ₹50,000, **Dispose** it and the ERP calculates the real gain or loss against its remaining book value.

**Reconciliation:** compares the sum of all individual asset values against the Fixed Assets control account in the General Ledger — they must match.

---

# PART 34 — JOURNAL ENTRY (FOR ACCOUNTS USERS)

**Screen:** FINANCE → New Journal Voucher, Document Workflow

A Journal Entry is the most basic accounting record — every single financial event in the whole ERP, no matter which screen created it, ultimately becomes one of these.

> **Simple example:** paying a ₹5,000 office expense in cash:
> `Expense account — Debit ₹5,000`
> `Cash account — Credit ₹5,000`

**The one unbreakable rule: Total Debit must always equal Total Credit.** The ERP will not let you post an entry where they don't match.

**What the ERP shows on a real journal entry (SAP-style detail):**
Series/Document Number, Posting Date, Due Date, Document Date, Remarks, Origin (which screen created it) and Origin Number, Project, Branch, Reference fields, and per line: GL Account, Account Name, Debit, Credit, Tax Code, Business Partner, Cost Centre, Profit Centre, Location.

> This system uses **SAP-style / SAP-grade accounting design principles** — it is not SAP software and is not SAP-certified. Never describe it as "SAP," "SAP Business One," or "SAP-certified."

**Manual journal entries** go through Draft → Submit → Approve → Post — a manual entry's creator cannot approve/post it themselves (except CEO/Admin), exactly like every other approval workflow in this document.

---

# PART 35 — GENERAL LEDGER AND FINANCIAL STATEMENTS

**Screens:** FINANCIAL STATEMENTS → Balance Sheet, Company Profit & Loss, General Ledger, Customer Ledger, Supplier Ledger

- **General Ledger (GL):** every posted entry, filterable by account.
- **Trial Balance:** proves total company-wide Debit = total Credit.
- **Balance Sheet:** what the company owns, owes, and is worth, as of a date.
- **Company P&L:** company-wide revenue minus cost, for a period.
- **Customer/Supplier Ledger:** a running statement of everything posted against one specific customer or supplier.

---

# PART 36 — AR / AP

**Screens:** FINANCE → AR Ageing, AP Ageing

**AR Ageing** shows every customer's outstanding invoices, bucketed by how overdue they are (Current, 1-30 days, 31-60, and so on).
**AP Ageing** shows the same for suppliers we still owe.

> **Example:** if a customer's invoice is 45 days overdue, it shows in the "31-60" bucket — this is how Accounts prioritizes follow-up calls.

---

# PART 37 — RECONCILIATION

**Screen:** FINANCE → Reconciliation

**Why it matters:** every subledger (the detailed customer-by-customer or vendor-by-vendor record) must always add up to exactly the matching control account total in the General Ledger. If they ever drift apart, something is genuinely wrong and needs investigating immediately — it should be structurally impossible in a correctly-working system.

Checked here: AR, AP, Output Tax, Input Tax, Customer Advances. (Inventory, Fixed Assets, and Bank each have their own dedicated reconciliation screens too.)

**Key words:**

- **Book balance** = what the ledger says.
- **Subledger** = the detailed record (e.g. every individual customer's balance).
- **Control account** = the one summary GL account that should equal the sum of the whole subledger.
- **Reconciling item** = a genuine, explainable difference (rare, and should always be investigated, never just accepted).

---

# PART 38 — PROJECT PROFITABILITY

Project Profitability = Revenue − (Material + Labour + Other applicable costs), all pulled from real, already-posted accounting entries — never a separately-guessed number.

```
Purchase → Inventory → Consumption → Project Cost → Project P&L
```

**Why sending material to a site is not the same as consuming it:** see Part 17's example again — only *consumed* material becomes real Project Cost. Material merely sitting at a site, not yet used, correctly shows as Site Stock, not as cost.

---

# PART 39 — REPORTS GUIDE

| Report | What it tells you | Who should use it | When |
|---|---|---|---|
| Trial Balance | Debit = Credit, company-wide | Accountant, Finance Manager | Before period close, any time in doubt |
| Balance Sheet | What the company owns/owes/is worth | Finance Manager, CEO | Month-end, whenever asked |
| Company P&L | Company-wide profit for a period | Finance Manager, CEO | Month-end |
| General Ledger | Every posted line, by account | Accountant | Investigating a specific account |
| Customer/Supplier Ledger | One party's full statement | Accountant, Sales/Purchase | Chasing a specific balance |
| AR/AP Ageing | Who's overdue and by how much | Accountant, Finance Manager | Weekly |
| Bank Reconciliation | Bank statement vs. ERP records | Accountant | Whenever a statement arrives |
| Reconciliation | Subledger vs. control account | Finance Manager | Before period close |
| Project 360 / Financial 360 | Everything about one project | Project Manager, Finance | Regularly, per project |
| Stock Report / Stock by Location | What's on hand, where | Purchase, Store | Daily |
| Procurement Intelligence, Vendor Rating | Supplier performance | Purchase, Finance | Vendor reviews |
| Factory Dashboard, Job Cost Sheet, Product Costing | Manufacturing status/cost | Factory/Production | Daily/per job |
| SOP Compliance Dashboard | Everything Finance-SOP related, still open | Finance Manager, CEO | Regularly |
| Seller Cumulative / 194Q Report | Which suppliers are nearing the ₹50L threshold | Finance Manager | Monthly |
| Cash Control Exceptions | Every cash-limit override, with reason | Finance Manager, CEO | Monthly / audit |
| ITC Reversal Report | Total tax credit reversed on damage/write-off | Accountant | Monthly |
| BOQ / BOM Variance | Estimated vs. actual material use per project | Project Manager, Finance | Per project, on suspicion of overuse |
| Audit Log | Who did what, when | Admin, Management | Investigating any concern |

---

# PART 40 — AFTER-SALES

**Screens:** AFTER-SALES → Warranty, Complaints, Service Tickets, Service Visits, AMC, AMC Schedule, Service Billing, CAPA; EXECUTION → Snags, Handover

- **Warranty:** tracks whether a completed job is still within its warranty period, and whether a claim is genuinely eligible.
- **Complaint → Service Ticket → Service Visit:** a customer complaint is triaged into a ticket, then a technician visit is scheduled, diagnosed, and completed — chargeable work is billed separately from warranty-covered work.
- **AMC (Annual Maintenance Contract):** a paid ongoing service agreement, with its own billing schedule.
- **CAPA (Corrective and Preventive Action):** used for investigating a *repeated* problem's root cause — requires three genuinely different people (owner, verifier, and effectiveness-approver) so no one person can sign off their own investigation.
- **Snag:** a defect found during QC or handover, tracked to resolution and independent verification before it can be closed.
- **Handover:** the formal, gated step confirming a project's work is complete and accepted — blocked if QC hasn't passed or an open Critical snag remains.

---

# PART 41 — DOCUMENT NUMBERING

Every real document (PO, GRN, Invoice, Payment, etc.) gets its own automatic, permanent, never-reused number from the ERP — you never type in a document number yourself. Numbers reset to 0001 at the start of each new Financial Year, per document type.

**Never manually invent a document number.** If you need to refer to one in conversation, copy the real number shown on screen.

*(Every document number example anywhere in this SOP is fictional/demo data — never a real Apple Tree number.)*

---

# PART 42 — WHO APPROVES WHAT? (MASTER MAP)

| Document | Created By | Approved By | Notes |
|---|---|---|---|
| Purchase Requisition | Purchase / Site In-charge | Finance Manager (or self, within site-petty limit) | Creator can't self-approve above that limit |
| Purchase Order | Purchase | Auto (≤₹5L) / Finance Manager (≤₹20L) / CEO (above) | Creator never self-approves |
| GRN | Purchase | — (no separate approval; weighment variance needs an authorized override instead) | |
| Supplier Bill | Accountant | Finance Manager (approve) → CEO/Admin/anyone valid (post) | Three-way match may need an authorized exception |
| Payment Request | Purchase (or any authorized role) | Finance Manager (checker) | A THIRD person executes — see Part 26 |
| Site MRS | Site In-charge | Finance Manager (or self, within limit) | Same as PR |
| Quotation Discount | Sales | none (≤5%) / Finance Manager (≤10%) / CEO (above) | |
| Journal Voucher | Accountant (usually) | Finance Manager/CEO (approve), then post | Creator can't self-approve/post |
| Payment Approval Matrix (the policy itself) | Finance Manager (submits for review) | **CEO/Admin only**, with a real reference | **POLICY NOT FINALISED** until this actually happens |

**If an approval rule is shown above as "not yet finalized," that is the honest current state — do not tell staff a final rule exists until Management has actually approved it.**

---

# PART 43 — SEGREGATION OF DUTIES (SoD)

**In plain English:** the person who creates a transaction should not also be the person who approves it, wherever the system requires that separation. This isn't a suggestion — the ERP itself checks and blocks it.

**The clearest example — supplier payment:**
```
Maker (raises the payment request) → Approver (a different person, checks it)
→ Executor (a THIRD person, actually sends the money)
```
Only CEO/Admin are exempt from needing a separate third person, since they already sit above the normal approval chain.

**Other places SoD is enforced today:** Purchase Requisition approval, Journal Voucher approval/posting, Purchase Order approval.

---

# PART 44 — WHAT TO DO IF YOU MAKE A MISTAKE

| Situation | What to do |
|---|---|
| Wrong **Draft** | Edit it directly, or cancel it and start again — a Draft hasn't affected anything yet. |
| Wrong **Submitted** document | It can usually be Rejected (with a reason) by the approver, which sends it back — don't try to edit it while it's mid-approval. |
| Wrong **Posted** accounting entry | Use the proper **Reversal** process — this posts a new, opposite entry; the original stays visible forever, nothing is deleted or silently edited. |
| An entry that's **already Cleared** (payment matched to it) | Do not attempt an unsupported reversal — the clearing itself may need to be undone first; ask Finance/Accounts, don't force it. |
| Anything at all | **Never edit a database file directly, and never ask anyone to do so on your behalf.** There is always a proper in-ERP correction path. |

---

# PART 45 — COMMON ERRORS AND WHAT THEY MEAN

| Message you might see | What it means | What to do |
|---|---|---|
| *"Segregation of duties: PR/PO creator cannot also be approver"* | You're trying to approve your own document | Ask someone else with the right role to approve it |
| *"Exceeds the SOP §4 cash limit for..."* | A cash payment/receipt is over the configured limit | Use a bank transfer instead, or ask a Finance Manager/CEO/Admin to record an authorized override |
| *"EXCEPTION — INVESTIGATION REQUIRED: weighment/measurement variance..."* | GRN weighment is outside tolerance | Investigate the real discrepancy before an authorized person records an override reason |
| *"Cannot approve — [status], not Submitted"* | The document already moved past the state you're trying to act on | Refresh the screen and check its real current status |
| *"APOB REQUIRED"* | Trying to direct-dispatch from an unregistered job worker with no APOB on file | Declare an APOB for that job worker first (Part 19) |
| *"Amount exceeds the open balance"* | Trying to pay/receive more than what's actually still outstanding | Check the real outstanding balance first |
| *"Role [X] cannot..."* | Your role doesn't have permission for this action | This is a genuine restriction, not a bug — ask the right role to do it |

If you see a message not listed here, don't guess — contact whoever administers the ERP.

---

# PART 46 — DO NOT DO THESE THINGS

- Do not share your password with anyone, for any reason.
- Do not log in as another person.
- Do not create a duplicate PO, bill, or payment.
- Do not enter a fake or rounded-up quantity — enter the real number.
- Do not pick the wrong project just because it's quicker.
- Do not try to bypass an approval step — it is enforced by the server, not just the screen.
- Do not enter real Apple Tree data into a UAT/Demo environment.
- Do not treat a demo bank account, demo GSTIN, or demo vendor/customer as real.
- Do not change tax configuration without Finance/Management authorization.
- Do not ignore a reconciliation difference — report it immediately.

---

# PART 47 — COMPLETE END-TO-END EXAMPLE: A PURCHASE-TO-PAYMENT-TO-SITE-COST CHAIN

*(Fictional example — "APPLE TREE UAT PROJECT — TEST ONLY." No real data.)*

1. **Customer** "Test Client" is created.
2. **Quotation** is prepared and the customer accepts (Won).
3. **Project** "APPLE TREE UAT PROJECT — TEST ONLY" is created automatically.
4. **Purchase Requisition** raised for 20 sheets of plywood, approved by Finance Manager.
5. **Purchase Order** raised against that PR, auto-approved (under ₹5L).
6. **GRN** recorded — all 20 sheets received.
7. **Supplier Invoice** entered against the PO+GRN — three-way match passes automatically.
8. This posts to **AP** (we now owe the supplier).
9. **Payment Request** raised by Purchase → approved by Finance Manager → executed by a third person (e.g. CEO).
10. This **Clears** the AP balance for that invoice.
11. **Site Material Requisition (MRS)** raised for 10 of those sheets, approved.
12. **Delivery Challan** created as they're issued from the warehouse to the site.
13. **Site Receipt** recorded — all 10 arrived correctly.
14. **Site Consumption** recorded as 6 sheets are actually used — this is the real cost event; 4 remain correctly shown as Site Stock.
15. **Project Actual Cost** rises by exactly the value of those 6 sheets.
16. **Project P&L** now reflects Revenue (from the quotation) minus this and every other real cost recorded.

---

# PART 48 — SECOND END-TO-END EXAMPLE: JOB WORK

1. **Project** exists, with an approved Material Requirement for a component.
2. **Material Issue** sends the raw material to Production (or directly out for Job Work).
3. **Dispatch to Job Worker** — material now shows as held "at the job worker," not at the warehouse.
4. One of three outcomes for the material, per line:

   - **Return** — comes back to the warehouse; stock increases again.
   - **Scrap** — recorded with a disposition (registered job worker handles tax themselves; if Apple Tree sells scrap, a real Customer Invoice must be raised separately).
   - **Direct Customer Dispatch** — ships straight to the customer from the job worker's site (needs an APOB declaration first if the job worker is unregistered); Apple Tree still issues the real Tax Invoice for this through the normal Customer Invoice screen.

---

# PART 49 — THIRD END-TO-END EXAMPLE: CUSTOMER COLLECTION

```
Customer Invoice → AR (an outstanding amount is created)
→ Customer pays → Receipt recorded → Matched (Cleared) against that invoice
→ AR Outstanding reduces by exactly that amount
```

---

# PART 50 — QUICK REFERENCE

See the separate file **`APPLETREE_ERP_QUICK_REFERENCE.md`** for a one-page "I want to... → go here" lookup.

---

# PART 51 — DEPARTMENT-WISE GUIDES

See the separate file **`APPLETREE_ERP_DEPARTMENT_GUIDES.md`** for a focused guide per department (Management, Accounts, Purchase, Sales, Estimation, Project Management, Site, Store, Factory, Service/After-Sales, Admin).

---

# PART 52 — DAILY / WEEKLY / MONTHLY CHECKLISTS

See **`APPLETREE_ERP_MONTH_END_CHECKLIST.md`** for the month-end procedure, and the per-department daily/weekly checklists inside **`APPLETREE_ERP_DEPARTMENT_GUIDES.md`**.

---

# PART 53 — MONTH-END CLOSING

See **`APPLETREE_ERP_MONTH_END_CHECKLIST.md`** — every step there is marked **"Recommended — Management/Finance confirmation required"** where it isn't yet an approved, mandatory company process.

---

# PART 54 — YEAR-END

A formal year-end procedure has not been defined or approved by Management. **Do not** treat anything in this SOP as statutory/tax year-end advice — that requires Apple Tree's own Tax/Legal advisor, working from real financial data, not this UAT/Demo environment.

---

# PART 55 — SECURITY

- Keep your password private — never write it down where others can see it.
- Always log out when you're done, especially on a shared computer.
- Never share your login with a colleague, even temporarily.
- Never try to use a browser's developer tools to change what a screen shows or sends — the ERP checks every action on the server itself, not just on your screen, so this cannot actually change real records, but attempting it is still against the rules.
- Never try to access another user's data by guessing document IDs — the ERP is designed to refuse this, and attempts are logged.

**The ERP enforces every permission at the server level** — hiding a button on a screen is never the only protection; the server independently checks and refuses anything your role isn't allowed to do, even if someone tried to call it directly.

---

# PART 56 — DATA QUALITY

Getting master data right matters just as much as getting transactions right:

- **Correct UoM** (unit of measure) — a sheet is not a square foot; using the wrong one silently distorts every quantity calculation downstream.
- **Correct tax code** — drives GST calculation on every transaction using that material/service.
- **Correct project, supplier, customer** — every downstream number (inventory, accounting, tax, reports, project profitability) traces back to these.

Wrong master data doesn't just look wrong on one screen — it quietly distorts every report that uses it.

---

# PART 57 — UAT VS PRODUCTION

- **UAT (User Acceptance Testing)** = this testing environment. Everything in it is fictional/demo data.
- **Production** = the real company system, once it exists and is approved (it does not exist yet for this Finance-SOP-compliant build — see Part 67).

**Never enter a real Apple Tree transaction into UAT.** **Never assume anything recorded in UAT is a real accounting transaction** — it isn't, no matter how complete it looks. **Never use a real password inside UAT** — only the dedicated `uat_*` test credentials.

---

# PART 58 — OPEN ITEMS (THINGS THAT ARE NOT YET FINAL)

Taken directly from `MANAGEMENT_DECISION_REGISTER.md` and `REAL_APPLETREE_CONFIGURATION_CHECKLIST.md` — genuinely open, not yet completed:

- **Payment Approval Matrix** — the SOP's ₹5,000/₹1,00,000/Director tiers are illustrative only; a real workflow to approve them exists, but Board approval hasn't happened.
- **PO approval threshold** — the Lab's own thresholds (₹5L/₹20L/CEO) conflict with the Finance SOP's stated ₹25,000 centralized-purchase threshold; not reconciled.
- **PR-before-PO enforcement** — built, but switched OFF by default; a real Apple Tree process decision, not yet made.
- **Payment-category matching** (rent, professional fees, commission, transport services) — no natural three-way match exists for these; Finance hasn't yet confirmed a replacement model.
- **Ship-to GSTIN effective date** — defaults to 1 August 2026 per the SOP's own text; not independently confirmed.
- **Real GSTIN, real PAN, real bank/cash accounts** — none supplied yet; today's are all placeholders.
- **Real opening balances, real vendor/customer/job-worker masters** — none supplied yet.
- **Tax/Legal confirmation of all TDS rates and cash limits** — not yet performed.
- **Real Apple Tree UAT** — this document is prepared FOR that testing; it hasn't happened yet.

**None of the above should ever be described to staff as already decided or completed.**

---

# PART 59 — A NOTE ON "SAP"

This ERP was designed using SAP-inspired accounting and control principles (a single central ledger, document-based postings, segregation of duties, approval workflows) as a reference architecture. It is **not** SAP software, and has **no** SAP certification of any kind.

**Correct language:** "SAP-grade architecture" or "SAP-style accounting/control design."
**Never say:** "SAP," "SAP Business One," "SAP certified," "SAP approved," or "SAP compliant."

---

# PART 60 — CURRENT ERP STATUS (READ THIS LAST)

```
System:                  Appletree ERP — SAP Architecture Lab
Environment:             UAT / DEMO (not Production)
ERP build status:        Feature-complete for the current phase of work;
                         see PHASE36_FINAL_REPORT.md for full detail
UAT status:              Environment prepared and ready; real Apple Tree
                         employee testing has NOT yet been performed
                         (see ACCOUNTANT_UAT_PACKAGE/21_UAT_SIGNOFF.md,
                         currently blank)
Production status:       DOES NOT EXIST — no production environment,
                         no real data, no go-live has occurred
Real Appletree data:     NONE loaded — every item in
                         REAL_APPLETREE_CONFIGURATION_CHECKLIST.md
                         is currently "NOT SUPPLIED"
Management approvals:    NOT YET GIVEN for this SOP or for the open
                         policy items in Part 58
Tax/Legal review:        NOT YET PERFORMED for any TDS rate or cash
                         limit described in this document
Known limitations:       See FINAL_HANDOVER_DOCUMENT.md and
                         PHASE36_FINAL_GAP_REGISTER.md
Open decisions:          See Part 58 above and
                         MANAGEMENT_DECISION_REGISTER.md
```

---

# FINAL PRINCIPLE

This SOP is not a technical manual, not a developer document, and not an accounting textbook. It is the practical, everyday operating guide for Apple Tree employees.

A new employee should be able to open this document, find their department, follow the steps, complete the transaction correctly, understand what happens next, and know who to contact if something goes wrong.

The ERP as it exists today is the source of truth for everything in this document. Nothing here describes a feature that doesn't exist, invents a company policy Management hasn't made, or claims real data or real approval that hasn't actually happened.
