# 25 — Customer GSTIN

## Optional, never mandatory
A customer can exist and be invoiced with no GSTIN on file. No GSTIN value is ever invented — every seeded/created customer starts with this field blank.

## Setting it
**After-Sales → Customer 360**, select the customer, click "Set GSTIN." The value is automatically normalized to uppercase and validated against the standard 15-character GSTIN format if supplied.

## Audit
Every change to a customer's GSTIN is specifically logged (old value, new value, who changed it, when) — not folded into a generic "customer edited" event.

## Note on the underlying field
Earlier in development, a second, differently-named field for this same concept existed on a rarely-used code path (never populated in practice). This was found during Phase 20's final build-completion audit and consolidated onto the one real `gstin` field described here — there is now exactly one GSTIN concept per customer, not two.
