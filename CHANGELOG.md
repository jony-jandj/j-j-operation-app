# Finish-material selection filter

- Select All for Selections now uses the existing bulk-checkbox styling.
- Finish materials is selected by default: recognized finish products only, excluding labor and recognized rough supplies.
- All material lines is an explicit fallback; individual material rows can still be selected. Labor cannot be added through this workflow.
- Existing cards are skipped and unchecking Select All clears the selection.
- Restored a separate Finished selection checkbox column and Select all / Clear / Create selection cards controls in both estimate views. Existing cards show Added and are skipped.
- Creates Pending starter cards with room, title, description, quantity and unit cost; internal notes remain estimate-only. P.O. selections, approvals and payment data are unchanged.
- Keeps stable links to created cards to prevent duplicates after title edits and reload.
- Retained Job Closeout in navigation and headings, plus Subs bills and In-house bills.
- Job Closeout shows approved unfinished work only, without the old completed-earnings table or date filter.
- Subs bills and their printouts include completed work only; reopened work stays out until completed again.
- Restored Mark Incomplete in both bill detail views, returning unpaid work to the correct job/team in Job Closeout. Recorded-payment protections remain.
- Preserved phone layout fixes, View all employee breakdowns and printing, Back to P.O. Splits, estimate title links/internal notes, dollar editing, and mixed-team split fixes.
- Advanced the app cache and added a release feature check to catch this regression.

Includes the merged Closeout/Bills fixes and all subsequent phone/View all changes.
