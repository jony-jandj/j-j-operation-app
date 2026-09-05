J&J Operations — Password Recovery Fix v2

This is a more defensive reset-password fix.

Changes:
- Password reset mode opens immediately when the recovery link returns.
- Normal Sign In no longer covers the recovery screen during startup.
- Supabase CDN now has an automatic second-source fallback.
- Session-check/browser lock errors no longer kill the entire recovery flow.
- Save Password retries the cloud connection instead of doing nothing.
- Exact cloud error is displayed if another problem remains.
- Added Back to Sign In.
- Latest dashboard, device layouts, user roles, P.O workflow, and logo are preserved.
- Service worker cache bumped to v29.

GitHub:
Replace:
1. index.html
2. service-worker.js
Keep/upload jj-original-logo.png if it is not already in the repo.

After GitHub Pages finishes updating:
- close the J&J app/tab completely
- reopen it once
- request a NEW reset email
- use the newest email link
