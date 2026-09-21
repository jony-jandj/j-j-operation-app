# Simplified split interface tests

78 named checks passed, plus the legacy undo/payment regression suite.

- Saved-record and split integration: 51.
- Full app, responsive layout, button placement and printing: 10.
- Hosted test project, two sessions, employee/Sub switching and homeowner sync: 12.
- Cache replacement and offline shell: 3.
- PDF pagination/margins: 2.

New checks confirm that the Split line button is inside the P.O., heading collapse/expand preserves unfinished edits, and Save & approve commits edited values and approval together.

Tests used local copies of backups and the separate hosted test project with synthetic records. Original backups and live records were not changed. Mobile coverage uses browser viewports; print checks use PDF output. The existing database migration is unchanged. This interface update is packaged but not deployed.
