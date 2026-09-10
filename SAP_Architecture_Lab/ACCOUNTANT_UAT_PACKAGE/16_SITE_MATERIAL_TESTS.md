# SITE MATERIAL TESTS (new — Finance SOP)

Menu: **FINANCE SOP → Site Material**

1. **Create a Site** — give it a name, address, and state.
2. **Raise a Material Requisition (MRS)** for that site — ask for a real material and a quantity.
3. **Submit and approve the MRS** (as a different person from whoever raised it).
4. **Issue the material from a warehouse** — pick a warehouse and enter a transporter name and vehicle number. Confirm a Delivery Challan number is generated.
5. **Check the warehouse's stock went down** by exactly the issued quantity (Inventory → Stock).
6. **Record the Site Material Receipt** against that Delivery Challan — enter a quantity RECEIVED that's different from what was sent, and confirm the system flags a discrepancy rather than silently accepting it.
7. Now record a receipt that matches exactly, and confirm no discrepancy is shown.
8. **Check the Site Stock** for that material at that site — it should show exactly what was received.
9. **Record Site Consumption** — use some of that material at the site for a project. Confirm the site's stock goes down by that amount, and check the project's cost went up correctly.
10. **Try to consume more than the site actually has** — confirm this is refused, not silently allowed.
11. **Load the full Site Material Reconciliation report** and confirm it shows Received / Consumed / Closing for every material at every site, and that Closing = Received − Consumed for each row.
12. **Try to issue material against an MRS that hasn't been approved yet** — confirm this is refused.
