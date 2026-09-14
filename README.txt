J&J Operations — Homeowner Selection Groups v65

UPLOAD / REPLACE:
1. selections-metadata.js
2. service-worker.js

Homeowner side:
- Adds View All and Show Groups controls.
- View All expands every selection group.
- Show Groups collapses groups to a quick group-header view.
- Removes + Another option from each homeowner product card.
- Adds + Add Option directly in the homeowner group header.
- One-item named groups now still show a group header, so Add Option stays in
  the same predictable location.

Contractor Edit Selection:
- Group dropdown stays visible.
- Adds + Create Group directly inside Edit Selection.
- Adds Delete Group directly inside Edit Selection.
- Deleting a group keeps every selection; the products simply become standalone.
- Creating a group in Edit Selection immediately selects that new group.

Preserved:
- Create Group / Manage Groups controls
- Add to Group / Change Group on cards
- Expand All / Collapse All
- selected/unselected toggle
- photos
- homeowner sync
- persistent project QR
- cloud/auth and all other current app features

After uploading both files:
1. Commit to main.
2. Wait about one minute.
3. Fully close/reopen the J&J app and homeowner QR page once.
