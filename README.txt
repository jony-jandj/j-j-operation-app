J&J save request update — November 15, 2026

Status: locally tested; not deployed or verified against the live timeout.
Upload index.html and service-worker.js together to the existing repository root.
Do not upload any private backup JSON to GitHub.

Before reloading J&J, export a fresh backup from the app and keep it locally.
The previously verified backup contains 156 selection images.
After deployment, reload only after the backup export is complete, then use Save now.
Check the cloud photo count and saved status before considering the repair complete.
Do not clear browser storage or import a whole backup over newer cloud changes.

Changes:
- Save transaction returns only the saved version, not all photo data.
- Separate read-back verifies the exact saved version and all its contents.
- A retry recognizes an already-saved identical snapshot without another write.
- Write/verification client timeout is 45 seconds, allowing the existing 30-second database limit to respond. No server timeout, access policy, or approval rule is changed.
- Concurrent edits and failed verification remain pending.

Validation: eight simulated save scenarios and inline JavaScript syntax passed.
Local PostgreSQL benchmark: full-response save 773ms; version-only response 516ms.
That benchmark does not reproduce the production timeout and does not prove this update will resolve it.
