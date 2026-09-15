J&J Operations — Selections v82

CURRENT SELECTIONS RUNTIME
- v82 is the active selections build.
- Older stacked v63-v81 selection patches were removed from the main runtime.
- selections-metadata.js now keeps the shared retailer helper and loads the clean v82 runtime from /selections-v82/.
- service-worker.js uses the v82 cache and removes older jj-operations caches on activation.

CURRENT FEATURES
- Visible checkbox on every selection card in Card and List views.
- Bulk Status / Group / Lead Time / Delete.
- Delete requires Confirm Delete.
- Recommended status.
- Persistent In Stock control under Lead Time in Edit Selection.
- Create / Manage / Rename / Delete selection groups.
- + Add Option from group header.
- Editing a selection preserves group and PDF-import metadata.
- Smart PDF import with review-first workflow and duplicate protection.
- PDF importer can capture product photos, links, Model/SKU/UPC/Internet/Item identifiers, prices, budgets, vendor and descriptions from supported J&J selection-sheet layouts.
- Safe homeowner-sync merge protection remains active.
- H.O. page has one View All / Show Groups control and independent group toggles.
- Selected job sidebar contrast is corrected.

IMPORTANT
- index.html was not replaced during this cleanup.
- Existing project/selection records are not deleted by the v82 install.
- Do not upload older v76-v81 selection packages over v82.
