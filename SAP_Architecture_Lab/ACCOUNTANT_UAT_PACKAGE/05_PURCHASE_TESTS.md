# PURCHASE TESTS

1. **Create a Purchase Order** for a test supplier and a test project.
2. **Receive the goods (GRN)** — try receiving only PART of what was ordered first, then the rest later. Check the PO correctly shows it as "partially received" and then "fully received."
3. **Enter the Supplier's Bill.** Check it correctly reduces what's still outstanding on the PO.
4. **Pay the supplier**, using a specific bank account (not just "the bank" in general — pick Bank A or Bank B if more than one exists).
5. **Create a Supplier Debit Note** — this is for when you need to claim money back from a supplier (short delivery, damaged goods, wrong price, etc.). Try each of these reasons:
   - Short Receipt
   - Damaged Material
   - Quality Rejection
   - Supplier Overcharge
   - Price Dispute
   - Purchase Return
   - "Other" — try submitting this WITHOUT typing an explanation first (it should refuse), then try again WITH an explanation (it should work).
6. **Check the supplier's outstanding balance** goes down correctly after the Debit Note.
7. **Reverse a Debit Note** and check the supplier's balance goes back up correctly.
8. **Check "Commitment" on the project.** After you approve a Purchase Order, the project should show that amount as "Committed" — NOT as an actual cost yet. Only after you actually receive the goods should the committed amount go down and move toward becoming a real cost.
