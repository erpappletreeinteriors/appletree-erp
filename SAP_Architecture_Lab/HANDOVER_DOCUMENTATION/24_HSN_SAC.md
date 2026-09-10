# 24 — HSN / SAC

## Optional, never mandatory
HSN (for materials) and SAC (for services) are both optional fields. Neither creating a customer, nor creating an invoice, nor importing a material is ever blocked by their absence.

## Where they live
- **HSN**: a field on the Material master. Set/view it at **Inventory → Stock** (a dedicated "Material HSN Codes" section) or via Master Data Import.
- **SAC**: a field on the Service Labour Rate card (the closest concept this system has to a "service item"). Set it via Master Data Import (ServiceLabourRates template) or the Service Labour Rate configuration screen.

## No values are invented
Every material and every service rate starts with this field blank. Only a real code you enter is ever stored.

## Before you decide these are needed
Confirm with a tax professional whether your real GST filing requirement (based on turnover) actually mandates HSN/SAC on your invoices — see `23_TAX_GST.md`.
