J&J Selections — H.O. / QR / Controls Fix

Upload and replace all three files in the GitHub repository root:
1. index.html
2. selections-metadata.js
3. service-worker.js

The metadata script was previously uploaded without being loaded by index.html,
which is why the last updates had no visible effect.

This update adds the H.O. Selections / QR action, a read-only homeowner page,
one View All / Show Groups toggle, and ▦ / ☰ Card/List icons. It does not add
the later save-conflict recovery layer. It also restores Create Group, Manage
Groups, Selection group in the editor, and Add to Group / Change Group on cards.
The edit form keeps the room assignment internally without showing a Room
column, and link lookup checks SKU/model plus UPC/GTIN metadata automatically.

After committing, wait for GitHub Pages to finish, then fully close/reopen the
app. If the old cached screen remains, hard-refresh once.
