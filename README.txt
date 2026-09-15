J&J Operations — Selections PDF Import v76

REPLACE IN GITHUB:
1. selections-metadata.js
2. service-worker.js

NEW: Upload File
- Adds an "Upload File" button to the app Selections page.
- Accepts one or multiple PDF selection sheets.
- Reads PDFs locally in the browser using PDF.js.
- Tuned for past J&J selection-sheet layouts:
  category/product labels, product name, Vendor, SKU/UPC/Internet/Model,
  descriptions, room headings, status hints, option headings, and VIEW PRODUCT links.
- Opens a Review Selections window BEFORE anything is added.
- You can uncheck products and edit Product name, Room, Category, Status,
  Option group, Purchased by, Vendor, and Model/SKU/UPC.
- Possible duplicates are automatically unchecked.
- Import Selected APPENDS records only. It never replaces/deletes existing selections.
- The raw PDF is NOT stored inside shared app_state. The project keeps only a
  small import-history record with filename/date/count.

OPTION GROUPS
- Normal final selections are imported as standalone products.
- PDFs that clearly contain comparison/option sections can create Option Groups.
- This avoids making unrelated products mutually exclusive.

GROUP HEADER LOOK
- Group-name bars are more visible on both the app and H.O. page.
- Stronger navy text, gold left accent, light warm background, cleaner border/shadow.

PRESERVED
- v74 selection recovery / safe homeowner sync protection.
- v75 app Expand All / Collapse All.
- H.O. View All / Show Groups and independent group toggles.
- Current QR, photos, status, pricing, cloud/auth, P.O., job costing, and other app features.

NOTE
Searchable/text PDFs work best. Image-only scanned PDFs cannot be reliably read
without OCR, so the importer shows a message instead of creating bad selections.
