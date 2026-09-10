# ACCOUNTANT UAT GUIDE — Read This First

## What this is

This package lets a real Appletree accountant test the ERP using everyday language, not technical terms. You do not need to understand APIs, journals as a concept, or "subledgers" to use this — just do the tasks as if you were doing your normal job.

## What this is NOT

This is **not** a test of whether the screens open. It is a test of whether the numbers this system produces are ones you would trust with real company money.

## How to use this package

1. Log in with a demo/test account — see `19_TEST_CREDENTIALS.md` for the full list.
2. Ask an Admin to click **Create Demo Scenario** once (Admin → Users & Roles) so there's a real, connected example to look at before you start testing from scratch.
3. Work through the numbered test files in order (02 through 18).
4. For each task, do exactly what it says, then write down what actually happened.
5. Use the result codes below — don't just write "it worked."
6. When you're finished, fill in `21_UAT_SIGNOFF.md`.

## Result Codes

- **PASS** — it did exactly what you expected.
- **FAIL** — it did something wrong, or crashed, or gave a wrong number.
- **CONFUSING** — it worked, but you had to guess, or the wording didn't make sense, or you weren't sure if you did it right.
- **BUSINESS POLICY REQUIRED** — the system asked you a question about how Appletree actually wants to do something, and nobody has decided yet.

Don't skip **CONFUSING**. If you're not sure whether something is a real problem or just unfamiliar, mark it CONFUSING and explain why — that's exactly the kind of feedback this test needs.

## Important — please read

Everything in this test uses **fake/demo data only** (test customers, test suppliers, made-up amounts). Nothing you do here touches Appletree's real accounts, real customers, or real money. Feel free to try things, including things you think might break it — that's the point.

## When you're done

Fill in `14_UAT_RESULT_TEMPLATE.md` for every test you ran, `21_UAT_SIGNOFF.md` once for the whole session, and give both back to whoever asked you to do this UAT.
