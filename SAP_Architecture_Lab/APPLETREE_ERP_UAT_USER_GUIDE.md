# APPLETREE ERP — UAT USER GUIDE
*(UAT / Demo version. This environment is for testing only — see Part 57 of `APPLETREE_ERP_SOP.md`.)*

## What UAT means here

UAT = User Acceptance Testing. You are being asked to try the ERP yourself, using fake/demo data, and tell us honestly whether it works the way a real Apple Tree employee would expect. Nothing you do here touches real company money, customers, or records.

## How to get access

Depending on how you were given access:

- **A shared network address** (e.g. `http://192.168.x.x:4001`) — just open it in your browser.
- **An offline zip file** — extract it and double-click `Start ERP.bat`.

If you're not sure which, ask whoever sent you this guide.

## Logging in

Use one of the dedicated test accounts:

| Role | Username | Password |
|---|---|---|
| Admin | `uat_admin` | `Uat@Admin1` |
| CEO | `uat_ceo` | `Uat@Ceo123` |
| Finance Manager | `uat_finance` | `Uat@Fin123` |
| Accountant | `uat_accountant` | `Uat@Acc123` |
| Purchase | `uat_purchase` | `Uat@Pur123` |
| Site In-charge | `uat_site` | `Uat@Site123` |
| Store *(mapped to Purchase — see note below)* | `uat_store` | `Uat@Store123` |
| Project Manager | `uat_project` | `Uat@Proj123` |
| Factory *(mapped to Purchase — see note below)* | `uat_factory` | `Uat@Fact123` |
| Sales | `uat_sales` | `Uat@Sales123` |

**Note:** this ERP doesn't currently have separate "Store" or "Factory" login roles — those two test accounts use the Purchase role underneath, since that's what actually controls warehouse/GRN and factory screens today. This is disclosed, not hidden.

You'll see a red **"UAT / DEMO ENVIRONMENT"** banner at all times — that's confirmation you're in the right, safe place.

## See a working example first

Log in as `uat_admin`, go to **ADMIN → Users & Roles**, and click **Create Demo Scenario**. This builds one complete, real, connected example — a project all the way through a purchase, a controlled payment, and site material use — so you have something real to explore before creating your own test data.

## What to actually test

Work through the numbered files in `ACCOUNTANT_UAT_PACKAGE/`, starting with `01_UAT_GUIDE.md`. There are 117 real test scenarios across Finance, Procurement, Inventory, Site, Project, Job Work, Payment Controls, Security, and Reconciliation.

## Testing something that needs more than one person

Some real controls (like a payment needing three different people: maker, checker, executor) need you to act as more than one role. If you're testing alone, simply **log out and log back in** as a different `uat_*` user for each step — the system will still correctly refuse if you try to approve or execute your own request, proving the control is real even when one person is cycling through the roles.

## Result codes — use these, don't just write "it worked"

- **PASS** — did exactly what you expected.
- **FAIL** — did something wrong, crashed, or gave a wrong number.
- **CONFUSING** — worked, but you had to guess, or the wording was unclear.
- **BUSINESS POLICY REQUIRED** — the system correctly told you a real decision hasn't been made yet (this is not a bug).

## Reporting a problem

Use `ACCOUNTANT_UAT_PACKAGE/20_DEFECT_REPORT_TEMPLATE.md`. Be specific: what you did, what you expected, what actually happened.

## When you're finished

Fill in `ACCOUNTANT_UAT_PACKAGE/14_UAT_RESULT_TEMPLATE.md` for each test, and `ACCOUNTANT_UAT_PACKAGE/21_UAT_SIGNOFF.md` once for the whole session. Give both back to whoever is coordinating this UAT.

## Starting over

An Admin can click **Reset UAT Data** (Admin → Users & Roles) at any time to wipe test data and start clean. This has no effect on any real Apple Tree system — this environment has never had a connection to one.

## What NOT to do

- Don't enter any real Apple Tree customer, supplier, or financial data here.
- Don't use any of these passwords anywhere real.
- Don't assume anything you do here is a real transaction, no matter how complete it looks on screen.
