J&J Operations — Selections UI v66

UPLOAD / REPLACE:
1. selections-metadata.js
2. service-worker.js

Changes on BOTH contractor app and homeowner side:

GROUP VIEW
- View All / Show Groups is now ONE toggle button.
- When groups are open it says "Show Groups".
- When groups are collapsed it says "View All".
- Contractor app now has the same group-view toggle as the homeowner side.

CARD / LIST VIEW
- Card View text replaced with symbol: ▦
- List View text replaced with symbol: ☰
- Tooltips / accessibility labels still say Card view and List view.

Preserved from v65:
- + Add Option in group headers
- no per-card Another Option button
- create/delete groups from Edit Selection
- group dropdown in Edit Selection
- homeowner group controls
- photos
- Selected toggle
- homeowner sync
- persistent QR
- all current app/cloud/auth features

After uploading:
1. Commit both files to main.
2. Wait about one minute.
3. Fully close/reopen the app and homeowner QR page.
