# TEST CREDENTIALS

All accounts below are dedicated UAT/demo test accounts, never real Appletree staff credentials.

| Role | Username | Password | Notes |
|---|---|---|---|
| Admin | `uat_admin` | `Uat@Admin1` | Full access, including Reset UAT Data and Create Demo Scenario |
| CEO | `uat_ceo` | `Uat@Ceo123` | Approves the Payment Approval Matrix, executes larger payments |
| Finance Manager | `uat_finance` | `Uat@Fin123` | Approves PRs, POs, MRS, payment requests; configures SOP settings |
| Accountant | `uat_accountant` | `Uat@Acc123` | Enters bills, receipts, journal vouchers |
| Purchase | `uat_purchase` | `Uat@Pur123` | Raises PRs/POs, records GRNs, dispatches job work |
| Site In-charge | `uat_site` | `Uat@Site123` | Raises MRS, records site receipts and consumption |
| Store | `uat_store` | `Uat@Store123` | Mapped to the Purchase role — this Lab has no separate Store role; warehouse/GRN operations are Purchase-gated |
| Project Manager | `uat_project` | `Uat@Proj123` | Pre-assigned to projects PRJ-1/2/3 |
| Factory | `uat_factory` | `Uat@Fact123` | Mapped to the Purchase role — this Lab has no separate Factory role; Factory/MES screens are Purchase/ProjectManager-gated |
| Sales | `uat_sales` | `Uat@Sales123` | Pre-assigned to customers CUST-1/2/3 |

A separate set of phase-numbered test users (`accountant1`, `purchase1`, `finance1`, `ceo`, `admin`, `site1`, etc. — see `server/domain.js`'s `SEED_USERS`) also exists and works identically; they're kept for the automated regression suite and can be used interchangeably if preferred.

**None of these passwords should ever be changed to match a real Appletree employee's real password.**
