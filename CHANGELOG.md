# Summary back button — September 22, 2026

- Added a top-left Back to P.O. Splits button to Subs & Materials Summary and In-house Summary (also available in Work & Pay). Returns to the originating project, even if summary filters change.
- Unsplit draft P.O.s allow dollar editing for each in-house employee and for subcontractor payout. Dollars and percentages update each other.
- Percentages display two decimals; dollar-derived percentages retain precision internally to preserve exact cents.
- In-house employee percentages refer to the 60% in-house budget; sub percentages refer to builder cost. Existing approval locks and payout limits remain.
- Estimate title changes update matching parent P.O. titles in P.O. Splits while preserving record IDs, links, costs and approvals. Custom split-line task names remain intact.
- Internal notes are editable in both estimate screens, including imported notes. They remain estimate-only and are not copied to P.O.s or work/payment records.
- Fixed stale unsaved sibling budgets causing a false approval-budget error when changing the draft line between employees and a subcontractor.
- Refreshes draft sibling amounts after saving payout changes; approved sibling amounts remain protected.
- Each split explicitly labels its Sub choice as applying to this line only.
- Mouse/trackpad wheel cannot change focused number fields. Manual entry, keyboard arrows and number spinners still work.
- Split percentages display two decimal places. Employee percentage edits balance to 100% in hundredths; exact dollar-derived shares are retained internally to preserve cents.
- Restored full-width stacked split cards on all screens, with tighter vertical spacing.
- Removed draft Edit buttons; hover outlines and direct click/tap editing work for title, description, percentages, amounts, employee/sub selectors and the Sub checkbox.
- Replaced the blue total-payout box with small gray text under Share of payout.
- Add employee remains visible on draft employee lines and opens editing with an evenly balanced new assignment.
- Title label and title appear side by side at the top, followed by a full-width description limited to three visible rows with independent scrolling.
- Editable fields have persistent outlines plus stronger hover/focus outlines.
- Slim gray employee headings contrast with alternating employee rows; excess vertical spacing is reduced.
- Reduced spacing, clearer amount fields, and approved-card tables that fit their cards.
- Retains direct field editing, scrolling descriptions, approval colors, save/cancel, employee/sub assignments, payment history protections and existing cloud sync.

No new database SQL required. Upload the full package.
