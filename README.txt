J&J Operations — Selection Groups Update

UPLOAD / REPLACE THESE TWO FILES IN GITHUB:
1. selections-metadata.js
2. service-worker.js

This update uses the current app's existing Selections workspace. index.html does NOT
need to be replaced.

What changes:
- Replaces the old direct "Link group" dropdown with:
  • Create Group
  • Add to Group / Change Group on each selection
  • Manage Groups
- Groups can be named anything (Primary Bathroom, First Floor Bathroom,
  Shower Fixtures, Vanity Package, etc.).
- Rename a group.
- View all selections inside a group.
- Remove a selection from a group without deleting it.
- Delete a group without deleting its selections.
- Group name is shown clearly on selection cards.
- Existing linked selections are migrated into named groups automatically.
- Uses the existing optionGroupId / optionGroupTitle fields, so the homeowner
  selection portal sees the same grouping automatically.
- Keeps the current Selected toggle behavior.
- Keeps the current persistent project QR behavior.
- Keeps product photo/link metadata lookup.

Cache version bumped to:
jj-operations-v63-selection-groups-ui

After committing both files:
- wait about 1 minute
- fully close/reopen the app once
- open Selections
