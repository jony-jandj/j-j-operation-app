J&J Operations — v72 Clean Selections Group Bug Fix + H.O. QR Repair

This is a clean replacement of the shared selections script, not another patch
layer on top of the older v63-v71 code.

REPLACE IN GITHUB:
1. selections-metadata.js
2. service-worker.js

H.O. BUG FIXES
- View All / Show Groups button is recreated reliably after async portal loads.
- Button directly opens/closes the actual <details> groups.
- Selection groups are re-detected after homeowner data refreshes.
- One-selection named groups are wrapped into a visible group header.
- Every group stores its own open/closed state.
- Closing one group cannot close the other groups.
- + Add Option stays in each group header.
- Card/List symbols remain.
- H.O. cards keep the app-style responsive layout.
- H.O. Selections / QR opens a read-only homeowner page and QR link.
- App and homeowner group controls are one toggle: View All / Show Groups.
- Card/List controls are the ▦ and ☰ icons.

APP SIDE
- Expand All / Collapse All remain beside Card/List.
- Every individual group uses native independent expand/collapse.
- Create Group / Manage Groups stay available.
- Edit Selection group dropdown is preserved.
- Create/Delete group controls remain in Edit Selection.
- Add to Group / Change Group remains on cards.

TEST H.O.
1. Scan/open QR.
2. Confirm View All appears under Card/List.
3. Tap View All.
4. Close ONE group — all others must remain open.
5. Close another — only that group closes.
6. Tap Show Groups to collapse all.

After commit, wait about one minute and fully close/reopen both pages once.
