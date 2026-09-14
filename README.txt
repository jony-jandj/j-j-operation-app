J&J Operations — Selection Groups UI v64

UPLOAD / REPLACE THESE TWO FILES IN GITHUB:
1. selections-metadata.js
2. service-worker.js

Changes:
- Removed "+ Another option" from every individual selection card.
- Added "+ Add Another Option" to the Selection Group header, beside the
  option count / "tap to compare" area.
- Added Expand All and Collapse All buttons for Selection Groups.
- Edit Selection now shows a real Selection Group dropdown.
- Dropdown includes No group / Standalone plus all groups created for that job.
- Named groups keep their header even when only one selection is currently in
  the group, so Add Another Option always has a consistent location.
- Existing Add to Group / Change Group button stays on each card.
- Existing Create Group / Manage Groups workflow stays intact.
- Homeowner portal continues using the same optionGroupId / optionGroupTitle
  data, so group changes remain shared.

Preserved:
- photos
- Selected toggle / unselect
- homeowner sync
- persistent project QR behavior
- product metadata lookup
- current cloud/auth/app features

After committing:
1. Wait about 1 minute.
2. Fully close the J&J app/browser tab.
3. Reopen it and go to Selections.
