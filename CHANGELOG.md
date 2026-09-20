# Description sync update — September 20, 2026

- Estimate description edits and clearing update all linked P.O.s in the project.
- Existing P.O. links are retained across description, title, and cost edits.
- Work & Pay details, completed-work summaries, and prints display the current linked description.
- Unique older broken links can reconnect; ambiguous matches remain untouched.
- Prior P.O. approval save fix retained; amounts, approval status, and payment history preserved.

Validated both estimate editors, repeated edits, clearing descriptions, room isolation, cost-edit continuity, legacy recovery, ambiguity protection, completed-work display, and JavaScript syntax. Not deployed or verified against the live database.

Upload index.html, work-pay.js, and service-worker.js. No new database migration is required for description syncing.
