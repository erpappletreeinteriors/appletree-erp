# INVENTORY TESTS

1. **Check stock after receiving material** (from a Purchase Order/GRN) — the quantity should go up by the exact amount received.
2. **Issue material to a project.** Stock should go down by exactly that amount.
3. **Try to issue MORE material than is actually in stock.** It should refuse — stock should never go negative.
4. **Check a material that uses a different buying unit than its stock unit** (for example, bought in Boxes but tracked in Pieces). Confirm the quantity converts correctly (e.g., 10 Boxes of 20 Pieces each = 200 Pieces in stock) and that the total ₹ value stays the same either way.
5. **Check the stock value shown on screen matches what you'd expect** given what was paid for it.
