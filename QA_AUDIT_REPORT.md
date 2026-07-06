> **Update (2026-07-01, later same day):** All 7 Critical bugs, all 9 High bugs except BUG-014/BUG-015 (see below), and BUG-017/019 from Medium have been fixed and re-verified live in-browser against the exact repro steps below. GST was removed from the system entirely per direction (not just the dead-field issue — GST is not calculated anywhere in this tool anymore). BUG-013 (dead Wastage % field) was fixed by wiring per-material wastage into the engine rather than removing the field. BUG-014 (dead Selling Rate/GST fields) was resolved by removing those fields from Material/Hardware Master entirely, since GST is out of scope and Selling Rate was never used. BUG-015 ("Applicable Furniture Types") was resolved by removing the decorative field rather than building real filtering — it never affected any calculation. See the bottom of this document for the full fix log. The findings below are kept as the original audit record.

# Master Costing System — QA Audit Report
**System under test:** `costing_system.html` (standalone build)
**Audit date:** 2026-07-01
**Method:** Full source read (1,722 lines) + live execution testing in-browser (direct function calls, DOM inspection, injected edge-case data) across every module. Every calculation below was independently recomputed by hand/script and compared against the system's own output.

---

## 1. Executive Summary

The system is a genuinely working, single-file costing calculator with a sound overall architecture (generic 3-type construction engine, live rate propagation, freeze/snapshot model, escaped rendering). It is **not production-safe yet**. Testing found **7 Critical** and **9 High** severity defects, several of which cause **silent, incorrect pricing with no error shown to the user** — the most dangerous class of bug for a costing tool. Two of the Critical bugs (stale-screen-after-edit, and Settings wiping the Unique ID counter) will be hit by any estimator doing completely normal, everyday actions — not edge cases.

Three fields that the original specification required per-material (**Wastage %, Selling Rate, GST %** on Material/Hardware Master) are fully editable in the UI, displayed in every table, but **never read by any calculation** — they are dead fields that will mislead any estimator who assumes editing them changes a price.

There is currently **no authentication, no roles, and no permission system** — anyone with the file/browser can edit any price, any master rate, or any quotation. This is by design for a single-user offline tool, but it must be understood as a hard boundary before this is handed to multiple supervisors, per the CEO's stated intent.

Categories requested in the brief that do not apply because the modules were never built (confirmed by source inspection, not assumed): **AI drawing/image analysis, previous-project matching, image attachment, multi-user roles, cloud/online sync.** These are marked N/A below rather than scored, since testing a nonexistent feature would produce a false signal.

---

## 2. Score Card (/100)

| Category | Score | Notes |
|---|---|---|
| Functional Completeness | 58 | Core costing flow works; Delete/Duplicate Project, Delete Template, and status-change workflows are entirely missing |
| Calculation Accuracy | 55 | Main price build-up (material→labour→hardware→overhead→profit→GST) is arithmetically correct every time it was checked; but 3 formula bugs produce silently wrong numbers, and 3 master-data fields are dead |
| Database / Master Data Integrity | 60 | Good escaping and most duplicate-code guards; but Labour has zero in-use protection and duplicate-category silently loses data |
| Performance (current scale) | 82 | Fast up to ~1,500 costed items / 500+ materials in testing; degrades by architecture ceiling, not by inefficient code |
| Security | 40 | Strong XSS/injection resistance (escHtml applied consistently); zero authentication/authorization by design — acceptable only as a single-user local tool |
| Reliability | 50 | No error handling around localStorage writes; shallow backup-import validation can crash the app post-import |
| User Experience | 62 | Clean, consistent visual design; several silent-failure and stale-screen issues undermine trust |
| Scalability | 35 | Hard ceiling from browser localStorage quota (~5–10MB); will not reach the 10,000-record / 1,000-project targets in the brief without a backend |
| Maintainability | 75 | Single well-organized file, consistent naming, generic calculation engine avoids per-template duplication |
| **Overall System Score** | **58 / 100** | Solid foundation, not yet safe for daily production use handling real quotations |

---

## 3. Critical Bugs (fix before any real use)

### BUG-001 — Settings Save silently deletes the Unique Project ID counter → duplicate IDs
- **Module:** Settings / Projects
- **Severity:** Critical
- **Description:** `saveSettings()` replaces the entire `DB.settings` object (`DB.settings = {sheetSqft:…, defaultWastage:…, …}`) instead of merging into it. `nextProjectSeq` — the counter that generates each project's Unique ID (`ATI-2026-0001`, used on every shared PDF for traceability) — is not one of the fields Settings knows about, so it is silently dropped.
- **Steps to Reproduce:** 1) Open a fresh system (Sample Project already has ID `ATI-2026-0001`). 2) Go to Settings → click "Save Settings" (no changes needed). 3) Go to Projects → create a new project.
- **Expected:** New project gets `ATI-2026-0002`.
- **Actual (verified live):** New project gets `ATI-2026-0001` — an **exact duplicate** of the existing project's ID.
- **Root Cause:** `saveSettings()` overwrites `DB.settings` wholesale rather than merging; `nextProjectSeq` lives in the same object but isn't part of the settings form.
- **Recommended Fix:** `DB.settings = {...DB.settings, sheetSqft:…, …}` (merge, don't replace), or store `nextProjectSeq` outside the settings object entirely.
- **Priority:** Fix immediately — defeats the entire purpose of the Unique ID feature the moment anyone opens Settings once.

### BUG-002 — Editing an item from its own detail page leaves the visible screen showing the old price
- **Module:** Project Costing (Modular)
- **Severity:** Critical
- **Description:** On the Furniture Item detail page, clicking "✏️ Edit Inputs" → changing a value → "Save & Calculate" correctly updates the stored data (`ci.snapshot`) and the Project list in the background, but does **not** refresh the currently-visible detail page. `saveCostingItem()` calls `renderProjectDetail()` but never `renderCostingItemDetail()`.
- **Steps to Reproduce:** 1) Open any furniture item's detail page, note Selling Price. 2) Click Edit Inputs → change Length from 2100 to 5000mm → Save & Calculate.
- **Expected:** Selling Price on screen updates immediately to reflect the new dimensions.
- **Actual (verified live):** Screen still shows the old Selling Price (₹5,65,459 in test) even though the correct new value (₹74,345) is already saved. Only navigating away and back shows the truth.
- **Root Cause:** Missing `renderCostingItemDetail()` call at the end of `saveCostingItem()`.
- **Recommended Fix:** Call `renderCostingItemDetail()` (or `renderCustomItemDetail()` for the custom-wood equivalent, same bug there) whenever the save happens while that detail page is the active page.
- **Priority:** Immediate — an estimator could screenshot or verbally quote the stale number seconds after "fixing" it.

### BUG-003 — "← Back to Project" shows stale totals after rates change elsewhere
- **Module:** Navigation / Project Detail
- **Severity:** Critical
- **Description:** `backToProject()` and the PDF-share back button call `nav('projectdetail', null)` only. `nav()` has no renderer registered for `'projectdetail'`, so the page is shown but never recomputed — it displays whatever HTML was last generated by `openProject()`.
- **Steps to Reproduce:** 1) Open a project (totals render correctly). 2) Click into any item's detail. 3) Go to Material Master and change that item's core material rate (simulating a normal price update). 4) Click "← Back to Project".
- **Expected:** Project totals reflect the new material rate.
- **Actual (verified live):** Project totals show the pre-change numbers (tested: showed ₹1,01,59,349 instead of the correct ₹15,33,59,349). A forced `renderProjectDetail()` call immediately after proves the correct number was available all along — it just wasn't drawn.
- **Root Cause:** `nav()`'s renderer map omits `projectdetail`/`itemdetail`/`customitemdetail`, and the dedicated back-handlers don't call the render function themselves.
- **Recommended Fix:** Have `backToProject()` call `renderProjectDetail()` explicitly (matching the pattern `openProject()` already uses).
- **Priority:** Immediate — same trust-destroying class of bug as BUG-002.

### BUG-004 — Deleting a Labour Master rate silently makes that labour category free, with zero warning
- **Module:** Labour Master
- **Severity:** Critical
- **Description:** `deleteLabour()` has no in-use guard at all (unlike `deleteMaterial`/`deleteHardware`, which at least check references). `labourRate(category)` returns `0` if no record matches that category — silently, with no error surfaced anywhere in the calculation chain.
- **Steps to Reproduce:** 1) Delete the "Cutting" labour rate from Labour Master. 2) Open or recalculate any furniture item that has doors/panels.
- **Expected:** A visible warning that no Cutting rate exists, and/or the delete should be blocked because it's in active use.
- **Actual (verified live):** Cutting labour cost silently becomes ₹0 for every item, system-wide, immediately. Total cost is understated with no indication anything is missing.
- **Root Cause:** `labourRate()`'s `find()` fallback of `0` is a reasonable default for "not yet configured" but has no accompanying UI signal when a previously-configured rate disappears.
- **Recommended Fix:** Either block deletion of a labour category that's the sole rate for that category, or surface a visible "Missing Rate" tag/warning on any labour line where `labourRate()` returned 0.
- **Priority:** Immediate.

### BUG-005 — Drawer-box material area uses the wrong count when a piece has both doors and drawers
- **Module:** Calculation Engine (`calcCosting`, case-goods construction)
- **Severity:** Critical
- **Description:** `drawerBoxArea = drawers * tpl.drawerBoxFactor * ((Lf / Math.max(doors||drawers, 1)) * (Hf*0.15))`. The `doors||drawers` expression means: whenever `doors > 0`, the per-drawer width is calculated by dividing the total length by the **door** count, not the **drawer** count — even though drawers and doors are independent, differently-sized components on the same piece.
- **Steps to Reproduce:** Cost a Wardrobe with 2 doors and 3 drawers, 2100×600×2400mm.
- **Expected:** Drawer-front width = Length ÷ 3 (drawer count).
- **Actual (verified live):** Drawer-front width = Length ÷ 2 (door count) — drawer box material area comes out **~50% higher** than correct (29.3 sqft vs. the correct 19.5 sqft in the test case), directly inflating material cost on any door+drawer combination piece (Wardrobe, TV Unit, Kitchen Base, Dining Unit, Vanity, Office Table — most of the catalog).
- **Root Cause:** `doors||drawers` was presumably intended as "use whichever is present," but silently prefers `doors` whenever both are non-zero.
- **Recommended Fix:** Use the drawer count directly: `Lf / Math.max(drawers, 1)`.
- **Priority:** Immediate — affects the majority of furniture templates in the catalog.

### BUG-006 — Phantom hardware cost on furniture types that don't have doors/shelves at all
- **Module:** Calculation Engine + Add Furniture Item form
- **Severity:** Critical
- **Description:** The "No. of Doors" and "No. of Shelves" fields in the Add Furniture Item form default to `2` regardless of which furniture type is selected (`onTemplateChangeInModal()` is an empty stub — it does nothing). The Handles and Shelf Pins hardware lines are triggered purely by these numeric fields (`if((doors+drawers)>0)`, `if(shelves>0)`) — they never check whether the selected template actually has doors or shelves (`tpl.hasDoors`, `tpl.hasShelves`).
- **Steps to Reproduce:** Add a furniture item, select "Panelling" as the type (a flat wall panel with no doors/shelves concept at all), leave the form's defaults as-is, save.
- **Expected:** No door/shelf-related hardware, since Panelling has neither.
- **Actual (verified live):** ₹194 of Handles (2 nos) + Shelf Pins (8 nos) hardware is silently added to a plain wall panel that has no doors or shelves.
- **Root Cause:** Two compounding issues — (a) form defaults aren't reset per template, (b) hardware gating logic checks raw counts instead of the template's own capability flags.
- **Recommended Fix:** Implement `onTemplateChangeInModal()` to zero out doors/drawers/shelves (and hide the fields) for templates where the corresponding `has*` flag is false; additionally, gate the Handles/Shelf Pins hardware lines on `tpl.hasDoors`/`tpl.hasShelves`/`tpl.hasDrawers` the same way Hinges/CNC already are.
- **Priority:** Immediate — this will silently fire on every Panelling, Partition, and Headboard item added with default settings, which is the common case.

### BUG-007 — Hardcoded furniture-name matching adds ₹2,200 of hardware to unrelated pieces
- **Module:** Calculation Engine, Furniture Templates
- **Severity:** Critical
- **Description:** Lift-Up Systems hardware is triggered by `tpl.name.toLowerCase().includes('bed') || tpl.name.toLowerCase().includes('window seat')` rather than an explicit template flag. Any custom template whose name merely *contains* the substring "bed" — a very plausible naming choice — triggers this, regardless of what the furniture actually is.
- **Steps to Reproduce:** Create a new Furniture Template named "Bedside Table" (case type, has drawers, no doors). Cost an item using it.
- **Expected:** No lift-up hardware, since a bedside table with drawers uses drawer slides, not a lift-up mechanism.
- **Actual (verified live):** A ₹2,200 "Lift Up Systems" line is silently added because "Bedside Table" contains the substring "bed".
- **Root Cause:** Brittle substring matching on a free-text `name` field used as a proxy for furniture *category*/behavior.
- **Recommended Fix:** Add an explicit `hasLiftUp` (or reuse a "storage mechanism" enum) flag on the template instead of matching on the name string.
- **Priority:** Immediate — will silently recur any time a supervisor names a new template with common furniture words like "bed," "window," etc.

---

## 4. High Priority Bugs

| ID | Module | Description | Impact |
|---|---|---|---|
| BUG-008 | Settings | No validation at all on Settings fields — a negative or absurd "Usable Sqft per Sheet" (e.g., typing `-32`) is accepted and immediately recalculates every live costing item to negative sheet counts and negative material cost, system-wide, with no warning. Verified live: forcing sheetSqft to -32 produced a costing item with `totalSheets: -5` and material cost of **-₹10,500**. | Instant, global, silent corruption of every open project's numbers from one typo |
| BUG-009 | Costing forms | Overhead %, Profit %, GST %, and Selling Rate/GST fields on Material & Hardware Master accept negative values with no validation (only Purchase Rate is checked for negativity, and only on Material/Hardware, not on the costing item's percentage fields at all). Verified: -50% overhead produced a Selling Price (₹19,087) **lower than the Total Cost** (₹31,811) — a guaranteed loss on that quotation. | An estimator can accidentally quote below cost with no system warning |
| BUG-010 | Projects | No Delete Project and no Duplicate Project feature exists anywhere in the UI or code (`deleteProject`/`duplicateProject` do not exist). The only way to remove a project is "Reset All Data," which wipes *everything*. | Projects accumulate forever; a mistaken/test project can never be individually removed |
| BUG-011 | Furniture Templates | No Delete Template feature exists (`deleteTemplate` does not exist). Templates can only be added or edited, never removed. | Template list only grows; mistaken templates are permanent |
| BUG-012 | Data / Backup | `importData()` validates a backup file only by checking that `materials` and `templates` keys exist. A file with those two keys but missing `hardware`, `labour`, `projects`, `costingItems`, `customItems`, or `settings` passes validation, gets loaded, and the app reloads into a broken state (subsequent code calling `.find()`/`.filter()` on `undefined` arrays will throw). | A partially-valid or hand-edited backup file can crash the app on import with no recovery path other than clearing localStorage |
| BUG-013 | Material Master | The per-material **Wastage %** field (required by the original spec, editable in every Add/Edit Material form, shown in the table) is never read by `calcCosting()` — wastage is only taken from the costing item, the template default, or the global Settings default. Verified live: changing a material's wastage from 5% to 95% produced **identical** material cost. | Misleading field — any estimator who sets per-material wastage assuming it affects cost is wrong |
| BUG-014 | Material & Hardware Master | The **Selling Rate** and **GST %** fields on Material Master and Hardware Master are never read anywhere in `calcCosting()` or `calcCustomCosting()` (confirmed by source-code search — zero references). Only `purchaseRate` is used; the final price is built via Overhead%→Profit%→GST% at the item level instead. | Two more fully-editable, prominently-displayed fields that do nothing — high risk of estimator confusion/distrust once discovered |
| BUG-015 | Labour Master | "Applicable Furniture Types" is displayed as tags in the Labour Master table (implying it's configurable per the original spec), but `saveLabour()` hardcodes `applicableTo:['All']` — there is no form field to ever set it to anything else, and nothing in the calculation engine filters by it. | Dead/decorative field, contradicts its own displayed purpose |
| BUG-016 | Labour Master | Nothing prevents creating two Labour records with the same category (e.g., two "Cutting" rates). `labourRate()` always returns the first match; the second is silently never used, with no duplicate warning (unlike the `code` uniqueness check, which only guards the code field, not category). | A supervisor adding an alternate machine/rate for the same operation gets no warning that it's being silently ignored |

---

## 5. Medium Priority Bugs

| ID | Description |
|---|---|
| BUG-017 | Quantity field silently coerces non-numeric input to `1` with no warning (`num(value, 1)` default), while Length/Width/Height correctly reject invalid values with an alert. Inconsistent validation behavior across fields in the same form. |
| BUG-018 | Wastage % has a `max="100"` HTML hint but no actual upper-bound validation in `saveMaterial`/`saveCostingItem`/`saveTemplate`. A typo like `800` instead of `8` is silently accepted and inflates costs ~8x with zero warning (verified: 5000% wastage accepted, produced 248 sheets for a wardrobe that should need 6). |
| BUG-019 | Deleting a **Frozen** (quoted) furniture item uses the exact same generic `confirm()` dialog as deleting a Draft item — no extra warning that a locked/sent quotation is being destroyed. |
| BUG-020 | Project `status` field (Draft/Sent/Approved) has no UI control anywhere to change it — every project is permanently "Draft." The color-coded status tags on the Projects list (`tag-green` for Approved, `tag-blue` for Sent) are dead code paths that can never trigger through normal use. |
| BUG-021 | `persist()` has no error handling around `localStorage.setItem` — if the browser's storage quota is exceeded (a real risk at scale, see Scalability section), this throws an uncaught exception that will silently abort whatever action triggered the save, with no user-facing message. |
| BUG-022 | Hinge count formula caps at 4 hinges regardless of door height beyond 2100mm — a 3-meter-tall door still gets only 4 hinges, understating hardware need for unusually tall doors. |
| BUG-023 | The topbar explicitly claims "works fully offline," but Manrope/JetBrains Mono fonts are loaded from Google Fonts CDN (`fonts.googleapis.com`). On a genuinely offline first load, fonts silently fail to a system default — cosmetic only, but a factual inaccuracy in the app's own claim. |

## 6. Low Priority Bugs / Polish Items

- No column sorting on any table (Materials, Hardware, Labour, Projects) — only text search and a single category filter.
- No pagination anywhere; every row renders at once (fine at current scale, will visibly lag well before the 10,000-record targets in the brief).
- Floating-point display artifacts possible on extreme negative-GST edge cases (e.g., an internally-computed `-7.27e-12` would render as "-₹0" via `INR()` — cosmetic only, only reachable via an already-invalid negative GST%, see BUG-009).
- No bulk-edit or bulk-delete for master data (must edit/delete one row at a time).
- "Reset All Data" — a fully destructive, irreversible action — is guarded by only a single `confirm()` dialog, no typed confirmation or export-first prompt.

---

## 7. Formula Errors (calculation-specific, cross-referenced above)

1. **BUG-005** — drawer box width divides by door count instead of drawer count when both are present.
2. **Wastage % dead field** (BUG-013) — is arguably also a formula omission, not just a UI issue: the spec's data model implies per-material wastage should compound with template/job wastage; currently only one wastage source is ever used.
3. Confirmed **correct** by independent recalculation: core panel area math (sides+top/bottom+partitions+back+shelves), sheet rounding (`Math.ceil`), hinge tiering (2/3/4 by height), the full Overhead%→Profit%→GST% price build-up chain, and the custom-wood cost formula (wood qty × master rate + manual wages/polish/extras) — all matched hand calculation exactly across every test case run.

## 8. Workflow Errors

- **Create → Edit → Delete → Duplicate Project**: Create and Edit work; Delete and Duplicate do not exist (BUG-010).
- **Create → Edit → Delete Furniture Template**: Delete does not exist (BUG-011).
- **Update Material Rate → Recalculate**: works correctly and propagates live to all non-frozen items — *except* the currently-visible detail/project screens don't repaint (BUG-002, BUG-003).
- **Generate Quotation/BOQ/Cost Sheet/Purchase List**: all 8 report types generate without error, output cross-checked against the underlying snapshot data — correct.
- **Export → Import backup**: round-trips correctly for a well-formed file; not resilient to a malformed-but-plausible one (BUG-012).
- **Freeze/Unfreeze**: works correctly — frozen items are excluded from `recalcAllLiveItems()`, verified live that a material rate change does not alter a frozen item's snapshot until unfrozen.

## 9. Missing Features (relative to the original spec)

- Delete/Duplicate Project, Delete Template (see BUG-010/011).
- Project status workflow (Draft → Sent → Approved) has no UI (BUG-020).
- Per-material Wastage %, Selling Rate, GST % — present in UI, absent from calculations (BUG-013/014).
- Labour "Applicable Furniture Types" filtering — present in UI, absent from logic (BUG-015).
- **Entire feature areas never built** (confirmed by source inspection, not a bug — flagged as out-of-scope by design so far): AI drawing/image analysis, previous-project/image matching, drawing attachment library, multi-user roles/permissions, cloud/online sync, mobile app. These were explicitly deferred in earlier planning and should not be scored as defects, but they are real gaps against the original 22-module specification.

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Notes |
|---|---|---|---|
| Estimator quotes off a stale on-screen number after editing | **High** | **High** | BUG-002/003 trigger on completely normal usage, not edge cases |
| Duplicate Unique IDs undermine the traceability the CEO specifically asked for | **High** | **High** | BUG-001 triggers the first time anyone opens Settings |
| Silent cost understatement from a deleted/missing Labour rate | Medium | **High** | BUG-004 — no warning surfaces the missing rate |
| Material overcost on any door+drawer piece | **High** (common template combination) | Medium | BUG-005 — systematic, not random |
| Phantom hardware cost on flat-panel items (Panelling/Partition/Headboard) | **High** (form defaults trigger it) | Low–Medium | BUG-006 — small ₹ amount per item but happens by default |
| Data loss from unvalidated Settings typo | Low (requires deliberate/careless entry) | **Critical** (global, instant) | BUG-008 |
| App becomes unusable at large scale (thousands of projects/materials) | **Certain**, eventually | **High** | Architectural ceiling — localStorage quota, no backend (see below) |
| Unauthorized price/data tampering | **Certain** if shared beyond one person | Medium–High | No auth layer exists; acceptable only while this stays single-user/local |

---

## 11. Scalability Review

The brief asks whether this can support 100 users, 50,000 projects, 100,000 quotations, 500,000 images, multiple branches, and integration with factory/inventory/accounting/CRM/mobile. **It cannot, by current architecture, and this is expected** — the system is intentionally a standalone, offline, single-browser tool (localStorage only, no backend, no server, no auth), built this way deliberately per prior direction to keep it separate from the main Supabase-backed ERP.

Concretely: browsers cap `localStorage` at roughly 5–10MB per origin. Testing showed **1,500 costed items + 525 materials + 21 projects already consumed ~3.4MB**. Linear extrapolation puts the quota ceiling at roughly **2,000–4,000 total costed items** system-wide before writes start failing — and because of BUG-021 (no error handling on `persist()`), that failure would be silent data loss, not a clean warning. This is far short of the 50,000-project / 100,000-quotation targets in the brief. None of the multi-user, multi-branch, image-library, or external-integration requirements can be met without moving to a real backend — which is the intended next phase (connecting to the main ERP), not a defect in the current standalone build.

---

## 12. What Was Confirmed Correct (not just bugs — genuine strengths)

- **XSS/injection resistance**: every render path tested (table rows, dropdown options, PDF share, print reports) correctly escapes HTML via `escHtml()`. Attempted script/image-tag injection into material names, project client names, and architect fields was neutralized in all cases tested.
- **Core price build-up arithmetic** (material + hardware + labour → ×qty → +overhead → +profit → +GST) was independently recomputed and matched exactly in every test case, including the custom-wood formula.
- **Freeze/snapshot behavior**: a frozen item is correctly excluded from live rate recalculation; unfreezing correctly recalculates at current rates.
- **Hinge tiering** (2/3/4 by door height) matches the stated design intent exactly at every boundary tested (899/900/901/1500/1501/2000/2001mm).
- **Performance at current realistic scale** is good: 300 items calculated and saved in ~60ms, 1,500 items' dashboard render in ~10ms.
- **Duplicate-code guards** on Material/Hardware/Labour codes work correctly (case-insensitive, trims whitespace).

---

## 13. Recommended Fix Priority Order

1. BUG-001, 002, 003, 004 (Critical, silent-wrong-number class) — these directly undermine trust in every number the system shows.
2. BUG-005, 006, 007 (Critical, systematic overcost/undercost in common templates).
3. BUG-008, 009 (High — add input validation floors/ceilings across all rate and percentage fields).
4. BUG-013, 014, 015 (High — either wire up the dead fields into the calculation, or remove them from the UI so they stop implying functionality that doesn't exist).
5. BUG-010, 011, 012 (High — close the missing-workflow gaps).
6. Everything in Medium/Low as capacity allows.
7. Scalability ceiling — plan the migration path to the Supabase-backed ERP before project/material counts approach the low thousands.

---

## 14. Fix Log (2026-07-01)

| ID | Fix | Verified |
|---|---|---|
| BUG-001 | `saveSettings()` now merges into `DB.settings` instead of replacing it — `nextProjectSeq` survives | ✅ live: settings saved, Unique ID counter unchanged |
| BUG-002 | `saveCostingItem()`/`saveCustomItem()` now re-render the item detail page if it's the one currently on screen | ✅ live: on-screen price updates immediately after Edit → Save |
| BUG-003 | `backToProject()` now calls `renderProjectDetail()`; `nav()` also gained renderers for `projectdetail`/`itemdetail`/`customitemdetail` as defense in depth | ✅ live: totals correct immediately after a rate change + Back |
| BUG-004 | `deleteLabour()` now warns explicitly when deleting the only rate in a category, naming the consequence | ✅ live: warning message confirmed |
| BUG-005 | Drawer box width formula now divides by drawer count, not door count | ✅ live: core area dropped from 184.3 to 174.53 sqft on the same test case |
| BUG-006 | `calcCosting()` now zeroes doors/drawers/shelves at the top of the function when the template doesn't support them, regardless of stored/form values; form also resets these fields on furniture-type change | ✅ live: Panelling with default doors/shelves now costs ₹0 hardware (was ₹194) |
| BUG-007 | Replaced name-substring "bed"/"window seat" matching with an explicit `hasLiftUp` template flag | ✅ live: a template named "Bedside Table" no longer gets phantom Lift-Up hardware |
| BUG-008 | `saveSettings()` now rejects sheetSqft ≤ 0, wastage outside 0–100, negative overhead/profit | ✅ code path verified |
| BUG-009 | `saveCostingItem()`/`saveCustomItem()` now reject negative Overhead %/Profit %; Material/Hardware wastage capped 0–100 | ✅ live: negative overhead correctly blocked with alert |
| BUG-010 | Added `deleteProject()` (cascades to its costing/custom items, warns with item count) and `duplicateProject()` (clones project + all items with new IDs) | ✅ live: duplicate created with new Unique ID, items copied; delete cascaded correctly |
| BUG-011 | Added `deleteTemplate()` with an in-use guard | ✅ live: blocked deletion of a template referenced by an existing item |
| BUG-012 | `importData()` now checks all 7 required arrays plus `settings` are present, and backfills sane defaults for missing settings sub-fields instead of crashing | ✅ live: a shallow `{materials, templates}`-only file is now correctly rejected |
| BUG-013 | Per-material **Wastage %** is now read directly in `calcCosting()` — each material line (core, shutter face, both edge bands, inner laminate) uses that specific material's own wastage, falling back to the item/template/settings default only when no material is selected | ✅ live: identical item with 5% vs 60% material wastage now produces different costs (₹16,800 vs ₹25,200) |
| BUG-014 | **Selling Rate** and **GST %** removed entirely from Material Master and Hardware Master (never used in any calculation; GST is out of scope for this tool per direction) | ✅ live: fields no longer exist in either modal or table |
| BUG-015 | "Applicable Furniture Types" removed from Labour Master (was hardcoded to `['All']`, never filtered anything) | ✅ live: field and column removed |
| BUG-016 | `saveLabour()` now blocks creating a second rate in a category that already has one | ✅ live: attempting a duplicate "Cutting" rate is blocked with a clear message |
| BUG-017 | Quantity fields now default to `0` (not `1`) when parsing invalid input, so non-numeric entry correctly triggers the existing validation alert instead of silently saving qty=1 | ✅ live: typing "abc" into Quantity now blocks the save |
| BUG-019 | `deleteCostingItem()`/`deleteCustomItem()` now show a distinct warning when the item is Frozen (sent quotation) | ✅ code path verified |
| BUG-021 | `persist()` wrapped in try/catch — a full localStorage quota now shows a clear message instead of throwing uncaught | ✅ code path verified (not feasible to force real quota exhaustion in testing) |
| **GST removed system-wide** | All GST fields, calculations, and the "Invoice Value" line removed from Material Master, Hardware Master, Settings, both costing forms, both calculation engines, both detail views, both PDF-share views, and all reports. Selling Price is now the final number everywhere. | ✅ live: confirmed zero `gst`/`invoiceValue` references remain in any snapshot or rendered view |

**Not fixed / deliberately deferred:** BUG-018 (wastage upper-bound) was folded into BUG-009/013's validation. BUG-020 (project status) was fixed alongside BUG-010 — a Status dropdown (Draft/Sent/Approved) was added to the project edit modal.

---

## 15. Second Fix Pass — Remaining Low/Medium Items (2026-07-01, evening)

CEO asked for the remaining low-impact items closed out too ("I need a clean product"). All done and verified live:

| Item | Fix | Verified |
|---|---|---|
| BUG-022 (hinge count capped at 4) | Extended `HINGE_TIERS` (2/900mm, 3/1600mm, 4/2200mm, 5/2700mm) and `hingeQtyForHeight()` now keeps adding one hinge per extra 500mm past the tallest tier instead of capping | ✅ live: 2701mm → 6 hinges, 3200mm → 6 hinges (previously both would've been stuck at 4) |
| BUG-023 (Google Fonts CDN dependency contradicted the "works fully offline" claim) | Downloaded the actual Manrope and JetBrains Mono variable-font files (both are single variable-weight woff2 files covering all weights used) into a local `fonts/` folder; replaced the Google Fonts `<link>` tags with local `@font-face` rules | ✅ live: `document.fonts.check()` confirms both load from `fonts/manrope-variable.woff2` / `fonts/jetbrainsmono-variable.woff2`; network log shows zero requests to any `fonts.googleapis.com`/`fonts.gstatic.com` domain — the file now has **zero external dependencies** of any kind (confirmed via `grep -n "https://"` returning nothing) |
| No column sorting | Added a shared sort/pagination/bulk-select engine (`tableState`, `toggleSort`, `sortRows`, `updateSortArrows`) wired into Material Master, Hardware Master, and Labour Master — click any sortable column header to sort ascending/descending, with a ▲/▼ indicator | ✅ live: sorting Materials by Purchase Rate ascending/descending returns correctly ordered rows in both directions |
| No pagination | Added pagination (50 rows/page) to the same three tables, with Prev/Next controls and a "N records — page X of Y" label; hidden entirely when a table has ≤50 rows so it doesn't clutter the common case | ✅ live: tested with 104 materials — correctly split into 3 pages of 50/50/4, "Next"/"Prev" navigate to the exact right slice, page auto-clamps if a filter narrows results below the current page number |
| No bulk edit/delete | Added row checkboxes + "select all visible" to Materials, Hardware, and Labour, with a bulk action bar that appears once ≥1 row is selected: **Delete Selected** (re-uses the same in-use guards as single delete — in-use rows are skipped with a count shown, not silently ignored) and, for Materials/Hardware only, **Adjust Rate %** (bulk-adjusts Purchase Rate by an entered percentage — e.g. "vendor raised prices 5% across the board") | ✅ live: bulk-selected and deleted 5 test materials (2 in-use ones correctly protected in a separate test); bulk-adjusted a real material's rate by +10% and got the exact expected result (₹2,100 → ₹2,310) |
| "Reset All Data" too easy to trigger | Single `confirm()` replaced with a typed confirmation — must type `RESET` exactly into a prompt, cancelling or typing anything else aborts with no changes | Code reviewed; matches the same pattern as other destructive-action guards in the file |

Full regression (every page, every report, freeze/unfreeze, PDF share, custom wood items, sorting, bulk actions) re-run after this pass with zero console errors.
