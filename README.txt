J&J Homeowner Guest Selections v74

ONE-TIME SUPABASE STEP
Run JJ_Homeowner_Guest_Access.sql in Supabase -> SQL Editor.
This creates a token-protected homeowner selections portal. Homeowners can
open their QR/link without a J&J login, and the link cannot read the rest of
the operations app.

GITHUB FILES
Upload and replace these three files in the repository root:
1. index.html
2. selections-metadata.js
3. service-worker.js

Do not upload the ZIP itself to GitHub. Open the ZIP and upload the individual
files above. The SQL file is run in Supabase only.

WHAT CHANGED
- Create / Show QR Code is beside Customer View on the Selections page.
- A shared QR or copied link opens without a login.
- Homeowners can view, select, and add products without entering or seeing a
  price.
- The H.O. add form includes product link lookup, name, room, category,
  vendor, model/SKU, UPC, quantity, group, description, and photo upload.
- H.O. changes sync back into the contractor Selections page.
- H.O. cards follow the clean one-column mobile layout from the supplied
  recording and retain the card/list controls on larger screens.
- The service-worker cache is bumped so stale screens are replaced.

After committing the three GitHub files, wait for GitHub Pages to finish and
hard-refresh the app once. Then open Selections and press Create / Show QR
Code to create the project's permanent guest link.
