# JOB WORK & E-WAY BILL TESTS (new — Finance SOP)

Menu: **FINANCE SOP → Job Work** and **FINANCE SOP → APOB & E-way Bill**

1. **Create a Job Worker** marked as "Registered" and one marked as "Unregistered" (this matters for tax handling later).
2. **Dispatch material to the registered Job Worker** — pick a warehouse, a material with real stock, and a quantity. Confirm a Job Work Order and a Delivery Challan are both created, and the warehouse's stock goes down by exactly that quantity.
3. **Return some of that material** — confirm the warehouse's stock goes back up, and the order's status changes to "Partially Returned" (not fully "Returned," since some is still with the job worker).
4. **Record Scrap for a registered job worker** using disposition "Sold By Job Worker (Registered, Tax-Paid)" — confirm the message says Apple Tree does not need to record a separate tax entry for this.
5. **Dispatch material to the UNREGISTERED job worker.**
6. **Try to record scrap for the unregistered job worker** using "Sold By Job Worker (Registered, Tax-Paid)" — confirm this is refused (that disposition only makes sense for a registered job worker).
7. **Record scrap for the unregistered job worker** using "Sold By Apple Tree" instead — confirm the message flags "APPLE TREE TAX HANDLING REQUIRED" (meaning if this scrap is actually sold, Apple Tree needs to raise a normal customer invoice for it separately — nothing is auto-created).
8. **Try to dispatch directly to a customer from the unregistered job worker's site** — confirm this is BLOCKED with "APOB REQUIRED."
9. **Declare an APOB** for that unregistered job worker (APOB & E-way Bill screen), then try the direct customer dispatch again — confirm it now succeeds.
10. **Try the same direct dispatch from the REGISTERED job worker** — confirm it succeeds without needing any APOB declaration.
11. **Dispatch material with NO expected return date**, and check the Job Work order shows up correctly. (The system defaults to a 1-year return period for ordinary material, or 3 years if you mark it "Capital Goods.")
12. **Create an E-way Bill record** for a movement worth over ₹50,000 — confirm it's flagged "Required." Create one for under ₹50,000 — confirm it's flagged "Not required."
13. **Record a real e-way bill number** against a "Required" record — confirm the status changes to "Generated (manually recorded)." (This system never generates a real e-way bill itself — you generate it on the government portal first, then type the number in here.)
