J&J Operations PWA

This package is ready to host as a static web app.

Files:
- index.html — current J&J Operations prototype
- manifest.webmanifest — installable PWA configuration
- service-worker.js — offline/app-shell caching
- icons/ — app icons

Important current limitation:
This version still stores project data locally in each user's browser.
Jony, Adair, and Gio can all open/install the app, but their changes will NOT sync
with each other until the shared database + login phase is added.

Recommended next step:
Host this folder, then add authentication and a shared database while keeping the same URL.


Update 2026-09-03
- Immediate user selection for Jony, Adair, or Gio
- Jobs can be deleted from the project sidebar
- Estimate page uses Upload Estimate instead of sample estimate
- Supports .xls, .xlsx, and .csv estimate uploads
- Imported estimate lines are classified as Labor or Material
- Labor lines automatically create/update P.O. Splits
- P.O approval permissions remain Jony/Adair pre-approve, Gio approve

Note:
The current sign-in is still prototype identity selection, not password authentication.
Shared live data still requires the future database/login phase.
