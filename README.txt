J&J Selection Photo Repair — November 15, 2026

INSTALL
1. Extract JJ_Selection_Photo_Repair.zip.
2. Upload its files to the root of jony-jandj/j-j-operation-app and commit.
3. Reopen/refresh the office app on each device after GitHub finishes publishing.
4. In the app's three-dot menu, choose Restore selection photos.
5. Choose JJ_Photos_Recovery_PRIVATE.json, then confirm the matching photo count.
6. Wait for the top cloud status to say Saved before closing. Refresh a homeowner link to check the shared photos.

The recovery JSON is PRIVATE APP DATA. Keep it on your computer. Do not upload
it to GitHub. Use Restore selection photos, NOT Import Backup.

The recovery file contains 143 missing photos matched by job ID, selection ID
and product identity against the November 15 backup. It only fills empty photo
fields; it does not replace jobs, prices, choices, groups, current pictures or P.O.s.
The count may be smaller if someone has already added a missing photo.

WHAT CHANGED
- Full snapshots are stored in IndexedDB, which supports larger backups.
- The old fallback that removed embedded photos has been removed.
- If neither storage path can save, the previous complete backup stays intact
  and a visible message tells you the save failed.
- An older cloud copy with an empty photo field cannot erase a matching photo
  already saved on the updated device. Explicit removals stay removed.
- Photo load failures no longer remove the office card's status/menu controls.
- Both card views retry a failed remote image without sending a referrer.
- The current design and current print repair are preserved.

VERIFICATION
- Chrome: 143 photos recovered into a copy of current data; every non-photo field unchanged.
- Chrome: all 155 existing + recovered photo records survive complete reload.
- Chrome: localStorage quota failure still saves the full snapshot to IndexedDB.
- Chrome: rapid saves preserve the newest snapshot.
- Chrome: failure of both storage methods reports failure and retains prior disk backup.
- Cloud startup/poll regression checks preserve photos while accepting updated prices/choices.
- All 143 recovered JPEG files fully decoded and all changed scripts passed syntax checks.

LIMITS
This package has not been deployed to the live app. The photo recovery has been
verified in an isolated copy, not applied to live jobs.
The current data also contains 53 blank selection entries without product links
and 11 linked products with no recoverable photo in the available backups.
Those need their correct product photo added; this repair does not guess images.
Device backups do not replace cloud confirmation or exported backups. Browser
data can still be cleared by the device/user, and retailer image links can expire.
No SQL update is required for this package.
