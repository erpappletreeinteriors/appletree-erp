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

These are the same tokens already in use in the web ERP
(`--gold`, `--muted`, `--dark`, `--bg` — see the sibling project's brand
guidelines). Reuse the exact hex values so AEMS and the ERP look like one
family, even before they're technically merged.

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
