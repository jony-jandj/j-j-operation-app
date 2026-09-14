# J&J Operations — Homeowner selections update

- Photo cards and a prominent + Add Selection button replace the long bottom form.
- Add/Edit popup supports product name, room, category, vendor, model/SKU, quantity, link, description/finish/color, photo upload or URL, purchased-by and current status.
- Selected toggles back to Pending on both homeowner and contractor cards. Nothing is deleted; no Unselected status was added.
- Homeowner pricing is visible and read-only, with unit price and tax-inclusive item totals. New homeowner products have no price until staff enters one. Database rules reject pricing changes.
- Automatic import of homeowner changes into the existing shared cloud records; homeowner pages automatically refresh staff changes. Editing pauses background refresh and stale edits are rejected.
- Project QRs are saved and reused. Only Generate New QR rotates a code. Existing older codes can be retained by restoring their original link; deactivation remains available.
- Based on the latest Job Costing build. Existing auth/cloud, Hayden Admin, P.O. approvals/payouts, Parent Groups, print routines, mobile styles, estimate import and Job Costing code retained.
- Service-worker version updated for delivery of the new app files.

**Installation:** Run the included SQL update and upload the extracted website files. See HOMEOWNER_SETUP.md.

**Validation:** Local database tests, simulated-cloud browser flows and app logic regressions passed. Live deployment/account/realtime verification remains pending.
