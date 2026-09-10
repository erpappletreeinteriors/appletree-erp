# 12. Security Tests (All Roles)

## 12.1 Approve Your Own Work
Create a document, then try to approve or post it while still logged in as the same user. You should be blocked.

## 12.2 See Only What You Should
Log in as a Sales user and try to open Labour & Wages or Factory Dashboard — you should be denied, these aren't part of a Sales role.

## 12.3 Project Scope
Log in as a Project Manager not assigned to a particular project and try to view its costs. You should be denied.

## 12.4 Users & Roles / Chart of Accounts / Cost Centres
Log in as an Accountant and try to create a new user, a new GL account, or a new Cost Centre. You should be denied all three — these require Admin/CEO. You should still be able to VIEW the Chart of Accounts and Cost Centres, just not create new ones.

## 12.5 ID Tampering
Try referencing a completely made-up ID anywhere the system asks you to pick a customer, supplier, project, material, PO, or GRN (type it in manually if the field allows free text, or ask your project lead for a way to test this). It should always be rejected with a clear error, never silently accepted.

## 12.6 Closed Period
If a financial period has been closed for testing, try posting a transaction dated inside it. It should be blocked with a clear message.
