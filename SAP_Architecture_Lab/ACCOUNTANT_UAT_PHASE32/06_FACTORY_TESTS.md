# 6. Factory / Production Tests (Factory / Production User)

## 6.1 BOM → Production Order
Create and approve a BOM for your project, then create a Production Order against it for a small quantity.

## 6.2 Machine and Job Card
Add a test machine. Create a Job Card for your Production Order, assign it to the machine and a worker, and Start it. Confirm the machine shows as "In Use."

## 6.3 Issue Production Material
Issue the material needed for the Production Order. This should always work, even if it uses up the entire BOM budget in one go — a Production Order issuing its own planned material is never treated as "over-budget."

## 6.4 Post Labour and Complete
Record labour against the Production Order, then complete the Job Card. Confirm the machine goes back to "Available."

## 6.5 QC
Run a QC check on the project and mark an item as Failed. Confirm the QC status updates. Note: a failed QC does not automatically reverse or block the material already issued — that is a known, accepted limitation, not something to re-report unless it causes an incorrect financial number.

## 6.6 Production Schedule / Job Analysis
Confirm your Production Order and Job Card appear on these screens.

## 6.7 Job Cost Sheet
Open the Job Cost Sheet for your Production Order and confirm the material and labour costs shown match what you actually recorded.

## 6.8 Product Costing
Open Product Costing for your BOM. This is a rough estimate only (uses a disclosed 15% assumption) — it is clearly labelled as not an approved costing policy. Don't treat it as final.
