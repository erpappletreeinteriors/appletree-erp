# APPLETREE ERP — DEPARTMENT GUIDES
*(UAT / Demo version — see `APPLETREE_ERP_SOP.md` for full detail on every process named below)*

---

## A. MANAGEMENT (CEO / Directors)

**Daily/as-needed:** review pending high-value approvals (large POs, large discounts, payment executions above the Finance Manager tier); check the SOP Compliance Dashboard for anything newly flagged.
**Weekly:** review Project 360 for major projects; review the Audit Log if anything seems unusual.
**Monthly:** review Company P&L and Balance Sheet; review the Cash Control Exceptions report and Seller Cumulative / 194Q report.
**Important checks:** you are the ONLY role (with Admin) that can approve the Payment Approval Matrix itself — never delegate this.
**Reports used:** Company P&L, Balance Sheet, SOP Compliance Dashboard, Project 360.
**Approvals:** POs above ₹20,00,000; quotation discounts above 10%; Payment Approval Matrix (Board-level); payment execution as a genuine third person when needed.
**Common mistakes to avoid:** approving your own submitted document just because you have the authority to — the system will block self-approval on most workflows even for CEO in some cases; use a genuinely separate approver where the rule requires it.

---

## B. ACCOUNTS

**Daily:** check pending approvals relevant to Accounts; check new supplier invoices for correctness before posting; check payments and receipts recorded that day; check clearing status on invoices you expect to be settled.
**Weekly:** review AR/AP Ageing; review reconciliation for any exceptions.
**Monthly:** full Reconciliation (AR, AP, Output/Input Tax, Customer Advances); Bank Reconciliation; TDS deduction review; month-end checklist (see `APPLETREE_ERP_MONTH_END_CHECKLIST.md`).
**Important checks:** every journal entry balances (Debit = Credit) before submitting; every supplier bill has a genuine PO/GRN match or an authorized exception; no duplicate bill against the same GRN.
**Reports used:** Trial Balance, General Ledger, Customer/Supplier Ledger, AR/AP Ageing, Reconciliation, ITC Reversal Report.
**Approvals:** Accountant does not hold approval-tier authority in this ERP — you create/submit, Finance Manager or CEO approves/posts.
**Common mistakes:** entering the ordered quantity on a bill instead of what a GRN actually recorded; forcing a receipt to match the wrong invoice when it should be a Customer Advance instead.

---

## C. PURCHASE

**Daily:** check open PRs awaiting your action; check PO approval status; check pending GRNs for POs that have delivered.
**Weekly:** review Procurement Intelligence and Vendor Rating.
**Important checks:** never enter the PO's ordered quantity on a GRN — always enter the real received quantity; check the vendor is active before ordering; check for an existing PO before creating a new one.
**Reports used:** Purchase Orders list, Procurement Intelligence, Vendor Rating, Purchase & Vendor Report.
**Approvals:** you raise PRs and POs; you do not approve your own.
**Common mistakes:** skipping weighment entry on genuinely weighed/bulk material; dispatching Job Work to an unregistered job worker without checking APOB requirements first.

---

## D. SALES

**Daily:** follow up on Leads assigned to you; check quotation approval status.
**Weekly:** review your assigned customers' outstanding balances (AR Ageing, filtered to your customers where visible).
**Important checks:** always confirm which costing version a quotation is built from; keep discount requests honest — going over 5%/10% genuinely needs the next approval tier, don't try to structure around it.
**Reports used:** Quotations list, Customer Profitability (After-Sales area).
**Approvals:** none — Sales creates, Finance Manager/CEO approves discounts above the no-approval tier.
**Common mistakes:** quoting the wrong customer when you have more than one assigned; creating a brand-new quotation for a revision instead of using the proper Revision function (which correctly keeps history).

---

## E. ESTIMATION

**Daily:** work through estimation requests assigned to you.
**Important checks:** every costing line (Material/Labour/Transport/Installation/Other) is complete before handing to Sales; Overhead % and Profit % reflect real company policy, not guesswork.
**Reports used:** Estimation & Costing screen itself; no separate dedicated report beyond this.
**Approvals:** none.
**Common mistakes:** letting Sales quote from an incomplete or outdated costing version instead of the latest one.

---

## F. PROJECT MANAGEMENT

**Daily:** check your assigned projects' status; check for any Material Requirement awaiting your approval.
**Weekly:** review Project 360 for material consumption, labour, and expenses against budget.
**Monthly:** review project profitability (Project P&L) and the BOQ/BOM Variance report for abnormal consumption.
**Important checks:** you can only act on YOUR assigned projects — if you can't see a project you expect to, check your assignment with Admin, don't assume it's a bug.
**Reports used:** Project 360, Project Financial 360, BOQ/BOM Variance, Weekly Scorecard.
**Approvals:** Material Requirements for your own projects.
**Common mistakes:** confusing "Committed" (open PO value) with real Actual Cost when reporting project status upward.

---

## G. SITE (Site In-charge)

**Daily:** raise MRS for material needed; record site receipts against Delivery Challans as material arrives; record consumption as material is actually used.
**Weekly:** submit the Site Material Reconciliation review for your site; investigate and explain any variance beyond the configured tolerance.
**Important checks:** never record all sent material as consumed on arrival — only what's genuinely used; always record a receipt discrepancy if the physical count doesn't match the Delivery Challan.
**Reports used:** Site Material Reconciliation.
**Approvals:** your own site's MRS/petty purchases, but only within the configured site-petty daily limit (currently ₹5,000) — above that, escalate.
**Common mistakes:** approving your own MRS when its value is actually above the site-petty limit (the system should block this, but don't rely on it — check the estimate yourself first).

---

## H. STORE

*(This ERP currently has no separate "Store" login role — store/warehouse functions like GRN and Material Issue are performed under the Purchase role. If Apple Tree wants a distinct Store role with narrower permissions, that is a Management decision not yet implemented.)*

**Daily:** check receipts (GRN) against physical deliveries; check outgoing issues match real requests; check returns are recorded promptly; check stock counts are accurate.
**Important checks:** physically count before entering a GRN's accepted quantity — never just copy the PO's ordered quantity.
**Reports used:** Stock Report, Stock by Location, Movement Ledger.
**Common mistakes:** letting stock counts lag behind actual physical movement, making later reconciliation harder.

---

## I. FACTORY

*(This ERP currently has no separate "Factory" login role — factory/manufacturing functions are performed under the Purchase or Project Manager role, depending on the task. A dedicated Factory role, if wanted, is a Management decision not yet implemented.)*

**Daily:** update Job Card status; check Machine availability; issue material against Production Orders using the BOM-derived quantity.
**Weekly:** review the Factory Dashboard and Production Schedule.
**Reports used:** Factory Dashboard, Job Analysis, Job Cost Sheet, Product Costing, Labour Performance.
**Common mistakes:** issuing more material to a Production Order than its BOM actually calls for, without the required manager-tier authorization.

---

## J. SERVICE / AFTER-SALES

**Daily:** triage new complaints into tickets; schedule and complete service visits.
**Important checks:** correctly classify a visit as Warranty vs. Chargeable before billing — this determines whether it costs the customer anything.
**Reports used:** Customer 360, Repeat Complaint History.
**Approvals:** CAPA requires three genuinely different people (owner, verifier, effectiveness-approver) — never let one person play more than one of these roles.
**Common mistakes:** closing a CAPA case before its Effectiveness Check has actually confirmed the fix worked.

---

## K. ADMIN

**Daily (in UAT):** support testers — reset UAT data between test rounds if requested, create/manage user accounts, seed the Demo Scenario for new testers.
**Important checks:** every user has the correct role for their real job — no one should have more access than they need; only create test users, never real credentials, in this UAT environment.
**Reports used:** Audit Log, Users & Roles.
**Approvals:** system-wide, but should be used sparingly to override normal SoD — every override is logged.
**Common mistakes:** using Admin/CEO's SoD-exemption as a routine shortcut rather than reserving it for genuine exceptions.
