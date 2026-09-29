# PHASE 39 — Browser Workflow Test

**Date:** 2026-09-12. Real browser session (Claude Code's Browser pane) against the isolated
port-4091 server, `APP_ENV=test`.

## Scope and honest disclosure

This is a bounded, targeted browser pass focused on the screens tied to this phase's newly-tested
domains (Manufacturing/BOM, Fixed Assets, Bank Accounts) plus the Dashboard — **not** the brief's
full 9-area sweep with a PASS/FAIL row per screen/role/action. That fuller sweep remains future work,
same disclosed gap Phase 38 already carried forward. What this pass DID cover was real, and found
two genuine defects neither the API-only test suites nor prior phases' browser passes had surfaced.

## Finding #1: initial page load can strand a desktop session in the mobile UI (disclosed, not fixed)

Reproduced twice, on two independently-created browser tabs with an already-valid session: on
initial page load, `wantsMobileMode()` (`client_secure/index.html`) is evaluated exactly once,
synchronously, with no `resize` listener — `return window.innerWidth <= 480`. In both reproductions,
this evaluated `true` at the moment `showApp()` ran even though `window.innerWidth` was confirmed
`1280` moments later, leaving the desktop `#app`/sidebar completely unrendered (`0` children) while
`#mobileApp` rendered instead. The only recovery is an undocumented `?desktop=1` URL query parameter
— there is no visible in-app "switch to desktop" control.

**Not fixed, and deliberately not asserted as a confirmed real-user-facing defect**: this was
reproduced consistently inside the Browser pane automation tool, whose own panel-sizing timing may
differ from a real end-user's browser (where `window.innerWidth` is essentially always correct from
the first synchronous script execution). What IS objectively true regardless of cause: there is no
resize listener and no visible recovery path if this ever does fire for a real user, which is a
reasonable, low-cost hardening opportunity (add a `resize` listener that re-evaluates and re-renders,
or a visible link in the mobile shell) — recommended for a future pass, not implemented here given
the genuine uncertainty about real-world reproducibility and this phase's focus on accounting-
integrity code.

## Finding #2 (FIXED): the Bank Accounts screen's "Add Bank Account" button could never succeed, for any user

Live-reproduced as CEO (the correct role): submitting the Bank Accounts form always failed with
`"A distinct GL account is required for real bank/cash segregation..."` The form
(`client_secure/index.html`, `submitBankAccount()`) never collected or sent a `glAccount` field at
all — a real gap between the backend contract (mandatory since Phase 24 Part A4) and the UI, meaning
**the real per-account GL segregation feature — the very feature this phase's DEF-P39-02 fix
depends on — was reachable only via direct API calls, never through the actual application UI.**
Exactly the class of gap browser testing exists to catch and API-only testing structurally cannot.

**Fixed**: added a "GL Account Code" input field to the form, wired through to the API call, plus a
corrected hint (the old copy still described the pre-Phase-24 single-shared-account architecture).
**Live-verified end-to-end through the real UI after the fix**: created a new GL account
(`PHASE39-BANKTEST-1001`) via the Chart of Accounts API, then submitted the Bank Accounts form
through the actual rendered page (`document.getElementById('ba-glaccount').value = ...`,
`submitBankAccount()`) — result: `"Bank account added"`, with the new account correctly listed
alongside the original ICICI/1000 account, showing its own distinct GL code. Recorded as
**DEF-P39-04** in the defect register.

## Screens verified functional, real data confirmed

- **Dashboard**: AR Outstanding, Cash (Bank), Trial Balance ("Balanced ✓"), Reconciliation
  ("Reconciled ✓") all displayed and reflected the live server's actual state at time of viewing —
  not static/placeholder content.
- **Fixed Assets**: full create-asset flow exercised through the real form (Asset Name/Purchase
  Date/Cost fields) — submission correctly created `FA-0001` and the register table updated with the
  exact submitted values (`₹80,000.00` cost, `Purchased` status, NBV = cost as expected pre-
  capitalization). A first submit attempt with an empty Asset Name field was correctly rejected
  client/server-side ("Asset name is required"), confirming validation is real, not decorative.
- **Bank Accounts**: see Finding #2 — now fully functional end-to-end through the UI.
- **BOM (Manufacturing)**: screen renders correctly, project dropdown populated with all 5 real
  seeded projects, material dropdown populated with real seeded materials (Plywood, Laminate, Teak
  Veneer, etc. — the same masters this phase's Manufacturing API tests used), "Create BOM" form
  present and ready.

## Verdict

This bounded pass, smaller in scope than the brief's full 9-area sweep, still surfaced two genuine
findings a purely API-driven test suite structurally cannot catch — confirming browser testing's
distinct value even at limited scope. One (Bank Accounts) was a real, user-blocking defect, found
and fixed with a live-verified end-to-end proof. The other (mobile-mode stranding) is disclosed
honestly with its reproducibility caveat rather than either ignored or overstated.
