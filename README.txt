J&J Operations — Password Recovery Fix v3

Fixes the exact v2 error:
looksLikePasswordRecoveryUrl is not defined

The recovery helper functions are now included in the app before initCloud
and before the startup recovery check runs.

Upload/replace:
1. index.html
2. service-worker.js

Service worker cache bumped to v30.

After GitHub Pages updates:
- fully close the app/browser
- reopen
- request a NEW reset email
- use only the newest link
