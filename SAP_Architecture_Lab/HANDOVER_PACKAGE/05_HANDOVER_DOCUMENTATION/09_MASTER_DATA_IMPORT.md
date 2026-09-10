# 09 — Master Data Import

Screen: **Finance → Master Data Import**. API: `POST /api/master-import` (Admin/CEO only).

## How it works
1. Choose a master type.
2. Paste CSV data (header row + data rows).
3. Click Import.
4. Every row is validated **independently** — a valid row is created immediately; an invalid row is rejected with a specific reason. **A row is never partially imported.**
5. Review the per-row result table before moving on. Import history is kept permanently (`GET /api/master-import/batches`) for audit.

## Templates

### Customers
| Field | Required | Example | Validation | Duplicate Rule |
|---|---|---|---|---|
| name | Yes | TEST Customer Ltd | — | Matched by exact name (case-insensitive) — a repeat name is linked, not re-created |
| contact | No | 9999999999 | — | — |
| billingAddress | No | | — | — |
| siteAddress | No | | — | — |
| gstin | No | 32AABCT1234A1Z5 | Must match GSTIN format if supplied | — |
| paymentTerms | No | 30 days | — | — |

### Suppliers
| Field | Required | Example | Validation | Duplicate Rule |
|---|---|---|---|---|
| name | Yes | TEST Supplier Ltd | — | Rejected if a supplier with this exact name already exists |
| gstNumber | No | 32AABCS1234A1Z5 | Must match GSTIN format if supplied | — |
| paymentTerms | No | 30 days | — | — |
| category | No | Hardware | — | — |

### Items / Materials
| Field | Required | Example | Validation | Duplicate Rule |
|---|---|---|---|---|
| code | Yes | TEST-001 | — | Rejected if code exists |
| description | Yes | TEST Plywood 18mm | — | — |
| category | No | Panel | — | — |
| uom | Yes | sheet | — | — |
| standardCost | No | 2800 | Must be numeric if supplied | — |
| taxCode | No | GST18 | Must reference an existing tax code | — |
| hsnCode | No | 4412 | — | — |

### Service Labour Rates
| Field | Required | Example |
|---|---|---|
| technicianLevel | Yes | Senior |
| skill | No | Electrical |
| location | No | Kochi |
| normalHourRate / overtimeRate / emergencyRate / weekendHolidayRate / travelRate | No | numeric |
| sacCode | No | 998719 |

### Projects
| Field | Required | Example | Validation |
|---|---|---|---|
| name | Yes | TEST Project | — |
| budget | No | 500000 | Must be numeric if supplied |
| customerId | No | CUST-1 | Must reference an existing customer |
| branchId | No | BR-ULLIYERI | Must reference an existing branch |
| projectManagerId | No | U-PM1 | Must reference a real ProjectManager user |

### Cost Centres
| Field | Required | Example |
|---|---|---|
| id | Yes | FACTORY2 |
| name | Yes | Factory — Unit 2 |

### Banks
| Field | Required | Example |
|---|---|---|
| bankName | Yes | TEST Bank |
| accountName | Yes | TEST Account |
| accountNumberLast4 | No | 1234 |
| glAccount | No | 1000 |

### Payment Methods
| Field | Required | Example | Duplicate Rule |
|---|---|---|---|
| code | Yes | WALLET | Rejected if code exists (8 standard methods are pre-seeded) |
| name | Yes | Mobile Wallet | |
| category | No | Bank | |

### Tax Codes
| Field | Required | Example | Duplicate Rule |
|---|---|---|---|
| code | Yes | GST28 | Rejected if code exists |
| label | Yes | GST 28% | |
| cgstPct / sgstPct / igstPct | No | numeric | |

### Fixed Assets (bulk register — NOT capitalization)
| Field | Required | Example | Validation |
|---|---|---|---|
| assetName | Yes | TEST Machine | — |
| assetClass | No | Machinery | — |
| purchaseDate | Yes | 2026-01-01 | Must be YYYY-MM-DD |
| cost | Yes | 50000 | Must be numeric |
| location | No | Factory | — |
| custodian | No | Plant Manager | — |

Bulk-imported assets are registered as **Purchased**, not capitalized — useful life, depreciation method, and residual value must still be entered individually per asset at capitalization time (see `17_FIXED_ASSETS.md`), since these are accounting policy decisions this system will never assume on your behalf.

## Rollback
Because nothing is written until a row passes validation, there is nothing to "roll back" for a rejected row — it was never created. If you import a WHOLE batch of valid-but-wrong data (e.g., wrong customer names), the individual records must be corrected or deactivated through their own screens; there is no single "undo this import batch" button, by design — this matches how real accounting systems treat master data (a real customer record, once created, is corrected going forward, not silently deleted).
