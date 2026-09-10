# TEST SCENARIOS — Overview

These are realistic day-in-the-life scenarios. Each one is broken into the detailed test files (03–13). Read this page first to understand the "story," then go do the detailed steps.

## Scenario A — A Normal Sales Day

A customer orders work. You invoice them. They pay you. You check that their account shows the right outstanding balance.
→ See `04_SALES_TESTS.md`

## Scenario B — A Normal Purchase Day

You order material from a supplier. It arrives (maybe not all of it). You get their bill. You pay them. You find out you were overcharged and need to claim it back.
→ See `05_PURCHASE_TESTS.md`

## Scenario C — Managing Stock

Material comes in from a purchase. Some of it gets used on a project. You check what's left.
→ See `06_INVENTORY_TESTS.md`

## Scenario D — Running a Project

A project has a budget. You spend against it (materials, labour). You check whether you're making money on it.
→ See `07_PROJECT_TESTS.md`

## Scenario E — Money In and Out of the Bank

You have more than one bank account (and maybe a cash box). Money moves between them. You reconcile against the bank statement.
→ See `08_BANK_TESTS.md`

## Scenario F — Company Equipment

You buy a machine. You track its value going down over time. Eventually you might sell it or scrap it.
→ See `09_FIXED_ASSET_TESTS.md`

## Scenario G — After the Sale

A customer has a warranty claim, or you have an annual maintenance contract with them, or they call you back for extra paid work.
→ See `10_SERVICE_AMC_WARRANTY_TESTS.md`

## Scenario H — Who Can Do What

Different people have different jobs — a salesperson shouldn't be able to approve their own big discount, for example.
→ See `11_SECURITY_TESTS.md`

## Scenario I — Checking the Numbers

At the end of the month, does everything actually add up?
→ See `12_REPORT_TESTS.md` and `13_RECONCILIATION_TESTS.md`

## Scenario J — Before You Even Raise the Purchase Order (Finance SOP, new)

Appletree's real Finance SOP added several controls: a Purchase Requisition step before a PO, cash payment limits, and rules for which categories of payment need PO/GRN/Invoice matching.
→ See `15_PURCHASE_REQUISITION_AND_APPROVAL_TESTS.md`

## Scenario K — Material Leaving the Factory for a Site (Finance SOP, new)

Material requested by a site, approved, issued from the warehouse with a Delivery Challan, received at the site (checking for discrepancies), and finally consumed on the actual project.
→ See `16_SITE_MATERIAL_TESTS.md`

## Scenario L — Sending Material Out for Job Work (Finance SOP, new)

Sending raw material to an outside processor, getting it back (or not — sometimes it's scrapped, sometimes it goes straight to a customer), and the extra GST paperwork (APOB, e-way bill) that a few of those situations require.
→ See `17_JOB_WORK_TESTS.md`

## Scenario M — Making Sure One Person Can't Move Money Alone (Finance SOP, new)

Every payment now needs three different people (raise, approve, pay) — plus cash payment ceilings, a proper petty cash box, and correcting the tax credit on damaged goods.
→ See `18_PAYMENT_CONTROLS_AND_PETTY_CASH_TESTS.md`

## Also test, wherever you notice the chance:

- **Undo/reverse** something you did by mistake — does it actually undo cleanly?
- **Try to do something you're not supposed to be able to do** — does it stop you?
- **Ask "who did this and when?"** about a transaction — can you find out?
