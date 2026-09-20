J&J P.O. approval fix — September 20, 2026

1. Upload index.html and service-worker.js from this folder to the existing GitHub repository, replacing those files. Keep all other existing app files.
2. In your existing Supabase project's SQL Editor, run JJ_PO_Approval_Update.sql once. This replaces the older two-step approval rule with the app's current one-step rule, preserving signed-in account role checks. Uploading SQL to GitHub does not run it.
3. Close and reopen the app on every phone, iPad, and computer so each uses the updated save logic.
4. Approve a P.O., wait for Saved, then refresh and verify it on another device.

Changes:
- An earlier pending save no longer acknowledges an approval made afterward.
- Cloud refreshes wait while local saves are pending.
- Overlapping updated clients use conditional saves and retry conflicts.
- Cloud failures show Not synced instead of falsely claiming Saved.
- Database update supports Approve and Undo Approval for existing authorized accounts and distinguishes identical P.O. IDs in different projects.

Built from the latest public main branch. Existing selections, homeowner features, Work & Pay, printing, and assets are included unchanged. No private backup data is included.
This package has not been deployed or tested against your live database. Older app versions can still overwrite data; refresh all devices.
