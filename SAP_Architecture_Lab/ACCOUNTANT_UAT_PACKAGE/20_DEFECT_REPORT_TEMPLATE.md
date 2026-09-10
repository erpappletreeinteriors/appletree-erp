# DEFECT REPORT TEMPLATE

Copy this block for every real problem you find. Don't worry about sounding technical — describe it in your own words.

```
Defect ID: (leave blank, will be assigned)
Module: (e.g. Purchase Order, Site Material, Job Work)
Test ID / File: (which numbered test file, or "found while doing X")
Login As: (which username you were using)
Steps to reproduce:
  1.
  2.
  3.
What I expected to happen:
What actually happened:
Severity (your best guess): Blocks everything / Wrong number or result / Confusing but works / Cosmetic
Screenshot or evidence: (attach if possible)
Date found:
Reporter:
```

## What NOT to report here

- A "Management Decision" or "Configuration" message (e.g. "PAYMENT CONTROL POLICY REQUIRED", "POLICY NOT FINALISED") is not a defect — it's the system correctly telling you a real business decision hasn't been made yet. See `MANAGEMENT_DECISION_REGISTER.md`.
- A TDS rate or cash limit labeled "SOP-sourced, not independently verified as current tax law" is not a defect — that's an accurate disclosure, not a bug.

## What TO report here

Anything that crashes, shows a wrong number, lets you do something it shouldn't, or stops you doing something it should.
