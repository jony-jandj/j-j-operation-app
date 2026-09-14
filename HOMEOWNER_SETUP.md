# Install this update

1. Run the included `JJ_Homeowner_Portal_Setup.sql` in your Supabase SQL Editor, including if you ran a previous portal setup. It updates the existing portal functions and adds protected QR storage. It is safe to rerun. Existing projects, selections, P.O.s and active QR hashes remain intact.
2. Upload the ZIP contents to the same GitHub Pages app folder. Replace `index.html`, `homeowner.html`, and `service-worker.js` and `selections-metadata.js`; retain the included QR script, icons, manifest and logo. Upload extracted files, not the ZIP itself. SQL and Markdown files are setup/reference documents and do not need to be published.
3. Refresh the staff app. On a test job, open Selections → Homeowner QR Code. Saved QRs load automatically. Use Generate New QR only to create or explicitly replace a code. It asks before invalidating the previous code.
4. For an older code created before this update, scan that QR, copy its full homeowner URL, and paste it into Existing homeowner link → Keep Existing QR. This validates and saves the same token; printed QRs continue working. Previous versions stored only a hash, so the original link is required for this one-time recovery. Deactivated codes cannot be restored.
5. Verify the homeowner flow on a test selection: add a photo and product, edit details, toggle Selected twice, and confirm staff pricing remains unchanged. New homeowner products show Price not set until J&J enters pricing.

## Sync and pricing

Homeowner writes use the existing protected event queue. An open, signed-in staff app automatically imports pending changes for all jobs about every eight seconds while cloud status is Live/Saved and no selection editor, dialog, or input is active. Imported changes use the existing shared app_state record and its realtime subscription. Refresh Homeowner Updates remains available for the current job.

Homeowner pages refresh about every eight seconds while visible and outside the editor, and also offer manual refresh. If no staff app is open, homeowners still see their pending changes; those changes import into staff records when a staff app reconnects. A stale homeowner editor is rejected instead of overwriting a newer version.

Homeowners can view unit price, item total, and the existing tax setting. They cannot submit pricing, tax, or total fields, including with a modified request. Their edits preserve pricing, staff notes, lead times, quality and other staff-only fields. They can change Pending/Selected; approval and ordering status changes remain with staff. Quantity is editable, so the displayed total recalculates using the staff-set unit price.

Anyone holding a job’s private link can view its selections and pricing and edit allowed selection details. Other operations data and internal notes are excluded. The saved QR token lives in a protected staff-only table, never in shared app_state. No accounts are created.

## Verification

Passed local PostgreSQL-runtime tests for migration/rerun, event replay and shared-state import, price protection, photos, unpriced additions, stale edits, link persistence/replacement/revocation, older-link recovery and anonymous access boundaries. Passed simulated-cloud Chrome flow tests at phone, tablet and desktop widths, plus existing app logic regression checks for Job Costing, P.O. workflows, Hayden approval separation and Parent Groups.

These files have not been deployed and the SQL has not been run against your live Supabase project. Real account/realtime integration, existing production triggers, printing and physical iPad/Safari behavior still need a deployment smoke check. The existing whole-state cloud model can still have simultaneous staff-edit conflicts.
