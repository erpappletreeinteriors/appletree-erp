# AEMS / ABP — UI Guidelines (Excel Client)

## 1. Pattern: MVVM-lite for UserForms

- **Model**: domain objects from the Business layer (e.g. `ExpenseRequest`).
- **View**: the UserForm itself — controls only, no logic beyond
  enable/disable/show/hide driven by state the ViewModel gives it.
- **ViewModel**: a thin class per UserForm that holds the current domain
  object(s), exposes display-ready properties/strings, and forwards commands
  (button clicks) to Application-layer use cases. Lives in `ui/excel-client`,
  not `modules/`.

UserForm code-behind may: read control values, call one ViewModel method,
refresh controls from the ViewModel's state. It may not: compute a total,
decide whether a transition is allowed, or format a business rule's error
message from scratch (the ViewModel/Application layer returns a ready message).

## 2. Brand tokens (from `Apple Tree_Brand Guideline.pdf`)

| Role | Name | Hex | RGB |
|---|---|---|---|
| Primary brand | Muted Gold | `#C3B152` | 195, 177, 81 |
| Neutral/muted | Olive Sprig | `#9D9A91` | 157, 154, 145 |
| Background | Pure White | `#FFFFFF` | — |
| Dark accent | Charcoal | `#1C1C1A` | 28, 28, 26 |

These are the same tokens already in use in the sibling web ERP project
(`--gold`, `--muted`, `--dark`, `--bg`) — reuse the exact hex values because
they come from the same official brand PDF, not because AEMS integrates with
that ERP (it doesn't — see [ARCHITECTURE.md](ARCHITECTURE.md) §4).

## 2b. Logo

Official mark, copied into `assets/branding/appletree_logo.png`: a gold
(`#C3B152`) stylized apple-tree icon above the uppercase wordmark "APPLE TREE"
in the same gold, with a smaller grey ("POWERED BY ⊙ STORIES") tagline lockup
underneath in a muted grey close to Olive Sprig.

- Use the full lockup (icon + wordmark + tagline) on entry/splash screens
  (e.g. a workbook cover sheet or the main ribbon "About" panel).
- Use the icon or wordmark alone in constrained spaces (title bar, small
  UserForm headers) — never stretch or recolor it outside the palette above.
- Always render on a plain white or very light background; the mark has no
  defined reversed/white version confirmed yet — **TBD**: get a
  reversed-for-dark-backgrounds version from the CEO if a dark-mode UserForm
  theme is ever built, don't fabricate one.
- Exact clear-space and minimum-size rules from `Apple Tree_Brand
  Guideline.pdf` could not be auto-extracted in this environment (no PDF
  renderer available) — **TBD**: pull precise numbers from the PDF manually
  before finalizing a workbook cover sheet or print/export template; until
  then, default to generous padding (at least the height of the tree icon on
  all sides) rather than guessing a tight number.

Typography: brand font is **Manrope**. Excel VBA UserForms cannot embed a
web font — they use fonts installed on the user's Windows machine. Two options,
neither decided yet:
1. Require Manrope to be installed locally (via a setup step) and set it as
   the UserForm font directly.
2. Fall back to a close-enough system font (Segoe UI) if Manrope isn't
   installed, and reserve exact Manrope rendering for any HTML/PDF output
   the system generates (e.g. exported expense reports).

Record the decision here once made — don't pick silently inside a feature task.

## 3. Constraints specific to Excel UserForms

- Standard VBA UserForms do not support arbitrary corner-radius, box-shadow,
  or CSS-style theming — treat the brand palette as flat fill/border/font
  colors, not a literal port of the ERP's CSS.
- Use the gold (`#C3B152`) for primary action buttons and active-state
  indicators only, per the "gold = primary action / active" convention
  already established in the ERP. Don't tint every control gold.
- Dark charcoal (`#1C1C1A`) is reserved for high-contrast text/headers, not
  large fill areas, unless a full dark-mode UserForm theme is explicitly
  requested.

## 4. What the UI must never do

- Never write directly to a `ListObject`/`Range` from a UserForm — always
  through the Application layer, which goes through a repository.
- Never contain a business validation rule that isn't also enforced in the
  domain layer (UI-side checks are a convenience for the user, not the
  authority).
