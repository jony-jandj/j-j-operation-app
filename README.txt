J&J Operations — Selections Groups v68

UPLOAD / REPLACE:
1. selections-metadata.js
2. service-worker.js

APP SELECTIONS
- Adds TWO visible buttons:
  • View All
  • Show Groups
- View All opens every selection group.
- Show Groups collapses every selection group.
- Individual group headers can still be opened/closed separately.

HOMEOWNER SELECTIONS FIX
- Fixed the issue where closing one group could make all groups close.
- Each homeowner group now remembers its own open/closed state.
- If View All is used, all groups open.
- After that, closing ONE group closes only that group.
- The other groups stay open.
- Group state is restored if the homeowner selection cards re-render/refresh.

PRESERVED
- app-like homeowner card view
- Card/List symbols
- Add Option in group headers
- Create/Delete Group in Edit Selection
- group dropdown
- photos
- Selected toggle
- homeowner sync
- persistent QR
- current cloud/auth features

After uploading:
1. Commit both files.
2. Wait about one minute.
3. Fully close/reopen the app and homeowner QR page.
