# BANK / CASH TESTS

1. **Record a customer receipt into Bank A.** Check Bank A's balance goes up. Check Bank B's balance does NOT change.
2. **Record a customer receipt into Bank B** and a supplier payment out of Bank B. Check Bank B's balance is now correct and Bank A is unaffected.
3. **Use a Cash account** (if one exists) the same way — receipt in, payment out — and check its balance separately from any bank account.
4. **Transfer money between two accounts** (e.g., Bank A to Bank B) using the "Bank / Cash Transfer" screen. Check the money leaves one account and arrives in the other, for the exact same amount.
5. **Try transferring money from an account to itself.** It should refuse.
6. **Reverse a transfer or a receipt** and check that ONLY the account(s) involved in that one transaction change — every other account's balance must stay exactly the same.
7. **Import the bank statement** (if you have a test file) and try matching a line on the statement to a transaction already in the system.
