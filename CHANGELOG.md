# Mixed teams fix — September 22, 2026

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
