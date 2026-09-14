# Homeowner QR setup

The staff app includes Homeowner QR Code and Refresh Homeowner Updates buttons. The homeowner page has no sign-in or price fields. The portal is not activated until the SQL setup succeeds.

1. In Supabase → SQL Editor, review and run `JJ_Homeowner_Portal_Setup.sql`. This creates private token/event tables, staff-only operations-data restrictions, and narrowly scoped homeowner functions. It does not create or invite customers.
2. Test with a disposable job first. Check that the QR opens only that job, adding a product and selecting a Pending item work, and prices/operations data are absent. These database rules have not been executed or integration-tested in this environment.
3. Open a job’s Selections → Homeowner QR Code → Generate / Replace Code. Copy the link field or print the QR. New codes invalidate older codes for that job; Deactivate Link turns access off.
4. Homeowner actions appear immediately in their page. Staff clicks Refresh Homeowner Updates when cloud status is Live or Saved to import those changes into shared operations data. Selected items receive a green border and “H.O. has selected.” This is not automatic background synchronization.

Anyone holding the QR/link can act as the homeowner for that job. Tokens are generated locally, stored as hashes in the database, and embedded in the URL fragment; the QR is generated locally without a third-party QR service. There is no verified homeowner identity. Do not put pricing or private staff information in product titles/descriptions intended for the homeowner page. The API omits price, estimate, P.O. and internal-note fields, but cannot remove prices typed into free text.

Customer additions are Pending and Purchased by Homeowner. Customers can only add products or move Pending to Selected; they cannot edit existing details, pricing, lead times, approval, or later statuses. Staff retains those controls. New customer products accept links and text details, not uploaded photos in this version.

Existing shared-state cloud saves can still have simultaneous-edit conflicts. Refresh only after your local changes finish saving. No customer link has been generated or distributed by this update.

## Staff photo update

Drop a supported image anywhere in the Edit Selection window, or paste an image copied to the clipboard. Choose Image remains available. JPG, PNG and WebP are recommended; unreadable formats show an error. Existing resize/compression behavior is preserved. Code-level drop/paste handler tests passed; real browser drag-and-drop testing remains outstanding.
