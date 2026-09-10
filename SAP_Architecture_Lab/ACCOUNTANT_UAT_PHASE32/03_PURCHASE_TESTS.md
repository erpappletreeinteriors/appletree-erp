# 3. Purchase Tests (Purchase User)

## 3.1 Purchase Order
Create a Purchase Order for a test project against a test supplier (100 units of any material, round rate). Submit and get it approved.

## 3.2 Try a Fake Supplier
Try creating a PO against a supplier ID that doesn't exist (ask your project lead for one to try, or make one up like "VEND-9999"). It should be rejected with a clear message, not silently accepted.

## 3.3 Goods Receipt (GRN)
Receive only part of what you ordered (e.g. 60 of the 100 units). Confirm the Commitment amount on Project 360 drops by the value received, not to zero.

## 3.4 Supplier Bill — the Correct Way
Go to Supplier Bill. Pick your supplier — you should see the GRN listed under "Bill Against a PO/GRN" with the correct balance already shown. Bill it from there, not from the "Standalone" section.

## 3.5 Try to Bill the Same GRN Twice
Try entering a second Supplier Bill against the exact same GRN for the same amount. It should be rejected.

## 3.6 Try to Overbill
Try billing more than the GRN actually received. It should be rejected.

## 3.7 Pay the Supplier
Go to Supplier Payment, pay the bill, confirm it clears.

## 3.8 Procurement Reports
Open Procurement Intelligence, Vendor Rating, and Purchase & Vendor Report. Confirm your test supplier and PO show up with sensible figures. Note: Vendor Rating uses a placeholder scoring method — this is disclosed on screen, don't treat it as an official score.
