# PURCHASE REQUISITION & APPROVAL POLICY TESTS (new — Finance SOP)

Menu: **FINANCE SOP → Purchase Requisitions** and **FINANCE SOP → SOP Configuration**

1. **Raise a Purchase Requisition** for a test project — add two lines with a description, quantity, and estimated rate each.
2. **Submit it**, then **approve it** as a different person (whoever raised it should not also be able to approve it — try it and confirm it's refused).
3. **Reject a Purchase Requisition** with a reason, and confirm the reason is saved.
4. Go to **SOP Configuration** and find "Purchase Order Approval Policy." Note that it currently says **"Require Purchase Requisition before PO? No"** — this means today, a Purchase Order can still be raised without a Purchase Requisition. Confirm this is what you expect (this is a deliberate setting, not a bug) — if Appletree wants every PO to require an approved requisition first, that's a setting to switch on, and someone in Finance needs to decide when.
5. **Check the cash limits** shown on the same screen — cash payment ₹10,000/day/person, transporter ₹35,000/day, and read the note that these are values taken directly from the Finance SOP document, not independently checked against current tax law.
6. **Check the TDS Rates & Thresholds table** on the same screen — confirm it lists Goods, Contractor/Job Work, Transport, Professional Fees, Rent, and Commission, each with a rate and threshold.
7. **Look at the Payment Approval Matrix** on the same screen — confirm it clearly says "NOT FINALISED" and explains that the SOP itself calls this table illustrative, pending Board approval.
8. **Look at "Payment Matching Rules by Category"** — Goods/Job Work/Transport Material should already say "Technically Compliant." Rent/Professional Fees/Commission/Transport Services should say "Policy Required" — try clicking "Confirm" on one of them as a Finance user, and confirm it switches to "Technically Compliant." Then try the same as a non-Finance user and confirm it's refused.
