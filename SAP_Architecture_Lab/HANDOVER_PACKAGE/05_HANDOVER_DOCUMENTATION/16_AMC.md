# 16 — AMC (Annual Maintenance Contracts)

## Lifecycle
Create Contract (customer, project, coverage, start/end dates, contract value, service frequency — all required, nothing defaulted) → Activate → Schedule visits → Bill → Recognize revenue monthly.

## Deferred Revenue (approved policy — Option B, Phase 13)
Billing an AMC contract does **not** immediately recognize the full amount as revenue. It is held as Deferred Revenue (a liability, account 2100) and recognized month-by-month as the contract period actually elapses, capped so you can never recognize more than what's been billed. **Billed**, **Recognized**, and **Deferred Balance** are always shown as three separate, real numbers — never one blended figure — because they are three genuinely different things.

## Cancellation — NOT YET IMPLEMENTED (management decision required)
Five real scenarios (cancel before any service, cancel after partial service, invoice raised but unpaid, revenue already recognized, customer already paid) each need a different accounting treatment that only Appletree management can decide. See `34_OPEN_MANAGEMENT_DECISIONS.md` for the full breakdown. Until decided, do not cancel an AMC contract expecting an automatic refund/reversal — handle it manually via a Journal Entry or Credit Note with the correct treatment for that specific scenario.

## Reconciliation
Contract → Billed → Recognized → Deferred → Collected are each independently traceable back to their source postings — proven in automated testing.
