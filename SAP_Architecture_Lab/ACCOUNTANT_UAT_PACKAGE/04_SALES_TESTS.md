# SALES TESTS

1. **Create a customer invoice** for a test customer and a test project, for a made-up amount.
2. **Record a full payment** against that invoice. Check the customer's outstanding balance drops to zero.
3. **Create a second invoice, then record only a partial payment.** Check the outstanding balance shows the correct remaining amount, not zero and not the full original amount.
4. **Create a Credit Note** against an invoice (e.g., a price correction). Check the customer's balance reduces by exactly that amount.
5. **Try to record a payment for MORE than the invoice amount.** It should refuse, not silently accept an overpayment.
6. **Reverse a posted invoice.** Check the customer's outstanding balance goes back to what it was before the invoice existed.
7. **Try creating an invoice with no customer selected, or no project selected.** It should refuse with a clear message, not crash or silently create something wrong.
8. **Check a customer with a GSTIN and one without.** Both should be able to be invoiced normally — GSTIN should not be a mandatory blocker.
