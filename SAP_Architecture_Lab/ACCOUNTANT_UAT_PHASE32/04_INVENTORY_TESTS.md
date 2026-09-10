# 4. Inventory Tests (Purchase User / Project Manager)

## 4.1 Material Requirement
Go to Material Requirements. Request a material for your test project (e.g. Material A, qty 80). You can add several materials in one go using "+ Add Material" before submitting.

## 4.2 Approve It
Submit it, then approve it (may need a different login). Confirm the status becomes APPROVED.

## 4.3 Material Issue Against the Requirement
Go to Material Issues. Pick your project — your approved requirement should appear in the "Fulfilling Requirement" dropdown. Select it — it should auto-fill the material and quantity. Issue it.

## 4.4 Try to Reuse the Requirement
Try issuing against the same requirement again. It should be blocked — it's already fulfilled.

## 4.5 BOM Budget Check
If your project has an approved Bill of Materials, watch the "BOM" indicator under each Material Issue row as you type a quantity — it shows how much of the budget you'd be using. Try to issue more than the BOM allows for a material. You should be blocked unless you provide a reason (or are logged in as a manager-tier user).

## 4.6 Material With No BOM Line
Issue a material that isn't part of any BOM for your project. It should still work — the system should just note there's no BOM quota for it, not block you.

## 4.7 Damage Report
Report a small quantity of a material as damaged, with a reason. If you pick "Other," you must explain why.

## 4.8 Stock Count
Start a stock count for a material, enter a counted quantity slightly different from the system quantity, submit, and confirm an automatic correction was posted.

## 4.9 Returns
Return a small quantity from a GRN back to a supplier. Confirm stock and the amount owed both adjust.

## 4.10 Stock Report
Confirm the final quantity shown matches what you'd expect after everything above.
