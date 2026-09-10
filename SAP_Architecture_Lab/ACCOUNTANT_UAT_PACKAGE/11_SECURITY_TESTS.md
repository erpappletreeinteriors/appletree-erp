# SECURITY / WHO-CAN-DO-WHAT TESTS

1. **Log in as a Sales user and try to post a journal entry or approve a purchase order.** It should refuse — that's not their job.
2. **Log in as a Purchase user and try to approve their OWN purchase order** (one they created themselves). Even a manager who's allowed to approve POs generally should NOT be able to approve one they personally created — someone else must approve it.
3. **Try to view or act on a project you are not assigned to** (as a Project Manager role) — it should be blocked.
4. **Try to post into a closed accounting period as a normal user.** It should be blocked. Only a specifically authorized role, with a written reason, should be able to.
5. **Deactivate a test customer**, then try to create a NEW invoice for them — it should be blocked. But check that their OLD invoices are still fully visible and unaffected.
6. **Ask "who created this, who approved it, and when?"** for any transaction — you should be able to find this out without help.
