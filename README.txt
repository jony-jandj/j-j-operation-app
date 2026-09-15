J&J Operations — Selections Controls + H.O. Stability v81

REPLACE IN GITHUB:
1. selections-metadata.js
2. service-worker.js

SELECTION MULTI-SELECT
- Makes the checkbox on every selection card clearly visible.
- Works in Card View and List View.
- Checkbox says Select / Selected for bulk edit.
- Use the existing Bulk Actions bar to change multiple selections at once:
  • Status
  • Group
  • Lead Time
  • Delete
- Delete still requires the separate Confirm Delete button.

EDIT SELECTION — IN STOCK
- Guarantees a visible Availability section directly under Lead Time.
- Button:
  • Mark In Stock
  • In Stock ✓
- Uses the existing selectionEditInStock field expected by saveSelectionEditor.
- If an older build failed to render the field, v81 creates it.

HOMEOWNER PAGE STABILITY
- Keeps exactly one View All / Show Groups toolbar.
- Removes stale duplicate controls from older versions.
- Stops the older repeating group-controls timer/observer when the H.O. page is open.
- Individual groups remain independently expandable/collapsible.
- Does not touch selection data or homeowner sync.

SIDEBAR
- Raises contrast for the currently selected job so its job name/details are readable on the selected background.

PRESERVED
- v80 cumulative update
- v79 smart PDF import with photos/links/SKU/price/etc.
- v78 bulk editing
- Recommended status
- safe homeowner sync/recovery protection
- app Expand/Collapse
- larger selection text
- QR, photos, P.O., job costing, auth/cloud, etc.
