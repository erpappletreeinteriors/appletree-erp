# 3. Factory / MES → Labour → Project Expense

## 3.1 Bill of Materials
Create a simple BOM for your project (one material line) and approve it.

## 3.2 Production Order
Create a Production Order against the approved BOM for a small planned quantity (e.g. 5).

## 3.3 Machines (new)
Go to **Machines**. Add a test machine (e.g. "Test CNC 1").

## 3.4 Job Card (new)
Go to **Job Cards**. Create a job card for your Production Order, assign it to the test machine and a test worker name, and Start it. Confirm the machine's status changes to "In Use."

## 3.5 Issue Material to Production
Issue the material needed for the Production Order (this uses the same "issue material" mechanism you already tested in Part 2).

## 3.6 Post Production Labour
Record a labour cost against the Production Order.

## 3.7 Complete the Job Card
Mark the Job Card Complete. Confirm the machine goes back to "Available."

## 3.8 Production Schedule / Job Analysis (new)
Open **Production Schedule** and confirm your Production Order and Job Card appear. Open **Job Analysis** and confirm your job card shows a duration once completed.

## 3.9 Job Cost Sheet (new)
Open **Job Cost Sheet**, select your Production Order, and confirm the Material Cost and Labour Cost shown match what you actually posted.

## 3.10 Product Costing (new)
Open **Product Costing**, select your BOM. This shows an ESTIMATED standard cost, using a placeholder 15% labour/overhead assumption. This is clearly marked as not an approved Appletree costing policy — treat it as a rough estimate only.

## 3.11 Labour & Wages (new — separate from Production Labour)
Go to **Labour & Wages**. Record a day-labour entry for your project (worker name, days, rate per day). Confirm it posts a real accounting entry.

## 3.12 Project Expenses (new)
Go to **Project Expenses**. Record a small site expense against your project (e.g. "Site Consumables," ₹2,000). Confirm it posts a real accounting entry.

## 3.13 Project Timesheet / Tasks / Risk Register (new, no accounting impact)
Log a timesheet entry, create a task, and log a risk against your project. These are for tracking only — they should NOT create any accounting entries. Confirm that.

## 3.14 QC Dashboard / Factory Dashboard (new)
Open both dashboards and confirm the numbers reflect real activity (not zeros, not obviously made-up numbers), if you've done any QC checklists or factory activity above.

## 3.15 Weekly Scorecard (new)
Open **Weekly Scorecard** and click "Capture This Week's Snapshot." Confirm it saves a row with your project's current numbers. This is a frozen snapshot — it will NOT update itself later; you have to click Capture again next week to compare.
