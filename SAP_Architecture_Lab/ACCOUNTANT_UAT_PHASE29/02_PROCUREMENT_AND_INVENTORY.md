# 2. Procurement → Inventory Operations

Use the project you created in Part 1.

## 2.1 Purchase Order
Create a Purchase Order for your project against a test supplier, for 100 units of any material at a round number rate (e.g. ₹1,000/unit). Submit and approve it.

## 2.2 Check the Commitment
Open **Project 360**. You should see a "Committed" amount equal to the full PO value, even though nothing has been received yet.

## 2.3 Receive Goods (GRN)
Create a GRN receiving only 60 of the 100 units. Check that:
- The Commitment amount goes DOWN by the value of what was received, not to zero.
- The remaining 40 units are still shown as open/committed.

## 2.4 Enter the Supplier Bill — the right way
Go to **Supplier Bill**. Select your supplier. You should see the GRN you just created listed under **"Bill Against a PO/GRN"**, already showing the correct balance. Enter the bill against it — do NOT use the "Standalone Supplier Bill" section for this, since it relates to a real PO/GRN.

## 2.5 Pay the Supplier
Go to **Supplier Payment**, pay the bill in full, and confirm it shows as cleared.

## 2.6 Procurement Intelligence / Vendor Rating (new)
Open **Procurement Intelligence** and **Vendor Rating**. Confirm your test supplier now appears with a spend figure and a rating. Note: the rating formula is a placeholder, not an approved Appletree scoring method — just check the number looks reasonable, don't treat it as official.

## 2.7 Purchase & Vendor Report (new)
Open **Purchase & Vendor Report**. Find your PO and confirm Ordered / Received / Invoiced / Paid all show the correct amounts.

## 2.8 Material Issue (new dedicated screen)
Go to **Material Issues**. Issue some of the received stock to your project. Confirm the stock quantity drops by the right amount.

## 2.9 Locations (new, optional)
Go to **Locations**. Create two test locations under any warehouse (e.g. "Shelf A", "Shelf B"). Note: you do NOT have to use locations — everything works fine without them. This is only useful if Appletree ever wants to track exactly which shelf/bin material sits on.

## 2.10 Damage Report (new)
Go to **Damage Reports**. Report a small quantity of a material as damaged, picking a reason from the list. If you pick "Other," you must type an explanation or it will be rejected. Confirm the stock quantity drops.

## 2.11 Stock Count (new)
Go to **Stock Counts**. Start a count for a warehouse and material. Enter a counted quantity slightly different from the system quantity. Submit it and confirm a correction (Inventory Adjustment) was posted automatically for the difference.

## 2.12 Returns (new dedicated screen)
Go to **Returns**. Return a small quantity from your GRN back to the supplier. Confirm stock and the amount owed to the supplier both adjust correctly.

## 2.13 Stock Report (new)
Go to **Stock Report**. Confirm the quantity shown for your material matches what you'd expect after all the above steps (received, minus issued, minus damaged, minus/plus count corrections, minus returned).
