# Selection alternatives

- Added “Another option” to each contractor selection. Alternative products stay grouped under the original selection while remaining separate cards.
- Homeowner view shows grouped alternatives and their individual status, price, photo and details.
- Option group metadata is preserved through the homeowner portal sync.

# Selection layout and buyer permissions

- Kept each selection as a separate card or list row; category folder grouping was removed per request.
- Homeowner price display remains tax-inclusive and omits tax details.
- Removed homeowner Purchased by selector; buyer assignment is staff-only. New homeowner additions are saved as Not assigned. Homeowner edits preserve the existing buyer.

# Selections photo, view and autofill update

- Fixed tall product photos overflowing over text. Photos are contained in a dedicated area.
- Removed empty photo blocks and recognized placeholder image URLs. Broken card images disappear cleanly.
- Added remembered Card view / List view on homeowner and contractor pages.
- Improved product-name extraction and replacement when links change.
- Added structured product/offer price extraction with metadata fallback for contractors. Ambiguous ranges, non-USD amounts and savings text are not used as prices.
- Homeowner links now autofill product details and photos; pricing remains read-only and unchanged.
- Late lookup responses cannot replace a newer link or overwrite fields typed during the lookup.
- Existing selections, QR persistence, sync, P.O.s, Job Costing, roles and auth preserved.

Validation: tall-image bounds, responsive list layout, changed-link autofill, contractor price fill, homeowner price protection and existing app regression checks passed. Retailer lookup availability varies; blocked or unavailable prices need staff entry.

---

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
