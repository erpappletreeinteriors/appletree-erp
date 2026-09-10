# START HERE — Testing the Appletree ERP (UAT / Demo)

This is a **UAT/demo testing environment**. Nothing you do here touches real Appletree money, customers, or accounts.

## 1. Where to open it

Ask whoever gave you this document for the web address (URL) of the running test server. Open it in a normal web browser (Chrome, Edge, etc.).

## 2. Which username to use

Use one of the dedicated UAT accounts, matching your real job:

| Your Role | Username | Password |
|---|---|---|
| Administrator | `uat_admin` | `Uat@Admin1` |
| CEO / Director | `uat_ceo` | `Uat@Ceo123` |
| Finance Manager | `uat_finance` | `Uat@Fin123` |
| Accountant | `uat_accountant` | `Uat@Acc123` |
| Purchase | `uat_purchase` | `Uat@Pur123` |
| Site In-charge | `uat_site` | `Uat@Site123` |
| Store | `uat_store` | `Uat@Store123` |
| Project Manager | `uat_project` | `Uat@Proj123` |
| Factory | `uat_factory` | `Uat@Fact123` |
| Sales | `uat_sales` | `Uat@Sales123` |

(Full list also in `ACCOUNTANT_UAT_PACKAGE/19_TEST_CREDENTIALS.md`.)

## 3. Which password to use

See the table above. These are temporary test passwords — never your real Appletree login.

## 4. How to log in

Type the username and password, click **Log In**. You'll see a red banner reminding you this is a UAT/demo environment, and your name/role in the top-right.

## 5. How to choose a test scenario

Ask an Admin to click **Create Demo Scenario** (under Admin → Users & Roles) once — this gives you one complete, real, connected example (a project all the way through purchase, payment, and site material use) to look at first. Then open `ACCOUNTANT_UAT_PACKAGE/` and pick the numbered test file matching what you want to test (Finance, Procurement, Site Material, Job Work, etc.).

## 6. What result to expect

Each test tells you what should happen. If it does exactly that, write down **PASS**. If it does something else, crashes, or shows a wrong number, write down **FAIL** and describe exactly what happened.

## 7. How to report a problem

Fill in the defect report in `ACCOUNTANT_UAT_PACKAGE/20_DEFECT_REPORT_TEMPLATE.md` and send it to whoever is coordinating this UAT. Include what you did, what you expected, and what actually happened — a screenshot helps.

## 8. How to logout

Click **Log Out** (top-right of the screen) when you're done. Always log out if you're stepping away from a shared computer.

---

**Reminder:** if you ever create test data by mistake, an Admin can click **Reset UAT Data** (Admin → Users & Roles) to wipe everything back to a clean starting point — nothing is permanently broken by testing here.
