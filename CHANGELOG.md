# Work & Pay integration

- Added staff-only cloud payment ledger with revision checks, immutable completed earnings, overpayment protection, and retained void history.
- Added Payments navigation, completion workflow, pay-period selection, partial/batch payment records and history filters.
- Added Sub company directory, default 75% of builder cost and editable percentages; crew dropdowns and one-to-four-person splits.
- Added actual-job summaries, estimate descriptions in P.O. popups and employee/sub printouts.
- Preserved existing P.O. IDs, builder costs and splits on installation; defaults only affect new P.O.s. Estimate edits/imports no longer overwrite existing P.O. costs.
- Imported all original estimate columns and pricing; widened scrollable descriptions; hid the four unwanted group/option columns.
- Reused the current live index as baseline. No homeowner, selection, auth, or QR implementation files changed. Manager pay remains excluded.
- Database setup and live deployment remain required; install instructions included.

## Eligibility and layout correction
- Any non-material cost type can create P.O. splits, including Subcontractor, Sub, Bid and Other.
- All 01 - PRELIMINARY WORKS lines are excluded, including Select All and creation-time checks. Existing P.O.s are not removed.
- Fixed overlapping imported columns with explicit table/column widths and horizontal scrolling; descriptions retain 84px scrollable height.
