# 8. Billing Tests (Accountant / Finance Authorizer)

## 8.1 Customer Invoice
Bill your test customer for the project's contract value.

## 8.2 Try a Fake Customer
Try billing a customer ID that doesn't exist. It should be rejected, not silently accepted.

## 8.3 Customer Receipt
Record the customer paying in full. Confirm it clears against the invoice.

## 8.4 Partial Receipt
On a second test invoice, record only a partial payment. Confirm the remaining outstanding amount is correct.

## 8.5 Credit / Debit Note
Issue a Credit Note against an invoice for a small amount. Confirm the outstanding balance reduces correctly.

## 8.6 Customer Advance (if relevant to your role)
Record a customer advance for a project. Confirm it posts correctly and shows on the project's Financial Readiness check.
