# APPLETREE ERP — USER MANUAL

Plain-language instructions for everyday staff use. This is a test/demo system — nothing you do here touches real company data or money.

## Login

Open the app in your browser — you'll see a red "UAT / DEMO ENVIRONMENT" banner at the top, reminding you nothing here is real. Type your username and password (see `ACCOUNTANT_UAT_PACKAGE/19_TEST_CREDENTIALS.md`), click **Log In**. Click **Log Out** (top-right) when you're done.

## First time? See a working example

An Admin user can click **Create Demo Scenario** (Admin → Users & Roles) to generate one complete, real, connected example — a project all the way through a purchase, a payment, and site material use — so there's something real to open before you start creating your own test data. **Reset UAT Data** on the same screen wipes everything back to a clean start whenever you want.

## Customers, Vendors, Materials, Projects

Found under **CRM**, **PROCUREMENT**, and **PROJECTS** in the top menu. Each has a simple form to add a new one and a table showing existing ones.

## Quotation

**CRM → Quotations**. Build from an approved costing, set a discount if needed (large discounts need manager approval), and send it to the customer.

## Purchase Requisition (PR)

**FINANCE SOP → Purchase Requisitions**. Before ordering material, raise a requisition describing what's needed. Someone else (not you) approves it. Once approved, it can be referenced when creating the actual Purchase Order.

## Purchase Order (PO) → GRN → Supplier Invoice → Payment

**PROCUREMENT → Purchase Orders**: create, submit, get it approved. **PROCUREMENT → GRNs**: record what actually arrived (can be less than ordered — do it again later for the rest). **FINANCE → Supplier Bill**: enter what the vendor billed you. **FINANCE → Supplier Payment**, or for larger amounts **FINANCE SOP → Payment Requests**: pay the vendor — a bigger payment now needs one person to raise it, a different person to approve it, and a third person to actually send the money.

## Site Material

**FINANCE SOP → Site Material**. Create the site once. Raise a Material Requisition (MRS) for what the site needs, get it approved, then issue it from a warehouse (this creates a Delivery Challan). When it arrives at site, record the receipt. When it's actually used, record the consumption — that's when it becomes a real project cost.

## Job Work

**FINANCE SOP → Job Work**. Add the outside processor as a "Job Worker" (say whether they're GST-registered — this matters). Dispatch material to them — you can add several different materials to the same dispatch using "+ Add Material." Each material line can then be returned, scrapped, or directly dispatched independently — a partial return of one material doesn't affect the others on the same order. If some becomes scrap, record that with the right reason. If the finished goods go straight to a customer from the job worker's site, use "Direct Dispatch" — for an unregistered job worker, you'll need an APOB declaration first (**FINANCE SOP → APOB & E-way Bill**).

## Stock

**INVENTORY → Stock** shows what's on hand and its average cost. **Material Issues** records material actually used on a project.

## Production

**MANUFACTURING → BOM** and **Production Orders**: define what a product needs, then track making it.

## Billing & Collection

**EXECUTION → Billing Milestones**: mark a milestone ready to invoice. **FINANCE → Customer Invoice**: create the invoice. **FINANCE → Customer Receipt**: record the customer's payment.

## After-Sales

**AFTER-SALES**: Warranty claims, Complaints, Service Tickets/Visits, AMC contracts, and CAPA (root-cause investigations for repeat problems).

## Petty Cash

**FINANCE SOP → Petty Cash**. Each site can have a small cash float. Every expense from it needs an original bill attached — no exceptions. Reconcile it any time to check the cash on hand matches what should be left; replenish it once vouchers pile up.

## Reports

**FINANCIAL STATEMENTS**: Balance Sheet, Company P&L, General Ledger. **FINANCE SOP → ITC / BOQ Reports**: tax-credit adjustments and estimated-vs-actual material use, plus which suppliers are approaching the ₹50 lakh/year threshold and any cash payments that needed a manager's override. **FINANCE SOP → Compliance Dashboard**: one screen showing everything still outstanding (configuration needed, decisions needed, etc.) — it deliberately never shows a plain "100% done." **Project 360 → Document Flow**: pick any project and see every connected document (PR→PO→GRN→Bill→Payment, or MRS→Delivery Challan→Site Receipt→Consumption) as one chain, without having to remember any document numbers yourself.

## Finance / Reconciliation

**FINANCE → Reconciliation**: checks that customer/vendor balances match the books. **FINANCE → Trial Balance**: confirms every debit has a matching credit, company-wide.

## If something goes wrong

If a screen shows an error, read the message — it usually explains exactly why (e.g., "you can't approve your own request"). If it seems wrong, note down exactly what you did and tell whoever manages this system — don't just try again with different numbers hoping it works.
